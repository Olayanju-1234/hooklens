import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HookdashConfig {
  apiUrl: string;
  wsUrl: string;
  token: string | null;
  apiKey: string | null;
  ingressSlug: string | null;
  workspaceId: string | null;
}

const CONFIG_DIR = path.join(os.homedir(), '.hookdash');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: HookdashConfig = {
  apiUrl: 'https://api.hookdash.ojusentinel.com/api',
  wsUrl: 'https://api.hookdash.ojusentinel.com',
  token: null,
  apiKey: null,
  ingressSlug: null,
  workspaceId: null,
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): HookdashConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const stored = JSON.parse(raw) as Partial<HookdashConfig>;
    const config = { ...DEFAULT_CONFIG, ...stored };
    // Configs written before the move off Render still point at the old host
    if (config.apiUrl.includes('onrender.com')) {
      config.apiUrl = DEFAULT_CONFIG.apiUrl;
      config.wsUrl = DEFAULT_CONFIG.wsUrl;
    }
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config: HookdashConfig): void {
  ensureConfigDir();
  // The file holds a token or API key, so keep it private to this user
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.chmodSync(CONFIG_FILE, 0o600);
}

export function saveConfig(partial: Partial<HookdashConfig>): void {
  writeConfig({ ...loadConfig(), ...partial });
}

export function clearConfig(): void {
  const { apiUrl, wsUrl } = loadConfig();
  writeConfig({ ...DEFAULT_CONFIG, apiUrl, wsUrl });
}

export function isAuthenticated(config: HookdashConfig): boolean {
  return Boolean(config.token || config.apiKey);
}

export function ingressBase(config: HookdashConfig): string {
  return config.apiUrl.replace(/\/api\/?$/, '');
}
