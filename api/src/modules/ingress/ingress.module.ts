import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { User } from '../../entities/user.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { IngressController } from './ingress.controller.js';
import { IngressService } from './ingress.service.js';
import { SignatureModule } from '../signature/signature.module.js';
import { WebsocketModule } from '../websocket/websocket.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Endpoint, WebhookEvent, Workspace]),
    BullModule.registerQueue({ name: 'webhook-forward' }),
    SignatureModule,
    WebsocketModule,
  ],
  controllers: [IngressController],
  providers: [IngressService],
})
export class IngressModule {}
