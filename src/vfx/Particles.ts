import * as THREE from 'three';

/**
 * Pooled GPU-instanced particle layers + the shared texture atlas.
 *
 * One InstancedBufferGeometry draw call per layer. Four particle "modes" share one shader:
 *   bb      camera-facing billboard (smoke, fire, flares)
 *   stretch billboard stretched along its velocity in screen space (sparks, rain, streaks)
 *   flat    quad lying on the ground (rings, decals, magic circles, slashes)
 *   plane   quad with an arbitrary normal (portals, vertical slashes)
 * Sprite sheets are supported through `frames` (cols/rows/frames) on the atlas rect.
 */

export type V3 = [number, number, number];
export type R = number | [number, number];

const STRIDE = 41;
const enum F {
  px = 0, py, pz, vx, vy, vz, age, life, s0, s1, asp, rot, spin,
  c0r, c0g, c0b, c1r, c1g, c1b, a0, fi, fp, grav, drag, bounce, mode, stretch, glow,
  u0, v0, du, dv, ttl1, nx, ny, nz, ease, fcols, frows, frames, tmix,
}

export type ParticleMode = 'bb' | 'stretch' | 'flat' | 'plane';
const MODE_ID: Record<ParticleMode, number> = { bb: 0, stretch: 1, flat: 2, plane: 3 };

export interface PSpec {
  /** Atlas tile name (or list; one is picked at random). */
  tex: string | string[];
  n?: R;                       // particle count (fractional = chance of +1)
  at?: V3 | THREE.Vector3;     // emitter centre
  jit?: number | V3;           // position scatter: radius (sphere/disc/ring) or half-extents (box)
  area?: 'sphere' | 'box' | 'disc' | 'ring';
  dir?: V3 | THREE.Vector3;    // emission axis (default +Y)
  cone?: number;               // half angle (rad) around dir; PI = every direction
  speed?: R;
  vel?: V3;                    // added velocity (inheritance / wind)
  radial?: R;                  // extra speed away from the emitter centre on XZ (nova, debris)
  life: R;
  size: R;
  size1?: R;                   // end size (absolute). default = size
  grow?: number;               // end size multiplier (alternative to size1)
  asp?: number;                // height/width ratio (billboards: 1)
  rot?: R;
  spin?: R;
  c0: number;
  c1?: number;
  a?: R;                       // peak alpha (default 1)
  fi?: number;                 // fade-in fraction of life
  fp?: number;                 // fade-out power (1 = linear)
  glow?: number;               // HDR multiplier for additive layers
  grav?: R;                    // + falls, - rises
  drag?: number;
  bounce?: number;             // >0: bounce on y = floor
  floor?: number;
  mode?: ParticleMode;
  stretch?: number;            // stretch mode: extra length per unit speed
  normal?: V3;                 // plane mode normal (flat uses +Y)
  ease?: 0 | 1 | 2;            // size growth easing: 0 linear, 1 out-quad, 2 out-cubic
  oneFrame?: boolean;          // immediate-mode sprite: lives exactly one frame
  frames?: { cols: number; rows: number; count: number };
  /** 0..1: how much of the texture's own RGB survives (sprite sheets: 1; white+alpha tiles: 0) */
  tmix?: number;
}

const rnd = Math.random;
const rr = (v: R | undefined, d = 0): number => (v === undefined ? d : typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * rnd());

const _c = new THREE.Color();
function setRGB(arr: Float32Array, o: number, hex: number): void {
  _c.setHex(hex);
  arr[o] = _c.r;
  arr[o + 1] = _c.g;
  arr[o + 2] = _c.b;
}

// ---------------------------------------------------------------------------
// Atlas
// ---------------------------------------------------------------------------

export const KENNEY_TILES = [
  'ring-01', 'ring-02', 'ring-03', 'ring-04', 'glow-soft', 'debris-01', 'fire-01', 'fire-02', 'flame-01', 'flame-02', 'flame-03',
  'flame-tongue-01', 'flame-tongue-02', 'flare-01', 'aura-01', 'aura-02', 'magic-circle-01', 'magic-circle-02', 'magic-flare-01',
  'magic-flare-02', 'burst-jet-01', 'burst-jet-02', 'explosion-01', 'explosion-02', 'claw-01', 'slash-01', 'slash-02', 'slash-03',
  'slash-04', 'smoke-01', 'smoke-02', 'smoke-03', 'smoke-04', 'smoke-ring-01', 'lightning-01', 'lightning-02', 'lightning-03',
  'lightning-04', 'star-01', 'star-02', 'star-03', 'star-04', 'star-05', 'trace-01', 'trace-02', 'twirl-01', 'twirl-02', 'twirl-03',
  'telegraph-circle',
];

type Painter = (g: CanvasRenderingContext2D, s: number) => void;

function radial(g: CanvasRenderingContext2D, s: number, stops: [number, number][]): void {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
}

const PROCEDURAL: Record<string, Painter> = {
  soft: (g, s) => radial(g, s, [[0, 1], [0.25, 0.7], [0.55, 0.25], [1, 0]]),
  glow: (g, s) => radial(g, s, [[0, 1], [0.12, 0.85], [0.4, 0.3], [0.7, 0.06], [1, 0]]),
  dot: (g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
    g.fill();
  },
  px: (g, s) => {
    g.fillStyle = '#fff';
    g.fillRect(s * 0.18, s * 0.18, s * 0.64, s * 0.64);
  },
  cross: (g, s) => {
    // four-point sparkle
    g.fillStyle = '#fff';
    const c = s / 2;
    g.beginPath();
    g.moveTo(c, 2);
    g.quadraticCurveTo(c + 3, c - 3, s - 2, c);
    g.quadraticCurveTo(c + 3, c + 3, c, s - 2);
    g.quadraticCurveTo(c - 3, c + 3, 2, c);
    g.quadraticCurveTo(c - 3, c - 3, c, 2);
    g.fill();
    radial(g, s, [[0, 0.5], [0.3, 0.12], [1, 0]]);
  },
  shard: (g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(s / 2, 2);
    g.lineTo(s * 0.72, s * 0.62);
    g.lineTo(s / 2, s - 2);
    g.lineTo(s * 0.28, s * 0.62);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0.7)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  },
  streak: (g, s) => {
    // head at the top (bright), tail fades to the bottom; very thin
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(s / 2, 0);
    g.lineTo(s * 0.62, s * 0.12);
    g.lineTo(s * 0.5, s);
    g.lineTo(s * 0.38, s * 0.12);
    g.closePath();
    g.fill();
  },
  drop: (g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(s / 2, 2);
    g.bezierCurveTo(s * 0.9, s * 0.55, s * 0.82, s - 2, s / 2, s - 2);
    g.bezierCurveTo(s * 0.18, s - 2, s * 0.1, s * 0.55, s / 2, 2);
    g.fill();
  },
  wisp: (g, s) => {
    // soft head with a curling tail going down
    radial(g, s, [[0, 0.0], [1, 0]]);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = s / 2 + Math.sin(t * 5) * s * 0.12 * t;
      const y = s * 0.2 + t * s * 0.72;
      const r = s * (0.16 - t * 0.12);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${1 - t * 0.7})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },
  chunk: (g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(s * 0.18, s * 0.42);
    g.lineTo(s * 0.4, s * 0.12);
    g.lineTo(s * 0.78, s * 0.22);
    g.lineTo(s * 0.88, s * 0.6);
    g.lineTo(s * 0.6, s * 0.88);
    g.lineTo(s * 0.22, s * 0.74);
    g.closePath();
    g.fill();
  },
  bone: (g, s) => {
    g.fillStyle = '#fff';
    g.fillRect(s * 0.42, s * 0.2, s * 0.16, s * 0.6);
    for (const [x, y] of [[0.38, 0.2], [0.62, 0.2], [0.38, 0.8], [0.62, 0.8]]) {
      g.beginPath();
      g.arc(s * x, s * y, s * 0.09, 0, Math.PI * 2);
      g.fill();
    }
  },
  plus: (g, s) => {
    g.fillStyle = '#fff';
    g.fillRect(s * 0.4, s * 0.14, s * 0.2, s * 0.72);
    g.fillRect(s * 0.14, s * 0.4, s * 0.72, s * 0.2);
  },
  skull: (g, s) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s / 2, s * 0.42, s * 0.34, 0, Math.PI * 2);
    g.fill();
    g.fillRect(s * 0.34, s * 0.62, s * 0.32, s * 0.24);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(s * 0.38, s * 0.45, s * 0.085, 0, Math.PI * 2);
    g.arc(s * 0.62, s * 0.45, s * 0.085, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.54);
    g.lineTo(s * 0.45, s * 0.66);
    g.lineTo(s * 0.55, s * 0.66);
    g.fill();
    g.fillRect(s * 0.42, s * 0.76, s * 0.03, s * 0.1);
    g.fillRect(s * 0.55, s * 0.76, s * 0.03, s * 0.1);
    g.globalCompositeOperation = 'source-over';
  },
  bubble: (g, s) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.33, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s * 0.38, s * 0.36, s * 0.07, 0, Math.PI * 2);
    g.fill();
  },
  ringline: (g, s) => {
    g.strokeStyle = '#fff';
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = s * 0.12;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
    g.stroke();
  },
  hex: (g, s) => {
    g.strokeStyle = '#fff';
    g.lineWidth = s * 0.06;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = s / 2 + Math.cos(a) * s * 0.42;
      const y = s / 2 + Math.sin(a) * s * 0.42;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
  },
  splat: (g, s) => {
    // irregular blob for blood / poison decals
    g.fillStyle = '#fff';
    const c = s / 2;
    g.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = s * (0.22 + 0.2 * Math.abs(Math.sin(a * 3.1 + 1.3)) * (0.6 + 0.4 * Math.cos(a * 5.3)));
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + 0.5;
      g.beginPath();
      g.arc(c + Math.cos(a) * s * 0.4, c + Math.sin(a) * s * 0.4, s * (0.025 + 0.02 * ((i * 7) % 3)), 0, Math.PI * 2);
      g.fill();
    }
  },
  crack: (g, s) => {
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const c = s / 2;
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      if (depth > 3 || len < 4) return;
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      branch(nx, ny, a + 0.5, len * 0.6, w * 0.7, depth + 1);
      branch(nx, ny, a - 0.45, len * 0.62, w * 0.7, depth + 1);
    };
    for (let i = 0; i < 7; i++) branch(c, c, (i / 7) * Math.PI * 2 + 0.3, s * 0.2, 3.2, 0);
  },
};

/** Anything a ParticleLayer can read tile rects from (the Kenney atlas or the sprite-sheet atlas). */
export interface AtlasLike {
  readonly texture: THREE.Texture;
  rect(name: string): [number, number, number, number];
  /** sprite-sheet info for a tile (frame grid); undefined for plain tiles */
  sheet?(name: string): { cols: number; rows: number; count: number } | undefined;
}

export class Atlas implements AtlasLike {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly rects = new Map<string, [number, number, number, number]>();
  readonly cell = 128;
  private cols = 10;
  private rows = 8;
  private next = 0;
  private warned = new Set<string>();

  constructor() {
    this.canvas.width = this.cols * this.cell;
    this.canvas.height = this.rows * this.cell;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = true;
    this.texture.premultiplyAlpha = false;
    for (const [name, paint] of Object.entries(PROCEDURAL)) this.addPainted(name, paint);
  }

  private slot(name: string): { x: number; y: number } | null {
    if (this.next >= this.cols * this.rows) return null;
    const i = this.next++;
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    this.rects.set(name, [col / this.cols, 1 - (row + 1) / this.rows, 1 / this.cols, 1 / this.rows]);
    return { x: col * this.cell, y: row * this.cell };
  }

  private addPainted(name: string, paint: Painter): void {
    const sl = this.slot(name);
    if (!sl) return;
    const g = this.canvas.getContext('2d')!;
    g.save();
    g.translate(sl.x, sl.y);
    g.beginPath();
    g.rect(0, 0, this.cell, this.cell);
    g.clip();
    paint(g, this.cell);
    g.restore();
    this.texture.needsUpdate = true;
  }

  /** Load Kenney textures into the atlas. Failures are non-fatal (tile stays a soft disc). */
  async loadImages(names: string[], base = '/assets/textures/vfx/'): Promise<void> {
    await Promise.all(
      names.map(
        (n) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const sl = this.slot(n);
              if (sl) {
                const g = this.canvas.getContext('2d')!;
                g.clearRect(sl.x, sl.y, this.cell, this.cell);
                g.imageSmoothingEnabled = true;
                g.drawImage(img, sl.x, sl.y, this.cell, this.cell);
                this.texture.needsUpdate = true;
              }
              resolve();
            };
            img.onerror = () => {
              console.warn(`[vfx] texture missing: ${n}`);
              this.alias(n, 'soft');
              resolve();
            };
            img.src = `${base}${n}.png`;
          }),
      ),
    );
  }

  alias(name: string, to: string): void {
    const r = this.rects.get(to);
    if (r) this.rects.set(name, r);
  }

  rect(name: string): [number, number, number, number] {
    const r = this.rects.get(name);
    if (r) return r;
    if (!this.warned.has(name)) {
      this.warned.add(name);
      console.warn(`[vfx] unknown atlas tile "${name}"`);
    }
    return this.rects.get('soft') ?? [0, 0, 0.1, 0.125];
  }
}

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
attribute vec4 iA; // pos.xyz, rot
attribute vec4 iB; // sizeW, sizeH, alpha, glow
attribute vec4 iC; // colour rgb, texture-colour mix
attribute vec4 iD; // uv rect (u0 v0 du dv)
attribute vec4 iE; // vel/normal xyz, mode
attribute vec4 iF; // cols rows frames t
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec4 vCol;
varying float vGlow;
varying float vTmix;
void main() {
  float mode = iE.w;
  float s = sin(iA.w);
  float c = cos(iA.w);
  vec2 q = position.xy;
  vec3 wp;
  if (mode < 0.5) {
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    wp = iA.xyz + uCamRight * (r.x * iB.x) + uCamUp * (r.y * iB.y);
    // pull toward the camera so big puffs don't get sliced by the floor/walls
    wp += normalize(uCamPos - iA.xyz) * (iB.x * 0.38);
  } else if (mode < 1.5) {
    vec3 v = iE.xyz;
    vec2 sd = vec2(dot(v, uCamRight), dot(v, uCamUp));
    float l = length(sd);
    vec2 d = l > 1e-4 ? sd / l : vec2(0.0, 1.0);
    vec2 pd = vec2(-d.y, d.x);
    vec2 o = pd * (q.x * iB.x) + d * (q.y * iB.y);
    wp = iA.xyz + uCamRight * o.x + uCamUp * o.y;
  } else {
    vec3 n = normalize(iE.xyz);
    vec3 t = normalize(cross(n, abs(n.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(n, t);
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    wp = iA.xyz + t * (r.x * iB.x) + b * (r.y * iB.y);
  }
  vec2 quv = uv;
  vec2 fs = vec2(iD.z / iF.x, iD.w / iF.y);
  float f = min(floor(iF.w * iF.z), iF.z - 1.0);
  float col = mod(f, iF.x);
  float rowTop = floor(f / iF.x);
  vec2 o0 = vec2(iD.x + fs.x * col, iD.y + iD.w - fs.y * (rowTop + 1.0));
  vUv = o0 + quv * fs;
  vCol = vec4(iC.rgb, iB.z);
  vTmix = iC.w;
  vGlow = iB.w / (1.0 + (mode > 1.5 ? 0.018 : 0.01) * iB.x * iB.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uAdd;
uniform float uGlow;
varying vec2 vUv;
varying vec4 vCol;
varying float vGlow;
varying float vTmix;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vCol.a;
  if (a < 0.004) discard;
  vec3 base = vCol.rgb * mix(vec3(1.0), t.rgb, vTmix);
  if (uAdd > 0.5) {
    vec3 c = base * vGlow * uGlow;
    c *= 1.0 / (1.0 + 0.2 * max(c.r, max(c.g, c.b))); // soft knee: keeps hue, stops blown-out whites
    gl_FragColor = vec4(c, a);
  }
  else gl_FragColor = vec4(base, a);
}
`;

export interface LayerOpts {
  cap: number;
  additive: boolean;
  renderOrder: number;
  polygonOffset?: number;
  depthTest?: boolean;
}

export class ParticleLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly data: Float32Array;
  private readonly cap: number;
  count = 0;
  private attrs: { a: Float32Array; b: Float32Array; c: Float32Array; d: Float32Array; e: Float32Array; f: Float32Array };
  private bufs: THREE.InstancedBufferAttribute[] = [];

  constructor(private atlas: AtlasLike, opts: LayerOpts, texture?: THREE.Texture) {
    this.cap = opts.cap;
    this.data = new Float32Array(opts.cap * STRIDE);
    const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (name: string) => {
      const arr = new Float32Array(opts.cap * 4);
      const at = new THREE.InstancedBufferAttribute(arr, 4);
      at.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, at);
      this.bufs.push(at);
      return arr;
    };
    this.attrs = { a: mk('iA'), b: mk('iB'), c: mk('iC'), d: mk('iD'), e: mk('iE'), f: mk('iF') };
    this.geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: texture ?? atlas.texture },
        uAdd: { value: opts.additive ? 1 : 0 },
        uGlow: { value: 0.95 },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamPos: { value: new THREE.Vector3(0, 5, 10) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      fog: false,
      polygonOffset: !!opts.polygonOffset,
      polygonOffsetFactor: opts.polygonOffset ?? 0,
      polygonOffsetUnits: opts.polygonOffset ?? 0,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.vfxLayer = true;
  }

  /** swap the sampled texture (the sprite-sheet atlas is rebuilt once its images are loaded) */
  setTexture(tex: THREE.Texture): void {
    this.material.uniforms.uMap.value = tex;
  }

  setCamera(right: THREE.Vector3, up: THREE.Vector3, pos?: THREE.Vector3): void {
    if (pos) this.material.uniforms.uCamPos.value.copy(pos);
    this.material.uniforms.uCamRight.value.copy(right);
    this.material.uniforms.uCamUp.value.copy(up);
  }

  clear(): void {
    this.count = 0;
    this.geo.instanceCount = 0;
  }

  /** Emit particles. Returns the number actually spawned. */
  spawn(s: PSpec): number {
    let n = rr(s.n, 1);
    n = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
    if (n <= 0) return 0;
    const mode = MODE_ID[s.mode ?? 'bb'];
    const at = s.at ?? [0, 0, 0];
    const ax = Array.isArray(at) ? at[0] : at.x;
    const ay = Array.isArray(at) ? at[1] : at.y;
    const az = Array.isArray(at) ? at[2] : at.z;
    const d = s.dir ?? [0, 1, 0];
    let dx = Array.isArray(d) ? d[0] : d.x;
    let dy = Array.isArray(d) ? d[1] : d.y;
    let dz = Array.isArray(d) ? d[2] : d.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const cone = s.cone ?? (s.dir ? 0.35 : Math.PI);
    const cosC = Math.cos(cone);
    // basis perpendicular to dir
    let ux: number, uy: number, uz: number;
    if (Math.abs(dy) < 0.99) {
      ux = dz;
      uy = 0;
      uz = -dx;
    } else {
      ux = 1;
      uy = 0;
      uz = 0;
    }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = dy * uz - dz * uy;
    const vy = dz * ux - dx * uz;
    const vz = dx * uy - dy * ux;
    const tex = s.tex;
    const area = s.area ?? 'sphere';
    const jit = s.jit;
    const j3: V3 | null = jit === undefined ? null : typeof jit === 'number' ? [jit, jit, jit] : jit;
    const data = this.data;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      let i: number;
      if (this.count < this.cap) i = this.count++;
      else i = Math.floor(rnd() * this.cap);
      const o = i * STRIDE;
      // position scatter
      let ox = 0, oy = 0, oz = 0;
      if (j3) {
        if (area === 'box') {
          ox = (rnd() * 2 - 1) * j3[0];
          oy = (rnd() * 2 - 1) * j3[1];
          oz = (rnd() * 2 - 1) * j3[2];
        } else if (area === 'disc') {
          const a = rnd() * 6.2832;
          const r = Math.sqrt(rnd()) * j3[0];
          ox = Math.cos(a) * r;
          oz = Math.sin(a) * r;
          oy = (rnd() * 2 - 1) * j3[1] * 0.0;
        } else if (area === 'ring') {
          const a = rnd() * 6.2832;
          ox = Math.cos(a) * j3[0];
          oz = Math.sin(a) * j3[0];
        } else {
          let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
          const l = Math.hypot(x, y, z) || 1;
          const r = Math.cbrt(rnd());
          x = (x / l) * r;
          y = (y / l) * r;
          z = (z / l) * r;
          ox = x * j3[0];
          oy = y * j3[1];
          oz = z * j3[2];
        }
      }
      // direction sample in the cone
      const cz = 1 - rnd() * (1 - cosC);
      const sz = Math.sqrt(Math.max(0, 1 - cz * cz));
      const ph = rnd() * 6.2832;
      const px = Math.cos(ph) * sz;
      const py = Math.sin(ph) * sz;
      const sx = ux * px + vx * py + dx * cz;
      const sy = uy * px + vy * py + dy * cz;
      const sZ = uz * px + vz * py + dz * cz;
      const sp = rr(s.speed, 0);
      let velx = sx * sp, vely = sy * sp, velz = sZ * sp;
      if (s.vel) {
        velx += s.vel[0];
        vely += s.vel[1];
        velz += s.vel[2];
      }
      if (s.radial !== undefined) {
        const rl = Math.hypot(ox, oz);
        const rs = rr(s.radial);
        if (rl > 1e-4) {
          velx += (ox / rl) * rs;
          velz += (oz / rl) * rs;
        } else {
          const a = rnd() * 6.2832;
          velx += Math.cos(a) * rs;
          velz += Math.sin(a) * rs;
        }
      }
      data[o + F.px] = ax + ox;
      data[o + F.py] = ay + oy;
      data[o + F.pz] = az + oz;
      data[o + F.vx] = velx;
      data[o + F.vy] = vely;
      data[o + F.vz] = velz;
      data[o + F.age] = 0;
      data[o + F.life] = Math.max(0.016, rr(s.life));
      const s0 = rr(s.size);
      data[o + F.s0] = s0;
      data[o + F.s1] = s.size1 !== undefined ? rr(s.size1) : s0 * (s.grow ?? 1);
      data[o + F.asp] = s.asp ?? 1;
      data[o + F.rot] = rr(s.rot, mode === 0 ? rnd() * 6.2832 : 0);
      data[o + F.spin] = rr(s.spin, 0);
      setRGB(data, o + F.c0r, s.c0);
      setRGB(data, o + F.c1r, s.c1 ?? s.c0);
      data[o + F.a0] = rr(s.a, 1);
      data[o + F.fi] = s.fi ?? 0.08;
      data[o + F.fp] = s.fp ?? 1.2;
      data[o + F.grav] = rr(s.grav, 0);
      data[o + F.drag] = s.drag ?? 0;
      data[o + F.bounce] = s.bounce ?? 0;
      data[o + F.mode] = mode;
      data[o + F.stretch] = s.stretch ?? 0.06;
      data[o + F.glow] = s.glow ?? 1;
      const name = typeof tex === 'string' ? tex : tex[Math.floor(rnd() * tex.length)];
      const r = this.atlas.rect(name);
      data[o + F.u0] = r[0];
      data[o + F.v0] = r[1];
      data[o + F.du] = r[2];
      data[o + F.dv] = r[3];
      data[o + F.ttl1] = s.oneFrame ? 1 : 0;
      if (mode >= 2) {
        const nrm = s.normal ?? [0, 1, 0];
        data[o + F.nx] = nrm[0];
        data[o + F.ny] = nrm[1];
        data[o + F.nz] = nrm[2];
      } else {
        data[o + F.nx] = 0;
        data[o + F.ny] = 1;
        data[o + F.nz] = 0;
      }
      data[o + F.ease] = s.ease ?? 0;
      const sh = this.atlas.sheet ? this.atlas.sheet(name) : undefined;
      data[o + F.fcols] = s.frames?.cols ?? sh?.cols ?? 1;
      data[o + F.frows] = s.frames?.rows ?? sh?.rows ?? 1;
      data[o + F.frames] = s.frames?.count ?? sh?.count ?? 1;
      data[o + F.tmix] = s.tmix ?? (sh ? 1 : 0);
      spawned++;
    }
    return spawned;
  }

  /** Advance and upload. */
  update(dt: number): void {
    const data = this.data;
    const A = this.attrs.a, B = this.attrs.b, C = this.attrs.c, D = this.attrs.d, E = this.attrs.e, Fa = this.attrs.f;
    let n = this.count;
    let i = 0;
    while (i < n) {
      const o = i * STRIDE;
      const life = data[o + F.life];
      if (data[o + F.ttl1] > 0.5) {
        if (data[o + F.age] > 0) {
          this.removeAt(i, --n);
          continue;
        }
        data[o + F.age] = 0.0001;
      } else {
        const age = (data[o + F.age] += dt);
        if (age >= life) {
          this.removeAt(i, --n);
          continue;
        }
        // integrate
        const drag = data[o + F.drag];
        if (drag > 0) {
          const k = Math.exp(-drag * dt);
          data[o + F.vx] *= k;
          data[o + F.vy] *= k;
          data[o + F.vz] *= k;
        }
        data[o + F.vy] -= data[o + F.grav] * dt;
        data[o + F.px] += data[o + F.vx] * dt;
        data[o + F.py] += data[o + F.vy] * dt;
        data[o + F.pz] += data[o + F.vz] * dt;
        const bounce = data[o + F.bounce];
        if (bounce > 0 && data[o + F.py] < 0.03) {
          data[o + F.py] = 0.03;
          if (data[o + F.vy] < 0) {
            data[o + F.vy] *= -bounce;
            data[o + F.vx] *= 0.72;
            data[o + F.vz] *= 0.72;
            data[o + F.spin] *= 0.6;
            if (Math.abs(data[o + F.vy]) < 0.6) data[o + F.vy] = 0;
          }
        }
        data[o + F.rot] += data[o + F.spin] * dt;
      }
      const age = data[o + F.age];
      const t = data[o + F.ttl1] > 0.5 ? 0 : age / life;
      const mode = data[o + F.mode];
      // size
      let e = t;
      const ease = data[o + F.ease];
      if (ease === 1) e = 1 - (1 - t) * (1 - t);
      else if (ease === 2) e = 1 - (1 - t) * (1 - t) * (1 - t);
      const size = data[o + F.s0] + (data[o + F.s1] - data[o + F.s0]) * e;
      // alpha
      const fi = data[o + F.fi];
      let alpha = data[o + F.a0] * (fi > 0 && t < fi ? t / fi : 1) * Math.pow(1 - t, data[o + F.fp]);
      if (data[o + F.ttl1] > 0.5) alpha = data[o + F.a0];
      const q = i * 4;
      A[q] = data[o + F.px];
      A[q + 1] = data[o + F.py];
      A[q + 2] = data[o + F.pz];
      A[q + 3] = data[o + F.rot];
      const asp = data[o + F.asp];
      if (mode === 1) {
        const sp = Math.hypot(data[o + F.vx], data[o + F.vy], data[o + F.vz]);
        B[q] = size;
        B[q + 1] = size * asp + sp * data[o + F.stretch];
      } else {
        B[q] = size;
        B[q + 1] = size * asp;
      }
      B[q + 2] = alpha;
      B[q + 3] = data[o + F.glow];
      C[q] = data[o + F.c0r] + (data[o + F.c1r] - data[o + F.c0r]) * t;
      C[q + 1] = data[o + F.c0g] + (data[o + F.c1g] - data[o + F.c0g]) * t;
      C[q + 2] = data[o + F.c0b] + (data[o + F.c1b] - data[o + F.c0b]) * t;
      C[q + 3] = data[o + F.tmix];
      D[q] = data[o + F.u0];
      D[q + 1] = data[o + F.v0];
      D[q + 2] = data[o + F.du];
      D[q + 3] = data[o + F.dv];
      if (mode === 1) {
        E[q] = data[o + F.vx];
        E[q + 1] = data[o + F.vy];
        E[q + 2] = data[o + F.vz];
      } else {
        E[q] = data[o + F.nx];
        E[q + 1] = data[o + F.ny];
        E[q + 2] = data[o + F.nz];
      }
      E[q + 3] = mode;
      Fa[q] = data[o + F.fcols];
      Fa[q + 1] = data[o + F.frows];
      Fa[q + 2] = data[o + F.frames];
      Fa[q + 3] = t;
      i++;
    }
    this.count = n;
    this.geo.instanceCount = n;
    if (n > 0) {
      for (const b of this.bufs) {
        b.clearUpdateRanges();
        b.addUpdateRange(0, n * 4);
        b.needsUpdate = true;
      }
    }
    this.mesh.visible = n > 0;
  }

  private removeAt(i: number, last: number): void {
    if (i !== last) this.data.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
  }
}
