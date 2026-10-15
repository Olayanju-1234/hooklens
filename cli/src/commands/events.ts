import chalk from 'chalk';
import { apiRequest, failWith, requireAuth } from '../config/http.js';

interface EventsOptions {
  limit?: string;
  provider?: string;
  status?: string;
  type?: string;
  endpoint?: string;
}

interface WebhookEvent {
  id: string;
  method: string;
  eventType: string | null;
  provider: string | null;
  forwardStatus: string;
  receivedAt: string;
}

export async function eventsCommand(options: EventsOptions): Promise<void> {
  const config = requireAuth();

  const params = new URLSearchParams();
  params.set('limit', options.limit ?? '20');
  if (options.provider) params.set('provider', options.provider);
  if (options.status) params.set('forwardStatus', options.status);
  if (options.type) params.set('eventType', options.type);
  if (options.endpoint) params.set('endpointId', options.endpoint);

  let events: WebhookEvent[];
  try {
    events = (await apiRequest<{ items: WebhookEvent[] }>(`/events?${params}`, { config })).items;
  } catch (err) {
    failWith(err, 'fetch events');
  }

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
    const time = new Date(event.receivedAt).toLocaleString().padEnd(22);
    const method = event.method.toUpperCase().padEnd(8);
    const eventType = (event.eventType || '—').padEnd(24);
    const provider = (event.provider || '—').padEnd(14);
    const color =
      event.forwardStatus === 'forwarded'
        ? chalk.green
        : event.forwardStatus === 'failed' || event.forwardStatus === 'blocked'
          ? chalk.red
          : chalk.dim;
    console.log(`  ${time}  ${method}  ${eventType}  ${provider}  ${color(event.forwardStatus.padEnd(12))}  ${chalk.dim(event.id)}`);
  }
  console.log();
}
