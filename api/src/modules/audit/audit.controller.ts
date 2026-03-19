import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from './audit.service.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'), WorkspaceGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @Headers('x-workspace-id') workspaceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
  ) {
    return this.auditService.list(
      workspaceId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
      action,
    );
  }
}
