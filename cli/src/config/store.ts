import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HookdashConfig {
  apiUrl: string;
  wsUrl: string;
  token: string | null;
  ingressSlug: string | null;
}

const CONFIG_DIR = path.join(os.homedir(), '.hookdash');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: HookdashConfig = {
  apiUrl: 'https://hookdash-api.onrender.com/api',
  wsUrl: 'https://hookdash-api.onrender.com',
  token: null,
  ingressSlug: null,
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
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
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(partial: Partial<HookdashConfig>): void {
  ensureConfigDir();

  const current = loadConfig();
  const merged = { ...current, ...partial };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
}

export function clearConfig(): void {
  ensureConfigDir();

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
}
