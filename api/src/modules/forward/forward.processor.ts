import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Job } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { TransformRule } from '../../entities/transform-rule.entity.js';
import { WebhookGateway } from '../websocket/webhook.gateway.js';
import { AlertingService } from '../alerting/alerting.service.js';

export interface ForwardJobData {
  eventId: string;
  endpointId: string;
  userId: string;
  destinationId?: string;
}

interface TransformOperation {
  type: 'rename' | 'remove' | 'set' | 'copy';
  from?: string;
  to?: string;
  path?: string;
  value?: unknown;
}

@Processor('webhook-forward', { drainDelay: 5000, stalledInterval: 300_000, lockDuration: 60_000 })
export class ForwardProcessor extends WorkerHost {
  private readonly logger = new Logger(ForwardProcessor.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(ForwardDestination)
    private readonly destinationRepo: Repository<ForwardDestination>,
    @InjectRepository(ForwardResult)
    private readonly resultRepo: Repository<ForwardResult>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    @InjectRepository(TransformRule)
    private readonly transformRuleRepo: Repository<TransformRule>,
    private readonly httpService: HttpService,
    private readonly wsGateway: WebhookGateway,
    private readonly alertingService: AlertingService,
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

    const [destinations, transformRules] = await Promise.all([
      this.destinationRepo.find({
        where: { endpointId, isActive: true },
      }),
      this.transformRuleRepo.find({
        where: { endpointId, isActive: true },
        order: { priority: 'ASC' },
      }),
    ]);

    // No destinations and no legacy forwardUrl — skip
    if (destinations.length === 0 && !endpoint.forwardUrl) {
      await this.safeUpdateEvent(eventId, { forwardStatus: 'skipped' });
      this.safeBroadcast(userId, {
        eventId,
        forwardStatus: 'skipped',
        forwardCode: null,
        forwardLatency: null,
      });
      return;
    }

    const results: { status: string; code: number | null; latency: number }[] =
      [];

    // Forward to each destination
    for (const destination of destinations) {
      const transformed = this.applyTransforms(
        structuredClone(event.body),
        transformRules,
      );

      const start = Date.now();
      try {
        const stripeSignature = event.headers['stripe-signature'];
        const response = await this.httpService.axiosRef({
          method: 'POST',
          url: destination.url,
          headers: {
            'Content-Type': 'application/json',
            'X-Hookdash-Event-Id': event.id,
            'X-Hookdash-Original-Signature':
              event.headers['x-paystack-signature'] ??
              event.headers['verif-hash'] ??
              stripeSignature ??
              '',
            ...(stripeSignature && { 'stripe-signature': stripeSignature }),
          },
          // For Stripe: send raw body to preserve signature verification on the receiving end
          data: stripeSignature ? event.rawBody : transformed,
          ...(stripeSignature && { transformRequest: [(data: string) => data] }),
          timeout: 15_000,
        });

        const latency = Date.now() - start;
        const result = this.resultRepo.create({
          eventId,
          destinationId: destination.id,
          status: 'forwarded',
          responseCode: response.status,
          responseBody: JSON.stringify(response.data).slice(0, 5000),
          latency,
          forwardedAt: new Date(),
          attempt: (job.attemptsMade || 0) + 1,
        });
        await this.resultRepo.save(result);

        results.push({ status: 'forwarded', code: response.status, latency });

        this.logger.log(
          `Forwarded ${eventId} → ${destination.label || destination.url} (${response.status}, ${latency}ms)`,
        );
      } catch (err: unknown) {
        const latency = Date.now() - start;
        const error = err as {
          response?: { status?: number };
          message?: string;
        };
        const code = error.response?.status ?? 0;
        const body = (error.message ?? 'Unknown error').slice(0, 5000);

        const result = this.resultRepo.create({
          eventId,
          destinationId: destination.id,
          status: 'failed',
          responseCode: code,
          responseBody: body,
          latency,
          forwardedAt: new Date(),
          attempt: (job.attemptsMade || 0) + 1,
        });
        await this.resultRepo.save(result);

        results.push({ status: 'failed', code, latency });

        this.logger.warn(
          `Forward failed ${eventId} → ${destination.label || destination.url} (${code}, ${latency}ms)`,
        );

        // If retries are configured, throw to let BullMQ retry
        if (
          endpoint.retryMaxAttempts > 0 &&
          job.attemptsMade < (job.opts?.attempts ?? 1) - 1
        ) {
          throw err;
        }
      }
    }

    // Legacy forwardUrl support (if no destinations but forwardUrl is set)
    if (destinations.length === 0 && endpoint.forwardUrl) {
      const transformed = this.applyTransforms(
        structuredClone(event.body),
        transformRules,
      );

      const start = Date.now();
      try {
        const stripeSignature = event.headers['stripe-signature'];
        const response = await this.httpService.axiosRef({
          method: 'POST',
          url: endpoint.forwardUrl,
          headers: {
            'Content-Type': 'application/json',
            'X-Hookdash-Event-Id': event.id,
            'X-Hookdash-Original-Signature':
              event.headers['x-paystack-signature'] ??
              event.headers['verif-hash'] ??
              stripeSignature ??
              '',
            ...(stripeSignature && { 'stripe-signature': stripeSignature }),
          },
          data: stripeSignature ? event.rawBody : transformed,
          ...(stripeSignature && { transformRequest: [(data: string) => data] }),
          timeout: 15_000,
        });

        const latency = Date.now() - start;
        await this.safeUpdateEvent(eventId, {
          forwardStatus: 'forwarded',
          forwardCode: response.status,
          forwardBody: JSON.stringify(response.data).slice(0, 5000),
          forwardLatency: latency,
          forwardedAt: new Date(),
        });

        results.push({
          status: 'forwarded',
          code: response.status,
          latency,
        });

        this.logger.log(
          `Forwarded ${eventId} → ${endpoint.forwardUrl} (${response.status}, ${latency}ms)`,
        );
      } catch (err: unknown) {
        const latency = Date.now() - start;
        const error = err as {
          response?: { status?: number };
          message?: string;
        };
        const code = error.response?.status ?? 0;
        const body = (error.message ?? 'Unknown error').slice(0, 5000);

        await this.safeUpdateEvent(eventId, {
          forwardStatus: 'failed',
          forwardCode: code,
          forwardBody: body,
          forwardLatency: latency,
          forwardedAt: new Date(),
        });

        results.push({ status: 'failed', code, latency });

        this.logger.warn(
          `Forward failed ${eventId} → ${endpoint.forwardUrl} (${code}, ${latency}ms)`,
        );

        if (
          endpoint.retryMaxAttempts > 0 &&
          job.attemptsMade < (job.opts?.attempts ?? 1) - 1
        ) {
          throw err;
        }

        // Trigger alert evaluation on legacy forward failure (fire-and-forget)
        this.alertingService
          .evaluateForwardFailure(event.workspaceId, event.id)
          .catch((evalErr: unknown) => {
            this.logger.error(
              `Alert evaluation failed for forward failure on event ${event.id}: ${(evalErr as Error).message}`,
            );
          });
      }
    }

    // Update aggregate forward status for destination-based forwarding
    if (destinations.length > 0) {
      const allForwarded = results.every((r) => r.status === 'forwarded');
      const anyFailed = results.some((r) => r.status === 'failed');
      const aggregateStatus = allForwarded
        ? 'forwarded'
        : anyFailed
          ? 'failed'
          : 'skipped';

      const bestLatency =
        results.length > 0 ? Math.max(...results.map((r) => r.latency)) : null;
      const bestCode =
        results.find((r) => r.status === 'forwarded')?.code ??
        results[0]?.code ??
        null;

      await this.safeUpdateEvent(eventId, {
        forwardStatus: aggregateStatus,
        forwardCode: bestCode,
        forwardLatency: bestLatency,
        forwardedAt: new Date(),
      });

      // Trigger alert evaluation on forward failure (fire-and-forget)
      if (aggregateStatus === 'failed') {
        this.alertingService
          .evaluateForwardFailure(event.workspaceId, event.id)
          .catch((err: unknown) => {
            this.logger.error(
              `Alert evaluation failed for forward failure on event ${event.id}: ${(err as Error).message}`,
            );
          });
      }
    }

    // Broadcast aggregate result
    const finalStatus = results.every((r) => r.status === 'forwarded')
      ? 'forwarded'
      : results.some((r) => r.status === 'failed')
        ? 'failed'
        : 'skipped';

    this.safeBroadcast(userId, {
      eventId,
      forwardStatus: finalStatus,
      forwardCode: results.find((r) => r.code !== null)?.code ?? null,
      forwardLatency:
        results.length > 0 ? Math.max(...results.map((r) => r.latency)) : null,
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ForwardJobData>, error: Error): Promise<void> {
    // Only create dead letter when all retries are exhausted
    if (job.attemptsMade < (job.opts?.attempts ?? 1)) {
      return;
    }

    const { eventId, endpointId, destinationId } = job.data;

    this.logger.error(
      `Job exhausted all retries for event ${eventId}: ${error.message}`,
    );

    try {
      const deadLetter = this.deadLetterRepo.create({
        eventId,
        endpointId,
        destinationId: destinationId ?? null,
        lastAttempt: job.attemptsMade,
        lastError: error.message.slice(0, 5000),
        exhaustedAt: new Date(),
      });
      await this.deadLetterRepo.save(deadLetter);
    } catch (err) {
      this.logger.error(
        `Failed to create dead letter for event ${eventId}: ${(err as Error).message}`,
      );
    }
  }

  private applyTransforms(
    body: Record<string, unknown> | null,
    rules: TransformRule[],
  ): Record<string, unknown> | null {
    if (!body || rules.length === 0) return body;

    const result = body;
    for (const rule of rules) {
      for (const op of rule.operations as TransformOperation[]) {
        switch (op.type) {
          case 'rename':
            if (op.from && op.to) {
              const value = this.getByPath(result, op.from);
              if (value !== undefined) {
                this.deleteByPath(result, op.from);
                this.setByPath(result, op.to, value);
              }
            }
            break;
          case 'remove':
            if (op.path) {
              this.deleteByPath(result, op.path);
            }
            break;
          case 'set':
            if (op.path) {
              this.setByPath(result, op.path, op.value);
            }
            break;
          case 'copy':
            if (op.from && op.to) {
              const value = this.getByPath(result, op.from);
              if (value !== undefined) {
                this.setByPath(result, op.to, value);
              }
            }
            break;
        }
      }
    }

    return result;
  }

  private getByPath(obj: Record<string, unknown>, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  }

  private setByPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const keys = path.split('.');
    const last = keys.pop()!;
    const target = keys.reduce<Record<string, unknown>>((o, k) => {
      if (!(k in o)) o[k] = {};
      return o[k] as Record<string, unknown>;
    }, obj);
    target[last] = value;
  }

  private deleteByPath(obj: Record<string, unknown>, path: string): void {
    const keys = path.split('.');
    const last = keys.pop()!;
    const target = keys.reduce<unknown>(
      (o, k) => (o as Record<string, unknown>)?.[k],
      obj,
    );
    if (target && typeof target === 'object')
      delete (target as Record<string, unknown>)[last];
  }

  private async safeUpdateEvent(
    eventId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventRepo.update(eventId, data);
    } catch (err) {
      this.logger.error(
        `DB update failed for event ${eventId}: ${(err as Error).message}`,
      );
    }
  }

  private safeBroadcast(
    userId: string,
    payload: {
      eventId: string;
      forwardStatus: string;
      forwardCode: number | null;
      forwardLatency: number | null;
    },
  ): void {
    try {
      this.wsGateway.broadcastForwardResult(userId, payload);
    } catch (err) {
      this.logger.warn(
        `WebSocket broadcast failed for event ${payload.eventId}: ${(err as Error).message}`,
      );
    }
  }
}
