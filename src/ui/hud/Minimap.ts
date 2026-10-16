import { G } from '../../game/G';
import { TOWN } from '../../data/town';
import { getDungeon } from '../../data/dungeons';
import type { DungeonDef } from '../../types/dungeons';
import type { Entity } from '../../entities/Entity';
import type { Enemy } from '../../entities/Enemy';
import { mapGridOf, type MapGrid, type NavGrid } from '../../world/NavGrid';
import { RARITY_COLORS, type Rarity } from '../../types/common';
import { ICON, div, setDisplay, setText, setStyle, clampN, fmtClock, h, iconEl, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import { giverKind, questTargetMarks } from './questMarks';
import { activeEventPins } from '../../scenes/world/EventCalendar';
import { getSocial } from '../../systems/Social';
import { atlasFor, heightsOf } from '../map/atlas';
import { fogCanvasFor } from '../map/exploration';
import { bandTone, TRACK_LABEL, type TrackMode } from '../map/mapStyle';
import { glyph, questRing, waypointPin } from '../map/glyphs';
import { livePins, pinTracked, questPins, staticPins, type Pin } from '../map/worldPins';
import { cycleTrackMode, getNorthUp, getTrackMode, getWaypoint, toggleNorthUp } from '../map/mapPrefs';
import { activeVignettePins } from '../../scenes/world/Vignettes';
import { sampleDay, formatHour, type DaySample } from '../../world/DayCycle';

const SIZE = 192;
const R = SIZE / 2;

/** Off-picture fill: the zone's own void tone, dimmed; never solid black. */
const VOID_FILL = '#2a3026';

/** The open-world map def being played (outdoor with a world map), or null. */
function openZoneDef(): DungeonDef | null {
  const id = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId;
  const d = id ? getDungeon(id) : undefined;
  return d?.outdoor && d.world ? d : null;
}

/** True in an open-world zone (an `outdoor` def run in the dungeon scene): those maps have no fog of war (GDD_OPENWORLD §5.9). */
function inOpenZone(): boolean {
  const id = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId;
  return !!id && !!getDungeon(id)?.outdoor;
}

/** A point on the minimap disc: screen position and distance from the centre (px). */
interface ScreenPt {
  sx: number;
  sy: number;
  d: number;
}
const _sp: ScreenPt = { sx: 0, sy: 0, d: 0 };

/** True when two walkability arrays hold the same cells. */
function sameCells(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface Poi {
  e: Entity;
  kind: 'npc' | 'interactable' | 'loot';
  color: string;
  /** A plain townsfolk dot: hidden at the default zoom (quest givers and vendors stay). */
  minor: boolean;
}

/** Pins that stay on the edge of the disc when they lie outside it (quests, gates, bosses, waypoints). */
const EDGE_PRIO = 60;
/** Default zoom (the minimap's +/- buttons and the wheel start at 1): at or below it the minor icons are left off. */
const DENSE_ZOOM = 1.05;
/** Icon kinds left off at the default zoom: the small finds and the camp dots (quest rings and the key kinds are never minor). */
const MINOR_PIN_KINDS = new Set<string>(['gather', 'vista', 'landmark', 'hidden', 'graveyard', 'cursed', 'chest', 'shrine', 'camp', 'farm', 'patrol', 'elite']);
/** Icons that are never clustered away nor left off: the gates, bosses and waypoints. */
const KEY_PIN_KINDS = new Set<string>(['boss', 'entrance', 'waypoint']);
/** Two icons closer than this (px on the disc) are drawn as one: the more important one wins. */
const CLUSTER_PX = 9;
/** Vendor-type townsfolk (their role): always shown on the minimap. */
const VENDOR_ROLES = new Set<string>(['blacksmith', 'merchant', 'alchemist', 'stash', 'keystone', 'trainer', 'bounty', 'stable', 'codex', 'tierset', 'crafting', 'home', 'pvp', 'teleporter', 'portal']);

/**
 * Square rotating minimap (ElvUI style). Open world: the painted zone atlas (world/atlas) with the exploration fog, quest rings and
 * giver badges, gates, bosses and farming spots of the map, the player's waypoint; rotation camera / north-up, zoom, tracking mode.
 * Dungeons keep the nav-grid picture with its fog of war. Player arrow, party and enemy dots are common to both.
 */
export class Minimap implements HudWidget {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private zoneEl: HTMLElement;
  private subEl: HTMLElement;
  /** "CH2": the public zone channel (NetSession.channelTag), right of the zone name; hidden outside a channel. */
  private chEl: HTMLElement;
  private chShown = '';
  private northEl: HTMLElement;
  private coordEl: HTMLElement;
  private nav: NavGrid | null = null;
  /** Grid the map image is drawn from: the nav grid, or a downsampled copy above MAP_MAX_PX cells per side (ENGINE_BIGMAPS #22). */
  private mapGrid: MapGrid | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  /** Copy of the walkability cells the map image was built from (see refreshMap). */
  private mapCells: Uint8Array | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private mapBuiltAt = 0;
  private revealX = 1e9;
  private revealZ = 1e9;
  /** Zoom multiplier (+/-): the base is 1.8 px per metre in the open world (about 110 m across), 3 px per metre in dungeons. */
  private zoomK = 1;
  private pois: Poi[] = [];
  private poiAt = 0;
  private zoneTitle = '';
  private zoneSub = '';
  private lastMode = '';
  /** Open-world pins (world metres): static points, quest rings and givers, live bosses, refreshed twice a second. */
  private pins: Pin[] = [];
  /** The same pins, most important first (the clustering pass places them in this order). */
  private pinsDesc: Pin[] = [];
  /** WP-04 events (orange) and travel vignettes (green ring) running or starting: world metres. */
  private eventMarks: { x: number; z: number; vig: boolean }[] = [];
  private pinsAt = -1e9;
  /** Metin spots currently standing (spot ids from world:metinChanged). */
  private metinOn = new Set<string>();
  /** Level band of the open-world region last entered (`region:entered`); a dungeon run reads its own `levelRange`. */
  private regionBand: [number, number] | null = null;
  /** Finder state from `finder:queue`, and when it was entered (performance ms). */
  private finderState = 'idle';
  private finderSince = 0;
  private eyeSec = -1;
  private infoAcc = 1;
  private readonly infoEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly clockIco: HTMLElement;
  private readonly clockTxt: HTMLElement;
  private readonly clockSample: DaySample = { hour: 0, dayW: 1, nightW: 0, warm: 0, arc: 1 };
  private clockAcc = 1;
  private clockDay: boolean | null = null;
  private readonly eyeEl: HTMLButtonElement;
  private readonly trackBtn: HTMLButtonElement;
  private readonly northBtn: HTMLButtonElement;
  private trackShown: TrackMode | '' = '';
  private northShown: boolean | null = null;
  /** "Çevrimiçi: N" under the ring (G.presence); shown once the count is known. */
  private readonly onlineEl: HTMLButtonElement;
  private onlineShown = false;

  constructor() {
    this.el = div('mm');
    const disc = div('mm-disc', this.el);
    this.canvas = h('canvas', 'mm-canvas hud-interactive', disc) as HTMLCanvasElement;
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    div('mm-vignette', disc);
    this.northEl = div('mm-north', this.el);
    div('mm-n', this.northEl).textContent = 'K';
    div('mm-ring', this.el);
    const zoom = div('mm-zoom', this.el);
    const plus = h('button', 'mm-btn', zoom, '+');
    const minus = h('button', 'mm-btn', zoom, '−');
    plus.addEventListener('click', () => this.zoom(1.25));
    minus.addEventListener('click', () => this.zoom(0.8));
    // tracking mode (all / quests / none) and north-up rotation: per-viewer preferences (mapPrefs)
    this.trackBtn = h('button', 'mm-btn mm-track', zoom, 'T') as HTMLButtonElement;
    this.trackBtn.type = 'button';
    this.trackBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uiSound('ui_click', 0.4);
      cycleTrackMode();
      this.trackShown = '';
    });
    this.northBtn = h('button', 'mm-btn mm-rot', zoom, 'N') as HTMLButtonElement;
    this.northBtn.type = 'button';
    this.northBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uiSound('ui_click', 0.4);
      toggleNorthUp();
      this.northShown = null;
    });
    const ribbon = div('mm-ribbon', this.el);
    this.zoneEl = div('mm-zone', ribbon);
    this.subEl = div('mm-sub', ribbon);
    this.chEl = div('mm-ch', ribbon);
    this.chEl.title = 'Bölge kanalı (/kanal)';
    setDisplay(this.chEl, false);
    // player coordinates (metres from the zone corner), at the bottom centre of the ring
    this.coordEl = div('mm-coord', this.el);
    this.coordEl.style.cssText = 'position:absolute;left:0;right:0;bottom:4px;text-align:center;font:700 10px/1 var(--font-body);color:#e2e5ec;text-shadow:var(--elv-outline);pointer-events:none;';
    setDisplay(this.coordEl, false);
    // LFG eye at 7 o'clock on the ring (visible while the finder lists or has a proposal)
    this.eyeEl = h('button', 'mm-eye hud-interactive', this.el);
    this.eyeEl.type = 'button';
    iconEl(ICON('ui-compass'), 'mm-eye-ico', this.eyeEl);
    setDisplay(this.eyeEl, false);
    this.eyeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFinder();
    });
    // optional clock / FPS line (Settings.showMapInfo); an overlay, so it takes no layout height
    this.infoEl = div('mm-info', this.el);
    setDisplay(this.infoEl, false);
    // world clock (WoW style): HH:MM game time on the rim, top left, with a sun or moon
    this.clockEl = div('mm-clock', this.el);
    this.clockIco = div('mm-clock-ico', this.clockEl);
    this.clockTxt = div('mm-clock-txt', this.clockEl);
    // online count under the ring; a click lists the players the same way /kim does
    this.onlineEl = h('button', 'mm-online hud-interactive', this.el);
    this.onlineEl.type = 'button';
    this.onlineEl.title = 'Çevrimiçi oyuncuları listele (/kim)';
    setDisplay(this.onlineEl, false);
    this.onlineEl.addEventListener('click', (e) => {
      e.stopPropagation();
      uiSound('ui_click', 0.5);
      getSocial().command('kim');
    });
    G.events.on('presence:changed', ({ count }) => this.setOnline(count));
    this.canvas.addEventListener('wheel', (e) => {
      this.zoom(e.deltaY < 0 ? 1.15 : 0.87);
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('click', () => {
      uiSound('ui_click', 0.5);
      G.ui.togglePanel('map');
    });
    G.events.on('world:metinChanged', ({ id, active }) => {
      if (active) this.metinOn.add(id);
      else this.metinOn.delete(id);
    });
    G.events.on('ui:zoneName', ({ title, subtitle }) => {
      this.zoneTitle = title;
      this.zoneSub = subtitle ?? '';
    });
    G.events.on('region:entered', ({ levelRange }) => {
      this.regionBand = levelRange;
    });
    G.events.on('finder:queue', ({ state }) => {
      this.finderState = state;
      this.finderSince = performance.now();
      this.eyeSec = -1;
    });
    G.events.on('scene:leaving', () => {
      this.nav = null;
      this.mapCanvas = null;
      this.fogCanvas = null;
      this.revealX = this.revealZ = 1e9;
      this.pois = [];
      this.metinOn.clear();
      this.pins = [];
      this.pinsAt = -1e9;
    });
  }

  private zoom(f: number): void {
    this.zoomK = clampN(this.zoomK * f, 0.5, 3.4);
  }

  /** Render the nav grid to a 1 px / cell canvas: floor + brighter outline where it borders a wall (dungeons). */
  private buildMap(g: MapGrid): void {
    const c = this.mapCanvas && this.mapCanvas.width === g.cols && this.mapCanvas.height === g.rows ? this.mapCanvas : document.createElement('canvas');
    c.width = g.cols;
    c.height = g.rows;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(g.cols, g.rows);
    const d = img.data;
    const { cols, rows, cells } = g;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const i = r * cols + col;
        const o = i * 4;
        if (!cells[i]) {
          d[o + 3] = 0;
          continue;
        }
        const edge = col === 0 || r === 0 || col === cols - 1 || r === rows - 1 || !cells[i - 1] || !cells[i + 1] || !cells[i - cols] || !cells[i + cols];
        if (edge) {
          d[o] = 168; d[o + 1] = 170; d[o + 2] = 176;
        } else {
          const n = ((col * 7 + r * 13) % 11 === 0 ? 8 : 0) + ((col + r) & 1 ? 3 : 0);
          d[o] = 68 + n; d[o + 1] = 70 + n; d[o + 2] = 74 + n;
        }
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = c;
    this.mapBuiltAt = performance.now();
  }

  /**
   * Keeps the map image in step with the nav grid, checked every 2.5 s. The grid is edited at runtime (barriers, doors), so a
   * check compares the cells and rebuilds the image only when one changed; an unchanged grid just restarts the timer.
   */
  private refreshMap(nav: NavGrid, now: number): void {
    const g = mapGridOf(nav);
    this.mapGrid = g;
    const prev = this.mapCells;
    if (this.mapCanvas && prev && sameCells(prev, g.cells)) {
      this.mapBuiltAt = now;
      return;
    }
    this.buildMap(g);
    this.mapCells = g.cells.slice();
  }

  private ensureFog(): void {
    const g = this.mapGrid;
    if (!g) return;
    if (this.fogCanvas && this.fogCanvas.width === g.cols && this.fogCanvas.height === g.rows) return;
    const f = document.createElement('canvas');
    f.width = g.cols;
    f.height = g.rows;
    const ctx = f.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgb(8,8,8)';
      ctx.fillRect(0, 0, f.width, f.height);
    }
    this.fogCanvas = f;
    this.revealX = this.revealZ = 1e9;
  }

  private reveal(nav: NavGrid, x: number, z: number): void {
    const f = this.fogCanvas;
    if (!f) return;
    if (Math.hypot(x - this.revealX, z - this.revealZ) < 1.5) return;
    this.revealX = x;
    this.revealZ = z;
    const ctx = f.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const cs = this.mapGrid?.cellSize ?? nav.cellSize;
    ctx.arc((x - nav.originX) / cs, (z - nav.originZ) / cs, 14 / cs, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private refreshPois(world: NonNullable<HudCtx['world']>): void {
    const out: Poi[] = [];
    for (const e of world.entities.values()) {
      if (e.removed) continue;
      // ambient walkers (TownNpc.routine, scenes/world/AmbientLife.ts) are life, not quest givers: no marker
      if (e.kind === 'npc') {
        const def = (e as unknown as { def?: { id?: string; role?: string; routine?: unknown } }).def;
        if (!def?.routine) {
          // quest givers and vendors are always shown; plain townsfolk are minor dots
          const minor = !(def?.id && giverKind(def.id)) && !VENDOR_ROLES.has(def?.role ?? '');
          out.push({ e, kind: 'npc', color: '#ffd24a', minor });
        }
      }
      else if (e.kind === 'interactable') out.push({ e, kind: 'interactable', color: '#5fe0ff', minor: false });
      else if (e.kind === 'loot') {
        const rar = (e as unknown as { rarity?: Rarity }).rarity;
        if (rar && (rar === 'rare' || rar === 'epic' || rar === 'legendary' || rar === 'set')) out.push({ e, kind: 'loot', color: RARITY_COLORS[rar], minor: false });
      }
    }
    this.pois = out;
  }

  /** Open-world pins: the zone's icons, quest rings and givers, and the live bosses (refreshed twice a second). */
  private refreshPins(def: DungeonDef, now: number): void {
    if (now - this.pinsAt < 500) return;
    this.pinsAt = now;
    const level = G.character?.level ?? 1;
    try {
      this.pins = [...staticPins(def, level, this.metinOn), ...questPins(), ...livePins(def)];
    } catch {
      this.pins = [];
    }
    this.pinsDesc = [...this.pins].sort((a, b) => b.prio - a.prio);
    try {
      this.eventMarks = [
        ...activeEventPins().map((p) => ({ x: p.x, z: p.z, vig: false })),
        ...activeVignettePins().map((v) => ({ x: v.x, z: v.z, vig: true })),
      ];
    } catch {
      this.eventMarks = [];
    }
  }

  /**
   * Which pins are drawn this frame (open world). At the default zoom the minor kinds are left off; a non-key icon that would sit
   * within CLUSTER_PX of an already placed, more important one is dropped. Quest pins are not handled here (always drawn).
   */
  private declutter(toScreen: (x: number, z: number) => ScreenPt, edge: number, mode: TrackMode, dense: boolean): Set<Pin> {
    const shown = new Set<Pin>();
    const placed: number[] = [];
    for (const pin of this.pinsDesc) {
      if (pin.quest || !pinTracked(pin, mode)) continue;
      if (dense && MINOR_PIN_KINDS.has(pin.kind)) continue;
      const s = toScreen(pin.x, pin.z);
      const outside = s.d > edge;
      if (outside && pin.prio < EDGE_PRIO) continue;
      if (outside && !KEY_PIN_KINDS.has(pin.kind)) continue;
      const k = outside ? edge / s.d : 1;
      const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
      if (!KEY_PIN_KINDS.has(pin.kind)) {
        let hit = false;
        for (let i = 0; i < placed.length; i += 2) {
          if (Math.abs(placed[i] - x) < CLUSTER_PX && Math.abs(placed[i + 1] - y) < CLUSTER_PX) { hit = true; break; }
        }
        if (hit) continue;
      }
      placed.push(x, y);
      shown.add(pin);
    }
    return shown;
  }

  /** Ribbon second line: the level band in its relative colour, or the zone subtitle when there is no band. */
  private bandOf(ctx: HudCtx): [number, number] | null {
    if (ctx.mode === 'dungeon') {
      const id = G.mplus?.state?.dungeonId;
      return (id ? getDungeon(id)?.levelRange : undefined) ?? null;
    }
    return ctx.mode === 'town' ? null : this.regionBand;
  }

  private updateBand(ctx: HudCtx, sub: string): void {
    const band = this.bandOf(ctx);
    if (!band) {
      setText(this.subEl, sub);
      setStyle(this.subEl, 'color', '');
      return;
    }
    setText(this.subEl, `Sv. ${band[0]}–${band[1]}`);
    setStyle(this.subEl, 'color', bandTone(G.character?.level ?? 1, band));
  }

  private setOnline(count: number): void {
    this.onlineShown = true;
    setText(this.onlineEl, `Çevrimiçi: ${count}`);
    setDisplay(this.onlineEl, true);
  }

  private updateEye(): void {
    const on = this.finderState === 'listing' || this.finderState === 'proposal';
    setDisplay(this.eyeEl, on);
    if (!on) return;
    const sec = Math.floor((performance.now() - this.finderSince) / 1000);
    if (sec === this.eyeSec) return;
    this.eyeSec = sec;
    const what = this.finderState === 'proposal' ? 'teklif var' : `aranıyor ${fmtClock(sec)}`;
    this.eyeEl.title = `Zindan Bulucu: ${what}`;
  }

  private openFinder(): void {
    uiSound('ui_click', 0.5);
    try {
      G.ui.openPanel('finder');
    } catch (err) {
      console.warn("[hud] minimap: finder panel not open (registered by UX-40)", err);
    }
  }

  /** Clock, plus `FPS | MS` while showFps is on (the counting of the removed FpsCounter), refreshed at 4 Hz. */
  private updateInfo(ctx: HudCtx): void {
    const on = !!G.settings?.data.showMapInfo;
    setDisplay(this.infoEl, on);
    if (!on) return;
    this.infoAcc += ctx.dt;
    if (this.infoAcc < 0.25) return;
    this.infoAcc = 0;
    let text = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (G.settings?.data.showFps) {
      const fps = Math.round(G.engine.fps);
      const ms = fps > 0 ? Math.round(1000 / fps) : '--';
      text += ` · ${fps} FPS | ${ms} MS`;
    }
    setText(this.infoEl, text);
  }

  /** Button states follow the preferences (tracking mode, rotation); a lit letter = that option is on. */
  private updateButtons(): void {
    const tm = getTrackMode();
    if (tm !== this.trackShown) {
      this.trackShown = tm;
      this.trackBtn.title = `Takip: ${TRACK_LABEL[tm]}`;
      this.trackBtn.style.color = tm === 'off' ? '#8a8a8a' : tm === 'quest' ? '#58b0ff' : '#fff';
    }
    const nu = getNorthUp();
    if (nu !== this.northShown) {
      this.northShown = nu;
      this.northBtn.title = nu ? 'Kuzey yukarı' : 'Kameraya göre';
      this.northBtn.style.color = nu ? '#ffe24a' : '#fff';
    }
  }

  /** World clock on the rim: HH:MM and the sun or moon, refreshed twice a second (text and icon only when they change). */
  private refreshClock(dt: number): void {
    this.clockAcc += dt;
    if (this.clockAcc < 0.5) return;
    this.clockAcc = 0;
    const s = sampleDay(this.clockSample);
    setText(this.clockTxt, formatHour(s.hour));
    const day = s.dayW >= 0.5;
    if (day !== this.clockDay) {
      this.clockDay = day;
      this.clockIco.classList.toggle('is-moon', !day);
      this.clockEl.title = day ? 'Oyun saati (gündüz)' : 'Oyun saati (gece)';
    }
  }

  update(ctx: HudCtx): void {
    this.refreshClock(ctx.dt);
    const ctx2 = this.ctx;
    const w = ctx.world;
    const p = ctx.player;
    // zone label
    let title = this.zoneTitle;
    let sub = this.zoneSub;
    if (!title) {
      if (ctx.mode === 'town') title = TOWN.name;
      else if (ctx.mode === 'dungeon') title = getDungeon(G.mplus?.state?.dungeonId ?? '')?.name ?? 'Zindan';
    }
    if (ctx.mode !== this.lastMode) {
      this.lastMode = ctx.mode;
      this.zoneTitle = '';
      this.zoneSub = '';
      if (ctx.mode === 'town') title = TOWN.name;
      sub = '';
    }
    setText(this.zoneEl, title);
    const chTag = G.net?.channelTag ?? '';
    if (chTag !== this.chShown) {
      this.chShown = chTag;
      setText(this.chEl, chTag);
      setDisplay(this.chEl, chTag !== '');
    }
    this.updateBand(ctx, sub);
    this.updateEye();
    this.updateButtons();
    if (!this.onlineShown && G.presence) this.setOnline(G.presence.count());
    this.updateInfo(ctx);
    if (!ctx2) return;
    ctx2.clearRect(0, 0, SIZE, SIZE);
    ctx2.imageSmoothingEnabled = false;
    ctx2.save();
    // square minimap (retail ElvUI): the viewport is the whole canvas; markers still clamp to the inscribed circle
    ctx2.beginPath();
    ctx2.rect(0, 0, SIZE, SIZE);
    ctx2.clip();
    // off the zone picture (a spawn at the edge of the zone): the void tone, never a solid black well
    ctx2.fillStyle = VOID_FILL;
    ctx2.fillRect(0, 0, SIZE, SIZE);
    if (!w || !p) {
      ctx2.restore();
      setDisplay(this.coordEl, false);
      return;
    }
    const now = ctx.now;
    const px = p.position.x, pz = p.position.z;
    // open world: the painted atlas + exploration fog of the zone (world/atlas); the nav grid is only filled per streamed chunk there
    const def = openZoneDef();
    const atlas = def ? atlasFor(def, heightsOf(def)) : null;
    const nav = w.nav;
    if (!atlas) {
      if (nav !== this.nav) {
        this.nav = nav;
        this.mapCanvas = null;
        this.mapCells = null;
        this.fogCanvas = null;
      }
      if (!this.mapCanvas || now - this.mapBuiltAt > 2500) this.refreshMap(nav, now);
    }
    const useFog = !atlas && ctx.mode === 'dungeon' && !inOpenZone();
    if (useFog) {
      this.ensureFog();
      this.reveal(nav, px, pz);
    }

    // rotation: camera forward points up, or north up when the preference says so
    const cam = G.camera;
    let a = 0;
    if (cam && !getNorthUp()) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      a = -Math.PI / 2 - Math.atan2(fz, fx);
    }
    const S = (atlas ? 1.8 : 3) * this.zoomK;
    ctx2.save();
    ctx2.translate(R, R);
    ctx2.rotate(a);
    ctx2.scale(S, S);
    ctx2.translate(-px, -pz);
    if (atlas && def) {
      // world metres: the atlas starts at (0, 0), smoothed (a painted picture, not walkability cells)
      ctx2.imageSmoothingEnabled = true;
      ctx2.drawImage(atlas.canvas, 0, 0, atlas.widthM, atlas.heightM);
      ctx2.drawImage(fogCanvasFor(def, atlas.pxPerM), 0, 0, atlas.widthM, atlas.heightM);
      ctx2.imageSmoothingEnabled = false;
    } else if (this.mapCanvas && nav) {
      ctx2.drawImage(this.mapCanvas, nav.originX, nav.originZ, nav.cols * nav.cellSize, nav.rows * nav.cellSize);
    }
    if (useFog && this.fogCanvas && nav) ctx2.drawImage(this.fogCanvas, nav.originX, nav.originZ, nav.cols * nav.cellSize, nav.rows * nav.cellSize);
    // quest areas: a soft blue disc round every unfinished quest target (metres, inside the map transform)
    const mode = getTrackMode();
    if (atlas && def && mode !== 'off') {
      for (const q of questTargetMarks()) {
        const dd = Math.hypot(q.x - px, q.z - pz);
        if (dd > 90) continue;
        ctx2.fillStyle = 'rgba(255,210,74,0.16)';
        ctx2.strokeStyle = 'rgba(255,210,74,0.7)';
        ctx2.lineWidth = 1.2 / S;
        ctx2.beginPath();
        ctx2.arc(q.x, q.z, 45, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();
      }
    }
    ctx2.restore();

    const cosA = Math.cos(a), sinA = Math.sin(a);
    // one shared result object: every caller reads its fields before the next call (no allocation per point)
    const toScreen = (x: number, z: number): ScreenPt => {
      const dx = (x - px) * S, dz = (z - pz) * S;
      _sp.sx = R + dx * cosA - dz * sinA;
      _sp.sy = R + dx * sinA + dz * cosA;
      _sp.d = Math.hypot(dx, dz);
      return _sp;
    };
    // markers clamp to this ring; the open-world ribbon covers the top ~34 px, so its clamp sits further in
    const edge = atlas ? R - 18 : R - 7;

    if (atlas && def) {
      setDisplay(this.coordEl, true);
      setText(this.coordEl, `${Math.round(px)} · ${Math.round(pz)}`);
      this.refreshPins(def, now);
      const t = ctx.t;
      const qk = 0.5 + 0.5 * Math.sin(t * 6);
      for (const ev of this.eventMarks) {
        if (mode === 'off') break;
        const s = toScreen(ev.x, ev.z);
        if (s.d > edge) continue;
        const x = s.sx, y = s.sy;
        if (ev.vig) {
          ctx2.strokeStyle = '#7dff8a';
          ctx2.lineWidth = 1.8;
          ctx2.beginPath();
          ctx2.arc(x, y, 4 + 1.5 * qk, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.fillStyle = '#7dff8a';
          ctx2.beginPath();
          ctx2.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx2.fill();
        } else {
          glyph(ctx2, 'metin', x, y, 4.5, { col: '#ff9f1a' });
        }
      }
      const shown = this.declutter(toScreen, edge, mode, this.zoomK <= DENSE_ZOOM);
      for (const pin of this.pins) {
        if (!pinTracked(pin, mode)) continue;
        const s = toScreen(pin.x, pin.z);
        const outside = s.d > edge;
        if (outside && pin.prio < EDGE_PRIO) continue;
        const k = outside ? edge / s.d : 1;
        const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
        if (pin.quest) {
          if (pin.role === 'target') questRing(ctx2, x, y, 4 + 1.2 * qk, t);
          else {
            const ch = pin.role === 'turnin' ? '?' : '!';
            const fill = pin.role === 'turnin' ? '#f5b82e' : pin.role === 'locked' ? '#8d939c' : '#ffe14d';
            ctx2.font = 'bold 13px sans-serif';
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'middle';
            ctx2.lineWidth = 3;
            ctx2.strokeStyle = '#000';
            ctx2.strokeText(ch, x, y + 1);
            ctx2.fillStyle = fill;
            ctx2.fillText(ch, x, y + 1);
          }
          continue;
        }
        // farming spots and camps only inside the disc (they are too many to clamp), minor kinds off at the default zoom, clustered icons
        if (!shown.has(pin)) continue;
        // camps and farming spots a little larger, so they read as dots on the ring
        const rr = pin.kind === 'camp' || pin.kind === 'farm' || pin.kind === 'elite' ? 5.5 : 4.2;
        glyph(ctx2, pin.kind, x, y, rr, { col: pin.col, known: pin.known, locked: pin.locked, num: pin.num });
      }
      // the player's own waypoint: a teardrop on the map, clamped to the ring with an arrow when out of sight
      const wpt = getWaypoint(def.id);
      if (wpt) {
        const s = toScreen(wpt.x, wpt.z);
        const k = s.d > edge ? edge / s.d : 1;
        const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
        waypointPin(ctx2, x, y + 2, 4);
      }
    }

    // points of interest (dungeons: town NPCs, interactables, rare loot)
    if (!atlas) {
      if (now - this.poiAt > 300) {
        this.poiAt = now;
        this.refreshPois(w);
      }
      const dense = this.zoomK <= DENSE_ZOOM;
      for (const poi of this.pois) {
        if (poi.e.removed) continue;
        if (dense && poi.minor) continue;
        const s = toScreen(poi.e.position.x, poi.e.position.z);
        if (s.d > edge && poi.kind === 'loot') continue;
        const k = s.d > edge ? edge / s.d : 1;
        const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
        ctx2.fillStyle = poi.color;
        ctx2.strokeStyle = '#000';
        ctx2.lineWidth = 1;
        if (poi.kind === 'loot') {
          ctx2.fillRect(x - 2, y - 2, 4, 4);
          ctx2.strokeRect(x - 2.5, y - 2.5, 5, 5);
        } else {
          ctx2.beginPath();
          ctx2.moveTo(x, y - 4);
          ctx2.lineTo(x + 3.5, y);
          ctx2.lineTo(x, y + 4);
          ctx2.lineTo(x - 3.5, y);
          ctx2.closePath();
          ctx2.fill();
          ctx2.stroke();
        }
      }
    }

    // enemies
    const pulseK = 0.5 + 0.5 * Math.sin(ctx.t * 6);
    for (const e of w.enemies as Enemy[]) {
      if (e.isDead || e.removed) continue;
      const s = toScreen(e.position.x, e.position.z);
      const rank = e.def?.rank;
      // Hazine Goblini is pinged on the minimap even from far away (it flees on a timer): pulsing gold diamond, clamped to the ring
      const treasure = e.def?.id === 'treasure_goblin';
      if (s.d > R - 4) {
        if (rank !== 'boss' && !treasure) continue;
      }
      const k = s.d > edge ? edge / s.d : 1;
      const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
      if (treasure) {
        const r = 5 + pulseK * 2.5;
        ctx2.strokeStyle = `rgba(255, 214, 80, ${(0.9 - pulseK * 0.5).toFixed(2)})`;
        ctx2.lineWidth = 1.5;
        ctx2.beginPath();
        ctx2.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx2.stroke();
        ctx2.fillStyle = '#ffd24a';
        ctx2.strokeStyle = '#3a2800';
        ctx2.beginPath();
        ctx2.moveTo(x, y - 5);
        ctx2.lineTo(x + 4.5, y);
        ctx2.lineTo(x, y + 5);
        ctx2.lineTo(x - 4.5, y);
        ctx2.closePath();
        ctx2.fill();
        ctx2.stroke();
      } else if (e.champion) {
        // Şampiyon: blue ring around a red dot
        ctx2.fillStyle = '#d83030';
        ctx2.strokeStyle = '#58b0ff';
        ctx2.lineWidth = 2;
        ctx2.beginPath();
        ctx2.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();
      } else if (rank === 'boss') {
        ctx2.fillStyle = '#ff3a2a';
        ctx2.strokeStyle = '#fff';
        ctx2.lineWidth = 1.5;
        ctx2.beginPath();
        ctx2.arc(x, y, 4.5 + pulseK, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();
      } else if (rank === 'elite' || rank === 'miniboss') {
        ctx2.fillStyle = '#d83030';
        ctx2.strokeStyle = '#ffd24a';
        ctx2.lineWidth = 1.5;
        ctx2.beginPath();
        ctx2.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();
      } else {
        ctx2.fillStyle = e.aggroed ? '#ff5a4a' : '#c23232';
        ctx2.fillRect(Math.round(x) - 1.5, Math.round(y) - 1.5, 3, 3);
      }
    }

    // party
    for (const pl of w.players) {
      if (pl.isLocal || pl.isDead) continue;
      const s = toScreen(pl.position.x, pl.position.z);
      const k = s.d > edge ? edge / s.d : 1;
      const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
      ctx2.fillStyle = '#5be07a';
      ctx2.strokeStyle = '#04200c';
      ctx2.lineWidth = 1.5;
      ctx2.beginPath();
      ctx2.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.stroke();
    }

    // local player arrow
    const fa = Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw)) + a; // facing vector (sin yaw, cos yaw) in screen space
    ctx2.save();
    ctx2.translate(R, R);
    ctx2.rotate(fa);
    ctx2.fillStyle = '#ffe9a0';
    ctx2.strokeStyle = '#2a1a04';
    ctx2.lineWidth = 1.5;
    ctx2.beginPath();
    ctx2.moveTo(7, 0);
    ctx2.lineTo(-4.5, 4.5);
    ctx2.lineTo(-2, 0);
    ctx2.lineTo(-4.5, -4.5);
    ctx2.closePath();
    ctx2.stroke();
    ctx2.fill();
    ctx2.restore();
    ctx2.restore();

    // north marker (world -Z) orbits the ring: wrapper rotates with the map, the letter stays upright
    const deg = (a * 180) / Math.PI;
    setStyle(this.northEl, 'transform', `rotate(${deg.toFixed(1)}deg)`);
    setStyle(this.northEl.firstElementChild as HTMLElement, 'transform', `rotate(${(-deg).toFixed(1)}deg)`);
  }
}
