"use client";

import { useState } from "react";
import type { Sim } from "./use-sim";
import { REWIND_WINDOW, type ClockMode } from "./sim/clock";
import { DESTINATIONS } from "./sim/catalog";

const BINS = 60;

interface Props {
  sim: Sim;
  offset: number;
  mode: ClockMode;
}

function fmt(offset: number) {
  const s = Math.abs(offset);
  const m = Math.floor(s / 60);
  return `−${m}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/** The flight recorder: last two minutes of traffic, scrubbable. Native range input = keyboard support for free. */
export function RecorderBar({ sim, offset, mode }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? offset;
  const live = sim.clock.live;

  const t0 = live - REWIND_WINDOW;
  const bars = sim.world.histogram(t0, live, BINS);
  const max = Math.max(4, ...bars);
  const outages = DESTINATIONS.flatMap((d) =>
    sim.world
      .outageWindows(d.id, live)
      .filter(([, b]) => b > t0)
      .map(([a, b]) => [Math.max(a, t0) - t0, b - t0] as [number, number]),
  );
  const replays = sim.world
    .getActions()
    .filter((a) => (a.type === "replay-dead" || a.type === "replay-event") && a.t > t0)
    .map((a) => a.t - t0);

  const rewound = value < -0.05;
  const pct = ((value + REWIND_WINDOW) / REWIND_WINDOW) * 100;

  const commit = () => {
    sim.clock.release();
    setDrag(null);
  };

  return (
    <div className="recorder" data-rewound={rewound || undefined}>
      <div className="recorder-head">
        <span className="recorder-title">
          <span className="recorder-dot" aria-hidden />
          REC
        </span>
        <span className="recorder-time" aria-live="off">
          {rewound ? `${fmt(value)} · ${mode === "scrubbing" ? "SCRUBBING" : mode === "catchup" ? "CATCHING UP" : "REWOUND"}` : "LIVE"}
        </span>
        <button
          type="button"
          className="chip chip--quiet"
          onClick={() => sim.clock.step(-10)}
          aria-label="Rewind ten seconds"
        >
          −10s
        </button>
        <button
          type="button"
          className="chip"
          data-tone={rewound ? "magenta" : undefined}
          onClick={() => {
            setDrag(null);
            sim.clock.goLive();
          }}
          disabled={!rewound}
        >
          Live
        </button>
      </div>
      <div className="recorder-track">
        <svg className="recorder-hist" viewBox={`0 0 ${REWIND_WINDOW} 20`} preserveAspectRatio="none" aria-hidden>
          {outages.map(([a, b], i) => (
            <rect key={`o${i}`} x={a} width={Math.max(0.3, b - a)} y={0} height={20} className="recorder-outage" />
          ))}
          {bars.map((v, i) => {
            const w = REWIND_WINDOW / BINS;
            const h = (v / max) * 18;
            return <rect key={i} x={i * w + 0.15} width={w - 0.3} y={20 - h} height={h} className="recorder-bar" />;
          })}
          {replays.map((x, i) => (
            <rect key={`r${i}`} x={x - 0.2} width={0.4} y={0} height={20} className="recorder-replay" />
          ))}
        </svg>
        <div className="recorder-playhead" style={{ left: `calc(12px + (100% - 24px) * ${pct / 100})` }} aria-hidden />
        <input
          type="range"
          className="recorder-range"
          min={-REWIND_WINDOW}
          max={0}
          step={0.1}
          value={value}
          aria-label="Recorder position, seconds before live"
          aria-valuetext={rewound ? `${Math.abs(value).toFixed(1)} seconds ago` : "Live"}
          onChange={(e) => {
            const v = Number(e.target.value);
            setDrag(v);
            sim.clock.scrubTo(sim.clock.live + v);
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={() => setDrag(null)}
        />
        <div className="recorder-scale" aria-hidden>
          <span>−2:00</span>
          <span>−1:00</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}
