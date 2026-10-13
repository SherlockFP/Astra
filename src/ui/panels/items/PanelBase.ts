import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import type { UIPanel } from '../../UI';
import { h, hideTips, sfx, clamp } from './common';

/** Every panel of this module by id (filled by registerItemPanels). */
export const registry: Record<string, ItemPanel | undefined> = {};

let zTop = 40;

export interface PanelOpts {
  title: string;
  /** css icon file inside /assets/icons */
  icon?: string;
  width: number;
  /** Natural height, used for fitting the window into small viewports. */
  height: number;
  /** Default top-left position for a given viewport. */
  pos(vw: number, vh: number, w: number, h: number): [number, number];
  className?: string;
}

export interface TabsHandle {
  el: HTMLElement;
  set(id: string, silent?: boolean): void;
  get(): string;
  badge(id: string, text: string): void;
}

/** Leather tab strip used by several panels. */
export function makeTabs(items: { id: string; label: string; icon?: string }[], onChange: (id: string) => void, cls = ''): TabsHandle {
  const el = h('div', `pi-tabs ${cls}`);
  const btns = new Map<string, HTMLButtonElement>();
  let cur = items[0]?.id ?? '';
  const set = (id: string, silent = false) => {
    cur = id;
    for (const [k, b] of btns) b.classList.toggle('on', k === id);
    if (!silent) onChange(id);
  };
  for (const it of items) {
    const b = h('button', 'pi-tab');
    if (it.icon) {
      const i = h('i', 'pi-tab-ico');
      i.style.setProperty('--ico', `url("/assets/icons/${it.icon}")`);
      b.append(i);
    }
    b.append(h('span', 'pi-tab-label', it.label), h('em', 'pi-tab-badge'));
    b.addEventListener('click', () => {
      if (cur !== it.id) sfx('ui_tab');
      set(it.id);
    });
    btns.set(it.id, b);
    el.append(b);
  }
  set(cur, true);
  return {
    el,
    set,
    get: () => cur,
    badge: (id, text) => {
      const b = btns.get(id)?.querySelector('em');
      if (b) {
        b.textContent = text;
        (b as HTMLElement).style.display = text ? '' : 'none';
      }
    },
  };
}

/** Open another panel of this module (through the UI registry when possible). */
export function openPanel(id: string, data?: unknown): void {
  try {
    G.ui?.openPanel(id, data);
  } catch {
    /* ignore */
  }
  const p = registry[id];
  if (p && !p.isOpen) p.open(data);
}

const bagOwners = new Set<string>();
let bagAutoOpened = false;

/** Open the bag next to a trade window (vendor / stash / anvil). It closes again with the last such window. */
export function openCompanionBag(owner: string): void {
  if (!registry.inventory?.isOpen) bagAutoOpened = true;
  bagOwners.add(owner);
  openPanel('inventory', { tab: 'bag' });
}

export function releaseCompanionBag(owner: string): void {
  bagOwners.delete(owner);
  if (bagOwners.size === 0 && bagAutoOpened) {
    bagAutoOpened = false;
    closePanel('inventory');
  }
}

export function closePanel(id: string): void {
  try {
    G.ui?.closePanel(id);
  } catch {
    /* ignore */
  }
  const p = registry[id];
  if (p && p.isOpen) p.close();
}

/**
 * Base class: a draggable leather window with a gold-trimmed title bar and a close button.
 * Subclasses implement build() (once), refresh() (whenever open and data changed) and subscribe() for events.
 */
export abstract class ItemPanel implements UIPanel {
  readonly id: string;
  readonly el: HTMLDivElement;
  isOpen = false;
  protected head: HTMLDivElement;
  protected body: HTMLDivElement;
  protected titleEl: HTMLSpanElement;
  protected scope: EventScope | null = null;
  private built = false;
  private x = 0;
  private y = 0;
  private fit = 1;
  private onResize = () => this.layout(false);

  constructor(id: string, protected opts: PanelOpts) {
    this.id = id;
    this.el = h('div', `pi-win pi-win-${id} ${opts.className ?? ''}`);
    this.el.style.width = `${opts.width}px`;
    this.el.style.display = 'none';
    this.head = h('div', 'pi-head');
    if (opts.icon) {
      const i = h('i', 'pi-head-ico');
      i.style.setProperty('--ico', `url("/assets/icons/${opts.icon}")`);
      this.head.append(i);
    }
    this.titleEl = h('span', 'pi-title', opts.title);
    const x = h('button', 'pi-x', '✕');
    x.title = 'Kapat';
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    x.addEventListener('click', () => {
      sfx('ui_click');
      closePanel(this.id);
    });
    this.head.append(this.titleEl, x);
    this.body = h('div', 'pi-body');
    this.el.append(h('i', 'pi-corner tl'), h('i', 'pi-corner tr'), h('i', 'pi-corner bl'), h('i', 'pi-corner br'), this.head, this.body);
    this.el.addEventListener('pointerdown', () => this.front(), true);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.bindWindowDrag();
    registry[id] = this;
  }

  /** Build static DOM (called once on first open). */
  protected abstract build(body: HTMLElement): void;
  /** Re-read game state into the DOM. Only called while open. */
  protected abstract refresh(): void;
  /** Subscribe to G.events (disposed on close). */
  protected subscribe(_scope: EventScope): void {}
  protected onOpen(_data?: unknown): void {}
  protected onClose(): void {}

  setTitle(t: string): void {
    this.titleEl.textContent = t;
  }

  open(data?: unknown): void {
    if (!this.built) {
      this.built = true;
      try {
        this.build(this.body);
      } catch (e) {
        console.error(`[panels-items] ${this.id} build failed`, e);
      }
    }
    const was = this.isOpen;
    this.isOpen = true;
    this.el.style.display = '';
    if (this.el.parentElement == null) (G.ui?.root ?? document.body).appendChild(this.el);
    if (!was) {
      this.placeDefault();
      this.scope = G.events.scope();
      this.subscribe(this.scope);
      window.addEventListener('resize', this.onResize);
    }
    this.front();
    try {
      this.onOpen(data);
      this.refresh();
    } catch (e) {
      console.error(`[panels-items] ${this.id} open failed`, e);
    }
    this.layout(false);
    // the UI shows the host element right after open(): measure again once it is visible
    requestAnimationFrame(() => {
      if (this.isOpen) this.layout(false);
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.style.display = 'none';
    this.scope?.dispose();
    this.scope = null;
    window.removeEventListener('resize', this.onResize);
    hideTips();
    try {
      this.onClose();
    } catch (e) {
      console.error(`[panels-items] ${this.id} close failed`, e);
    }
  }

  /** Bring this window above the others (the UI wraps every panel in its own .panel-host with a z-index). */
  front(): void {
    const host = this.el.parentElement;
    if (host && host.classList.contains('panel-host')) {
      let top = 0;
      document.querySelectorAll<HTMLElement>('.panel-host').forEach((h) => {
        if (h.style.display !== 'none') top = Math.max(top, Number(h.style.zIndex) || 0);
      });
      if ((Number(host.style.zIndex) || 0) < top) host.style.zIndex = String(top + 1);
    } else this.el.style.zIndex = String(++zTop);
  }

  /** Call from subscribers: refresh only when visible. */
  protected safeRefresh = (): void => {
    if (!this.isOpen) return;
    try {
      this.refresh();
    } catch (e) {
      console.error(`[panels-items] ${this.id} refresh failed`, e);
    }
  };

  private placeDefault(): void {
    const w = this.opts.width;
    const hh = this.opts.height;
    let saved: { x: number; y: number } | null = null;
    try {
      const raw = localStorage.getItem(`pi.pos.${this.id}`);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    let [px, py] = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? [saved.x, saved.y] : this.opts.pos(window.innerWidth, window.innerHeight, w, hh);
    if (!saved) {
      // cascade away from other open windows sitting on the same spot
      for (let n = 0; n < 6; n++) {
        const clash = Object.values(registry).some((p) => p && p !== this && p.isOpen && Math.abs(p.x - px) < 14 && Math.abs(p.y - py) < 14);
        if (!clash) break;
        px += 30;
        py += 30;
      }
    }
    this.x = px;
    this.y = py;
  }

  /** Apply position + fit scale (small viewports). */
  private layout(save: boolean): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const natW = this.opts.width;
    const natH = this.el.offsetHeight || this.opts.height;
    this.fit = Math.min(1, (vw - 12) / natW, (vh - 12) / natH);
    const w = natW * this.fit;
    const hh = natH * this.fit;
    this.x = clamp(this.x, 4 - w + 120, vw - 120);
    this.y = clamp(this.y, 0, Math.max(0, vh - 40));
    // keep fully on screen when it fits
    if (w < vw) this.x = clamp(this.x, 0, vw - w);
    if (hh < vh) this.y = clamp(this.y, 0, vh - hh);
    this.el.style.left = `${Math.round(this.x)}px`;
    this.el.style.top = `${Math.round(this.y)}px`;
    this.el.style.transformOrigin = '0 0';
    this.el.style.transform = this.fit < 0.999 ? `scale(${this.fit.toFixed(4)})` : '';
    if (save) {
      try {
        localStorage.setItem(`pi.pos.${this.id}`, JSON.stringify({ x: Math.round(this.x), y: Math.round(this.y) }));
      } catch {
        /* ignore */
      }
    }
  }

  private bindWindowDrag(): void {
    this.head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = this.x;
      const oy = this.y;
      this.head.classList.add('grab');
      const move = (ev: PointerEvent) => {
        this.x = ox + (ev.clientX - sx);
        this.y = oy + (ev.clientY - sy);
        this.layout(false);
      };
      const up = () => {
        this.head.classList.remove('grab');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.layout(true);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}
