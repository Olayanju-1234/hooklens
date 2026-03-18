import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
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
export class AlertingModule {}
