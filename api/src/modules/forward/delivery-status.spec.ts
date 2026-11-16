import {
  aggregateDeliveryStatus,
  type DeliveryAttempt,
} from './delivery-status.js';

const at = (ms: number) => new Date(Date.UTC(2026, 10, 16, 12, 0, 0, ms));

function attempt(over: Partial<DeliveryAttempt>): DeliveryAttempt {
  return {
    destinationId: 'dest-1',
    target: null,
    status: 'forwarded',
    responseCode: 200,
    responseBody: '{"ok":true}',
    latency: 40,
    forwardedAt: at(0),
    chaosSeq: 0,
    ...over,
  };
}

describe('aggregateDeliveryStatus', () => {
  it('is forwarded when the only target delivered', () => {
    const result = aggregateDeliveryStatus([attempt({})], [], 1);
    expect(result.forwardStatus).toBe('forwarded');
    expect(result.forwardCode).toBe(200);
    expect(result.forwardBody).toBe('{"ok":true}');
  });

  it('ignores failing duplicate and stale copies once the real delivery succeeded', () => {
    const result = aggregateDeliveryStatus(
      [
        attempt({ forwardedAt: at(1) }),
        attempt({
          status: 'failed',
          responseCode: 500,
          responseBody: 'boom',
          chaosSeq: 1,
          forwardedAt: at(2),
        }),
        attempt({
          status: 'failed',
          responseCode: 401,
          responseBody: 'stale',
          chaosSeq: 2,
          forwardedAt: at(3),
        }),
      ],
      [],
      1,
    );
    expect(result).toEqual({
      forwardStatus: 'forwarded',
      forwardCode: 200,
      forwardLatency: 40,
      forwardedAt: at(1),
      forwardBody: '{"ok":true}',
    });
  });

  it('does not count a successful chaos copy as delivering the event', () => {
    const result = aggregateDeliveryStatus(
      [
        attempt({ status: 'failed', responseCode: 503 }),
        attempt({ chaosSeq: 1 }),
      ],
      [],
      1,
    );
    expect(result.forwardStatus).toBe('pending');
    expect(result.forwardCode).toBe(503);
  });

  it('stays pending while a held real delivery has not run yet', () => {
    const result = aggregateDeliveryStatus(
      [attempt({ chaosSeq: 1, status: 'failed', responseCode: 500 })],
      [],
      1,
    );
    expect(result.forwardStatus).toBe('pending');
    expect(result.forwardCode).toBeNull();
  });

  it('is failed when the real delivery is dead-lettered, whatever the copies did', () => {
    const result = aggregateDeliveryStatus(
      [
        attempt({ status: 'failed', responseCode: 500 }),
        attempt({ chaosSeq: 1 }),
      ],
      [{ destinationId: 'dest-1' }],
      1,
    );
    expect(result.forwardStatus).toBe('failed');
  });

  it('waits for every target before resolving', () => {
    const result = aggregateDeliveryStatus(
      [attempt({ destinationId: 'dest-1' })],
      [],
      2,
    );
    expect(result.forwardStatus).toBe('pending');
    expect(result).not.toHaveProperty('forwardBody');
  });

  it('treats the fallback forward URL as its own target', () => {
    const result = aggregateDeliveryStatus(
      [attempt({ destinationId: null })],
      [],
      1,
    );
    expect(result.forwardStatus).toBe('forwarded');
  });

  it('ignores locally reported deliveries', () => {
    const result = aggregateDeliveryStatus(
      [attempt({ target: 'cli · localhost:3000', status: 'failed' })],
      [],
      1,
    );
    expect(result.forwardStatus).toBe('pending');
  });
});
