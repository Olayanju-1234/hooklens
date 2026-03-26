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
import { AuthGuard } from '@nestjs/passport';
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
  TransformOperationDto,
} from './dto/transform.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

interface TestTransformBody {
  operations: TransformOperationDto[];
  body: Record<string, unknown>;
}

@ApiTags('Transforms')
@ApiBearerAuth()
@Controller('endpoints/:endpointId/transforms')
@UseGuards(AuthGuard('jwt'))
export class TransformController {
  constructor(private readonly transformService: TransformService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transform rule for an endpoint' })
  @ApiResponse({
    status: 201,
    description: 'Transform rule created successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  create(
    @CurrentUser() _user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Body() dto: CreateTransformRuleDto,
  ) {
    return this.transformService.create(endpointId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all transform rules for an endpoint' })
  @ApiResponse({ status: 200, description: 'Returns list of transform rules' })
  @ApiParam({ name: 'endpointId', type: String })
  findAll(
    @CurrentUser() _user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
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
  update(
    @CurrentUser() _user: JwtPayload,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateTransformRuleDto,
  ) {
    return this.transformService.update(ruleId, dto);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a transform rule' })
  @ApiResponse({
    status: 200,
    description: 'Transform rule deleted successfully',
  })
  @ApiParam({ name: 'endpointId', type: String })
  @ApiParam({ name: 'ruleId', type: String })
  remove(
    @CurrentUser() _user: JwtPayload,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    return this.transformService.remove(ruleId);
  }

  @Post('test')
  @ApiOperation({ summary: 'Test transform operations against a payload' })
  @ApiResponse({ status: 201, description: 'Returns the transformed payload' })
  @ApiParam({ name: 'endpointId', type: String })
  testTransform(
    @CurrentUser() _user: JwtPayload,
    @Body() payload: TestTransformBody,
  ) {
    return this.transformService.testTransform(
      payload.operations,
      payload.body,
    );
  }
}
