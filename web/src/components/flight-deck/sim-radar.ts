import type { RadarDest, RadarModel } from "./radar";
import type { WorldStats } from "./sim/engine";
import { DESTINATIONS, SOURCES } from "./sim/catalog";
import type { Sim } from "./use-sim";

export function simRadarModel(sim: Sim): RadarModel {
  let stats: WorldStats | null = null;
  let statsAt = -1;
  const currentStats = () => {
    const now = performance.now();
    if (!stats || now - statsAt > 250) {
      stats = sim.world.stats(sim.clock.view);
      statsAt = now;
    }
    return stats;
  };

  return {
    layoutKey: () => "sim",
    tick: () => {
      sim.clock.tick(performance.now());
      sim.world.ensure(sim.clock.live + 2.5);
    },
    time: () => sim.clock.view,
    sources: () => SOURCES,
    destinations: () => {
      const st = currentStats();
      return DESTINATIONS.map((d): RadarDest => {
        const ds = st.dests[d.id];
        const state = ds?.down ? "down" : ds && ds.holding > 0 ? "holding" : "ok";
        const detail =
          state === "down" ? "DOWN" : state === "holding" ? `HOLD ×${ds.holding}` : `p50 ${d.p50}ms`;
        return { id: d.id, label: d.host, pos: d.pos, state, detail: ds?.dead ? `${detail} · ${ds.dead} DLQ` : detail };
      });
    },
    legs: (t0, t1, out) => sim.world.collectLegs(t0, t1, out),
    path: (id) => {
      const e = sim.world.find(id);
      return e ? sim.world.journey(e).legs : [];
    },
    candidates: (T) => sim.world.between(T - 40, T).map((e) => ({ id: e.id, legs: sim.world.journey(e).legs })),
  };
}
