import { TILE_SIZE, type DungeonDef } from '../types/dungeons';

/**
 * Tile grid + base nav classification, PURE (no three.js): shared by DungeonBuilder and the node sims (dev/combat-sim/bigmap.mjs).
 *
 * `paintRoomTiles` / `computeWalls` are the room-to-tile and wall-edge steps of DungeonBuild.buildGrid, moved here verbatim.
 * `fillNavReference` is the original per-cell nav classification (the lattice with the 1 m cell centres on integer coordinates).
 * `fillNavFast` computes the SAME grid row-wise with typed-array fills: O(tiles) instead of O(cells x 12 tile lookups), which is
 * what makes a 4 km zone (4001 x 4001 cells) build in tens of milliseconds. bigmap.mjs asserts both agree cell for cell.
 */

const T = TILE_SIZE;

/** Rooms to tile indices (later rooms overwrite earlier ones, like the original loop). roomIdx must be W x H, filled with -1. */
export function paintRoomTiles(def: DungeonDef, roomIdx: Int16Array): void {
  const W = def.grid.w, H = def.grid.h;
  def.rooms.forEach((r, idx) => {
    for (let tz = r.rect.z; tz < r.rect.z + r.rect.h; tz++)
      for (let tx = r.rect.x; tx < r.rect.x + r.rect.w; tx++) {
        if (tx < 0 || tz < 0 || tx >= W || tz >= H) continue;
        roomIdx[tz * W + tx] = idx;
      }
  });
}

/**
 * Wall edges: an edge is a wall where the two sides belong to different rooms. Open-world (outdoor) zones are one connected
 * field: only the border towards solid ground is a wall. hWall is W x (H+1), vWall (W+1) x H.
 */
export function computeWalls(W: number, H: number, roomIdx: Int16Array, outdoor: boolean, hWall: Uint8Array, vWall: Uint8Array): void {
  const room = (i: number, j: number): number => (i < 0 || j < 0 || i >= W || j >= H ? -1 : roomIdx[j * W + i]);
  const differ = (a: number, b: number): boolean => (outdoor ? (a >= 0) !== (b >= 0) : a !== b);
  for (let j = 0; j <= H; j++)
    for (let i = 0; i < W; i++) hWall[j * W + i] = differ(room(i, j - 1), room(i, j)) ? 1 : 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i <= W; i++) vWall[j * (W + 1) + i] = differ(room(i - 1, j), room(i, j)) ? 1 : 0;
}

/** Tile queries the nav classification needs. */
export interface NavTiles {
  W: number;
  H: number;
  roomIdx: Int16Array;
  hWall: Uint8Array;
  vWall: Uint8Array;
}

const roomOf = (t: NavTiles, i: number, j: number): number => (i < 0 || j < 0 || i >= t.W || j >= t.H ? -1 : t.roomIdx[j * t.W + i]);
const hasH = (t: NavTiles, i: number, j: number): boolean => i >= 0 && i < t.W && j >= 0 && j <= t.H && t.hWall[j * t.W + i] === 1;
const hasV = (t: NavTiles, i: number, j: number): boolean => j >= 0 && j < t.H && i >= 0 && i <= t.W && t.vWall[j * (t.W + 1) + i] === 1;

/** The same three tile queries as callbacks (the world decor host exposes them this way). */
export interface TileQuery {
  room(i: number, j: number): number;
  hasH(i: number, j: number): boolean;
  hasV(i: number, j: number): boolean;
}

export const tileQueryOf = (t: NavTiles): TileQuery => ({
  room: (i, j) => roomOf(t, i, j),
  hasH: (i, j) => hasH(t, i, j),
  hasV: (i, j) => hasV(t, i, j),
});

/**
 * Is nav cell (cx, cz) walkable by layout alone (no props, trees or barriers)? The nav lattice has one cell per metre with the cell
 * centres on integer world coordinates, so cell cx sits on tile column floor(cx / T): cells strictly inside a tile follow the tile,
 * cells on a tile edge need both neighbours walkable and no wall on that edge, cells on a tile corner need all four tiles walkable
 * and no wall arm touching. This is the exact per-cell rule of the original buildGrid loop.
 */
export function baseNavCell(q: TileQuery, cx: number, cz: number): boolean {
  const mx = cx % T, mz = cz % T;
  const i = Math.floor(cx / T), j = Math.floor(cz / T);
  if (mx !== 0 && mz !== 0) return q.room(i, j) >= 0;
  if (mx === 0 && mz !== 0) return !q.hasV(i, j) && q.room(i - 1, j) >= 0 && q.room(i, j) >= 0;
  if (mz === 0 && mx !== 0) return !q.hasH(i, j) && q.room(i, j - 1) >= 0 && q.room(i, j) >= 0;
  return !q.hasH(i, j) && !q.hasH(i - 1, j) && !q.hasV(i, j) && !q.hasV(i, j - 1) &&
    q.room(i - 1, j - 1) >= 0 && q.room(i, j - 1) >= 0 && q.room(i - 1, j) >= 0 && q.room(i, j) >= 0;
}

export interface NavCells {
  cols: number;
  rows: number;
  cells: Uint8Array;
}

export interface WalkBounds { minX: number; minZ: number; maxX: number; maxZ: number }

/** Original (slow) classification: every cell 0..W*T x 0..H*T through baseNavCell. Returns the walkable cell bounds. */
export function fillNavReference(t: NavTiles, nav: NavCells): WalkBounds {
  const b: WalkBounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  const q = tileQueryOf(t);
  for (let cz = 0; cz <= t.H * T; cz++)
    for (let cx = 0; cx <= t.W * T; cx++) {
      if (!baseNavCell(q, cx, cz)) continue;
      if (cx < nav.cols && cz < nav.rows) nav.cells[cz * nav.cols + cx] = 1;
      if (cx < b.minX) b.minX = cx;
      if (cz < b.minZ) b.minZ = cz;
      if (cx > b.maxX) b.maxX = cx;
      if (cz > b.maxZ) b.maxZ = cz;
    }
  return b;
}

/**
 * Same result as fillNavReference, computed per tile: the (T-1)^2 interior block of each walkable tile, then the edge cells
 * between two walkable tiles, then the corner cells. `nav.cells` must be zero-filled. Returns the walkable cell bounds.
 */
export function fillNavFast(t: NavTiles, nav: NavCells): WalkBounds {
  const { W, H } = t;
  const cols = nav.cols, cells = nav.cells;
  const b: WalkBounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  const note = (x0: number, z0: number, x1: number, z1: number): void => {
    if (x0 < b.minX) b.minX = x0;
    if (z0 < b.minZ) b.minZ = z0;
    if (x1 > b.maxX) b.maxX = x1;
    if (z1 > b.maxZ) b.maxZ = z1;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const walk = roomOf(t, i, j) >= 0;
      if (walk) {
        // interior cells of the tile
        for (let k = 1; k < T; k++) cells.fill(1, (j * T + k) * cols + i * T + 1, (j * T + k) * cols + i * T + T);
        note(i * T + 1, j * T + 1, i * T + T - 1, j * T + T - 1);
        // west edge (vertical line x = i*T): needs the western neighbour and no wall
        if (i > 0 && roomOf(t, i - 1, j) >= 0 && !hasV(t, i, j)) {
          for (let k = 1; k < T; k++) cells[(j * T + k) * cols + i * T] = 1;
          note(i * T, j * T + 1, i * T, j * T + T - 1);
        }
        // north edge (horizontal line z = j*T)
        if (j > 0 && roomOf(t, i, j - 1) >= 0 && !hasH(t, i, j)) {
          cells.fill(1, j * T * cols + i * T + 1, j * T * cols + i * T + T);
          note(i * T + 1, j * T, i * T + T - 1, j * T);
        }
      }
    }
  }
  // tile corners (vertices) 0..W x 0..H: all four tiles walkable and no wall arm touching
  for (let j = 1; j < H; j++)
    for (let i = 1; i < W; i++) {
      if (roomOf(t, i - 1, j - 1) < 0 || roomOf(t, i, j - 1) < 0 || roomOf(t, i - 1, j) < 0 || roomOf(t, i, j) < 0) continue;
      if (hasH(t, i, j) || hasH(t, i - 1, j) || hasV(t, i, j) || hasV(t, i, j - 1)) continue;
      cells[j * T * cols + i * T] = 1;
      note(i * T, j * T, i * T, j * T);
    }
  return b;
}
