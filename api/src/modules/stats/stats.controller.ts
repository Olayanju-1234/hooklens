import { Controller, Get, Query, Headers, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { StatsService } from './stats.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Stats')
@ApiBearerAuth()
@Controller('stats')
@UseGuards(CombinedAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Get webhook event statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns event statistics for the given period',
  })
  getStats(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Query('period') period?: '24h' | '7d' | '30d' | 'all',
  ) {
    return this.statsService.getStats(user.sub, period ?? '24h', workspaceId);
  }

  @Get('latency')
  @ApiOperation({ summary: 'Get forward latency percentiles' })
  @ApiResponse({ status: 200, description: 'Returns latency percentile data' })
  getLatencyPercentiles(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Query('period') period?: '24h' | '7d' | '30d' | 'all',
  ) {
    return this.statsService.getLatencyPercentiles(
      user.sub,
      period ?? '7d',
      workspaceId,
    );
  }
}
