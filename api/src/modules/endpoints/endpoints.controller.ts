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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { EndpointsService } from './endpoints.service.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import {
  CreateDestinationDto,
  UpdateDestinationDto,
} from './dto/destination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@ApiTags('Endpoints')
@ApiBearerAuth()
@Controller('endpoints')
@UseGuards(CombinedAuthGuard, WorkspaceGuard)
export class EndpointsController {
  private readonly logger = new Logger(EndpointsController.name);

  constructor(
    private readonly endpointsService: EndpointsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Endpoint created successfully' })
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
  @ApiOperation({ summary: 'List all endpoints in the workspace' })
  @ApiResponse({ status: 200, description: 'Returns list of endpoints' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    return this.endpointsService.findAllByUser(user.sub, workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single endpoint by ID' })
  @ApiResponse({ status: 200, description: 'Returns the endpoint' })
  @ApiParam({ name: 'id', type: String })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.endpointsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an endpoint' })
  @ApiResponse({ status: 200, description: 'Endpoint updated successfully' })
  @ApiParam({ name: 'id', type: String })
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
  @ApiOperation({ summary: 'Delete an endpoint' })
  @ApiResponse({ status: 200, description: 'Endpoint deleted successfully' })
  @ApiParam({ name: 'id', type: String })
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

  // ── Destinations ────────────────────────────────────────────────────────────

  @Get(':id/destinations')
  @ApiOperation({ summary: 'List all forward destinations for an endpoint' })
  getDestinations(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.endpointsService.getDestinations(id, user.sub);
  }

  @Post(':id/destinations')
  @ApiOperation({ summary: 'Add a forward destination to an endpoint' })
  addDestination(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDestinationDto,
  ) {
    return this.endpointsService.addDestination(id, user.sub, dto);
  }

  @Patch(':id/destinations/:destinationId')
  @ApiOperation({ summary: 'Update a forward destination' })
  updateDestination(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.endpointsService.updateDestination(
      id,
      destinationId,
      user.sub,
      dto,
    );
  }

  @Delete(':id/destinations/:destinationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a forward destination' })
  removeDestination(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('destinationId', ParseUUIDPipe) destinationId: string,
  ) {
    return this.endpointsService.removeDestination(id, destinationId, user.sub);
  }
}
