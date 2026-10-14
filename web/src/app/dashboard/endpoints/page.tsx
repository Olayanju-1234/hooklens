"use client";

import { useEffect, useState, FormEvent, type ReactNode } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { endpoints as endpointsApi, Endpoint, ApiError, INGRESS_BASE } from "@/lib/api";
import { PROVIDERS } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useStaggerIn } from "@/hooks/use-gsap";

type ModalMode = "create" | "edit";

interface EndpointForm {
  name: string;
  provider: string;
  forwardUrl: string;
  webhookSecret: string;
  retryMaxAttempts: string;
  retryBackoffMs: string;
}

const emptyForm: EndpointForm = {
  name: "",
  provider: "custom",
  forwardUrl: "",
  webhookSecret: "",
  retryMaxAttempts: "3",
  retryBackoffMs: "1000",
};

const providerStyles: Record<string, { color: string; icon: ReactNode }> = {
  stripe: {
    color: "bg-indigo-500/15 text-indigo-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 6h12M2 10h8" />
      </svg>
    ),
  },
  paystack: {
    color: "bg-emerald-500/15 text-emerald-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 8h10M5 5h6M6 11h4" />
      </svg>
    ),
  },
  flutterwave: {
    color: "bg-orange-500/15 text-orange-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 12c2-4 4-8 6-8s4 4 6 8" />
      </svg>
    ),
  },
  mono: {
    color: "bg-blue-500/15 text-blue-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4l4 8 4-8 4 8" />
      </svg>
    ),
  },
  bags: {
    color: "bg-purple-500/15 text-purple-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="5" />
        <path d="M8 5v2l2 1" />
      </svg>
    ),
  },
  github: {
    color: "bg-slate-500/15 text-slate-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="5" cy="4" r="1.5" />
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="11" cy="6" r="1.5" />
        <path d="M5 5.5v5M11 7.5c0 2-2 2.5-6 3" />
      </svg>
    ),
  },
  shopify: {
    color: "bg-lime-500/15 text-lime-500",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 5h10l-1 8H4L3 5z" />
        <path d="M6 5V4a2 2 0 0 1 4 0v1" />
      </svg>
    ),
  },
  slack: {
    color: "bg-fuchsia-500/15 text-fuchsia-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 2.5v11M10 2.5v11M2.5 6h11M2.5 10h11" />
      </svg>
    ),
  },
  linear: {
    color: "bg-sky-500/15 text-sky-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M4 9l3 3M4.5 6l5.5 5.5M6.5 4l5.5 5.5" />
      </svg>
    ),
  },
  twilio: {
    color: "bg-rose-500/15 text-rose-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="6.25" cy="6.25" r="0.75" />
        <circle cx="9.75" cy="6.25" r="0.75" />
        <circle cx="6.25" cy="9.75" r="0.75" />
        <circle cx="9.75" cy="9.75" r="0.75" />
      </svg>
    ),
  },
  clerk: {
    color: "bg-violet-500/15 text-violet-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="6" r="2.5" />
        <path d="M3 13c1-2.5 3-3.5 5-3.5s4 1 5 3.5" />
      </svg>
    ),
  },
  resend: {
    color: "bg-neutral-500/15 text-neutral-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="4" width="12" height="8" rx="1" />
        <path d="M2 5l6 4 6-4" />
      </svg>
    ),
  },
  openai: {
    color: "bg-teal-500/15 text-teal-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="5" />
        <path d="M8 3v10M3 8h10" />
      </svg>
    ),
  },
  "standard-webhooks": {
    color: "bg-cyan-500/15 text-cyan-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 8h3l2-3 2 6 2-3h3" />
        <path d="M2 12h12" />
      </svg>
    ),
  },
  custom: {
    color: "bg-zinc-500/15 text-zinc-400",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 8h2l2-4 2 8 2-4h2" />
      </svg>
    ),
  },
};

const providers = PROVIDERS.map((p) => ({ ...p, ...(providerStyles[p.value] ?? providerStyles.custom) }));

function getProvider(value: string) {
  return providers.find((p) => p.value === value) ?? providers[providers.length - 1];
}

function copyIngressUrl(url: string) {
  navigator.clipboard.writeText(url).then(
    () => toast.success("Ingress URL copied"),
    () => toast.error("Couldn't copy to clipboard"),
  );
}

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
  const [fetchError, setFetchError] = useState("");
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const listRef = useStaggerIn<HTMLDivElement>();

  async function fetchEndpoints() {
    setLoading(true);
    setFetchError("");
    try {
      const data = await endpointsApi.list();
      setItems(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load endpoints");
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
    setProviderPickerOpen(false);
    setModalOpen(true);
  }

  function openEdit(ep: Endpoint) {
    setForm({
      name: ep.name,
      provider: ep.provider,
      forwardUrl: ep.forwardUrl || "",
      webhookSecret: "",
      retryMaxAttempts: String((ep as Endpoint & { retryMaxAttempts?: number }).retryMaxAttempts ?? 3),
      retryBackoffMs: String((ep as Endpoint & { retryBackoffMs?: number }).retryBackoffMs ?? 1000),
    });
    setModalMode("edit");
    setEditingId(ep.id);
    setError("");
    setProviderPickerOpen(false);
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
          retryMaxAttempts: parseInt(form.retryMaxAttempts) || 3,
          retryBackoffMs: parseInt(form.retryBackoffMs) || 1000,
        } as Parameters<typeof endpointsApi.create>[0]);
        setItems((prev) => [created, ...prev]);
      } else if (editingId) {
        const updateData: Record<string, unknown> = {
          name: form.name,
          provider: form.provider,
          forwardUrl: form.forwardUrl || null,
          retryMaxAttempts: parseInt(form.retryMaxAttempts) || 3,
          retryBackoffMs: parseInt(form.retryBackoffMs) || 1000,
        };
        if (form.webhookSecret) updateData.webhookSecret = form.webhookSecret;
        const updated = await endpointsApi.update(editingId, updateData as Partial<Endpoint>);
        setItems((prev) => prev.map((ep) => (ep.id === editingId ? updated : ep)));
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
      toast.success("Endpoint deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete endpoint");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(ep: Endpoint) {
    try {
      const updated = await endpointsApi.update(ep.id, { isActive: !ep.isActive });
      setItems((prev) => prev.map((e) => (e.id === ep.id ? updated : e)));
      toast.success(updated.isActive ? "Endpoint activated" : "Endpoint paused");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update endpoint");
    }
  }

  return (
    <>
      <div className="px-4 sm:px-6 py-6 mx-auto max-w-4xl w-full">
        <div className="flex items-center justify-between mb-5">
          <span className="text-[12px] text-text-tertiary font-mono">
            {loading ? "—" : `${items.length} endpoint${items.length !== 1 ? "s" : ""}`}
          </span>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg bg-bg-accent text-text-inverse hover:opacity-90 transition-opacity cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
            New Endpoint
          </button>
        </div>

        {fetchError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm text-text-error">{fetchError}</p>
            <button onClick={() => void fetchEndpoints()} className="text-xs text-text-accent hover:underline cursor-pointer">Retry</button>
          </div>
        ) : items.length === 0 && !loading ? (
          <EmptyState
            icon={<svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h3l2-4 2 8 2-4h3" /></svg>}
            title="No endpoints configured"
            description="Create an endpoint to define how webhooks from different providers are verified and forwarded"
            action={<Button size="sm" onClick={openCreate}>Create your first endpoint</Button>}
          />
        ) : (
          <div ref={listRef} className="rounded-xl border border-border-primary overflow-hidden divide-y divide-border-primary">
            {items.map((ep) => {
              const prov = getProvider(ep.provider);
              const ingressUrl = ep.ingressSlug ? `${INGRESS_BASE}/in/${ep.ingressSlug}` : null;
              return (
                <div
                  key={ep.id}
                  className="group flex items-center gap-4 px-4 py-3.5 bg-bg-secondary hover:bg-bg-hover transition-colors"
                >
                  {/* Provider icon */}
                  <div className={`w-9 h-9 rounded-lg ${prov.color} flex items-center justify-center shrink-0`}>
                    {prov.icon}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-text-primary truncate">{ep.name}</span>
                      <span className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${ep.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-500"}`}>
                        {ep.isActive ? "active" : "paused"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium ${prov.color.split(" ")[1]}`}>{prov.label}</span>
                      {ep.forwardUrl && (
                        <>
                          <span className="text-text-tertiary text-[10px]">·</span>
                          <span className="text-[11px] font-mono text-text-tertiary truncate max-w-[280px]">{ep.forwardUrl}</span>
                        </>
                      )}
                    </div>
                    {ingressUrl && (
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <code className="text-[11px] font-mono text-text-accent truncate" title={ingressUrl}>
                          {ingressUrl}
                        </code>
                        <button
                          onClick={() => copyIngressUrl(ingressUrl)}
                          className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer shrink-0"
                          title="Copy ingress URL"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <rect x="5" y="5" width="8" height="8" rx="1" />
                            <path d="M3 11V4a1 1 0 011-1h7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Retry config — visible on hover only */}
                  <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <span>{(ep as Endpoint & { retryMaxAttempts?: number }).retryMaxAttempts ?? 3}×</span>
                    <span className="text-text-tertiary/50">retry</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    <Link
                      href={`/dashboard/endpoints/${ep.id}/destinations`}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title="Destinations"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M6 3h8M6 8h8M6 13h8M2 3h.01M2 8h.01M2 13h.01" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => void handleToggle(ep)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                      title={ep.isActive ? "Pause" : "Activate"}
                    >
                      {ep.isActive ? (
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
                      onClick={() => openEdit(ep)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => void handleDelete(ep.id)}
                      disabled={deletingId === ep.id}
                      className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === ep.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 5h10M5 5v8a1 1 0 001 1h4a1 1 0 001-1V5M7 3h2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md mx-4 bg-bg-secondary border border-border-primary rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border-primary">
              <h2 className="text-[14px] font-semibold text-text-primary">
                {modalMode === "create" ? "New Endpoint" : "Edit Endpoint"}
              </h2>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {modalMode === "create" ? "Configure webhook handling for a provider" : "Update endpoint configuration"}
              </p>
            </div>

            {error && (
              <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[12px]">
                {error}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Paystack Production"
                required
              />

              {/* Custom provider picker */}
              <div>
                <label className="block text-[11px] font-medium text-text-secondary mb-1.5">Provider</label>
                <button
                  type="button"
                  onClick={() => setProviderPickerOpen((o) => !o)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-tertiary border border-border-primary hover:border-border-secondary transition-colors cursor-pointer text-left"
                >
                  {(() => {
                    const prov = getProvider(form.provider);
                    return (
                      <>
                        <div className={`w-7 h-7 rounded-md ${prov.color} flex items-center justify-center shrink-0`}>
                          {prov.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text-primary">{prov.label}</p>
                          <p className="text-[10px] text-text-tertiary truncate">{prov.description}</p>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`text-text-tertiary shrink-0 transition-transform ${providerPickerOpen ? "rotate-180" : ""}`}>
                          <path d="M3 5l3 3 3-3" />
                        </svg>
                      </>
                    );
                  })()}
                </button>

                {providerPickerOpen && (
                  <div className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-border-primary divide-y divide-border-primary shadow-lg">
                    {providers.map((prov) => (
                      <button
                        key={prov.value}
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, provider: prov.value })); setProviderPickerOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer
                          ${form.provider === prov.value ? "bg-bg-hover" : "bg-bg-secondary hover:bg-bg-hover"}`}
                      >
                        <div className={`w-7 h-7 rounded-md ${prov.color} flex items-center justify-center shrink-0`}>
                          {prov.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-text-primary">{prov.label}</p>
                          <p className="text-[10px] text-text-tertiary truncate">{prov.description}</p>
                        </div>
                        {form.provider === prov.value && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-accent shrink-0">
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Input
                label="Forward URL"
                type="url"
                value={form.forwardUrl}
                onChange={(e) => setForm((f) => ({ ...f, forwardUrl: e.target.value }))}
                placeholder="https://your-api.com/webhooks"
              />
              <Input
                label={modalMode === "edit" ? "Webhook Secret (leave blank to keep)" : "Webhook Secret"}
                type="password"
                value={form.webhookSecret}
                onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                placeholder={modalMode === "edit" ? "Enter new secret to rotate" : getProvider(form.provider).secretHint}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Max Retries"
                  type="number"
                  value={form.retryMaxAttempts}
                  onChange={(e) => setForm((f) => ({ ...f, retryMaxAttempts: e.target.value }))}
                  min="0"
                  max="10"
                />
                <Input
                  label="Backoff (ms)"
                  type="number"
                  value={form.retryBackoffMs}
                  onChange={(e) => setForm((f) => ({ ...f, retryBackoffMs: e.target.value }))}
                  min="100"
                  max="60000"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
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
