"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LEG, sampleLeg, type Leg } from "./sim/engine";
import { GATE_RADIUS, HUB, LATENCY_RINGS } from "./sim/catalog";
import { latencyRadius, type Vec3 } from "./sim/geometry";
import { CHART, INK } from "./sim/palette";

export interface RadarNode {
  id: string;
  label: string;
  pos: Vec3;
}

export interface RadarDest extends RadarNode {
  detail: string;
  state: "ok" | "holding" | "down";
}

/** What the radar draws. The simulated World and live socket traffic both implement this. */
export interface RadarModel {
  /** Changes whenever sources or destinations move, so the static layer is redrawn. */
  layoutKey: () => string;
  tick: () => void;
  time: () => number;
  sources: () => RadarNode[];
  destinations: () => RadarDest[];
  legs: (t0: number, t1: number, out: Leg[]) => Leg[];
  /** Legs of one event, for the selected-route line. */
  path?: (id: string) => Leg[];
  /** Candidate events for click-picking at time T. */
  candidates?: (T: number) => { id: string; legs: Leg[] }[];
}

interface Props {
  model: RadarModel;
  reducedMotion: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onToggleDest?: (id: string) => void;
  className?: string;
  label: string;
}

const X_MIN = -8.6;
const X_MAX = 7.3;
const Z_MIN = -5.9;
const Z_MAX = 5.9;
const TRAIL_STEPS = 5;

type Projector = (p: Vec3) => [number, number];

function makeProjector(w: number, h: number, dpr: number): Projector {
  const pad = 18 * dpr;
  const sx = (w - pad * 2) / (X_MAX - X_MIN);
  const sz = (h - pad * 2) / (Z_MAX - Z_MIN);
  const alt = Math.min(sx, sz) * 0.42;
  return (p) => [pad + (p[0] - X_MIN) * sx, pad + (p[2] - Z_MIN) * sz - p[1] * alt];
}

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

export function Radar(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let w = 1;
    let h = 1;
    let dpr = 1;
    let project = makeProjector(1, 1, 1);
    let staticLayer: HTMLCanvasElement | null = null;
    let staticKey = "";
    let lastStill = -1;
    const legs: Leg[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      project = makeProjector(w, h, dpr);
      staticKey = "";
      lastStill = -1;
    };

    const drawStatic = (model: RadarModel, ink: string, faint: string, mono: string) => {
      const layer = document.createElement("canvas");
      layer.width = w;
      layer.height = h;
      const g = layer.getContext("2d")!;
      g.fillStyle = faint;
      for (let x = X_MIN; x <= X_MAX; x += 0.5) {
        for (let z = Z_MIN; z <= Z_MAX; z += 0.5) {
          const [px, py] = project([x, 0, z]);
          g.fillRect(px, py, dpr, dpr);
        }
      }
      g.strokeStyle = faint;
      g.lineWidth = dpr;
      g.setLineDash([3 * dpr, 4 * dpr]);
      g.font = `${9 * dpr}px ${mono}`;
      g.fillStyle = cssVar(canvas, "--ink-3", "#6b7470");
      for (const ring of LATENCY_RINGS) {
        const r = latencyRadius(ring.ms);
        g.beginPath();
        for (let a = -66; a <= 66; a += 2) {
          const rad = (a * Math.PI) / 180;
          const [px, py] = project([r * Math.cos(rad), 0, r * Math.sin(rad)]);
          if (a === -66) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
        const [lx, ly] = project([r * Math.cos(-1.2), 0, r * Math.sin(-1.2)]);
        g.fillText(ring.label, lx + 4 * dpr, ly);
      }
      g.setLineDash([]);
      g.strokeStyle = ink;
      g.globalAlpha = 0.12;
      const [hx, hy] = project(HUB);
      for (const s of model.sources()) {
        const [ax, ay] = project(s.pos);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(hx, hy);
        g.stroke();
      }
      for (const d of model.destinations()) {
        const [bx, by] = project(d.pos);
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.font = `${10 * dpr}px ${mono}`;
      g.textBaseline = "middle";
      g.textAlign = "right";
      for (const s of model.sources()) {
        const [px, py] = project(s.pos);
        g.strokeStyle = ink;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.moveTo(px, py - 5 * dpr);
        g.lineTo(px + 4.5 * dpr, py + 3 * dpr);
        g.lineTo(px - 4.5 * dpr, py + 3 * dpr);
        g.closePath();
        g.stroke();
        g.globalAlpha = 0.9;
        g.fillStyle = ink;
        const text = s.label.toUpperCase();
        const fits = px - 9 * dpr - g.measureText(text).width > 2 * dpr;
        g.textAlign = fits ? "right" : "left";
        g.fillText(text, fits ? px - 9 * dpr : px + 9 * dpr, fits ? py : py + 11 * dpr);
      }
      g.textAlign = "right";
      g.globalAlpha = 1;
      g.strokeStyle = CHART.cyan;
      const rx = GATE_RADIUS * 3.2 * dpr;
      const ry = GATE_RADIUS * 9 * dpr;
      g.beginPath();
      g.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.beginPath();
        g.moveTo(hx + Math.cos(a) * rx, hy + Math.sin(a) * ry);
        g.lineTo(hx + Math.cos(a) * (rx - 2.5 * dpr), hy + Math.sin(a) * (ry - 2.5 * dpr));
        g.stroke();
      }
      return layer;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      const model = p.model;
      model.tick();
      const T = model.time();
      if (p.reducedMotion && Math.floor(T) === lastStill) return;
      lastStill = Math.floor(T);

      const ink = cssVar(canvas, "--ink", INK);
      const faint = cssVar(canvas, "--ink-faint", "#cbd1ca");
      const mono = cssVar(canvas, "--fd-mono", "ui-monospace, monospace");
      const key = `${w}|${h}|${model.layoutKey()}`;
      if (key !== staticKey) {
        staticLayer = drawStatic(model, ink, faint, mono);
        staticKey = key;
      }

      ctx.clearRect(0, 0, w, h);
      if (staticLayer) ctx.drawImage(staticLayer, 0, 0);
      model.legs(T - 0.4, T + 0.01, legs);

      if (!p.reducedMotion) {
        for (const l of legs) {
          if (l.type === LEG.ember) continue;
          const color = CHART[l.tone];
          const steps = l.type === LEG.pulse || l.type === LEG.flash ? 1 : TRAIL_STEPS;
          for (let k = steps - 1; k >= 0; k--) {
            const s = sampleLeg(l, T - k * 0.045);
            if (!s) continue;
            const [x, y] = project(s.p);
            const f = 1 - k / TRAIL_STEPS;
            ctx.globalAlpha = s.alpha * f * f;
            if (s.ring) {
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.2 * dpr;
              ctx.beginPath();
              ctx.arc(x, y, Math.max(1, s.size * 11 * dpr), 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, (k === 0 ? 2.4 : 1.6) * dpr * (s.size / 0.16), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = CHART.orange;
      for (const l of legs) {
        if (l.type !== LEG.ember || T < l.t0) continue;
        const [x, y] = project(l.a);
        ctx.fillRect(x - 2.2 * dpr, y - 2.2 * dpr, 4.4 * dpr, 4.4 * dpr);
      }

      if (p.selectedId && model.path) {
        ctx.strokeStyle = CHART.magenta;
        ctx.lineWidth = 1.5 * dpr;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (const l of model.path(p.selectedId)) {
          if ((l.type !== LEG.flight && l.type !== LEG.hold) || l.t0 > T) continue;
          const end = Math.min(l.t1, T);
          const n = l.type === LEG.hold ? 40 : 14;
          for (let i = 0; i <= n; i++) {
            const s = sampleLeg(l, l.t0 + ((end - l.t0) * i) / n);
            if (!s) continue;
            const [x, y] = project(s.p);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.font = `${10 * dpr}px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (const d of model.destinations()) {
        const color = d.state === "down" ? CHART.red : d.state === "holding" ? CHART.amber : ink;
        const [x, y] = project(d.pos);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        // Flip labels to the left of the node when they would run off a narrow canvas.
        const labelW = Math.max(ctx.measureText(d.label).width, ctx.measureText(d.detail).width);
        const flip = x + 10 * dpr + labelW > w - 4 * dpr;
        ctx.textAlign = flip ? "right" : "left";
        const lx = flip ? x - 10 * dpr : x + 10 * dpr;
        ctx.fillText(d.label, lx, y - 6 * dpr);
        ctx.globalAlpha = 0.7;
        ctx.fillText(d.detail, lx, y + 7 * dpr);
        ctx.globalAlpha = 1;
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(frame);

    const onClick = (ev: MouseEvent) => {
      const p = propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * dpr;
      const my = (ev.clientY - rect.top) * dpr;
      if (p.onToggleDest) {
        for (const d of p.model.destinations()) {
          const [x, y] = project(d.pos);
          if (Math.hypot(mx - x, my - y) < 14 * dpr) {
            p.onToggleDest(d.id);
            return;
          }
        }
      }
      if (!p.onSelect || !p.model.candidates) return;
      const T = p.model.time();
      let best: { id: string; d: number } | null = null;
      for (const c of p.model.candidates(T)) {
        for (const l of c.legs) {
          if (l.type !== LEG.flight && l.type !== LEG.hold) continue;
          const s = sampleLeg(l, T);
          if (!s) continue;
          const [x, y] = project(s.p);
          const dd = Math.hypot(mx - x, my - y);
          if (dd < 14 * dpr && (!best || dd < best.d)) best = { id: c.id, d: dd };
        }
      }
      if (best) p.onSelect(best.id);
    };
    canvas.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} className={props.className} role="img" aria-label={props.label} />;
}
