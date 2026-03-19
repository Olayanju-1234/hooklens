import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyGuard } from './api-key.guard.js';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly logger = new Logger(CombinedAuthGuard.name);
  private readonly jwtGuard: InstanceType<ReturnType<typeof AuthGuard>>;

  constructor(private readonly apiKeyGuard: ApiKeyGuard) {
    const JwtAuthGuard = AuthGuard('jwt');
    this.jwtGuard = new JwtAuthGuard();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Try JWT first
    try {
      const jwtResult = await this.jwtGuard.canActivate(context);
      if (jwtResult) {
        return true;
      }
    } catch {
      // JWT failed, fall through to API key
    }

    // Fall back to API key
    try {
      return await this.apiKeyGuard.canActivate(context);
    } catch (err: unknown) {
      this.logger.warn(
        `Both JWT and API key auth failed: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
