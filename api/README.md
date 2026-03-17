# Hookdash API

NestJS backend for Hookdash. Handles webhook ingestion, signature verification, forwarding, and real-time streaming.

## Modules

| Module | Description |
|--------|-------------|
| `auth` | JWT-based signup/login with bcrypt password hashing |
| `ingress` | Public `POST /in/:slug` endpoint — captures incoming webhooks |
| `signature` | Provider-specific signature verification (Paystack, Flutterwave, Mono) |
| `forward` | BullMQ worker that relays events to configured forward URLs |
| `endpoints` | CRUD for webhook endpoint configurations |
| `events` | Event storage, listing, replay, and diffing |
| `stats` | Aggregated analytics by period, provider, and event type |
| `websocket` | Socket.io gateway for real-time event push to the frontend |
| `health` | Liveness check at `/api/health` |

## Running locally

```bash
# Ensure Postgres and Redis are running (from project root)
docker compose up -d postgres redis

cp .env.example .env
npm install
npm run start:dev
```

API runs on `http://localhost:3000`. Tables are auto-created via TypeORM synchronize in dev mode.

## Scripts

```bash
npm run start:dev     # Watch mode
npm run build         # Compile to dist/
npm run start:prod    # Run compiled output
npm run lint          # ESLint
npm run format        # Prettier
npm test              # Unit tests
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
```

## Key endpoints

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /in/:slug              # Webhook ingress (public, no auth)
GET    /api/events
GET    /api/events/:id
POST   /api/events/:id/replay
GET    /api/endpoints
POST   /api/endpoints
PATCH  /api/endpoints/:id
DELETE /api/endpoints/:id
GET    /api/stats?period=7d
GET    /api/health
```
