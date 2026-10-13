import { TileNoise } from '../ProceduralAssets';

/**
 * Splat painting, PURE (no three.js, no canvas): the ground "ops" (road lines, camp discs, village plazas...) painted into a
 * 3-channel Uint8 splat (dirt, cobble, dark). Terrain.ts paints ONE map-sized splat with it (small zones, unchanged output);
 * the chunked terrain paints one 128 px splat per 64 m chunk in WORLD coordinates (paintSplatChunk), only from the ops that touch
 * the chunk, so a 4 km zone never allocates a 4 km splat. OWNER: world module (engine).
 */

export type SplatChannel = 'dirt' | 'cobble' | 'dark';

export type SplatOp =
  | { t: 'rect'; ch: SplatChannel; x: number; z: number; hw: number; hd: number; rot?: number; soft?: number; amount?: number }
  | { t: 'disc'; ch: SplatChannel; x: number; z: number; r: number; soft?: number; amount?: number }
  | { t: 'ring'; ch: SplatChannel; x: number; z: number; r0: number; r1: number; soft?: number; amount?: number }
  | { t: 'line'; ch: SplatChannel; x0: number; z0: number; x1: number; z1: number; w: number; soft?: number; amount?: number };

export const SPLAT_CH_INDEX = { dirt: 0, cobble: 1, dark: 2 } as const;
/** Largest |displacement| of the organic edge noise (fbm 1.2 + sample 0.45). Used to reject far pixels early. */
export const EDGE_NOISE_MAX = 1.7;

/** Bounding box (metres, op frame) of everything an op can touch, soft band and edge noise included. */
export function opBounds(op: SplatOp): { x0: number; x1: number; z0: number; z1: number } {
  const soft = op.soft ?? 1.2;
  if (op.t === 'rect') {
    const r = Math.hypot(op.hw, op.hd) + soft + 2;
    return { x0: op.x - r, x1: op.x + r, z0: op.z - r, z1: op.z + r };
  }
  if (op.t === 'disc') return { x0: op.x - op.r - soft - 2, x1: op.x + op.r + soft + 2, z0: op.z - op.r - soft - 2, z1: op.z + op.r + soft + 2 };
  if (op.t === 'ring') return { x0: op.x - op.r1 - soft - 2, x1: op.x + op.r1 + soft + 2, z0: op.z - op.r1 - soft - 2, z1: op.z + op.r1 + soft + 2 };
  return {
    x0: Math.min(op.x0, op.x1) - op.w - soft - 2, x1: Math.max(op.x0, op.x1) + op.w + soft + 2,
    z0: Math.min(op.z0, op.z1) - op.w - soft - 2, z1: Math.max(op.z0, op.z1) + op.w + soft + 2,
  };
}

/** Signed distance (m) from (wx, wz) to the op's shape without the edge noise: negative inside. */
export function opRaw(op: SplatOp, wx: number, wz: number): number {
  if (op.t === 'rect') {
    const c = Math.cos(op.rot ?? 0), s = Math.sin(op.rot ?? 0);
    const dx = wx - op.x, dz = wz - op.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.max(Math.abs(lx) - op.hw, Math.abs(lz) - op.hd);
  }
  if (op.t === 'disc') return Math.hypot(wx - op.x, wz - op.z) - op.r;
  if (op.t === 'ring') {
    const r = Math.hypot(wx - op.x, wz - op.z);
    return Math.max(op.r0 - r, r - op.r1);
  }
  const vx = op.x1 - op.x0, vz = op.z1 - op.z0;
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((wx - op.x0) * vx + (wz - op.z0) * vz) / L2));
  return Math.hypot(wx - (op.x0 + vx * t), wz - (op.z0 + vz * t)) - op.w / 2;
}

/**
 * Value written for one pixel: `d` = signed distance with the edge noise, `soft` the op's soft band. 0 = untouched. Hard-ish edge
 * with a dithered band (the dither follows the pixel parity px, pz).
 */
export function splatCoverage(d: number, soft: number, px: number, pz: number): number {
  if (d > soft) return 0;
  const w = 1 - Math.max(0, d) / soft;
  const dither = (((px & 1) + ((pz & 1) << 1)) / 4 - 0.4) * 0.35;
  return w + (d > -0.5 ? dither : 0) > 0.5 ? 1 : w > 0.15 ? 0.5 : 0;
}

export function applySplat(data: Uint8Array | Uint8ClampedArray, i: number, ch: SplatChannel, w: number, amount: number): void {
  const k = i * 3 + SPLAT_CH_INDEX[ch];
  const v = Math.round(Math.max(0, Math.min(1, w)) * amount * 255);
  if (v > data[k]) data[k] = v;
}

// ---------------------------------------------------------------------------
// Chunked painting (world coordinates)
// ---------------------------------------------------------------------------

/** World-space noise periods (m) of the chunk splat: edge wobble, fine edge noise, moss patches. */
const EDGE_PERIOD = 213.3;
const FINE_PERIOD = 58.2;
const MOSS_PERIOD = 128;

/** Spatial index of ops by bucket: only the ops whose bounding box touches a region are painted into it. */
export class SplatOpIndex {
  private readonly cells = new Map<number, number[]>();

  /** cell = bucket edge (m); ops are in the splat frame (map centre = 0,0). */
  constructor(private readonly ops: readonly SplatOp[], private readonly cell: number) {
    ops.forEach((op, i) => {
      const b = opBounds(op);
      const c0 = Math.floor(b.x0 / cell), c1 = Math.floor(b.x1 / cell), r0 = Math.floor(b.z0 / cell), r1 = Math.floor(b.z1 / cell);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const k = SplatOpIndex.key(c, r);
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(i);
        }
    });
  }

  private static key(c: number, r: number): number {
    return (c + 32768) * 65536 + (r + 32768);
  }

  /** Ops whose bounding box may touch the rectangle, in ORIGINAL order (paint order stays stable). */
  query(x0: number, z0: number, x1: number, z1: number): SplatOp[] {
    const c0 = Math.floor(x0 / this.cell), c1 = Math.floor(x1 / this.cell), r0 = Math.floor(z0 / this.cell), r1 = Math.floor(z1 / this.cell);
    const ids = new Set<number>();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) for (const i of this.cells.get(SplatOpIndex.key(c, r)) ?? []) ids.add(i);
    return [...ids].sort((a, b) => a - b).map((i) => this.ops[i]);
  }
}

export interface SplatChunkSpec {
  /** Chunk origin (m, splat frame) and edge. */
  x0: number;
  z0: number;
  size: number;
  /** Pixels per edge. */
  res: number;
}

/**
 * Paints one chunk's splat (res x res x 3 bytes, row 0 = z0) from `ops`. Pixels of neighbouring chunks agree at the seam: the
 * painting depends only on the world position of the pixel (shape distance + world-space noise), never on the chunk.
 */
export function paintSplatChunk(spec: SplatChunkSpec, ops: readonly SplatOp[], noise: TileNoise): Uint8Array {
  const { x0, z0, size, res } = spec;
  const data = new Uint8Array(res * res * 3);
  const mpp = size / res;
  for (const op of ops) {
    const soft = op.soft ?? 1.2;
    const amount = op.amount ?? 1;
    const b = opBounds(op);
    const px0 = Math.max(0, Math.floor((b.x0 - x0) / mpp)), px1 = Math.min(res - 1, Math.ceil((b.x1 - x0) / mpp));
    const pz0 = Math.max(0, Math.floor((b.z0 - z0) / mpp)), pz1 = Math.min(res - 1, Math.ceil((b.z1 - z0) / mpp));
    for (let pz = pz0; pz <= pz1; pz++)
      for (let px = px0; px <= px1; px++) {
        const wx = x0 + (px + 0.5) * mpp, wz = z0 + (pz + 0.5) * mpp;
        const raw = opRaw(op, wx, wz);
        if (raw - EDGE_NOISE_MAX > soft) continue;
        const nz = (noise.fbm(wx / EDGE_PERIOD, wz / EDGE_PERIOD) - 0.5) * 2.4 + (noise.sample(wx / FINE_PERIOD, wz / FINE_PERIOD, 3) - 0.5) * 0.9;
        const cov = splatCoverage(raw + nz, soft, Math.floor(wx / mpp), Math.floor(wz / mpp));
        if (cov > 0) applySplat(data, pz * res + px, op.ch, cov, amount);
      }
  }
  // dark moss patches everywhere (very light), noise per 2x2 block
  const blk = 2;
  for (let by = 0; by < res; by += blk)
    for (let bx = 0; bx < res; bx += blk) {
      const n = noise.fbm((x0 + bx * mpp) / MOSS_PERIOD + 0.3, (z0 + by * mpp) / MOSS_PERIOD + 0.7);
      if (n <= 0.64) continue;
      const add = Math.min(255, Math.round((n - 0.64) * 6 * 255));
      for (let pz = by; pz < Math.min(res, by + blk); pz++)
        for (let px = bx; px < Math.min(res, bx + blk); px++) {
          const i = pz * res + px;
          if (data[i * 3] < 51 && data[i * 3 + 1] < 51 && add > data[i * 3 + 2]) data[i * 3 + 2] = add;
        }
    }
  return data;
}

/** Splat weights at a point of a painted chunk (nearest pixel), 0 outside. */
export function splatWeightsAt(data: Uint8Array, spec: SplatChunkSpec, x: number, z: number): { dirt: number; cobble: number; dark: number } {
  const mpp = spec.size / spec.res;
  const px = Math.floor((x - spec.x0) / mpp), pz = Math.floor((z - spec.z0) / mpp);
  if (px < 0 || pz < 0 || px >= spec.res || pz >= spec.res) return { dirt: 0, cobble: 0, dark: 0 };
  const i = (pz * spec.res + px) * 3;
  return { dirt: data[i] / 255, cobble: data[i + 1] / 255, dark: data[i + 2] / 255 };
}

/**
 * Painted chunk splats on demand with a small LRU: the terrain mesh of a chunk and the scatter generator (marsh reeds read the
 * `dark` channel) see the very same pixels. World frame in, splat frame (map centre = 0,0) inside.
 */
export class ChunkSplats {
  private readonly index: SplatOpIndex;
  private readonly noise: TileNoise;
  private readonly cache = new Map<number, Uint8Array>();

  constructor(
    ops: readonly SplatOp[],
    seed: string,
    /** Map centre (m, world frame): the ops are expressed relative to it. */
    readonly mapCx: number,
    readonly mapCz: number,
    readonly chunkM: number,
    readonly res = 128,
    private readonly maxCached = 192,
  ) {
    this.index = new SplatOpIndex(ops, chunkM);
    this.noise = new TileNoise(`terrain:${seed}`, 8, 4);
  }

  /** Splat-frame spec of chunk (cx, cz) (world chunk indices). */
  spec(cx: number, cz: number): SplatChunkSpec {
    return { x0: cx * this.chunkM - this.mapCx, z0: cz * this.chunkM - this.mapCz, size: this.chunkM, res: this.res };
  }

  get(cx: number, cz: number): Uint8Array {
    const k = (cx + 32768) * 65536 + (cz + 32768);
    const hit = this.cache.get(k);
    if (hit) {
      // refresh LRU position
      this.cache.delete(k);
      this.cache.set(k, hit);
      return hit;
    }
    const sp = this.spec(cx, cz);
    const data = paintSplatChunk(sp, this.index.query(sp.x0 - 4, sp.z0 - 4, sp.x0 + sp.size + 4, sp.z0 + sp.size + 4), this.noise);
    this.cache.set(k, data);
    if (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value as number);
    return data;
  }

  /** Splat weights at a WORLD position. */
  weights(x: number, z: number): { dirt: number; cobble: number; dark: number } {
    const cx = Math.floor(x / this.chunkM), cz = Math.floor(z / this.chunkM);
    return splatWeightsAt(this.get(cx, cz), this.spec(cx, cz), x - this.mapCx, z - this.mapCz);
  }

  get cached(): number {
    return this.cache.size;
  }
}
