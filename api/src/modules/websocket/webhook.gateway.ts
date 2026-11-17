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
import { WorkspacesService } from '../workspaces/workspaces.service.js';

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

export interface ChaosDeliveryPayload {
  runId: string | null;
  eventId: string;
  chaosKind: string | null;
  chaosSeq: number;
  status: string;
  responseCode: number | null;
}

interface LiveClient {
  userId: string;
  workspaceId: string | null;
}

/** A client named a workspace (API keys always do) only hears that workspace's events. */
export function liveRoom(userId: string, workspaceId: string | null): string {
  return workspaceId
    ? `user:${userId}:workspace:${workspaceId}`
    : `user:${userId}`;
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
    private readonly workspacesService: WorkspacesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const live = await this.authenticate(client);
      if (!live) {
        client.disconnect();
        return;
      }
      void client.join(liveRoom(live.userId, live.workspaceId));
      this.logger.log(
        `Client connected: ${client.id} for user ${live.userId}${live.workspaceId ? ` in workspace ${live.workspaceId}` : ''}`,
      );
    } catch {
      client.disconnect();
    }
  }

  /** JWT from the dashboard, or an API key from the CLI and other tools. */
  private async authenticate(client: Socket): Promise<LiveClient | null> {
    const auth = client.handshake.auth as Record<string, unknown>;
    const apiKey =
      (auth?.apiKey as string | undefined) ??
      (client.handshake.headers?.['x-api-key'] as string | undefined);
    if (apiKey) {
      const key = await this.apiKeysService.validateKey(apiKey);
      if (!key) return null;
      return this.inWorkspace(key.createdByUserId, key.workspaceId);
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
    if (!isTokenCurrent(payload, user)) return null;
    const workspaceId = auth?.workspaceId;
    return typeof workspaceId === 'string' && workspaceId
      ? this.inWorkspace(payload.sub, workspaceId)
      : { userId: payload.sub, workspaceId: null };
  }

  private async inWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<LiveClient | null> {
    return (await this.workspacesService.isMember(workspaceId, userId))
      ? { userId, workspaceId }
      : null;
  }

  private rooms(userId: string, workspaceId: string): string[] {
    return [liveRoom(userId, null), liveRoom(userId, workspaceId)];
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  broadcastWebhook(
    userId: string,
    workspaceId: string,
    payload: BroadcastPayload,
  ) {
    this.server.to(this.rooms(userId, workspaceId)).emit('webhook', payload);
  }

  broadcastForwardResult(
    userId: string,
    workspaceId: string,
    payload: ForwardResultPayload,
  ) {
    this.server
      .to(this.rooms(userId, workspaceId))
      .emit('forward_result', payload);
  }

  /** A delivery shaped by chaos mode, or any delivery of a scenario run's event. */
  broadcastChaosDelivery(
    userId: string,
    workspaceId: string,
    payload: ChaosDeliveryPayload,
  ) {
    this.server
      .to(this.rooms(userId, workspaceId))
      .emit('chaos_delivery', payload);
  }
}
