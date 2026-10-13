import { G } from '../../game/G';
import { comboTierStyle } from './ComboCounter';
import { div, pulse, setClass, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** How long the route banner stays up (ms). */
const SHOW_MS = 2600;

/**
 * Combo route banner (`combo:route`, GDD_V2 §3.9): "ROTA TAMAMLANDI" with the route's name sliding in from the left, coloured by the
 * combo tier it reached (same palette as the combo counter). Sits above the combo counter. OWNER: hud module.
 */
export class ComboRouteBanner implements HudWidget {
  readonly el: HTMLElement;
  private name: HTMLElement;
  private tier: HTMLElement;
  private until = 0;

  constructor() {
    this.el = div('cr');
    div('cr-label', this.el, 'ROTA TAMAMLANDI');
    this.name = div('cr-name', this.el);
    this.tier = div('cr-tier', this.el);
    div('cr-bar', this.el);
    G.events.on('combo:route', ({ name, tier }) => {
      const st = comboTierStyle(tier);
      setText(this.name, name);
      setText(this.tier, tier > 0 ? `${tier}. KADEME  ·  ${st.name}` : st.name);
      setStyle(this.el, '--c1', st.c1);
      setStyle(this.el, '--c2', st.c2);
      setStyle(this.el, '--glow', st.glow);
      // restart the slide-in when a second route lands while the first is still up
      setClass(this.el, 'on', true);
      pulse(this.el, 'in');
      this.until = performance.now() + SHOW_MS;
    });
    G.events.on('scene:leaving', () => this.reset());
  }

  update(ctx: HudCtx): void {
    if (this.until && ctx.now > this.until) {
      this.until = 0;
      setClass(this.el, 'on', false);
      setClass(this.el, 'in', false);
    }
  }

  reset(): void {
    this.until = 0;
    setClass(this.el, 'on', false);
    setClass(this.el, 'in', false);
  }
}
