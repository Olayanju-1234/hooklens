import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { isTokenCurrent } from '../auth/strategies/jwt.strategy.js';
import { ApiKeysService } from '../api-keys/api-keys.service.js';

interface BroadcastPayload {
  id: string;
  provider: string | null;
  eventType: string | null;
  signatureValid: boolean | null;
  receivedAt: Date;
  forwardStatus: string;
  method: string;
  path: string;
  bodyPreview: string;
}

interface ForwardResultPayload {
  eventId: string;
  forwardStatus: string;
  forwardCode: number | null;
  forwardLatency: number | null;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/live' })
export class WebhookGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebhookGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const userId = await this.authenticate(client);
      if (!userId) {
        client.disconnect();
        return;
      }
      void client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} for user ${userId}`);
    } catch {
      client.disconnect();
    }
  }

  /** JWT from the dashboard, or an API key from the CLI and other tools. */
  private async authenticate(client: Socket): Promise<string | null> {
    const auth = client.handshake.auth as Record<string, unknown>;
    const apiKey =
      (auth?.apiKey as string | undefined) ??
      (client.handshake.headers?.['x-api-key'] as string | undefined);
    if (apiKey) {
      const key = await this.apiKeysService.validateKey(apiKey);
      return key?.createdByUserId ?? null;
    }

    const token =
      (auth?.token as string | undefined) ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return null;

    const payload = this.jwtService.verify<JwtPayload>(token);
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: { id: true, tokenVersion: true },
    });
    return isTokenCurrent(payload, user) ? payload.sub : null;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastWebhook(userId: string, payload: BroadcastPayload) {
    this.server.to(`user:${userId}`).emit('webhook', payload);
  }

  broadcastForwardResult(userId: string, payload: ForwardResultPayload) {
    this.server.to(`user:${userId}`).emit('forward_result', payload);
  }
}
