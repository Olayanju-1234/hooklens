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
  | 'missing-url'
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

export interface InboundRequest {
  headers: Headers;
  rawBody: string;
  /** Public URLs the request may have been sent to, query string included; read by `{url}` recipes. */
  urls?: string[];
}

const HEX = /^[0-9a-f]+$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UNIX_TIME = /^\d{1,15}$/;
const EVENT_TYPE_MAX = 100;
const DELIVERY_ID_MAX = 255;
const CHALLENGE_MAX = 256;
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  verifyRequest(
    provider: string,
    request: InboundRequest,
    secret: string,
    now: number = Date.now(),
  ): VerificationResult {
    const recipe = getRecipe(provider);
    const header = firstHeader(
      request.headers,
      recipe.verification.signatureHeaders,
    );
    if (header === null) {
      return recipe.signatureOptional
        ? { valid: null }
        : { valid: false, failure: 'missing-signature' };
    }

    try {
      const result =
        recipe.verification.kind === 'shared-secret'
          ? this.compareSecret(secret, header)
          : this.verifyHmac(recipe.verification, header, request, secret, now);
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
      this.verifyRequest(
        provider,
        { headers: { [header]: signature }, rawBody },
        secret,
      ).valid === true
    );
  }

  /** The value to echo back when the request is a signed handshake such as Slack's url_verification. */
  challengeResponse(
    provider: string,
    request: InboundRequest,
    secret: string | null,
    now: number = Date.now(),
  ): string | null {
    const { challenge } = getRecipe(provider);
    if (!challenge) return null;
    const body = parseJson(request.rawBody);
    if (
      readField({ body: challenge.when.body }, {}, body) !==
      challenge.when.equals
    ) {
      return null;
    }
    const value = readField({ body: challenge.echo }, {}, body);
    if (!value || value.length > CHALLENGE_MAX) return null;
    if (
      secret &&
      this.verifyRequest(provider, request, secret, now).valid !== true
    ) {
      return null;
    }
    return value;
  }

  // Meta's hub.verify_token only proves the subscriber knows the URL; the src_ slug already does,
  // and deliveries are still checked against the source's secret.
  subscriptionChallenge(query: Record<string, unknown>): string | null {
    const challenge = query['hub.challenge'];
    if (query['hub.mode'] !== 'subscribe' || typeof challenge !== 'string') {
      return null;
    }
    return challenge.length > 0 && challenge.length <= CHALLENGE_MAX
      ? challenge
      : null;
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

  /** Form bodies are stored as raw text, so their fields are read from `rawBody`. */
  identify(
    provider: string,
    headers: Headers,
    body: Record<string, unknown> | null,
    rawBody = '',
  ): EventIdentity {
    const recipe = getRecipe(provider);
    const fields =
      body ??
      (isForm(headers)
        ? Object.fromEntries(new URLSearchParams(rawBody))
        : null);
    const first = (locators: FieldLocator[], max: number) => {
      for (const locator of locators) {
        const value = readField(locator, headers, fields);
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
    request: InboundRequest,
    secret: string,
    now: number,
  ): VerificationResult {
    const { headers, rawBody } = request;
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
      if (!timestamp && recipe.timestamp.body) {
        timestamp = readField(
          { body: recipe.timestamp.body },
          headers,
          parseJson(rawBody),
        );
      }
      if (!timestamp || !UNIX_TIME.test(timestamp)) {
        return { valid: false, failure: 'missing-timestamp' };
      }
      const sent = Number(timestamp);
      const age =
        recipe.timestamp.unit === 'milliseconds'
          ? Math.abs(now - sent) / 1000
          : Math.abs(Math.floor(now / 1000) - sent);
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

    let urls = [''];
    if (recipe.signedPayload.includes('{url}')) {
      urls = [...new Set((request.urls ?? []).flatMap(portVariants))];
      if (urls.length === 0) return { valid: false, failure: 'missing-url' };
    }

    let params = '';
    if (recipe.signedPayload.includes('{params}') && isForm(headers)) {
      params = signedParams(rawBody);
    } else if (
      recipe.bodyHashParam &&
      !bodyHashMatches(request.urls?.[0], recipe.bodyHashParam, rawBody)
    ) {
      return { valid: false, failure: 'mismatch' };
    }

    const key =
      recipe.secret.encoding === 'base64'
        ? Buffer.from(stripPrefix(secret, recipe.secret.stripPrefix), 'base64')
        : Buffer.from(secret, 'utf8');
    const expected = urls.map((url) => {
      const values: Record<string, string> = {
        id,
        timestamp: timestamp ?? '',
        body: rawBody,
        url,
        params,
      };
      const payload = recipe.signedPayload.replace(
        /\{(id|timestamp|body|url|params)\}/g,
        (_, name: string) => values[name],
      );
      return crypto
        .createHmac(recipe.algorithm, key)
        .update(payload, 'utf8')
        .digest();
    });

    const matched = signatures.some((signature) => {
      const actual = decodeDigest(signature, recipe.encoding);
      return (
        actual !== null &&
        expected.some(
          (digest) =>
            actual.length === digest.length &&
            crypto.timingSafeEqual(actual, digest),
        )
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

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isForm(headers: Headers): boolean {
  const type = firstHeader(headers, ['content-type']);
  return type?.toLowerCase().startsWith(FORM_CONTENT_TYPE) ?? false;
}

/** Twilio's form: names sorted, repeated values deduplicated and sorted, each written as name + value. */
function signedParams(rawBody: string): string {
  const form = new URLSearchParams(rawBody);
  return [...new Set(form.keys())]
    .sort()
    .flatMap((name) =>
      [...new Set(form.getAll(name))].sort().map((value) => name + value),
    )
    .join('');
}

// The digest is in the URL the sender signed, so this binds the body to the signature
function bodyHashMatches(
  url: string | undefined,
  param: string,
  rawBody: string,
): boolean {
  if (!url || !URL.canParse(url)) return false;
  const claimed = new URL(url).searchParams.get(param);
  const actual = crypto.createHash('sha256').update(rawBody).digest('hex');
  return claimed?.toLowerCase() === actual;
}

// Twilio signs with and without the default port, so try the URL as received and both forms
function portVariants(url: string): string[] {
  const match = /^(https?):\/\/([^/?#:@]+)(:\d+)?(.*)$/i.exec(url);
  if (!match) return [url];
  const [, scheme, host, , rest] = match;
  const port = scheme.toLowerCase() === 'https' ? ':443' : ':80';
  return [
    url,
    `${scheme}://${host}${rest}`,
    `${scheme}://${host}${port}${rest}`,
  ];
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
