import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { applyOperations } from '../transform/transform.service.js';
import type { TransformOperationDto } from '../transform/dto/transform.dto.js';
import { outboundRequestOptions } from '../../common/utils/outbound-url.js';
import {
  forwardableHeaders,
  hookdashSignatureHeaders,
} from './outbound-headers.js';

export interface ForwardJobData {
  eventId: string;
  endpointId: string;
  userId: string;
  destinationId?: string;
}

interface ForwardTarget {
  destinationId: string | null;
  url: string;
  label: string;
}

interface TargetResult {
  target: ForwardTarget;
  status: 'forwarded' | 'failed';
  code: number | null;
  latency: number;
  error?: string;
  body?: string;
}

@Processor('webhook-forward', {
  concurrency: 5,
  drainDelay: 5,
  lockDuration: 60_000,
})
export class ForwardProcessor extends WorkerHost {
  private readonly logger = new Logger(ForwardProcessor.name);
  private readonly allowPrivate: boolean;

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
    configService: ConfigService,
  ) {
    super();
    this.allowPrivate = configService.get<boolean>(
      'allowPrivateForwarding',
      false,
    );
  }

  async process(job: Job<ForwardJobData>): Promise<void> {
    const { eventId, endpointId, userId, destinationId } = job.data;

    const [event, endpoint] = await Promise.all([
      this.eventRepo.findOne({ where: { id: eventId } }),
      this.endpointRepo
        .createQueryBuilder('ep')
        .addSelect('ep.signingSecret')
        .where('ep.id = :endpointId', { endpointId })
        .getOne(),
    ]);

    if (!event || !endpoint) {
      this.logger.warn(
        `Event ${eventId} or endpoint ${endpointId} not found, skipping`,
      );
      return;
    }

    const [destinations, transformRules] = await Promise.all([
      this.destinationRepo.find({
        where: destinationId
          ? { id: destinationId, endpointId }
          : { endpointId, isActive: true },
      }),
      this.transformRuleRepo.find({
        where: { endpointId, isActive: true },
        order: { priority: 'ASC' },
      }),
    ]);

    const usesDestinations = destinations.length > 0;
    const targets: ForwardTarget[] = usesDestinations
      ? destinations.map((d) => ({
          destinationId: d.id,
          url: d.url,
          label: d.label || d.url,
        }))
      : endpoint.forwardUrl
        ? [
            {
              destinationId: null,
              url: endpoint.forwardUrl,
              label: endpoint.forwardUrl,
            },
          ]
        : [];

    if (targets.length === 0) {
      await this.safeUpdateEvent(eventId, { forwardStatus: 'skipped' });
      this.safeBroadcast(userId, {
        eventId,
        forwardStatus: 'skipped',
        forwardCode: null,
        forwardLatency: null,
      });
      return;
    }

    // Retries only go to targets that haven't accepted this event yet
    const delivered = usesDestinations
      ? new Set(
          (
            await this.resultRepo.find({
              where: {
                eventId,
                status: 'forwarded',
                destinationId: In(targets.map((t) => t.destinationId)),
              },
              select: { destinationId: true },
            })
          ).map((r) => r.destinationId),
        )
      : new Set<string | null>();

    const payload = this.buildPayload(event, transformRules);
    const attempt = job.attemptsMade + 1;
    const results: TargetResult[] = [];

    for (const target of targets) {
      if (delivered.has(target.destinationId)) continue;
      const result = await this.send(
        target,
        event.id,
        payload,
        endpoint.signingSecret,
      );
      results.push(result);

      if (usesDestinations) {
        await this.resultRepo.save(
          this.resultRepo.create({
            eventId,
            destinationId: target.destinationId!,
            status: result.status,
            responseCode: result.code ?? 0,
            responseBody: result.error ?? result.body ?? null,
            latency: result.latency,
            forwardedAt: new Date(),
            attempt,
          }),
        );
      }
    }

    const failed = results.filter((r) => r.status === 'failed');
    const latencies = results.map((r) => r.latency);
    const aggregateStatus = failed.length > 0 ? 'failed' : 'forwarded';
    const code =
      results.find((r) => r.status === 'forwarded')?.code ??
      results[0]?.code ??
      null;

    await this.safeUpdateEvent(eventId, {
      forwardStatus: aggregateStatus,
      forwardCode: code,
      forwardLatency: latencies.length > 0 ? Math.max(...latencies) : null,
      forwardedAt: new Date(),
      ...(!usesDestinations && {
        forwardBody: results[0]?.error ?? results[0]?.body ?? null,
      }),
    });

    this.safeBroadcast(userId, {
      eventId,
      forwardStatus: aggregateStatus,
      forwardCode: code,
      forwardLatency: latencies.length > 0 ? Math.max(...latencies) : null,
    });

    if (failed.length === 0) return;

    const finalAttempt = attempt >= (job.opts?.attempts ?? 1);
    if (!finalAttempt) {
      // Throwing hands the job back to BullMQ for a backoff retry
      throw new Error(
        `Forward failed for ${failed.length} target(s): ${failed.map((f) => f.error).join('; ')}`,
      );
    }

    await this.writeDeadLetters(eventId, endpointId, attempt, failed);
    this.alertingService
      .evaluateForwardFailure(event.workspaceId, event.id)
      .catch((err: unknown) => {
        this.logger.error(
          `Alert evaluation failed for forward failure on event ${event.id}: ${(err as Error).message}`,
        );
      });
  }

  // Only reached for unexpected errors on the last attempt; normal failures write dead letters in process()
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ForwardJobData>, error: Error): Promise<void> {
    if (job.attemptsMade < (job.opts?.attempts ?? 1)) {
      return;
    }
    if (error.message.startsWith('Forward failed for')) {
      return;
    }

    const { eventId, endpointId, destinationId } = job.data;
    this.logger.error(
      `Job exhausted all retries for event ${eventId}: ${error.message}`,
    );
    await this.writeDeadLetters(eventId, endpointId, job.attemptsMade, [
      {
        target: { destinationId: destinationId ?? null, url: '', label: '' },
        status: 'failed',
        code: null,
        latency: 0,
        error: error.message,
      },
    ]);
  }

  private buildPayload(
    event: WebhookEvent,
    rules: TransformRule[],
  ): { data: string; headers: Record<string, string> } {
    const original = event.headers ?? {};
    const signature =
      original['x-paystack-signature'] ??
      original['verif-hash'] ??
      original['stripe-signature'] ??
      '';

    if (rules.length === 0 || !event.body) {
      // No transforms: forward the exact bytes and headers so the provider signature still verifies
      return {
        data: event.rawBody ?? JSON.stringify(event.body),
        headers: {
          ...forwardableHeaders(original, { bodyTransformed: false }),
          'content-type': original['content-type'] ?? 'application/json',
          'x-hookdash-original-signature': signature,
        },
      };
    }

    let body = event.body;
    for (const rule of rules) {
      body = applyOperations(rule.operations as TransformOperationDto[], body);
    }
    return {
      data: JSON.stringify(body),
      headers: {
        ...forwardableHeaders(original, { bodyTransformed: true }),
        'content-type': 'application/json',
        'x-hookdash-original-signature': signature,
      },
    };
  }

  private async send(
    target: ForwardTarget,
    eventId: string,
    payload: { data: string; headers: Record<string, string> },
    signingSecret: string | undefined,
  ): Promise<TargetResult> {
    const start = Date.now();
    try {
      const guard = await outboundRequestOptions(target.url, this.allowPrivate);
      // Signed per attempt so the timestamp stays inside the receiver's tolerance on retries
      const signature = signingSecret
        ? hookdashSignatureHeaders(signingSecret, eventId, payload.data)
        : {};
      const response = await this.httpService.axiosRef({
        method: 'POST',
        url: target.url,
        headers: {
          ...payload.headers,
          ...signature,
          'x-hookdash-event-id': eventId,
        },
        data: payload.data,
        transformRequest: [(data: string) => data],
        timeout: 15_000,
        ...guard,
      });
      const latency = Date.now() - start;
      this.logger.log(
        `Forwarded ${eventId} → ${target.label} (${response.status}, ${latency}ms)`,
      );
      return {
        target,
        status: 'forwarded',
        code: response.status,
        latency,
        body: JSON.stringify(response.data).slice(0, 5000),
      };
    } catch (err: unknown) {
      const latency = Date.now() - start;
      const error = err as { response?: { status?: number }; message?: string };
      const code = error.response?.status ?? null;
      const message = (error.message ?? 'Unknown error').slice(0, 5000);
      this.logger.warn(
        `Forward failed ${eventId} → ${target.label} (${code ?? 'no response'}, ${latency}ms): ${message}`,
      );
      return { target, status: 'failed', code, latency, error: message };
    }
  }

  private async writeDeadLetters(
    eventId: string,
    endpointId: string,
    attempt: number,
    failed: TargetResult[],
  ): Promise<void> {
    try {
      await this.deadLetterRepo.save(
        failed.map((f) =>
          this.deadLetterRepo.create({
            eventId,
            endpointId,
            destinationId: f.target.destinationId,
            lastAttempt: attempt,
            lastError: (f.error ?? `HTTP ${f.code}`).slice(0, 5000),
            exhaustedAt: new Date(),
          }),
        ),
      );
      this.logger.warn(
        `Event ${eventId} dead-lettered after ${attempt} attempt(s) for ${failed.length} target(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to create dead letter for event ${eventId}: ${(err as Error).message}`,
      );
    }
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
