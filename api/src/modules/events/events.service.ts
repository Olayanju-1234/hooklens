import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { EventsQueryDto } from './dto/events-query.dto.js';
import { LocalDeliveryDto } from './dto/local-delivery.dto.js';
import {
  ForwardJobData,
  FAN_OUT_JOB_OPTIONS,
} from '../forward/forward.processor.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';

export interface TimelineStep {
  step: string;
  timestamp: string;
  latencyMs: number | null;
  status: 'success' | 'warning' | 'error' | 'pending';
  detail: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(ForwardResult)
    private readonly forwardResultRepo: Repository<ForwardResult>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async findAll(userId: string, query: EventsQueryDto, workspaceId?: string) {
    const limit = query.limit ?? 20;
    const qb = this.eventRepo
      .createQueryBuilder('e')
      .select([
        'e.id',
        'e.endpointId',
        'e.method',
        'e.path',
        'e.provider',
        'e.eventType',
        'e.signatureValid',
        'e.forwardStatus',
        'e.forwardCode',
        'e.forwardLatency',
        'e.isReplay',
        'e.isDuplicate',
        'e.receivedAt',
        'e.createdAt',
      ])
      .orderBy('e.receivedAt', 'DESC')
      .take(limit + 1); // fetch one extra for cursor

    // Workspace members share the workspace's events; without a workspace, only your own
    if (workspaceId) {
      await this.workspacesService.assertMembership(workspaceId, userId);
      qb.where('e.workspaceId = :workspaceId', { workspaceId });
    } else {
      qb.where('e.userId = :userId', { userId });
    }

    if (query.endpointId) {
      qb.andWhere('e.endpointId = :endpointId', {
        endpointId: query.endpointId,
      });
    }
    if (query.eventType) {
      qb.andWhere('e.eventType = :eventType', { eventType: query.eventType });
    }
    if (query.forwardStatus) {
      qb.andWhere('e.forwardStatus = :forwardStatus', {
        forwardStatus: query.forwardStatus,
      });
    }
    if (query.provider) {
      qb.andWhere('e.provider = :provider', { provider: query.provider });
    }
    if (query.search) {
      qb.andWhere('CAST(e.body AS text) ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.isDuplicate === 'true') {
      qb.andWhere('e.isDuplicate = true');
    }
    if (query.from) {
      qb.andWhere('e.receivedAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('e.receivedAt <= :to', { to: query.to });
    }
    if (query.cursor) {
      qb.andWhere('e.receivedAt < :cursor', { cursor: new Date(query.cursor) });
    }

    const results = await qb.getMany();
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore
      ? items[items.length - 1].receivedAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async findOne(id: string, userId: string): Promise<WebhookEvent> {
    const event = await this.eventRepo.findOne({ where: { id } });
    const allowed =
      event &&
      (event.userId === userId ||
        (await this.workspacesService.isMember(event.workspaceId, userId)));
    if (!event || !allowed) throw new NotFoundException('Event not found');
    return event;
  }

  async getTimeline(eventId: string, userId: string) {
    const event = await this.findOne(eventId, userId);

    const [forwardResults, deadLetters] = await Promise.all([
      this.forwardResultRepo.find({
        where: { eventId },
        relations: ['destination'],
      }),
      this.deadLetterRepo.find({
        where: { eventId },
        order: { exhaustedAt: 'ASC' },
      }),
    ]);

    const steps: TimelineStep[] = [];
    const since = (to: Date | null, from: Date | null) =>
      to && from ? Math.max(0, to.getTime() - from.getTime()) : null;
    // "<label> → <outcome>" is what the dashboard parses into per-destination lanes
    const label = (dest: { label: string | null; url: string } | null) =>
      dest ? dest.label || dest.url : 'forward URL';

    steps.push({
      step: 'received',
      timestamp: event.receivedAt.toISOString(),
      latencyMs: null,
      status: 'success',
      detail: `${event.method} webhook received`,
    });

    const processedAt = event.processedAt ?? event.receivedAt;
    steps.push({
      step: 'parsed',
      timestamp: processedAt.toISOString(),
      latencyMs: since(event.processedAt, event.receivedAt),
      status: event.eventType ? 'success' : 'warning',
      detail: event.eventType
        ? `Event type: ${event.eventType}`
        : 'Could not parse event type',
    });

    if (event.signatureValid !== null) {
      steps.push({
        step: 'verified',
        timestamp: processedAt.toISOString(),
        latencyMs: null,
        status: event.signatureValid ? 'success' : 'error',
        detail: event.signatureValid ? 'Signature valid' : 'Signature invalid',
      });
    }

    if (event.queuedAt) {
      steps.push({
        step: 'queued',
        timestamp: event.queuedAt.toISOString(),
        latencyMs: since(event.queuedAt, processedAt),
        status: 'success',
        detail: `Queued for ${event.targetCount ?? 1} destination${event.targetCount === 1 ? '' : 's'}`,
      });
    }

    const attempts = [...forwardResults].sort(
      (a, b) =>
        (a.startedAt ?? a.forwardedAt ?? a.createdAt).getTime() -
        (b.startedAt ?? b.forwardedAt ?? b.createdAt).getTime(),
    );
    for (const result of attempts) {
      steps.push({
        step: result.attempt > 1 ? 'retried' : 'forwarded',
        timestamp: (
          result.startedAt ??
          result.forwardedAt ??
          result.createdAt
        ).toISOString(),
        latencyMs: result.latency,
        status:
          result.status === 'forwarded'
            ? 'success'
            : result.status === 'pending'
              ? 'pending'
              : 'error',
        detail: `${result.target ?? label(result.destination)} → ${result.responseCode || result.status}`,
      });
    }

    // A dead target always has attempts, so its destination comes from those results
    const destinations = new Map(
      forwardResults
        .filter((r) => r.destinationId && r.destination && !r.target)
        .map((r) => [r.destinationId, r.destination]),
    );
    for (const dead of deadLetters) {
      steps.push({
        step: 'dead',
        timestamp: dead.exhaustedAt.toISOString(),
        latencyMs: null,
        status: 'error',
        detail: `${label(destinations.get(dead.destinationId) ?? null)} → dead after ${dead.lastAttempt} attempt${dead.lastAttempt === 1 ? '' : 's'}`,
      });
    }

    // Not a delivery step, so the dashboard doesn't draw a forward lane for it
    if (event.forwardStatus === 'blocked') {
      steps.push({
        step: 'blocked',
        timestamp: processedAt.toISOString(),
        latencyMs: null,
        status: 'error',
        detail: 'Blocked at the gate: invalid signature, not forwarded',
      });
    } else if (
      // Events from before per-attempt results were recorded only have the aggregate fields
      !forwardResults.some((r) => !r.target) &&
      event.forwardStatus !== 'pending'
    ) {
      steps.push({
        step: 'forwarded',
        timestamp:
          event.forwardedAt?.toISOString() ?? event.createdAt.toISOString(),
        latencyMs: event.forwardLatency,
        status:
          event.forwardStatus === 'forwarded'
            ? 'success'
            : event.forwardStatus === 'skipped'
              ? 'warning'
              : 'error',
        detail:
          event.forwardStatus === 'skipped'
            ? 'No forward URL configured'
            : `Forward ${event.forwardStatus} (${event.forwardCode || 'N/A'})`,
      });
    }

    return { eventId, steps };
  }

  /** Records a delivery made outside Hookdash, such as `hookdash listen` to localhost. */
  async recordLocalDelivery(
    id: string,
    userId: string,
    dto: LocalDeliveryDto,
  ): Promise<ForwardResult> {
    await this.findOne(id, userId);
    const target = `cli · ${dto.target}`;
    const previous = await this.forwardResultRepo.count({
      where: { eventId: id, target },
    });
    const now = new Date();
    return this.forwardResultRepo.save(
      this.forwardResultRepo.create({
        eventId: id,
        destinationId: null,
        target,
        status: dto.status,
        responseCode: dto.responseCode ?? 0,
        responseBody: dto.error ?? null,
        latency: dto.latencyMs,
        startedAt: new Date(now.getTime() - dto.latencyMs),
        forwardedAt: now,
        attempt: previous + 1,
      }),
    );
  }

  async diff(id1: string, id2: string, userId: string) {
    const [event1, event2] = await Promise.all([
      this.findOne(id1, userId),
      this.findOne(id2, userId),
    ]);

    return {
      event1: {
        id: event1.id,
        body: event1.body,
        receivedAt: event1.receivedAt,
      },
      event2: {
        id: event2.id,
        body: event2.body,
        receivedAt: event2.receivedAt,
      },
      headersDiff: this.computeDiff(event1.headers, event2.headers),
      bodyDiff: this.computeDiff(event1.body, event2.body),
    };
  }

  async replay(id: string, userId: string): Promise<WebhookEvent> {
    const original = await this.findOne(id, userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: original.endpointId },
    });

    if (!endpoint) throw new NotFoundException('Endpoint not found');

    const replay = this.eventRepo.create({
      endpointId: original.endpointId,
      userId: original.userId,
      workspaceId: original.workspaceId,
      method: original.method,
      path: original.path,
      headers: original.headers,
      body: original.body,
      rawBody: original.rawBody,
      sourceIp: original.sourceIp,
      provider: original.provider,
      eventType: original.eventType,
      signatureValid: original.signatureValid,
      isReplay: true,
      originalEventId: original.id,
      forwardStatus: 'pending',
      receivedAt: new Date(),
    });

    const saved = await this.eventRepo.save(replay);

    try {
      await this.forwardQueue.add(
        'forward',
        { eventId: saved.id, endpointId: endpoint.id, userId: original.userId },
        FAN_OUT_JOB_OPTIONS,
      );
    } catch (err) {
      this.logger.error(
        `Failed to queue replay forward for event ${saved.id}: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Replayed event ${original.id} → ${saved.id}`);
    return saved;
  }

  async delete(id: string, userId: string): Promise<{ deleted: true }> {
    const event = await this.findOne(id, userId);
    await this.eventRepo.remove(event);
    this.logger.log(`Deleted event ${id}`);
    return { deleted: true };
  }

  private computeDiff(
    a: Record<string, unknown> | null,
    b: Record<string, unknown> | null,
  ) {
    const keysA = new Set(Object.keys(a ?? {}));
    const keysB = new Set(Object.keys(b ?? {}));
    const allKeys = new Set([...keysA, ...keysB]);

    const diff: Record<string, { old: unknown; new: unknown; status: string }> =
      {};

    for (const key of allKeys) {
      const valA = a?.[key];
      const valB = b?.[key];

      if (!keysA.has(key)) {
        diff[key] = { old: undefined, new: valB, status: 'added' };
      } else if (!keysB.has(key)) {
        diff[key] = { old: valA, new: undefined, status: 'removed' };
      } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
        diff[key] = { old: valA, new: valB, status: 'changed' };
      }
    }

    return diff;
  }
}
