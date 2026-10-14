import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { BagsService } from './bags.service.js';

@ApiTags('Bags')
@Controller('bags')
@UseGuards(CombinedAuthGuard)
@ApiBearerAuth()
export class BagsController {
  constructor(private readonly bagsService: BagsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Bags Restream connection status and stats' })
  @ApiResponse({
    status: 200,
    description: 'Returns connection status, event stats, and recent tokens',
  })
  getStatus() {
    return this.bagsService.getStatus();
  }

  @Get('events/stats')
  @ApiOperation({ summary: 'Get Bags event stats for current user' })
  @ApiResponse({
    status: 200,
    description: 'Returns total events, last 24h count, and breakdown by type',
  })
  getEventStats(@CurrentUser() user: JwtPayload) {
    return this.bagsService.getEventStats(user.sub);
  }
}
