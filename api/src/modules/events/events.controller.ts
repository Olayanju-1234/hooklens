import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { EventsService } from './events.service.js';
import { EventsQueryDto } from './dto/events-query.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@Controller('events')
@UseGuards(AuthGuard('jwt'))
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: EventsQueryDto) {
    return this.eventsService.findAll(user.sub, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.findOne(id, user.sub);
  }

  @Get(':id/timeline')
  getTimeline(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.getTimeline(id, user.sub);
  }

  @Get(':id/diff/:otherId')
  diff(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('otherId', ParseUUIDPipe) otherId: string,
  ) {
    return this.eventsService.diff(id, otherId, user.sub);
  }

  @Post(':id/replay')
  replay(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.replay(id, user.sub);
  }

  @Get('export/:format')
  async exportEvents(
    @CurrentUser() user: JwtPayload,
    @Param('format') format: string,
    @Query() query: EventsQueryDto,
    @Res() res: Response,
  ) {
    const { items } = await this.eventsService.findAll(user.sub, {
      ...query,
      limit: 1000,
    });

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
}
