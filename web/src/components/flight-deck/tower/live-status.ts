import type { Phase } from "../sim/engine";
import type { TimelineStep } from "@/lib/api";
import type { DestOutcome } from "../live-traffic";

export interface LiveStatus {
  phase: Phase | "skipped";
  label: string;
}

/** Maps API forward status (plus attempts seen on the socket) onto the board's state vocabulary. */
export function liveStatus(forwardStatus: string, attempts = 0, maxAttempts = 4): LiveStatus {
  switch (forwardStatus) {
    case "forwarded":
      return { phase: "delivered", label: "DELIVERED" };
    case "pending":
      return { phase: "flying", label: "EN ROUTE" };
    case "failed":
      if (attempts > 0 && attempts < maxAttempts) return { phase: "holding", label: `RETRYING ${attempts}/${maxAttempts}` };
      return { phase: "dead", label: attempts ? "DEAD LETTER" : "FAILED" };
    case "blocked":
      return { phase: "rejected", label: "REJECTED" };
    case "skipped":
      return { phase: "skipped", label: "NO ROUTE" };
    default:
      return { phase: "flying", label: forwardStatus.toUpperCase() };
  }
}

export interface Lane {
  key: string;
  attempts: { n: number; ok: boolean; code: string; latencyMs: number | null; at: number }[];
}

const FORWARD_STEPS = new Set(["forwarded", "retried"]);

/** Timeline detail reads "<label or url> → <code or status>"; legacy single-URL forwards have no arrow. */
export function lanesFromTimeline(steps: TimelineStep[], receivedAt: string): Lane[] {
  const t0 = new Date(receivedAt).getTime();
  const lanes = new Map<string, Lane>();
  for (const s of steps) {
    if (!FORWARD_STEPS.has(s.step) || s.status === "warning") continue;
    const [left, right] = s.detail.includes(" → ") ? s.detail.split(" → ") : ["forward URL", s.detail];
    const lane = lanes.get(left) ?? { key: left, attempts: [] };
    lane.attempts.push({
      n: lane.attempts.length + 1,
      ok: s.status === "success",
      code: /\((\d{3})\)/.exec(right)?.[1] ?? right.replace(/^Forward\s+/, "").replace(/\s*\(N\/A\)$/, ""),
      latencyMs: s.latencyMs,
      at: (new Date(s.timestamp).getTime() - t0) / 1000,
    });
    lanes.set(left, lane);
  }
  return Array.from(lanes.values());
}

export function outcomesFromTimeline(steps: TimelineStep[], receivedAt: string): DestOutcome[] {
  return lanesFromTimeline(steps, receivedAt).map((l) => {
    const last = l.attempts[l.attempts.length - 1];
    return { key: l.key, ok: last.ok, latencyMs: last.latencyMs };
  });
}

export interface Scheme {
  scheme: string;
  header: string | null;
  kind: string;
  /** Other headers the API accepts for this provider, checked after `header`. */
  altHeaders?: string[];
  /** A request without a signature header stays unverified rather than failing. */
  optional?: boolean;
}

export const SCHEMES: Record<string, Scheme> = {
  stripe: { scheme: "HMAC-SHA256 · t=,v1= · 5 min tolerance", header: "stripe-signature", kind: "payments" },
  paystack: { scheme: "HMAC-SHA512 · hex", header: "x-paystack-signature", kind: "payments" },
  flutterwave: { scheme: "secret hash", header: "verif-hash", kind: "payments" },
  mono: { scheme: "secret in header", header: "mono-webhook-secret", kind: "open banking" },
  bags: { scheme: "HMAC-SHA256 · hex", header: "x-bags-signature", kind: "on-chain" },
  github: { scheme: "HMAC-SHA256 · sha256= hex", header: "x-hub-signature-256", kind: "code" },
  shopify: { scheme: "HMAC-SHA256 · base64", header: "x-shopify-hmac-sha256", kind: "commerce" },
  "standard-webhooks": { scheme: "HMAC-SHA256 · id.timestamp.body · base64", header: "webhook-signature", kind: "standard webhooks" },
  clerk: { scheme: "HMAC-SHA256 · id.timestamp.body · base64", header: "svix-signature", kind: "auth" },
  resend: { scheme: "HMAC-SHA256 · id.timestamp.body · base64", header: "svix-signature", kind: "email" },
  openai: { scheme: "HMAC-SHA256 · id.timestamp.body · base64", header: "webhook-signature", kind: "ai" },
  custom: {
    scheme: "HMAC-SHA256 · hex · optional",
    header: "x-webhook-signature",
    altHeaders: ["x-signature", "x-hub-signature-256"],
    kind: "custom",
    optional: true,
  },
};

/** The signature header actually present on a request, if any. */
export function receivedSignature(scheme: Scheme, headers: Record<string, string>): { header: string; value: string } | null {
  for (const h of scheme.header ? [scheme.header, ...(scheme.altHeaders ?? [])] : []) {
    const value = headers[h] ?? headers[h.toLowerCase()];
    if (value) return { header: h, value: String(value) };
  }
  return null;
}
