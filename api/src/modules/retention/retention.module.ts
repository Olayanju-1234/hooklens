import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { RetentionProcessor } from './retention.processor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, Workspace]),
    BullModule.registerQueue({ name: 'retention-cleanup' }),
  ],
  providers: [RetentionProcessor],
})
export class RetentionModule {}
