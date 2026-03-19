import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { EndpointsService } from './endpoints.service.js';
import { EndpointsController } from './endpoints.controller.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Endpoint]),
    AuditModule,
    WorkspacesModule,
  ],
  controllers: [EndpointsController],
  providers: [EndpointsService],
  exports: [EndpointsService],
})
export class EndpointsModule {}
