import * as THREE from 'three';
import { G } from '../game/G';
import type { DamageType } from '../types/common';
import type { DamageNumberKind } from '../types/vfx';

/**
 * Floating combat text. Pooled DOM elements inside #ui-root, projected from world space every frame
 * (they stay glued to the hit position) with a 2D arc on top: pop-in scale, upward toss with gravity,
 * crit bounce + ring flash, crit shake, fade-out. Overlapping numbers are fanned out.
 * COMBAT_WOW §2.11 / CW-05: school colours, amount scale (setting numberStyle), DoT/channel tick merge,
 * weak / resisted styling, absorb / resist / miss / interrupt / mana kinds.
 */

/** Optional spawn options (all optional; omitted = plain number). */
export interface DamageNumberOpts {
  /** Damage school: colour + glow from the school table (numberStyle 'school' only). */
  type?: DamageType;
  /** Target is weak to this school: tinted number + small "ZAYIF!". */
  weak?: boolean;
  /** Target resists this school: grey-blue italic, x0.85, small "(direnç)". */
  resisted?: boolean;
  /** Tick key `target:skill`: a tick within 0.45 s of the previous one with the same key adds to the live number. */
  merge?: string;
  /** Extra emphasis: size x1.25. */
  big?: boolean;
}

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

const NORMAL_SIZE = 25;
const CRIT_MUL = 1.5;
const MERGE_WINDOW = 0.45;
/** Crit bounce keyframes [seconds, px up]: 14 px at 0.18 s, 6 px at 0.34 s, settled by 0.42 s. */
const CRIT_BOUNCE: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.18, 14], [0.26, 0], [0.34, 6], [0.42, 0]];
const CRIT_BOUNCE_END = 0.42;
const RING_CLASS = 'vfx-ring';

/** COMBAT_WOW §2.11 school colours (outline stays the dark text-shadow). */
const SCHOOL: Record<DamageType, { color: string; glow: string }> = {
  physical: { color: '#fff1d0', glow: '#6b4a1a' },
  fire: { color: '#ffa040', glow: '#a0390a' },
  frost: { color: '#8fe3ff', glow: '#1a6a99' },
  lightning: { color: '#fff05a', glow: '#7a6a00' },
  shadow: { color: '#c58cff', glow: '#4b1f8a' },
  poison: { color: '#8cff70', glow: '#2a7a10' },
  holy: { color: '#fff3a8', glow: '#8a7a10' },
  arcane: { color: '#ff8fee', glow: '#8a1f74' },
  true: { color: '#ff5a5a', glow: '#7a0000' },
};
const WEAK_TINT = '#ffe14d';
const RESIST_COLOR = '#8fa6bd';
const RESIST_GLOW = '#1d2b3a';

const STYLES: Record<DamageNumberKind, Style> = {
  normal: { color: '#fff4d6', glow: '#ffb347', size: NORMAL_SIZE, life: 0.95, vy: 80, pop: 1.7 },
  crit: { color: '#ffd23a', glow: '#ff5a00', size: Math.round(NORMAL_SIZE * CRIT_MUL), life: 1.35, vy: 100, pop: 1.9, weight: 900 },
  heal: { color: '#6dff7a', glow: '#12a82a', size: 27, life: 1.1, vy: 70, pop: 1.5 },
  player_hurt: { color: '#ff4d4d', glow: '#7a0000', size: 31, life: 1.15, vy: 80, pop: 1.9, weight: 800 },
  dot: { color: '#ffb066', glow: '#a0390a', size: 18, life: 0.7, vy: 50, pop: 1.25 },
  // status words (BAĞIŞIK / KAÇINDI / BLOKLANDI): short, small, fast fade so they never linger over a fight
  immune: { color: '#c9d4e0', glow: '#556', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  dodge: { color: '#9fe3ff', glow: '#1a6a99', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  block: { color: '#bcd0ff', glow: '#28408f', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  xp: { color: '#c58bff', glow: '#5a1fa0', size: 21, life: 1.5, vy: 80, pop: 1.3 },
  gold: { color: '#ffd84a', glow: '#8a5a00', size: 22, life: 1.3, vy: 95, pop: 1.35 },
  // CW-05 kinds
  absorb: { color: '#e6f7ff', glow: '#3d7fa8', size: 17, life: 0.7, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  resist: { color: RESIST_COLOR, glow: RESIST_GLOW, size: 16, life: 0.7, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  miss: { color: '#b8e6ff', glow: '#1f5f8c', size: 16, life: 0.6, vy: 70, pop: 1.2, italic: true, fade: 0.3 },
  interrupt: { color: '#ffe066', glow: '#8a5a00', size: 19, life: 0.9, vy: 80, pop: 1.3, italic: true, fade: 0.3 },
  mana: { color: '#7fb6ff', glow: '#1d4f9e', size: 17, life: 0.9, vy: 90, pop: 1.2 },
};

/** Fixed words; amount-less kinds. */
const TEXTS: Partial<Record<DamageNumberKind, string>> = {
  immune: 'Bağışık', dodge: 'Kaçındı', block: 'Bloklandı', miss: 'Iskaladı', interrupt: 'Kesildi',
};

/** Gravity (px/s^2) of the arc; hit numbers (they start on the body, under the nameplate) fall more slowly, so they drift up gently. */
const ARC_GRAVITY = 430;
const HIT_GRAVITY = 300;
const HIT_KINDS: ReadonlySet<DamageNumberKind> = new Set<DamageNumberKind>(['normal', 'crit', 'dot', 'player_hurt', 'heal']);

/** Kinds that show only their number/word (no hit sparks, no model flash). Used by feedback.ts. */
export const NUMBER_ONLY_KINDS: ReadonlySet<DamageNumberKind> = new Set<DamageNumberKind>(['miss', 'absorb', 'resist', 'interrupt']);

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
  /** Displayed amount; merged ticks add into it. */
  total: number;
  /** Explicit label (overrides the amount label). */
  text: string | undefined;
  /** Small trailing tag: "(direnç)" or "ZAYIF!". */
  suffix: string | null;
  /** Font size before the amount scale. */
  baseSize: number;
  mergeKey: string | null;
  /** Seconds since the last tick merged into this number. */
  sinceHit: number;
  /** A merged number stops its arc and hovers while ticks keep coming. */
  hover: boolean;
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
.vfx-dmg small{font-size:.55em;margin-left:.25em;letter-spacing:.5px;font-style:normal}
.vfx-dmg.vfx-k-crit{letter-spacing:1px}
.vfx-dmg.vfx-ring::before{content:'';position:absolute;left:50%;top:50%;width:2.4em;height:2.4em;margin:-1.2em 0 0 -1.2em;border-radius:50%;
  border:3px solid var(--g,#fff);box-shadow:0 0 10px var(--g,#fff);z-index:-1;pointer-events:none;animation:vfx-ring .32s ease-out both}
@keyframes vfx-ring{from{transform:scale(.35);opacity:.95}to{transform:scale(1.5);opacity:0}}
.vfx-flash{position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;transition:none}
`;
  document.head.appendChild(s);
}

const _v = new THREE.Vector3();

/** 'school' (default) or 'classic' (one colour, no amount scale). */
function numberStyle(): 'school' | 'classic' {
  return G.settings ? G.settings.get('numberStyle') : 'school';
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): string => {
    const v = Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
    return v.toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

function bounceAt(t: number): number {
  for (let i = 1; i < CRIT_BOUNCE.length; i++) {
    const [t1, h1] = CRIT_BOUNCE[i];
    if (t <= t1) {
      const [t0, h0] = CRIT_BOUNCE[i - 1];
      return h0 + (h1 - h0) * ((t - t0) / (t1 - t0));
    }
  }
  return 0;
}

function numberLabel(kind: DamageNumberKind, amount: number, body: string): string {
  switch (kind) {
    case 'heal': return `+${body}`;
    case 'crit': return `${body}!`;
    case 'xp': return `+${body} XP`;
    case 'gold': return `+${body} Altın`;
    case 'player_hurt': return `-${body}`;
    case 'mana': return `+${body}`;
    case 'absorb': return amount > 0 ? `(emildi) ${body}` : 'Emildi';
    case 'resist': return amount > 0 ? body : 'Direndi';
    default: return body;
  }
}

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
  /** Running average of normal player hits (playerAvgHit for the amount scale). */
  private avgHit = 0;

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

  spawn(
    pos: THREE.Vector3 | [number, number, number],
    amount: number,
    kind: DamageNumberKind,
    text?: string,
    opts?: DamageNumberOpts,
  ): void {
    if (G.settings && G.settings.data.damageNumbers === false) return;
    const layer = this.ensureLayer();
    if (!layer || !this.camera) return;
    const x = Array.isArray(pos) ? pos[0] : pos.x;
    const y = Array.isArray(pos) ? pos[1] : pos.y;
    const z = Array.isArray(pos) ? pos[2] : pos.z;

    // tick merge: same target+skill within 0.45 s -> add to the live number instead of a new DOM node
    if (opts?.merge) {
      const live = this.findMerge(opts.merge, kind);
      if (live) {
        this.mergeTick(live, amount);
        return;
      }
    }

    const style = numberStyle();
    const isDamage = kind === 'normal' || kind === 'crit' || kind === 'dot';
    if (kind === 'normal' && amount > 0) {
      this.avgHit = this.avgHit > 0 ? this.avgHit * 0.92 + amount * 0.08 : amount;
    }

    // look: school colour (school mode), weak / resisted styling, big
    const st = STYLES[kind] ?? STYLES.normal;
    let color = st.color;
    let glow = st.glow;
    let size = st.size;
    let italic = !!st.italic;
    const school = opts?.type ? SCHOOL[opts.type] : undefined;
    if (isDamage && style === 'school' && school) {
      color = school.color;
      glow = school.glow;
    }
    if (isDamage && opts?.weak) {
      color = mixHex(color, WEAK_TINT, 0.5);
      glow = '#ff3a1a';
    }
    if (isDamage && opts?.resisted) {
      color = RESIST_COLOR;
      glow = RESIST_GLOW;
      italic = true;
      size *= 0.85;
    }
    if (opts?.big) size *= 1.25;
    let suffix: string | null = null;
    if (isDamage && opts?.resisted) suffix = '(direnç)';
    else if (kind === 'resist' && amount > 0) suffix = '(direnç)';
    else if (isDamage && opts?.weak) suffix = 'ZAYIF!';

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
        it = {
          el, wx: 0, wy: 0, wz: 0, ox: 0, oy: 0, vx: 0, vy: 0, age: 0, life: 1, kind, pop: 1, shake: 0, dist: 10, sx: 0, sy: 0,
          total: 0, text: undefined, suffix: null, baseSize: size, mergeKey: null, sinceHit: 0, hover: false,
        };
      }
    }
    it.wx = x;
    it.wy = y;
    it.wz = z;
    it.kind = kind;
    it.age = 0;
    it.life = st.life;
    it.pop = st.pop;
    it.shake = kind === 'crit' ? 1 : 0;
    it.total = amount;
    it.text = text;
    it.suffix = suffix;
    it.baseSize = size;
    it.mergeKey = opts?.merge ?? null;
    it.sinceHit = 0;
    it.hover = false;
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
    // stacked numbers fan out sideways; they only lift a little, so they never climb into the nameplate above the target
    it.oy = -Math.min(stack, 2) * 6;
    it.vx = side * (40 + Math.random() * 40) * (kind === 'crit' ? 1.3 : 1);
    it.vy = -st.vy * (0.85 + Math.random() * 0.3);
    const cam = this.camera.position;
    it.dist = Math.hypot(cam.x - x, cam.y - y, cam.z - z);

    const el = it.el;
    el.className = `vfx-dmg vfx-k-${kind}`;
    el.style.display = '';
    el.style.color = color;
    el.style.fontWeight = String(st.weight ?? 800);
    el.style.fontStyle = italic ? 'italic' : 'normal';
    el.style.setProperty('--g', glow);
    el.style.opacity = '0';
    if (kind === 'crit') {
      // restart the ring animation: read layout after the class reset, then add it
      void el.offsetWidth;
      el.classList.add(RING_CLASS);
    }
    this.renderText(it);
    this.active.push(it);
    this.place(it, 0);
  }

  private findMerge(key: string, kind: DamageNumberKind): Item | null {
    for (const o of this.active) {
      if (o.mergeKey === key && o.kind === kind && o.sinceHit < MERGE_WINDOW) return o;
    }
    return null;
  }

  /** Adds a DoT / channel tick into a live number: small pulse, the number hovers instead of arcing. */
  private mergeTick(it: Item, amount: number): void {
    it.total += amount;
    it.sinceHit = 0;
    it.age = 0;
    it.pop = 1.15;
    it.hover = true;
    it.vy = 0;
    this.renderText(it);
  }

  /** Label, trailing tag and font size (amount scale in school mode) from the item's total. */
  private renderText(it: Item): void {
    const n = Math.max(0, Math.round(it.total));
    const body = n >= 100000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('tr-TR');
    const el = it.el;
    el.textContent = it.text ?? TEXTS[it.kind] ?? numberLabel(it.kind, it.total, body);
    if (it.suffix) {
      const tag = document.createElement('small');
      tag.textContent = it.suffix;
      el.appendChild(tag);
    }
    const scale = numberStyle() === 'school' ? this.amountScale(it.kind, it.total) : 1;
    el.style.fontSize = `${(it.baseSize * scale).toFixed(1)}px`;
  }

  /** COMBAT_WOW §2.11: size x clamp(0.85, 1.4, 0.9 + 0.25 * log10(amount / playerAvgHit)) for damage numbers. */
  private amountScale(kind: DamageNumberKind, amount: number): number {
    if (kind !== 'normal' && kind !== 'crit' && kind !== 'dot') return 1;
    if (this.avgHit <= 0 || amount <= 0) return 1;
    const k = 0.9 + 0.25 * Math.log10(amount / this.avgHit);
    return Math.max(0.85, Math.min(1.4, k));
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
    // crit: two damped bounces on top of the arc
    const bounce = it.kind === 'crit' && it.age < CRIT_BOUNCE_END ? bounceAt(it.age) : 0;
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
    const y = it.sy + it.oy + shy - bounce;
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
      it.sinceHit += dt;
      if (it.age >= it.life) {
        it.el.style.display = 'none';
        this.active.splice(i, 1);
        this.pool.push(it);
        continue;
      }
      // 2D ballistic arc (merged ticks hover: no gravity, vy is 0)
      if (!it.hover) it.vy += (HIT_KINDS.has(it.kind) ? HIT_GRAVITY : ARC_GRAVITY) * dt;
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
