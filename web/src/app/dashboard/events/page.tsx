"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { events as eventsApi, WebhookEvent } from "@/lib/api";
import { StatusBadge, MethodBadge, SignatureBadge } from "@/components/ui/badge";
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

export default function EventsPage() {
  const [items, setItems] = useState<WebhookEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const listRef = useStaggerIn<HTMLDivElement>();

  const fetchEvents = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (statusFilter) params.forwardStatus = statusFilter;
        if (cursor) params.cursor = cursor;
        const res = await eventsApi.list(params);
        setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <>
      <Topbar title="Events" />
      <div className="px-6 pb-6">
        {/* Filter pills */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1 p-0.5 bg-bg-tertiary rounded-lg">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
                  ${statusFilter === f.value
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchEvents()}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 7a6 6 0 0111.5-2.5M13 7a6 6 0 01-11.5 2.5" />
              <path d="M12.5 1v3.5H9M1.5 13V9.5H5" />
            </svg>
            Refresh
          </Button>
        </div>

        {items.length === 0 && !loading ? (
          <EmptyState
            title="No events yet"
            description="Webhook events will show up here once your ingress URL receives requests"
          />
        ) : (
          <div ref={listRef} className="space-y-1">
            {items.map((event) => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl
                    bg-bg-secondary border border-border-primary
                    hover:border-border-secondary hover:shadow-sm
                    cursor-pointer group"
                >
                  <MethodBadge method={event.method} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary group-hover:text-text-accent">
                        {event.eventType || "unknown"}
                      </span>
                      {event.provider && (
                        <span className="text-[11px] text-text-tertiary font-medium">{event.provider}</span>
                      )}
                      {event.isReplay && (
                        <span className="text-[9px] uppercase tracking-widest text-text-accent font-semibold bg-bg-accent-subtle px-1.5 py-0.5 rounded">
                          replay
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <SignatureBadge valid={event.signatureValid} />
                    <StatusBadge status={event.forwardStatus} />
                    {event.forwardLatency && (
                      <span className="text-[11px] text-text-tertiary font-mono tabular-nums">
                        {event.forwardLatency}ms
                      </span>
                    )}
                    <span className="text-[11px] text-text-tertiary font-mono tabular-nums">
                      {new Date(event.receivedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center mt-8">
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              onClick={() => fetchEvents(nextCursor)}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
