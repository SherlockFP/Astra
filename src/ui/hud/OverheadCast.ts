import { getSkill } from '../../data/skills';
import { lockoutSchool } from '../../combat/castRules';
import type { Player } from '../../entities/Player';
import type { HudCtx } from './types';

/**
 * WoW-style overhead cast bar: the player's own cast, drawn above the head (projected from the body every frame). Name, seconds left
 * and a fill in the school colour (gold for physical). One pooled DOM element under #ui-root, hidden while no cast runs.
 * The bottom cast bar (PlayerCastBar) keeps the same cast; this one is what the player looks at.
 */

const SCHOOL_BAR: Record<string, string> = {
  fire: '#ff7a20', frost: '#9fe0ff', arcane: '#e060ff', holy: '#ffe28a', shadow: '#b070ff', poison: '#8cff50', lightning: '#aed2ff',
};
const PHYS_BAR = '#ffd23a';
/** Height above the feet (m) of the bar's anchor point: just over the nameplate-free head space. */
const HEAD_LIFT = 0.7;

export class OverheadCast {
  private el: HTMLDivElement | null = null;
  private name: HTMLDivElement | null = null;
  private fill: HTMLDivElement | null = null;
  private shown = false;
  private readonly _o = { x: 0, y: 0 };
  private skillKey = '';
  private barColor = PHYS_BAR;

  private ensure(): boolean {
    if (this.el) return true;
    if (typeof document === 'undefined') return false;
    const root = document.getElementById('ui-root') ?? document.body;
    const el = document.createElement('div');
    el.className = 'ovc';
    el.style.cssText = 'position:absolute;left:0;top:0;width:180px;text-align:center;pointer-events:none;z-index:9;display:none;' +
      'font:700 13px/1.2 var(--font-head, sans-serif);color:#fff6dc;text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;';
    const name = document.createElement('div');
    name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:relative;height:9px;margin-top:3px;background:rgba(8,6,4,0.72);border:1px solid #000;border-radius:2px;box-shadow:0 0 6px rgba(0,0,0,0.7);overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:0;box-shadow:0 0 8px currentColor;';
    bar.appendChild(fill);
    el.appendChild(name);
    el.appendChild(bar);
    root.appendChild(el);
    this.el = el;
    this.name = name;
    this.fill = fill;
    return true;
  }

  /** Shows the cast of `p` (`frac` 0..1 of the cast; a channel drains). Colour from the skill's school. */
  show(ctx: HudCtx, p: Player, skillId: string, name: string, remaining: number, frac: number, channel: boolean): void {
    if (!this.ensure() || !this.el || !this.name || !this.fill) return;
    if (skillId !== this.skillKey) {
      this.skillKey = skillId;
      const def = getSkill(skillId);
      const school = def ? (lockoutSchool(def) ?? def.damage?.type) : undefined;
      this.barColor = (school && SCHOOL_BAR[school]) || PHYS_BAR;
      this.fill.style.color = this.barColor;
      this.fill.style.background = this.barColor;
    }
    if (!ctx.ui.projectWorld(p.position.x, p.position.y + p.height + HEAD_LIFT, p.position.z, this._o)) {
      this.hide();
      return;
    }
    this.el.style.transform = `translate(${this._o.x.toFixed(1)}px, ${this._o.y.toFixed(1)}px) translate(-50%, -100%)`;
    this.name.textContent = `${name}  ${Math.max(0, remaining).toFixed(1)} sn`;
    this.fill.style.width = `${((channel ? 1 - frac : frac) * 100).toFixed(1)}%`;
    if (!this.shown) {
      this.shown = true;
      this.el.style.display = 'block';
    }
  }

  hide(): void {
    if (!this.shown || !this.el) return;
    this.shown = false;
    this.el.style.display = 'none';
  }
}
