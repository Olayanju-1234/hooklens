import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { EventsQueryDto } from './dto/events-query.dto.js';
import { ForwardJobData } from '../forward/forward.processor.js';
import { Endpoint } from '../../entities/endpoint.entity.js';

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
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
  ) {}

  async findAll(userId: string, query: EventsQueryDto) {
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
      .where('e.userId = :userId', { userId })
      .orderBy('e.receivedAt', 'DESC')
      .take(limit + 1); // fetch one extra for cursor

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
    if (!event) throw new NotFoundException('Event not found');
    if (event.userId !== userId) throw new ForbiddenException();
    return event;
  }

  async getTimeline(eventId: string, userId: string) {
    const event = await this.findOne(eventId, userId);

    const forwardResults = await this.forwardResultRepo.find({
      where: { eventId },
      order: { attempt: 'ASC' },
      relations: ['destination'],
    });

    const steps: TimelineStep[] = [];

    // Step 1: Received
    steps.push({
      step: 'received',
      timestamp: event.receivedAt.toISOString(),
      latencyMs: null,
      status: 'success',
      detail: `${event.method} webhook received`,
    });

    // Step 2: Parsed
    steps.push({
      step: 'parsed',
      timestamp: event.receivedAt.toISOString(),
      latencyMs: null,
      status: event.eventType ? 'success' : 'warning',
      detail: event.eventType
        ? `Event type: ${event.eventType}`
        : 'Could not parse event type',
    });

    // Step 3: Signature verified
    if (event.signatureValid !== null) {
      steps.push({
        step: 'verified',
        timestamp: event.receivedAt.toISOString(),
        latencyMs: null,
        status: event.signatureValid ? 'success' : 'error',
        detail: event.signatureValid ? 'Signature valid' : 'Signature invalid',
      });
    }

    // Step 4+: Forward results
    for (const result of forwardResults) {
      steps.push({
        step: result.attempt > 1 ? 'retried' : 'forwarded',
        timestamp:
          result.forwardedAt?.toISOString() ?? result.createdAt.toISOString(),
        latencyMs: result.latency,
        status:
          result.status === 'forwarded'
            ? 'success'
            : result.status === 'pending'
              ? 'pending'
              : 'error',
        detail: result.destination
          ? `${result.destination.label || result.destination.url} → ${result.responseCode || result.status}`
          : `Attempt ${result.attempt}: ${result.status}`,
      });
    }

    // If no forward results, use legacy fields
    if (forwardResults.length === 0 && event.forwardStatus !== 'pending') {
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
      await this.forwardQueue.add('forward', {
        eventId: saved.id,
        endpointId: endpoint.id,
        userId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue replay forward for event ${saved.id}: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Replayed event ${original.id} → ${saved.id}`);
    return saved;
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
