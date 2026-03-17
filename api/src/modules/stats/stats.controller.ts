import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
    @Query('period') period?: '24h' | '7d' | '30d' | 'all',
  ) {
    return this.statsService.getStats(user.sub, period ?? '24h');
  }
}
