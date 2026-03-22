import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

interface EventsOptions {
  limit?: string;
  provider?: string;
  status?: string;
  type?: string;
}

interface WebhookEvent {
  _id: string;
  method: string;
  eventType: string;
  provider: string;
  forwardStatus: string;
  createdAt: string;
}

export async function eventsCommand(options: EventsOptions): Promise<void> {
  const config = loadConfig();

  if (!config.token) {
    console.log(chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'));
    process.exit(1);
  }

  const params = new URLSearchParams();
  params.set('limit', options.limit ?? '20');
  if (options.provider) params.set('provider', options.provider);
  if (options.status) params.set('status', options.status);
  if (options.type) params.set('type', options.type);

  try {
    const res = await fetch(`${config.apiUrl}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `HTTP ${res.status}`;
      console.log(chalk.red(`\n  Failed to fetch events: ${message}\n`));
      process.exit(1);
    }

    const events = (await res.json()) as WebhookEvent[];

    if (!events.length) {
      console.log(chalk.dim('\n  No events found.\n'));
      return;
    }

    const header = [
      'TIME'.padEnd(22),
      'METHOD'.padEnd(8),
      'EVENT TYPE'.padEnd(24),
      'PROVIDER'.padEnd(14),
      'STATUS'.padEnd(12),
      'ID',
    ].join('  ');

    console.log();
    console.log(chalk.bold(`  ${header}`));
    console.log(chalk.dim(`  ${'─'.repeat(header.length)}`));

    for (const event of events) {
      const time = new Date(event.createdAt).toLocaleString().padEnd(22);
      const method = event.method.toUpperCase().padEnd(8);
      const eventType = (event.eventType || '—').padEnd(24);
      const provider = (event.provider || '—').padEnd(14);
      const status = event.forwardStatus === 'success'
        ? chalk.green(event.forwardStatus.padEnd(12))
        : event.forwardStatus === 'failed'
          ? chalk.red(event.forwardStatus.padEnd(12))
          : chalk.dim((event.forwardStatus || '—').padEnd(12));
      const id = chalk.dim(event._id.slice(0, 8));

      console.log(`  ${time}  ${method}  ${eventType}  ${provider}  ${status}  ${id}`);
    }

    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  Connection failed: ${message}`));
    console.log(chalk.dim('  Is the Hookdash API reachable?\n'));
    process.exit(1);
  }
}
