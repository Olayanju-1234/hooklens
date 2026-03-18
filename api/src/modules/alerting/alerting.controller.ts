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
import { AuthGuard } from '@nestjs/passport';
import { AlertingService } from './alerting.service.js';
import {
  CreateAlertChannelDto,
  UpdateAlertChannelDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
} from './dto/alert.dto.js';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class AlertingController {
  constructor(private readonly alertingService: AlertingService) {}

  // ─── Channels ──────────────────────────────────────────

  @Post('alert-channels')
  createChannel(
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateAlertChannelDto,
  ) {
    return this.alertingService.createChannel(workspaceId, dto);
  }

  @Get('alert-channels')
  listChannels(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listChannels(workspaceId);
  }

  @Patch('alert-channels/:id')
  updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertChannelDto,
  ) {
    return this.alertingService.updateChannel(id, dto);
  }

  @Delete('alert-channels/:id')
  deleteChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertingService.deleteChannel(id);
  }

  @Post('alert-channels/:id/test')
  testChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertingService.testChannel(id);
  }

  // ─── Rules ─────────────────────────────────────────────

  @Post('alert-rules')
  createRule(
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateAlertRuleDto,
  ) {
    return this.alertingService.createRule(workspaceId, dto);
  }

  @Get('alert-rules')
  listRules(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listRules(workspaceId);
  }

  @Patch('alert-rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alertingService.updateRule(id, dto);
  }

  @Delete('alert-rules/:id')
  deleteRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertingService.deleteRule(id);
  }

  // ─── History ───────────────────────────────────────────

  @Get('alert-history')
  listHistory(@Headers('x-workspace-id') workspaceId: string) {
    return this.alertingService.listHistory(workspaceId);
  }
}
