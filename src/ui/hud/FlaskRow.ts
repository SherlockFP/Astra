import { G } from '../../game/G';
import type { InputAction } from '../../core/Input';
import { FLASK_SLOT_COUNT, flaskMaxCharges, getFlaskBase, hasFlaskUpgrade } from '../../data/flasks';
import { bindTip, drag } from '../panels/items/common';
import { div, h, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Şişe Kemeri belt keys, flask1..flask5 = 6 7 8 9 0 (UI §2.6.5). */
const FLASK_ACTIONS: InputAction[] = ['flask1', 'flask2', 'flask3', 'flask4', 'flask5'];

interface FlaskCell {
  el: HTMLElement;
  ico: HTMLElement;
  fill: HTMLElement;
  sweep: HTMLElement;
  cdText: HTMLElement;
  key: HTMLElement;
  pips: HTMLElement;
  pipEls: HTMLElement[];
  count: HTMLElement;
  baseId: string | null;
}

/**
 * The equipped flasks of the belt (UI §2.6.5): `.ab-btn` squares next to the potions, shown only while a flask sits in that
 * belt slot. Each shows its charges as pips and the liquid fill (charges / cap), greys out with no charge left, and carries a
 * cooldown sweep. A click drinks (Combat.useFlask); a flask drags onto an action bar cell like any consumable.
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
      const sweep = div('flask-sweep', el);
      const cdText = h('div', 'flask-cd-text', el, '');
      const key = h('div', 'k-key-lbl', el, '');
      const pips = div('flask-pips', el);
      const count = div('k-count', el);
      el.classList.add('hud-interactive');
      el.addEventListener('click', () => {
        pulse(el, 'press');
        G.combat?.useFlask(i);
      });
      setDisplay(el, false);
      this.el.appendChild(el);
      const cell: FlaskCell = { el, ico, fill, sweep, cdText, key, pips, pipEls: [], count, baseId: null };
      this.cells.push(cell);
      // drag source: the flask's base id goes onto a bar cell (barDrop; the bar drinks it from its belt slot)
      drag.bindSource(el, {
        payload: () => (cell.baseId ? { kind: 'mat', id: cell.baseId } : null),
      });
      bindTip(el, () => this.tipHtml(cell));
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
      if (!item) {
        cell.baseId = null;
        continue;
      }
      cell.baseId = item.baseId;
      // key labels follow the bindings (never hard-coded digits)
      setText(cell.key, G.input ? G.input.bindingLabel(FLASK_ACTIONS[i]) : '');
      const base = getFlaskBase(item.baseId);
      const ch = charges[i] ?? 0;
      const max = c ? flaskMaxCharges(item.baseId, hasFlaskUpgrade(c.save)) : 0;
      setIconUrl(cell.ico, base?.icon ?? null);
      setStyle(cell.fill, 'height', (max > 0 ? Math.min(1, ch / max) * 100 : 0).toFixed(1) + '%');
      this.drawPips(cell, max, ch);
      // cooldown sweep: the part still to wait, shrinking from the top
      const left = G.combat?.flaskCooldown(i) ?? 0;
      const total = base?.cd ?? 0;
      const onCd = left > 0.05 && total > 0;
      setClass(cell.el, 'oncd', onCd);
      setDisplay(cell.sweep, onCd, 'block');
      setDisplay(cell.cdText, onCd, 'block');
      if (onCd) {
        setStyle(cell.sweep, 'height', (Math.min(1, left / total) * 100).toFixed(1) + '%');
        setText(cell.cdText, String(Math.ceil(left)));
      }
      setClass(cell.el, 'empty', ch < (base?.use ?? 1));
      setText(cell.count, String(ch));
      setClass(cell.count, 'is-zero', ch <= 0);
      setDisplay(cell.count, ch > 1 || ch <= 0);
    }
  }

  /** One pip per charge: lit = a charge left. Rebuilt only when the cap changes. */
  private drawPips(cell: FlaskCell, max: number, ch: number): void {
    if (cell.pipEls.length !== max) {
      cell.pips.replaceChildren();
      cell.pipEls = [];
      for (let j = 0; j < max; j++) cell.pipEls.push(div('flask-pip', cell.pips));
    }
    for (let j = 0; j < cell.pipEls.length; j++) setClass(cell.pipEls[j], 'on', j < ch);
  }

  private tipHtml(cell: FlaskCell): string {
    const base = cell.baseId ? getFlaskBase(cell.baseId) : undefined;
    if (!base) return '';
    const ch = G.character;
    const slot = cell.el.dataset.flask ? Number(cell.el.dataset.flask) - 1 : -1;
    const left = G.combat?.flaskCooldown(slot) ?? 0;
    const have = ch?.save.flaskCharges?.[slot] ?? 0;
    const max = ch ? flaskMaxCharges(base.id, hasFlaskUpgrade(ch.save)) : base.max[0];
    const heal = Math.round(base.effect.heal * 100);
    return `<div class="pi-tip-name">${base.name}</div>`
      + `<div class="pi-tip-line">Yük: ${have} / ${max}. ${base.dur[0]} sn içinde %${heal} can yeniler.</div>`
      + `<div class="pi-tip-dim">Bekleme: ${left > 0.05 ? Math.ceil(left) + ' sn' : 'hazır'} (${base.cd ?? 0} sn)</div>`
      + `<div class="pi-tip-dim">Bir köyde ya da kampta yeniden dolar.</div>`
      + `<div class="pi-tip-hint">Tıkla: iç · Sürükle: bara koy</div>`;
  }
}
