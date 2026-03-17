import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
  ) {}

  async getStats(userId: string, period: '24h' | '7d' | '30d' | 'all' = '24h') {
    const periodMap: Record<string, number | null> = {
      '24h': 1,
      '7d': 7,
      '30d': 30,
      all: null,
    };
    const days = periodMap[period];
    const since =
      days !== null ? new Date(Date.now() - days * 86_400_000) : null;

    const baseQuery = (alias: string) => {
      const qb = this.eventRepo
        .createQueryBuilder(alias)
        .where(`${alias}.userId = :userId`, { userId });
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
}
