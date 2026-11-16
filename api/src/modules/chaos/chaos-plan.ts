import { createHash } from 'crypto';
import type { ChaosKind } from '../../entities/forward-result.entity.js';

/** A stale copy is signed this far in the past, beyond the 5-minute tolerance the Hookdash SDK and Stripe's libraries default to. */
export const STALE_AGE_MS = 10 * 60_000;
/** A stale copy follows the real delivery by this much, so there is usually a delivered event to replay. */
export const STALE_AFTER_MS = 30_000;
export const MAX_DELAY_MS = 15 * 60_000;
/** No chaos job sits in Redis longer than this. */
export const MAX_SCHEDULE_MS = 30 * 60_000;
export const MAX_EXTRAS_PER_TARGET = 4;
export const MAX_EXTRAS_PER_EVENT = 8;
export const MAX_EXTRAS_PER_WORKSPACE_MINUTE = 60;

export interface ChaosFaults {
  duplicateProbability: number;
  duplicateCopies: number;
  duplicateGapMs: number;
  delayProbability: number;
  delayMinMs: number;
  delayMaxMs: number;
  reorderProbability: number;
  reorderWindowMs: number;
  staleProbability: number;
}

/** What a delivery job carries: seq 0 is the real delivery, 1..n are extra copies. */
export interface ChaosDelivery {
  kind: ChaosKind;
  seq: number;
  delayMs: number;
  // Set for a scenario run, whose copies go out whatever the target's chaos settings say
  runId?: string;
}

export interface ChaosPlan {
  primary: { kind: 'delay' | 'reorder' | null; delayMs: number };
  extras: ChaosDelivery[];
}

export function isExtraCopy(chaos: ChaosDelivery | undefined): boolean {
  return (chaos?.seq ?? 0) > 0;
}

/** Deterministic PRNG (sfc32) seeded from the seed, event and target, so a plan can be reproduced. */
export function chaosRng(
  seed: string,
  eventId: string,
  targetKey: string,
): () => number {
  const h = createHash('sha256')
    .update(`${seed}:${eventId}:${targetKey}`)
    .digest();
  let a = h.readUInt32LE(0);
  let b = h.readUInt32LE(4);
  let c = h.readUInt32LE(8);
  let d = h.readUInt32LE(12);
  return () => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

const between = (min: number, max: number, r: number) =>
  Math.round(min + (max - min) * r);
const clamp = (ms: number) => Math.min(Math.max(ms, 0), MAX_SCHEDULE_MS);

export function planChaos(faults: ChaosFaults, rng: () => number): ChaosPlan {
  // Every draw happens in a fixed order whatever the settings, so one seed always gives one plan
  const delayHit = rng() < faults.delayProbability;
  const delayPick = rng();
  const reorderHit = rng() < faults.reorderProbability;
  const reorderPick = rng();
  const duplicateHit = rng() < faults.duplicateProbability;
  const staleHit = rng() < faults.staleProbability;

  const primary: ChaosPlan['primary'] = delayHit
    ? {
        kind: 'delay',
        delayMs: between(
          faults.delayMinMs,
          Math.min(faults.delayMaxMs, MAX_DELAY_MS),
          delayPick,
        ),
      }
    : reorderHit
      ? {
          kind: 'reorder',
          delayMs: between(1000, faults.reorderWindowMs, reorderPick),
        }
      : { kind: null, delayMs: 0 };

  const extras: ChaosDelivery[] = [];
  if (duplicateHit) {
    for (let i = 1; i <= faults.duplicateCopies; i++) {
      extras.push({
        kind: 'duplicate',
        seq: extras.length + 1,
        delayMs: clamp(primary.delayMs + i * faults.duplicateGapMs),
      });
    }
  }
  if (staleHit) {
    extras.push({
      kind: 'stale',
      seq: extras.length + 1,
      delayMs: clamp(primary.delayMs + STALE_AFTER_MS),
    });
  }
  return { primary, extras: extras.slice(0, MAX_EXTRAS_PER_TARGET) };
}

/** Keeps the first `allowed` extra copies across targets, in target order. */
export function capExtras(
  plans: Map<string, ChaosPlan>,
  allowed: number,
): Map<string, ChaosPlan> {
  let left = Math.max(allowed, 0);
  const capped = new Map<string, ChaosPlan>();
  for (const [key, plan] of plans) {
    const extras = plan.extras.slice(0, left);
    left -= extras.length;
    capped.set(key, { ...plan, extras });
  }
  return capped;
}

export function countExtras(plans: Map<string, ChaosPlan>): number {
  let total = 0;
  for (const plan of plans.values()) total += plan.extras.length;
  return total;
}
