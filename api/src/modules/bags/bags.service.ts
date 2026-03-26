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
import { IngressService } from '../ingress/ingress.service.js';

interface BagsLaunchEvent {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  creator: string;
  initialBuy?: number;
  signature?: string;
  timestamp?: number;
  [key: string]: unknown;
}

interface BagsRestreamMessage {
  channel: string;
  topic: string;
  subject: string;
  data: BagsLaunchEvent;
}

@Injectable()
export class BagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BagsService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 20;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private isShuttingDown = false;
  private readonly enabled: boolean;
  private readonly bagsApiKey: string;
  private readonly wsUrl = 'wss://restream.bags.fm/ws';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    private readonly ingressService: IngressService,
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
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close(1000, 'shutdown');
      this.ws = null;
    }
  }

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

    // Subscribe to all Bags launch events
    const subscribeMsg = JSON.stringify({
      action: 'subscribe',
      topic: 'launchpad_launch',
      subject: 'BAGS',
    });

    this.ws.send(subscribeMsg);
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

  private async handleMessage(raw: Buffer): Promise<void> {
    let msg: BagsRestreamMessage;
    try {
      msg = JSON.parse(raw.toString()) as BagsRestreamMessage;
    } catch {
      this.logger.warn('Bags Restream: received non-JSON message');
      return;
    }

    // Skip control messages (pings, acks, etc.)
    if (!msg.topic || !msg.data) return;

    // Find all active Bags endpoints
    const endpoints = await this.endpointRepo.find({
      where: { provider: 'bags', isActive: true },
    });

    if (endpoints.length === 0) return;

    const body: Record<string, unknown> = {
      topic: msg.topic,
      subject: msg.subject,
      channel: msg.channel,
      data: msg.data,
      receivedAt: new Date().toISOString(),
    };

    const rawBody = JSON.stringify(body);

    // Inject into each Bags endpoint's pipeline
    for (const endpoint of endpoints) {
      try {
        // Sign the payload with HMAC-SHA256 so it flows through our own verification
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
      } catch (err) {
        this.logger.error(
          `Failed to process Bags event for endpoint ${endpoint.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  getStatus(): {
    enabled: boolean;
    connected: boolean;
    reconnectAttempts: number;
  } {
    return {
      enabled: this.enabled,
      connected: this.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
