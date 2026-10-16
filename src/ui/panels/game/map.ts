import { G } from '../../../game/G';
import { mapGridOf, type NavGrid } from '../../../world/NavGrid';
import type { DungeonDef } from '../../../types/dungeons';
import { TILE_SIZE } from '../../../types/dungeons';
import { DUNGEONS, OPEN_ZONES, getDungeon } from '../../../data/dungeons';
import { TOWN } from '../../../data/town';
import { CLASS_META, GamePanel, button, clampN, h, icon, sfx, windowFrame } from './base';
import type { Enemy } from '../../../entities/Enemy';
import { questTargetMarks, regionKnown } from '../../hud/questMarks';
import { peekMarket } from '../../../systems/Market';
import { atlasFor, heightsOf } from '../../map/atlas';
import { exploredPct, fogCanvasFor, tickExploration } from '../../map/exploration';
import { badge, glyph, questRing, arrow as glyphArrow, waypointPin } from '../../map/glyphs';
import { livePins, pinTracked, questPins, staticPins, type Pin } from '../../map/worldPins';
import { TRACK_LABEL, type FilterId, type TrackMode } from '../../map/mapStyle';
import { cycleTrackMode, clearWaypoint, getTrackMode, getWaypoint, setWaypoint } from '../../map/mapPrefs';
import { activeEventPins } from '../../../scenes/world/EventCalendar';
import { activeVignettePins } from '../../../scenes/world/Vignettes';

/* ------------------------------------------------------------------ */
/* Exploration tracking (fog of war) — runs even while the panel is closed */
/* ------------------------------------------------------------------ */

const explored = new WeakMap<NavGrid, Uint8Array>();
let version = 0;

function exploredOf(nav: NavGrid): Uint8Array {
  let e = explored.get(nav);
  if (!e) {
    e = new Uint8Array(nav.cols * nav.rows);
    explored.set(nav, e);
  }
  return e;
}

function currentDungeon(): DungeonDef | null {
  const id = G.mplus?.state?.dungeonId;
  const byId = id ? getDungeon(id) : undefined;
  if (byId) return byId;
  const nav = G.world?.nav;
  if (!nav) return null;
  for (const d of [...Object.values(DUNGEONS), ...Object.values(OPEN_ZONES ?? {})]) {
    if (Math.abs(d.grid.w * TILE_SIZE - nav.cols * nav.cellSize) < 2 && Math.abs(d.grid.h * TILE_SIZE - nav.rows * nav.cellSize) < 2) return d;
  }
  return null;
}

/** The open-world map being played (its def has a `world` extra), or null. */
function openWorldNow(): DungeonDef | null {
  const d = currentDungeon();
  return d?.world ? d : null;
}

const inTown = () => G.scenes?.current?.id === 'town';

/** Reveal cells around the local player (radius) and the whole room the player stands in. */
function reveal(): void {
  const w = G.world;
  const p = G.player ?? w?.localPlayer;
  if (!w || !p) return;
  const nav = w.nav;
  const ex = exploredOf(nav);
  const px = p.position.x;
  const pz = p.position.z;
  const R = 11;
  const c0 = nav.cx(px - R), c1 = nav.cx(px + R), r0 = nav.cz(pz - R), r1 = nav.cz(pz + R);
  let changed = false;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (!nav.inBounds(c, r)) continue;
      const i = r * nav.cols + c;
      if (ex[i]) continue;
      if (Math.hypot(nav.centerX(c) - px, nav.centerZ(r) - pz) <= R && nav.lineOfSight(px, pz, nav.centerX(c), nav.centerZ(r))) {
        ex[i] = 1;
        changed = true;
      }
    }
  const def = currentDungeon();
  if (def && !def.world) {
    for (const room of def.rooms) {
      const x0 = room.rect.x * TILE_SIZE, z0 = room.rect.z * TILE_SIZE, x1 = (room.rect.x + room.rect.w) * TILE_SIZE, z1 = (room.rect.z + room.rect.h) * TILE_SIZE;
      if (px >= x0 && px < x1 && pz >= z0 && pz < z1) {
        for (let r = nav.cz(z0); r <= nav.cz(z1 - 1e-6); r++)
          for (let c = nav.cx(x0); c <= nav.cx(x1 - 1e-6); c++) {
            if (!nav.inBounds(c, r)) continue;
            const i = r * nav.cols + c;
            if (!ex[i]) {
              ex[i] = 1;
              changed = true;
            }
          }
      }
    }
  }
  if (changed) version++;
}

/* ------------------------------------------------------------------ */
/* Open world layer: legend filters, live metin stones, glyphs          */
/* ------------------------------------------------------------------ */

const MAP_FILTERS: { id: FilterId; label: string; icon: string }[] = [
  { id: 'village', label: 'Köy', icon: '/assets/icons/map-village.svg' },
  { id: 'waypoint', label: 'Işınlanma Taşı', icon: '/assets/icons/map-waypoint.svg' },
  { id: 'metin', label: 'Metin', icon: '/assets/icons/map-metin.svg' },
  { id: 'boss', label: 'Patron', icon: '/assets/icons/map-boss.svg' },
  { id: 'rare', label: 'Nadir', icon: '/assets/icons/map-rare.svg' },
  { id: 'dungeon', label: 'Zindan', icon: '/assets/icons/map-dungeon.svg' },
  { id: 'chest', label: 'Sandık', icon: '/assets/icons/map-chest.svg' },
  { id: 'shrine', label: 'Sunak', icon: '/assets/icons/map-shrine.svg' },
  { id: 'vista', label: 'Manzara', icon: '/assets/icons/map-vista.svg' },
  { id: 'landmark', label: 'Ufuk İşareti', icon: '/assets/icons/map-vista.svg' },
  { id: 'gather', label: 'Toplama', icon: '/assets/icons/map-ore.svg' },
  { id: 'camp', label: 'Kasılacak Yer', icon: '/assets/icons/map-camp.svg' },
  { id: 'graveyard', label: 'Mezarlık', icon: '/assets/icons/map-village.svg' },
  { id: 'quest', label: 'Görev', icon: '/assets/icons/map-quest.svg' },
];

/** Legend toggles the player switched off (kept for the session). */
const hiddenFilters = new Set<FilterId>();
/** Metin spots currently standing (world:metinChanged, spot ids). */
const metinOn = new Set<string>();
/** The open-world layer of the map reports its first failure only (it runs every frame). */
let worldWarned = false;

function rgba(hex: number, a: number): string {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}

/** `#rrggbb` with an alpha, as a CSS colour (the level-band colours of the camps). */
function hexA(col: string, a: number): string {
  const n = parseInt(col.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** A map name waiting for placement. `base` is the text baseline the caller uses ('bottom' above the point, 'middle' centred). */
interface PlaceLabel {
  text: string;
  x: number;
  y: number;
  font: string;
  col: string;
  prio: number;
  base: 'bottom' | 'middle';
}

/**
 * Label collision for the map (WoW: no stacked names): labels are placed by priority (highest first) and a label whose box
 * overlaps an already placed one is hidden. The hovered name uses prio 999 so the cursor always reveals it.
 */
function drawLabels(ctx: CanvasRenderingContext2D, labels: PlaceLabel[]): void {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const saveAlign = ctx.textBaseline;
  for (const l of [...labels].sort((a, b) => b.prio - a.prio)) {
    ctx.font = l.font;
    const w = ctx.measureText(l.text).width;
    const size = parseFloat(/([\d.]+)px/.exec(l.font)?.[1] ?? '12');
    const x0 = l.x - w / 2 - 3;
    const x1 = l.x + w / 2 + 3;
    const y0 = l.base === 'bottom' ? l.y - size - 2 : l.y - size / 2 - 2;
    const y1 = l.base === 'bottom' ? l.y + 2 : l.y + size / 2 + 2;
    if (placed.some((b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0)) continue;
    placed.push({ x0, y0, x1, y1 });
    ctx.textBaseline = l.base;
    outlined(ctx, l.text, l.x, l.y, l.col);
  }
  ctx.textBaseline = saveAlign;
}

/** Town map priority: quest givers > dungeon portals > waypoints / lobby > the rest (the overlap rule). */
function townLabelPrio(role: string): number {
  if (role === 'quest') return 100;
  if (role === 'portal') return 90;
  if (role === 'teleporter' || role === 'lobby') return 80;
  return 40;
}

/** Open-world map priority: quest > dungeon entrance > village > waypoint > landmarks > farming spots. */
function pinLabelPrio(kind: string): number {
  if (kind === 'entrance') return 90;
  if (kind === 'village') return 80;
  if (kind === 'waypoint') return 70;
  if (kind === 'landmark' || kind === 'vista' || kind === 'shrine') return 50;
  return 35;
}

/** Called once from registerGamePanels. Returns a disposer. */
export function installMapTracker(): () => void {
  const offMetin = G.events.on('world:metinChanged', ({ id, active }) => {
    if (active) metinOn.add(id);
    else metinOn.delete(id);
  });
  let acc = 0;
  let off: (() => void) | null = null;
  try {
    off = G.engine.onUpdate((dt: number) => {
      acc += dt;
      if (acc < 0.3) return;
      acc = 0;
      try {
        const ow = openWorldNow();
        const p = G.player ?? G.world?.localPlayer;
        if (ow && p) tickExploration(ow, p.position.x, p.position.z, performance.now());
        else reveal();
      } catch {
        /* never throw from a frame loop */
      }
    }, 20) as unknown as (() => void) | null;
  } catch {
    /* engine not ready (dev) */
  }
  return () => {
    offMetin();
    if (typeof off === 'function') off();
  };
}

/* ------------------------------------------------------------------ */

export class MapPanel extends GamePanel {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private wrap!: HTMLElement;
  private titleEl!: HTMLElement;
  private subEl!: HTMLElement;
  private hoverEl!: HTMLElement;
  private trackBtn: HTMLButtonElement | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private terrainNav: NavGrid | null = null;
  private terrainVer = -1;
  private terrainFog = true;
  private raf = 0;
  private W = 800;
  private H = 500;
  private dpr = 1;
  /** View centre and scale: cells (dungeons, town) or metres with px per metre (open world). */
  private view = { cx: 0, cz: 0, scale: 4 };
  private tgt = { cx: 0, cz: 0, scale: 4 };
  private ro: ResizeObserver | null = null;
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private mouse: { x: number; z: number } | null = null;
  private follow = true;
  private lastT = 0;
  /** Name of the open-world point under the cursor (empty when none). */
  private worldHover = '';
  /** Open-world pins (world metres), refreshed about twice a second while the panel is open. */
  private pins: Pin[] = [];
  private pinsAt = -1e9;
  private eventMarks: { x: number; z: number; vig: boolean }[] = [];
  private needFit = false;

  constructor() {
    super('map', { backdropClose: true, modal: false });
  }

  protected build(): void {
    // taller than the default L window: the zone is square, so the panel height is what limits its size on screen
    const { win, body, titleEl, foot } = windowFrame({ title: 'Harita', cls: 'pg-map', size: 'L', height: 'min(90vh, 960px)', hints: ['Sürükle: haritayı kaydır', 'Tıkla: hedef işaretle', 'Sağ tık: hedefi sil'], onClose: () => this.requestClose() });
    this.titleEl = titleEl;
    this.canvas = h('canvas.pg-map-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.subEl = h('div.pg-map-sub');
    this.hoverEl = h('div.pg-map-hover');
    const legend = h(
      'div.pg-map-legend',
      null,
      h('span', null, h('i.lg.me'), 'Sen'),
      h('span', null, h('i.lg.ally'), 'Grup'),
      h('span', null, h('i.lg.npc'), 'NPC'),
      h('span', null, h('i.lg.boss'), 'Boss'),
      h('span', null, h('i.lg.exit'), 'Çıkış'),
    );
    // one "Filtre" toggle at the top right opens a checkbox list (WoW's map filter), instead of a row of chips
    const pop = h('div', { style: 'display:none;position:absolute;right:10px;top:44px;z-index:6;width:230px;max-height:72%;overflow:auto;padding:8px 10px;background:rgba(12,9,6,0.94);border:1px solid #6b5630;border-radius:6px;' });
    for (const f of MAP_FILTERS) {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !hiddenFilters.has(f.id);
      cb.addEventListener('change', () => {
        if (cb.checked) hiddenFilters.delete(f.id);
        else hiddenFilters.add(f.id);
        sfx('ui_tab', 0.4);
      });
      pop.append(h('label', { style: 'display:flex;gap:8px;align-items:center;padding:3px 0;cursor:pointer;font:600 12px/1.2 var(--font-body);color:#e9d8a8;' }, cb, h('span', null, f.label)));
    }
    const filtBtn = h('button', { type: 'button', style: 'position:absolute;right:10px;top:10px;z-index:6;padding:4px 12px;border:1px solid #6b5630;border-radius:6px;background:rgba(12,9,6,0.9);color:#e9d8a8;font:700 12px/1.2 var(--font-body);cursor:pointer;' }, 'Filtre ▾') as HTMLButtonElement;
    filtBtn.addEventListener('click', () => {
      pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
      sfx('ui_tab', 0.5);
    });
    this.wrap = h('div.pg-map-view', null, this.canvas, this.subEl, this.hoverEl, legend, filtBtn, pop);
    body.style.padding = '0';
    body.style.display = 'flex';
    body.style.overflow = 'hidden';
    body.append(this.wrap);
    this.trackBtn = button(`Takip: ${TRACK_LABEL[getTrackMode()]}`, () => this.cycleTrack(), { variant: 'ghost' });
    foot.append(
      button('Oyuncuya Odakla', () => this.center(), { variant: 'ghost' }),
      this.trackBtn,
      button('+', () => this.zoomBy(1.25), { variant: 'ghost', title: 'Yakınlaştır' }),
      button('−', () => this.zoomBy(0.8), { variant: 'ghost', title: 'Uzaklaştır' }),
      button('Kapat', () => this.requestClose(), { variant: 'primary' }),
    );
    this.el.append(win);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
  }

  protected onOpen(): void {
    this.resize();
    this.follow = true;
    this.fitAll();
    // open world: the whole zone first (like the zone map of WoW), not following the player; "Oyuncuya Odakla" centres on the player
    if (openWorldNow()) this.follow = false;
    else this.center(true);
    // the panel may not be laid out yet: the first frame with a real size fits again
    this.needFit = true;
    this.pinsAt = -1e9;
    if (this.trackBtn) this.trackBtn.textContent = `Takip: ${TRACK_LABEL[getTrackMode()]}`;
    if (!this.raf) {
      this.lastT = performance.now() / 1000;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  protected onClose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    if (!this.wrap) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = this.wrap.clientWidth || 800;
    this.H = this.wrap.clientHeight || 500;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  /** Open world: the zone's size in metres (the atlas size). */
  private openSize(def: DungeonDef): { w: number; h: number } {
    return { w: def.grid.w * TILE_SIZE, h: def.grid.h * TILE_SIZE };
  }

  /** Smallest scale that shows the whole open world (px per metre). */
  private openFit(def: DungeonDef): number {
    const { w, h } = this.openSize(def);
    return Math.min((this.W - 40) / w, (this.H - 40) / h);
  }

  private cycleTrack(): void {
    const m = cycleTrackMode();
    if (this.trackBtn) this.trackBtn.textContent = `Takip: ${TRACK_LABEL[m]}`;
    sfx('ui_tab', 0.5);
  }

  private zoomBy(f: number): void {
    const open = openWorldNow();
    const lo = open ? this.openFit(open) * 0.9 : 1.2;
    const hi = open ? 8 : 22;
    this.tgt.scale = clampN(this.tgt.scale * f, lo, hi);
    this.view.scale = this.tgt.scale;
  }

  private fitAll(): void {
    const open = openWorldNow();
    if (open) {
      const s = this.openFit(open);
      const { w, h } = this.openSize(open);
      this.tgt.scale = this.view.scale = s;
      this.tgt.cx = this.view.cx = w / 2;
      this.tgt.cz = this.view.cz = h / 2;
      return;
    }
    const nav = G.world?.nav;
    if (!nav) return;
    const s = Math.min((this.W - 40) / nav.cols, (this.H - 40) / nav.rows);
    this.tgt.scale = this.view.scale = clampN(s, 1.5, 16);
    this.tgt.cx = this.view.cx = nav.cols / 2;
    this.tgt.cz = this.view.cz = nav.rows / 2;
  }

  private center(snap = false): void {
    const p = G.player ?? G.world?.localPlayer;
    const open = openWorldNow();
    if (open) {
      if (!p) return;
      this.tgt.cx = p.position.x;
      this.tgt.cz = p.position.z;
      this.tgt.scale = Math.max(this.tgt.scale, this.openFit(open) * 2.2);
      if (snap) Object.assign(this.view, this.tgt);
      this.follow = true;
      return;
    }
    const nav = G.world?.nav;
    if (!nav || !p) return;
    this.tgt.cx = (p.position.x - nav.originX) / nav.cellSize;
    this.tgt.cz = (p.position.z - nav.originZ) / nav.cellSize;
    this.tgt.scale = Math.max(this.tgt.scale, Math.min((this.W - 40) / nav.cols, (this.H - 40) / nav.rows) * 1.6);
    if (snap) Object.assign(this.view, this.tgt);
    this.follow = true;
  }

  /* ---------------------------------------------------------------- pointer */

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const r = c.getBoundingClientRect();
      this.drag = { x: e.clientX - r.left, y: e.clientY - r.top, cx: this.tgt.cx, cz: this.tgt.cz, moved: false };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      this.mouse = this.toCell(px, py);
      if (this.drag) {
        const dx = px - this.drag.x;
        const dy = py - this.drag.y;
        if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.follow = false;
          this.tgt.cx = this.view.cx = this.drag.cx - dx / this.view.scale;
          this.tgt.cz = this.view.cz = this.drag.cz - dy / this.view.scale;
          c.style.cursor = 'grabbing';
        }
      }
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      c.style.cursor = '';
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // a click (no drag) on the open world sets the waypoint at the cursor
      const open = openWorldNow();
      if (d && !d.moved && open && this.mouse && this.mouse.x >= 0 && this.mouse.z >= 0) {
        const { w, h } = this.openSize(open);
        if (this.mouse.x <= w && this.mouse.z <= h) {
          setWaypoint(open.id, this.mouse.x, this.mouse.z);
          sfx('ui_click', 0.5);
        }
      }
    });
    c.addEventListener('pointerleave', () => (this.mouse = null));
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      clearWaypoint();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const open = openWorldNow();
        const r = c.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const before = this.toCell(px, py);
        const lo = open ? this.openFit(open) * 0.9 : 1.2;
        const hi = open ? 8 : 22;
        this.tgt.scale = clampN(this.tgt.scale * Math.exp(-e.deltaY * 0.0014), lo, hi);
        this.view.scale = this.tgt.scale;
        if (before) {
          this.tgt.cx = this.view.cx = before.x - (px - this.W / 2) / this.view.scale;
          this.tgt.cz = this.view.cz = before.z - (py - this.H / 2) / this.view.scale;
          this.follow = false;
        }
      },
      { passive: false },
    );
  }

  private toCell(px: number, py: number): { x: number; z: number } {
    return { x: (px - this.W / 2) / this.view.scale + this.view.cx, z: (py - this.H / 2) / this.view.scale + this.view.cz };
  }

  /* ---------------------------------------------------------------- render */

  private frame = (now: number): void => {
    if (!this.isOpen) {
      this.raf = 0;
      return;
    }
    const t = now / 1000;
    const dt = Math.min(0.05, Math.max(0.001, t - this.lastT));
    this.lastT = t;
    if (this.wrap.clientWidth && (this.wrap.clientWidth !== this.W || this.wrap.clientHeight !== this.H)) {
      const first = this.W === 800 && this.H === 500;
      this.resize();
      if (first) {
        this.fitAll();
        if (!openWorldNow()) this.center(true);
      }
    }
    if (this.needFit && this.wrap.clientWidth) {
      this.needFit = false;
      this.resize();
      this.fitAll();
      if (!openWorldNow()) this.center(true);
    }
    try {
      this.draw(t, dt);
    } catch (e) {
      console.error('[map] draw failed', e);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private buildTerrain(nav: NavGrid, fog: boolean): void {
    // zones above MAP_MAX_PX cells per side draw a downsampled walkability grid (ENGINE_BIGMAPS #22); exploration stays per nav cell
    const mg = mapGridOf(nav);
    if (!this.terrain || this.terrainNav !== nav) this.terrain = document.createElement('canvas');
    this.terrain.width = mg.cols;
    this.terrain.height = mg.rows;
    this.terrainNav = nav;
    this.terrainVer = version;
    this.terrainFog = fog;
    const g = this.terrain.getContext('2d')!;
    const img = g.createImageData(mg.cols, mg.rows);
    const ex = exploredOf(nav);
    const f = mg.factor;
    const cells = mg.cells;
    const at = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < mg.cols && r < mg.rows && cells[r * mg.cols + c] === 1;
    const d = img.data;
    const town = inTown();
    for (let r = 0; r < mg.rows; r++)
      for (let c = 0; c < mg.cols; c++) {
        const i = r * mg.cols + c;
        const o = i * 4;
        if (!cells[i]) continue; // blocked: transparent
        const seen = !fog || ex[r * f * nav.cols + c * f] === 1;
        // edge detection: any blocked 4-neighbour
        const edge = !at(c - 1, r) || !at(c + 1, r) || !at(c, r - 1) || !at(c, r + 1);
        let R: number, Gc: number, B: number, A: number;
        if (!seen) {
          R = 90; Gc = 76; B = 56; A = 38;
        } else if (edge) {
          R = town ? 150 : 176; Gc = town ? 160 : 146; B = town ? 112 : 96; A = 255;
        } else {
          const n = ((c * 7 + r * 13) % 5) * 2;
          R = (town ? 70 : 88) + n; Gc = (town ? 84 : 72) + n; B = (town ? 58 : 52) + n; A = 255;
        }
        d[o] = R; d[o + 1] = Gc; d[o + 2] = B; d[o + 3] = A;
      }
    g.putImageData(img, 0, 0);
  }

  private draw(t: number, dt: number): void {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#1f1810');
    bg.addColorStop(1, '#090604');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const world = G.world;
    const open = openWorldNow();
    if (open && world) {
      this.drawOpen(ctx, open, t, dt);
      return;
    }
    const nav = world?.nav;
    const def = currentDungeon();
    const town = inTown();
    // header texts
    this.titleEl.textContent = def ? def.name : town ? TOWN.name : 'Harita';
    const lvl = G.mplus?.state?.difficulty === 'mythicplus' ? ` · Mitik+ ${G.mplus.state.keyLevel}` : '';
    this.subEl.textContent = def ? `Zindan${lvl}` : town ? 'Şehir' : '';
    if (!world || !nav) {
      ctx.fillStyle = '#b3a284';
      ctx.font = '700 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bu bölgenin haritası yok.', W / 2, H / 2);
      return;
    }
    const fog = !town;
    const terrainFog = fog && !def?.outdoor;
    if (!this.terrain || this.terrainNav !== nav || this.terrainVer !== version || this.terrainFog !== terrainFog) this.buildTerrain(nav, terrainFog);

    const p = G.player ?? world.localPlayer;
    const k = 1 - Math.exp(-10 * dt);
    if (this.follow && p) {
      this.tgt.cx = (p.position.x - nav.originX) / nav.cellSize;
      this.tgt.cz = (p.position.z - nav.originZ) / nav.cellSize;
    }
    if (!this.drag?.moved) {
      this.view.cx += (this.tgt.cx - this.view.cx) * k;
      this.view.cz += (this.tgt.cz - this.view.cz) * k;
    }
    const s = this.view.scale;
    const toX = (wx: number) => ((wx - nav.originX) / nav.cellSize - this.view.cx) * s + W / 2;
    const toY = (wz: number) => ((wz - nav.originZ) / nav.cellSize - this.view.cz) * s + H / 2;

    // terrain: the nav cells (crisp)
    const src = this.terrain!;
    const tx0 = toX(nav.originX), tz0 = toY(nav.originZ);
    const tw = nav.cols * s;
    const th = nav.rows * s;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.drawImage(src, tx0, tz0, tw, th);
    ctx.restore();
    ctx.drawImage(src, tx0, tz0, tw, th);

    // rooms (dungeon)
    const ex = exploredOf(nav);
    const roomSeen = (rx0: number, rz0: number, rx1: number, rz1: number): boolean => {
      const c = nav.cx((rx0 + rx1) / 2), r = nav.cz((rz0 + rz1) / 2);
      return !fog || ex[r * nav.cols + c] === 1;
    };
    if (def) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${clampN(s * 2.6, 10, 18)}px Cinzel, serif`;
      for (const room of def.rooms) {
        const x0 = room.rect.x * TILE_SIZE, z0 = room.rect.z * TILE_SIZE, x1 = (room.rect.x + room.rect.w) * TILE_SIZE, z1 = (room.rect.z + room.rect.h) * TILE_SIZE;
        if (!roomSeen(x0, z0, x1, z1)) continue;
        if (room.name) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.fillStyle = '#e9d8a8';
          const cx = toX((x0 + x1) / 2), cy = toY((z0 + z1) / 2);
          ctx.strokeText(room.name, cx, cy);
          ctx.fillText(room.name, cx, cy);
        }
      }
      // exit + bosses
      const exitX = toX((def.exit.pos[0] + 0.5) * TILE_SIZE), exitY = toY((def.exit.pos[1] + 0.5) * TILE_SIZE);
      this.marker(ctx, exitX, exitY, '#7ff0ff', 'diamond', 7, t);
      for (const b of def.bosses ?? []) {
        const bx = (b.pos[0] + 0.5) * TILE_SIZE, bz = (b.pos[1] + 0.5) * TILE_SIZE;
        if (!roomSeen(bx - 2, bz - 2, bx + 2, bz + 2)) continue;
        this.marker(ctx, toX(bx), toY(bz), '#ff5a4a', 'skull', 8, t);
      }
    } else if (town) {
      ctx.textAlign = 'center';
      const font = `700 ${clampN(s * 2.4, 10, 15)}px 'Alegreya Sans', sans-serif`;
      const labels: PlaceLabel[] = [];
      // quest givers with an open offer or a ready turn-in win the overlap test (quest > dungeon > village > NPC)
      const givers = new Set<string>();
      try {
        for (const d of G.quests?.all() ?? []) {
          const st = G.quests?.state(d.id);
          if ((st === 'available' || st === 'ready') && d.giver) givers.add(d.giver);
        }
      } catch {
        /* quest data not ready: plain priorities */
      }
      for (const npc of TOWN.npcs ?? []) {
        if (npc.role === 'citizen' || npc.role === 'guard') continue;
        const x = toX(npc.pos[0]), y = toY(npc.pos[2]);
        this.marker(ctx, x, y, npc.role === 'portal' ? '#c9a8ff' : '#ffd36a', 'diamond', 5, t);
        // the cursor on an NPC always shows its name (WoW: the hovered label wins the overlap test)
        const hovered = !!this.mouse && Math.hypot(this.mouse.x - (npc.pos[0] - nav.originX) / nav.cellSize, this.mouse.z - (npc.pos[2] - nav.originZ) / nav.cellSize) * s < 14;
        const prio = hovered ? 999 : givers.has(npc.id) ? 100 : townLabelPrio(npc.role);
        labels.push({ text: npc.name, x, y: y - 8, font, col: '#f1e6cf', prio, base: 'bottom' });
      }
      const mkT = peekMarket();
      if (mkT?.origin) labels.push({ text: 'Pazar', x: toX(mkT.origin.x), y: toY(mkT.origin.z) - 8, font, col: '#f1e6cf', prio: 45, base: 'bottom' });
      drawLabels(ctx, labels);
    }

    // CM14 Pazar: the market square and the "Göster" pin of Pazar Arama
    const mk = peekMarket();
    if (mk?.origin && (town || def)) {
      const ox = toX(mk.origin.x), oy = toY(mk.origin.z);
      this.marker(ctx, ox, oy, '#e8c46a', 'diamond', 5, t);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // the square's name is placed with the town labels (collision); a dungeon map has no such labels
      if (!town) {
        ctx.font = `700 ${clampN(s * 2.4, 10, 15)}px 'Alegreya Sans', sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.fillStyle = '#f1e6cf';
        ctx.strokeText('Pazar', ox, oy - 8);
        ctx.fillText('Pazar', ox, oy - 8);
      }
      const pin = mk.pin;
      if (pin && pin.zone === mk.origin.zone) {
        const px = toX(pin.x), py = toY(pin.z);
        this.marker(ctx, px, py, '#ff5a4a', 'diamond', 9 + Math.sin(t * 5) * 1.5, t);
        ctx.strokeText(pin.label, px, py - 12);
        ctx.fillText(pin.label, px, py - 12);
      }
    }

    // players
    for (const pl of world.players) {
      const local = pl === p || (pl as { isLocal?: boolean }).isLocal;
      const col = local ? '#ffe9a0' : CLASS_META[(pl as { classId: keyof typeof CLASS_META }).classId]?.color ?? '#7ff0ff';
      const x = toX(pl.position.x), y = toY(pl.position.z);
      this.arrow(ctx, x, y, Math.atan2(Math.cos(pl.yaw), Math.sin(pl.yaw)), col, local ? 11 : 8, t, !!local);
      if (!local) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = "700 13px 'Alegreya Sans', sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.fillStyle = col;
        const nm = (pl as { name?: string }).name ?? '';
        ctx.strokeText(nm, x, y - 12);
        ctx.fillText(nm, x, y - 12);
      }
    }

    // hover label
    if (this.mouse) {
      const wx = nav.originX + this.mouse.x * nav.cellSize;
      const wz = nav.originZ + this.mouse.z * nav.cellSize;
      let txt = '';
      if (def) {
        for (const room of def.rooms) {
          if (wx >= room.rect.x * TILE_SIZE && wx < (room.rect.x + room.rect.w) * TILE_SIZE && wz >= room.rect.z * TILE_SIZE && wz < (room.rect.z + room.rect.h) * TILE_SIZE) {
            const c = nav.cx(wx), r = nav.cz(wz);
            if (!fog || ex[r * nav.cols + c] === 1) txt = room.name ?? '';
          }
        }
      }
      this.hoverEl.textContent = txt;
    } else this.hoverEl.textContent = '';
    void version;
  }

  /* ---- open world (GDD_OPENWORLD §5.9): painted atlas, fog, icons, quest areas, waypoint, in metres ---- */

  /** Pins of the open world, refreshed about twice a second (static points, quest rings, live bosses). */
  private refreshPins(def: DungeonDef, now: number): void {
    if (now - this.pinsAt < 500) return;
    this.pinsAt = now;
    const level = G.character?.level ?? 1;
    try {
      this.pins = [...staticPins(def, level, metinOn), ...questPins(), ...livePins(def)];
    } catch (err) {
      if (!worldWarned) console.warn('[map] open world pins', err);
      this.pins = [];
    }
    try {
      this.eventMarks = [
        ...activeEventPins().map((p) => ({ x: p.x, z: p.z, vig: false })),
        ...activeVignettePins().map((v) => ({ x: v.x, z: v.z, vig: true })),
      ];
    } catch {
      this.eventMarks = [];
    }
  }

  /** Legend and tracking: a pin shows when its filter is on and the tracking mode keeps it. */
  private pinVisible(p: Pin, mode: TrackMode): boolean {
    if (!pinTracked(p, mode)) return false;
    return !hiddenFilters.has(p.fam);
  }

  private drawOpen(ctx: CanvasRenderingContext2D, def: DungeonDef, t: number, dt: number): void {
    const { W, H } = this;
    const atlas = atlasFor(def, heightsOf(def));
    this.titleEl.textContent = def.name;
    this.subEl.textContent = `Açık Dünya · Keşif %${exploredPct(def)}`;
    if (!atlas) {
      ctx.fillStyle = '#b3a284';
      ctx.font = '700 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bu bölgenin haritası çizilemedi.', W / 2, H / 2);
      return;
    }
    const p = G.player ?? G.world?.localPlayer;
    const k = 1 - Math.exp(-10 * dt);
    if (this.follow && p) {
      this.tgt.cx = p.position.x;
      this.tgt.cz = p.position.z;
    }
    if (!this.drag?.moved) {
      this.view.cx += (this.tgt.cx - this.view.cx) * k;
      this.view.cz += (this.tgt.cz - this.view.cz) * k;
    }
    // scale follows its target at once (the wheel and the zoom buttons set both; "Oyuncuya Odakla" sets only the target)
    this.view.scale = this.tgt.scale;
    const s = this.view.scale;
    // the view stays inside the zone: centred when the zone fits the panel, else kept off the edges (no empty margin)
    const clampAxis = (c: number, size: number, half: number): number => (2 * half >= size ? size / 2 : Math.min(size - half, Math.max(half, c)));
    const hw = W / (2 * s), hh = H / (2 * s);
    this.view.cx = this.tgt.cx = clampAxis(this.view.cx, atlas.widthM, hw);
    this.view.cz = this.tgt.cz = clampAxis(this.view.cz, atlas.heightM, hh);
    const toX = (x: number) => (x - this.view.cx) * s + W / 2;
    const toY = (z: number) => (z - this.view.cz) * s + H / 2;
    const x0 = toX(0), z0 = toY(0), wpx = atlas.widthM * s, hpx = atlas.heightM * s;

    // terrain: the painted atlas, then the fog of war over it
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 18;
    ctx.drawImage(atlas.canvas, x0, z0, wpx, hpx);
    ctx.restore();
    ctx.drawImage(atlas.canvas, x0, z0, wpx, hpx);
    ctx.drawImage(fogCanvasFor(def, atlas.pxPerM), x0, z0, wpx, hpx);
    ctx.imageSmoothingEnabled = false;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, z0, wpx, hpx);

    // pins: refreshed at 2 Hz
    this.refreshPins(def, performance.now());
    const mode = getTrackMode();
    const world = G.world;
    const ext = def.world!;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // every name of this frame (regions, pins) is collected and placed together, so overlapping names are hidden by priority
    const names: PlaceLabel[] = [];
    // region names once discovered, with the level band (undiscovered regions stay in the fog)
    for (const r of ext.regions) {
      if (!regionKnown(r.id)) continue;
      const room = def.rooms.find((rm) => rm.id === r.roomId);
      if (!room) continue;
      const cx = toX((room.rect.x + room.rect.w / 2) * TILE_SIZE), cy = toY((room.rect.z + room.rect.h / 2) * TILE_SIZE);
      names.push({ text: r.name, x: cx, y: cy - 6, font: `700 ${clampN(s * 90, 11, 22)}px Cinzel, serif`, col: '#e9d8a8', prio: 60, base: 'middle' });
      names.push({ text: `Seviye ${r.levels[0]}-${r.levels[1]}`, x: cx, y: cy + 12, font: `700 ${clampN(s * 70, 9, 15)}px 'Alegreya Sans', sans-serif`, col: '#cdbf9d', prio: 59, base: 'middle' });
    }

    // quest areas: soft yellow shaded zones round the unfinished targets of the tracked quests (WoW Midnight style)
    if (mode !== 'off') {
      for (const q of questTargetMarks()) {
        const qx = toX(q.x), qy = toY(q.z);
        ctx.fillStyle = 'rgba(255,210,74,0.16)';
        ctx.strokeStyle = 'rgba(255,210,74,0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(qx, qy, 45 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // pins
    const hover: { x: number; y: number; prio: number; tip: string }[] = [];
    const r0 = clampN(4 + s * 1.2, 4.5, 9);
    // farming spots, rare spawn spots and metin spots are dense: drawn once the zone is zoomed in enough (live ones always)
    const detail = s >= 0.5;
    for (const pin of this.pins) {
      if (!pin.quest && !this.pinVisible(pin, mode)) continue;
      if (pin.quest && (mode === 'off' || hiddenFilters.has('quest'))) continue;
      if (!detail && (pin.kind === 'camp' || pin.kind === 'patrol' || pin.kind === 'gather' || (pin.kind === 'rare' && !pin.tip.endsWith('Canlı')) || (pin.kind === 'metin' && !pin.known))) continue;
      const x = toX(pin.x), y = toY(pin.z);
      if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
      hover.push({ x, y, prio: pin.prio, tip: pin.tip });
      if (pin.quest) {
        if (pin.role === 'target') questRing(ctx, x, y, 9, t);
        else badge(ctx, x, y - 14, pin.role === 'turnin' ? '?' : '!', pin.role === 'locked' ? '#8d939c' : '#e8c46a');
        continue;
      }
      // farming / camp areas: a shaded level-band zone (its level colour), labelled for farming spots and elite camps
      if (pin.fam === 'camp' && pin.r && pin.col && s >= 0.35) {
        ctx.fillStyle = hexA(pin.col, 0.16);
        ctx.strokeStyle = hexA(pin.col, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, pin.r * s), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      glyph(ctx, pin.kind, x, y, r0, { col: pin.col, known: pin.known, locked: pin.locked, num: pin.num });
      if (pin.label && (pin.kind === 'farm' || pin.kind === 'elite') && s >= 0.35) {
        names.push({ text: pin.label, x, y: y + r0 + 8, font: `700 ${clampN(s * 30, 10, 13)}px 'Alegreya Sans', sans-serif`, col: '#f1e6cf', prio: pinLabelPrio(pin.kind), base: 'middle' });
      }
    }
    for (const ev of this.eventMarks) {
      if (mode === 'off') break;
      const x = toX(ev.x), y = toY(ev.z);
      if (ev.vig) {
        ctx.strokeStyle = '#7dff8a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6 + 2 * Math.sin(t * 6), 0, Math.PI * 2);
        ctx.stroke();
      } else glyph(ctx, 'metin', x, y, r0, { col: '#ff9f1a' });
    }

    // names of the discovered points at a closer zoom
    if (s >= 0.45) {
      const pinFont = `700 ${clampN(s * 40, 9, 13)}px 'Alegreya Sans', sans-serif`;
      for (const pin of this.pins) {
        if (pin.quest || !pin.known || !this.pinVisible(pin, mode)) continue;
        if (!['village', 'entrance', 'waypoint', 'landmark', 'vista', 'shrine'].includes(pin.kind)) continue;
        const px = toX(pin.x), py = toY(pin.z);
        // the cursor on a point always reveals its name (highest priority in the overlap test)
        const hovered = !!this.mouse && Math.hypot(toX(this.mouse.x) - px, toY(this.mouse.z) - py) < 12;
        names.push({ text: pin.tip.split(' · ')[0], x: px, y: py - r0 - 6, font: pinFont, col: '#f1e6cf', prio: hovered ? 999 : pinLabelPrio(pin.kind), base: 'bottom' });
      }
    }
    drawLabels(ctx, names);

    // the player's waypoint (a map click)
    const wpt = getWaypoint(def.id);
    if (wpt) waypointPin(ctx, toX(wpt.x), toY(wpt.z), 6);

    // party and the local player
    if (world) {
      for (const pl of world.players) {
        const local = pl === p || (pl as { isLocal?: boolean }).isLocal;
        const col = local ? '#ffe9a0' : CLASS_META[(pl as { classId: keyof typeof CLASS_META }).classId]?.color ?? '#7ff0ff';
        const x = toX(pl.position.x), y = toY(pl.position.z);
        this.arrow(ctx, x, y, Math.atan2(Math.cos(pl.yaw), Math.sin(pl.yaw)), col, local ? 11 : 8, t, !!local);
        if (!local) {
          ctx.font = "700 13px 'Alegreya Sans', sans-serif";
          outlined(ctx, (pl as { name?: string }).name ?? '', x, y - 12, col);
        }
      }
    }
    ctx.restore();

    // hover: the nearest pin within 12 px, else the region under the cursor
    this.worldHover = '';
    let tip = '';
    if (this.mouse) {
      const mx = toX(this.mouse.x), my = toY(this.mouse.z);
      let bd = 12;
      let bp = -1;
      for (const hv of hover) {
        const d = Math.hypot(hv.x - mx, hv.y - my);
        // the nearest point wins; within 4 px of the same distance the higher priority does
        if (d < bd - 4 || (d <= bd && hv.prio > bp)) {
          bd = d;
          bp = hv.prio;
          tip = hv.tip;
        }
      }
      if (!tip && this.mouse.x >= 0 && this.mouse.z >= 0) {
        const rid = atlas.regionOf(this.mouse.x, this.mouse.z);
        const reg = rid ? ext.regions.find((r) => r.id === rid) : undefined;
        if (reg && regionKnown(reg.id)) tip = `${reg.name} · Seviye ${reg.levels[0]}-${reg.levels[1]}`;
      }
      const wpTxt = wpt ? ` · Hedef ${Math.round(Math.hypot(wpt.x - (p?.position.x ?? 0), wpt.z - (p?.position.z ?? 0)))} m` : '';
      this.hoverEl.textContent = tip ? `${tip}${wpTxt}` : '';
      this.worldHover = tip;
    } else this.hoverEl.textContent = '';
  }

  private marker(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, shape: 'diamond' | 'skull', r: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + 0.12 * Math.sin(t * 3 + x);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    if (shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, -1, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = '#1a0a08';
      ctx.fillRect(-r * 0.5, -r * 0.4, r * 0.35, r * 0.4);
      ctx.fillRect(r * 0.15, -r * 0.4, r * 0.35, r * 0.4);
    }
    ctx.restore();
  }

  private arrow(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, col: string, r: number, t: number, glow: boolean): void {
    if (glow) {
      const pr = r * (2.2 + 0.5 * Math.sin(t * 4));
      const g = ctx.createRadialGradient(x, y, 0, x, y, pr * 1.6);
      g.addColorStop(0, col + 'aa');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x - pr * 1.6, y - pr * 1.6, pr * 3.2, pr * 3.2);
    }
    glyphArrow(ctx, x, y, ang, col, r);
  }
}
