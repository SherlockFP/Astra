import * as THREE from 'three';
import type { UI, WorldLabelHandle } from '../UI';
import { G } from '../../game/G';
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
/** Non-quest NPC name labels are fully opaque to NPC_FADE_FROM m and gone at NPC_MAX_M. */
const NPC_FADE_FROM = 25;
const NPC_MAX_M = 30;
/** NPC names stack upward more than other labels (WoW stacking): a crowded square fits its names instead of hiding them. */
const NPC_MAX_NUDGE_STEPS = 6;
/** An NPC name whose line to the camera crosses town geometry (a house wall, a roof) fades out; re-tested this often (ms) per label. */
const OCCLUDE_EVERY = 150;
/** The occlusion ray stops this far (m) short of the label anchor, so the label's own height never counts as a wall. */
const OCCLUDE_STOP_M = 0.8;
/** Quest givers keep their name label out to QUEST_MAX_M (the same range as their quest marker). */
const QUEST_MAX_M = 40;
/** HUD panels no label is drawn under: the same selector and re-read interval as Nameplates.ts. */
const HUD_SEL = '.qt, .trk, .mm';
const HUD_RECT_EVERY = 150;
/** Enemy nameplates are DOM `.np` plates in the same layer: a prop label is hidden while one overlaps it. */
const PLATE_SEL = '.np';
/** Quest markers and guide tags are labels of their NPC (`qm ...` / `guide-tag`); an NPC with one shown is a quest giver. */
const QUEST_HTML = /class="(?:qm |guide-tag)/;

/** How a label is treated by the distance rules of update(). */
type Role = 'quest' | 'questNpc' | 'npc' | 'prop' | 'other';

interface Entry {
  obj: THREE.Object3D;
  el: HTMLElement;
  handle: WorldLabelHandle;
  offsetY: number;
  /** Distance limit given by the owner (m). */
  baseMax: number;
  /** Effective distance limit and fade start (m) for this frame, set by applyRole(). */
  maxDist: number;
  fadeFrom: number;
  /** Entity kind of `obj` ('' until the entity is registered). */
  kind: string;
  role: Role;
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
  /** Behind town geometry (see OCCLUDE_EVERY); tested again at occludeAt (ms). */
  occluded: boolean;
  occludeAt: number;
  /** Hovered or the current hover / Tab target: wins the declutter and is drawn on top. */
  focused: boolean;
  /** Opacity wanted this frame (distance fade; 0 when behind the camera, too far, hidden by a rule or declutter-hidden). */
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
  /** Scratch lists for the measure pass (reused every frame). */
  private readonly stale: Entry[] = [];
  private readonly revealed: Entry[] = [];
  /** Objects whose quest marker or guide tag is shown this frame (their NPC is a quest giver). */
  private readonly questObjs = new Set<THREE.Object3D>();
  /** Screen boxes of the enemy nameplates drawn this frame (read only when a prop label needs them). */
  private readonly plates: Box[] = [];
  /** Screen rects of the HUD panels in layer px (see HUD_SEL); a hard blocker for every label. */
  private hud: Box[] = [];
  private hudAt = -1e9;
  /** Solid scene meshes that hide an NPC name (the town's houses; null outside the town). */
  private occluders: THREE.Object3D[] | null = null;
  private readonly occRay = new THREE.Raycaster();
  private readonly occDir = new THREE.Vector3();

  constructor(private ui: UI, private layer: HTMLElement) {}

  /** The meshes that block a name's line of sight (town: the houses and walls). null = no occlusion (dungeons, open world). */
  setOccluders(list: THREE.Object3D[] | null): void {
    this.occluders = list && list.length ? list : null;
    for (const e of this.entries) e.occludeAt = -1e9;
  }

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
    const baseMax = Math.max(1, opts.maxDistance ?? 28);
    const entry: Entry = {
      obj: object, el, handle: null as unknown as WorldLabelHandle,
      offsetY: opts.offsetY ?? 2.4, baseMax, maxDist: baseMax, fadeFrom: baseMax * FADE_START, kind: '', role: 'other',
      visible: true, orphanAt: 0, html, w: 0, h: 0, measuredAt: -1e9, x: 0, y: 0, depth: 0, focused: false,
      occluded: false, occludeAt: -1e9,
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
   * Per-frame layout. Visible labels are projected and faded by distance, hidden when behind the camera, then decluttered:
   * nearest first (focused label first), a label whose box overlaps an already placed one or a HUD panel is lifted in steps
   * (max MAX_NUDGE_STEPS), and hidden if it still does not fit. Distance rules by role (applyRole): non-quest NPC names fade
   * out from NPC_FADE_FROM m, quest givers keep their name out to QUEST_MAX_M m, and a prop label is hidden while an enemy
   * nameplate overlaps it. Lift and opacity are lerped so the labels glide rather than jump.
   * Call after the nameplates are laid out for the frame (the prop rule reads their rects).
   */
  update(now: number, dt: number, focus: LabelFocus = {}): void {
    const ui = this.ui;
    const cam = ui.camera;
    if (!cam) return;
    _c.setFromMatrixPosition(cam.matrixWorld);

    // 0. the NPCs that have a quest marker or guide tag shown this frame
    const questObjs = this.questObjs;
    questObjs.clear();
    for (const e of this.entries) if (e.visible && QUEST_HTML.test(e.html)) questObjs.add(e.obj);

    // 1. project + role distance fade + behind-camera cull
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
      this.applyRole(e, questObjs);
      const d = _w.distanceTo(_c);
      if (d >= e.maxDist) continue;
      if (!ui.projectWorld(_w.x, _w.y, _w.z, _p)) continue;
      e.x = _p.x;
      e.y = _p.y;
      e.depth = d;
      e.wantAlpha = d <= e.fadeFrom ? 1 : (e.maxDist - d) / (e.maxDist - e.fadeFrom);
      // an NPC name behind a house or wall is not shown (it used to sit on the roof, WoW: names are not seen through walls)
      if ((e.role === 'npc' || e.role === 'questNpc') && this.isWalled(e, now, _c, _w)) {
        e.wantAlpha = 0;
        continue;
      }
      const id = e.obj.userData.entityId as number | undefined;
      e.focused = (id !== undefined && (id === focus.hoverId || id === focus.targetId)) || e.el.matches(':hover');
      cands.push(e);
    }

    // 2. measure boxes that are new or stale: all of them in one pass (a label that was display:none is shown for its read)
    const stale = this.stale;
    stale.length = 0;
    for (const e of cands) if (e.w === 0 || now - e.measuredAt > MEASURE_EVERY) stale.push(e);
    if (stale.length) this.measureAll(stale, now);

    // 2b. keep the labels inside the window: a label partly off screen is pulled in by EDGE px (no clipping at the edge);
    // a label fully off screen is hidden instead of being pinned to the edge; a prop label under an enemy plate is hidden
    const vw = ui.viewW;
    const vh = ui.viewH;
    const plates = cands.some((e) => e.role === 'prop') ? this.readPlates() : null;
    let kept = 0;
    for (const e of cands) {
      const hw = e.w / 2;
      if (e.x + hw < 0 || e.x - hw > vw || e.y < 0 || e.y - e.h > vh) {
        e.wantAlpha = 0;
        continue;
      }
      e.x = clampN(e.x, EDGE + hw, vw - EDGE - hw);
      e.y = clampN(e.y, EDGE + e.h, vh - EDGE);
      if (e.role === 'prop' && plates && plates.some((p) => overlaps(boxOf(e, 0), p))) {
        e.wantAlpha = 0;
        continue;
      }
      cands[kept++] = e;
    }
    cands.length = kept;

    // 3. declutter: focused first, then nearest first; nudge up in steps until the box is free of labels and HUD panels
    this.refreshHud(now);
    const hud = this.hud;
    const onHud = (b: Box): boolean => hud.some((h) => overlaps(b, h));
    cands.sort((a, b) => (a.focused !== b.focused ? (a.focused ? -1 : 1) : a.depth - b.depth));
    const placed = this.placed;
    placed.length = 0;
    for (const e of cands) {
      const step = (e.h || 16) + STEP_GAP;
      let fitted = false;
      const maxSteps = e.role === 'npc' || e.role === 'questNpc' ? NPC_MAX_NUDGE_STEPS : MAX_NUDGE_STEPS;
      for (let s = 0; s <= maxSteps; s++) {
        const lift = s * step;
        // a lifted label keeps its top inside the window
        if (s > 0 && e.y - lift - e.h < EDGE) break;
        const box = boxOf(e, lift);
        if (onHud(box)) continue;
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

  /** True when a solid scene mesh stands between the camera and the label anchor (tested every OCCLUDE_EVERY ms per label). */
  private isWalled(e: Entry, now: number, cam: THREE.Vector3, anchor: THREE.Vector3): boolean {
    const occ = this.occluders;
    if (!occ) return false;
    if (now - e.occludeAt >= OCCLUDE_EVERY) {
      e.occludeAt = now;
      this.occDir.copy(anchor).sub(cam);
      const len = this.occDir.length();
      if (len <= OCCLUDE_STOP_M) e.occluded = false;
      else {
        this.occDir.multiplyScalar(1 / len);
        this.occRay.set(cam, this.occDir);
        this.occRay.near = 0;
        this.occRay.far = len - OCCLUDE_STOP_M;
        e.occluded = this.occRay.intersectObjects(occ, false).length > 0;
      }
    }
    return e.occluded;
  }

  /** Sets the role of a label and its distance limit / fade start for this frame (see the Role type). */
  private applyRole(e: Entry, questObjs: Set<THREE.Object3D>): void {
    const quest = QUEST_HTML.test(e.html);
    // speech bubbles are anchored on their speaker (an NPC object): they are not NPC names
    const kind = quest || e.el.classList.contains('wl-bubble') ? '' : this.kindOf(e);
    let role: Role;
    if (quest) role = 'quest';
    else if (kind === 'npc') role = questObjs.has(e.obj) ? 'questNpc' : 'npc';
    else if (kind === 'interactable' || kind === 'prop') role = 'prop';
    else role = 'other';
    e.role = role;
    if (role === 'npc') {
      e.maxDist = NPC_MAX_M;
      e.fadeFrom = NPC_FADE_FROM;
    } else if (role === 'questNpc') {
      e.maxDist = QUEST_MAX_M;
      e.fadeFrom = QUEST_MAX_M * FADE_START;
    } else {
      e.maxDist = e.baseMax;
      e.fadeFrom = e.baseMax * FADE_START;
    }
  }

  /** Entity kind of the label's object, looked up once the entity is registered ('' while it is not). */
  private kindOf(e: Entry): string {
    if (e.kind) return e.kind;
    const id = e.obj.userData.entityId as number | undefined;
    const ent = id === undefined ? undefined : G.world?.entities.get(id);
    if (ent) e.kind = ent.kind;
    return e.kind;
  }

  /** Re-read the HUD panel rects (quest tracker, minimap) every HUD_RECT_EVERY ms; hidden panels (zero size) are skipped. */
  private refreshHud(now: number): void {
    if (now - this.hudAt < HUD_RECT_EVERY) return;
    this.hudAt = now;
    const lr = this.layer.getBoundingClientRect();
    const out: Box[] = [];
    document.querySelectorAll<HTMLElement>(HUD_SEL).forEach((el) => {
      if (this.layer.contains(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ x0: r.left - lr.left, y0: r.top - lr.top, x1: r.right - lr.left, y1: r.bottom - lr.top });
    });
    this.hud = out;
  }

  /** Screen boxes of the enemy nameplates that are drawn now (display:none plates are skipped). */
  private readPlates(): Box[] {
    const lr = this.layer.getBoundingClientRect();
    const out = this.plates;
    out.length = 0;
    this.layer.querySelectorAll<HTMLElement>(PLATE_SEL).forEach((el) => {
      if (el.style.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ x0: r.left - lr.left, y0: r.top - lr.top, x1: r.right - lr.left, y1: r.bottom - lr.top });
    });
    return out;
  }

  /**
   * Read the box sizes of `list`. A label that is display:none reports 0 x 0, so it is shown for its read and hidden again.
   * All of them are shown first and read after, so the browser lays out once instead of once per label
   * (show, read, hide, then the next label's show forced a new layout each time).
   */
  private measureAll(list: Entry[], now: number): void {
    const revealed = this.revealed;
    revealed.length = 0;
    for (const e of list) {
      if (e.el.style.display === 'none') {
        e.el.style.display = '';
        revealed.push(e);
      }
    }
    for (const e of list) {
      e.w = e.el.offsetWidth;
      e.h = e.el.offsetHeight;
      e.measuredAt = now;
    }
    for (const e of revealed) e.el.style.display = 'none';
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
