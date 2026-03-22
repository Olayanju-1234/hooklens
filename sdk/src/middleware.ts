import type { IncomingMessage, ServerResponse } from 'node:http';

interface CaptureOptions {
  /** Your Hookdash ingress slug (e.g. usr_a1b2c3d4e5f6) */
  slug: string;
  /** Hookdash instance base URL (default: https://hookdash-api.onrender.com) */
  baseUrl?: string;
  /** Only capture requests matching these paths (default: capture all) */
  paths?: string[];
  /** Only capture these HTTP methods (default: ['POST', 'PUT', 'PATCH']) */
  methods?: string[];
}

/**
 * Express/Connect middleware that mirrors incoming webhooks to Hookdash.
 *
 * Captures the request body and headers, then asynchronously forwards
 * a copy to your Hookdash ingress endpoint. The original request
 * continues unaffected — zero latency impact.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { capture } from 'hookdash-sdk/middleware';
 *
 * const app = express();
 * app.use(express.json());
 *
 * // Mirror all webhooks to Hookdash
 * app.use('/webhooks', capture({
 *   slug: 'usr_a1b2c3d4e5f6',
 * }));
 *
 * app.post('/webhooks/paystack', (req, res) => {
 *   // Your normal handler — runs as usual
 *   res.sendStatus(200);
 * });
 * ```
 */
export function capture(options: CaptureOptions) {
  const {
    slug,
    baseUrl = 'https://hookdash-api.onrender.com',
    paths,
    methods = ['POST', 'PUT', 'PATCH'],
  } = options;

  const ingressUrl = `${baseUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')}/in/${slug}`;

  return (
    req: IncomingMessage & { body?: unknown; originalUrl?: string },
    _res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const method = req.method?.toUpperCase() ?? 'GET';

    // Filter by method
    if (!methods.includes(method)) {
      return next();
    }

    // Filter by path
    const reqPath = req.originalUrl ?? req.url ?? '/';
    if (paths && paths.length > 0) {
      const matches = paths.some((p) => reqPath.startsWith(p));
      if (!matches) return next();
    }

    // Fire and forget — don't block the request
    const body = req.body;
    if (body !== undefined) {
      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-hookdash-source': 'sdk-middleware',
        'x-hookdash-original-path': reqPath,
        'x-hookdash-original-method': method,
      };

      // Copy relevant original headers
      const passthroughHeaders = [
        'x-paystack-signature',
        'verif-hash',
        'mono-webhook-secret',
        'x-request-id',
        'user-agent',
      ];
      for (const h of passthroughHeaders) {
        const val = req.headers[h];
        if (val) {
          forwardHeaders[h] = Array.isArray(val) ? val[0] : val;
        }
      }

      fetch(ingressUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(body),
      }).catch(() => {
        // Silently fail — never disrupt the main app
      });
    }

    next();
  };
}
