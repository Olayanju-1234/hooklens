import { hex, mulberry32, rand01 } from "../sim/rng";
import type { SimEvent } from "../sim/engine";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const DRIFT_FIELD: Record<string, string> = {
  stripe: "payment_details",
  paystack: "split_code",
  flutterwave: "meta",
  github: "merge_group",
  shopify: "current_total_duties_set",
  clerk: "legal_accepted_at",
  twilio: "ApiVersion",
  linear: "teamKey",
  bags: "bondingCurvePct",
  openai: "usage",
};

export interface Payload {
  body: Record<string, Json>;
  driftField: string | null;
}

/** Deterministic, provider-shaped bodies. Emails and phone numbers are pre-masked, as the redaction feature would. */
export function payloadFor(e: SimEvent): Payload {
  const r = mulberry32(e.seed ^ 0x5eed);
  const n = (min: number, max: number) => Math.floor(min + r() * (max - min));
  const id = (p: string, len = 14) => `${p}${hex(e.seed + p.length, len)}`;
  const created = 1792000000 + Math.floor(e.t0);
  let body: Record<string, Json>;
  switch (e.source) {
    case "stripe":
      body = {
        id: id("evt_", 16),
        object: "event",
        type: e.eventType,
        created,
        livemode: false,
        data: { object: { id: id("pi_"), amount: n(900, 48000), currency: "usd", status: "succeeded", customer: id("cus_", 10) } },
      };
      break;
    case "paystack":
      body = {
        event: e.eventType,
        data: {
          id: n(3_000_000_000, 3_999_999_999),
          reference: `T${hex(e.seed, 10)}`,
          amount: n(1000, 900000) * 100,
          currency: "NGN",
          status: "success",
          channel: r() > 0.5 ? "card" : "bank_transfer",
          customer: { email: "a•••@acme.dev", customer_code: id("CUS_", 10) },
        },
      };
      break;
    case "flutterwave":
      body = { event: e.eventType, data: { id: n(400000, 999999), tx_ref: `flw_${hex(e.seed, 8)}`, amount: n(500, 90000), currency: "NGN", status: "successful" } };
      break;
    case "github":
      body = {
        action: e.eventType.split(".")[1] ?? null,
        ref: "refs/heads/main",
        repository: { full_name: "acme/api", private: true },
        sender: { login: ["ada", "tobi", "kemi", "sam"][n(0, 4)] },
        head_commit: { id: hex(e.seed, 12), message: ["fix: idempotent ledger writes", "feat: refunds v2", "chore: bump deps"][n(0, 3)] },
      };
      break;
    case "shopify":
      body = { id: n(5_000_000_000, 5_999_999_999), order_number: n(1000, 9999), total_price: (n(800, 40000) / 100).toFixed(2), currency: "USD", financial_status: "paid" };
      break;
    case "clerk":
      body = { type: e.eventType, object: "event", data: { id: id("user_", 12), email_addresses: [{ email_address: "o•••@acme.dev" }] } };
      break;
    case "twilio":
      body = { MessageSid: `SM${hex(e.seed, 16)}`, MessageStatus: e.eventType.split(".")[1] ?? "delivered", To: "+234•••••4821", From: "+1•••••0199" };
      break;
    case "linear":
      body = { action: e.eventType.endsWith("create") ? "create" : "update", type: e.eventType.split(".")[0], data: { id: hex(e.seed, 12), identifier: `ENG-${n(100, 999)}`, title: "Ledger drift on retries" } };
      break;
    case "bags":
      body = { type: e.eventType, mint: `${hex(e.seed, 4)}…${hex(e.seed + 9, 4)}`, symbol: ["MOON", "WIF", "BONK2", "PEPE"][n(0, 4)], creator: `${hex(e.seed + 3, 4)}…${hex(e.seed + 4, 4)}`, initialBuySol: Number((r() * 4).toFixed(2)) };
      break;
    default:
      body = { id: id("evt_", 16), object: "event", type: e.eventType, created_at: created, data: { id: id("resp_", 16) } };
  }
  const drifted = rand01(e.seed, 404) < 0.14;
  const driftField = drifted ? DRIFT_FIELD[e.source] ?? null : null;
  if (driftField) body[driftField] = r() > 0.5 ? { added: true } : n(1, 100);
  return { body, driftField };
}

export function signatureFor(e: SimEvent) {
  const expected = hex(e.seed ^ 0x51a, 64);
  const received = e.forged ? hex(e.seed ^ 0xbad, 64) : expected;
  return { expected, received };
}
