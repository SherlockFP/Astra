/**
 * Persistent HUD layout (hud module): frame offsets and scales written by the edit mode, extra bar visibility, the grid
 * toggle and the extra-bar lock. One localStorage key (v2). Every access is wrapped in try/catch: a blocked or corrupt store
 * falls back to the defaults and the HUD renders the same without it.
 */

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
/**
 * v2 (§2.13): the frame anatomy changed (centre cluster, 12-slot grid, meter window), so the v1 offsets are migrated once
 * (see `fromV1`) and the v1 key is never written or removed. Only v2 is written from here on.
 */
const KEY = 'efsun.uiLayout.v2';
const OLD_KEY = 'efsun.uiLayout.v1';

/**
 * Skin stamp of the stored layout. Offsets are deltas from each frame's default spot (CSS), so when the defaults moved
 * (retail ElvUI layout, docs/UI_WOW_CLASSIC.md §3) the offsets of the moved frames would land somewhere else. A v2 layout
 * without this stamp keeps its grid / lock / extra-bar choices and the frames that did not move, and drops the offsets of
 * SKIN_MOVED_FRAMES once; the stamp is written with every save.
 */
const SKIN = 3;
const SKIN_MOVED_FRAMES = ['player', 'party', 'minions', 'target', 'minimap', 'tracker', 'bottom', 'corner', 'bar2', 'bar3'];

/** An offset that is still the default spot (no drag, no scale): the only kind a default-generation change may drop. */
function isDefaultOffset(o: FrameOffset | undefined): boolean {
  return !o || (o.x === 0 && o.y === 0 && o.s === 1);
}

/** v1 frames whose offsets carry over. bottom, player, buffs, target, meter and corner changed anatomy and are dropped. */
const V1_KEPT_FRAMES = ['boss', 'minimap', 'combo', 'chat', 'loot', 'party', 'bar2', 'bar3'];
/** v1 frame ids that were renamed in v2. */
const V1_RENAMED_FRAMES: Record<string, string> = { mplus: 'tracker' };

/**
 * Offset of one frame. `x` / `y` are fractions of the window size (screen px / innerWidth | innerHeight), so the
 * layout keeps its place when the window or resolution changes. `s` is the scale (SCALE_MIN..SCALE_MAX).
 */
export interface FrameOffset {
  x: number;
  y: number;
  s: number;
}

export interface UiLayout {
  v: 2;
  /** 8 px grid snapping while dragging in the layout editor. */
  grid: boolean;
  /** Extra action bars are locked: slot contents cannot be dragged out or cleared with a right click. */
  locked: boolean;
  /** Extra bar visibility by bar id ('bar2', 'bar3'). */
  bars: Record<string, boolean>;
  /** Frame offsets by frame id (see EditMode.ts). */
  frames: Record<string, FrameOffset>;
  /** Default-layout generation the offsets belong to (see SKIN). Written by writeLayout; absent on older stores. */
  skin?: number;
}

let cache: UiLayout | null = null;

function defaults(): UiLayout {
  return { v: 2, grid: true, locked: false, bars: {}, frames: {} };
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeBars(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === 'object') {
    for (const [k, on] of Object.entries(v as Record<string, unknown>)) out[k] = on === true;
  }
  return out;
}

function sanitizeFrames(v: unknown): Record<string, FrameOffset> {
  const out: Record<string, FrameOffset> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    out[k] = {
      x: Math.max(-1, Math.min(1, finite(o.x, 0))),
      y: Math.max(-1, Math.min(1, finite(o.y, 0))),
      s: Math.max(SCALE_MIN, Math.min(SCALE_MAX, finite(o.s, 1))),
    };
  }
  return out;
}

function parseObject(raw: string): Record<string, unknown> | null {
  const p: unknown = JSON.parse(raw);
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
}

/** A stored v2 layout. */
function fromV2(p: Record<string, unknown>): UiLayout {
  const l = defaults();
  l.grid = p.grid !== false;
  l.locked = p.locked === true;
  l.bars = sanitizeBars(p.bars);
  l.frames = sanitizeFrames(p.frames);
  if (p.skin !== SKIN) for (const id of SKIN_MOVED_FRAMES) if (isDefaultOffset(l.frames[id])) delete l.frames[id];
  return l;
}

/** One-time migration of a stored v1 layout: keeps the grid, lock and bar visibility, and the frames of V1_KEPT_FRAMES. */
function fromV1(p: Record<string, unknown>): UiLayout {
  const l = defaults();
  l.grid = p.grid !== false;
  l.locked = p.locked === true;
  l.bars = sanitizeBars(p.bars);
  const frames = sanitizeFrames(p.frames);
  for (const id of V1_KEPT_FRAMES) if (frames[id]) l.frames[id] = frames[id];
  for (const [from, to] of Object.entries(V1_RENAMED_FRAMES)) if (frames[from]) l.frames[to] = frames[from];
  for (const id of SKIN_MOVED_FRAMES) delete l.frames[id];
  return l;
}

/** Extra bars shown unless the player turned them off: bar2 carries the mount cell, bar3 stays opt-in. */
const BARS_ON_BY_DEFAULT = new Set(['bar2']);

/** Is the extra bar `id` shown in layout `l`? An unset entry falls back to BARS_ON_BY_DEFAULT. */
export function barShown(l: UiLayout, id: string): boolean {
  return l.bars[id] ?? BARS_ON_BY_DEFAULT.has(id);
}

/**
 * The current layout (cached after the first read). Treat it as read-only: build a new object and pass it to
 * writeLayout, so the cache and the store never disagree.
 */
export function readLayout(): UiLayout {
  if (cache) return cache;
  let l = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = parseObject(raw);
      if (p) {
        l = fromV2(p);
        // first run after the default positions moved: store the layout again with the new stamp
        if (p.skin !== SKIN) writeLayout(l);
      }
    } else {
      const old = localStorage.getItem(OLD_KEY);
      const p1 = old ? parseObject(old) : null;
      if (p1) {
        // first run after the v2 change: migrate once and store it as v2 (the v1 entry stays as it was)
        l = fromV1(p1);
        writeLayout(l);
      }
    }
  } catch (e) {
    console.warn('[hud] layout store unreadable, using the default layout', e);
  }
  cache = l;
  return l;
}

export function writeLayout(next: UiLayout): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, skin: SKIN }));
  } catch (e) {
    console.warn('[hud] layout not saved, it lasts for this session only', e);
  }
}
