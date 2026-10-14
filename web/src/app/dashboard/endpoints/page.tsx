"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ApiError, destinations as destinationsApi, endpoints as endpointsApi, transforms as transformsApi, type Endpoint } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EndpointForm } from "@/components/flight-deck/deck/endpoint-form";
import { RoutePipeline, type ConfirmRequest, type RouteData } from "@/components/flight-deck/deck/route-pipeline";

async function loadRoute(endpoint: Endpoint): Promise<RouteData> {
  const [destinations, rules] = await Promise.all([
    destinationsApi.list(endpoint.id).catch(() => []),
    transformsApi.list(endpoint.id).catch(() => []),
  ]);
  return { endpoint, destinations, rules };
}

export default function RoutesPage() {
  const { ingressSlug } = useAuth();
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    endpointsApi
      .list()
      .then((eps) => Promise.all(eps.map(loadRoute)))
      .then((list) => {
        if (cancelled) return;
        setRoutes(list);
        setFetchError("");
        const target = window.location.hash.replace(/^#route-/, "");
        if (target && list.some((r) => r.endpoint.id === target)) setHighlight(target);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : "Failed to load endpoints");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (highlight && !loading) document.getElementById(`route-${highlight}`)?.scrollIntoView({ block: "start" });
  }, [highlight, loading]);

  const replace = useCallback((next: RouteData) => {
    setRoutes((prev) => prev.map((r) => (r.endpoint.id === next.endpoint.id ? next : r)));
  }, []);

  async function toggle(route: RouteData) {
    const ep = route.endpoint;
    try {
      const updated = await endpointsApi.update(ep.id, { isActive: !ep.isActive });
      replace({ ...route, endpoint: updated });
      toast.success(updated.isActive ? "Endpoint activated" : "Endpoint paused");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update endpoint");
    }
  }

  function remove(route: RouteData) {
    setPending({
      title: "Delete route",
      description: `Delete "${route.endpoint.name}" with its destinations, transforms and dead letters? Its ingress URL stops accepting events.`,
      label: "Delete",
      run: async () => {
        try {
          await endpointsApi.delete(route.endpoint.id);
          setRoutes((prev) => prev.filter((r) => r.endpoint.id !== route.endpoint.id));
          toast.success("Endpoint deleted");
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "Failed to delete endpoint");
        }
      },
    });
  }

  async function runConfirm() {
    if (!pending) return;
    setConfirming(true);
    try {
      await pending.run();
    } finally {
      setConfirming(false);
      setPending(null);
    }
  }

  const live = routes.filter((r) => r.endpoint.isActive).length;
  const destCount = routes.reduce((n, r) => n + r.destinations.length, 0);

  return (
    <div className="fd-root fd-page routes">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>Routes</h1>
          <span className="label-sm">source → seal → transforms → destinations</span>
        </div>
        <span className="grow" />
        {!loading && routes.length > 0 && (
          <span className="label-sm hide-sm">
            {live}/{routes.length} live · {destCount} destination{destCount === 1 ? "" : "s"}
          </span>
        )}
        <button type="button" className="btn tower-cta" onClick={() => setCreating(true)} disabled={creating}>
          + New route
        </button>
      </div>

      <div className="page-body">
        {creating && (
          <section className="route route--form" aria-label="New route">
            <div className="route-code" aria-hidden>
              <b>NEW</b>
              <span>DRAFT</span>
            </div>
            <div className="route-body">
              <header className="route-head">
                <div className="route-title">
                  <h2>New route</h2>
                  <span className="label-sm">one ingress URL per route; add destinations once it exists</span>
                </div>
              </header>
              <EndpointForm
                onCancel={() => setCreating(false)}
                onSaved={(ep) => {
                  setRoutes((prev) => [{ endpoint: ep, destinations: [], rules: [] }, ...prev]);
                  setCreating(false);
                  setHighlight(ep.id);
                  toast.success("Route created. Add a destination to start forwarding.");
                }}
              />
            </div>
          </section>
        )}

        {fetchError ? (
          <div className="board-empty">
            <p className="tone-red">{fetchError}</p>
            <p>
              <button
                type="button"
                className="chip chip--quiet"
                onClick={() => {
                  setLoading(true);
                  setReloadKey((k) => k + 1);
                }}
              >
                Retry
              </button>
            </p>
          </div>
        ) : loading ? (
          <p className="board-empty">Loading routes…</p>
        ) : routes.length === 0 && !creating ? (
          <div className="empty-deck">
            <h2>No routes yet</h2>
            <p>A route verifies a provider&apos;s webhooks, reshapes them if you want, and fans them out to your destinations.</p>
            <button type="button" className="btn tower-cta" onClick={() => setCreating(true)}>
              Create your first route
            </button>
          </div>
        ) : (
          <div className="route-list">
            {routes.map((route) =>
              editingId === route.endpoint.id ? (
                <section key={route.endpoint.id} id={`route-${route.endpoint.id}`} className="route route--form" aria-label={`Edit ${route.endpoint.name}`}>
                  <div className="route-code" aria-hidden>
                    <b>EDIT</b>
                    <span>{route.endpoint.isActive ? "LIVE" : "PAUSED"}</span>
                  </div>
                  <div className="route-body">
                    <header className="route-head">
                      <div className="route-title">
                        <h2>{route.endpoint.name}</h2>
                        <span className="label-sm">route settings</span>
                      </div>
                    </header>
                    <EndpointForm
                      endpoint={route.endpoint}
                      onCancel={() => setEditingId(null)}
                      onSaved={(ep) => {
                        replace({ ...route, endpoint: ep });
                        setEditingId(null);
                      }}
                    />
                  </div>
                </section>
              ) : (
                <RoutePipeline
                  key={route.endpoint.id}
                  route={route}
                  ingressSlug={ingressSlug}
                  highlighted={highlight === route.endpoint.id}
                  onChange={replace}
                  onEdit={() => setEditingId(route.endpoint.id)}
                  onDelete={() => remove(route)}
                  onToggle={() => void toggle(route)}
                  confirm={setPending}
                />
              ),
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ""}
        description={pending?.description}
        confirmLabel={pending?.label}
        variant="danger"
        loading={confirming}
        onConfirm={() => void runConfirm()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
