import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User } from '../../entities/user.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { SignatureService } from '../signature/signature.service.js';
import { WebhookGateway } from '../websocket/webhook.gateway.js';
import { ForwardJobData } from '../forward/forward.processor.js';

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
    private readonly signatureService: SignatureService,
    private readonly wsGateway: WebhookGateway,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
  ) {}

  async resolveEndpoint(
    slug: string,
  ): Promise<{ endpoint: Endpoint; userId: string } | null> {
    const user = await this.userRepo.findOne({ where: { ingressSlug: slug } });
    if (!user) return null;

    const endpoints = await this.endpointRepo
      .createQueryBuilder('ep')
      .addSelect('ep.webhookSecret')
      .where('ep.userId = :userId', { userId: user.id })
      .andWhere('ep.isActive = :isActive', { isActive: true })
      .getMany();

    if (endpoints.length === 0) return null;

    // For now, use the first active endpoint.
    // Future: route based on path or header matching.
    return { endpoint: endpoints[0], userId: user.id };
  }

  async capture(params: CaptureParams): Promise<WebhookEvent> {
    const event = this.eventRepo.create({
      endpointId: params.endpointId,
      userId: params.userId,
      method: params.method,
      path: params.path,
      headers: params.headers,
      body: params.body,
      rawBody: params.rawBody,
      sourceIp: params.sourceIp,
      receivedAt: new Date(),
    });

    return this.eventRepo.save(event);
  }

  async processEvent(event: WebhookEvent, endpoint: Endpoint): Promise<void> {
    // Parse event type from body
    const eventType = this.extractEventType(endpoint.provider, event.body);
    const updates: Record<string, unknown> = {
      provider: endpoint.provider,
      eventType,
    };

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

    // Queue forward
    try {
      await this.forwardQueue.add('forward', {
        eventId: event.id,
        endpointId: endpoint.id,
        userId: event.userId,
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
}
