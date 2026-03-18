import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransformRule } from '../../entities/transform-rule.entity.js';
import { TransformService } from './transform.service.js';
import { TransformController } from './transform.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([TransformRule])],
  controllers: [TransformController],
  providers: [TransformService],
  exports: [TransformService],
})
export class TransformModule {}
