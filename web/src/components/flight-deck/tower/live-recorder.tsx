"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { events as eventsApi, timeline as timelineApi, INGRESS_BASE, type TimelineStep, type WebhookEvent } from "@/lib/api";
import { jsonLines } from "./flight-recorder";
import { SCHEMES, lanesFromTimeline, liveStatus } from "./live-status";

interface Props {
  eventId: string | null;
  /** Bumps when the socket reports a change for this event, so the pane refetches. */
  revision: string;
  attempts: number;
  maxAttempts: number;
  replaying: boolean;
  onReplay: (id: string) => void;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3).slice(0, 1)}`;
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function LiveRecorder({ eventId, revision, attempts, maxAttempts, replaying, onReplay }: Props) {
  const [data, setData] = useState<{ id: string; event: WebhookEvent; steps: TimelineStep[] } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    Promise.all([eventsApi.get(eventId), timelineApi.get(eventId).catch(() => ({ steps: [] as TimelineStep[] }))])
      .then(([event, tl]) => {
        if (!cancelled) setData({ id: eventId, event, steps: tl.steps });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError({ id: eventId, message: err instanceof Error ? err.message : "Could not load this event" });
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, revision]);

  if (!eventId) {
    return (
      <aside className="fr" aria-label="Flight recorder">
        <div className="pane-head">
          <h2>Flight recorder</h2>
        </div>
        <p className="fr-empty">
          Select an arrival, or click a packet on the radar.
          <br />
          <span className="kbd">J</span> <span className="kbd">K</span> move · <span className="kbd">R</span> replay ·{" "}
          <span className="kbd">/</span> filter
        </p>
      </aside>
    );
  }

  const current = data?.id === eventId ? data : null;
  if (!current) {
    return (
      <aside className="fr" aria-label="Flight recorder">
        <div className="pane-head">
          <h2>Flight recorder</h2>
        </div>
        <p className="fr-empty">{error?.id === eventId ? error.message : "Loading event…"}</p>
      </aside>
    );
  }

  const { event, steps } = current;
  const provider = event.provider ?? "custom";
  const scheme = SCHEMES[provider] ?? SCHEMES.custom;
  const headers = event.headers ?? {};
  const received = scheme.header ? headers[scheme.header] ?? headers[scheme.header.toLowerCase()] : undefined;
  const status = liveStatus(event.forwardStatus, attempts, maxAttempts);
  const lanes = lanesFromTimeline(steps, event.receivedAt);
  const span = Math.max(1, ...lanes.flatMap((l) => l.attempts.map((a) => a.at + 0.5)));
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / span) * 100))}%`;
  const raw = event.rawBody ?? JSON.stringify(event.body ?? {});
  const sigHeader = scheme.header && received ? ` \\\n  -H ${shellQuote(`${scheme.header}: ${received}`)}` : "";
  const curl = `curl -X ${event.method} ${INGRESS_BASE}${event.path} \\\n  -H 'content-type: application/json'${sigHeader} \\\n  -d ${shellQuote(raw)}`;

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(curl);
      toast.success("cURL copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  return (
    <aside className="fr" aria-label="Flight recorder">
      <div className="pane-head">
        <h2>Flight recorder</h2>
        <span className="grow" />
        <span className="status" data-p={status.phase}>
          {status.label}
        </span>
      </div>
      <div className="fr-head">
        <div className="hero-kicker">
          {provider} · {scheme.kind}
          {event.isReplay ? <span className="tone-magenta"> · replay</span> : null}
        </div>
        <h3 className="fr-type">{event.eventType ?? "unknown event"}</h3>
        <div className="fr-meta">
          <span>
            id <b>{event.id.slice(0, 8)}…</b>
          </span>
          <span>
            received <b>{fmtTime(event.receivedAt)}</b>
          </span>
          <span>
            size <b>{(raw.length / 1024).toFixed(1)} KB</b>
          </span>
          <span>
            <b>
              {event.method} {event.path}
            </b>
          </span>
        </div>
      </div>

      <section className="fr-block" aria-label="Signature">
        <h3>
          <span>Seal</span>
          <span className={event.signatureValid === null ? "" : event.signatureValid ? "seal-ok" : "seal-bad"}>
            {event.signatureValid === null ? "NOT CHECKED" : event.signatureValid ? "✓ VERIFIED" : "✗ INVALID"}
          </span>
        </h3>
        <dl className="kv">
          <dt>scheme</dt>
          <dd>{scheme.scheme}</dd>
          <dt>header</dt>
          <dd>{scheme.header ?? "—"}</dd>
          <dt>received</dt>
          <dd className="digest">{received ? `${String(received).slice(0, 40)}${String(received).length > 40 ? "…" : ""}` : "—"}</dd>
        </dl>
        {event.signatureValid === null && (
          <p className="fr-note">Add the provider&apos;s signing secret to this endpoint to verify its events.</p>
        )}
      </section>

      <section className="fr-block" aria-label="Journey">
        <h3>
          <span>Journey</span>
          <span>{lanes.length ? `0 → +${span.toFixed(1)}s` : ""}</span>
        </h3>
        {lanes.length === 0 ? (
          <p className="fr-note">
            {event.forwardStatus === "skipped"
              ? "No destination on this endpoint, so nothing was forwarded."
              : event.forwardStatus === "pending"
                ? "Queued for delivery."
                : "No delivery attempts recorded."}
          </p>
        ) : (
          <div className="lanes">
            {lanes.map((lane) => {
              const last = lane.attempts[lane.attempts.length - 1];
              return (
                <div key={lane.key}>
                  <div className="lane-head">
                    <span>{lane.key}</span>
                    <span className={last.ok ? "tone-green" : lane.attempts.length >= maxAttempts ? "tone-orange" : "tone-amber"}>
                      {last.ok ? "delivered" : lane.attempts.length >= maxAttempts ? "dead letter" : `retrying ${lane.attempts.length}/${maxAttempts}`}
                    </span>
                  </div>
                  <div className="lane-track" aria-hidden>
                    {lane.attempts.map((a, i) => {
                      const next = lane.attempts[i + 1];
                      return !a.ok && next ? (
                        <span key={`h${a.n}`} className="lane-seg" data-s="holding" style={{ left: pct(a.at), width: pct(next.at - a.at) }} />
                      ) : null;
                    })}
                    {lane.attempts.map((a) => (
                      <span key={a.n} className="lane-mark" data-ok={a.ok} style={{ left: pct(a.at) }} />
                    ))}
                  </div>
                  <ol className="attempts">
                    {lane.attempts.map((a) => (
                      <li key={a.n}>
                        <span>#{a.n}</span>
                        <span className={a.ok ? "ok" : "bad"}>{a.code}</span>
                        <span>{a.latencyMs !== null ? `${a.latencyMs}ms` : "—"}</span>
                        <span>+{a.at.toFixed(1)}s</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="fr-block" aria-label="Payload">
        <h3>
          <span>Payload</span>
          <span>{event.body ? "application/json" : ""}</span>
        </h3>
        <pre className="payload">{event.body ? jsonLines(event.body, null) : raw}</pre>
        <details className="fr-headers">
          <summary>Headers ({Object.keys(headers).length})</summary>
          <dl className="kv">
            {Object.entries(headers).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      <div className="fr-actions">
        <button type="button" className="chip" data-tone="magenta" disabled={replaying} onClick={() => onReplay(event.id)}>
          {replaying ? "Replaying…" : "Replay"} <span className="kbd">R</span>
        </button>
        <button type="button" className="chip chip--quiet" onClick={copyCurl}>
          Copy as cURL
        </button>
        <Link href={`/dashboard/events/${event.id}`} className="chip chip--quiet">
          Full details
        </Link>
      </div>
    </aside>
  );
}
