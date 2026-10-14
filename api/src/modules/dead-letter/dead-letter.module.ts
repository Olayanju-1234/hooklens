import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { EndpointsModule } from '../endpoints/endpoints.module.js';
import { DeadLetterService } from './dead-letter.service.js';
import { DeadLetterController } from './dead-letter.controller.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([DeadLetterEvent]),
    EndpointsModule,
    BullModule.registerQueue({ name: 'webhook-forward' }),
  ],
  controllers: [DeadLetterController],
  providers: [DeadLetterService],
})
export class DeadLetterModule {}
