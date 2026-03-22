import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

export async function replayCommand(eventId: string): Promise<void> {
  const config = loadConfig();

  if (!config.token) {
    console.log(chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'));
    process.exit(1);
  }

  if (!eventId.trim()) {
    console.log(chalk.red('\n  Event ID is required.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.apiUrl}/events/${eventId}/replay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `HTTP ${res.status}`;
      console.log(chalk.red(`\n  Replay failed: ${message}\n`));
      process.exit(1);
    }

    console.log(chalk.green(`\n  Event ${chalk.bold(eventId)} replayed successfully.\n`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  Connection failed: ${message}`));
    console.log(chalk.dim('  Is the Hookdash API reachable?\n'));
    process.exit(1);
  }
}
