import * as crypto from 'crypto';
import { SignatureService } from './signature.service.js';
import { RECIPES } from './recipes.js';
import { PROVIDERS } from '../../entities/endpoint.entity.js';

type Headers = Record<string, string>;

interface Case {
  provider: string;
  secret: string;
  wrongSecret: string;
  /** Builds the delivered body when the provider puts the send time in it. */
  body?: (nowSeconds: number) => string;
  /** Signs independently of the recipe engine, following the provider's docs. */
  sign: (body: string, secret: string, nowSeconds: number) => Headers;
  toleranceSeconds?: number;
  bodySigned: boolean;
}

const NOW = 1_760_000_000_000;
const NOW_SECONDS = NOW / 1000;
const BODY =
  '{"type":"user.created","event":"charge.success","data":{"id":42}}';
const INGRESS_URL = 'https://api.hookdash.test/in/src_0123456789abcdef01234567';

const hmac = (
  algorithm: string,
  key: string | Buffer,
  payload: string,
  encoding: 'hex' | 'base64',
) => crypto.createHmac(algorithm, key).update(payload).digest(encoding);

const sha256Hex = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const whsecKey = (secret: string) =>
  Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

const standardWebhooks =
  (prefix: 'webhook' | 'svix') =>
  (body: string, secret: string, now: number): Headers => {
    const id = 'msg_2abc';
    return {
      [`${prefix}-id`]: id,
      [`${prefix}-timestamp`]: String(now),
      [`${prefix}-signature`]: `v1,${hmac('sha256', whsecKey(secret), `${id}.${now}.${body}`, 'base64')}`,
    };
  };

const slack = (body: string, secret: string, now: number): Headers => ({
  'x-slack-request-timestamp': String(now),
  'x-slack-signature': `v0=${hmac('sha256', secret, `v0:${now}:${body}`, 'hex')}`,
});

const linearBody = (nowSeconds: number) =>
  `{"action":"create","type":"Issue","data":{"id":42},"webhookTimestamp":${nowSeconds * 1000}}`;

// As twilio-node's getExpectedTwilioSignature: the URL, then each param name + value in name order
const twilioSignature = (token: string, url: string, form: string) => {
  const params = Object.fromEntries(new URLSearchParams(form));
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, name) => acc + name + params[name], url);
  return hmac('sha1', token, payload, 'base64');
};

const TWILIO_FORM =
  'To=%2B18005551212&From=%2B14158675309&Body=Order+42+shipped&MessageSid=SM123';
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' };

const WHSEC = `whsec_${Buffer.from('standard-webhooks-test-secret').toString('base64')}`;
const WRONG_WHSEC = `whsec_${Buffer.from('another-secret-entirely').toString('base64')}`;

const CASES: Case[] = [
  {
    provider: 'stripe',
    secret: 'whsec_stripe_test',
    wrongSecret: 'whsec_stripe_wrong',
    sign: (body, secret, now) => ({
      'stripe-signature': `t=${now},v1=${hmac('sha256', secret, `${now}.${body}`, 'hex')}`,
    }),
    toleranceSeconds: 300,
    bodySigned: true,
  },
  {
    provider: 'paystack',
    secret: 'sk_test_paystack',
    wrongSecret: 'sk_test_wrong',
    sign: (body, secret) => ({
      'x-paystack-signature': hmac('sha512', secret, body, 'hex'),
    }),
    bodySigned: true,
  },
  {
    provider: 'flutterwave',
    secret: 'flw_verif_hash',
    wrongSecret: 'flw_wrong_hash',
    sign: (_body, secret) => ({ 'verif-hash': secret }),
    bodySigned: false,
  },
  {
    provider: 'mono',
    secret: 'mono_webhook_secret',
    wrongSecret: 'mono_wrong_secret',
    sign: (_body, secret) => ({ 'mono-webhook-secret': secret }),
    bodySigned: false,
  },
  {
    provider: 'bags',
    secret: 'bags_secret',
    wrongSecret: 'bags_wrong',
    sign: (body, secret) => ({
      'x-bags-signature': hmac('sha256', secret, body, 'hex'),
    }),
    bodySigned: true,
  },
  {
    provider: 'github',
    secret: 'gh_secret',
    wrongSecret: 'gh_wrong',
    sign: (body, secret) => ({
      'x-github-event': 'push',
      'x-hub-signature-256': `sha256=${hmac('sha256', secret, body, 'hex')}`,
    }),
    bodySigned: true,
  },
  {
    provider: 'shopify',
    secret: 'shpss_client_secret',
    wrongSecret: 'shpss_wrong',
    sign: (body, secret) => ({
      'x-shopify-hmac-sha256': hmac('sha256', secret, body, 'base64'),
    }),
    bodySigned: true,
  },
  {
    provider: 'slack',
    secret: 'slack_signing_secret',
    wrongSecret: 'slack_wrong_secret',
    sign: slack,
    toleranceSeconds: 300,
    bodySigned: true,
  },
  {
    provider: 'linear',
    secret: 'lin_wh_signing_secret',
    wrongSecret: 'lin_wh_wrong_secret',
    body: linearBody,
    sign: (body, secret) => ({
      'linear-signature': hmac('sha256', secret, body, 'hex'),
    }),
    toleranceSeconds: 60,
    bodySigned: true,
  },
  {
    provider: 'twilio',
    secret: 'twilio_auth_token',
    wrongSecret: 'twilio_wrong_token',
    body: () => TWILIO_FORM,
    sign: (body, secret) => ({
      ...FORM_HEADERS,
      'x-twilio-signature': twilioSignature(secret, INGRESS_URL, body),
    }),
    bodySigned: true,
  },
  ...(['standard-webhooks', 'clerk', 'resend', 'openai'] as const).flatMap(
    (provider) =>
      (['webhook', 'svix'] as const).map((prefix) => ({
        provider,
        secret: WHSEC,
        wrongSecret: WRONG_WHSEC,
        sign: standardWebhooks(prefix),
        toleranceSeconds: 300,
        bodySigned: true,
      })),
  ),
  {
    provider: 'custom',
    secret: 'custom_secret',
    wrongSecret: 'custom_wrong',
    sign: (body, secret) => ({
      'x-webhook-signature': hmac('sha256', secret, body, 'hex'),
    }),
    bodySigned: true,
  },
];

describe('verification recipes', () => {
  let service: SignatureService;

  beforeEach(() => {
    service = new SignatureService();
  });

  const verify = (
    provider: string,
    headers: Headers,
    rawBody: string,
    secret: string,
    now = NOW,
    urls = [INGRESS_URL],
  ) => service.verifyRequest(provider, { headers, rawBody, urls }, secret, now);

  it('has a recipe and a test case for every provider', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...PROVIDERS].sort());
    expect(new Set(CASES.map((c) => c.provider))).toEqual(new Set(PROVIDERS));
  });

  describe.each(CASES)('$provider', (c) => {
    const deliver = (secret = c.secret, sentAt = NOW_SECONDS) => {
      const body = c.body?.(sentAt) ?? BODY;
      return { body, headers: c.sign(body, secret, sentAt) };
    };
    const check = (headers: Headers, body: string, now = NOW) =>
      verify(c.provider, headers, body, c.secret, now);

    it('accepts a valid signature', () => {
      const { body, headers } = deliver();
      expect(check(headers, body)).toEqual({ valid: true });
    });

    it('rejects a signature made with the wrong secret', () => {
      const { body, headers } = deliver(c.wrongSecret);
      expect(check(headers, body)).toEqual({
        valid: false,
        failure: 'mismatch',
      });
    });

    if (c.bodySigned) {
      it('rejects a tampered body', () => {
        const { body, headers } = deliver();
        expect(body).toContain('42');
        expect(check(headers, body.replace('42', '43')).valid).toBe(false);
      });
    } else {
      it('does not cover the body (the provider only sends the secret)', () => {
        const { body, headers } = deliver();
        expect(check(headers, body.replace('42', '43')).valid).toBe(true);
      });
    }

    const tolerance = c.toleranceSeconds;
    if (tolerance) {
      it.each([
        ['old', -1],
        ['future', 1],
      ])(
        `rejects a %s timestamp outside the ${tolerance}s tolerance`,
        (_, direction) => {
          const { body, headers } = deliver(
            c.secret,
            NOW_SECONDS + direction * (tolerance + 1),
          );
          expect(check(headers, body)).toEqual({
            valid: false,
            failure: 'stale-timestamp',
          });
        },
      );

      it('accepts a timestamp inside the tolerance', () => {
        const { body, headers } = deliver(
          c.secret,
          NOW_SECONDS - (tolerance - 1),
        );
        expect(check(headers, body).valid).toBe(true);
      });
    } else {
      it('does not depend on the time of delivery', () => {
        const { body, headers } = deliver();
        expect(check(headers, body, NOW + 86_400_000).valid).toBe(true);
      });
    }

    it(
      c.provider === 'custom'
        ? 'leaves a request without a signature unverified'
        : 'rejects a request without a signature header',
      () => {
        expect(check({}, deliver().body).valid).toBe(
          c.provider === 'custom' ? null : false,
        );
      },
    );
  });

  describe('Standard Webhooks', () => {
    it('matches the published Svix test vector', () => {
      const headers = {
        'svix-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
        'svix-timestamp': '1614265330',
        'svix-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
      };
      expect(
        verify(
          'clerk',
          headers,
          '{"test": 2432232314}',
          'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
          1614265330 * 1000,
        ),
      ).toEqual({ valid: true });
    });

    it('accepts any matching signature in a rotated list and skips v1a', () => {
      const signed = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      const headers = {
        ...signed,
        'webhook-signature': `v1a,c2lnbmF0dXJl v1,${'A'.repeat(43)}= ${signed['webhook-signature']}`,
      };
      expect(verify('openai', headers, BODY, WHSEC, NOW).valid).toBe(true);
    });

    it('accepts a secret pasted without the whsec_ prefix', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      expect(
        verify('resend', headers, BODY, WHSEC.replace('whsec_', ''), NOW).valid,
      ).toBe(true);
    });

    it('rejects a signature replayed under another message id', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      headers['webhook-id'] = 'msg_other';
      expect(verify('standard-webhooks', headers, BODY, WHSEC, NOW)).toEqual({
        valid: false,
        failure: 'mismatch',
      });
    });

    it('rejects a request without the id or timestamp header', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      const noId = { ...headers, 'webhook-id': '' };
      const noTimestamp = { ...headers, 'webhook-timestamp': '' };
      expect(verify('clerk', noId, BODY, WHSEC, NOW).failure).toBe(
        'missing-id',
      );
      expect(verify('clerk', noTimestamp, BODY, WHSEC, NOW).failure).toBe(
        'missing-timestamp',
      );
    });
  });

  describe('Stripe', () => {
    const secret = 'whsec_stripe_test';

    it('accepts any of several v1 signatures during secret rotation', () => {
      const good = hmac('sha256', secret, `${NOW_SECONDS}.${BODY}`, 'hex');
      const header = `t=${NOW_SECONDS},v1=${'0'.repeat(64)},v1=${good},v0=ignored`;
      expect(
        verify('stripe', { 'stripe-signature': header }, BODY, secret, NOW)
          .valid,
      ).toBe(true);
    });

    it('rejects a header without a timestamp or a v1 signature', () => {
      const sig = hmac('sha256', secret, `${NOW_SECONDS}.${BODY}`, 'hex');
      expect(
        verify('stripe', { 'stripe-signature': `v1=${sig}` }, BODY, secret, NOW)
          .failure,
      ).toBe('missing-timestamp');
      expect(
        verify(
          'stripe',
          { 'stripe-signature': `t=${NOW_SECONDS}` },
          BODY,
          secret,
          NOW,
        ).failure,
      ).toBe('malformed-signature');
    });

    it('rejects a non-numeric timestamp', () => {
      const sig = hmac('sha256', secret, `abc.${BODY}`, 'hex');
      expect(
        verify(
          'stripe',
          { 'stripe-signature': `t=abc,v1=${sig}` },
          BODY,
          secret,
          NOW,
        ).failure,
      ).toBe('missing-timestamp');
    });
  });

  describe('GitHub', () => {
    it("matches GitHub's documented example", () => {
      expect(
        verify(
          'github',
          {
            'x-hub-signature-256':
              'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
          },
          'Hello, World!',
          "It's a Secret to Everybody",
        ),
      ).toEqual({ valid: true });
    });

    it('rejects a valid digest with trailing garbage', () => {
      const sig = hmac('sha256', 'gh_secret', BODY, 'hex');
      expect(
        verify(
          'github',
          { 'x-hub-signature-256': `sha256=${sig}zz` },
          BODY,
          'gh_secret',
        ).valid,
      ).toBe(false);
    });
  });

  describe('Shopify', () => {
    it('rejects the hex form of a correct digest', () => {
      const sig = hmac('sha256', 'shpss_client_secret', BODY, 'hex');
      expect(
        verify(
          'shopify',
          { 'x-shopify-hmac-sha256': sig },
          BODY,
          'shpss_client_secret',
        ).valid,
      ).toBe(false);
    });
  });

  describe('Slack', () => {
    it("matches Slack's documented example", () => {
      const body =
        'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c';
      expect(
        verify(
          'slack',
          {
            'x-slack-request-timestamp': '1531420618',
            'x-slack-signature':
              'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503',
          },
          body,
          '8f742231b10e8888abcd99yyyzzz85a5',
          1531420618 * 1000,
        ),
      ).toEqual({ valid: true });
    });

    it('rejects a signature replayed under another timestamp', () => {
      const headers = slack(BODY, 'slack_signing_secret', NOW_SECONDS);
      headers['x-slack-request-timestamp'] = String(NOW_SECONDS - 10);
      expect(verify('slack', headers, BODY, 'slack_signing_secret')).toEqual({
        valid: false,
        failure: 'mismatch',
      });
    });

    it('rejects a request without the timestamp header', () => {
      const headers = slack(BODY, 'slack_signing_secret', NOW_SECONDS);
      delete headers['x-slack-request-timestamp'];
      expect(
        verify('slack', headers, BODY, 'slack_signing_secret').failure,
      ).toBe('missing-timestamp');
    });
  });

  describe('Linear', () => {
    const secret = 'lin_wh_signing_secret';
    const signed = (body: string) => ({
      'linear-signature': hmac('sha256', secret, body, 'hex'),
    });

    it('requires the webhookTimestamp body field', () => {
      const body = '{"action":"create","type":"Issue","data":{"id":42}}';
      expect(verify('linear', signed(body), body, secret).failure).toBe(
        'missing-timestamp',
      );
    });

    it('reads webhookTimestamp as milliseconds', () => {
      const body = `{"type":"Issue","webhookTimestamp":${NOW_SECONDS}}`;
      expect(verify('linear', signed(body), body, secret).failure).toBe(
        'stale-timestamp',
      );
    });

    it('ignores a Linear-Timestamp header that disagrees with the signed body', () => {
      const body = linearBody(NOW_SECONDS - 3600);
      const headers = { ...signed(body), 'linear-timestamp': String(NOW) };
      expect(verify('linear', headers, body, secret).failure).toBe(
        'stale-timestamp',
      );
    });
  });

  describe('Twilio', () => {
    const token = 'twilio_auth_token';
    const sign = (url: string, form = TWILIO_FORM) => ({
      ...FORM_HEADERS,
      'x-twilio-signature': twilioSignature(token, url, form),
    });

    it("matches Twilio's documented example", () => {
      const form =
        'CallSid=CA1234567890ABCDE&Caller=%2B12349013030&Digits=1234&From=%2B12349013030&To=%2B18005551212';
      expect(
        verify(
          'twilio',
          {
            ...FORM_HEADERS,
            'x-twilio-signature': '0/KCTR6DLpKmkAf8muzZqo1nDgQ=',
          },
          form,
          '12345',
          NOW,
          ['https://mycompany.com/myapp.php?foo=1&bar=2'],
        ),
      ).toEqual({ valid: true });
    });

    it('accepts the URL signed with or without the default port', () => {
      const withPort = INGRESS_URL.replace('.test/', '.test:443/');
      expect(verify('twilio', sign(withPort), TWILIO_FORM, token).valid).toBe(
        true,
      );
      expect(
        verify('twilio', sign(INGRESS_URL), TWILIO_FORM, token, NOW, [withPort])
          .valid,
      ).toBe(true);
    });

    it('accepts a signature over any of the candidate public URLs', () => {
      const proxied =
        'http://api.hookdash.test/in/src_0123456789abcdef01234567';
      expect(
        verify('twilio', sign(proxied), TWILIO_FORM, token, NOW, [
          INGRESS_URL,
          proxied,
        ]).valid,
      ).toBe(true);
    });

    it('rejects a signature made for another source or query string', () => {
      const otherSource = INGRESS_URL.replace('01234567', '76543210');
      expect(
        verify('twilio', sign(otherSource), TWILIO_FORM, token).failure,
      ).toBe('mismatch');
      expect(
        verify('twilio', sign(`${INGRESS_URL}?a=1`), TWILIO_FORM, token, NOW, [
          `${INGRESS_URL}?a=2`,
        ]).failure,
      ).toBe('mismatch');
    });

    it('fails closed when the request URL is unknown', () => {
      expect(
        verify('twilio', sign(INGRESS_URL), TWILIO_FORM, token, NOW, []),
      ).toEqual({ valid: false, failure: 'missing-url' });
    });

    it('signs repeated params once each, in value order', () => {
      const form = 'b=2&a=1&a=0&a=1';
      const signature = hmac('sha1', token, `${INGRESS_URL}a0a1b2`, 'base64');
      expect(
        verify(
          'twilio',
          { ...FORM_HEADERS, 'x-twilio-signature': signature },
          form,
          token,
        ).valid,
      ).toBe(true);
    });

    describe('JSON bodies', () => {
      const json = '{"CallSid":"CA1234567890ABCDE","Caller":"+12349013030"}';
      const url = `${INGRESS_URL}?bodySHA256=${sha256Hex(json)}`;
      const headers = {
        'content-type': 'application/json',
        'x-twilio-signature': hmac('sha1', token, url, 'base64'),
      };

      it('accepts a body that matches the bodySHA256 in the signed URL', () => {
        expect(verify('twilio', headers, json, token, NOW, [url])).toEqual({
          valid: true,
        });
      });

      it('rejects a body that does not match bodySHA256', () => {
        expect(
          verify('twilio', headers, json.replace('CA1', 'CA9'), token, NOW, [
            url,
          ]).failure,
        ).toBe('mismatch');
      });

      it('rejects a JSON body when the URL carries no bodySHA256', () => {
        const unsigned = {
          ...headers,
          'x-twilio-signature': hmac('sha1', token, INGRESS_URL, 'base64'),
        };
        expect(verify('twilio', unsigned, json, token).failure).toBe(
          'mismatch',
        );
      });
    });
  });

  describe('Slack url_verification handshake', () => {
    const secret = 'slack_signing_secret';
    const CHALLENGE = '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P';
    const handshake = `{"token":"Jhj5dZrVaK7ZwHHjRyZWjbDl","challenge":"${CHALLENGE}","type":"url_verification"}`;
    const respond = (
      provider: string,
      rawBody: string,
      headers: Headers,
      configured: string | null = secret,
    ) =>
      service.challengeResponse(
        provider,
        { headers, rawBody },
        configured,
        NOW,
      );

    it('echoes the challenge of a correctly signed handshake', () => {
      expect(
        respond('slack', handshake, slack(handshake, secret, NOW_SECONDS)),
      ).toBe(CHALLENGE);
    });

    it('does not echo a handshake signed with the wrong secret or a stale timestamp', () => {
      expect(
        respond('slack', handshake, slack(handshake, 'wrong', NOW_SECONDS)),
      ).toBeNull();
      expect(
        respond(
          'slack',
          handshake,
          slack(handshake, secret, NOW_SECONDS - 301),
        ),
      ).toBeNull();
      expect(respond('slack', handshake, {})).toBeNull();
    });

    it('echoes without a signature when the source has no secret', () => {
      expect(respond('slack', handshake, {}, null)).toBe(CHALLENGE);
    });

    it('ignores other Slack payloads and other providers', () => {
      const callback = '{"type":"event_callback","challenge":"x"}';
      expect(
        respond('slack', callback, slack(callback, secret, NOW_SECONDS)),
      ).toBeNull();
      expect(respond('custom', handshake, {}, null)).toBeNull();
      expect(respond('github', handshake, {}, null)).toBeNull();
    });

    it('only echoes a short challenge from a JSON body', () => {
      const long = handshake.replace(CHALLENGE, 'c'.repeat(257));
      const nested = '{"type":"url_verification","challenge":{"x":1}}';
      expect(respond('slack', long, {}, null)).toBeNull();
      expect(respond('slack', nested, {}, null)).toBeNull();
      expect(
        respond('slack', 'type=url_verification&challenge=x', {}, null),
      ).toBeNull();
    });
  });

  describe('Meta hub.challenge handshake', () => {
    it('echoes hub.challenge for a subscribe request', () => {
      expect(
        service.subscriptionChallenge({
          'hub.mode': 'subscribe',
          'hub.challenge': '1158201444',
          'hub.verify_token': 'meatyhamhock',
        }),
      ).toBe('1158201444');
    });

    it('ignores anything that is not a single, short subscribe challenge', () => {
      const cases: Record<string, unknown>[] = [
        {},
        { 'hub.challenge': '1158201444' },
        { 'hub.mode': 'unsubscribe', 'hub.challenge': '1158201444' },
        { 'hub.mode': 'subscribe' },
        { 'hub.mode': 'subscribe', 'hub.challenge': '' },
        { 'hub.mode': 'subscribe', 'hub.challenge': ['1', '2'] },
        { 'hub.mode': ['subscribe'], 'hub.challenge': '1' },
        { 'hub.mode': 'subscribe', 'hub.challenge': '1'.repeat(257) },
      ];
      for (const query of cases) {
        expect(service.subscriptionChallenge(query)).toBeNull();
      }
    });
  });

  describe('detectProviders', () => {
    it('identifies providers by their headers', () => {
      expect(service.detectProviders({ 'x-github-event': 'ping' })).toEqual([
        'github',
      ]);
      expect(
        service.detectProviders({ 'x-shopify-hmac-sha256': 'abc=' }),
      ).toEqual(['shopify']);
      expect(service.detectProviders({ 'svix-signature': 'v1,abc' })).toEqual([
        'standard-webhooks',
        'clerk',
        'resend',
        'openai',
      ]);
    });

    it('never claims a request for the custom recipe', () => {
      expect(service.detectProviders({ 'x-signature': 'abc' })).toEqual([]);
    });
  });

  describe('identify', () => {
    it('reads the GitHub event and action and the delivery id from headers', () => {
      expect(
        service.identify(
          'github',
          {
            'x-github-event': 'pull_request',
            'x-github-delivery': '72d3162e-cc78-11e3-81ab-4c9367dc0958',
          },
          { action: 'opened', number: 1 },
        ),
      ).toEqual({
        eventType: 'pull_request.opened',
        deliveryId: '72d3162e-cc78-11e3-81ab-4c9367dc0958',
      });
      expect(
        service.identify('github', { 'x-github-event': 'push' }, { ref: 'x' }),
      ).toEqual({ eventType: 'push', deliveryId: null });
    });

    it('reads the Shopify topic and webhook id from headers', () => {
      expect(
        service.identify(
          'shopify',
          {
            'x-shopify-topic': 'orders/create',
            'x-shopify-webhook-id': 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043',
            'x-shopify-event-id': 'shared-across-subscriptions',
          },
          { id: 820982911946154500 },
        ),
      ).toEqual({
        eventType: 'orders/create',
        deliveryId: 'b54557e4-bdd9-4b37-8a5f-bf7d70bcd043',
      });
    });

    it('reads the Standard Webhooks type from the body and the id from webhook-id or svix-id', () => {
      const body = { type: 'user.created', data: { id: 'user_1' } };
      expect(
        service.identify('clerk', { 'svix-id': 'msg_svix' }, body),
      ).toEqual({ eventType: 'user.created', deliveryId: 'msg_svix' });
      expect(
        service.identify(
          'openai',
          { 'webhook-id': 'wh_1' },
          { ...body, id: 'evt_1' },
        ),
      ).toEqual({ eventType: 'user.created', deliveryId: 'wh_1' });
    });

    it('reads Slack event types from Events API, slash command and handshake bodies', () => {
      expect(
        service.identify(
          'slack',
          {},
          {
            type: 'event_callback',
            event_id: 'Ev08MFMKH6',
            event: { type: 'app_mention' },
          },
        ),
      ).toEqual({ eventType: 'app_mention', deliveryId: 'Ev08MFMKH6' });
      expect(
        service.identify(
          'slack',
          {},
          { command: '/weather', trigger_id: '13345224609.738474920.8088' },
        ),
      ).toEqual({
        eventType: '/weather',
        deliveryId: '13345224609.738474920.8088',
      });
      expect(
        service.identify('slack', {}, { type: 'url_verification' }),
      ).toEqual({ eventType: 'url_verification', deliveryId: null });
    });

    it('reads the Linear type and action and the Linear-Delivery id', () => {
      expect(
        service.identify(
          'linear',
          {
            'linear-event': 'Issue',
            'linear-delivery': '234d1a4e-b617-4388-90fe-adc3633d6b72',
          },
          { action: 'update', type: 'Issue', webhookId: 'wh_1' },
        ),
      ).toEqual({
        eventType: 'Issue.update',
        deliveryId: '234d1a4e-b617-4388-90fe-adc3633d6b72',
      });
      expect(
        service.identify('linear', { 'linear-event': 'Comment' }, null),
      ).toEqual({ eventType: 'Comment', deliveryId: null });
    });

    it('reads the Twilio status and idempotency token', () => {
      expect(
        service.identify(
          'twilio',
          { 'i-twilio-idempotency-token': 'b1b7d4b5-idem' },
          { MessageSid: 'SM123', MessageStatus: 'delivered' },
        ),
      ).toEqual({ eventType: 'delivered', deliveryId: 'b1b7d4b5-idem' });
      expect(
        service.identify(
          'twilio',
          {},
          { CallSid: 'CA123', CallStatus: 'ringing' },
        ),
      ).toEqual({ eventType: 'ringing', deliveryId: null });
    });

    it('reads fields from a form body kept as raw text', () => {
      expect(
        service.identify(
          'twilio',
          { ...FORM_HEADERS, 'i-twilio-idempotency-token': 'idem-1' },
          null,
          'MessageSid=SM123&MessageStatus=delivered',
        ),
      ).toEqual({ eventType: 'delivered', deliveryId: 'idem-1' });
      expect(
        service.identify(
          'slack',
          {
            'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
          },
          null,
          'command=%2Fweather&trigger_id=1334.7384.8088',
        ),
      ).toEqual({ eventType: '/weather', deliveryId: '1334.7384.8088' });
      expect(
        service.identify('twilio', {}, null, 'MessageStatus=delivered'),
      ).toEqual({ eventType: null, deliveryId: null });
    });

    it('keeps the existing body-based identities for payment providers', () => {
      expect(
        service.identify('stripe', {}, { id: 'evt_1', type: 'invoice.paid' }),
      ).toEqual({ eventType: 'invoice.paid', deliveryId: 'evt_1' });
      expect(
        service.identify(
          'paystack',
          {},
          { event: 'charge.success', data: { id: 302961, reference: 'r1' } },
        ),
      ).toEqual({ eventType: 'charge.success', deliveryId: '302961' });
      expect(
        service.identify(
          'flutterwave',
          {},
          { 'event.type': 'CARD_TRANSACTION', data: { tx_ref: 'tx-1' } },
        ),
      ).toEqual({ eventType: 'CARD_TRANSACTION', deliveryId: 'tx-1' });
      expect(
        service.identify(
          'bags',
          {},
          { topic: 'launchpad_launch', subject: 'sol', data: { mint: 'M1' } },
        ),
      ).toEqual({ eventType: 'launchpad_launch.sol', deliveryId: 'M1' });
      expect(
        service.identify('custom', {}, { event: 'thing.happened', id: 7 }),
      ).toEqual({ eventType: 'thing.happened', deliveryId: '7' });
    });

    it('truncates header values to the column sizes', () => {
      const { eventType, deliveryId } = service.identify(
        'shopify',
        {
          'x-shopify-topic': 't'.repeat(500),
          'x-shopify-webhook-id': 'd'.repeat(500),
        },
        null,
      );
      expect(eventType).toHaveLength(100);
      expect(deliveryId).toHaveLength(255);
    });

    it('ignores inherited and non-scalar body values', () => {
      expect(
        service.identify('stripe', {}, { type: { nested: true } }).eventType,
      ).toBeNull();
      const inherited = Object.create({ type: 'inherited' }) as Record<
        string,
        unknown
      >;
      expect(service.identify('stripe', {}, inherited).eventType).toBeNull();
      expect(service.identify('custom', {}, { id: {}, type: 'x' })).toEqual({
        eventType: 'x',
        deliveryId: null,
      });
    });
  });
});
