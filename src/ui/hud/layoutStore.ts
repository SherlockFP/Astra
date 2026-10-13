/**
 * Persistent HUD layout (hud module): frame offsets and scales written by the edit mode, extra bar visibility, the grid
 * toggle and the extra-bar lock. One localStorage key. Every access is wrapped in try/catch: a blocked or corrupt store falls
 * back to the defaults and the HUD renders the same without it.
 */

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
/**
 * v2: the v1 layout could store frame offsets that put a frame (the bottom bar) outside the window, and players were stuck
 * with it. Bumping the key resets every player to the default layout once; the v1 entry is removed on the first read.
 */
const KEY = 'efsun.uiLayout.v2';
const OLD_KEY = 'efsun.uiLayout.v1';

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
  v: 1;
  /** 8 px grid snapping while dragging in the layout editor. */
  grid: boolean;
  /** Extra action bars are locked: slot contents cannot be dragged out or cleared with a right click. */
  locked: boolean;
  /** Extra bar visibility by bar id ('bar2', 'bar3'). */
  bars: Record<string, boolean>;
  /** Frame offsets by frame id (see EditMode.ts). */
  frames: Record<string, FrameOffset>;
}

let cache: UiLayout | null = null;

function defaults(): UiLayout {
  return { v: 1, grid: true, locked: false, bars: {}, frames: {} };
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

/**
 * The current layout (cached after the first read). Treat it as read-only: build a new object and pass it to
 * writeLayout, so the cache and the store never disagree.
 */
export function readLayout(): UiLayout {
  if (cache) return cache;
  const l = defaults();
  try {
    localStorage.removeItem(OLD_KEY);
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiLayout> | null;
      if (p && typeof p === 'object') {
        l.grid = p.grid !== false;
        l.locked = p.locked === true;
        l.bars = sanitizeBars(p.bars);
        l.frames = sanitizeFrames(p.frames);
      }
    }
  } catch {
    /* blocked or corrupt: defaults */
  }
  cache = l;
  return l;
}

export function writeLayout(next: UiLayout): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked: the layout only lasts for this session */
  }
}
