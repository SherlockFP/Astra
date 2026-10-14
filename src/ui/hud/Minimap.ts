import { G } from '../../game/G';
import { TOWN } from '../../data/town';
import { getDungeon } from '../../data/dungeons';
import type { Entity } from '../../entities/Entity';
import type { Enemy } from '../../entities/Enemy';
import { mapGridOf, type MapGrid, type NavGrid } from '../../world/NavGrid';
import { RARITY_COLORS, type Rarity } from '../../types/common';
import { ICON, div, setDisplay, setText, setStyle, clampN, fmtClock, h, iconEl, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import { inWorldMap, questGiverMarks, questTargetMarks, tileCentreM, waypointKnown, worldExtras } from './questMarks';
import { activeEventPins } from '../../scenes/world/EventCalendar';
import { getSocial } from '../../systems/Social';

const SIZE = 192;
const R = SIZE / 2;

const TONE_RED = '#ff6a5a';
const TONE_YELLOW = '#ffe24a';
const TONE_GREEN = '#7fe08a';
const TONE_GREY = '#8a8a8a';

/**
 * Relative colour of a zone's level band for the player's level (§2.9): red = the band starts 3+ levels above the player,
 * yellow = in band, green = the player is 3+ above the band top, grey = trivial (8+ above).
 */
function bandTone(p: number, [lo, hi]: [number, number]): string {
  if (p <= lo - 3) return TONE_RED;
  if (p >= hi + 8) return TONE_GREY;
  if (p >= hi + 3) return TONE_GREEN;
  return TONE_YELLOW;
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
}

/** Square rotating minimap: nav-grid walls with fog of war in dungeons, player arrow, party/enemy/POI dots and the zone name. */
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
  private scale = 3.0;
  private pois: Poi[] = [];
  private poiAt = 0;
  private zoneTitle = '';
  private zoneSub = '';
  private lastMode = '';
  /** Open world marks (villages, discovered stones, active metin, quest targets), refreshed twice a second (world metres). */
  private worldMarks: { x: number; z: number; kind: 'village' | 'waypoint' | 'metin' | 'quest' | 'giver' | 'event'; gk?: 'offer' | 'turnin' }[] = [];
  private worldAt = -1e9;
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
  private readonly eyeEl: HTMLButtonElement;
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
    const ribbon = div('mm-ribbon', this.el);
    this.zoneEl = div('mm-zone', ribbon);
    this.subEl = div('mm-sub', ribbon);
    this.chEl = div('mm-ch', ribbon);
    this.chEl.title = 'Bölge kanalı (/kanal)';
    setDisplay(this.chEl, false);
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
      this.worldMarks = [];
    });
  }

  private zoom(f: number): void {
    this.scale = clampN(this.scale * f, 1.6, 9);
  }

  /** Render the nav grid to a 1 px / cell canvas: floor + brighter outline where it borders a wall. */
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
      if (e.kind === 'npc') out.push({ e, kind: 'npc', color: '#ffd24a' });
      else if (e.kind === 'interactable') out.push({ e, kind: 'interactable', color: '#5fe0ff' });
      else if (e.kind === 'loot') {
        const rar = (e as unknown as { rarity?: Rarity }).rarity;
        if (rar && (rar === 'rare' || rar === 'epic' || rar === 'legendary' || rar === 'set')) out.push({ e, kind: 'loot', color: RARITY_COLORS[rar] });
      }
    }
    this.pois = out;
  }

  /** Villages, discovered stones, standing metin stones and quest targets of the open world, in world metres. */
  private refreshWorldMarks(): void {
    const out: { x: number; z: number; kind: 'village' | 'waypoint' | 'metin' | 'quest' | 'giver' | 'event'; gk?: 'offer' | 'turnin' }[] = [];
    const ext = inWorldMap() ? worldExtras() : null;
    if (ext) {
      for (const v of ext.villages) out.push({ x: tileCentreM(v.center[0]), z: tileCentreM(v.center[1]), kind: 'village' });
      for (const w of ext.waypoints) if (waypointKnown(w.id)) out.push({ x: tileCentreM(w.pos[0]), z: tileCentreM(w.pos[1]), kind: 'waypoint' });
      for (const s of ext.metin.spots) if (this.metinOn.has(s.id)) out.push({ x: tileCentreM(s.pos[0]), z: tileCentreM(s.pos[1]), kind: 'metin' });
    }
    for (const q of questTargetMarks()) out.push({ x: q.x, z: q.z, kind: 'quest' });
    // WP-04 world events: running or starting within 5 minutes (EventCalendar)
    for (const p of activeEventPins()) out.push({ x: p.x, z: p.z, kind: 'event' });
    // quest givers (UX-21, §4.5): town NPCs with quests in town, village NPCs on the open world; gold ! offer, ? turn-in
    if (!ext && G.ui?.mode === 'town') {
      for (const n of TOWN.npcs) {
        if (!n.quests?.length) continue;
        const defs = G.quests?.offered(n.id) ?? [];
        if (defs.length) out.push({ x: n.pos[0], z: n.pos[2], kind: 'giver', gk: defs.some((d) => G.quests?.state(d.id) === 'ready') ? 'turnin' : 'offer' });
      }
    } else if (ext) {
      for (const g of questGiverMarks()) out.push({ x: g.x, z: g.z, kind: 'giver', gk: g.kind });
    }
    this.worldMarks = out;
  }

  /** Level band of the zone (`Sv. 5–10`), or null: the dungeon's `levelRange` in a run, the last region's band outdoors. */
  private bandOf(ctx: HudCtx): [number, number] | null {
    if (ctx.mode === 'dungeon') {
      const id = G.mplus?.state?.dungeonId;
      return (id ? getDungeon(id)?.levelRange : undefined) ?? null;
    }
    return ctx.mode === 'town' ? null : this.regionBand;
  }

  /** Ribbon second line: the level band in its relative colour, or the zone subtitle when there is no band. */
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

  update(ctx: HudCtx): void {
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
    ctx2.fillStyle = '#0c0c0c';
    ctx2.fillRect(0, 0, SIZE, SIZE);
    if (!w || !p) {
      ctx2.restore();
      return;
    }
    const nav = w.nav;
    if (nav !== this.nav) {
      this.nav = nav;
      this.mapCanvas = null;
      this.mapCells = null;
      this.fogCanvas = null;
    }
    const now = ctx.now;
    if (!this.mapCanvas || now - this.mapBuiltAt > 2500) this.refreshMap(nav, now);
    const useFog = ctx.mode === 'dungeon' && !inOpenZone();
    if (useFog) this.ensureFog();
    const px = p.position.x, pz = p.position.z;
    if (useFog) this.reveal(nav, px, pz);

    // camera-relative rotation: camera forward points up
    const cam = G.camera;
    let a = 0;
    if (cam) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      a = -Math.PI / 2 - Math.atan2(fz, fx);
    }
    const S = this.scale;
    ctx2.save();
    ctx2.translate(R, R);
    ctx2.rotate(a);
    ctx2.scale(S, S);
    ctx2.translate(-px, -pz);
    if (this.mapCanvas) ctx2.drawImage(this.mapCanvas, nav.originX, nav.originZ, nav.cols * nav.cellSize, nav.rows * nav.cellSize);
    if (useFog && this.fogCanvas) ctx2.drawImage(this.fogCanvas, nav.originX, nav.originZ, nav.cols * nav.cellSize, nav.rows * nav.cellSize);
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
    const edge = R - 7;

    // points of interest
    if (now - this.poiAt > 300) {
      this.poiAt = now;
      this.refreshPois(w);
    }
    for (const poi of this.pois) {
      if (poi.e.removed) continue;
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

    // open world (GDD_OPENWORLD §5.9): villages, discovered stones, standing metin stones, quest rings
    if (now - this.worldAt > 500) {
      this.worldAt = now;
      try {
        this.refreshWorldMarks();
      } catch {
        this.worldMarks = [];
      }
    }
    const qk = 0.5 + 0.5 * Math.sin(ctx.t * 6);
    for (const m of this.worldMarks) {
      const s = toScreen(m.x, m.z);
      const k = s.d > edge ? edge / s.d : 1;
      const x = R + (s.sx - R) * k, y = R + (s.sy - R) * k;
      if (m.kind === 'quest') {
        ctx2.strokeStyle = '#58b0ff';
        ctx2.lineWidth = 1.8;
        ctx2.beginPath();
        ctx2.arc(x, y, 4.5 + 1.5 * qk, 0, Math.PI * 2);
        ctx2.stroke();
      } else if (m.kind === 'giver') {
        const glyph = m.gk === 'turnin' ? '?' : '!';
        ctx2.font = 'bold 14px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.lineWidth = 3;
        ctx2.strokeStyle = '#000';
        ctx2.strokeText(glyph, x, y + 1);
        ctx2.fillStyle = m.gk === 'turnin' ? '#f5b82e' : '#ffe14d';
        ctx2.fillText(glyph, x, y + 1);
      } else if (m.kind === 'event') {
        ctx2.fillStyle = '#ff9f1a';
        ctx2.strokeStyle = '#2a1a04';
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(x, y - 5.5);
        ctx2.lineTo(x + 4.5, y);
        ctx2.lineTo(x, y + 5.5);
        ctx2.lineTo(x - 4.5, y);
        ctx2.closePath();
        ctx2.fill();
        ctx2.stroke();
      } else if (m.kind === 'village') {
        ctx2.fillStyle = '#e8c46a';
        ctx2.strokeStyle = '#2a1a04';
        ctx2.lineWidth = 1;
        ctx2.fillRect(x - 3, y - 3, 6, 6);
        ctx2.strokeRect(x - 3.5, y - 3.5, 7, 7);
      } else {
        ctx2.fillStyle = m.kind === 'metin' ? '#b070ff' : '#6ec8ff';
        ctx2.strokeStyle = '#000';
        ctx2.lineWidth = 1;
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
