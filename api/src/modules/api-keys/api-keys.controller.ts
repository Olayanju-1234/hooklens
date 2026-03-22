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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service.js';
import { CreateApiKeyDto } from './dto/api-key.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
@UseGuards(AuthGuard('jwt'), WorkspaceGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({ status: 201, description: 'API key created successfully' })
  create(
    @CurrentUser() user: JwtPayload,
    @Headers('x-workspace-id') workspaceId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(workspaceId, user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys in the workspace' })
  @ApiResponse({ status: 200, description: 'Returns list of API keys' })
  list(@Headers('x-workspace-id') workspaceId: string) {
    return this.apiKeysService.list(workspaceId);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 201, description: 'API key revoked successfully' })
  @ApiParam({ name: 'id', type: String })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    return this.apiKeysService.revoke(id, workspaceId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API key' })
  @ApiResponse({ status: 200, description: 'API key deleted successfully' })
  @ApiParam({ name: 'id', type: String })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-workspace-id') workspaceId: string,
  ) {
    return this.apiKeysService.delete(id, workspaceId);
  }
}
