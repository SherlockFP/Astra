import * as THREE from 'three';

/** Shader meshes used by VFX: light pillars (loot beams, level-up) and fresnel shells (shield, ice, weapon glow). */

// ---------------------------------------------------------------------------
// Pillar
// ---------------------------------------------------------------------------

const PILLAR_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const PILLAR_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uFade;
uniform float uHot;
uniform float uBands;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float h = vUv.y;
  float side = pow(abs(dot(normalize(vN), normalize(vV))), 1.1);
  float fall = pow(max(1.0 - h, 0.0), uFade);
  float bands = 1.0 - uBands + uBands * (0.5 + 0.5 * sin(h * 24.0 - uTime * 4.5));
  float flick = 0.92 + 0.08 * sin(uTime * 15.0 + h * 6.0);
  float a = side * fall * bands * flick * uAlpha * 0.7;
  if (a < 0.003) discard;
  vec3 col = mix(uColor, vec3(1.0), uHot * (1.0 - h) * 0.7);
  gl_FragColor = vec4(col * (0.55 + 0.5 * (1.0 - h)), a);
}
`;

let cylGeo: THREE.CylinderGeometry | null = null;
function unitCylinder(): THREE.CylinderGeometry {
  if (!cylGeo) {
    cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    cylGeo.translate(0, 0.5, 0);
  }
  return cylGeo;
}

function pillarMat(color: number, fade: number, hot: number, bands: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PILLAR_VERT,
    fragmentShader: PILLAR_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: 1 },
      uTime: { value: Math.random() * 20 },
      uFade: { value: fade },
      uHot: { value: hot },
      uBands: { value: bands },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export class Pillar {
  readonly group = new THREE.Group();
  private inner: THREE.Mesh;
  private outer: THREE.Mesh;
  private mats: THREE.ShaderMaterial[];
  private baseR: number;
  height: number;
  alpha = 1;
  /** 0..1 how much of the height is revealed (rise animation) */
  grow = 1;

  constructor(color: number, height: number, radius: number, opts: { fade?: number; hot?: number; bands?: number } = {}) {
    this.height = height;
    this.baseR = radius;
    const outerMat = pillarMat(color, opts.fade ?? 1.1, opts.hot ?? 0.4, opts.bands ?? 0.35);
    const innerMat = pillarMat(color, (opts.fade ?? 1.1) * 1.4, (opts.hot ?? 0.4) + 0.5, (opts.bands ?? 0.35) * 0.5);
    this.mats = [outerMat, innerMat];
    this.outer = new THREE.Mesh(unitCylinder(), outerMat);
    this.inner = new THREE.Mesh(unitCylinder(), innerMat);
    for (const m of [this.outer, this.inner]) {
      m.frustumCulled = false;
      m.renderOrder = 12;
      this.group.add(m);
    }
    this.layout();
  }

  private layout(): void {
    const h = this.height * this.grow;
    this.outer.scale.set(this.baseR, h, this.baseR);
    this.inner.scale.set(this.baseR * 0.38, h, this.baseR * 0.38);
  }

  setRadius(r: number): void {
    this.baseR = r;
    this.layout();
  }

  update(dt: number): void {
    for (const m of this.mats) {
      m.uniforms.uTime.value += dt;
      m.uniforms.uAlpha.value = this.alpha;
    }
    this.layout();
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// Fresnel shell
// ---------------------------------------------------------------------------

const SHELL_VERT = /* glsl */ `
uniform float uInflate;
varying vec3 vN;
varying vec3 vMV;
varying vec3 vP;
void main() {
  vec3 p = position + normal * uInflate;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vMV = mv.xyz;
  vP = p;
  gl_Position = projectionMatrix * mv;
}
`;
const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uPower;
uniform float uFlat;
uniform float uPulse;
uniform float uRainbow;
uniform float uScan;
uniform float uBase;
uniform float uHit;
varying vec3 vN;
varying vec3 vMV;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  if (uFlat > 0.5) n = normalize(cross(dFdx(vMV), dFdy(vMV)));
  vec3 v = normalize(-vMV);
  // clamp the base: |dot| can land a hair above 1 on a face-on fragment, and pow(negative, p) is NaN, which the bloom spreads over the screen
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), uPower);
  float pulse = 1.0 - uPulse + uPulse * (0.5 + 0.5 * sin(uTime * 4.0));
  float a = (uBase + fres) * pulse;
  a += uScan * smoothstep(0.82, 1.0, sin(vP.y * 7.0 - uTime * 3.0)) * 0.5;
  a += uHit * 0.5;
  a *= uAlpha;
  if (a < 0.004) discard;
  vec3 col = uColor;
  if (uRainbow > 0.5) col = 0.55 + 0.45 * cos(6.2832 * (uTime * 0.28 + vec3(0.0, 0.33, 0.67)));
  gl_FragColor = vec4(col * min(1.0 + fres * 1.2 + uHit, 2.5), a); // HDR boost capped: a rim never exceeds 2.5x its colour
}
`;

export interface ShellOpts {
  power?: number;
  inflate?: number;
  base?: number;
  pulse?: number;
  flat?: boolean;
  scan?: number;
  rainbow?: boolean;
  additive?: boolean;
  alpha?: number;
}

export function shellMaterial(color: number, o: ShellOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: o.alpha ?? 1 },
      uTime: { value: Math.random() * 10 },
      uPower: { value: o.power ?? 2.2 },
      uFlat: { value: o.flat ? 1 : 0 },
      uPulse: { value: o.pulse ?? 0.25 },
      uRainbow: { value: o.rainbow ? 1 : 0 },
      uScan: { value: o.scan ?? 0 },
      uBase: { value: o.base ?? 0.06 },
      uInflate: { value: o.inflate ?? 0 },
      uHit: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.FrontSide,
    fog: false,
  });
}

let icoGeo: THREE.IcosahedronGeometry | null = null;
let crystalGeo: THREE.IcosahedronGeometry | null = null;
export function shellGeometry(kind: 'shield' | 'ice' | 'aura'): THREE.BufferGeometry {
  if (kind === 'ice') return (crystalGeo ??= new THREE.IcosahedronGeometry(0.5, 0));
  return (icoGeo ??= new THREE.IcosahedronGeometry(0.5, 2));
}
