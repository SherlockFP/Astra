import { G } from '../../game/G';
import { WOW_ERR } from '../../combat/targetSelect';
import { div, pulse, setText } from '../widgets/dom';
import { levelUpBannerBusy } from './Banners';
import type { HudCtx, HudWidget } from './types';

/** Same skill failure within this window (ms) shows once: a held key re-fires the failure every frame. */
const REPEAT_MS = 350;
/** A cooldown at or below this (s) is the global cooldown, named "Genel bekleme" (SkillSystem reports both as `cooldown`). */
const GCD_MAX_S = 1.5;
/** Shown once per session the first time an ability finds no target (see the skill:fail listener). */
const TARGET_HINT = 'Tab ile en yakın düşmanı seç';
let targetHintShown = false;

/**
 * The WoW-style error line for a failed cast (red, top centre, not on the bar): "Henüz hazır değil (3 sn)", "Kaynak yetersiz",
 * "Menzil dışı". `remaining` is the cooldown / lockout time left in seconds when the failure reports one.
 */
export function castFailText(reason: string, remaining?: number, skill?: string): string {
  const r = remaining !== undefined && Number.isFinite(remaining) ? Math.max(0, remaining) : undefined;
  switch (reason) {
    case 'cooldown': {
      // a named ability says which one is not ready; the global cooldown is generic
      if (r === undefined) return skill ? `${skill} henüz hazır değil` : WOW_ERR.cooldown;
      if (r <= GCD_MAX_S) return `Genel bekleme (${r.toFixed(1)} sn)`;
      const what = skill ? `${skill} henüz hazır değil` : WOW_ERR.cooldown;
      return `${what} (${Math.ceil(r)} sn)`;
    }
    case 'resource': return WOW_ERR.resource;
    case 'range': return WOW_ERR.range;
    case 'target': return WOW_ERR.target;
    case 'los': return WOW_ERR.los;
    case 'facing': return WOW_ERR.facing;
    case 'moving': return 'Hareket halindeyken kullanılamaz';
    case 'stunned': return 'Sersemlemiş durumdasın';
    case 'casting': return 'Zaten bir yetenek kullanıyorsun';
    case 'silenced': return 'Susturuldun';
    case 'lockout': return r !== undefined ? `Okul kilitli (${Math.ceil(r)} sn)` : 'Okul kilitli';
    default: return 'Şu an kullanılamaz';
  }
}

/**
 * Failed-cast error line (WoW error text): the reason of every `skill:fail` the player caused, in red at the top centre of the
 * screen, for 1.5 s. Repeats of the same text within 350 ms are dropped (a held key). Reads the event only; SkillSystem owns
 * the rules. OWNER: hud module.
 */
export class CastErrors implements HudWidget {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private lastText = '';
  private lastAt = -Infinity;

  constructor() {
    this.el = div('cast-err');
    this.text = div('cast-err-text', this.el);
    G.events.on('skill:fail', ({ reason, remaining, skill }) => {
      // the global-cooldown line is noise while the level-up banner is on the centre of the screen: it is dropped, not queued
      const gcd = reason === 'cooldown' && remaining !== undefined && Number.isFinite(remaining) && remaining <= GCD_MAX_S;
      if (gcd && levelUpBannerBusy()) return;
      this.show(castFailText(reason, remaining, skill));
      if (reason === 'target' && !targetHintShown) {
        // WoW players learn the target cycle from this line: once per session, as a plain info toast
        targetHintShown = true;
        G.ui.toast(TARGET_HINT, 'info');
      }
    });
    G.events.on('scene:leaving', () => this.reset());
  }

  private show(text: string): void {
    const now = performance.now();
    if (text === this.lastText && now - this.lastAt < REPEAT_MS) return;
    this.lastText = text;
    this.lastAt = now;
    setText(this.text, text);
    pulse(this.el, 'show');
  }

  update(_ctx: HudCtx): void {
    // the line is a CSS animation; nothing to tick
  }

  reset(): void {
    this.lastText = '';
    this.lastAt = -Infinity;
    this.el.classList.remove('show');
  }
}
