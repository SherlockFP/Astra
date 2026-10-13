/**
 * Heightfield: pure dungeon height model for vertical dungeons (docs/ENGINE_VERTICALITY.md §2-§4). OWNER: world (V1).
 *
 * NO three.js import: `node tools/*.mjs` may import this file. Everything is a pure function of the DungeonDef plus the
 * `tileRoom` callback (same on every peer, no RNG). Units: metres, Y up. Zone cells are 2 m (half a tile); a world point
 * (x, z) lives in cell (floor(x / 2), floor(z / 2)) and in tile (floor(x / 4), floor(z / 4)).
 *
 * Only the pieces that V1 owns are here: constants, flags, the cell grid with its floor resolution order (§4 steps 1-5),
 * ceilings, slopes (analytic), lifts (data only; motion lives in Lifts.ts, V5) and groundY / ceilingY / flagsAt / killY.
 * Rim flags (§5.3, LOW / LEDGE / RAIL) are NavGrid's job (V2) and are not set here.
 */
import type { DungeonDef, LiftDef, RoomDef, SlopeDef, TileRect } from '../types/dungeons';

/** Mirrors TILE_SIZE of src/types/dungeons.ts (kept local so this module stays importable from plain node). */
const TILE = 4;
/** One zone cell in metres (half a tile). */
const CELL_M = TILE / 2;

/** Tuning constants (§2). Every number lives in this one table. */
export const VERT = {
  STEP_UP: 0.45,        // max rise between adjacent 1 m cells / per actor step on flat ground (CM §13)
  RAMP_PAIR: 0.85,      // A* allows this rise between two cells when either is a SLOPE cell
  AIR_STEP: 0.25,       // airborne feet may clip this far above a new floor and still land on it
  MAX_GRADE: 0.80,      // ramp slope limit (m rise per m run); validator error above
  TREAD_RISE: 0.28,     // stairs: treads = max(2, ceil(|dy| / TREAD_RISE)) — identical to TownBuilder.treadCount
  TREAD_RISE_MAX: 0.30, // validator
  TREAD_DEPTH_MIN: 0.45,// validator warning (run / treads)
  TOL_MELEE: 2.5,       // combat height gate (CM §13): |feetY − planeY| ≤ this
  LOW_RAIL: 1.2,        // projectiles/camera rays pass over LOW cells above floor + this
  CEIL_LEGACY: 4.0,     // wall piece height / legacy geometry (rock mass sits at 3.86)
  CEIL_NEW_DEFAULT: 6,  // kit tall() helper default
  CEIL_MIN: 3.0,        // validator: ceiling − highest floor in room
  HEAD_H: 2.4,          // jump head clearance uses actor.height
  FALL_FREE: 4.0,       // landing drop that costs nothing (m)
  FALL_DMG_PER_M: 0.03, // of max HP per metre beyond FALL_FREE, cap 0.24
  FALL_RESPAWN_DROP: 12,// drop beyond this = treated as a fall into the void
  VOID_KILL_BELOW: 2.2, // metres under the void rim at which the fall triggers
  VOID_DMG_FRAC: 0.25,  // CM §13: "fall = 25 % max HP"
  SAFE_BACK_SEC: 0.6,   // respawn uses a safe sample at least this old
  SAFE_HIST_SEC: 4,
  SAFE_EDGE_PAD: 1.5,   // a sample is "safe" only if no VOID/LEDGE cell within this radius
  LIFT_SPEED: 2.5, LIFT_DWELL: 4,
  Y_MIN: -60, Y_MAX: 120, // validator range (net clamps −100..300)
  CAM_CEIL_MARGIN: 0.4, CAM_MIN_CEIL_PITCH: 0.10,
} as const;

/** Per-2 m-cell flags (§4). */
export const F = { VOID: 1, SLOPE: 2, LOW: 4, LIFT: 8, LEDGE: 16, RAIL: 32 } as const;

/** Analytic stair / ramp strip in world metres. */
export interface BuiltSlope {
  x0: number; z0: number; x1: number; z1: number;
  axis: 'x' | 'z';
  yFrom: number; yTo: number;   // absolute, at the MIN edge / MAX edge on `axis`
  kind: 'stairs' | 'ramp';
  treads: number;               // stairs: tread count; ramp: 0
}

/** Lift platform in world metres. `y` and `stopIdx` are dynamic state (advanced by Lifts.ts). */
export interface BuiltLift {
  def: LiftDef;
  x0: number; z0: number; x1: number; z1: number;
  y: number;
  stopIdx: number;
  dir: 1 | -1;
  dwellLeft: number;
}

export interface Heightfield {
  W: number; H: number;                 // tiles
  zw: number; zh: number;               // 2 m cells = W*2, H*2
  floor2: Float32Array;                 // static floor per 2 m cell (void cell = rim − depth; lift cell = lowest stop)
  flags2: Uint8Array;                   // per 2 m cell: F.VOID | F.SLOPE | F.LIFT (LOW / LEDGE / RAIL set by NavGrid)
  roomOf2: Int16Array;                  // per 2 m cell: index into def.rooms, -1 = no room (solid)
  rim2: Float32Array;                   // per 2 m cell: rim height of a VOID cell (0 elsewhere)
  slopes: BuiltSlope[];                 // analytic strips (world metres)
  lifts: BuiltLift[];                   // lift data (world metres)
  ceilTile: Float32Array;               // per TILE: absolute ceiling Y (Infinity for legacy / openAir / no room nearby)
  roomTop: Float32Array;                // per room index: absolute ceilY (Infinity for legacy / openAir)
  groundY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  flagsAt(x: number, z: number): number;
  killY(x: number, z: number): number;  // y below which a falling actor at (x,z) has "fallen"
}

/** Treads of a staircase: at most ~0.28 m of rise each. Moved verbatim from TownBuilder. */
export function treadCount(yFrom: number, yTo: number): number {
  return Math.max(2, Math.ceil(Math.abs(yTo - yFrom) / VERT.TREAD_RISE));
}

/**
 * Top of tread i (0 = first tread from the lo end). The tread on the higher level is flush with that level, so a staircase that
 * leaves a terrace starts at the deck height instead of 0.25 m below its lip. groundY walks these same tops.
 * Moved verbatim from TownBuilder.
 */
export function treadTop(yFrom: number, yTo: number, i: number, n: number): number {
  const dy = yTo - yFrom;
  const k = dy < 0 ? i / n : (i + 1) / n;
  return Math.max(0.06, yFrom + dy * k);
}

/** Half-open cell index range [zi0, zi1) x [zj0, zj1) covered by a tile rect (rect edges sit on 0.5-tile lines). */
function cellRange(r: TileRect): [number, number, number, number] {
  return [Math.floor(r.x * 2), Math.floor(r.z * 2), Math.floor((r.x + r.w) * 2), Math.floor((r.z + r.h) * 2)];
}

/** Cell indices of a zone (rect, or circle inscribed in the rect), clipped to the grid. */
function zoneCells(zone: { rect: TileRect; shape?: 'rect' | 'circle' }, zw: number, zh: number): number[] {
  const [zi0, zj0, zi1, zj1] = cellRange(zone.rect);
  const out: number[] = [];
  const circle = zone.shape === 'circle';
  const cx = zone.rect.x + zone.rect.w / 2, cz = zone.rect.z + zone.rect.h / 2, rad = zone.rect.w / 2;
  for (let zj = Math.max(0, zj0); zj < Math.min(zh, zj1); zj++) {
    for (let zi = Math.max(0, zi0); zi < Math.min(zw, zi1); zi++) {
      if (circle) {
        const dx = (zi + 0.5) / 2 - cx, dz = (zj + 0.5) / 2 - cz;
        if (dx * dx + dz * dz > rad * rad) continue;
      }
      out.push(zj * zw + zi);
    }
  }
  return out;
}

/**
 * Build the heightfield of a dungeon. Returns null when `def.vertical` is not set (legacy path, nothing is computed).
 * `tileRoom(i, j)` returns the index into `def.rooms` owning tile (i, j), or -1 / out of range for solid rock.
 *
 * Resolution order for a 2 m cell (identical in builder, nav, validator and groundY):
 *  1. floorY of its room (default 0)
 *  2. heightAreas in array order (later wins)
 *  3. zones in array order: bridge/dais with y = deck height; void/pit/lava with fall = VOID (rim − depth, see below)
 *  4. slopes: cells fully inside get F.SLOPE (the height is analytic)
 *  5. lifts: cells inside the pad get F.LIFT and floor = lowest stop
 *  6. rims (LOW / LEDGE / RAIL): NavGrid, not here
 */
export function buildHeightfield(def: DungeonDef, tileRoom: (i: number, j: number) => number): Heightfield | null {
  if (!def.vertical) return null;
  const W = def.grid.w, H = def.grid.h;
  const zw = W * 2, zh = H * 2, n2 = zw * zh;
  const rooms: RoomDef[] = def.rooms;
  const nRooms = rooms.length;
  const roomIndex = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= W || j >= H) return -1;
    const r = tileRoom(i, j);
    return r >= 0 && r < nRooms ? r : -1;
  };

  const floor2 = new Float32Array(n2);
  const flags2 = new Uint8Array(n2);
  const roomOf2 = new Int16Array(n2).fill(-1);
  const rim2 = new Float32Array(n2);
  const tileRoomArr = new Int16Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) tileRoomArr[j * W + i] = roomIndex(i, j);
  for (let zj = 0; zj < zh; zj++) {
    for (let zi = 0; zi < zw; zi++) {
      const ri = tileRoomArr[(zj >> 1) * W + (zi >> 1)];
      roomOf2[zj * zw + zi] = ri;
    }
  }

  // 1. room base floors
  for (let c = 0; c < n2; c++) {
    const ri = roomOf2[c];
    if (ri >= 0) floor2[c] = rooms[ri]!.floorY ?? 0;
  }

  // 2. per-area floors (room order, then array order; later wins)
  const forEachCell = (r: TileRect, fn: (c: number) => void): void => {
    const [zi0, zj0, zi1, zj1] = cellRange(r);
    for (let zj = Math.max(0, zj0); zj < Math.min(zh, zj1); zj++) {
      for (let zi = Math.max(0, zi0); zi < Math.min(zw, zi1); zi++) fn(zj * zw + zi);
    }
  };
  for (const room of rooms) {
    for (const area of room.heightAreas ?? []) {
      const y = area.y;
      forEachCell(area.rect, (c) => { floor2[c] = y; });
    }
  }

  // 3. zones in array order. Deck zones (bridge/dais with y) reopen cells; fall zones mark VOID cells.
  const voidDepth = new Float32Array(n2); // > 0 ⇒ VOID cell, value = depth below rim
  for (const room of rooms) {
    for (const zone of room.zones ?? []) {
      const cells = zoneCells(zone, zw, zh);
      if ((zone.kind === 'bridge' || zone.kind === 'dais') && zone.y !== undefined) {
        const y = zone.y;
        for (const c of cells) { floor2[c] = y; voidDepth[c] = 0; }
      } else if ((zone.kind === 'void' || zone.kind === 'pit' || zone.kind === 'lava') && zone.fall) {
        const depth = zone.depth ?? 9;
        for (const c of cells) voidDepth[c] = depth;
      }
      // legacy void/pit/lava without `fall` stays a solid hole handled by ZoneDef.blocked (nav), floor untouched.
    }
  }
  // VOID cells: rim = max floor of the 4 non-void, in-room neighbours (fallback: own floor); floor = rim − depth.
  const rimTmp = new Float32Array(n2);
  for (let c = 0; c < n2; c++) {
    if (!(voidDepth[c]! > 0) || roomOf2[c]! < 0) continue;
    const zi = c % zw, zj = (c - zi) / zw;
    let rim = -Infinity;
    const nb: [number, number][] = [[zi - 1, zj], [zi + 1, zj], [zi, zj - 1], [zi, zj + 1]];
    for (const [ni, nj] of nb) {
      if (ni < 0 || nj < 0 || ni >= zw || nj >= zh) continue;
      const nc = nj * zw + ni;
      if (roomOf2[nc]! < 0 || voidDepth[nc]! > 0) continue;
      if (floor2[nc]! > rim) rim = floor2[nc]!;
    }
    rimTmp[c] = rim === -Infinity ? floor2[c]! : rim;
  }
  for (let c = 0; c < n2; c++) {
    if (!(voidDepth[c]! > 0) || roomOf2[c]! < 0) continue;
    rim2[c] = rimTmp[c]!;
    floor2[c] = rimTmp[c]! - voidDepth[c]!;
    flags2[c] |= F.VOID;
  }

  // 4. slopes (analytic) — flags only on fully covered cells
  const slopes: BuiltSlope[] = [];
  for (const room of rooms) {
    for (const s of room.slopes ?? []) {
      slopes.push(builtSlope(s));
      forEachCell(s.rect, (c) => { flags2[c] |= F.SLOPE; });
    }
  }

  // 5. lifts (dungeon-level): cells get F.LIFT, floor = lowest stop
  const lifts: BuiltLift[] = [];
  for (const def2 of def.lifts ?? []) {
    const stops = def2.stops.length ? def2.stops : [0];
    const start = Math.min(stops.length - 1, Math.max(0, def2.start ?? 0));
    lifts.push({
      def: def2,
      x0: def2.rect.x * TILE, z0: def2.rect.z * TILE,
      x1: (def2.rect.x + def2.rect.w) * TILE, z1: (def2.rect.z + def2.rect.h) * TILE,
      y: stops[start]!, stopIdx: start, dir: 1, dwellLeft: 0,
    });
    const low = Math.min(...stops);
    forEachCell(def2.rect, (c) => { flags2[c] |= F.LIFT; floor2[c] = low; });
  }

  // ceilings: room top = highest floor of the room (cells, slope ends, lift stops) + its ceiling clearance
  const roomMax = new Float64Array(nRooms).fill(-Infinity);
  for (let c = 0; c < n2; c++) {
    const ri = roomOf2[c]!;
    if (ri >= 0 && floor2[c]! > roomMax[ri]!) roomMax[ri] = floor2[c]!;
  }
  rooms.forEach((room, ri) => {
    for (const s of room.slopes ?? []) roomMax[ri] = Math.max(roomMax[ri]!, s.yFrom, s.yTo);
    for (const l of def.lifts ?? []) if (l.roomId === room.id) for (const st of l.stops) roomMax[ri] = Math.max(roomMax[ri]!, st);
  });
  const roomTop = new Float32Array(nRooms);
  for (let ri = 0; ri < nRooms; ri++) {
    const room = rooms[ri]!;
    const top = room.openAir || room.ceiling === undefined ? Infinity : (Number.isFinite(roomMax[ri]!) ? roomMax[ri]! : 0) + room.ceiling;
    roomTop[ri] = top;
  }
  // solid tiles: max of the rooms within 2 tiles (Infinity when none is near)
  const ceilTile = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const own = tileRoomArr[j * W + i]!;
      if (own >= 0) { ceilTile[j * W + i] = roomTop[own]!; continue; }
      let top = -Infinity, found = false;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const ri = tileRoomArr[nj * W + ni]!;
        if (ri < 0) continue;
        found = true;
        top = Math.max(top, roomTop[ri]!);
      }
      ceilTile[j * W + i] = found ? top : Infinity;
    }
  }

  // global floor minimum over room cells (killY fallback)
  let globalMin = Infinity;
  for (let c = 0; c < n2; c++) if (roomOf2[c]! >= 0 && !(flags2[c]! & F.VOID) && floor2[c]! < globalMin) globalMin = floor2[c]!;
  if (!Number.isFinite(globalMin)) globalMin = 0;

  const cellOf = (x: number, z: number): number => {
    const zi = Math.floor(x / CELL_M), zj = Math.floor(z / CELL_M);
    if (zi < 0 || zj < 0 || zi >= zw || zj >= zh) return -1;
    return zj * zw + zi;
  };

  const groundY = (x: number, z: number): number => {
    const c = cellOf(x, z);
    if (c < 0) return 0;
    if (flags2[c]! & F.LIFT) {
      for (const l of lifts) if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return l.y;
    }
    if (flags2[c]! & F.SLOPE) {
      let y: number | null = null;
      for (const s of slopes) {
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        const span = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
        const along = s.axis === 'z' ? z - s.z0 : x - s.x0;
        const u = Math.min(1, Math.max(0, along / Math.max(0.001, span)));
        if (s.kind === 'ramp') {
          y = s.yFrom + (s.yTo - s.yFrom) * u;
        } else {
          // stepped like the treads that are drawn (same rule as TownBuilder.groundY)
          const nT = s.treads;
          const i = Math.min(nT - 1, Math.max(0, Math.floor(u * nT)));
          y = treadTop(s.yFrom, s.yTo, i, nT);
        }
      }
      if (y !== null) return y;
    }
    if (roomOf2[c]! < 0) return 0;
    return floor2[c]!;
  };

  const flagsAt = (x: number, z: number): number => {
    const c = cellOf(x, z);
    return c < 0 ? 0 : flags2[c]!;
  };

  const ceilingY = (x: number, z: number): number => {
    const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE);
    if (ti < 0 || tj < 0 || ti >= W || tj >= H) return Infinity;
    return ceilTile[tj * W + ti]!;
  };

  const killY = (x: number, z: number): number => {
    const c = cellOf(x, z);
    if (c >= 0 && flags2[c]! & F.VOID) return rim2[c]! - VERT.VOID_KILL_BELOW;
    return globalMin - VERT.FALL_RESPAWN_DROP;
  };

  return {
    W, H, zw, zh, floor2, flags2, roomOf2, rim2, slopes, lifts, ceilTile, roomTop,
    groundY, ceilingY, flagsAt, killY,
  };
}

/** World-metre form of a SlopeDef (tile rect → metres). */
function builtSlope(s: SlopeDef): BuiltSlope {
  return {
    x0: s.rect.x * TILE, z0: s.rect.z * TILE,
    x1: (s.rect.x + s.rect.w) * TILE, z1: (s.rect.z + s.rect.h) * TILE,
    axis: s.axis, yFrom: s.yFrom, yTo: s.yTo, kind: s.kind,
    treads: s.kind === 'stairs' ? treadCount(s.yFrom, s.yTo) : 0,
  };
}
