import * as readline from 'readline';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config/store.js';

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

interface LoginResponse {
  token: string;
  user: {
    ingresses?: Array<{ slug: string }>;
  };
}

export async function loginCommand(): Promise<void> {
  const config = loadConfig();

  console.log(chalk.bold('\nHookdash Login\n'));

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
    const res = await fetch(`${config.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `HTTP ${res.status}`;
      console.log(chalk.red(`  Login failed: ${message}`));
      process.exit(1);
    }

    const data = (await res.json()) as LoginResponse;

    const ingressSlug = data.user?.ingresses?.[0]?.slug ?? null;

    saveConfig({
      token: data.token,
      ingressSlug,
    });

    console.log(chalk.green('  Logged in successfully.'));

    if (ingressSlug) {
      const ingressUrl = config.apiUrl.replace('/api', '') + '/in/' + ingressSlug;
      console.log(chalk.dim(`  Ingress URL: ${ingressUrl}`));
    } else {
      console.log(
        chalk.yellow('  No ingress found. Create one in the dashboard, then run `hookdash login` again.')
      );
    }

    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Connection failed: ${message}`));
    console.log(chalk.dim('  Is the Hookdash API reachable?'));
    process.exit(1);
  }
}
