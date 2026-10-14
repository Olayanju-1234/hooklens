import type { Request, Response } from 'express';
import { OAuthStateStore, OAUTH_STATE_TTL_MS } from './oauth-state.store.js';

const SECRET = 'test-jwt-secret';

interface FakeResponse {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
}

function fakeRequest(cookieHeader?: string): {
  req: Request;
  res: FakeResponse;
} {
  const res: FakeResponse = { cookie: jest.fn(), clearCookie: jest.fn() };
  const req = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    res: res as unknown as Response,
  } as unknown as Request;
  return { req, res };
}

function issue(store: OAuthStateStore): { state: string; cookie: string } {
  const { req, res } = fakeRequest();
  let state = '';
  store.store(req, {}, (err, value) => {
    expect(err).toBeNull();
    state = value ?? '';
  });
  const [name, value] = res.cookie.mock.calls[0] as [string, string];
  return { state, cookie: `${name}=${value}` };
}

function verify(
  store: OAuthStateStore,
  cookieHeader: string | undefined,
  state: unknown,
): { ok: boolean; res: FakeResponse } {
  const { req, res } = fakeRequest(cookieHeader);
  let ok: boolean | undefined;
  store.verify(req, state, {}, (err, result) => {
    expect(err).toBeNull();
    ok = result;
  });
  if (ok === undefined) throw new Error('verify callback was not called');
  return { ok, res };
}

describe('OAuthStateStore', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('declares the arities passport-oauth2 uses to pass metadata', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    expect(store.store.length).toBe(3);
    expect(store.verify.length).toBe(4);
  });

  it('sets a short-lived httpOnly lax cookie and returns the nonce as state', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { req, res } = fakeRequest();
    const done = jest.fn();

    store.store(req, {}, done);

    const [err, state] = done.mock.calls[0] as [Error | null, string];
    expect(err).toBeNull();
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [name, value, options] = res.cookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('hookdash_oauth_google');
    expect(value.startsWith(`${state}.`)).toBe(true);
    expect(options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: OAUTH_STATE_TTL_MS,
    });
  });

  it('uses a secure __Host- cookie when the API is served over HTTPS', () => {
    const store = new OAuthStateStore('github', SECRET, true);
    const { req, res } = fakeRequest();

    store.store(req, {}, jest.fn());

    const [name, , options] = res.cookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('__Host-hookdash_oauth_github');
    expect(options.secure).toBe(true);
  });

  it('accepts the state it issued and clears the cookie', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { state, cookie } = issue(store);

    const { ok, res } = verify(store, `other=1; ${cookie}`, state);

    expect(ok).toBe(true);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'hookdash_oauth_google',
      expect.objectContaining({ path: '/' }),
    );
  });

  it('rejects a callback with no state cookie (login CSRF)', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { state } = issue(store);

    expect(verify(store, undefined, state).ok).toBe(false);
  });

  it('rejects a state that does not match the cookie', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { cookie } = issue(store);
    const { state: attackerState } = issue(store);

    expect(verify(store, cookie, attackerState).ok).toBe(false);
  });

  it('rejects a missing or non-string state', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { state, cookie } = issue(store);

    expect(verify(store, cookie, undefined).ok).toBe(false);
    expect(verify(store, cookie, [state]).ok).toBe(false);
  });

  it('rejects a cookie whose nonce was swapped without re-signing', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { cookie } = issue(store);
    const [name, value] = cookie.split('=');
    const [, expiresAt, signature] = value.split('.');
    const forgedNonce = 'A'.repeat(32);

    const forged = `${name}=${forgedNonce}.${expiresAt}.${signature}`;
    expect(verify(store, forged, forgedNonce).ok).toBe(false);
  });

  it('rejects a cookie signed with a different secret', () => {
    const attacker = new OAuthStateStore('google', 'attacker-secret', false);
    const store = new OAuthStateStore('google', SECRET, false);
    const { state, cookie } = issue(attacker);

    expect(verify(store, cookie, state).ok).toBe(false);
  });

  it('rejects a state issued for a different provider', () => {
    const github = new OAuthStateStore('github', SECRET, false);
    const google = new OAuthStateStore('google', SECRET, false);
    const { state, cookie } = issue(github);
    const replayed = cookie.replace(
      'hookdash_oauth_github',
      'hookdash_oauth_google',
    );

    expect(verify(google, replayed, state).ok).toBe(false);
  });

  it('rejects an expired state', () => {
    jest.useFakeTimers();
    const store = new OAuthStateStore('google', SECRET, false);
    const { state, cookie } = issue(store);

    jest.advanceTimersByTime(OAUTH_STATE_TTL_MS + 1);

    expect(verify(store, cookie, state).ok).toBe(false);
  });

  it('rejects malformed cookie values', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const { state } = issue(store);

    for (const value of ['', 'abc', `${state}.notanumber.sig`, 'a.b.c.d']) {
      expect(verify(store, `hookdash_oauth_google=${value}`, state).ok).toBe(
        false,
      );
    }
  });

  it('errors instead of redirecting when there is no response to set the cookie on', () => {
    const store = new OAuthStateStore('google', SECRET, false);
    const req = { headers: {} } as unknown as Request;
    const done = jest.fn();

    store.store(req, {}, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });
});
