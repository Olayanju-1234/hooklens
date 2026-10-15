import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookProvider } from './types.js';

/**
 * Webhook signature verification helpers.
 *
 * Use these in your own server to verify that incoming webhooks
 * are genuinely from the provider, not spoofed.
 *
 * @example
 * ```ts
 * import { verify } from 'hookdash-sdk/verify';
 *
 * app.post('/webhook/paystack', (req, res) => {
 *   const sig = req.headers['x-paystack-signature'] as string;
 *   if (!verify.paystack(JSON.stringify(req.body), sig, process.env.PAYSTACK_SECRET!)) {
 *     return res.status(401).send('Invalid signature');
 *   }
 *   // process webhook...
 * });
 * ```
 */
export const verify = {
  /**
   * Verify a Paystack webhook signature.
   * Paystack uses HMAC-SHA512 in the `x-paystack-signature` header.
   */
  paystack(rawBody: string, signature: string, secret: string): boolean {
    return hmacVerify('sha512', rawBody, signature, secret);
  },

  /**
   * Verify a Flutterwave webhook.
   * Flutterwave sends the secret hash in the `verif-hash` header.
   */
  flutterwave(verifHash: string, secret: string): boolean {
    return verifHash === secret;
  },

  /**
   * Verify a Mono webhook.
   * Mono sends your webhook secret itself in the `mono-webhook-secret` header, not an HMAC.
   */
  mono(_rawBody: string, headerSecret: string, secret: string): boolean {
    return constantTimeEqual(headerSecret, secret);
  },

  /**
   * Verify a Bags webhook signature.
   * Bags events forwarded by Hookdash use HMAC-SHA256 in the `x-bags-signature` header.
   */
  bags(rawBody: string, signature: string, secret: string): boolean {
    return hmacVerify('sha256', rawBody, signature, secret);
  },

  /**
   * Verify that a request forwarded by Hookdash really came from Hookdash.
   *
   * Hookdash signs every forwarded request with Standard Webhooks headers
   * (`webhook-id`, `webhook-timestamp`, `webhook-signature`) using your route's
   * `whsec_` signing secret. Pass the raw body exactly as received.
   *
   * @example
   * ```ts
   * app.post('/webhooks', express.raw({ type: '*\/*' }), (req, res) => {
   *   if (!verify.hookdash(req.body.toString(), req.headers, process.env.HOOKDASH_SIGNING_SECRET!)) {
   *     return res.status(401).send('Invalid signature');
   *   }
   *   // handle the webhook...
   * });
   * ```
   */
  hookdash(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
    options: { toleranceSeconds?: number; now?: Date } = {},
  ): boolean {
    const id = headerValue(headers, 'webhook-id');
    const timestamp = headerValue(headers, 'webhook-timestamp');
    const signatures = headerValue(headers, 'webhook-signature');
    if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) {
      return false;
    }

    // Reject stale or future-dated requests so a captured request can't be replayed later
    const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
    if (Math.abs(now - Number(timestamp)) > (options.toleranceSeconds ?? 300)) {
      return false;
    }

    const key = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret,
      'base64',
    );
    const expected = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
      .digest();

    return signatures.split(' ').some((entry) => {
      const [version, value] = entry.split(',');
      if (version !== 'v1' || !value) return false;
      const given = Buffer.from(value, 'base64');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  },

  /**
   * Generic HMAC verification for custom providers.
   */
  hmac(
    algorithm: string,
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    return hmacVerify(algorithm, rawBody, signature, secret);
  },

  /**
   * Auto-detect provider and verify signature.
   * Pass the full headers object and we'll figure out which provider it is.
   */
  auto(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
  ): { provider: WebhookProvider | 'unknown'; valid: boolean } {
    const get = (key: string) => headerValue(headers, key);

    const paystackSig = get('x-paystack-signature');
    if (paystackSig) {
      return { provider: 'paystack', valid: verify.paystack(rawBody, paystackSig, secret) };
    }

    const flutterwaveHash = get('verif-hash');
    if (flutterwaveHash) {
      return { provider: 'flutterwave', valid: verify.flutterwave(flutterwaveHash, secret) };
    }

    const monoSig = get('mono-webhook-secret');
    if (monoSig) {
      return { provider: 'mono', valid: verify.mono(rawBody, monoSig, secret) };
    }

    const bagsSig = get('x-bags-signature');
    if (bagsSig) {
      return { provider: 'bags', valid: verify.bags(rawBody, bagsSig, secret) };
    }

    return { provider: 'unknown', valid: false };
  },
};

// ── Internals ────────────────────────────────────────────────────────

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value =
    headers[name] ??
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmacVerify(
  algorithm: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const expected = createHmac(algorithm, secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
