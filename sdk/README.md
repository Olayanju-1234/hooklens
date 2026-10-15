# hookdash-sdk

Official Node.js SDK for [Hookdash](https://hookdash.dev) — webhook capture, signature verification, and management.

## Install

```bash
npm install hookdash-sdk
```

## Quick Start

```ts
import { Hookdash } from 'hookdash-sdk'

const hd = new Hookdash({
  apiKey: 'hd_live_...',
  baseUrl: 'https://hookdash-api.onrender.com', // optional, this is the default
})

// List recent events
const { data: events } = await hd.events.list({ limit: 10 })

// Replay a failed webhook
await hd.events.replay(events[0].id)
```

## API Client

### Configuration

```ts
const hd = new Hookdash({
  apiKey: 'hd_live_...',       // Required — your API key
  baseUrl: 'https://...',      // Optional — defaults to hosted version
  timeout: 30000,              // Optional — request timeout in ms
})

// Scope requests to a specific workspace
hd.setWorkspace('workspace-uuid')
```

### Endpoints

```ts
// List all endpoints
const endpoints = await hd.endpoints.list()

// Create an endpoint
const ep = await hd.endpoints.create({
  name: 'Paystack Production',
  provider: 'paystack',
  webhookSecret: 'sk_live_...',
  forwardUrl: 'https://myapp.com/webhooks',
  retryMaxAttempts: 3,
})

// Update an endpoint
await hd.endpoints.update(ep.id, { isActive: false })

// Delete an endpoint
await hd.endpoints.delete(ep.id)
```

### Events

```ts
// List events with filters
const { data, total } = await hd.events.list({
  provider: 'paystack',
  eventType: 'charge.success',
  forwardStatus: 'failed',
  limit: 20,
  page: 1,
})

// Get a single event
const event = await hd.events.get('event-uuid')

// Replay an event
await hd.events.replay('event-uuid')

// Delete an event
await hd.events.delete('event-uuid')

// Export as CSV or JSON
const csv = await hd.events.export('csv', { provider: 'paystack' })
```

### API Keys

```ts
// List API keys
const keys = await hd.apiKeys.list()

// Create a new key (raw key only returned once)
const { rawKey } = await hd.apiKeys.create({ name: 'CI/CD' })

// Revoke a key
await hd.apiKeys.revoke('key-uuid')
```

### Workspaces

```ts
// List your workspaces
const workspaces = await hd.workspaces.list()

// Create a workspace
const ws = await hd.workspaces.create('Production')

// Invite a team member
await hd.workspaces.invite(ws.id, 'dev@company.com', 'member')

// Update settings
await hd.workspaces.update(ws.id, { retentionDays: 90 })
```

### Send Test Webhooks

Fire test payloads directly to your ingress endpoint:

```ts
const result = await hd.send({
  slug: 'usr_a1b2c3d4e5f6',
  body: {
    event: 'charge.success',
    data: { reference: 'test_123', amount: 50000 },
  },
  headers: {
    'x-paystack-signature': 'optional-test-sig',
  },
})

console.log(result.status) // 200
```

## Signature Verification

Verify webhook signatures in your own server. Supports requests forwarded by Hookdash, plus Paystack, Flutterwave and Mono directly.

```ts
import { verify } from 'hookdash-sdk/verify'
```

### Requests forwarded by Hookdash

Hookdash signs every request it forwards with [Standard Webhooks](https://www.standardwebhooks.com) headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), using your route's `whsec_` signing secret. You'll find it in the dashboard under Routes → Destinations, or at `GET /api/endpoints/:id/signing-secret`. You verify one scheme whatever the original provider was.

```ts
app.post('/webhooks', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body.toString('utf8')
  if (!verify.hookdash(raw, req.headers, process.env.HOOKDASH_SIGNING_SECRET!)) {
    return res.status(401).send('Invalid signature')
  }
  // handle the webhook...
})
```

Requests older than 5 minutes are rejected. Pass `{ toleranceSeconds }` to change that. The original provider headers are forwarded too. Any `webhook-*` headers the provider sent arrive as `x-original-webhook-*`.

### Paystack

```ts
app.post('/webhooks/paystack', (req, res) => {
  const sig = req.headers['x-paystack-signature'] as string
  const raw = JSON.stringify(req.body)

  if (!verify.paystack(raw, sig, process.env.PAYSTACK_SECRET!)) {
    return res.status(401).send('Invalid signature')
  }

  // Process verified webhook
  res.sendStatus(200)
})
```

### Flutterwave

```ts
const hash = req.headers['verif-hash'] as string
const valid = verify.flutterwave(hash, process.env.FLW_SECRET!)
```

### Mono

```ts
// Mono sends your secret itself in this header
const headerSecret = req.headers['mono-webhook-secret'] as string
const valid = verify.mono(JSON.stringify(req.body), headerSecret, process.env.MONO_SECRET!)
```

### Auto-detect Provider

```ts
const { provider, valid } = verify.auto(
  JSON.stringify(req.body),
  req.headers,
  process.env.WEBHOOK_SECRET!,
)

console.log(`Provider: ${provider}, Valid: ${valid}`)
```

### Generic HMAC

```ts
const valid = verify.hmac('sha256', rawBody, signature, secret)
```

## Express Middleware

Mirror incoming webhooks to Hookdash automatically. Zero latency impact — requests are forwarded asynchronously.

```ts
import express from 'express'
import { capture } from 'hookdash-sdk/middleware'

const app = express()
app.use(express.json())

// Mirror all POST/PUT/PATCH requests under /webhooks to Hookdash
app.use('/webhooks', capture({
  slug: 'usr_a1b2c3d4e5f6',
}))

// Your handlers run as normal
app.post('/webhooks/paystack', (req, res) => {
  processPayment(req.body)
  res.sendStatus(200)
})
```

### Middleware Options

```ts
capture({
  slug: 'usr_a1b2c3d4e5f6',           // Required — your ingress slug
  baseUrl: 'https://your-instance.com', // Optional — self-hosted URL
  paths: ['/webhooks/paystack'],        // Optional — only capture these paths
  methods: ['POST'],                    // Optional — default: POST, PUT, PATCH
})
```

The middleware automatically forwards provider signature headers (`x-paystack-signature`, `verif-hash`, `mono-webhook-secret`) so Hookdash can verify them.

## Error Handling

All API errors throw typed exceptions:

```ts
import { HookdashError, HookdashAuthError, HookdashNotFoundError } from 'hookdash-sdk'

try {
  await hd.events.get('nonexistent-id')
} catch (err) {
  if (err instanceof HookdashNotFoundError) {
    console.log('Event not found')
  } else if (err instanceof HookdashAuthError) {
    console.log('Bad API key')
  } else if (err instanceof HookdashError) {
    console.log(`Error ${err.statusCode}: ${err.message}`)
  }
}
```

## Requirements

- Node.js 18+ (uses native `fetch`)
- TypeScript 5+ (optional, full type definitions included)

## License

MIT
