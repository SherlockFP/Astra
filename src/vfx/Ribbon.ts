import * as THREE from 'three';

/** Camera-facing ribbon strips: lightning, chain lightning, beams and weapon trails. */

const VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = aUv;
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform float uSoft;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float e = 1.0 - abs(vUv.y * 2.0 - 1.0);
  e = pow(max(e, 0.0), uSoft);
  float a = e * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`;

const mats = new Map<string, THREE.ShaderMaterial>();
function material(additive: boolean, soft: number): THREE.ShaderMaterial {
  const key = `${additive}|${soft}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    mats.set(key, m);
  }
  return m;
}

const _tan = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _side = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Ribbon {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private col: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  readonly maxPts: number;

  constructor(maxPts: number, additive = true, soft = 1.4) {
    this.maxPts = maxPts;
    this.pos = new Float32Array(maxPts * 2 * 3);
    this.col = new Float32Array(maxPts * 2 * 4);
    const uv = new Float32Array(maxPts * 2 * 2);
    for (let i = 0; i < maxPts; i++) {
      const t = i / Math.max(1, maxPts - 1);
      uv[i * 4] = t;
      uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = t;
      uv[i * 4 + 3] = 1;
    }
    const idx: number[] = [];
    for (let i = 0; i < maxPts - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aCol', this.colAttr);
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material(additive, soft));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.matrixAutoUpdate = false;
  }

  /**
   * pts: flat xyz world positions (n points). widths: n values (metres). colors: n*4 values (rgb already HDR-scaled, alpha).
   */
  build(cam: THREE.Vector3, pts: ArrayLike<number>, n: number, widths: ArrayLike<number>, colors: ArrayLike<number>): void {
    n = Math.min(n, this.maxPts);
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const P = this.pos;
    const C = this.col;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1) * 3;
      const i1 = Math.min(n - 1, i + 1) * 3;
      _tan.set(pts[i1] - pts[i0], pts[i1 + 1] - pts[i0 + 1], pts[i1 + 2] - pts[i0 + 2]);
      _toCam.set(cam.x - pts[i * 3], cam.y - pts[i * 3 + 1], cam.z - pts[i * 3 + 2]);
      _side.crossVectors(_tan, _toCam);
      const l = _side.length();
      if (l < 1e-6) _side.set(0, 1, 0);
      else _side.multiplyScalar((widths[i] * 0.5) / l);
      const o = i * 6;
      P[o] = pts[i * 3] + _side.x;
      P[o + 1] = pts[i * 3 + 1] + _side.y;
      P[o + 2] = pts[i * 3 + 2] + _side.z;
      P[o + 3] = pts[i * 3] - _side.x;
      P[o + 4] = pts[i * 3 + 1] - _side.y;
      P[o + 5] = pts[i * 3 + 2] - _side.z;
      const c = i * 8;
      for (let k = 0; k < 4; k++) {
        C[c + k] = colors[i * 4 + k];
        C[c + 4 + k] = colors[i * 4 + k];
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  hide(): void {
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
  }
}

/** Midpoint-displaced jagged path from a to b. Writes (segs+1) xyz points to out. */
export function jaggedPath(a: THREE.Vector3, b: THREE.Vector3, segs: number, amp: number, out: Float32Array): number {
  const n = segs + 1;
  _a.copy(b).sub(a);
  const len = _a.length();
  _b.set(Math.abs(_a.y) < len * 0.9 ? 0 : 1, Math.abs(_a.y) < len * 0.9 ? 1 : 0, 0).cross(_a).normalize();
  _tan.copy(_a).cross(_b).normalize();
  for (let i = 0; i < n; i++) {
    const t = i / segs;
    const envelope = Math.sin(t * Math.PI) ** 0.7; // 0 at the ends
    const j1 = (Math.random() * 2 - 1) * amp * envelope;
    const j2 = (Math.random() * 2 - 1) * amp * envelope;
    out[i * 3] = a.x + _a.x * t + _b.x * j1 + _tan.x * j2;
    out[i * 3 + 1] = a.y + _a.y * t + _b.y * j1 + _tan.y * j2;
    out[i * 3 + 2] = a.z + _a.z * t + _b.z * j1 + _tan.z * j2;
  }
  return n;
}

/** Weapon/dash trail following an object. */
export class TrailRibbon {
  alive = true;
  private ribbon: Ribbon;
  private pts: number[] = []; // x y z age ...
  private emitLeft: number;
  private tmp = new Float32Array(48 * 3);
  private w = new Float32Array(48);
  private c = new Float32Array(48 * 4);
  private last = new THREE.Vector3();
  private has = false;
  private col = new THREE.Color();
  private hot = new THREE.Color();
  readonly life: number;

  constructor(
    private object: THREE.Object3D,
    color: number,
    duration: number,
    private width: number,
    parent: THREE.Object3D,
    life = 0.26,
  ) {
    this.emitLeft = duration;
    this.life = life;
    this.ribbon = new Ribbon(40, true, 1.2);
    parent.add(this.ribbon.mesh);
    this.col.setHex(color);
    this.hot.copy(this.col).lerp(new THREE.Color(1, 1, 1), 0.55);
  }

  update(dt: number, cam: THREE.Vector3): boolean {
    if (!this.alive) return false;
    // age points
    const p = this.pts;
    for (let i = 3; i < p.length; i += 4) p[i] += dt;
    while (p.length && p[3] > this.life) p.splice(0, 4);
    if (this.emitLeft > 0 && this.object.parent !== null) {
      this.emitLeft -= dt;
      this.object.getWorldPosition(_a);
      if (this.has) {
        const d = _a.distanceTo(this.last);
        if (d > 0.012) {
          const steps = Math.min(8, Math.floor(d / 0.3));
          for (let s = 1; s <= steps; s++) {
            const t = s / (steps + 1);
            p.push(this.last.x + (_a.x - this.last.x) * t, this.last.y + (_a.y - this.last.y) * t, this.last.z + (_a.z - this.last.z) * t, 0);
          }
          p.push(_a.x, _a.y, _a.z, 0);
          this.last.copy(_a);
        }
      } else {
        this.last.copy(_a);
        this.has = true;
        p.push(_a.x, _a.y, _a.z, 0);
      }
      while (p.length > 40 * 4) p.splice(0, 4);
    } else if (this.emitLeft > 0) {
      this.emitLeft = 0;
    }
    const n = p.length / 4;
    if (n < 2) {
      this.ribbon.hide();
      if (this.emitLeft <= 0) this.kill();
      return this.alive;
    }
    for (let i = 0; i < n; i++) {
      this.tmp[i * 3] = p[i * 4];
      this.tmp[i * 3 + 1] = p[i * 4 + 1];
      this.tmp[i * 3 + 2] = p[i * 4 + 2];
      const age = p[i * 4 + 3] / this.life; // 0 new .. 1 old
      const head = i / (n - 1); // 0 oldest .. 1 newest
      this.w[i] = this.width * Math.pow(head, 0.7) * (1 - age * 0.5);
      const a = (1 - age) * (1 - age);
      const mix = Math.pow(head, 2);
      this.c[i * 4] = (this.col.r + (this.hot.r - this.col.r) * mix) * 1.5;
      this.c[i * 4 + 1] = (this.col.g + (this.hot.g - this.col.g) * mix) * 1.5;
      this.c[i * 4 + 2] = (this.col.b + (this.hot.b - this.col.b) * mix) * 1.5;
      this.c[i * 4 + 3] = a * 0.95;
    }
    this.ribbon.build(cam, this.tmp, n, this.w, this.c);
    return true;
  }

  /** Stop emitting; the existing ribbon fades out. */
  stop(): void {
    this.emitLeft = 0;
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.emitLeft = 0;
    this.ribbon.dispose();
  }
}
