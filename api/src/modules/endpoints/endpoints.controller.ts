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
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EndpointsService } from './endpoints.service.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@Controller('endpoints')
@UseGuards(AuthGuard('jwt'), WorkspaceGuard)
export class EndpointsController {
  private readonly logger = new Logger(EndpointsController.name);

  constructor(
    private readonly endpointsService: EndpointsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateEndpointDto,
  ) {
    const endpoint = await this.endpointsService.create(
      user.sub,
      dto,
      workspaceId,
    );
    this.auditService
      .log({
        workspaceId,
        userId: user.sub,
        action: 'endpoint.create',
        resource: 'endpoint',
        resourceId: endpoint.id,
        metadata: { name: dto.name, provider: dto.provider },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for endpoint.create: ${(err as Error).message}`,
        );
      });
    return endpoint;
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
  async update(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEndpointDto,
  ) {
    const endpoint = await this.endpointsService.update(id, user.sub, dto);
    this.auditService
      .log({
        workspaceId,
        userId: user.sub,
        action: 'endpoint.update',
        resource: 'endpoint',
        resourceId: id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for endpoint.update: ${(err as Error).message}`,
        );
      });
    return endpoint;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.endpointsService.remove(id, user.sub);
    this.auditService
      .log({
        workspaceId,
        userId: user.sub,
        action: 'endpoint.delete',
        resource: 'endpoint',
        resourceId: id,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Audit log failed for endpoint.delete: ${(err as Error).message}`,
        );
      });
  }
}
