import type { RNG } from '../../core/utils';
import type { TileRect } from '../../types/dungeons';
import { OPPOSITE, type ArenaSrc, type Side } from './arenas';
import { ARCHETYPES_BY_KIND, type Archetype, type GenericKind } from './archetypes';

/**
 * Layout growth of the generated maps (docs/GDD_PROCGEN.md §4.1). OWNER: world module.
 * Pure integer geometry + the core RNG (mulberry32): no transcendental math, no object-order dependence, so every peer builds the
 * identical layout. A layout is a TREE of rooms joined by straight 2 tile wide connectors (corridors, or stair strips when the
 * floor tiers differ): the spine start -> guardian 1 -> guardian 2 -> final plus dead-end branches. Connectivity is therefore
 * guaranteed by construction; the search only has to find a placement without overlaps.
 */

export type NodeKind = GenericKind | 'guardian' | 'final';

export interface DoorUse { side: Side; at: number }

export interface LNode {
  idx: number;
  kind: NodeKind;
  /** Floor tier (2 m per tier). */
  tier: number;
  spine: boolean;
  arch?: Archetype;
  arena?: ArenaSrc;
  /** Boss order 1..3 for guardian / final rooms. */
  order?: number;
  /** Branch rooms: sit one tier above the host when there is room (balcony treasure). */
  up?: boolean;
  rect?: TileRect;
  doors: DoorUse[];
}

export interface LLink {
  a: number;
  b: number;
  /** Exit side of room a (the direction of travel). */
  side: Side;
  aAt: number;
  bAt: number;
  len: number;
  rect: TileRect;
  ramp: boolean;
}

export interface Layout { nodes: LNode[]; links: LLink[] }

/** Gap (tiles) kept between rects that are not joined. */
const PAD = 1;
const MAX_SPAN = 100;

const hits = (a: TileRect, b: TileRect): boolean =>
  a.x < b.x + b.w + PAD && a.x + a.w + PAD > b.x && a.z < b.z + b.h + PAD && a.z + a.h + PAD > b.z;

export function corridorRect(a: TileRect, side: Side, at: number, len: number): TileRect {
  switch (side) {
    case 'e': return { x: a.x + a.w, z: a.z + at, w: len, h: 2 };
    case 'w': return { x: a.x - len, z: a.z + at, w: len, h: 2 };
    case 's': return { x: a.x + at, z: a.z + a.h, w: 2, h: len };
    default: return { x: a.x + at, z: a.z - len, w: 2, h: len };
  }
}

/** Room of size w x h beyond connector `c` (travelling `side`), its entry door at offset `bAt` on the opposite side. */
export function roomBeyond(c: TileRect, side: Side, w: number, h: number, bAt: number): TileRect {
  switch (side) {
    case 'e': return { x: c.x + c.w, z: c.z - bAt, w, h };
    case 'w': return { x: c.x - w, z: c.z - bAt, w, h };
    case 's': return { x: c.x - bAt, z: c.z + c.h, w, h };
    default: return { x: c.x - bAt, z: c.z - h, w, h };
  }
}

/** First tile of a door inside room `r` on `side` at offset `at` (GDD DoorDef.tile of the room that is `a`). */
export function doorTile(r: TileRect, side: Side, at: number): [number, number] {
  switch (side) {
    case 'n': return [r.x + at, r.z];
    case 's': return [r.x + at, r.z + r.h - 1];
    case 'e': return [r.x + r.w - 1, r.z + at];
    default: return [r.x, r.z + at];
  }
}

const sideLen = (r: TileRect, side: Side): number => (side === 'n' || side === 's' ? r.w : r.h);
const sideLenOf = (w: number, h: number, side: Side): number => (side === 'n' || side === 's' ? w : h);

interface Opt { side: Side; aAt: number; len: number; cRect: TileRect; bRect: TileRect; bAt: number; arch?: Archetype }

class Grower {
  budget = 900;
  readonly lay: Layout;
  readonly rng: RNG;
  constructor(lay: Layout, rng: RNG) {
    this.lay = lay;
    this.rng = rng;
  }

  /** True when `r` keeps its distance from everything except the rects in `skip`. */
  free(r: TileRect, skip: readonly (TileRect | undefined)[]): boolean {
    for (const n of this.lay.nodes) if (n.rect && !skip.includes(n.rect) && hits(r, n.rect)) return false;
    for (const l of this.lay.links) if (!skip.includes(l.rect) && hits(r, l.rect)) return false;
    return true;
  }

  /** Door spacing on a side: two doors need >= 4 tiles between their first tiles. */
  private okAt(n: LNode, side: Side, at: number): boolean {
    return !n.doors.some((d) => d.side === side && Math.abs(d.at - at) < 4);
  }

  private pickAt(n: LNode, rect: TileRect, side: Side): number | null {
    const len = sideLen(rect, side);
    for (let k = 0; k < 6; k++) {
      const at = this.rng.int(1, len - 3);
      if (this.okAt(n, side, at)) return at;
    }
    return null;
  }

  /** Exit doors of room `a` in try order. `entry` = the side the room was entered through (null for the start room). */
  private exits(a: LNode, entry: Side | null): { side: Side; at: number }[] {
    if (a.kind === 'final') return [];
    const r = a.rect as TileRect;
    if (a.arena) {
      const left = a.arena.anchors.filter((an) => !a.doors.some((d) => d.side === an.side && d.at === an.at));
      return this.rng.shuffle([...left]).map((an) => ({ side: an.side, at: an.at }));
    }
    const pool: Side[] = (['n', 's', 'e', 'w'] as Side[]).filter((s) => s !== entry);
    const heading = entry ? OPPOSITE[entry] : null;
    const out: { side: Side; at: number }[] = [];
    while (pool.length) {
      const s = this.rng.weighted(pool, (p) => (p === heading ? 3 : 2));
      pool.splice(pool.indexOf(s), 1);
      for (let k = 0; k < 2; k++) {
        const at = this.pickAt(a, r, s);
        if (at !== null) out.push({ side: s, at });
      }
    }
    return out;
  }

  /** Candidate placements of room `b` after room `a`, lazily, in seeded order. */
  *options(a: LNode, b: LNode, entry: Side | null): Generator<Opt> {
    const aRect = a.rect as TileRect;
    const dTier = Math.abs(b.tier - a.tier);
    const ramp = dTier > 0;
    for (const ex of this.exits(a, entry)) {
      // a stair connector is the stair strip (2 tiles per tier, next to room a) plus a flat run at the new height
      const lens = ramp ? this.rng.shuffle([2 * dTier, 2 * dTier + 1, 2 * dTier + 2, 2 * dTier + 4]) : this.rng.shuffle([2, 3, 4, 6, 8]);
      for (const len of lens) {
        const cRect = corridorRect(aRect, ex.side, ex.at, len);
        if (!this.free(cRect, [aRect])) continue;
        const back = OPPOSITE[ex.side];
        if (b.arena) {
          const anchors = this.rng.shuffle(b.arena.anchors.filter((an) => an.side === back));
          for (const an of anchors) {
            const bRect = roomBeyond(cRect, ex.side, b.arena.w, b.arena.h, an.at);
            if (this.free(bRect, [cRect])) yield { side: ex.side, aAt: ex.at, len, cRect, bRect, bAt: an.at };
          }
        } else {
          const cands = ARCHETYPES_BY_KIND(b.kind as GenericKind);
          const pool = [...cands];
          for (let k = 0; k < 3 && pool.length; k++) {
            const arch = this.rng.weighted(pool, (p) => p.weight);
            pool.splice(pool.indexOf(arch), 1);
            const bLen = sideLenOf(arch.w, arch.h, back);
            const bAt = this.rng.int(1, bLen - 3);
            const bRect = roomBeyond(cRect, ex.side, arch.w, arch.h, bAt);
            if (this.free(bRect, [cRect])) yield { side: ex.side, aAt: ex.at, len, cRect, bRect, bAt, arch };
          }
        }
      }
    }
  }

  apply(ai: number, bi: number, o: Opt): LLink {
    const a = this.lay.nodes[ai], b = this.lay.nodes[bi];
    b.rect = o.bRect;
    if (o.arch) b.arch = o.arch;
    a.doors.push({ side: o.side, at: o.aAt });
    b.doors.push({ side: OPPOSITE[o.side], at: o.bAt });
    const link: LLink = { a: ai, b: bi, side: o.side, aAt: o.aAt, bAt: o.bAt, len: o.len, rect: o.cRect, ramp: a.tier !== b.tier };
    this.lay.links.push(link);
    return link;
  }

  undo(ai: number, bi: number): void {
    const a = this.lay.nodes[ai], b = this.lay.nodes[bi];
    this.lay.links.pop();
    a.doors.pop();
    b.doors.pop();
    b.rect = undefined;
    b.arch = undefined;
  }

  /** Entry side of node `i` (the side of its first door), null for the start room. */
  entryOf(i: number): Side | null {
    const n = this.lay.nodes[i];
    return i === 0 || !n.doors.length ? null : n.doors[0].side;
  }

  growSpine(i: number, spineLen: number): boolean {
    if (i >= spineLen) return true;
    const a = this.lay.nodes[i - 1], b = this.lay.nodes[i];
    for (const o of this.options(a, b, this.entryOf(i - 1))) {
      if (--this.budget < 0) return false;
      this.apply(i - 1, i, o);
      if (this.growSpine(i + 1, spineLen)) return true;
      this.undo(i - 1, i);
    }
    return false;
  }

}

export interface GrowPlan {
  /** Spine nodes first (start .. final), then branch nodes. */
  nodes: LNode[];
  spineLen: number;
}

/** Bounding box of every rect of the layout. */
export function bounds(lay: Layout): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (r: TileRect | undefined): void => {
    if (!r) return;
    x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.h);
  };
  for (const n of lay.nodes) add(n.rect);
  for (const l of lay.links) add(l.rect);
  return { x0, z0, x1, z1 };
}

/**
 * One growth attempt. The start room sits at the origin; the spine is searched depth first with a placement budget; branch rooms
 * are attached afterwards to seeded host rooms (a branch that fits nowhere is dropped). Returns null when the spine does not fit,
 * when fewer than `minRooms` rooms were placed or when the layout spans more than MAX_SPAN tiles.
 */
export function growLayout(plan: GrowPlan, rng: RNG, minRooms: number, maxTier: number): Layout | null {
  const nodes = plan.nodes.map((n): LNode => ({ ...n, doors: [], rect: undefined, arch: undefined }));
  const lay: Layout = { nodes, links: [] };
  const g = new Grower(lay, rng);
  // start room
  const st = nodes[0];
  st.arch = rng.weighted(ARCHETYPES_BY_KIND('start'), (p) => p.weight);
  st.rect = { x: 0, z: 0, w: st.arch.w, h: st.arch.h };
  if (!g.growSpine(1, plan.spineLen)) return null;
  // branches: hosts are the non-boss spine rooms, shuffled
  const spineHosts = (): number[] => {
    const hs: number[] = [];
    for (let i = 0; i < plan.spineLen; i++) if (nodes[i].kind !== 'guardian' && nodes[i].kind !== 'final') hs.push(i);
    return rng.shuffle(hs);
  };
  for (let bi = plan.spineLen; bi < nodes.length; bi++) {
    const n = nodes[bi];
    const hosts = spineHosts();
    // tier follows the host: pick the host first, then the tier (+1 balcony for treasure rooms with 30 %)
    let placed = false;
    for (const hi of hosts) {
      const host = nodes[hi];
      n.tier = host.tier + (n.up && host.tier < maxTier ? 1 : 0);
      for (const o of g.options(host, n, g.entryOf(hi))) {
        if (--g.budget < 0) break;
        g.apply(hi, bi, o);
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) n.rect = undefined; // dropped
  }
  const kept = nodes.filter((n) => n.rect);
  if (kept.length < minRooms) return null;
  const b = bounds(lay);
  if (b.x1 - b.x0 > MAX_SPAN || b.z1 - b.z0 > MAX_SPAN) return null;
  // dropped branch nodes leave the layout
  lay.nodes = kept;
  // node indices inside links must follow the compaction
  const remap = new Map<number, number>();
  kept.forEach((n, i) => remap.set(n.idx, i));
  for (const l of lay.links) { l.a = remap.get(nodes[l.a].idx) as number; l.b = remap.get(nodes[l.b].idx) as number; }
  return lay;
}
