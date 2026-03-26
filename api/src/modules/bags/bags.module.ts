import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { IngressModule } from '../ingress/ingress.module.js';
import { BagsService } from './bags.service.js';
import { BagsController } from './bags.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Endpoint]), IngressModule],
  controllers: [BagsController],
  providers: [BagsService],
  exports: [BagsService],
})
export class BagsModule {}
