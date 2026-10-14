import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
export class RetentionModule implements OnModuleInit {
  private readonly logger = new Logger(RetentionModule.name);

  constructor(
    @InjectQueue('retention-cleanup') private readonly retentionQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Upsert keeps a single schedule across restarts
      await this.retentionQueue.upsertJobScheduler(
        'daily-retention',
        { pattern: '0 3 * * *' },
        { name: 'cleanup', opts: { removeOnComplete: true, removeOnFail: 20 } },
      );
      this.logger.log('Scheduled retention cleanup daily at 03:00');
    } catch (err: unknown) {
      this.logger.error(
        `Failed to schedule retention cleanup: ${(err as Error).message}`,
      );
    }
  }
}
