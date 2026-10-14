import { NotFoundException } from '@nestjs/common';
import { TestPayloadsService } from './test-payloads.service.js';
import { DocsService } from '../docs/docs.service.js';

const STRIPE_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'checkout.session.completed',
  'customer.subscription.updated',
  'invoice.payment_failed',
];

describe('TestPayloadsService', () => {
  const service = new TestPayloadsService();
  const docs = new DocsService();

  it('lists Stripe as a provider', () => {
    expect(service.getProviders()).toContainEqual({
      provider: 'stripe',
      displayName: 'Stripe',
      eventCount: STRIPE_EVENTS.length,
    });
  });

  it('serves every documented Stripe event type', () => {
    expect(service.getEventTypes('stripe').map((e) => e.eventType)).toEqual(
      STRIPE_EVENTS,
    );
    expect(docs.getProvider('stripe').events.map((e) => e.eventType)).toEqual(
      STRIPE_EVENTS,
    );
  });

  it.each(STRIPE_EVENTS)('builds a Stripe Event envelope for %s', (type) => {
    const { payload } = service.getPayload('stripe', type);
    const data = payload.data as { object: Record<string, unknown> };

    expect(payload).toMatchObject({ object: 'event', type, livemode: false });
    expect(payload.id).toMatch(/^evt_[A-Za-z0-9]{24}$/);
    expect(typeof payload.created).toBe('number');
    expect(typeof data.object.object).toBe('string');
    expect(data.object.id).toMatch(/^[a-z_]+_[A-Za-z0-9]+$/);
  });

  it('gives each send a fresh event id so ingress dedup does not drop it', () => {
    const a = service.getPayload('stripe', 'charge.refunded').payload;
    const b = service.getPayload('stripe', 'charge.refunded').payload;
    expect(a.id).not.toBe(b.id);
  });

  it('includes previous_attributes on update-style events', () => {
    for (const type of ['charge.refunded', 'customer.subscription.updated']) {
      const data = service.getPayload('stripe', type).payload.data as Record<
        string,
        unknown
      >;
      expect(data.previous_attributes).toBeDefined();
    }
  });

  it('every documented required field exists in the matching test payload', () => {
    for (const event of docs.getProvider('stripe').events) {
      const { payload } = service.getPayload('stripe', event.eventType);
      for (const field of event.fields.filter((f) => f.required)) {
        const value = field.path
          .replace('[]', '.0')
          .split('.')
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown> | null)?.[key],
            payload,
          );
        expect({ path: field.path, present: value !== undefined }).toEqual({
          path: field.path,
          present: true,
        });
      }
    }
  });

  it('404s for unknown Stripe event types', () => {
    expect(() => service.getPayload('stripe', 'nope')).toThrow(
      NotFoundException,
    );
  });
});
