import { Endpoint } from '../../entities/endpoint.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';
import { TestPayloadsService } from './test-payloads.service.js';
import { TestPayloadsController } from './test-payloads.controller.js';
import { IngressModule } from '../ingress/ingress.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([User, Endpoint, Workspace]),
    IngressModule,
    WorkspacesModule,
  ],
  controllers: [TestPayloadsController],
  providers: [TestPayloadsService],
  exports: [TestPayloadsService],
})
export class TestPayloadsModule {}
