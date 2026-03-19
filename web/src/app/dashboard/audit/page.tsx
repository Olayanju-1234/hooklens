"use client";

import { useState, useEffect, useCallback } from "react";
import { auditLogs, AuditLogEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const PAGE_SIZE = 25;

const actionFilters = [
  { value: "", label: "All" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditLogs.list(PAGE_SIZE, page * PAGE_SIZE);
      setLogs(res.items);
      setTotal(res.total);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filtered = actionFilter
    ? logs.filter((l) => l.action.toLowerCase().includes(actionFilter))
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Audit Log</h1>
          <p className="text-sm text-text-secondary mt-1">
            {total} total events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-bg-tertiary rounded-lg">
            {actionFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setActionFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
                  ${
                    actionFilter === f.value
                      ? "bg-bg-secondary text-text-primary shadow-sm"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={fetchLogs}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 7a6 6 0 0111.5-2.5M13 7a6 6 0 01-11.5 2.5" />
              <path d="M12.5 1v3.5H9M1.5 13V9.5H5" />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-bg-secondary animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No audit events"
          description={
            actionFilter
              ? "No events match the selected filter"
              : "Audit events will appear here as actions are performed"
          }
        />
      ) : (
        <>
          <div className="border border-border-primary rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-secondary border-b border-border-primary">
                  <th className="text-left px-4 py-2.5 text-text-secondary font-medium">
                    Time
                  </th>
                  <th className="text-left px-4 py-2.5 text-text-secondary font-medium">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 text-text-secondary font-medium">
                    Resource
                  </th>
                  <th className="text-left px-4 py-2.5 text-text-secondary font-medium hidden sm:table-cell">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border-primary last:border-b-0 hover:bg-bg-hover transition-colors"
                  >
                    <td className="px-4 py-2.5 text-text-tertiary font-mono text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          log.action.toLowerCase().includes("delete")
                            ? "bg-red-500/10 text-red-400"
                            : log.action.toLowerCase().includes("create")
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {log.resource}
                      {log.resourceId && (
                        <span className="text-text-tertiary ml-1 font-mono text-xs">
                          {log.resourceId.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-tertiary font-mono text-xs hidden sm:table-cell">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-text-tertiary">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
