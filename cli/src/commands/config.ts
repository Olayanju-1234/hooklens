import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

export function configCommand(): void {
  const config = loadConfig();

  console.log(chalk.bold('\nHookdash Configuration\n'));

  const maskedToken = config.token
    ? config.token.slice(0, 10) + '...'
    : chalk.dim('(not set)');

  const ingressSlug = config.ingressSlug || chalk.dim('(not set)');
  const ingressUrl = config.ingressSlug
    ? config.apiUrl.replace('/api', '') + '/in/' + config.ingressSlug
    : chalk.dim('(not set)');

  console.log(`  API URL:      ${chalk.cyan(config.apiUrl)}`);
  console.log(`  WS URL:       ${chalk.cyan(config.wsUrl)}`);
  console.log(`  Token:        ${maskedToken}`);
  console.log(`  Ingress Slug: ${ingressSlug}`);
  console.log(`  Ingress URL:  ${ingressUrl}`);
  console.log();

  if (!config.token) {
    console.log(chalk.yellow('  Not authenticated. Run `hookdash login` to get started.\n'));
  }
}
