import * as THREE from "three";
import { TONES, type Leg } from "./sim/engine";
import { NIGHT, rgb } from "./sim/palette";

export const TRAIL = 7;
export const LEG_CAPACITY = 14000;
const SIZE_SCALE = 1.45;

const vertex = /* glsl */ `
  #define TRAIL ${TRAIL.toFixed(1)}
  uniform float uTime;
  uniform float uTrailDt;
  uniform float uRewind;
  attribute vec4 aT;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aC;
  attribute vec4 aM;
  attribute float aTrail;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;

  float easeF(float t, float e) {
    if (e < 0.5) return t;
    if (e < 1.5) return 1.0 - pow(1.0 - t, 3.0);
    if (e < 2.5) return t * t * t;
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  // Mirrors racetrackPoint() in sim/geometry.ts.
  vec3 racetrack(vec3 c, vec2 d2, float L, float r, float s) {
    vec3 d = vec3(d2.x, 0.0, d2.y);
    vec3 n = vec3(-d2.y, 0.0, d2.x);
    float PI = 3.14159265359;
    float P = 2.0 * L + 2.0 * PI * r;
    s = mod(s, P);
    if (s < L) return c + (-0.5 * L + s) * d + r * n;
    s -= L;
    if (s < PI * r) { float a = s / r; return c + 0.5 * L * d + r * (n * cos(a) + d * sin(a)); }
    s -= PI * r;
    if (s < L) return c + (0.5 * L - s) * d - r * n;
    s -= L;
    float a = s / r;
    return c - 0.5 * L * d + r * (-n * cos(a) - d * sin(a));
  }

  void main() {
    float k = aTrail;
    float type = aT.z;
    bool single = type > 2.5;
    float ts = uTime - k * uTrailDt * (1.0 + uRewind * 2.0);
    if ((single && k > 0.5) || ts < aT.x || ts > aT.y) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }
    float u = clamp((ts - aT.x) / max(aT.y - aT.x, 1e-4), 0.0, 1.0);
    float size = aT.w;
    float alpha = 1.0;
    vRing = 0.0;
    vec3 p;
    if (type < 0.5) {
      float e = easeF(u, aM.x);
      float iu = 1.0 - e;
      p = iu * iu * aA + 2.0 * iu * e * aB + e * e * aC;
    } else if (type < 1.5) {
      p = racetrack(aA, aB.xy, aC.x, aC.y, aB.z + aC.z * (ts - aT.x));
    } else if (type < 2.5) {
      float tt = ts - aT.x;
      p = aA + aB * tt;
      p.y = max(aC.y, aA.y + aB.y * tt - 0.5 * aC.x * tt * tt);
      alpha = 1.0 - u;
    } else if (type < 3.5) {
      vRing = 1.0;
      float e = 1.0 - (1.0 - u) * (1.0 - u);
      size = mix(size * 0.2, size, e);
      alpha = 1.0 - u;
      p = aA;
    } else if (type < 4.5) {
      p = aA;
      alpha = 0.55 + 0.45 * exp(-(ts - aT.x) * 1.5);
    } else {
      vRing = 1.0;
      size = size * (1.0 + 1.2 * u);
      alpha = 1.0 - u;
      p = aA;
    }
    float f = 1.0 - k / TRAIL;
    alpha *= f * f;
    size *= mix(1.0, 0.3, k / TRAIL);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy * 2.0;
    vColor = mix(aM.yzw, vec3(1.0, 0.31, 0.85), uRewind * 0.6);
    vAlpha = alpha;
  }
`;

const fragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    float d = length(vUv);
    if (d > 1.0) discard;
    float a;
    if (vRing > 0.5) {
      a = smoothstep(0.1, 0.0, abs(d - 0.82)) * 0.9;
    } else {
      float core = smoothstep(0.34, 0.12, d);
      float glow = exp(-d * d * 7.0) * 0.6;
      a = core + glow;
    }
    a *= vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const TONE_RGB = new Map(TONES.map((t) => [t, rgb(NIGHT[t])]));

export interface PacketBuffers {
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  write: (legs: Leg[]) => void;
  setTime: (time: number, rewindTarget: number) => void;
}

export function createPackets(): PacketBuffers {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));

  const perLeg = (size: number) => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(LEG_CAPACITY * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    attr.meshPerAttribute = TRAIL;
    return attr;
  };
  const aT = perLeg(4);
  const aA = perLeg(3);
  const aB = perLeg(3);
  const aC = perLeg(3);
  const aM = perLeg(4);
  geometry.setAttribute("aT", aT);
  geometry.setAttribute("aA", aA);
  geometry.setAttribute("aB", aB);
  geometry.setAttribute("aC", aC);
  geometry.setAttribute("aM", aM);

  const trail = new Float32Array(LEG_CAPACITY * TRAIL);
  for (let i = 0; i < trail.length; i++) trail[i] = i % TRAIL;
  geometry.setAttribute("aTrail", new THREE.InstancedBufferAttribute(trail, 1));
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { uTime: { value: 0 }, uTrailDt: { value: 0.034 }, uRewind: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const write = (legs: Leg[]) => {
    const n = Math.min(legs.length, LEG_CAPACITY);
    const start = legs.length - n;
    const T = aT.array as Float32Array;
    const A = aA.array as Float32Array;
    const B = aB.array as Float32Array;
    const C = aC.array as Float32Array;
    const M = aM.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const l = legs[start + i];
      const i4 = i * 4;
      const i3 = i * 3;
      T[i4] = l.t0;
      T[i4 + 1] = l.t1;
      T[i4 + 2] = l.type;
      T[i4 + 3] = l.size * SIZE_SCALE;
      A[i3] = l.a[0]; A[i3 + 1] = l.a[1]; A[i3 + 2] = l.a[2];
      B[i3] = l.b[0]; B[i3 + 1] = l.b[1]; B[i3 + 2] = l.b[2];
      C[i3] = l.c[0]; C[i3 + 1] = l.c[1]; C[i3 + 2] = l.c[2];
      const c = TONE_RGB.get(l.tone)!;
      M[i4] = l.ease; M[i4 + 1] = c[0]; M[i4 + 2] = c[1]; M[i4 + 3] = c[2];
    }
    for (const attr of [aT, aA, aB, aC, aM]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
    geometry.instanceCount = n * TRAIL;
  };

  const setTime = (time: number, rewindTarget: number) => {
    const u = material.uniforms;
    u.uTime.value = time;
    u.uRewind.value += (rewindTarget - u.uRewind.value) * 0.12;
  };

  return { geometry, material, write, setTime };
}
