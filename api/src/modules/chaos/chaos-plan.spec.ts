import {
  MAX_DELAY_MS,
  MAX_EXTRAS_PER_TARGET,
  MAX_SCHEDULE_MS,
  STALE_AFTER_MS,
  capExtras,
  chaosRng,
  countExtras,
  isExtraCopy,
  planChaos,
  type ChaosFaults,
  type ChaosPlan,
} from './chaos-plan.js';

const NONE: ChaosFaults = {
  duplicateProbability: 0,
  duplicateCopies: 1,
  duplicateGapMs: 5000,
  delayProbability: 0,
  delayMinMs: 30_000,
  delayMaxMs: 120_000,
  reorderProbability: 0,
  reorderWindowMs: 10_000,
  staleProbability: 0,
};

const always = () => 0;
const never = () => 0.999_999;

describe('chaosRng', () => {
  it('gives the same sequence for the same seed, event and target', () => {
    const a = chaosRng('seed-1', 'evt-1', 'dest-1');
    const b = chaosRng('seed-1', 'evt-1', 'dest-1');
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
    for (const n of seqA) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('gives different sequences for a different seed, event or target', () => {
    const base = Array.from({ length: 5 }, chaosRng('s', 'e', 't'));
    expect(Array.from({ length: 5 }, chaosRng('s2', 'e', 't'))).not.toEqual(
      base,
    );
    expect(Array.from({ length: 5 }, chaosRng('s', 'e2', 't'))).not.toEqual(
      base,
    );
    expect(Array.from({ length: 5 }, chaosRng('s', 'e', 't2'))).not.toEqual(
      base,
    );
  });
});

describe('planChaos', () => {
  it('plans nothing when every probability is 0', () => {
    const plan = planChaos(NONE, always);
    expect(plan).toEqual({ primary: { kind: null, delayMs: 0 }, extras: [] });
  });

  it('plans nothing when the draws miss', () => {
    const faults = {
      ...NONE,
      duplicateProbability: 0.5,
      delayProbability: 0.5,
      staleProbability: 0.5,
    };
    expect(planChaos(faults, never).extras).toEqual([]);
    expect(planChaos(faults, never).primary.kind).toBeNull();
  });

  it('plans duplicate copies with increasing gaps after the real delivery', () => {
    const plan = planChaos(
      {
        ...NONE,
        duplicateProbability: 1,
        duplicateCopies: 3,
        duplicateGapMs: 2000,
      },
      always,
    );
    expect(plan.primary.kind).toBeNull();
    expect(plan.extras).toEqual([
      { kind: 'duplicate', seq: 1, delayMs: 2000 },
      { kind: 'duplicate', seq: 2, delayMs: 4000 },
      { kind: 'duplicate', seq: 3, delayMs: 6000 },
    ]);
  });

  it('holds the real delivery within the delay range, and copies follow it', () => {
    const plan = planChaos(
      {
        ...NONE,
        delayProbability: 1,
        delayMinMs: 60_000,
        delayMaxMs: 120_000,
        duplicateProbability: 1,
        duplicateGapMs: 1000,
      },
      chaosRng('seed', 'evt', 'fallback'),
    );
    expect(plan.primary.kind).toBe('delay');
    expect(plan.primary.delayMs).toBeGreaterThanOrEqual(60_000);
    expect(plan.primary.delayMs).toBeLessThanOrEqual(120_000);
    expect(plan.extras[0].delayMs).toBe(plan.primary.delayMs + 1000);
  });

  it('never holds a delivery longer than the 15-minute cap', () => {
    const plan = planChaos(
      {
        ...NONE,
        delayProbability: 1,
        delayMinMs: 900_000,
        delayMaxMs: 5_000_000,
      },
      () => 0.99,
    );
    expect(plan.primary.delayMs).toBeLessThanOrEqual(MAX_DELAY_MS);
  });

  it('keeps every scheduled copy inside the Redis residency cap', () => {
    const plan = planChaos(
      {
        ...NONE,
        delayProbability: 1,
        delayMinMs: MAX_DELAY_MS,
        delayMaxMs: MAX_DELAY_MS,
        duplicateProbability: 1,
        duplicateCopies: 3,
        duplicateGapMs: 300_000,
        staleProbability: 1,
      },
      always,
    );
    for (const extra of plan.extras) {
      expect(extra.delayMs).toBeLessThanOrEqual(MAX_SCHEDULE_MS);
    }
  });

  it('uses reorder jitter only when no delay was drawn', () => {
    const reordered = planChaos(
      { ...NONE, reorderProbability: 1, reorderWindowMs: 20_000 },
      () => 0.5,
    );
    expect(reordered.primary.kind).toBe('reorder');
    expect(reordered.primary.delayMs).toBeGreaterThanOrEqual(1000);
    expect(reordered.primary.delayMs).toBeLessThanOrEqual(20_000);

    const delayed = planChaos(
      { ...NONE, reorderProbability: 1, delayProbability: 1 },
      always,
    );
    expect(delayed.primary.kind).toBe('delay');
  });

  it('plans one stale replay after the real delivery, numbered after the duplicates', () => {
    const plan = planChaos(
      {
        ...NONE,
        duplicateProbability: 1,
        duplicateCopies: 2,
        staleProbability: 1,
      },
      always,
    );
    expect(plan.extras.map((e) => [e.kind, e.seq])).toEqual([
      ['duplicate', 1],
      ['duplicate', 2],
      ['stale', 3],
    ]);
    expect(plan.extras[2].delayMs).toBe(STALE_AFTER_MS);
  });

  it('never plans more than the per-target cap of extra copies', () => {
    const plan = planChaos(
      {
        ...NONE,
        duplicateProbability: 1,
        duplicateCopies: 3,
        staleProbability: 1,
      },
      always,
    );
    expect(plan.extras.length).toBeLessThanOrEqual(MAX_EXTRAS_PER_TARGET);
  });

  it('gives the same plan for the same seed, event and target', () => {
    const faults = {
      ...NONE,
      duplicateProbability: 0.5,
      duplicateCopies: 2,
      delayProbability: 0.5,
      reorderProbability: 0.5,
      staleProbability: 0.5,
    };
    for (const eventId of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      expect(planChaos(faults, chaosRng('s', eventId, 'fallback'))).toEqual(
        planChaos(faults, chaosRng('s', eventId, 'fallback')),
      );
    }
  });

  it('keeps one draw order, so changing one probability does not reshuffle the rest', () => {
    const rngA = chaosRng('s', 'evt', 't');
    const rngB = chaosRng('s', 'evt', 't');
    const a = planChaos({ ...NONE, delayProbability: 1 }, rngA);
    const b = planChaos(
      { ...NONE, delayProbability: 1, staleProbability: 1 },
      rngB,
    );
    expect(a.primary).toEqual(b.primary);
    expect(b.extras.map((e) => e.kind)).toEqual(['stale']);
  });
});

describe('capExtras', () => {
  const plan = (n: number): ChaosPlan => ({
    primary: { kind: null, delayMs: 0 },
    extras: Array.from({ length: n }, (_, i) => ({
      kind: 'duplicate' as const,
      seq: i + 1,
      delayMs: 1000 * (i + 1),
    })),
  });

  it('keeps the first copies in target order up to the allowance', () => {
    const plans = new Map([
      ['a', plan(3)],
      ['b', plan(3)],
    ]);
    const capped = capExtras(plans, 4);
    expect(capped.get('a')!.extras).toHaveLength(3);
    expect(capped.get('b')!.extras.map((e) => e.seq)).toEqual([1]);
    expect(countExtras(capped)).toBe(4);
  });

  it('drops every copy but keeps the held real deliveries at an allowance of 0', () => {
    const held: ChaosPlan = {
      primary: { kind: 'delay', delayMs: 5000 },
      extras: plan(2).extras,
    };
    const capped = capExtras(new Map([['a', held]]), 0);
    expect(capped.get('a')).toEqual({ primary: held.primary, extras: [] });
  });
});

describe('isExtraCopy', () => {
  it('is false for ordinary and held real deliveries, true for copies', () => {
    expect(isExtraCopy(undefined)).toBe(false);
    expect(isExtraCopy({ kind: 'delay', seq: 0, delayMs: 1000 })).toBe(false);
    expect(isExtraCopy({ kind: 'duplicate', seq: 1, delayMs: 0 })).toBe(true);
  });
});
