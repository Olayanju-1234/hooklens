"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { createPackets } from "./packet-material";
import type { World, WorldStats, Leg } from "./sim/engine";
import type { SimClock } from "./sim/clock";
import { REWIND_WINDOW } from "./sim/clock";
import {
  DESTINATIONS,
  GATE_RADIUS,
  HUB,
  LATENCY_RINGS,
  SOURCES,
  holdFor,
} from "./sim/catalog";
import { bezier, latencyRadius, racetrackPoint, racetrackPerimeter, type Vec3 } from "./sim/geometry";
import { CHART, INK, PAPER } from "./sim/palette";

export type ChapterId = "hero" | "arrivals" | "seal" | "departures" | "holding" | "recorder";

const SHOTS: Record<ChapterId, { pos: Vec3; target: Vec3 }> = {
  hero: { pos: [-2.4, 8.4, 12.6], target: [-0.7, 0, 0.9] },
  arrivals: { pos: [-10.2, 3.6, 6.4], target: [-4.4, 0.4, 0] },
  seal: { pos: [-2.9, 1.9, 3.5], target: [0, 0.9, 0] },
  departures: { pos: [-0.6, 5.8, 7.8], target: [3.4, 0.2, 0.2] },
  holding: { pos: [0.3, 2.5, 0.9], target: [2.3, 1.15, -2.9] },
  recorder: { pos: [0.9, 5.6, 2.2], target: [2.4, 0.3, -3.2] },
};

interface SceneProps {
  world: World;
  clock: SimClock;
  stats: WorldStats | null;
  chapter: ChapterId;
  reducedMotion: boolean;
  onToggleDest: (id: string) => void;
}

function curvePoints(a: Vec3, c: Vec3, b: Vec3, n = 48): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => new THREE.Vector3(...bezier(a, c, b, i / n)));
}

function arcCtrl(a: Vec3, b: Vec3, lift: number): Vec3 {
  return [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2];
}

function Packets({ world, clock }: { world: World; clock: SimClock }) {
  const packets = useMemo(() => createPackets(), []);
  const scratch = useRef<Leg[]>([]);
  const lastBuild = useRef({ version: -1, at: -1 });

  useEffect(() => () => {
    packets.geometry.dispose();
    packets.material.dispose();
  }, [packets]);

  useFrame(() => {
    clock.tick(performance.now());
    world.ensure(clock.live + 2.5);
    const now = clock.live;
    const lb = lastBuild.current;
    if (lb.version !== world.version || now - lb.at > 0.25) {
      packets.write(world.collectLegs(now - REWIND_WINDOW - 6, now + 2.5, scratch.current));
      lb.version = world.version;
      lb.at = now;
    }
    packets.setTime(clock.view, clock.mode === "scrubbing" || clock.mode === "catchup" ? 1 : clock.rewound ? 0.45 : 0);
  });

  return <mesh geometry={packets.geometry} material={packets.material} frustumCulled={false} renderOrder={10} />;
}

const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const floorFragment = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec2 g = vWorld.xz / 0.5;
    float d = length(fract(g) - 0.5);
    float w = fwidth(d) * 1.2;
    float dotA = 1.0 - smoothstep(0.045 - w, 0.045 + w, d);
    float r = length(vWorld.xz - vec2(0.4, 0.0));
    float fade = smoothstep(10.5, 2.5, r);
    float a = dotA * fade * 0.55;
    gl_FragColor = vec4(vec3(0.42, 0.46, 0.44), a);
  }
`;

function ChartFloor() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVertex,
        fragmentShader: floorFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0, 0]} material={material}>
      <planeGeometry args={[24, 16]} />
    </mesh>
  );
}

function Polyline({ points, color, opacity, dashed = false }: { points: THREE.Vector3[]; color: string; opacity: number; dashed?: boolean }) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.08, gapSize: 0.1, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const l = new THREE.Line(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [points, color, opacity, dashed]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

function RangeRings() {
  const rings = useMemo(
    () =>
      LATENCY_RINGS.map((ring) => {
        const r = latencyRadius(ring.ms);
        const pts: THREE.Vector3[] = [];
        for (let a = -64; a <= 64; a += 2) {
          const rad = (a * Math.PI) / 180;
          pts.push(new THREE.Vector3(r * Math.cos(rad), 0.01, r * Math.sin(rad)));
        }
        const end = (-64 * Math.PI) / 180;
        return { ...ring, pts, at: [r * Math.cos(end), 0.01, r * Math.sin(end)] as Vec3 };
      }),
    [],
  );
  return (
    <group>
      {rings.map((r) => (
        <group key={r.ms}>
          <Polyline points={r.pts} color="#6b7470" opacity={0.5} dashed />
          <Html position={r.at} center zIndexRange={[20, 0]} className="hub-label hub-label--ring">
            {r.label}
          </Html>
        </group>
      ))}
    </group>
  );
}

function Routes() {
  const lines = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    for (const s of SOURCES) out.push(curvePoints(s.pos, arcCtrl(s.pos, HUB, 1.7), HUB));
    for (const d of DESTINATIONS) {
      const dd = Math.hypot(d.pos[0] - HUB[0], d.pos[2] - HUB[2]);
      out.push(curvePoints(HUB, arcCtrl(HUB, d.pos, 0.55 + dd * 0.13), d.pos));
    }
    return out;
  }, []);
  return (
    <group>
      {lines.map((pts, i) => (
        <Polyline key={i} points={pts} color={INK} opacity={0.1} />
      ))}
    </group>
  );
}

function ringPoints(r: number, n: number, plane: "xz" | "yz", y = 0): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return plane === "xz"
      ? new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a))
      : new THREE.Vector3(0, r * Math.cos(a), r * Math.sin(a));
  });
}

/** The signature gate: a compass rose that turns one tick per verified event, so it rewinds with time. */
function Gate({ stats, reducedMotion }: { stats: WorldStats | null; reducedMotion: boolean }) {
  const rose = useRef<THREE.Group>(null);
  const ticks = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const inner = i % 6 === 0 ? GATE_RADIUS - 0.16 : GATE_RADIUS - 0.07;
      pts.push(new THREE.Vector3(0, inner * Math.cos(a), inner * Math.sin(a)));
      pts.push(new THREE.Vector3(0, GATE_RADIUS * Math.cos(a), GATE_RADIUS * Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: CHART.cyan, transparent: true, opacity: 0.7 }));
  }, []);
  const outer = useMemo(() => ringPoints(GATE_RADIUS + 0.06, 96, "yz"), []);
  const inner = useMemo(() => ringPoints(0.22, 48, "yz"), []);

  useFrame(() => {
    if (!rose.current || !stats) return;
    const target = (stats.verifiedTotal * Math.PI * 2) / 72;
    const cur = rose.current.rotation.x;
    rose.current.rotation.x = reducedMotion ? target : cur + (target - cur) * 0.08;
  });

  return (
    <group position={HUB}>
      <group ref={rose}>
        <primitive object={ticks} />
      </group>
      <Polyline points={outer} color={CHART.cyan} opacity={0.3} />
      <Polyline points={inner} color={CHART.cyan} opacity={0.45} />
      <Html position={[0, GATE_RADIUS + 0.42, 0]} center zIndexRange={[20, 0]} className="hub-label hub-label--gate">
        <span>SIGNATURE GATE</span>
        <small>{stats ? `${stats.sealedPct.toFixed(1)}% sealed` : "—"}</small>
      </Html>
    </group>
  );
}

function SourceNodes() {
  const tri = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      pts.push(new THREE.Vector3(0.2 * Math.cos(a), 0.02, 0.2 * Math.sin(a)));
    }
    return pts;
  }, []);
  return (
    <group>
      {SOURCES.map((s) => (
        <group key={s.id} position={s.pos}>
          <Polyline points={tri} color={INK} opacity={0.6} />
          <Html position={[-0.15, 0, 0.42]} center zIndexRange={[20, 0]} className="hub-label hub-label--source">
            <span>{s.label}</span>
            <small>{s.kind}</small>
          </Html>
        </group>
      ))}
    </group>
  );
}

function DestinationNode({ dest, stats, onToggle }: { dest: (typeof DESTINATIONS)[number]; stats: WorldStats | null; onToggle: (id: string) => void }) {
  const ds = stats?.dests[dest.id];
  const tone = ds?.down ? CHART.red : ds && ds.holding > 0 ? CHART.amber : INK;
  const circle = useMemo(() => ringPoints(0.3, 48, "xz", 0.02), []);
  const ticks = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      out.push([new THREE.Vector3(0.3 * Math.cos(a), 0.02, 0.3 * Math.sin(a)), new THREE.Vector3(0.44 * Math.cos(a), 0.02, 0.44 * Math.sin(a))]);
    }
    return out;
  }, []);
  const holds = useMemo(
    () =>
      [0, 1, 2].map((lvl) => {
        const rt = holdFor(dest, lvl);
        const P = racetrackPerimeter(rt);
        return Array.from({ length: 65 }, (_, i) => {
          const p = racetrackPoint(rt, (i / 64) * P);
          return new THREE.Vector3(p[0] - dest.pos[0], p[1] - dest.pos[1], p[2] - dest.pos[2]);
        });
      }),
    [dest],
  );
  const state = ds?.down ? "DOWN" : ds && ds.holding > 0 ? `HOLDING ${ds.holding}` : "OK";
  return (
    <group position={dest.pos}>
      <Polyline points={circle} color={tone} opacity={0.75} />
      {ticks.map((t, i) => (
        <Polyline key={i} points={t} color={tone} opacity={0.75} />
      ))}
      {ds && ds.holding > 0 &&
        holds.map((pts, i) => <Polyline key={i} points={pts} color={CHART.amber} opacity={0.45} dashed />)}
      <Html position={[0.15, 0, 0.62]} center zIndexRange={[20, 0]} className="hub-label hub-label--dest">
        <button
          type="button"
          className="hub-dest"
          data-state={ds?.down ? "down" : ds && ds.holding > 0 ? "holding" : "ok"}
          onClick={() => onToggle(dest.id)}
          aria-label={`${dest.host}, ${state}. ${ds?.down ? "Restore" : "Take down"} this destination`}
        >
          <span>{dest.host}</span>
          <small>
            p50 {dest.p50}ms · {state}
            {ds && ds.dead > 0 ? ` · ${ds.dead} dead` : ""}
          </small>
        </button>
      </Html>
    </group>
  );
}

function CameraRig({ chapter, reducedMotion }: { chapter: ChapterId; reducedMotion: boolean }) {
  const { camera, pointer, size } = useThree();
  const look = useRef(new THREE.Vector3(...SHOTS.hero.target));
  const goal = useRef(new THREE.Vector3());
  const goalLook = useRef(new THREE.Vector3());
  const narrow = size.width < 720;

  useFrame((_, delta) => {
    const shot = SHOTS[chapter];
    goal.current.set(...shot.pos);
    goalLook.current.set(...shot.target);
    if (narrow) {
      goal.current.add(new THREE.Vector3(1.8, 3.4, 5.6));
      goalLook.current.add(new THREE.Vector3(1.8, 0, 3.4));
    }
    if (!reducedMotion) goal.current.add(new THREE.Vector3(pointer.x * 0.5, pointer.y * 0.3, 0));
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.2);
    camera.position.lerp(goal.current, k);
    look.current.lerp(goalLook.current, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Scene(props: SceneProps) {
  return (
    <>
      <ChartFloor />
      <RangeRings />
      <Routes />
      <SourceNodes />
      <Gate stats={props.stats} reducedMotion={props.reducedMotion} />
      {DESTINATIONS.map((d) => (
        <DestinationNode key={d.id} dest={d} stats={props.stats} onToggle={props.onToggleDest} />
      ))}
      <Packets world={props.world} clock={props.clock} />
      <CameraRig chapter={props.chapter} reducedMotion={props.reducedMotion} />
    </>
  );
}

export default function HubScene(props: SceneProps & { active: boolean }) {
  return (
    <Canvas
      className="hub-canvas"
      frameloop={props.active ? "always" : "never"}
      camera={{ position: SHOTS.hero.pos, fov: 38, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor(PAPER, 1)}
      aria-hidden
    >
      <Scene {...props} />
    </Canvas>
  );
}
