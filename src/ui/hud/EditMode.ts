import { G } from '../../game/G';
import type { UI } from '../UI';
import { div, h } from '../widgets/dom';
import { SCALE_MAX, SCALE_MIN, readLayout, writeLayout, type FrameOffset } from './layoutStore';

/**
 * WoW-style layout editor (hud module). Every registered HUD frame gets a dashed box with its Turkish name; the box
 * drags the frame (8 px grid + edge / centre alignment guides) and scales it (wheel or +/- buttons, 0.6..1.6).
 * Offsets are applied with the individual CSS `translate` / `scale` properties, so a frame's own CSS `transform` keeps working.
 * Only the layout of the frames is committed on "Kaydet"; "İptal" restores the layout the edit started from.
 */

/** A HUD frame the editor can move and scale. `el` receives the translate / scale. */
export interface EditFrame {
  id: string;
  name: string;
  el: HTMLElement;
}

export interface EditModeOptions {
  ui: UI;
  /** The HUD root (`.hud`): gets the `hud-editing` class while editing (placeholders for hidden frames). */
  root: HTMLElement;
  /** Extra bars offered as visibility toggles in the toolbar. */
  bars: { id: string; name: string }[];
}

const GRID = 8;
const SNAP_PX = 6;
const STEP = 0.05;
const NO_OFFSET: FrameOffset = { x: 0, y: 0, s: 1 };
/** Size class names for the toolbar read-out (§2.2 / §2.13). */
const DENSITY_TR: Record<string, string> = { lg: 'Geniş', md: 'Orta', sm: 'Kompakt' };

interface Reg {
  id: string;
  frame: EditFrame;
  box: HTMLElement;
  sc: HTMLElement;
}

interface DragState {
  id: string;
  pid: number;
  sx: number;
  sy: number;
  left: number;
  top: number;
  width: number;
  height: number;
  off: FrameOffset;
  xs: number[];
  ys: number[];
}

/** Snap one axis: alignment to other frames' edges / centres and the viewport first, else the grid (when on). */
function snapAxis(start: number, size: number, targets: number[], grid: number): { pos: number; guide: number | null } {
  let best: { d: number; guide: number } | null = null;
  for (const p of [start, start + size / 2, start + size]) {
    for (const t of targets) {
      const d = t - p;
      if (Math.abs(d) <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: t };
    }
  }
  if (best) return { pos: start + best.d, guide: best.guide };
  if (grid > 0) return { pos: Math.round(start / grid) * grid, guide: null };
  return { pos: start, guide: null };
}

/** Keep a frame inside the window (a frame bigger than the window sticks to the origin). */
function clampPos(pos: number, size: number, max: number): number {
  if (size >= max) return 0;
  return Math.min(Math.max(pos, 0), max - size);
}

/**
 * Translation (px) that keeps a box of `size` starting at `start` (its position before the translation) inside [0, max].
 * A box that cannot fit is centred on the axis.
 */
function fitAxis(t: number, start: number, size: number, max: number): number {
  if (size >= max) return (max - size) / 2 - start;
  return Math.min(Math.max(t, -start), max - size - start);
}

/** The frame's default placement: no translate, no scale. */
function isDefault(o: FrameOffset): boolean {
  return o.x === 0 && o.y === 0 && o.s === 1;
}

/** Name tag: height above the box and an estimate of its width (the tag is a short label); the scale buttons sit at the right. */
const TAG_H = 24;
const TAG_W = 170;
const CTRL_W = 56;

/** True when the name tag / scale buttons of a frame at `r` (drawn above it) would cover another frame's box. */
function tagBlocked(r: DOMRect, others: { r: DOMRect }[]): boolean {
  const y0 = r.top - TAG_H, y1 = r.top;
  const zones = [
    { x0: r.left, x1: r.left + Math.min(r.width, TAG_W) },
    { x0: Math.max(r.left, r.right - CTRL_W), x1: r.right },
  ];
  for (const o of others) {
    if (o.r === r) continue;
    const q = o.r;
    for (const z of zones) {
      if (q.left < z.x1 && z.x0 < q.right && q.top < y1 && y0 < q.bottom) return true;
    }
  }
  return false;
}

function copyOffsets(src: Record<string, FrameOffset>): Record<string, FrameOffset> {
  const out: Record<string, FrameOffset> = {};
  for (const [k, v] of Object.entries(src)) out[k] = { x: v.x, y: v.y, s: v.s };
  return out;
}

export class EditMode {
  private readonly ui: UI;
  private readonly root: HTMLElement;
  private readonly bars: { id: string; name: string }[];
  private readonly regs = new Map<string, Reg>();
  /** Offsets currently applied to the frames (equal to the committed layout outside edit mode). */
  private draft: Record<string, FrameOffset>;
  /** Frame picked last (click / drag), the target of "Çerçeveyi Sıfırla" (UX-13). */
  private selId: string | null = null;
  private densityEl: HTMLElement | null = null;
  private active = false;
  private sig = '';
  private drag: DragState | null = null;
  private readonly layer: HTMLElement;
  private readonly boxes: HTMLElement;
  private readonly guideV: HTMLElement;
  private readonly guideH: HTMLElement;
  private readonly toggles = new Map<string, HTMLButtonElement>();
  /** Registered frames by their element (the ResizeObserver reports elements). */
  private readonly byEl = new Map<Element, Reg>();
  /** Re-fits a frame's offset when its box changes size (shown after being hidden, content grew). Null without RO. */
  private readonly ro: ResizeObserver | null;

  constructor(opts: EditModeOptions) {
    this.ui = opts.ui;
    this.root = opts.root;
    this.bars = opts.bars;
    this.ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => this.onFrameResize(entries));
    this.draft = copyOffsets(readLayout().frames);
    this.layer = div('layer layer-edit');
    this.layer.style.display = 'none';
    this.ui.root.appendChild(this.layer);
    this.boxes = div('ued-boxes', this.layer);
    this.guideV = div('ued-guide v', this.boxes);
    this.guideH = div('ued-guide h', this.boxes);
    this.guideV.style.display = 'none';
    this.guideH.style.display = 'none';
    this.buildToolbar();
  }

  get editing(): boolean {
    return this.active;
  }

  /** Register a frame: creates its editor box and applies its saved offset right away. */
  register(frame: EditFrame): void {
    if (this.regs.has(frame.id)) return;
    const box = div('ued-box ui-capture', this.boxes);
    box.dataset.frame = frame.id;
    const tag = div('ued-tag', box);
    h('span', 'ued-name', tag, frame.name);
    const sc = h('span', 'ued-sc', tag, '100%');
    const ctrl = div('ued-ctrl', box);
    const minus = h('button', 'ued-b', ctrl, '-');
    const plus = h('button', 'ued-b', ctrl, '+');
    minus.type = 'button';
    plus.type = 'button';
    const reg: Reg = { id: frame.id, frame, box, sc };
    this.regs.set(frame.id, reg);
    this.byEl.set(frame.el, reg);
    this.ro?.observe(frame.el);
    box.addEventListener('pointerdown', (e) => this.onDown(reg, e));
    box.addEventListener('pointermove', (e) => this.onMove(reg, e));
    box.addEventListener('pointerup', (e) => this.onUp(reg, e));
    box.addEventListener('pointercancel', (e) => this.onUp(reg, e));
    box.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setScale(reg.id, this.offsetOf(reg.id).s + (e.deltaY < 0 ? STEP : -STEP));
      },
      { passive: false },
    );
    minus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setScale(reg.id, this.offsetOf(reg.id).s - STEP);
    });
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setScale(reg.id, this.offsetOf(reg.id).s + STEP);
    });
    this.applyFrame(reg);
  }

  /** Enter the editor (town / dungeon only). Frees the cursor and shows every frame's box. */
  start(): void {
    if (this.active) return;
    if (this.ui.mode !== 'town' && this.ui.mode !== 'dungeon') return;
    this.active = true;
    this.draft = copyOffsets(readLayout().frames);
    this.root.classList.add('hud-editing');
    this.layer.style.display = '';
    this.syncToolbar();
    this.ui.hideTooltip();
    G.input?.unlock();
    this.applyAll();
  }

  /** Leave the editor. save = commit the frame layout; otherwise revert to the last committed one. */
  stop(save: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.drag = null;
    this.guideV.style.display = 'none';
    this.guideH.style.display = 'none';
    if (save) writeLayout({ ...readLayout(), frames: copyOffsets(this.draft) });
    else this.draft = copyOffsets(readLayout().frames);
    this.root.classList.remove('hud-editing');
    this.layer.style.display = 'none';
    this.applyAll();
    if (save) this.ui.toast('Arayüz düzeni kaydedildi.', 'success');
  }

  /** Called every HUD frame: re-applies the offsets after a resize / UI scale change, and follows the frames while editing. */
  update(): void {
    const sig = `${window.innerWidth}|${window.innerHeight}|${(this.ui.scale || 1).toFixed(3)}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.applyAll();
    }
    if (this.active) this.layoutBoxes();
  }

  applyAll(): void {
    this.fitRegs([...this.regs.values()]);
  }

  /** A frame changed size (shown after being hidden, or its content grew): its saved offset may now leave the window. */
  private onFrameResize(entries: ResizeObserverEntry[]): void {
    const regs: Reg[] = [];
    for (const e of entries) {
      const reg = this.byEl.get(e.target);
      if (reg && !regs.includes(reg)) regs.push(reg);
    }
    if (regs.length) this.fitRegs(regs);
  }

  // ---- frame transforms ----

  private offsetOf(id: string): FrameOffset {
    return this.draft[id] ?? NO_OFFSET;
  }

  /**
   * Pull the saved offsets of `regs` back inside the window, then apply them. Offsets are fractions of the window, so a layout
   * saved in a taller window (or a frame moved up) can land fully off-screen in a shorter one, and the drag clamp only runs
   * while dragging: without this the bottom bar (and any frame) could vanish on load.
   * The check measures the real visual box with the frame's scale on and its translate off (the scale is about the frame's own
   * origin, so it can move the box too), then clamps the translate the same way clampPos does for drags. A frame with no box (hidden) keeps its offset until it shows; the
   * ResizeObserver fits it then.
   */
  private fitRegs(regs: Reg[]): void {
    const todo: { reg: Reg; o: FrameOffset }[] = [];
    for (const reg of regs) {
      const o = this.draft[reg.id];
      if (!o || isDefault(o)) {
        this.applyFrame(reg);
        continue;
      }
      // translate does not change layout, so clearing every frame's translate first makes the measuring below one pass
      reg.frame.el.style.setProperty('translate', '');
      reg.frame.el.style.setProperty('scale', o.s === 1 ? '' : String(o.s));
      todo.push({ reg, o });
    }
    if (!todo.length) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxes = todo.map(({ reg }) => reg.frame.el.getBoundingClientRect());
    todo.forEach(({ reg, o }, i) => {
      const r = boxes[i];
      let next = o;
      if (r.width >= 2 && r.height >= 2) {
        // applyFrame writes o.x * innerWidth (and o.y * innerHeight) screen px of translation
        const x = fitAxis(o.x * vw, r.left, r.width, vw) / vw;
        const y = fitAxis(o.y * vh, r.top, r.height, vh) / vh;
        if (Math.abs(x - o.x) > 1e-4 || Math.abs(y - o.y) > 1e-4) next = { x, y, s: o.s };
      }
      this.draft[reg.id] = next;
      this.applyFrame(reg);
    });
  }

  /** Write the frame's translate / scale. The translate is in HUD css px: the HUD root is zoomed by `ui.scale`. */
  private applyFrame(reg: Reg): void {
    const o = this.draft[reg.id];
    const el = reg.frame.el;
    if (!o || (o.x === 0 && o.y === 0 && o.s === 1)) {
      el.style.setProperty('translate', '');
      el.style.setProperty('scale', '');
      return;
    }
    const s = this.ui.scale || 1;
    const tx = (o.x * window.innerWidth) / s;
    const ty = (o.y * window.innerHeight) / s;
    el.style.setProperty('translate', `${tx.toFixed(2)}px ${ty.toFixed(2)}px`);
    el.style.setProperty('scale', o.s === 1 ? '' : String(o.s));
  }

  private setScale(id: string, s: number): void {
    if (!this.active) return;
    const o = this.offsetOf(id);
    const next = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)) * 20) / 20;
    this.draft[id] = { x: o.x, y: o.y, s: next };
    const reg = this.regs.get(id);
    if (reg) this.fitRegs([reg]);
    this.select(id);
  }

  // ---- pointer editing ----

  private onDown(reg: Reg, e: PointerEvent): void {
    if (!this.active || e.button !== 0) return;
    if ((e.target as HTMLElement).closest?.('.ued-b')) return;
    e.preventDefault();
    e.stopPropagation();
    this.select(reg.id);
    const r = reg.frame.el.getBoundingClientRect();
    const xs = [0, window.innerWidth / 2, window.innerWidth];
    const ys = [0, window.innerHeight / 2, window.innerHeight];
    for (const other of this.regs.values()) {
      if (other === reg || other.box.style.display === 'none') continue;
      const q = other.frame.el.getBoundingClientRect();
      xs.push(q.left, q.left + q.width / 2, q.right);
      ys.push(q.top, q.top + q.height / 2, q.bottom);
    }
    this.drag = {
      id: reg.id,
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      off: { ...this.offsetOf(reg.id) },
      xs,
      ys,
    };
    reg.box.setPointerCapture(e.pointerId);
  }

  private onMove(reg: Reg, e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== reg.id || d.pid !== e.pointerId) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = this.ui.scale || 1;
    const grid = readLayout().grid ? GRID * scale : 0;
    const sx = snapAxis(d.left + (e.clientX - d.sx), d.width, d.xs, grid);
    const sy = snapAxis(d.top + (e.clientY - d.sy), d.height, d.ys, grid);
    const left = clampPos(sx.pos, d.width, vw);
    const top = clampPos(sy.pos, d.height, vh);
    this.showGuide(this.guideV, sx.guide, true);
    this.showGuide(this.guideH, sy.guide, false);
    this.draft[d.id] = { x: d.off.x + (left - d.left) / vw, y: d.off.y + (top - d.top) / vh, s: d.off.s };
    this.applyFrame(reg);
  }

  private onUp(reg: Reg, e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pid !== e.pointerId || d.id !== reg.id) return;
    this.drag = null;
    this.guideV.style.display = 'none';
    this.guideH.style.display = 'none';
    if (reg.box.hasPointerCapture(e.pointerId)) reg.box.releasePointerCapture(e.pointerId);
  }

  private showGuide(el: HTMLElement, at: number | null, vertical: boolean): void {
    if (at === null) {
      el.style.display = 'none';
      return;
    }
    const lr = this.layer.getBoundingClientRect();
    el.style.display = '';
    if (vertical) el.style.left = `${at - lr.left}px`;
    else el.style.top = `${at - lr.top}px`;
  }

  private select(id: string): void {
    this.selId = id;
    for (const reg of this.regs.values()) reg.box.classList.toggle('sel', reg.id === id);
    const reg = this.regs.get(id);
    if (reg) this.boxes.insertBefore(reg.box, this.guideV);
  }

  /**
   * Put every box over its frame (hidden when the frame is not shown). The name tag normally sits above its box; it moves
   * inside the box when that space is taken by another frame (stacked frames with small gaps, e.g. the buff row above the
   * party frames, or the loot feed above the gold / menu column) or when the box is at the very top of the window.
   */
  private layoutBoxes(): void {
    const lr = this.layer.getBoundingClientRect();
    // every frame rect is read before any box is written: one layout pass instead of one per frame (boxes never move a frame)
    const regs = [...this.regs.values()];
    const rects = regs.map((reg) => reg.frame.el.getBoundingClientRect());
    const shown: { reg: Reg; r: DOMRect }[] = [];
    regs.forEach((reg, i) => {
      const r = rects[i];
      const show = r.width >= 2 && r.height >= 2;
      const want = show ? '' : 'none';
      if (reg.box.style.display !== want) reg.box.style.display = want;
      if (!show) return;
      reg.box.style.left = `${r.left - lr.left}px`;
      reg.box.style.top = `${r.top - lr.top}px`;
      reg.box.style.width = `${r.width}px`;
      reg.box.style.height = `${r.height}px`;
      shown.push({ reg, r });
    });
    for (const { reg, r } of shown) {
      const low = r.top - lr.top < TAG_H + 6 || tagBlocked(r, shown);
      reg.box.classList.toggle('low', low);
      const pct = `${Math.round(this.offsetOf(reg.id).s * 100)}%`;
      if (reg.sc.textContent !== pct) reg.sc.textContent = pct;
    }
  }

  // ---- toolbar ----

  private buildToolbar(): HTMLElement {
    const bar = div('ued-bar ui-capture', this.layer);
    h('div', 'ued-title', bar, 'Arayüzü Düzenle');
    h('div', 'ued-hint', bar, 'Sürükle: taşı · Tekerlek veya +/-: boyut · Izgara 8 px');
    this.toggle(bar, 'grid', 'Izgara', () => this.flip('grid'));
    for (const b of this.bars) this.toggle(bar, 'bar:' + b.id, b.name, () => this.flipBar(b.id));
    this.toggle(bar, 'locked', 'Çubukları Kilitle', () => this.flip('locked'));
    h('span', 'ued-sep', bar);
    this.button(bar, 'Kaydet', 'primary', () => this.stop(true));
    this.button(bar, 'Çerçeveyi Sıfırla', '', () => this.resetSelected());
    this.button(bar, 'Varsayılana Dön', '', () => this.resetAll());
    this.densityEl = h('span', 'ued-density', bar);
    this.button(bar, 'İptal', 'danger', () => this.stop(false));
    return bar;
  }

  private button(parent: HTMLElement, text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = h('button', 'ued-btn ' + cls, parent, text);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  private toggle(parent: HTMLElement, key: string, text: string, fn: () => void): void {
    this.toggles.set(key, this.button(parent, text, '', fn));
  }

  private flip(key: 'grid' | 'locked'): void {
    const l = readLayout();
    if (key === 'grid') {
      writeLayout({ ...l, grid: !l.grid });
    } else {
      const locked = !l.locked;
      writeLayout({ ...l, locked });
      this.ui.toast(locked ? 'Çubuklar kilitlendi.' : 'Çubukların kilidi açıldı.', 'info');
    }
    this.syncToolbar();
  }

  private flipBar(id: string): void {
    const l = readLayout();
    writeLayout({ ...l, bars: { ...l.bars, [id]: l.bars[id] !== true } });
    this.syncToolbar();
  }

  /** Resets only the frame picked last to its default (draft only, like the global reset: Kaydet makes it permanent). */
  private resetSelected(): void {
    if (!this.selId) {
      this.ui.toast('Önce bir çerçeve seç.', 'info');
      return;
    }
    this.draft[this.selId] = { ...NO_OFFSET };
    this.applyAll();
    this.ui.toast('Çerçeve varsayılana döndü. Kalıcı olması için Kaydet.', 'info');
  }

  private resetAll(): void {
    this.draft = {};
    this.applyAll();
    this.ui.toast('Yerleşim varsayılana döndü. Kalıcı olması için Kaydet.', 'info');
  }

  private syncToolbar(): void {
    if (this.densityEl) this.densityEl.textContent = 'Yoğunluk: ' + DENSITY_TR[this.root.dataset.density ?? 'lg'];
    const l = readLayout();
    this.setOn('grid', l.grid);
    for (const b of this.bars) this.setOn('bar:' + b.id, l.bars[b.id] === true);
    this.setOn('locked', l.locked);
    const lock = this.toggles.get('locked');
    if (lock) lock.textContent = l.locked ? 'Kilidi Aç' : 'Çubukları Kilitle';
  }

  private setOn(key: string, on: boolean): void {
    const b = this.toggles.get(key);
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
