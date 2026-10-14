"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ApiError,
  deadLetter as deadLetterApi,
  destinations as destinationsApi,
  endpoints as endpointsApi,
  events as eventsApi,
  type DeadLetterEntry,
  type Endpoint,
  type ForwardDestination,
} from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LiveRecorder } from "@/components/flight-deck/tower/live-recorder";
import { failureCode, fmtAgo, fmtStamp, pool } from "@/components/flight-deck/deck/format";

interface Held {
  entry: DeadLetterEntry;
  endpoint: Endpoint;
  code: string;
}

interface Group {
  key: string;
  endpoint: Endpoint;
  target: string;
  targetUrl: string | null;
  code: string;
  items: Held[];
}

function targetOf(endpoint: Endpoint, dests: ForwardDestination[], destinationId: string | null | undefined) {
  if (destinationId) {
    const d = dests.find((x) => x.id === destinationId);
    if (d) return { target: d.label || d.url, targetUrl: d.url };
    return { target: "removed destination", targetUrl: null };
  }
  return endpoint.forwardUrl ? { target: "fallback forward URL", targetUrl: endpoint.forwardUrl } : { target: "route", targetUrl: null };
}

function isRateLimited(err: unknown) {
  return err instanceof ApiError && err.statusCode === 429;
}

function limited(results: PromiseSettledResult<unknown>[]) {
  return results.some((r) => r.status === "rejected" && isRateLimited(r.reason));
}

/** Once the API rate-limits a bulk run, skip the rest instead of piling on more 429s. */
function guarded<T>(fn: (item: T) => Promise<unknown>) {
  let stopped = false;
  return async (item: T) => {
    if (stopped) throw new ApiError(429, "Rate limited");
    try {
      return await fn(item);
    } catch (err) {
      if (isRateLimited(err)) stopped = true;
      throw err;
    }
  };
}

export default function RecorderPage() {
  const [held, setHeld] = useState<Held[]>([]);
  const [targets, setTargets] = useState<Map<string, ForwardDestination[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"retry" | "discard" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<Held[] | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const recorderRef = useRef<HTMLDivElement>(null);
  const destCache = useRef(new Map<string, ForwardDestination[]>());
  const fullReload = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const eps = await endpointsApi.list();
      const known = destCache.current;
      return Promise.all(
        eps.map(async (ep) => {
          const [entries, dests] = await Promise.all([
            deadLetterApi.list(ep.id),
            // Destinations rarely change; re-reading them every poll would eat the API's per-minute budget.
            known.has(ep.id) && !fullReload.current ? Promise.resolve(known.get(ep.id)!) : destinationsApi.list(ep.id).catch(() => []),
          ]);
          known.set(ep.id, dests);
          return { ep, entries, dests };
        }),
      );
    }
    load()
      .then((perRoute) => {
        if (cancelled) return;
        setTargets(new Map(perRoute.map((r) => [r.ep.id, r.dests])));
        setHeld(
          perRoute
            .flatMap(({ ep, entries }) => entries.map((entry) => ({ entry, endpoint: ep, code: failureCode(entry.lastError) })))
            .sort((a, b) => b.entry.exhaustedAt.localeCompare(a.entry.exhaustedAt)),
        );
        setError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dead letters");
      })
      .finally(() => {
        fullReload.current = false;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const id = window.setInterval(() => setReloadKey((k) => k + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const visible = useMemo(() => (routeFilter ? held.filter((h) => h.endpoint.id === routeFilter) : held), [held, routeFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const h of visible) {
      const destId = h.entry.destinationId ?? null;
      const key = `${h.endpoint.id}:${destId ?? "route"}:${h.code}`;
      let g = map.get(key);
      if (!g) {
        const t = targetOf(h.endpoint, targets.get(h.endpoint.id) ?? [], destId);
        g = { key, endpoint: h.endpoint, code: h.code, items: [], ...t };
        map.set(key, g);
      }
      g.items.push(h);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length || b.items[0].entry.exhaustedAt.localeCompare(a.items[0].entry.exhaustedAt));
  }, [visible, targets]);

  const routes = useMemo(() => {
    const counts = new Map<string, { ep: Endpoint; n: number }>();
    for (const h of held) counts.set(h.endpoint.id, { ep: h.endpoint, n: (counts.get(h.endpoint.id)?.n ?? 0) + 1 });
    return Array.from(counts.values());
  }, [held]);

  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const focused = ordered.find((h) => h.entry.id === focus) ?? ordered[0] ?? null;
  const chosen = visible.filter((h) => selected.has(h.entry.id));

  const drop = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setHeld((prev) => prev.filter((h) => !gone.has(h.entry.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
  }, []);

  const retry = useCallback(
    async (items: Held[]) => {
      if (!items.length) return;
      const ids = items.map((h) => h.entry.id);
      setBusy((b) => new Set([...b, ...ids]));
      if (items.length > 1) setBulk("retry");
      const results = await pool(items, 3, guarded((h: Held) => deadLetterApi.retry(h.endpoint.id, h.entry.id)));
      const ok = items.filter((_, i) => results[i].status === "fulfilled").map((h) => h.entry.id);
      drop(ok);
      setBusy((b) => new Set([...b].filter((id) => !ids.includes(id))));
      setBulk(null);
      const failed = items.length - ok.length;
      if (items.length === 1) {
        if (ok.length) toast.success("Event re-queued for forwarding");
        else toast.error(limited(results) ? "Rate limited by the API. Try again in a minute." : "Failed to retry");
      } else if (failed)
        toast.error(`Re-queued ${ok.length}, ${failed} not sent${limited(results) ? " (API rate limit, try again in a minute)" : ""}. Those stay selected.`);
      else toast.success(`Re-queued ${ok.length} dead letters`);
    },
    [drop],
  );

  async function discard(items: Held[]) {
    const ids = items.map((h) => h.entry.id);
    setBusy((b) => new Set([...b, ...ids]));
    if (items.length > 1) setBulk("discard");
    const results = await pool(items, 3, guarded((h: Held) => deadLetterApi.discard(h.endpoint.id, h.entry.id)));
    const ok = items.filter((_, i) => results[i].status === "fulfilled").map((h) => h.entry.id);
    drop(ok);
    setBusy((b) => new Set([...b].filter((id) => !ids.includes(id))));
    setBulk(null);
    setConfirmDiscard(null);
    const failed = items.length - ok.length;
    if (items.length === 1) {
      if (ok.length) toast.success("Entry discarded");
      else toast.error(limited(results) ? "Rate limited by the API. Try again in a minute." : "Failed to discard");
    } else if (failed) toast.error(`Discarded ${ok.length}, ${failed} not discarded${limited(results) ? " (API rate limit, try again in a minute)" : ""}`);
    else toast.success(`Discarded ${ok.length} dead letters`);
  }

  async function replay(eventId: string) {
    setReplaying(true);
    try {
      await eventsApi.replay(eventId);
      toast.success("Replay queued as a new event");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replay failed");
    } finally {
      setReplaying(false);
    }
  }

  const toggle = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const pick = useCallback((id: string) => {
    setFocus(id);
    if (window.matchMedia("(max-width: 1100px)").matches) {
      window.requestAnimationFrame(() => recorderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if ((ev.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const idx = ordered.findIndex((h) => h.entry.id === focused?.entry.id);
      if (ev.key === "j" || ev.key === "ArrowDown") setFocus(ordered[Math.min(ordered.length - 1, idx + 1)]?.entry.id ?? null);
      else if (ev.key === "k" || ev.key === "ArrowUp") setFocus(ordered[Math.max(0, idx - 1)]?.entry.id ?? null);
      else if (ev.key === "x" && focused) toggle([focused.entry.id], !selected.has(focused.entry.id));
      else if (ev.key === "r" && focused && !busy.has(focused.entry.id)) void retry([focused]);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, focused, selected, busy, retry, toggle]);

  const allIds = visible.map((h) => h.entry.id);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someOn = !allOn && allIds.some((id) => selected.has(id));

  return (
    <div className="fd-root traffic recorder-page">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>Recorder</h1>
          <span className="label-sm">dead letters across every route</span>
        </div>
        <span className="grow" />
        {!loading && (
          <span className={`hold-count${held.length ? " tone-orange" : ""}`}>
            {held.length} held · {routes.length} route{routes.length === 1 ? "" : "s"}
          </span>
        )}
        <button
          type="button"
          className="chip chip--quiet"
          disabled={loading}
          onClick={() => {
            fullReload.current = true;
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        >
          Refresh
        </button>
      </div>

      <div className="tower-main">
        <section className="board-pane dl-pane" aria-label="Dead letters">
          <div className="pane-head">
            <label className="fd-check">
              <input
                type="checkbox"
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = someOn;
                }}
                onChange={(e) => toggle(allIds, e.target.checked)}
                disabled={!allIds.length}
                aria-label="Select every dead letter shown"
              />
            </label>
            <h2>Holding pattern</h2>
            <span>
              {groups.length} group{groups.length === 1 ? "" : "s"}
            </span>
            <span className="grow" />
            <span className="hide-sm">
              <span className="kbd">X</span> select · <span className="kbd">R</span> retry
            </span>
          </div>
          <div className="board-tools">
            <button type="button" className="chip" data-tone="magenta" disabled={!chosen.length || !!bulk} onClick={() => void retry(chosen)}>
              {bulk === "retry" ? "Retrying…" : `Retry ${chosen.length || ""}`.trim()}
            </button>
            <button type="button" className="chip chip--quiet" disabled={!chosen.length || !!bulk} onClick={() => setConfirmDiscard(chosen)}>
              {bulk === "discard" ? "Discarding…" : `Discard ${chosen.length || ""}`.trim()}
            </button>
            {chosen.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            )}
            <span className="grow" />
            {routes.length > 1 && (
              <label className="fd-mini">
                <span>Route</span>
                <select className="fd-input" value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
                  <option value="">All routes</option>
                  {routes.map((r) => (
                    <option key={r.ep.id} value={r.ep.id}>
                      {r.ep.name} ({r.n})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="board-scroll">
            {error ? (
              <div className="board-empty">
                <p className="tone-red">{error}</p>
                <p>
                  <button
                    type="button"
                    className="chip chip--quiet"
                    onClick={() => {
                      setLoading(true);
                      setReloadKey((k) => k + 1);
                    }}
                  >
                    Retry
                  </button>
                </p>
              </div>
            ) : loading && !held.length ? (
              <p className="board-empty">Reading the recorder…</p>
            ) : groups.length === 0 ? (
              <div className="board-empty">
                <p>Nothing in the holding pattern.</p>
                <p>Deliveries that exhaust every retry land here, grouped by destination and failure, so you can retry them once the receiver is back.</p>
              </div>
            ) : (
              groups.map((g) => {
                const ids = g.items.map((h) => h.entry.id);
                const on = ids.every((id) => selected.has(id));
                const max = (g.endpoint.retryMaxAttempts ?? 3) + 1;
                return (
                  <section key={g.key} className="dl-group" aria-label={`${g.target} ${g.code}`}>
                    <header className="dl-group-head">
                      <input
                        type="checkbox"
                        checked={on}
                        ref={(el) => {
                          if (el) el.indeterminate = !on && ids.some((id) => selected.has(id));
                        }}
                        onChange={(e) => toggle(ids, e.target.checked)}
                        aria-label={`Select ${g.items.length} dead letters for ${g.target}, ${g.code}`}
                      />
                      <div className="dl-target">
                        <b>{g.target}</b>
                        <span>
                          <Link href={`/dashboard/endpoints#route-${g.endpoint.id}`} className="fd-link">
                            {g.endpoint.name}
                          </Link>
                          {g.targetUrl && <> · {g.targetUrl}</>}
                        </span>
                      </div>
                      <span className="dl-code">{g.code}</span>
                      <span className="dl-n">{g.items.length}</span>
                      <button type="button" className="link-btn" disabled={!!bulk || ids.some((id) => busy.has(id))} onClick={() => void retry(g.items)}>
                        Retry all
                      </button>
                    </header>
                    <ul className="dl-rows">
                      {g.items.map((h) => {
                        const e = h.entry;
                        const isFocus = focused?.entry.id === e.id;
                        return (
                          <li key={e.id} className="dl-row" data-focus={isFocus || undefined} data-busy={busy.has(e.id) || undefined}>
                            <input type="checkbox" checked={selected.has(e.id)} onChange={(ev) => toggle([e.id], ev.target.checked)} aria-label={`Select dead letter ${e.event?.eventType ?? e.eventId}`} />
                            <button type="button" className="dl-open" onClick={() => pick(e.id)} aria-current={isFocus || undefined}>
                              <span className="dl-time" title={new Date(e.exhaustedAt).toLocaleString()}>
                                {fmtStamp(e.exhaustedAt)}
                              </span>
                              <span className="dl-type">{e.event?.eventType ?? `${e.eventId.slice(0, 8)}…`}</span>
                              <span className="dl-att">
                                {e.lastAttempt}/{max}
                              </span>
                              <span className="dl-err" title={e.lastError ?? undefined}>
                                {e.lastError ?? "no error recorded"}
                              </span>
                            </button>
                            <span className="dl-actions">
                              <button type="button" className="link-btn" disabled={busy.has(e.id) || !!bulk} onClick={() => void retry([h])}>
                                Retry
                              </button>
                              <button type="button" className="link-btn" disabled={busy.has(e.id) || !!bulk} onClick={() => setConfirmDiscard([h])}>
                                Discard
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </section>

        <div ref={recorderRef} className="recorder-slot">
          <LiveRecorder
            eventId={focused?.entry.eventId ?? null}
            revision={focused?.entry.id ?? ""}
            attempts={focused?.entry.lastAttempt ?? 0}
            maxAttempts={(focused?.endpoint.retryMaxAttempts ?? 3) + 1}
            replaying={replaying}
            onReplay={(id) => void replay(id)}
            emptyHint="Select a dead letter to see every attempt it made."
            kicker={focused ? <span className="tone-orange"> · held {fmtAgo(focused.entry.exhaustedAt)}</span> : null}
            actions={
              focused && (
                <>
                  <button
                    type="button"
                    className="chip"
                    data-tone="magenta"
                    disabled={busy.has(focused.entry.id) || !!bulk}
                    onClick={() => void retry([focused])}
                  >
                    Retry delivery <span className="kbd">R</span>
                  </button>
                  <button type="button" className="chip chip--quiet" disabled={busy.has(focused.entry.id) || !!bulk} onClick={() => setConfirmDiscard([focused])}>
                    Discard
                  </button>
                </>
              )
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDiscard}
        title={confirmDiscard && confirmDiscard.length > 1 ? `Discard ${confirmDiscard.length} dead letters` : "Discard dead letter"}
        description={
          confirmDiscard && confirmDiscard.length > 1
            ? "These events will be permanently removed from the dead letter queue. They cannot be recovered."
            : "This will permanently remove this event from the dead letter queue. It cannot be recovered."
        }
        confirmLabel="Discard"
        variant="danger"
        loading={bulk === "discard" || (!!confirmDiscard && confirmDiscard.length === 1 && busy.has(confirmDiscard[0].entry.id))}
        onConfirm={() => confirmDiscard && void discard(confirmDiscard)}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}
