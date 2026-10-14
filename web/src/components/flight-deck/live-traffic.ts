import { EASE, add, latencyRadius, lerp3, racetrackPerimeter, racetrackPoint, type Vec3 } from "./sim/geometry";
import { HOLD_SPEED, HUB, SOURCE_RADIUS, graveyardFor, holdFor, type Destination } from "./sim/catalog";
import { LEG, type Leg, type Tone } from "./sim/engine";
import { hash, rand01 } from "./sim/rng";
import type { RadarDest, RadarModel, RadarNode } from "./radar";

export interface LiveRoute {
  endpointId: string;
  provider: string;
  maxAttempts: number;
  destinations: { id: string; label: string | null; url: string }[];
}

/** Latest known outcome for one destination of one event, from the timeline endpoint. */
export interface DestOutcome {
  key: string;
  ok: boolean;
  latencyMs: number | null;
}

interface LiveDest extends Destination {
  endpointId: string;
  key: string;
}

interface Track {
  id: string;
  provider: string;
  tGate: number;
  endpointId: string | null;
  attempts: number;
  delivered: Set<string>;
  holds: Map<string, Leg>;
  dead: Set<string>;
  legs: Leg[];
  replay: boolean;
}

const INF = 1e7;
const PROVIDER_LABEL: Record<string, string> = {
  stripe: "Stripe",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  mono: "Mono",
  bags: "Bags",
  custom: "Custom",
};

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function arcCtrl(a: Vec3, b: Vec3, lift: number): Vec3 {
  const m = lerp3(a, b, 0.5);
  return [m[0], Math.max(a[1], b[1]) + lift, m[2]];
}

const keyHash = (s: string) => hash(...Array.from(s, (c) => c.charCodeAt(0)));

/** Real socket traffic drawn with the simulation's leg vocabulary, so the radar renders both the same way. */
export class LiveTraffic implements RadarModel {
  private start = typeof performance === "undefined" ? 0 : performance.now();
  private all: Leg[] = [];
  private tracks = new Map<string, Track>();
  private routes: LiveRoute[] = [];
  private providers: string[] = [];
  private srcNodes: RadarNode[] = [];
  private dests: LiveDest[] = [];
  private latencies = new Map<string, number[]>();
  private embers: { leg: Leg; endpointId: string; destId: string | null; key: string | null; seed: number }[] = [];
  private latencyPlaced = false;
  private replayIds = new Set<string>();
  private key = 0;
  private lastTrim = 0;

  now() {
    return (performance.now() - this.start) / 1000;
  }

  layoutKey = () => String(this.key);
  tick = () => {
    const t = this.now();
    if (t - this.lastTrim < 2) return;
    this.lastTrim = t;
    this.all = this.all.filter((l) => l.t1 > t - 6);
    this.embers = this.embers.filter((e) => this.all.includes(e.leg));
    for (const [id, tr] of this.tracks) {
      if (tr.holds.size === 0 && tr.legs.every((l) => l.t1 < t - 60)) this.tracks.delete(id);
    }
  };
  time = () => this.now();
  sources = () => this.srcNodes;

  destinations = (): RadarDest[] => {
    const holding = new Map<string, number>();
    const dead = new Map<string, number>();
    for (const tr of this.tracks.values()) {
      for (const k of tr.holds.keys()) holding.set(k, (holding.get(k) ?? 0) + 1);
    }
    for (const l of this.all) if (l.type === LEG.ember) dead.set(this.destKeyAt(l.a), (dead.get(this.destKeyAt(l.a)) ?? 0) + 1);
    return this.dests.map((d) => {
      const h = holding.get(d.key) ?? 0;
      const dl = dead.get(d.key) ?? 0;
      const lat = this.p50(d);
      const base = h > 0 ? `HOLD ×${h}` : lat !== null ? `p50 ${lat}ms` : "no deliveries yet";
      return { id: d.id, label: d.host, pos: d.pos, state: h > 0 ? "holding" : "ok", detail: dl ? `${base} · ${dl} DLQ` : base };
    });
  };

  legs = (t0: number, t1: number, out: Leg[]) => {
    out.length = 0;
    for (const l of this.all) if (l.t1 >= t0 && l.t0 <= t1) out.push(l);
    return out;
  };

  path = (id: string) => this.tracks.get(id)?.legs ?? [];
  candidates = () => Array.from(this.tracks.values(), (t) => ({ id: t.id, legs: t.legs }));

  hasTrack(id: string) {
    return this.tracks.has(id);
  }

  setRoutes(routes: LiveRoute[], seenProviders: string[]) {
    this.routes = routes;
    const providers = Array.from(new Set([...routes.map((r) => r.provider), ...seenProviders].filter(Boolean)));
    this.layout(providers);
  }

  /** Event-level history only knows the slowest destination, so it seeds the endpoint as a fallback. */
  recordLatency(scope: { endpointId: string } | { destKey: string }, ms: number) {
    const k = "destKey" in scope ? `d:${scope.destKey}` : `e:${scope.endpointId}`;
    const arr = this.latencies.get(k) ?? [];
    arr.push(ms);
    if (arr.length > 50) arr.shift();
    this.latencies.set(k, arr);
  }

  /** Places destinations on the latency rings once, after the first real numbers, so the chart doesn't jump mid-flight. */
  placeByLatency() {
    if (this.latencyPlaced) return;
    this.latencyPlaced = true;
    this.layout(this.providers);
  }

  seedDeadLetters(entries: { id: string; endpointId: string; destinationId?: string | null }[]) {
    const seeded = new Set(this.embers.filter((e) => e.leg.t0 === 0).map((e) => e.leg));
    this.all = this.all.filter((l) => !seeded.has(l));
    this.embers = this.embers.filter((e) => e.leg.t0 !== 0);
    for (const e of entries) {
      const leg = this.ember(0, [0, 0, 0]);
      this.embers.push({ leg, endpointId: e.endpointId, destId: e.destinationId ?? null, key: null, seed: keyHash(e.id) });
      this.all.push(leg);
    }
    this.placeEmbers();
  }

  markReplay(id: string) {
    this.replayIds.add(id);
  }

  onWebhook(ev: { id: string; provider: string | null; signatureValid: boolean | null }) {
    const provider = ev.provider ?? "custom";
    if (!this.providers.includes(provider)) this.layout([...this.providers, provider]);
    const src = this.srcNodes.find((s) => s.id === provider)!;
    const t = this.now();
    const replay = this.replayIds.has(ev.id);
    const legs: Leg[] = [];
    const inDur = 1.1;
    legs.push(this.flight(t, t + inDur, src.pos, HUB, replay ? "magenta" : "white", 1.5, EASE.out, 0.17));
    legs.push(this.flash(t + inDur, HUB, ev.signatureValid === false ? "red" : "cyan", 0.5));
    const single = this.routes.length === 1 ? this.routes[0].endpointId : null;
    const track: Track = {
      id: ev.id,
      provider,
      tGate: t + inDur,
      endpointId: single,
      attempts: 0,
      delivered: new Set(),
      holds: new Map(),
      dead: new Set(),
      legs,
      replay,
    };
    this.tracks.set(ev.id, track);
    this.all.push(...legs);
  }

  setEndpoint(eventId: string, endpointId: string) {
    const tr = this.tracks.get(eventId);
    if (tr && !tr.endpointId) tr.endpointId = endpointId;
  }

  /** Apply one forward attempt. `outcomes` comes from the event timeline; without it every pending destination takes the aggregate status. */
  onAttempt(eventId: string, aggregateOk: boolean, outcomes: DestOutcome[] | null) {
    const tr = this.tracks.get(eventId);
    if (!tr || !tr.endpointId) return;
    const route = this.routes.find((r) => r.endpointId === tr.endpointId);
    const dests = this.dests.filter((d) => d.endpointId === tr.endpointId);
    if (!route || dests.length === 0) return;
    tr.attempts++;
    const final = tr.attempts >= route.maxAttempts;
    const t = Math.max(this.now(), tr.tGate + 0.1);

    for (const d of dests) {
      if (tr.delivered.has(d.key) || tr.dead.has(d.key)) continue;
      const o = outcomes?.find((x) => x.key === d.key);
      const ok = o ? o.ok : aggregateOk;
      if (o?.ok && o.latencyMs !== null) this.recordLatency({ destKey: d.key }, o.latencyMs);

      let from: Vec3 = HUB;
      const hold = tr.holds.get(d.key);
      if (hold) {
        hold.t1 = t;
        from = racetrackPoint(
          { center: hold.a, dir: [hold.b[0], hold.b[1]], length: hold.c[0], radius: hold.c[1] },
          hold.b[2] + hold.c[2] * (t - hold.t0),
        );
        tr.holds.delete(d.key);
      }
      const dur = 0.5 + Math.hypot(d.pos[0] - from[0], d.pos[2] - from[2]) * 0.14;
      const tone: Tone = tr.replay && !hold ? "magenta" : "cyan";
      const legs: Leg[] = [this.flight(t, t + dur, from, d.pos, tone, 0.55 + dur * 0.4, EASE.inOut, 0.16)];
      const tArr = t + dur;
      if (ok) {
        tr.delivered.add(d.key);
        legs.push({ t0: tArr, t1: tArr + 0.8, type: LEG.pulse, size: 0.9, ease: EASE.out, tone: "green", a: d.pos, b: [0, 0, 0], c: [0, 0, 0] });
      } else {
        legs.push(this.flash(tArr, d.pos, "red", 0.32));
        if (final) {
          tr.dead.add(d.key);
          const seed = keyHash(`${eventId}:${d.key}`);
          const grave = graveyardFor(d, seed);
          legs.push(this.flight(tArr, tArr + 0.9, d.pos, grave, "orange", 0.7, EASE.in, 0.14));
          const ember = this.ember(tArr + 0.9, grave);
          this.embers.push({ leg: ember, endpointId: d.endpointId, destId: d.id, key: d.key, seed });
          legs.push(ember);
        } else {
          const level = Math.min(2, tr.attempts - 1);
          const rt = holdFor(d, level);
          const s0 = rand01(keyHash(eventId), level) * racetrackPerimeter(rt);
          const entry = racetrackPoint(rt, s0);
          legs.push(this.flight(tArr, tArr + 0.5, d.pos, entry, "amber", 0.35, EASE.out, 0.15));
          const h: Leg = {
            t0: tArr + 0.5, t1: INF, type: LEG.hold, size: 0.15, ease: EASE.linear, tone: "amber",
            a: rt.center, b: [rt.dir[0], rt.dir[1], s0], c: [rt.length, rt.radius, HOLD_SPEED],
          };
          legs.push(h);
          tr.holds.set(d.key, h);
        }
      }
      tr.legs.push(...legs);
      this.all.push(...legs);
    }
  }

  private p50(d: { key: string; endpointId: string }): number | null {
    const arr = this.latencies.get(`d:${d.key}`) ?? this.latencies.get(`e:${d.endpointId}`);
    if (!arr?.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  private destKeyAt(p: Vec3) {
    let best = "";
    let bd = Infinity;
    for (const d of this.dests) {
      const dd = Math.hypot(d.pos[0] - p[0], d.pos[2] - p[2]);
      if (dd < bd) {
        bd = dd;
        best = d.key;
      }
    }
    return best;
  }

  private layout(providers: string[]) {
    this.providers = providers;
    const n = Math.max(1, providers.length);
    const spread = Math.min(116, 22 * (n - 1));
    this.srcNodes = providers.map((p, i) => {
      const a = ((180 - spread / 2 + (n === 1 ? spread / 2 : (spread * i) / (n - 1))) * Math.PI) / 180;
      return { id: p, label: PROVIDER_LABEL[p] ?? p, pos: [SOURCE_RADIUS * Math.cos(a), 0.02, SOURCE_RADIUS * Math.sin(a)] };
    });
    const flat = this.routes.flatMap((r) => r.destinations.map((d) => {
      const key = d.label || d.url;
      return { r, d, key, p50: this.p50({ key, endpointId: r.endpointId }) ?? 120 };
    }));
    const m = Math.max(1, flat.length);
    // Keep at least ~2.4 chart units between neighbours so their labels never collide, even close to the gate.
    const innermost = Math.min(...flat.map((f) => latencyRadius(f.p50)), 6);
    const gap = Math.max(32, ((2.4 / innermost) * 180) / Math.PI);
    const dSpread = Math.min(140, gap * (m - 1));
    this.dests = flat.map(({ r, d, key, p50 }, i) => {
      const angle = m === 1 ? 0 : -dSpread / 2 + (dSpread * i) / (m - 1);
      const rad = (angle * Math.PI) / 180;
      const radial: [number, number] = [Math.cos(rad), Math.sin(rad)];
      const radius = latencyRadius(p50);
      return {
        id: d.id,
        key,
        endpointId: r.endpointId,
        host: d.label || hostOf(d.url),
        note: "",
        p50,
        flakiness: 0,
        angle,
        radial,
        pos: [radius * radial[0], 0.02, radius * radial[1]] as Vec3,
      };
    });
    this.placeEmbers();
    this.key++;
  }

  private placeEmbers() {
    for (const e of this.embers) {
      const d =
        this.dests.find((x) => x.endpointId === e.endpointId && (x.id === e.destId || x.key === e.key)) ??
        this.dests.find((x) => x.endpointId === e.endpointId);
      if (d) e.leg.a = graveyardFor(d, e.seed);
    }
  }

  private flight(t0: number, t1: number, a: Vec3, c: Vec3, tone: Tone, lift: number, ease: number, size: number): Leg {
    return { t0, t1, type: LEG.flight, size, ease, tone, a, b: arcCtrl(a, c, lift), c };
  }

  private flash(t: number, at: Vec3, tone: Tone, size: number): Leg {
    return { t0: t, t1: t + 0.4, type: LEG.flash, size, ease: EASE.out, tone, a: at, b: [0, 0, 0], c: [0, 0, 0] };
  }

  private ember(t0: number, at: Vec3): Leg {
    return { t0, t1: INF, type: LEG.ember, size: 0.12, ease: EASE.linear, tone: "orange", a: add(at, [0, 0, 0]), b: [0, 0, 0], c: [0, 0, 0] };
  }
}
