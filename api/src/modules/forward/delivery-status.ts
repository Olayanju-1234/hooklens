import type { ForwardStatus } from '../../entities/webhook-event.entity.js';

export interface DeliveryAttempt {
  destinationId: string | null;
  target: string | null;
  status: string;
  responseCode: number | null;
  responseBody: string | null;
  latency: number | null;
  forwardedAt: Date | null;
  chaosSeq: number;
}

export interface DeliveryAggregate {
  forwardStatus: ForwardStatus;
  forwardCode: number | null;
  forwardLatency: number | null;
  forwardedAt: Date | null;
  forwardBody?: string | null;
}

const FALLBACK = 'fallback';

/**
 * The event's overall delivery state from its real deliveries. Locally reported deliveries
 * and extra chaos copies are left out, so they can never fail an event or dead-letter it.
 */
export function aggregateDeliveryStatus(
  attempts: DeliveryAttempt[],
  deadLetters: { destinationId: string | null }[],
  targetCount: number | null,
): DeliveryAggregate {
  const results = attempts.filter((r) => !r.target && (r.chaosSeq ?? 0) === 0);
  const key = (id: string | null) => id ?? FALLBACK;

  const delivered = new Map<string, DeliveryAttempt>();
  for (const r of results) {
    if (r.status === 'forwarded') delivered.set(key(r.destinationId), r);
  }
  const dead = new Set(
    deadLetters
      .map((d) => key(d.destinationId))
      .filter((k) => !delivered.has(k)),
  );
  const targets = targetCount ?? 1;
  const resolved = delivered.size + dead.size;
  const forwardStatus: ForwardStatus =
    resolved < targets ? 'pending' : dead.size > 0 ? 'failed' : 'forwarded';

  const last = results[results.length - 1];
  const successes = [...delivered.values()];
  return {
    forwardStatus,
    forwardCode:
      successes[successes.length - 1]?.responseCode ??
      last?.responseCode ??
      null,
    forwardLatency: successes.length
      ? Math.max(...successes.map((r) => r.latency ?? 0))
      : null,
    forwardedAt: last?.forwardedAt ?? null,
    ...(targets === 1 && { forwardBody: last?.responseBody ?? null }),
  };
}
