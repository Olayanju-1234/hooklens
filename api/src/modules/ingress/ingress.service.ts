import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from '../../entities/user.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { SignatureService } from '../signature/signature.service.js';
import { WebhookGateway } from '../websocket/webhook.gateway.js';
import { ForwardJobData } from '../forward/forward.processor.js';
import { AlertingService } from '../alerting/alerting.service.js';

interface CaptureParams {
  endpointId: string;
  userId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  rawBody: string;
  body: Record<string, unknown> | null;
  sourceIp: string | null;
}

@Injectable()
export class IngressService {
  private readonly logger = new Logger(IngressService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly signatureService: SignatureService,
    private readonly wsGateway: WebhookGateway,
    private readonly alertingService: AlertingService,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
  ) {}

  async resolveEndpoint(
    slug: string,
  ): Promise<{ endpoint: Endpoint; userId: string } | null> {
    // Try resolving by user ingressSlug first
    const user = await this.userRepo.findOne({ where: { ingressSlug: slug } });
    if (user) {
      const endpoints = await this.endpointRepo
        .createQueryBuilder('ep')
        .addSelect('ep.webhookSecret')
        .where('ep.userId = :userId', { userId: user.id })
        .andWhere('ep.isActive = :isActive', { isActive: true })
        .getMany();

      if (endpoints.length > 0) {
        return { endpoint: endpoints[0], userId: user.id };
      }
    }

    // Fall back to resolving by workspace slug
    const workspace = await this.workspaceRepo.findOne({
      where: { slug },
    });
    if (workspace) {
      const endpoints = await this.endpointRepo
        .createQueryBuilder('ep')
        .addSelect('ep.webhookSecret')
        .where('ep.workspaceId = :workspaceId', {
          workspaceId: workspace.id,
        })
        .andWhere('ep.isActive = :isActive', { isActive: true })
        .getMany();

      if (endpoints.length > 0) {
        return { endpoint: endpoints[0], userId: endpoints[0].userId };
      }
    }

    return null;
  }

  async capture(params: CaptureParams): Promise<WebhookEvent> {
    const bodyHash = crypto
      .createHash('sha256')
      .update(params.rawBody)
      .digest('hex');

    // Resolve workspaceId from the endpoint
    const endpoint = await this.endpointRepo.findOne({
      where: { id: params.endpointId },
    });

    const event = this.eventRepo.create({
      endpointId: params.endpointId,
      userId: params.userId,
      workspaceId: endpoint?.workspaceId ?? params.endpointId,
      method: params.method,
      path: params.path,
      headers: params.headers,
      body: params.body,
      rawBody: params.rawBody,
      sourceIp: params.sourceIp,
      bodyHash,
      receivedAt: new Date(),
    });

    const saved = await this.eventRepo.save(event);

    // Idempotency detection — check for existing event with same bodyHash on same endpoint
    try {
      const duplicate = await this.eventRepo.findOne({
        where: {
          endpointId: params.endpointId,
          bodyHash,
        },
        order: { receivedAt: 'ASC' },
      });

      if (duplicate && duplicate.id !== saved.id) {
        await this.eventRepo.update(saved.id, {
          isDuplicate: true,
          duplicateOfId: duplicate.id,
        });
        saved.isDuplicate = true;
        saved.duplicateOfId = duplicate.id;
      }
    } catch (err) {
      this.logger.error(
        `Duplicate detection failed for event ${saved.id}: ${(err as Error).message}`,
      );
    }

    return saved;
  }

  async processEvent(event: WebhookEvent, endpoint: Endpoint): Promise<void> {
    // Parse event type from body
    const eventType = this.extractEventType(endpoint.provider, event.body);
    const idempotencyKey = this.extractIdempotencyKey(
      endpoint.provider,
      event.body,
    );
    const updates: Record<string, unknown> = {
      provider: endpoint.provider,
      eventType,
    };

    if (idempotencyKey) {
      updates.idempotencyKey = idempotencyKey;
    }

    // Verify signature if secret is configured
    if (endpoint.webhookSecret) {
      const signature = this.signatureService.extractSignature(
        endpoint.provider,
        event.headers,
      );
      if (signature && event.rawBody) {
        updates.signatureValid = this.signatureService.verify(
          endpoint.provider,
          event.rawBody,
          signature,
          endpoint.webhookSecret,
        );
      } else {
        updates.signatureValid = false;
      }
    }

    try {
      await this.eventRepo.update(event.id, updates);
    } catch (err) {
      this.logger.error(
        `Failed to update event ${event.id}: ${(err as Error).message}`,
      );
    }

    // Trigger alert evaluation on signature failure (fire-and-forget)
    if (updates.signatureValid === false) {
      this.alertingService
        .evaluateSignatureFailure(event.workspaceId, event.id)
        .catch((err: unknown) => {
          this.logger.error(
            `Alert evaluation failed for signature failure on event ${event.id}: ${(err as Error).message}`,
          );
        });
    }

    // Block forwarding if signature is invalid and enforcement is on
    if (endpoint.blockInvalidSignatures && updates.signatureValid === false) {
      await this.eventRepo.update(event.id, { forwardStatus: 'blocked' });
      this.logger.warn(
        `Event ${event.id} blocked — invalid signature (enforcement enabled)`,
      );
      return;
    }

    // Broadcast to WebSocket — non-critical, don't let it block
    try {
      this.wsGateway.broadcastWebhook(event.userId, {
        id: event.id,
        provider: endpoint.provider,
        eventType,
        signatureValid: (updates.signatureValid as boolean) ?? null,
        receivedAt: event.receivedAt,
        forwardStatus: event.forwardStatus,
        method: event.method,
        path: event.path,
        bodyPreview: JSON.stringify(event.body).slice(0, 200),
      });
    } catch (err) {
      this.logger.warn(
        `WebSocket broadcast failed for event ${event.id}: ${(err as Error).message}`,
      );
    }

    // Queue forward with retry config from endpoint
    try {
      const jobData: ForwardJobData = {
        eventId: event.id,
        endpointId: endpoint.id,
        userId: event.userId,
      };

      const attempts =
        endpoint.retryMaxAttempts > 0 ? endpoint.retryMaxAttempts + 1 : 1;

      await this.forwardQueue.add('forward', jobData, {
        attempts,
        backoff:
          endpoint.retryMaxAttempts > 0
            ? { type: 'exponential', delay: endpoint.retryBackoffMs }
            : undefined,
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue forward for event ${event.id}: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `Captured webhook ${event.id} (${endpoint.provider}:${eventType})`,
    );
  }

  private extractEventType(
    provider: string,
    body: Record<string, unknown> | null,
  ): string | null {
    if (!body) return null;
    switch (provider) {
      case 'paystack':
        return (body.event as string) ?? null;
      case 'flutterwave':
        return (body.event as string) ?? (body['event.type'] as string) ?? null;
      case 'mono':
        return (body.event as string) ?? null;
      default:
        return (body.event as string) ?? (body.type as string) ?? null;
    }
  }

  private extractIdempotencyKey(
    provider: string,
    body: Record<string, unknown> | null,
  ): string | null {
    if (!body) return null;
    switch (provider) {
      case 'paystack': {
        const data = body.data as Record<string, unknown> | undefined;
        return (data?.id as string) ?? (data?.reference as string) ?? null;
      }
      case 'flutterwave': {
        const data = body.data as Record<string, unknown> | undefined;
        return (data?.id as string) ?? (data?.tx_ref as string) ?? null;
      }
      case 'mono':
        return (body.id as string) ?? null;
      default:
        return (body.id as string) ?? (body.idempotency_key as string) ?? null;
    }
  }
}
