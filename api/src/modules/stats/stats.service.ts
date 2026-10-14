import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';

export interface LatencyBucket {
  bucket: string;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  // Workspace members share the workspace's stats; without a workspace, only your own
  private async scope(
    userId: string,
    workspaceId?: string,
  ): Promise<{ clause: string; params: Record<string, string> }> {
    if (!workspaceId) return { clause: 'userId = :userId', params: { userId } };
    await this.workspacesService.assertMembership(workspaceId, userId);
    return { clause: 'workspaceId = :workspaceId', params: { workspaceId } };
  }

  async getStats(
    userId: string,
    period: '24h' | '7d' | '30d' | 'all' = '24h',
    workspaceId?: string,
  ) {
    const periodMap: Record<string, number | null> = {
      '24h': 1,
      '7d': 7,
      '30d': 30,
      all: null,
    };
    const days = periodMap[period];
    const since =
      days !== null ? new Date(Date.now() - days * 86_400_000) : null;

    const scope = await this.scope(userId, workspaceId);
    const baseQuery = (alias: string) => {
      const qb = this.eventRepo
        .createQueryBuilder(alias)
        .where(`${alias}.${scope.clause}`, scope.params);
      if (since) qb.andWhere(`${alias}.receivedAt >= :since`, { since });
      return qb;
    };

    const [total, forwarded, failed, avgLatency, byEventType, byProvider] =
      await Promise.all([
        baseQuery('e').getCount(),

        baseQuery('e')
          .andWhere('e.forwardStatus = :status', { status: 'forwarded' })
          .getCount(),

        baseQuery('e')
          .andWhere('e.forwardStatus = :status', { status: 'failed' })
          .getCount(),

        baseQuery('e')
          .select('AVG(e.forwardLatency)', 'avg')
          .andWhere('e.forwardLatency IS NOT NULL')
          .getRawOne<{ avg: string }>(),

        baseQuery('e')
          .select('e.eventType', 'eventType')
          .addSelect('COUNT(*)', 'count')
          .andWhere('e.eventType IS NOT NULL')
          .groupBy('e.eventType')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany<{ eventType: string; count: string }>(),

        baseQuery('e')
          .select('e.provider', 'provider')
          .addSelect('COUNT(*)', 'count')
          .andWhere('e.provider IS NOT NULL')
          .groupBy('e.provider')
          .getRawMany<{ provider: string; count: string }>(),
      ]);

    return {
      period,
      total,
      forwarded,
      failed,
      skipped: total - forwarded - failed,
      successRate: total > 0 ? Math.round((forwarded / total) * 100) : 0,
      avgLatencyMs: avgLatency?.avg
        ? Math.round(parseFloat(avgLatency.avg))
        : null,
      byEventType: byEventType.map((r) => ({
        eventType: r.eventType,
        count: parseInt(r.count),
      })),
      byProvider: byProvider.map((r) => ({
        provider: r.provider,
        count: parseInt(r.count),
      })),
    };
  }

  async getLatencyPercentiles(
    userId: string,
    period: '24h' | '7d' | '30d' | 'all' = '7d',
    workspaceId?: string,
  ) {
    const periodMap: Record<string, number | null> = {
      '24h': 1,
      '7d': 7,
      '30d': 30,
      all: null,
    };
    const days = periodMap[period];
    const since =
      days !== null ? new Date(Date.now() - days * 86_400_000) : null;

    const scope = await this.scope(userId, workspaceId);

    // Overall percentiles
    const percentilesQb = this.eventRepo
      .createQueryBuilder('e')
      .select([
        'percentile_cont(0.5) WITHIN GROUP (ORDER BY e."forwardLatency") as "p50"',
        'percentile_cont(0.95) WITHIN GROUP (ORDER BY e."forwardLatency") as "p95"',
        'percentile_cont(0.99) WITHIN GROUP (ORDER BY e."forwardLatency") as "p99"',
      ])
      .where(`e.${scope.clause}`, scope.params)
      .andWhere('e.forwardLatency IS NOT NULL');

    if (since) {
      percentilesQb.andWhere('e.receivedAt >= :since', { since });
    }

    // Time series bucketed percentiles
    const truncUnit = period === '24h' ? 'hour' : 'day';

    const timeSeriesQb = this.eventRepo
      .createQueryBuilder('e')
      .select([
        `date_trunc('${truncUnit}', e."receivedAt") as "bucket"`,
        'percentile_cont(0.5) WITHIN GROUP (ORDER BY e."forwardLatency") as "p50"',
        'percentile_cont(0.95) WITHIN GROUP (ORDER BY e."forwardLatency") as "p95"',
        'percentile_cont(0.99) WITHIN GROUP (ORDER BY e."forwardLatency") as "p99"',
      ])
      .where(`e.${scope.clause}`, scope.params)
      .andWhere('e.forwardLatency IS NOT NULL')
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');

    if (since) {
      timeSeriesQb.andWhere('e.receivedAt >= :since', { since });
    }

    const [result, timeSeriesRaw] = await Promise.all([
      percentilesQb.getRawOne<{ p50: string; p95: string; p99: string }>(),
      timeSeriesQb.getRawMany<{
        bucket: string;
        p50: string;
        p95: string;
        p99: string;
      }>(),
    ]);

    const timeSeries: LatencyBucket[] = timeSeriesRaw.map((r) => ({
      bucket: r.bucket,
      p50: r.p50 ? Math.round(parseFloat(r.p50)) : null,
      p95: r.p95 ? Math.round(parseFloat(r.p95)) : null,
      p99: r.p99 ? Math.round(parseFloat(r.p99)) : null,
    }));

    return {
      p50: result?.p50 ? Math.round(parseFloat(result.p50)) : null,
      p95: result?.p95 ? Math.round(parseFloat(result.p95)) : null,
      p99: result?.p99 ? Math.round(parseFloat(result.p99)) : null,
      timeSeries,
    };
  }
}
