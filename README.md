# HookLens

Webhook debugger for African payment providers. Inspect, replay, and forward webhooks from Paystack, Flutterwave, Mono, or any custom source — in real time.

## What it does

HookLens gives you a unique ingress URL. Point your payment provider's webhook settings at it, and every incoming event gets:

- **Captured** — headers, body, signature, IP, everything
- **Verified** — provider-specific signature validation (Paystack HMAC-SHA512, Flutterwave hash verification, Mono SHA256)
- **Forwarded** — relayed to your local or staging server with full response logging
- **Streamed** — pushed to the dashboard over WebSocket in real time

No more `ngrok` + `console.log` guesswork.

## Architecture

```
                     ┌──────────────┐
  Provider ──POST──▶ │   Ingress    │──▶ PostgreSQL (events)
  (Paystack,         │  /in/:slug   │──▶ BullMQ (forward queue)
   Flutterwave,      └──────────────┘──▶ WebSocket (live push)
   Mono, etc.)              │
                            ▼
                     ┌──────────────┐
                     │   Forward    │──POST──▶ Your server
                     │   Worker     │         (localhost, staging)
                     └──────────────┘
```

```
hooklens/
├── api/          NestJS 11 backend
├── web/          Next.js 16 frontend
└── docker-compose.yml
```

## Tech stack

| Layer | Tech |
|-------|------|
| API | NestJS, TypeORM, PostgreSQL, BullMQ, Redis, Socket.io, Passport JWT |
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

This starts PostgreSQL on port `5433` and Redis on port `6380`.

### 2. Start the API

```bash
cd api
cp .env.example .env    # defaults work with docker-compose
npm install
npm run start:dev       # http://localhost:3000
```

The API auto-creates database tables on first run (TypeORM `synchronize: true` in dev).

### 3. Start the frontend

```bash
cd web
npm install
npm run dev             # http://localhost:3001
```

### 4. Use it

1. Open `http://localhost:3001` and **create an account**
2. You'll get a unique ingress URL like `http://localhost:3000/in/usr_a1b2c3d4e5f6`
3. Set this as your webhook URL in Paystack/Flutterwave/Mono
4. Create an **endpoint** in the dashboard to configure forwarding and signature verification
5. Send a test webhook — it appears on the **Live Stream** page instantly

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
| `GET` | `/api/stats` | Analytics (period: 24h, 7d, 30d, all) |
| `GET` | `/api/health` | Health check |

## Supported providers

| Provider | Signature verification | Event type detection |
|----------|----------------------|---------------------|
| Paystack | HMAC-SHA512 | `event` field in body |
| Flutterwave | Secret hash header | `event` field in body |
| Mono | SHA256 HMAC | `event` field in body |
| Custom | Skipped | Best-effort extraction |

## Environment variables

```bash
# api/.env
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=hooklens
DB_PASSWORD=hooklens_secret
DB_NAME=hooklens
REDIS_HOST=localhost
REDIS_PORT=6380
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_EXPIRY=7d
PORT=3000
NODE_ENV=development
```

## Development

```bash
# Run API tests
cd api && npm test

# Run API e2e tests
cd api && npm run test:e2e

# Lint & format
cd api && npm run lint && npm run format
cd web && npm run lint

# Production build
cd api && npm run build
cd web && npm run build
```

## License

UNLICENSED — private project.
