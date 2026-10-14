"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { SCENARIO, World, type WorldStats } from "./sim/engine";
import { SimClock, type ClockMode } from "./sim/clock";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const param = (key: string) => new URLSearchParams(window.location.search).get(key);

/** `?motion=reduced` forces the reduced-motion path for review. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => param("motion") === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

let webglCache: boolean | null = null;
/** `?fallback=2d` forces the Canvas 2D path for review. */
function probeWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  if (param("fallback") === "2d") return (webglCache = false);
  try {
    const c = document.createElement("canvas");
    webglCache = !!c.getContext("webgl2");
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function useWebGL(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => probeWebGL(),
    () => null,
  );
}

export interface Sim {
  world: World;
  clock: SimClock;
  epoch: number;
}

export function createSim(seed = 7, frozen = false): Sim {
  const world = new World(seed);
  SCENARIO.seed(world);
  world.ensure(SCENARIO.preroll + 3);
  return { world, clock: new SimClock(SCENARIO.preroll, frozen), epoch: Date.now() - SCENARIO.preroll * 1000 };
}

export interface Readout {
  stats: WorldStats | null;
  offset: number;
  mode: ClockMode;
  frozen: boolean;
}

/** Samples stats a few times a second; the canvases render every frame on their own. */
export function useSimReadout(sim: Sim, hz = 5): Readout {
  const [readout, setReadout] = useState<Readout>({ stats: null, offset: 0, mode: "live", frozen: sim.clock.frozen });
  useEffect(() => {
    const tick = () => {
      sim.clock.tick(performance.now());
      sim.world.ensure(sim.clock.live + 2.5);
      setReadout({
        stats: sim.world.stats(sim.clock.view),
        offset: sim.clock.offset,
        mode: sim.clock.mode,
        frozen: sim.clock.frozen,
      });
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000 / hz);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [sim, hz]);
  return readout;
}
