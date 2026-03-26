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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DeadLetterService } from './dead-letter.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Dead Letter')
@ApiBearerAuth()
@Controller('endpoints/:endpointId/dead-letter')
@UseGuards(AuthGuard('jwt'))
export class DeadLetterController {
  constructor(private readonly deadLetterService: DeadLetterService) {}

  @Get()
  @ApiOperation({ summary: 'List dead letter entries for an endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of dead letter entries',
  })
  @ApiParam({ name: 'endpointId', type: String })
  list(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
    return this.deadLetterService.list(endpointId, user.sub);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a dead letter entry' })
  @ApiResponse({
    status: 201,
    description: 'Dead letter entry retried successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  @ApiParam({ name: 'id', type: String })
  retry(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deadLetterService.retry(endpointId, id, user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Discard a dead letter entry' })
  @ApiResponse({
    status: 200,
    description: 'Dead letter entry discarded successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  @ApiParam({ name: 'id', type: String })
  discard(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deadLetterService.discard(endpointId, id, user.sub);
  }
}
