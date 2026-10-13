import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import type { UIPanel } from '../../UI';
import { buildChrome, buildTabs, type Chrome } from '../../kit';
import { hideTips, sfx, clamp } from './common';

/** Every panel of this module by id (filled by registerItemPanels). */
export const registry: Record<string, ItemPanel | undefined> = {};

let zTop = 40;

export interface PanelOpts {
  title: string;
  /** css icon file inside /assets/icons */
  icon?: string;
  width: number;
  /** Natural height (the window scrolls its body when the viewport is smaller). */
  height: number;
  /** Legacy default top-left position; ignored when `dock` is set. */
  pos?(vw: number, vh: number, w: number, h: number): [number, number];
  /** UX-52b (section 7.1): default dock, top 56 px; 24 px from the edge for 'left' / 'right'. 'bottom-right' sits 24 px above the bottom edge (ElvUI bags, clear of the minimap). Default: 'center'. */
  dock?: 'left' | 'right' | 'center' | 'bottom-right';
  /** Footer key hints (section 7.6, "Tuş: açıklama"); the footer is shown only when a panel declares some. */
  hints?: string[];
  className?: string;
}

export interface TabsHandle {
  el: HTMLElement;
  set(id: string, silent?: boolean): void;
  get(): string;
  badge(id: string, text: string): void;
}

/** Tab strip used by several panels (kit `.k-tab` look). Same signature as before the UX-51 shell. */
export function makeTabs(items: { id: string; label: string; icon?: string }[], onChange: (id: string) => void, cls = ''): TabsHandle {
  const kit = buildTabs(
    items.map((t) => ({ id: t.id, label: t.label, icon: t.icon ? `/assets/icons/${t.icon}` : undefined })),
    (id) => {
      sfx('ui_tab');
      onChange(id);
    },
    items[0]?.id,
  );
  kit.el.classList.add('pi-tabs', ...cls.split(' ').filter(Boolean));
  return {
    el: kit.el,
    // set(id) always reports the change (the old helper did), even when the tab is already current
    set: (id, silent = false) => {
      if (silent || kit.current() !== id) kit.select(id, silent);
      else if (!silent) onChange(id);
    },
    get: () => kit.current(),
    badge: (id, text) => kit.badge(id, text),
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

/** Window position key (UX-51): fractions of the viewport, so a saved place survives a resolution change. */
const posKey = (id: string): string => `efsun.win.v1.${id}`;

/** Visual zoom of the HUD (`--ui-scale`, floor 0.9 like the kit window shell). */
function uiZoom(el: HTMLElement): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--ui-scale'));
  return Math.max(0.9, Number.isFinite(v) && v > 0 ? v : 1);
}

/**
 * Base class: a draggable kit window (`.k-win`, section 7.1) with a header, a close button and a body.
 * Subclasses implement build() (once), refresh() (whenever open and data changed) and subscribe() for events.
 * The frame comes from buildChrome(); the `pi-*` classes stay on the parts so the items sheet can target them.
 */
export abstract class ItemPanel implements UIPanel {
  readonly id: string;
  readonly el: HTMLDivElement;
  isOpen = false;
  protected head: HTMLDivElement;
  protected body: HTMLDivElement;
  protected titleEl: HTMLElement;
  protected scope: EventScope | null = null;
  private chrome: Chrome;
  private built = false;
  /** Visual position in viewport px (the style is written divided by the zoom). */
  private x = 0;
  private y = 0;
  private onResize = () => this.layout(false);

  constructor(id: string, protected opts: PanelOpts) {
    this.id = id;
    this.chrome = buildChrome({
      title: opts.title,
      icon: opts.icon ? `/assets/icons/${opts.icon}` : undefined,
      onClose: () => {
        sfx('ui_click');
        closePanel(this.id);
      },
    });
    this.el = this.chrome.root as HTMLDivElement;
    this.el.classList.add('pi-win', `pi-win-${id}`);
    if (opts.className) this.el.classList.add(...opts.className.split(' '));
    this.el.style.width = `${opts.width}px`;
    // the kit default size class (M) would pin the height to 600 px: item windows size to their content (max-height from the kit)
    this.el.style.height = 'auto';
    this.el.style.display = 'none';
    this.head = this.chrome.head as HTMLDivElement;
    this.head.classList.add('pi-head');
    this.titleEl = this.chrome.titleEl;
    this.titleEl.classList.add('pi-title');
    this.body = this.chrome.body as HTMLDivElement;
    this.body.classList.add('pi-body');
    // item windows keep their buttons in the body: the footer (hints only) shows when the panel declares hints
    const hints = opts.hints ?? [];
    this.chrome.foot.hidden = hints.length === 0;
    if (hints.length) this.chrome.setHints(hints);
    // the close button must not start a drag of the header
    this.head.querySelector('.k-x')?.addEventListener('pointerdown', (e) => e.stopPropagation());
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
    this.chrome.setTitle(t);
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

  /** Saved place (fractions of the viewport) or the dock / pos() default, cascaded away from other open windows. */
  private placeDefault(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = this.opts.width;
    const saved = this.loadPos();
    if (saved) {
      this.x = saved.fx * vw;
      this.y = saved.fy * vh;
      return;
    }
    let [px, py] = this.opts.pos && !this.opts.dock ? this.opts.pos(vw, vh, w, this.opts.height) : this.dockPos(this.opts.dock ?? 'center', vw, vh, w, this.opts.height);
    // cascade away from other open windows sitting on the same spot
    for (let n = 0; n < 6; n++) {
      const clash = Object.values(registry).some((p) => p && p !== this && p.isOpen && Math.abs(p.x - px) < 14 && Math.abs(p.y - py) < 14);
      if (!clash) break;
      px += 28;
      py += 28;
    }
    this.x = px;
    this.y = py;
  }

  private dockPos(dock: 'left' | 'right' | 'center' | 'bottom-right', vw: number, vh: number, w: number, h: number): [number, number] {
    if (dock === 'left') return [24, 56];
    if (dock === 'right') return [Math.max(8, vw - w - 24), 56];
    if (dock === 'bottom-right') return [Math.max(8, vw - w - 24), Math.max(56, vh - h - 24)];
    return [Math.max(8, (vw - w) / 2), 56];
  }

  private loadPos(): { fx: number; fy: number } | null {
    try {
      const raw = localStorage.getItem(posKey(this.id));
      if (!raw) return null;
      const v = JSON.parse(raw) as { fx?: unknown; fy?: unknown };
      return typeof v.fx === 'number' && typeof v.fy === 'number' ? { fx: v.fx, fy: v.fy } : null;
    } catch {
      return null;
    }
  }

  /**
   * Keeps the window on screen and writes its left / top. The `.pi-win` rule carries the HUD zoom, so the style values are
   * divided by it. Windows larger than the viewport scroll their body instead of being scaled.
   */
  private layout(save: boolean): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const z = uiZoom(this.el);
    const rect = this.el.getBoundingClientRect();
    const visW = rect.width || this.opts.width * z;
    const visH = rect.height || this.opts.height * z;
    this.x = clamp(this.x, 0, Math.max(0, vw - visW));
    this.y = clamp(this.y, 0, Math.max(0, vh - Math.min(40, visH)));
    if (visH < vh) this.y = clamp(this.y, 0, vh - visH);
    this.el.style.left = `${Math.round(this.x / z)}px`;
    this.el.style.top = `${Math.round(this.y / z)}px`;
    if (save) {
      try {
        localStorage.setItem(posKey(this.id), JSON.stringify({ fx: this.x / vw, fy: this.y / vh }));
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
