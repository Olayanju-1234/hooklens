import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { UsageService } from './usage.service.js';

/** Signed-in admins only (no API keys); anyone else gets a plain 404. */
@ApiExcludeController()
@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private readonly usageService: UsageService) {}

  @Get('usage')
  async usage(@CurrentUser() user: JwtPayload) {
    if (!(await this.usageService.isAdmin(user.sub))) {
      throw new NotFoundException();
    }
    return this.usageService.report();
  }
}
