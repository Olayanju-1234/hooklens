"use client";

import { useState, useEffect } from "react";
import { endpoints, deadLetter, Endpoint, DeadLetterEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import toast from "react-hot-toast";

export default function DeadLetterPage() {
  const [endpointList, setEndpointList] = useState<Endpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<DeadLetterEntry | null>(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    endpoints
      .list()
      .then((list) => {
        setEndpointList(list);
        if (list.length > 0) setSelectedEndpoint(list[0].id);
      })
      .catch(() => toast.error("Failed to load endpoints"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEndpoint) return;
    setLoading(true);
    deadLetter
      .list(selectedEndpoint)
      .then(setEntries)
      .catch(() => toast.error("Failed to load dead letters"))
      .finally(() => setLoading(false));
  }, [selectedEndpoint]);

  async function handleRetry(entry: DeadLetterEntry) {
    setRetryingId(entry.id);
    try {
      await deadLetter.retry(selectedEndpoint, entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success("Event re-queued for forwarding");
    } catch {
      toast.error("Failed to retry");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDiscard() {
    if (!discardTarget) return;
    setDiscarding(true);
    try {
      await deadLetter.discard(selectedEndpoint, discardTarget.id);
      setEntries((prev) => prev.filter((e) => e.id !== discardTarget.id));
      setDiscardTarget(null);
      toast.success("Entry discarded");
    } catch {
      toast.error("Failed to discard");
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 mx-auto max-w-4xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Recorder · dead letters</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Events that exhausted all retry attempts
          </p>
        </div>
      </div>

      {endpointList.length > 0 && (
        <div className="mb-5">
          <Select
            label="Endpoint"
            value={selectedEndpoint}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            options={endpointList.map((ep) => ({ value: ep.id, label: `${ep.name} (${ep.provider})` }))}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No dead letters"
          description="Events that fail all retry attempts will appear here for manual review"
        />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-xl bg-bg-secondary border border-border-primary"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-text-primary">
                    {entry.eventId.slice(0, 12)}...
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-bg-error text-text-error">
                    Exhausted
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-text-tertiary">
                    {entry.lastAttempt} attempts
                  </span>
                  {entry.lastError && (
                    <span className="text-[11px] text-text-error truncate max-w-[300px]">
                      {entry.lastError}
                    </span>
                  )}
                  <span className="text-[11px] text-text-tertiary">
                    {new Date(entry.exhaustedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={retryingId === entry.id}
                  onClick={() => void handleRetry(entry)}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDiscardTarget(entry)}
                  className="text-text-error hover:text-text-error"
                >
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!discardTarget}
        title="Discard dead letter"
        description="This will permanently remove this event from the dead letter queue. It cannot be recovered."
        confirmLabel="Discard"
        variant="danger"
        loading={discarding}
        onConfirm={() => void handleDiscard()}
        onCancel={() => setDiscardTarget(null)}
      />
    </div>
  );
}
