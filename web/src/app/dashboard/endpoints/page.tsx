"use client";

import { useEffect, useState, FormEvent } from "react";
import { endpoints as endpointsApi, Endpoint, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useStaggerIn } from "@/hooks/use-gsap";

type ModalMode = "create" | "edit";

interface EndpointForm {
  name: string;
  provider: string;
  forwardUrl: string;
  webhookSecret: string;
}

const emptyForm: EndpointForm = {
  name: "",
  provider: "custom",
  forwardUrl: "",
  webhookSecret: "",
};

const providerOptions = [
  { value: "paystack", label: "Paystack" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "mono", label: "Mono" },
  { value: "custom", label: "Custom" },
];

export default function EndpointsPage() {
  const [items, setItems] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EndpointForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listRef = useStaggerIn<HTMLDivElement>();

  const [fetchError, setFetchError] = useState("");

  async function fetchEndpoints() {
    setLoading(true);
    setFetchError("");
    try {
      const data = await endpointsApi.list();
      setItems(data);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load endpoints",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchEndpoints();
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setModalMode("create");
    setEditingId(null);
    setError("");
    setModalOpen(true);
  }

  function openEdit(ep: Endpoint) {
    setForm({
      name: ep.name,
      provider: ep.provider,
      forwardUrl: ep.forwardUrl || "",
      webhookSecret: "",
    });
    setModalMode("edit");
    setEditingId(ep.id);
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modalMode === "create") {
        const created = await endpointsApi.create({
          name: form.name,
          provider: form.provider,
          forwardUrl: form.forwardUrl || undefined,
          webhookSecret: form.webhookSecret || undefined,
        });
        setItems((prev) => [created, ...prev]);
      } else if (editingId) {
        const updated = await endpointsApi.update(editingId, {
          name: form.name,
          provider: form.provider,
          forwardUrl: form.forwardUrl || null,
        });
        setItems((prev) =>
          prev.map((ep) => (ep.id === editingId ? updated : ep)),
        );
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await endpointsApi.delete(id);
      setItems((prev) => prev.filter((ep) => ep.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(ep: Endpoint) {
    const updated = await endpointsApi.update(ep.id, {
      isActive: !ep.isActive,
    });
    setItems((prev) => prev.map((e) => (e.id === ep.id ? updated : e)));
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-text-tertiary font-mono tabular-nums">
            {items.length} endpoint{items.length !== 1 ? "s" : ""}
          </p>
          <Button size="sm" onClick={openCreate}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M7 2v10M2 7h10" />
            </svg>
            New Endpoint
          </Button>
        </div>

        {fetchError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm text-text-error">{fetchError}</p>
            <button
              onClick={() => void fetchEndpoints()}
              className="text-xs text-text-accent hover:underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 && !loading ? (
          <EmptyState
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9h3l2-4 2 8 2-4h3" />
              </svg>
            }
            title="No endpoints configured"
            description="Create an endpoint to define how webhooks from different providers are verified and forwarded"
            action={
              <Button size="sm" onClick={openCreate}>
                Create your first endpoint
              </Button>
            }
          />
        ) : (
          <div ref={listRef} className="space-y-2">
            {items.map((ep) => (
              <div
                key={ep.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 rounded-xl
                  bg-bg-secondary border border-border-primary
                  hover:border-border-secondary hover:shadow-sm group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {ep.name}
                    </span>
                    <ProviderTag provider={ep.provider} />
                    <span
                      className={`text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded ${
                        ep.isActive
                          ? "text-text-success bg-bg-success"
                          : "text-text-tertiary bg-bg-tertiary"
                      }`}
                    >
                      {ep.isActive ? "active" : "paused"}
                    </span>
                  </div>
                  {ep.forwardUrl && (
                    <p className="text-xs text-text-tertiary font-mono mt-1.5 truncate">
                      {ep.forwardUrl}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => void handleToggle(ep)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                    title={ep.isActive ? "Pause" : "Activate"}
                  >
                    {ep.isActive ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="4" y="3" width="2.5" height="10" rx="0.5" />
                        <rect x="9.5" y="3" width="2.5" height="10" rx="0.5" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M5 3l8 5-8 5V3z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(ep)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void handleDelete(ep.id)}
                    disabled={deletingId === ep.id}
                    className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === ep.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M3 5h10M5 5v8a1 1 0 001 1h4a1 1 0 001-1V5M7 3h2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-bg-secondary border border-border-primary rounded-2xl shadow-2xl">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-base font-semibold text-text-primary">
                {modalMode === "create" ? "New Endpoint" : "Edit Endpoint"}
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                {modalMode === "create"
                  ? "Configure how webhooks from a provider are handled"
                  : "Update endpoint configuration"}
              </p>
            </div>

            {error && (
              <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-bg-error text-text-error text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="px-6 pb-6 space-y-4"
            >
              <Input
                label="Name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Paystack Production"
                required
              />
              <Select
                label="Provider"
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, provider: e.target.value }))
                }
                options={providerOptions}
              />
              <Input
                label="Forward URL"
                type="url"
                value={form.forwardUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, forwardUrl: e.target.value }))
                }
                placeholder="https://your-api.com/webhooks"
              />
              {modalMode === "create" && (
                <Input
                  label="Webhook Secret"
                  type="password"
                  value={form.webhookSecret}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, webhookSecret: e.target.value }))
                  }
                  placeholder="Provider's webhook signing secret"
                />
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={submitting} className="flex-1">
                  {modalMode === "create" ? "Create" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ProviderTag({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    paystack: "text-emerald-600 bg-emerald-500/10",
    flutterwave: "text-orange-600 bg-orange-500/10",
    mono: "text-blue-600 bg-blue-500/10",
    custom: "text-text-tertiary bg-bg-tertiary",
  };

  return (
    <span
      className={`text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded ${colors[provider] || colors.custom}`}
    >
      {provider}
    </span>
  );
}
