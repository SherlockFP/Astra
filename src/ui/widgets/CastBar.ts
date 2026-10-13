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
  private shown = false;

  constructor(cls = '') {
    this.el = div('castbar ' + cls);
    this.fill = div('cb-fill', this.el);
    div('cb-shine', this.el);
    this.lock = iconEl(UNINTERRUPTIBLE_ICON, 'cb-lock', this.el);
    this.name = div('cb-name', this.el);
    this.time = div('cb-time', this.el);
    this.dispel = div('cb-dispel', this.el);
    this.dispel.style.cssText = DISPEL_MARK_CSS;
    setDisplay(this.el, false);
  }

  set(name: string, frac: number, remaining: number, opts: { interruptible?: boolean; channel?: boolean; interrupted?: boolean; dispel?: string } = {}): void {
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
    setDisplay(this.lock, !interruptible && !opts.interrupted);
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
