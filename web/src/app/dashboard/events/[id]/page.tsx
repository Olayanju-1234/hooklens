"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  events as eventsApi,
  timeline as timelineApi,
  WebhookEvent,
  TimelineStep,
} from "@/lib/api";
import {
  StatusBadge,
  MethodBadge,
  SignatureBadge,
} from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventTimeline } from "@/components/event-timeline";
import { useFadeIn } from "@/hooks/use-gsap";

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<WebhookEvent | null>(null);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [error, setError] = useState("");
  const [replaying, setReplaying] = useState(false);
  const contentRef = useFadeIn<HTMLDivElement>();

  useEffect(() => {
    if (params.id) {
      const eventId = params.id as string;
      eventsApi
        .get(eventId)
        .then(setEvent)
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load event");
        });
      timelineApi
        .get(eventId)
        .then((res) => setTimelineSteps(res.steps))
        .catch(() => {
          // Timeline is optional, don't block on failure
        });
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-text-error">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-xs text-text-accent hover:underline cursor-pointer"
        >
          Go back
        </button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div
        ref={contentRef}
        className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
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
            {(event as WebhookEvent & { isDuplicate?: boolean; originalEventId?: string }).isDuplicate && (
              <Badge variant="warning">
                duplicate
                {(event as WebhookEvent & { originalEventId?: string }).originalEventId && (
                  <Link
                    href={`/dashboard/events/${(event as WebhookEvent & { originalEventId?: string }).originalEventId}`}
                    className="ml-1 underline"
                  >
                    (original)
                  </Link>
                )}
              </Badge>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={replaying}
            onClick={handleReplay}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M1 7a6 6 0 0111.5-2.5M13 7a6 6 0 01-11.5 2.5" />
              <path d="M12.5 1v3.5H9M1.5 13V9.5H5" />
            </svg>
            Replay
          </Button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
          <MetaItem
            label="Status"
            value={<StatusBadge status={event.forwardStatus} />}
          />
          <MetaItem
            label="Signature"
            value={<SignatureBadge valid={event.signatureValid} />}
          />
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

        {/* Event Timeline */}
        {timelineSteps.length > 0 && (
          <Card className="mb-3">
            <CardHeader title="Event Timeline" description="Step-by-step processing trace" />
            <EventTimeline steps={timelineSteps} />
          </Card>
        )}

        {/* Forward Results (per-destination) */}
        {(event as WebhookEvent & { forwardResults?: Array<{ destinationId: string; url: string; statusCode: number | null; error: string | null; latencyMs: number | null }> }).forwardResults &&
          (event as WebhookEvent & { forwardResults: Array<{ destinationId: string; url: string; statusCode: number | null; error: string | null; latencyMs: number | null }> }).forwardResults.length > 0 && (
          <Card className="mb-3">
            <CardHeader title="Forward Results" description="Per-destination delivery status" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-primary">
                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                      Destination
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                      Status
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                      Latency
                    </th>
                    <th className="text-left py-2 font-medium text-text-tertiary uppercase tracking-widest text-[10px]">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(event as WebhookEvent & { forwardResults: Array<{ destinationId: string; url: string; statusCode: number | null; error: string | null; latencyMs: number | null }> }).forwardResults.map((result, idx) => (
                    <tr key={idx} className="border-b border-border-primary last:border-0">
                      <td className="py-2 pr-4 font-mono text-text-secondary truncate max-w-[200px]">
                        {result.url}
                      </td>
                      <td className="py-2 pr-4">
                        {result.statusCode ? (
                          <Badge variant={result.statusCode < 400 ? "success" : "error"}>
                            {result.statusCode}
                          </Badge>
                        ) : (
                          <Badge variant="default">--</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-text-tertiary tabular-nums">
                        {result.latencyMs !== null ? `${result.latencyMs}ms` : "\u2014"}
                      </td>
                      <td className="py-2 text-text-error truncate max-w-[200px]">
                        {result.error || "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

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
