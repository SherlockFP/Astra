import { G } from '../../game/G';
import { clamp01, div, pulse, setClass, setStyle } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Full-screen overlays: low-HP red vignette (pulsing), damage/heal flashes, loot edge flash and the death desaturation. */
export class Vignette implements HudWidget {
  readonly el: HTMLElement;
  private low: HTMLElement;
  private hit: HTMLElement;
  private heal: HTMLElement;
  private edge: HTMLElement;
  private dead: HTMLElement;
  private lowAmt = 0;

  constructor() {
    this.el = div('vig');
    this.dead = div('vig-dead', this.el);
    this.low = div('vig-low', this.el);
    this.hit = div('vig-hit', this.el);
    this.heal = div('vig-heal', this.el);
    this.edge = div('vig-edge', this.el);
    G.events.on('damage', (e) => {
      const p = G.player;
      if (!p || e.targetId !== p.id) return;
      if (e.kind === 'dodge' || e.kind === 'immune' || e.kind === 'block') return;
      const k = clamp01((e.amount / Math.max(1, p.maxHp)) * 5 + 0.22);
      setStyle(this.hit, '--a', k.toFixed(2));
      pulse(this.hit, 'go');
    });
    G.events.on('heal', (e) => {
      const p = G.player;
      if (!p || e.targetId !== p.id) return;
      if (e.amount < p.maxHp * 0.06) return;
      setStyle(this.heal, '--a', clamp01(e.amount / p.maxHp + 0.2).toFixed(2));
      pulse(this.heal, 'go');
    });
    G.events.on('player:died', ({ local }) => {
      if (local) setClass(this.el, 'dead', true);
    });
    G.events.on('player:revived', ({ local }) => {
      if (local) setClass(this.el, 'dead', false);
    });
    G.events.on('scene:leaving', () => setClass(this.el, 'dead', false));
  }

  flashEdge(color: string, strength = 1): void {
    setStyle(this.edge, '--c', color);
    setStyle(this.edge, '--a', clamp01(strength).toFixed(2));
    pulse(this.edge, 'go');
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    let target = 0;
    if (p && !p.isDead && p.maxHp > 0) {
      const f = p.hp / p.maxHp;
      if (f < 0.35) target = clamp01((0.35 - f) / 0.3);
    }
    this.lowAmt += (target - this.lowAmt) * Math.min(1, ctx.dt * 4);
    const pulseK = 0.65 + 0.35 * Math.sin(ctx.t * (3 + this.lowAmt * 4));
    setStyle(this.low, 'opacity', (this.lowAmt * pulseK).toFixed(3));
  }
}
