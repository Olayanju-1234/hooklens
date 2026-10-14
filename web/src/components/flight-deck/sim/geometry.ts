export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const EASE = { linear: 0, out: 1, in: 2, inOut: 3 } as const;

export function ease(t: number, kind: number): number {
  if (kind === EASE.out) return 1 - Math.pow(1 - t, 3);
  if (kind === EASE.in) return t * t * t;
  if (kind === EASE.inOut) return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return t;
}

export function bezier(a: Vec3, c: Vec3, b: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
  ];
}

export interface Racetrack {
  center: Vec3;
  dir: [number, number];
  length: number;
  radius: number;
}

export function racetrackPerimeter(rt: Racetrack): number {
  return 2 * rt.length + 2 * Math.PI * rt.radius;
}

// Mirrors racetrack() in the packet vertex shader; keep the two in sync.
export function racetrackPoint(rt: Racetrack, s: number): Vec3 {
  const { center: c, length: L, radius: r } = rt;
  const d: Vec3 = [rt.dir[0], 0, rt.dir[1]];
  const n: Vec3 = [-rt.dir[1], 0, rt.dir[0]];
  const P = racetrackPerimeter(rt);
  s = ((s % P) + P) % P;
  if (s < L) return add(add(c, scale(d, -0.5 * L + s)), scale(n, r));
  s -= L;
  if (s < Math.PI * r) {
    const a = s / r;
    return add(add(c, scale(d, 0.5 * L)), add(scale(n, r * Math.cos(a)), scale(d, r * Math.sin(a))));
  }
  s -= Math.PI * r;
  if (s < L) return add(add(c, scale(d, 0.5 * L - s)), scale(n, -r));
  s -= L;
  const a = s / r;
  return add(add(c, scale(d, -0.5 * L)), add(scale(n, -r * Math.cos(a)), scale(d, -r * Math.sin(a))));
}

/** Latency is drawn as distance from the gate: 10ms → 2.2u, 100ms → 4.1u, 1s → 6.0u. */
export function latencyRadius(ms: number): number {
  return 2.2 + 1.9 * Math.log10(Math.max(ms, 10) / 10);
}
