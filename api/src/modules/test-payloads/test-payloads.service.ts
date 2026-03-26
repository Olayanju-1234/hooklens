import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TestPayload {
  provider: string;
  eventType: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface ProviderSummary {
  provider: string;
  displayName: string;
  eventCount: number;
}

interface PayloadTemplate {
  eventType: string;
  description: string;
  build: () => Record<string, unknown>;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHex(length: number): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function timestamp(): string {
  return new Date().toISOString();
}

function paystackBase(
  event: string,
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event,
    data: {
      id: randomInt(100000000, 999999999),
      domain: 'test',
      status,
      reference: `test_${Date.now()}_${randomHex(6)}`,
      amount: randomInt(10000, 5000000),
      currency: 'NGN',
      paid_at: timestamp(),
      created_at: timestamp(),
      channel: 'card',
      ip_address: '127.0.0.1',
      metadata: {},
      fees: randomInt(100, 5000),
      customer: {
        id: randomInt(10000000, 99999999),
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        customer_code: `CUS_${randomHex(10)}`,
        phone: '+2348012345678',
      },
      ...extra,
    },
  };
}

function flutterwaveBase(
  event: string,
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event,
    data: {
      id: randomInt(1000000, 9999999),
      tx_ref: `flw_test_${Date.now()}_${randomHex(6)}`,
      flw_ref: `FLW-MOCK-${randomHex(12).toUpperCase()}`,
      amount: randomInt(1000, 500000),
      currency: 'NGN',
      status,
      payment_type: 'card',
      created_at: timestamp(),
      customer: {
        id: randomInt(100000, 999999),
        email: 'jane.doe@example.com',
        name: 'Jane Doe',
        phone_number: '+2348098765432',
      },
      ...extra,
    },
  };
}

const PAYSTACK_TEMPLATES: PayloadTemplate[] = [
  {
    eventType: 'charge.success',
    description: 'Successful card/bank charge',
    build: () =>
      paystackBase('charge.success', 'success', {
        gateway_response: 'Successful',
        authorization: {
          authorization_code: `AUTH_${randomHex(10)}`,
          bin: '408408',
          last4: '4081',
          exp_month: '12',
          exp_year: '2030',
          channel: 'card',
          card_type: 'visa',
          bank: 'TEST BANK',
          country_code: 'NG',
          brand: 'visa',
          reusable: true,
          signature: `SIG_${randomHex(12)}`,
        },
      }),
  },
  {
    eventType: 'charge.failed',
    description: 'Failed charge attempt',
    build: () =>
      paystackBase('charge.failed', 'failed', {
        gateway_response: 'Declined',
        authorization: {
          authorization_code: '',
          bin: '408408',
          last4: '4081',
          exp_month: '12',
          exp_year: '2030',
          channel: 'card',
          card_type: 'visa',
          bank: 'TEST BANK',
          country_code: 'NG',
          brand: 'visa',
          reusable: false,
          signature: '',
        },
      }),
  },
  {
    eventType: 'transfer.success',
    description: 'Successful transfer',
    build: () =>
      paystackBase('transfer.success', 'success', {
        transfer_code: `TRF_${randomHex(10)}`,
        recipient: {
          id: randomInt(1000000, 9999999),
          name: 'Recipient Name',
          email: 'recipient@example.com',
          type: 'nuban',
          details: {
            account_number: '0123456789',
            account_name: 'Recipient Name',
            bank_code: '058',
            bank_name: 'Guaranty Trust Bank',
          },
        },
        reason: 'Payment for services',
      }),
  },
  {
    eventType: 'transfer.failed',
    description: 'Failed transfer',
    build: () =>
      paystackBase('transfer.failed', 'failed', {
        transfer_code: `TRF_${randomHex(10)}`,
        recipient: {
          id: randomInt(1000000, 9999999),
          name: 'Recipient Name',
          email: 'recipient@example.com',
          type: 'nuban',
          details: {
            account_number: '0123456789',
            account_name: 'Recipient Name',
            bank_code: '058',
            bank_name: 'Guaranty Trust Bank',
          },
        },
        reason: 'Payment for services',
        failure_reason: 'Could not resolve account',
      }),
  },
  {
    eventType: 'transfer.reversed',
    description: 'Reversed transfer',
    build: () =>
      paystackBase('transfer.reversed', 'reversed', {
        transfer_code: `TRF_${randomHex(10)}`,
        recipient: {
          id: randomInt(1000000, 9999999),
          name: 'Recipient Name',
          email: 'recipient@example.com',
          type: 'nuban',
          details: {
            account_number: '0123456789',
            account_name: 'Recipient Name',
            bank_code: '058',
            bank_name: 'Guaranty Trust Bank',
          },
        },
        reason: 'Transfer reversed by system',
      }),
  },
  {
    eventType: 'subscription.create',
    description: 'New subscription created',
    build: () =>
      paystackBase('subscription.create', 'active', {
        subscription_code: `SUB_${randomHex(10)}`,
        email_token: randomHex(16),
        plan: {
          id: randomInt(10000, 99999),
          name: 'Monthly Plan',
          plan_code: `PLN_${randomHex(10)}`,
          amount: 500000,
          interval: 'monthly',
          currency: 'NGN',
        },
        next_payment_date: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
  },
  {
    eventType: 'subscription.disable',
    description: 'Subscription cancelled/disabled',
    build: () =>
      paystackBase('subscription.disable', 'complete', {
        subscription_code: `SUB_${randomHex(10)}`,
        email_token: randomHex(16),
        plan: {
          id: randomInt(10000, 99999),
          name: 'Monthly Plan',
          plan_code: `PLN_${randomHex(10)}`,
          amount: 500000,
          interval: 'monthly',
          currency: 'NGN',
        },
      }),
  },
  {
    eventType: 'refund.processed',
    description: 'Completed refund',
    build: () =>
      paystackBase('refund.processed', 'processed', {
        transaction_reference: `test_${Date.now()}_${randomHex(6)}`,
        refund_reference: `refund_${randomHex(10)}`,
        deducted_amount: randomInt(10000, 500000),
        merchant_note: 'Customer requested refund',
        customer_note: 'Refund for order cancellation',
      }),
  },
  {
    eventType: 'refund.failed',
    description: 'Failed refund',
    build: () =>
      paystackBase('refund.failed', 'failed', {
        transaction_reference: `test_${Date.now()}_${randomHex(6)}`,
        refund_reference: `refund_${randomHex(10)}`,
        deducted_amount: 0,
        merchant_note: 'Customer requested refund',
        customer_note: 'Refund for order cancellation',
        failure_reason: 'Insufficient funds in settlement account',
      }),
  },
  {
    eventType: 'invoice.create',
    description: 'New invoice created',
    build: () =>
      paystackBase('invoice.create', 'pending', {
        invoice_code: `INV_${randomHex(10)}`,
        description: 'Monthly subscription invoice',
        line_items: [
          {
            name: 'Monthly Plan',
            amount: 500000,
            quantity: 1,
          },
        ],
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notification: {
          sent_at: timestamp(),
          channel: 'email',
        },
      }),
  },
  {
    eventType: 'invoice.payment_failed',
    description: 'Invoice payment failed',
    build: () =>
      paystackBase('invoice.payment_failed', 'payment_failed', {
        invoice_code: `INV_${randomHex(10)}`,
        description: 'Monthly subscription invoice',
        payment_method: 'card',
        due_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        failure_reason: 'Card declined',
      }),
  },
  {
    eventType: 'paymentrequest.success',
    description: 'Payment request completed',
    build: () =>
      paystackBase('paymentrequest.success', 'success', {
        request_code: `PRQ_${randomHex(10)}`,
        description: 'Payment for invoice #1234',
        line_items: [
          {
            name: 'Consulting Services',
            amount: 1500000,
            quantity: 1,
          },
        ],
        tax: [
          {
            name: 'VAT',
            amount: 112500,
          },
        ],
      }),
  },
  {
    eventType: 'customeridentification.success',
    description: 'Customer ID verification successful',
    build: () => ({
      event: 'customeridentification.success',
      data: {
        customer_id: randomInt(10000000, 99999999),
        customer_code: `CUS_${randomHex(10)}`,
        email: 'john.doe@example.com',
        identification: {
          country: 'NG',
          type: 'bvn',
          value: `${randomInt(10000000000, 99999999999)}`,
        },
      },
    }),
  },
  {
    eventType: 'customeridentification.failed',
    description: 'Customer ID verification failed',
    build: () => ({
      event: 'customeridentification.failed',
      data: {
        customer_id: randomInt(10000000, 99999999),
        customer_code: `CUS_${randomHex(10)}`,
        email: 'john.doe@example.com',
        identification: {
          country: 'NG',
          type: 'bvn',
          value: `${randomInt(10000000000, 99999999999)}`,
        },
        reason: 'BVN does not match records',
      },
    }),
  },
  {
    eventType: 'dedicatedaccount.assign.success',
    description: 'Dedicated Virtual Account assigned successfully',
    build: () => ({
      event: 'dedicatedaccount.assign.success',
      data: {
        id: randomInt(1000000, 9999999),
        domain: 'test',
        status: 'active',
        dedicated_account: {
          id: randomInt(100000, 999999),
          account_name: 'PAYSTACK-JOHN DOE',
          account_number: `${randomInt(1000000000, 9999999999)}`,
          bank: {
            id: randomInt(1, 50),
            name: 'Wema Bank',
            slug: 'wema-bank',
          },
          assigned: true,
          currency: 'NGN',
          active: true,
          assignment: {
            assignee_id: randomInt(10000000, 99999999),
            assignee_type: 'Customer',
            assigned_at: timestamp(),
          },
        },
        customer: {
          id: randomInt(10000000, 99999999),
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          customer_code: `CUS_${randomHex(10)}`,
          phone: '+2348012345678',
        },
        created_at: timestamp(),
      },
    }),
  },
];

const FLUTTERWAVE_TEMPLATES: PayloadTemplate[] = [
  {
    eventType: 'charge.completed',
    description: 'Successful charge',
    build: () =>
      flutterwaveBase('charge.completed', 'successful', {
        device_fingerprint: randomHex(32),
        charged_amount: randomInt(1000, 500000),
        app_fee: randomInt(10, 5000),
        merchant_fee: 0,
        processor_response: 'Approved by Financial Institution',
        auth_model: 'PIN',
        narration: `CARD Transaction ${randomHex(8)}`,
        account_id: randomInt(100000, 999999),
        card: {
          first_6digits: '539983',
          last_4digits: '8381',
          issuer: 'MASTERCARD  CREDIT',
          country: 'NG',
          type: 'MASTERCARD',
          expiry: '09/32',
        },
      }),
  },
  {
    eventType: 'transfer.completed',
    description: 'Successful transfer',
    build: () =>
      flutterwaveBase('transfer.completed', 'successful', {
        account_number: '0690000040',
        bank_name: 'Access Bank',
        bank_code: '044',
        fullname: 'Alexis Sanchez',
        debit_currency: 'NGN',
        fee: randomInt(10, 500),
        reference: `flw_transfer_${Date.now()}_${randomHex(6)}`,
        narration: 'Payment for goods',
        complete_message: 'Transaction was successful',
        requires_approval: 0,
        is_approved: 1,
      }),
  },
  {
    eventType: 'subscription.cancelled',
    description: 'Subscription cancelled',
    build: () => ({
      event: 'subscription.cancelled',
      data: {
        id: randomInt(100000, 999999),
        tx_ref: `flw_test_${Date.now()}_${randomHex(6)}`,
        amount: randomInt(1000, 100000),
        currency: 'NGN',
        status: 'cancelled',
        plan: randomInt(10000, 99999),
        plan_name: 'Premium Monthly',
        customer: {
          id: randomInt(100000, 999999),
          email: 'jane.doe@example.com',
          name: 'Jane Doe',
          phone_number: '+2348098765432',
        },
        created_at: timestamp(),
        cancelled_at: timestamp(),
      },
    }),
  },
];

const MONO_TEMPLATES: PayloadTemplate[] = [
  {
    eventType: 'mono.events.account_connected',
    description: 'Account linked successfully',
    build: () => ({
      event: 'mono.events.account_connected',
      data: {
        account: {
          id: `mono_${randomHex(16)}`,
          name: 'John Doe',
          currency: 'NGN',
          type: 'SAVINGS_ACCOUNT',
          accountNumber: `${randomInt(1000000000, 9999999999)}`,
          balance: randomInt(100000, 10000000),
          institution: {
            name: 'Access Bank',
            bankCode: '044',
            type: 'PERSONAL_BANKING',
          },
        },
        meta: {
          data_status: 'AVAILABLE',
          auth_method: 'internet_banking',
          connected_at: timestamp(),
        },
      },
    }),
  },
  {
    eventType: 'mono.events.account_updated',
    description: 'Account data refreshed',
    build: () => ({
      event: 'mono.events.account_updated',
      data: {
        account: {
          id: `mono_${randomHex(16)}`,
          name: 'John Doe',
          currency: 'NGN',
          type: 'SAVINGS_ACCOUNT',
          accountNumber: `${randomInt(1000000000, 9999999999)}`,
          balance: randomInt(100000, 10000000),
          institution: {
            name: 'Access Bank',
            bankCode: '044',
            type: 'PERSONAL_BANKING',
          },
        },
        meta: {
          data_status: 'AVAILABLE',
          auth_method: 'internet_banking',
          updated_at: timestamp(),
        },
      },
    }),
  },
  {
    eventType: 'mono.events.reauthorisation_required',
    description: 'Account re-authorization needed',
    build: () => ({
      event: 'mono.events.reauthorisation_required',
      data: {
        account: {
          id: `mono_${randomHex(16)}`,
          institution: {
            name: 'Access Bank',
            type: 'PERSONAL_BANKING',
          },
        },
        meta: {
          reason: 'Session expired',
          reauth_url: `https://connect.mono.co/reauth/${randomHex(20)}`,
          created_at: timestamp(),
        },
      },
    }),
  },
];

const BAGS_TEMPLATES: PayloadTemplate[] = [
  {
    eventType: 'launchpad_launch.BAGS',
    description: 'New token launched on Bags',
    build: () => ({
      topic: 'launchpad_launch',
      subject: 'BAGS',
      channel: 'launchpad_launch.BAGS',
      data: {
        mint: `${randomHex(32)}`,
        name: `TestToken${randomInt(100, 999)}`,
        symbol: `TT${randomInt(10, 99)}`,
        uri: `https://arweave.net/${randomHex(43)}`,
        creator: `${randomHex(32)}`,
        initialBuy: randomInt(100000, 10000000),
        signature: `${randomHex(64)}`,
        timestamp: Math.floor(Date.now() / 1000),
      },
      receivedAt: timestamp(),
    }),
  },
  {
    eventType: 'launchpad_launch.BAGS.swap',
    description: 'Token swap on Bags',
    build: () => ({
      topic: 'launchpad_launch',
      subject: 'BAGS',
      channel: 'launchpad_launch.BAGS',
      data: {
        mint: `${randomHex(32)}`,
        type: 'swap',
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        amount: randomInt(10000, 50000000),
        price: (Math.random() * 0.01).toFixed(8),
        maker: `${randomHex(32)}`,
        signature: `${randomHex(64)}`,
        timestamp: Math.floor(Date.now() / 1000),
      },
      receivedAt: timestamp(),
    }),
  },
  {
    eventType: 'launchpad_launch.BAGS.claim',
    description: 'Fee claim event on Bags',
    build: () => ({
      topic: 'launchpad_launch',
      subject: 'BAGS',
      channel: 'launchpad_launch.BAGS',
      data: {
        mint: `${randomHex(32)}`,
        type: 'claim',
        wallet: `${randomHex(32)}`,
        amount: `${randomInt(1000000, 100000000)}`,
        isCreator: Math.random() > 0.5,
        signature: `${randomHex(64)}`,
        timestamp: Math.floor(Date.now() / 1000),
      },
      receivedAt: timestamp(),
    }),
  },
];

const PROVIDER_MAP: Record<
  string,
  { displayName: string; templates: PayloadTemplate[] }
> = {
  paystack: { displayName: 'Paystack', templates: PAYSTACK_TEMPLATES },
  flutterwave: { displayName: 'Flutterwave', templates: FLUTTERWAVE_TEMPLATES },
  mono: { displayName: 'Mono', templates: MONO_TEMPLATES },
  bags: { displayName: 'Bags (Solana)', templates: BAGS_TEMPLATES },
};

@Injectable()
export class TestPayloadsService {
  private readonly logger = new Logger(TestPayloadsService.name);

  getProviders(): ProviderSummary[] {
    return Object.entries(PROVIDER_MAP).map(([provider, config]) => ({
      provider,
      displayName: config.displayName,
      eventCount: config.templates.length,
    }));
  }

  getEventTypes(
    provider: string,
  ): { eventType: string; description: string }[] {
    const config = PROVIDER_MAP[provider];
    if (!config) {
      throw new NotFoundException(`Provider '${provider}' not found`);
    }
    return config.templates.map((t) => ({
      eventType: t.eventType,
      description: t.description,
    }));
  }

  getPayload(provider: string, eventType: string): TestPayload {
    const config = PROVIDER_MAP[provider];
    if (!config) {
      throw new NotFoundException(`Provider '${provider}' not found`);
    }
    const template = config.templates.find((t) => t.eventType === eventType);
    if (!template) {
      throw new NotFoundException(
        `Event type '${eventType}' not found for provider '${provider}'`,
      );
    }
    return {
      provider,
      eventType: template.eventType,
      description: template.description,
      payload: template.build(),
    };
  }

  getAllPayloads(): Record<string, TestPayload[]> {
    const result: Record<string, TestPayload[]> = {};
    for (const [provider, config] of Object.entries(PROVIDER_MAP)) {
      result[provider] = config.templates.map((t) => ({
        provider,
        eventType: t.eventType,
        description: t.description,
        payload: t.build(),
      }));
    }
    return result;
  }
}
