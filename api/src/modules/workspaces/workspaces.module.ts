import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../../entities/workspace.entity.js';
import { WorkspaceMember } from '../../entities/workspace-member.entity.js';
import { WorkspaceInvite } from '../../entities/workspace-invite.entity.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';
import { WorkspaceGuard } from './guards/workspace.guard.js';
import { EmailModule } from '../email/email.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, WorkspaceInvite]),
    EmailModule,
    forwardRef(() => AuditModule),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceGuard],
  exports: [WorkspacesService, WorkspaceGuard],
})
export class WorkspacesModule {}
