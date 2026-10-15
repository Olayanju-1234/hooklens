import chalk from 'chalk';
import { isAuthenticated, loadConfig, type HookdashConfig } from './store.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Auth headers for the stored credentials: a JWT from `login`, or an API key. */
export function authHeaders(config: HookdashConfig): Record<string, string> {
  if (config.apiKey) return { 'x-api-key': config.apiKey };
  const headers: Record<string, string> = {};
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.workspaceId) headers['x-workspace-id'] = config.workspaceId;
  return headers;
}

export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; config?: HookdashConfig } = {},
): Promise<T> {
  const config = init.config ?? loadConfig();
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...authHeaders(config),
      ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = (data as { message?: string | string[] } | undefined)
      ?.message;
    throw new ApiError(
      Array.isArray(message) ? message.join(', ') : message || `HTTP ${res.status}`,
      res.status,
    );
  }
  return data as T;
}

/** Exits with a hint when there are no stored credentials. */
export function requireAuth(): HookdashConfig {
  const config = loadConfig();
  if (!isAuthenticated(config)) {
    console.log(
      chalk.red('\n  Not authenticated. Run `hookdash login` first.\n'),
    );
    process.exit(1);
  }
  return config;
}

export function failWith(err: unknown, action: string): never {
  const message = err instanceof Error ? err.message : String(err);
  console.log(chalk.red(`\n  Failed to ${action}: ${message}`));
  if (err instanceof ApiError && err.status === 401) {
    console.log(chalk.yellow('  Your session may have expired. Run `hookdash login` again.'));
  }
  console.log();
  process.exit(1);
}
