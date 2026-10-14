import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AlertingService } from './alerting.service.js';
import {
  CreateAlertChannelDto,
  UpdateAlertChannelDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
} from './dto/alert.dto.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@ApiTags('Alerting')
@ApiBearerAuth()
@Controller()
@UseGuards(CombinedAuthGuard, WorkspaceGuard)
export class AlertingController {
  constructor(private readonly alertingService: AlertingService) {}

  // ─── Channels ──────────────────────────────────────────

  @Post('alert-channels')
  @ApiOperation({ summary: 'Create a new alert channel' })
  @ApiResponse({
    status: 201,
    description: 'Alert channel created successfully',
  })
  createChannel(
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateAlertChannelDto,
  ) {
    return this.alertingService.createChannel(workspaceId, dto);
  }

  @Get('alert-channels')
  @ApiOperation({ summary: 'List all alert channels in the workspace' })
  @ApiResponse({ status: 200, description: 'Returns list of alert channels' })
  listChannels(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listChannels(workspaceId);
  }

  @Patch('alert-channels/:id')
  @ApiOperation({ summary: 'Update an alert channel' })
  @ApiResponse({
    status: 200,
    description: 'Alert channel updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  updateChannel(
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertChannelDto,
  ) {
    return this.alertingService.updateChannel(workspaceId, id, dto);
  }

  @Delete('alert-channels/:id')
  @ApiOperation({ summary: 'Delete an alert channel' })
  @ApiResponse({
    status: 200,
    description: 'Alert channel deleted successfully',
  })
  @ApiParam({ name: 'id', type: String })
  deleteChannel(
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertingService.deleteChannel(workspaceId, id);
  }

  @Post('alert-channels/:id/test')
  @ApiOperation({ summary: 'Send a test notification to an alert channel' })
  @ApiResponse({
    status: 201,
    description: 'Test notification sent successfully',
  })
  @ApiParam({ name: 'id', type: String })
  testChannel(
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertingService.testChannel(workspaceId, id);
  }

  // ─── Rules ─────────────────────────────────────────────

  @Post('alert-rules')
  @ApiOperation({ summary: 'Create a new alert rule' })
  @ApiResponse({ status: 201, description: 'Alert rule created successfully' })
  createRule(
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alertingService.createRule(workspaceId, dto);
  }

  @Get('alert-rules')
  @ApiOperation({ summary: 'List all alert rules in the workspace' })
  @ApiResponse({ status: 200, description: 'Returns list of alert rules' })
  listRules(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listRules(workspaceId);
  }

  @Patch('alert-rules/:id')
  @ApiOperation({ summary: 'Update an alert rule' })
  @ApiResponse({ status: 200, description: 'Alert rule updated successfully' })
  @ApiParam({ name: 'id', type: String })
  updateRule(
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertingService.updateRule(workspaceId, id, dto);
  }

  @Delete('alert-rules/:id')
  @ApiOperation({ summary: 'Delete an alert rule' })
  @ApiResponse({ status: 200, description: 'Alert rule deleted successfully' })
  @ApiParam({ name: 'id', type: String })
  deleteRule(
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertingService.deleteRule(workspaceId, id);
  }

  // ─── History ───────────────────────────────────────────

  @Get('alert-history')
  @ApiOperation({ summary: 'List alert notification history' })
  @ApiResponse({ status: 200, description: 'Returns alert history entries' })
  listHistory(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listHistory(workspaceId);
  }
}
