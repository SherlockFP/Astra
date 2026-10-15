import * as THREE from 'three';
import { G } from '../game/G';
import type { TelegraphKind, TelegraphShape } from '../types/vfx';
import type { TelegraphHandle } from './VFX';

/**
 * Ground telegraphs (boss/enemy mechanics, ground-target previews).
 * One shader draws every shape from signed-distance maths: soft base hatch, bright rim, a fill that grows
 * toward the impact (progress 0..1) with a glowing front line, pulse, flash at the end.
 */

const VERT = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uCenter;
varying vec2 vL;
void main() {
  vL = position.xz * uSize + uCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uShape;
uniform vec4 uP;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uProg;
uniform float uTime;
uniform float uAlpha;
uniform float uFlash;
uniform float uKind;
varying vec2 vL;

void main() {
  float d = 0.0;      // distance inside the shape (>0 inside)
  float fc = 0.0;     // growth coordinate 0..1 (where the fill front is)
  float r = length(vL);
  if (uShape < 0.5) {            // circle
    d = uP.x - r;
    fc = r / uP.x;
  } else if (uShape < 1.5) {     // ring
    d = min(r - uP.x, uP.y - r);
    fc = (r - uP.x) / max(0.001, uP.y - uP.x);
  } else if (uShape < 2.5) {     // cone: radius, half angle
    float ang = abs(atan(vL.x, vL.y));
    d = min(uP.x - r, (uP.y - ang) * max(r, 0.35));
    if (vL.y < 0.0) d = -1.0;
    fc = r / uP.x;
  } else if (uShape < 3.5) {     // line: length, width (along +z from the origin)
    d = min(min(vL.y, uP.x - vL.y), uP.y * 0.5 - abs(vL.x));
    fc = vL.y / uP.x;
  } else {                       // rect: width, length (centred)
    d = min(uP.x * 0.5 - abs(vL.x), uP.y * 0.5 - abs(vL.y));
    fc = max(abs(vL.x) / (uP.x * 0.5), abs(vL.y) / (uP.y * 0.5));
  }
  if (d < 0.0) discard;

  float rim = 1.0 - smoothstep(0.0, 0.28, d);
  float rimHard = 1.0 - step(0.22, d);   // opaque edge band, wider than before (readable at range)
  float filled = step(fc, uProg);
  float front = exp(-abs(fc - uProg) * 22.0) * step(0.001, uProg) * (1.0 - step(0.999, uProg) * 0.0);

  // chunky animated hatch on the unfilled part
  float hatch = step(0.5, fract((vL.x + vL.y) * 1.4 - uTime * 0.35));
  float pulse = 0.82 + 0.18 * sin(uTime * 9.0 + uKind);
  if (uKind > 0.5 && uKind < 1.5) pulse = 0.85 + 0.15 * sin(uTime * 4.0); // soak: calmer

  float a = 0.25 + hatch * 0.03;                      // base: flat 25 % fill (WoW clarity), the hatch only adds a faint texture
  a = mix(a, 0.6 + 0.1 * sin(uTime * 14.0 + fc * 9.0), filled); // filled part
  a += rim * 0.2 * pulse;
  a = mix(a, 1.0, rimHard);                           // opaque edge
  a += front * 0.5;
  a = clamp(a, 0.0, 1.0);

  vec3 col = mix(uColor, uHot, clamp(rim * 0.6 + front * 0.8 + filled * 0.25, 0.0, 1.0));
  col = mix(col, vec3(1.0), uFlash);
  a = mix(a, 1.0, uFlash * 0.7);
  // HDR boost so bloom catches the rim
  col *= min(1.0 + rim * 0.9 + front * 0.8 + uFlash * 1.5, 2.5);
  gl_FragColor = vec4(col, a * uAlpha);
}
`;

const KIND_COLORS: Record<TelegraphKind, { base: number; hot: number; id: number }> = {
  danger: { base: 0xff2a10, hot: 0xffa040, id: 0 },
  soak: { base: 0xffcc22, hot: 0xfff2a0, id: 1 },
  safe: { base: 0x30e060, hot: 0xb0ffc0, id: 2 },
  friendly: { base: 0x3a9bff, hot: 0xb0e0ff, id: 3 },
};

const planeGeo = new THREE.PlaneGeometry(1, 1);
planeGeo.rotateX(-Math.PI / 2);

/** Segments per side of the draped telegraph quad on rolling terrain (World.terrain); flat worlds keep the shared 1-quad plane. */
const DRAPE_SEG = 20;

function layout(shape: TelegraphShape): { size: [number, number]; center: [number, number]; id: number; p: [number, number, number, number] } {
  switch (shape.type) {
    case 'circle':
      return { size: [shape.radius * 2.1, shape.radius * 2.1], center: [0, 0], id: 0, p: [shape.radius, 0, 0, 0] };
    case 'ring':
      return { size: [shape.outer * 2.1, shape.outer * 2.1], center: [0, 0], id: 1, p: [shape.inner, shape.outer, 0, 0] };
    case 'cone': {
      const half = (shape.angle * Math.PI) / 360;
      const w = half >= Math.PI / 2 ? shape.radius * 2.1 : Math.max(0.5, Math.sin(half)) * shape.radius * 2.1;
      return { size: [w, shape.radius * 1.1], center: [0, shape.radius * 0.5], id: 2, p: [shape.radius, half, 0, 0] };
    }
    case 'line':
      return { size: [shape.width * 1.2, shape.length * 1.05], center: [0, shape.length * 0.5], id: 3, p: [shape.length, shape.width, 0, 0] };
    case 'rect':
      return { size: [shape.width * 1.05, shape.length * 1.05], center: [0, 0], id: 4, p: [shape.width, shape.length, 0, 0] };
  }
}

export class TelegraphFx implements TelegraphHandle {
  alive = true;
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private size: [number, number] = [1, 1];
  private center: [number, number] = [0, 0];
  private drapeGeo: THREE.BufferGeometry | null = null;
  private unitXZ: Float32Array | null = null;
  private t = 0;
  private manual = false;
  private fading = false;
  private fadeT = 0;
  private flashT = 0;
  private prog = 0;

  constructor(
    shape: TelegraphShape,
    origin: [number, number, number],
    dir: [number, number],
    private duration: number,
    kind: TelegraphKind = 'danger',
  ) {
    const lay = layout(shape);
    const k = KIND_COLORS[kind] ?? KIND_COLORS.danger;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uShape: { value: lay.id },
        uP: { value: new THREE.Vector4(...lay.p) },
        uColor: { value: new THREE.Color(k.base) },
        uHot: { value: new THREE.Color(k.hot) },
        uProg: { value: 0 },
        uTime: { value: Math.random() * 10 },
        uAlpha: { value: 0 },
        uFlash: { value: 0 },
        uKind: { value: k.id },
        uSize: { value: new THREE.Vector2(lay.size[0], lay.size[1]) },
        uCenter: { value: new THREE.Vector2(lay.center[0], lay.center[1]) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    // rolling terrain: a subdivided quad whose vertices follow the ground (setTransform drapes it), so no corner sinks into a hill
    this.size = lay.size;
    this.center = lay.center;
    if (G.world?.terrain) {
      const g = new THREE.PlaneGeometry(1, 1, DRAPE_SEG, DRAPE_SEG);
      g.rotateX(-Math.PI / 2);
      this.drapeGeo = g;
      this.unitXZ = Float32Array.from(g.getAttribute('position').array);
    }
    this.mesh = new THREE.Mesh(this.drapeGeo ?? planeGeo, this.mat);
    this.mesh.scale.set(lay.size[0], 1, lay.size[1]);
    this.mesh.position.set(lay.center[0], 0, lay.center[1]);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.setTransform(origin, dir);
  }

  setProgress(p: number): void {
    this.manual = true;
    this.prog = Math.max(0, Math.min(1, p));
  }

  setTransform(origin: [number, number, number], dir: [number, number]): void {
    this.group.position.set(origin[0], origin[1] + 0.07, origin[2]);
    if (Math.abs(dir[0]) + Math.abs(dir[1]) > 1e-5) this.group.rotation.y = Math.atan2(dir[0], dir[1]);
    if (this.drapeGeo) this.drape(origin);
  }

  /** Rolling terrain: puts every vertex of the quad 7 cm above the ground under it (the origin's own y is ignored). */
  private drape(origin: [number, number, number]): void {
    const w = G.world;
    const geo = this.drapeGeo, unit = this.unitXZ;
    if (!w || !geo || !unit) return;
    const gy0 = w.groundY(origin[0], origin[2]);
    this.group.position.y = gy0 + 0.07;
    const th = this.group.rotation.y, c = Math.cos(th), s = Math.sin(th);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = unit[i * 3] * this.size[0] + this.center[0], lz = unit[i * 3 + 2] * this.size[1] + this.center[1];
      pos.setY(i, w.groundY(origin[0] + lx * c + lz * s, origin[2] - lx * s + lz * c) - gy0);
    }
    pos.needsUpdate = true;
  }

  cancel(): void {
    if (this.fading) return;
    this.fading = true;
    this.fadeT = 0;
  }

  update(dt: number): boolean {
    if (!this.alive) return false;
    this.t += dt;
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    if (!this.manual && this.duration > 0) this.prog = Math.min(1, this.t / this.duration);
    u.uProg.value = this.prog;
    let alpha = Math.min(1, this.t / 0.12);
    if (!this.fading && this.duration > 0 && this.t >= this.duration) {
      // impact: flash then fade
      this.flashT += dt;
      u.uFlash.value = Math.max(0, 1 - this.flashT / 0.12);
      if (this.flashT > 0.1) this.fading = true;
    }
    if (this.fading) {
      this.fadeT += dt;
      alpha *= Math.max(0, 1 - this.fadeT / 0.16);
      if (this.fadeT >= 0.16) {
        this.dispose();
        return false;
      }
    }
    u.uAlpha.value = alpha;
    return true;
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.group.removeFromParent();
    this.mat.dispose();
    this.drapeGeo?.dispose();
  }
}
