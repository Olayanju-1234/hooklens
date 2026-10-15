import {
  generateSigningSecret,
  signStandardWebhook,
} from './standard-webhooks.js';

describe('standard-webhooks', () => {
  it('matches the reference vector from the Standard Webhooks spec', () => {
    expect(
      signStandardWebhook(
        'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
        'msg_p5jXN8AQM9LWM0D4loKWxJek',
        1614265330,
        '{"test": 2432232314}',
      ),
    ).toBe('v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  it('changes when the body changes', () => {
    const secret = generateSigningSecret();
    expect(signStandardWebhook(secret, 'id', 1, '{"a":1}')).not.toBe(
      signStandardWebhook(secret, 'id', 1, '{"a":2}'),
    );
  });

  it('generates whsec_ secrets with 32 random bytes', () => {
    const secret = generateSigningSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(secret.slice('whsec_'.length), 'base64')).toHaveLength(
      32,
    );
    expect(generateSigningSecret()).not.toBe(secret);
  });
});
