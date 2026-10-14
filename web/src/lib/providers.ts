// Mirrors the API's verification recipes (api/src/modules/signature/recipes.ts)
export interface ProviderOption {
  value: string;
  label: string;
  description: string;
  secretHint: string;
}

export const PROVIDERS: ProviderOption[] = [
  {
    value: "stripe",
    label: "Stripe",
    description: "Global card payments — charges, subscriptions, checkout",
    secretHint: "Endpoint signing secret (whsec_…)",
  },
  {
    value: "paystack",
    label: "Paystack",
    description: "Payment processing — charges, transfers, refunds",
    secretHint: "Paystack secret key (sk_…)",
  },
  {
    value: "flutterwave",
    label: "Flutterwave",
    description: "Pan-African payments — cards, bank transfers, USSD",
    secretHint: "Secret hash from your dashboard",
  },
  {
    value: "mono",
    label: "Mono",
    description: "Open banking — account data, statements, direct debit",
    secretHint: "Webhook secret from your dashboard",
  },
  {
    value: "bags",
    label: "Bags",
    description: "Solana token launchpad — launches, swaps, fee claims",
    secretHint: "Secret Hookdash signs Bags events with",
  },
  {
    value: "github",
    label: "GitHub",
    description: "Repositories and apps — pushes, pull requests, releases",
    secretHint: "Webhook secret you set in GitHub",
  },
  {
    value: "shopify",
    label: "Shopify",
    description: "Commerce — orders, products, customers, fulfilments",
    secretHint: "Your app's client secret",
  },
  {
    value: "clerk",
    label: "Clerk",
    description: "Auth and users — sign-ups, sessions, organisations",
    secretHint: "Signing secret (whsec_…)",
  },
  {
    value: "resend",
    label: "Resend",
    description: "Email — sent, delivered, bounced, opened",
    secretHint: "Signing secret (whsec_…)",
  },
  {
    value: "openai",
    label: "OpenAI",
    description: "Background responses, batches, fine-tuning jobs",
    secretHint: "Webhook signing secret (whsec_…)",
  },
  {
    value: "standard-webhooks",
    label: "Standard Webhooks",
    description: "Any Svix or Standard Webhooks sender — webhook-* or svix-* headers",
    secretHint: "Signing secret (whsec_…)",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Any provider — HMAC-SHA256 hex in X-Webhook-Signature",
    secretHint: "Shared HMAC secret",
  },
];

export function findProvider(value: string): ProviderOption {
  return PROVIDERS.find((p) => p.value === value) ?? PROVIDERS[PROVIDERS.length - 1];
}
