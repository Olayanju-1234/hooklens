"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LEG, sampleLeg, type Leg, type Tone, type World, type WorldStats } from "./sim/engine";
import type { SimClock } from "./sim/clock";
import { DESTINATIONS, HUB, LATENCY_RINGS, SOURCES, GATE_RADIUS } from "./sim/catalog";
import { latencyRadius, type Vec3 } from "./sim/geometry";
import { DAY, NIGHT } from "./sim/palette";

interface Props {
  world: World;
  clock: SimClock;
  theme: "night" | "day";
  stats: WorldStats | null;
  reducedMotion: boolean;
  selectedId?: string | null;
  onSelect?: (eventId: string) => void;
  onToggleDest?: (destId: string) => void;
  className?: string;
  label: string;
}

const X_MIN = -8.6;
const X_MAX = 7.3;
const Z_MIN = -5.9;
const Z_MAX = 5.9;
const TRAIL_STEPS = 5;

interface Projector {
  (p: Vec3): [number, number];
}

function makeProjector(w: number, h: number, dpr: number): Projector {
  const pad = 18 * dpr;
  const sx = (w - pad * 2) / (X_MAX - X_MIN);
  const sz = (h - pad * 2) / (Z_MAX - Z_MIN);
  const alt = Math.min(sx, sz) * 0.42;
  return (p) => [pad + (p[0] - X_MIN) * sx, pad + (p[2] - Z_MIN) * sz - p[1] * alt];
}

function cssVar(el: Element, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export function RouteMap2D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let project: Projector = makeProjector(1, 1, 1);
    let staticLayer: HTMLCanvasElement | null = null;
    let staticKey = "";
    const legs: Leg[] = [];
    let lastExposure = -1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      project = makeProjector(w, h, dpr);
      staticKey = "";
      lastExposure = -1;
    };

    const drawStatic = (palette: Record<Tone, string>, ink: string, faint: string, mono: string) => {
      const layer = document.createElement("canvas");
      layer.width = w;
      layer.height = h;
      const g = layer.getContext("2d")!;
      g.fillStyle = faint;
      const step = 0.5;
      for (let x = X_MIN; x <= X_MAX; x += step) {
        for (let z = Z_MIN; z <= Z_MAX; z += step) {
          const [px, py] = project([x, 0, z]);
          g.fillRect(px, py, dpr, dpr);
        }
      }
      g.strokeStyle = faint;
      g.lineWidth = dpr;
      g.setLineDash([3 * dpr, 4 * dpr]);
      g.font = `${9 * dpr}px ${mono}`;
      g.fillStyle = faint;
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
      g.globalAlpha = 0.14;
      for (const s of SOURCES) {
        const [ax, ay] = project(s.pos);
        const [bx, by] = project(HUB);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      for (const d of DESTINATIONS) {
        const [ax, ay] = project(HUB);
        const [bx, by] = project(d.pos);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.font = `${10 * dpr}px ${mono}`;
      g.textBaseline = "middle";
      for (const s of SOURCES) {
        const [px, py] = project(s.pos);
        g.strokeStyle = ink;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.moveTo(px, py - 5 * dpr);
        g.lineTo(px + 4.5 * dpr, py + 3 * dpr);
        g.lineTo(px - 4.5 * dpr, py + 3 * dpr);
        g.closePath();
        g.stroke();
        g.globalAlpha = 0.85;
        g.fillStyle = ink;
        g.textAlign = "right";
        g.fillText(s.label.toUpperCase(), px - 9 * dpr, py);
      }
      g.globalAlpha = 1;
      const [hx, hy] = project(HUB);
      g.strokeStyle = palette.cyan;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.ellipse(hx, hy, GATE_RADIUS * 3.2 * dpr, GATE_RADIUS * 9 * dpr, 0, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rx = GATE_RADIUS * 3.2 * dpr;
        const ry = GATE_RADIUS * 9 * dpr;
        g.beginPath();
        g.moveTo(hx + Math.cos(a) * rx, hy + Math.sin(a) * ry);
        g.lineTo(hx + Math.cos(a) * (rx - 2.5 * dpr), hy + Math.sin(a) * (ry - 2.5 * dpr));
        g.stroke();
      }
      g.globalAlpha = 1;
      return layer;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      const { world, clock } = p;
      clock.tick(performance.now());
      world.ensure(clock.live + 2.5);
      const T = clock.view;
      if (p.reducedMotion && Math.floor(T) === lastExposure) return;
      lastExposure = Math.floor(T);

      const palette = p.theme === "day" ? DAY : NIGHT;
      const ink = cssVar(canvas, "--ink", p.theme === "day" ? "#1B1D1B" : "#ECEAE2");
      const faint = cssVar(canvas, "--ink-faint", p.theme === "day" ? "#B9B6AC" : "#2E3430");
      const mono = cssVar(canvas, "--lab-mono", "ui-monospace, monospace");
      const key = `${p.theme}|${w}|${h}|${ink}|${faint}`;
      if (key !== staticKey) {
        staticLayer = drawStatic(palette, ink, faint, mono);
        staticKey = key;
      }

      ctx.clearRect(0, 0, w, h);
      if (staticLayer) ctx.drawImage(staticLayer, 0, 0);
      const glow = p.theme === "night";

      world.collectLegs(T - 0.4, T + 0.01, legs);
      ctx.globalCompositeOperation = glow ? "lighter" : "source-over";

      if (!p.reducedMotion) {
        for (const l of legs) {
          if (l.type === LEG.ember) continue;
          const color = palette[l.tone];
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
              ctx.arc(x, y, (k === 0 ? 2.3 : 1.6) * dpr * (s.size / 0.16), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = palette.orange;
      for (const l of legs) {
        if (l.type !== LEG.ember || T < l.t0) continue;
        const [x, y] = project(l.a);
        ctx.fillRect(x - 2.2 * dpr, y - 2.2 * dpr, 4.4 * dpr, 4.4 * dpr);
      }

      if (p.selectedId) {
        const ev = world.find(p.selectedId);
        if (ev) {
          const j = world.journey(ev);
          ctx.strokeStyle = palette.magenta;
          ctx.lineWidth = 1.5 * dpr;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          for (const l of j.legs) {
            if (l.type !== LEG.flight && l.type !== LEG.hold) continue;
            if (l.t0 > T) continue;
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
      }

      ctx.font = `${10 * dpr}px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (const d of DESTINATIONS) {
        const ds = p.stats?.dests[d.id];
        const color = ds?.down ? palette.red : ds && ds.holding > 0 ? palette.amber : ink;
        const [x, y] = project(d.pos);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(d.host, x + 10 * dpr, y - 6 * dpr);
        ctx.globalAlpha = 0.6;
        const state = ds?.down ? "DOWN" : ds && ds.holding > 0 ? `HOLD ×${ds.holding}` : `p50 ${d.p50}ms`;
        ctx.fillText(`${state}${ds && ds.dead ? ` · ${ds.dead} DLQ` : ""}`, x + 10 * dpr, y + 7 * dpr);
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
      for (const d of DESTINATIONS) {
        const [x, y] = project(d.pos);
        if (p.onToggleDest && Math.hypot(mx - x, my - y) < 14 * dpr) {
          p.onToggleDest(d.id);
          return;
        }
      }
      if (!p.onSelect) return;
      const T = p.clock.view;
      let best: { id: string; d: number } | null = null;
      for (const e of p.world.between(T - 40, T)) {
        const j = p.world.journey(e);
        for (const l of j.legs) {
          if (l.type !== LEG.flight && l.type !== LEG.hold) continue;
          const s = sampleLeg(l, T);
          if (!s) continue;
          const [x, y] = project(s.p);
          const dd = Math.hypot(mx - x, my - y);
          if (dd < 14 * dpr && (!best || dd < best.d)) best = { id: e.id, d: dd };
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
