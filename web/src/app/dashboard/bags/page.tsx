"use client";

import { useEffect, useState, useCallback } from "react";
import { bags as bagsApi, BagsStatus, BagsEventStats } from "@/lib/api";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { useFadeIn } from "@/hooks/use-gsap";

export default function BagsPage() {
  const [status, setStatus] = useState<BagsStatus | null>(null);
  const [eventStats, setEventStats] = useState<BagsEventStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const contentRef = useFadeIn<HTMLDivElement>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, e] = await Promise.all([
        bagsApi.status(),
        bagsApi.eventStats().catch(() => null),
      ]);
      setStatus(s);
      setEventStats(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bags data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const st = status?.stats;

  return (
    <div ref={contentRef} className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-purple-500">
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" />
              <circle cx="8" cy="8" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-text-primary">Bags Restream</h1>
            <p className="text-xs text-text-tertiary">Solana token launchpad bridge</p>
          </div>
        </div>

        {status && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {status.connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${status.connected ? "bg-emerald-500" : "bg-red-500"}`} />
            </span>
            <span className={`text-xs font-medium ${status.connected ? "text-emerald-500" : "text-red-500"}`}>
              {status.connected ? "Connected" : status.enabled ? "Disconnected" : "Disabled"}
            </span>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-sm text-text-error">{error}</p>
          <button onClick={fetchData} className="text-xs text-text-accent hover:underline cursor-pointer">
            Retry
          </button>
        </div>
      ) : loading && !status ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
        </div>
      ) : status && st ? (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <StatCard label="Events Received" value={st.totalEventsReceived.toLocaleString()} />
            <StatCard label="Forwarded" value={st.totalEventsForwarded.toLocaleString()} />
            <StatCard label="Filtered" value={st.totalEventsFiltered.toLocaleString()} />
            <StatCard label="Launches Detected" value={st.launchesDetected.toLocaleString()} />
            <StatCard
              label="Forward Rate"
              value={
                st.totalEventsReceived > 0
                  ? `${((st.totalEventsForwarded / st.totalEventsReceived) * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent tokens */}
            <Card padding={false} className="col-span-1 lg:col-span-2">
              <div className="p-5 pb-0">
                <CardHeader
                  title="Recent Token Launches"
                  description={`${st.recentTokens.length} most recent tokens detected`}
                />
              </div>
              {st.recentTokens.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-text-tertiary">
                  No token launches detected yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border-primary">
                        <th className="px-5 py-2.5 text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Token</th>
                        <th className="px-5 py-2.5 text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Symbol</th>
                        <th className="px-5 py-2.5 text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Mint</th>
                        <th className="px-5 py-2.5 text-[10px] uppercase tracking-widest text-text-tertiary font-medium">Creator</th>
                        <th className="px-5 py-2.5 text-[10px] uppercase tracking-widest text-text-tertiary font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.recentTokens.map((t, i) => (
                        <tr key={t.mint + i} className="border-b border-border-primary last:border-0 hover:bg-bg-hover transition-colors">
                          <td className="px-5 py-3 text-[13px] text-text-primary font-medium">{t.name}</td>
                          <td className="px-5 py-3">
                            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                              ${t.symbol}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[12px] font-mono text-text-secondary">
                            {t.mint.slice(0, 8)}...{t.mint.slice(-4)}
                          </td>
                          <td className="px-5 py-3 text-[12px] font-mono text-text-secondary">
                            {t.creator.slice(0, 8)}...{t.creator.slice(-4)}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-text-tertiary text-right whitespace-nowrap">
                            {new Date(t.receivedAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Event type breakdown */}
            {eventStats && (
              <Card>
                <CardHeader
                  title="Event Breakdown"
                  description={`${eventStats.total} total events`}
                  action={
                    <span className="text-xs text-text-tertiary">
                      Last 24h: {eventStats.last24h.toLocaleString()}
                    </span>
                  }
                />
                {eventStats.byEventType.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-text-tertiary">
                    No events recorded yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eventStats.byEventType.map(({ eventType, count }) => {
                      const pct = eventStats.total > 0 ? (count / eventStats.total) * 100 : 0;
                      return (
                        <div key={eventType}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-mono text-text-secondary">{eventType}</span>
                            <span className="text-[12px] font-mono text-text-tertiary tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-purple-500 transition-all duration-500"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Connection info */}
            <Card>
              <CardHeader title="Connection Details" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-text-tertiary">Protocol</span>
                  <span className="text-[12px] font-mono text-text-secondary">WebSocket (Restream)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-text-tertiary">Endpoint</span>
                  <span className="text-[12px] font-mono text-text-secondary">wss://restream.bags.fm/ws</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-text-tertiary">Topic</span>
                  <span className="text-[12px] font-mono text-text-secondary">launchpad_launch</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-text-tertiary">Subject</span>
                  <span className="text-[12px] font-mono text-text-secondary">BAGS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-text-tertiary">Signature</span>
                  <span className="text-[12px] font-mono text-text-secondary">HMAC-SHA256</span>
                </div>
                {status && !status.connected && status.reconnectAttempts > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-text-tertiary">Reconnect Attempts</span>
                    <span className="text-[12px] font-mono text-amber-500">{status.reconnectAttempts}</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
