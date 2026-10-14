import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransformRule } from '../../entities/transform-rule.entity.js';
import { TransformService } from './transform.service.js';
import { TransformController } from './transform.controller.js';
import { EndpointsModule } from '../endpoints/endpoints.module.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([TransformRule]),
    EndpointsModule,
  ],
  controllers: [TransformController],
  providers: [TransformService],
  exports: [TransformService],
})
export class TransformModule {}
