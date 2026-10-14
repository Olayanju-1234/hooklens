import { hash, mulberry32, gauss, rand01 } from "./rng";
import {
  EASE,
  add,
  bezier,
  dist,
  ease,
  lerp3,
  racetrackPerimeter,
  racetrackPoint,
  type Vec3,
} from "./geometry";
import {
  BACKOFF_BASE,
  DESTINATIONS,
  DEST_BY_ID,
  DEST_INDEX,
  HOLD_SPEED,
  HUB,
  MAX_ATTEMPTS,
  SOURCES,
  SOURCE_BY_ID,
  graveyardFor,
  holdFor,
} from "./catalog";

/**
 * Deterministic delivery simulation. Every event's whole journey is a pure function of the
 * event and the recorded actions, so any moment can be re-rendered — that is what makes rewind free.
 */

export type Tone = "white" | "cyan" | "green" | "amber" | "red" | "orange" | "magenta";
export const TONES: Tone[] = ["white", "cyan", "green", "amber", "red", "orange", "magenta"];

export const LEG = { flight: 0, hold: 1, ballistic: 2, pulse: 3, ember: 4, flash: 5 } as const;

export interface Leg {
  t0: number;
  t1: number;
  type: number;
  size: number;
  a: Vec3;
  b: Vec3;
  c: Vec3;
  ease: number;
  tone: Tone;
}

export interface SimEvent {
  id: string;
  seq: number;
  t0: number;
  source: string;
  eventType: string;
  forged: boolean;
  bytes: number;
  seed: number;
  latency: Record<string, number>;
  injected: boolean;
}

export type BranchState = "flying" | "holding" | "delivered" | "dead" | "replaying";

export interface Attempt {
  dest: string;
  n: number;
  tSend: number;
  tArrive: number;
  ok: boolean;
  code: number;
  latencyMs: number;
  replay: boolean;
}

export interface Mark {
  t: number;
  state: BranchState;
  attempt: number;
}

export interface Branch {
  dest: string;
  generation: number;
  marks: Mark[];
  attempts: Attempt[];
}

export interface Journey {
  event: SimEvent;
  legs: Leg[];
  tGate: number;
  rejected: boolean;
  branches: Branch[];
  replayStarts: number[];
  endT: number;
}

export type ActionType = "outage" | "restore" | "forge" | "burst" | "replay-dead" | "replay-event";

export interface Action {
  id: number;
  t: number;
  type: ActionType;
  dest?: string;
  eventId?: string;
  seed: number;
}

export type Phase = "inbound" | "rejected" | "flying" | "holding" | "delivered" | "dead" | "partial" | "replaying";

export interface Status {
  phase: Phase;
  label: string;
  attempt: number;
}

export interface DestStats {
  id: string;
  down: boolean;
  holding: number;
  dead: number;
  delivered: number;
  failed: number;
}

export interface WorldStats {
  perMin: number;
  sealedPct: number;
  rejected: number;
  holding: number;
  dead: number;
  p50: number | null;
  verifiedTotal: number;
  dests: Record<string, DestStats>;
}

const INF = 1e7;
const HISTORY = 900;

const SOURCE_WEIGHT_TOTAL = SOURCES.reduce((s, p) => s + p.weight, 0);

function pickSource(r: number) {
  let acc = 0;
  for (const s of SOURCES) {
    acc += s.weight / SOURCE_WEIGHT_TOTAL;
    if (r <= acc) return s;
  }
  return SOURCES[SOURCES.length - 1];
}

function arcCtrl(a: Vec3, b: Vec3, lift: number): Vec3 {
  const m = lerp3(a, b, 0.5);
  return [m[0], Math.max(a[1], b[1]) + lift, m[2]];
}

export class World {
  readonly seed: number;
  rate: number;
  version = 0;
  private events: SimEvent[] = [];
  private genT = 0;
  private genRng: () => number;
  private seq = 0;
  private injectedSeq = 0;
  private trimmedVerified = 0;
  private actions: Action[] = [];
  private actionSeq = 0;
  private cache = new Map<string, Journey>();
  private listeners = new Set<() => void>();

  constructor(seed = 7, rate = 4.2) {
    this.seed = seed;
    this.rate = rate;
    this.genRng = mulberry32(hash(seed, 0xa11ce));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private bump() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /** Generates base traffic up to time T (inhomogeneous Poisson via thinning, so bursts happen). */
  ensure(T: number) {
    const lambdaMax = this.rate * 1.7;
    let added = false;
    while (this.genT < T) {
      this.genT += -Math.log(1 - this.genRng()) / lambdaMax;
      const lam =
        this.rate *
        (1 + 0.45 * Math.sin((this.genT * 2 * Math.PI) / 41) + 0.2 * Math.sin((this.genT * 2 * Math.PI) / 7.3));
      if (this.genRng() * lambdaMax > lam) continue;
      this.events.push(this.makeEvent(this.genT, this.seq++, false));
      added = true;
    }
    if (this.events.length && this.events[0].t0 < T - HISTORY) {
      const cut = this.indexAt(T - HISTORY);
      for (let i = 0; i < cut; i++) {
        if (!this.events[i].forged) this.trimmedVerified++;
        this.cache.delete(this.events[i].id);
      }
      this.events.splice(0, cut);
    }
    if (added) this.version++;
  }

  private makeEvent(t0: number, seq: number, injected: boolean, opts: { forged?: boolean; source?: string } = {}): SimEvent {
    const seed = hash(this.seed, seq, injected ? 0x9e37 : 1);
    const r = mulberry32(seed);
    const src = opts.source ? SOURCE_BY_ID.get(opts.source)! : pickSource(r());
    const eventType = src.events[Math.floor(r() * src.events.length)];
    const forged = opts.forged ?? r() < 0.008;
    const bytes = Math.floor(320 + r() * r() * 6200);
    const latency: Record<string, number> = {};
    for (const d of DESTINATIONS) latency[d.id] = Math.max(4, Math.round(d.p50 * Math.exp(0.38 * gauss(r))));
    const id = `evt_${seed.toString(36).padStart(7, "0").slice(0, 7)}${seq.toString(36)}`;
    return { id, seq, t0, source: src.id, eventType, forged, bytes, seed, latency, injected };
  }

  private insert(e: SimEvent) {
    const i = this.indexAt(e.t0);
    this.events.splice(i, 0, e);
  }

  /** First index with t0 >= t. */
  indexAt(t: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].t0 < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  all(): readonly SimEvent[] {
    return this.events;
  }

  between(t0: number, t1: number): SimEvent[] {
    return this.events.slice(this.indexAt(t0), this.indexAt(t1));
  }

  find(id: string): SimEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  latest(T: number, n: number): SimEvent[] {
    const end = this.indexAt(T);
    return this.events.slice(Math.max(0, end - n), end).reverse();
  }

  getActions(): readonly Action[] {
    return this.actions;
  }

  act(type: ActionType, t: number, extra: { dest?: string; eventId?: string } = {}): Action {
    const a: Action = { id: this.actionSeq++, t, type, seed: hash(this.seed, 0xac7, this.actionSeq), ...extra };
    this.actions.push(a);
    this.actions.sort((x, y) => x.t - y.t || x.id - y.id);

    if (type === "forge") {
      this.insert(this.makeEvent(t, 1_000_000 + this.injectedSeq++, true, { forged: true }));
    } else if (type === "burst") {
      const r = mulberry32(a.seed);
      const source = SOURCES[Math.floor(r() * SOURCES.length)].id;
      for (let i = 0; i < 24; i++) {
        this.insert(this.makeEvent(t + r() * 1.6, 1_000_000 + this.injectedSeq++, true, { source, forged: false }));
      }
    }

    for (const [id, j] of this.cache) {
      if (type === "replay-event" && id !== extra.eventId) continue;
      if (j.endT >= t - 1e-3) this.cache.delete(id);
    }
    this.bump();
    return a;
  }

  isDown(dest: string, t: number): boolean {
    let down = false;
    for (const a of this.actions) {
      if (a.t > t) break;
      if (a.dest !== dest) continue;
      if (a.type === "outage") down = true;
      else if (a.type === "restore") down = false;
    }
    return down;
  }

  outageWindows(dest: string, until: number): [number, number][] {
    const out: [number, number][] = [];
    let start: number | null = null;
    for (const a of this.actions) {
      if (a.dest !== dest) continue;
      if (a.type === "outage" && start === null) start = a.t;
      if (a.type === "restore" && start !== null) {
        out.push([start, a.t]);
        start = null;
      }
    }
    if (start !== null) out.push([start, until]);
    return out;
  }

  journey(e: SimEvent): Journey {
    let j = this.cache.get(e.id);
    if (!j) {
      j = this.build(e);
      this.cache.set(e.id, j);
    }
    return j;
  }

  private nextReplayDead(dest: string, after: number): Action | undefined {
    return this.actions.find((a) => a.type === "replay-dead" && a.t > after && (!a.dest || a.dest === dest));
  }

  private build(e: SimEvent): Journey {
    const legs: Leg[] = [];
    const branches: Branch[] = [];
    const src = SOURCE_BY_ID.get(e.source)!;
    const r = mulberry32(hash(e.seed, 77));

    const inDur = 1.05 + r() * 0.45;
    legs.push({
      t0: e.t0, t1: e.t0 + inDur, type: LEG.flight, size: 0.17, ease: EASE.out, tone: "white",
      a: src.pos, b: arcCtrl(src.pos, HUB, 1.3 + r() * 0.9), c: HUB,
    });
    const tGate = e.t0 + inDur;
    legs.push({
      t0: tGate, t1: tGate + 0.45, type: LEG.flash, size: 0.5, ease: EASE.out, tone: e.forged ? "red" : "cyan",
      a: HUB, b: [0, 0, 0], c: [0, 0, 0],
    });

    if (e.forged) {
      for (let i = 0; i < 7; i++) {
        legs.push({
          t0: tGate, t1: tGate + 1.5, type: LEG.ballistic, size: 0.08, ease: EASE.linear, tone: "red",
          a: HUB, b: [-0.6 + r() * 1.5, 1 + r() * 1.8, (r() - 0.5) * 2.6], c: [4.6, 0.03, 0],
        });
      }
      return { event: e, legs, tGate, rejected: true, branches, replayStarts: [], endT: tGate + 1.5 };
    }

    const tDepart = tGate + 0.12;
    for (const destId of src.routes) branches.push(this.runBranch(e, destId, HUB, tDepart, 0, false, legs));

    const replayStarts: number[] = [];
    let gen = 1;
    for (const a of this.actions) {
      if (a.type !== "replay-event" || a.eventId !== e.id || a.t <= tDepart) continue;
      replayStarts.push(a.t);
      legs.push({ t0: a.t, t1: a.t + 0.5, type: LEG.flash, size: 0.6, ease: EASE.out, tone: "magenta", a: HUB, b: [0, 0, 0], c: [0, 0, 0] });
      for (const destId of src.routes) branches.push(this.runBranch(e, destId, HUB, a.t + 0.1, gen, true, legs));
      gen++;
    }

    let endT = tGate + 0.5;
    for (const l of legs) endT = Math.max(endT, l.t1);
    return { event: e, legs, tGate, rejected: false, branches, replayStarts, endT };
  }

  private runBranch(e: SimEvent, destId: string, from: Vec3, start: number, generation: number, replay: boolean, legs: Leg[]): Branch {
    const dest = DEST_BY_ID.get(destId)!;
    const di = DEST_INDEX.get(destId)!;
    const branch: Branch = { dest: destId, generation, marks: [], attempts: [] };
    let t = start;
    let k = 0;
    let resurrections = 0;
    let magentaLeg = replay;
    let pos = from;
    branch.marks.push({ t, state: replay ? "replaying" : "flying", attempt: 1 });

    for (let guard = 0; guard < 24; guard++) {
      const d = dist(pos, dest.pos);
      const lat = e.latency[destId];
      const dur = 0.32 + d * 0.16 + Math.log10(lat) * 0.07;
      legs.push({
        t0: t, t1: t + dur, type: LEG.flight, size: magentaLeg ? 0.2 : 0.16, ease: EASE.inOut, tone: magentaLeg ? "magenta" : "cyan",
        a: pos, b: arcCtrl(pos, dest.pos, 0.55 + d * 0.13), c: dest.pos,
      });
      magentaLeg = false;
      const tArr = t + dur;
      const down = this.isDown(destId, tArr);
      const roll = rand01(e.seed, di, k, resurrections, generation);
      const ok = !down && roll > dest.flakiness;
      const code = ok ? 200 : down ? (roll < 0.3 ? 504 : 503) : [500, 502, 429][Math.floor(roll * 1000) % 3];
      branch.attempts.push({
        dest: destId, n: branch.attempts.length + 1, tSend: t, tArrive: tArr, ok, code,
        latencyMs: ok ? lat : code === 504 ? 15000 : Math.round(lat * 0.4 + 6), replay: replay || resurrections > 0,
      });

      if (ok) {
        legs.push({ t0: tArr, t1: tArr + 0.8, type: LEG.pulse, size: 0.9, ease: EASE.out, tone: "green", a: dest.pos, b: [0, 0, 0], c: [0, 0, 0] });
        branch.marks.push({ t: tArr, state: "delivered", attempt: k + 1 });
        return branch;
      }

      legs.push({ t0: tArr, t1: tArr + 0.35, type: LEG.flash, size: 0.32, ease: EASE.out, tone: "red", a: dest.pos, b: [0, 0, 0], c: [0, 0, 0] });

      if (k + 1 >= MAX_ATTEMPTS) {
        const grave = graveyardFor(dest, hash(e.seed, di, resurrections));
        legs.push({
          t0: tArr, t1: tArr + 0.9, type: LEG.flight, size: 0.14, ease: EASE.in, tone: "orange",
          a: dest.pos, b: add(lerp3(dest.pos, grave, 0.5), [0, 0.7, 0]), c: grave,
        });
        const tDead = tArr + 0.9;
        branch.marks.push({ t: tDead, state: "dead", attempt: k + 1 });
        const replayAction = resurrections < 3 ? this.nextReplayDead(destId, tDead) : undefined;
        if (!replayAction) {
          legs.push({ t0: tDead, t1: INF, type: LEG.ember, size: 0.12, ease: EASE.linear, tone: "orange", a: grave, b: [0, 0, 0], c: [0, 0, 0] });
          return branch;
        }
        const lift = replayAction.t + rand01(e.seed, di, 99, resurrections) * 0.8;
        legs.push({ t0: tDead, t1: lift, type: LEG.ember, size: 0.12, ease: EASE.linear, tone: "orange", a: grave, b: [0, 0, 0], c: [0, 0, 0] });
        legs.push({ t0: lift, t1: lift + 0.5, type: LEG.flash, size: 0.36, ease: EASE.out, tone: "magenta", a: grave, b: [0, 0, 0], c: [0, 0, 0] });
        branch.marks.push({ t: lift, state: "replaying", attempt: 1 });
        resurrections++;
        k = 0;
        t = lift;
        pos = grave;
        magentaLeg = true;
        continue;
      }

      const rt = holdFor(dest, k);
      const s0 = rand01(e.seed, di, k, 5) * racetrackPerimeter(rt);
      const entry = racetrackPoint(rt, s0);
      const backoff = BACKOFF_BASE * Math.pow(2, k);
      legs.push({
        t0: tArr, t1: tArr + 0.5, type: LEG.flight, size: 0.15, ease: EASE.out, tone: "amber",
        a: dest.pos, b: add(lerp3(dest.pos, entry, 0.5), [0, 0.35, 0]), c: entry,
      });
      const tHold = tArr + 0.5;
      legs.push({
        t0: tHold, t1: tHold + backoff, type: LEG.hold, size: 0.15, ease: EASE.linear, tone: "amber",
        a: rt.center, b: [rt.dir[0], rt.dir[1], s0], c: [rt.length, rt.radius, HOLD_SPEED],
      });
      branch.marks.push({ t: tArr, state: "holding", attempt: k + 1 });
      t = tHold + backoff;
      pos = racetrackPoint(rt, s0 + HOLD_SPEED * backoff);
      k++;
      branch.marks.push({ t, state: "flying", attempt: k + 1 });
    }
    return branch;
  }

  branchStateAt(b: Branch, T: number): Mark | null {
    let m: Mark | null = null;
    for (const mark of b.marks) {
      if (mark.t <= T) m = mark;
      else break;
    }
    return m;
  }

  statusAt(j: Journey, T: number): Status {
    if (T < j.tGate) return { phase: "inbound", label: "INBOUND", attempt: 0 };
    if (j.rejected) return { phase: "rejected", label: "REJECTED", attempt: 0 };
    let gen = 0;
    for (let i = 0; i < j.replayStarts.length; i++) if (j.replayStarts[i] <= T) gen = i + 1;
    const marks = j.branches
      .filter((b) => b.generation === gen)
      .map((b) => this.branchStateAt(b, T))
      .filter((m): m is Mark => m !== null);
    if (!marks.length) return { phase: "flying", label: "EN ROUTE", attempt: 1 };
    const holding = marks.filter((m) => m.state === "holding");
    if (holding.length) {
      const attempt = Math.max(...holding.map((m) => m.attempt));
      return { phase: "holding", label: `HOLDING ${attempt}/${MAX_ATTEMPTS}`, attempt };
    }
    if (marks.some((m) => m.state === "replaying")) return { phase: "replaying", label: "REPLAYING", attempt: 1 };
    if (marks.some((m) => m.state === "flying")) {
      const attempt = Math.max(...marks.map((m) => m.attempt));
      return { phase: "flying", label: attempt > 1 ? `RETRY ${attempt}/${MAX_ATTEMPTS}` : "EN ROUTE", attempt };
    }
    const dead = marks.filter((m) => m.state === "dead").length;
    if (dead === marks.length) return { phase: "dead", label: "DEAD LETTER", attempt: MAX_ATTEMPTS };
    if (dead) return { phase: "partial", label: `PARTIAL ${marks.length - dead}/${marks.length}`, attempt: MAX_ATTEMPTS };
    return { phase: "delivered", label: gen > 0 ? "REPLAYED" : "DELIVERED", attempt: 1 };
  }

  stats(T: number): WorldStats {
    const dests: Record<string, DestStats> = {};
    for (const d of DESTINATIONS) dests[d.id] = { id: d.id, down: this.isDown(d.id, T), holding: 0, dead: 0, delivered: 0, failed: 0 };
    let arrivals = 0;
    let gated = 0;
    let rejected = 0;
    let verifiedTotal = this.trimmedVerified;
    const lats: number[] = [];
    const end = this.indexAt(T);
    for (let i = 0; i < end; i++) {
      const e = this.events[i];
      const j = this.journey(e);
      const recent = e.t0 >= T - 60;
      if (recent) arrivals++;
      if (j.tGate <= T) {
        if (j.rejected) {
          if (recent) rejected++;
        } else verifiedTotal++;
        if (recent) gated++;
      }
      if (j.endT < T - 60 && j.endT < INF) continue;
      for (const b of j.branches) {
        const m = this.branchStateAt(b, T);
        if (!m) continue;
        const ds = dests[b.dest];
        if (m.state === "holding") ds.holding++;
        else if (m.state === "dead") ds.dead++;
        for (const a of b.attempts) {
          if (a.tArrive > T || a.tArrive < T - 60) continue;
          if (a.ok) {
            ds.delivered++;
            lats.push(a.latencyMs);
          } else ds.failed++;
        }
      }
    }
    lats.sort((a, b) => a - b);
    let holding = 0;
    let dead = 0;
    for (const d of Object.values(dests)) {
      holding += d.holding;
      dead += d.dead;
    }
    return {
      perMin: arrivals,
      sealedPct: gated ? ((gated - rejected) / gated) * 100 : 100,
      rejected,
      holding,
      dead,
      p50: lats.length ? lats[Math.floor(lats.length / 2)] : null,
      verifiedTotal,
      dests,
    };
  }

  histogram(t0: number, t1: number, bins: number): number[] {
    const out = new Array<number>(bins).fill(0);
    const w = (t1 - t0) / bins;
    for (const e of this.between(t0, t1)) out[Math.min(bins - 1, Math.floor((e.t0 - t0) / w))]++;
    return out;
  }

  /** Legs that can be visible anywhere in [tMin, tMax]. */
  collectLegs(tMin: number, tMax: number, out: Leg[] = []): Leg[] {
    out.length = 0;
    const end = this.indexAt(tMax);
    for (let i = 0; i < end; i++) {
      const j = this.journey(this.events[i]);
      if (j.endT < tMin) continue;
      for (const l of j.legs) if (l.t1 >= tMin && l.t0 <= tMax) out.push(l);
    }
    return out;
  }
}

export interface LegSample {
  p: Vec3;
  alpha: number;
  size: number;
  ring: boolean;
}

/** CPU mirror of the packet vertex shader, used by the 2D map and hit-testing. */
export function sampleLeg(l: Leg, t: number): LegSample | null {
  if (t < l.t0 || t > l.t1) return null;
  const u = Math.min(1, Math.max(0, (t - l.t0) / Math.max(l.t1 - l.t0, 1e-4)));
  switch (l.type) {
    case LEG.flight:
      return { p: bezier(l.a, l.b, l.c, ease(u, l.ease)), alpha: 1, size: l.size, ring: false };
    case LEG.hold:
      return {
        p: racetrackPoint({ center: l.a, dir: [l.b[0], l.b[1]], length: l.c[0], radius: l.c[1] }, l.b[2] + l.c[2] * (t - l.t0)),
        alpha: 1,
        size: l.size,
        ring: false,
      };
    case LEG.ballistic: {
      const tt = t - l.t0;
      const y = Math.max(l.c[1], l.a[1] + l.b[1] * tt - 0.5 * l.c[0] * tt * tt);
      return { p: [l.a[0] + l.b[0] * tt, y, l.a[2] + l.b[2] * tt], alpha: 1 - u, size: l.size, ring: false };
    }
    case LEG.pulse:
      return { p: l.a, alpha: 1 - u, size: l.size * 0.2 + (l.size - l.size * 0.2) * (1 - (1 - u) * (1 - u)), ring: true };
    case LEG.ember: {
      const age = t - l.t0;
      return { p: l.a, alpha: 0.55 + 0.45 * Math.exp(-age * 1.5), size: l.size, ring: false };
    }
    default:
      return { p: l.a, alpha: 1 - u, size: l.size * (1 + 1.2 * u), ring: true };
  }
}

export const SCENARIO = {
  preroll: 46,
  seed(world: World) {
    world.act("outage", 9, { dest: "staging" });
    world.act("restore", 31, { dest: "staging" });
  },
};
