import * as THREE from 'three';
import { RNG, hashString } from '../core/utils';

/**
 * Sky dome (gradient + sun glow + chunky PSX clouds in one fragment shader) and a low-poly mountain/hills horizon ring.
 * The dome follows the camera. OWNER: world module.
 */

export interface SkyOptions {
  zenith: number;
  mid: number;
  horizon: number;
  sunColor: number;
  /** Direction TOWARDS the sun (not normalised). */
  sunDir: [number, number, number];
  cloudLight: number;
  cloudShade: number;
  /** 0 clear .. 1 overcast */
  cloudCover: number;
  stars?: boolean;
  radius?: number;
}

/** A full dome colour set as Colors (linear), with the cloud cover. Owned by the caller; see Sky.snapshotInto / copyColors. */
export interface SkyColorSet {
  zenith: THREE.Color; mid: THREE.Color; horizon: THREE.Color; sunColor: THREE.Color;
  cloudLight: THREE.Color; cloudShade: THREE.Color; cover: number;
}

export function makeSkyColorSet(): SkyColorSet {
  return {
    zenith: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(), sunColor: new THREE.Color(),
    cloudLight: new THREE.Color(), cloudShade: new THREE.Color(), cover: 0,
  };
}

export const GOLDEN_HOUR_SKY: SkyOptions = {
  zenith: 0x4f7cc4,
  mid: 0xa8b4d0,
  horizon: 0xffd2a0,
  sunColor: 0xffb060,
  sunDir: [-0.64, 0.42, 0.64],
  cloudLight: 0xfff0e0,
  cloudShade: 0xd88a78,
  cloudCover: 0.52,
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.9999; // always at the far plane
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCloudLight;
uniform vec3 uCloudShade;
uniform float uCover;
uniform float uTime;
uniform float uStars;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float glow = pow(sd, 5.0) * 0.32 + pow(sd, 40.0) * 0.55;
  col += uSunColor * glow;
  float disc = smoothstep(0.9988, 0.9993, sd);
  col = mix(col, vec3(1.6, 1.25, 0.8), disc);

  // chunky clouds on a virtual plane
  if (h > 0.01) {
    vec2 uv = d.xz / (h + 0.22) * 1.35 + vec2(uTime * 0.012, uTime * 0.006);
    uv = floor(uv * 26.0) / 26.0; // PSX-chunky
    float n = fbm(uv * 1.7);
    float c = smoothstep(1.0 - uCover - 0.1, 1.0 - uCover + 0.18, n);
    c = floor(c * 4.0 + 0.5) / 4.0; // posterise
    float shade = fbm(uv * 1.7 + vec2(0.9, 0.55));
    vec3 cc = mix(uCloudLight, uCloudShade, clamp((n - shade) * 3.0 + 0.35, 0.0, 1.0));
    cc = mix(cc, uSunColor * 1.1, pow(sd, 3.0) * 0.5);
    float fade = smoothstep(0.01, 0.2, h);
    col = mix(col, cc, c * fade * 0.92);
  }
  if (uStars > 0.5 && h > 0.0) {
    vec2 sp = floor(d.xz / (h + 0.3) * 120.0);
    float s = step(0.992, hash(sp));
    col += vec3(s) * smoothstep(0.1, 0.5, h);
  }
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, smoothstep(0.0, -0.4, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  readonly dome: THREE.Mesh;
  readonly sunDir: THREE.Vector3;
  private mat: THREE.ShaderMaterial;
  private readonly tgt = {
    zenith: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color(),
    sunColor: new THREE.Color(), cloudLight: new THREE.Color(), cloudShade: new THREE.Color(),
  };
  private tgtCover = 0.5;

  constructor(o: SkyOptions = GOLDEN_HOUR_SKY) {
    const geo = new THREE.SphereGeometry(o.radius ?? 380, 28, 18);
    this.sunDir = new THREE.Vector3(...o.sunDir).normalize();
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(o.zenith) },
        uMid: { value: new THREE.Color(o.mid) },
        uHorizon: { value: new THREE.Color(o.horizon) },
        uSunColor: { value: new THREE.Color(o.sunColor) },
        uSunDir: { value: this.sunDir.clone() },
        uCloudLight: { value: new THREE.Color(o.cloudLight) },
        uCloudShade: { value: new THREE.Color(o.cloudShade) },
        uCover: { value: o.cloudCover },
        uTime: { value: 0 },
        uStars: { value: o.stars ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.dome.name = 'sky';
  }

  update(camera: THREE.Camera, time: number): void {
    this.dome.position.copy(camera.position);
    this.mat.uniforms.uTime.value = time;
  }

  /** Same as update() for callers without a camera (dungeon builds): the dome centres on `pos`. */
  follow(pos: THREE.Vector3, time: number): void {
    this.dome.position.copy(pos);
    this.mat.uniforms.uTime.value = time;
  }

  /** Colours that step() blends towards (per-room sky, P-08: blends like fog). Stars switch at once. */
  setTarget(o: SkyOptions): void {
    this.tgt.zenith.setHex(o.zenith);
    this.tgt.mid.setHex(o.mid);
    this.tgt.horizon.setHex(o.horizon);
    this.tgt.sunColor.setHex(o.sunColor);
    this.tgt.cloudLight.setHex(o.cloudLight);
    this.tgt.cloudShade.setHex(o.cloudShade);
    this.tgtCover = o.cloudCover;
    this.mat.uniforms.uStars.value = o.stars ? 1 : 0;
  }

  /** Moves the current colours the fraction k (0..1) of the way to the setTarget() colours. */
  step(k: number): void {
    const u = this.mat.uniforms;
    (u.uZenith.value as THREE.Color).lerp(this.tgt.zenith, k);
    (u.uMid.value as THREE.Color).lerp(this.tgt.mid, k);
    (u.uHorizon.value as THREE.Color).lerp(this.tgt.horizon, k);
    (u.uSunColor.value as THREE.Color).lerp(this.tgt.sunColor, k);
    (u.uCloudLight.value as THREE.Color).lerp(this.tgt.cloudLight, k);
    (u.uCloudShade.value as THREE.Color).lerp(this.tgt.cloudShade, k);
    u.uCover.value += (this.tgtCover - u.uCover.value) * k;
  }

  /** Re-tints the dome (region atmosphere blending, GDD_OPENWORLD §8.1). Omitted fields keep their current value. */
  /** Copies the current dome colours and cover into `o` (no allocation). The world clock takes this as its day base each frame. */
  snapshotInto(o: SkyColorSet): void {
    const u = this.mat.uniforms;
    o.zenith.copy(u.uZenith.value as THREE.Color);
    o.mid.copy(u.uMid.value as THREE.Color);
    o.horizon.copy(u.uHorizon.value as THREE.Color);
    o.sunColor.copy(u.uSunColor.value as THREE.Color);
    o.cloudLight.copy(u.uCloudLight.value as THREE.Color);
    o.cloudShade.copy(u.uCloudShade.value as THREE.Color);
    o.cover = u.uCover.value as number;
  }

  /** Writes a full colour set into the dome uniforms (no allocation). */
  copyColors(c: SkyColorSet): void {
    const u = this.mat.uniforms;
    (u.uZenith.value as THREE.Color).copy(c.zenith);
    (u.uMid.value as THREE.Color).copy(c.mid);
    (u.uHorizon.value as THREE.Color).copy(c.horizon);
    (u.uSunColor.value as THREE.Color).copy(c.sunColor);
    (u.uCloudLight.value as THREE.Color).copy(c.cloudLight);
    (u.uCloudShade.value as THREE.Color).copy(c.cloudShade);
    u.uCover.value = c.cover;
  }

  setColors(c: { zenith?: number; mid?: number; horizon?: number; sunColor?: number; cloudLight?: number; cloudShade?: number; cover?: number }): void {
    const u = this.mat.uniforms;
    if (c.zenith !== undefined) (u.uZenith.value as THREE.Color).setHex(c.zenith);
    if (c.mid !== undefined) (u.uMid.value as THREE.Color).setHex(c.mid);
    if (c.horizon !== undefined) (u.uHorizon.value as THREE.Color).setHex(c.horizon);
    if (c.sunColor !== undefined) (u.uSunColor.value as THREE.Color).setHex(c.sunColor);
    if (c.cloudLight !== undefined) (u.uCloudLight.value as THREE.Color).setHex(c.cloudLight);
    if (c.cloudShade !== undefined) (u.uCloudShade.value as THREE.Color).setHex(c.cloudShade);
    if (c.cover !== undefined) u.uCover.value = c.cover;
  }

  dispose(): void {
    this.dome.removeFromParent();
    this.dome.geometry.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Horizon ring: jagged low-poly hills / mountains, vertex coloured, hazy.
// ---------------------------------------------------------------------------

export interface RingOptions {
  radius: number;
  /** Min / max peak height. */
  minH: number;
  maxH: number;
  segments?: number;
  seed?: string;
  baseColor: number;
  rockColor: number;
  snowColor?: number;
  snowLine?: number; // 0..1 of height
  /** Blend toward this colour (distance haze). */
  haze: number;
  hazeAmount: number;
  /** Extra haze at the ring base that fades to none at the peaks: a tall far ring then melts into the fog at its foot and keeps dark ridges. */
  baseHaze?: number;
  /** Ring thickness (how far inwards the slope extends). */
  slope?: number;
  y?: number;
  sunDir?: [number, number, number];
}

export function makeMountainRing(o: RingOptions): THREE.Mesh {
  const N = o.segments ?? 72;
  const rng = new RNG(hashString(o.seed ?? 'ring'));
  const rows = 4;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color(o.baseColor), rock = new THREE.Color(o.rockColor), snow = new THREE.Color(o.snowColor ?? 0xffffff), haze = new THREE.Color(o.haze);
  // jagged height profile
  const heights: number[] = [];
  const offs: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const big = 0.5 + 0.5 * Math.sin(a * 3 + 1.3) * Math.sin(a * 5 + 0.2);
    const jag = rng.next();
    heights.push(o.minH + (o.maxH - o.minH) * Math.min(1, big * 0.55 + jag * 0.55));
    offs.push(rng.range(-0.05, 0.05));
  }
  const slope = o.slope ?? 0.9;
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = heights[i];
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1); // 0 base .. 1 peak
      const rad = o.radius - t * h * slope + offs[i] * o.radius * (1 - t);
      const y = (o.y ?? -4) + t * (h + 4) + (r > 0 && r < rows - 1 ? rng.range(-0.06, 0.06) * h : 0);
      pos.push(ca * rad, y, sa * rad);
      // colour by height fraction
      const f = t;
      if (f < 0.35) c.copy(base).lerp(rock, f / 0.35 * 0.6);
      else if (f < (o.snowLine ?? 2)) c.copy(rock).lerp(base, 0.1);
      else c.copy(snow);
      if (o.snowColor && f >= (o.snowLine ?? 0.78)) c.copy(snow);
      // base rows melt into the fog colour (baseHaze), peaks keep the rock/forest tone: a silhouette, not a flat wall
      c.lerp(haze, o.hazeAmount + (o.baseHaze ?? 0) * (1 - f) * (1 - o.hazeAmount));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r, b = j * rows + r, cc = j * rows + r + 1, d = i * rows + r + 1;
      idx.push(a, b, cc, a, cc, d);
    }
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g0.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g0.setIndex(idx);
  // flat shading baked into vertex colours (no sun-orange tint, fully controllable haze)
  const g = g0.toNonIndexed();
  g0.dispose();
  g.computeVertexNormals();
  const sun = new THREE.Vector3(...(o.sunDir ?? [-0.64, 0.42, 0.64])).normalize();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const cc = g.attributes.color as THREE.BufferAttribute;
  const v = new THREE.Vector3(), hz = new THREE.Color(o.haze);
  for (let i = 0; i < nrm.count; i++) {
    v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    // the ring is viewed from inside: flip normals that point away from the centre so both faces light the same
    const px = (g.attributes.position as THREE.BufferAttribute).getX(i), pz = (g.attributes.position as THREE.BufferAttribute).getZ(i);
    if (v.x * px + v.z * pz > 0) v.multiplyScalar(-1);
    const l = 0.62 + 0.5 * Math.max(0, v.dot(sun)) + 0.1 * Math.max(0, v.y);
    const c2 = new THREE.Color(cc.getX(i), cc.getY(i), cc.getZ(i)).multiplyScalar(l).lerp(hz, o.hazeAmount * 0.25);
    cc.setXYZ(i, c2.r, c2.g, c2.b);
  }
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'horizon_ring';
  // the unlifted heights, for liftRingToGround (the ring's vertices are radial, so their angle picks the segment)
  const pa = g.attributes.position as THREE.BufferAttribute;
  const baseY = new Float32Array(pa.count);
  for (let k = 0; k < pa.count; k++) baseY[k] = pa.getY(k);
  const lift: RingLift = { baseY, radius: o.radius, segments: N };
  mesh.userData.ringLift = lift;
  return mesh;
}

/** Data kept on a makeMountainRing mesh: the heights at y = 0 ring base, the radius and the segment count. */
interface RingLift { baseY: Float32Array; radius: number; segments: number }

/**
 * Relief follow: the ring stays centred on the camera, so its wall is lifted per segment to the ground at its radius (`groundAt` in
 * world metres, the Relief height grid). Without it the wall stands at y = 0 while the relief's edge hills rise through it.
 * `cx`, `cz` is the ring centre (the camera). Rings without the data (flat zones) are left alone.
 */
export function liftRingToGround(mesh: THREE.Mesh, groundAt: (x: number, z: number) => number, cx: number, cz: number): void {
  const lift = mesh.userData.ringLift as RingLift | undefined;
  if (!lift) return;
  const pa = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const N = lift.segments, step = (Math.PI * 2) / N;
  const seg = new Float32Array(N);
  for (let i = 0; i < N; i++) seg[i] = groundAt(cx + lift.radius * Math.cos(i * step), cz + lift.radius * Math.sin(i * step));
  for (let k = 0; k < pa.count; k++) {
    const i = ((Math.round(Math.atan2(pa.getZ(k), pa.getX(k)) / step) % N) + N) % N;
    pa.setY(k, lift.baseY[k] + seg[i]);
  }
  pa.needsUpdate = true;
}
