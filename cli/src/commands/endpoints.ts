import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

interface Endpoint {
  _id: string;
  name: string;
  provider: string;
  active: boolean;
  forwardUrl: string;
}

export async function endpointsCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.token) {
    console.log(chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.apiUrl}/endpoints`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `HTTP ${res.status}`;
      console.log(chalk.red(`\n  Failed to fetch endpoints: ${message}\n`));
      process.exit(1);
    }

    const endpoints = (await res.json()) as Endpoint[];

    if (!endpoints.length) {
      console.log(chalk.dim('\n  No endpoints found.\n'));
      return;
    }

    const header = [
      'NAME'.padEnd(24),
      'PROVIDER'.padEnd(14),
      'ACTIVE'.padEnd(8),
      'FORWARD URL'.padEnd(36),
      'ID',
    ].join('  ');

    console.log();
    console.log(chalk.bold(`  ${header}`));
    console.log(chalk.dim(`  ${'─'.repeat(header.length)}`));

    for (const ep of endpoints) {
      const name = (ep.name || '—').padEnd(24);
      const provider = (ep.provider || '—').padEnd(14);
      const active = ep.active
        ? chalk.green('yes'.padEnd(8))
        : chalk.red('no'.padEnd(8));
      const forwardUrl = (ep.forwardUrl || '—').padEnd(36);
      const id = chalk.dim(ep._id.slice(0, 8));

      console.log(`  ${name}  ${provider}  ${active}  ${forwardUrl}  ${id}`);
    }

    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  Connection failed: ${message}`));
    console.log(chalk.dim('  Is the Hookdash API reachable?\n'));
    process.exit(1);
  }
}
