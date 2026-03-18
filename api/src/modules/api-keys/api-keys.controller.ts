import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeysService } from './api-keys.service.js';
import { CreateApiKeyDto } from './dto/api-key.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@Controller('api-keys')
@UseGuards(AuthGuard('jwt'))
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(workspaceId, user.sub, dto);
  }

  @Get()
  list(@Headers('x-workspace-id') workspaceId: string) {
    return this.apiKeysService.list(workspaceId);
  }

  @Post(':id/revoke')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    return this.apiKeysService.revoke(id, workspaceId);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    return this.apiKeysService.delete(id, workspaceId);
  }
}
