import * as readline from 'readline';
import chalk from 'chalk';
import { ingressBase, loadConfig, saveConfig } from '../config/store.js';
import { apiRequest, failWith } from '../config/http.js';

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden) {
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode?.(true);
      let input = '';

      const onData = (char: Buffer) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          stdin.setRawMode?.(false);
          rl.close();
          process.exit();
        } else if (c === '\u007F') {
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      };

      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

interface LoginOptions {
  apiKey?: string;
  apiUrl?: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Endpoint {
  id: string;
  name: string;
}

export async function loginCommand(options: LoginOptions = {}): Promise<void> {
  if (options.apiUrl) {
    const apiUrl = options.apiUrl.replace(/\/$/, '');
    saveConfig({ apiUrl, wsUrl: apiUrl.replace(/\/api$/, '') });
  }
  const config = loadConfig();

  if (options.apiKey) {
    await loginWithApiKey(options.apiKey.trim(), config.apiUrl);
    return;
  }

  console.log(chalk.bold('\nHookdash Login\n'));
  console.log(chalk.dim('  Signed up with Google or GitHub? Create an API key in Settings and run `hookdash login --api-key <key>`.\n'));

  const email = await prompt('  Email: ');
  if (!email.trim()) {
    console.log(chalk.red('\nEmail is required.'));
    process.exit(1);
  }
  const password = await prompt('  Password: ', true);
  if (!password.trim()) {
    console.log(chalk.red('\nPassword is required.'));
    process.exit(1);
  }
  console.log();

  try {
    const session = await apiRequest<{ accessToken: string; ingressSlug: string }>(
      '/auth/login',
      { method: 'POST', body: { email: email.trim(), password }, config: { ...config, token: null, apiKey: null } },
    );
    const authed = { ...config, token: session.accessToken, apiKey: null, workspaceId: null };
    const workspaces = await apiRequest<Workspace[]>('/workspaces', { config: authed });
    saveConfig({
      token: session.accessToken,
      apiKey: null,
      ingressSlug: session.ingressSlug,
      workspaceId: workspaces[0]?.id ?? null,
    });

    console.log(chalk.green('  Logged in successfully.'));
    if (workspaces[0]) console.log(chalk.dim(`  Workspace: ${workspaces[0].name}`));
    console.log(chalk.dim(`  Ingress URL: ${ingressBase(config)}/in/${session.ingressSlug}`));
    console.log();
  } catch (err) {
    failWith(err, 'log in');
  }
}

async function loginWithApiKey(apiKey: string, apiUrl: string): Promise<void> {
  try {
    // The key is pinned to its workspace, so listing endpoints proves it works
    const config = { ...loadConfig(), apiUrl, token: null, apiKey, workspaceId: null };
    const endpoints = await apiRequest<Endpoint[]>('/endpoints', { config });
    saveConfig({ token: null, apiKey, ingressSlug: null, workspaceId: null });
    console.log(chalk.green('\n  Logged in with API key.'));
    console.log(chalk.dim(`  ${endpoints.length} endpoint${endpoints.length === 1 ? '' : 's'} in this key's workspace.\n`));
  } catch (err) {
    failWith(err, 'log in with API key');
  }
}
