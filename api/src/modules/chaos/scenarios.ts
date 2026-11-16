import type { ChaosPlan } from './chaos-plan.js';
import type { TestPayloadsService } from '../test-payloads/test-payloads.service.js';

export interface ScenarioStep {
  provider: string;
  eventType: string;
  plan: ChaosPlan;
  /** What happens to this event, in plain words. */
  note: string;
}

export interface ChaosScenario {
  id: string;
  title: string;
  provider: string;
  summary: string;
  /** Sent in this order; each step's plan decides when it actually lands. */
  steps: ScenarioStep[];
  /** What a correct handler does. Hookdash can't see the user's database, so this is for them. */
  checklist: string[];
}

type Body = Record<string, unknown> & { data: Record<string, unknown> };

const NONE: ChaosPlan = { primary: { kind: null, delayMs: 0 }, extras: [] };

function held(kind: 'delay' | 'reorder', delayMs: number): ChaosPlan {
  return { primary: { kind, delayMs }, extras: [] };
}

function duplicated(...delays: number[]): ChaosPlan {
  return {
    primary: { kind: null, delayMs: 0 },
    extras: delays.map((delayMs, i) => ({
      kind: 'duplicate' as const,
      seq: i + 1,
      delayMs,
    })),
  };
}

export const SCENARIOS: ChaosScenario[] = [
  {
    id: 'paystack-charge-success-3x',
    title: 'charge.success delivered 3 times',
    provider: 'paystack',
    summary:
      'One payment, three deliveries with the same webhook-id: what a provider retry after a lost acknowledgement looks like.',
    steps: [
      {
        provider: 'paystack',
        eventType: 'charge.success',
        plan: duplicated(2000, 5000),
        note: 'sent once, then again after 2 s and 5 s',
      },
    ],
    checklist: [
      'The customer is credited once, not three times.',
      'The copies get a quick 2xx: your handler recognises the webhook-id or reference and skips them.',
      'Processing is guarded by a unique constraint on the event id or reference, inside one transaction.',
    ],
  },
  {
    id: 'paystack-transfer-reversed-first',
    title: 'transfer.reversed arrives before transfer.success',
    provider: 'paystack',
    summary:
      'Both events are for the same transfer, but the reversal overtakes the success by about 20 seconds.',
    steps: [
      {
        provider: 'paystack',
        eventType: 'transfer.success',
        plan: held('reorder', 20_000),
        note: 'sent first, held back 20 s',
      },
      {
        provider: 'paystack',
        eventType: 'transfer.reversed',
        plan: NONE,
        note: 'sent second, lands first',
      },
    ],
    checklist: [
      'The transfer ends up reversed, whichever event arrived last.',
      'The late transfer.success does not overwrite the reversal or pay out again.',
      'Both deliveries get a 2xx, so the provider stops retrying.',
    ],
  },
  {
    id: 'paystack-refund-before-charge',
    title: 'refund.processed arrives before charge.success',
    provider: 'paystack',
    summary:
      'The refund references a charge your handler has not seen yet, because the charge is held back about 20 seconds.',
    steps: [
      {
        provider: 'paystack',
        eventType: 'charge.success',
        plan: held('reorder', 20_000),
        note: 'sent first, held back 20 s',
      },
      {
        provider: 'paystack',
        eventType: 'refund.processed',
        plan: NONE,
        note: 'sent second, lands first',
      },
    ],
    checklist: [
      'The refund is not lost because its charge was unknown: you store it, or answer non-2xx so the provider retries.',
      'The order ends up refunded, not paid.',
      'The customer is not credited when the charge finally arrives.',
    ],
  },
  {
    id: 'flutterwave-charge-twice-transfer-late',
    title: 'charge.completed twice, transfer.completed 2 minutes late',
    provider: 'flutterwave',
    summary:
      'A duplicated charge, and a transfer confirmation that only lands two minutes after it was sent.',
    steps: [
      {
        provider: 'flutterwave',
        eventType: 'charge.completed',
        plan: duplicated(3000),
        note: 'sent once, then again after 3 s',
      },
      {
        provider: 'flutterwave',
        eventType: 'transfer.completed',
        plan: held('delay', 120_000),
        note: 'held back 2 minutes',
      },
    ],
    checklist: [
      'The charge is credited once.',
      'The late transfer.completed is still applied when it lands.',
      'Nothing times out or marks the transfer failed while waiting for it.',
    ],
  },
  {
    id: 'paystack-stale-replay',
    title: 'Stale replay of charge.success',
    provider: 'paystack',
    summary:
      'After a normal delivery, the same event is replayed correctly signed but with a webhook-timestamp 10 minutes old.',
    steps: [
      {
        provider: 'paystack',
        eventType: 'charge.success',
        plan: {
          primary: { kind: null, delayMs: 0 },
          extras: [{ kind: 'stale', seq: 1, delayMs: 5000 }],
        },
        note: 'delivered, then replayed after 5 s with an old timestamp',
      },
    ],
    checklist: [
      "If you verify Hookdash's signature with the SDK (5-minute tolerance by default), the replay is rejected: its webhook-timestamp is 10 minutes old.",
      "Scenario events carry no Paystack signature. On real traffic, Paystack's newer Paystack-Signature header lets you reject anything signed more than 300 seconds ago; the older x-paystack-signature has no timestamp, so if that is all you check, catch replays as already processed.",
      'Either way, the customer is not credited twice.',
    ],
  },
];

export function findScenario(id: string): ChaosScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Deliveries a run should produce: each step's real delivery plus its extra copies. */
export function expectedDeliveries(scenario: ChaosScenario): number {
  return scenario.steps.reduce((n, s) => n + 1 + s.plan.extras.length, 0);
}

/** The latest planned landing time of any delivery in the scenario. */
export function longestHoldMs(scenario: ChaosScenario): number {
  return Math.max(
    0,
    ...scenario.steps.flatMap((s) => [
      s.plan.primary.delayMs,
      ...s.plan.extras.map((e) => e.delayMs),
    ]),
  );
}

/** Builds each step's body from the test-payload templates, linking events that belong together. */
export function buildScenarioBodies(
  scenario: ChaosScenario,
  payloads: TestPayloadsService,
): Body[] {
  const bodies = scenario.steps.map(
    (s) => payloads.getPayload(s.provider, s.eventType).payload as Body,
  );
  const [first, second] = bodies;

  if (scenario.id === 'paystack-transfer-reversed-first') {
    // One transfer: the reversal carries the same id, reference, code and amount
    for (const key of ['id', 'reference', 'transfer_code', 'amount']) {
      second.data[key] = first.data[key];
    }
  }
  if (scenario.id === 'paystack-refund-before-charge') {
    second.data.transaction_reference = first.data.reference;
    second.data.amount = first.data.amount;
    second.data.deducted_amount = first.data.amount;
  }
  return bodies;
}
