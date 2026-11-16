"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ApiError,
  CHAOS_CHANGED_EVENT,
  chaos as chaosApi,
  endpoints as endpointsApi,
  type ChaosRun,
  type ChaosRunSummary,
  type ChaosScenario,
  type ChaosTarget,
  type Endpoint,
} from "@/lib/api";
import { useWebSocket, type SocketMessage } from "@/hooks/use-websocket";
import { ChaosSettingsForm } from "@/components/chaos/chaos-settings-form";
import { RunTimeline } from "@/components/chaos/run-timeline";
import { secs } from "@/components/chaos/chaos-format";

// The socket pushes every delivery; this poll only covers members who aren't the route owner
const RUN_POLL_MS = 8000;

export default function ChaosPage() {
  const { subscribe } = useWebSocket();
  const [routes, setRoutes] = useState<Endpoint[]>([]);
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [routeId, setRouteId] = useState("");
  const [targets, setTargets] = useState<ChaosTarget[]>([]);
  const [targetKey, setTargetKey] = useState("");
  const [runs, setRuns] = useState<ChaosRunSummary[]>([]);
  const [run, setRun] = useState<ChaosRun | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([endpointsApi.list(), chaosApi.scenarios()])
      .then(([eps, list]) => {
        if (cancelled) return;
        setRoutes(eps);
        setScenarios(list);
        const wanted = new URLSearchParams(window.location.search).get("route");
        setRouteId(eps.find((e) => e.id === wanted)?.id ?? eps[0]?.id ?? "");
      })
      .catch((err: unknown) => !cancelled && setFetchError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    Promise.all([chaosApi.targets(routeId), chaosApi.runs(routeId)])
      .then(([list, recent]) => {
        if (cancelled) return;
        setTargets(list);
        setTargetKey((prev) => (list.some((t) => t.target === prev) ? prev : list[0]?.target ?? ""));
        setRuns(recent);
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : "Failed to load this route"));
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // The banner and the settings form both announce changes; keep this page's targets in step
  useEffect(() => {
    if (!routeId) return;
    const reload = () => {
      chaosApi
        .targets(routeId)
        .then(setTargets)
        .catch(() => {
          // The next route change or reload will try again
        });
    };
    window.addEventListener(CHAOS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(CHAOS_CHANGED_EVENT, reload);
  }, [routeId]);

  const refreshRun = useCallback(async (id: string) => {
    try {
      setRun(await chaosApi.getRun(id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load the run");
    }
  }, []);

  const runId = run?.id;
  const runDone = run?.complete ?? true;
  useEffect(() => {
    if (!runId || runDone) return;
    let debounce: number | undefined;
    const unsubscribe = subscribe((m: SocketMessage) => {
      if (m.kind !== "chaos_delivery" || m.delivery.runId !== runId) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refreshRun(runId), 600);
    });
    const poll = window.setInterval(() => void refreshRun(runId), RUN_POLL_MS);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.clearTimeout(debounce);
    };
  }, [runId, runDone, subscribe, refreshRun]);

  async function start(scenario: ChaosScenario) {
    if (!routeId || !targetKey) return;
    setStarting(scenario.id);
    try {
      const started = await chaosApi.run(scenario.id, routeId, targetKey);
      setRun(started);
      setRuns((prev) => [
        { id: started.id, scenarioId: started.scenarioId, title: started.title, target: started.target, createdAt: started.createdAt },
        ...prev,
      ]);
      document.getElementById("chaos-run")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the scenario");
    } finally {
      setStarting(null);
    }
  }

  const route = routes.find((r) => r.id === routeId);
  const target = targets.find((t) => t.target === targetKey);
  const activeTargets = useMemo(() => targets.filter((t) => t.chaos?.active).length, [targets]);

  return (
    <div className="fd-root fd-page chaos">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>Chaos</h1>
          <span className="label-sm hide-sm">duplicates · delays · reordering · stale replays</span>
        </div>
        <span className="grow" />
        {routes.length > 0 && (
          <>
            <label className="fd-mini">
              <span>route</span>
              <select className="fd-input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fd-mini">
              <span>target</span>
              <select className="fd-input" value={targetKey} onChange={(e) => setTargetKey(e.target.value)} disabled={targets.length === 0}>
                {targets.map((t) => (
                  <option key={t.target} value={t.target}>
                    {t.label}
                    {t.chaos?.active ? " · chaos on" : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="page-body page-body--wide">
        {fetchError ? (
          <p className="board-empty tone-red">{fetchError}</p>
        ) : loading ? (
          <p className="board-empty">Loading…</p>
        ) : routes.length === 0 ? (
          <div className="empty-deck">
            <h2>No routes yet</h2>
            <p>Chaos mode sends to a route&apos;s destinations. Create a route that forwards to your handler first.</p>
            <Link href="/dashboard/endpoints" className="btn tower-cta">
              Create a route
            </Link>
          </div>
        ) : (
          <>
            <p className="chaos-lede">
              Does your webhook handler survive the same event twice, a late event, events out of order, or a replay with an old timestamp?
              Run a scenario against your own handler, then check what it did.
            </p>
            {targets.length === 0 && (
              <p className="form-error">
                {route?.name ?? "This route"} has no destination or forward URL, so there is nothing to send to.{" "}
                <Link href={`/dashboard/endpoints#route-${routeId}`} className="fd-link">
                  Add one in Routes
                </Link>
                .
              </p>
            )}

            <div className="chaos-layout">
              <div className="chaos-main">
                <section className="panel" aria-label="Scenarios">
                  <div className="pane-head">
                    <h2>Scenarios</h2>
                    <span className="hide-sm">built from the test-payload templates</span>
                  </div>
                  <div className="chaos-scenarios">
                    {scenarios.map((s) => {
                      const mismatch = route && route.provider !== "custom" && route.provider !== s.provider;
                      return (
                        <article key={s.id} className="scenario-card" data-selected={run?.scenarioId === s.id || undefined}>
                          <div className="scenario-top">
                            <span className="label-sm">{s.provider}</span>
                            <span className="label-sm">
                              {s.expectedDeliveries} deliveries · about {secs(s.longestHoldMs + 5000)}
                            </span>
                          </div>
                          <h3>{s.title}</h3>
                          <p>{s.summary}</p>
                          <ol className="scenario-steps">
                            {s.steps.map((step, i) => (
                              <li key={i}>
                                <b>{step.eventType}</b> {step.note}
                              </li>
                            ))}
                          </ol>
                          {mismatch && <small className="fault-note">This route expects {route.provider} events; the handler gets {s.provider}-shaped bodies.</small>}
                          <button type="button" className="chip" data-tone="magenta" onClick={() => void start(s)} disabled={!targetKey || starting !== null}>
                            {starting === s.id ? "Starting…" : `Run on ${target?.label ?? "target"}`}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <section className="panel" aria-label="Run" id="chaos-run">
                  <div className="pane-head">
                    <h2>Run</h2>
                    <span className="hide-sm">every delivery, as it lands</span>
                  </div>
                  {run ? (
                    <RunTimeline key={run.id} run={run} />
                  ) : (
                    <p className="board-empty">Pick a scenario. Each delivery shows up here as it lands, with what your handler answered.</p>
                  )}
                </section>
              </div>

              <aside className="chaos-side">
                <section className="panel" aria-label="Chaos settings">
                  <div className="pane-head">
                    <h2>Chaos on this target</h2>
                    <span className="grow" />
                    {activeTargets > 0 && <span className="tone-amber">{activeTargets} on</span>}
                  </div>
                  {target ? (
                    <ChaosSettingsForm
                      endpointId={routeId}
                      target={target}
                      onSaved={(setting) => setTargets((prev) => prev.map((t) => (t.target === target.target ? { ...t, chaos: setting } : t)))}
                    />
                  ) : (
                    <p className="board-empty">Pick a target to set chaos for every test payload sent to it.</p>
                  )}
                </section>

                <section className="panel" aria-label="Recent runs">
                  <div className="pane-head">
                    <h2>Recent runs</h2>
                  </div>
                  {runs.length === 0 ? (
                    <p className="board-empty">No runs on this route yet.</p>
                  ) : (
                    <ul className="run-list">
                      {runs.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => void refreshRun(r.id)} data-selected={run?.id === r.id || undefined}>
                            <span>{r.title}</span>
                            <span className="label-sm">
                              {targets.find((t) => t.target === r.target)?.label ?? r.target} · {new Date(r.createdAt).toLocaleString()}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
