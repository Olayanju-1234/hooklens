import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import WebSocket from 'ws';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { IngressService } from '../ingress/ingress.service.js';
import { AlertingService } from '../alerting/alerting.service.js';

interface BagsLaunchEvent {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  initialBuy?: number;
  signature?: string;
  timestamp?: number;
  type?: string;
  side?: string;
  amount?: number;
  [key: string]: unknown;
}

interface BagsRestreamMessage {
  channel: string;
  topic: string;
  subject: string;
  data: BagsLaunchEvent;
}

export interface BagsEndpointFilter {
  minInitialBuy?: number;
  creators?: string[];
  eventTypes?: string[];
  symbolPattern?: string;
}

export interface BagsStats {
  totalEventsReceived: number;
  totalEventsForwarded: number;
  totalEventsFiltered: number;
  launchesDetected: number;
  recentTokens: Array<{
    mint: string;
    name: string;
    symbol: string;
    creator: string;
    receivedAt: string;
  }>;
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

@Injectable()
export class BagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BagsService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private feeClaimTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 20;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private isShuttingDown = false;
  private readonly enabled: boolean;
  private readonly bagsApiKey: string;
  private readonly wsUrl = 'wss://restream.bags.fm/ws';

  // In-memory stats for the dashboard
  private stats: BagsStats = {
    totalEventsReceived: 0,
    totalEventsForwarded: 0,
    totalEventsFiltered: 0,
    launchesDetected: 0,
    recentTokens: [],
  };

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    private readonly ingressService: IngressService,
    private readonly alertingService: AlertingService,
  ) {
    this.enabled = this.configService.get<boolean>('bags.enabled') ?? false;
    this.bagsApiKey = this.configService.get<string>('bags.apiKey') ?? '';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Bags Restream disabled (BAGS_RESTREAM_ENABLED != true)');
      return;
    }
    this.connect();
    this.startFeeClaimPoller();
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.feeClaimTimer) clearInterval(this.feeClaimTimer);
    if (this.ws) {
      this.ws.close(1000, 'shutdown');
      this.ws = null;
    }
  }

  // ─── WebSocket Connection ───────────────────────────────

  private connect(): void {
    if (this.isShuttingDown) return;

    try {
      const headers: Record<string, string> = {};
      if (this.bagsApiKey) {
        headers['x-api-key'] = this.bagsApiKey;
      }

      this.ws = new WebSocket(this.wsUrl, { headers });

      this.ws.on('open', () => {
        this.logger.log('Connected to Bags Restream WebSocket');
        this.reconnectAttempts = 0;
        this.subscribe();
      });

      this.ws.on('message', (raw: Buffer) => {
        this.handleMessage(raw).catch((err) => {
          this.logger.error(
            `Failed to handle Bags message: ${(err as Error).message}`,
          );
        });
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.logger.warn(
          `Bags Restream disconnected: code=${code} reason=${reason.toString()}`,
        );
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.logger.error(`Bags Restream WebSocket error: ${err.message}`);
      });
    } catch (err) {
      this.logger.error(
        `Failed to connect to Bags Restream: ${(err as Error).message}`,
      );
      this.scheduleReconnect();
    }
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        topic: 'launchpad_launch',
        subject: 'BAGS',
      }),
    );
    this.logger.log('Subscribed to Bags launchpad_launch events');
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Bags Restream: max reconnect attempts (${this.maxReconnectAttempts}) reached`,
      );
      return;
    }

    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxDelay,
    );
    this.reconnectAttempts++;

    this.logger.log(
      `Bags Restream: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ─── Message Handling with Filters ──────────────────────

  private async handleMessage(raw: Buffer): Promise<void> {
    let msg: BagsRestreamMessage;
    try {
      msg = JSON.parse(raw.toString()) as BagsRestreamMessage;
    } catch {
      this.logger.warn('Bags Restream: received non-JSON message');
      return;
    }

    if (!msg.topic || !msg.data) return;

    this.stats.totalEventsReceived++;
    if (msg.topic === 'launchpad_launch' && !msg.data.type) {
      this.stats.launchesDetected++;
      this.trackRecentToken(msg.data);
    }

    const endpoints = await this.endpointRepo
      .createQueryBuilder('ep')
      .addSelect('ep.webhookSecret')
      .where('ep.provider = :provider', { provider: 'bags' })
      .andWhere('ep.isActive = :isActive', { isActive: true })
      .getMany();

    if (endpoints.length === 0) return;

    const body: Record<string, unknown> = {
      topic: msg.topic,
      subject: msg.subject,
      channel: msg.channel,
      data: msg.data,
      receivedAt: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(body);

    for (const endpoint of endpoints) {
      try {
        // Apply launch filters from endpoint config
        if (!this.passesFilter(endpoint, msg)) {
          this.stats.totalEventsFiltered++;
          continue;
        }

        const signature = endpoint.webhookSecret
          ? crypto
              .createHmac('sha256', endpoint.webhookSecret)
              .update(rawBody)
              .digest('hex')
          : '';

        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-bags-signature': signature,
          'x-bags-topic': msg.topic,
          'x-bags-subject': msg.subject || '',
        };

        const event = await this.ingressService.capture({
          endpointId: endpoint.id,
          userId: endpoint.userId,
          method: 'POST',
          path: `/bags/restream/${msg.topic}`,
          headers,
          rawBody,
          body,
          sourceIp: 'bags-restream',
        });

        await this.ingressService.processEvent(event, endpoint);
        this.stats.totalEventsForwarded++;

        // Fire token launch alert for new launches
        if (msg.topic === 'launchpad_launch' && !msg.data.type) {
          this.alertingService
            .evaluateBagsTokenLaunch(endpoint.workspaceId, {
              mint: msg.data.mint,
              name: msg.data.name,
              symbol: msg.data.symbol,
              creator: msg.data.creator,
            })
            .catch(() => {});
        }
      } catch (err) {
        this.logger.error(
          `Failed to process Bags event for endpoint ${endpoint.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Launch Filters ─────────────────────────────────────

  private passesFilter(endpoint: Endpoint, msg: BagsRestreamMessage): boolean {
    const filter = (
      endpoint.responseBody ? JSON.parse(endpoint.responseBody) : null
    ) as BagsEndpointFilter | null;

    if (!filter) return true;

    const data = msg.data;

    // Filter by minimum initial buy (in lamports)
    if (
      filter.minInitialBuy &&
      data.initialBuy !== undefined &&
      data.initialBuy < filter.minInitialBuy
    ) {
      return false;
    }

    // Filter by creator watchlist
    if (
      filter.creators &&
      filter.creators.length > 0 &&
      data.creator &&
      !filter.creators.includes(data.creator)
    ) {
      return false;
    }

    // Filter by event type (launch, swap, claim)
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      const eventType = data.type || 'launch';
      if (!filter.eventTypes.includes(eventType)) {
        return false;
      }
    }

    // Filter by symbol pattern (case-insensitive substring match)
    if (filter.symbolPattern && data.symbol) {
      if (
        !data.symbol.toLowerCase().includes(filter.symbolPattern.toLowerCase())
      ) {
        return false;
      }
    }

    return true;
  }

  // ─── Fee Claim Poller ───────────────────────────────────

  private startFeeClaimPoller(): void {
    if (!this.bagsApiKey) {
      this.logger.log(
        'Bags fee claim poller disabled (no BAGS_API_KEY configured)',
      );
      return;
    }

    // Poll every 5 minutes
    const POLL_INTERVAL = 5 * 60 * 1000;
    this.feeClaimTimer = setInterval(() => {
      this.pollClaimablePositions().catch((err) => {
        this.logger.error(`Fee claim poll failed: ${(err as Error).message}`);
      });
    }, POLL_INTERVAL);

    this.logger.log('Bags fee claim poller started (5min interval)');
  }

  private async pollClaimablePositions(): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: { provider: 'bags', isActive: true },
    });

    if (endpoints.length === 0) return;

    // Get unique workspace IDs to poll per-workspace
    const workspaceIds = [...new Set(endpoints.map((ep) => ep.workspaceId))];

    for (const workspaceId of workspaceIds) {
      try {
        // Check if any endpoint in this workspace has a webhook secret
        // (we use it as the wallet address for fee claim queries)
        const wsEndpoints = endpoints.filter(
          (ep) => ep.workspaceId === workspaceId,
        );

        // Use the first endpoint's wallet config from responseBody filter
        for (const endpoint of wsEndpoints) {
          const filter = endpoint.responseBody
            ? (JSON.parse(endpoint.responseBody) as BagsEndpointFilter & {
                walletAddress?: string;
              })
            : null;

          const wallet = filter?.walletAddress;
          if (!wallet) continue;

          const positions = await this.fetchClaimablePositions(wallet);
          if (positions.length === 0) continue;

          const totalClaimable = positions.reduce((sum, p) => {
            const amount = parseInt(
              (p.virtualPoolClaimableAmount as string) || '0',
              10,
            );
            return sum + amount;
          }, 0);

          if (totalClaimable > 0) {
            // Inject as a fee_claim event through the pipeline
            const body: Record<string, unknown> = {
              topic: 'fee_claim_available',
              subject: 'BAGS',
              data: {
                wallet,
                totalClaimableLamports: totalClaimable,
                totalClaimableSol: totalClaimable / 1_000_000_000,
                positions: positions.length,
                positionDetails: positions.slice(0, 10),
              },
              receivedAt: new Date().toISOString(),
            };

            const rawBody = JSON.stringify(body);
            const signature = endpoint.webhookSecret
              ? crypto
                  .createHmac('sha256', endpoint.webhookSecret)
                  .update(rawBody)
                  .digest('hex')
              : '';

            const event = await this.ingressService.capture({
              endpointId: endpoint.id,
              userId: endpoint.userId,
              method: 'POST',
              path: '/bags/fee-claim',
              headers: {
                'content-type': 'application/json',
                'x-bags-signature': signature,
                'x-bags-topic': 'fee_claim_available',
              },
              rawBody,
              body,
              sourceIp: 'bags-fee-poller',
            });

            await this.ingressService.processEvent(event, endpoint);

            // Fire Bags-specific alert
            this.alertingService
              .evaluateBagsFeeClaim(
                workspaceId,
                wallet,
                totalClaimable / 1_000_000_000,
                positions.length,
              )
              .catch((err: unknown) => {
                this.logger.error(
                  `Bags fee claim alert failed: ${(err as Error).message}`,
                );
              });

            this.logger.log(
              `Fee claim available: ${(totalClaimable / 1_000_000_000).toFixed(4)} SOL across ${positions.length} positions for wallet ${wallet.slice(0, 8)}...`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Fee claim poll failed for workspace ${workspaceId}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async fetchClaimablePositions(
    wallet: string,
  ): Promise<Record<string, unknown>[]> {
    try {
      const res = await fetch(
        `${BAGS_API_BASE}/token-launch/claimable-positions?wallet=${wallet}`,
        {
          headers: {
            'x-api-key': this.bagsApiKey,
          },
        },
      );

      if (!res.ok) {
        this.logger.warn(`Bags API claimable-positions returned ${res.status}`);
        return [];
      }

      const data = (await res.json()) as {
        success: boolean;
        response?: Record<string, unknown>[];
      };
      return data.success && Array.isArray(data.response) ? data.response : [];
    } catch (err) {
      this.logger.error(`Bags API call failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ─── Stats Tracking ─────────────────────────────────────

  private trackRecentToken(data: BagsLaunchEvent): void {
    this.stats.recentTokens.unshift({
      mint: data.mint,
      name: data.name,
      symbol: data.symbol,
      creator: data.creator,
      receivedAt: new Date().toISOString(),
    });
    // Keep only last 50
    if (this.stats.recentTokens.length > 50) {
      this.stats.recentTokens = this.stats.recentTokens.slice(0, 50);
    }
  }

  // ─── Public API ─────────────────────────────────────────

  getStatus(): {
    enabled: boolean;
    connected: boolean;
    reconnectAttempts: number;
    stats: BagsStats;
  } {
    return {
      enabled: this.enabled,
      connected: this.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
      stats: this.stats,
    };
  }

  async getEventStats(userId: string): Promise<{
    total: number;
    last24h: number;
    byEventType: Array<{ eventType: string; count: number }>;
  }> {
    const total = await this.eventRepo.count({
      where: { userId, provider: 'bags' },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .andWhere('e.provider = :provider', { provider: 'bags' })
      .andWhere('e.receivedAt > :since', { since })
      .getCount();

    const byEventType = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .where('e.userId = :userId', { userId })
      .andWhere('e.provider = :provider', { provider: 'bags' })
      .groupBy('e.eventType')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany<{ eventType: string; count: string }>();

    return {
      total,
      last24h,
      byEventType: byEventType.map((r) => ({
        eventType: r.eventType || 'unknown',
        count: parseInt(r.count, 10),
      })),
    };
  }
}
