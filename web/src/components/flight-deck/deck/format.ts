const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function fmtClock(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Clock time today, otherwise day and minute, so a board spanning days stays readable. */
export function fmtStamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtClock(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  return `${Math.round(ms)}ms`;
}

/** Short failure code from a forward error ("Request failed with status code 502" → "HTTP 502"). */
export function failureCode(error: string | null | undefined): string {
  if (!error) return "UNKNOWN";
  const status = /status code (\d{3})/i.exec(error) ?? /^HTTP (\d{3})/i.exec(error);
  if (status) return `HTTP ${status[1]}`;
  if (/timeout|ETIMEDOUT/i.test(error)) return "TIMEOUT";
  const sys = /\b(E[A-Z]{3,}(?:_[A-Z]+)*)\b/.exec(error);
  if (sys) return sys[1];
  if (/blocked|private|not allowed/i.test(error)) return "BLOCKED URL";
  return error.split(/[:.]/)[0].slice(0, 24).toUpperCase();
}

export const PROVIDER_CODE: Record<string, string> = {
  stripe: "STRP",
  paystack: "PSTK",
  flutterwave: "FLWV",
  mono: "MONO",
  bags: "BAGS",
  custom: "CSTM",
};

export const PROVIDERS = ["stripe", "paystack", "flutterwave", "mono", "bags", "custom"] as const;

/** Runs async jobs with a fixed number in flight, so bulk actions don't flood the API. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
