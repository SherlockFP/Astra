import * as THREE from 'three';
import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type BorderStyle, type DungeonDef, type TileRect, type WorldRegion } from '../types/dungeons';
import { gp, hw, ip, kc, kf, kg, kn, tw } from '../data/dungeons/kit';
import { hexToRGB } from './ProceduralAssets';
import { getPiece } from './Pieces';
import type { NavGrid } from './NavGrid';
import type { CullLayer, InstanceBatcher } from './Instancing';
import type { SplatChannel, SplatOp } from './Terrain';

/**
 * Open-world scenery (GDD_OPENWORLD §8.2-8.4, §1.5): per-region scatter palettes and density multipliers, border dressing by
 * style (trees, water reeds, marsh, canyon cliffs, ruin walls), farm / marsh / hill specials, the ground splat ops and the
 * region tint map. Every instance is tagged with a CullLayer so ChunkCuller can enforce the distance limits. OWNER: world module.
 */

const T = TILE_SIZE;
const PI = Math.PI;
/** Tile coordinate -> world metres at the tile centre (packs, POIs, villages, road points). */
export const tileCentre = (c: number): number => (c + 0.5) * T;

// ---------------------------------------------------------------------------
// Model urls (kit helpers; all verified against public/assets/models)
// ---------------------------------------------------------------------------

const RPT = (n: string) => ip('retro-psx-tree-pack', `trees/${n}`);
const RPN = (n: string) => ip('retro-psx-nature-pack', `trees/${n}`);
const RPB = (n: string) => ip('retro-psx-tree-pack', `bushes/${n}`);
const TWD = (n: string) => tw(`decoration/nature/${n}`);
export const TREE_DEAD = gp('tree_dead');
export const TREE_DEAD_M = hw('tree_dead_medium');
export const TUFT = gp('grass_tuft');
export const FLOWERS = gp('flowers');
export const PATH_WOOD = kn('path_wood');
export const LILIES = [kn('lily_large'), kn('lily_small')];
export const REEDS = [TWD('waterplant_A'), TWD('waterplant_B'), TWD('waterplant_C')];
export const MUSHROOMS = [kn('mushroom_redGroup'), kn('mushroom_tanGroup'), kn('mushroom_red'), kn('mushroom_tanTall')];
export const CROPS = [kn('crops_wheatStageB'), kn('crops_cornStageC'), kn('crop_pumpkin'), kn('crops_dirtDoubleRow')];
export const FOREST = [RPT('tree01'), RPT('tree03'), RPT('tree05'), RPT('tree12'), RPT('tree13'), RPT('tree15'), gp('tree_pine_a'), gp('tree_pine_b')];
export const CLIFF = kn('cliff_block_rock');
export const WALL_HALF = kc('wall-half');
export const MASSIFS = [TWD('hills_A_trees'), TWD('hills_B_trees')];
export const ROCK_SINGLE = ['A', 'B', 'C', 'D', 'E'].map((c) => TWD(`rock_single_${c}`));

/** Every static model the scenery module can use (preloaded with the dungeon). */
export function worldSceneryUrls(): string[] {
  const palettes = Object.values(PALETTES).flatMap((p) => [...p.trees, ...p.deadTrees, ...p.bushes, ...p.rocks]);
  const sprinkles = Object.values(SPRINKLES).flatMap((list) => list.flatMap((s) => s.urls));
  const out = new Set<string>([
    ...palettes, ...sprinkles,
    ...FOREST, ...LILIES, ...REEDS, ...MUSHROOMS, ...CROPS, ...MASSIFS, ...ROCK_SINGLE,
    TREE_DEAD, TREE_DEAD_M, TUFT, FLOWERS, PATH_WOOD, CLIFF, WALL_HALF,
    kn('hanging_moss'), kn('log'), kn('log_large'), kn('cactus_tall'), kn('cactus_short'), kn('rock_tallA'), kn('rock_tallB'),
    kn('rock_tallC'), kn('rock_tallD'), kn('rock_tallE'), kn('rock_tallF'), kn('statue_column'),
    gp('bush_a'), gp('bush_b'), gp('rock_small'), gp('rock_medium'), gp('tent'), gp('bone_pile'), gp('banner_red'), gp('statue_hooded'),
    gp('barrel'), gp('sacks'), gp('crate_a'), gp('cauldron'),
    kg('gravestone-round'), kg('gravestone-cross'), kg('gravestone-broken'), kg('gravestone-wide'), kg('pillar-small'),
    kg('pillar-square'), kg('pillar-obelisk'),
    hw('shrine'), hw('arch'), hw('post_lantern'), hw('tree_dead_large'),
    kf('windmill'), tw('buildings/red/building_castle_red'),
    ip('nocturnal-watch', 'tower'), ip('psx-medieval', 'building/stone_floor_4x4'), ip('psx-walls-fences', 'drystone-wall/drystone_wall_capped'),
    kc('wall'), kc('wall-corner'), kc('wall-half'), kc('wall-narrow'),
  ]);
  return [...out];
}

// ---------------------------------------------------------------------------
// Palettes (GDD_OPENWORLD §8.2 table: trees, bushes, rocks, tufts, flowers multipliers)
// ---------------------------------------------------------------------------

export interface Palette {
  trees: string[];
  deadTrees: string[];
  /** Share of dead trees among the trees (default 0.02). Regions without living trees use the dead list only. */
  deadShare?: number;
  bushes: string[];
  rocks: string[];
  mult: { tree: number; bush: number; rock: number; tuft: number; flower: number };
  /** Mushroom groups per 2,600 m2 (0 = none). */
  mushrooms?: number;
}

export const PALETTES: Record<string, Palette> = {
  r1: {
    trees: [RPT('tree01'), RPT('tree03'), RPT('tree05'), RPT('tree12'), gp('tree_oak_a'), gp('tree_oak_b')],
    deadTrees: [TREE_DEAD],
    bushes: [RPB('bush02'), RPB('bush04'), gp('bush_a'), gp('bush_b')],
    rocks: [gp('rock_small'), gp('rock_medium')],
    mult: { tree: 1.0, bush: 1.0, rock: 0.8, tuft: 1.0, flower: 1.0 },
    mushrooms: 1.5,
  },
  r2: {
    trees: [RPT('tree13'), RPT('tree15'), RPT('tree18'), RPT('tree20'), RPT('tree35'), gp('tree_autumn')],
    deadTrees: [TREE_DEAD],
    bushes: [RPB('bush01'), RPB('bush03'), gp('bush_a')],
    rocks: [gp('rock_small'), gp('rock_medium')],
    mult: { tree: 0.35, bush: 0.8, rock: 0.5, tuft: 1.2, flower: 1.5 },
  },
  r3: {
    trees: [RPN('tree01_fall'), RPN('tree04_fall'), RPN('tree05_fall'), RPT('tree29'), RPT('tree33')],
    deadTrees: [TREE_DEAD],
    deadShare: 0.03,
    bushes: [gp('bush_b')],
    rocks: ROCK_SINGLE,
    mult: { tree: 0.5, bush: 0.6, rock: 2.0, tuft: 0.8, flower: 0.3 },
  },
  r4: {
    trees: [RPN('tree01_winter'), RPN('tree03_winter')],
    deadTrees: [TREE_DEAD, hw('tree_dead_large'), TREE_DEAD_M],
    deadShare: 0.3,
    bushes: [gp('bush_b')],
    rocks: [gp('rock_small')],
    mult: { tree: 1.1, bush: 0.4, rock: 0.5, tuft: 0.5, flower: 0 },
    mushrooms: 2,
  },
  r5: {
    trees: [],
    deadTrees: [TREE_DEAD],
    bushes: [kn('cactus_tall'), kn('cactus_short')],
    rocks: [kn('rock_tallA'), kn('rock_tallB'), kn('rock_tallC'), kn('rock_tallD'), kn('rock_tallE'), kn('rock_tallF')],
    mult: { tree: 0.08, bush: 0.1, rock: 3.0, tuft: 0.2, flower: 0 },
  },
  r6: {
    trees: [],
    deadTrees: [hw('tree_dead_large'), TREE_DEAD_M, TREE_DEAD],
    bushes: [gp('bush_a')],
    rocks: [WALL_HALF, kc('wall-corner'), kg('gravestone-round'), kg('pillar-small'), kg('gravestone-cross')],
    mult: { tree: 0.25, bush: 0.2, rock: 1.0, tuft: 0.3, flower: 0 },
  },
};

/** Props scattered at random spots of a region (count per region room). */
export interface Sprinkle { urls: string[]; n: number; s: [number, number]; layer: CullLayer; block?: number }
export const SPRINKLES: Record<string, Sprinkle[]> = {
  r1: [{ urls: [kn('log'), kn('log_large')], n: 10, s: [0.9, 1.2], layer: 'prop' }],
  r3: [{ urls: [gp('tent')], n: 4, s: [0.9, 1.1], layer: 'prop' }],
  r4: [{ urls: [gp('bone_pile')], n: 8, s: [1, 1.3], layer: 'prop' }],
  r5: [{ urls: [gp('banner_red')], n: 6, s: [1.2, 1.5], layer: 'prop' }],
  r6: [
    { urls: [kg('gravestone-round'), kg('gravestone-cross'), kg('gravestone-broken'), kg('gravestone-wide')], n: 22, s: [0.9, 1.2], layer: 'prop' },
    { urls: [kg('pillar-small'), kg('pillar-square')], n: 6, s: [1, 1.2], layer: 'prop', block: 0.8 },
    { urls: [hw('shrine'), hw('arch')], n: 4, s: [1, 1.2], layer: 'prop', block: 1 },
    { urls: [gp('statue_hooded'), kn('statue_column')], n: 4, s: [1, 1.2], layer: 'prop', block: 0.8 },
  ],
};

/** Ground patches per region (splat channel, one per `every` m2, radius range). GDD §8.3: R4 ~40% dark, R5 red dirt, R6 dark. */
const PATCHES: Record<string, { ch: SplatChannel; every: number; r: [number, number] }> = {
  r1: { ch: 'dirt', every: 2600, r: [2.5, 5] },
  r2: { ch: 'dirt', every: 1600, r: [2.5, 5] },
  r3: { ch: 'dirt', every: 2000, r: [3, 6] },
  r4: { ch: 'dark', every: 350, r: [3, 7] },
  r5: { ch: 'dirt', every: 500, r: [3, 7] },
  r6: { ch: 'dark', every: 500, r: [3, 6] },
};

/** Region tint (multiplied into the ground colour, GDD §8.3). Used when the region theme has no `groundTint`. */
export const REGION_TINT: Record<string, number> = { r1: 0xdde4d0, r2: 0xfff0c0, r3: 0xe8d8b8, r4: 0xa8c0b0, r5: 0xf0c8a0, r6: 0xb8a8d0 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Region per room index (null for rooms that belong to no region: bridge, approach, island). */
export function regionsByRoom(def: DungeonDef): (WorldRegion | null)[] {
  const regs = def.world?.regions ?? [];
  return def.rooms.map((room) => regs.find((r) => r.roomId === room.id) ?? null);
}

export function regionTintColor(r: WorldRegion | null, fallback: number): number {
  if (!r) return fallback;
  return r.theme.groundTint ?? REGION_TINT[r.id] ?? fallback;
}

/** Rotation (Y) that lays a model's long horizontal axis along (ux, uz). Models without a known size are taken as long along x. */
export function yawAlong(url: string | null, ux: number, uz: number): number {
  const sz = url ? getPiece(url)?.size : undefined;
  const longX = !sz || sz.x >= sz.z;
  return longX ? Math.atan2(-uz, ux) : Math.atan2(ux, uz);
}

/** Uniform scale that makes the model's longest horizontal side `len` metres (1 when the piece is not loaded). */
export function fitScale(url: string, len: number): number {
  const sz = getPiece(url)?.size;
  const L = sz ? Math.max(sz.x, sz.z) : 0;
  return L > 0.01 ? len / L : 1;
}

/** Uniform scale that makes the model `h` metres tall (1 when the piece is not loaded). */
export function fitHeight(url: string, h: number): number {
  const sz = getPiece(url)?.size;
  return sz && sz.y > 0.01 ? h / sz.y : 1;
}

/** Spatial hash of placed circles (trees, rocks, specials): keeps clusters apart without an O(n) scan. */
export class Occupancy {
  protected cells = new Map<number, { x: number; z: number; r: number }[]>();
  constructor(private cs: number) {}
  protected key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }
  add(x: number, z: number, r: number): void {
    const k = this.key(Math.floor(x / this.cs), Math.floor(z / this.cs));
    let a = this.cells.get(k);
    if (!a) this.cells.set(k, (a = []));
    a.push({ x, z, r });
  }
  hits(x: number, z: number, pad: number): boolean {
    const cx = Math.floor(x / this.cs), cz = Math.floor(z / this.cs);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const a = this.cells.get(this.key(cx + dx, cz + dz));
        if (!a) continue;
        for (const c of a) if (Math.hypot(c.x - x, c.z - z) < c.r + pad) return true;
      }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ground: splat ops and region tint
// ---------------------------------------------------------------------------

/**
 * Splat ops of the open-world ground (world metres converted to the splat's centred frame by `cx`, `cz`): roads (dirt / cobble /
 * boardwalk dark), village plazas (cobble rect), camp discs (dirt), boss arenas (dark + dirt), metin scorch (dark), lake and
 * river shores (dark rect, 2 m ring), landmarks, and region patches (R4 marsh, R5 red dirt, R6 cobble-dark).
 */
export function worldSplatOps(def: DungeonDef, cx: number, cz: number): SplatOp[] {
  const w = def.world;
  const ops: SplatOp[] = [];
  if (!w) return ops;
  const L = (x: number, z: number): [number, number] => [x - cx, z - cz];

  for (const r of w.roads) {
    const ch: SplatChannel = r.kind === 'dirt' ? 'dirt' : r.kind === 'boardwalk' ? 'dark' : 'cobble';
    const width = r.kind === 'boardwalk' ? r.width + 1.2 : r.width;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [x0, z0] = L(tileCentre(r.pts[i][0]), tileCentre(r.pts[i][1]));
      const [x1, z1] = L(tileCentre(r.pts[i + 1][0]), tileCentre(r.pts[i + 1][1]));
      ops.push({ t: 'line', ch, x0, z0, x1, z1, w: width, soft: 1.3, amount: 0.95 });
    }
  }
  for (const v of w.villages) {
    const [x, z] = L(tileCentre(v.center[0]), tileCentre(v.center[1]));
    ops.push({ t: 'rect', ch: 'cobble', x, z, hw: v.bounds[0], hd: v.bounds[1], soft: 1.5, amount: 0.85 });
  }
  for (const p of def.packs) {
    const [x, z] = L(tileCentre(p.center[0]), tileCentre(p.center[1]));
    const r = Math.min(9, Math.max(3.2, (p.radius ?? 10) * 0.42));
    ops.push({ t: 'disc', ch: 'dirt', x, z, r, soft: 1.6, amount: p.respawnSec ? 0.85 : 0.6 });
  }
  for (const b of def.bosses) {
    const [x, z] = L(tileCentre(b.pos[0]), tileCentre(b.pos[1]));
    ops.push({ t: 'disc', ch: 'dark', x, z, r: 15, soft: 3 });
    ops.push({ t: 'disc', ch: 'dirt', x, z, r: 3.2, soft: 1.5, amount: 0.7 });
  }
  for (const m of w.metin.spots) {
    const [x, z] = L(tileCentre(m.pos[0]), tileCentre(m.pos[1]));
    ops.push({ t: 'disc', ch: 'dark', x, z, r: 5, soft: 1.5, amount: 0.9 });
  }
  for (const lm of w.landmarks) {
    const [x, z] = L(tileCentre(lm.pos[0]), tileCentre(lm.pos[1]));
    const cobble = lm.regionId === 'r6';
    ops.push({ t: 'disc', ch: cobble ? 'cobble' : 'dirt', x, z, r: cobble ? 14 : 4, soft: 2, amount: cobble ? 0.8 : 0.6 });
  }
  for (const wt of w.water) {
    const R = wt.rect;
    const x = (R.x + R.w / 2) * T - cx, z = (R.z + R.h / 2) * T - cz;
    ops.push({ t: 'rect', ch: 'dark', x, z, hw: (R.w * T) / 2 + 2, hd: (R.h * T) / 2 + 2, soft: 1.5, amount: 1 });
  }
  // region patches, deterministic per map
  const rng = new RNG(hashString(def.id + ':world-patches'));
  const regs = regionsByRoom(def);
  def.rooms.forEach((room, ri) => {
    const reg = regs[ri];
    const spec = reg ? PATCHES[reg.id] : undefined;
    if (!spec) return;
    const area = room.rect.w * room.rect.h * T * T;
    const n = Math.round(area / spec.every);
    for (let k = 0; k < n; k++) {
      const x = (room.rect.x + rng.next() * room.rect.w) * T - cx;
      const z = (room.rect.z + rng.next() * room.rect.h) * T - cz;
      ops.push({ t: 'disc', ch: spec.ch, x, z, r: rng.range(spec.r[0], spec.r[1]), soft: 2, amount: 0.45 });
    }
  });
  return ops;
}

/** Region tint texels (one per tile, row-major, row 0 = north edge) for createTerrain. */
export function worldTintRGB(def: DungeonDef): { w: number; h: number; rgb: Uint8Array } {
  const W = def.grid.w, H = def.grid.h;
  const regs = regionsByRoom(def);
  const base = def.theme.tint ?? 0xffffff;
  const roomAt = new Int16Array(W * H).fill(-1);
  def.rooms.forEach((room, ri) => {
    for (let j = Math.max(0, room.rect.z); j < Math.min(H, room.rect.z + room.rect.h); j++)
      for (let i = Math.max(0, room.rect.x); i < Math.min(W, room.rect.x + room.rect.w); i++) roomAt[j * W + i] = ri;
  });
  const rgb = new Uint8Array(W * H * 3);
  for (let k = 0; k < W * H; k++) {
    const ri = roomAt[k];
    const c = hexToRGB(regionTintColor(ri >= 0 ? regs[ri] : null, base));
    rgb[k * 3] = c[0];
    rgb[k * 3 + 1] = c[1];
    rgb[k * 3 + 2] = c[2];
  }
  return { w: W, h: H, rgb };
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

export interface WorldScatterHost {
  def: DungeonDef;
  W: number;
  H: number;
  batcher: InstanceBatcher;
  nav: NavGrid;
  avoid: { x: number; z: number; r: number }[];
  isAvoided(x: number, z: number, pad: number): boolean;
  tileRoom(i: number, j: number): number;
  hasH(i: number, j: number): boolean;
  hasV(i: number, j: number): boolean;
  /** Splat weights at world metres. */
  weights(x: number, z: number): { dirt: number; cobble: number; dark: number };
}

/**
 * Open-world scatter: borders (by style), void forest, forest beyond the map, region palettes, specials. Trees and rocks
 * block the nav and keep apart (Occupancy); everything keeps clear of roads, camps (trees), POIs (avoid list) and water.
 */
export class WorldScatter {
  protected rng: RNG;
  protected occ = new Occupancy(6);
  protected roads: { ax: number; az: number; bx: number; bz: number; hw: number }[] = [];
  protected camps: { x: number; z: number; r: number }[] = [];
  protected regs: (WorldRegion | null)[];
  protected waterTiles: Uint8Array;
  protected styleOverride = new Map<string, BorderStyle>();

  constructor(protected h: WorldScatterHost) {
    const def = h.def;
    this.rng = new RNG(hashString(def.id + ':world-scatter'));
    this.regs = regionsByRoom(def);
    this.waterTiles = new Uint8Array(h.W * h.H);
    const w = def.world;
    for (const wt of w?.water ?? []) {
      for (let j = wt.rect.z; j < wt.rect.z + wt.rect.h; j++)
        for (let i = wt.rect.x; i < wt.rect.x + wt.rect.w; i++) if (i >= 0 && j >= 0 && i < h.W && j < h.H) this.waterTiles[j * h.W + i] = 1;
    }
    for (const r of w?.roads ?? [])
      for (let k = 0; k + 1 < r.pts.length; k++)
        this.roads.push({
          ax: tileCentre(r.pts[k][0]), az: tileCentre(r.pts[k][1]),
          bx: tileCentre(r.pts[k + 1][0]), bz: tileCentre(r.pts[k + 1][1]),
          hw: r.width / 2,
        });
    for (const p of def.packs) this.camps.push({ x: tileCentre(p.center[0]), z: tileCentre(p.center[1]), r: p.radius ?? 9 });
    for (const b of w?.borders ?? []) {
      if (b.a[0] === b.b[0]) for (let j = Math.min(b.a[1], b.b[1]); j < Math.max(b.a[1], b.b[1]); j++) this.styleOverride.set(`v:${b.a[0]}:${j}`, b.style);
      else if (b.a[1] === b.b[1]) for (let i = Math.min(b.a[0], b.b[0]); i < Math.max(b.a[0], b.b[0]); i++) this.styleOverride.set(`h:${i}:${b.a[1]}`, b.style);
    }
  }

  /** Runs every scatter pass. Call after roads, villages and landmarks are placed (they feed the avoid list / nav). */
  run(): void {
    this.borders();
    this.voidForest(900);
    this.beyondForest(760);
    this.scatterRegions();
    this.specials();
  }

  // ---- queries ----

  protected isWaterTile(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.h.W && j < this.h.H && this.waterTiles[j * this.h.W + i] === 1;
  }
  protected walkable(x: number, z: number): boolean {
    return this.h.tileRoom(Math.floor(x / T), Math.floor(z / T)) >= 0 && this.h.nav.isWalkable(x, z);
  }
  protected nearWalk(i: number, j: number, r: number): boolean {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (this.h.tileRoom(i + di, j + dj) >= 0) return true;
    return false;
  }
  /** Distance from the nearest road EDGE (negative = on the road). */
  protected roadGap(x: number, z: number): number {
    let best = 1e9;
    for (const s of this.roads) {
      const vx = s.bx - s.ax, vz = s.bz - s.az;
      const L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2));
      const d = Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t)) - s.hw;
      if (d < best) best = d;
    }
    return best;
  }
  protected inCamp(x: number, z: number, f: number): boolean {
    for (const c of this.camps) if (Math.hypot(c.x - x, c.z - z) < c.r * f) return true;
    return false;
  }
  protected free(x: number, z: number, avoidPad: number, roadPad: number): boolean {
    return this.walkable(x, z) && this.roadGap(x, z) > roadPad && !this.h.isAvoided(x, z, avoidPad);
  }
  protected roomsOf(id: string): TileRect[] {
    return this.h.def.rooms.filter((_, ri) => this.regs[ri]?.id === id).map((r) => r.rect);
  }

  // ---- primitives ----

  protected col(k: number): THREE.Color {
    return new THREE.Color(0xffffff).multiplyScalar(1 - k * 0.5 + this.rng.next() * k);
  }

  /** Samples uniformly inside a tile rect until `n` placements succeed (fn returns true on success). */
  protected many(rect: TileRect, n: number, maxTries: number, fn: (x: number, z: number) => boolean): number {
    let placed = 0;
    for (let a = 0; a < maxTries && placed < n; a++) {
      const x = (rect.x + this.rng.next() * rect.w) * T, z = (rect.z + this.rng.next() * rect.h) * T;
      if (fn(x, z)) placed++;
    }
    return placed;
  }

  /** Tree: dim colour jitter, optional trunk block on the nav. Layer 'tree' (or 'border'). */
  protected tree(url: string, x: number, z: number, s: number, block: boolean, layer: CullLayer): void {
    const dim = 0.86 - this.rng.next() * 0.12;
    this.h.batcher.add(url, x, 0, z, this.rng.range(0, 2 * PI), s, new THREE.Color(0xffffff).multiplyScalar(dim + this.rng.next() * 0.2), { cast: true, receive: true, layer });
    if (block) this.h.nav.setCircle(x, z, 0.7 * s, false);
    this.occ.add(x, z, 1.4 * s);
  }

  // ---- borders ----

  protected styleOf(wt: [number, number], vt: [number, number], key: string): BorderStyle {
    if (this.isWaterTile(vt[0], vt[1])) return 'water';
    const o = this.styleOverride.get(key);
    if (o) return o;
    const reg = this.regs[this.h.tileRoom(wt[0], wt[1])];
    if (reg?.id === 'r4') return 'marsh';
    if (reg?.id === 'r5') return 'canyon';
    if (reg?.id === 'r6') return 'ruin';
    return 'trees';
  }

  /** Every wall edge (walkable meets void) gets the dressing of its style. */
  borders(): void {
    const h = this.h;
    for (let j = 0; j <= h.H; j++)
      for (let i = 0; i < h.W; i++) {
        if (!h.hasH(i, j)) continue;
        const northWalk = h.tileRoom(i, j - 1) >= 0;
        const wt: [number, number] = northWalk ? [i, j - 1] : [i, j];
        const vt: [number, number] = northWalk ? [i, j] : [i, j - 1];
        this.dress(this.styleOf(wt, vt, `h:${i}:${j}`), i * T, j * T, 1, 0, 0, northWalk ? 1 : -1);
      }
    for (let j = 0; j < h.H; j++)
      for (let i = 0; i <= h.W; i++) {
        if (!h.hasV(i, j)) continue;
        const westWalk = h.tileRoom(i - 1, j) >= 0;
        const wt: [number, number] = westWalk ? [i - 1, j] : [i, j];
        const vt: [number, number] = westWalk ? [i, j] : [i - 1, j];
        this.dress(this.styleOf(wt, vt, `v:${i}:${j}`), i * T, j * T, 0, 1, westWalk ? 1 : -1, 0);
      }
  }

  protected dress(style: BorderStyle, x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void {
    switch (style) {
      case 'water': return this.dressWater(x0, z0, ux, uz, ox, oz);
      case 'marsh': return this.dressMarsh(x0, z0, ux, uz, ox, oz);
      case 'canyon': return this.dressCliff(x0, z0, ux, uz, ox, oz, 3);
      case 'cliff': return this.dressCliff(x0, z0, ux, uz, ox, oz, 2);
      case 'ruin': return this.dressRuin(x0, z0, ux, uz, ox, oz);
      case 'palisade': return this.dressRuin(x0, z0, ux, uz, ox, oz);
      default: return this.dressTrees(x0, z0, ux, uz, ox, oz);
    }
  }

  protected dressTrees(x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void {
    const rng = this.rng;
    for (let t = 0.5; t < T; t += rng.range(1.2, 1.9)) {
      const off = rng.range(0.2, 1.8);
      this.tree(rng.pick(FOREST), x0 + ux * t + ox * off + rng.range(-0.3, 0.3), z0 + uz * t + oz * off + rng.range(-0.3, 0.3), rng.range(1.5, 2.3), false, 'border');
    }
    for (let t = 1; t < T; t += rng.range(2.4, 3.6)) {
      const off = rng.range(3.4, 6.5);
      this.tree(rng.chance(0.15) ? TREE_DEAD : rng.pick(FOREST), x0 + ux * t + ox * off + rng.range(-0.8, 0.8), z0 + uz * t + oz * off + rng.range(-0.8, 0.8), rng.range(1.9, 2.8), false, 'border');
    }
  }

  protected dressWater(x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void {
    const rng = this.rng;
    for (let t = 1; t < T; t += rng.range(1.5, 2.5)) {
      const off = rng.range(0.8, 2.2);
      this.h.batcher.add(rng.pick(REEDS), x0 + ux * t + ox * off, 0, z0 + uz * t + oz * off, rng.range(0, 2 * PI), rng.range(0.9, 1.3), this.col(0.2), { cast: false, receive: true, layer: 'border' });
    }
    for (let t = 2; t < T; t += rng.range(3, 5)) {
      const off = rng.range(2.5, 5);
      this.h.batcher.add(rng.pick(LILIES), x0 + ux * t + ox * off, 0, z0 + uz * t + oz * off, rng.range(0, 2 * PI), rng.range(0.8, 1.3), this.col(0.15), { cast: false, receive: false, layer: 'border' });
    }
  }

  protected dressMarsh(x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void {
    const rng = this.rng;
    for (let t = 1; t < T; t += rng.range(2.5, 4)) {
      const off = rng.range(1.5, 4.5);
      const x = x0 + ux * t + ox * off, z = z0 + uz * t + oz * off;
      this.tree(rng.chance(0.6) ? TREE_DEAD : TREE_DEAD_M, x, z, rng.range(1.6, 2.4), false, 'border');
      if (rng.chance(0.5)) this.h.batcher.add(kn('hanging_moss'), x, 0, z, rng.range(0, 2 * PI), rng.range(1.1, 1.4), this.col(0.1), { cast: false, receive: false, layer: 'border' });
    }
  }

  protected dressCliff(x0: number, z0: number, ux: number, uz: number, ox: number, oz: number, courses: number): void {
    const sc = fitScale(CLIFF, T);
    const yaw = yawAlong(CLIFF, ux, uz);
    const course = (getPiece(CLIFF)?.size.y ?? 2) * sc;
    for (let c = 0; c < courses; c++) {
      this.h.batcher.add(CLIFF, x0 + ux * (T / 2) + ox * 2.2, c * course, z0 + uz * (T / 2) + oz * 2.2, yaw, sc, this.col(0.1), { cast: true, receive: true, layer: 'border' });
    }
  }

  protected dressRuin(x0: number, z0: number, ux: number, uz: number, ox: number, oz: number): void {
    const rng = this.rng;
    const sc = fitScale(WALL_HALF, 3);
    for (let t = 1; t < T; t += rng.range(2.6, 3.4)) {
      const off = rng.range(1.2, 2.2);
      const x = x0 + ux * t + ox * off, z = z0 + uz * t + oz * off;
      this.h.batcher.add(WALL_HALF, x, 0, z, yawAlong(WALL_HALF, ux, uz), sc, this.col(0.12), { cast: true, receive: true, layer: 'border' });
      if (rng.chance(0.25)) this.h.batcher.add(kg('gravestone-broken'), x + ox * 1.2, 0, z + oz * 1.2, rng.range(0, 2 * PI), rng.range(0.9, 1.1), this.col(0.1), { cast: true, layer: 'border' });
    }
  }

  // ---- forests ----

  /** Trees in the void interior (mountains and forest between regions); water and the walkable band are skipped. */
  voidForest(target: number): void {
    const h = this.h;
    this.many({ x: 0, z: 0, w: h.W, h: h.H }, target, target * 12, (x, z) => {
      const i = Math.floor(x / T), j = Math.floor(z / T);
      if (h.tileRoom(i, j) >= 0 || this.isWaterTile(i, j) || this.nearWalk(i, j, 2)) return false;
      this.tree(this.rng.pick(FOREST), x, z, this.rng.range(1.7, 3.0), false, 'tree');
      return true;
    });
  }

  /** Backdrop forest beyond the map edges (never inside the map rectangle). */
  beyondForest(target: number): void {
    const W = this.h.W * T, H = this.h.H * T;
    const far = [gp('tree_pine_a'), gp('tree_pine_b'), RPT('tree01')];
    for (let a = 0, n = 0; a < target * 6 && n < target; a++) {
      const x = this.rng.range(-90, W + 90), z = this.rng.range(-90, H + 90);
      if (x >= 0 && x <= W && z >= 0 && z <= H) continue;
      this.tree(this.rng.chance(0.62) ? this.rng.pick(far) : this.rng.pick(FOREST), x, z, this.rng.range(1.7, 3.0), false, 'tree');
      n++;
    }
  }

  // ---- regions ----

  protected scatterRegions(): void {
    const h = this.h;
    h.def.rooms.forEach((room, ri) => {
      const reg = this.regs[ri];
      const pal = reg ? PALETTES[reg.id] : undefined;
      if (!reg || !pal) return;
      const rect = room.rect;
      const area = rect.w * rect.h * T * T;
      const cnt = (dens: number, mult: number): number => Math.round(area * dens * mult);
      const rng = this.rng;

      const nt = cnt(1 / 520, pal.mult.tree);
      this.many(rect, nt, nt * 10 + 40, (x, z) => {
        if (this.inCamp(x, z, 0.75) || this.occ.hits(x, z, 1.4) || !this.free(x, z, 1.6, 2.6)) return false;
        const dead = !pal.trees.length || rng.chance(pal.deadShare ?? 0.02);
        this.tree(dead ? rng.pick(pal.deadTrees) : rng.pick(pal.trees), x, z, rng.range(0.95, 1.55), true, 'tree');
        return true;
      });

      const nb = cnt(1 / 700, pal.mult.bush);
      this.many(rect, nb, nb * 6 + 20, (x, z) => {
        if (!this.free(x, z, 0.8, 1.2)) return false;
        h.batcher.add(rng.pick(pal.bushes), x, 0, z, rng.range(0, 2 * PI), rng.range(0.8, 1.5), this.col(0.22), { cast: false, layer: 'bush' });
        return true;
      });

      const nm = Math.round((area / 2600) * (pal.mushrooms ?? 0));
      this.many(rect, nm, nm * 6 + 10, (x, z) => {
        if (!this.free(x, z, 1, 1.5)) return false;
        h.batcher.add(rng.pick(MUSHROOMS), x, 0, z, rng.range(0, 2 * PI), rng.range(2.4, 3.6), this.col(0.2), { cast: false, layer: 'bush' });
        return true;
      });

      const nr = cnt(1 / 1400, pal.mult.rock);
      this.many(rect, nr, nr * 8 + 20, (x, z) => {
        if (this.occ.hits(x, z, 1.4) || !this.free(x, z, 1.4, 2.0)) return false;
        const url = rng.pick(pal.rocks);
        const s = rng.range(0.9, 1.6);
        h.batcher.add(url, x, -0.05, z, rng.range(0, 2 * PI), s, this.col(0.2), { cast: true, layer: 'rock' });
        h.nav.setCircle(x, z, 0.75 * s, false);
        this.occ.add(x, z, 1.4 * s);
        return true;
      });

      const ntf = cnt(1 / 21, pal.mult.tuft);
      this.many(rect, ntf, ntf * 3 + 10, (x, z) => {
        if (!this.free(x, z, 0, 0.6)) return false;
        h.batcher.add(TUFT, x, 0, z, rng.range(0, 2 * PI), rng.range(0.8, 1.6), this.col(0.28), { cast: false, receive: false, layer: 'tuft' });
        return true;
      });

      const nf = cnt(1 / 160, pal.mult.flower);
      this.many(rect, nf, nf * 3 + 10, (x, z) => {
        if (!this.free(x, z, 0.3, 0.6)) return false;
        h.batcher.add(FLOWERS, x, 0, z, rng.range(0, 2 * PI), rng.range(0.8, 1.4), this.col(0.3), { cast: false, receive: false, layer: 'flower' });
        return true;
      });
    });
  }

  // ---- specials ----

  specials(): void {
    const h = this.h;
    h.def.rooms.forEach((room, ri) => {
      const reg = this.regs[ri];
      if (!reg) return;
      for (const sp of SPRINKLES[reg.id] ?? []) {
        this.many(room.rect, sp.n, sp.n * 20, (x, z) => {
          if (this.occ.hits(x, z, 1.2) || !this.free(x, z, 1.5, 3)) return false;
          h.batcher.add(this.rng.pick(sp.urls), x, 0, z, this.rng.range(0, 2 * PI), this.rng.range(sp.s[0], sp.s[1]), this.col(0.1), { cast: true, layer: sp.layer });
          if (sp.block) h.nav.setCircle(x, z, sp.block, false);
          this.occ.add(x, z, 1.2);
          return true;
        });
      }
    });
    this.cropFields();
    this.massifs();
    this.marshPlants();
  }

  /** R2 farm: six 3 x 3 crop patches, 3.5 m apart. */
  protected cropFields(): void {
    const rng = this.rng;
    for (const rect of this.roomsOf('r2')) {
      let placed = 0;
      for (let a = 0; a < 80 && placed < 6; a++) {
        const x = (rect.x + rng.next() * rect.w) * T, z = (rect.z + rng.next() * rect.h) * T;
        if (!this.free(x, z, 6, 6) || this.occ.hits(x, z, 6)) continue;
        const url = rng.pick(CROPS);
        const rot = rng.pick([0, PI / 2]);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            this.h.batcher.add(url, x + i * 3.5, 0, z + j * 3.5, rot, 1, this.col(0.1), { cast: false, receive: true, layer: 'tuft' });
        this.occ.add(x, z, 6);
        placed++;
      }
    }
  }

  /** R3 blocking hill massifs (nav circles 10-14 m), kept 16 m off the roads so the route stays open. */
  protected massifs(): void {
    let placed = 0;
    for (const rect of this.roomsOf('r3')) {
      this.many(rect, 6, 400, (x, z) => {
        if (placed >= 6 || this.roadGap(x, z) < 16 || !this.walkable(x, z) || this.h.isAvoided(x, z, 14) || this.occ.hits(x, z, 10)) return false;
        const r = this.rng.range(10, 14);
        const url = this.rng.pick(MASSIFS);
        this.h.batcher.add(url, x, 0, z, this.rng.range(0, 2 * PI), fitScale(url, 2 * r), this.col(0.1), { cast: true, layer: 'prop' });
        this.h.nav.setCircle(x, z, r * 0.9, false);
        this.occ.add(x, z, r);
        placed++;
        return true;
      });
    }
  }

  /** R4 marsh reeds on the dark (wet) splat patches. */
  protected marshPlants(): void {
    const rng = this.rng;
    for (const rect of this.roomsOf('r4')) {
      this.many(rect, 140, 2000, (x, z) => {
        if (this.h.weights(x, z).dark < 0.35 || !this.walkable(x, z) || this.h.isAvoided(x, z, 0.5)) return false;
        this.h.batcher.add(rng.pick(REEDS), x, 0, z, rng.range(0, 2 * PI), rng.range(0.9, 1.4), this.col(0.15), { cast: false, receive: true, layer: 'bush' });
        return true;
      });
    }
  }
}
