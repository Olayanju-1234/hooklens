import { Injectable, NotFoundException } from '@nestjs/common';

interface FieldDoc {
  path: string;
  type: string;
  description: string;
  required: boolean;
}

export interface EventDoc {
  eventType: string;
  description: string;
  fields: FieldDoc[];
}

export interface ProviderDoc {
  provider: string;
  displayName: string;
  description: string;
  signatureHeader: string;
  signatureMethod: string;
  events: EventDoc[];
}

export interface ProviderSummary {
  provider: string;
  displayName: string;
  description: string;
  signatureHeader: string;
  signatureMethod: string;
  eventCount: number;
}

const PROVIDERS: ProviderDoc[] = [
  {
    provider: 'paystack',
    displayName: 'Paystack',
    description:
      'Paystack is a payments platform for Africa. Webhooks are sent as POST requests with a JSON body. All amounts are in the smallest currency unit (kobo for NGN).',
    signatureHeader: 'x-paystack-signature',
    signatureMethod:
      'HMAC SHA-512 of the raw request body using your secret key',
    events: [
      {
        eventType: 'charge.success',
        description:
          'Sent when a charge is successful. This is the primary event for confirming payments.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transaction ID',
            required: true,
          },
          {
            path: 'data.domain',
            type: 'string',
            description: 'Integration environment (test or live)',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transaction status (success)',
            required: true,
          },
          {
            path: 'data.reference',
            type: 'string',
            description: 'Unique transaction reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Amount in kobo',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Transaction currency (e.g., NGN)',
            required: true,
          },
          {
            path: 'data.channel',
            type: 'string',
            description: 'Payment channel (card, bank, ussd, etc.)',
            required: true,
          },
          {
            path: 'data.gateway_response',
            type: 'string',
            description: 'Response from the payment gateway',
            required: true,
          },
          {
            path: 'data.ip_address',
            type: 'string',
            description: 'IP address of the customer',
            required: false,
          },
          {
            path: 'data.fees',
            type: 'number',
            description: 'Transaction fees in kobo',
            required: false,
          },
          {
            path: 'data.customer.id',
            type: 'number',
            description: 'Paystack customer ID',
            required: true,
          },
          {
            path: 'data.customer.email',
            type: 'string',
            description: 'Customer email address',
            required: true,
          },
          {
            path: 'data.customer.customer_code',
            type: 'string',
            description: 'Unique customer code',
            required: true,
          },
          {
            path: 'data.authorization.authorization_code',
            type: 'string',
            description: 'Reusable authorization code',
            required: false,
          },
          {
            path: 'data.authorization.card_type',
            type: 'string',
            description: 'Card brand (visa, mastercard, etc.)',
            required: false,
          },
          {
            path: 'data.authorization.last4',
            type: 'string',
            description: 'Last 4 digits of the card',
            required: false,
          },
          {
            path: 'data.metadata',
            type: 'object',
            description: 'Custom metadata passed during charge initialization',
            required: false,
          },
          {
            path: 'data.paid_at',
            type: 'string',
            description: 'ISO 8601 timestamp of payment',
            required: true,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp of transaction creation',
            required: true,
          },
        ],
      },
      {
        eventType: 'charge.failed',
        description:
          'Sent when a charge attempt fails. Check gateway_response for failure details.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transaction ID',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transaction status (failed)',
            required: true,
          },
          {
            path: 'data.reference',
            type: 'string',
            description: 'Unique transaction reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Attempted amount in kobo',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Transaction currency',
            required: true,
          },
          {
            path: 'data.gateway_response',
            type: 'string',
            description: 'Failure reason from gateway',
            required: true,
          },
          {
            path: 'data.customer.id',
            type: 'number',
            description: 'Paystack customer ID',
            required: true,
          },
          {
            path: 'data.customer.email',
            type: 'string',
            description: 'Customer email address',
            required: true,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp of transaction creation',
            required: true,
          },
        ],
      },
      {
        eventType: 'transfer.success',
        description: 'Sent when a transfer to a bank account succeeds.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transfer ID',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transfer status (success)',
            required: true,
          },
          {
            path: 'data.reference',
            type: 'string',
            description: 'Unique transfer reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Transfer amount in kobo',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Transfer currency',
            required: true,
          },
          {
            path: 'data.transfer_code',
            type: 'string',
            description: 'Unique transfer code',
            required: true,
          },
          {
            path: 'data.recipient.id',
            type: 'number',
            description: 'Transfer recipient ID',
            required: true,
          },
          {
            path: 'data.recipient.name',
            type: 'string',
            description: 'Recipient name',
            required: true,
          },
          {
            path: 'data.recipient.details.account_number',
            type: 'string',
            description: 'Recipient bank account number',
            required: true,
          },
          {
            path: 'data.recipient.details.bank_name',
            type: 'string',
            description: 'Recipient bank name',
            required: true,
          },
          {
            path: 'data.reason',
            type: 'string',
            description: 'Transfer narration',
            required: false,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp',
            required: true,
          },
        ],
      },
      {
        eventType: 'transfer.failed',
        description:
          'Sent when a transfer fails. Check failure_reason for details.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transfer ID',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transfer status (failed)',
            required: true,
          },
          {
            path: 'data.reference',
            type: 'string',
            description: 'Unique transfer reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Transfer amount in kobo',
            required: true,
          },
          {
            path: 'data.transfer_code',
            type: 'string',
            description: 'Unique transfer code',
            required: true,
          },
          {
            path: 'data.failure_reason',
            type: 'string',
            description: 'Reason for transfer failure',
            required: true,
          },
          {
            path: 'data.recipient.details.account_number',
            type: 'string',
            description: 'Recipient bank account number',
            required: true,
          },
          {
            path: 'data.recipient.details.bank_name',
            type: 'string',
            description: 'Recipient bank name',
            required: true,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp',
            required: true,
          },
        ],
      },
      {
        eventType: 'refund.processed',
        description: 'Sent when a refund is successfully processed.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique refund ID',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Refund status (processed)',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Refund amount in kobo',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Refund currency',
            required: true,
          },
          {
            path: 'data.transaction_reference',
            type: 'string',
            description: 'Reference of the original transaction',
            required: true,
          },
          {
            path: 'data.refund_reference',
            type: 'string',
            description: 'Unique refund reference',
            required: true,
          },
          {
            path: 'data.deducted_amount',
            type: 'number',
            description: 'Amount deducted from merchant balance',
            required: true,
          },
          {
            path: 'data.merchant_note',
            type: 'string',
            description: 'Merchant-provided reason for refund',
            required: false,
          },
          {
            path: 'data.customer_note',
            type: 'string',
            description: 'Customer-facing refund note',
            required: false,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp',
            required: true,
          },
        ],
      },
    ],
  },
  {
    provider: 'flutterwave',
    displayName: 'Flutterwave',
    description:
      'Flutterwave provides payments infrastructure across Africa. Webhook payloads are sent as POST requests. Signature verification uses a secret hash comparison.',
    signatureHeader: 'verif-hash',
    signatureMethod:
      'Compare the verif-hash header value directly with your configured secret hash',
    events: [
      {
        eventType: 'charge.completed',
        description: 'Sent when a payment charge is completed successfully.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transaction ID',
            required: true,
          },
          {
            path: 'data.tx_ref',
            type: 'string',
            description: 'Your transaction reference',
            required: true,
          },
          {
            path: 'data.flw_ref',
            type: 'string',
            description: 'Flutterwave transaction reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Charged amount',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Transaction currency',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transaction status (successful)',
            required: true,
          },
          {
            path: 'data.charged_amount',
            type: 'number',
            description: 'Total amount charged including fees',
            required: true,
          },
          {
            path: 'data.app_fee',
            type: 'number',
            description: 'Application fee',
            required: false,
          },
          {
            path: 'data.payment_type',
            type: 'string',
            description: 'Payment method used (card, bank_transfer, etc.)',
            required: true,
          },
          {
            path: 'data.customer.id',
            type: 'number',
            description: 'Flutterwave customer ID',
            required: true,
          },
          {
            path: 'data.customer.email',
            type: 'string',
            description: 'Customer email',
            required: true,
          },
          {
            path: 'data.customer.name',
            type: 'string',
            description: 'Customer name',
            required: false,
          },
          {
            path: 'data.card.first_6digits',
            type: 'string',
            description: 'Card BIN (first 6 digits)',
            required: false,
          },
          {
            path: 'data.card.last_4digits',
            type: 'string',
            description: 'Card last 4 digits',
            required: false,
          },
          {
            path: 'data.card.type',
            type: 'string',
            description: 'Card network (VISA, MASTERCARD)',
            required: false,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp',
            required: true,
          },
        ],
      },
      {
        eventType: 'transfer.completed',
        description: 'Sent when a payout/transfer is completed.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.id',
            type: 'number',
            description: 'Unique transfer ID',
            required: true,
          },
          {
            path: 'data.tx_ref',
            type: 'string',
            description: 'Transfer reference',
            required: true,
          },
          {
            path: 'data.amount',
            type: 'number',
            description: 'Transfer amount',
            required: true,
          },
          {
            path: 'data.currency',
            type: 'string',
            description: 'Transfer currency',
            required: true,
          },
          {
            path: 'data.status',
            type: 'string',
            description: 'Transfer status (successful)',
            required: true,
          },
          {
            path: 'data.account_number',
            type: 'string',
            description: 'Recipient account number',
            required: true,
          },
          {
            path: 'data.bank_name',
            type: 'string',
            description: 'Recipient bank name',
            required: true,
          },
          {
            path: 'data.bank_code',
            type: 'string',
            description: 'Recipient bank code',
            required: true,
          },
          {
            path: 'data.fullname',
            type: 'string',
            description: 'Recipient full name',
            required: true,
          },
          {
            path: 'data.fee',
            type: 'number',
            description: 'Transfer fee',
            required: false,
          },
          {
            path: 'data.narration',
            type: 'string',
            description: 'Transfer narration',
            required: false,
          },
          {
            path: 'data.complete_message',
            type: 'string',
            description: 'Completion message',
            required: false,
          },
          {
            path: 'data.created_at',
            type: 'string',
            description: 'ISO 8601 timestamp',
            required: true,
          },
        ],
      },
    ],
  },
  {
    provider: 'mono',
    displayName: 'Mono',
    description:
      'Mono provides financial data APIs in Africa. Webhooks notify you of account linking events and data updates. Signature verification uses a direct secret comparison.',
    signatureHeader: 'mono-webhook-secret',
    signatureMethod:
      'Compare the mono-webhook-secret header value directly with your configured webhook secret',
    events: [
      {
        eventType: 'mono.events.account_connected',
        description:
          'Sent when a user successfully links their bank account via Mono Connect.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.account.id',
            type: 'string',
            description: 'Mono account ID',
            required: true,
          },
          {
            path: 'data.account.name',
            type: 'string',
            description: 'Account holder name',
            required: false,
          },
          {
            path: 'data.account.currency',
            type: 'string',
            description: 'Account currency',
            required: false,
          },
          {
            path: 'data.account.type',
            type: 'string',
            description: 'Account type (SAVINGS_ACCOUNT, CURRENT_ACCOUNT)',
            required: false,
          },
          {
            path: 'data.account.accountNumber',
            type: 'string',
            description: 'Bank account number',
            required: false,
          },
          {
            path: 'data.account.balance',
            type: 'number',
            description: 'Account balance in smallest unit',
            required: false,
          },
          {
            path: 'data.account.institution.name',
            type: 'string',
            description: 'Bank name',
            required: true,
          },
          {
            path: 'data.account.institution.bankCode',
            type: 'string',
            description: 'Bank code',
            required: false,
          },
          {
            path: 'data.account.institution.type',
            type: 'string',
            description:
              'Institution type (PERSONAL_BANKING, BUSINESS_BANKING)',
            required: true,
          },
          {
            path: 'data.meta.data_status',
            type: 'string',
            description: 'Data availability status',
            required: false,
          },
          {
            path: 'data.meta.auth_method',
            type: 'string',
            description: 'Authentication method used',
            required: false,
          },
        ],
      },
      {
        eventType: 'mono.events.account_updated',
        description:
          'Sent when account data is refreshed with new transactions or balance updates.',
        fields: [
          {
            path: 'event',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'data.account.id',
            type: 'string',
            description: 'Mono account ID',
            required: true,
          },
          {
            path: 'data.account.name',
            type: 'string',
            description: 'Account holder name',
            required: false,
          },
          {
            path: 'data.account.balance',
            type: 'number',
            description: 'Updated account balance',
            required: false,
          },
          {
            path: 'data.account.institution.name',
            type: 'string',
            description: 'Bank name',
            required: true,
          },
          {
            path: 'data.account.institution.type',
            type: 'string',
            description: 'Institution type',
            required: true,
          },
          {
            path: 'data.meta.data_status',
            type: 'string',
            description: 'Data availability status',
            required: false,
          },
          {
            path: 'data.meta.updated_at',
            type: 'string',
            description: 'ISO 8601 timestamp of data update',
            required: false,
          },
        ],
      },
    ],
  },
];

@Injectable()
export class DocsService {
  getProviders(): ProviderSummary[] {
    return PROVIDERS.map((p) => ({
      provider: p.provider,
      displayName: p.displayName,
      description: p.description,
      signatureHeader: p.signatureHeader,
      signatureMethod: p.signatureMethod,
      eventCount: p.events.length,
    }));
  }

  getProvider(provider: string): ProviderDoc {
    const doc = PROVIDERS.find((p) => p.provider === provider);
    if (!doc) {
      throw new NotFoundException(`Provider '${provider}' not found`);
    }
    return doc;
  }

  getEventDoc(provider: string, eventType: string): EventDoc {
    const providerDoc = this.getProvider(provider);
    const event = providerDoc.events.find((e) => e.eventType === eventType);
    if (!event) {
      throw new NotFoundException(
        `Event type '${eventType}' not found for provider '${provider}'`,
      );
    }
    return event;
  }
}
