import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkspacesService } from '../workspaces.service.js';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator.js';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceGuard.name);

  constructor(private readonly workspacesService: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      return false;
    }

    const workspaceId = request.headers['x-workspace-id'] as string | undefined;

    if (!workspaceId) {
      return false;
    }

    try {
      await this.workspacesService.assertMembership(workspaceId, user.sub);
      return true;
    } catch {
      this.logger.warn(
        `Workspace access denied: user ${user.sub} for workspace ${workspaceId}`,
      );
      return false;
    }
  }
}
