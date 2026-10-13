import * as THREE from 'three';
import { RNG } from '../core/utils';
import { applyPSXTexture, patchPSX } from '../render/psx';

/**
 * Procedural PSX art: canvas-generated tiny textures (value-noise + palette quantise + ordered dither),
 * sprite textures, material/tint helpers. Everything here is deterministic for a given seed so peers agree
 * (cosmetic only anyway). OWNER: world module.
 */

export type RGB = [number, number, number];
export const hexToRGB = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const rgbToHex = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulRGB = (a: RGB, k: number): RGB => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];

/** Multiply two 0xRRGGBB colours (component-wise, like a material tint). */
export function mulHex(a: number, b: number): number {
  const x = hexToRGB(a), y = hexToRGB(b);
  return rgbToHex([(x[0] * y[0]) / 255, (x[1] * y[1]) / 255, (x[2] * y[2]) / 255].map(Math.round) as RGB);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold in (-0.5, 0.5). */
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;

// ---------------------------------------------------------------------------
// Tileable value noise
// ---------------------------------------------------------------------------

/** Tileable 2D value noise. sample(u, v) with u,v in [0,1) wraps seamlessly; fbm sums octaves. */
export class TileNoise {
  private grids: Float32Array[] = [];
  private sizes: number[] = [];
  constructor(seed: number | string, baseCells = 4, octaves = 4) {
    const rng = new RNG(seed);
    for (let o = 0; o < octaves; o++) {
      const n = baseCells << o;
      const g = new Float32Array(n * n);
      for (let i = 0; i < g.length; i++) g[i] = rng.next();
      this.grids.push(g);
      this.sizes.push(n);
    }
  }
  private octave(o: number, u: number, v: number): number {
    const n = this.sizes[o], g = this.grids[o];
    const x = (((u % 1) + 1) % 1) * n, y = (((v % 1) + 1) % 1) * n;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], d = g[y1 * n + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** Single octave (o = 0 is the coarsest). */
  sample(u: number, v: number, o = 0): number {
    return this.octave(Math.min(o, this.grids.length - 1), u, v);
  }
  /** Fractal sum normalised to 0..1. */
  fbm(u: number, v: number, octaves = this.grids.length): number {
    let amp = 1, sum = 0, norm = 0;
    for (let o = 0; o < Math.min(octaves, this.grids.length); o++) {
      sum += this.octave(o, u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

// ---------------------------------------------------------------------------
// Canvas -> texture helpers
// ---------------------------------------------------------------------------

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

export interface TexOpts { repeat?: boolean; srgb?: boolean; mipmaps?: boolean; flipY?: boolean }

/** Wrap a painted canvas as a nearest-filtered PSX texture. */
export function canvasTexture(canvas: HTMLCanvasElement, opts: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.flipY === false) t.flipY = false;
  applyPSXTexture(t, { mipmaps: opts.mipmaps ?? true });
  t.needsUpdate = true;
  return t;
}

/** Quantise a 0..1 value into a palette index with ordered dither. */
function pick(palette: RGB[], v: number, x: number, y: number, dither = 0.9): RGB {
  const n = palette.length;
  const f = Math.min(0.9999, Math.max(0, v)) * (n - 1) + bayer(x, y) * dither;
  const i = Math.min(n - 1, Math.max(0, Math.round(f)));
  return palette[i];
}

function paint(size: number, fn: (x: number, y: number, u: number, v: number) => RGB | [number, number, number, number]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = fn(x, y, x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = c.length === 4 ? c[3] : 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const pal = (...hex: number[]): RGB[] => hex.map(hexToRGB);

// ---------------------------------------------------------------------------
// Texture generators (all return canvases; wrap with canvasTexture)
// ---------------------------------------------------------------------------

export type SurfaceKind = 'grass' | 'dirt' | 'cobble' | 'brick' | 'rock' | 'sand' | 'snow' | 'iron' | 'planks' | 'lava' | 'ice' | 'moss' | 'water' | 'tiles';

/** Tileable Voronoi helper: returns [nearestId, d1, d2] for a pixel on a wrapped jittered grid. */
function voronoi(u: number, v: number, cells: number, jitter: Float32Array): { id: number; d1: number; d2: number } {
  const x = u * cells, y = v * cells;
  const cx = Math.floor(x), cy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const gx = (((cx + i) % cells) + cells) % cells, gy = (((cy + j) % cells) + cells) % cells;
      const k = (gy * cells + gx) * 2;
      const px = cx + i + 0.15 + jitter[k] * 0.7, py = cy + j + 0.15 + jitter[k + 1] * 0.7;
      const d = Math.hypot(px - x, py - y);
      if (d < d1) { d2 = d1; d1 = d; id = gy * cells + gx; } else if (d < d2) d2 = d;
    }
  return { id, d1, d2 };
}

export function surfaceCanvas(kind: SurfaceKind, seed: number | string = 1, size = 64): HTMLCanvasElement {
  const rng = new RNG(`${kind}:${seed}`);
  const noise = new TileNoise(`${kind}:n:${seed}`, 4, 4);
  switch (kind) {
    case 'grass': {
      const p = pal(0x294319, 0x35561f, 0x43692a, 0x558236, 0x6f9c44);
      return paint(size, (x, y, u, v) => {
        let n = noise.fbm(u, v) * 0.85 + noise.sample(u * 3, v * 3, 3) * 0.3 - 0.1;
        const r = rng.next();
        if (r > 0.965) n += 0.35; else if (r < 0.04) n -= 0.3;
        return pick(p, n, x, y, 0.7);
      });
    }
    case 'moss': {
      const p = pal(0x1d2a14, 0x2a3d1b, 0x3a5224, 0x4e6a2c);
      return paint(size, (x, y, u, v) => pick(p, noise.fbm(u, v) + (rng.next() - 0.5) * 0.18, x, y));
    }
    case 'dirt': {
      const p = pal(0x3a2a1c, 0x4b3724, 0x5e452c, 0x73563a, 0x8a6b48);
      return paint(size, (x, y, u, v) => {
        let n = noise.fbm(u, v) + (rng.next() - 0.5) * 0.25;
        if (rng.next() > 0.97) n += 0.45; // pebbles
        return pick(p, n, x, y);
      });
    }
    case 'sand': {
      const p = pal(0x8a7650, 0x9c8860, 0xb09c70, 0xc4b080);
      return paint(size, (x, y, u, v) => pick(p, noise.fbm(u, v) + (rng.next() - 0.5) * 0.2, x, y));
    }
    case 'snow': {
      const p = pal(0x9eb4c8, 0xc0d4e4, 0xdceaf4, 0xf4fafe);
      return paint(size, (x, y, u, v) => pick(p, noise.fbm(u, v) * 0.9 + (rng.next() - 0.5) * 0.18, x, y));
    }
    case 'cobble': {
      const cells = 6;
      const jit = new Float32Array(cells * cells * 2).map(() => rng.next());
      const stone = pal(0x4a4640, 0x5e5850, 0x716a60, 0x857d70, 0x978e7e);
      const mortar = hexToRGB(0x2a2622);
      return paint(size, (x, y, u, v) => {
        const vo = voronoi(u, v, cells, jit);
        const edge = vo.d2 - vo.d1;
        if (edge < 0.11) return mortar;
        const shade = ((vo.id * 2654435761) % 1000) / 1000;
        const n = shade * 0.7 + noise.fbm(u, v) * 0.35 - edge * 0.15;
        return pick(stone, n, x, y, 0.6);
      });
    }
    case 'tiles': {
      const p = pal(0x3d3a45, 0x4d4a58, 0x5d5a6a, 0x6e6a7c);
      const mortar = hexToRGB(0x1f1d26);
      const n = 4;
      return paint(size, (x, y, u, v) => {
        const tx = Math.floor(u * n), ty = Math.floor(v * n);
        const fx = (u * n) % 1, fy = (v * n) % 1;
        if (fx < 0.08 || fy < 0.08) return mortar;
        const shade = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % 100 / 100;
        return pick(p, shade * 0.7 + noise.fbm(u, v) * 0.4, x, y, 0.6);
      });
    }
    case 'brick': {
      const p = pal(0x4b4841, 0x5d5950, 0x6f6a5f, 0x827c6f);
      const mortar = hexToRGB(0x26231f);
      const rows = 8, cols = 4;
      return paint(size, (x, y, u, v) => {
        const ry = Math.floor(v * rows);
        const off = (ry & 1) * 0.5 / cols;
        const uu = (u + off) % 1;
        const bx = Math.floor(uu * cols);
        const fx = (uu * cols) % 1, fy = (v * rows) % 1;
        if (fx < 0.07 || fy < 0.12) return mortar;
        const shade = (((bx * 83492791) ^ (ry * 2654435761)) >>> 0) % 100 / 100;
        return pick(p, shade * 0.6 + noise.fbm(u, v) * 0.5, x, y, 0.7);
      });
    }
    case 'rock': {
      const p = pal(0x15141a, 0x201e26, 0x2b2832, 0x38353f);
      return paint(size, (x, y, u, v) => pick(p, noise.fbm(u, v) * 1.1 + (rng.next() - 0.5) * 0.25, x, y));
    }
    case 'iron': {
      const p = pal(0x1c1d22, 0x2b2d34, 0x3c3f48, 0x555964);
      return paint(size, (x, y, u, v) => pick(p, noise.fbm(u, v) * 0.8 + 0.1 + (rng.next() - 0.5) * 0.3, x, y));
    }
    case 'planks': {
      const p = pal(0x3a2616, 0x4c321c, 0x5e4023, 0x714e2c);
      const n = 4;
      return paint(size, (x, y, u, v) => {
        const row = Math.floor(v * n);
        const fy = (v * n) % 1;
        if (fy < 0.1) return p[0];
        const grain = noise.sample(u * 2 + row * 0.37, v * 12, 3);
        return pick(p, grain * 0.8 + (((row * 7919) % 11) / 11) * 0.35, x, y, 0.5);
      });
    }
    case 'lava': {
      const p = pal(0x1a0e0c, 0x2a1512, 0x3a1c16, 0x4c251c);
      const glow = hexToRGB(0xff7a20);
      const cells = 5;
      const jit = new Float32Array(cells * cells * 2).map(() => rng.next());
      return paint(size, (x, y, u, v) => {
        const vo = voronoi(u, v, cells, jit);
        const edge = vo.d2 - vo.d1;
        if (edge < 0.07) return glow;
        return pick(p, noise.fbm(u, v) + (rng.next() - 0.5) * 0.3, x, y);
      });
    }
    case 'ice': {
      const p = pal(0x6aa0c4, 0x88bcdc, 0xaad4ec, 0xd0ecfa);
      const cells = 4;
      const jit = new Float32Array(cells * cells * 2).map(() => rng.next());
      return paint(size, (x, y, u, v) => {
        const vo = voronoi(u, v, cells, jit);
        const edge = vo.d2 - vo.d1;
        if (edge < 0.05) return p[3];
        return pick(p, noise.fbm(u, v) * 0.9 + 0.1 + (rng.next() - 0.5) * 0.12, x, y);
      });
    }
    case 'water': {
      const p = pal(0x1e4a78, 0x2a5f93, 0x3a78ae, 0x6aa8d4);
      return paint(size, (x, y, u, v) => {
        const n = noise.fbm(u + Math.sin(v * 6.28) * 0.05, v, 3);
        const hi = noise.sample(u * 2, v * 2, 3) > 0.74 ? 0.3 : 0;
        return pick(p, n * 0.9 + hi, x, y, 0.5);
      });
    }
  }
}

/** Emissive map for lava floors (glow cracks only; everything else black). */
export function lavaEmissiveCanvas(seed: number | string = 1, size = 64): HTMLCanvasElement {
  const rng = new RNG(`lava:${seed}`);
  const cells = 5;
  const jit = new Float32Array(cells * cells * 2).map(() => rng.next());
  return paint(size, (_x, _y, u, v) => {
    const vo = voronoi(u, v, cells, jit);
    const edge = vo.d2 - vo.d1;
    return edge < 0.07 ? hexToRGB(0xff7a20) : [0, 0, 0];
  });
}

/** Tileable cached texture per (kind, seed, size). */
const texCache = new Map<string, THREE.CanvasTexture>();
export function surfaceTexture(kind: SurfaceKind, seed: number | string = 1, size = 64, opts: TexOpts = {}): THREE.CanvasTexture {
  const key = `${kind}|${seed}|${size}|${opts.mipmaps ?? true}`;
  let t = texCache.get(key);
  if (!t) {
    t = canvasTexture(surfaceCanvas(kind, seed, size), opts);
    texCache.set(key, t);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Sprite textures
// ---------------------------------------------------------------------------

/**
 * Process-lifetime texture cache: one GPU texture per kind, shared by every builder that asks for it. Builders must NOT dispose
 * these (a disposed texture would be re-uploaded on the next visit, and per-visit textures were the open world's GPU growth).
 */
const sharedTextures = new Map<string, THREE.CanvasTexture>();
export function sharedTexture(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = sharedTextures.get(key);
  if (!t) {
    t = make();
    sharedTextures.set(key, t);
  }
  return t;
}

/** Chunky posterised radial glow (PSX-style lens flare blob). Shared per (size, steps, power). */
export function glowTexture(size = 32, steps = 6, power = 1.6): THREE.CanvasTexture {
  return sharedTexture(`glow|${size}|${steps}|${power}`, () => {
    const c = paint(size, (x, y) => {
      const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      let a = Math.pow(1 - d, power);
      a = Math.round(a * steps + bayer(x, y) * 0.8) / steps;
      const v = Math.max(0, Math.min(1, a)) * 255;
      return [255, 255, 255, v];
    });
    return canvasTexture(c, { repeat: false, mipmaps: false });
  });
}

/** Flame-shaped teardrop sprite (white; tint via colour). Shared per size. */
export function flameTexture(size = 32): THREE.CanvasTexture {
  return sharedTexture(`flame|${size}`, () => {
    const c = paint(size, (x, y) => {
      const u = (x + 0.5) / size, v = (y + 0.5) / size; // v=0 top
      const w = Math.sin(Math.PI * Math.pow(v, 0.8)) * 0.42 * (0.35 + v * 0.65); // widest near the bottom third
      const d = Math.abs(u - 0.5);
      let a = d < w ? 1 - (d / Math.max(w, 0.001)) * 0.8 : 0;
      a *= Math.min(1, v * 6) * (1 - Math.pow(Math.abs(v - 0.62) * 1.9, 3) * 0.2);
      a = Math.round(a * 4 + bayer(x, y) * 0.6) / 4;
      return [255, 255, 255, Math.max(0, Math.min(1, a)) * 255];
    });
    return canvasTexture(c, { repeat: false, mipmaps: false });
  });
}

/** Cobweb on a right-angle corner (alpha cutout, white). Triangle fan with concentric sagging threads. */
export function cobwebTexture(size = 64): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(230,230,230,0.95)';
  ctx.lineWidth = 1;
  // origin at the top-left corner, threads fan out toward the opposite corner
  const rays = 5;
  for (let i = 0; i <= rays; i++) {
    const a = (i / rays) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * size * 1.1, Math.sin(a) * size * 1.1);
    ctx.stroke();
  }
  for (let r = 1; r <= 5; r++) {
    const rad = (r / 5) * size * 0.98;
    ctx.beginPath();
    for (let i = 0; i <= rays; i++) {
      const a = (i / rays) * (Math.PI / 2);
      const sag = i === 0 || i === rays ? 0 : rad * 0.12;
      const x = Math.cos(a) * (rad - sag), y = Math.sin(a) * (rad - sag);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // hard alpha (no AA) for the PSX look
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] > 80 ? 255 : 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 235;
    img.data[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, { repeat: false, mipmaps: false });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface PSXMatOpts {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  affine?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveMap?: THREE.Texture;
  emissiveIntensity?: number;
  transparent?: boolean;
  alphaTest?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
  flatShading?: boolean;
}

/** A PSX-patched MeshStandardMaterial with a procedural texture. */
export function psxMaterial(map: THREE.Texture | null, o: PSXMatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: map ?? null,
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 0.95,
    metalness: 0,
    emissive: o.emissive ?? 0x000000,
    emissiveMap: o.emissiveMap ?? null,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    alphaTest: o.alphaTest ?? 0,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
    flatShading: o.flatShading ?? false,
  });
  patchPSX(m, { affine: o.affine ?? false });
  return m;
}

/** Clone a loaded model's materials and multiply their colour (tint variants of KayKit/Kenney pieces). */
export function tintObject(obj: THREE.Object3D, color: THREE.ColorRepresentation, emissiveBoost = 0): void {
  const c = new THREE.Color(color);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const tintOne = (mat: THREE.Material): THREE.Material => {
      const cl = mat.clone();
      patchPSX(cl);
      const sm = cl as THREE.MeshStandardMaterial;
      if (sm.color) sm.color.multiply(c);
      if (emissiveBoost > 0 && sm.emissive) {
        sm.emissive.copy(c).multiplyScalar(emissiveBoost);
        sm.emissiveIntensity = 1;
      }
      return cl;
    };
    m.material = Array.isArray(m.material) ? m.material.map(tintOne) : tintOne(m.material);
  });
}

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

/** BoxGeometry whose UVs are in world metres * scale (so textures tile uniformly regardless of box size). */
export function worldUVBox(w: number, h: number, d: number, uvScale = 0.25): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, px * uvScale, pz * uvScale);
    else if (nx > 0.5) uv.setXY(i, pz * uvScale, py * uvScale);
    else uv.setXY(i, px * uvScale, py * uvScale);
  }
  uv.needsUpdate = true;
  return g;
}

/** Seeded RNG per string key (convenience). */
export const seeded = (key: string | number) => new RNG(key);
