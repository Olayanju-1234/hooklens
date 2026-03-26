import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { IngressModule } from '../ingress/ingress.module.js';
import { AlertingModule } from '../alerting/alerting.module.js';
import { BagsService } from './bags.service.js';
import { BagsController } from './bags.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Endpoint, WebhookEvent]),
    IngressModule,
    AlertingModule,
  ],
  controllers: [BagsController],
  providers: [BagsService],
  exports: [BagsService],
})
export class BagsModule {}
