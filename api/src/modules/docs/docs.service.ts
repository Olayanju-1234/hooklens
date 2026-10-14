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
  {
    provider: 'stripe',
    displayName: 'Stripe',
    description:
      'Stripe is a global payments platform. Webhooks are POSTed as JSON Event objects with the affected resource under data.object. Amounts are integers in the smallest currency unit (cents for USD). Stripe retries failed deliveries for up to 3 days, so deduplicate on the event id.',
    signatureHeader: 'stripe-signature',
    signatureMethod:
      'HMAC SHA-256 of "{t}.{raw body}" using your endpoint signing secret (whsec_...). The Stripe-Signature header carries t=<timestamp>,v1=<signature>; compare against v1 and reject timestamps older than 5 minutes',
    events: [
      {
        eventType: 'payment_intent.succeeded',
        description:
          'Sent when a PaymentIntent completes and funds are captured. This is the primary event for fulfilling orders.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'PaymentIntent ID (pi_...)',
            required: true,
          },
          {
            path: 'data.object.status',
            type: 'string',
            description: 'PaymentIntent status (succeeded)',
            required: true,
          },
          {
            path: 'data.object.amount',
            type: 'number',
            description: 'Amount intended to be collected, in cents',
            required: true,
          },
          {
            path: 'data.object.amount_received',
            type: 'number',
            description: 'Amount actually collected, in cents',
            required: true,
          },
          {
            path: 'data.object.currency',
            type: 'string',
            description:
              'Three-letter ISO currency code, lowercase (e.g., usd)',
            required: true,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...), if attached',
            required: false,
          },
          {
            path: 'data.object.latest_charge',
            type: 'string',
            description: 'ID of the Charge that captured the funds',
            required: true,
          },
          {
            path: 'data.object.payment_method',
            type: 'string',
            description: 'PaymentMethod ID used for the payment',
            required: true,
          },
          {
            path: 'data.object.receipt_email',
            type: 'string',
            description: 'Email the receipt was sent to',
            required: false,
          },
          {
            path: 'data.object.metadata',
            type: 'object',
            description:
              'Key-value pairs set when the PaymentIntent was created',
            required: false,
          },
          {
            path: 'data.object.created',
            type: 'number',
            description: 'Unix timestamp of PaymentIntent creation',
            required: true,
          },
        ],
      },
      {
        eventType: 'payment_intent.payment_failed',
        description:
          'Sent when a payment attempt fails, for example a card decline. The PaymentIntent returns to requires_payment_method so the customer can retry.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'PaymentIntent ID (pi_...)',
            required: true,
          },
          {
            path: 'data.object.status',
            type: 'string',
            description: 'PaymentIntent status (requires_payment_method)',
            required: true,
          },
          {
            path: 'data.object.amount',
            type: 'number',
            description: 'Attempted amount in cents',
            required: true,
          },
          {
            path: 'data.object.currency',
            type: 'string',
            description: 'Three-letter ISO currency code, lowercase',
            required: true,
          },
          {
            path: 'data.object.last_payment_error.type',
            type: 'string',
            description:
              'Error category (card_error, invalid_request_error, etc.)',
            required: true,
          },
          {
            path: 'data.object.last_payment_error.code',
            type: 'string',
            description: 'Error code (e.g., card_declined)',
            required: true,
          },
          {
            path: 'data.object.last_payment_error.decline_code',
            type: 'string',
            description: 'Issuer decline reason (e.g., insufficient_funds)',
            required: false,
          },
          {
            path: 'data.object.last_payment_error.message',
            type: 'string',
            description: 'Human-readable error message',
            required: true,
          },
          {
            path: 'data.object.last_payment_error.payment_method.card.last4',
            type: 'string',
            description: 'Last 4 digits of the declined card',
            required: false,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...), if attached',
            required: false,
          },
          {
            path: 'data.object.metadata',
            type: 'object',
            description:
              'Key-value pairs set when the PaymentIntent was created',
            required: false,
          },
        ],
      },
      {
        eventType: 'charge.refunded',
        description:
          'Sent when a charge is refunded, fully or partially. Compare amount_refunded with amount to tell the two apart.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'Charge ID (ch_...)',
            required: true,
          },
          {
            path: 'data.object.amount',
            type: 'number',
            description: 'Original charge amount in cents',
            required: true,
          },
          {
            path: 'data.object.amount_refunded',
            type: 'number',
            description: 'Total amount refunded so far, in cents',
            required: true,
          },
          {
            path: 'data.object.refunded',
            type: 'boolean',
            description: 'true only when the charge is fully refunded',
            required: true,
          },
          {
            path: 'data.object.currency',
            type: 'string',
            description: 'Three-letter ISO currency code, lowercase',
            required: true,
          },
          {
            path: 'data.object.payment_intent',
            type: 'string',
            description: 'PaymentIntent the charge belongs to',
            required: false,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...), if attached',
            required: false,
          },
          {
            path: 'data.object.payment_method_details.card.last4',
            type: 'string',
            description: 'Last 4 digits of the card',
            required: false,
          },
          {
            path: 'data.object.receipt_url',
            type: 'string',
            description: 'URL of the hosted receipt',
            required: false,
          },
          {
            path: 'data.object.metadata',
            type: 'object',
            description: 'Key-value pairs attached to the charge',
            required: false,
          },
          {
            path: 'data.previous_attributes.amount_refunded',
            type: 'number',
            description: 'Refunded amount before this refund',
            required: false,
          },
        ],
      },
      {
        eventType: 'checkout.session.completed',
        description:
          'Sent when a customer completes a Checkout Session. For delayed payment methods check payment_status before fulfilling.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'Checkout Session ID (cs_...)',
            required: true,
          },
          {
            path: 'data.object.mode',
            type: 'string',
            description: 'Session mode (payment, subscription or setup)',
            required: true,
          },
          {
            path: 'data.object.status',
            type: 'string',
            description: 'Session status (complete)',
            required: true,
          },
          {
            path: 'data.object.payment_status',
            type: 'string',
            description: 'paid, unpaid or no_payment_required',
            required: true,
          },
          {
            path: 'data.object.amount_total',
            type: 'number',
            description: 'Total amount in cents including tax and discounts',
            required: true,
          },
          {
            path: 'data.object.currency',
            type: 'string',
            description: 'Three-letter ISO currency code, lowercase',
            required: true,
          },
          {
            path: 'data.object.client_reference_id',
            type: 'string',
            description: 'Your reference passed when creating the session',
            required: false,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...)',
            required: false,
          },
          {
            path: 'data.object.customer_details.email',
            type: 'string',
            description: 'Email entered by the customer',
            required: false,
          },
          {
            path: 'data.object.payment_intent',
            type: 'string',
            description: 'PaymentIntent ID for payment mode sessions',
            required: false,
          },
          {
            path: 'data.object.subscription',
            type: 'string',
            description: 'Subscription ID for subscription mode sessions',
            required: false,
          },
          {
            path: 'data.object.metadata',
            type: 'object',
            description: 'Key-value pairs set when the session was created',
            required: false,
          },
        ],
      },
      {
        eventType: 'customer.subscription.updated',
        description:
          'Sent when a subscription changes: plan or quantity changes, renewals, status transitions, or scheduling a cancellation. data.previous_attributes holds the old values of changed fields.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'Subscription ID (sub_...)',
            required: true,
          },
          {
            path: 'data.object.status',
            type: 'string',
            description:
              'Subscription status (active, past_due, canceled, etc.)',
            required: true,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...)',
            required: true,
          },
          {
            path: 'data.object.cancel_at_period_end',
            type: 'boolean',
            description:
              'true when the subscription will cancel at the end of the period',
            required: true,
          },
          {
            path: 'data.object.current_period_start',
            type: 'number',
            description: 'Unix timestamp of the current period start',
            required: true,
          },
          {
            path: 'data.object.current_period_end',
            type: 'number',
            description: 'Unix timestamp of the current period end',
            required: true,
          },
          {
            path: 'data.object.items.data[].price.id',
            type: 'string',
            description: 'Price ID of each subscription item',
            required: true,
          },
          {
            path: 'data.object.items.data[].price.unit_amount',
            type: 'number',
            description: 'Price per unit in cents',
            required: true,
          },
          {
            path: 'data.object.items.data[].quantity',
            type: 'number',
            description: 'Quantity of each subscription item',
            required: true,
          },
          {
            path: 'data.object.latest_invoice',
            type: 'string',
            description: 'Most recent invoice ID (in_...)',
            required: false,
          },
          {
            path: 'data.object.metadata',
            type: 'object',
            description: 'Key-value pairs attached to the subscription',
            required: false,
          },
          {
            path: 'data.previous_attributes',
            type: 'object',
            description: 'Previous values of the fields that changed',
            required: true,
          },
        ],
      },
      {
        eventType: 'invoice.payment_failed',
        description:
          'Sent when payment for an invoice fails, typically a subscription renewal. Stripe retries according to your Smart Retries settings.',
        fields: [
          {
            path: 'id',
            type: 'string',
            description:
              'Unique event ID (evt_...); use it to deduplicate retries',
            required: true,
          },
          {
            path: 'object',
            type: 'string',
            description: "Always 'event'",
            required: true,
          },
          {
            path: 'type',
            type: 'string',
            description: 'Event type identifier',
            required: true,
          },
          {
            path: 'api_version',
            type: 'string',
            description: 'API version used to render data.object',
            required: true,
          },
          {
            path: 'created',
            type: 'number',
            description: 'Unix timestamp (seconds) when the event was created',
            required: true,
          },
          {
            path: 'livemode',
            type: 'boolean',
            description: 'false for test mode events',
            required: true,
          },
          {
            path: 'data.object.id',
            type: 'string',
            description: 'Invoice ID (in_...)',
            required: true,
          },
          {
            path: 'data.object.status',
            type: 'string',
            description: 'Invoice status (open)',
            required: true,
          },
          {
            path: 'data.object.billing_reason',
            type: 'string',
            description:
              'Why the invoice was created (subscription_cycle, subscription_create, manual, etc.)',
            required: true,
          },
          {
            path: 'data.object.amount_due',
            type: 'number',
            description: 'Amount due in cents',
            required: true,
          },
          {
            path: 'data.object.amount_paid',
            type: 'number',
            description: 'Amount paid so far in cents',
            required: true,
          },
          {
            path: 'data.object.currency',
            type: 'string',
            description: 'Three-letter ISO currency code, lowercase',
            required: true,
          },
          {
            path: 'data.object.attempt_count',
            type: 'number',
            description: 'Number of payment attempts made',
            required: true,
          },
          {
            path: 'data.object.next_payment_attempt',
            type: 'number',
            description:
              'Unix timestamp of the next retry, or null when no retry is scheduled',
            required: false,
          },
          {
            path: 'data.object.customer',
            type: 'string',
            description: 'Customer ID (cus_...)',
            required: true,
          },
          {
            path: 'data.object.customer_email',
            type: 'string',
            description: 'Customer email at the time of invoicing',
            required: false,
          },
          {
            path: 'data.object.subscription',
            type: 'string',
            description: 'Subscription ID, for subscription invoices',
            required: false,
          },
          {
            path: 'data.object.hosted_invoice_url',
            type: 'string',
            description: 'URL where the customer can pay the invoice',
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
