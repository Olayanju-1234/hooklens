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

@Controller('endpoints/:endpointId/transforms')
@UseGuards(AuthGuard('jwt'))
export class TransformController {
  constructor(private readonly transformService: TransformService) {}

  @Post()
  create(
    @CurrentUser() _user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Body() dto: CreateTransformRuleDto,
  ) {
    return this.transformService.create(endpointId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() _user: JwtPayload,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
  ) {
    return this.transformService.findByEndpoint(endpointId);
  }

  @Patch(':ruleId')
  update(
    @CurrentUser() _user: JwtPayload,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateTransformRuleDto,
  ) {
    return this.transformService.update(ruleId, dto);
  }

  @Delete(':ruleId')
  remove(
    @CurrentUser() _user: JwtPayload,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    return this.transformService.remove(ruleId);
  }

  @Post('test')
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
