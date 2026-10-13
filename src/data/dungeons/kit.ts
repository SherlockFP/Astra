import { RNG, hashString } from '../../core/utils';
import type { DoorDef, FloorStyle, PackDef, PropPlacement, RoomDef, TileRect, WallStyle, ZoneDef } from '../../types/dungeons';

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

export function pack(
  id: string, roomId: string, cx: number, cz: number, forces: number, members: MemberTuple[],
  extra: Partial<Omit<PackDef, 'id' | 'roomId' | 'center' | 'members' | 'forces'>> = {},
): PackDef {
  const out: PackDef = {
    id, roomId, center: pt(cx, cz), forces,
    members: members.map(([enemyId, ox, oz]) => ({ enemyId, offset: [ox, oz] as [number, number] })),
    ...extra,
  };
  if (extra.patrol) out.patrol = extra.patrol.map(([x, z]) => pt(x, z));
  return out;
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
