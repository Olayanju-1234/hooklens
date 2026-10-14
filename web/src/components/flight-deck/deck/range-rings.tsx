"use client";

import { fmtMs } from "./format";

export interface Blip {
  key: string;
  /** Short callsign drawn on the scope; the table carries the full name. */
  tag: string;
  label: string;
  group: string;
  p50: number | null;
  p95: number | null;
  rate: number | null;
}

interface Props {
  blips: Blip[];
  fleetP50: number | null;
  fleetP95: number | null;
  selected: string | null;
  onSelect: (key: string) => void;
}

const C = 210;
const R_MIN = 34;
const R_MAX = 186;
const RINGS = [
  { ms: 10, label: "10 ms" },
  { ms: 100, label: "100 ms" },
  { ms: 1000, label: "1 s" },
  { ms: 10000, label: "10 s" },
];

/** Log scale, so a 40 ms and a 4 s destination both stay readable on one scope. */
export function ringRadius(ms: number) {
  const t = Math.log10(Math.min(Math.max(ms, 10), 15000) / 10) / 3;
  return R_MIN + Math.min(1.06, t) * (R_MAX - R_MIN);
}

export function healthTone(rate: number | null) {
  if (rate === null) return "mute";
  if (rate >= 0.99) return "green";
  if (rate >= 0.9) return "amber";
  return "orange";
}

function polar(r: number, a: number): [number, number] {
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

export function RangeRings({ blips, fleetP50, fleetP95, selected, onSelect }: Props) {
  const groups = Array.from(new Set(blips.map((b) => b.group)));
  const total = blips.length || 1;
  // Each route gets a sector sized by its destination count, bearings spread inside it.
  let cursor = -Math.PI / 2;
  const placed: (Blip & { a: number })[] = [];
  const sectors: { group: string; from: number; to: number }[] = [];
  for (const g of groups) {
    const members = blips.filter((b) => b.group === g);
    const span = (members.length / total) * Math.PI * 2;
    sectors.push({ group: g, from: cursor, to: cursor + span });
    members.forEach((b, i) => placed.push({ ...b, a: cursor + (span * (i + 0.5)) / members.length }));
    cursor += span;
  }

  return (
    <svg className="rings" viewBox="-12 -12 444 444" role="img" aria-label="Range rings: each destination sits at its median latency, with a tail out to p95">
      {RINGS.map((ring) => (
        <g key={ring.ms}>
          <circle cx={C} cy={C} r={ringRadius(ring.ms)} className="rings-ring" />
          <text x={C + 4} y={C - ringRadius(ring.ms) - 4} className="rings-label">
            {ring.label}
          </text>
        </g>
      ))}
      {sectors.length > 1 &&
        sectors.map((s) => {
          const [x, y] = polar(R_MAX + 8, s.from);
          return <line key={s.group} x1={C} y1={C} x2={x} y2={y} className="rings-sector" />;
        })}
      {fleetP95 !== null && (
        <g>
          <circle cx={C} cy={C} r={ringRadius(fleetP95)} className="rings-fleet" />
          <text x={C - 4} y={C + ringRadius(fleetP95) + 11} className="rings-label" textAnchor="end">
            fleet p95 {fmtMs(fleetP95)}
          </text>
        </g>
      )}
      {fleetP50 !== null && <circle cx={C} cy={C} r={ringRadius(fleetP50)} className="rings-fleet rings-fleet--p50" />}
      <rect x={C - 5} y={C - 5} width={10} height={10} className="rings-hub" />

      {placed.map((b) => {
        const known = b.p50 !== null;
        const r50 = known ? ringRadius(b.p50!) : R_MAX + 4;
        const r95 = b.p95 !== null ? ringRadius(b.p95) : r50;
        const [x, y] = polar(r50, b.a);
        const [tx, ty] = polar(r95, b.a);
        const [lx, ly] = polar(r50 + 12, b.a + 0.12);
        const tone = healthTone(b.rate);
        const isSel = selected === b.key;
        return (
          <g
            key={b.key}
            className="rings-blip"
            data-tone={tone}
            data-selected={isSel || undefined}
            role="button"
            tabIndex={0}
            aria-label={`${b.label}: p50 ${fmtMs(b.p50)}, p95 ${fmtMs(b.p95)}, ${b.rate === null ? "no deliveries" : `${Math.round(b.rate * 100)}% delivered`}`}
            onClick={() => onSelect(b.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(b.key);
              }
            }}
          >
            {r95 > r50 && <line x1={x} y1={y} x2={tx} y2={ty} className="rings-tail" />}
            {r95 > r50 && <circle cx={tx} cy={ty} r={1.8} className="rings-p95" />}
            {isSel && <circle cx={x} cy={y} r={10} className="rings-sel" />}
            <circle cx={x} cy={y} r={known ? 5 : 4.5} className={known ? "rings-dot" : "rings-dot rings-dot--none"} />
            <text x={lx} y={ly + 3} textAnchor="middle" className="rings-name">
              {b.tag}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
