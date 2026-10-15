import chalk from 'chalk';
import { apiRequest, failWith, requireAuth } from '../config/http.js';

interface MeResponse {
  email: string;
  ingressSlug: string;
  oauthProvider: string | null;
}

export async function whoamiCommand(): Promise<void> {
  const config = requireAuth();
  try {
    if (config.apiKey) {
      // API keys act in their own workspace and have no user profile endpoint
      const endpoints = await apiRequest<unknown[]>('/endpoints', { config });
      console.log(chalk.bold('\n  Authenticated with an API key'));
      console.log(chalk.dim(`  Key ${config.apiKey.slice(0, 12)}… · ${endpoints.length} endpoint(s) in its workspace\n`));
      return;
    }
    const me = await apiRequest<MeResponse>('/auth/me', { config });
    console.log(chalk.bold(`\n  ${me.email}`));
    console.log(chalk.dim(`  Signed in with ${me.oauthProvider ?? 'email and password'}`));
    console.log(chalk.dim(`  API: ${config.apiUrl}\n`));
  } catch (err) {
    failWith(err, 'fetch account');
  }
}
