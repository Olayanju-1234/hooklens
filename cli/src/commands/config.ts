import chalk from 'chalk';
import { ingressBase, isAuthenticated, loadConfig } from '../config/store.js';

export function configCommand(): void {
  const config = loadConfig();
  const mask = (value: string | null) => (value ? `${value.slice(0, 12)}…` : chalk.dim('(not set)'));

  console.log(chalk.bold('\nHookdash Configuration\n'));
  console.log(`  API URL:      ${chalk.cyan(config.apiUrl)}`);
  console.log(`  WS URL:       ${chalk.cyan(config.wsUrl)}`);
  console.log(`  Token:        ${mask(config.token)}`);
  console.log(`  API key:      ${mask(config.apiKey)}`);
  console.log(`  Workspace:    ${config.workspaceId ?? chalk.dim('(key workspace or not set)')}`);
  console.log(
    `  Ingress URL:  ${config.ingressSlug ? chalk.cyan(`${ingressBase(config)}/in/${config.ingressSlug}`) : chalk.dim('(see `hookdash endpoints`)')}`,
  );
  console.log();

  if (!isAuthenticated(config)) {
    console.log(chalk.yellow('  Not authenticated. Run `hookdash login` to get started.\n'));
  }
}
