import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardProcessor } from './forward.processor.js';
import { WebsocketModule } from '../websocket/websocket.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, Endpoint]),
    BullModule.registerQueue({ name: 'webhook-forward' }),
    HttpModule.register({ timeout: 15_000 }),
    WebsocketModule,
  ],
  providers: [ForwardProcessor],
  exports: [BullModule],
})
export class ForwardModule {}
