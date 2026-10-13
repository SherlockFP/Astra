import { G } from '../../../game/G';
import { mapGridOf, type NavGrid } from '../../../world/NavGrid';
import type { DungeonDef } from '../../../types/dungeons';
import { TILE_SIZE } from '../../../types/dungeons';
import { DUNGEONS, OPEN_ZONES, getDungeon } from '../../../data/dungeons';
import { TOWN } from '../../../data/town';
import { CLASS_META, GamePanel, button, clampN, h, icon, sfx, windowFrame } from './base';
import type { Enemy } from '../../../entities/Enemy';
import { questGiverMarks, questTargetMarks, regionKnown, waypointKnown } from '../../hud/questMarks';
import { peekMarket } from '../../../systems/Market';

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
  if (def) {
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

type MapFilter = 'village' | 'waypoint' | 'metin' | 'boss' | 'rare' | 'dungeon' | 'chest' | 'shrine' | 'vista' | 'gather' | 'quest';

const MAP_FILTERS: { id: MapFilter; label: string; icon: string }[] = [
  { id: 'village', label: 'Köy', icon: '/assets/icons/map-village.svg' },
  { id: 'waypoint', label: 'Işınlanma Taşı', icon: '/assets/icons/map-waypoint.svg' },
  { id: 'metin', label: 'Metin', icon: '/assets/icons/map-metin.svg' },
  { id: 'boss', label: 'Patron', icon: '/assets/icons/map-boss.svg' },
  { id: 'rare', label: 'Nadir', icon: '/assets/icons/map-rare.svg' },
  { id: 'dungeon', label: 'Zindan', icon: '/assets/icons/map-dungeon.svg' },
  { id: 'chest', label: 'Sandık', icon: '/assets/icons/map-chest.svg' },
  { id: 'shrine', label: 'Sunak', icon: '/assets/icons/map-shrine.svg' },
  { id: 'vista', label: 'Manzara', icon: '/assets/icons/map-vista.svg' },
  { id: 'gather', label: 'Toplama', icon: '/assets/icons/map-ore.svg' },
  { id: 'quest', label: 'Görev', icon: '/assets/icons/map-quest.svg' },
];

/** Legend toggles the player switched off (kept for the session). */
const hiddenFilters = new Set<MapFilter>();
/** Metin spots currently standing (world:metinChanged, spot ids). */
const metinOn = new Set<string>();
/** The open-world layer of the map reports its first failure only (it runs every frame). */
let worldWarned = false;

const SHRINE_TR: Record<string, string> = {
  shrine_power: 'Güç Sunağı', shrine_haste: 'Çabukluk Sunağı', shrine_ward: 'Koruma Sunağı', shrine_greed: 'Açgözlülük Sunağı', shrine_wisdom: 'Bilgelik Sunağı',
};
const SHRINE_COLOR: Record<string, string> = {
  shrine_power: '#ff6a4a', shrine_haste: '#ffe36a', shrine_ward: '#6ab8ff', shrine_greed: '#e8c46a', shrine_wisdom: '#b78aff',
};

function rgba(hex: number, a: number): string {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function house(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x + 6, y - 1);
  ctx.lineTo(x + 4, y - 1);
  ctx.lineTo(x + 4, y + 5);
  ctx.lineTo(x - 4, y + 5);
  ctx.lineTo(x - 4, y - 1);
  ctx.lineTo(x - 6, y - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function door(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 5);
  ctx.lineTo(x - 4, y - 1);
  ctx.arc(x, y - 1, 4, Math.PI, 0);
  ctx.lineTo(x + 4, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function chestIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = '#c8922e';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.fillRect(x - 5, y - 2, 10, 7);
  ctx.strokeRect(x - 5, y - 2, 10, 7);
  ctx.fillStyle = '#f3d27a';
  ctx.fillRect(x - 5, y - 4, 10, 2.5);
  ctx.strokeRect(x - 5, y - 4, 10, 2.5);
  ctx.restore();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = '#d8e8ff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a2a3a';
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Small round glyph; `cross` adds a white plus (shrines). */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, cross: boolean): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (cross) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 2.2, y);
    ctx.lineTo(x + 2.2, y);
    ctx.moveTo(x, y - 2.2);
    ctx.lineTo(x, y + 2.2);
    ctx.stroke();
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, r: number): void {
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Gold quest marker: `!` available, `?` ready to turn in. */
function badge(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string): void {
  ctx.save();
  ctx.fillStyle = '#e8c46a';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a0a08';
  ctx.font = "900 11px 'Alegreya Sans', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + 0.5);
  ctx.restore();
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
        reveal();
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
  private terrain: HTMLCanvasElement | null = null;
  private terrainNav: NavGrid | null = null;
  private terrainVer = -1;
  private terrainFog = true;
  private raf = 0;
  private W = 800;
  private H = 500;
  private dpr = 1;
  private view = { cx: 0, cz: 0, scale: 4 };
  private tgt = { cx: 0, cz: 0, scale: 4 };
  private ro: ResizeObserver | null = null;
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private mouse: { x: number; z: number } | null = null;
  private follow = true;
  private lastT = 0;
  /** Name of the open-world point under the cursor (empty when none). */
  private worldHover = '';

  constructor() {
    super('map', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, titleEl, foot } = windowFrame({ title: 'Harita', icon: '/assets/icons/ui-map.svg', cls: 'pg-map', size: 'L', hints: ['Sürükle: haritayı kaydır'], onClose: () => this.requestClose() });
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
    // legend filters: toggling hides a point type on the map (open world)
    const filters = h('div.pg-map-filters');
    for (const f of MAP_FILTERS) {
      const b = h('button.pg-map-flt', { type: 'button', class: hiddenFilters.has(f.id) ? 'is-off' : '', title: f.label }, icon(f.icon, 'pg-map-fico'), h('span', null, f.label)) as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (hiddenFilters.has(f.id)) hiddenFilters.delete(f.id);
        else hiddenFilters.add(f.id);
        b.classList.toggle('is-off', hiddenFilters.has(f.id));
        sfx('ui_tab', 0.6);
      });
      filters.append(b);
    }
    this.wrap = h('div.pg-map-view', null, this.canvas, this.subEl, this.hoverEl, legend, filters);
    body.style.padding = '0';
    body.style.display = 'flex';
    body.style.overflow = 'hidden';
    body.append(this.wrap);
    foot.append(button('Oyuncuya Odakla', () => this.center(), { variant: 'ghost', icon: '/assets/icons/ui-target.svg' }), button('Kapat', () => this.requestClose(), { variant: 'primary' }));
    this.el.append(win);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
  }

  protected onOpen(): void {
    this.resize();
    this.follow = true;
    this.fitAll();
    this.center(true);
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

  private fitAll(): void {
    const nav = G.world?.nav;
    if (!nav) return;
    const s = Math.min((this.W - 40) / nav.cols, (this.H - 40) / nav.rows);
    this.tgt.scale = this.view.scale = clampN(s, 1.5, 16);
    this.tgt.cx = this.view.cx = nav.cols / 2;
    this.tgt.cz = this.view.cz = nav.rows / 2;
  }

  private center(snap = false): void {
    const nav = G.world?.nav;
    const p = G.player ?? G.world?.localPlayer;
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
      this.drag = null;
      c.style.cursor = '';
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    c.addEventListener('pointerleave', () => (this.mouse = null));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const before = this.toCell(px, py);
        this.tgt.scale = clampN(this.tgt.scale * Math.exp(-e.deltaY * 0.0014), 1.2, 22);
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
        this.center(true);
      }
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
    const nav = world?.nav;
    const def = currentDungeon();
    const town = inTown();
    // header texts
    this.titleEl.textContent = def ? def.name : town ? TOWN.name : 'Harita';
    const lvl = G.mplus?.state?.difficulty === 'mythicplus' ? ` · Mitik+ ${G.mplus.state.keyLevel}` : '';
    this.subEl.textContent = def?.world ? 'Açık Dünya' : def ? `Zindan${lvl}` : town ? 'Şehir' : '';
    if (!world || !nav) {
      ctx.fillStyle = '#b3a284';
      ctx.font = '700 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Bu bölgenin haritası yok.', W / 2, H / 2);
      return;
    }
    const fog = !town;
    if (!this.terrain || this.terrainNav !== nav || this.terrainVer !== version || this.terrainFog !== fog) this.buildTerrain(nav, fog);

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

    // terrain
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.drawImage(this.terrain!, toX(nav.originX), toY(nav.originZ), nav.cols * s, nav.rows * s);
    ctx.restore();
    ctx.drawImage(this.terrain!, toX(nav.originX), toY(nav.originZ), nav.cols * s, nav.rows * s);

    // rooms (dungeon)
    const ex = exploredOf(nav);
    const roomSeen = (rx0: number, rz0: number, rx1: number, rz1: number): boolean => {
      const c = nav.cx((rx0 + rx1) / 2), r = nav.cz((rz0 + rz1) / 2);
      return !fog || ex[r * nav.cols + c] === 1;
    };
    if (def?.world) {
      try {
        this.drawWorld(ctx, def, nav, toX, toY, s, t, ex, fog);
      } catch (e) {
        // a bad data field must not break the frame: restore the canvas state and report once
        ctx.restore();
        if (!worldWarned) {
          worldWarned = true;
          console.warn('[map] open world layer failed', e);
        }
      }
    }
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
      ctx.textBaseline = 'bottom';
      ctx.font = `700 ${clampN(s * 2.4, 10, 15)}px 'Alegreya Sans', sans-serif`;
      for (const npc of TOWN.npcs ?? []) {
        if (npc.role === 'citizen' || npc.role === 'guard') continue;
        const x = toX(npc.pos[0]), y = toY(npc.pos[2]);
        this.marker(ctx, x, y, npc.role === 'portal' ? '#c9a8ff' : '#ffd36a', 'diamond', 5, t);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.fillStyle = '#f1e6cf';
        ctx.strokeText(npc.name, x, y - 8);
        ctx.fillText(npc.name, x, y - 8);
      }
    }

    // CM14 Pazar: the market square and the "Göster" pin of Pazar Arama
    const mk = peekMarket();
    if (mk?.origin && (town || def)) {
      const ox = toX(mk.origin.x), oy = toY(mk.origin.z);
      this.marker(ctx, ox, oy, '#e8c46a', 'diamond', 5, t);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `700 ${clampN(s * 2.4, 10, 15)}px 'Alegreya Sans', sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.fillStyle = '#f1e6cf';
      ctx.strokeText('Pazar', ox, oy - 8);
      ctx.fillText('Pazar', ox, oy - 8);
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
      this.hoverEl.textContent = txt || this.worldHover;
    } else this.hoverEl.textContent = '';
    void version;
  }

  /* ---- open world layer (GDD_OPENWORLD §5.9) ---- */

  /**
   * Region fills (faint fog-colour tint, name and level band once discovered), Işınlanma Taşları, villages, dungeon entrances,
   * chests, shrines, vistas, gathering fields, standing metin stones, live bosses / rares, quest rings and quest givers.
   * Undiscovered points are drawn only once the player has explored their cell (fog), rares only within 120 m.
   */
  private drawWorld(ctx: CanvasRenderingContext2D, def: DungeonDef, nav: NavGrid, toX: (wx: number) => number, toY: (wz: number) => number, s: number, t: number, ex: Uint8Array, fog: boolean): void {
    const ext = def.world;
    if (!ext) return;
    const cm = (tile: number) => (tile + 0.5) * TILE_SIZE;
    const seen = (x: number, z: number): boolean => {
      if (!fog) return true;
      const c = nav.cx(x), r = nav.cz(z);
      return nav.inBounds(c, r) && ex[r * nav.cols + c] === 1;
    };
    const on = (f: MapFilter): boolean => !hiddenFilters.has(f);
    const hover: { x: number; z: number; label: string }[] = [];
    const at = (x: number, z: number, label: string): { px: number; py: number } => {
      if (label) hover.push({ x, z, label });
      return { px: toX(x), py: toY(z) };
    };
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // region fills and names
    for (const r of ext.regions) {
      const room = def.rooms.find((x) => x.id === r.roomId);
      if (!room) continue;
      const x0 = room.rect.x * TILE_SIZE, z0 = room.rect.z * TILE_SIZE;
      const x1 = (room.rect.x + room.rect.w) * TILE_SIZE, z1 = (room.rect.z + room.rect.h) * TILE_SIZE;
      ctx.fillStyle = rgba(r.theme.fogColor, 0.14);
      ctx.fillRect(toX(x0), toY(z0), ((x1 - x0) / nav.cellSize) * s, ((z1 - z0) / nav.cellSize) * s);
      if (regionKnown(r.id)) {
        const cx = toX((x0 + x1) / 2), cy = toY((z0 + z1) / 2);
        ctx.font = `700 ${clampN(s * 3, 11, 20)}px Cinzel, serif`;
        outlined(ctx, r.name, cx, cy - 6, '#e9d8a8');
        ctx.font = `700 ${clampN(s * 2, 9, 14)}px 'Alegreya Sans', sans-serif`;
        outlined(ctx, `Seviye ${r.levels[0]}-${r.levels[1]}`, cx, cy + 12, '#cdbf9d');
      }
    }

    if (on('waypoint')) {
      for (const w of ext.waypoints) {
        const x = cm(w.pos[0]), z = cm(w.pos[1]);
        const known = waypointKnown(w.id);
        if (!known && !seen(x, z)) continue;
        const p = at(x, z, known ? w.name : '');
        this.marker(ctx, p.px, p.py, known ? '#6ec8ff' : 'rgba(110,200,255,0.4)', 'diamond', 6, t);
      }
    }
    if (on('village')) {
      for (const v of ext.villages) {
        const x = cm(v.center[0]), z = cm(v.center[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, v.name);
        house(ctx, p.px, p.py, '#e8c46a');
      }
    }
    if (on('dungeon')) {
      for (const e of ext.entrances) {
        const x = cm(e.pos[0]), z = cm(e.pos[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, e.name);
        door(ctx, p.px, p.py, '#c9a0ff');
      }
    }
    if (on('chest')) {
      for (const c of ext.chests) {
        const x = cm(c.pos[0]), z = cm(c.pos[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, 'Sandık');
        chestIcon(ctx, p.px, p.py);
      }
    }
    if (on('shrine')) {
      for (const sh of ext.shrines) {
        const x = cm(sh.pos[0]), z = cm(sh.pos[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, SHRINE_TR[sh.type] ?? 'Sunak');
        dot(ctx, p.px, p.py, SHRINE_COLOR[sh.type] ?? '#e8c46a', true);
      }
    }
    if (on('vista')) {
      for (const v of ext.vistas) {
        const x = cm(v.pos[0]), z = cm(v.pos[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, v.name);
        eye(ctx, p.px, p.py);
      }
    }
    if (on('gather')) {
      for (const g of ext.gather) {
        const x = cm(g.center[0]), z = cm(g.center[1]);
        if (!seen(x, z)) continue;
        const p = at(x, z, g.kind === 'ore' ? 'Maden' : 'Bitki');
        dot(ctx, p.px, p.py, g.kind === 'ore' ? '#9fc3d8' : '#7fd38f', false);
      }
    }
    if (on('metin')) {
      for (const sp of ext.metin.spots) {
        if (!metinOn.has(sp.id)) continue;
        const x = cm(sp.pos[0]), z = cm(sp.pos[1]);
        const n = Math.max(1, ext.metin.tiers.findIndex((tr) => tr.regionId === sp.regionId) + 1);
        const p = at(x, z, 'Metin');
        this.marker(ctx, p.px, p.py, '#b070ff', 'diamond', 7, t);
        ctx.fillStyle = '#fff';
        ctx.font = "700 10px 'Alegreya Sans', sans-serif";
        ctx.fillText(String(n), p.px, p.py + 0.5);
      }
    }

    // live bosses, mini-bosses and rares (rares only near the player, GDD_OPENWORLD §5.9)
    const w = G.world;
    const pl = G.player ?? w?.localPlayer ?? null;
    const rareIds = new Set(ext.rares.map((r) => r.enemyId));
    if (w) {
      for (const e of w.enemies as Enemy[]) {
        if (e.isDead || e.removed || !e.def) continue;
        const rare = rareIds.has(e.def.id);
        const boss = e.def.rank === 'boss';
        const mini = e.def.rank === 'miniboss';
        if (!rare && !boss && !mini) continue;
        const x = e.position.x, z = e.position.z;
        if (rare) {
          if (!on('rare') || !pl || Math.hypot(x - pl.position.x, z - pl.position.z) > 120) continue;
          const p = at(x, z, e.def.name);
          star(ctx, p.px, p.py, '#e2ecf7', 6);
        } else {
          if (!on('boss') || !seen(x, z)) continue;
          const p = at(x, z, e.def.name);
          this.marker(ctx, p.px, p.py, boss ? '#ff5a4a' : '#ff9a2a', 'skull', boss ? 8 : 6.5, t);
        }
      }
    }

    // quests: blue rings on the targets, gold ! / ? over the givers
    if (on('quest')) {
      for (const m of questTargetMarks()) {
        const p = at(m.x, m.z, m.label);
        ctx.strokeStyle = '#58b0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.px, p.py, 9 + 1.5 * Math.sin(t * 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const g of questGiverMarks()) {
        const p = at(g.x, g.z, '');
        badge(ctx, p.px, p.py - 14, g.kind === 'turnin' ? '?' : '!');
      }
    }

    // hover: the nearest label within about 12 px
    this.worldHover = '';
    if (this.mouse && hover.length) {
      const mx = nav.originX + this.mouse.x * nav.cellSize;
      const mz = nav.originZ + this.mouse.z * nav.cellSize;
      let bd = (12 * nav.cellSize) / s;
      for (const hv of hover) {
        const d = Math.hypot(hv.x - mx, hv.z - mz);
        if (d < bd) {
          bd = d;
          this.worldHover = hv.label;
        }
      }
    }
    ctx.restore();
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
    ctx.save();
    ctx.translate(x, y);
    if (glow) {
      const pr = r * (2.2 + 0.5 * Math.sin(t * 4));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 1.6);
      g.addColorStop(0, col + 'aa');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.fillRect(-pr * 1.6, -pr * 1.6, pr * 3.2, pr * 3.2);
    }
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.75, r * 0.7);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.75, -r * 0.7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    void icon;
    void sfx;
  }
}
