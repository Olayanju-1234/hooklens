"use client";

import { useWebSocket } from "@/hooks/use-websocket";
import { StatusBadge, MethodBadge, SignatureBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export default function DashboardPage() {
  const { liveEvents, clearEvents, connected } = useWebSocket();

  return (
    <>
      <div className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-text-tertiary font-mono tabular-nums">
            {liveEvents.length} event{liveEvents.length !== 1 ? "s" : ""}
          </p>
          {liveEvents.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearEvents}>
              Clear
            </Button>
          )}
        </div>

        {liveEvents.length === 0 ? (
          <EmptyState
            icon={
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="9" cy="9" r="2.5" />
                <path d="M5.5 4a7 7 0 010 10M12.5 4a7 7 0 000 10" />
              </svg>
            }
            title="Waiting for webhooks"
            description="Send a webhook to your ingress URL and it will appear here in real time"
          />
        ) : (
          <div className="space-y-1">
            {liveEvents.map((event, i) => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <div
                  className="animate-slide-in flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 rounded-xl
                    bg-bg-secondary border border-border-primary
                    hover:border-border-secondary hover:shadow-sm
                    cursor-pointer group"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <MethodBadge method={event.method} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate group-hover:text-text-accent">
                        {event.eventType || "unknown"}
                      </span>
                      {event.provider && (
                        <span className="text-[11px] text-text-tertiary font-medium">{event.provider}</span>
                      )}
                    </div>
                    <p className="text-xs text-text-tertiary font-mono mt-0.5 truncate max-w-md">
                      {event.bodyPreview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 sm:ml-0 ml-0">
                    <SignatureBadge valid={event.signatureValid} />
                    <StatusBadge status={event.forwardStatus} />
                    <span className="text-[11px] text-text-tertiary font-mono tabular-nums ml-auto sm:ml-0">
                      {new Date(event.receivedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
