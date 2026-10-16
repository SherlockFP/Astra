/**
 * Open-world exploration (fog of war). One bit per 8 m cell, kept per character in `save.flags['map.fog.<zoneId>']` (base64 of the
 * packed bits, 5 KB for Sisli Vadi), so it survives a reload and is never shared. Cells within REVEAL_M of the player are revealed.
 * The fog picture (`fogCanvas`) is built from the bits, one canvas pixel per metre like the atlas, and rebuilt only when cells change.
 * Saving is throttled to one persist() per SAVE_EVERY_MS. OWNER: hud module (map rendering).
 */
import { G } from '../../game/G';
import type { DungeonDef } from '../../types/dungeons';
import { TILE_SIZE } from '../../types/dungeons';

/** Cell edge (m) of the fog bits. */
export const FOG_CELL_M = 8;
/** Reveal radius (m) around the player. */
export const REVEAL_M = 14;
const SAVE_EVERY_MS = 10000;
/** Unexplored ground: a cool dark veil, so the terrain and its roads still read through it. */
const FOG_FILL = 'rgba(14,17,22,0.74)';

export interface Exploration {
  id: string;
  widthM: number;
  heightM: number;
  cols: number;
  rows: number;
  bits: Uint8Array;
  /** One pixel per cell; a set cell is opaque (it cuts the fog out). */
  small: HTMLCanvasElement;
  /** The fog picture at `fullPx` (one pixel per metre times the atlas scale); rebuilt when `dirty`. */
  fog: HTMLCanvasElement | null;
  fogPx: number;
  dirty: boolean;
  /** Land cells (centre inside a room), and the revealed ones among them. */
  landCells: number;
  pending: boolean;
  savedAt: number;
}

const store = new Map<string, Exploration>();

const keyOf = (id: string): string => `map.fog.${id}`;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(s);
}

function fromB64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function makeSmall(cols: number, rows: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  return c;
}

/** The exploration state of a zone: loaded from the character's flags on first use. */
export function explorationFor(def: DungeonDef): Exploration {
  const hit = store.get(def.id);
  if (hit) return hit;
  const W = def.grid.w * TILE_SIZE, H = def.grid.h * TILE_SIZE;
  const cols = Math.ceil(W / FOG_CELL_M), rows = Math.ceil(H / FOG_CELL_M);
  const n = cols * rows;
  const bits = new Uint8Array(Math.ceil(n / 8));
  const raw = G.character?.save.flags[keyOf(def.id)];
  if (typeof raw === 'string') {
    const dec = fromB64(raw);
    if (dec && dec.length === bits.length) bits.set(dec);
  }
  // land cells: a cell whose centre lies in a room
  const tw = def.grid.w, th = def.grid.h;
  const tileRoom = new Uint8Array(tw * th);
  for (const room of def.rooms)
    for (let j = Math.max(0, room.rect.z); j < Math.min(th, room.rect.z + room.rect.h); j++)
      for (let i = Math.max(0, room.rect.x); i < Math.min(tw, room.rect.x + room.rect.w); i++) tileRoom[j * tw + i] = 1;
  let landCells = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * FOG_CELL_M, z = (r + 0.5) * FOG_CELL_M;
      const ti = Math.floor(x / TILE_SIZE), tj = Math.floor(z / TILE_SIZE);
      if (ti < tw && tj < th && tileRoom[tj * tw + ti]) landCells++;
    }
  const small = makeSmall(cols, rows);
  const sg = small.getContext('2d');
  if (sg) {
    const img = sg.createImageData(cols, rows);
    for (let i = 0; i < n; i++) if (bits[i >> 3] & (1 << (i & 7))) img.data[i * 4 + 3] = 255;
    sg.putImageData(img, 0, 0);
  }
  const ex: Exploration = { id: def.id, widthM: W, heightM: H, cols, rows, bits, small, fog: null, fogPx: 0, dirty: true, landCells, pending: false, savedAt: 0 };
  store.set(def.id, ex);
  return ex;
}

const cellSet = (ex: Exploration, c: number, r: number): boolean => {
  const i = r * ex.cols + c;
  return (ex.bits[i >> 3] & (1 << (i & 7))) !== 0;
};

/** True when the cell under (x, z) metres has been explored. */
export function seenAt(def: DungeonDef, x: number, z: number): boolean {
  const ex = explorationFor(def);
  const c = Math.floor(x / FOG_CELL_M), r = Math.floor(z / FOG_CELL_M);
  if (c < 0 || r < 0 || c >= ex.cols || r >= ex.rows) return false;
  return cellSet(ex, c, r);
}

/** Share of the land cells explored, 0..100. */
export function exploredPct(def: DungeonDef): number {
  const ex = explorationFor(def);
  let seen = 0;
  const n = ex.cols * ex.rows;
  for (let i = 0; i < n; i++) if (ex.bits[i >> 3] & (1 << (i & 7))) seen++;
  return ex.landCells ? Math.min(100, Math.round((seen / ex.landCells) * 1000) / 10) : 0;
}

/** Reveals the cells around (x, z). Returns true when a new cell was revealed. */
export function revealAround(def: DungeonDef, x: number, z: number): boolean {
  const ex = explorationFor(def);
  const sg = ex.small.getContext('2d');
  const c0 = Math.max(0, Math.floor((x - REVEAL_M) / FOG_CELL_M)), c1 = Math.min(ex.cols - 1, Math.floor((x + REVEAL_M) / FOG_CELL_M));
  const r0 = Math.max(0, Math.floor((z - REVEAL_M) / FOG_CELL_M)), r1 = Math.min(ex.rows - 1, Math.floor((z + REVEAL_M) / FOG_CELL_M));
  let changed = false;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (cellSet(ex, c, r)) continue;
      if (Math.hypot((c + 0.5) * FOG_CELL_M - x, (r + 0.5) * FOG_CELL_M - z) > REVEAL_M) continue;
      const i = r * ex.cols + c;
      ex.bits[i >> 3] |= 1 << (i & 7);
      if (sg) {
        sg.fillStyle = '#000';
        sg.fillRect(c, r, 1, 1);
      }
      changed = true;
    }
  if (changed) {
    ex.dirty = true;
    ex.pending = true;
  }
  return changed;
}

/** Per-frame step of the exploration: reveal around the player, save when due. Cheap when nothing changes. */
export function tickExploration(def: DungeonDef, x: number, z: number, now: number): void {
  revealAround(def, x, z);
  const ex = explorationFor(def);
  if (ex.pending && now - ex.savedAt > SAVE_EVERY_MS) {
    const ch = G.character;
    if (ch) {
      ch.save.flags[keyOf(def.id)] = toB64(ex.bits);
      try {
        ch.persist();
      } catch (err) {
        console.warn('[map] fog save failed', err);
      }
    }
    ex.pending = false;
    ex.savedAt = now;
  }
}

/**
 * The fog picture at `pxPerM` canvas pixels per metre (the atlas scale): dark where unexplored, clear where explored. Rebuilt only when
 * the bits changed; the same canvas is returned otherwise.
 */
export function fogCanvasFor(def: DungeonDef, pxPerM: number): HTMLCanvasElement {
  const ex = explorationFor(def);
  const pw = Math.round(ex.widthM * pxPerM), ph = Math.round(ex.heightM * pxPerM);
  if (!ex.fog || ex.fogPx !== pxPerM || ex.fog.width !== pw || ex.fog.height !== ph) {
    ex.fog = document.createElement('canvas');
    ex.fog.width = pw;
    ex.fog.height = ph;
    ex.fogPx = pxPerM;
    ex.dirty = true;
  }
  if (ex.dirty) {
    const g = ex.fog.getContext('2d');
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, pw, ph);
      g.fillStyle = FOG_FILL;
      g.fillRect(0, 0, pw, ph);
      g.globalCompositeOperation = 'destination-out';
      g.imageSmoothingEnabled = true;
      g.drawImage(ex.small, 0, 0, pw, ph);
      g.globalCompositeOperation = 'source-over';
    }
    ex.dirty = false;
  }
  return ex.fog;
}
