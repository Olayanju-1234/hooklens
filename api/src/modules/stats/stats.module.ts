import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { StatsService } from './stats.service.js';
import { StatsController } from './stats.controller.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([WebhookEvent]),
    WorkspacesModule,
  ],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
