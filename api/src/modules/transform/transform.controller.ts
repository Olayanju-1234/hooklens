import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/guards/auth.guard.js';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TransformService } from './transform.service.js';
import {
  CreateTransformRuleDto,
  UpdateTransformRuleDto,
  TestTransformDto,
} from './dto/transform.dto.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Transforms')
@ApiBearerAuth()
@Controller('endpoints/:endpointId/transforms')
@UseGuards(CombinedAuthGuard)
export class TransformController {
  constructor(
    private readonly transformService: TransformService,
    private readonly endpointsService: EndpointsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transform rule for an endpoint' })
  @ApiResponse({
    status: 201,
    description: 'Transform rule created successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Body() dto: CreateTransformRuleDto,
  ) {
    await this.endpointsService.findOne(endpointId, user.sub);
    return this.transformService.create(endpointId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all transform rules for an endpoint' })
  @ApiResponse({ status: 200, description: 'Returns list of transform rules' })
  @ApiParam({ name: 'endpointId', type: String })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
    await this.endpointsService.findOne(endpointId, user.sub);
    return this.transformService.findByEndpoint(endpointId);
  }

  @Patch(':ruleId')
  @ApiOperation({ summary: 'Update a transform rule' })
  @ApiResponse({
    status: 200,
    description: 'Transform rule updated successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  @ApiParam({ name: 'ruleId', type: String })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateTransformRuleDto,
  ) {
    await this.endpointsService.findOne(endpointId, user.sub);
    return this.transformService.update(endpointId, ruleId, dto);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a transform rule' })
  @ApiResponse({
    status: 200,
    description: 'Transform rule deleted successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  @ApiParam({ name: 'ruleId', type: String })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    await this.endpointsService.findOne(endpointId, user.sub);
    await this.transformService.remove(endpointId, ruleId);
    return { success: true };
  }

  @Post('test')
  @ApiOperation({ summary: 'Test transform operations against a payload' })
  @ApiResponse({ status: 201, description: 'Returns the transformed payload' })
  @ApiParam({ name: 'endpointId', type: String })
  testTransform(@Body() payload: TestTransformDto) {
    return this.transformService.testTransform(
      payload.operations,
      payload.body,
    );
  }
}
