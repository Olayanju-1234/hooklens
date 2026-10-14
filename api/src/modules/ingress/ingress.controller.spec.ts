import * as crypto from 'crypto';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { IngressController } from './ingress.controller.js';
import type { IngressService } from './ingress.service.js';
import { SignatureService } from '../signature/signature.service.js';
import type { Endpoint } from '../../entities/endpoint.entity.js';

const SLUG = 'src_0123456789abcdef01234567';
const API_URL = 'https://api.hookdash.test';
const NOW_SECONDS = Math.floor(Date.now() / 1000);

interface Sent {
  status?: number;
  type?: string;
  body?: unknown;
}

function fakeResponse(): { res: Response; sent: Sent } {
  const sent: Sent = {};
  const res = {
    status: (code: number) => ((sent.status = code), res),
    type: (type: string) => ((sent.type = type), res),
    send: (body: unknown) => ((sent.body = body), res),
    json: (body: unknown) => ((sent.body = body), res),
  };
  return { res: res as unknown as Response, sent };
}

function fakeRequest(opts: {
  method?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  rawBody?: string;
  body?: unknown;
}): Request {
  const path = `/in/${SLUG}`;
  return {
    method: opts.method ?? 'POST',
    path,
    originalUrl: path,
    protocol: 'http',
    host: '127.0.0.1:3001',
    ip: '203.0.113.7',
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body ?? opts.rawBody,
    rawBody: Buffer.from(opts.rawBody ?? ''),
  } as unknown as Request;
}

describe('IngressController', () => {
  let ingress: {
    resolveEndpoint: jest.Mock;
    capture: jest.Mock;
    processEvent: jest.Mock;
  };
  let controller: IngressController;
  let signatures: SignatureService;

  const endpoint = (provider: string, webhookSecret: string | null) =>
    ({
      id: 'ep-1',
      userId: 'user-1',
      provider,
      webhookSecret,
      responseStatusCode: 202,
      responseBody: null,
    }) as Endpoint;

  beforeEach(() => {
    ingress = {
      resolveEndpoint: jest.fn(),
      capture: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      processEvent: jest.fn().mockResolvedValue(undefined),
    };
    signatures = new SignatureService();
    const config = {
      get: (key: string, fallback?: string) =>
        key === 'apiUrl' ? API_URL : fallback,
    } as ConfigService;
    controller = new IngressController(
      ingress as unknown as IngressService,
      signatures,
      config,
    );
  });

  describe('GET (Meta hub.challenge)', () => {
    const query = {
      'hub.mode': 'subscribe',
      'hub.challenge': '1158201444',
      'hub.verify_token': 'anything',
    };

    it("echoes the challenge as plain text for a source's URL", async () => {
      ingress.resolveEndpoint.mockResolvedValue({
        endpoint: endpoint('custom', null),
        userId: 'user-1',
      });
      const { res, sent } = fakeResponse();
      await controller.challenge(SLUG, fakeRequest({ query }), res);
      expect(ingress.resolveEndpoint).toHaveBeenCalledWith(SLUG, {
        headers: {},
      });
      expect(sent).toEqual({
        status: 200,
        type: 'text/plain',
        body: '1158201444',
      });
    });

    it('answers a plain ok without a lookup when there is nothing to echo', async () => {
      for (const [slug, q] of [
        [SLUG, {}],
        ['usr_0123456789ab', query],
        ['src_not-a-slug', query],
      ] as const) {
        const { res, sent } = fakeResponse();
        await controller.challenge(slug, fakeRequest({ query: q }), res);
        expect(sent).toEqual({ status: 200, body: { status: 'ok' } });
      }
      expect(ingress.resolveEndpoint).not.toHaveBeenCalled();
    });

    it('does not echo for an unknown or inactive source', async () => {
      ingress.resolveEndpoint.mockResolvedValue(null);
      const { res, sent } = fakeResponse();
      await controller.challenge(SLUG, fakeRequest({ query }), res);
      expect(sent).toEqual({ status: 200, body: { status: 'ok' } });
    });
  });

  describe('POST (Slack url_verification)', () => {
    const secret = 'slack_signing_secret';
    const rawBody =
      '{"token":"Jhj5dZrVaK7ZwHHjRyZWjbDl","challenge":"3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P","type":"url_verification"}';
    const signed = (key: string) => ({
      'content-type': 'application/json',
      'x-slack-request-timestamp': String(NOW_SECONDS),
      'x-slack-signature': `v0=${crypto.createHmac('sha256', key).update(`v0:${NOW_SECONDS}:${rawBody}`).digest('hex')}`,
    });

    beforeEach(() => {
      ingress.resolveEndpoint.mockResolvedValue({
        endpoint: endpoint('slack', secret),
        userId: 'user-1',
      });
    });

    it('answers a signed handshake without capturing it', async () => {
      const { res, sent } = fakeResponse();
      await controller.receive(
        SLUG,
        fakeRequest({ headers: signed(secret), rawBody }),
        res,
      );
      expect(sent).toEqual({
        status: 200,
        type: 'text/plain',
        body: '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P',
      });
      expect(ingress.capture).not.toHaveBeenCalled();
    });

    it('captures a handshake with a bad signature like any other delivery', async () => {
      const { res, sent } = fakeResponse();
      await controller.receive(
        SLUG,
        fakeRequest({ headers: signed('wrong'), rawBody }),
        res,
      );
      expect(sent).toEqual({ status: 202, body: { status: 'ok' } });
      expect(ingress.capture).toHaveBeenCalledTimes(1);
      expect(ingress.processEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST (Twilio)', () => {
    const token = 'twilio_auth_token';
    const rawBody = 'To=%2B18005551212&Body=Hello&MessageSid=SM123';

    const deliver = async (signedUrl: string) => {
      ingress.resolveEndpoint.mockResolvedValue({
        endpoint: endpoint('twilio', token),
        userId: 'user-1',
      });
      const payload = `${signedUrl}BodyHelloMessageSidSM123To+18005551212`;
      const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': crypto
          .createHmac('sha1', token)
          .update(payload)
          .digest('base64'),
      };
      await controller.receive(
        SLUG,
        fakeRequest({ headers, rawBody }),
        fakeResponse().res,
      );
      const [, , opts] = ingress.processEvent.mock.calls[0] as [
        unknown,
        unknown,
        { urls: string[] },
      ];
      return signatures.verifyRequest(
        'twilio',
        { headers, rawBody, urls: opts.urls },
        token,
      );
    };

    it('passes the public API_URL form of the request URL to verification', async () => {
      expect(await deliver(`${API_URL}/in/${SLUG}`)).toEqual({ valid: true });
    });

    it('also accepts the URL as the proxy saw it', async () => {
      expect(await deliver(`http://127.0.0.1:3001/in/${SLUG}`)).toEqual({
        valid: true,
      });
    });

    it('rejects a URL that is neither', async () => {
      expect((await deliver(`https://elsewhere.test/in/${SLUG}`)).valid).toBe(
        false,
      );
    });
  });
});
