import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('google.clientId', '');
    const clientSecret = configService.get<string>('google.clientSecret', '');
    const callbackURL = configService.get<string>(
      'google.callbackUrl',
      'https://hookdash-api.onrender.com/api/auth/google/callback',
    );

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { emails?: Array<{ value: string }> },
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('No email found in Google profile'), undefined);
      return;
    }
    done(null, { email });
  }
}
