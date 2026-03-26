import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

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
    };
    const key = headerMap[provider];
    if (!key) return null;
    return headers[key] ?? headers[key.toLowerCase()] ?? null;
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
