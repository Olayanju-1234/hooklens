import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  Headers,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { EventsService } from './events.service.js';
import { EventsQueryDto } from './dto/events-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(AuthGuard('jwt'))
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List all webhook events with optional filters' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of events' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Query() query: EventsQueryDto,
  ) {
    return this.eventsService.findAll(user.sub, query, workspaceId);
  }

  // Static routes MUST come before parameterized :id routes
  @Get('export/:format')
  @ApiOperation({ summary: 'Export events as CSV or JSON' })
  @ApiResponse({ status: 200, description: 'Returns exported events file' })
  @ApiParam({ name: 'format', type: String })
  async exportEvents(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string | undefined,
    @Param('format') format: string,
    @Query() query: EventsQueryDto,
    @Res() res: Response,
  ) {
    const { items } = await this.eventsService.findAll(
      user.sub,
      { ...query, limit: 1000 },
      workspaceId,
    );

    if (format === 'csv') {
      const headers = [
        'id',
        'provider',
        'eventType',
        'method',
        'forwardStatus',
        'forwardCode',
        'signatureValid',
        'receivedAt',
      ];
      const csv = [
        headers.join(','),
        ...items.map((e) =>
          headers
            .map((h) => {
              const val = e[h as keyof typeof e] as
                | string
                | number
                | boolean
                | null
                | undefined;
              return val === null || val === undefined ? '' : String(val);
            })
            .join(','),
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=events.csv');
      return res.send(csv);
    }

    // Default: JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=events.json');
    return res.json(items);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single event by ID' })
  @ApiResponse({ status: 200, description: 'Returns the event details' })
  @ApiParam({ name: 'id', type: String })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.findOne(id, user.sub);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get the delivery timeline for an event' })
  @ApiResponse({ status: 200, description: 'Returns the event timeline' })
  @ApiParam({ name: 'id', type: String })
  getTimeline(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.getTimeline(id, user.sub);
  }

  @Get(':id/diff/:otherId')
  @ApiOperation({ summary: 'Compare two events and return their diff' })
  @ApiResponse({
    status: 200,
    description: 'Returns the diff between two events',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'otherId', type: String })
  diff(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('otherId', ParseUUIDPipe) otherId: string,
  ) {
    return this.eventsService.diff(id, otherId, user.sub);
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay an event to the forward destination' })
  @ApiResponse({ status: 201, description: 'Event replayed successfully' })
  @ApiParam({ name: 'id', type: String })
  replay(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.replay(id, user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event' })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiParam({ name: 'id', type: String })
  delete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.delete(id, user.sub);
  }
}
