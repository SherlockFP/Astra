import { G } from '../../game/G';
import type { InputAction } from '../../core/Input';
import { FLASK_SLOT_COUNT, getFlaskBase } from '../../data/flasks';
import { div, h, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Şişe Kemeri belt keys, flask1..flask5 = 6 7 8 9 0 (UI §2.6.5). */
const FLASK_ACTIONS: InputAction[] = ['flask1', 'flask2', 'flask3', 'flask4', 'flask5'];

interface FlaskCell {
  el: HTMLElement;
  ico: HTMLElement;
  fill: HTMLElement;
  key: HTMLElement;
  count: HTMLElement;
}

/**
 * The equipped flasks of the belt (UI §2.6.5): small `.ab-btn` squares next to the potions, shown only while a flask sits in
 * that belt slot. The liquid fill is charges / max; greyed while the charges are below the flask's use cost.
 * Clicking a flask only flashes it: the flask use call is not exposed to the HUD yet (deferred).
 */
export class FlaskRow implements HudWidget {
  readonly el: HTMLElement;
  private cells: FlaskCell[] = [];

  constructor() {
    this.el = div('flask-row');
    for (let i = 0; i < FLASK_SLOT_COUNT; i++) {
      const el = div('k-slot ab-btn k-slot--cons flask');
      el.dataset.flask = String(i + 1);
      const ico = iconEl(null, 'k-art', el);
      const fill = div('k-fill', el);
      const key = h('div', 'k-key-lbl', el, '');
      const count = div('k-count', el);
      el.classList.add('hud-interactive');
      el.addEventListener('click', () => pulse(el, 'press'));
      setDisplay(el, false);
      this.el.appendChild(el);
      this.cells.push({ el, ico, fill, key, count });
    }
    // flask:used carries the belt slot 1..5: flash that flask's cell
    G.events.on('flask:used', ({ slot }) => {
      const cell = this.cells[slot - 1];
      if (cell) pulse(cell.el, 'press');
    });
  }

  update(ctx: HudCtx): void {
    const c = ctx.character;
    const flasks = c?.save.flasks ?? [];
    const charges = c?.save.flaskCharges ?? [];
    for (let i = 0; i < FLASK_SLOT_COUNT; i++) {
      const cell = this.cells[i];
      const item = flasks[i] ?? null;
      setDisplay(cell.el, !!item, 'block');
      if (!item) continue;
      // key labels follow the bindings (never hard-coded digits)
      setText(cell.key, G.input ? G.input.bindingLabel(FLASK_ACTIONS[i]) : '');
      const base = getFlaskBase(item.baseId);
      const ch = charges[i] ?? 0;
      // the tier cap: the base's first tier until the affix tiers are wired (WP3); no flask exists in data yet
      const max = base ? base.max[0] : 0;
      setIconUrl(cell.ico, base?.icon ?? null);
      setStyle(cell.fill, 'height', (max > 0 ? Math.min(1, ch / max) * 100 : 0).toFixed(1) + '%');
      setClass(cell.el, 'empty', ch < (base?.use ?? 1));
      setText(cell.count, String(ch));
      setClass(cell.count, 'is-zero', ch <= 0);
      setDisplay(cell.count, ch > 1 || ch <= 0);
    }
  }
}
