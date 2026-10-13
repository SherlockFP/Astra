import * as THREE from 'three';
import type { UI, WorldLabelHandle } from '../UI';
import { clampN, div, setClass, setStyle } from './dom';

/** Labels are fully opaque up to this fraction of their maxDistance and fade out linearly to 0 at maxDistance. */
const FADE_START = 0.7;
/** Declutter: a label may be lifted this many steps (one label height + gap each) above its anchor to clear its neighbours. */
const MAX_NUDGE_STEPS = 3;
/** Gap between stacked label boxes (px). */
const STEP_GAP = 4;
/** Padding added around each box for the overlap test (px). */
const PAD = 2;
/** Smoothing rate (1/s) of the displayed lift and opacity: nudges and fades glide instead of snapping. */
const SMOOTH = 14;
/** Re-measure a label's box this often (ms), in case its content changed without going through setText. */
const MEASURE_EVERY = 500;
/** Labels (NPC names, speech bubbles, loot names) keep this many px inside the viewport: clamped, not clipped at the edge. */
const EDGE = 8;

interface Entry {
  obj: THREE.Object3D;
  el: HTMLElement;
  handle: WorldLabelHandle;
  offsetY: number;
  maxDist: number;
  visible: boolean;
  orphanAt: number;
  html: string;
  /** Measured box size in px (w = 0 means "measure again"). */
  w: number;
  h: number;
  measuredAt: number;
  /** Projected anchor (screen px, bottom centre of the label). */
  x: number;
  y: number;
  /** Distance to the camera (m). */
  depth: number;
  /** Hovered or the current hover / Tab target: wins the declutter and is drawn on top. */
  focused: boolean;
  /** Opacity wanted this frame (distance fade; 0 when behind the camera, too far, or declutter-hidden). */
  wantAlpha: number;
  /** Displayed opacity and lift (px above the anchor), smoothed toward wantAlpha / liftTarget. */
  alpha: number;
  lift: number;
  liftTarget: number;
}

/** Entity ids that get priority in the declutter (the enemy under the crosshair, the Tab target). */
export interface LabelFocus {
  hoverId?: number | null;
  targetId?: number | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const _w = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = { x: 0, y: 0 };

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Projected DOM labels (loot names, NPC titles, portal names, markers): distance fade, click handlers and screen-space declutter. */
export class WorldLabels {
  private entries = new Set<Entry>();
  private cands: Entry[] = [];
  private placed: Box[] = [];

  constructor(private ui: UI, private layer: HTMLElement) {}

  add(
    object: THREE.Object3D,
    html: string,
    opts: { offsetY?: number; className?: string; onClick?: () => void; maxDistance?: number; stackGroup?: string } = {},
  ): WorldLabelHandle {
    const el = div('wl ' + (opts.className ?? ''), this.layer);
    el.innerHTML = html;
    if (opts.onClick) {
      el.classList.add('clickable', 'hud-interactive');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClick!();
      });
    }
    const entry: Entry = {
      obj: object, el, handle: null as unknown as WorldLabelHandle,
      offsetY: opts.offsetY ?? 2.4, maxDist: Math.max(1, opts.maxDistance ?? 28), visible: true,
      orphanAt: 0, html, w: 0, h: 0, measuredAt: -1e9, x: 0, y: 0, depth: 0, focused: false,
      wantAlpha: 0, alpha: 0, lift: 0, liftTarget: 0,
    };
    entry.handle = {
      el,
      setText: (h: string) => {
        if (h === entry.html) return;
        entry.html = h;
        entry.w = 0; // the box changed size: measure it again before the next declutter
        el.innerHTML = h;
      },
      setVisible: (v: boolean) => {
        entry.visible = v;
        if (!v) {
          entry.alpha = 0;
          el.style.display = 'none';
        }
      },
      remove: () => {
        this.entries.delete(entry);
        el.remove();
      },
    };
    this.entries.add(entry);
    el.style.display = 'none';
    return entry.handle;
  }

  /**
   * Per-frame layout. Visible labels are projected, faded by distance (opaque to 70 % of maxDistance, gone at maxDistance),
   * hidden when behind the camera, then decluttered: nearest first (focused label first), a label whose box overlaps an
   * already placed one is lifted in steps (max MAX_NUDGE_STEPS), and hidden if it still does not fit. Lift and opacity are
   * lerped so the labels glide rather than jump.
   */
  update(now: number, dt: number, focus: LabelFocus = {}): void {
    const ui = this.ui;
    const cam = ui.camera;
    if (!cam) return;
    _c.setFromMatrixPosition(cam.matrixWorld);

    // 1. project + distance fade + behind-camera cull
    const cands = this.cands;
    cands.length = 0;
    for (const e of this.entries) {
      e.wantAlpha = 0;
      e.liftTarget = 0;
      if (!e.visible) continue;
      const o = e.obj;
      // owner forgot to remove the label of a destroyed object: drop it after a moment
      if (!o.parent) {
        if (!e.orphanAt) e.orphanAt = now;
        if (now - e.orphanAt > 800) {
          e.handle.remove();
          continue;
        }
      } else e.orphanAt = 0;
      o.getWorldPosition(_w);
      _w.y += e.offsetY;
      // view space looks down -Z: anything at z >= 0 is behind the camera
      _v.copy(_w).applyMatrix4(cam.matrixWorldInverse);
      if (_v.z >= 0) continue;
      const d = _w.distanceTo(_c);
      const t = d / e.maxDist;
      if (t >= 1) continue;
      if (!ui.projectWorld(_w.x, _w.y, _w.z, _p)) continue;
      e.x = _p.x;
      e.y = _p.y;
      e.depth = d;
      e.wantAlpha = t <= FADE_START ? 1 : (1 - t) / (1 - FADE_START);
      const id = e.obj.userData.entityId as number | undefined;
      e.focused = (id !== undefined && (id === focus.hoverId || id === focus.targetId)) || e.el.matches(':hover');
      cands.push(e);
    }

    // 2. measure boxes that are new or stale (a label that was display:none is shown briefly to read its size)
    for (const e of cands) if (e.w === 0 || now - e.measuredAt > MEASURE_EVERY) this.measure(e, now);

    // 2b. keep the labels inside the window: a label partly off screen is pulled in by EDGE px (no clipping at the edge);
    // a label fully off screen is hidden instead of being pinned to the edge
    const vw = ui.viewW;
    const vh = ui.viewH;
    let kept = 0;
    for (const e of cands) {
      const hw = e.w / 2;
      if (e.x + hw < 0 || e.x - hw > vw || e.y < 0 || e.y - e.h > vh) {
        e.wantAlpha = 0;
        continue;
      }
      e.x = clampN(e.x, EDGE + hw, vw - EDGE - hw);
      e.y = clampN(e.y, EDGE + e.h, vh - EDGE);
      cands[kept++] = e;
    }
    cands.length = kept;

    // 3. declutter: focused first, then nearest first; nudge up in steps until the box is free
    cands.sort((a, b) => (a.focused !== b.focused ? (a.focused ? -1 : 1) : a.depth - b.depth));
    const placed = this.placed;
    placed.length = 0;
    for (const e of cands) {
      const step = (e.h || 16) + STEP_GAP;
      let fitted = false;
      for (let s = 0; s <= MAX_NUDGE_STEPS; s++) {
        const lift = s * step;
        // a lifted label keeps its top inside the window
        if (s > 0 && e.y - lift - e.h < EDGE) break;
        const box = boxOf(e, lift);
        let hit = false;
        for (const p of placed) {
          if (overlaps(box, p)) {
            hit = true;
            break;
          }
        }
        if (!hit) {
          placed.push(box);
          e.liftTarget = lift;
          fitted = true;
          break;
        }
      }
      if (!fitted) e.wantAlpha = 0; // no room even after the nudges: hidden this frame, fades out
    }

    // 4. smooth lift/opacity and write the DOM
    const k = 1 - Math.exp(-SMOOTH * Math.max(0, dt));
    for (const e of this.entries) {
      if (!e.visible) {
        e.alpha = 0;
        if (e.el.style.display !== 'none') e.el.style.display = 'none';
        continue;
      }
      e.alpha += (e.wantAlpha - e.alpha) * k;
      e.lift += (e.liftTarget - e.lift) * k;
      if (e.alpha < 0.01 && e.wantAlpha === 0) {
        if (e.el.style.display !== 'none') e.el.style.display = 'none';
        continue;
      }
      if (e.el.style.display === 'none') e.el.style.display = '';
      setStyle(e.el, 'transform', `translate(${Math.round(e.x)}px, ${Math.round(e.y - e.lift)}px) translate(-50%, -100%)`);
      setStyle(e.el, 'opacity', clampN(e.alpha, 0, 1).toFixed(2));
      setStyle(e.el, 'zIndex', String(e.focused ? 1001 : Math.max(1, 1000 - Math.round(e.depth))));
      setClass(e.el, 'far', e.depth > e.maxDist * 0.6);
    }
  }

  /** Read the label's box size. Displayed briefly when it was hidden (display:none reports 0 x 0). */
  private measure(e: Entry, now: number): void {
    const el = e.el;
    const hidden = el.style.display === 'none';
    if (hidden) el.style.display = '';
    e.w = el.offsetWidth;
    e.h = el.offsetHeight;
    e.measuredAt = now;
    if (hidden) el.style.display = 'none';
  }

  clear(): void {
    for (const e of [...this.entries]) e.handle.remove();
  }
}

/** Screen box of a label whose anchor sits at (x, y) and that is lifted `lift` px upward (translate(-50%, -100%) anchor). */
function boxOf(e: Entry, lift: number): Box {
  const hw = e.w / 2 + PAD;
  const y = e.y - lift;
  return { x0: e.x - hw, x1: e.x + hw, y0: y - e.h - PAD, y1: y + PAD };
}
