import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { Queue } from 'bullmq';
import { AlertChannel } from '../../entities/alert-channel.entity.js';
import { AlertRule } from '../../entities/alert-rule.entity.js';
import { AlertHistory } from '../../entities/alert-history.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { AlertingController } from './alerting.controller.js';
import { AlertingService } from './alerting.service.js';
import { AlertingProcessor } from './alerting.processor.js';
import { SlackSender } from './channels/slack.sender.js';
import { DiscordSender } from './channels/discord.sender.js';
import { EmailSender } from './channels/email.sender.js';
import { EmailModule } from '../email/email.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import type { AlertCheckJobData } from './alerting.processor.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlertChannel,
      AlertRule,
      AlertHistory,
      WebhookEvent,
    ]),
    BullModule.registerQueue({ name: 'alert-check' }),
    HttpModule.register({ timeout: 10_000 }),
    EmailModule,
    WorkspacesModule,
  ],
  controllers: [AlertingController],
  providers: [
    AlertingService,
    AlertingProcessor,
    SlackSender,
    DiscordSender,
    EmailSender,
  ],
  exports: [AlertingService],
})
export class AlertingModule implements OnModuleInit {
  private readonly logger = new Logger(AlertingModule.name);

  constructor(
    @InjectQueue('alert-check')
    private readonly alertCheckQueue: Queue<AlertCheckJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.alertCheckQueue.add(
        'scheduled_no_events',
        { type: 'scheduled_no_events' },
        {
          repeat: { every: 5 * 60 * 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(
        'Registered repeatable alert-check job: scheduled_no_events (every 5 minutes)',
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to register scheduled_no_events job: ${(err as Error).message}`,
      );
    }
  }
}
