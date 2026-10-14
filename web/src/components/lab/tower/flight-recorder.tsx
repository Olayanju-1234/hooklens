"use client";

import type { ReactNode } from "react";
import { DEST_BY_ID, MAX_ATTEMPTS, SOURCE_BY_ID } from "../sim/catalog";
import type { Branch, Journey, Mark, Status, World } from "../sim/engine";
import { payloadFor, signatureFor } from "./payload";

interface Props {
  world: World;
  journey: Journey | null;
  status: Status | null;
  T: number;
  epoch: number;
  canAct: boolean;
  onReplay: (eventId: string) => void;
}

export function clockTime(epoch: number, t: number) {
  const d = new Date(epoch + t * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
}

function jsonLines(body: unknown, drift: string | null): ReactNode[] {
  const text = JSON.stringify(body, null, 2);
  return text.split("\n").map((line, i) => {
    const m = /^(\s*)("(?:[^"\\]|\\.)*")(:\s*)?(.*)$/.exec(line);
    let content: ReactNode = line;
    let isDrift = false;
    if (m) {
      const [, indent, first, colon, rest] = m;
      if (colon) {
        isDrift = drift !== null && first === `"${drift}"` && indent.length === 2;
        content = (
          <>
            {indent}
            <span className="k">{first}</span>
            {colon}
            {valueNode(rest)}
          </>
        );
      } else {
        content = (
          <>
            {indent}
            {valueNode(first + rest)}
          </>
        );
      }
    } else {
      const lead = /^(\s*)(.*)$/.exec(line)!;
      content = (
        <>
          {lead[1]}
          {valueNode(lead[2])}
        </>
      );
    }
    return (
      <span key={i} className={isDrift ? "drift" : undefined}>
        {content}
        {"\n"}
      </span>
    );
  });
}

function valueNode(v: string): ReactNode {
  if (/^".*",?$/.test(v)) return <span className="s">{v}</span>;
  if (/^-?\d[\d.e+-]*,?$/.test(v) || /^(true|false|null),?$/.test(v)) return <span className="n">{v}</span>;
  return v;
}

function laneSegments(b: Branch, t0: number, T: number) {
  const segs: { from: number; to: number; state: Mark["state"] }[] = [];
  const marks = b.marks.filter((m) => m.t <= T);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].t : T;
    if (m.state === "delivered") break;
    segs.push({ from: m.t - t0, to: end - t0, state: m.state });
  }
  return segs;
}

export function FlightRecorder({ world, journey, status, T, epoch, canAct, onReplay }: Props) {
  if (!journey || !status) {
    return (
      <aside className="fr" aria-label="Flight recorder">
        <div className="pane-head">
          <h2>Flight recorder</h2>
        </div>
        <p className="fr-empty">
          Select an arrival, or click a packet on the radar.
          <br />
          <span className="kbd">J</span> <span className="kbd">K</span> move · <span className="kbd">R</span> replay · <span className="kbd">F</span> follow
        </p>
      </aside>
    );
  }

  const e = journey.event;
  const src = SOURCE_BY_ID.get(e.source)!;
  const { body, driftField } = payloadFor(e);
  const sig = signatureFor(e);
  const verified = T >= journey.tGate;
  const lastMark = Math.max(journey.tGate, ...journey.branches.flatMap((b) => b.marks.map((m) => m.t)));
  const span = Math.max(4, Math.min(T, Number.isFinite(lastMark) ? lastMark + 1 : T) - e.t0);
  const pct = (dt: number) => `${Math.max(0, Math.min(100, (dt / span) * 100))}%`;
  const curl = `curl -X POST https://in.hookdash.dev/src_${e.source} \\\n  -H 'content-type: application/json' \\\n  -H '${src.header}: ${sig.received.slice(0, 24)}…' \\\n  -d '${JSON.stringify(body)}'`;
  const timestamped = src.scheme.includes("t=") || src.scheme.startsWith("Standard");

  return (
    <aside className="fr" aria-label="Flight recorder">
      <div className="pane-head">
        <h2>Flight recorder</h2>
        <span className="grow" />
        <span className={`status`} data-p={status.phase}>
          {status.label}
        </span>
      </div>
      <div className="fr-head">
        <div className="hero-kicker">{src.label} · {src.kind}</div>
        <h3 className="fr-type">{e.eventType}</h3>
        <div className="fr-meta">
          <span>
            id <b>{e.id}</b>
          </span>
          <span>
            received <b>{clockTime(epoch, e.t0)}</b>
          </span>
          <span>
            size <b>{(e.bytes / 1024).toFixed(1)} KB</b>
          </span>
          {e.injected && <span className="tone-magenta">injected by simulator</span>}
        </div>
      </div>

      <section className="fr-block" aria-label="Signature">
        <h3>
          <span>Seal</span>
          <span className={!verified ? "" : journey.rejected ? "seal-bad" : "seal-ok"}>
            {!verified ? "AWAITING GATE" : journey.rejected ? "✗ REJECTED · 401" : "✓ VERIFIED"}
          </span>
        </h3>
        <dl className="kv">
          <dt>scheme</dt>
          <dd>{src.scheme}</dd>
          <dt>header</dt>
          <dd>{src.header}</dd>
          <dt>received</dt>
          <dd className="digest">
            {journey.rejected ? <mark>{sig.received.slice(0, 32)}</mark> : sig.received.slice(0, 32)}…
          </dd>
          <dt>computed</dt>
          <dd className="digest">{sig.expected.slice(0, 32)}…</dd>
          {timestamped && (
            <>
              <dt>timestamp</dt>
              <dd>Δ {(0.2 + (e.seed % 900) / 1000).toFixed(1)}s · tolerance 300s</dd>
            </>
          )}
        </dl>
      </section>

      {!journey.rejected && (
        <section className="fr-block" aria-label="Journey">
          <h3>
            <span>Journey</span>
            <span>0 → +{span.toFixed(1)}s</span>
          </h3>
          <div className="lanes">
            {journey.branches.map((b, bi) => {
              const dest = DEST_BY_ID.get(b.dest)!;
              const m = world.branchStateAt(b, T);
              const segs = laneSegments(b, e.t0, T);
              const shown = b.attempts.filter((a) => a.tArrive <= T);
              return (
                <div key={`${b.dest}-${b.generation}-${bi}`}>
                  <div className="lane-head">
                    <span>
                      {b.generation > 0 ? <span className="tone-magenta">replay {b.generation} · </span> : null}
                      {dest.host}
                    </span>
                    <span className={m?.state === "delivered" ? "tone-green" : m?.state === "dead" ? "tone-orange" : m?.state === "holding" ? "tone-amber" : "tone-cyan"}>
                      {m ? (m.state === "holding" ? `holding ${m.attempt}/${MAX_ATTEMPTS}` : m.state) : "queued"}
                    </span>
                  </div>
                  <div className="lane-track" aria-hidden>
                    {segs.map((s, i) => (
                      <span key={i} className="lane-seg" data-s={s.state} style={{ left: pct(s.from), width: pct(Math.max(0.02, s.to - s.from)) }} />
                    ))}
                    {shown.map((a) => (
                      <span key={a.n} className="lane-mark" data-ok={a.ok} style={{ left: pct(a.tArrive - e.t0) }} />
                    ))}
                    {T - e.t0 < span && <span className="lane-now" style={{ left: pct(T - e.t0) }} />}
                  </div>
                  <ol className="attempts">
                    {shown.map((a) => (
                      <li key={a.n}>
                        <span>#{a.n}</span>
                        <span className={a.ok ? "ok" : "bad"}>{a.code}</span>
                        <span>
                          {a.ok ? `${a.latencyMs}ms` : a.code === 504 ? "timeout 15s" : `${a.latencyMs}ms`}
                          {a.replay ? <span className="rep"> · replay</span> : null}
                        </span>
                        <span>+{(a.tArrive - e.t0).toFixed(1)}s</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="fr-block" aria-label="Payload">
        <h3>
          <span>Payload</span>
          {driftField ? <span className="drift-chip">schema drift · new field “{driftField}”</span> : <span>matches inferred schema</span>}
        </h3>
        <pre className="payload">{jsonLines(body, driftField)}</pre>
      </section>

      <div className="fr-actions">
        <button
          type="button"
          className="chip"
          data-tone="magenta"
          disabled={!canAct || journey.rejected || !verified}
          onClick={() => onReplay(e.id)}
          title={!canAct ? "Return to live to replay" : undefined}
        >
          Replay to all routes <span className="kbd">R</span>
        </button>
        <button
          type="button"
          className="chip chip--quiet"
          onClick={() => {
            try {
              void navigator.clipboard.writeText(curl);
            } catch {
              // Clipboard can be blocked in iframes; the button is a convenience only.
            }
          }}
        >
          Copy as cURL
        </button>
        <button type="button" className="chip chip--quiet" disabled title="Concept: redacted public link">
          Share redacted
        </button>
      </div>
    </aside>
  );
}
