import { RNG, hashString } from '../../core/utils';
import type { DoorDef, FloorStyle, HeightArea, LiftDef, PackDef, PropPlacement, RoomDef, SlopeDef, TileRect, WallStyle, ZoneDef } from '../../types/dungeons';
import { getEnemyDef } from '../enemies';

/**
 * Content kit: tiny authoring helpers shared by the dungeon files (OWNER: content module).
 *
 * COORDINATES. Dungeon files are authored in the GDD convention (docs/GDD_CONTENT.md section 0.1): a continuous tile
 * coordinate `c` maps to world `(c + 0.5) * TILE_SIZE`, so an integer is a tile CENTRE and a room with rect x=2,w=11
 * spans c = 1.5 .. 12.5. This is also the contract in types/dungeons.ts and what DungeonScene (packs, bosses, extras),
 * the map panel and Affixes (rift spots) use.
 *
 * The world builders (DungeonBuilder / OutdoorBuilder) follow the same contract for props, start, exit, packs and bosses, so
 * every point goes through unchanged. Integer TILE indices (RoomDef.rect, DoorDef.tile, ZoneDef.rect) are tile-corner based
 * and never shifted. GRID_SHIFT is kept (= 0) so the `shPt` call sites stay valid; it is the one knob to turn if a builder
 * ever deviates from the contract again.
 */
export const GRID_SHIFT = 0;
export const sh = (v: number): number => v + GRID_SHIFT;
/** Builder-side points (props, start, exit): GDD coordinates (identity while GRID_SHIFT = 0). */
export const shPt = (x: number, z: number): [number, number] => [x + GRID_SHIFT, z + GRID_SHIFT];
/** Scene-side points (packs, bosses, extras, patrols): GDD coordinates, the contract convention. */
export const pt = (x: number, z: number): [number, number] => [x, z];

// ---------------------------------------------------------------------------------------------------------------------
// Model url helpers
// ---------------------------------------------------------------------------------------------------------------------
const M = '/assets/models/';
export const dg = (n: string): string => `${M}dungeon/${n}.glb`;
export const hw = (n: string): string => `${M}halloween/${n}.glb`;
export const fu = (n: string): string => `${M}furniture/${n}.glb`;
export const gp = (n: string): string => `${M}gen/props/${n}.glb`;
export const kg = (n: string): string => `${M}kenney/graveyard-kit/${n}.glb`;
export const ks = (n: string): string => `${M}kenney/survival-kit/${n}.glb`;
export const kf = (n: string): string => `${M}kenney/fantasy-town-kit/${n}.glb`;
export const kc = (n: string): string => `${M}kenney/castle-kit/${n}.glb`;
export const kn = (n: string): string => `${M}kenney/nature-kit/${n}.glb`;
/** town/ hex pack, e.g. tw('buildings/red/building_blacksmith_red') */
export const tw = (p: string): string => `${M}town/${p}.glb`;
export const chr = (n: string): string => `${M}characters/${n}.glb`;
export const skl = (n: string): string => `${M}enemies/${n}.glb`;
export const mon = (n: string): string => `${M}monsters/${n}.glb`;
export const npcm = (n: string): string => `${M}npcs/${n}.glb`;
/** itch.io PSX packs, e.g. ip('psx-medieval', 'market/market_stall_red') */
export const ip = (pack: string, p: string): string => `${M}itch/${pack}/${p}.glb`;

// ---------------------------------------------------------------------------------------------------------------------
// Basic constructors
// ---------------------------------------------------------------------------------------------------------------------
export type Light = NonNullable<PropPlacement['light']>;
export const lt = (color: number, intensity: number, distance: number, flicker = true, y?: number): Light =>
  y === undefined ? { color, intensity, distance, flicker } : { color, intensity, distance, flicker, y };

export type PO = Partial<Omit<PropPlacement, 'model' | 'pos'>>;
export type Side = 'n' | 's' | 'e' | 'w';

export function room(
  id: string, name: string, x: number, z: number, w: number, h: number, floor: FloorStyle, wall: WallStyle, autoDecor: number,
  extra: Partial<RoomDef> = {},
): RoomDef {
  return { id, name, rect: { x, z, w, h }, floor, wall, autoDecor, ...extra };
}

export const door = (a: string, b: string, tx: number, tz: number, side: Side, width: number, gate: NonNullable<DoorDef['gate']>): DoorDef =>
  ({ a, b, tile: [tx, tz], side, width, gate });

export type MemberTuple = [enemyId: string, ox: number, oz: number];

/** P-03 rank arrays: one enemy id per member, laid out on the sunflower table (front = +z of the centre, back = -z). */
export interface RankSpec { front?: string[]; back?: string[] }
export type PackExtra = Partial<Omit<PackDef, 'id' | 'roomId' | 'center' | 'members' | 'forces'>> & RankSpec;

/** Offset of each rank from the pack centre along z (tiles). */
export const RANK_Z = 1.2;
const SUNFLOWER_DEG = 137.508;

/** Sunflower table: point i at r = 0.3 * sqrt(1 + 2i) tiles and angle i * 137.508 deg (the spiral used by the dungeon docs). */
export function sunflower(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = 0.3 * Math.sqrt(1 + 2 * i);
    const a = (i * SUNFLOWER_DEG * Math.PI) / 180;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

/** Sum of the M+ forces of the given members (EnemyDef.forces, bosses included). Throws on an unknown id. */
export function memberForces(members: MemberTuple[]): number {
  let sum = 0;
  for (const [enemyId] of members) {
    const def = getEnemyDef(enemyId);
    if (!def) throw new Error(`[content] pack: unknown member enemy ${enemyId}`);
    sum += def.forces;
  }
  return sum;
}

/**
 * Pack helper (P-03). `forces` undefined means the sum of the member forces. `extra.front` / `extra.back` add members
 * from rank arrays (enemy ids, sunflower offsets, rows at +RANK_Z / -RANK_Z); they are appended after the explicit members.
 */
export function pack(
  id: string, roomId: string, cx: number, cz: number, forces: number | undefined, members: MemberTuple[],
  extra: PackExtra = {},
): PackDef {
  const { front, back, ...rest } = extra;
  const ranked: MemberTuple[] = [];
  const addRank = (ids: string[] | undefined, dz: number): void => {
    if (!ids) return;
    const table = sunflower(ids.length);
    ids.forEach((enemyId, i) => ranked.push([enemyId, table[i][0], table[i][1] + dz]));
  };
  addRank(front, RANK_Z);
  addRank(back, -RANK_Z);
  const all: MemberTuple[] = [...members, ...ranked];
  const out: PackDef = {
    id, roomId, center: pt(cx, cz), forces: forces ?? memberForces(all),
    members: all.map(([enemyId, ox, oz]) => ({ enemyId, offset: [ox, oz] as [number, number] })),
    ...rest,
  };
  if (rest.patrol) out.patrol = rest.patrol.map(([x, z]) => pt(x, z));
  return out;
}

/** Adapter for the Leş spelling `pk(id, roomId, cx, cz, forces, front, back, extra?)` with [enemyId, count] pairs. */
export function pk(
  id: string, roomId: string, cx: number, cz: number, forces: number | undefined,
  front: [string, number][], back: [string, number][], extra: PackExtra = {},
): PackDef {
  const expand = (pairs: [string, number][]): string[] => pairs.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  return pack(id, roomId, cx, cz, forces, [], { ...extra, front: expand(front), back: expand(back) });
}

/** Adapter for the Yanki spelling `packN(id, roomId, cx, cz, counts, extra?)`: forces auto, all counted members on the front rank. */
export function packN(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}): PackDef {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  return pack(id, roomId, cx, cz, undefined, [], { ...extra, front: [...(extra.front ?? []), ...ids] });
}

export function bossAt(bossId: string, roomId: string, x: number, z: number, facing: number, order: number) {
  return { bossId, roomId, pos: pt(x, z), facing, order };
}

/** Circle zone from a GDD-coordinate centre and a radius in TILES. */
export function circleZone(kind: ZoneDef['kind'], cx: number, cz: number, rTiles: number, extra: Partial<ZoneDef> = {}): ZoneDef {
  return { kind, shape: 'circle', rect: { x: cx + 0.5 - rTiles, z: cz + 0.5 - rTiles, w: rTiles * 2, h: rTiles * 2 }, ...extra };
}

/** Axis aligned zone from integer tile indices (no shift). */
export const rectZone = (kind: ZoneDef['kind'], x: number, z: number, w: number, h: number, extra: Partial<ZoneDef> = {}): ZoneDef =>
  ({ kind, shape: 'rect', rect: { x, z, w, h }, ...extra });

// ---------------------------------------------------------------------------------------------------------------------
// Prop builder
// ---------------------------------------------------------------------------------------------------------------------
/** Height at which wall mounted torches / trophies are fixed (matches the builder's auto torches). */
export const MOUNT_Y = 2.5;
/** Metres between the wall centre line and the face of the wall (wall pieces are 1 m thick). */
const WALL_FACE = 0.5 / 4;

export interface Reserved { x: number; z: number; r: number }
export interface DoorSpan { line: 'x' | 'z'; at: number; lo: number; hi: number }

/** Door gaps in GDD coordinates: the wall line they interrupt and the span along it. */
export function doorSpans(doors: DoorDef[]): DoorSpan[] {
  return doors.map((d) => {
    const [tx, tz] = d.tile;
    const w = d.width ?? 1;
    if (d.side === 'n') return { line: 'z', at: tz - 0.5, lo: tx - 0.5, hi: tx + w - 0.5 };
    if (d.side === 's') return { line: 'z', at: tz + 0.5, lo: tx - 0.5, hi: tx + w - 0.5 };
    if (d.side === 'w') return { line: 'x', at: tx - 0.5, lo: tz - 0.5, hi: tz + w - 0.5 };
    return { line: 'x', at: tx + 0.5, lo: tz - 0.5, hi: tz + w - 0.5 };
  });
}

export interface KitCtx {
  seed: string;
  spans: DoorSpan[];
  reserved: Reserved[];
}

/** Reserved circles (GDD coordinates) around pack members, bosses, start/exit and door centres. */
export function makeCtx(
  seed: string, doors: DoorDef[], packs: PackDef[], points: { x: number; z: number; r: number }[],
): KitCtx {
  const reserved: Reserved[] = [...points];
  // door centres: both sides of the wall line stay clear of scatter
  for (const d of doors) {
    const [tx, tz] = d.tile;
    const w = d.width ?? 1;
    const along = (w - 1) / 2;
    const [cx, cz, nx, nz] =
      d.side === 'n' ? [tx + along, tz - 0.5, 0, -1] :
      d.side === 's' ? [tx + along, tz + 0.5, 0, 1] :
      d.side === 'w' ? [tx - 0.5, tz + along, -1, 0] : [tx + 0.5, tz + along, 1, 0];
    for (const k of [-1.1, 0, 1.1]) reserved.push({ x: cx + nx * k, z: cz + nz * k, r: 0.5 + w * 0.45 });
  }
  for (const p of packs) {
    const cx = p.center[0], cz = p.center[1];
    for (const m of p.members) reserved.push({ x: cx + m.offset[0], z: cz + m.offset[1], r: 0.7 });
    if (p.patrol) for (const w of p.patrol) reserved.push({ x: w[0], z: w[1], r: 0.8 });
  }
  return { seed, spans: doorSpans(doors), reserved };
}

const baseName = (url: string): string => (url.split('/').pop() ?? url).replace(/\.(glb|gltf)$/i, '');

export class Props {
  readonly list: PropPlacement[] = [];
  private readonly rng: RNG;
  private readonly solid: Reserved[] = [];
  readonly ctx: KitCtx;

  constructor(ctx: KitCtx, roomId: string) {
    this.ctx = ctx;
    this.rng = new RNG(hashString(`${ctx.seed}:${roomId}`));
  }

  /** Place one prop at GDD coordinates (tile-centre based). */
  at(model: string, x: number, z: number, o: PO = {}): this {
    const pl: PropPlacement = { model, pos: shPt(x, z), ...o };
    if (pl.rot !== undefined && pl.rot === 0) delete pl.rot;
    this.list.push(pl);
    if (o.collide) this.solid.push({ x, z, r: 1.2 });
    return this;
  }

  /** n props evenly spaced from (x0,z0) to (x1,z1) inclusive. */
  row(model: string, x0: number, z0: number, x1: number, z1: number, n: number, o: PO = {}): this {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.at(model, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, o);
    }
    return this;
  }

  /** nx * nz grid, top-left at (x0,z0). */
  grid(model: string, x0: number, z0: number, nx: number, nz: number, dx: number, dz: number, o: PO = {}): this {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) this.at(model, x0 + i * dx, z0 + j * dz, o);
    return this;
  }

  /** Ring of n props, radius r tiles. face: 'out' | 'in' | fixed degrees. */
  ring(model: string, cx: number, cz: number, r: number, n: number, o: PO = {}, face: 'out' | 'in' | number = 'out', startDeg = 0): this {
    for (let i = 0; i < n; i++) {
      const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
      const rot = typeof face === 'number' ? face : face === 'out' ? (a * 180) / Math.PI : (a * 180) / Math.PI + 180;
      this.at(model, cx + Math.sin(a) * r, cz + Math.cos(a) * r, { ...o, rot });
    }
    return this;
  }

  /** True if (x,z) on the wall line of `rect`/`side` lies inside a door gap. */
  private inDoor(line: 'x' | 'z', at: number, along: number, margin: number): boolean {
    return this.ctx.spans.some((s) => s.line === line && Math.abs(s.at - at) < 0.05 && along > s.lo - margin && along < s.hi + margin);
  }

  /**
   * Wall mounted props. `positions` are coordinates ALONG the wall (tile units, GDD convention). Rotation faces into the
   * room, door gaps are skipped automatically (margin 0.6 tile). Banners sit on the wall centre line, everything else on
   * the wall face.
   */
  wall(rect: TileRect, side: Side, positions: number[], model: string, o: PO = {}, inset?: number): this {
    const b = baseName(model);
    const ins = inset ?? (b.startsWith('banner') ? 0 : WALL_FACE);
    for (const a of positions) {
      let x: number, z: number, rot: number, line: 'x' | 'z', at: number;
      if (side === 'n') { at = rect.z - 0.5; x = a; z = at + ins; rot = 0; line = 'z'; }
      else if (side === 's') { at = rect.z + rect.h - 0.5; x = a; z = at - ins; rot = 180; line = 'z'; }
      else if (side === 'w') { at = rect.x - 0.5; x = at + ins; z = a; rot = 90; line = 'x'; }
      else { at = rect.x + rect.w - 0.5; x = at - ins; z = a; rot = -90; line = 'x'; }
      if (this.inDoor(line, at, a, 0.6)) continue;
      this.at(model, x, z, { ...o, rot: o.rot ?? rot });
    }
    return this;
  }

  /** Wall torches (torch_mounted) with optional colour override. */
  torches(rect: TileRect, side: Side, positions: number[], color?: number, o: PO = {}): this {
    const extra: PO = { y: MOUNT_Y, ...o };
    if (color !== undefined) extra.light = lt(color, 2.0, 11, true, 0.9);
    return this.wall(rect, side, positions, dg('torch_mounted'), extra);
  }

  /** Evenly spaced positions along a wall run: from..to inclusive, step. */
  static run(from: number, to: number, step: number): number[] {
    const out: number[] = [];
    for (let v = from; v <= to + 1e-6; v += step) out.push(+v.toFixed(3));
    return out;
  }

  /** Inner area of a rect in GDD coordinates, inset by `m` tiles. */
  static inner(rect: TileRect, m = 0.8): { x0: number; z0: number; x1: number; z1: number } {
    return { x0: rect.x - 0.5 + m, z0: rect.z - 0.5 + m, x1: rect.x + rect.w - 0.5 - m, z1: rect.z + rect.h - 0.5 - m };
  }

  /**
   * Seeded scatter of small floor clutter. Avoids pack/boss/door reserved circles and earlier collide props.
   * `o.rot` undefined => random yaw. `minDist` tiles between scatter items.
   */
  scatter(
    count: number, models: string[], area: { x0: number; z0: number; x1: number; z1: number }, o: PO = {},
    opt: { minDist?: number; clear?: number; hole?: { x: number; z: number; r: number }[] } = {},
  ): this {
    const minDist = opt.minDist ?? 0.55;
    const clear = opt.clear ?? 0.9;
    const placed: { x: number; z: number }[] = [];
    let guard = count * 40;
    while (placed.length < count && guard-- > 0) {
      const x = this.rng.range(area.x0, area.x1), z = this.rng.range(area.z0, area.z1);
      if (this.ctx.reserved.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + clear * 0.4)) continue;
      if (this.solid.some((r) => Math.hypot(r.x - x, r.z - z) < r.r)) continue;
      if (opt.hole?.some((r) => Math.hypot(r.x - x, r.z - z) < r.r)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
      placed.push({ x, z });
      const model = this.rng.pick(models);
      const rot = o.rot ?? this.rng.range(0, 360);
      this.at(model, x, z, { ...o, rot });
    }
    return this;
  }

  /** Random float helper for hand tuned variety. */
  rnd(lo: number, hi: number): number { return this.rng.range(lo, hi); }
}

/** Convenience: build the per-room props map. */
export function decorator(ctx: KitCtx, rects: Record<string, TileRect>) {
  const out: Record<string, PropPlacement[]> = {};
  return {
    out,
    room(id: string, fn: (p: Props, r: TileRect) => void): void {
      const rect = rects[id];
      if (!rect) throw new Error(`[content] decorator: unknown room ${id}`);
      const p = new Props(ctx, id);
      fn(p, rect);
      out[id] = p.list;
    },
  };
}

/** Attach the hand-placed props to their rooms. */
export function withProps(rooms: RoomDef[], props: Record<string, PropPlacement[]>): RoomDef[] {
  return rooms.map((r) => (props[r.id] ? { ...r, props: props[r.id] } : r));
}

export const rectsOf = (rooms: RoomDef[]): Record<string, TileRect> => Object.fromEntries(rooms.map((r) => [r.id, r.rect]));

// ---------------------------------------------------------------------------------------------------------------------
// Decor kit (P-04). Pure helpers: each returns PropPlacement[] to concatenate into a room's props (or use dressRoom).
// ---------------------------------------------------------------------------------------------------------------------
/** choir_balcony / gothic_balustrade are not in the asset set yet; the town kit balcony wall stands in until they land. */
export const BALCONY_MODEL = kf('balcony-wall');
export const CHANDELIER_MODEL = ip('psx-dungeon', 'chandelier');
export const BANNER_MODEL = dg('banner_patternB_red');
const CHANDELIER_COLOR = 0xffb35a;
const WALL_ROT: Record<Side, number> = { n: 0, s: 180, w: 90, e: -90 };

/** Along-wall extent of a room side (GDD coordinates, inset 0.8 tiles from the corners). */
function wallRun(rect: TileRect, side: Side): [number, number] {
  const b = Props.inner(rect, 0.8);
  return side === 'n' || side === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
}

/** n evenly spaced along-wall positions across a side. */
function evenRun(rect: TileRect, side: Side, n: number): number[] {
  const [lo, hi] = wallRun(rect, side);
  if (n === 1) return [(lo + hi) / 2];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

/** Wall points (GDD x,z) for along-wall positions on one side. `inset` is metres from the wall line; door gaps are skipped. */
function wallPoints(rect: TileRect, side: Side, alongs: number[], inset: number, spans: DoorSpan[] = []): [number, number][] {
  const horizontal = side === 'n' || side === 's';
  const line: 'x' | 'z' = horizontal ? 'z' : 'x';
  const at = side === 'n' ? rect.z - 0.5 : side === 's' ? rect.z + rect.h - 0.5 : side === 'w' ? rect.x - 0.5 : rect.x + rect.w - 0.5;
  const face = side === 'n' || side === 'w' ? at + inset : at - inset;
  const out: [number, number][] = [];
  for (const along of alongs) {
    if (spans.some((s) => s.line === line && Math.abs(s.at - at) < 0.05 && along > s.lo - 0.6 && along < s.hi + 0.6)) continue;
    out.push(horizontal ? [along, face] : [face, along]);
  }
  return out;
}

export interface BalconyOpts { side?: Side; model?: string; spans?: DoorSpan[] }
/** `n` non-walkable balcony modules at height `y`, evenly spaced along one wall of `rect` (default north), facing into the room. */
export function balcony(rect: TileRect, y: number, n: number, opts: BalconyOpts = {}): PropPlacement[] {
  const side = opts.side ?? 'n';
  const model = opts.model ?? BALCONY_MODEL;
  return wallPoints(rect, side, evenRun(rect, side, n), WALL_FACE, opts.spans).map(([x, z]) => ({
    model, pos: shPt(x, z), y, rot: WALL_ROT[side], collide: true,
  }));
}

export interface ChandelierOpts { light?: boolean; color?: number }
/** Hung chandelier at (cx, cz), `y` metres up, with an amber point light (1.8 / 11 tiles) unless `light: false`. */
export function chandelier(cx: number, cz: number, y: number, opts: ChandelierOpts = {}): PropPlacement[] {
  const pl: PropPlacement = { model: CHANDELIER_MODEL, pos: shPt(cx, cz), y };
  if (opts.light !== false) pl.light = lt(opts.color ?? CHANDELIER_COLOR, 1.8, 11, true);
  return [pl];
}

export interface BannerOpts { y?: number; scale?: number; tint?: number; model?: string; spans?: DoorSpan[] }
/** Wall banners on one side at the given along-wall positions, on the wall centre line. */
export function banner(rect: TileRect, side: Side, positions: number[], opts: BannerOpts = {}): PropPlacement[] {
  const model = opts.model ?? BANNER_MODEL;
  return wallPoints(rect, side, positions, 0, opts.spans).map(([x, z]) => {
    const pl: PropPlacement = { model, pos: shPt(x, z), rot: WALL_ROT[side] };
    if (opts.y !== undefined) pl.y = opts.y;
    if (opts.scale !== undefined) pl.scale = opts.scale;
    if (opts.tint !== undefined) pl.tint = opts.tint;
    return pl;
  });
}

/** Per-room dressing recipe: balconies, hung chandeliers and banners in one call. */
export interface DressRecipe {
  spans?: DoorSpan[];
  balconies?: { side?: Side; y: number; n: number; model?: string }[];
  chandeliers?: { x: number; z: number; y: number; light?: boolean }[];
  banners?: { side: Side; at: number[]; y?: number; tint?: number }[];
}
export function dressRoom(rect: TileRect, r: DressRecipe): PropPlacement[] {
  return [
    ...(r.balconies ?? []).flatMap((b) => balcony(rect, b.y, b.n, { side: b.side, model: b.model, spans: r.spans })),
    ...(r.chandeliers ?? []).flatMap((c) => chandelier(c.x, c.z, c.y, { light: c.light })),
    ...(r.banners ?? []).flatMap((b) => banner(rect, b.side, b.at, { y: b.y, tint: b.tint, spans: r.spans })),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Vertical helpers (ENGINE_VERTICALITY §3, V3). Thin constructors for the height fields; all values are absolute metres
// and tile rects follow the same tile-corner convention as RoomDef.rect. Only read when DungeonDef.vertical is set.
// ---------------------------------------------------------------------------------------------------------------------
/** Default ceiling for vertical rooms (ENGINE_VERTICALITY §2 CEIL_NEW_DEFAULT). Absent `ceiling` keeps legacy 4 m geometry. */
export const TALL_CEIL_DEFAULT = 6;

/** Sets the clear height of a room above its highest floor (metres). Halls 12..30; defaults to 6. */
export const tall = (room: RoomDef, ceiling: number = TALL_CEIL_DEFAULT): RoomDef => ({ ...room, ceiling });

/** Raised floor area inside a room (absolute `y`). `rim` omitted = builder default ('rail'). */
export function plateau(rect: TileRect, y: number, rim?: HeightArea['rim'], id?: string): HeightArea {
  const out: HeightArea = { rect, y };
  if (rim !== undefined) out.rim = rim;
  if (id !== undefined) out.id = id;
  return out;
}

/** Stair strip along `axis`: `yFrom` at the min edge, `yTo` at the max edge (absolute). Treads come from the builder. */
export function stairs(rect: TileRect, axis: 'x' | 'z', yFrom: number, yTo: number, extra: Partial<SlopeDef> = {}): SlopeDef {
  return { kind: 'stairs', rect, axis, yFrom, yTo, ...extra };
}

/** Ramp strip along `axis`: linear from `yFrom` (min edge) to `yTo` (max edge). Grade limit VERT.MAX_GRADE (0.80). */
export function ramp(rect: TileRect, axis: 'x' | 'z', yFrom: number, yTo: number, extra: Partial<SlopeDef> = {}): SlopeDef {
  return { kind: 'ramp', rect, axis, yFrom, yTo, ...extra };
}

/** Dungeon-level lift platform. `stops` ascending absolute heights (>= 2). Mode defaults to 'call' in the runtime. */
export function lift(id: string, roomId: string, rect: TileRect, stops: number[], extra: Partial<LiftDef> = {}): LiftDef {
  return { id, roomId, rect, stops, ...extra };
}
