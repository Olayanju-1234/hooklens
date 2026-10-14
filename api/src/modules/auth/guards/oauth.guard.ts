import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Type,
  mixin,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

export type OAuthProvider = 'google' | 'github';

export function isOAuthConfigured(
  configService: ConfigService,
  provider: OAuthProvider,
): boolean {
  return Boolean(
    configService.get<string>(`${provider}.clientId`) &&
    configService.get<string>(`${provider}.clientSecret`),
  );
}

export function OAuthGuard(provider: OAuthProvider): Type<CanActivate> {
  @Injectable()
  class MixinOAuthGuard extends AuthGuard(provider) {
    constructor(private readonly configService: ConfigService) {
      super();
    }

    canActivate(context: ExecutionContext) {
      // Unconfigured provider: skip passport so the handler can redirect back with an error
      if (!isOAuthConfigured(this.configService, provider)) return true;
      return super.canActivate(context);
    }

    // Denied consent or provider errors fall through to the handler instead of a raw 401
    handleRequest<TUser>(_err: unknown, user: TUser): TUser {
      return (user || null) as TUser;
    }
  }

  return mixin(MixinOAuthGuard);
}
