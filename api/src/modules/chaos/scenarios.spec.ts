import { TestPayloadsService } from '../test-payloads/test-payloads.service.js';
import {
  MAX_EXTRAS_PER_EVENT,
  MAX_EXTRAS_PER_TARGET,
  MAX_SCHEDULE_MS,
} from './chaos-plan.js';
import {
  SCENARIOS,
  buildScenarioBodies,
  expectedDeliveries,
  findScenario,
  longestHoldMs,
} from './scenarios.js';

type Body = { event: string; data: Record<string, unknown> };

describe('chaos scenarios', () => {
  const payloads = new TestPayloadsService();

  it('has unique ids and the five scenarios from the brief', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'paystack-charge-success-3x',
      'paystack-transfer-reversed-first',
      'paystack-refund-before-charge',
      'flutterwave-charge-twice-transfer-late',
      'paystack-stale-replay',
    ]);
  });

  it('only uses event types that exist in the test-payload templates', () => {
    for (const scenario of SCENARIOS) {
      const bodies = buildScenarioBodies(scenario, payloads) as Body[];
      expect(bodies.map((b) => b.event)).toEqual(
        scenario.steps.map((s) => s.eventType),
      );
    }
  });

  it('keeps every plan inside the chaos caps', () => {
    for (const scenario of SCENARIOS) {
      const extras = scenario.steps.reduce(
        (n, s) => n + s.plan.extras.length,
        0,
      );
      expect(extras).toBeLessThanOrEqual(MAX_EXTRAS_PER_EVENT);
      for (const step of scenario.steps) {
        expect(step.plan.extras.length).toBeLessThanOrEqual(
          MAX_EXTRAS_PER_TARGET,
        );
        expect(step.plan.primary.delayMs).toBeLessThanOrEqual(MAX_SCHEDULE_MS);
        step.plan.extras.forEach((e, i) => {
          expect(e.seq).toBe(i + 1);
          expect(e.delayMs).toBeLessThanOrEqual(MAX_SCHEDULE_MS);
        });
      }
      expect(scenario.checklist.length).toBeGreaterThan(0);
    }
  });

  it('delivers charge.success three times with one real delivery and two duplicates', () => {
    const scenario = findScenario('paystack-charge-success-3x')!;
    expect(expectedDeliveries(scenario)).toBe(3);
    expect(scenario.steps[0].plan.extras.map((e) => e.kind)).toEqual([
      'duplicate',
      'duplicate',
    ]);
  });

  it('links transfer.reversed to the same transfer as transfer.success, and lets it overtake', () => {
    const scenario = findScenario('paystack-transfer-reversed-first')!;
    const [success, reversed] = buildScenarioBodies(
      scenario,
      payloads,
    ) as Body[];
    for (const key of ['id', 'reference', 'transfer_code', 'amount']) {
      expect(reversed.data[key]).toEqual(success.data[key]);
    }
    expect(scenario.steps[0].plan.primary).toEqual({
      kind: 'reorder',
      delayMs: 20_000,
    });
    expect(scenario.steps[1].plan.primary.delayMs).toBe(0);
  });

  it('points refund.processed at the held-back charge', () => {
    const scenario = findScenario('paystack-refund-before-charge')!;
    const [charge, refund] = buildScenarioBodies(scenario, payloads) as Body[];
    expect(refund.data.transaction_reference).toBe(charge.data.reference);
    expect(refund.data.deducted_amount).toBe(charge.data.amount);
    expect(scenario.steps[0].plan.primary.delayMs).toBeGreaterThan(
      scenario.steps[1].plan.primary.delayMs,
    );
  });

  it('holds Flutterwave transfer.completed for two minutes', () => {
    const scenario = findScenario('flutterwave-charge-twice-transfer-late')!;
    expect(scenario.steps[1].plan.primary).toEqual({
      kind: 'delay',
      delayMs: 120_000,
    });
    expect(longestHoldMs(scenario)).toBe(120_000);
    expect(expectedDeliveries(scenario)).toBe(3);
  });

  it('builds fresh, unlinked events for each run', () => {
    const scenario = findScenario('paystack-charge-success-3x')!;
    const [a] = buildScenarioBodies(scenario, payloads) as Body[];
    const [b] = buildScenarioBodies(scenario, payloads) as Body[];
    expect(a.data.reference).not.toEqual(b.data.reference);
  });

  it('returns undefined for an unknown scenario', () => {
    expect(findScenario('nope')).toBeUndefined();
  });
});
