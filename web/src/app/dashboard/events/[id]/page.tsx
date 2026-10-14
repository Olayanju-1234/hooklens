"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { endpoints as endpointsApi, events as eventsApi, timeline as timelineApi, type TimelineStep, type WebhookEvent } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RecorderView } from "@/components/flight-deck/tower/live-recorder";

interface DiffResult {
  event1: { id: string; body: unknown; receivedAt: string };
  event2: { id: string; body: unknown; receivedAt: string };
  headersDiff: Record<string, { old: unknown; new: unknown; status: string }>;
  bodyDiff: Record<string, { old: unknown; new: unknown; status: string }>;
}

interface ForwardResultRow {
  destinationId: string;
  url: string;
  statusCode: number | null;
  error: string | null;
  latencyMs: number | null;
}

type DetailEvent = WebhookEvent & { forwardResults?: ForwardResultRow[] };

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const [loaded, setLoaded] = useState<{ id: string; event: DetailEvent; steps: TimelineStep[] } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [maxAttempts, setMaxAttempts] = useState(4);
  const [replaying, setReplaying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffEventId, setDiffEventId] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffError, setDiffError] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    Promise.all([
      eventsApi.get(eventId),
      // Timeline is optional; the recorder still renders the payload without it.
      timelineApi.get(eventId).catch(() => ({ steps: [] as TimelineStep[] })),
    ])
      .then(async ([event, tl]) => {
        // Without the endpoint the default retry budget applies.
        const ep = await endpointsApi.get(event.endpointId).catch(() => null);
        if (cancelled) return;
        if (ep) setMaxAttempts((ep.retryMaxAttempts ?? 3) + 1);
        setLoaded({ id: eventId, event, steps: tl.steps });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError({ id: eventId, message: err instanceof Error ? err.message : "Failed to load event" });
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleDelete() {
    if (!loaded) return;
    setDeleting(true);
    try {
      await eventsApi.delete(loaded.event.id);
      toast.success("Event deleted");
      router.push("/dashboard/events");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeleting(false);
    }
  }

  async function handleReplay(id: string) {
    setReplaying(true);
    try {
      const replayed = await eventsApi.replay(id);
      toast.success("Event replayed");
      router.push(`/dashboard/events/${replayed.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to replay event");
    } finally {
      setReplaying(false);
    }
  }

  async function handleDiff() {
    if (!loaded || !diffEventId.trim()) return;
    setDiffLoading(true);
    setDiffError("");
    setDiffResult(null);
    try {
      setDiffResult(await eventsApi.diff(loaded.event.id, diffEventId.trim()));
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : "Failed to compare events");
    } finally {
      setDiffLoading(false);
    }
  }

  const current = loaded?.id === eventId ? loaded : null;

  if (!current) {
    return (
      <div className="fd-root fd-page">
        <div className="traffic-bar">
          <Link href="/dashboard/events" className="chip chip--quiet">
            ← History
          </Link>
        </div>
        <div className="page-body">
          {error?.id === eventId ? (
            <div className="board-empty">
              <p className="tone-red">{error.message}</p>
              <p>
                <button type="button" className="chip chip--quiet" onClick={() => router.back()}>
                  Go back
                </button>
              </p>
            </div>
          ) : (
            <p className="board-empty">Loading event…</p>
          )}
        </div>
      </div>
    );
  }

  const { event, steps } = current;
  const results = event.forwardResults ?? [];

  return (
    <div className="fd-root fd-page">
      <div className="traffic-bar">
        <Link href="/dashboard/events" className="chip chip--quiet">
          ← History
        </Link>
        <span className="label-sm hide-sm">event</span>
        <button
          type="button"
          className="ingress-chip"
          title="Copy event ID"
          onClick={() => {
            void navigator.clipboard.writeText(event.id).then(
              () => toast.success("Event ID copied"),
              () => toast.error("Clipboard unavailable"),
            );
          }}
        >
          <span>{event.id}</span>
        </button>
      </div>

      <div className="page-body page-body--wide">
        <RecorderView
          event={event}
          steps={steps}
          attempts={0}
          maxAttempts={maxAttempts}
          replaying={replaying}
          onReplay={(id) => void handleReplay(id)}
          variant="page"
          kicker={
            event.isDuplicate ? (
              <span className="tone-amber">
                {" "}
                · duplicate
                {event.originalEventId && (
                  <>
                    {" "}
                    of{" "}
                    <Link href={`/dashboard/events/${event.originalEventId}`} className="fd-link">
                      original
                    </Link>
                  </>
                )}
              </span>
            ) : null
          }
          actions={
            <>
              <button
                type="button"
                className="chip chip--quiet"
                aria-expanded={diffOpen}
                onClick={() => {
                  setDiffOpen(!diffOpen);
                  setDiffResult(null);
                  setDiffError("");
                }}
              >
                Compare
              </button>
              <button type="button" className="chip chip--quiet" onClick={() => setDeleteOpen(true)}>
                Delete
              </button>
            </>
          }
        >
          {diffOpen && (
            <section className="fr-block" aria-label="Compare">
              <h3>
                <span>Compare with another event</span>
              </h3>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleDiff();
                }}
              >
                <input
                  className="fd-input"
                  value={diffEventId}
                  onChange={(e) => setDiffEventId(e.target.value)}
                  placeholder="Paste an event ID"
                  aria-label="Other event ID"
                />
                <button type="submit" className="chip" disabled={diffLoading || !diffEventId.trim()}>
                  {diffLoading ? "Comparing…" : "Diff"}
                </button>
              </form>
              {diffError && <p className="fr-note tone-red">{diffError}</p>}
              {diffResult && (
                <>
                  <DiffTable title="Headers" diff={diffResult.headersDiff} />
                  <DiffTable title="Body" diff={diffResult.bodyDiff} />
                </>
              )}
            </section>
          )}

          {results.length > 0 && (
            <section className="fr-block" aria-label="Forward results">
              <h3>
                <span>Per destination</span>
              </h3>
              <div className="table-scroll">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>DESTINATION</th>
                      <th>CODE</th>
                      <th>LATENCY</th>
                      <th>ERROR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={`${r.destinationId}-${i}`}>
                        <td>{r.url}</td>
                        <td className={r.statusCode && r.statusCode < 400 ? "seal-ok" : "seal-bad"}>{r.statusCode ?? "—"}</td>
                        <td>{r.latencyMs !== null ? `${r.latencyMs}ms` : "—"}</td>
                        <td className="tone-red">{r.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {event.forwardCode ? (
            <section className="fr-block" aria-label="Destination response">
              <h3>
                <span>Destination response</span>
                <span className={event.forwardCode < 300 ? "seal-ok" : "seal-bad"}>HTTP {event.forwardCode}</span>
              </h3>
              <pre className="payload payload--short">{event.forwardBody || "No response body"}</pre>
            </section>
          ) : null}
        </RecorderView>
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
    </div>
  );
}

function show(v: unknown) {
  if (v === null || v === undefined) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function DiffTable({ title, diff }: { title: string; diff: Record<string, { old: unknown; new: unknown; status: string }> }) {
  const entries = Object.entries(diff);
  if (entries.length === 0) return <p className="fr-note">No {title.toLowerCase()} differences.</p>;
  return (
    <div className="diff">
      <p className="label-sm">{title}</p>
      <div className="table-scroll">
        <table className="mini-table">
          <thead>
            <tr>
              <th>FIELD</th>
              <th>CHANGE</th>
              <th>THIS EVENT</th>
              <th>OTHER EVENT</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([field, d]) => (
              <tr key={field}>
                <td>{field}</td>
                <td className="diff-status" data-s={d.status}>
                  {d.status}
                </td>
                <td>{show(d.old)}</td>
                <td>{show(d.new)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
