"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radar } from "@/components/flight-deck/radar";
import { simRadarModel } from "@/components/flight-deck/sim-radar";
import { RecorderBar } from "@/components/flight-deck/recorder-bar";
import { Flap } from "@/components/flight-deck/split-flap";
import { HookMark } from "@/components/flight-deck/hook-mark";
import { FlightRecorder, clockTime } from "@/components/flight-deck/tower/flight-recorder";
import { createSim, useReducedMotion, useSimReadout } from "@/components/flight-deck/use-sim";
import { DESTINATIONS, SOURCE_BY_ID } from "@/components/flight-deck/sim/catalog";
import type { Status } from "@/components/flight-deck/sim/engine";

type Filter = "all" | "holding" | "dead" | "rejected";

const FILTERS: { id: Filter; label: string; tone?: string }[] = [
  { id: "all", label: "All" },
  { id: "holding", label: "Holding", tone: "amber" },
  { id: "dead", label: "Dead letters", tone: "orange" },
  { id: "rejected", label: "Rejected", tone: "red" },
];

const MATCH: Record<Filter, (s: Status) => boolean> = {
  all: () => true,
  holding: (s) => s.phase === "holding" || (s.phase === "flying" && s.attempt > 1),
  dead: (s) => s.phase === "dead" || s.phase === "partial",
  rejected: (s) => s.phase === "rejected",
};

const ROWS = 40;

export default function DemoTowerPage() {
  const reduced = useReducedMotion();
  const [sim] = useState(() => createSim(11));
  const readout = useSimReadout(sim, 4);
  const [radarModel] = useState(() => simRadarModel(sim));
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { stats, offset, mode } = readout;
  const T = sim.clock.view;
  const rewound = offset < -0.05;

  const rows = useMemo(() => {
    if (!stats) return [];
    const q = query.trim().toLowerCase();
    const pool = frozenIds
      ? frozenIds.map((id) => sim.world.find(id)).filter((e) => e !== undefined)
      : sim.world.latest(T, 400);
    const out = [];
    for (const e of pool) {
      if (e.t0 > T) continue;
      const j = sim.world.journey(e);
      const status = sim.world.statusAt(j, T);
      if (!MATCH[filter](status)) continue;
      if (q && !`${e.eventType} ${e.source} ${e.id}`.toLowerCase().includes(q)) continue;
      out.push({ e, j, status });
      if (out.length >= ROWS) break;
    }
    return out;
    // `stats` changes on every readout tick, which is the board's refresh clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, frozenIds, filter, query, sim]);

  const toggleFollow = useCallback(() => {
    setFrozenIds(follow ? rows.map((r) => r.e.id) : null);
    setFollow(!follow);
  }, [follow, rows]);

  const selectedJourney = useMemo(() => {
    if (!selected) return null;
    const e = sim.world.find(selected);
    return e ? sim.world.journey(e) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, stats, sim]);
  const selectedStatus = selectedJourney ? sim.world.statusAt(selectedJourney, T) : null;

  useEffect(() => {
    if (selected || rows.length === 0) return;
    const pick = rows.find((r) => r.status.phase === "holding") ?? rows.find((r) => r.status.phase === "delivered") ?? rows[0];
    const t = window.setTimeout(() => setSelected(pick.e.id), 0);
    return () => window.clearTimeout(t);
  }, [rows, selected]);

  const replay = useCallback(
    (eventId: string) => {
      if (sim.clock.rewound) return;
      sim.world.act("replay-event", sim.clock.live, { eventId });
    },
    [sim],
  );

  const toggleDest = useCallback(
    (id: string) => {
      if (sim.clock.rewound) return;
      const down = sim.world.isDown(id, sim.clock.live);
      sim.world.act(down ? "restore" : "outage", sim.clock.live, { dest: id });
    },
    [sim],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const el = ev.target as HTMLElement;
      if (el.closest("input, textarea, select")) {
        if (ev.key === "Escape") (el as HTMLInputElement).blur();
        return;
      }
      const idx = rows.findIndex((r) => r.e.id === selected);
      if (ev.key === "j" || ev.key === "ArrowDown") setSelected(rows[Math.min(rows.length - 1, idx + 1)]?.e.id ?? null);
      else if (ev.key === "k" || ev.key === "ArrowUp") setSelected(rows[Math.max(0, idx - 1)]?.e.id ?? null);
      else if (ev.key === "r" && selected) replay(selected);
      else if (ev.key === "f") toggleFollow();
      else if (ev.key === "/") searchRef.current?.focus();
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, replay, toggleFollow]);

  const down = stats ? DESTINATIONS.filter((d) => stats.dests[d.id]?.down).map((d) => d.host) : [];
  const billingDown = !!stats?.dests.billing?.down;

  return (
    <div className="fd-root tower">
      <header className="tower-bar">
        <Link href="/" className="fd-mark">
          <HookMark size={18} />
          hookdash
        </Link>
        <span className="tower-ws">demo · simulated traffic</span>
        <nav className="tower-tabs" aria-label="Dashboard">
          <span aria-current="page">TRAFFIC</span>
          <span>ROUTES</span>
          <span>RECORDER</span>
          <span>HEALTH</span>
          <span>SIMULATOR</span>
        </nav>
        <div className="tower-live" data-paused={!follow || rewound || undefined}>
          <i aria-hidden />
          {rewound ? `REWOUND ${Math.abs(offset).toFixed(1)}s` : follow ? "LIVE" : "BOARD PAUSED"} · {stats ? stats.perMin : "—"}/min
        </div>
        <Link href="/signup" className="btn tower-cta">
          Get an ingress URL
        </Link>
      </header>

      <div className="tower-main">
        <div className="tower-left">
          <section aria-label="Route radar">
            <div className="pane-head">
              <h2>Radar</h2>
              <span>rings = p50 latency</span>
              <span className="grow" />
              <span className="radar-legend" aria-hidden>
                <b style={{ ["--lg" as string]: "var(--t-cyan)" }}>in flight</b>
                <b style={{ ["--lg" as string]: "var(--t-green)" }}>delivered</b>
                <b style={{ ["--lg" as string]: "var(--t-amber)" }}>holding</b>
                <b style={{ ["--lg" as string]: "var(--t-orange)" }}>dead</b>
                <b style={{ ["--lg" as string]: "var(--t-magenta)" }}>selected</b>
              </span>
            </div>
            <div className="radar">
              <Radar
                model={radarModel}
                reducedMotion={reduced}
                selectedId={selected}
                onSelect={setSelected}
                onToggleDest={toggleDest}
                label={`Route radar. ${down.length ? `${down.join(", ")} down.` : "All destinations healthy."}`}
              />
              <div className="radar-sim">
                <button type="button" className="chip" data-tone="amber" aria-pressed={billingDown} onClick={() => toggleDest("billing")} disabled={rewound}>
                  {billingDown ? "Restore billing" : "Take billing down"}
                </button>
                <button type="button" className="chip" data-tone="red" onClick={() => sim.world.act("forge", sim.clock.live)} disabled={rewound}>
                  Forge
                </button>
                <button type="button" className="chip" data-tone="magenta" onClick={() => sim.world.act("replay-dead", sim.clock.live)} disabled={rewound || !stats?.dead}>
                  Replay DLQ
                </button>
              </div>
            </div>
          </section>

          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
            <RecorderBar sim={sim} offset={offset} mode={mode} />
          </div>

          <section aria-label="Arrivals board" style={{ display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0 }}>
            <div className="pane-head">
              <h2>Arrivals</h2>
              <span>{rows.length} shown</span>
            </div>
            <div className="board-tools">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="chip" data-tone={f.tone} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
              <span className="grow" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Filter  /"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                aria-label="Filter arrivals by event type, source or id"
              />
              <button type="button" className="chip" data-tone="cyan" aria-pressed={follow} onClick={toggleFollow}>
                Follow <span className="kbd">F</span>
              </button>
            </div>
            <div className="board-scroll">
              <table className="board" role="grid" aria-label="Arrivals" aria-rowcount={rows.length}>
                <thead>
                  <tr>
                    <th scope="col">TIME</th>
                    <th scope="col">EVENT</th>
                    <th scope="col">SOURCE</th>
                    <th scope="col">SEAL</th>
                    <th scope="col">ROUTE</th>
                    <th scope="col">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ e, j, status }) => {
                    const gen = j.replayStarts.filter((t) => t <= T).length;
                    const branches = j.branches.filter((b) => b.generation === gen);
                    const gated = T >= j.tGate;
                    return (
                      <tr
                        key={e.id}
                        aria-selected={selected === e.id}
                        tabIndex={0}
                        onClick={() => setSelected(e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setSelected(e.id);
                          }
                        }}
                      >
                        <td className="t-time">{clockTime(sim.epoch, e.t0)}</td>
                        <td>
                          <Flap text={e.eventType} width={26} reduced={reduced} enter />
                        </td>
                        <td className="t-src">{SOURCE_BY_ID.get(e.source)!.label.toLowerCase()}</td>
                        <td className={!gated ? "t-time" : j.rejected ? "seal-bad" : "seal-ok"}>{!gated ? "···" : j.rejected ? "✗ forged" : "✓ sealed"}</td>
                        <td>
                          <span className="deps">
                            {branches.map((b) => {
                              const m = sim.world.branchStateAt(b, T);
                              return <i key={b.dest} data-s={m?.state ?? "queued"} title={`${b.dest}: ${m?.state ?? "queued"}`} />;
                            })}
                          </span>
                        </td>
                        <td className="status" data-p={status.phase}>
                          <Flap text={status.label} width={13} reduced={reduced} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <FlightRecorder
          world={sim.world}
          journey={selectedJourney}
          status={selectedStatus}
          T={T}
          epoch={sim.epoch}
          canAct={!rewound}
          onReplay={replay}
        />
      </div>
      <div className="sr-only" aria-live="polite">
        {stats ? (down.length ? `${down.join(", ")} down. ${stats.holding} deliveries holding.` : "All destinations healthy.") : ""}
      </div>
    </div>
  );
}
