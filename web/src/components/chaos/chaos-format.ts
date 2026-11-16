import type { ChaosFaults, ChaosKind } from "@/lib/api";

export function pct(p: number | undefined): string {
  return `${Math.round((p ?? 0) * 100)}%`;
}

export function secs(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
  return ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One line naming the faults that are switched on, e.g. "duplicates 50% · stale replay 100%". */
export function faultSummary(f: Partial<ChaosFaults>): string {
  const parts: string[] = [];
  if (f.duplicateProbability) parts.push(`duplicates ${pct(f.duplicateProbability)}`);
  if (f.delayProbability) parts.push(`delays ${pct(f.delayProbability)}`);
  if (f.reorderProbability) parts.push(`reordering ${pct(f.reorderProbability)}`);
  if (f.staleProbability) parts.push(`stale replays ${pct(f.staleProbability)}`);
  return parts.join(" · ") || "no faults";
}

/** How a delivery was shaped, in a few words. */
export function kindLabel(kind: ChaosKind | null, seq: number): string {
  if (seq > 0) return kind === "stale" ? "stale replay" : `duplicate ${seq}`;
  if (kind === "delay") return "delayed";
  if (kind === "reorder") return "held back";
  return "real";
}
