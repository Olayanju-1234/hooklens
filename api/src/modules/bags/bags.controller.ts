import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BagsService } from './bags.service.js';

@ApiTags('Bags')
@Controller('bags')
export class BagsController {
  constructor(private readonly bagsService: BagsService) {}

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Bags Restream connection status' })
  @ApiResponse({
    status: 200,
    description: 'Returns Bags Restream connection status',
  })
  getStatus() {
    return this.bagsService.getStatus();
  }
}
