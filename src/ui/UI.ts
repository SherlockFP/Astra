import * as THREE from 'three';
import './styles/tokens.css';
import './styles/kit.css';
import './styles/hud.css';
import './styles/widgets.css';
import './styles/overlays.css';
import './styles/hud-extras.css';
import './styles/hud-metin2.css';
import './styles/hud-meter.css';
import './styles/hud-bubbles.css';
import { G } from '../game/G';
import { clearLocalHardTarget } from '../game/PlayerController';
import { isTextTarget, keysBlocked, npcTooFar, skillKeysBlocked, type KeysGateState } from '../core/inputGate';
import type { ItemInstance } from '../types/items';
import type { SkillDef } from '../types/skills';
import type { Actor } from '../entities/Actor';
import { RARITY_COLORS } from '../types/common';
import { registerPanels } from './panels';
import { createHUD, type HudApi } from './hud';
import { div } from './widgets/dom';
import { runClassColorAsserts } from './widgets/classColors';
import { runNumFormatAsserts } from './widgets/numFormat';
import { Toasts, type ToastKind } from './widgets/Toasts';
import { Modal } from './widgets/Modal';
import { LoadingScreen } from './widgets/Loading';
import type { LoadingZone } from './widgets/loadingZone';
import { TooltipLayer } from './widgets/TooltipLayer';
import { WorldLabels } from './widgets/WorldLabels';
import { BubbleLayer, type BubbleHandle, type BubbleOpts } from './widgets/Bubbles';
import { ChatBubbles } from './hud/ChatBubbles';
import { bannerLaneBusy, levelUpBannerSwallows } from './hud/Banners';
import { Nameplates } from './widgets/Nameplates';
import { CastTracker } from './widgets/CastBar';
import { itemTooltipHTML, skillTooltipHTML } from './widgets/tooltips';

/** A DOM element that follows a 3D object on screen (loot labels, NPC names, interaction markers). */
export interface WorldLabelHandle {
  readonly el: HTMLElement;
  setText(html: string): void;
  setVisible(v: boolean): void;
  remove(): void;
}

export type UIMode = 'loading' | 'menu' | 'town' | 'dungeon';

/** A full-screen or windowed panel (inventory, talents, vendor...). Implemented in ui/panels/. */
export interface UIPanel {
  readonly id: string;
  readonly el: HTMLElement;
  /** Panels that pause nothing but free the cursor. */
  isOpen: boolean;
  open(data?: unknown): void;
  close(): void;
  update?(dt: number): void;
}

interface PanelRec {
  panel: UIPanel;
  host: HTMLElement;
  wasOpen: boolean;
  openedAt: number;
}

/** Quest messages (accept / ready / done, bounties, world quests, Av Defteri) use the quest toast lane (upper centre, above the banner lane). */
const QUEST_TOAST_RE = /^(Görev|Dünya görevi|Av Defteri)/;
/** Achievement unlocks ("Başarım kazanıldı: …", "3 başarım kazanıldı: …") use their own lane at the bottom centre. */
const ACH_TOAST_RE = /^(\d+ )?[Bb]aşarım kazanıldı/;
/** Quest toasts held back while a window covers their slot or a centre banner shows: at most this many, each for at most this long. */
const QUEST_PENDING_MAX = 3;
const QUEST_PENDING_MS = 15000;
/** Toasts held back while a centre banner shows (the generic toast lane never overlaps the banner lane): at most this many, each for at most this long, shown one per LANE_STAGGER_MS. */
const LANE_HELD_MAX = 4;
const LANE_HELD_MS = 15000;
const LANE_STAGGER_MS = 350;

/** Input action -> panel id for the global hotkeys handled in UI.update(). */
const HOTKEYS: { action: 'inventory' | 'character' | 'talents' | 'skills' | 'map' | 'party' | 'mplus' | 'quests' | 'groupFinder' | 'guide'; panel: string }[] = [
  { action: 'inventory', panel: 'inventory' },
  { action: 'character', panel: 'character' },
  { action: 'talents', panel: 'talents' },
  { action: 'skills', panel: 'skills' },
  { action: 'map', panel: 'map' },
  { action: 'party', panel: 'party' },
  { action: 'mplus', panel: 'mplusInfo' },
  { action: 'quests', panel: 'questlog' },
  // UI_REDESIGN Appendix A: I = Group Finder (panel lands in UX-40), Period = guide panel (UX-21).
  { action: 'groupFinder', panel: 'finder' },
  { action: 'guide', panel: 'guide' },
];

/** Close buttons of the panels: base.ts windowFrame (`.pg-x`) and the item windows (`.pi-x`, panels/items/PanelBase.ts). */
const PANEL_CLOSE_SEL = '.pg-x, .pi-x';

/** Panel host listener: a press / release / click on a close button stops here (no click-through below the panel). */
function stopAtPanelClose(e: Event): void {
  const t = e.target;
  if (t instanceof Element && t.closest(PANEL_CLOSE_SEL)) e.stopPropagation();
}

/**
 * DOM UI root: HUD (ui/hud/*), panels (ui/panels/*), tooltips, toasts, loading screen, context menus.
 * WoW/Metin2-inspired dark-fantasy styling (ui/styles/*.css), Turkish text, scales with the window.
 * Freeing the cursor: while any panel is open the PlayerController unlocks the pointer.
 * OWNER: hud module (panels are registered by the panels module via ui/panels/index.ts registerPanels(ui)).
 *
 * Layers (z-order, bottom to top): world (labels/nameplates) < hud < menu (scenes' DOM) < panels < toasts < modal < tooltip < loading.
 */
export class UI {
  root!: HTMLElement;
  mode: UIMode = 'loading';
  worldLayer!: HTMLElement;
  hudLayer!: HTMLElement;
  menuLayer!: HTMLElement;
  panelLayer!: HTMLElement;
  topLayer!: HTMLElement;
  hud!: HudApi;
  /** Canvas size in CSS px (kept fresh every frame). */
  viewW = 1280;
  viewH = 720;
  /** Effective HUD zoom (window-fit scale x userScale); written by the HUD. */
  scale = 1;
  /** Player-chosen UI size multiplier 0.7..1.5 (persisted in localStorage, set with setUserScale). */
  userScale = 1;

  private panels = new Map<string, PanelRec>();
  private openOrder: string[] = [];
  private tooltip!: TooltipLayer;
  private toasts!: Toasts;
  /** Quest toasts: own top-centre slot (under the zone title), shown only while no window covers it. */
  private questToasts!: Toasts;
  private questToastLayer!: HTMLElement;
  /** Achievement toasts: own bottom-centre lane, never held (it is clear of the banner lane). */
  private achToasts!: Toasts;
  private questPending: { text: string; kind: ToastKind; at: number }[] = [];
  /** Non-quest toasts held while a centre banner shows; they follow it one by one. */
  private laneHeld: { text: string; kind: ToastKind; at: number }[] = [];
  private laneNextAt = 0;
  private questCheckAt = 0;
  private modal!: Modal;
  private loading!: LoadingScreen;
  private labels!: WorldLabels;
  /** Speech bubbles above heads (UX-30); fed by ChatBubbles (chat lines) and NPC barks. */
  private bubbles!: BubbleLayer;
  private chatBubbles!: ChatBubbles;
  private plates!: Nameplates;
  /** Shared enemy cast registry (nameplates, target and boss frames). */
  readonly casts = new CastTracker();
  private _v = new THREE.Vector3();
  private lastReal = performance.now();
  private initialized = false;
  private zIndexCounter = 10;
  /**
   * performance.now() until which openPanel('gameMenu') is ignored after an Esc press closed a panel. A browser that releases the pointer
   * lock on the same Esc fires 'pointerlockchange' AFTER our update already closed the panel; PlayerController would then open the game
   * menu in the very same press (QA: 'Esc closed M+ info and opened the menu'). Esc closes the top panel OR opens the menu, never both.
   */
  private escGuardUntil = 0;
  /**
   * An Esc press seen by our own keydown listener since the last update. Input.pressed('menu') alone can miss a press when its
   * held-key set still holds 'Escape' from a release the page never got (pointer lock exit, focus change); this flag does not.
   */
  private escQueued = false;
  /** The NPC whose talk window is open (bindNpcPanel); the window closes once the player is out of NPC_TETHER_RANGE. */
  private npcTether: { panelId: string; npc: { position: { x: number; z: number }; removed?: boolean } } | null = null;
  /** The engine canvas whose size feeds viewW / viewH, and the observer that follows its size changes. */
  private viewCanvas: HTMLCanvasElement | null = null;
  private viewRO: ResizeObserver | null = null;

  /** Build DOM, inject CSS, create HUD + register panels. */
  init(root: HTMLElement): void {
    if (this.initialized) return;
    this.initialized = true;
    this.root = root;
    root.lang = 'tr'; // Turkish casing for text-transform and toLocaleUpperCase
    if (import.meta.env.DEV) {
      runClassColorAsserts();
      runNumFormatAsserts();
    }
    try {
      const saved = parseFloat(localStorage.getItem('efsun.uiScale') ?? '');
      if (Number.isFinite(saved)) this.userScale = Math.max(0.7, Math.min(1.5, saved));
    } catch { /* storage blocked */ }
    root.classList.add('ui-ready');
    root.dataset.mode = this.mode;
    this.worldLayer = div('layer layer-world', root);
    this.hudLayer = div('layer layer-hud', root);
    this.menuLayer = div('layer layer-menu', root);
    this.panelLayer = div('layer layer-panels', root);
    this.topLayer = div('layer layer-top', root);
    const toastLayer = div('toasts', this.topLayer);
    this.questToastLayer = div('toasts toasts-quest', this.topLayer);
    this.questToasts = new Toasts(this.questToastLayer);
    this.achToasts = new Toasts(div('toasts toasts-ach', this.topLayer));
    const modalLayer = div('layer layer-modal', root);
    const ttLayer = div('layer layer-tooltip', root);
    const loadLayer = div('layer layer-loading', root);

    this.tooltip = new TooltipLayer(ttLayer);
    this.toasts = new Toasts(toastLayer);
    this.modal = new Modal(modalLayer);
    this.loading = new LoadingScreen(loadLayer);
    this.labels = new WorldLabels(this, this.worldLayer);
    this.plates = new Nameplates(this, this.worldLayer);
    this.hud = createHUD(this);
    this.hud.setVisible(false);
    this.bubbles = new BubbleLayer(this);
    this.chatBubbles = new ChatBubbles(this);

    try {
      registerPanels(this);
    } catch (e) {
      console.error('[ui] registerPanels failed', e);
    }

    const ev = G.events;
    ev.on('ui:toast', ({ text, kind }) => this.toast(text, kind));
    ev.on('ui:openPanel', ({ panel, data }) => this.openPanel(panel, data));
    ev.on('ui:closePanels', () => this.closeAll());
    ev.on('scene:changed', ({ to }) => this.setMode(to));
    ev.on('scene:leaving', () => {
      this.closeAll();
      this.plates.clear();
      this.bubbles.clear();
      this.chatBubbles.clear();
      this.modal.cancelAll();
      this.hideTooltip();
    });
    ev.on('settings:changed', () => this.applyScale());
    window.addEventListener('resize', () => this.updateView());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !e.repeat) this.escQueued = true;
    });
    this.updateView();
  }

  // ---- modes ----

  setMode(mode: UIMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.dataset.mode = mode;
    const inGame = mode === 'town' || mode === 'dungeon';
    this.hud.setVisible(inGame);
    if (!inGame) {
      this.closeAll();
      this.plates.clear();
      this.bubbles.clear();
      this.chatBubbles.clear();
    }
  }

  // ---- panels ----

  registerPanel(panel: UIPanel): void {
    if (this.panels.has(panel.id)) {
      console.warn(`[ui] panel "${panel.id}" registered twice; replacing`);
      this.panels.get(panel.id)!.host.remove();
    }
    const host = div('panel-host', this.panelLayer);
    host.dataset.panel = panel.id;
    host.style.display = 'none';
    // the window root is a UI target as a whole: a click on its background must not reach the game as an attack
    // (Input checks the class, not the computed style). Pass-through panels (death card) keep their own rules.
    if (!panel.el.classList.contains('pg-pass') && !panel.el.classList.contains('ui-passthrough')) panel.el.classList.add('ui-capture');
    host.appendChild(panel.el);
    // a close (X) press / click ends at the X: it must not click through to the minimap, the world map or the game underneath.
    // Releases are left alone: Input must still see the mouse-up that matches a press it recorded.
    for (const type of ['mousedown', 'pointerdown', 'click'] as const) {
      host.addEventListener(type, stopAtPanelClose);
    }
    this.panels.set(panel.id, { panel, host, wasOpen: false, openedAt: 0 });
    if (panel.isOpen) this.syncPanel(this.panels.get(panel.id)!);
  }

  getPanel<T extends UIPanel = UIPanel>(id: string): T | undefined {
    return this.panels.get(id)?.panel as T | undefined;
  }

  panelIds(): string[] {
    return [...this.panels.keys()];
  }

  openPanel(id: string, data?: unknown): void {
    const rec = this.panels.get(id);
    if (!rec) {
      console.warn(`[ui] openPanel: unknown panel "${id}"`);
      return;
    }
    // same-press guard: the lock-release path (PlayerController) must not open the menu right after Esc closed a panel
    if (id === 'gameMenu' && !rec.panel.isOpen && performance.now() < this.escGuardUntil) return;
    this.hideTooltip();
    try {
      if (!rec.panel.isOpen || data !== undefined) rec.panel.open(data);
    } catch (e) {
      console.error(`[ui] panel "${id}" open() failed`, e);
    }
    this.syncPanel(rec, true);
  }

  closePanel(id: string): void {
    const rec = this.panels.get(id);
    if (!rec) return;
    try {
      if (rec.panel.isOpen) rec.panel.close();
    } catch (e) {
      console.error(`[ui] panel "${id}" close() failed`, e);
    }
    this.syncPanel(rec, true);
  }

  togglePanel(id: string, data?: unknown): void {
    if (this.isPanelOpen(id)) this.closePanel(id);
    else this.openPanel(id, data);
  }

  closeAll(): void {
    for (const rec of this.panels.values()) {
      if (rec.panel.isOpen) {
        try {
          rec.panel.close();
        } catch (e) {
          console.error(`[ui] panel "${rec.panel.id}" close() failed`, e);
        }
      }
      this.syncPanel(rec);
    }
    this.hideTooltip();
  }

  isPanelOpen(id: string): boolean {
    return !!this.panels.get(id)?.panel.isOpen;
  }

  /**
   * Id of the most recently opened panel that is still open (Esc closes this one). Falls back to the highest-stacked open
   * panel when the open-order stack misses one (a panel opened straight through its own open(), before the next sync).
   */
  topPanelId(): string | null {
    for (let i = this.openOrder.length - 1; i >= 0; i--) {
      const id = this.openOrder[i];
      if (this.isPanelOpen(id)) return id;
    }
    let best: string | null = null;
    let bestZ = -Infinity;
    for (const rec of this.panels.values()) {
      if (!rec.panel.isOpen) continue;
      const z = Number(rec.host.style.zIndex) || 0;
      if (z > bestZ) {
        bestZ = z;
        best = rec.panel.id;
      }
    }
    return best;
  }

  /** Mirror a panel's isOpen into its host element, the open-order stack and the 'ui:panel' event. */
  private syncPanel(rec: PanelRec, sound = false): void {
    const open = !!rec.panel.isOpen;
    if (open === rec.wasOpen) return;
    rec.wasOpen = open;
    const id = rec.panel.id;
    if (open) {
      rec.host.style.display = '';
      rec.host.style.zIndex = String(++this.zIndexCounter);
      rec.openedAt = performance.now();
      this.openOrder = this.openOrder.filter((x) => x !== id);
      this.openOrder.push(id);
      if (sound) this.playSfx('ui_open');
    } else {
      rec.host.style.display = 'none';
      this.openOrder = this.openOrder.filter((x) => x !== id);
      this.hideTooltip();
      if (sound) this.playSfx('ui_close');
    }
    this.root.classList.toggle('has-panel', this.openOrder.length > 0);
    G.events.emit('ui:panel', { panel: id, open });
  }

  /** True if any panel/menu/chat input/modal wants the cursor. */
  wantsCursor(): boolean {
    if (this.mode === 'menu' || this.mode === 'loading') return true;
    if (this.modal.isOpen || this.hud?.chat.isFocused) return true;
    // the HUD layout editor works with the mouse (drags, wheel, toolbar)
    if (this.hud?.editing) return true;
    for (const rec of this.panels.values()) if (rec.panel.isOpen) return true;
    return false;
  }

  /**
   * True when the keyboard game actions (movement, F interact) must be ignored. WoW: open windows do NOT block them; only a
   * text field, the menu / loading screens, the layout editor and a modal confirm box do (inputGate.ts).
   */
  gameKeysBlocked(): boolean {
    return keysBlocked(this.gateState());
  }

  /** WoW: skill and potion keys (ActionBar hotkeys, casting) follow the movement rules, plus the game menu (inputGate.ts). */
  skillKeysBlocked(): boolean {
    return skillKeysBlocked(this.gateState());
  }

  private gateState(): KeysGateState {
    return {
      uiMode: this.mode,
      editing: !!this.hud?.editing,
      modal: this.modal.isOpen,
      chatFocused: !!this.hud?.chat.isFocused,
      textFocused: isTextTarget(typeof document !== 'undefined' ? document.activeElement : null),
      panelsOpen: this.openOrder.length,
      gameMenuOpen: this.isPanelOpen('gameMenu'),
    };
  }

  /** WoW: a talk window (gossip, quest, vendor) belongs to the NPC that opened it and closes when the player walks away. */
  bindNpcPanel(panelId: string, npc: { position: { x: number; z: number }; removed?: boolean }): void {
    this.npcTether = { panelId, npc };
  }

  private checkNpcTether(): void {
    const t = this.npcTether;
    if (!t) return;
    if (!this.isPanelOpen(t.panelId) || t.npc.removed) {
      this.npcTether = null;
      return;
    }
    const p = G.player;
    if (!p || !npcTooFar(p.position, t.npc.position)) return;
    this.npcTether = null;
    this.closePanel(t.panelId);
    this.toast('Çok uzak', 'warning');
  }

  // ---- toasts ----

  toast(text: string, kind: ToastKind = 'info'): void {
    // the level-up banner already lists the level and its new abilities: those toasts are not shown twice
    if (levelUpBannerSwallows(text)) return;
    if (QUEST_TOAST_RE.test(text)) {
      this.questPending.push({ text, kind, at: performance.now() });
      while (this.questPending.length > QUEST_PENDING_MAX) this.questPending.shift();
    } else if (ACH_TOAST_RE.test(text)) {
      this.achToasts.show(text, kind);
    } else if (kind === 'levelup' || bannerLaneBusy()) {
      // level-up toasts come before the level banner is queued (Progression), so they wait for the lane too
      this.laneHeld.push({ text, kind, at: performance.now() });
      while (this.laneHeld.length > LANE_HELD_MAX) this.laneHeld.shift();
    } else {
      this.toasts.show(text, kind);
    }
    if (kind === 'error') this.playSfx('ui_error', 0.5);
  }

  /** Shows held lane toasts (see toast()) one by one once no level-up banner is up. */
  private flushLaneToasts(now: number): void {
    if (!this.laneHeld.length) return;
    this.laneHeld = this.laneHeld.filter((t) => now - t.at < LANE_HELD_MS);
    if (!this.laneHeld.length || bannerLaneBusy() || now < this.laneNextAt) return;
    const t = this.laneHeld.shift()!;
    this.toasts.show(t.text, t.kind);
    this.laneNextAt = now + LANE_STAGGER_MS;
  }

  /** Shows held quest toasts once no open window (the docked quest log aside) covers their slot; stale ones are dropped. */
  private flushQuestToasts(now: number): void {
    if (!this.questPending.length || now < this.questCheckAt) return;
    this.questCheckAt = now + 200;
    this.questPending = this.questPending.filter((t) => now - t.at < QUEST_PENDING_MS);
    if (!this.questPending.length || this.questSlotCovered() || bannerLaneBusy()) return;
    for (const t of this.questPending.splice(0)) this.questToasts.show(t.text, t.kind);
  }

  /** True when an open window sits over the quest toast slot (a dialog must never be covered by a quest toast). */
  private questSlotCovered(): boolean {
    const at = this.questToastLayer.getBoundingClientRect();
    const cx = at.left + at.width / 2;
    const x0 = cx - 300;
    const x1 = cx + 300;
    const y0 = at.top;
    const y1 = at.top + 72;
    for (const rec of this.panels.values()) {
      if (!rec.panel.isOpen || rec.panel.id === 'questlog') continue;
      for (const w of Array.from(rec.host.querySelectorAll<HTMLElement>('.pg-win'))) {
        const r = w.getBoundingClientRect();
        if (r.left < x1 && r.right > x0 && r.top < y1 && r.bottom > y0) return true;
      }
    }
    return false;
  }

  /** Toast with trusted HTML (rarity-coloured spans). */
  toastHTML(html: string, kind: ToastKind = 'info'): void {
    this.toasts.show('', kind, html);
  }

  // ---- tooltips ----

  /** Generic tooltip at screen position (HTML string). */
  showTooltip(html: string, x: number, y: number): void {
    this.tooltip.show(html, x, y);
  }

  /** Tooltip bound to an owner element: hideTooltipIf(owner) only hides it if that owner showed it. */
  showTooltipFor(owner: object, html: string, x: number, y: number): void {
    this.tooltip.show(html, x, y, { owner });
  }

  hideTooltip(): void {
    this.tooltip.hide();
  }

  hideTooltipIf(owner: object): void {
    if (this.tooltip.owner === owner || this.tooltip.owner === null) this.tooltip.hide();
  }

  /** WoW-style item tooltip HTML (with comparison against equipped). */
  itemTooltipHTML(item: ItemInstance, compare?: ItemInstance | null): string {
    return itemTooltipHTML(item, compare);
  }

  /**
   * Show an item tooltip at the cursor. With `compare` (the equipped item) the tooltip lists green/red deltas and, when
   * `sideBySide` (default), also shows the equipped item's own tooltip next to it.
   */
  showItemTooltip(item: ItemInstance, x: number, y: number, opts: { compare?: ItemInstance | null; sideBySide?: boolean; owner?: object } = {}): void {
    const compare = opts.compare ?? null;
    const html = itemTooltipHTML(item, compare);
    const rc = RARITY_COLORS[item.rarity] ?? '';
    let html2: string | undefined;
    let rc2: string | undefined;
    if (compare && opts.sideBySide !== false) {
      html2 = itemTooltipHTML(compare, null, 'Kuşanılmış');
      rc2 = RARITY_COLORS[compare.rarity] ?? '';
    }
    this.tooltip.show(html, x, y, { owner: opts.owner, rc, html2, rc2 });
  }

  /** Skill tooltip HTML (cost, cooldown, range, description with estimated numbers). */
  skillTooltipHTML(def: SkillDef, bindLabel?: string): string {
    return skillTooltipHTML(def, G.player, bindLabel);
  }

  // ---- world-anchored DOM ----

  /**
   * Floating DOM label anchored to an object (offset in world units above its origin).
   * Used for loot names (clickable, rarity coloured), NPC names/titles, portal names, quest markers.
   * Layout (WorldLabels.update): hidden beyond `maxDistance` (default 28 m), opaque to 70 % of it and faded to 0 at 100 %;
   * hidden behind the camera; screen-space declutter so labels never sit on each other: the hovered / Tab-targeted one and
   * the nearest ones are placed first, an overlapping label is lifted up to 3 steps and hidden if it still does not fit.
   * `stackGroup` is accepted for existing callers; overlaps are now resolved for every label by the declutter.
   */
  addWorldLabel(
    object: THREE.Object3D,
    html: string,
    opts: { offsetY?: number; className?: string; onClick?: () => void; maxDistance?: number; stackGroup?: string } = {},
  ): WorldLabelHandle {
    return this.labels.add(object, html, opts);
  }

  /**
   * Speech bubble over `anchor` (UX-30 §5.2): kinds say / party / yell / npc / typing, 80-character limit (npc 120),
   * lifetime from the text length unless `seconds` is given, at most 2 per speaker and 6 on screen.
   */
  say(anchor: THREE.Object3D, o: BubbleOpts): BubbleHandle {
    return this.bubbles.say(anchor, o);
  }

  /** Health bar + name above an actor (enemies, party members). Auto-removed when the actor is removed. */
  addNameplate(actor: Actor, opts?: { showName?: boolean; color?: string }): { remove(): void } {
    return this.plates.addManual(actor, opts);
  }

  // ---- loading / modal ----

  /** Loading screen with progress 0..1. */
  showLoading(progress: number, label?: string, image?: string): void {
    this.loading.show(progress, label, image);
  }

  /** Scene-change loading: the zone's name, level band and backdrop, then the usual progress (0..1). */
  showZoneLoading(zone: LoadingZone | null, progress: number, label?: string): void {
    this.loading.setZone(zone);
    this.loading.show(progress, label ?? zone?.name ?? '');
  }

  hideLoading(): void {
    this.loading.hide();
  }

  /** Modal confirm dialog. */
  confirm(text: string, okLabel = 'Evet', cancelLabel = 'Hayır'): Promise<boolean> {
    return this.modal.ask(text, okLabel, cancelLabel);
  }

  // ---- misc ----

  /** Coloured screen-edge flash (loot of rare+ rarity, special events). */
  flashEdge(color: string, strength = 1): void {
    this.hud?.flashEdge(color, strength);
  }

  /** Project a world position to canvas CSS px. Returns false when behind the camera / outside the depth range. */
  projectWorld(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    const cam = this.camera;
    if (!cam) return false;
    this._v.set(x, y, z).project(cam);
    if (this._v.z > 1 || this._v.z < -1) return false;
    out.x = (this._v.x * 0.5 + 0.5) * this.viewW;
    out.y = (-this._v.y * 0.5 + 0.5) * this.viewH;
    return true;
  }

  get camera(): THREE.Camera | null {
    return (G.engine?.activeCamera as THREE.Camera | undefined) ?? null;
  }

  /** Internal: effective zoom computed by the HUD. */
  setScale(s: number): void {
    this.scale = s;
    this.applyScale();
  }

  /** Player UI size multiplier (0.7..1.5). The settings panel may expose it; persisted across sessions. */
  setUserScale(s: number): void {
    this.userScale = Math.max(0.7, Math.min(1.5, Number.isFinite(s) ? s : 1));
    try {
      localStorage.setItem('efsun.uiScale', String(this.userScale));
    } catch { /* storage blocked */ }
    this.hud?.rescale();
  }

  private applyScale(): void {
    if (!this.root) return;
    this.root.style.setProperty('--ui-scale', this.scale.toFixed(3));
    this.tooltip.setScale(this.scale);
  }

  private updateView(): void {
    const c = G.engine?.canvas;
    if (c && c.clientWidth > 0) {
      this.viewW = c.clientWidth;
      this.viewH = c.clientHeight;
    } else {
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
    }
  }

  /**
   * Keeps viewW / viewH current without reading the layout every frame: the engine canvas is observed (ResizeObserver reports its
   * size after layout, only when it changes), and the per-frame call just checks that the engine canvas is still the same element.
   */
  private trackView(): void {
    const c = G.engine?.canvas ?? null;
    if (c === this.viewCanvas) return;
    this.viewCanvas = c;
    this.viewRO?.disconnect();
    this.updateView();
    if (c && typeof ResizeObserver !== 'undefined') {
      this.viewRO ??= new ResizeObserver(() => this.updateView());
      this.viewRO.observe(c);
    }
  }

  private playSfx(id: string, volume = 0.7): void {
    try {
      (G.audio as unknown as { play(id: string, o?: { volume?: number }): void }).play(id, { volume });
    } catch { /* ignore */ }
  }

  private handleHotkeys(now: number): void {
    const input = G.input;
    // read (and clear) the Esc press every frame, even when no game hotkey can run, so a stale press never fires later
    const escPressed = this.escQueued || (!!input && input.pressed('menu'));
    this.escQueued = false;
    if (!input) return;
    const inGame = (this.mode === 'town' || this.mode === 'dungeon') && !this.loading.isVisible && !this.modal.isOpen;
    if (!inGame) return;
    const chat = this.hud.chat;
    const consumed = now - chat.consumedAt < 150 || now - this.modal.closedAt < 150;
    if (escPressed && !consumed) {
      const top = this.topPanelId();
      if (top) {
        // the game menu opened by this very press (lock release path) must not be closed again by it
        const fresh = top === 'gameMenu' && now - (this.panels.get(top)?.openedAt ?? 0) < 150;
        if (!fresh) {
          this.escGuardUntil = 0; // a panel's own redirect to the menu (death card) is deliberate
          this.closePanel(top);
          this.escGuardUntil = performance.now() + 300; // set AFTER closing: a panel may redirect to the menu itself (death card)
        }
      } else if (G.player) {
        // final fallback: no panel, nothing else took the press. A selected (hard) target is dropped first (WoW); the next Esc opens the menu.
        if (clearLocalHardTarget()) {
          this.escGuardUntil = performance.now() + 300; // a browser that also releases the pointer lock on this Esc must not open the menu now
        } else {
          this.escGuardUntil = 0; // a deliberate Esc always opens the menu
          this.openPanel('gameMenu');
        }
      }
    }
    if (input.pressed('chat') && !consumed && !chat.isFocused) chat.focus();
    if (chat.isFocused) return;
    for (const hk of HOTKEYS) {
      // Panels that have not been registered yet (finder, guide) are skipped silently instead of warning every press.
      if (input.pressed(hk.action) && this.panels.has(hk.panel)) this.togglePanel(hk.panel);
    }
  }

  update(_dt: number): void {
    if (!this.initialized) return;
    const now = performance.now();
    const rdt = Math.min(0.1, (now - this.lastReal) / 1000);
    this.lastReal = now;
    this.trackView();
    const cam = this.camera;
    if (cam) cam.updateMatrixWorld();

    this.handleHotkeys(now);
    this.checkNpcTether();

    // mirror panel state changes made by the panels themselves; tick open panels
    for (const rec of this.panels.values()) {
      this.syncPanel(rec);
      if (rec.panel.isOpen && rec.panel.update) {
        try {
          rec.panel.update(rdt);
        } catch (e) {
          console.error(`[ui] panel "${rec.panel.id}" update failed`, e);
          rec.panel.update = undefined;
        }
      }
    }

    try {
      this.hud.update(rdt);
    } catch (e) {
      console.error('[ui] hud update failed', e);
    }
    const hud = this.hud;
    if (this.mode === 'town' || this.mode === 'dungeon') {
      this.bubbles.setOwnHidden(hud.chat.isFocused);
      this.chatBubbles.update();
      this.bubbles.update(now, rdt);
      this.plates.update(now, this.casts, hud.hover, hud.bossEntityId);
      this.labels.update(now, rdt, { hoverId: hud.hover?.id ?? null, targetId: G.player?.targetId ?? null });
    }
    this.toasts.update(now);
    this.achToasts.update(now);
    this.flushQuestToasts(now);
    this.flushLaneToasts(now);
    this.loading.update(rdt);

    // a tooltip whose owner element vanished or a locked pointer must not linger
    if (this.tooltip.isVisible) {
      const o = this.tooltip.owner as { isConnected?: boolean } | null;
      if ((o && o.isConnected === false) || G.input?.isLocked()) this.tooltip.hide();
    }
  }
}
