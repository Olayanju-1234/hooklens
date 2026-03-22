import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { DeadLetterService } from './dead-letter.service.js';
import { DeadLetterController } from './dead-letter.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeadLetterEvent, Endpoint]),
    BullModule.registerQueue({ name: 'webhook-forward' }),
  ],
  controllers: [DeadLetterController],
  providers: [DeadLetterService],
})
export class DeadLetterModule {}
