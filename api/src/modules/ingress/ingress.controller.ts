import { Controller, Post, Param, Req, Res, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IngressService } from './ingress.service.js';

// Slug must match usr_ followed by exactly 12 hex chars
const SLUG_PATTERN = /^usr_[a-f0-9]{12}$/;

@Controller('in')
@SkipThrottle()
export class IngressController {
  private readonly logger = new Logger(IngressController.name);

  constructor(private readonly ingressService: IngressService) {}

  @Post(':slug')
  async receive(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Validate slug format — prevents path traversal and junk lookups
    if (!SLUG_PATTERN.test(slug)) {
      return res.status(200).json({ status: 'ok' });
    }

    // Always respond 200 quickly — never leak info to PSP
    const resolved = await this.ingressService.resolveEndpoint(slug);
    if (!resolved) {
      return res.status(200).json({ status: 'ok' });
    }

    const { endpoint, userId } = resolved;

    const rawBody =
      (req as unknown as { rawBody?: Buffer }).rawBody?.toString() ??
      JSON.stringify(req.body);

    const event = await this.ingressService.capture({
      endpointId: endpoint.id,
      userId,
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      rawBody,
      body: req.body as Record<string, unknown> | null,
      sourceIp: req.ip ?? null,
    });

    // Process async — don't block the 200 response
    void this.ingressService
      .processEvent(event, endpoint)
      .catch((err: Error) => {
        this.logger.error(
          `Failed to process event ${event.id}: ${err.message}`,
        );
      });

    return res.status(200).json({ status: 'ok' });
  }
}
