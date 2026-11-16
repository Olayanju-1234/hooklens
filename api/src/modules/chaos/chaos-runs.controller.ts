import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { ChaosService } from './chaos.service.js';
import { ChaosRunsService } from './chaos-runs.service.js';
import { RunScenarioDto } from './dto/run-scenario.dto.js';

@ApiTags('Chaos')
@ApiBearerAuth()
@Controller('chaos')
@UseGuards(CombinedAuthGuard, WorkspaceGuard)
export class ChaosRunsController {
  constructor(
    private readonly chaosService: ChaosService,
    private readonly runsService: ChaosRunsService,
  ) {}

  @Get('scenarios')
  @ApiOperation({
    summary: 'Scripted chaos scenarios built from the test-payload templates',
  })
  scenarios() {
    return this.runsService.listScenarios();
  }

  @Post('scenarios/:id/run')
  @ApiOperation({
    summary:
      'Run a scenario against one delivery target; fetch the result with GET /chaos/runs/:runId',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 429, description: 'Run or chaos limit reached' })
  run(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RunScenarioDto,
  ) {
    return this.runsService.run(id, dto.endpointId, dto.target, user.sub);
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent scenario runs for a route' })
  @ApiQuery({ name: 'endpointId', type: String })
  runs(
    @CurrentUser() user: JwtPayload,
    @Query('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
    return this.runsService.listRuns(endpointId, user.sub);
  }

  @Get('runs/:runId')
  @ApiOperation({
    summary:
      'A run with every delivery: chaos kind, response code, latency and body excerpt',
  })
  @ApiParam({ name: 'runId', type: String })
  getRun(
    @CurrentUser() user: JwtPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.runsService.getRun(runId, user.sub);
  }

  @Get('active')
  @ApiOperation({ summary: 'Chaos that is on right now in this workspace' })
  active(@Headers('x-workspace-id') workspaceId: string) {
    return this.chaosService.activeInWorkspace(workspaceId);
  }
}
