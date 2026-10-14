import * as crypto from 'crypto';
import { SignatureService } from './signature.service.js';
import { RECIPES } from './recipes.js';
import { PROVIDERS } from '../../entities/endpoint.entity.js';

type Headers = Record<string, string>;

interface Case {
  provider: string;
  secret: string;
  wrongSecret: string;
  /** Signs independently of the recipe engine, following the provider's docs. */
  sign: (body: string, secret: string, nowSeconds: number) => Headers;
  timestamped: boolean;
  bodySigned: boolean;
}

const NOW = 1_760_000_000_000;
const NOW_SECONDS = NOW / 1000;
const BODY =
  '{"type":"user.created","event":"charge.success","data":{"id":42}}';

const hmac = (
  algorithm: string,
  key: string | Buffer,
  payload: string,
  encoding: 'hex' | 'base64',
) => crypto.createHmac(algorithm, key).update(payload).digest(encoding);

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
    timestamped: true,
    bodySigned: true,
  },
  {
    provider: 'paystack',
    secret: 'sk_test_paystack',
    wrongSecret: 'sk_test_wrong',
    sign: (body, secret) => ({
      'x-paystack-signature': hmac('sha512', secret, body, 'hex'),
    }),
    timestamped: false,
    bodySigned: true,
  },
  {
    provider: 'flutterwave',
    secret: 'flw_verif_hash',
    wrongSecret: 'flw_wrong_hash',
    sign: (_body, secret) => ({ 'verif-hash': secret }),
    timestamped: false,
    bodySigned: false,
  },
  {
    provider: 'mono',
    secret: 'mono_webhook_secret',
    wrongSecret: 'mono_wrong_secret',
    sign: (_body, secret) => ({ 'mono-webhook-secret': secret }),
    timestamped: false,
    bodySigned: false,
  },
  {
    provider: 'bags',
    secret: 'bags_secret',
    wrongSecret: 'bags_wrong',
    sign: (body, secret) => ({
      'x-bags-signature': hmac('sha256', secret, body, 'hex'),
    }),
    timestamped: false,
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
    timestamped: false,
    bodySigned: true,
  },
  {
    provider: 'shopify',
    secret: 'shpss_client_secret',
    wrongSecret: 'shpss_wrong',
    sign: (body, secret) => ({
      'x-shopify-hmac-sha256': hmac('sha256', secret, body, 'base64'),
    }),
    timestamped: false,
    bodySigned: true,
  },
  ...(['standard-webhooks', 'clerk', 'resend', 'openai'] as const).flatMap(
    (provider) =>
      (['webhook', 'svix'] as const).map((prefix) => ({
        provider,
        secret: WHSEC,
        wrongSecret: WRONG_WHSEC,
        sign: standardWebhooks(prefix),
        timestamped: true,
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
    timestamped: false,
    bodySigned: true,
  },
];

describe('verification recipes', () => {
  let service: SignatureService;

  beforeEach(() => {
    service = new SignatureService();
  });

  it('has a recipe and a test case for every provider', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...PROVIDERS].sort());
    expect(new Set(CASES.map((c) => c.provider))).toEqual(new Set(PROVIDERS));
  });

  describe.each(CASES)('$provider', (c) => {
    const check = (headers: Headers, body = BODY, secret = c.secret) =>
      service.verifyRequest(c.provider, headers, body, secret, NOW);

    it('accepts a valid signature', () => {
      expect(check(c.sign(BODY, c.secret, NOW_SECONDS))).toEqual({
        valid: true,
      });
    });

    it('rejects a signature made with the wrong secret', () => {
      expect(check(c.sign(BODY, c.wrongSecret, NOW_SECONDS))).toEqual({
        valid: false,
        failure: 'mismatch',
      });
    });

    if (c.bodySigned) {
      it('rejects a tampered body', () => {
        const headers = c.sign(BODY, c.secret, NOW_SECONDS);
        expect(check(headers, BODY.replace('42', '43')).valid).toBe(false);
      });
    } else {
      it('does not cover the body (the provider only sends the secret)', () => {
        const headers = c.sign(BODY, c.secret, NOW_SECONDS);
        expect(check(headers, BODY.replace('42', '43')).valid).toBe(true);
      });
    }

    if (c.timestamped) {
      it.each([
        ['old', -301],
        ['future', 301],
      ])('rejects a %s timestamp outside the 5 minute tolerance', (_, skew) => {
        const headers = c.sign(BODY, c.secret, NOW_SECONDS + skew);
        expect(check(headers)).toEqual({
          valid: false,
          failure: 'stale-timestamp',
        });
      });

      it('accepts a timestamp inside the tolerance', () => {
        const headers = c.sign(BODY, c.secret, NOW_SECONDS - 299);
        expect(check(headers).valid).toBe(true);
      });
    } else {
      it('does not depend on the time of delivery', () => {
        const headers = c.sign(BODY, c.secret, NOW_SECONDS);
        expect(
          service.verifyRequest(
            c.provider,
            headers,
            BODY,
            c.secret,
            NOW + 86_400_000,
          ).valid,
        ).toBe(true);
      });
    }

    it(
      c.provider === 'custom'
        ? 'leaves a request without a signature unverified'
        : 'rejects a request without a signature header',
      () => {
        expect(check({}).valid).toBe(c.provider === 'custom' ? null : false);
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
        service.verifyRequest(
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
      expect(
        service.verifyRequest('openai', headers, BODY, WHSEC, NOW).valid,
      ).toBe(true);
    });

    it('accepts a secret pasted without the whsec_ prefix', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      expect(
        service.verifyRequest(
          'resend',
          headers,
          BODY,
          WHSEC.replace('whsec_', ''),
          NOW,
        ).valid,
      ).toBe(true);
    });

    it('rejects a signature replayed under another message id', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      headers['webhook-id'] = 'msg_other';
      expect(
        service.verifyRequest('standard-webhooks', headers, BODY, WHSEC, NOW),
      ).toEqual({ valid: false, failure: 'mismatch' });
    });

    it('rejects a request without the id or timestamp header', () => {
      const headers = standardWebhooks('webhook')(BODY, WHSEC, NOW_SECONDS);
      const noId = { ...headers, 'webhook-id': '' };
      const noTimestamp = { ...headers, 'webhook-timestamp': '' };
      expect(
        service.verifyRequest('clerk', noId, BODY, WHSEC, NOW).failure,
      ).toBe('missing-id');
      expect(
        service.verifyRequest('clerk', noTimestamp, BODY, WHSEC, NOW).failure,
      ).toBe('missing-timestamp');
    });
  });

  describe('Stripe', () => {
    const secret = 'whsec_stripe_test';

    it('accepts any of several v1 signatures during secret rotation', () => {
      const good = hmac('sha256', secret, `${NOW_SECONDS}.${BODY}`, 'hex');
      const header = `t=${NOW_SECONDS},v1=${'0'.repeat(64)},v1=${good},v0=ignored`;
      expect(
        service.verifyRequest(
          'stripe',
          { 'stripe-signature': header },
          BODY,
          secret,
          NOW,
        ).valid,
      ).toBe(true);
    });

    it('rejects a header without a timestamp or a v1 signature', () => {
      const sig = hmac('sha256', secret, `${NOW_SECONDS}.${BODY}`, 'hex');
      expect(
        service.verifyRequest(
          'stripe',
          { 'stripe-signature': `v1=${sig}` },
          BODY,
          secret,
          NOW,
        ).failure,
      ).toBe('missing-timestamp');
      expect(
        service.verifyRequest(
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
        service.verifyRequest(
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
        service.verifyRequest(
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
        service.verifyRequest(
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
        service.verifyRequest(
          'shopify',
          { 'x-shopify-hmac-sha256': sig },
          BODY,
          'shpss_client_secret',
        ).valid,
      ).toBe(false);
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
