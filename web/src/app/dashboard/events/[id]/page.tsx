"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  events as eventsApi,
  timeline as timelineApi,
  WebhookEvent,
  TimelineStep,
  INGRESS_BASE,
} from "@/lib/api";
import {
  StatusBadge,
  MethodBadge,
  SignatureBadge,
} from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventTimeline } from "@/components/event-timeline";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFadeIn } from "@/hooks/use-gsap";

interface DiffResult {
  event1: { id: string; body: unknown; receivedAt: string };
  event2: { id: string; body: unknown; receivedAt: string };
  headersDiff: Record<string, { old: unknown; new: unknown; status: string }>;
  bodyDiff: Record<string, { old: unknown; new: unknown; status: string }>;
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<WebhookEvent | null>(null);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [error, setError] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const contentRef = useFadeIn<HTMLDivElement>();

  // Diff state
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffEventId, setDiffEventId] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffError, setDiffError] = useState("");

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

  async function handleDelete() {
    if (!event) return;
    setDeleting(true);
    try {
      await eventsApi.delete(event.id);
      toast.success("Event deleted");
      router.push("/dashboard/events");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  }

  async function handleReplay() {
    if (!event) return;
    setReplaying(true);
    try {
      const replayed = await eventsApi.replay(event.id);
      toast.success("Event replayed");
      router.push(`/dashboard/events/${replayed.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to replay event");
    } finally {
      setReplaying(false);
    }
  }

  async function handleDiff() {
    if (!event || !diffEventId.trim()) return;
    setDiffLoading(true);
    setDiffError("");
    setDiffResult(null);
    try {
      const result = await eventsApi.diff(event.id, diffEventId.trim());
      setDiffResult(result);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : "Failed to compare events");
    } finally {
      setDiffLoading(false);
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(event.id);
                toast.success("Event ID copied");
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="5" y="5" width="8" height="8" rx="1" />
                <path d="M3 11V4a1 1 0 011-1h7" />
              </svg>
              ID
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const curl = `curl -X POST '${INGRESS_BASE}/in/${event.path.split("/in/")[1] || "SLUG"}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(event.body)}'`;
                navigator.clipboard.writeText(curl);
                toast.success("curl command copied");
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 6l3 3-3 3M8 12h5" />
              </svg>
              curl
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDiffOpen(!diffOpen); setDiffResult(null); setDiffError(""); }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 2v10M10 2v10M1 5h6M7 9h6" />
              </svg>
              Compare
            </Button>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-text-error hover:text-text-error"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 5h10M5 5V3a1 1 0 011-1h4a1 1 0 011 1v2M13 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V5" />
              </svg>
              Delete
            </Button>
          </div>
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

        {/* Diff Panel */}
        {diffOpen && (
          <Card className="mb-3">
            <CardHeader title="Compare Events" description="Diff this event against another by ID" />
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <Input
                  label="Other Event ID"
                  value={diffEventId}
                  onChange={(e) => setDiffEventId(e.target.value)}
                  placeholder="Paste event ID to compare"
                />
              </div>
              <Button size="sm" loading={diffLoading} onClick={() => void handleDiff()}>
                Diff
              </Button>
            </div>
            {diffError && (
              <p className="text-sm text-text-error mb-2">{diffError}</p>
            )}
            {diffResult && (
              <div className="space-y-3">
                <DiffTable title="Headers" diff={diffResult.headersDiff} />
                <DiffTable title="Body" diff={diffResult.bodyDiff} />
              </div>
            )}
          </Card>
        )}

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

      <ConfirmDialog
        open={deleteOpen}
        title="Delete event"
        description="Are you sure you want to delete this event? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
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

function DiffTable({ title, diff }: { title: string; diff: Record<string, { old: unknown; new: unknown; status: string }> }) {
  const entries = Object.entries(diff);
  if (entries.length === 0) {
    return (
      <div className="text-xs text-text-tertiary">
        No {title.toLowerCase()} differences
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-text-secondary mb-1.5">{title}</p>
      <div className="border border-border-primary rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bg-tertiary border-b border-border-primary">
              <th className="text-left px-3 py-1.5 text-text-tertiary font-medium">Field</th>
              <th className="text-left px-3 py-1.5 text-text-tertiary font-medium">Status</th>
              <th className="text-left px-3 py-1.5 text-text-tertiary font-medium">This Event</th>
              <th className="text-left px-3 py-1.5 text-text-tertiary font-medium">Other Event</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([field, { old: oldVal, new: newVal, status }]) => (
              <tr key={field} className="border-b border-border-primary last:border-0">
                <td className="px-3 py-1.5 font-mono text-text-primary">{field}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    status === "added" ? "bg-emerald-500/10 text-emerald-400" :
                    status === "removed" ? "bg-red-500/10 text-red-400" :
                    "bg-yellow-500/10 text-yellow-400"
                  }`}>
                    {status}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-text-secondary max-w-[200px] truncate">
                  {oldVal !== null && oldVal !== undefined ? (typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal)) : "\u2014"}
                </td>
                <td className="px-3 py-1.5 font-mono text-text-secondary max-w-[200px] truncate">
                  {newVal !== null && newVal !== undefined ? (typeof newVal === "object" ? JSON.stringify(newVal) : String(newVal)) : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
