import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EndpointsService } from './endpoints.service.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@Controller('endpoints')
@UseGuards(AuthGuard('jwt'))
export class EndpointsController {
  constructor(private readonly endpointsService: EndpointsService) {}

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateEndpointDto,
  ) {
    return this.endpointsService.create(user.sub, dto, workspaceId);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.endpointsService.findAllByUser(user.sub);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.endpointsService.findOne(id, user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEndpointDto,
  ) {
    return this.endpointsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.endpointsService.remove(id, user.sub);
  }
}
