import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { ChaosService } from './chaos.service.js';
import { UpdateChaosDto } from './dto/chaos.dto.js';

const TARGET_PARAM = {
  name: 'target',
  type: String,
  description: 'A destination id, or `fallback` for the endpoint forward URL',
};

@ApiTags('Chaos')
@ApiBearerAuth()
@Controller('endpoints/:id/chaos')
@UseGuards(CombinedAuthGuard, WorkspaceGuard)
export class ChaosController {
  constructor(private readonly chaosService: ChaosService) {}

  @Get()
  @ApiOperation({
    summary: 'List delivery targets with their chaos settings',
  })
  @ApiParam({ name: 'id', type: String })
  list(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chaosService.list(id, user.sub, workspaceId);
  }

  @Put(':target')
  @ApiOperation({
    summary:
      'Set chaos for one delivery target: duplicates, delays, reordering and stale replays',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiParam(TARGET_PARAM)
  @ApiResponse({ status: 403, description: 'Scope `all` needs the owner' })
  upsert(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('target') target: string,
    @Body() dto: UpdateChaosDto,
  ) {
    return this.chaosService.upsert(id, target, user.sub, dto, workspaceId);
  }

  @Delete(':target')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Switch chaos off for one delivery target' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam(TARGET_PARAM)
  disable(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('target') target: string,
  ) {
    return this.chaosService.disable(id, target, user.sub, workspaceId);
  }
}
