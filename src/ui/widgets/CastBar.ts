import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { EntityId } from '../../types/common';
import { div, iconEl, ICON, setClass, setStyle, setText, setDisplay, fmtCd } from './dom';
import { statusView } from './status';

/** P-23 must-answer: uninterruptible casts show this shield (item-shield icon), interruptible ones stay gold. */
export const UNINTERRUPTIBLE_ICON = ICON('item-shield');

/** P-23: the debuff an enemy cast must be dispelled of (`EnemyAbility.dispel`), looked up on the caster's def. */
export function castDispelOf(actor: Actor, abilityId: string | undefined): string | undefined {
  if (!abilityId || actor.kind === 'player') return undefined;
  return (actor as Enemy).def?.abilities?.find((a) => a.id === abilityId)?.dispel;
}

/** Green dispel mark: style shared by the cast bar and the nameplate (inline, so no stylesheet is needed). */
export const DISPEL_MARK_CSS =
  'position:absolute;left:4px;top:50%;transform:translateY(-50%);padding:0 4px;border-radius:2px;' +
  'font:700 9px/14px var(--font-head, sans-serif);color:#d8ffc8;background:#1f6a2a;border:1px solid #7ee862;' +
  'box-shadow:0 0 4px rgba(126,232,98,0.6);white-space:nowrap;pointer-events:none;';

/** Reusable cast bar element: fill + ability name + time left. `big` variant is used by the boss frame. */
export class CastBarEl {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private name: HTMLElement;
  private time: HTMLElement;
  private lock: HTMLElement;
  private dispel: HTMLElement;
  /** Tick marks (channel ticks, charge tier tick): an overlay under the labels, rebuilt only when the list changes. */
  private ticks: HTMLElement;
  private tickKey = '';
  /** School glyph shown instead of the shield while a school is locked (CW-17). */
  private glyph: HTMLElement;
  /** Pushback flash: the lost segment (red) and its '+0.5' label; running animations are cancelled on the next flash. */
  private pushSeg: HTMLElement | null = null;
  private pushLbl: HTMLElement | null = null;
  private pushAnims: Animation[] = [];
  private shown = false;

  constructor(cls = '') {
    this.el = div('castbar ' + cls);
    this.fill = div('cb-fill', this.el);
    div('cb-shine', this.el);
    this.ticks = div('cb-ticks', this.el);
    this.ticks.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.lock = iconEl(UNINTERRUPTIBLE_ICON, 'cb-lock', this.el);
    this.glyph = div('cb-glyph', this.el);
    this.glyph.style.cssText = 'position:absolute;right:5px;top:50%;transform:translateY(-50%);font:700 11px/1 var(--font-head, sans-serif);letter-spacing:0.5px;text-shadow:0 1px 0 #000;pointer-events:none;';
    setDisplay(this.glyph, false);
    this.name = div('cb-name', this.el);
    this.time = div('cb-time', this.el);
    this.dispel = div('cb-dispel', this.el);
    this.dispel.style.cssText = DISPEL_MARK_CSS;
    setDisplay(this.el, false);
  }

  set(name: string, frac: number, remaining: number, opts: { interruptible?: boolean; channel?: boolean; interrupted?: boolean; dispel?: string; school?: { glyph: string; color: string } } = {}): void {
    if (!this.shown) {
      this.shown = true;
      setDisplay(this.el, true);
    }
    const f = Math.max(0, Math.min(1, opts.channel ? 1 - frac : frac));
    setStyle(this.fill, 'width', (f * 100).toFixed(1) + '%');
    setText(this.name, opts.interrupted ? 'Kesildi!' : name);
    setText(this.time, opts.interrupted || remaining <= 0 ? '' : fmtCd(remaining));
    const interruptible = opts.interruptible !== false;
    setClass(this.el, 'interruptible', interruptible && !opts.interrupted);
    setClass(this.el, 'locked', !interruptible && !opts.interrupted);
    setClass(this.el, 'interrupted', !!opts.interrupted);
    setClass(this.el, 'channel', !!opts.channel);
    const locked = !interruptible && !opts.interrupted;
    setDisplay(this.lock, locked && !opts.school);
    setDisplay(this.glyph, locked && !!opts.school);
    if (opts.school) {
      setText(this.glyph, opts.school.glyph);
      setStyle(this.glyph, 'color', opts.school.color);
    }
    const dispel = !opts.interrupted && opts.dispel ? opts.dispel : '';
    setDisplay(this.dispel, !!dispel);
    if (dispel) {
      setText(this.dispel, 'Temizle: ' + statusView(dispel).name);
      this.dispel.title = 'Bu büyü bir debuff bırakır: temizlenmeli';
    }
  }

  hide(): void {
    if (this.shown) {
      this.shown = false;
      setDisplay(this.el, false);
    }
  }

  /** Tick marks at these fractions of the bar width (0..1). `color` is the mark colour. Same list = no DOM work. */
  setTicks(fracs: number[], color = 'rgba(255,255,255,0.6)'): void {
    const key = color + '|' + fracs.map((f) => f.toFixed(3)).join(',');
    if (key === this.tickKey) return;
    this.tickKey = key;
    this.ticks.textContent = '';
    for (const f of fracs) {
      const m = div('cb-tick', this.ticks);
      m.style.cssText = `position:absolute;top:2px;bottom:2px;width:1px;left:${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}%;background:${color};box-shadow:0 0 2px rgba(0,0,0,0.9);`;
    }
  }

  /** Pushback (CW-17 §2.4): red segment from `fromFrac` back to `toFrac` that fades out, with a short label such as '+0.5'. */
  flashPushback(fromFrac: number, toFrac: number, label: string): void {
    if (!this.pushSeg || !this.pushLbl) {
      this.pushSeg = div('cb-push', this.el);
      this.pushSeg.style.cssText = 'position:absolute;top:0;bottom:0;pointer-events:none;opacity:0;background:linear-gradient(rgba(255,150,140,0.95),rgba(200,30,25,0.95));box-shadow:0 0 6px rgba(255,60,50,0.8);';
      this.pushLbl = div('cb-plus', this.el);
      this.pushLbl.style.cssText = 'position:absolute;top:50%;margin-top:-7px;font:700 12px/14px var(--font-head, sans-serif);color:#ffd0c8;text-shadow:0 1px 0 #000;pointer-events:none;white-space:nowrap;opacity:0;';
    }
    for (const a of this.pushAnims) a.cancel();
    this.pushAnims = [];
    const lo = Math.max(0, Math.min(1, Math.min(fromFrac, toFrac)));
    const hi = Math.max(0, Math.min(1, Math.max(fromFrac, toFrac)));
    setStyle(this.pushSeg, 'left', (lo * 100).toFixed(2) + '%');
    setStyle(this.pushSeg, 'width', ((hi - lo) * 100).toFixed(2) + '%');
    setStyle(this.pushLbl, 'left', (hi * 100).toFixed(2) + '%');
    setText(this.pushLbl, label);
    this.pushAnims.push(
      this.pushSeg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' }),
      this.pushLbl.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(10px)' }], { duration: 900, easing: 'ease-out', fill: 'forwards' }),
    );
  }
}

export interface CastView {
  name: string;
  frac: number;
  remaining: number;
  interruptible: boolean;
  interrupted: boolean;
  channel: boolean;
  /** P-23: status id this cast must be dispelled of (green mark), when the ability has `dispel`. */
  dispel?: string;
}

interface Tracked {
  name: string;
  abilityId: string;
  startNow: number;
  dur: number;
  interruptible: boolean;
  endedAt: number;
  interrupted: boolean;
}

/** Remembers enemy casts announced by 'enemy:castStart/End' and merges them with Actor.cast. */
export class CastTracker {
  private casts = new Map<EntityId, Tracked>();
  private offs: (() => void)[] = [];

  constructor() {
    this.offs.push(
      G.events.on('enemy:castStart', (e) => {
        this.casts.set(e.enemyId, { name: e.name, abilityId: e.abilityId, startNow: performance.now(), dur: Math.max(0.05, e.castTime), interruptible: e.interruptible, endedAt: 0, interrupted: false });
      }),
      G.events.on('enemy:castEnd', (e) => {
        const c = this.casts.get(e.enemyId);
        if (!c) return;
        if (e.interrupted) {
          c.endedAt = performance.now();
          c.interrupted = true;
        } else this.casts.delete(e.enemyId);
      }),
      G.events.on('scene:leaving', () => this.casts.clear()),
    );
  }

  get(actor: Actor, now: number, worldTime: number): CastView | null {
    const t = this.casts.get(actor.id);
    if (t) {
      const dispel = castDispelOf(actor, t.abilityId);
      if (t.interrupted) {
        if (now - t.endedAt > 700) {
          this.casts.delete(actor.id);
        } else return { name: t.name, frac: 1, remaining: 0, interruptible: t.interruptible, interrupted: true, channel: false };
      } else {
        const el = (now - t.startNow) / 1000;
        if (el > t.dur + 0.4) this.casts.delete(actor.id);
        else return { name: t.name, frac: Math.min(1, el / t.dur), remaining: Math.max(0, t.dur - el), interruptible: t.interruptible, interrupted: false, channel: false, dispel };
      }
    }
    const c = actor.cast;
    if (c && c.duration > 0.05) {
      const el = worldTime - c.start;
      return { name: c.name, frac: Math.max(0, Math.min(1, el / c.duration)), remaining: Math.max(0, c.duration - el), interruptible: c.interruptible, interrupted: false, channel: c.channel, dispel: castDispelOf(actor, c.skillId) };
    }
    return null;
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs = [];
  }
}
