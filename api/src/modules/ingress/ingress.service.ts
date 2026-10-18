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
import {
  ForwardJobData,
  FAN_OUT_JOB_OPTIONS,
} from '../forward/forward.processor.js';
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
    opts: { endpointId?: string; headers: Record<string, string> },
  ): Promise<{ endpoint: Endpoint; userId: string } | null> {
    const query = this.endpointRepo
      .createQueryBuilder('ep')
      .addSelect('ep.webhookSecret')
      .leftJoinAndSelect('ep.destinations', 'dest', 'dest.isActive = :active', {
        active: true,
      })
      .where('ep.isActive = :isActive', { isActive: true })
      .orderBy('ep.createdAt', 'DESC');

    if (slug.startsWith('src_')) {
      query.andWhere('ep.ingressSlug = :slug', { slug });
    } else if (slug.startsWith('usr_')) {
      const user = await this.userRepo.findOne({
        where: { ingressSlug: slug },
      });
      if (!user) return null;
      query.andWhere('ep.userId = :userId', { userId: user.id });
    } else {
      const workspace = await this.workspaceRepo.findOne({ where: { slug } });
      if (!workspace) return null;
      query.andWhere('ep.workspaceId = :workspaceId', {
        workspaceId: workspace.id,
      });
    }

    if (opts.endpointId) {
      query.andWhere('ep.id = :endpointId', { endpointId: opts.endpointId });
    }

    const endpoints = await query.getMany();
    if (endpoints.length === 0) return null;

    // On the shared URL, send each provider's webhooks to that provider's endpoint
    const providers = this.signatureService.detectProviders(opts.headers);
    const candidates =
      endpoints.filter((ep) => providers.includes(ep.provider)).length > 0
        ? endpoints.filter((ep) => providers.includes(ep.provider))
        : endpoints;
    const endpoint =
      candidates.find((ep) => ep.destinations?.length > 0) ?? candidates[0];
    return { endpoint, userId: endpoint.userId };
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

  async processEvent(
    event: WebhookEvent,
    endpoint: Endpoint,
    opts: { skipForward?: boolean; urls?: string[] } = {},
  ): Promise<void> {
    const { eventType, deliveryId } = this.signatureService.identify(
      endpoint.provider,
      event.headers,
      event.body,
      event.rawBody ?? '',
    );
    const updates: Record<string, unknown> = {
      provider: endpoint.provider,
      eventType,
      processedAt: new Date(),
    };

    if (deliveryId) {
      updates.idempotencyKey = deliveryId;
    }

    if (endpoint.webhookSecret) {
      const { valid } = this.signatureService.verifyRequest(
        endpoint.provider,
        {
          headers: event.headers,
          rawBody: event.rawBody ?? '',
          urls: opts.urls,
        },
        endpoint.webhookSecret,
      );
      if (valid !== null) {
        updates.signatureValid = valid;
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
    const blocked =
      endpoint.blockInvalidSignatures && updates.signatureValid === false;
    if (blocked) {
      await this.eventRepo.update(event.id, { forwardStatus: 'blocked' });
      this.logger.warn(
        `Event ${event.id} blocked — invalid signature (enforcement enabled)`,
      );
    }

    // Broadcast to WebSocket — non-critical, don't let it block
    try {
      this.wsGateway.broadcastWebhook(event.userId, {
        id: event.id,
        provider: endpoint.provider,
        eventType,
        signatureValid: (updates.signatureValid as boolean) ?? null,
        receivedAt: event.receivedAt,
        forwardStatus: blocked ? 'blocked' : event.forwardStatus,
        method: event.method,
        path: event.path,
        bodyPreview: JSON.stringify(event.body).slice(0, 200),
      });
    } catch (err) {
      this.logger.warn(
        `WebSocket broadcast failed for event ${event.id}: ${(err as Error).message}`,
      );
    }

    if (blocked) return;

    if (opts.skipForward) {
      await this.eventRepo.update(event.id, { forwardStatus: 'skipped' });
      this.logger.warn(
        `Event ${event.id} came from Hookdash itself; not forwarding to avoid a loop`,
      );
      return;
    }

    // Fan-out job; each destination's delivery job carries the endpoint's retry policy
    try {
      const jobData: ForwardJobData = {
        eventId: event.id,
        endpointId: endpoint.id,
        userId: event.userId,
      };
      await this.forwardQueue.add('forward', jobData, FAN_OUT_JOB_OPTIONS);
    } catch (err) {
      this.logger.error(
        `Failed to queue forward for event ${event.id}: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `Captured webhook ${event.id} (${endpoint.provider}:${eventType})`,
    );
  }
}
