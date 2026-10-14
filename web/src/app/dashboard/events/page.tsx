"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { events as eventsApi, eventExport, WebhookEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useStaggerIn } from "@/hooks/use-gsap";

const statusFilters = [
  { value: "", label: "All" },
  { value: "forwarded", label: "Forwarded" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "pending", label: "Pending" },
];

const METHOD_COLORS: Record<string, string> = {
  POST: "text-sky-400",
  GET: "text-emerald-400",
  PUT: "text-amber-400",
  DELETE: "text-red-400",
  PATCH: "text-purple-400",
};

const STATUS_RAIL: Record<string, string> = {
  forwarded: "bg-emerald-500",
  failed: "bg-red-500",
  pending: "bg-amber-500",
  skipped: "bg-zinc-500",
};

const STATUS_DOT: Record<string, string> = {
  forwarded: "text-emerald-400",
  failed: "text-red-400",
  pending: "text-amber-400",
  skipped: "text-zinc-500",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SigIcon({ valid }: { valid: boolean | null }) {
  if (valid === null) return <span className="text-text-tertiary text-[10px] font-mono">—</span>;
  return valid ? (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-400 shrink-0">
      <path d="M2 6l3 3 5-5" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-400 shrink-0">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

export default function EventsPage() {
  const [items, setItems] = useState<WebhookEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showExport, setShowExport] = useState(false);
  const listRef = useStaggerIn<HTMLDivElement>();

  const fetchEvents = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError("");
      try {
        const params: Record<string, string> = {};
        if (statusFilter) params.forwardStatus = statusFilter;
        if (search) params.search = search;
        if (cursor) params.cursor = cursor;
        const res = await eventsApi.list(params);
        setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, search],
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  function handleExport(format: "csv" | "json") {
    setShowExport(false);
    const params: Record<string, string> = {};
    if (statusFilter) params.forwardStatus = statusFilter;
    if (search) params.search = search;
    eventExport[format](params).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Export failed");
    });
  }

  return (
    <div className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        {/* Status filters */}
        <div className="flex items-center gap-0 border border-border-primary rounded-lg overflow-hidden w-fit">
          {statusFilters.map((f, i) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer border-r border-border-primary last:border-r-0
                ${statusFilter === f.value
                  ? "bg-bg-hover text-text-primary"
                  : "bg-bg-secondary text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
                } ${i === 0 ? "" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
            className="relative"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
              <circle cx="5" cy="5" r="3.5" />
              <path d="M8 8l2.5 2.5" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search…"
              className="w-36 pl-7 pr-3 py-1.5 text-[12px] rounded-lg bg-bg-secondary border border-border-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-bg-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); setSearchInput(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary cursor-pointer"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            )}
          </form>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-text-tertiary hover:text-text-primary bg-bg-secondary border border-border-primary rounded-lg transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 8.5v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M7 1.5v8M4 4.5l3-3 3 3" />
              </svg>
              Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-bg-elevated border border-border-primary rounded-lg shadow-lg z-20 overflow-hidden py-0.5">
                <button
                  className="w-full text-left px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                  onClick={() => handleExport("csv")}
                >
                  Export CSV
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                  onClick={() => handleExport("json")}
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => fetchEvents()}
            className="p-1.5 text-text-tertiary hover:text-text-primary bg-bg-secondary border border-border-primary rounded-lg transition-colors cursor-pointer"
            title="Refresh"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 7a6 6 0 0111.5-2.5M13 7a6 6 0 01-11.5 2.5" />
              <path d="M12.5 1v3.5H9M1.5 13V9.5H5" />
            </svg>
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-sm text-text-error">{error}</p>
          <button onClick={() => fetchEvents()} className="text-xs text-text-accent hover:underline cursor-pointer">Retry</button>
        </div>
      ) : items.length === 0 && !loading ? (
        <EmptyState
          title="No events yet"
          description="Point your provider's webhook URL at your ingress endpoint and events will appear here in real time."
          action={
            <Link href="/dashboard" className="text-xs text-text-accent hover:underline">
              View your ingress URL
            </Link>
          }
        />
      ) : (
        <div ref={listRef} className="rounded-xl border border-border-primary overflow-hidden bg-bg-secondary divide-y divide-border-primary">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[4px_52px_1fr_80px_60px_56px_72px] items-center gap-4 px-4 py-2 bg-bg-tertiary">
            <span />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Method</span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Event</span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Status</span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium text-right">Sig</span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium text-right">Lat</span>
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium text-right">Time</span>
          </div>

          {items.map((event) => {
            const rail = STATUS_RAIL[event.forwardStatus] ?? "bg-zinc-600";
            const dotColor = STATUS_DOT[event.forwardStatus] ?? "text-zinc-400";
            const methodColor = METHOD_COLORS[event.method] ?? "text-text-tertiary";

            return (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <div className="group relative hidden sm:grid grid-cols-[4px_52px_1fr_80px_60px_56px_72px] items-center gap-4 px-4 py-2.5 hover:bg-bg-hover transition-colors cursor-pointer">
                  {/* Status rail */}
                  <span className={`${rail} rounded-full w-[3px] h-5 shrink-0`} />

                  {/* Method */}
                  <span className={`text-[11px] font-mono font-semibold ${methodColor}`}>{event.method}</span>

                  {/* Event type + provider */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">
                      {event.eventType || "unknown"}
                    </span>
                    {event.provider && (
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0">{event.provider}</span>
                    )}
                    {event.isReplay && (
                      <span className="text-[9px] uppercase tracking-widest text-text-accent font-bold bg-bg-accent-subtle px-1.5 py-0.5 rounded shrink-0">replay</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-medium ${dotColor}`}>{event.forwardStatus}</span>
                  </div>

                  {/* Signature */}
                  <div className="flex justify-end">
                    <SigIcon valid={event.signatureValid} />
                  </div>

                  {/* Latency */}
                  <span className="text-[11px] font-mono text-text-tertiary tabular-nums text-right">
                    {event.forwardLatency ? `${event.forwardLatency}ms` : "—"}
                  </span>

                  {/* Time */}
                  <span className="text-[11px] font-mono text-text-tertiary tabular-nums text-right whitespace-nowrap">
                    {relativeTime(event.receivedAt)}
                  </span>
                </div>

                {/* Mobile row */}
                <div className="group relative flex sm:hidden items-start gap-3 px-4 py-3 hover:bg-bg-hover transition-colors cursor-pointer">
                  <span className={`${rail} rounded-full w-[3px] h-full min-h-[40px] shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-mono font-semibold ${methodColor}`}>{event.method}</span>
                      <span className="text-[13px] font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">
                        {event.eventType || "unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {event.provider && <span className="text-[10px] font-mono text-text-tertiary">{event.provider}</span>}
                      <span className={`text-[11px] ${dotColor}`}>{event.forwardStatus}</span>
                      <SigIcon valid={event.signatureValid} />
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-text-tertiary shrink-0">{relativeTime(event.receivedAt)}</span>
                </div>
              </Link>
            );
          })}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-4 h-4 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center mt-6">
          <Button variant="secondary" size="sm" loading={loading} onClick={() => fetchEvents(nextCursor)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
