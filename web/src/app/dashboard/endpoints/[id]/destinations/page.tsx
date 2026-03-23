"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  destinations as destinationsApi,
  endpoints as endpointsApi,
  ForwardDestination,
  Endpoint,
  ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import toast from "react-hot-toast";

export default function DestinationsPage() {
  const params = useParams();
  const router = useRouter();
  const endpointId = params.id as string;

  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [items, setItems] = useState<ForwardDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ForwardDestination | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ep, dests] = await Promise.all([
        endpointsApi.get(endpointId),
        destinationsApi.list(endpointId),
      ]);
      setEndpoint(ep);
      setItems(dests);
    } catch {
      toast.error("Failed to load destinations");
    } finally {
      setLoading(false);
    }
  }, [endpointId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await destinationsApi.create(endpointId, {
        url,
        label: label || undefined,
      });
      setItems((prev) => [...prev, created]);
      setUrl("");
      setLabel("");
      setShowForm(false);
      toast.success("Destination added");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(dest: ForwardDestination) {
    try {
      const updated = await destinationsApi.update(endpointId, dest.id, {
        isActive: !dest.isActive,
      });
      setItems((prev) => prev.map((d) => (d.id === dest.id ? updated : d)));
    } catch {
      toast.error("Failed to update destination");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await destinationsApi.delete(endpointId, deleteTarget.id);
      setItems((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success("Destination removed");
    } catch {
      toast.error("Failed to delete destination");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-6 mx-auto max-w-4xl w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/dashboard/endpoints")}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 4l-4 4 4 4" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-text-primary">
              Forward Destinations
            </h1>
            {endpoint && (
              <p className="text-xs text-text-tertiary mt-0.5">
                {endpoint.name} &middot; {endpoint.provider}
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
            Add Destination
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="mb-5 p-4 rounded-xl bg-bg-secondary border border-border-primary">
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
              <Input
                label="URL"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks"
                required
              />
              <Input
                label="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Production API"
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={submitting}>
                  Add
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No forward destinations"
            description="Add URLs where webhook events will be forwarded to. Multiple destinations receive the same events."
            action={
              <Button size="sm" onClick={() => setShowForm(true)}>
                Add your first destination
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {items.map((dest) => (
              <div
                key={dest.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-4 rounded-xl bg-bg-secondary border border-border-primary hover:border-border-secondary group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {dest.label || "Untitled"}
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded ${
                        dest.isActive
                          ? "text-text-success bg-bg-success"
                          : "text-text-tertiary bg-bg-tertiary"
                      }`}
                    >
                      {dest.isActive ? "active" : "paused"}
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary font-mono mt-1 truncate">
                    {dest.url}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => void handleToggle(dest)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                    title={dest.isActive ? "Pause" : "Activate"}
                  >
                    {dest.isActive ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="4" y="3" width="2.5" height="10" rx="0.5" />
                        <rect x="9.5" y="3" width="2.5" height="10" rx="0.5" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M5 3l8 5-8 5V3z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(dest)}
                    className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 5h10M5 5v8a1 1 0 001 1h4a1 1 0 001-1V5M7 3h2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete destination"
        description={`Remove "${deleteTarget?.label || deleteTarget?.url}"? Events will no longer be forwarded here.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
