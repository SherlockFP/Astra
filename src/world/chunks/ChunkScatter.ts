import { RNG, hashString } from '../../core/utils';
import { TILE_SIZE, type DungeonDef, type TileRect } from '../../types/dungeons';
import {
  CROPS, FLOWERS, FOREST, MASSIFS, MUSHROOMS, PALETTES, REEDS, SPRINKLES, TUFT, Occupancy, WorldScatter, fitScale,
  type WorldScatterHost,
} from '../WorldScenery';
import { baseNavCell, type TileQuery } from '../NavBase';
import { gp, ip } from '../../data/dungeons/kit';
import { AvoidIndex } from './AvoidIndex';
import type { ChunkContent, StreamCollider, StreamInstance } from './ChunkContent';

/**
 * Open-world scatter for streamed zones: the WorldScatter recipes (palettes, border dressing, forests, specials) run per CHUNK
 * instead of once for the whole map (docs/ENGINE_BIGMAPS.md). The result of generate(cx, cz) depends only on the zone data and
 * (cx, cz): its RNG is seeded per chunk, the "free ground" test uses the layout-only nav rule (never the live nav grid, which
 * holds the colliders of whatever chunks happened to be built first), and spacing (Occupancy) is per chunk. Every peer therefore
 * generates the same trees and rocks in any streaming order. Densities are the WorldScatter ones per square metre; sparse
 * specials (sprinkles, crop fields, hill massifs, marsh reeds) keep the per-room count of a room up to 70,000 m2 and grow with
 * the area beyond that, so a 4 km region gets the same DENSITY as a 640 m one, not the same total. OWNER: world module (engine).
 */

const T = TILE_SIZE;
const PI = Math.PI;
/** Area (m2) of a region room up to which its special counts are per room; beyond it they scale with the area. */
const SPECIAL_AREA_CAP = 70000;
/** Void interior forest (WorldScatter.voidForest: 900 trees over the ~39k m2 of eligible void of Sisli Vadi): trees per m2 of void. */
const VOID_PER_M2 = 1 / 44;
/** Backdrop forest beyond the map edge (WorldScatter.beyondForest: 760 trees in a 90 m band): trees per m2 of band. */
const BEYOND_PER_M2 = 1 / 346;
const BEYOND_BAND = 90;
const BEYOND_TREES = [gp('tree_pine_a'), gp('tree_pine_b'), ip('retro-psx-tree-pack', 'trees/tree01')];

export interface ChunkScatterHost {
  def: DungeonDef;
  W: number;
  H: number;
  /** Chunk edge (m), a multiple of 16 (whole tiles). */
  chunkM: number;
  tileRoom(i: number, j: number): number;
  hasH(i: number, j: number): boolean;
  hasV(i: number, j: number): boolean;
  /** Hand-placed keep-clear circles; may still grow while the map builds (the index re-syncs on every chunk). */
  avoid: { x: number; z: number; r: number }[];
  /** Splat weights at a world position (marsh reeds read the dark channel). */
  weights(x: number, z: number): { dirt: number; cobble: number; dark: number };
}

interface RoadSeg { ax: number; az: number; bx: number; bz: number; hw: number }
interface Recorder { inst: StreamInstance[]; col: StreamCollider[] }

/** Duck-typed batcher / nav that record instead of rendering: all WorldScatter ever calls on them. */
function recorderHost(h: ChunkScatterHost, rec: Recorder, avoid: AvoidIndex): WorldScatterHost {
  const q: TileQuery = { room: h.tileRoom, hasH: h.hasH, hasV: h.hasV };
  const batcher = {
    add(url: string, x: number, y: number, z: number, rot: number, scale: number | [number, number, number], color?: { r: number } | null, opts: { cast?: boolean; receive?: boolean; layer?: StreamInstance['layer'] } = {}): void {
      rec.inst.push({
        url, x, y, z, rot, scale: typeof scale === 'number' ? scale : scale[0],
        tint: color == null ? null : color.r, cast: opts.cast ?? true, receive: opts.receive ?? true, layer: opts.layer,
      });
    },
  };
  const nav = {
    setCircle(x: number, z: number, r: number, walkable: boolean): void {
      if (!walkable) rec.col.push({ x, z, r });
    },
    /** Layout-only walkability of the nav cell under (x, z): cell centres sit on integer metres (NavGrid origin -0.5). */
    isWalkable(x: number, z: number): boolean {
      return baseNavCell(q, Math.floor(x + 0.5), Math.floor(z + 0.5));
    },
  };
  return {
    def: h.def, W: h.W, H: h.H,
    batcher: batcher as unknown as WorldScatterHost['batcher'],
    nav: nav as unknown as WorldScatterHost['nav'],
    avoid: h.avoid,
    isAvoided: (x, z, pad) => {
      avoid.sync();
      return avoid.hit(x, z, pad);
    },
    tileRoom: h.tileRoom, hasH: h.hasH, hasV: h.hasV,
    weights: h.weights,
  };
}

export class ChunkScatter extends WorldScatter {
  private readonly rec: Recorder;
  private readonly cfg: ChunkScatterHost;
  private readonly allRoads: RoadSeg[];
  private readonly allCamps: { x: number; z: number; r: number }[];
  private readonly tilesPerChunk: number;

  constructor(h: ChunkScatterHost) {
    const rec: Recorder = { inst: [], col: [] };
    super(recorderHost(h, rec, new AvoidIndex(h.avoid)));
    this.rec = rec;
    this.cfg = h;
    this.allRoads = this.roads;
    this.allCamps = this.camps;
    this.tilesPerChunk = Math.max(1, Math.round(h.chunkM / T));
  }

  /** Stochastic rounding with the chunk RNG: expected value x, deterministic per chunk. */
  private stoch(x: number): number {
    const f = Math.floor(x);
    return f + (this.rng.next() < x - f ? 1 : 0);
  }

  /** Scenery of chunk (cx, cz): a pure function of the zone data. */
  generate(cx: number, cz: number): ChunkContent {
    const { def, W, H } = this.cfg;
    const k = this.tilesPerChunk;
    this.rec.inst = [];
    this.rec.col = [];
    this.rng = new RNG(hashString(`${def.id}:chunk:${cx},${cz}`));
    this.occ = new Occupancy(6);
    const tx0 = cx * k, tz0 = cz * k, tx1 = tx0 + k, tz1 = tz0 + k;
    const mx0 = tx0 * T, mz0 = tz0 * T, mx1 = tx1 * T, mz1 = tz1 * T;
    // only the roads / camps that can matter here (the checks use pads up to ~16 m and camp radii up to ~50 m)
    this.roads = this.allRoads.filter((r) => Math.max(r.ax, r.bx) + 40 >= mx0 && Math.min(r.ax, r.bx) - 40 <= mx1 && Math.max(r.az, r.bz) + 40 >= mz0 && Math.min(r.az, r.bz) - 40 <= mz1);
    this.camps = this.allCamps.filter((c) => c.x + c.r + 24 >= mx0 && c.x - c.r - 24 <= mx1 && c.z + c.r + 24 >= mz0 && c.z - c.r - 24 <= mz1);

    const inMap = tx1 > 0 && tz1 > 0 && tx0 < W && tz0 < H;
    if (inMap) {
      this.borderEdges(cx, cz, tx0, tz0, tx1, tz1);
      this.voidTrees(tx0, tz0, tx1, tz1);
      this.regionScatter(tx0, tz0, tx1, tz1);
      this.regionSpecials(tx0, tz0, tx1, tz1);
    }
    this.beyondTrees(mx0, mz0, mx1, mz1);
    return { cx, cz, instances: this.rec.inst, colliders: this.rec.col };
  }

  // ---- borders: every wall edge (walkable meets void) whose start tile lies in the chunk ----

  private borderEdges(cx: number, cz: number, tx0: number, tz0: number, tx1: number, tz1: number): void {
    const h = this.h;
    const { W, H } = this.cfg;
    const k = this.tilesPerChunk;
    const lastRow = Math.floor((H - 1) / k), lastCol = Math.floor((W - 1) / k);
    const jEnd = cz === lastRow ? H : tz1 - 1;
    const iEnd = cx === lastCol ? W : tx1 - 1;
    for (let j = Math.max(0, tz0); j <= jEnd && j <= H; j++)
      for (let i = Math.max(0, tx0); i < Math.min(W, tx1); i++) {
        if (!h.hasH(i, j)) continue;
        const northWalk = h.tileRoom(i, j - 1) >= 0;
        const wt: [number, number] = northWalk ? [i, j - 1] : [i, j];
        const vt: [number, number] = northWalk ? [i, j] : [i, j - 1];
        this.dress(this.styleOf(wt, vt, `h:${i}:${j}`), i * T, j * T, 1, 0, 0, northWalk ? 1 : -1);
      }
    for (let j = Math.max(0, tz0); j < Math.min(H, tz1); j++)
      for (let i = Math.max(0, tx0); i <= iEnd && i <= W; i++) {
        if (!h.hasV(i, j)) continue;
        const westWalk = h.tileRoom(i - 1, j) >= 0;
        const wt: [number, number] = westWalk ? [i - 1, j] : [i, j];
        const vt: [number, number] = westWalk ? [i, j] : [i - 1, j];
        this.dress(this.styleOf(wt, vt, `v:${i}:${j}`), i * T, j * T, 0, 1, westWalk ? 1 : -1, 0);
      }
  }

  // ---- forests ----

  /** Trees in the void interior (mountains and forest between regions); water and the band next to walkable ground are skipped. */
  private voidTrees(tx0: number, tz0: number, tx1: number, tz1: number): void {
    const h = this.h;
    const { W, H } = this.cfg;
    const perTile = (T * T) * VOID_PER_M2;
    for (let j = Math.max(0, tz0); j < Math.min(H, tz1); j++)
      for (let i = Math.max(0, tx0); i < Math.min(W, tx1); i++) {
        if (h.tileRoom(i, j) >= 0 || this.isWaterTile(i, j) || this.nearWalk(i, j, 2)) continue;
        for (let n = this.stoch(perTile); n > 0; n--) {
          const x = (i + this.rng.next()) * T, z = (j + this.rng.next()) * T;
          this.tree(this.rng.pick(FOREST), x, z, this.rng.range(1.7, 3.0), false, 'tree');
        }
      }
  }

  /** Backdrop forest in the band just outside the map rectangle. */
  private beyondTrees(mx0: number, mz0: number, mx1: number, mz1: number): void {
    const { W, H } = this.cfg;
    const MW = W * T, MH = H * T;
    const x0 = Math.max(mx0, -BEYOND_BAND), x1 = Math.min(mx1, MW + BEYOND_BAND);
    const z0 = Math.max(mz0, -BEYOND_BAND), z1 = Math.min(mz1, MH + BEYOND_BAND);
    if (x1 <= x0 || z1 <= z0) return;
    const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const band = (x1 - x0) * (z1 - z0) - overlap(x0, x1, 0, MW) * overlap(z0, z1, 0, MH);
    if (band <= 0) return;
    const n = this.stoch(band * BEYOND_PER_M2);
    for (let a = 0, placed = 0; a < n * 6 && placed < n; a++) {
      const x = x0 + this.rng.next() * (x1 - x0), z = z0 + this.rng.next() * (z1 - z0);
      if (x >= 0 && x <= MW && z >= 0 && z <= MH) continue;
      this.tree(this.rng.chance(0.62) ? this.rng.pick(BEYOND_TREES) : this.rng.pick(FOREST), x, z, this.rng.range(1.7, 3.0), false, 'tree');
      placed++;
    }
  }

  // ---- regions ----

  /** The part of a room inside the chunk's tile rect (null when they do not meet). */
  private overlap(room: TileRect, tx0: number, tz0: number, tx1: number, tz1: number, shrink = 0): TileRect | null {
    const x0 = Math.max(room.x, tx0) + shrink, z0 = Math.max(room.z, tz0) + shrink;
    const x1 = Math.min(room.x + room.w, tx1) - shrink, z1 = Math.min(room.z + room.h, tz1) - shrink;
    return x1 > x0 && z1 > z0 ? { x: x0, z: z0, w: x1 - x0, h: z1 - z0 } : null;
  }

  private regionScatter(tx0: number, tz0: number, tx1: number, tz1: number): void {
    const h = this.h;
    this.cfg.def.rooms.forEach((room, ri) => {
      const reg = this.regs[ri];
      const pal = reg ? PALETTES[reg.id] : undefined;
      if (!reg || !pal) return;
      const rect = this.overlap(room.rect, tx0, tz0, tx1, tz1);
      if (!rect) return;
      const area = rect.w * rect.h * T * T;
      const cnt = (dens: number, mult: number): number => this.stoch(area * dens * mult);
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

      const nm = this.stoch((area / 2600) * (pal.mushrooms ?? 0));
      this.many(rect, nm, nm * 6 + 10, (x, z) => {
        if (!this.free(x, z, 1, 1.5)) return false;
        h.batcher.add(rng.pick(MUSHROOMS), x, 0, z, rng.range(0, 2 * PI), rng.range(2.4, 3.6), this.col(0.2), { cast: false, layer: 'bush' });
        return true;
      });

      const nr = cnt(1 / 1400, pal.mult.rock);
      this.many(rect, nr, nr * 8 + 20, (x, z) => {
        // (unlike the whole-map scatter, rocks also keep out of camps: camp spawn points are snapped before any chunk exists)
        if (this.inCamp(x, z, 0.75) || this.occ.hits(x, z, 1.4) || !this.free(x, z, 1.4, 2.0)) return false;
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

  // ---- specials: sprinkles, crop fields, hill massifs, marsh reeds ----

  private regionSpecials(tx0: number, tz0: number, tx1: number, tz1: number): void {
    const h = this.h;
    this.cfg.def.rooms.forEach((room, ri) => {
      const reg = this.regs[ri];
      if (!reg) return;
      const rect = this.overlap(room.rect, tx0, tz0, tx1, tz1);
      if (!rect) return;
      const share = (rect.w * rect.h * T * T) / Math.min(SPECIAL_AREA_CAP, room.rect.w * room.rect.h * T * T);
      const rng = this.rng;

      for (const sp of SPRINKLES[reg.id] ?? []) {
        const n = this.stoch(sp.n * share);
        this.many(rect, n, n * 20 + 20, (x, z) => {
          if (this.occ.hits(x, z, 1.2) || !this.free(x, z, 1.5, 3)) return false;
          h.batcher.add(rng.pick(sp.urls), x, 0, z, rng.range(0, 2 * PI), rng.range(sp.s[0], sp.s[1]), this.col(0.1), { cast: true, layer: sp.layer });
          if (sp.block) h.nav.setCircle(x, z, sp.block, false);
          this.occ.add(x, z, 1.2);
          return true;
        });
      }

      // big items keep 15 m off the chunk edge so they never straddle into a neighbour's spacing
      const inner = this.overlap(room.rect, tx0, tz0, tx1, tz1, 4);
      if (reg.id === 'r2' && inner) {
        // farm: 3 x 3 crop patches, 3.5 m apart (6 per 70,000 m2)
        const n = this.stoch(6 * share);
        for (let a = 0, placed = 0; a < n * 14 + 14 && placed < n; a++) {
          const x = (inner.x + rng.next() * inner.w) * T, z = (inner.z + rng.next() * inner.h) * T;
          if (!this.free(x, z, 6, 6) || this.occ.hits(x, z, 6)) continue;
          const url = rng.pick(CROPS);
          const rot = rng.pick([0, PI / 2]);
          for (let i = -1; i <= 1; i++)
            for (let j = -1; j <= 1; j++) h.batcher.add(url, x + i * 3.5, 0, z + j * 3.5, rot, 1, this.col(0.1), { cast: false, receive: true, layer: 'tuft' });
          this.occ.add(x, z, 6);
          placed++;
        }
      }
      if (reg.id === 'r3' && inner) {
        // hills: blocking massifs (nav circles 10-14 m) kept 16 m off the roads so the route stays open
        const n = this.stoch(6 * share);
        for (let a = 0, placed = 0; a < n * 60 + 30 && placed < n; a++) {
          const x = (inner.x + rng.next() * inner.w) * T, z = (inner.z + rng.next() * inner.h) * T;
          if (this.roadGap(x, z) < 16 || !this.walkable(x, z) || this.h.isAvoided(x, z, 14) || this.inCamp(x, z, 0.75) || this.occ.hits(x, z, 10)) continue;
          const r = rng.range(10, 14);
          const url = rng.pick(MASSIFS);
          h.batcher.add(url, x, 0, z, rng.range(0, 2 * PI), fitScale(url, 2 * r), this.col(0.1), { cast: true, layer: 'prop' });
          h.nav.setCircle(x, z, r * 0.9, false);
          this.occ.add(x, z, r);
          placed++;
        }
      }
      if (reg.id === 'r4') {
        // marsh: reeds on the dark (wet) splat patches (140 per 70,000 m2)
        const n = this.stoch(140 * share);
        this.many(rect, n, n * 15 + 20, (x, z) => {
          if (h.weights(x, z).dark < 0.35 || !this.walkable(x, z) || h.isAvoided(x, z, 0.5)) return false;
          h.batcher.add(rng.pick(REEDS), x, 0, z, rng.range(0, 2 * PI), rng.range(0.9, 1.4), this.col(0.15), { cast: false, receive: true, layer: 'bush' });
          return true;
        });
      }
    });
  }
}
