import * as THREE from 'three';
import { G } from '../game/G';
import type { DamageNumberKind } from '../types/vfx';

/**
 * Floating combat text. Pooled DOM elements inside #ui-root, projected from world space every frame
 * (they stay glued to the hit position) with a 2D arc on top: pop-in scale, upward toss with gravity,
 * crit shake, fade-out. Overlapping numbers are fanned out.
 */

interface Style {
  color: string;
  glow: string;
  size: number;      // px
  life: number;
  vy: number;        // initial upward px/s
  pop: number;       // initial scale
  weight?: number;
  italic?: boolean;
  /** Fraction of `life` after which the text starts to fade (default 0.55). */
  fade?: number;
}

const STYLES: Record<DamageNumberKind, Style> = {
  normal: { color: '#fff4d6', glow: '#ffb347', size: 25, life: 0.95, vy: 170, pop: 1.7 },
  crit: { color: '#ffd23a', glow: '#ff5a00', size: 40, life: 1.35, vy: 210, pop: 2.4, weight: 900 },
  heal: { color: '#6dff7a', glow: '#12a82a', size: 27, life: 1.1, vy: 120, pop: 1.5 },
  player_hurt: { color: '#ff4d4d', glow: '#7a0000', size: 31, life: 1.15, vy: 150, pop: 1.9, weight: 800 },
  dot: { color: '#ffb066', glow: '#a0390a', size: 18, life: 0.7, vy: 90, pop: 1.25 },
  // status words (BAĞIŞIK / KAÇINDI / BLOKLANDI): short, small, fast fade so they never linger over a fight
  immune: { color: '#c9d4e0', glow: '#556', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  dodge: { color: '#9fe3ff', glow: '#1a6a99', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  block: { color: '#bcd0ff', glow: '#28408f', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  xp: { color: '#c58bff', glow: '#5a1fa0', size: 21, life: 1.5, vy: 80, pop: 1.3 },
  gold: { color: '#ffd84a', glow: '#8a5a00', size: 22, life: 1.3, vy: 95, pop: 1.35 },
  // COMBAT_WOW §4.3 CW-01 placeholders (styles only; CW-05 owns the final colours): status words and the mana gain number
  absorb: { color: '#e6f7ff', glow: '#3d7fa8', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  resist: { color: '#d7c6ff', glow: '#4b2c8a', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  miss: { color: '#b8e6ff', glow: '#1f5f8c', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  interrupt: { color: '#ffe9a0', glow: '#8a5a00', size: 18, life: 0.8, vy: 80, pop: 1.3, italic: true, fade: 0.3 },
  mana: { color: '#7fb6ff', glow: '#1d4f9e', size: 20, life: 1.0, vy: 90, pop: 1.25 },
};

const TEXTS: Partial<Record<DamageNumberKind, string>> = {
  immune: 'Bağışık', dodge: 'Kaçındı', block: 'Bloklandı',
  absorb: 'Emildi', resist: 'Direndi', miss: 'Iskaladı', interrupt: 'Kesildi',
};

/** Status words are capped on screen: a new one past this count replaces the oldest status word. */
const STATUS_KINDS: ReadonlySet<DamageNumberKind> = new Set<DamageNumberKind>(['immune', 'dodge', 'block']);
const MAX_STATUS_TEXTS = 3;

interface Item {
  el: HTMLDivElement;
  wx: number;
  wy: number;
  wz: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  kind: DamageNumberKind;
  pop: number;
  shake: number;
  dist: number;
  sx: number;
  sy: number;
}

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.vfx-dmg-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4}
.vfx-dmg{position:absolute;left:0;top:0;white-space:nowrap;font-family:var(--font-head,'Cinzel',serif);font-weight:800;line-height:1;
  transform-origin:50% 100%;will-change:transform,opacity;user-select:none;letter-spacing:.5px;
  text-shadow:-2px 0 #1a0d05,2px 0 #1a0d05,0 -2px #1a0d05,0 2px #1a0d05,-1px -1px #1a0d05,1px 1px #1a0d05,-1px 1px #1a0d05,1px -1px #1a0d05,0 0 10px var(--g,#000)}
.vfx-dmg.vfx-k-crit{letter-spacing:1px}
.vfx-flash{position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;transition:none}
`;
  document.head.appendChild(s);
}

const _v = new THREE.Vector3();

export class DamageNumbers {
  private layer: HTMLDivElement | null = null;
  private pool: Item[] = [];
  private active: Item[] = [];
  camera: THREE.Camera | null = null;
  private max = 48;
  private flashEl: HTMLDivElement | null = null;
  private flashT = 0;
  private flashDur = 0;
  private flashPeak = 0;

  private ensureLayer(): HTMLDivElement | null {
    if (typeof document === 'undefined') return null;
    injectStyle();
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'vfx-dmg-layer';
    }
    if (!this.layer.isConnected) {
      const root = document.getElementById('ui-root') ?? document.body;
      root.insertBefore(this.layer, root.firstChild);
    }
    return this.layer;
  }

  spawn(pos: THREE.Vector3 | [number, number, number], amount: number, kind: DamageNumberKind, text?: string): void {
    try {
      if (G.settings && G.settings.data.damageNumbers === false) return;
    } catch {
      /* settings not ready */
    }
    const layer = this.ensureLayer();
    if (!layer || !this.camera) return;
    const st = STYLES[kind] ?? STYLES.normal;
    if (STATUS_KINDS.has(kind)) {
      // cap simultaneous status words: recycle the oldest one (it is hidden right away)
      let oldest: Item | null = null;
      let live = 0;
      for (const o of this.active) {
        if (!STATUS_KINDS.has(o.kind)) continue;
        live++;
        if (!oldest || o.age > oldest.age) oldest = o;
      }
      if (live >= MAX_STATUS_TEXTS && oldest) {
        this.active.splice(this.active.indexOf(oldest), 1);
        oldest.el.style.display = 'none';
        this.pool.push(oldest);
      }
    }
    let it = this.pool.pop();
    if (!it) {
      if (this.active.length >= this.max) {
        const old = this.active.shift()!;
        old.el.style.display = 'none';
        it = old;
      } else {
        const el = document.createElement('div');
        el.className = 'vfx-dmg';
        layer.appendChild(el);
        it = { el, wx: 0, wy: 0, wz: 0, ox: 0, oy: 0, vx: 0, vy: 0, age: 0, life: 1, kind, pop: 1, shake: 0, dist: 10, sx: 0, sy: 0 };
      }
    }
    const x = Array.isArray(pos) ? pos[0] : pos.x;
    const y = Array.isArray(pos) ? pos[1] : pos.y;
    const z = Array.isArray(pos) ? pos[2] : pos.z;
    it.wx = x;
    it.wy = y;
    it.wz = z;
    it.kind = kind;
    it.age = 0;
    it.life = st.life;
    it.pop = st.pop;
    it.shake = kind === 'crit' ? 1 : 0;
    // fan out numbers that would overlap on screen
    _v.set(x, y, z).project(this.camera);
    const W = G.engine?.width ?? window.innerWidth;
    const H = G.engine?.height ?? window.innerHeight;
    const sx = (_v.x * 0.5 + 0.5) * W;
    const sy = (-_v.y * 0.5 + 0.5) * H;
    let stack = 0;
    for (const o of this.active) {
      if (o.age < 0.55 && Math.abs(o.sx - sx) < 70 && Math.abs(o.sy - sy + o.oy) < 40) stack++;
    }
    stack = Math.min(stack, 5);
    const side = (Math.random() < 0.5 ? -1 : 1) * (stack % 2 ? 1 : -1);
    it.ox = side * (8 + stack * 10) + (Math.random() - 0.5) * 16;
    it.oy = -stack * 18;
    it.vx = side * (30 + Math.random() * 40) * (kind === 'crit' ? 1.3 : 1);
    it.vy = -st.vy * (0.85 + Math.random() * 0.3);
    const cam = this.camera.position;
    it.dist = Math.hypot(cam.x - x, cam.y - y, cam.z - z);

    const el = it.el;
    let label = text ?? TEXTS[kind];
    if (label === undefined) {
      const n = Math.max(0, Math.round(amount));
      const body = n >= 100000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('tr-TR');
      label =
        kind === 'heal' ? `+${body}`
        : kind === 'crit' ? `${body}!`
        : kind === 'xp' ? `+${body} XP`
        : kind === 'gold' ? `+${body} Altın`
        : kind === 'player_hurt' ? `-${body}`
        : body;
    }
    el.textContent = label;
    el.className = `vfx-dmg vfx-k-${kind}`;
    el.style.display = '';
    el.style.color = st.color;
    el.style.fontSize = `${st.size}px`;
    el.style.fontWeight = String(st.weight ?? 800);
    el.style.fontStyle = st.italic ? 'italic' : 'normal';
    el.style.setProperty('--g', st.glow);
    el.style.opacity = '0';
    this.active.push(it);
    this.place(it, 0);
  }

  private place(it: Item, dt: number): void {
    const cam = this.camera!;
    _v.set(it.wx, it.wy, it.wz).project(cam);
    const W = G.engine?.width ?? window.innerWidth;
    const H = G.engine?.height ?? window.innerHeight;
    it.sx = (_v.x * 0.5 + 0.5) * W;
    it.sy = (-_v.y * 0.5 + 0.5) * H;
    const t = it.age / it.life;
    // scale: quick overshoot pop then settle
    const popT = Math.min(1, it.age / 0.14);
    let sc = 1 + (it.pop - 1) * Math.pow(1 - popT, 2);
    const distScale = Math.max(0.6, Math.min(1.25, 15 / Math.max(4, it.dist)));
    sc *= distScale;
    if (it.kind === 'crit' && it.age < 0.5) sc *= 1 + Math.sin(it.age * 38) * 0.06 * (1 - it.age * 2);
    let shx = 0, shy = 0;
    if (it.shake > 0 && it.age < 0.32) {
      const k = (1 - it.age / 0.32) * 5;
      shx = (Math.random() - 0.5) * 2 * k;
      shy = (Math.random() - 0.5) * 2 * k;
    }
    const fade = STYLES[it.kind]?.fade ?? 0.55;
    const alpha = t < fade ? 1 : Math.max(0, 1 - (t - fade) / (1 - fade));
    const behind = _v.z > 1 || _v.z < -1;
    const x = it.sx + it.ox + shx;
    const y = it.sy + it.oy + shy;
    it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${sc.toFixed(3)})`;
    it.el.style.opacity = behind ? '0' : alpha.toFixed(2);
    void dt;
  }

  update(dt: number): void {
    // screen flash decay
    if (this.flashEl && this.flashT < this.flashDur) {
      this.flashT += dt;
      const k = Math.max(0, 1 - this.flashT / this.flashDur);
      this.flashEl.style.opacity = String(this.flashPeak * k * k);
    }
    if (!this.active.length || !this.camera) return;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.age += dt;
      if (it.age >= it.life) {
        it.el.style.display = 'none';
        this.active.splice(i, 1);
        this.pool.push(it);
        continue;
      }
      // 2D ballistic arc
      it.vy += 430 * dt;
      it.oy += it.vy * dt;
      it.ox += it.vx * dt;
      it.vx *= Math.exp(-2.2 * dt);
      this.place(it, dt);
    }
  }

  /** Edge-of-screen colour flash (legendary drop, big hit taken). */
  screenFlash(color: string, peak = 0.5, dur = 0.5): void {
    const layer = this.ensureLayer();
    if (!layer) return;
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.className = 'vfx-flash';
      layer.appendChild(this.flashEl);
    }
    if (!this.flashEl.isConnected) layer.appendChild(this.flashEl);
    this.flashEl.style.background = `radial-gradient(ellipse at center, transparent 55%, ${color} 120%)`;
    this.flashEl.style.opacity = String(peak);
    this.flashT = 0;
    this.flashDur = dur;
    this.flashPeak = peak;
  }

  clear(): void {
    for (const it of this.active) {
      it.el.style.display = 'none';
      this.pool.push(it);
    }
    this.active.length = 0;
  }
}
