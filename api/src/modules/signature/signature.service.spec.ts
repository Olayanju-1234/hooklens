import * as crypto from 'crypto';
import { SignatureService } from './signature.service.js';

describe('SignatureService', () => {
  let service: SignatureService;

  beforeEach(() => {
    service = new SignatureService();
  });

  describe('verify', () => {
    it('should verify a valid Paystack signature', () => {
      const secret = 'sk_test_secret123';
      const body = '{"event":"charge.success","data":{"id":123}}';
      const signature = crypto
        .createHmac('sha512', secret)
        .update(body)
        .digest('hex');

      expect(service.verify('paystack', body, signature, secret)).toBe(true);
    });

    it('should reject an invalid Paystack signature', () => {
      const secret = 'sk_test_secret123';
      const body = '{"event":"charge.success","data":{"id":123}}';
      const wrongSig = crypto
        .createHmac('sha512', 'wrong_secret')
        .update(body)
        .digest('hex');

      expect(service.verify('paystack', body, wrongSig, secret)).toBe(false);
    });

    it('should verify Paystack-Signature when the secret is a whsec_ signing secret', () => {
      const secret = 'whsec_paystack_test';
      const body = '{"event":"charge.success","data":{"id":123}}';
      const t = Math.floor(Date.now() / 1000);
      const digest = crypto
        .createHmac('sha512', secret)
        .update(`${t}.${body}`)
        .digest('hex');

      expect(
        service.verify('paystack', body, `t=${t},v1=whk_1:${digest}`, secret),
      ).toBe(true);
    });

    it('should verify Flutterwave by direct secret comparison', () => {
      const secret = 'flw_verif_hash_123';
      expect(service.verify('flutterwave', '{}', secret, secret)).toBe(true);
      expect(service.verify('flutterwave', '{}', 'wrong', secret)).toBe(false);
    });

    it('should verify HMAC-SHA256 for custom providers', () => {
      const body = '{"a":1}';
      const hmac = crypto
        .createHmac('sha256', 'secret')
        .update(body)
        .digest('hex');
      expect(service.verify('custom', body, hmac, 'secret')).toBe(true);
      expect(service.verify('custom', body, `sha256=${hmac}`, 'secret')).toBe(
        true,
      );
      expect(service.verify('custom', body, 'deadbeef', 'secret')).toBe(false);
    });

    it('should compare the plain secret for Mono', () => {
      expect(service.verify('mono', '{}', 'mono-secret', 'mono-secret')).toBe(
        true,
      );
      expect(service.verify('mono', '{}', 'wrong', 'mono-secret')).toBe(false);
    });
  });

  describe('extractSignature', () => {
    it('should extract Paystack signature from headers', () => {
      const headers = { 'x-paystack-signature': 'abc123' };
      expect(service.extractSignature('paystack', headers)).toBe('abc123');
    });

    it('should extract the newer Paystack-Signature header', () => {
      const headers = { 'paystack-signature': 't=1,v1=whk_1:abc' };
      expect(service.extractSignature('paystack', headers)).toBe(
        't=1,v1=whk_1:abc',
      );
    });

    it('should extract Flutterwave verif-hash from headers', () => {
      const headers = { 'verif-hash': 'flw_hash' };
      expect(service.extractSignature('flutterwave', headers)).toBe('flw_hash');
    });

    it('should return null for unknown providers', () => {
      expect(service.extractSignature('unknown', {})).toBeNull();
    });

    it('should return null when header is missing', () => {
      expect(service.extractSignature('paystack', {})).toBeNull();
    });
  });
});
