import { G } from '../../game/G';
import { LEVEL_CAP } from '../../types/character';
import { restedPool } from '../../systems/DailyLoop';
import { div, fmtNum, pulse, setDisplay, setStyle } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

interface TipUi {
  showTooltip(html: string, x: number, y: number): void;
  hideTooltip(): void;
}

/** Level-up hold: the bar stays full with a white flash for this long, then refills from empty (ms). */
const LEVEL_HOLD_MS = 800;
/** "+N XP" floater lifetime (ms), matching the CSS rise + fade. */
const FLOATER_MS = 1000;
/** Floaters shown at once (the column above the strip) and the height of one row (px). */
const FLOATER_MAX = 3;
const FLOATER_ROW_PX = 18;
/** Fill of the XP strip while rested XP is banked (WP-10): the blue of the rested tint. */
const RESTED_FILL = 'linear-gradient(#cfe9ff 0 28%, #4fa3ff 28% 62%, #1f5fb8 62%)';

/**
 * The thin XP strip on the bottom edge of the screen (UI §2.6.7, `.hud-xp`): exact fill, level-up hold + flash, "+N XP" floaters,
 * notches at 25 / 50 / 75 %, a tooltip with the exact numbers, and hidden at the level cap.
 */
export class XpStrip implements HudWidget {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private floaters: HTMLElement;
  /** Live "+N XP" floaters, newest first (index 0 is the bottom row of the column). */
  private alive: HTMLElement[] = [];
  private shown = 0;
  private lastLevel = -1;
  private holdUntil = 0;
  private tipHtml = '';
  private hover = false;

  constructor(private readonly ui: TipUi) {
    this.el = div('xp-strip hud-interactive');
    this.fill = div('xp-fill', this.el);
    div('xp-notch n25', this.el);
    div('xp-notch n50', this.el);
    div('xp-notch n75', this.el);
    this.floaters = div('xp-floaters', this.el);
    G.events.on('player:xp', ({ gained }) => {
      if (gained <= 0) return;
      const f = div('xp-float', this.floaters, `+${fmtNum(gained)} XP`);
      // a column: the newest floater sits on the bottom, older ones stack above it (no overlap); at most FLOATER_MAX shown
      this.alive.unshift(f);
      while (this.alive.length > FLOATER_MAX) this.alive.pop()?.remove();
      this.restack();
      setTimeout(() => {
        const i = this.alive.indexOf(f);
        if (i >= 0) this.alive.splice(i, 1);
        f.remove();
        this.restack();
      }, FLOATER_MS);
    });
    this.el.addEventListener('mouseenter', (e) => {
      this.hover = true;
      if (this.tipHtml) this.ui.showTooltip(this.tipHtml, e.clientX, e.clientY);
    });
    this.el.addEventListener('mousemove', (e) => {
      if (this.hover && this.tipHtml) this.ui.showTooltip(this.tipHtml, e.clientX, e.clientY);
    });
    this.el.addEventListener('mouseleave', () => {
      this.hover = false;
      this.ui.hideTooltip();
    });
  }

  /** Puts each live floater on its own row: newest at the bottom, the older ones above it. */
  private restack(): void {
    this.alive.forEach((f, i) => {
      f.style.bottom = `${4 + i * FLOATER_ROW_PX}px`;
    });
  }

  update(ctx: HudCtx): void {
    const c = ctx.character;
    if (!c) {
      setDisplay(this.el, false);
      return;
    }
    const level = c.level;
    const capped = level >= LEVEL_CAP;
    setDisplay(this.el, !capped, 'block');
    if (capped) {
      this.tipHtml = '';
      return;
    }
    const need = Math.max(1, G.progression.xpToNext(level));
    const xp = c.save.xp;
    const target = Math.max(0, Math.min(1, xp / need));
    if (this.lastLevel > 0 && level > this.lastLevel) {
      // level up: hold full with the flash, then refill from empty
      this.holdUntil = ctx.now + LEVEL_HOLD_MS;
      this.shown = 1;
      pulse(this.el, 'lvl');
    }
    this.lastLevel = level;
    if (this.holdUntil > 0) {
      if (ctx.now >= this.holdUntil) {
        this.holdUntil = 0;
        this.shown = 0;
      }
    } else {
      this.shown += (target - this.shown) * Math.min(1, ctx.dt * 5);
    }
    setStyle(this.fill, 'width', (this.shown * 100).toFixed(2) + '%');
    const rested = Math.round(restedPool(c.save, need));
    setStyle(this.fill, 'background', rested > 0 ? RESTED_FILL : '');
    this.tipHtml = `<div class="sk"><div class="sk-desc">Tecrübe: ${(target * 100).toFixed(1).replace('.', ',')}% (${fmtNum(xp)} / ${fmtNum(need)})${rested > 0 ? `<br>Dinlenmiş TP: +${fmtNum(rested)} (kıllar 2x)` : ''}</div></div>`;
  }
}
