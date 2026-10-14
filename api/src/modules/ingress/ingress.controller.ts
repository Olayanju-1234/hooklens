import { Controller, Get, Post, Param, Req, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { IngressService } from './ingress.service.js';
import { SignatureService } from '../signature/signature.service.js';

// Source slugs are src_ + 24 hex; legacy user and workspace slugs usr_/ws_ + 12 hex
const SLUG_PATTERN = /^(src_[a-f0-9]{24}|(usr|ws)_[a-f0-9]{12})$/;
const SOURCE_SLUG_PATTERN = /^src_[a-f0-9]{24}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('Ingress')
@Controller('in')
@SkipThrottle()
export class IngressController {
  private readonly logger = new Logger(IngressController.name);

  constructor(
    private readonly ingressService: IngressService,
    private readonly signatureService: SignatureService,
    private readonly configService: ConfigService,
  ) {}

  @Get(':slug')
  @ApiOperation({
    summary:
      "Answer a provider's subscription check on a src_ slug, e.g. Meta's hub.challenge",
  })
  @ApiResponse({ status: 200, description: 'The challenge, as plain text' })
  @ApiParam({ name: 'slug', type: String })
  async challenge(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const challenge = this.signatureService.subscriptionChallenge(
      req.query as Record<string, unknown>,
    );
    if (challenge === null || !SOURCE_SLUG_PATTERN.test(slug)) {
      return res.status(200).json({ status: 'ok' });
    }
    const resolved = await this.ingressService.resolveEndpoint(slug, {
      headers: {},
    });
    if (!resolved) {
      return res.status(200).json({ status: 'ok' });
    }
    this.logger.log(
      `Answered subscription check for endpoint ${resolved.endpoint.id}`,
    );
    return res.status(200).type('text/plain').send(challenge);
  }

  @Post(':slug')
  @ApiOperation({
    summary:
      'Receive a webhook. A src_ slug is one source; a usr_/ws_ slug routes by provider header, else the newest endpoint',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiParam({ name: 'slug', type: String })
  receive(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handle(slug, undefined, req, res);
  }

  @Post(':slug/:endpointId')
  @ApiOperation({ summary: 'Receive a webhook for a specific endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  @ApiParam({ name: 'slug', type: String })
  @ApiParam({ name: 'endpointId', type: String })
  receiveForEndpoint(
    @Param('slug') slug: string,
    @Param('endpointId') endpointId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!UUID_PATTERN.test(endpointId)) {
      return res.status(200).json({ status: 'ok' });
    }
    return this.handle(slug, endpointId, req, res);
  }

  private async handle(
    slug: string,
    endpointId: string | undefined,
    req: Request,
    res: Response,
  ) {
    // Unknown or malformed slugs get a plain 200 so nothing leaks to the sender
    if (!SLUG_PATTERN.test(slug)) {
      return res.status(200).json({ status: 'ok' });
    }

    const headers = req.headers as Record<string, string>;
    const resolved = await this.ingressService.resolveEndpoint(slug, {
      endpointId,
      headers,
    });
    if (!resolved) {
      return res.status(200).json({ status: 'ok' });
    }

    const { endpoint, userId } = resolved;
    const { rawBody, body } = this.readBody(req);
    const urls = this.requestUrls(req);

    // Handshakes are answered here and never captured; a failed one falls through so it shows up
    const challenge = this.signatureService.challengeResponse(
      endpoint.provider,
      { headers, rawBody, urls },
      endpoint.webhookSecret,
    );
    if (challenge !== null) {
      this.logger.log(
        `Answered ${endpoint.provider} handshake for endpoint ${endpoint.id}`,
      );
      return res.status(200).type('text/plain').send(challenge);
    }

    const event = await this.ingressService.capture({
      endpointId: endpoint.id,
      userId,
      method: req.method,
      path: req.path,
      headers,
      rawBody,
      body,
      sourceIp: req.ip ?? null,
    });

    // A request Hookdash itself forwarded must not be forwarded again (loops)
    const fromHookdash = Boolean(headers['x-hookdash-event-id']);

    void this.ingressService
      .processEvent(event, endpoint, { skipForward: fromHookdash, urls })
      .catch((err: Error) => {
        this.logger.error(
          `Failed to process event ${event.id}: ${err.message}`,
        );
      });

    return res
      .status(endpoint.responseStatusCode ?? 200)
      .json(this.responseBody(endpoint.responseBody));
  }

  // URL-signing senders (Twilio) sign the URL they were given: normally API_URL, else the host nginx saw
  private requestUrls(req: Request): string[] {
    const apiUrl = this.configService.get<string>('apiUrl', '');
    const urls = [`${req.protocol}://${req.host}${req.originalUrl}`];
    if (apiUrl) urls.unshift(`${apiUrl}${req.originalUrl}`);
    return [...new Set(urls)];
  }

  private readBody(req: Request): {
    rawBody: string;
    body: Record<string, unknown> | null;
  } {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const parsed: unknown = req.body;

    if (typeof parsed === 'string') {
      return { rawBody: raw?.toString() ?? parsed, body: this.tryJson(parsed) };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        rawBody: raw?.toString() ?? JSON.stringify(parsed),
        body: parsed as Record<string, unknown>,
      };
    }
    return { rawBody: raw?.toString() ?? '', body: null };
  }

  private tryJson(text: string): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(text);
      return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private responseBody(configured: string | null): Record<string, unknown> {
    if (!configured) return { status: 'ok' };
    return this.tryJson(configured) ?? { status: 'ok' };
  }
}
