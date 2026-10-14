import { latencyRadius, type Vec3, type Racetrack } from "./geometry";

export type SourceKind = "payments" | "code" | "commerce" | "identity" | "comms" | "issues" | "on-chain" | "agents";

export interface Source {
  id: string;
  label: string;
  kind: SourceKind;
  scheme: string;
  header: string;
  events: string[];
  weight: number;
  routes: string[];
  pos: Vec3;
}

export interface Destination {
  id: string;
  host: string;
  note: string;
  p50: number;
  flakiness: number;
  pos: Vec3;
  radial: [number, number];
  angle: number;
}

type SourceDef = Omit<Source, "pos">;
type DestinationDef = Omit<Destination, "pos" | "radial">;

const SOURCE_DEFS: SourceDef[] = [
  { id: "stripe", label: "Stripe", kind: "payments", scheme: "HMAC-SHA256 · t=,v1=", header: "Stripe-Signature", weight: 1.4, routes: ["api", "billing"],
    events: ["payment_intent.succeeded", "invoice.paid", "checkout.session.completed", "charge.refunded", "customer.subscription.updated"] },
  { id: "paystack", label: "Paystack", kind: "payments", scheme: "HMAC-SHA512 · hex", header: "x-paystack-signature", weight: 1.3, routes: ["api", "billing"],
    events: ["charge.success", "transfer.success", "subscription.create", "refund.processed"] },
  { id: "flutterwave", label: "Flutterwave", kind: "payments", scheme: "secret hash", header: "verif-hash", weight: 0.7, routes: ["api", "billing"],
    events: ["charge.completed", "transfer.completed"] },
  { id: "github", label: "GitHub", kind: "code", scheme: "HMAC-SHA256 · sha256=", header: "X-Hub-Signature-256", weight: 1.1, routes: ["ci"],
    events: ["push", "pull_request.opened", "workflow_run.completed", "release.published"] },
  { id: "shopify", label: "Shopify", kind: "commerce", scheme: "HMAC-SHA256 · base64", header: "X-Shopify-Hmac-Sha256", weight: 0.9, routes: ["api", "staging"],
    events: ["orders/create", "orders/paid", "products/update", "refunds/create"] },
  { id: "clerk", label: "Clerk", kind: "identity", scheme: "Standard Webhooks", header: "svix-signature", weight: 0.6, routes: ["api"],
    events: ["user.created", "session.created", "organizationMembership.created"] },
  { id: "twilio", label: "Twilio", kind: "comms", scheme: "HMAC-SHA1 · url+params", header: "X-Twilio-Signature", weight: 0.55, routes: ["api"],
    events: ["message.delivered", "message.failed", "call.completed"] },
  { id: "linear", label: "Linear", kind: "issues", scheme: "HMAC-SHA256 · hex", header: "Linear-Signature", weight: 0.45, routes: ["ci"],
    events: ["Issue.create", "Issue.update", "Comment.create"] },
  { id: "bags", label: "Bags", kind: "on-chain", scheme: "HMAC-SHA256 · hex", header: "x-bags-signature", weight: 0.8, routes: ["api", "laptop"],
    events: ["token_launch", "swap", "fee_claim_available"] },
  { id: "openai", label: "OpenAI", kind: "agents", scheme: "Standard Webhooks", header: "webhook-signature", weight: 0.6, routes: ["api", "laptop"],
    events: ["response.completed", "batch.completed", "response.failed"] },
];

const DESTINATION_DEFS: DestinationDef[] = [
  { id: "billing", host: "billing.internal", note: "ledger service", p50: 110, flakiness: 0.006, angle: -44 },
  { id: "api", host: "api.acme.dev", note: "production", p50: 38, flakiness: 0.004, angle: -20 },
  { id: "laptop", host: "localhost:3000", note: "via hookdash listen", p50: 160, flakiness: 0.02, angle: 2 },
  { id: "ci", host: "ci-runner.fly.dev", note: "build queue", p50: 240, flakiness: 0.01, angle: 23 },
  { id: "staging", host: "staging.acme.dev", note: "preview env", p50: 520, flakiness: 0.05, angle: 45 },
];

export const HUB: Vec3 = [0, 0.95, 0];
export const GATE_RADIUS = 0.9;
export const SOURCE_RADIUS = 6.4;
export const MAX_ATTEMPTS = 4;
export const BACKOFF_BASE = 1.6;
export const HOLD_SPEED = 1.9;

const deg = (d: number) => (d * Math.PI) / 180;

export const SOURCES: Source[] = SOURCE_DEFS.map((s, i) => {
  const spread = 116;
  const a = deg(180 - spread / 2 + (spread * i) / (SOURCE_DEFS.length - 1));
  return { ...s, pos: [SOURCE_RADIUS * Math.cos(a), 0.02, SOURCE_RADIUS * Math.sin(a)] };
});

export const DESTINATIONS: Destination[] = DESTINATION_DEFS.map((d) => {
  const r = latencyRadius(d.p50);
  const a = deg(d.angle);
  const radial: [number, number] = [Math.cos(a), Math.sin(a)];
  return { ...d, radial, pos: [r * radial[0], 0.02, r * radial[1]] };
});

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
export const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));
export const DEST_INDEX = new Map(DESTINATIONS.map((d, i) => [d.id, i]));

/** Each retry climbs one level of the holding stack above its destination. */
export function holdFor(dest: Destination, level: number): Racetrack {
  const [rx, rz] = dest.radial;
  return {
    center: [dest.pos[0] - rx * 0.2, 0.85 + 0.42 * level, dest.pos[2] - rz * 0.2],
    dir: [-rz, rx],
    length: 0.8,
    radius: 0.26,
  };
}

export function graveyardFor(dest: Destination, seed: number): Vec3 {
  const [rx, rz] = dest.radial;
  const a = ((seed % 6283) / 1000) * 1;
  const r = 0.12 + (((seed >>> 13) % 1000) / 1000) * 0.42;
  return [dest.pos[0] + rx * 0.95 + Math.cos(a) * r, 0.03, dest.pos[2] + rz * 0.95 + Math.sin(a) * r];
}

export const LATENCY_RINGS = [
  { ms: 10, label: "10 ms" },
  { ms: 100, label: "100 ms" },
  { ms: 1000, label: "1 s" },
];
