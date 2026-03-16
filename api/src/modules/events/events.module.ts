import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, Endpoint]),
    BullModule.registerQueue({ name: 'webhook-forward' }),
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
