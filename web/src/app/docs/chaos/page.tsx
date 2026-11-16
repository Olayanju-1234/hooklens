import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Chaos mode: test your webhook handler for duplicates, delays and ordering | Hookdash",
  description:
    "Send your Paystack, Flutterwave or Stripe handler the same webhook twice, a late webhook, webhooks out of order and a stale replay, then check what it did.",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

const pre =
  "overflow-x-auto rounded-sm border border-border-primary bg-bg-tertiary p-4 font-mono text-[12px] leading-6 text-text-primary whitespace-pre";
const code = "font-mono text-[13px] text-text-primary";

const CI_SCRIPT = `# HOOKDASH_API_KEY comes from Settings > API Keys (hd_live_...)
API=${API}
ROUTE=<your route id>   # target: a destination id, or "fallback" for the route's forward URL

RUN=$(curl -sf -X POST "$API/chaos/scenarios/paystack-charge-success-3x/run" \\
  -H "x-api-key: $HOOKDASH_API_KEY" -H 'content-type: application/json' \\
  -d "{\\"endpointId\\":\\"$ROUTE\\",\\"target\\":\\"fallback\\"}" | jq -r .id)

# Poll until every delivery has landed (about 10 s for this scenario)
for i in $(seq 1 60); do
  curl -sf "$API/chaos/runs/$RUN" -H "x-api-key: $HOOKDASH_API_KEY" | jq -e .complete >/dev/null && break
  sleep 3
done

curl -sf "$API/chaos/runs/$RUN" -H "x-api-key: $HOOKDASH_API_KEY" \\
  | jq '.deliveries[] | {chaosKind, chaosSeq, responseCode}'

# Then assert on your own database: one ledger row for the reference, not three.`;

const NEST_EXAMPLE = `// main.ts needs NestFactory.create(AppModule, { rawBody: true }) for req.rawBody
import { verify } from 'hookdash-sdk/verify';

// webhooks.controller.ts: verify, enqueue, answer 200 quickly
@Controller('webhooks')
export class WebhooksController {
  constructor(@InjectQueue('payments') private readonly queue: Queue) {}

  @Post('paystack')
  @HttpCode(200)
  async paystack(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody!.toString('utf8');
    if (!verify.hookdash(raw, req.headers, process.env.HOOKDASH_SIGNING_SECRET!)) {
      throw new UnauthorizedException();
    }
    const event = JSON.parse(raw) as { event: string; data: { id: number; reference: string } };
    // The provider's own ids: a provider retry reaches you as a new Hookdash event with a new webhook-id.
    // No ':' in it, since BullMQ rejects most custom job ids that contain one
    const key = \`paystack-\${event.event}-\${event.data.id}\`;
    await this.queue.add('paystack-event', { key, event }, { jobId: key });
    return { received: true };
  }
}

// payments.processor.ts: the unique key and the work commit together, or not at all
@Processor('payments')
export class PaymentsProcessor extends WorkerHost {
  constructor(private readonly dataSource: DataSource) { super(); }

  async process(job: Job<{ key: string; event: { event: string; data: { reference: string } } }>) {
    await this.dataSource.transaction(async (m) => {
      const fresh = await m.query(
        'INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
        [job.data.key],
      );
      if (fresh.length === 0) return; // seen before: a duplicate, a retry or a replay

      if (job.data.event.event === 'charge.success') {
        // Guarded transition: a late or repeated event can't move the order backwards
        await m.query(
          "UPDATE orders SET status = 'paid' WHERE reference = $1 AND status = 'pending'",
          [job.data.event.data.reference],
        );
      }
    });
  }
}`;

const EXPRESS_EXAMPLE = `const express = require('express');
const { Pool } = require('pg');
const { verify } = require('hookdash-sdk/verify');

const pool = new Pool();
const app = express();

app.post('/webhooks/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verify.hookdash(raw, req.headers, process.env.HOOKDASH_SIGNING_SECRET)) {
    return res.sendStatus(401); // also rejects a replay signed more than 5 minutes ago
  }
  const event = JSON.parse(raw);
  const key = \`paystack-\${event.event}-\${event.data.id}\`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [key],
    );
    if (rowCount === 1 && event.event === 'charge.success') {
      await client.query(
        "UPDATE orders SET status = 'paid' WHERE reference = $1 AND status = 'pending'",
        [event.data.reference],
      );
    }
    await client.query('COMMIT');
    res.sendStatus(200); // keep this path to a couple of quick writes; queue anything slow
  } catch (err) {
    await client.query('ROLLBACK');
    res.sendStatus(500); // the provider will retry
  } finally {
    client.release();
  }
});`;

export default function ChaosDocsPage() {
  return (
    <LegalPage title="Test your Paystack and Flutterwave webhook handler for duplicates, delays and ordering" updated="16 November 2026">
      <section>
        <p>
          Your webhook handler will get the same event twice, an event minutes late, or two events in the wrong order.
          Providers retry when they don&apos;t get a 200 in time, and a retry after a lost acknowledgement looks exactly
          like a duplicate. Chaos mode in Hookdash sends deliveries to your own handler with those faults added, so you
          can check what it does before real traffic does it.
        </p>
      </section>

      <section>
        <h2>What the providers say</h2>
        <p>
          <strong>Paystack</strong> (
          <a href="https://paystack.com/docs/payments/webhooks/">webhook docs</a>): without a 200 OK, live-mode events
          are retried every 3 minutes for the first 4 tries, then hourly for 72 hours; test mode retries hourly for 10
          hours, and each attempt times out after 30 seconds. Paystack asks you to answer 200 before any long-running
          work, and notes that resending events &ldquo;isn&apos;t idempotent&rdquo;, so your handler must ignore events
          it already processed. Its newer <code className={code}>Paystack-Signature</code> header signs a timestamp
          with the body and tells you to reject anything more than 300 seconds old; the older{" "}
          <code className={code}>x-paystack-signature</code> is an HMAC of the body alone, with no timestamp.
        </p>
        <p>
          <strong>Flutterwave</strong> (
          <a href="https://developer.flutterwave.com/docs/webhooks">webhook docs</a>): only a 200 counts as delivered
          (3xx is a failure) and requests time out after 60 seconds. Retries are opt-in from the dashboard: 3 more
          tries, 30 minutes apart. The <code className={code}>verif-hash</code> header is a fixed secret you choose, so
          it can&apos;t tell a replay from the original. Flutterwave also recommends re-querying the transaction before
          you give value.
        </p>
        <p>
          <strong>Stripe</strong> (<a href="https://docs.stripe.com/webhooks">webhook docs</a>): live-mode deliveries
          are retried for up to three days with exponential backoff. Stripe says endpoints &ldquo;might occasionally
          receive the same event more than once&rdquo; and that it doesn&apos;t guarantee delivery in the order events
          were generated. Its libraries reject signatures older than 5 minutes by default, and each retry is signed
          again with a new timestamp.
        </p>
      </section>

      <section>
        <h2>What chaos mode does</h2>
        <ul>
          <li>
            <strong>Duplicate:</strong> 1 to 3 extra copies after the real delivery, a set gap apart. Same body, same{" "}
            <code className={code}>webhook-id</code>, each freshly signed.
          </li>
          <li>
            <strong>Delay:</strong> the real delivery held back between a minimum and maximum, up to 15 minutes.
          </li>
          <li>
            <strong>Reorder:</strong> the real delivery held back by a random jitter, so later events overtake it.
          </li>
          <li>
            <strong>Stale replay:</strong> after a successful delivery, the same event again, correctly signed but with
            a <code className={code}>webhook-timestamp</code> 10 minutes old.
          </li>
        </ul>
        <p>
          No header tells your handler a delivery is chaos, the same as real providers. On Hookdash&apos;s side, extra
          copies are recorded with their kind but never count towards the event&apos;s status, never create a dead
          letter and never fire an alert.
        </p>
        <p>
          It is off by default and switches itself off after 30 minutes (up to 24 hours). It only touches events sent
          from test payloads unless the workspace owner widens it to all events. A banner stays on screen while it runs,
          every change is in the audit log, and a workspace gets at most 60 extra deliveries a minute and 10 scenario
          runs every 10 minutes.
        </p>
      </section>

      <section>
        <h2>Run a scenario</h2>
        <p>
          In the dashboard, open <strong>More &gt; Chaos</strong>, pick a route and a delivery target, and run one of
          these against your handler. Each run shows every delivery as it lands: when, which kind, the status code,
          latency and the start of your handler&apos;s reply.
        </p>
        <ul>
          <li>
            <strong>Paystack charge.success delivered 3 times.</strong> Correct: the customer is credited once.
          </li>
          <li>
            <strong>transfer.reversed arrives before transfer.success</strong> (same transfer). Correct: it ends up
            reversed whatever arrived last.
          </li>
          <li>
            <strong>refund.processed arrives before charge.success.</strong> Correct: the refund isn&apos;t dropped, and
            the order ends up refunded.
          </li>
          <li>
            <strong>Flutterwave charge.completed twice, transfer.completed 2 minutes late.</strong> Correct: one credit,
            and the late transfer still applied.
          </li>
          <li>
            <strong>Stale replay of charge.success.</strong> Correct: rejected by the timestamp check, or ignored as
            already processed.
          </li>
        </ul>
        <p>
          Hookdash can&apos;t see your database, so each run comes with a short &ldquo;what correct looks like&rdquo;
          checklist for you to check against your own records.
        </p>
      </section>

      <section>
        <h2>Run it from CI</h2>
        <p>
          Every scenario runs over the API with an API key, so it can sit in your test suite next to your integration
          tests. Start a run, wait for it to finish, then assert on your own data:
        </p>
        <pre className={pre}>{CI_SCRIPT}</pre>
        <p>
          The scenario ids are listed at <code className={code}>GET /chaos/scenarios</code>. An API key only reaches
          routes in its own workspace. A limit answers 429; wait and try again.
        </p>
      </section>

      <section>
        <h2>An idempotent handler</h2>
        <p>Three habits cover most of what chaos mode throws at you:</p>
        <ul>
          <li>
            <strong>A unique constraint on the event&apos;s identity</strong>, inserted in the same transaction as the
            work, so a second copy does nothing. Use the provider&apos;s own ids: a provider retry reaches you as a new
            Hookdash event with a new <code className={code}>webhook-id</code>, while Hookdash&apos;s own retries and
            chaos copies share one.
          </li>
          <li>
            <strong>Guarded state changes</strong> (<code className={code}>WHERE status = &apos;pending&apos;</code>),
            so a late or out-of-order event can&apos;t move a payment or transfer backwards.
          </li>
          <li>
            <strong>Answer 200 fast</strong> and do slow work from a queue, so the provider doesn&apos;t time out and
            send it again.
          </li>
        </ul>
        <p>NestJS, with a BullMQ queue and TypeORM:</p>
        <pre className={pre}>{NEST_EXAMPLE}</pre>
        <p>Express, with node-postgres:</p>
        <pre className={pre}>{EXPRESS_EXAMPLE}</pre>
        <p>Both need one table:</p>
        <pre className={pre}>{`CREATE TABLE processed_events (
  id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);`}</pre>
      </section>

      <section>
        <p>
          <Link href="/signup">Create a free account</Link> to run these against your own handler, or watch the{" "}
          <Link href="/demo">live demo</Link> first.
        </p>
      </section>
    </LegalPage>
  );
}
