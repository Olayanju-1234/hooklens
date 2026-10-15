import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  Headers,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { EventsService } from './events.service.js';
import type { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { EventsQueryDto } from './dto/events-query.dto.js';
import { LocalDeliveryDto } from './dto/local-delivery.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

const EXPORT_MAX_ROWS = 10_000;
const CSV_COLUMNS = [
  'id',
  'provider',
  'eventType',
  'method',
  'forwardStatus',
  'forwardCode',
  'signatureValid',
  'receivedAt',
] as const satisfies readonly (keyof WebhookEvent)[];

function csvCell(value: string | number | boolean | Date | null): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Cells starting with these are run as formulas by spreadsheet apps
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(CombinedAuthGuard)
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
    if (format !== 'csv' && format !== 'json') {
      throw new BadRequestException('Export format must be csv or json');
    }

    const items: Awaited<ReturnType<EventsService['findAll']>>['items'] = [];
    let cursor = query.cursor;
    do {
      const page = await this.eventsService.findAll(
        user.sub,
        { ...query, cursor, limit: 1000 },
        workspaceId,
      );
      items.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && items.length < EXPORT_MAX_ROWS);

    if (format === 'csv') {
      const csv = [
        CSV_COLUMNS.join(','),
        ...items.map((e) => CSV_COLUMNS.map((h) => csvCell(e[h])).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=events.csv');
      return res.send(csv);
    }

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

  @Post(':id/local-deliveries')
  @ApiOperation({
    summary:
      'Report a delivery made outside Hookdash (e.g. `hookdash listen` to localhost)',
  })
  @ApiResponse({ status: 201, description: 'Delivery recorded' })
  @ApiParam({ name: 'id', type: String })
  recordLocalDelivery(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LocalDeliveryDto,
  ) {
    return this.eventsService.recordLocalDelivery(id, user.sub, dto);
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
