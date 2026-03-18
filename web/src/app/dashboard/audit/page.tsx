"use client";

import { useState, useEffect } from "react";
import { auditLogs, AuditLogEntry } from "@/lib/api";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditLogs
      .list(50)
      .then((res) => {
        setLogs(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Audit Log</h1>
          <p className="text-sm text-text-secondary mt-1">
            {total} total events
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary">
          No audit events yet.
        </div>
      ) : (
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
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border-primary last:border-b-0 hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-2.5 text-text-tertiary font-mono text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-text-primary font-medium">
                    {log.action}
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
      )}
    </div>
  );
}
