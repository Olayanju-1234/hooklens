import chalk from 'chalk';
import { clearConfig } from '../config/store.js';

export function logoutCommand(): void {
  clearConfig();

  console.log(chalk.green('\n  Logged out. Credentials cleared.\n'));
}
