"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useWebSocket, type SocketMessage } from "@/hooks/use-websocket";
import { useAuth } from "@/lib/auth-context";
import {
  deadLetter as deadLetterApi,
  destinations as destinationsApi,
  endpoints as endpointsApi,
  events as eventsApi,
  timeline as timelineApi,
  INGRESS_BASE,
  type Endpoint,
  type WebhookEvent,
} from "@/lib/api";
import { Onboarding } from "@/components/onboarding";
import { Radar } from "@/components/flight-deck/radar";
import { Flap } from "@/components/flight-deck/split-flap";
import { LiveTraffic, type LiveRoute } from "@/components/flight-deck/live-traffic";
import { LiveRecorder } from "@/components/flight-deck/tower/live-recorder";
import { liveStatus, outcomesFromTimeline } from "@/components/flight-deck/tower/live-status";
import { useReducedMotion } from "@/components/flight-deck/use-sim";

type Filter = "all" | "failed" | "pending" | "skipped";

const FILTERS: { id: Filter; label: string; tone?: string }[] = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed", tone: "red" },
  { id: "pending", label: "En route", tone: "cyan" },
  { id: "skipped", label: "No route" },
];

const TEST_PAYLOADS = [
  {
    event: "charge.success",
    data: { id: 3_000_000_123, domain: "test", status: "success", reference: "test_ref", amount: 50000, currency: "NGN", channel: "card", customer: { email: "test@example.com" } },
  },
  {
    event: "charge.completed",
    data: { id: 482_119, tx_ref: "flw_test_ref", amount: 250, currency: "NGN", status: "successful", payment_type: "card" },
  },
  { event: "ping", message: "Hello from Hookdash" },
];

interface Row {
  id: string;
  receivedAt: string;
  eventType: string | null;
  provider: string | null;
  signatureValid: boolean | null;
  forwardStatus: string;
  forwardLatency: number | null;
  attempts: number;
  isReplay: boolean;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function routesFrom(eps: Endpoint[], dests: { id: string; label: string | null; url: string; isActive: boolean }[][]): LiveRoute[] {
  return eps
    .filter((ep) => ep.isActive)
    .map((ep) => {
      const i = eps.indexOf(ep);
      const active = (dests[i] ?? []).filter((d) => d.isActive).map((d) => ({ id: d.id, label: d.label, url: d.url }));
      const legacy = !active.length && ep.forwardUrl ? [{ id: `${ep.id}:legacy`, label: "forward URL", url: ep.forwardUrl }] : [];
      return { endpointId: ep.id, provider: ep.provider, maxAttempts: (ep.retryMaxAttempts ?? 3) + 1, destinations: [...active, ...legacy] };
    });
}

export default function TrafficPage() {
  const { liveEvents, connected, subscribe } = useWebSocket();
  const { ingressSlug } = useAuth();
  const reduced = useReducedMotion();
  const [traffic] = useState(() => new LiveTraffic());
  const [checking, setChecking] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [routes, setRoutes] = useState<LiveRoute[]>([]);
  const [history, setHistory] = useState<WebhookEvent[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [replaying, setReplaying] = useState(false);
  const [sending, setSending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const routesRef = useRef<LiveRoute[]>([]);
  const endpointOf = useRef(new Map<string, Promise<string | null>>());

  const ingressUrl = ingressSlug ? `${INGRESS_BASE}/in/${ingressSlug}` : null;

  const loadRoutes = useCallback(async () => {
    const eps = await endpointsApi.list();
    const dests = await Promise.all(eps.map((ep) => destinationsApi.list(ep.id).catch(() => [])));
    const next = routesFrom(eps, dests);
    routesRef.current = next;
    setRoutes(next);
    traffic.setRoutes(next, []);
    const dead = await Promise.all(next.map((r) => deadLetterApi.list(r.endpointId).catch(() => [])));
    traffic.seedDeadLetters(dead.flat());
    return eps;
  }, [traffic]);

  useEffect(() => {
    let cancelled = false;
    loadRoutes()
      .then((eps) => {
        if (cancelled) return;
        let dismissed = false;
        try {
          dismissed = localStorage.getItem("hookdash_onboarding_dismissed") === "true";
        } catch {
          // Storage blocked; show onboarding when there are no endpoints.
        }
        if (eps.length === 0 && !dismissed) setShowOnboarding(true);
      })
      .catch(() => {
        // Routes are decoration for the radar; the board still works without them.
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [loadRoutes]);

  const loadHistory = useCallback(async () => {
    const params: Record<string, string> = { limit: "50" };
    if (filter !== "all") params.forwardStatus = filter;
    if (search) params.search = search;
    try {
      const res = await eventsApi.list(params);
      setHistory(res.items);
      for (const e of res.items) if (e.forwardLatency && e.endpointId) traffic.recordLatency({ endpointId: e.endpointId }, e.forwardLatency);
      if (res.items.some((e) => e.forwardLatency)) traffic.placeByLatency();
    } catch {
      // Keep whatever is on the board; the next refresh retries.
    } finally {
      setHistoryLoaded(true);
    }
  }, [filter, search, traffic]);

  useEffect(() => {
    const first = window.setTimeout(() => void loadHistory(), 0);
    const id = window.setInterval(() => void loadHistory(), 30000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [loadHistory]);

  const resolveEndpoint = useCallback((eventId: string) => {
    let p = endpointOf.current.get(eventId);
    if (!p) {
      p =
        routesRef.current.length === 1
          ? Promise.resolve(routesRef.current[0].endpointId)
          : eventsApi.get(eventId).then((e) => e.endpointId).catch(() => null);
      endpointOf.current.set(eventId, p);
    }
    return p;
  }, []);

  useEffect(
    () =>
      subscribe((m: SocketMessage) => {
        if (m.kind === "webhook") {
          traffic.onWebhook(m.event);
          void resolveEndpoint(m.event.id).then((ep) => ep && traffic.setEndpoint(m.event.id, ep));
          return;
        }
        const { eventId, forwardStatus } = m.result;
        setRevisions((r) => ({ ...r, [eventId]: (r[eventId] ?? 0) + 1 }));
        if (!traffic.hasTrack(eventId) || forwardStatus === "skipped") return;
        void resolveEndpoint(eventId).then(async (ep) => {
          if (ep) traffic.setEndpoint(eventId, ep);
          try {
            const [{ steps }, ev] = await Promise.all([timelineApi.get(eventId), eventsApi.get(eventId)]);
            traffic.onAttempt(eventId, forwardStatus === "forwarded", outcomesFromTimeline(steps, ev.receivedAt));
          } catch {
            traffic.onAttempt(eventId, forwardStatus === "forwarded", null);
          }
        });
      }),
    [subscribe, traffic, resolveEndpoint],
  );

  const maxAttempts = routes.length === 1 ? routes[0].maxAttempts : 4;

  const allRows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const e of history) {
      map.set(e.id, {
        id: e.id,
        receivedAt: e.receivedAt,
        eventType: e.eventType,
        provider: e.provider,
        signatureValid: e.signatureValid,
        forwardStatus: e.forwardStatus,
        forwardLatency: e.forwardLatency,
        attempts: 0,
        isReplay: e.isReplay,
      });
    }
    for (const e of liveEvents) {
      if (e.id.startsWith("optimistic_")) continue;
      const prev = map.get(e.id);
      map.set(e.id, {
        id: e.id,
        receivedAt: e.receivedAt,
        eventType: e.eventType,
        provider: e.provider,
        signatureValid: e.signatureValid,
        forwardStatus: e.forwardStatus,
        forwardLatency: e.forwardLatency ?? prev?.forwardLatency ?? null,
        attempts: e.attempts ?? 0,
        isReplay: prev?.isReplay ?? false,
      });
    }
    return map;
  }, [history, liveEvents]);

  const rows = useMemo(() => {
    // Search runs server-side over payloads, so while it's active only the server's matches are shown.
    const searchIds = search ? new Set(history.map((e) => e.id)) : null;
    const list = frozenIds
      ? frozenIds.map((id) => allRows.get(id)).filter((r): r is Row => !!r)
      : Array.from(allRows.values()).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return list
      .filter((r) => !searchIds || searchIds.has(r.id))
      .filter((r) => filter === "all" || r.forwardStatus === filter)
      .slice(0, 60);
  }, [allRows, frozenIds, filter, search, history]);

  useEffect(() => {
    if (selected || rows.length === 0) return;
    const t = window.setTimeout(() => setSelected(rows[0].id), 0);
    return () => window.clearTimeout(t);
  }, [rows, selected]);

  const toggleFollow = useCallback(() => {
    setFrozenIds(follow ? rows.map((r) => r.id) : null);
    setFollow(!follow);
  }, [follow, rows]);

  const replay = useCallback(
    async (id: string) => {
      setReplaying(true);
      try {
        const next = await eventsApi.replay(id);
        traffic.markReplay(next.id);
        toast.success("Replay queued");
        setSelected(next.id);
        void loadHistory();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Replay failed");
      } finally {
        setReplaying(false);
      }
    },
    [traffic, loadHistory],
  );

  const sendTestEvent = useCallback(async () => {
    if (!ingressUrl) return;
    setSending(true);
    try {
      const body = TEST_PAYLOADS[Math.floor(Math.random() * TEST_PAYLOADS.length)];
      const res = await fetch(ingressUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Ingress responded with ${res.status}`);
      if (!connected) window.setTimeout(() => void loadHistory(), 900);
    } catch (err) {
      toast.error(err instanceof Error ? `Test event failed: ${err.message}` : "Failed to send test event");
    } finally {
      setSending(false);
    }
  }, [ingressUrl, connected, loadHistory]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const el = ev.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) {
        if (ev.key === "Escape") (el as HTMLInputElement).blur();
        return;
      }
      const idx = rows.findIndex((r) => r.id === selected);
      if (ev.key === "j" || ev.key === "ArrowDown") setSelected(rows[Math.min(rows.length - 1, idx + 1)]?.id ?? null);
      else if (ev.key === "k" || ev.key === "ArrowUp") setSelected(rows[Math.max(0, idx - 1)]?.id ?? null);
      else if (ev.key === "r" && selected && !replaying) void replay(selected);
      else if (ev.key === "f") toggleFollow();
      else if (ev.key === "/") searchRef.current?.focus();
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, replay, replaying, toggleFollow]);

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => {
          setShowOnboarding(false);
          try {
            localStorage.setItem("hookdash_onboarding_dismissed", "true");
          } catch {
            // Non-critical.
          }
          void loadRoutes();
        }}
      />
    );
  }

  const selectedRow = selected ? allRows.get(selected) : undefined;
  const failedCount = rows.filter((r) => r.forwardStatus === "failed").length;

  return (
    <div className="fd-root traffic">
      <div className="traffic-bar">
        <div className="tower-live" data-paused={!follow || !connected || undefined}>
          <i aria-hidden />
          {!connected ? "RECONNECTING" : follow ? "LIVE" : "BOARD PAUSED"}
        </div>
        {ingressUrl && (
          <button
            type="button"
            className="ingress-chip"
            onClick={() => {
              void navigator.clipboard.writeText(ingressUrl).then(
                () => toast.success("Ingress URL copied"),
                () => toast.error("Clipboard unavailable"),
              );
            }}
            title="Copy ingress URL"
          >
            <span className="label-sm">ingress</span>
            <span>{ingressUrl.replace(/^https?:\/\//, "")}</span>
          </button>
        )}
        <span className="grow" />
        {ingressUrl && (
          <button type="button" className="chip" data-tone="cyan" onClick={sendTestEvent} disabled={sending}>
            {sending ? "Sending…" : "Send test event"}
          </button>
        )}
      </div>

      <div className="tower-main">
        <div className="tower-left">
          <section aria-label="Route radar">
            <div className="pane-head">
              <h2>Radar</h2>
              <span>rings = p50 latency</span>
              <span className="grow" />
              <span className="radar-legend" aria-hidden>
                <b style={{ ["--lg" as string]: "var(--t-cyan)" }}>in flight</b>
                <b style={{ ["--lg" as string]: "var(--t-green)" }}>delivered</b>
                <b style={{ ["--lg" as string]: "var(--t-amber)" }}>retrying</b>
                <b style={{ ["--lg" as string]: "var(--t-orange)" }}>dead letter</b>
                <b style={{ ["--lg" as string]: "var(--t-magenta)" }}>selected</b>
              </span>
            </div>
            <div className="radar">
              <Radar
                model={traffic}
                reducedMotion={reduced}
                selectedId={selected}
                onSelect={setSelected}
                label={`Route radar for ${routes.length} endpoint${routes.length === 1 ? "" : "s"}. New webhooks fly from their provider to the signature gate and on to each destination.`}
              />
              {routes.every((r) => r.destinations.length === 0) && (
                <p className="radar-note">No destinations yet. Add one under Routes to see deliveries land here.</p>
              )}
            </div>
          </section>

          <section aria-label="Arrivals board" className="board-pane">
            <div className="pane-head">
              <h2>Arrivals</h2>
              <span>{rows.length} shown</span>
              {failedCount > 0 && <span className="tone-red">{failedCount} failed</span>}
            </div>
            <div className="board-tools">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="chip" data-tone={f.tone} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
              <span className="grow" />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(query.trim());
                }}
              >
                <input
                  ref={searchRef}
                  id="arrivals-search"
                  type="search"
                  placeholder="Search payloads  /"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value) setSearch("");
                  }}
                  aria-label="Search events by type, provider or payload"
                />
              </form>
              <button type="button" className="chip" data-tone="cyan" aria-pressed={follow} onClick={toggleFollow}>
                Follow <span className="kbd">F</span>
              </button>
            </div>
            <div className="board-scroll">
              {rows.length === 0 ? (
                <div className="board-empty">
                  {historyLoaded ? (
                    <>
                      <p>{search || filter !== "all" ? "Nothing matches this filter." : "No arrivals yet."}</p>
                      {!search && filter === "all" && ingressUrl && (
                        <p>
                          Point a provider&apos;s webhook URL at <code>{ingressUrl}</code>, or send a test event.
                        </p>
                      )}
                    </>
                  ) : (
                    <p>Loading arrivals…</p>
                  )}
                </div>
              ) : (
                <table className="board" role="grid" aria-label="Arrivals" aria-rowcount={rows.length}>
                  <thead>
                    <tr>
                      <th scope="col">TIME</th>
                      <th scope="col">EVENT</th>
                      <th scope="col">SOURCE</th>
                      <th scope="col">SEAL</th>
                      <th scope="col">LATENCY</th>
                      <th scope="col">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const st = liveStatus(r.forwardStatus, r.attempts, maxAttempts);
                      return (
                        <tr
                          key={r.id}
                          aria-selected={selected === r.id}
                          tabIndex={0}
                          onClick={() => setSelected(r.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              setSelected(r.id);
                            }
                          }}
                        >
                          <td className="t-time">{fmtTime(r.receivedAt)}</td>
                          <td>
                            <Flap text={r.eventType ?? "unknown"} width={26} reduced={reduced} enter={traffic.hasTrack(r.id)} />
                            {r.isReplay && <span className="replay-tag">replay</span>}
                          </td>
                          <td className="t-src">{r.provider ?? "custom"}</td>
                          <td className={r.signatureValid === null ? "t-time" : r.signatureValid ? "seal-ok" : "seal-bad"}>
                            {r.signatureValid === null ? "— unsigned" : r.signatureValid ? "✓ sealed" : "✗ invalid"}
                          </td>
                          <td className="t-time">{r.forwardLatency ? `${r.forwardLatency}ms` : "—"}</td>
                          <td className="status" data-p={st.phase}>
                            <Flap text={st.label} width={13} reduced={reduced} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <LiveRecorder
          eventId={selected}
          revision={`${selected}:${selected ? revisions[selected] ?? 0 : 0}:${selectedRow?.forwardStatus ?? ""}`}
          attempts={selectedRow?.attempts ?? 0}
          maxAttempts={maxAttempts}
          replaying={replaying}
          onReplay={(id) => void replay(id)}
        />
      </div>
      <div className="sr-only" aria-live="polite">
        {connected ? "" : "Live connection lost, reconnecting."}
      </div>
    </div>
  );
}
