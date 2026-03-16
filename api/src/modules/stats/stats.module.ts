import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { StatsService } from './stats.service.js';
import { StatsController } from './stats.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
