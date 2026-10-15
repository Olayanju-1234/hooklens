import { signStandardWebhook } from '../../common/utils/standard-webhooks.js';

// Connection-level, proxy-added and credential headers are never forwarded
const DROPPED = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'expect',
  'content-length',
  'accept-encoding',
  'cookie',
  'authorization',
  'forwarded',
  'x-real-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'true-client-ip',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
]);

// Hookdash's own signature uses these names, so an incoming copy is kept under x-original-*
const STANDARD_WEBHOOK_HEADERS = [
  'webhook-id',
  'webhook-timestamp',
  'webhook-signature',
];

const SIGNATURE_LIKE = /(signature|hmac|verif-hash|webhook-secret)/i;

/**
 * Headers to send on with a forwarded request. When the body was transformed the provider's
 * signature no longer matches it, so signature headers are dropped.
 */
export function forwardableHeaders(
  original: Record<string, string>,
  opts: { bodyTransformed: boolean },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(original ?? {})) {
    const name = rawName.toLowerCase();
    if (typeof value !== 'string' || DROPPED.has(name)) continue;
    if (name.startsWith('x-hookdash-')) continue;
    if (opts.bodyTransformed && SIGNATURE_LIKE.test(name)) continue;
    if (STANDARD_WEBHOOK_HEADERS.includes(name)) {
      if (!(opts.bodyTransformed && name === 'webhook-signature')) {
        out[`x-original-${name}`] = value;
      }
      continue;
    }
    out[name] = value;
  }
  return out;
}

/** Standard Webhooks headers proving the request came from Hookdash. */
export function hookdashSignatureHeaders(
  signingSecret: string,
  eventId: string,
  body: string,
  now: Date = new Date(),
): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    'webhook-id': eventId,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': signStandardWebhook(
      signingSecret,
      eventId,
      timestamp,
      body,
    ),
  };
}
