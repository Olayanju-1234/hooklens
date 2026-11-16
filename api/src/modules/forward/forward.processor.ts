import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { Job, JobsOptions, Queue } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { TransformRule } from '../../entities/transform-rule.entity.js';
import {
  WebhookGateway,
  type ChaosDeliveryPayload,
} from '../websocket/webhook.gateway.js';
import { AlertingService } from '../alerting/alerting.service.js';
import { applyOperations } from '../transform/transform.service.js';
import type { TransformOperationDto } from '../transform/dto/transform.dto.js';
import { outboundRequestOptions } from '../../common/utils/outbound-url.js';
import {
  forwardableHeaders,
  hookdashSignatureHeaders,
} from './outbound-headers.js';
import { aggregateDeliveryStatus } from './delivery-status.js';
import { ChaosService } from '../chaos/chaos.service.js';
import {
  MAX_EXTRAS_PER_EVENT,
  STALE_AGE_MS,
  capExtras,
  chaosRng,
  countExtras,
  isExtraCopy,
  planChaos,
  type ChaosDelivery,
  type ChaosPlan,
} from '../chaos/chaos-plan.js';

/** A scenario run's event: delivered to one target with an exact chaos plan. */
export interface ScenarioDelivery {
  runId: string;
  destinationId: string | null;
  plan: ChaosPlan;
}

/** Fan-out job: one per event. With `destinationId` it targets that destination only. */
export interface ForwardJobData {
  eventId: string;
  endpointId: string;
  userId: string;
  destinationId?: string;
  scenario?: ScenarioDelivery;
}

/** Delivery job: one per event and target. A null destination is the endpoint's fallback forward URL. */
export interface DeliverJobData {
  eventId: string;
  endpointId: string;
  userId: string;
  destinationId: string | null;
  // Set by chaos mode; seq 0 is the real delivery held back, seq > 0 an extra copy
  chaos?: ChaosDelivery;
}

interface SendResult {
  status: 'forwarded' | 'failed';
  code: number | null;
  latency: number;
  startedAt: Date;
  body?: string;
  error?: string;
}

/** Retry policy for one delivery, from the endpoint's settings. */
export function deliveryJobOptions(endpoint: {
  retryMaxAttempts: number;
  retryBackoffMs: number;
}): JobsOptions {
  return {
    attempts: endpoint.retryMaxAttempts + 1,
    backoff: {
      type: 'exponential',
      delay: Math.max(endpoint.retryBackoffMs, 1000),
    },
  };
}

/** Fan-out only touches the database and queue, so a short fixed retry covers transient errors. */
export const FAN_OUT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'fixed', delay: 2000 },
};

const FALLBACK = 'fallback';

function withRun(plan: ChaosPlan, runId: string): ChaosPlan {
  return { ...plan, extras: plan.extras.map((e) => ({ ...e, runId })) };
}

type EventDeliveryFields = Partial<
  Pick<
    WebhookEvent,
    | 'forwardStatus'
    | 'forwardCode'
    | 'forwardBody'
    | 'forwardLatency'
    | 'forwardedAt'
    | 'queuedAt'
    | 'targetCount'
  >
>;

@Processor('webhook-forward', {
  concurrency: 10,
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
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData | DeliverJobData>,
    private readonly httpService: HttpService,
    private readonly wsGateway: WebhookGateway,
    private readonly alertingService: AlertingService,
    private readonly chaosService: ChaosService,
    configService: ConfigService,
  ) {
    super();
    this.allowPrivate = configService.get<boolean>(
      'allowPrivateForwarding',
      false,
    );
  }

  async process(job: Job<ForwardJobData | DeliverJobData>): Promise<void> {
    if (job.name === 'deliver') {
      return this.deliver(job as Job<DeliverJobData>);
    }
    return this.fanOut(job as Job<ForwardJobData>);
  }

  /** Splits an event into one delivery job per target so each retries independently. */
  private async fanOut(job: Job<ForwardJobData>): Promise<void> {
    const { eventId, endpointId, userId, destinationId, scenario } = job.data;
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

    const targets = scenario
      ? await this.scenarioTargets(endpoint, scenario)
      : await this.fanOutTargets(endpoint, destinationId);

    if (targets.length === 0) {
      await this.safeUpdateEvent(eventId, {
        forwardStatus: 'skipped',
        targetCount: 0,
      });
      this.safeBroadcast(userId, {
        eventId,
        forwardStatus: 'skipped',
        forwardCode: null,
        forwardLatency: null,
      });
      return;
    }

    await this.safeUpdateEvent(eventId, {
      queuedAt: new Date(),
      targetCount: targets.length,
      forwardStatus: 'pending',
    });

    // A scenario's extra copies were budgeted when the run started
    const plans = scenario
      ? new Map(
          targets.map((t) => [
            t ?? FALLBACK,
            withRun(scenario.plan, scenario.runId),
          ]),
        )
      : await this.planChaosFor(
          event,
          endpoint.id,
          targets,
          Boolean(destinationId),
        );

    // Deterministic ids make a retried fan-out a no-op for deliveries already queued;
    // a targeted re-delivery must not collide with the original job id
    await this.forwardQueue.addBulk(
      targets.flatMap((target) => {
        const data: DeliverJobData = {
          eventId,
          endpointId,
          userId,
          destinationId: target,
        };
        const jobId = `deliver-${eventId}-${target ?? FALLBACK}`;
        const plan = plans.get(target ?? FALLBACK);
        const held: ChaosDelivery | undefined = plan?.primary.kind
          ? { kind: plan.primary.kind, seq: 0, delayMs: plan.primary.delayMs }
          : undefined;
        return [
          {
            name: 'deliver',
            data: held ? { ...data, chaos: held } : data,
            opts: {
              ...deliveryJobOptions(endpoint),
              ...(!destinationId && { jobId }),
              ...(held && { delay: held.delayMs }),
            },
          },
          // One attempt each: a failing copy is the result being tested, not something to retry
          ...(plan?.extras ?? []).map((chaos) => ({
            name: 'deliver',
            data: { ...data, chaos },
            opts: {
              attempts: 1,
              delay: chaos.delayMs,
              jobId: `${jobId}-c${chaos.seq}`,
            },
          })),
        ];
      }),
    );
  }

  private async fanOutTargets(
    endpoint: Endpoint,
    destinationId: string | undefined,
  ): Promise<(string | null)[]> {
    const destinations = await this.destinationRepo.find({
      where: destinationId
        ? { id: destinationId, endpointId: endpoint.id }
        : { endpointId: endpoint.id, isActive: true },
    });
    if (destinations.length > 0) return destinations.map((d) => d.id);
    return endpoint.forwardUrl ? [null] : [];
  }

  /** A scenario run goes to the one target it was started against, if it still exists. */
  private async scenarioTargets(
    endpoint: Endpoint,
    scenario: ScenarioDelivery,
  ): Promise<(string | null)[]> {
    if (scenario.destinationId === null) {
      return endpoint.forwardUrl ? [null] : [];
    }
    const destination = await this.destinationRepo.findOne({
      where: { id: scenario.destinationId, endpointId: endpoint.id },
    });
    return destination ? [destination.id] : [];
  }

  /** Chaos plans by target; none for re-deliveries, replays, or events outside a setting's scope. */
  private async planChaosFor(
    event: WebhookEvent,
    endpointId: string,
    targets: (string | null)[],
    targeted: boolean,
  ): Promise<Map<string, ChaosPlan>> {
    if (targeted || event.isReplay) return new Map();
    try {
      const settings = await this.chaosService.activeForEndpoint(endpointId);
      const plans = new Map<string, ChaosPlan>();
      for (const target of targets) {
        const setting = settings.find((s) => s.destinationId === target);
        if (!setting || (setting.scope === 'test' && !event.isTest)) continue;
        const key = target ?? FALLBACK;
        plans.set(
          key,
          planChaos(setting, chaosRng(setting.seed, event.id, key)),
        );
      }

      const planned = countExtras(plans);
      const granted =
        planned > 0
          ? await this.chaosService.reserveExtras(
              event.workspaceId,
              Math.min(planned, MAX_EXTRAS_PER_EVENT),
            )
          : 0;
      if (granted < planned) {
        this.logger.warn(
          `Chaos for event ${event.id}: sending ${granted} of ${planned} planned extra copies (limits)`,
        );
      }
      return capExtras(plans, granted);
    } catch (err) {
      this.logger.error(
        `Chaos planning failed for event ${event.id}, delivering normally: ${(err as Error).message}`,
      );
      return new Map();
    }
  }

  private async deliver(job: Job<DeliverJobData>): Promise<void> {
    const { eventId, endpointId, userId, destinationId, chaos } = job.data;
    const extra = isExtraCopy(chaos);
    if (extra && !(await this.extraCopyWanted(job.data))) return;
    const [event, endpoint, destination, transformRules] = await Promise.all([
      this.eventRepo.findOne({ where: { id: eventId } }),
      this.endpointRepo
        .createQueryBuilder('ep')
        .addSelect('ep.signingSecret')
        .where('ep.id = :endpointId', { endpointId })
        .getOne(),
      destinationId
        ? this.destinationRepo.findOne({
            where: { id: destinationId, endpointId },
          })
        : Promise.resolve(null),
      this.transformRuleRepo.find({
        where: { endpointId, isActive: true },
        order: { priority: 'ASC' },
      }),
    ]);

    const url = destinationId ? destination?.url : endpoint?.forwardUrl;
    if (!event || !endpoint || !url) {
      this.logger.warn(
        `Delivery target gone for event ${eventId} (${destinationId ?? FALLBACK}), skipping`,
      );
      return;
    }

    const label = destination ? destination.label || destination.url : url;
    const attempt = job.attemptsMade + 1;
    const payload = this.buildPayload(event, transformRules);
    const result = await this.send(
      url,
      label,
      event.id,
      payload,
      endpoint.signingSecret,
      chaos?.kind === 'stale' ? new Date(Date.now() - STALE_AGE_MS) : undefined,
    );

    await this.resultRepo.save(
      this.resultRepo.create({
        eventId,
        destinationId,
        status: result.status,
        responseCode: result.code ?? 0,
        responseBody: result.error ?? result.body ?? null,
        latency: result.latency,
        startedAt: result.startedAt,
        forwardedAt: new Date(),
        attempt,
        chaosKind: chaos?.kind ?? null,
        chaosSeq: chaos?.seq ?? 0,
        chaosDelayMs: chaos?.delayMs ?? null,
      }),
    );

    if (chaos || event.chaosRunId) {
      this.safeBroadcastChaos(userId, {
        runId: event.chaosRunId ?? null,
        eventId,
        chaosKind: chaos?.kind ?? null,
        chaosSeq: chaos?.seq ?? 0,
        status: result.status,
        responseCode: result.code,
      });
    }

    // An extra copy is only recorded: never retried, dead-lettered or counted in the event's status
    if (extra) return;

    if (result.status === 'failed') {
      if (attempt < (job.opts?.attempts ?? 1)) {
        await this.settle(eventId, userId);
        // Throwing hands only this target back to BullMQ for a backoff retry
        throw new Error(`Delivery failed: ${result.error ?? result.code}`);
      }
      await this.writeDeadLetter(
        eventId,
        endpointId,
        destinationId,
        attempt,
        result.error ?? `HTTP ${result.code}`,
      );
    }

    await this.settle(eventId, userId);
  }

  /** An extra copy goes out only while chaos is still on; a stale replay only once the event was delivered. */
  private async extraCopyWanted(data: DeliverJobData): Promise<boolean> {
    const { eventId, endpointId, destinationId, chaos } = data;
    const [active, delivered] = await Promise.all([
      chaos?.runId
        ? Promise.resolve(true)
        : this.chaosService.isActive(endpointId, destinationId),
      chaos?.kind === 'stale'
        ? this.resultRepo.exists({
            where: {
              eventId,
              destinationId: destinationId ?? IsNull(),
              target: IsNull(),
              chaosSeq: 0,
              status: 'forwarded',
            },
          })
        : Promise.resolve(true),
    ]);
    if (!active) {
      this.logger.log(
        `Chaos is off for event ${eventId} (${destinationId ?? FALLBACK}), dropping ${chaos?.kind} copy ${chaos?.seq}`,
      );
    } else if (!delivered) {
      this.logger.log(
        `Event ${eventId} not delivered to ${destinationId ?? FALLBACK} yet, skipping the stale replay`,
      );
    }
    return active && delivered;
  }

  // Only reached for unexpected errors on the last attempt; delivery failures are dead-lettered in deliver()
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ForwardJobData | DeliverJobData>,
    error: Error,
  ): Promise<void> {
    if (job.attemptsMade < (job.opts?.attempts ?? 1)) return;
    if (error.message.startsWith('Delivery failed')) return;

    this.logger.error(
      `${job.name} job for event ${job.data.eventId} exhausted retries: ${error.message}`,
    );
    if (job.name !== 'deliver') return;

    const data = job.data as DeliverJobData;
    if (isExtraCopy(data.chaos)) return;
    await this.writeDeadLetter(
      data.eventId,
      data.endpointId,
      data.destinationId,
      job.attemptsMade,
      error.message,
    );
    await this.settle(data.eventId, data.userId);
  }

  /** Recomputes the event's overall status from every target's attempts and dead letters. */
  private async settle(eventId: string, userId: string): Promise<void> {
    try {
      const outcome = await this.eventRepo.manager.transaction(async (m) => {
        // Row lock serialises concurrent deliveries so the last writer has seen every result
        const event = await m
          .createQueryBuilder(WebhookEvent, 'e')
          .setLock('pessimistic_write')
          .where('e.id = :eventId', { eventId })
          .getOne();
        if (!event) return null;

        const [results, deadLetters] = await Promise.all([
          // Only real deliveries count: not locally reported ones (target set) or chaos copies
          m.find(ForwardResult, {
            where: { eventId, target: IsNull(), chaosSeq: 0 },
            order: { createdAt: 'ASC' },
          }),
          m.find(DeadLetterEvent, { where: { eventId } }),
        ]);

        const update: EventDeliveryFields = aggregateDeliveryStatus(
          results,
          deadLetters,
          event.targetCount,
        );
        await m.update(WebhookEvent, eventId, update);
        return {
          becameFailed:
            update.forwardStatus === 'failed' &&
            event.forwardStatus !== 'failed',
          workspaceId: event.workspaceId,
          update,
        };
      });
      if (!outcome) return;

      this.safeBroadcast(userId, {
        eventId,
        forwardStatus: outcome.update.forwardStatus!,
        forwardCode: outcome.update.forwardCode ?? null,
        forwardLatency: outcome.update.forwardLatency ?? null,
      });

      if (outcome.becameFailed) {
        this.alertingService
          .evaluateForwardFailure(outcome.workspaceId, eventId)
          .catch((err: unknown) => {
            this.logger.error(
              `Alert evaluation failed for event ${eventId}: ${(err as Error).message}`,
            );
          });
      }
    } catch (err) {
      this.logger.error(
        `Failed to settle event ${eventId}: ${(err as Error).message}`,
      );
    }
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
    url: string,
    label: string,
    eventId: string,
    payload: { data: string; headers: Record<string, string> },
    signingSecret: string | undefined,
    signedAt?: Date,
  ): Promise<SendResult> {
    const startedAt = new Date();
    try {
      const guard = await outboundRequestOptions(url, this.allowPrivate);
      // Signed per attempt so the timestamp stays inside the receiver's tolerance on retries
      const signature = signingSecret
        ? hookdashSignatureHeaders(
            signingSecret,
            eventId,
            payload.data,
            signedAt,
          )
        : {};
      const response = await this.httpService.axiosRef({
        method: 'POST',
        url,
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
      const latency = Date.now() - startedAt.getTime();
      this.logger.log(
        `Forwarded ${eventId} → ${label} (${response.status}, ${latency}ms)`,
      );
      return {
        status: 'forwarded',
        code: response.status,
        latency,
        startedAt,
        body: JSON.stringify(response.data).slice(0, 5000),
      };
    } catch (err: unknown) {
      const latency = Date.now() - startedAt.getTime();
      const error = err as { response?: { status?: number }; message?: string };
      const code = error.response?.status ?? null;
      const message = (error.message ?? 'Unknown error').slice(0, 5000);
      this.logger.warn(
        `Forward failed ${eventId} → ${label} (${code ?? 'no response'}, ${latency}ms): ${message}`,
      );
      return { status: 'failed', code, latency, startedAt, error: message };
    }
  }

  private async writeDeadLetter(
    eventId: string,
    endpointId: string,
    destinationId: string | null,
    attempt: number,
    lastError: string,
  ): Promise<void> {
    try {
      await this.deadLetterRepo.save(
        this.deadLetterRepo.create({
          eventId,
          endpointId,
          destinationId,
          lastAttempt: attempt,
          lastError: lastError.slice(0, 5000),
          exhaustedAt: new Date(),
        }),
      );
      this.logger.warn(
        `Event ${eventId} dead-lettered for ${destinationId ?? FALLBACK} after ${attempt} attempt(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to create dead letter for event ${eventId}: ${(err as Error).message}`,
      );
    }
  }

  private async safeUpdateEvent(
    eventId: string,
    data: EventDeliveryFields,
  ): Promise<void> {
    try {
      await this.eventRepo.update(eventId, data);
    } catch (err) {
      this.logger.error(
        `DB update failed for event ${eventId}: ${(err as Error).message}`,
      );
    }
  }

  private safeBroadcastChaos(
    userId: string,
    payload: ChaosDeliveryPayload,
  ): void {
    try {
      this.wsGateway.broadcastChaosDelivery(userId, payload);
    } catch (err) {
      this.logger.warn(
        `WebSocket chaos broadcast failed for event ${payload.eventId}: ${(err as Error).message}`,
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
