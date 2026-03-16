import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

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

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const authToken = (client.handshake.auth as Record<string, unknown>)
        ?.token as string | undefined;
      const headerToken = client.handshake.headers?.authorization?.replace(
        'Bearer ',
        '',
      );
      const token = authToken ?? headerToken;

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as unknown;
      const userId = (payload as { sub: string }).sub;
      void client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} for user ${userId}`);
    } catch {
      client.disconnect();
    }
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
