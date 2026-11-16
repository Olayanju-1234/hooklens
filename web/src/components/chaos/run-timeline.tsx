"use client";

import { useEffect, useState } from "react";
import type { ChaosRun } from "@/lib/api";
import { kindLabel } from "./chaos-format";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const ok = (code: number | null, status: string) => status === "forwarded" && code !== null && code < 300;

export function RunTimeline({ run }: { run: ChaosRun }) {
  const now = useNow(!run.complete);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const elapsed = Math.max(0, (now - new Date(run.createdAt).getTime()) / 1000);
  const waiting = Math.max(0, run.expectedDeliveries - run.recordedDeliveries);

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <h3>{run.title}</h3>
          <span className="label-sm">
            {run.endpointName} → {run.targetLabel} · {new Date(run.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <span className="run-progress" data-done={run.complete || undefined}>
          {run.complete
            ? `${run.recordedDeliveries} of ${run.expectedDeliveries} deliveries · done`
            : `${run.recordedDeliveries} of ${run.expectedDeliveries} deliveries · +${elapsed.toFixed(0)}s`}
        </span>
      </div>

      <div className="table-scroll">
        <table className="mini-table run-table">
          <thead>
            <tr>
              <th>AT</th>
              <th>EVENT</th>
              <th>DELIVERY</th>
              <th>CODE</th>
              <th>LATENCY</th>
              <th>YOUR HANDLER SAID</th>
            </tr>
          </thead>
          <tbody>
            {run.deliveries.map((d, i) => (
              <tr key={`${d.eventId}-${d.chaosSeq}-${d.attempt}-${i}`}>
                <td className="t-num">{d.offsetMs !== null ? `+${(d.offsetMs / 1000).toFixed(1)}s` : "—"}</td>
                <td>
                  <b>{d.eventType ?? "event"}</b>
                  {d.attempt > 1 && <span className="label-sm"> retry {d.attempt - 1}</span>}
                </td>
                <td>
                  <span className="chaos-kind" data-kind={d.chaosKind ?? "real"}>
                    {kindLabel(d.chaosKind, d.chaosSeq)}
                  </span>
                </td>
                <td className="run-code t-num" data-ok={ok(d.responseCode, d.status)}>
                  {d.responseCode ?? (d.status === "failed" ? "no reply" : d.status)}
                </td>
                <td className="t-num">{d.latencyMs !== null ? `${d.latencyMs}ms` : "—"}</td>
                <td className="run-body" title={d.bodyExcerpt ?? ""}>{d.bodyExcerpt ?? ""}</td>
              </tr>
            ))}
            {!run.complete && waiting > 0 && (
              <tr className="run-waiting">
                <td colSpan={6}>
                  waiting for {waiting} more deliver{waiting === 1 ? "y" : "ies"} · {run.steps.map((s) => `${s.eventType}: ${s.note}`).join(" · ")}
                </td>
              </tr>
            )}
            {run.deliveries.length === 0 && run.complete && (
              <tr>
                <td colSpan={6}>No deliveries were recorded. Check the target URL and the route in Routes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="checklist" aria-label="What correct looks like">
        <h4>What correct looks like</h4>
        <p className="fr-note">Hookdash can&apos;t see your database, so tick these off yourself against your own records.</p>
        <ul>
          {run.checklist.map((item) => (
            <li key={item}>
              <label className="fd-check">
                <input
                  type="checkbox"
                  checked={Boolean(ticked[item])}
                  onChange={(e) => setTicked((t) => ({ ...t, [item]: e.target.checked }))}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
