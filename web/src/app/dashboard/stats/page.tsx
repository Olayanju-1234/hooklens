"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  destinations as destinationsApi,
  endpoints as endpointsApi,
  events as eventsApi,
  latency as latencyApi,
  stats as statsApi,
  timeline as timelineApi,
  type Endpoint,
  type ForwardDestination,
  type LatencyStats,
  type Stats,
  type TimelineStep,
  type WebhookEvent,
} from "@/lib/api";
import { lanesFromTimeline } from "@/components/flight-deck/tower/live-status";
import { RangeRings, healthTone, type Blip } from "@/components/flight-deck/deck/range-rings";
import { fmtMs, percentile, pool } from "@/components/flight-deck/deck/format";

const PERIODS = [
  { value: "24h", label: "24h", ms: 86_400_000 },
  { value: "7d", label: "7d", ms: 7 * 86_400_000 },
  { value: "30d", label: "30d", ms: 30 * 86_400_000 },
  { value: "all", label: "All", ms: null },
];

// The API allows 60 requests a minute per client, so per-attempt timelines are only read for routes that fan out.
const TIMELINE_BUDGET = 16;

interface DestHealth {
  key: string;
  tag: string;
  endpoint: Endpoint;
  label: string;
  url: string | null;
  paused: boolean;
  events: number;
  delivered: number;
  p50: number | null;
  p95: number | null;
  codes: Map<string, number>;
}

interface Sample {
  endpoints: Endpoint[];
  dests: Map<string, ForwardDestination[]>;
  events: Map<string, WebhookEvent[]>;
  traces: { event: WebhookEvent; steps: TimelineStep[] }[];
}

function codeLabel(code: string) {
  if (/^\d{3}$/.test(code)) return code;
  return code === "failed" || code === "none" ? "no reply" : code;
}

function codeClass(code: string) {
  return /^2\d\d$/.test(code) ? "ok" : "bad";
}

async function loadSample(period: (typeof PERIODS)[number]): Promise<Sample> {
  const eps = await endpointsApi.list();
  const dests = new Map(await Promise.all(eps.map(async (ep) => [ep.id, await destinationsApi.list(ep.id).catch(() => [])] as const)));
  const routed = eps.filter((ep) => (dests.get(ep.id)?.length ?? 0) > 0 || ep.forwardUrl);
  const from = period.ms ? new Date(Date.now() - period.ms).toISOString() : null;
  const lists = await Promise.all(
    routed.map((ep) =>
      eventsApi
        .list({ endpointId: ep.id, limit: "100", ...(from ? { from } : {}) })
        .then((r) => [ep.id, r.items.filter((e) => e.forwardStatus === "forwarded" || e.forwardStatus === "failed")] as const)
        .catch(() => [ep.id, [] as WebhookEvent[]] as const),
    ),
  );
  const events = new Map(lists);
  const fanOut = routed.filter((ep) => (dests.get(ep.id)?.length ?? 0) > 1);
  const per = Math.max(3, Math.floor(TIMELINE_BUDGET / Math.max(1, fanOut.length)));
  const picked = fanOut.flatMap((ep) => (events.get(ep.id) ?? []).slice(0, per)).slice(0, TIMELINE_BUDGET);
  const results = await pool(picked, 3, (event) => timelineApi.get(event.id).then((t) => ({ event, steps: t.steps })));
  const traces = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return { endpoints: eps, dests, events, traces };
}

type Row = DestHealth & { lat: number[] };

function blankRow(ep: Endpoint, key: string, label: string, url: string | null, paused: boolean): Row {
  return { key, tag: "", endpoint: ep, label, url, paused, events: 0, delivered: 0, p50: null, p95: null, codes: new Map(), lat: [] };
}

/** Final outcome per delivery: one row per destination, from timelines on fan-out routes, from the event itself otherwise. */
function computeHealth(sample: Sample): DestHealth[] {
  const rows: Row[] = [];
  const byId = new Map(sample.endpoints.map((ep) => [ep.id, ep]));
  for (const ep of sample.endpoints) {
    const dests = sample.dests.get(ep.id) ?? [];
    const evs = sample.events.get(ep.id) ?? [];
    if (dests.length > 1) {
      const lanes = new Map<string, Row>();
      for (const d of dests) lanes.set(d.label || d.url, blankRow(ep, `${ep.id}:${d.id}`, d.label || d.url, d.url, !d.isActive));
      for (const { event, steps } of sample.traces) {
        if (byId.get(event.endpointId) !== ep) continue;
        for (const lane of lanesFromTimeline(steps, event.receivedAt)) {
          const row = lanes.get(lane.key);
          if (!row) continue;
          const last = lane.attempts[lane.attempts.length - 1];
          row.events++;
          if (last.ok) {
            row.delivered++;
            if (last.latencyMs !== null) row.lat.push(last.latencyMs);
          }
          row.codes.set(last.code, (row.codes.get(last.code) ?? 0) + 1);
        }
      }
      rows.push(...lanes.values());
      continue;
    }
    const d = dests[0];
    if (!d && !ep.forwardUrl) continue;
    const row = d ? blankRow(ep, `${ep.id}:${d.id}`, d.label || d.url, d.url, !d.isActive) : blankRow(ep, `${ep.id}:legacy`, "fallback forward URL", ep.forwardUrl, false);
    for (const e of evs) {
      row.events++;
      const code = e.forwardCode ? String(e.forwardCode) : "none";
      row.codes.set(code, (row.codes.get(code) ?? 0) + 1);
      if (e.forwardStatus === "forwarded") {
        row.delivered++;
        if (e.forwardLatency !== null) row.lat.push(e.forwardLatency);
      }
    }
    rows.push(row);
  }
  const out = rows.map(({ lat, ...row }) => {
    const sorted = lat.sort((a, b) => a - b);
    return { ...row, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
  });
  out.sort((a, b) => a.endpoint.name.localeCompare(b.endpoint.name) || a.label.localeCompare(b.label));
  out.forEach((r, i) => (r.tag = String(i + 1).padStart(2, "0")));
  return out;
}

export default function HealthPage() {
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<{ period: string; stats: Stats; latency: LatencyStats | null } | null>(null);
  const [error, setError] = useState("");
  const [sample, setSample] = useState<{ period: string; value: Sample } | null>(null);
  const [sampleError, setSampleError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const p = PERIODS.find((x) => x.value === period) ?? PERIODS[1];
    Promise.all([statsApi.get(period), latencyApi.get(period).catch(() => null)])
      .then(([stats, latency]) => {
        if (cancelled) return;
        setData({ period, stats, latency });
        setError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load stats");
      });
    loadSample(p)
      .then((value) => {
        if (cancelled) return;
        setSample({ period, value });
        setSampleError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) setSampleError(err instanceof Error ? err.message : "Could not sample deliveries");
      });
    return () => {
      cancelled = true;
    };
  }, [period, reloadKey]);

  const health = useMemo(() => (sample ? computeHealth(sample.value) : []), [sample]);
  const sel = health.find((h) => h.key === selected) ?? null;
  const codeRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const h of sel ? [sel] : health) for (const [c, n] of h.codes) totals.set(c, (totals.get(c) ?? 0) + n);
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [health, sel]);
  const codeMax = Math.max(1, ...codeRows.map(([, n]) => n));
  const codeTotal = codeRows.reduce((n, [, c]) => n + c, 0);
  const sampled = health.reduce((n, h) => n + h.events, 0);
  const stale = (data && data.period !== period) || (sample && sample.period !== period);
  const stats = data?.stats;
  const lat = data?.latency ?? null;

  const blips: Blip[] = health.map((h) => ({
    key: h.key,
    tag: h.tag,
    label: h.label,
    group: h.endpoint.id,
    p50: h.p50,
    p95: h.p95,
    rate: h.events ? h.delivered / h.events : null,
  }));

  return (
    <div className="fd-root fd-page health">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>Health</h1>
          <span className="label-sm">delivery per destination</span>
        </div>
        <span className="grow" />
        <span className="chip-group" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" className="chip chip--quiet" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>
              {p.label}
            </button>
          ))}
        </span>
        <button type="button" className="chip chip--quiet" onClick={() => setReloadKey((k) => k + 1)}>
          Refresh
        </button>
      </div>

      <div className="page-body page-body--wide" aria-busy={!!stale}>
        {error && !stats ? (
          <div className="board-empty">
            <p className="tone-red">{error}</p>
            <p>
              <button type="button" className="chip chip--quiet" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </button>
            </p>
          </div>
        ) : !stats ? (
          <p className="board-empty">Reading instruments…</p>
        ) : (
          <>
            <dl className="readout" data-stale={stale || undefined}>
              <div>
                <dt>Events</dt>
                <dd>{stats.total.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Delivered</dt>
                <dd className="tone-green">{stats.forwarded.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd className={stats.failed ? "tone-orange" : undefined}>{stats.failed.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Not sent</dt>
                <dd>{stats.skipped.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Success</dt>
                <dd>{stats.total ? `${stats.successRate.toFixed(0)}%` : "—"}</dd>
              </div>
              <div>
                <dt>p50</dt>
                <dd>{fmtMs(lat?.p50)}</dd>
              </div>
              <div>
                <dt>p95</dt>
                <dd>{fmtMs(lat?.p95)}</dd>
              </div>
              <div>
                <dt>p99</dt>
                <dd>{fmtMs(lat?.p99)}</dd>
              </div>
            </dl>

            <div className="mix" aria-label="Delivery mix">
              <div className="mix-bar" aria-hidden>
                {stats.total > 0 && (
                  <>
                    <i data-s="ok" style={{ width: `${(stats.forwarded / stats.total) * 100}%` }} />
                    <i data-s="dead" style={{ width: `${(stats.failed / stats.total) * 100}%` }} />
                    <i data-s="none" style={{ width: `${(stats.skipped / stats.total) * 100}%` }} />
                  </>
                )}
              </div>
              <div className="mix-legend">
                <span data-s="ok">delivered {stats.forwarded}</span>
                <span data-s="dead">failed {stats.failed}</span>
                <span data-s="none">not sent (no route, rejected, queued) {stats.skipped}</span>
              </div>
            </div>

            <div className="health-main">
              <section className="panel" aria-label="Range rings">
                <div className="pane-head">
                  <h2>Range rings</h2>
                  <span>distance = latency</span>
                  <span className="grow" />
                  {selected && (
                    <button type="button" className="link-btn" onClick={() => setSelected(null)}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="rings-wrap">
                  {!sample && sampleError ? (
                    <p className="board-empty tone-red">{sampleError}</p>
                  ) : !sample ? (
                    <p className="board-empty">Sampling deliveries…</p>
                  ) : blips.length === 0 ? (
                    <p className="board-empty">
                      No destinations to plot. Add one under <Link href="/dashboard/endpoints">Routes</Link>.
                    </p>
                  ) : (
                    <RangeRings blips={blips} fleetP50={lat?.p50 ?? null} fleetP95={lat?.p95 ?? null} selected={selected} onSelect={(k) => setSelected(k === selected ? null : k)} />
                  )}
                </div>
                <p className="rings-key">
                  <span>
                    <i className="k-dot" /> p50
                  </span>
                  <span>
                    <i className="k-tail" /> tail to p95
                  </span>
                  <span>
                    <i className="k-ring" /> fleet p95
                  </span>
                  <span data-tone="green">≥99% delivered</span>
                  <span data-tone="amber">≥90%</span>
                  <span data-tone="orange">below 90%</span>
                </p>
              </section>

              <section className="panel" aria-label="Destinations">
                <div className="pane-head">
                  <h2>Destinations</h2>
                  <span>{sampleError ? <span className="tone-red">{sampleError}</span> : sample ? `${sampled} recent deliveries` : "sampling…"}</span>
                </div>
                <div className="table-scroll">
                  <table className="board health-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">DESTINATION</th>
                        <th scope="col">DELIVERED</th>
                        <th scope="col">P50</th>
                        <th scope="col">P95</th>
                        <th scope="col" className="hide-sm">
                          CODES
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.map((h) => {
                        const rate = h.events ? h.delivered / h.events : null;
                        const tone = healthTone(rate);
                        const okCodes = Array.from(h.codes.entries()).filter(([c]) => codeClass(c) === "ok").reduce((n, [, c]) => n + c, 0);
                        return (
                          <tr
                            key={h.key}
                            aria-selected={selected === h.key}
                            tabIndex={0}
                            onClick={() => setSelected(selected === h.key ? null : h.key)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelected(selected === h.key ? null : h.key);
                              }
                            }}
                          >
                            <td className="t-time">{h.tag}</td>
                            <td className="health-dest">
                              <b>{h.label}</b>
                              <span className="t-sub">
                                {h.endpoint.name}
                                {h.paused ? " · paused" : ""}
                              </span>
                            </td>
                            <td>
                              {rate === null ? (
                                <span className="t-time">no traffic</span>
                              ) : (
                                <span className="rate" data-tone={tone}>
                                  <span className="rate-bar" aria-hidden>
                                    <i style={{ width: `${rate * 100}%` }} />
                                  </span>
                                  {(rate * 100).toFixed(rate === 1 ? 0 : 1)}%<span className="t-sub">{h.delivered}/{h.events}</span>
                                </span>
                              )}
                            </td>
                            <td className="t-num">{fmtMs(h.p50)}</td>
                            <td className="t-num">{fmtMs(h.p95)}</td>
                            <td className="hide-sm">
                              {h.events ? (
                                <span className="code-strip" title={Array.from(h.codes.entries()).map(([c, n]) => `${codeLabel(c)} ×${n}`).join(", ")}>
                                  <i data-c="ok" style={{ width: `${(okCodes / h.events) * 100}%` }} />
                                  <i data-c="bad" style={{ width: `${((h.events - okCodes) / h.events) * 100}%` }} />
                                </span>
                              ) : (
                                <span className="t-time">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="health-lower">
              <section className="panel" aria-label="Status codes">
                <div className="pane-head">
                  <h2>Status codes</h2>
                  <span>final response · {sel ? sel.label : "all destinations"} · {codeTotal}</span>
                </div>
                {codeRows.length === 0 ? (
                  <p className="board-empty">No deliveries in this window.</p>
                ) : (
                  <ul className="hbars">
                    {codeRows.map(([code, n]) => (
                      <li key={code}>
                        <span className={`hbars-k code-${codeClass(code)}`}>{codeLabel(code)}</span>
                        <span className="hbars-bar" aria-hidden>
                          <i data-c={codeClass(code)} style={{ width: `${(n / codeMax) * 100}%` }} />
                        </span>
                        <span className="hbars-v">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel" aria-label="Latency over time">
                <div className="pane-head">
                  <h2>Latency</h2>
                  <span>p50 and p95 per {period === "24h" ? "hour" : "day"}</span>
                </div>
                <LatencyTrend series={lat?.timeSeries ?? []} />
              </section>

              <section className="panel" aria-label="By event type">
                <div className="pane-head">
                  <h2>By event type</h2>
                </div>
                <Breakdown rows={stats.byEventType.slice(0, 8).map((r) => [r.eventType || "unknown", r.count])} total={stats.total} />
              </section>

              <section className="panel" aria-label="By source">
                <div className="pane-head">
                  <h2>By source</h2>
                </div>
                <Breakdown rows={stats.byProvider.map((r) => [r.provider || "unknown", r.count])} total={stats.total} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Breakdown({ rows, total }: { rows: [string, number][]; total: number }) {
  if (!rows.length) return <p className="board-empty">No data yet.</p>;
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <ul className="hbars">
      {rows.map(([k, n]) => (
        <li key={k}>
          <span className="hbars-k">{k}</span>
          <span className="hbars-bar" aria-hidden>
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="hbars-v">
            {n}
            <small>{total ? `${Math.round((n / total) * 100)}%` : ""}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LatencyTrend({ series }: { series: LatencyStats["timeSeries"] }) {
  if (series.length < 2) return <p className="board-empty">Not enough deliveries yet to draw a trend.</p>;
  const W = 480;
  const H = 150;
  const pad = { l: 44, r: 8, t: 10, b: 20 };
  const max = Math.max(1, ...series.map((s) => s.p95 ?? 0));
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (k: "p50" | "p95") => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k] ?? 0).toFixed(1)}`).join(" ");
  const fmtBucket = (b: string) => {
    const d = new Date(b);
    return series.length > 30 || (d.getHours() === 0 && d.getMinutes() === 0) ? `${d.getMonth() + 1}/${d.getDate()}` : `${String(d.getHours()).padStart(2, "0")}:00`;
  };
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Latency trend, p95 peaking at ${fmtMs(max)}`}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} className="trend-grid" />
          <text x={pad.l - 6} y={y(max * t) + 3} textAnchor="end" className="trend-label">
            {fmtMs(max * t)}
          </text>
        </g>
      ))}
      <path d={line("p95")} className="trend-line trend-line--p95" />
      <path d={line("p50")} className="trend-line" />
      <text x={pad.l} y={H - 4} className="trend-label">
        {fmtBucket(series[0].bucket)}
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="trend-label">
        {fmtBucket(series[series.length - 1].bucket)}
      </text>
    </svg>
  );
}
