#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { listenCommand } from './commands/listen.js';
import { configCommand } from './commands/config.js';
import { logoutCommand } from './commands/logout.js';
import { eventsCommand } from './commands/events.js';
import { replayCommand } from './commands/replay.js';
import { endpointsCommand } from './commands/endpoints.js';
import { whoamiCommand } from './commands/whoami.js';

const program = new Command();

program
  .name('hookdash')
  .description('Forward Hookdash webhooks to localhost and manage your endpoints')
  .version('0.2.0');

program
  .command('login')
  .description('Authenticate with Hookdash (email and password, or an API key)')
  .option('--api-key <key>', 'Log in with an API key (for Google or GitHub accounts, and CI)')
  .option('--api-url <url>', 'Hookdash API URL, e.g. http://localhost:3000/api')
  .action(async (options) => {
    await loginCommand(options);
  });

program
  .command('listen')
  .description('Forward live webhooks to your local server and report results back')
  .requiredOption('-p, --port <number>', 'Local port to forward webhooks to', '3000')
  .option('--path <string>', 'Local path (e.g., /webhooks)')
  .option('--forward-to <url>', 'Full URL to forward to instead of localhost:<port><path>')
  .option('--endpoint <id>', 'Only forward events for this endpoint')
  .option('--since <duration>', 'First catch up on events from this long ago (e.g. 10m, 2h)')
  .option('--api-url <string>', 'Override Hookdash API URL')
  .option('--ws-url <string>', 'Override Hookdash WebSocket URL')
  .action(async (options) => {
    await listenCommand(options);
  });

program
  .command('config')
  .description('Show current Hookdash configuration')
  .action(() => {
    configCommand();
  });

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    logoutCommand();
  });

program
  .command('events')
  .description('List recent webhook events')
  .option('-l, --limit <number>', 'Number of events to show', '20')
  .option('--provider <string>', 'Filter by provider')
  .option('--status <string>', 'Filter by forward status')
  .option('--type <string>', 'Filter by event type')
  .option('--endpoint <id>', 'Filter by endpoint')
  .action(async (options) => {
    await eventsCommand(options);
  });

program
  .command('replay <event-id>')
  .description('Replay a webhook event')
  .action(async (eventId) => {
    await replayCommand(eventId);
  });

program
  .command('endpoints')
  .description('List webhook endpoints')
  .action(async () => {
    await endpointsCommand();
  });

program
  .command('whoami')
  .description('Show current authenticated user')
  .action(async () => {
    await whoamiCommand();
  });

program.parse();
