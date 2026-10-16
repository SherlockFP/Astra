import { G } from '../../game/G';
import { div, setDisplay, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-combat.css';

/** The level-1 combat line (WoW controls). */
export const FIRST_KILL_HINT = 'Sağ tık: saldır · Tab: hedef değiştir · 1-5: yetenekler';

/**
 * Level-1 combat hint: a small line above the action bar while the character has not killed anything yet. It is a state, not a
 * one-time tip (ui/hud/TipCards.ts shows each tip once): it shows in every world scene until the first kill (save.stats.kills).
 * OWNER: hud module.
 */
export class FirstKillHint implements HudWidget {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private shown = false;

  constructor() {
    this.el = div('first-kill-hint');
    this.text = div('first-kill-hint-text', this.el);
    setText(this.text, FIRST_KILL_HINT);
    setDisplay(this.el, false);
  }

  update(ctx: HudCtx): void {
    const save = G.character?.save;
    const want = !!save && save.level <= 1 && (save.stats?.kills ?? 0) === 0 && ctx.mode !== 'town' && !!ctx.player && !ctx.player.isDead;
    if (want === this.shown) return;
    this.shown = want;
    setDisplay(this.el, want, 'block');
  }

  reset(): void {
    this.shown = false;
    setDisplay(this.el, false);
  }
}
