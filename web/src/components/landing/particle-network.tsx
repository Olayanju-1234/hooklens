"use client";

import { useRef, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ─── Constants ─────────────────────────────────────────── */
const PARTICLE_COUNT = 180;
const FLOW_COUNT = 5;
const CONNECTION_DISTANCE = 2.2;
const MOUSE_REPEL_RADIUS = 3;
const MOUSE_REPEL_FORCE = 0.08;

/* ─── Flow paths — curved lines through 3D space ──────── */
function generateFlowPath(): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const startX = -12 + Math.random() * 4;
  const endX = 8 + Math.random() * 4;
  const segments = 4 + Math.floor(Math.random() * 3);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(
      new THREE.Vector3(
        THREE.MathUtils.lerp(startX, endX, t),
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4,
      ),
    );
  }

  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

/* ─── A single flow of particles along a curve ─────────── */
interface FlowParticle {
  t: number;
  speed: number;
  offset: THREE.Vector3;
  size: number;
  valid: boolean;
}

function createFlowParticles(count: number): FlowParticle[] {
  return Array.from({ length: count }, () => ({
    t: Math.random(),
    speed: 0.001 + Math.random() * 0.003,
    offset: new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
    ),
    size: 0.02 + Math.random() * 0.04,
    valid: Math.random() > 0.12,
  }));
}

function FlowStream({ curve, color, count }: { curve: THREE.CatmullRomCurve3; color: THREE.Color; count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempMatrix = useRef(new THREE.Matrix4()).current;
  const tempVec = useRef(new THREE.Vector3()).current;
  const particlesRef = useRef<FlowParticle[]>(createFlowParticles(count));
  const invalidColor = useRef(new THREE.Color(0.9, 0.2, 0.2)).current;

  useFrame(() => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.t += p.speed;
      if (p.t > 1) p.t -= 1;

      curve.getPoint(p.t, tempVec);
      tempVec.add(p.offset);

      const scale = p.size * (0.6 + Math.sin(p.t * Math.PI) * 0.4);
      tempMatrix.makeScale(scale, scale, scale);
      tempMatrix.setPosition(tempVec);
      meshRef.current.setMatrixAt(i, tempMatrix);
      meshRef.current.setColorAt(i, p.valid ? color : invalidColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.85} toneMapped={false} />
    </instancedMesh>
  );
}

/* ─── Ambient floating particles ───────────────────────── */
interface AmbientParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
}

function createAmbientParticles(): AmbientParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    pos: new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 8,
    ),
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 0.003,
      (Math.random() - 0.5) * 0.003,
      (Math.random() - 0.5) * 0.002,
    ),
    size: 0.015 + Math.random() * 0.03,
  }));
}

function AmbientParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempMatrix = useRef(new THREE.Matrix4()).current;
  const { viewport } = useThree();
  const particlesRef = useRef<AmbientParticle[]>(createAmbientParticles());

  useFrame(({ pointer }) => {
    if (!meshRef.current) return;
    const particles = particlesRef.current;

    const mx = (pointer.x * viewport.width) / 2;
    const my = (pointer.y * viewport.height) / 2;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Mouse repulsion
      const dx = p.pos.x - mx;
      const dy = p.pos.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_REPEL_RADIUS && dist > 0.01) {
        const force = (1 - dist / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_FORCE;
        p.vel.x += (dx / dist) * force;
        p.vel.y += (dy / dist) * force;
      }

      // Damping
      p.vel.x *= 0.98;
      p.vel.y *= 0.98;
      p.vel.z *= 0.98;

      p.pos.add(p.vel);

      // Wrap around
      if (p.pos.x > 10) p.pos.x = -10;
      if (p.pos.x < -10) p.pos.x = 10;
      if (p.pos.y > 6) p.pos.y = -6;
      if (p.pos.y < -6) p.pos.y = 6;

      tempMatrix.makeScale(p.size, p.size, p.size);
      tempMatrix.setPosition(p.pos);
      meshRef.current.setMatrixAt(i, tempMatrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#4a4a45" transparent opacity={0.4} toneMapped={false} />
    </instancedMesh>
  );
}

/* ─── Connection lines between nearby ambient particles ── */
function ConnectionLines() {
  const lineRef = useRef<THREE.LineSegments>(null);
  const positionsRef = useRef(new Float32Array(5000 * 6));
  const colorsRef = useRef(new Float32Array(5000 * 6));
  const matRef = useRef(new THREE.Matrix4());
  const posARef = useRef(new THREE.Vector3());
  const posBRef = useRef(new THREE.Vector3());

  useFrame(({ scene }) => {
    if (!lineRef.current) return;

    const ambient = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh && c.count === PARTICLE_COUNT,
    ) as THREE.InstancedMesh | undefined;
    if (!ambient) return;

    const positions = positionsRef.current;
    const colors = colorsRef.current;
    const mat = matRef.current;
    const posA = posARef.current;
    const posB = posBRef.current;
    let idx = 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      ambient.getMatrixAt(i, mat);
      posA.setFromMatrixPosition(mat);

      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        ambient.getMatrixAt(j, mat);
        posB.setFromMatrixPosition(mat);

        const dist = posA.distanceTo(posB);
        if (dist < CONNECTION_DISTANCE) {
          const alpha = 1 - dist / CONNECTION_DISTANCE;
          positions[idx * 6] = posA.x;
          positions[idx * 6 + 1] = posA.y;
          positions[idx * 6 + 2] = posA.z;
          positions[idx * 6 + 3] = posB.x;
          positions[idx * 6 + 4] = posB.y;
          positions[idx * 6 + 5] = posB.z;

          const c = alpha * 0.15;
          colors[idx * 6] = c;
          colors[idx * 6 + 1] = c;
          colors[idx * 6 + 2] = c;
          colors[idx * 6 + 3] = c;
          colors[idx * 6 + 4] = c;
          colors[idx * 6 + 5] = c;

          idx++;
          if (idx > 800) break;
        }
      }
      if (idx > 800) break;
    }

    const geom = lineRef.current.geometry;
    geom.setAttribute("position", new THREE.BufferAttribute(positions.slice(0, idx * 6), 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors.slice(0, idx * 6), 3));
    geom.setDrawRange(0, idx * 2);
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial vertexColors transparent opacity={0.6} toneMapped={false} />
    </lineSegments>
  );
}

/* ─── Pre-generate flows outside component ─────────────── */
const ACCENT = new THREE.Color(0x2ec4a2);
const DIM = new THREE.Color(0x2ec4a2).multiplyScalar(0.5);
const FLOWS = Array.from({ length: FLOW_COUNT }, (_, i) => ({
  curve: generateFlowPath(),
  color: i % 2 === 0 ? ACCENT : DIM,
  count: 20 + Math.floor(Math.random() * 15),
}));

/* ─── Scene composition ────────────────────────────────── */
function Scene() {
  const flows = FLOWS;

  return (
    <>
      <AmbientParticles />
      <ConnectionLines />
      {flows.map((f, i) => (
        <FlowStream key={i} curve={f.curve} color={f.color} count={f.count} />
      ))}
    </>
  );
}

/* ─── Exported component ───────────────────────────────── */
export default function ParticleNetwork() {
  const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    state.gl.setClearColor(0x000000, 0);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
        onCreated={handleCreated}
        style={{ pointerEvents: "auto" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
