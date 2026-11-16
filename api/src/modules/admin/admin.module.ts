import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module.js';
import { AdminController } from './admin.controller.js';
import { UsageService } from './usage.service.js';

@Module({
  imports: [AuthModule, HttpModule.register({ timeout: 5000 })],
  controllers: [AdminController],
  providers: [UsageService],
})
export class AdminModule {}
