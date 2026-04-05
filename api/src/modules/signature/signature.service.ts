import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/** Tolerance window for Stripe timestamp validation (5 minutes) */
const STRIPE_TIMESTAMP_TOLERANCE_SECONDS = 300;

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  verify(
    provider: string,
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      switch (provider) {
        case 'paystack':
          return this.verifyHmac('sha512', secret, rawBody, signature);
        case 'flutterwave':
          return secret === signature;
        case 'mono':
          return this.verifyHmac('sha512', secret, rawBody, signature);
        case 'bags':
          return this.verifyHmac('sha256', secret, rawBody, signature);
        case 'stripe':
          return this.verifyStripe(secret, rawBody, signature);
        default:
          return true;
      }
    } catch (err) {
      this.logger.warn(
        `Signature verification failed for ${provider}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  extractSignature(
    provider: string,
    headers: Record<string, string>,
  ): string | null {
    const headerMap: Record<string, string> = {
      paystack: 'x-paystack-signature',
      flutterwave: 'verif-hash',
      mono: 'mono-webhook-secret',
      bags: 'x-bags-signature',
      // Stripe passes a compound header: t=<timestamp>,v1=<hmac_sha256>
      stripe: 'stripe-signature',
    };
    const key = headerMap[provider];
    if (!key) return null;
    return headers[key] ?? headers[key.toLowerCase()] ?? null;
  }

  /**
   * Verify a Stripe webhook signature.
   *
   * Stripe's algorithm:
   *   1. Extract `t` (Unix timestamp) and one or more `v1` HMAC values from
   *      the `Stripe-Signature` header (format: `t=...,v1=...,v1=...`).
   *   2. Build the signed payload: `"${t}.${rawBody}"`
   *   3. Compute HMAC-SHA256 of the signed payload using the webhook secret.
   *   4. Compare the result with each `v1` value using a constant-time
   *      comparison to prevent timing attacks.
   *   5. Reject if the timestamp is outside the tolerance window (5 min) to
   *      prevent replay attacks.
   *
   * Reference: https://stripe.com/docs/webhooks/signatures
   */
  private verifyStripe(
    secret: string,
    rawBody: string,
    stripeSignatureHeader: string,
  ): boolean {
    const parts = stripeSignatureHeader.split(',');

    const timestamp = parts
      .find((p) => p.startsWith('t='))
      ?.slice(2);
    const v1Signatures = parts
      .filter((p) => p.startsWith('v1='))
      .map((p) => p.slice(3));

    if (!timestamp || v1Signatures.length === 0) {
      this.logger.warn('Stripe signature header is malformed');
      return false;
    }

    const ts = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (Math.abs(now - ts) > STRIPE_TIMESTAMP_TOLERANCE_SECONDS) {
      this.logger.warn(
        `Stripe webhook timestamp out of tolerance: delta=${Math.abs(now - ts)}s`,
      );
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    return v1Signatures.some((v1) => {
      try {
        const v1Buffer = Buffer.from(v1, 'hex');
        if (v1Buffer.length !== expectedBuffer.length) return false;
        return crypto.timingSafeEqual(v1Buffer, expectedBuffer);
      } catch {
        return false;
      }
    });
  }

  private verifyHmac(
    algorithm: string,
    secret: string,
    body: string,
    signature: string,
  ): boolean {
    const hash = crypto
      .createHmac(algorithm, secret)
      .update(body)
      .digest('hex');

    // timingSafeEqual requires equal-length buffers
    const hashBuffer = Buffer.from(hash, 'hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    if (hashBuffer.length !== sigBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, sigBuffer);
  }
}
