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

  async getStats(userId: string, period: '24h' | '7d' | '30d' = '24h') {
    const periodMap = { '24h': 1, '7d': 7, '30d': 30 };
    const days = periodMap[period];
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [total, forwarded, failed, avgLatency, byEventType, byProvider] =
      await Promise.all([
        this.eventRepo
          .createQueryBuilder('e')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
          .getCount(),

        this.eventRepo
          .createQueryBuilder('e')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
          .andWhere('e.forwardStatus = :status', { status: 'forwarded' })
          .getCount(),

        this.eventRepo
          .createQueryBuilder('e')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
          .andWhere('e.forwardStatus = :status', { status: 'failed' })
          .getCount(),

        this.eventRepo
          .createQueryBuilder('e')
          .select('AVG(e.forwardLatency)', 'avg')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
          .andWhere('e.forwardLatency IS NOT NULL')
          .getRawOne<{ avg: string }>(),

        this.eventRepo
          .createQueryBuilder('e')
          .select('e.eventType', 'eventType')
          .addSelect('COUNT(*)', 'count')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
          .andWhere('e.eventType IS NOT NULL')
          .groupBy('e.eventType')
          .orderBy('count', 'DESC')
          .limit(10)
          .getRawMany<{ eventType: string; count: string }>(),

        this.eventRepo
          .createQueryBuilder('e')
          .select('e.provider', 'provider')
          .addSelect('COUNT(*)', 'count')
          .where('e.userId = :userId', { userId })
          .andWhere('e.receivedAt >= :since', { since })
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
