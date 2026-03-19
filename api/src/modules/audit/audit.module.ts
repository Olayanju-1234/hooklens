import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity.js';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), forwardRef(() => WorkspacesModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
