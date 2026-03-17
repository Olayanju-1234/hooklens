"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { events as eventsApi, WebhookEvent } from "@/lib/api";
import { StatusBadge, MethodBadge, SignatureBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFadeIn } from "@/hooks/use-gsap";

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<WebhookEvent | null>(null);
  const [replaying, setReplaying] = useState(false);
  const contentRef = useFadeIn<HTMLDivElement>();

  useEffect(() => {
    if (params.id) {
      void eventsApi.get(params.id as string).then(setEvent);
    }
  }, [params.id]);

  async function handleReplay() {
    if (!event) return;
    setReplaying(true);
    try {
      const replayed = await eventsApi.replay(event.id);
      router.push(`/dashboard/events/${replayed.id}`);
    } finally {
      setReplaying(false);
    }
  }

  if (!event) {
    return (
      <>
        <Topbar title="Event Detail" />
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Event Detail" />
      <div ref={contentRef} className="px-6 pb-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M10 4l-4 4 4 4" />
              </svg>
            </button>
            <MethodBadge method={event.method} />
            <span className="text-base font-semibold text-text-primary">
              {event.eventType || "unknown"}
            </span>
            {event.isReplay && (
              <span className="text-[9px] uppercase tracking-widest text-text-accent font-semibold bg-bg-accent-subtle px-1.5 py-0.5 rounded">
                replay
              </span>
            )}
          </div>
          <Button variant="secondary" size="sm" loading={replaying} onClick={handleReplay}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 7a6 6 0 0111.5-2.5M13 7a6 6 0 01-11.5 2.5" />
              <path d="M12.5 1v3.5H9M1.5 13V9.5H5" />
            </svg>
            Replay
          </Button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
          <MetaItem label="Status" value={<StatusBadge status={event.forwardStatus} />} />
          <MetaItem label="Signature" value={<SignatureBadge valid={event.signatureValid} />} />
          <MetaItem
            label="Latency"
            value={
              <span className="text-sm font-mono text-text-primary tabular-nums">
                {event.forwardLatency ? `${event.forwardLatency}ms` : "\u2014"}
              </span>
            }
          />
          <MetaItem
            label="Received"
            value={
              <span className="text-sm text-text-primary tabular-nums">
                {new Date(event.receivedAt).toLocaleString()}
              </span>
            }
          />
        </div>

        {/* Forward Response */}
        {event.forwardCode && (
          <Card className="mb-3">
            <CardHeader
              title="Forward Response"
              description={`HTTP ${event.forwardCode}`}
            />
            <pre className="text-xs font-mono text-text-secondary bg-bg-tertiary rounded-lg p-3.5 overflow-x-auto max-h-48">
              {event.forwardBody || "No response body"}
            </pre>
          </Card>
        )}

        {/* Headers */}
        {event.headers && (
          <Card className="mb-3">
            <CardHeader title="Request Headers" />
            <div className="space-y-1">
              {Object.entries(event.headers).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-xs font-mono">
                  <span className="text-text-accent shrink-0">{key}:</span>
                  <span className="text-text-secondary break-all">{val}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Body */}
        {event.body && (
          <Card>
            <CardHeader title="Request Body" />
            <pre className="text-xs font-mono text-text-secondary bg-bg-tertiary rounded-lg p-3.5 overflow-x-auto max-h-96">
              {JSON.stringify(event.body, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 rounded-xl bg-bg-secondary border border-border-primary">
      <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-1.5">
        {label}
      </p>
      {value}
    </div>
  );
}
