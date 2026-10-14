"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useWebSocket, type SocketMessage } from "@/hooks/use-websocket";
import { endpoints as endpointsApi, eventExport, events as eventsApi, type Endpoint, type WebhookEvent } from "@/lib/api";
import { Flap } from "@/components/flight-deck/split-flap";
import { LiveRecorder } from "@/components/flight-deck/tower/live-recorder";
import { liveStatus } from "@/components/flight-deck/tower/live-status";
import { useReducedMotion } from "@/components/flight-deck/use-sim";
import { fmtStamp } from "@/components/flight-deck/deck/format";
import { PROVIDERS } from "@/lib/providers";

const PAGE_SIZE = 50;

const STATUSES: { id: string; label: string; tone?: string }[] = [
  { id: "", label: "All" },
  { id: "forwarded", label: "Delivered", tone: "green" },
  { id: "failed", label: "Failed", tone: "orange" },
  { id: "pending", label: "En route", tone: "cyan" },
  { id: "skipped", label: "No route" },
  { id: "blocked", label: "Rejected", tone: "red" },
];

const WINDOWS: { id: string; label: string; ms: number | null }[] = [
  { id: "any", label: "Any time", ms: null },
  { id: "1h", label: "Last hour", ms: 3_600_000 },
  { id: "24h", label: "Last 24h", ms: 86_400_000 },
  { id: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { id: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
];

interface Filters {
  status: string;
  endpointId: string;
  provider: string;
  window: string;
  duplicates: boolean;
  search: string;
}

const NO_FILTERS: Filters = { status: "", endpointId: "", provider: "", window: "any", duplicates: false, search: "" };

function queryFor(f: Filters): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.status) params.forwardStatus = f.status;
  if (f.endpointId) params.endpointId = f.endpointId;
  if (f.provider) params.provider = f.provider;
  if (f.duplicates) params.isDuplicate = "true";
  if (f.search) params.search = f.search;
  const win = WINDOWS.find((w) => w.id === f.window);
  if (win?.ms) params.from = new Date(Date.now() - win.ms).toISOString();
  return params;
}

export default function HistoryPage() {
  const { subscribe } = useWebSocket();
  const reduced = useReducedMotion();
  const [endpointList, setEndpointList] = useState<Endpoint[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [query, setQuery] = useState("");
  // Cursor per page; page 0 has none. The API pages backwards in time by receivedAt.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<WebhookEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [replaying, setReplaying] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    endpointsApi
      .list()
      .then(setEndpointList)
      .catch(() => {
        // Only feeds the endpoint filter and retry limits; the board works without it.
      });
  }, []);

  const cursor = cursors[page];
  useEffect(() => {
    const id = ++requestId.current;
    const params: Record<string, string> = { ...queryFor(filters), limit: String(PAGE_SIZE) };
    if (cursor) params.cursor = cursor;
    eventsApi
      .list(params)
      .then((res) => {
        if (id !== requestId.current) return;
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setError("");
        if (!cursor) setFresh(0);
      })
      .catch((err: unknown) => {
        if (id === requestId.current) setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [filters, cursor, reloadKey]);

  const applyFilters = useCallback((patch: Partial<Filters>) => {
    setLoading(true);
    setFilters((f) => ({ ...f, ...patch }));
    setCursors([undefined]);
    setPage(0);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next > page) {
        if (!nextCursor) return;
        setCursors((c) => [...c.slice(0, next), nextCursor]);
      }
      setLoading(true);
      setPage(next);
    },
    [page, nextCursor],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(
    () =>
      subscribe((m: SocketMessage) => {
        if (m.kind === "webhook") {
          setFresh((n) => n + 1);
          return;
        }
        const { eventId, forwardStatus, forwardCode, forwardLatency } = m.result;
        setRevisions((r) => ({ ...r, [eventId]: (r[eventId] ?? 0) + 1 }));
        setItems((list) =>
          list.some((e) => e.id === eventId)
            ? list.map((e) => (e.id === eventId ? { ...e, forwardStatus, forwardCode, forwardLatency } : e))
            : list,
        );
      }),
    [subscribe],
  );

  const maxAttemptsOf = useMemo(() => {
    const map = new Map(endpointList.map((ep) => [ep.id, (ep.retryMaxAttempts ?? 3) + 1]));
    return (endpointId: string | undefined) => (endpointId && map.get(endpointId)) || 4;
  }, [endpointList]);

  const endpointName = useMemo(() => new Map(endpointList.map((ep) => [ep.id, ep.name])), [endpointList]);
  const activeSelected = selected && items.some((e) => e.id === selected) ? selected : items[0]?.id ?? null;
  const selectedRow = items.find((e) => e.id === activeSelected);

  const select = useCallback((id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1100px)").matches) {
      window.requestAnimationFrame(() => recorderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  const replay = useCallback(
    async (id: string) => {
      setReplaying(true);
      try {
        const next = await eventsApi.replay(id);
        toast.success("Replay queued");
        setSelected(next.id);
        if (page === 0) reload();
        else goTo(0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Replay failed");
      } finally {
        setReplaying(false);
      }
    },
    [page, reload, goTo],
  );

  async function exportAs(format: "csv" | "json") {
    setExporting(format);
    try {
      await eventExport[format](queryFor(filters));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const el = ev.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) {
        if (ev.key === "Escape") (el as HTMLInputElement).blur();
        return;
      }
      const idx = items.findIndex((r) => r.id === activeSelected);
      if (ev.key === "j" || ev.key === "ArrowDown") setSelected(items[Math.min(items.length - 1, idx + 1)]?.id ?? null);
      else if (ev.key === "k" || ev.key === "ArrowUp") setSelected(items[Math.max(0, idx - 1)]?.id ?? null);
      else if (ev.key === "r" && activeSelected && !replaying) void replay(activeSelected);
      else if (ev.key === "/") searchRef.current?.focus();
      else if (ev.key === "]") goTo(page + 1);
      else if (ev.key === "[") goTo(page - 1);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, activeSelected, replay, replaying, goTo, page]);

  const filtered = filters !== NO_FILTERS && JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const providerOptions = Array.from(new Set([...endpointList.map((e) => e.provider), ...PROVIDERS.map((p) => p.value)]));
  const first = page * PAGE_SIZE + 1;

  return (
    <div className="fd-root traffic history">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>History</h1>
          <span className="label-sm">every arrival, newest first</span>
        </div>
        <span className="grow" />
        {fresh > 0 && (
          <button type="button" className="chip" data-tone="cyan" onClick={() => (page === 0 ? reload() : goTo(0))}>
            {fresh} new · show
          </button>
        )}
        <button type="button" className="chip chip--quiet" onClick={reload} disabled={loading}>
          Refresh
        </button>
        <span className="chip-group" role="group" aria-label="Export">
          <span className="label-sm">export</span>
          <button type="button" className="chip chip--quiet" onClick={() => void exportAs("csv")} disabled={!!exporting}>
            {exporting === "csv" ? "…" : "CSV"}
          </button>
          <button type="button" className="chip chip--quiet" onClick={() => void exportAs("json")} disabled={!!exporting}>
            {exporting === "json" ? "…" : "JSON"}
          </button>
        </span>
      </div>

      <div className="tower-main">
        <section aria-label="Arrivals board" className="board-pane history-board">
          <div className="pane-head">
            <h2>Arrivals board</h2>
            <span>
              {items.length ? `${first}–${first + items.length - 1}` : "0"} {filtered ? "matching" : "events"}
            </span>
            <span className="grow" />
            <span className="hide-sm">
              <span className="kbd">[</span> <span className="kbd">]</span> page
            </span>
          </div>
          <div className="board-tools">
            {STATUSES.map((s) => (
              <button
                key={s.id || "all"}
                type="button"
                className="chip"
                data-tone={s.tone}
                aria-pressed={filters.status === s.id}
                onClick={() => applyFilters({ status: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="board-tools board-tools--fields">
            <label className="fd-mini">
              <span>Route</span>
              <select className="fd-input" value={filters.endpointId} onChange={(e) => applyFilters({ endpointId: e.target.value })}>
                <option value="">All routes</option>
                {endpointList.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fd-mini">
              <span>Source</span>
              <select className="fd-input" value={filters.provider} onChange={(e) => applyFilters({ provider: e.target.value })}>
                <option value="">All sources</option>
                {providerOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="fd-mini">
              <span>Window</span>
              <select className="fd-input" value={filters.window} onChange={(e) => applyFilters({ window: e.target.value })}>
                {WINDOWS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fd-check">
              <input type="checkbox" checked={filters.duplicates} onChange={(e) => applyFilters({ duplicates: e.target.checked })} />
              <span>Duplicates only</span>
            </label>
            <form
              className="fd-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                applyFilters({ search: query.trim() });
              }}
            >
              <input
                ref={searchRef}
                className="fd-input"
                type="search"
                placeholder="Search payloads  /"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value && filters.search) applyFilters({ search: "" });
                }}
                aria-label="Search event payloads"
              />
            </form>
            {filtered && (
              <button
                type="button"
                className="chip chip--quiet"
                onClick={() => {
                  setQuery("");
                  applyFilters(NO_FILTERS);
                }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="board-scroll" aria-busy={loading}>
            {error ? (
              <div className="board-empty">
                <p className="tone-red">{error}</p>
                <p>
                  <button type="button" className="chip chip--quiet" onClick={reload}>
                    Retry
                  </button>
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="board-empty">
                {loading ? (
                  <p>Loading the board…</p>
                ) : filtered ? (
                  <p>Nothing on the board matches these filters.</p>
                ) : (
                  <>
                    <p>No arrivals recorded yet.</p>
                    <p>
                      Point a provider at your ingress URL from <Link href="/dashboard">Traffic</Link> and events land here.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <table className="board" role="grid" aria-label="Arrivals" aria-rowcount={items.length} data-loading={loading || undefined}>
                <thead>
                  <tr>
                    <th scope="col">TIME</th>
                    <th scope="col">EVENT</th>
                    <th scope="col" className="hide-sm">
                      ROUTE
                    </th>
                    <th scope="col" className="hide-sm">
                      SEAL
                    </th>
                    <th scope="col" className="hide-md">
                      CODE
                    </th>
                    <th scope="col" className="hide-md">
                      LATENCY
                    </th>
                    <th scope="col">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const st = liveStatus(e.forwardStatus, 0, maxAttemptsOf(e.endpointId));
                    return (
                      <tr
                        key={e.id}
                        aria-selected={activeSelected === e.id}
                        tabIndex={0}
                        onClick={() => select(e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            select(e.id);
                          }
                        }}
                      >
                        <td className="t-time">{fmtStamp(e.receivedAt)}</td>
                        <td>
                          <Flap text={e.eventType ?? "unknown"} width={24} reduced={reduced} />
                          {e.isReplay && <span className="replay-tag">replay</span>}
                          {e.isDuplicate && <span className="dup-tag">dup</span>}
                        </td>
                        <td className="t-src hide-sm">
                          {endpointName.get(e.endpointId) ?? e.provider ?? "custom"}
                          <span className="t-sub">{e.provider ?? "custom"}</span>
                        </td>
                        <td className={`hide-sm ${e.signatureValid === null ? "t-time" : e.signatureValid ? "seal-ok" : "seal-bad"}`}>
                          {e.signatureValid === null ? "— unsigned" : e.signatureValid ? "✓ sealed" : "✗ invalid"}
                        </td>
                        <td className={`hide-md ${e.forwardCode ? (e.forwardCode < 300 ? "seal-ok" : "seal-bad") : "t-time"}`}>
                          {e.forwardCode || "—"}
                        </td>
                        <td className="t-time hide-md">{e.forwardLatency ? `${e.forwardLatency}ms` : "—"}</td>
                        <td className="status" data-p={st.phase}>
                          <Flap text={st.label} width={11} reduced={reduced} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <nav className="pager" aria-label="Pages">
            <button type="button" className="chip chip--quiet" onClick={() => goTo(page - 1)} disabled={page === 0 || loading}>
              ← Newer
            </button>
            <span className="label-sm">page {page + 1}</span>
            <button type="button" className="chip chip--quiet" onClick={() => goTo(page + 1)} disabled={!nextCursor || loading}>
              Older →
            </button>
          </nav>
        </section>

        <div ref={recorderRef} className="recorder-slot">
          <LiveRecorder
            eventId={activeSelected}
            revision={`${activeSelected}:${activeSelected ? revisions[activeSelected] ?? 0 : 0}:${selectedRow?.forwardStatus ?? ""}`}
            attempts={0}
            maxAttempts={maxAttemptsOf(selectedRow?.endpointId)}
            replaying={replaying}
            onReplay={(id) => void replay(id)}
            emptyHint={
              <>
                Select an arrival to open its flight recorder.
                <br />
                <span className="kbd">J</span> <span className="kbd">K</span> move · <span className="kbd">R</span> replay ·{" "}
                <span className="kbd">[</span> <span className="kbd">]</span> page · <span className="kbd">/</span> search
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
