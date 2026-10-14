import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { OAuthStateStore } from './oauth-state.store.js';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('github.clientId', '');
    const clientSecret = configService.get<string>('github.clientSecret', '');
    const callbackURL = configService.get<string>('github.callbackUrl', '');

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['user:email'],
      store: OAuthStateStore.fromConfig('github', configService),
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { emails?: Array<{ value: string }> },
    done: (err: Error | null, user?: { email: string }) => void,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('No email found in GitHub profile'));
      return;
    }
    done(null, { email });
  }
}
