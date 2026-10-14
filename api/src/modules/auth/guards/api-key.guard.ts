import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    if (!apiKeyHeader) {
      return false;
    }

    try {
      const apiKey = await this.apiKeysService.validateKey(apiKeyHeader);
      if (!apiKey) {
        return false;
      }

      request.user = {
        sub: apiKey.createdByUserId,
        email: '',
      };

      // A key only ever acts in its own workspace, whatever header the caller sends
      request.headers['x-workspace-id'] = apiKey.workspaceId;

      return true;
    } catch (err: unknown) {
      this.logger.error(`API key validation failed: ${(err as Error).message}`);
      return false;
    }
  }
}
