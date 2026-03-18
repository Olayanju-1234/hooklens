"use client";

import { useEffect, useState, useCallback } from "react";
import { stats as statsApi, latency as latencyApi, Stats, LatencyStats } from "@/lib/api";
import { Card, CardHeader } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { useCountUp, useFadeIn } from "@/hooks/use-gsap";

const periods = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

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
    <>
      <div
        ref={contentRef}
        className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full"
      >
        {/* Period selector */}
        <div className="flex items-center gap-1 mb-6 p-0.5 bg-bg-tertiary rounded-lg w-fit">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer
                ${
                  period === p.value
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-sm text-text-error">{error}</p>
            <button
              onClick={() => fetchStats(period)}
              className="text-xs text-text-accent hover:underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Top stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <AnimatedStatCard label="Total Events" value={data.total} />
              <AnimatedStatCard
                label="Forwarded"
                value={data.forwarded}
                sub={
                  data.total > 0 ? `${data.successRate.toFixed(1)}%` : undefined
                }
              />
              <AnimatedStatCard label="Failed" value={data.failed} />
              <AnimatedStatCard
                label="Avg Latency"
                value={data.avgLatencyMs ? Math.round(data.avgLatencyMs) : 0}
                suffix="ms"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* By Event Type */}
              <Card>
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  By Event Type
                </h3>
                {data.byEventType.length === 0 ? (
                  <p className="text-xs text-text-tertiary py-4 text-center">
                    No data yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.byEventType.slice(0, 8).map((item) => {
                      const pct =
                        data.total > 0 ? (item.count / data.total) * 100 : 0;
                      return (
                        <div key={item.eventType}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-text-secondary truncate max-w-[70%]">
                              {item.eventType || "unknown"}
                            </span>
                            <span className="text-xs font-mono text-text-tertiary tabular-nums">
                              {item.count}
                            </span>
                          </div>
                          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-bg-accent rounded-full"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                transition:
                                  "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* By Provider */}
              <Card>
                <h3 className="text-sm font-semibold text-text-primary mb-4">
                  By Provider
                </h3>
                {data.byProvider.length === 0 ? (
                  <p className="text-xs text-text-tertiary py-4 text-center">
                    No data yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.byProvider.map((item) => {
                      const pct =
                        data.total > 0 ? (item.count / data.total) * 100 : 0;
                      return (
                        <div key={item.provider}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: providerColor(item.provider),
                                }}
                              />
                              <span className="text-xs font-medium text-text-secondary capitalize">
                                {item.provider || "unknown"}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-text-tertiary tabular-nums">
                              {item.count} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                backgroundColor: providerColor(item.provider),
                                transition:
                                  "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Delivery breakdown */}
            <Card>
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                Delivery Breakdown
              </h3>
              <div className="flex items-center gap-0.5 h-5 rounded-full overflow-hidden bg-bg-tertiary">
                {data.total > 0 ? (
                  <>
                    {data.forwarded > 0 && (
                      <div
                        className="h-full bg-emerald-500 first:rounded-l-full"
                        style={{
                          width: `${(data.forwarded / data.total) * 100}%`,
                          transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                    )}
                    {data.failed > 0 && (
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width: `${(data.failed / data.total) * 100}%`,
                          transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                    )}
                    {data.skipped > 0 && (
                      <div
                        className="h-full bg-amber-500 last:rounded-r-full"
                        style={{
                          width: `${(data.skipped / data.total) * 100}%`,
                          transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-3">
                <LegendItem
                  color="bg-emerald-500"
                  label="Forwarded"
                  value={data.forwarded}
                />
                <LegendItem
                  color="bg-red-500"
                  label="Failed"
                  value={data.failed}
                />
                <LegendItem
                  color="bg-amber-500"
                  label="Skipped"
                  value={data.skipped}
                />
              </div>
            </Card>

            {/* Latency Percentiles */}
            {latencyData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <AnimatedStatCard
                    label="p50 Latency"
                    value={latencyData.p50 ? Math.round(latencyData.p50) : 0}
                    suffix="ms"
                  />
                  <AnimatedStatCard
                    label="p95 Latency"
                    value={latencyData.p95 ? Math.round(latencyData.p95) : 0}
                    suffix="ms"
                  />
                  <AnimatedStatCard
                    label="p99 Latency"
                    value={latencyData.p99 ? Math.round(latencyData.p99) : 0}
                    suffix="ms"
                  />
                </div>

                {latencyData.timeSeries.length > 1 && (
                  <Card>
                    <CardHeader
                      title="Latency Over Time"
                      description="p50 / p95 / p99 percentiles"
                    />
                    <div className="space-y-4">
                      <div className="flex items-center gap-1.5">
                        <Sparkline
                          data={latencyData.timeSeries.map((t) => t.p50)}
                          width={600}
                          height={40}
                          color="var(--bg-accent)"
                          className="w-full"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Sparkline
                          data={latencyData.timeSeries.map((t) => t.p95)}
                          width={600}
                          height={40}
                          color="#F59E0B"
                          className="w-full"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Sparkline
                          data={latencyData.timeSeries.map((t) => t.p99)}
                          width={600}
                          height={40}
                          color="#EF4444"
                          className="w-full"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                        <LegendItem color="bg-blue-500" label="p50" value={latencyData.p50 ? Math.round(latencyData.p50) : 0} />
                        <LegendItem color="bg-amber-500" label="p95" value={latencyData.p95 ? Math.round(latencyData.p95) : 0} />
                        <LegendItem color="bg-red-500" label="p99" value={latencyData.p99 ? Math.round(latencyData.p99) : 0} />
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function AnimatedStatCard({
  label,
  value,
  sub,
  suffix,
}: {
  label: string;
  value: number;
  sub?: string;
  suffix?: string;
}) {
  const countRef = useCountUp(value);

  return (
    <div className="px-4 py-4 rounded-xl bg-bg-secondary border border-border-primary">
      <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium">
        {label}
      </p>
      <p className="text-2xl font-semibold text-text-primary mt-1.5 font-mono tabular-nums">
        <span ref={countRef}>0</span>
        {suffix && (
          <span className="text-sm text-text-tertiary ml-0.5">{suffix}</span>
        )}
      </p>
      {sub && (
        <p className="text-xs text-text-accent mt-1 font-medium">{sub}</p>
      )}
    </div>
  );
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-mono text-text-tertiary tabular-nums">
        {value}
      </span>
    </div>
  );
}

function providerColor(provider: string): string {
  const map: Record<string, string> = {
    paystack: "#00C853",
    flutterwave: "#F5A623",
    mono: "#3B82F6",
  };
  return map[provider] || "#94A3B8";
}
