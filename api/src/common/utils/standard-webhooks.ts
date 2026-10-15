import { createHmac, randomBytes } from 'crypto';

const SECRET_PREFIX = 'whsec_';

/** A new outbound signing secret in the Standard Webhooks `whsec_<base64>` format. */
export function generateSigningSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64')}`;
}

/** Signature header value for Standard Webhooks: `v1,<base64 HMAC-SHA256 of id.timestamp.body>`. */
export function signStandardWebhook(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): string {
  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX)
      ? secret.slice(SECRET_PREFIX.length)
      : secret,
    'base64',
  );
  const digest = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`, 'utf8')
    .digest('base64');
  return `v1,${digest}`;
}
