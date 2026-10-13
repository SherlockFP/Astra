import { div, fmtNum, h, setClass, setText, approach, clamp01, pulse } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import type { ResourceType } from '../../types/common';

type OrbKind = 'hp' | ResourceType;
type RGB = [number, number, number];

/** Bright (surface) -> dark (bottom) colour bands per liquid. Chunky banded shading = PSX-era look. */
const PALETTES: Record<OrbKind, RGB[]> = {
  hp: [[255, 150, 130], [240, 70, 70], [210, 36, 44], [160, 20, 30], [104, 12, 20], [58, 6, 12]],
  mana: [[170, 220, 255], [92, 160, 248], [42, 107, 216], [28, 72, 168], [16, 40, 108], [8, 22, 64]],
  rage: [[255, 190, 120], [244, 120, 52], [200, 70, 28], [150, 44, 18], [98, 26, 10], [54, 14, 6]],
  energy: [[255, 246, 170], [246, 220, 70], [226, 190, 40], [172, 138, 22], [112, 88, 12], [62, 48, 6]],
  // GDD_CLASSES_V2 §1.2 (NC04): focus #d9a441, faith #ffe9a0, essence #6fe3b0 (dark bands are the same ramp as above)
  focus: [[255, 226, 150], [230, 176, 76], [200, 140, 44], [150, 100, 28], [100, 64, 16], [60, 36, 8]],
  faith: [[255, 250, 220], [255, 233, 160], [230, 200, 110], [180, 150, 70], [120, 96, 40], [70, 56, 24]],
  essence: [[200, 255, 230], [120, 227, 176], [70, 190, 140], [44, 140, 104], [28, 92, 70], [14, 52, 40]],
  // CORE_MECHANICS §2 (CM1 stub): İblis Avcısı Gazap, fel-green (#b8ff3a); dark bands follow the energy ramp
  fury: [[238, 255, 190], [184, 255, 58], [140, 210, 40], [104, 160, 30], [70, 110, 20], [40, 64, 10]],
};
const EMPTY: RGB[] = [[34, 24, 24], [26, 18, 18], [18, 12, 13], [12, 8, 9]];

const W = 72;
const R = W / 2;
const MASK = new Uint8Array(W * W); // 0 outside, 1 inside, 2 outer rim
const LIGHT_X = W * 0.34;
const LIGHT_Y = W * 0.28;
const SHADE = new Float32Array(W * W);
(() => {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
      MASK[y * W + x] = d > R - 0.5 ? 0 : d > R - 3 ? 2 : 1;
      SHADE[y * W + x] = clamp01(Math.hypot(x - LIGHT_X, y - LIGHT_Y) / (W * 1.05));
    }
  }
})();

interface Bubble { x: number; y: number; v: number; s: number }

/** One liquid orb: a 72x72 pixel canvas upscaled with nearest filtering + CSS metal frame and glass. */
class Orb {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;
  private valueEl: HTMLElement;
  private labelEl: HTMLElement;
  private kind: OrbKind;
  private fill = 1;
  private lag = 1;
  private target = 1;
  private flash = 0;
  private flashHeal = false;
  private t = Math.random() * 10;
  private bubbles: Bubble[] = [];
  private surf = new Float32Array(W);
  private lastFrac = 1;

  constructor(kind: OrbKind, cls: string) {
    this.kind = kind;
    this.el = div('orb ' + cls);
    div('orb-back', this.el);
    this.canvas = h('canvas', 'orb-canvas', this.el) as HTMLCanvasElement;
    this.canvas.width = W;
    this.canvas.height = W;
    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) this.img = this.ctx.createImageData(W, W);
    div('orb-glass', this.el);
    div('orb-ring', this.el);
    const txt = div('orb-text', this.el);
    this.valueEl = div('orb-val', txt);
    this.labelEl = div('orb-lbl', txt);
    for (let i = 0; i < 6; i++) this.bubbles.push(this.newBubble(true));
    this.applyKind(kind);
  }

  private newBubble(initial: boolean): Bubble {
    return { x: 8 + Math.random() * (W - 16), y: initial ? Math.random() * W : W - 4, v: 6 + Math.random() * 12, s: Math.random() < 0.3 ? 2 : 1 };
  }

  applyKind(kind: OrbKind): void {
    this.kind = kind;
    this.el.dataset.kind = kind;
    const names: Record<OrbKind, string> = { hp: 'CAN', rage: 'ÖFKE', mana: 'MANA', energy: 'ENERJİ', focus: 'ODAK', faith: 'İNANÇ', essence: 'ÖZ', fury: 'GAZAP' };
    setText(this.labelEl, names[kind]);
  }

  setKind(kind: OrbKind): void {
    if (kind !== this.kind) this.applyKind(kind);
  }

  update(dt: number, cur: number, max: number, dead: boolean): void {
    const frac = max > 0 ? clamp01(cur / max) : 0;
    this.target = frac;
    // flash on notable change
    const delta = frac - this.lastFrac;
    if (Math.abs(delta) > 0.012) {
      this.flash = Math.min(1, Math.abs(delta) * 6 + 0.35);
      this.flashHeal = delta > 0;
      if (delta < 0) pulse(this.el, 'hit');
    }
    this.lastFrac = frac;
    // fill follows quickly; ghost (lag) follows slowly when losing
    this.fill = approach(this.fill, this.target, delta > 0 ? 6 : 14, dt);
    if (Math.abs(this.fill - this.target) < 0.002) this.fill = this.target;
    if (this.lag < this.fill) this.lag = this.fill;
    else this.lag = approach(this.lag, this.fill, 1.6, dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.t += dt;
    setText(this.valueEl, `${fmtNum(cur)} / ${fmtNum(max)}`);
    setClass(this.el, 'low', this.kind === 'hp' && frac < 0.3 && !dead && max > 0);
    setClass(this.el, 'dead', dead);
    this.draw(dt);
  }

  private draw(dt: number): void {
    const img = this.img;
    const ctx = this.ctx;
    if (!img || !ctx) return;
    const data = img.data;
    const pal = PALETTES[this.kind];
    const nb = pal.length;
    const t = this.t;
    const fill = this.fill;
    const lag = this.lag;
    const edgeAmp = Math.min(1, fill / 0.07, (1 - fill) / 0.07);
    const amp = edgeAmp * (this.kind === 'hp' ? 1.0 : 0.85);
    const baseY = W * (1 - fill);
    const lagY = W * (1 - lag);
    const flash = this.flash;
    const fr = this.flashHeal ? 200 : 255, fg = 255, fb = this.flashHeal ? 200 : 255;
    // bubble motion
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.y -= b.v * dt;
      b.x += Math.sin(t * 3 + i) * dt * 4;
      if (b.y < baseY + 3) this.bubbles[i] = this.newBubble(false);
    }
    const surf = this.surf;
    for (let x = 0; x < W; x++) {
      surf[x] = baseY + (Math.sin(x * 0.2 + t * 2.4) * 1.5 + Math.sin(x * 0.09 - t * 1.7) * 1.2 + Math.sin(x * 0.45 + t * 4.1) * 0.35) * amp;
    }
    const lagSurf = lagY;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        const m = MASK[i];
        if (m === 0) {
          data[o + 3] = 0;
          continue;
        }
        let r: number, g: number, b: number;
        const sy = surf[x];
        const sh = SHADE[i];
        if (y >= sy) {
          // liquid
          const depth = y - sy;
          let s = sh * 0.8 + (y / W) * 0.28;
          if (depth < 1.5) s = 0;
          else if (depth < 4) s *= 0.45;
          let bi = Math.min(nb - 1, Math.floor(s * nb));
          if (bi < 0) bi = 0;
          const c = pal[bi];
          r = c[0]; g = c[1]; b = c[2];
          if (m === 2) { r *= 0.7; g *= 0.7; b *= 0.7; }
        } else if (y >= sy - (lagSurf < sy ? sy - lagSurf : 0) && lag > fill + 0.004) {
          // ghost trail of lost value, dithered
          const c = pal[1];
          if ((x + y) & 1) { r = c[0] * 0.55 + 60; g = c[1] * 0.4 + 40; b = c[2] * 0.4 + 40; }
          else { r = 40; g = 24; b = 24; }
        } else {
          const ei = Math.min(EMPTY.length - 1, Math.floor(sh * EMPTY.length));
          const c = EMPTY[ei];
          r = c[0]; g = c[1]; b = c[2];
        }
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    // bubbles + flash (second pass keeps the main loop tight)
    for (const bub of this.bubbles) {
      const bx = Math.round(bub.x), by = Math.round(bub.y);
      for (let dy = 0; dy < bub.s; dy++) {
        for (let dx = 0; dx < bub.s; dx++) {
          const px = bx + dx, py = by + dy;
          if (px < 0 || py < 0 || px >= W || py >= W) continue;
          const i = py * W + px;
          if (MASK[i] !== 1 || py < surf[px] + 2) continue;
          const o = i * 4;
          const c = pal[0];
          data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
        }
      }
    }
    if (flash > 0.01) {
      const k = flash * 0.75;
      for (let i = 0; i < W * W; i++) {
        if (MASK[i] === 0) continue;
        const o = i * 4;
        data[o] += (fr - data[o]) * k;
        data[o + 1] += (fg - data[o + 1]) * k;
        data[o + 2] += (fb - data[o + 2]) * k;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}

/** HP orb (left) and resource orb (right) of the Diablo-style bottom bar. The BottomBar composite mounts them. */
export class OrbsWidget implements HudWidget {
  readonly el: HTMLElement = div('hb-orbs-holder');
  readonly hpOrb: Orb;
  readonly resOrb: Orb;
  readonly hpEl: HTMLElement;
  readonly resEl: HTMLElement;

  constructor() {
    this.hpOrb = new Orb('hp', 'orb-hp');
    this.resOrb = new Orb('mana', 'orb-res');
    this.hpEl = this.hpOrb.el;
    this.resEl = this.resOrb.el;
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    if (!p) {
      this.hpOrb.update(ctx.dt, 1, 1, false);
      this.resOrb.update(ctx.dt, 1, 1, false);
      return;
    }
    const dead = p.isDead;
    this.hpOrb.update(ctx.dt, Math.max(0, p.hp), p.maxHp, dead);
    this.resOrb.setKind(p.resourceType);
    this.resOrb.update(ctx.dt, Math.max(0, p.resource), p.maxResource, dead);
  }
}
