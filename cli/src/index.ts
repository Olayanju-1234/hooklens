#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { listenCommand } from './commands/listen.js';
import { configCommand } from './commands/config.js';
import { logoutCommand } from './commands/logout.js';

const program = new Command();

program
  .name('hookdash')
  .description('CLI tunnel for Hookdash webhook debugger')
  .version('0.1.0');

program
  .command('login')
  .description('Authenticate with Hookdash')
  .action(async () => {
    await loginCommand();
  });

program
  .command('listen')
  .description('Start forwarding webhooks to your local server')
  .requiredOption('-p, --port <number>', 'Local port to forward webhooks to', '3000')
  .option('--path <string>', 'Local path prefix (e.g., /webhooks)')
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

program.parse();
