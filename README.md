# Hookdash

Webhook debugging platform for payment and on-chain event providers. Inspect, replay, transform, and forward events in real time.

## What it does

Hookdash generates a unique ingress URL per workspace. Point your provider's webhook settings at it and every incoming event is:

- **Captured** — headers, raw body, signature, IP, everything
- **Verified** — provider-specific signature validation (see supported providers below)
- **Transformed** — configurable rules to mutate or reshape the payload before forwarding
- **Forwarded** — relayed to your local or staging server via a BullMQ queue with dead-letter capture for failed deliveries
- **Streamed** — pushed to the dashboard over WebSocket in real time
- **Alerted** — Slack, Discord, or Email notifications on matching events

No more `ngrok` + `console.log` guesswork.

## Supported providers

| Provider | Signature verification |
|----------|----------------------|
| Paystack | HMAC-SHA512 |
| Flutterwave | Secret hash header |
| Mono | HMAC-SHA512 |
| Stripe | HMAC-SHA256 with timestamp tolerance + replay attack prevention |
| Bags.fm | HMAC-SHA256 (WebSocket stream for Solana token launch events) |
| Custom | Skipped |

## Architecture

```
                     ┌──────────────┐
  Provider ──POST──▶ │   Ingress    │──▶ PostgreSQL (events)
  (Paystack,         │  /in/:slug   │──▶ BullMQ (forward queue)
   Flutterwave,      └──────────────┘──▶ WebSocket (live push)
   Mono, Stripe,            │
   Bags.fm, etc.)           ▼
                     ┌──────────────┐
                     │   Forward    │──POST──▶ Your server
                     │   Worker     │         (with dead-letter queue)
                     └──────────────┘
```

```
hookdash/
├── api/          NestJS 11 backend
├── web/          Next.js 16 frontend
├── sdk/          TypeScript SDK
├── cli/          CLI tool
└── docker-compose.yml
```

## Features

- **Multi-provider signature verification** — each provider's exact spec, including Stripe's timestamp + replay attack prevention
- **Bags.fm integration** — WebSocket stream for Solana token launch events, filterable by creator, initial buy amount, and symbol pattern
- **Payload transforms** — configurable rules to mutate or reshape webhook bodies before forwarding
- **Dead letter queue** — failed forwards are captured and retryable
- **Alerting** — Slack, Discord, and Email notifications
- **Workspace management** — multi-tenant, team-friendly
- **API keys** — key-based auth alongside JWT
- **Event diff** — compare two events side by side
- **Test payloads** — send synthetic events without a live provider
- **Retention policies** — configurable event TTL
- **SDK & CLI** — programmatic and terminal access

## Tech stack

| Layer | Tech |
|-------|------|
| API | NestJS 11, TypeORM, PostgreSQL, BullMQ, Redis, Socket.io, Passport JWT |
| Web | Next.js 16, React 19, Tailwind CSS 4, GSAP, Socket.io Client |
| Infra | Docker Compose (Postgres 16, Redis 7) |

## Getting started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Start the API

```bash
cd api
cp .env.example .env
npm install
npm run start:dev       # http://localhost:3000
```

### 3. Start the frontend

```bash
cd web
npm install
npm run dev             # http://localhost:3001
```

### 4. Use it

1. Open `http://localhost:3001` and create an account
2. You'll get a unique ingress URL like `http://localhost:3000/in/usr_a1b2c3d4e5f6`
3. Set this as your webhook URL in Paystack / Flutterwave / Stripe / etc.
4. Create an **endpoint** to configure forwarding and signature verification
5. Send a test webhook — it appears on the Live Stream page instantly

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `POST` | `/in/:slug` | Webhook ingress (public) |
| `GET` | `/api/events` | List events (paginated, filterable) |
| `GET` | `/api/events/:id` | Event detail |
| `POST` | `/api/events/:id/replay` | Replay an event |
| `GET` | `/api/events/:id/diff/:otherId` | Diff two events |
| `GET/POST/PATCH/DELETE` | `/api/endpoints` | Endpoint CRUD |
| `GET/POST/PATCH/DELETE` | `/api/transform` | Transform rule CRUD |
| `GET/POST/PATCH/DELETE` | `/api/alerting` | Alert rule CRUD |
| `GET` | `/api/dead-letter` | Failed forward queue |
| `POST` | `/api/dead-letter/:id/retry` | Retry failed forward |
| `GET` | `/api/stats` | Analytics (24h, 7d, 30d, all) |
| `GET` | `/api/health` | Health check |

## Environment variables

```bash
# api/.env
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=hookdash
DB_PASSWORD=hookdash_secret
DB_NAME=hookdash
REDIS_HOST=localhost
REDIS_PORT=6380
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_EXPIRY=7d
PORT=3000
NODE_ENV=development
```

## License

UNLICENSED — private project.
