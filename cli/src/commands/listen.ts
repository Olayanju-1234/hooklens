import { io, Socket } from 'socket.io-client';
import chalk from 'chalk';
import ora from 'ora';
import { ingressBase, type HookdashConfig } from '../config/store.js';
import { apiRequest, requireAuth } from '../config/http.js';

interface ListenOptions {
  port: string;
  path?: string;
  forwardTo?: string;
  endpoint?: string;
  since?: string;
  apiUrl?: string;
  wsUrl?: string;
}

interface EventSummary {
  id: string;
  endpointId: string;
  receivedAt: string;
}

interface EventDetail extends EventSummary {
  provider: string | null;
  eventType: string | null;
  method: string;
  headers: Record<string, string> | null;
  body: unknown;
  rawBody: string | null;
}

interface Endpoint {
  id: string;
  name: string;
  ingressSlug?: string;
}

interface Delivery {
  status: 'forwarded' | 'failed';
  responseCode?: number;
  latencyMs: number;
  error?: string;
}

// Same rule as Hookdash's own forwarding: no connection, proxy or credential headers
const DROPPED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
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

const SEEN_LIMIT = 1000;

function timestamp(): string {
  return chalk.dim(new Date().toLocaleTimeString());
}

/** "30s", "10m", "2h", "1d" → milliseconds. */
export function parseDuration(value: string): number | null {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return null;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * unit;
}

export function localHeaders(original: Record<string, string> | null, eventId: string, catchUp: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(original ?? {})) {
    const lower = name.toLowerCase();
    if (DROPPED_HEADERS.has(lower) || lower.startsWith('x-hookdash-')) continue;
    headers[lower] = value;
  }
  headers['content-type'] ??= 'application/json';
  headers['x-hookdash-event-id'] = eventId;
  if (catchUp) headers['x-hookdash-catch-up'] = 'true';
  return headers;
}

async function deliverLocally(event: EventDetail, target: string, catchUp: boolean): Promise<Delivery> {
  const start = Date.now();
  try {
    // The exact bytes Hookdash received, so provider signatures still verify locally
    const res = await fetch(target, {
      method: event.method || 'POST',
      headers: localHeaders(event.headers, event.id, catchUp),
      body: event.rawBody ?? JSON.stringify(event.body ?? null),
      signal: AbortSignal.timeout(15_000),
    });
    await res.arrayBuffer();
    return {
      status: res.ok ? 'forwarded' : 'failed',
      responseCode: res.status,
      latencyMs: Date.now() - start,
      ...(!res.ok && { error: `HTTP ${res.status} ${res.statusText}` }),
    };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'failed', latencyMs: Date.now() - start, error: cause ?? message };
  }
}

function hintFor(error: string): string {
  if (error.includes('ECONNREFUSED')) return ' (is your server running?)';
  if (error.includes('ECONNRESET')) return ' (connection reset by server)';
  if (error.includes('Timeout') || error.includes('ETIMEDOUT')) return ' (request timed out)';
  return '';
}

export async function listenCommand(options: ListenOptions): Promise<void> {
  const stored = requireAuth();
  const config: HookdashConfig = {
    ...stored,
    apiUrl: options.apiUrl ?? stored.apiUrl,
    wsUrl: options.wsUrl ?? stored.wsUrl,
  };

  const target = options.forwardTo ?? `http://localhost:${options.port}${options.path ?? ''}`;
  const targetLabel = target.replace(/^https?:\/\//, '');
  const sinceMs = options.since ? parseDuration(options.since) : null;
  if (options.since && sinceMs === null) {
    console.log(chalk.red(`\n  --since must look like 30s, 10m, 2h or 1d (got "${options.since}").\n`));
    process.exit(1);
  }

  const seen = new Set<string>();
  let lastSeenAt = sinceMs !== null ? new Date(Date.now() - sinceMs) : new Date();
  // One delivery at a time keeps events in the order they arrived
  let queue: Promise<void> = Promise.resolve();

  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
  };

  async function handle(eventId: string, catchUp: boolean): Promise<void> {
    if (seen.has(eventId)) return;
    remember(eventId);

    let event: EventDetail;
    try {
      event = await apiRequest<EventDetail>(`/events/${eventId}`, { config });
    } catch (err) {
      console.log(`  ${timestamp()} ${chalk.red('✗')} ${eventId} — ${chalk.red(`could not fetch event: ${(err as Error).message}`)}`);
      return;
    }
    if (options.endpoint && event.endpointId !== options.endpoint) return;
    if (new Date(event.receivedAt) > lastSeenAt) lastSeenAt = new Date(event.receivedAt);

    const result = await deliverLocally(event, target, catchUp);
    const name = `${event.method} ${chalk.bold(event.eventType ?? 'unknown')} ${chalk.dim(`(${event.provider ?? 'custom'})`)}`;
    const tag = catchUp ? chalk.yellow(' [catch-up]') : '';
    if (result.status === 'forwarded') {
      console.log(`  ${timestamp()} ${chalk.green('→')} ${name}${tag} — ${chalk.green(String(result.responseCode))} ${chalk.dim(`(${result.latencyMs}ms)`)}`);
    } else {
      const error = result.error ?? 'failed';
      console.log(`  ${timestamp()} ${chalk.red('✗')} ${name}${tag} — ${chalk.red(error)}${chalk.yellow(hintFor(error))}`);
    }

    // Report back so the delivery shows up in the dashboard's flight recorder
    apiRequest(`/events/${event.id}/local-deliveries`, {
      method: 'POST',
      body: { target: targetLabel, ...result },
      config,
    }).catch((err: unknown) => {
      console.log(chalk.dim(`  ${timestamp()} could not report delivery: ${(err as Error).message}`));
    });
  }

  function enqueue(eventId: string, catchUp = false) {
    queue = queue.then(() => handle(eventId, catchUp)).catch(() => undefined);
  }

  /** Delivers events received since `lastSeenAt`, oldest first: after a reconnect, or for --since. */
  async function catchUp(): Promise<void> {
    const from = lastSeenAt.toISOString();
    const missed: EventSummary[] = [];
    let cursor: string | null = null;
    try {
      do {
        const params = new URLSearchParams({ from, limit: '100' });
        if (options.endpoint) params.set('endpointId', options.endpoint);
        if (cursor) params.set('cursor', cursor);
        const page = await apiRequest<{ items: EventSummary[]; nextCursor: string | null }>(`/events?${params}`, { config });
        missed.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && missed.length < 500);
    } catch (err) {
      console.log(chalk.yellow(`  ${timestamp()} Could not fetch missed events: ${(err as Error).message}`));
      return;
    }
    const pending = missed.filter((e) => !seen.has(e.id)).reverse();
    if (pending.length > 0) {
      console.log(chalk.dim(`  ${timestamp()} Catching up on ${pending.length} event${pending.length === 1 ? '' : 's'}…`));
    }
    for (const e of pending) enqueue(e.id, true);
  }

  const spinner = ora('Connecting to Hookdash...').start();
  const socket: Socket = io(`${config.wsUrl}/live`, {
    auth: config.apiKey ? { apiKey: config.apiKey } : { token: config.token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });

  let connectedOnce = false;
  socket.on('connect', () => {
    if (connectedOnce) {
      console.log(chalk.green(`  ${timestamp()} Reconnected.`));
      void catchUp();
      return;
    }
    connectedOnce = true;
    spinner.succeed('Connected to Hookdash');
    console.log();
    console.log(`  Forwarding webhooks ${chalk.bold('→')} ${chalk.cyan(target)}`);
    void printIngressUrls(config, options.endpoint);
    if (sinceMs !== null) void catchUp();
  });

  socket.on('connect_error', (err) => {
    if (!connectedOnce && spinner.isSpinning) {
      spinner.fail('Failed to connect to Hookdash');
      console.log(chalk.dim(`  ${err.message}`));
      console.log(chalk.yellow('  Check your credentials with `hookdash whoami`, or run `hookdash login` again.\n'));
      process.exit(1);
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    const message = reason === 'io server disconnect' ? 'Disconnected by server.' : 'Connection lost.';
    console.log(chalk.yellow(`\n  ${timestamp()} ${message} Reconnecting…`));
    if (reason === 'io server disconnect') socket.connect();
  });

  socket.on('webhook', (event: { id: string }) => enqueue(event.id));

  const shutdown = () => {
    console.log(chalk.dim('\n  Disconnecting...\n'));
    socket.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function printIngressUrls(config: HookdashConfig, endpointId?: string): Promise<void> {
  try {
    const endpoints = await apiRequest<Endpoint[]>('/endpoints', { config });
    const shown = endpointId ? endpoints.filter((e) => e.id === endpointId) : endpoints;
    if (shown.length === 0 && config.ingressSlug) {
      console.log(`  Ingress URL: ${chalk.cyan(`${ingressBase(config)}/in/${config.ingressSlug}`)}`);
    }
    for (const ep of shown) {
      const slug = ep.ingressSlug ?? config.ingressSlug;
      if (slug) console.log(`  ${chalk.dim(ep.name.padEnd(20))} ${chalk.cyan(`${ingressBase(config)}/in/${slug}`)}`);
    }
  } catch {
    if (config.ingressSlug) {
      console.log(`  Ingress URL: ${chalk.cyan(`${ingressBase(config)}/in/${config.ingressSlug}`)}`);
    }
  }
  console.log(chalk.dim('\n  Ready. Waiting for webhooks...\n'));
}
