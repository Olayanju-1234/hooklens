import { createHmac } from 'crypto';
import {
  forwardableHeaders,
  hookdashSignatureHeaders,
} from './outbound-headers.js';

describe('forwardableHeaders', () => {
  const original = {
    host: 'api.hookdash.ojusentinel.com',
    'content-length': '42',
    'x-forwarded-for': '1.2.3.4',
    authorization: 'Bearer secret',
    cookie: 'a=b',
    'user-agent': 'GitHub-Hookshot/abc',
    'x-github-event': 'push',
    'x-hub-signature-256': 'sha256=abc',
    'x-hookdash-event-id': 'loop',
    'webhook-id': 'msg_1',
    'webhook-timestamp': '1700000000',
    'webhook-signature': 'v1,provider',
  };

  it('keeps provider headers and drops hop-by-hop, proxy and credential headers', () => {
    const out = forwardableHeaders(original, { bodyTransformed: false });
    expect(out).toMatchObject({
      'user-agent': 'GitHub-Hookshot/abc',
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=abc',
    });
    for (const dropped of [
      'host',
      'content-length',
      'x-forwarded-for',
      'authorization',
      'cookie',
      'x-hookdash-event-id',
    ]) {
      expect(out).not.toHaveProperty(dropped);
    }
  });

  it('moves incoming Standard Webhooks headers aside so Hookdash can sign', () => {
    const out = forwardableHeaders(original, { bodyTransformed: false });
    expect(out).not.toHaveProperty('webhook-signature');
    expect(out['x-original-webhook-id']).toBe('msg_1');
    expect(out['x-original-webhook-signature']).toBe('v1,provider');
  });

  it('drops signatures that no longer match a transformed body', () => {
    const out = forwardableHeaders(original, { bodyTransformed: true });
    expect(out).not.toHaveProperty('x-hub-signature-256');
    expect(out).not.toHaveProperty('x-original-webhook-signature');
    expect(out['x-github-event']).toBe('push');
    expect(out['x-original-webhook-id']).toBe('msg_1');
  });
});

describe('hookdashSignatureHeaders', () => {
  it('produces headers a Standard Webhooks verifier accepts', () => {
    const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const body = '{"event":"charge.success"}';
    const now = new Date('2026-10-15T08:00:00Z');
    const headers = hookdashSignatureHeaders(secret, 'evt_123', body, now);

    expect(headers['webhook-id']).toBe('evt_123');
    expect(headers['webhook-timestamp']).toBe(
      String(Math.floor(now.getTime() / 1000)),
    );
    const expected = createHmac(
      'sha256',
      Buffer.from(secret.slice('whsec_'.length), 'base64'),
    )
      .update(`evt_123.${headers['webhook-timestamp']}.${body}`)
      .digest('base64');
    expect(headers['webhook-signature']).toBe(`v1,${expected}`);
  });
});
