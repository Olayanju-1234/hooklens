import * as crypto from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { OAuthProvider } from '../guards/oauth.guard.js';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  info?: { message: string },
) => void;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// passport-oauth2 state store without express-session: the nonce rides in a signed, httpOnly cookie
export class OAuthStateStore {
  readonly cookieName: string;
  private readonly key: Buffer;

  constructor(
    private readonly provider: OAuthProvider,
    secret: string,
    private readonly secure: boolean,
  ) {
    this.key = crypto
      .createHmac('sha256', secret)
      .update('oauth-state')
      .digest();
    // __Host- stops sibling subdomains planting the cookie; browsers only honour it over HTTPS
    this.cookieName = `${secure ? '__Host-' : ''}hookdash_oauth_${provider}`;
  }

  static fromConfig(
    provider: OAuthProvider,
    configService: ConfigService,
  ): OAuthStateStore {
    return new OAuthStateStore(
      provider,
      configService.getOrThrow<string>('jwt.secret'),
      configService.get<string>('apiUrl', '').startsWith('https://'),
    );
  }

  // Arity matters: passport-oauth2 picks the call signature from Function.length
  store(req: Request, metaOrCallback: unknown, callback?: StoreCallback): void {
    const done = (callback ?? metaOrCallback) as StoreCallback;
    if (!req.res) {
      done(new Error('OAuth state cookie cannot be set without a response'));
      return;
    }
    const nonce = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
    req.res.cookie(
      this.cookieName,
      `${nonce}.${expiresAt}.${this.sign(nonce, expiresAt)}`,
      {
        httpOnly: true,
        secure: this.secure,
        // Lax still sends it on the provider's top-level redirect back to us
        sameSite: 'lax',
        path: '/',
        maxAge: OAUTH_STATE_TTL_MS,
      },
    );
    done(null, nonce);
  }

  verify(
    req: Request,
    state: unknown,
    metaOrCallback: unknown,
    callback?: VerifyCallback,
  ): void {
    const done = (callback ?? metaOrCallback) as VerifyCallback;
    const cookie = readCookie(req, this.cookieName);
    req.res?.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
    });
    if (typeof state !== 'string' || !cookie || !this.isValid(cookie, state)) {
      done(null, false, { message: 'Invalid or expired OAuth state' });
      return;
    }
    done(null, true);
  }

  private isValid(cookie: string, state: string): boolean {
    const [nonce, expiresAtRaw, signature, ...rest] = cookie.split('.');
    if (rest.length || !nonce || !expiresAtRaw || !signature) return false;
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) {
      return false;
    }
    return (
      safeEqual(signature, this.sign(nonce, expiresAt)) &&
      safeEqual(nonce, state)
    );
  }

  private sign(nonce: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.key)
      .update(`${this.provider}.${nonce}.${expiresAt}`)
      .digest('base64url');
  }
}
