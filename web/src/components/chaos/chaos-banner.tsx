"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ApiError, CHAOS_CHANGED_EVENT, chaos as chaosApi, type ActiveChaos } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { clock, faultSummary } from "./chaos-format";

const POLL_MS = 60_000;

/** Stays on screen while chaos mode is on anywhere in the workspace. */
export function ChaosBanner() {
  const { currentWorkspaceId } = useAuth();
  const [active, setActive] = useState<ActiveChaos[]>([]);
  const [stopping, setStopping] = useState(false);

  const load = useCallback(() => {
    chaosApi
      .active()
      .then(setActive)
      .catch(() => {
        // The banner is a reminder; a failed check must not break the page
      });
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, POLL_MS);
    window.addEventListener(CHAOS_CHANGED_EVENT, load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(CHAOS_CHANGED_EVENT, load);
    };
  }, [load, currentWorkspaceId]);

  // Drop the banner as soon as the earliest setting expires, not at the next poll
  useEffect(() => {
    if (active.length === 0) return;
    const wait = new Date(active[0].expiresAt).getTime() - Date.now() + 1000;
    const timer = window.setTimeout(load, Math.max(wait, 1000));
    return () => window.clearTimeout(timer);
  }, [active, load]);

  async function stopAll() {
    setStopping(true);
    try {
      for (const a of active) await chaosApi.disable(a.endpointId, a.target);
      toast.success("Chaos mode is off");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not switch chaos off");
    } finally {
      setStopping(false);
      window.dispatchEvent(new Event(CHAOS_CHANGED_EVENT));
    }
  }

  if (active.length === 0) return null;
  const first = active[0];
  return (
    <div className="chaos-banner" role="status">
      <b>Chaos on</b>
      <span>
        {first.endpointName} → {first.targetLabel}
        {active.length > 1 ? ` +${active.length - 1} more` : ""}
      </span>
      <span className="chaos-banner-faults">
        {faultSummary(first.faults)} · {first.scope === "all" ? <em>all events, real traffic included</em> : "test payloads only"}
      </span>
      <span>off at {clock(first.expiresAt)}</span>
      <span className="grow" />
      <Link href="/dashboard/chaos">Manage</Link>
      <button type="button" onClick={() => void stopAll()} disabled={stopping}>
        {stopping ? "Turning off…" : "Turn off"}
      </button>
    </div>
  );
}
