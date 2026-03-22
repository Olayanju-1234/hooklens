import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuditService } from './audit.service.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'), WorkspaceGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries for the workspace' })
  @ApiResponse({ status: 200, description: 'Returns paginated audit log entries' })
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
