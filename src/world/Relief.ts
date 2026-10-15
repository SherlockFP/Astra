/**
 * Relief: the rolling ground of an open-world zone (docs/ENGINE_BIGMAPS.md section 10). OWNER: world module (engine).
 *
 * PURE: no three.js import, so `node` sims can import it. Everything is a function of the DungeonDef (rooms, regions, roads, water,
 * villages, POIs, `world.relief`) and nothing else: no Math.random, no clock, no trigonometry / pow (only + - * / sqrt floor min
 * max abs on doubles, which every JS engine rounds identically), so every peer bakes bit-identical heights.
 *
 * The ground IS a height grid (`cellM` metres, 4 by default) with the triangle interpolation defined below. `groundY(x, z)` evaluates
 * that exact surface, and the terrain meshes (ReliefMesh.ts) put their vertices on the grid with the same diagonals, so what the
 * player stands on and what is drawn are the same surface (parity is asserted by dev/combat-sim/terrain.mjs).
 *
 * Bake order (each step reads the grid the steps before it left):
 *   1. rolling noise with the region profile (amp / scale / base / ridged), blended across region borders over ~24 m
 *   2. ridges and plateaus of the zone data, map-edge hills (the void around the walkable area rises)
 *   3. flat pads (start, exit, villages, landmarks, bosses, entrances, metin, rares, mini-bosses, waypoints, shrines, chests, flat[])
 *      The pad height is the mean of the grid under the pad; the vertices within 1.5 cells of the pad are set to it EXACTLY (and pinned),
 *      so everything placed inside the pad sits on a plane; outside, the ground blends back over `fall` metres.
 *   4. lakes (`world.water`) sit in basins with a gently rising shore; roads are smoothed along their length and flattened across;
 *      bridges are pinned to water level
 *   5. slope clamp: |dh| <= maxGrade * distance between every pair of neighbouring vertices (8-neighbourhood), pinned vertices stay.
 *      With the default maxGrade 0.34 every 1 m nav step is below VERT.STEP_UP (0.45), so no cliffs are needed.
 */
import { TILE_SIZE, type DungeonDef, type ReliefProfile, type WorldRelief } from '../types/dungeons';
import { paintRoomTiles } from './NavBase';

const T = TILE_SIZE;

/** The grid reaches this far beyond the zone edge on every side (m). A multiple of every chunk size (64) and cell size. */
export const RELIEF_MARGIN_M = 192;
/** Height of the water planes (WorldDecor.buildWater). */
export const WATER_Y = 0.03;
/** Default steepest grade; the hard limit keeps 1 m nav steps below VERT.STEP_UP (0.45). */
export const DEFAULT_MAX_GRADE = 0.34;
export const HARD_MAX_GRADE = 0.4;

const DEFAULT_PROFILE: ReliefProfile = { amp: 4, scale: 120 };

// ---------------------------------------------------------------------------------------------------------------------------------
// seeded value noise (integer hash, quintic interpolation)
// ---------------------------------------------------------------------------------------------------------------------------------

/** FNV-1a of a string as an unsigned 32-bit integer. */
export function reliefSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function lattice(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ seed) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = lattice(ix, iz, seed), b = lattice(ix + 1, iz, seed), c = lattice(ix, iz + 1, seed), d = lattice(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const OCTAVES = 3;
const GAIN = 0.38;
/** Fractal value noise in [0, 1], mean about 0.5. `x`, `z` are in units of the broadest wavelength. */
function fbm(x: number, z: number, seed: number): number {
  let sum = 0, norm = 0, amp = 1, f = 1;
  for (let o = 0; o < OCTAVES; o++) {
    sum += amp * vnoise(x * f + o * 17.31, z * f + o * 9.17, (seed + Math.imul(o + 1, 1013)) | 0);
    norm += amp;
    amp *= GAIN;
    f *= 2;
  }
  return sum / norm;
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------------------------------------------------------------------------------------------------------------------------------
// the baked surface
// ---------------------------------------------------------------------------------------------------------------------------------

/** One flat pad as baked (for tools and tests): the plane `y` holds exactly inside the rounded rectangle. */
export interface ReliefPad {
  kind: string;
  id: string;
  x: number; z: number;
  /** Half extents of the box (m); a circle has 0 / 0 and `rr` = radius. */
  hx: number; hz: number;
  /** Corner radius (m). */
  rr: number;
  y: number;
}

export interface ReliefStats {
  minY: number;
  maxY: number;
  /** Steepest gradient magnitude of the surface (m per m). */
  maxGrade: number;
  /** Steepest step between two neighbouring grid vertices (m per m); <= the zone's maxGrade except where two flat pads sit too close (then <= the 0.4 hard limit). */
  maxStep: number;
  /** Neighbouring vertex pairs above the zone's maxGrade (0 on a well laid out zone; the content check warns). */
  overGrade: number;
  /** Vertices the slope clamp moved by more than 5 cm. */
  clampedFraction: number;
  buildMs: number;
}

export class Relief {
  /** Same shape as WorldHeights / NavHeightSource, so World.heights and NavGrid.attachTerrain take it as is. */
  readonly terrain = true;

  // (no TypeScript parameter properties: tools/content-check.mjs loads this file with node's type stripping, which only erases types)
  readonly cell: number;
  /** World position of grid vertex (0, 0) and the vertex counts. */
  readonly ox: number;
  readonly oz: number;
  readonly nx: number;
  readonly nz: number;
  /** Heights, row-major (j * nx + i). */
  readonly h: Float32Array;
  readonly pads: ReliefPad[];
  readonly stats: ReliefStats;
  readonly sizeX: number;
  readonly sizeZ: number;
  /** 1 where the bake pinned the vertex (flat cores, lake beds, bridge decks); the slope clamp never moved those. For tools and tests. */
  readonly pinned: Uint8Array;
  /** Water level of each world.water rect (same order): the plane stands at level + WATER_Y. */
  readonly waterLevels: number[];

  constructor(cell: number, ox: number, oz: number, nx: number, nz: number, h: Float32Array, pads: ReliefPad[], stats: ReliefStats, sizeX: number, sizeZ: number, pinned: Uint8Array, waterLevels: number[]) {
    this.cell = cell;
    this.ox = ox;
    this.oz = oz;
    this.nx = nx;
    this.nz = nz;
    this.h = h;
    this.pads = pads;
    this.stats = stats;
    this.sizeX = sizeX;
    this.sizeZ = sizeZ;
    this.pinned = pinned;
    this.waterLevels = waterLevels;
  }

  /** Height of the water plane of water rect i (WorldDecor.buildWater). */
  waterY(i: number): number {
    return (this.waterLevels[i] ?? 0) + WATER_Y;
  }

  /** Height of grid vertex (i, j), clamped to the grid. */
  vertex(i: number, j: number): number {
    const a = i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
    const b = j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
    return this.h[b * this.nx + a];
  }

  /**
   * Ground height: the triangle surface of the grid. Cells with (i + j) even are split along the (0,0)-(1,1) diagonal, odd cells along
   * (1,0)-(0,1); ReliefMesh uses the same rule. Outside the grid the border value continues.
   */
  groundY(x: number, z: number): number {
    const c = this.cell;
    let fx = (x - this.ox) / c, fz = (z - this.oz) / c;
    const mx = this.nx - 1, mz = this.nz - 1;
    if (!(fx > 0)) fx = 0; else if (fx > mx - 1e-9) fx = mx - 1e-9;
    if (!(fz > 0)) fz = 0; else if (fz > mz - 1e-9) fz = mz - 1e-9;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const k = j * this.nx + i;
    const h = this.h;
    const h00 = h[k], h10 = h[k + 1], h01 = h[k + this.nx], h11 = h[k + this.nx + 1];
    if (((i + j) & 1) === 0) {
      return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + u * (h11 - h01) + v * (h01 - h00);
    }
    return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }

  /** Terrain never has a ceiling or a void (WorldHeights). */
  ceilingY(_x: number, _z: number): number { return Infinity; }
  killY(_x: number, _z: number): number { return Number.NEGATIVE_INFINITY; }
  flagsAt(_x: number, _z: number): number { return 0; }

  /** Surface gradient magnitude (m per m) at a point. */
  slopeAt(x: number, z: number): number {
    const e = 0.5;
    const dx = (this.groundY(x + e, z) - this.groundY(x - e, z)) / (2 * e);
    const dz = (this.groundY(x, z + e) - this.groundY(x, z - e)) / (2 * e);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Smooth vertex normal of grid vertex (i, j) (central differences), written to `out`. */
  vertexNormal(i: number, j: number, out: { x: number; y: number; z: number }): void {
    const c2 = this.cell * 2;
    const gx = (this.vertex(i + 1, j) - this.vertex(i - 1, j)) / c2;
    const gz = (this.vertex(i, j + 1) - this.vertex(i, j - 1)) / c2;
    const l = Math.sqrt(gx * gx + 1 + gz * gz);
    out.x = -gx / l; out.y = 1 / l; out.z = -gz / l;
  }

  /** Pad containing (x, z), the first one in bake order, or null. */
  padAt(x: number, z: number): ReliefPad | null {
    for (const p of this.pads) if (padDistance(p, x, z) <= 0) return p;
    return null;
  }
}

/** Signed-ish distance from a point to the pad shape (<= 0 inside). */
export function padDistance(p: { x: number; z: number; hx: number; hz: number; rr: number }, x: number, z: number): number {
  const dx = Math.max(Math.abs(x - p.x) - p.hx, 0), dz = Math.max(Math.abs(z - p.z) - p.hz, 0);
  return Math.sqrt(dx * dx + dz * dz) - p.rr;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// bake
// ---------------------------------------------------------------------------------------------------------------------------------

/** Landmark flat radius per recipe (m): what the recipe builds around its centre, plus a little. */
const LANDMARK_R: Record<string, number> = {
  red_castle_ruin: 19, mushroom_ring: 18, obelisk_shrine: 11, windmill_cluster: 9, watch_tower_ruin: 10, dead_tree_lanterns: 9,
  // fill pass: the silhouettes drawn by WorldDecorFill.placeNamedLandmark
  standing_stones: 8, giant_tree: 7, broken_pier: 7, roadside_chapel: 6,
};

interface PadSpec { kind: string; id: string; x: number; z: number; hx: number; hz: number; rr: number; fall: number; y?: number }

const tc = (c: number): number => (c + 0.5) * T;

/** Scratch holder of the grid while it is baked. */
class Bake {
  readonly h: Float64Array;
  readonly pinned: Uint8Array;
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  readonly ox: number;
  readonly oz: number;
  constructor(nx: number, nz: number, cell: number, ox: number, oz: number) {
    this.nx = nx;
    this.nz = nz;
    this.cell = cell;
    this.ox = ox;
    this.oz = oz;
    this.h = new Float64Array(nx * nz);
    this.pinned = new Uint8Array(nx * nz);
  }
  vx(i: number): number { return this.ox + i * this.cell; }
  vz(j: number): number { return this.oz + j * this.cell; }
  /** Bilinear read of the working grid (only used to pick pad heights and road profiles, not the final surface). */
  sample(x: number, z: number): number {
    let fx = (x - this.ox) / this.cell, fz = (z - this.oz) / this.cell;
    fx = Math.min(Math.max(fx, 0), this.nx - 1.000001);
    fz = Math.min(Math.max(fz, 0), this.nz - 1.000001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const k = j * this.nx + i, h = this.h;
    return h[k] * (1 - u) * (1 - v) + h[k + 1] * u * (1 - v) + h[k + this.nx] * (1 - u) * v + h[k + this.nx + 1] * u * v;
  }
  /** Vertex index range covering [x0, x1] x [z0, z1]. */
  range(x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
    const c = this.cell;
    return [
      Math.max(0, Math.floor((x0 - this.ox) / c)), Math.max(0, Math.floor((z0 - this.oz) / c)),
      Math.min(this.nx - 1, Math.ceil((x1 - this.ox) / c)), Math.min(this.nz - 1, Math.ceil((z1 - this.oz) / c)),
    ];
  }
}

/** Separable box blur (edge clamped), `radius` tiles, `passes` times. */
function blur(src: Float32Array, W: number, H: number, radius: number, passes: number): Float32Array {
  const a = new Float32Array(src);
  const b = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += a[j * W + Math.min(W - 1, Math.max(0, i + k))];
        b[j * W + i] = s / n;
      }
    }
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += b[Math.min(H - 1, Math.max(0, j + k)) * W + i];
        a[j * W + i] = s / n;
      }
    }
  }
  return a;
}

/** Bilinear sample of a tile-resolution field at world metres (tile centres are the sample points; clamped). */
function tileSample(f: Float32Array, W: number, H: number, x: number, z: number): number {
  let fx = x / T - 0.5, fz = z / T - 0.5;
  fx = Math.min(Math.max(fx, 0), W - 1.000001);
  fz = Math.min(Math.max(fz, 0), H - 1.000001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * W + i;
  return f[k] * (1 - u) * (1 - v) + f[k + 1] * u * (1 - v) + f[k + W] * (1 - u) * v + f[k + W + 1] * u * v;
}

/** Chamfer distance (tiles) to the nearest walkable tile. */
function walkDistance(walk: Uint8Array, W: number, H: number): Float32Array {
  const INF = 1e9, D = 1.41421356;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = walk[i] ? 0 : INF;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[k - W] + 1);
        if (i > 0) v = Math.min(v, d[k - W - 1] + D);
        if (i < W - 1) v = Math.min(v, d[k - W + 1] + D);
      }
      d[k] = v;
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      let v = d[k];
      if (i < W - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < H - 1) {
        v = Math.min(v, d[k + W] + 1);
        if (i < W - 1) v = Math.min(v, d[k + W + 1] + D);
        if (i > 0) v = Math.min(v, d[k + W - 1] + D);
      }
      d[k] = v;
    }
  return d;
}

/** Enforces |h_a - h_b| <= grade * dist(a, b) over the 8-neighbourhood; pinned vertices never move. Returns the fraction moved > 5 cm. */
function limitSlope(g: Bake, grade: number, before: Float64Array): number {
  const { nx, nz, h, pinned } = g;
  const dA = grade * g.cell, dD = grade * g.cell * Math.SQRT2;
  const relax = (i: number, j: number, nbrs: number[]): number => {
    const k = j * nx + i;
    if (pinned[k]) return 0;
    let lo = -Infinity, hi = Infinity;
    for (let n = 0; n < nbrs.length; n += 3) {
      const a = i + nbrs[n], b = j + nbrs[n + 1];
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const hn = h[b * nx + a], d = nbrs[n + 2] === 1 ? dA : dD;
      if (hn - d > lo) lo = hn - d;
      if (hn + d < hi) hi = hn + d;
    }
    const cur = h[k];
    let v = cur;
    if (lo > hi) v = (lo + hi) / 2;
    else if (v < lo) v = lo;
    else if (v > hi) v = hi;
    h[k] = v;
    return Math.abs(v - cur);
  };
  const fwd = [-1, 0, 1, -1, -1, 2, 0, -1, 1, 1, -1, 2];
  const bwd = [1, 0, 1, 1, 1, 2, 0, 1, 1, -1, 1, 2];
  const all = [-1, 0, 1, 1, 0, 1, 0, -1, 1, 0, 1, 1, -1, -1, 2, 1, -1, 2, -1, 1, 2, 1, 1, 2];
  // a few full sweeps settle almost everything, then a worklist chases the remaining long chains until nothing moves
  for (let it = 0; it < 3; it++) {
    let change = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) change = Math.max(change, relax(i, j, fwd));
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) change = Math.max(change, relax(i, j, bwd));
    if (change < 1e-4) break;
  }
  const queue: number[] = [];
  const queued = new Uint8Array(nx * nz);
  const violated = (i: number, j: number): boolean => {
    const k = j * nx + i;
    if (pinned[k]) return false;
    const hk = h[k];
    for (let n = 0; n < all.length; n += 3) {
      const a = i + all[n], b = j + all[n + 1];
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      if (Math.abs(h[b * nx + a] - hk) > (all[n + 2] === 1 ? dA : dD) + 1e-6) return true;
    }
    return false;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (violated(i, j)) { queue.push(j * nx + i); queued[j * nx + i] = 1; }
  // rounds over the violated vertices (first in, first out), at most 4,000 rounds
  for (let round = 0; round < 4000 && queue.length; round++) {
    const cur = queue.splice(0, queue.length);
    for (const k of cur) queued[k] = 0;
    for (const k of cur) {
      const i = k % nx, j = (k - i) / nx;
      if (relax(i, j, all) < 1e-6) continue;
      for (let n = 0; n < all.length; n += 3) {
        const a = i + all[n], b = j + all[n + 1];
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const q = b * nx + a;
        if (!queued[q] && !pinned[q] && violated(a, b)) { queued[q] = 1; queue.push(q); }
      }
    }
  }
  let moved = 0;
  for (let k = 0; k < h.length; k++) if (Math.abs(h[k] - before[k]) > 0.05) moved++;
  return moved / h.length;
}

/**
 * Bakes the relief of a zone, or returns null when the zone has no `world.relief` (flat ground). Deterministic; roughly 100-300 ms
 * for the 1600 x 1200 m Karakir at 4 m cells.
 */
export function buildRelief(def: DungeonDef): Relief | null {
  const world = def.world;
  const cfg: WorldRelief | undefined = world?.relief;
  if (!world || !cfg) return null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const cell = cfg.cellM ?? 4;
  if (cell !== 2 && cell !== 4 && cell !== 8) throw new Error(`relief.cellM must be 2, 4 or 8 (got ${cell})`);
  const grade = Math.min(HARD_MAX_GRADE, Math.max(0.05, cfg.maxGrade ?? DEFAULT_MAX_GRADE));
  const W = def.grid.w, Ht = def.grid.h;
  const sizeX = W * T, sizeZ = Ht * T;
  const seed = reliefSeed(cfg.seed ?? def.id);
  const seedB = (seed ^ 0x9e3779b1) | 0, seedC = (seed ^ 0x7f4a7c15) | 0;

  // ---- grid ----
  const ox = -RELIEF_MARGIN_M, oz = -RELIEF_MARGIN_M;
  const nx = Math.ceil((sizeX + 2 * RELIEF_MARGIN_M) / cell) + 1, nz = Math.ceil((sizeZ + 2 * RELIEF_MARGIN_M) / cell) + 1;
  const g = new Bake(nx, nz, cell, ox, oz);

  // ---- profile fields (tile resolution) ----
  const roomIdx = new Int16Array(W * Ht).fill(-1);
  paintRoomTiles(def, roomIdx);
  const base0 = cfg.profile ?? DEFAULT_PROFILE;
  const profOfRoom: ReliefProfile[] = def.rooms.map((room) => {
    const reg = world.regions.find((r) => r.roomId === room.id);
    return (reg && cfg.regions?.[reg.id]) || base0;
  });
  // void tiles take the profile of the nearest room (so a raised plateau does not sit in a moat), by a multi-source flood
  const owner = new Int16Array(W * Ht).fill(-1);
  {
    const q: number[] = [];
    for (let k = 0; k < W * Ht; k++) if (roomIdx[k] >= 0) { owner[k] = roomIdx[k]; q.push(k); }
    for (let head = 0; head < q.length; head++) {
      const k = q[head], i = k % W, j = (k - i) / W;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = i + dx, b = j + dz;
          if (a < 0 || b < 0 || a >= W || b >= Ht || owner[b * W + a] >= 0) continue;
          owner[b * W + a] = owner[k];
          q.push(b * W + a);
        }
    }
  }
  let fAmp: Float32Array = new Float32Array(W * Ht), fScale: Float32Array = new Float32Array(W * Ht);
  let fBase: Float32Array = new Float32Array(W * Ht), fRidge: Float32Array = new Float32Array(W * Ht);
  const walk = new Uint8Array(W * Ht);
  for (let k = 0; k < W * Ht; k++) {
    const p = owner[k] >= 0 ? profOfRoom[owner[k]] : base0;
    fAmp[k] = p.amp; fScale[k] = p.scale; fBase[k] = p.base ?? 0; fRidge[k] = p.ridged ?? 0;
    walk[k] = roomIdx[k] >= 0 ? 1 : 0;
  }
  fAmp = blur(fAmp, W, Ht, 5, 2); fScale = blur(fScale, W, Ht, 5, 2); fBase = blur(fBase, W, Ht, 5, 2); fRidge = blur(fRidge, W, Ht, 5, 2);
  const dist = walkDistance(walk, W, Ht);
  const edge = cfg.edge ?? { rise: 14, width: 80 };

  const sym = cfg.symmetric ?? '';
  const raw = (x: number, z: number, amp: number, scale: number, ridged: number): number => {
    const f = fbm(x / scale, z / scale, seed);
    let s = (f - 0.14) / 0.72;
    s = smooth(s);
    if (ridged > 0) {
      const r = 1 - Math.abs(2 * fbm(x / (scale * 0.8) + 3.7, z / (scale * 0.8) + 1.9, seedB) - 1);
      s = s * (1 - ridged) + r * r * ridged;
    }
    return amp * s;
  };
  const SX = sizeX, SZ = sizeZ;

  // ---- 1-2. rolling noise, map-edge hills ----
  for (let j = 0; j < nz; j++) {
    const z = g.vz(j);
    for (let i = 0; i < nx; i++) {
      const x = g.vx(i);
      const amp = tileSample(fAmp, W, Ht, x, z), scale = Math.max(30, tileSample(fScale, W, Ht, x, z));
      const base = tileSample(fBase, W, Ht, x, z), rid = Math.min(1, Math.max(0, tileSample(fRidge, W, Ht, x, z)));
      let n: number;
      if (sym === '') n = raw(x, z, amp, scale, rid);
      else {
        const xs = sym === 'x' || sym === 'xz', zs = sym === 'z' || sym === 'xz';
        n = raw(x, z, amp, scale, rid);
        let c = 1;
        if (xs) { n += raw(SX - x, z, amp, scale, rid); c++; }
        if (zs) { n += raw(x, SZ - z, amp, scale, rid); c++; }
        if (xs && zs) { n += raw(SX - x, SZ - z, amp, scale, rid); c++; }
        n /= c;
      }
      // distance to the walkable area (m), continued beyond the zone edge by the Euclidean distance to the clamped point
      const cxm = Math.min(Math.max(x, T * 0.5), SX - T * 0.5), czm = Math.min(Math.max(z, T * 0.5), SZ - T * 0.5);
      const ex = x - cxm, ez = z - czm;
      const dm = Math.max(0, tileSample(dist, W, Ht, cxm, czm) * T - T * 0.5) + Math.sqrt(ex * ex + ez * ez);
      const u = edge.width > 0 ? Math.min(1, dm / edge.width) : 1;
      let rise = edge.rise * smooth(u);
      if (rise > 0) {
        let wob = 0.8 + 0.4 * vnoise(x / 110, z / 110, seedC);
        if (sym !== '') {
          const xs = sym === 'x' || sym === 'xz', zs = sym === 'z' || sym === 'xz';
          let c = 1, w = wob;
          if (xs) { w += 0.8 + 0.4 * vnoise((SX - x) / 110, z / 110, seedC); c++; }
          if (zs) { w += 0.8 + 0.4 * vnoise(x / 110, (SZ - z) / 110, seedC); c++; }
          if (xs && zs) { w += 0.8 + 0.4 * vnoise((SX - x) / 110, (SZ - z) / 110, seedC); c++; }
          wob = w / c;
        }
        rise *= wob;
      }
      g.h[j * nx + i] = base + n + rise;
    }
  }

  const pads: ReliefPad[] = [];
  const addPad = (p: PadSpec): void => {
    const core = cell * 1.5;
    const target = limitToPins(g, p, p.y ?? padHeight(g, p), core, grade * 0.8);
    const x0 = p.x - p.hx - p.rr - core - p.fall, x1 = p.x + p.hx + p.rr + core + p.fall;
    const z0 = p.z - p.hz - p.rr - core - p.fall, z1 = p.z + p.hz + p.rr + core + p.fall;
    const [i0, j0, i1, j1] = g.range(x0, z0, x1, z1);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (g.pinned[k]) continue;
        const d = padDistance(p, g.vx(i), g.vz(j));
        let w: number;
        if (d <= core) w = 1;
        else if (d < core + p.fall) w = 1 - smooth((d - core) / p.fall);
        else continue;
        g.h[k] += (target - g.h[k]) * w;
        if (w >= 1) { g.h[k] = target; g.pinned[k] = 1; }
      }
    pads.push({ kind: p.kind, id: p.id, x: p.x, z: p.z, hx: p.hx, hz: p.hz, rr: p.rr, y: target });
  };
  const circle = (kind: string, id: string, x: number, z: number, r: number, fall: number): PadSpec => ({ kind, id, x, z, hx: 0, hz: 0, rr: r, fall });
  const sizeFall = (r: number): number => Math.max(10, Math.min(26, r * 1.4));

  // ridges (additive crests) and plateaus (absolute, pinned flat tops)
  for (const rd of cfg.ridges ?? []) {
    const pts = rd.pts.map((p) => [tc(p[0]), tc(p[1])] as const);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const [i0, j0, i1, j1] = g.range(x0 - rd.width, z0 - rd.width, x1 + rd.width, z1 + rd.width);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = g.vx(i), z = g.vz(j);
        let best = Infinity;
        for (let s = 0; s + 1 < pts.length; s++) best = Math.min(best, segDist(x, z, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]).d);
        if (best >= rd.width) continue;
        const b = 1 - smooth(best / rd.width);
        g.h[j * nx + i] += rd.height * b * (0.88 + 0.24 * vnoise(x / 70, z / 70, seedB));
      }
  }
  (cfg.plateaus ?? []).forEach((pl, n) => addPad({ ...circle('plateau', `plateau${n}`, tc(pl.pos[0]), tc(pl.pos[1]), pl.radius, pl.falloff ?? Math.max(40, pl.height * 4)), y: pl.height }));

  // ---- 3a. water levels, then bridges: the deck corridor is pinned to the water level, a waypoint or landmark on the bridge joins that plane ----
  // A lake lies at the height of the valley floor it sits in: the lower part of the ground around its rect (so it does not spill over a
  // low shore and needs no crater), never below 0. Every lake has its own level; WorldDecor puts the water plane there.
  const levels: number[] = world.water.map((w) => {
    const x0 = w.rect.x * T - 6, z0 = w.rect.z * T - 6, x1 = (w.rect.x + w.rect.w) * T + 6, z1 = (w.rect.z + w.rect.h) * T + 6;
    const ring: number[] = [];
    for (let k = 0; k < 16; k++) {
      const u = k / 16;
      ring.push(g.sample(x0 + (x1 - x0) * u, z0), g.sample(x1, z0 + (z1 - z0) * u), g.sample(x1 - (x1 - x0) * u, z1), g.sample(x0, z1 - (z1 - z0) * u));
    }
    ring.sort((a, b) => a - b);
    return Math.max(0, Math.round(ring[Math.floor(ring.length * 0.15)] * 100) / 100);
  });
  const levelNear = (pts: [number, number][]): number => {
    // the water rect nearest to the middle of a road polyline (within 12 tiles), else sea level
    const mx = pts.reduce((a, q) => a + tc(q[0]), 0) / pts.length, mz = pts.reduce((a, q) => a + tc(q[1]), 0) / pts.length;
    let best = Infinity, lv = 0;
    world.water.forEach((w, i) => {
      const dx = Math.max(w.rect.x * T - mx, 0, mx - (w.rect.x + w.rect.w) * T), dz = Math.max(w.rect.z * T - mz, 0, mz - (w.rect.z + w.rect.h) * T);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best && d < 12 * T) { best = d; lv = levels[i]; }
    });
    return lv;
  };
  for (const r of world.roads) if (r.kind === 'bridge') applyRoad(g, r.pts.map((p) => [tc(p[0]), tc(p[1])] as [number, number]), r.width, true, levelNear(r.pts));

  // ---- 3b. lakes in basins (before the pads: a pad near a shore reads the shore, not a hill the basin would then have to climb) ----
  // A lake over void tiles is deep (nobody can enter it). Walkable tiles inside a water rect are wading ground (Karakir's lakes lie in the
  // steppe room): a shallow bed. A walkable room that lies entirely inside a water rect is an island: it stays dry on a low mound (4a).
  const islandRoom = new Uint8Array(def.rooms.length), islandLevel = new Float64Array(def.rooms.length);
  world.water.forEach((w, wi) => {
    def.rooms.forEach((room, ri) => {
      const a = room.rect, b = w.rect;
      if (a.x >= b.x && a.z >= b.z && a.x + a.w <= b.x + b.w && a.z + a.h <= b.z + b.h) { islandRoom[ri] = 1; islandLevel[ri] = levels[wi]; }
    });
  });
  const walkAt = (x: number, z: number): boolean => {
    const i = Math.floor(x / T), j = Math.floor(z / T);
    return i >= 0 && j >= 0 && i < W && j < Ht && roomIdx[j * W + i] >= 0;
  };
  const inIsland = (x: number, z: number): boolean => {
    const i = Math.floor(x / T), j = Math.floor(z / T);
    return i >= 0 && j >= 0 && i < W && j < Ht && roomIdx[j * W + i] >= 0 && islandRoom[roomIdx[j * W + i]] === 1;
  };
  // distance (m) to the nearest vertex pinned so far (the bridge decks): the bed ramps away from a deck instead of dropping beside it
  const pinDist = pinDistance(g);
  // distance (m) to the nearest island room: the bed climbs to the island instead of dropping beside it
  const islandDist = new Float32Array(nx * nz).fill(1e9);
  def.rooms.forEach((room, ri) => {
    if (islandRoom[ri] !== 1) return;
    const a = room.rect;
    const x0 = a.x * T, z0 = a.z * T, x1 = (a.x + a.w) * T, z1 = (a.z + a.h) * T;
    const [i0, j0, i1, j1] = g.range(x0 - 24, z0 - 24, x1 + 24, z1 + 24);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = Math.max(x0 - g.vx(i), 0, g.vx(i) - x1), dz = Math.max(z0 - g.vz(j), 0, g.vz(j) - z1);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < islandDist[j * nx + i]) islandDist[j * nx + i] = d;
      }
  });
  world.water.forEach((w, wi) => {
    const L = levels[wi];
    const rx0 = w.rect.x * T, rz0 = w.rect.z * T, rx1 = (w.rect.x + w.rect.w) * T, rz1 = (w.rect.z + w.rect.h) * T;
    const band = 20;
    const [i0, j0, i1, j1] = g.range(rx0 - band, rz0 - band, rx1 + band, rz1 + band);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (g.pinned[k]) continue;
        const x = g.vx(i), z = g.vz(j);
        const ddx = Math.max(rx0 - x, 0, x - rx1), ddz = Math.max(rz0 - z, 0, z - rz1);
        let d: number;
        if (ddx > 0 || ddz > 0) d = Math.sqrt(ddx * ddx + ddz * ddz);
        else d = -Math.min(x - rx0, rx1 - x, z - rz0, rz1 - z);
        if (d <= 0) {
          if (inIsland(x, z)) continue;
          const floor = L + (walkAt(x, z) ? -0.9 : -2.4);
          let bed = Math.max(floor, L + 0.2 + d * 0.28);
          if (islandDist[k] < 20) bed = Math.max(bed, L + 0.55 - 0.28 * islandDist[k]);
          if (pinDist[k] < 16 || islandDist[k] < 20) {
            // near a deck or an island: a free ramp (a waypoint on the bridge / the island pad flattens it, the clamp smooths it)
            g.h[k] = Math.max(bed, pinDist[k] < 16 ? L - 0.22 * pinDist[k] : bed);
          } else {
            g.h[k] = bed;
            g.pinned[k] = 1; // the bed is a hard constraint: the banks give way (slope clamp) instead of the lake filling up
          }
        } else if (d < band) {
          const wgt = smooth(d / band);
          g.h[k] = (L + 0.2 + d * 0.15) * (1 - wgt) + g.h[k] * wgt;
        }
      }
  });

  // ---- 3c. pads, biggest content first (later pads read the heights the earlier ones left) ----
  const start = def.start.pos, exit = def.exit.pos;
  addPad(circle('start', 'start', tc(start[0]), tc(start[1]), 8, 14));
  addPad(circle('exit', 'exit', tc(exit[0]), tc(exit[1]), 6, 12));
  for (const v of world.villages) {
    addPad({ kind: 'village', id: v.id, x: tc(v.center[0]), z: tc(v.center[1]), hx: v.bounds[0] + 5, hz: v.bounds[1] + 5, rr: 3, fall: 28 });
  }
  for (const lm of world.landmarks) {
    const r = LANDMARK_R[lm.recipe] ?? 10;
    addPad(circle('landmark', lm.id, tc(lm.pos[0]), tc(lm.pos[1]), r, sizeFall(r)));
  }
  for (const b of def.bosses) addPad(circle('boss', b.bossId, tc(b.pos[0]), tc(b.pos[1]), 20, 24));
  for (const e of world.entrances) addPad(circle('entrance', e.id, tc(e.pos[0]), tc(e.pos[1]), 7, 12));
  for (const m of world.minibosses) addPad(circle('miniboss', m.id, tc(m.lair[0]), tc(m.lair[1]), 10, 14));
  for (const m of world.metin.spots) addPad(circle('metin', m.id, tc(m.pos[0]), tc(m.pos[1]), 7, 12));
  for (const rr of world.rares) rr.spots.forEach((s, n) => addPad(circle('rare', `${rr.id}#${n}`, tc(s[0]), tc(s[1]), 5, 10)));
  for (const w of world.waypoints) addPad(circle('waypoint', w.id, tc(w.pos[0]), tc(w.pos[1]), 5, 10));
  for (const s of world.shrines) addPad(circle('shrine', s.id, tc(s.pos[0]), tc(s.pos[1]), 4, 8));
  for (const c of world.chests) addPad(circle('chest', c.id, tc(c.pos[0]), tc(c.pos[1]), 3, 8));
  for (const c of world.cursed) addPad(circle('cursed', c.id, tc(c.pos[0]), tc(c.pos[1]), 3, 8));
  (cfg.flat ?? []).forEach((f, n) => addPad(circle('flat', `flat${n}`, tc(f.pos[0]), tc(f.pos[1]), f.radius, sizeFall(f.radius))));

  // ---- 4a. island pads (after the content pads: an island with a landmark on it joins the landmark's plane) ----
  def.rooms.forEach((room, ri) => {
    if (islandRoom[ri] !== 1) return;
    const a = room.rect;
    addPad({ kind: 'island', id: room.id, x: tc(a.x + (a.w - 1) / 2), z: tc(a.z + (a.h - 1) / 2), hx: (a.w * T) / 2, hz: (a.h * T) / 2, rr: 0, fall: 12, y: islandLevel[ri] + 0.55 });
  });

  // ---- 4b. roads (bridges were done in 3a) ----
  for (const r of world.roads) if (r.kind !== 'bridge') applyRoad(g, r.pts.map((p) => [tc(p[0]), tc(p[1])] as [number, number]), r.width, false);

  // ---- 5. slope clamp ----
  const before = Float64Array.from(g.h);
  const clampedFraction = limitSlope(g, grade, before);

  // ---- store ----
  const h = new Float32Array(nx * nz);
  let minY = Infinity, maxY = -Infinity;
  for (let k = 0; k < h.length; k++) {
    h[k] = g.h[k];
    if (h[k] < minY) minY = h[k];
    if (h[k] > maxY) maxY = h[k];
  }
  // pad heights as stored (Float32)
  for (const p of pads) p.y = Math.fround(p.y);
  const stats: ReliefStats = { minY, maxY, maxGrade: 0, maxStep: 0, overGrade: 0, clampedFraction, buildMs: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 };
  const relief = new Relief(cell, ox, oz, nx, nz, h, pads, stats, sizeX, sizeZ, g.pinned, levels);
  stats.maxGrade = measureMaxGrade(relief);
  // steepest neighbour step and the pairs above the zone's limit
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const v = h[j * nx + i];
      const steps = [i + 1 < nx ? Math.abs(h[j * nx + i + 1] - v) / cell : 0, j + 1 < nz ? Math.abs(h[(j + 1) * nx + i] - v) / cell : 0];
      if (i + 1 < nx && j + 1 < nz) steps.push(Math.abs(h[(j + 1) * nx + i + 1] - v) / (cell * Math.SQRT2));
      if (i > 0 && j + 1 < nz) steps.push(Math.abs(h[(j + 1) * nx + i - 1] - v) / (cell * Math.SQRT2));
      for (const s of steps) {
        if (s > stats.maxStep) stats.maxStep = s;
        if (s > grade + 1e-4) stats.overGrade++;
      }
    }
  return relief;
}

/** Mean of the working grid under a pad (centre + 8 points on the rim of its shape). */
function padHeight(g: Bake, p: PadSpec): number {
  let s = g.sample(p.x, p.z), n = 1;
  const rx = p.hx + p.rr * 0.7, rz = p.hz + p.rr * 0.7;
  const ring: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (const [a, b] of ring) { s += g.sample(p.x + a * rx, p.z + b * rz); n++; }
  return s / n;
}

/** Chamfer distance (m) from every vertex to the nearest pinned one (1e9 when nothing is pinned). */
function pinDistance(g: Bake): Float32Array {
  const { nx, nz, pinned } = g;
  const INF = 1e9, a = g.cell, b = g.cell * Math.SQRT2;
  const d = new Float32Array(nx * nz);
  for (let k = 0; k < d.length; k++) d[k] = pinned[k] ? 0 : INF;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - nx] + a);
        if (i > 0) v = Math.min(v, d[k - nx - 1] + b);
        if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + b);
      }
      d[k] = v;
    }
  for (let j = nz - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let v = d[k];
      if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
      if (j < nz - 1) {
        v = Math.min(v, d[k + nx] + a);
        if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + b);
        if (i > 0) v = Math.min(v, d[k + nx - 1] + b);
      }
      d[k] = v;
    }
  return d;
}

/**
 * A pad next to an earlier pad cannot take any height: its flat core and the other pad's core are both pinned, so the ground between
 * them must be able to climb the difference within the grade. Clamps the target to what every pinned vertex within 140 m allows.
 */
function limitToPins(g: Bake, p: PadSpec, target: number, core: number, grade: number): number {
  const reach = p.hx + p.hz + p.rr + core + 140;
  const [i0, j0, i1, j1] = g.range(p.x - reach, p.z - reach, p.x + reach, p.z + reach);
  let lo = -Infinity, hi = Infinity;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * g.nx + i;
      if (!g.pinned[k]) continue;
      const dp = padDistance(p, g.vx(i), g.vz(j));
      // the pad overlaps a flat core that is already there: it joins that plane (a waypoint inside a village stands on the village)
      if (dp <= core) return g.h[k];
      const d = Math.max(g.cell, dp - core);
      const slack = grade * d;
      if (g.h[k] - slack > lo) lo = g.h[k] - slack;
      if (g.h[k] + slack < hi) hi = g.h[k] + slack;
    }
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, target));
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.min(1, Math.max(0, t));
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return { d: Math.sqrt(qx * qx + qz * qz), t };
}

/**
 * A road: the ground along the polyline is replaced by its own moving average (+-30 m), limited to a gentle longitudinal grade, and
 * blended in across the width (core = half width + 1.5 cells, falloff 12 m). A bridge is pinned to water level instead.
 */
function applyRoad(g: Bake, pts: [number, number][], width: number, bridge: boolean, level = 0): void {
  if (pts.length < 2) return;
  // profile samples every 2 m along the polyline
  const sx: number[] = [], sz: number[] = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    const n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < n; k++) { sx.push(ax + ((bx - ax) * k) / n); sz.push(az + ((bz - az) * k) / n); }
  }
  sx.push(pts[pts.length - 1][0]); sz.push(pts[pts.length - 1][1]);
  const N = sx.length;
  let prof = new Float64Array(N);
  for (let k = 0; k < N; k++) prof[k] = bridge ? level : g.sample(sx[k], sz[k]);
  if (!bridge) {
    const win = 15; // samples (30 m)
    const sm = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let s = 0, c = 0;
      for (let q = Math.max(0, k - win); q <= Math.min(N - 1, k + win); q++) { s += prof[q]; c++; }
      sm[k] = s / c;
    }
    prof = sm;
    const lim = 0.22 * 2; // longitudinal grade of a road: 0.22, samples are 2 m apart
    for (let it = 0; it < 4; it++) {
      for (let k = 1; k < N; k++) prof[k] = Math.min(prof[k - 1] + lim, Math.max(prof[k - 1] - lim, prof[k]));
      for (let k = N - 2; k >= 0; k--) prof[k] = Math.min(prof[k + 1] + lim, Math.max(prof[k + 1] - lim, prof[k]));
    }
  }
  const core = width / 2 + g.cell * 1.5, fall = bridge ? 14 : 12;
  const R = core + fall;
  const bestD = new Map<number, number>(), bestH = new Map<number, number>();
  let k0 = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    const n = Math.max(1, Math.round(len / 2));
    const [i0, j0, i1, j1] = g.range(Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * g.nx + i;
        const { d, t } = segDist(g.vx(i), g.vz(j), ax, az, bx, bz);
        if (d >= R) continue;
        if (d < (bestD.get(k) ?? Infinity)) {
          bestD.set(k, d);
          const f = k0 + t * n, a = Math.floor(f), b = Math.min(N - 1, a + 1);
          bestH.set(k, prof[a] + (prof[b] - prof[a]) * (f - a));
        }
      }
    k0 += n;
  }
  for (const [k, d] of bestD) {
    if (g.pinned[k]) continue;
    const target = bestH.get(k)!;
    let w: number;
    if (d <= core) w = 1;
    else w = 1 - smooth((d - core) / fall);
    g.h[k] += (target - g.h[k]) * w;
    if (bridge && w >= 1) { g.h[k] = target; g.pinned[k] = 1; }
  }
}

/** Steepest gradient magnitude over every grid triangle (what a character can meet), in m per m. */
function measureMaxGrade(r: Relief): number {
  let m = 0;
  const c = r.cell;
  for (let j = 0; j + 1 < r.nz; j++)
    for (let i = 0; i + 1 < r.nx; i++) {
      const h00 = r.h[j * r.nx + i], h10 = r.h[j * r.nx + i + 1], h01 = r.h[(j + 1) * r.nx + i], h11 = r.h[(j + 1) * r.nx + i + 1];
      const mag = (a: number, b: number): number => Math.sqrt(a * a + b * b);
      let g1: number, g2: number;
      if (((i + j) & 1) === 0) {
        g1 = mag(h10 - h00, h11 - h10); // (00,10,11)
        g2 = mag(h11 - h01, h01 - h00); // (00,11,01)
      } else {
        g1 = mag(h10 - h00, h01 - h00); // (00,10,01)
        g2 = mag(h01 - h11, h10 - h11); // (10,11,01)
      }
      m = Math.max(m, g1, g2);
    }
  return m / c;
}
