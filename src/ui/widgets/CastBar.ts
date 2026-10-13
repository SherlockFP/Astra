import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { EntityId } from '../../types/common';
import { div, iconEl, ICON, setClass, setStyle, setText, setDisplay, fmtCd } from './dom';

/** Reusable cast bar element: fill + ability name + time left. `big` variant is used by the boss frame. */
export class CastBarEl {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private name: HTMLElement;
  private time: HTMLElement;
  private lock: HTMLElement;
  private shown = false;

  constructor(cls = '') {
    this.el = div('castbar ' + cls);
    this.fill = div('cb-fill', this.el);
    div('cb-shine', this.el);
    this.lock = iconEl(ICON('ui-lock'), 'cb-lock', this.el);
    this.name = div('cb-name', this.el);
    this.time = div('cb-time', this.el);
    setDisplay(this.el, false);
  }

  set(name: string, frac: number, remaining: number, opts: { interruptible?: boolean; channel?: boolean; interrupted?: boolean } = {}): void {
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
}

interface Tracked {
  name: string;
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
        this.casts.set(e.enemyId, { name: e.name, startNow: performance.now(), dur: Math.max(0.05, e.castTime), interruptible: e.interruptible, endedAt: 0, interrupted: false });
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
      if (t.interrupted) {
        if (now - t.endedAt > 700) {
          this.casts.delete(actor.id);
        } else return { name: t.name, frac: 1, remaining: 0, interruptible: t.interruptible, interrupted: true, channel: false };
      } else {
        const el = (now - t.startNow) / 1000;
        if (el > t.dur + 0.4) this.casts.delete(actor.id);
        else return { name: t.name, frac: Math.min(1, el / t.dur), remaining: Math.max(0, t.dur - el), interruptible: t.interruptible, interrupted: false, channel: false };
      }
    }
    const c = actor.cast;
    if (c && c.duration > 0.05) {
      const el = worldTime - c.start;
      return { name: c.name, frac: Math.max(0, Math.min(1, el / c.duration)), remaining: Math.max(0, c.duration - el), interruptible: c.interruptible, interrupted: false, channel: c.channel };
    }
    return null;
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs = [];
  }
}
