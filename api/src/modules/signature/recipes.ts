import type { Provider } from '../../entities/endpoint.entity.js';

export type HmacAlgorithm = 'sha1' | 'sha256' | 'sha512';
export type DigestEncoding = 'hex' | 'base64';

/** Where a value lives on the request. `join` concatenates the parts it finds; the first part is required. */
export type FieldLocator =
  | { header: string }
  | { body: string[] }
  | { join: FieldLocator[]; separator: string };

/** A header holding several `key<keySeparator>value` entries, e.g. Stripe's `t=…,v1=…`. */
export interface SignatureEntries {
  separator: string;
  keySeparator: string;
  signatureKey: string;
  timestampKey?: string;
}

export interface HmacVerification {
  kind: 'hmac';
  signatureHeaders: string[];
  algorithm: HmacAlgorithm;
  encoding: DigestEncoding;
  /** Template over `{id}`, `{timestamp}` and `{body}` (the raw body). */
  signedPayload: string;
  /** Stripped from a single-value signature when present, e.g. `sha256=`. */
  prefix?: string;
  entries?: SignatureEntries;
  secret: { encoding: 'utf8' | 'base64'; stripPrefix?: string };
  idHeaders?: string[];
  /** Unix seconds, read from `headers` or from `entries.timestampKey`. */
  timestamp?: { headers?: string[]; toleranceSeconds: number };
}

/** The provider sends the configured secret itself in a header. */
export interface SharedSecretVerification {
  kind: 'shared-secret';
  signatureHeaders: string[];
}

export interface Recipe {
  label: string;
  verification: HmacVerification | SharedSecretVerification;
  /** A request without any signature header stays unverified instead of failing. */
  signatureOptional?: boolean;
  /** Headers that identify this provider on the shared user URL; defaults to the signature headers. */
  detectHeaders?: string[];
  eventType: FieldLocator[];
  deliveryId: FieldLocator[];
}

const FIVE_MINUTES = 300;

// https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
// Svix senders (Clerk, Resend) use the same scheme under svix-* header names.
const STANDARD_WEBHOOKS: Recipe = {
  label: 'Standard Webhooks',
  verification: {
    kind: 'hmac',
    signatureHeaders: ['webhook-signature', 'svix-signature'],
    algorithm: 'sha256',
    encoding: 'base64',
    signedPayload: '{id}.{timestamp}.{body}',
    entries: { separator: ' ', keySeparator: ',', signatureKey: 'v1' },
    secret: { encoding: 'base64', stripPrefix: 'whsec_' },
    idHeaders: ['webhook-id', 'svix-id'],
    timestamp: {
      headers: ['webhook-timestamp', 'svix-timestamp'],
      toleranceSeconds: FIVE_MINUTES,
    },
  },
  eventType: [{ body: ['type'] }],
  deliveryId: [{ header: 'webhook-id' }, { header: 'svix-id' }],
};

export const RECIPES: Record<Provider, Recipe> = {
  // https://docs.stripe.com/webhooks/signature — the whsec_ secret is the key as-is
  stripe: {
    label: 'Stripe',
    verification: {
      kind: 'hmac',
      signatureHeaders: ['stripe-signature'],
      algorithm: 'sha256',
      encoding: 'hex',
      signedPayload: '{timestamp}.{body}',
      entries: {
        separator: ',',
        keySeparator: '=',
        signatureKey: 'v1',
        timestampKey: 't',
      },
      secret: { encoding: 'utf8' },
      timestamp: { toleranceSeconds: FIVE_MINUTES },
    },
    eventType: [{ body: ['type'] }],
    deliveryId: [{ body: ['id'] }],
  },
  paystack: {
    label: 'Paystack',
    verification: {
      kind: 'hmac',
      signatureHeaders: ['x-paystack-signature'],
      algorithm: 'sha512',
      encoding: 'hex',
      signedPayload: '{body}',
      secret: { encoding: 'utf8' },
    },
    eventType: [{ body: ['event'] }],
    deliveryId: [{ body: ['data', 'id'] }, { body: ['data', 'reference'] }],
  },
  flutterwave: {
    label: 'Flutterwave',
    verification: { kind: 'shared-secret', signatureHeaders: ['verif-hash'] },
    eventType: [{ body: ['event'] }, { body: ['event.type'] }],
    deliveryId: [{ body: ['data', 'id'] }, { body: ['data', 'tx_ref'] }],
  },
  mono: {
    label: 'Mono',
    verification: {
      kind: 'shared-secret',
      signatureHeaders: ['mono-webhook-secret'],
    },
    eventType: [{ body: ['event'] }],
    deliveryId: [{ body: ['id'] }],
  },
  bags: {
    label: 'Bags',
    verification: {
      kind: 'hmac',
      signatureHeaders: ['x-bags-signature'],
      algorithm: 'sha256',
      encoding: 'hex',
      signedPayload: '{body}',
      secret: { encoding: 'utf8' },
    },
    eventType: [
      { join: [{ body: ['topic'] }, { body: ['subject'] }], separator: '.' },
    ],
    deliveryId: [{ body: ['data', 'mint'] }, { body: ['data', 'signature'] }],
  },
  // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  github: {
    label: 'GitHub',
    verification: {
      kind: 'hmac',
      signatureHeaders: ['x-hub-signature-256'],
      algorithm: 'sha256',
      encoding: 'hex',
      signedPayload: '{body}',
      prefix: 'sha256=',
      secret: { encoding: 'utf8' },
    },
    detectHeaders: ['x-github-event'],
    eventType: [
      {
        join: [{ header: 'x-github-event' }, { body: ['action'] }],
        separator: '.',
      },
    ],
    deliveryId: [{ header: 'x-github-delivery' }],
  },
  // https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
  shopify: {
    label: 'Shopify',
    verification: {
      kind: 'hmac',
      signatureHeaders: ['x-shopify-hmac-sha256'],
      algorithm: 'sha256',
      encoding: 'base64',
      signedPayload: '{body}',
      secret: { encoding: 'utf8' },
    },
    eventType: [{ header: 'x-shopify-topic' }],
    deliveryId: [{ header: 'x-shopify-webhook-id' }],
  },
  'standard-webhooks': STANDARD_WEBHOOKS,
  clerk: { ...STANDARD_WEBHOOKS, label: 'Clerk' },
  resend: { ...STANDARD_WEBHOOKS, label: 'Resend' },
  openai: { ...STANDARD_WEBHOOKS, label: 'OpenAI' },
  custom: {
    label: 'Custom',
    verification: {
      kind: 'hmac',
      signatureHeaders: [
        'x-webhook-signature',
        'x-signature',
        'x-hub-signature-256',
      ],
      algorithm: 'sha256',
      encoding: 'hex',
      signedPayload: '{body}',
      prefix: 'sha256=',
      secret: { encoding: 'utf8' },
    },
    signatureOptional: true,
    detectHeaders: [],
    eventType: [{ body: ['type'] }, { body: ['event'] }],
    deliveryId: [{ body: ['id'] }, { body: ['idempotency_key'] }],
  },
};

export function getRecipe(provider: string): Recipe {
  return Object.hasOwn(RECIPES, provider)
    ? RECIPES[provider as Provider]
    : RECIPES.custom;
}
