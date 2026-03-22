import { Controller, Get, Query, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StatsService } from './stats.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@Controller('stats')
@UseGuards(AuthGuard('jwt'))
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  getStats(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Query('period') period?: '24h' | '7d' | '30d' | 'all',
  ) {
    return this.statsService.getStats(user.sub, period ?? '24h', workspaceId);
  }

  @Get('latency')
  getLatencyPercentiles(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Query('period') period?: '24h' | '7d' | '30d' | 'all',
  ) {
    return this.statsService.getLatencyPercentiles(user.sub, period ?? '7d', workspaceId);
  }
}
