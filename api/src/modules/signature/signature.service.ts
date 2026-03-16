import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SignatureService {
  verify(
    provider: string,
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    switch (provider) {
      case 'paystack': {
        const hash = crypto
          .createHmac('sha512', secret)
          .update(rawBody)
          .digest('hex');
        return crypto.timingSafeEqual(
          Buffer.from(hash, 'hex'),
          Buffer.from(signature, 'hex'),
        );
      }
      case 'flutterwave': {
        return secret === signature;
      }
      case 'mono': {
        const hash = crypto
          .createHmac('sha512', secret)
          .update(rawBody)
          .digest('hex');
        return crypto.timingSafeEqual(
          Buffer.from(hash, 'hex'),
          Buffer.from(signature, 'hex'),
        );
      }
      default:
        return true;
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
    };
    const key = headerMap[provider];
    if (!key) return null;
    return headers[key] ?? headers[key.toLowerCase()] ?? null;
  }
}
