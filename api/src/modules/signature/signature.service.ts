import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  RECIPES,
  getRecipe,
  type DigestEncoding,
  type FieldLocator,
  type HmacVerification,
} from './recipes.js';

export type VerificationFailure =
  | 'missing-signature'
  | 'malformed-signature'
  | 'missing-id'
  | 'missing-timestamp'
  | 'stale-timestamp'
  | 'mismatch';

export interface VerificationResult {
  /** null when the source treats signatures as optional and none was sent */
  valid: boolean | null;
  failure?: VerificationFailure;
}

export interface EventIdentity {
  eventType: string | null;
  deliveryId: string | null;
}

type Headers = Record<string, string | string[] | undefined>;

const HEX = /^[0-9a-f]+$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UNIX_SECONDS = /^\d{1,12}$/;
const EVENT_TYPE_MAX = 100;
const DELIVERY_ID_MAX = 255;

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  verifyRequest(
    provider: string,
    headers: Headers,
    rawBody: string,
    secret: string,
    now: number = Date.now(),
  ): VerificationResult {
    const recipe = getRecipe(provider);
    const header = firstHeader(headers, recipe.verification.signatureHeaders);
    if (header === null) {
      return recipe.signatureOptional
        ? { valid: null }
        : { valid: false, failure: 'missing-signature' };
    }

    try {
      const result =
        recipe.verification.kind === 'shared-secret'
          ? this.compareSecret(secret, header)
          : this.verifyHmac(
              recipe.verification,
              header,
              headers,
              rawBody,
              secret,
              now,
            );
      if (!result.valid) {
        this.logger.warn(
          `Signature rejected for ${provider}: ${result.failure ?? 'unknown'}`,
        );
      }
      return result;
    } catch (err) {
      this.logger.warn(
        `Signature verification failed for ${provider}: ${(err as Error).message}`,
      );
      return { valid: false, failure: 'mismatch' };
    }
  }

  /** Checks a single signature header value, for providers whose scheme needs nothing else. */
  verify(
    provider: string,
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    const [header] = getRecipe(provider).verification.signatureHeaders;
    return (
      this.verifyRequest(provider, { [header]: signature }, rawBody, secret)
        .valid === true
    );
  }

  extractSignature(provider: string, headers: Headers): string | null {
    return firstHeader(
      headers,
      getRecipe(provider).verification.signatureHeaders,
    );
  }

  /** Providers whose identifying header is present on the request. */
  detectProviders(headers: Headers): string[] {
    return Object.entries(RECIPES)
      .filter(([, recipe]) =>
        (recipe.detectHeaders ?? recipe.verification.signatureHeaders).some(
          (name) => firstHeader(headers, [name]) !== null,
        ),
      )
      .map(([provider]) => provider);
  }

  identify(
    provider: string,
    headers: Headers,
    body: Record<string, unknown> | null,
  ): EventIdentity {
    const recipe = getRecipe(provider);
    const first = (locators: FieldLocator[], max: number) => {
      for (const locator of locators) {
        const value = readField(locator, headers, body);
        if (value) return value.slice(0, max);
      }
      return null;
    };
    return {
      eventType: first(recipe.eventType, EVENT_TYPE_MAX),
      deliveryId: first(recipe.deliveryId, DELIVERY_ID_MAX),
    };
  }

  private verifyHmac(
    recipe: HmacVerification,
    header: string,
    headers: Headers,
    rawBody: string,
    secret: string,
    now: number,
  ): VerificationResult {
    let signatures: string[];
    let timestamp: string | null = null;

    if (recipe.entries) {
      const entries = parseEntries(header, recipe.entries);
      signatures = entries
        .filter(([key]) => key === recipe.entries?.signatureKey)
        .map(([, value]) => value);
      if (recipe.entries.timestampKey) {
        timestamp =
          entries.find(([key]) => key === recipe.entries?.timestampKey)?.[1] ??
          null;
      }
    } else {
      const value = header.trim();
      signatures = [
        recipe.prefix && value.startsWith(recipe.prefix)
          ? value.slice(recipe.prefix.length)
          : value,
      ];
    }
    if (signatures.length === 0) {
      return { valid: false, failure: 'malformed-signature' };
    }

    if (recipe.timestamp) {
      timestamp ??= firstHeader(headers, recipe.timestamp.headers ?? []);
      if (!timestamp || !UNIX_SECONDS.test(timestamp)) {
        return { valid: false, failure: 'missing-timestamp' };
      }
      const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
      if (age > recipe.timestamp.toleranceSeconds) {
        return { valid: false, failure: 'stale-timestamp' };
      }
    }

    let id = '';
    if (recipe.signedPayload.includes('{id}')) {
      const found = firstHeader(headers, recipe.idHeaders ?? []);
      if (!found) return { valid: false, failure: 'missing-id' };
      id = found;
    }

    const values: Record<string, string> = {
      id,
      timestamp: timestamp ?? '',
      body: rawBody,
    };
    const payload = recipe.signedPayload.replace(
      /\{(id|timestamp|body)\}/g,
      (_, key: string) => values[key],
    );
    const key =
      recipe.secret.encoding === 'base64'
        ? Buffer.from(stripPrefix(secret, recipe.secret.stripPrefix), 'base64')
        : Buffer.from(secret, 'utf8');
    const expected = crypto
      .createHmac(recipe.algorithm, key)
      .update(payload, 'utf8')
      .digest();

    const matched = signatures.some((signature) => {
      const actual = decodeDigest(signature, recipe.encoding);
      return (
        actual !== null &&
        actual.length === expected.length &&
        crypto.timingSafeEqual(actual, expected)
      );
    });
    return matched ? { valid: true } : { valid: false, failure: 'mismatch' };
  }

  // Hashing first keeps the compare constant-time even when lengths differ
  private compareSecret(secret: string, header: string): VerificationResult {
    const digest = (value: string) =>
      crypto.createHash('sha256').update(value, 'utf8').digest();
    const valid = crypto.timingSafeEqual(digest(secret), digest(header));
    return valid ? { valid } : { valid, failure: 'mismatch' };
  }
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function parseEntries(
  header: string,
  format: { separator: string; keySeparator: string },
): [string, string][] {
  return header
    .split(format.separator)
    .map((part) => part.trim())
    .filter((part) => part.includes(format.keySeparator))
    .map((part) => {
      const at = part.indexOf(format.keySeparator);
      return [part.slice(0, at), part.slice(at + format.keySeparator.length)];
    });
}

function decodeDigest(value: string, encoding: DigestEncoding): Buffer | null {
  if (encoding === 'hex') {
    return HEX.test(value) && value.length % 2 === 0
      ? Buffer.from(value, 'hex')
      : null;
  }
  return BASE64.test(value) ? Buffer.from(value, 'base64') : null;
}

function stripPrefix(value: string, prefix?: string): string {
  return prefix && value.startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
}

function readField(
  locator: FieldLocator,
  headers: Headers,
  body: Record<string, unknown> | null,
): string | null {
  if ('header' in locator) return firstHeader(headers, [locator.header]);
  if ('join' in locator) {
    const [head, ...rest] = locator.join.map((part) =>
      readField(part, headers, body),
    );
    if (!head) return null;
    return [head, ...rest.filter(Boolean)].join(locator.separator);
  }
  let value: unknown = body;
  for (const key of locator.body) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      return null;
    }
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value === 'string') return value || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
