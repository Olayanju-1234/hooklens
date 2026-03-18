import { io, Socket } from 'socket.io-client';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/store.js';

interface ListenOptions {
  port: string;
  path?: string;
  apiUrl?: string;
  wsUrl?: string;
}

interface WebhookEvent {
  id: string;
  provider?: string;
  eventType?: string;
  method?: string;
}

interface EventDetail {
  id: string;
  provider: string;
  eventType: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function timestamp(): string {
  return chalk.dim(new Date().toLocaleTimeString());
}

async function fetchEventDetail(apiUrl: string, token: string, eventId: string): Promise<EventDetail | null> {
  try {
    const res = await fetch(`${apiUrl}/events/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    return (await res.json()) as EventDetail;
  } catch {
    return null;
  }
}

async function forwardToLocal(
  event: EventDetail,
  port: string,
  pathPrefix: string
): Promise<{ status: number; statusText: string; duration: number }> {
  const url = `http://localhost:${port}${pathPrefix}`;
  const start = Date.now();

  const headers: Record<string, string> = {};
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      const lower = key.toLowerCase();
      // Skip hop-by-hop and host headers
      if (['host', 'content-length', 'transfer-encoding', 'connection'].includes(lower)) continue;
      headers[key] = value;
    }
  }

  headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/json';

  const body = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);

  const res = await fetch(url, {
    method: event.method || 'POST',
    headers,
    body,
  });

  return {
    status: res.status,
    statusText: res.statusText,
    duration: Date.now() - start,
  };
}

export async function listenCommand(options: ListenOptions): Promise<void> {
  const config = loadConfig();

  const apiUrl = options.apiUrl || config.apiUrl;
  const wsUrl = options.wsUrl || config.wsUrl;
  const token = config.token;
  const ingressSlug = config.ingressSlug;
  const port = options.port;
  const pathPrefix = options.path || '';

  if (!token) {
    console.log(chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'));
    process.exit(1);
  }

  if (!ingressSlug) {
    console.log(
      chalk.red('\n  No ingress configured. Create one in the dashboard and run `hookdash login` again.\n')
    );
    process.exit(1);
  }

  const spinner = ora('Connecting to Hookdash...').start();

  const socket: Socket = io(`${wsUrl}/live`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    spinner.succeed('Connected to Hookdash');

    const ingressUrl = apiUrl.replace('/api', '') + '/in/' + ingressSlug;

    console.log();
    console.log(`  Forwarding webhooks to ${chalk.bold('→')} ${chalk.cyan(`http://localhost:${port}${pathPrefix}`)}`);
    console.log(`  Ingress URL: ${chalk.cyan(ingressUrl)}`);
    console.log();
    console.log(chalk.dim('  Ready. Waiting for webhooks...\n'));
  });

  socket.on('connect_error', (err) => {
    if (spinner.isSpinning) {
      spinner.fail('Failed to connect to Hookdash');
      console.log(chalk.dim(`  ${err.message}`));

      if (err.message.includes('401') || err.message.includes('auth') || err.message.includes('unauthorized')) {
        console.log(chalk.yellow('  Your token may have expired. Try `hookdash login` again.'));
      }

      console.log();
      process.exit(1);
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      console.log(chalk.red(`\n  ${timestamp()} Disconnected by server. Reconnecting...`));
    } else {
      console.log(chalk.yellow(`\n  ${timestamp()} Connection lost. Reconnecting...`));
    }
  });

  socket.io.on('reconnect', () => {
    console.log(chalk.green(`  ${timestamp()} Reconnected.\n`));
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    if (attempt <= 3 || attempt % 5 === 0) {
      console.log(chalk.dim(`  ${timestamp()} Reconnection attempt ${attempt}...`));
    }
  });

  socket.on('webhook', async (event: WebhookEvent) => {
    const eventType = event.eventType || 'unknown';
    const provider = event.provider || 'unknown';
    const method = event.method || 'POST';

    // Fetch full event details
    const detail = await fetchEventDetail(apiUrl, token, event.id);

    if (!detail) {
      console.log(
        `  ${timestamp()} ${chalk.red('✗')} ${method} ${chalk.bold(eventType)} ${chalk.dim(`(${provider})`)} — ${chalk.red('Failed to fetch event details')}`
      );
      return;
    }

    try {
      const result = await forwardToLocal(detail, port, pathPrefix);

      const statusColor = result.status >= 200 && result.status < 300 ? chalk.green : chalk.red;

      console.log(
        `  ${timestamp()} ${chalk.green('→')} ${method} ${chalk.bold(eventType)} ${chalk.dim(`(${provider})`)} — ${statusColor(`${result.status} ${result.statusText}`)} ${chalk.dim(`(${result.duration}ms)`)}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let hint = '';

      if (message.includes('ECONNREFUSED')) {
        hint = ' (is your server running?)';
      } else if (message.includes('ECONNRESET')) {
        hint = ' (connection reset by server)';
      } else if (message.includes('ETIMEDOUT')) {
        hint = ' (request timed out)';
      }

      console.log(
        `  ${timestamp()} ${chalk.red('✗')} ${method} ${chalk.bold(eventType)} ${chalk.dim(`(${provider})`)} — ${chalk.red(message)}${chalk.yellow(hint)}`
      );
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log(chalk.dim('\n  Disconnecting...\n'));
    socket.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
