import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DeadLetterService } from './dead-letter.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@Controller('endpoints/:endpointId/dead-letter')
@UseGuards(AuthGuard('jwt'))
export class DeadLetterController {
  constructor(private readonly deadLetterService: DeadLetterService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
    return this.deadLetterService.list(endpointId, user.sub);
  }

  @Post(':id/retry')
  retry(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deadLetterService.retry(endpointId, id, user.sub);
  }

  @Delete(':id')
  discard(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deadLetterService.discard(endpointId, id, user.sub);
  }
}
