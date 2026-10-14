import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([WebhookEvent, Endpoint, ForwardResult]),
    BullModule.registerQueue({ name: 'webhook-forward' }),
    WorkspacesModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
