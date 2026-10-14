import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { EndpointsService } from './endpoints.service.js';
import { EndpointsController } from './endpoints.controller.js';
import { AuditModule } from '../audit/audit.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Endpoint, ForwardDestination]),
    AuditModule,
    WorkspacesModule,
  ],
  controllers: [EndpointsController],
  providers: [EndpointsService],
  exports: [EndpointsService],
})
export class EndpointsModule {}
