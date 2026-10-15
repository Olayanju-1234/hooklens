import chalk from 'chalk';
import { ingressBase } from '../config/store.js';
import { apiRequest, failWith, requireAuth } from '../config/http.js';

interface Endpoint {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  ingressSlug?: string;
  createdAt: string;
}

export async function endpointsCommand(): Promise<void> {
  const config = requireAuth();

  let endpoints: Endpoint[];
  try {
    endpoints = await apiRequest<Endpoint[]>('/endpoints', { config });
  } catch (err) {
    failWith(err, 'fetch endpoints');
  }

  if (!endpoints.length) {
    console.log(chalk.dim('\n  No endpoints found. Create one in the dashboard.\n'));
    return;
  }

  console.log();
  for (const ep of endpoints) {
    const state = ep.isActive ? chalk.green('active') : chalk.dim('paused');
    console.log(`  ${chalk.bold(ep.name)} ${chalk.dim(`(${ep.provider})`)} ${state}`);
    console.log(chalk.dim(`    id      ${ep.id}`));
    if (ep.ingressSlug) {
      console.log(`    ingress ${chalk.cyan(`${ingressBase(config)}/in/${ep.ingressSlug}`)}`);
    }
  }
  console.log();
}
