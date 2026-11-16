"use client";

import { useEffect, useState } from "react";
import { ApiError, admin as adminApi, type UsageReport } from "@/lib/api";

const show = (n: number | null) => (n === null ? "unknown" : n.toLocaleString());

/** Admin only, not linked anywhere: everyone else sees "Not found". */
export default function UsagePage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .usage()
      .then(setReport)
      .catch((err: unknown) => setError(err instanceof ApiError && err.statusCode === 404 ? "Not found" : "Failed to load usage"));
  }, []);

  return (
    <div className="fd-root fd-page">
      <div className="traffic-bar">
        <div className="page-title">
          <h1>Usage</h1>
          <span className="label-sm">last {report?.windowDays ?? 30} days · admin</span>
        </div>
      </div>
      <div className="page-body">
        {error ? (
          <p className="board-empty">{error}</p>
        ) : !report ? (
          <p className="board-empty">Loading…</p>
        ) : (
          <section className="panel" aria-label="Usage">
            <table className="mini-table" style={{ margin: "8px 14px", width: "calc(100% - 28px)" }}>
              <tbody>
                <tr>
                  <td>Workspaces with at least one verified provider event</td>
                  <td className="t-num">{show(report.workspacesWithVerifiedEvents)}</td>
                </tr>
                <tr>
                  <td>Workspaces that turned chaos on</td>
                  <td className="t-num">{show(report.workspacesThatTurnedChaosOn)}</td>
                </tr>
                <tr>
                  <td>Workspaces that ran a chaos scenario</td>
                  <td className="t-num">{show(report.workspacesWithChaosRuns)}</td>
                </tr>
                <tr>
                  <td>Chaos scenario runs</td>
                  <td className="t-num">{show(report.chaosRuns)}</td>
                </tr>
                <tr>
                  <td>{report.sdk.package} downloads, last month (npm)</td>
                  <td className="t-num">{report.sdk.published === false ? "not on npm yet" : show(report.sdk.downloadsLastMonth)}</td>
                </tr>
                <tr>
                  <td>{report.github.repo} stars</td>
                  <td className="t-num">{show(report.github.stars)}</td>
                </tr>
              </tbody>
            </table>
            <p className="fr-note" style={{ padding: "0 14px 12px" }}>
              Leaves out the {report.excludedWorkspaces} workspace{report.excludedWorkspaces === 1 ? "" : "s"} admins belong to.
              Test payloads don&apos;t count as provider events. Generated {new Date(report.generatedAt).toLocaleString()}.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
