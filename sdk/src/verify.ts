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
   * Verify a Mono webhook signature.
   * Mono uses HMAC-SHA512 in the `mono-webhook-secret` header.
   */
  mono(rawBody: string, signature: string, secret: string): boolean {
    return hmacVerify('sha512', rawBody, signature, secret);
  },

  /**
   * Verify a Bags webhook signature.
   * Bags events forwarded by Hookdash use HMAC-SHA256 in the `x-bags-signature` header.
   */
  bags(rawBody: string, signature: string, secret: string): boolean {
    return hmacVerify('sha256', rawBody, signature, secret);
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
    const get = (key: string) => {
      const val = headers[key] ?? headers[key.toLowerCase()];
      return Array.isArray(val) ? val[0] : val;
    };

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
