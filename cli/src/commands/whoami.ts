import chalk from 'chalk';
import { loadConfig } from '../config/store.js';

interface MeResponse {
  email: string;
  ingressSlug: string;
  createdAt: string;
}

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.token) {
    console.log(chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${config.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `HTTP ${res.status}`;
      console.log(chalk.red(`\n  Failed to fetch user info: ${message}\n`));
      process.exit(1);
    }

    const user = (await res.json()) as MeResponse;

    console.log();
    console.log(chalk.bold('  Current User'));
    console.log(chalk.dim('  ────────────────────'));
    console.log(`  ${chalk.cyan('Email:')}          ${user.email}`);
    console.log(`  ${chalk.cyan('Ingress Slug:')}   ${user.ingressSlug || chalk.dim('—')}`);
    console.log(`  ${chalk.cyan('Created:')}        ${new Date(user.createdAt).toLocaleDateString()}`);
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n  Connection failed: ${message}`));
    console.log(chalk.dim('  Is the Hookdash API reachable?\n'));
    process.exit(1);
  }
}
