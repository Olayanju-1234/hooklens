import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Job } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookGateway } from '../websocket/webhook.gateway.js';

export interface ForwardJobData {
  eventId: string;
  endpointId: string;
  userId: string;
}

@Processor('webhook-forward')
export class ForwardProcessor extends WorkerHost {
  private readonly logger = new Logger(ForwardProcessor.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    private readonly httpService: HttpService,
    private readonly wsGateway: WebhookGateway,
  ) {
    super();
  }

  async process(job: Job<ForwardJobData>): Promise<void> {
    const { eventId, endpointId, userId } = job.data;

    const [event, endpoint] = await Promise.all([
      this.eventRepo.findOne({ where: { id: eventId } }),
      this.endpointRepo.findOne({ where: { id: endpointId } }),
    ]);

    if (!event || !endpoint) {
      this.logger.warn(
        `Event ${eventId} or endpoint ${endpointId} not found, skipping`,
      );
      return;
    }

    if (!endpoint.forwardUrl) {
      await this.eventRepo.update(eventId, { forwardStatus: 'skipped' });
      this.wsGateway.broadcastForwardResult(userId, {
        eventId,
        forwardStatus: 'skipped',
        forwardCode: null,
        forwardLatency: null,
      });
      return;
    }

    const start = Date.now();
    try {
      const response = await this.httpService.axiosRef({
        method: 'POST',
        url: endpoint.forwardUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-HookLens-Event-Id': event.id,
          'X-HookLens-Original-Signature':
            event.headers['x-paystack-signature'] ??
            event.headers['verif-hash'] ??
            '',
        },
        data: event.body,
        timeout: 15_000,
      });

      const latency = Date.now() - start;
      await this.eventRepo.update(eventId, {
        forwardStatus: 'forwarded',
        forwardCode: response.status,
        forwardBody: JSON.stringify(response.data).slice(0, 5000),
        forwardLatency: latency,
        forwardedAt: new Date(),
      });

      this.wsGateway.broadcastForwardResult(userId, {
        eventId,
        forwardStatus: 'forwarded',
        forwardCode: response.status,
        forwardLatency: latency,
      });

      this.logger.log(
        `Forwarded ${eventId} → ${endpoint.forwardUrl} (${response.status}, ${latency}ms)`,
      );
    } catch (err: unknown) {
      const latency = Date.now() - start;
      const error = err as { response?: { status?: number }; message?: string };
      const code = error.response?.status ?? 0;
      const body = (error.message ?? 'Unknown error').slice(0, 5000);

      await this.eventRepo.update(eventId, {
        forwardStatus: 'failed',
        forwardCode: code,
        forwardBody: body,
        forwardLatency: latency,
        forwardedAt: new Date(),
      });

      this.wsGateway.broadcastForwardResult(userId, {
        eventId,
        forwardStatus: 'failed',
        forwardCode: code,
        forwardLatency: latency,
      });

      this.logger.warn(
        `Forward failed ${eventId} → ${endpoint.forwardUrl} (${code}, ${latency}ms)`,
      );
    }
  }
}
