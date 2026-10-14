"use client";

import { useEffect, useState, useCallback } from "react";
import { stats as statsApi, latency as latencyApi, Stats, LatencyStats } from "@/lib/api";
import { Sparkline } from "@/components/ui/sparkline";
import { useCountUp, useFadeIn } from "@/hooks/use-gsap";

const periods = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

// Colour is reserved for delivery state, so providers share one ink.
function providerColor(p: string) {
  return p ? "var(--ink-2)" : "var(--ink-3)";
}

export default function StatsPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [latencyData, setLatencyData] = useState<LatencyStats | null>(null);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const contentRef = useFadeIn<HTMLDivElement>();

  const fetchStats = useCallback(async (p: string) => {
    setLoading(true);
    setError("");
    try {
      const [result, latResult] = await Promise.all([
        statsApi.get(p),
        latencyApi.get(p).catch(() => null),
      ]);
      setData(result);
      setLatencyData(latResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats(period);
  }, [period, fetchStats]);

  return (
    <div ref={contentRef} className="px-4 sm:px-6 py-6 mx-auto max-w-5xl w-full">
      {/* Period selector */}
      <div className="flex items-center gap-0 border border-border-primary rounded-lg overflow-hidden w-fit mb-8">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 text-[12px] font-medium transition-all cursor-pointer border-r border-border-primary last:border-r-0
              ${period === p.value
                ? "bg-bg-hover text-text-primary"
                : "bg-bg-secondary text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
              }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-sm text-text-error">{error}</p>
          <button onClick={() => fetchStats(period)} className="text-xs text-text-accent hover:underline cursor-pointer">Retry</button>
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-10">

          {/* Primary numbers — no borders, pure typography */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-border-primary border border-border-primary rounded-xl overflow-hidden">
            <BigStat label="Total Events" value={data.total} />
            <BigStat label="Forwarded" value={data.forwarded} sub={data.total > 0 ? `${data.successRate.toFixed(1)}% rate` : undefined} accent />
            <BigStat label="Failed" value={data.failed} warn={data.failed > 0} />
            <BigStat label="Avg Latency" value={data.avgLatencyMs ? Math.round(data.avgLatencyMs) : 0} suffix="ms" />
          </div>

          {/* Delivery bar */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-text-tertiary">Delivery</h3>
              {data.total > 0 && (
                <span className="text-[11px] font-mono text-text-tertiary tabular-nums">{data.total} total</span>
              )}
            </div>
            <div className="flex items-center gap-0.5 h-2 rounded-full overflow-hidden bg-bg-tertiary">
              {data.total > 0 ? (
                <>
                  {data.forwarded > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${(data.forwarded / data.total) * 100}%`, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                  )}
                  {data.failed > 0 && (
                    <div className="h-full bg-red-500" style={{ width: `${(data.failed / data.total) * 100}%`, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                  )}
                  {data.skipped > 0 && (
                    <div className="h-full bg-amber-500" style={{ width: `${(data.skipped / data.total) * 100}%`, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                  )}
                </>
              ) : <div className="h-full w-full" />}
            </div>
            <div className="flex flex-wrap items-center gap-5 mt-3">
              <LegendItem color="bg-emerald-500" label="Forwarded" value={data.forwarded} />
              <LegendItem color="bg-red-500" label="Failed" value={data.failed} />
              <LegendItem color="bg-amber-500" label="Skipped" value={data.skipped} />
            </div>
          </section>

          {/* Event type + provider side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-text-tertiary mb-4">By Event Type</h3>
              {data.byEventType.length === 0 ? (
                <p className="text-xs text-text-tertiary py-4">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.byEventType.slice(0, 8).map((item) => {
                    const pct = data.total > 0 ? (item.count / data.total) * 100 : 0;
                    return (
                      <div key={item.eventType}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-mono text-text-secondary truncate max-w-[65%]">{item.eventType || "unknown"}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-text-tertiary">{pct.toFixed(0)}%</span>
                            <span className="text-[12px] font-mono text-text-primary tabular-nums w-10 text-right">{item.count}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                          <div className="h-full bg-bg-accent rounded-full" style={{ width: `${Math.max(pct, 1)}%`, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-text-tertiary mb-4">By Provider</h3>
              {data.byProvider.length === 0 ? (
                <p className="text-xs text-text-tertiary py-4">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.byProvider.map((item) => {
                    const pct = data.total > 0 ? (item.count / data.total) * 100 : 0;
                    const col = providerColor(item.provider);
                    return (
                      <div key={item.provider}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: col }} />
                            <span className="text-[12px] font-medium text-text-secondary capitalize">{item.provider || "unknown"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-text-tertiary">{pct.toFixed(0)}%</span>
                            <span className="text-[12px] font-mono text-text-primary tabular-nums w-10 text-right">{item.count}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: col, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Latency */}
          {latencyData && (
            <section>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-text-tertiary mb-4">Latency Percentiles</h3>
              <div className="grid grid-cols-3 gap-0 divide-x divide-border-primary border border-border-primary rounded-xl overflow-hidden mb-6">
                <BigStat label="p50" value={latencyData.p50 ? Math.round(latencyData.p50) : 0} suffix="ms" />
                <BigStat label="p95" value={latencyData.p95 ? Math.round(latencyData.p95) : 0} suffix="ms" warn={(latencyData.p95 ?? 0) > 1000} />
                <BigStat label="p99" value={latencyData.p99 ? Math.round(latencyData.p99) : 0} suffix="ms" warn={(latencyData.p99 ?? 0) > 2000} />
              </div>

              {latencyData.timeSeries.length > 1 && (
                <div className="space-y-5">
                  {[
                    { key: "p50" as const, label: "p50", color: "var(--bg-accent)" },
                    { key: "p95" as const, label: "p95", color: "var(--s-hold)" },
                    { key: "p99" as const, label: "p99", color: "var(--s-bad)" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="flex items-center gap-4">
                      <span className="text-[10px] font-mono text-text-tertiary w-6 shrink-0">{label}</span>
                      <div className="flex-1">
                        <Sparkline
                          data={latencyData.timeSeries.map((t) => t[key])}
                          width={600}
                          height={36}
                          color={color}
                          fill
                          className="w-full"
                        />
                      </div>
                      <span className="text-[11px] font-mono text-text-tertiary tabular-nums w-14 text-right shrink-0">
                        {latencyData[key] ? `${Math.round(latencyData[key]!)}ms` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  suffix,
  accent,
  warn,
}: {
  label: string;
  value: number;
  sub?: string;
  suffix?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  const countRef = useCountUp(value);

  return (
    <div className="px-5 py-5 bg-bg-secondary">
      <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-2">{label}</p>
      <p className={`text-[28px] font-semibold font-mono tabular-nums leading-none ${accent ? "text-emerald-400" : warn ? "text-red-400" : "text-text-primary"}`}>
        <span ref={countRef}>0</span>
        {suffix && <span className="text-[14px] text-text-tertiary ml-1 font-sans">{suffix}</span>}
      </p>
      {sub && <p className="text-[11px] text-text-tertiary mt-1.5">{sub}</p>}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="text-[12px] font-mono text-text-tertiary tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
