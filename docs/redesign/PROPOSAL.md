# Hookdash Flight Deck

Product proposal, roadmap and design direction for Hookdash, with a working prototype at `web/src/app/lab`.

Branch: `claude/redesign-exploration-981ad9`. Nothing here touches `api/` or production.

Designed version with a live simulation: https://claude.ai/artifact/13UpSVNnLe7x53KmhPg4Cu (private until shared from its Share menu).

---

## The short version

**One-liner:** *Every event, in flight.*

**Positioning:** Hookdash is the open-source event gateway you can watch. Webhooks from any provider (payments, code, commerce, identity, messaging, chains, AI agents) land on one gateway. It proves each one is genuine, delivers it to every destination with retries you can see, and records everything so you can rewind and replay.

**Category:** observable inbound event gateway. It is not an inspector: inspectors capture and show requests, while Hookdash verifies, routes, retries, records and replays them.

### Top 5 recommendations

1. **Make the delivery core true before adding surface.** Each destination gets its own delivery job with its own retries. Dead letters are actually created, and every stage is timed. The new visual language depends on this data being real. *(M, after the bug-fix session lands)*
2. **Generalise sources.** Replace the provider enum and the hard-coded signature switch with declarative verification recipes, and give each source its own ingress URL. Ship Standard Webhooks first: one recipe covers Clerk, OpenAI, Resend and any other Svix-style sender. Then add GitHub, Shopify, Slack, Twilio and Linear. *(L)*
3. **Turn replay into a time machine.** Add windowed replay (a time range plus filters, sent to a destination at original spacing or compressed), a CLI `listen` that forwards raw bodies to localhost, and a recorder scrubber in the dashboard. *(L)*
4. **Rebuild the dashboard as the Tower.** Live and Events merge into **Traffic** (radar, arrivals board, flight recorder). Endpoints, Destinations and Transforms merge into **Routes**. Dead letters become the **Recorder**. Bags becomes a source instead of a tab. *(L)*
5. **Ship the flight-deck landing and tokens.** Replace the particle network, aurora and glass with the `/lab` chart, where every moving pixel is a webhook. Use cockpit state colours, with Archivo and Martian Mono for type. *(M)*

---

## What exists today

**Strong foundations**

- Raw-body ingress.
- HMAC verification for 5 providers, including Stripe's timestamp tolerance.
- BullMQ forwarding with backoff, and multiple destinations.
- Transforms.
- Replay that creates linked events.
- Event diff.
- Slack, Discord and email alerts.
- p50/p95/p99 latency.
- Workspaces.
- Scaffolding for a CLI and an SDK.
- The Bags restream bridge, which nobody else has.

**What blocks the next step.** These come from a read-only code sweep; the full list with line references is in the shared notes. The security issues are being fixed in a parallel session.

- Fan-out retries per job, not per destination. One failing destination re-sends to the ones that already succeeded.
- Dead letters are effectively never created, because the last attempt doesn't throw.
- One ingress URL per user, resolved to "newest endpoint". Two sources can't have separate URLs.
- Provider is a fixed enum. Event type is read only from body fields, never from headers, so `X-GitHub-Event` and `X-Shopify-Topic` are ignored.
- Signature checks are hex-only HMAC from a hard-coded header map. That rules out Shopify (base64), Svix/Clerk, Twilio (URL + params) and Linear.
- The transform DTO and the processor disagree on field names, so rename and copy do nothing in real forwarding.
- The CLI (`login`, `events`, `endpoints`) and the SDK (auth header, pagination) are out of sync with the API. API keys can't authenticate anything.
- The timeline uses `receivedAt` for every stage, so there are no real stage timings. Retention is never scheduled.

---

## Features to add

Effort for a solo side-project developer: **S** ≤ 2 days, **M** ≤ 1 week, **L** 2–4 weeks, **XL** 1–2 months.

### Sources: any provider, not just payments

| Feature | What it does | Effort |
|---|---|---|
| Verification recipes | Declarative `{headers, algorithm sha1/256/512, encoding hex/base64, signed-payload template, prefix, secret decoding, timestamp + tolerance}`. Recipes for Standard Webhooks (Clerk, OpenAI, Resend, Svix senders), GitHub, Shopify, Slack, Twilio, Linear, Stripe, Paystack, Flutterwave, Mono and Bags, plus a "custom HMAC" builder with a live tester. | L |
| Per-source ingress + challenges | `/in/src_…` per source. Handles GET and challenge handshakes (Slack `url_verification`, Meta `hub.challenge`). Configurable response. | M |
| Event identity from headers | Event type and delivery id from headers or body (`X-GitHub-Delivery`, `webhook-id`, Stripe `id`). Real dedupe within an idempotency window, instead of just a flag. | M |
| Signed samples per source | Sample payloads signed with *your* secret, so the simulator exercises your own verification code. | M |
| Stream sources | Generalise the Bags restream: subscriptions (Bags, Solana program logs, EVM contract events) turned into signed webhooks, scoped to a tenant. | L |
| Agent callback correlation | Register an outgoing job id (OpenAI background response or batch, Replicate prediction). Hookdash waits for the matching webhook, shows "awaiting callback" and alerts if it's late. | M |

### Delivery

| Feature | What it does | Effort |
|---|---|---|
| Per-destination jobs | Fan-out as independent jobs, each with its own retry policy. | M |
| Circuit breaker ("ground stop") | Pauses a failing destination, probes it, resumes automatically; events wait in holding meanwhile. | M |
| Rate limits and ordering keys | Protects your server from bursts. FIFO per customer or resource when order matters. | M |
| Content-based routing | Rules by event-type glob or JSONPath predicate decide destinations. Generalises the Bags launch filters. | M |
| Outbound signing | Hookdash signs what it forwards with Standard Webhooks headers, so your code verifies one scheme whatever the provider. | S |
| Non-HTTP destinations | SQS, Redis Streams, NATS, Postgres insert, Slack message. Start with HTTP and localhost. | L |

### Time travel

| Feature | What it does | Effort |
|---|---|---|
| Recorder | Rewinds the dashboard (radar and board) to any moment, from stored attempt timings. | M |
| Windowed replay | A time window plus filters, replayed to destination X at 1×, 10× or all at once, with a dry-run diff of what will be sent. | L |
| Patch and replay | Edit a payload, replay it, and diff old against new. | M |
| Deep diff | Nested diff, and "compare with previous event of this type". | S |

### Understanding

| Feature | What it does | Effort |
|---|---|---|
| Schema inference and drift | Infers a schema per (source, event type) and flags new, removed or retyped fields, e.g. "Paystack added `split_code` on 3 Oct". | M |
| Failure clustering | Groups failures by (destination, status, response fingerprint): "37 failures: 500 TypeError in /webhooks/stripe". Replay the whole cluster after the fix. | M |
| Health | Per-destination SLOs (success %, p50/p95, error budget), status-code histogram, volume over time. | M |
| Expectations | Event contracts: "every `checkout.session.completed` is followed by `invoice.paid` within 5 min"; "Paystack sends at least 1/hour on weekdays". Needs alert cooldowns and dedupe first (S). | L |

### Developer loop

| Feature | What it does | Effort |
|---|---|---|
| CLI v2 | Working auth. `listen` forwards the raw body and original headers and reports results back, so localhost shows on the radar. Catches up on missed events. Adds `replay --since 10m --status dead --to localhost:3000` and `trigger stripe invoice.paid`. | M |
| MCP server | Tools for coding agents: `search_events`, `get_event`, `replay`, `diff`, `explain_failure`. "Why did the last 5 Stripe events fail?" | S–M |
| SDK sync | API-key auth that works. `verify()` for every recipe and for Hookdash's own outbound signature. Express, Next and Hono middleware. | M |
| Redacted share links | Masks PII by rule, so you can share an event in a support thread with a provider. | M |

---

## Remove or revamp

| Today | Verdict | Why |
|---|---|---|
| Landing particle network and connection lines | Remove | Motion without meaning. Replace it with the chart, where every moving thing is a webhook. |
| Aurora gradients, glass cards, gradient text, magnetic buttons, shimmer borders, global noise grain | Remove | Generic AI-startup texture that lowers contrast over data. |
| "Three steps" section; the same LiveFeed shown twice | Remove | Template filler. The chapters explain the product by showing it. |
| Live and Events as separate tabs | Merge into **Traffic** | Live tail becomes a toggle (Follow), not a page. |
| Endpoints, Destinations, Transforms, Bags filters | Merge into **Routes** | One pipeline: source → seal → transforms → rules → destinations. |
| Dead Letter page with a per-endpoint selector | Revamp into **Recorder** | Works across routes, clusters failures, replays in bulk, rewinds. |
| Bags as a top-level tab | Revamp as a **Source** | It stays a differentiator, but not the product's frame. Keep its alert templates. |
| Analytics | Revamp into **Health** | Per-destination SLOs, status codes, latency as distance. |
| Test page | Revamp into **Simulator** | Signed samples for any source, plus chaos: take a destination down, inject latency. |
| Docs tab inside the dashboard | Move out | Public docs, with contextual recipe help inside Routes. |
| Legacy `forwardUrl` on endpoints | Remove | Two forwarding models split the data and the UI. Migrate to destinations. |
| "Webhook Debugger for African payment providers" | Revamp | Payments stay first-class, but they're one lane of many. |
| "Built in Lagos" | Keep | It's true and specific, and nothing generic can copy it. |

**New navigation:** Traffic · Routes · Recorder · Health · Simulator · Settings (Sources, Team, API keys, Audit).

---

## Roadmap

### Now (4–6 weeks): make the core true

| # | Item | Effort |
|---|---|---|
| 1 | Per-destination delivery jobs, real dead letters, attempt and stage timings | M |
| 2 | Source model plus per-source ingress URLs, replacing the provider enum and user slug | M |
| 3 | Recipe engine with Standard Webhooks, GitHub and Shopify recipes | L |
| 4 | Outbound signing of forwarded requests | S |
| 5 | CLI v2 `listen` (raw body, results reported back, auth fixed) | M |
| 6 | Flight-deck tokens and the new landing, promoted from `/lab` | M |

### Next (1–3 months): the Tower

| # | Item | Effort |
|---|---|---|
| 7 | Traffic view on real data: radar, arrivals board, flight recorder | L |
| 8 | Routes view with content-based routing | L |
| 9 | Recorder: rewind, windowed replay, failure clustering | L |
| 10 | Health view, alert cooldowns, circuit breaker | M |
| 11 | MCP server | S–M |
| 12 | Schema inference and drift | M |

### Later (3+ months): beyond the gateway

| # | Item | Effort |
|---|---|---|
| 13 | Expectations (event contracts) | L |
| 14 | Stream sources beyond Bags (Solana, EVM) | L |
| 15 | Agent callback correlation | M |
| 16 | Non-HTTP destinations | L |
| 17 | Redacted share links and PII rules | M |
| 18 | Outbound product (sending webhooks to your own customers). Only once inbound is solid. | XL |

---

## Design direction: the flight deck

Webhooks behave like flights. They depart a provider, clear security, connect at a hub, land at destinations, and circle in holding patterns when a runway is closed. Every one leaves a flight recorder behind. Hookdash is the tower.

The metaphor gives every visual a job. The product's words stay technical (retry, dead letter, replay); only the visuals borrow from aviation charts and glass-cockpit displays.

### Principles

1. **Every moving pixel is a webhook.** No ambient particles. When traffic stops, the screen goes still.
2. **Colour is state, never brand.** The glass-cockpit convention:
   - white: unverified, arriving
   - cyan: verified, in flight
   - green: delivered
   - amber: holding, retrying
   - red: rejected or failed attempt
   - orange: dead letter. Flight recorders are painted international orange so they can be found.
   - magenta: the selected route and replays. In avionics, the "magenta line" is the active flight plan.
3. **Distance is latency.** Destinations sit on range rings at their median latency: 10 ms, 100 ms, 1 s on a log scale.
4. **Time is an axis you can move along.** The whole simulation is a pure function of time, so rewind costs nothing. In the product, that's the recorder scrubber.
5. **Retries are a holding stack.** One racetrack level per attempt, and each level holds twice as long as the one below. Stack height is queue depth.
6. **Signatures are a gate.** The compass rose turns one tick per verified event. Forged packets break apart at the gate and never reach a destination.
7. **Type from instruments.** Archivo, using its width axis (expanded for headlines, condensed for labels), plus Martian Mono, condensed, for data. Flight-strip codes in spaced capitals.
8. **Two charts.** Night (dark) and day (paper). The dashboard isn't dark-only.

### Concept map

| Webhook concept | Visual | Where |
|---|---|---|
| Event | Packet with a comet trail | Hero, radar |
| Source | Waypoint triangle on the outer arc | Hero, radar |
| Signature check | Gate and compass rose; ticks = verified count | Chapter 02 |
| Invalid signature | Red shards at the gate; "✗ forged" on the board | Hero, board |
| Fan-out | One flight per destination | Hero, route squares on the board |
| Latency | Distance from the gate, shown by range rings | Hero, radar |
| Retry and backoff | Holding stack of racetracks; hatched amber lanes | Chapter 04, radar, recorder pane |
| Dead letter | Orange "black box" on the chart floor | Chapter 05, radar |
| Replay | Magenta flight lifting off the floor; magenta lane | Hero, recorder pane |
| Rewind | Recorder bar; the scene tints magenta while rewound | Hero, Tower |
| Outage | Red destination; red band on the recorder | Hero, Tower |
| Schema drift | Magenta-highlighted field in the payload | Tower recorder pane |

### Components

- **Flight strip:** chapter cards and recorder headers. A coloured state band, a code column, then fields.
- **Split-flap arrivals board:** only the characters that changed flip, so your eye lands on what's new. Real `<table>` semantics; hidden text holds the final value for screen readers.
- **Radar:** top-down chart of routes. Click a packet to inspect it. The selected event's path is drawn as the magenta line.
- **Recorder bar:** traffic histogram, outage bands, replay ticks and a playhead. It's a native range input, so arrow keys work.
- **Lanes:** per-destination journey with flight, hold and dead segments, and attempt marks with status codes.

### Banned

Purple gradients, glassmorphism, aurora blobs, gradient text, the hero + 3 cards + CTA layout, ambient particle networks, Inter or Geist on dark, decorative noise.

### Accessibility and performance

- **Reduced motion:** traffic stays still until the viewer chooses "Play traffic". Camera moves become cuts, and flaps don't animate.
- **No WebGL:** a Canvas 2D radar, the same one the dashboard uses. The dashboard never needs WebGL.
- **One draw call:** every packet is an instanced quad, and the vertex shader computes its position from leg data and the current time. The CPU uploads legs about 4 times a second, not every frame, and rendering stops offscreen.
- **Labels are DOM:** labels and buttons are real elements. Canvases are hidden from assistive tech and have text summaries. A polite live region announces outages.
- **Keyboard:** ←/→ rewind, L live, F forge (landing); J/K move, R replay, F follow, T theme, / filter (Tower).

---

## Prototype

```bash
cd web && npm install && npm run dev -- --port 3017
```

- `http://localhost:3017/lab`: the landing. A sticky WebGL chart, five chapters as flight strips, the recorder scrubber and live actions.
- `http://localhost:3017/lab/tower`: the reimagined Live dashboard. Radar, arrivals board, flight recorder, day/night chart.
- Add `?fallback=2d` to force the no-WebGL path and `?motion=reduced` to force reduced motion.

**What to try**

1. Click **Take billing.internal down** and watch the holding stack build.
2. Drag the recorder back to rewind.
3. Press **L** to return to live.
4. Use **Restore & replay** to see the dead letters fly the magenta line.
5. In the Tower, click a packet on the radar to open its flight recorder.

Everything is simulated by a deterministic engine (`web/src/components/lab/sim`). Nothing calls the API.

**Wiring it to real data.** Map socket `webhook` and `forward_result` events, plus `ForwardResult` rows, onto the engine's `SimEvent` and `Journey` shapes. That needs per-attempt socket events and real stage timings, which is roadmap item 1.

**Known gaps**

- In dev mode, the first load compiles three.js and takes a few seconds.
- Not tested on real phones or Safari, and frame rate wasn't measured.
- Tower tabs other than Traffic are inert.
- The engine has no tests yet.
