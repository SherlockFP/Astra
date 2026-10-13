import { G } from '../../game/G';
import { LEVEL_CAP } from '../../types/character';
import type { ResourceType } from '../../types/common';
import { approach, clamp01, div, fmtCompact, pulse, setClass, setStyle, setText } from '../widgets/dom';
import { classColor, classNameTr } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';

/**
 * Metin2-style bottom bar (hud module): carved stone board with gold trim holding
 *   [ level badge + name | HP gauge | SP gauge ]  [ 4 EXP beads ("boncuk") ]  [ the regular ActionBar mounted by the HUD ].
 * Selected with the `hudStyle` setting ('metin2' default, 'orbs' = the Diablo orbs in Orbs.ts). Styled in styles/hud-metin2.css.
 */

/** Layout width of `.m2` in HUD css px. KEEP IN SYNC with `.m2 { width }` in hud-metin2.css (used to fit the bar into small windows). */
export const M2_WIDTH = 1060;

/** Seconds the lighter "damage taken" trail waits before catching up with the gauge. */
const TRAIL_DELAY = 0.4;
/** Seconds all four beads stay full (and flash) after a level-up before draining into the new level's progress. */
const LEVELUP_HOLD = 1.15;
const BEADS = 4;

const RES_NAME: Record<ResourceType, string> = { mana: 'Mana', rage: 'Öfke', energy: 'Enerji', focus: 'Odak', faith: 'İnanç', essence: 'Öz' };

function fmtVal(n: number): string {
  const r = Math.round(n);
  return Math.abs(r) >= 100000 ? fmtCompact(r) : String(r);
}

/** Horizontal gauge: exact fill + a lighter trail of the value that was just lost (holds TRAIL_DELAY, then catches up). */
class M2Gauge {
  readonly el: HTMLElement;
  private trailEl: HTMLElement;
  private fillEl: HTMLElement;
  private labelEl: HTMLElement;
  private v = 1;
  private trail = 1;
  private hold = 0;
  private lastTarget = 1;
  private primed = false;

  constructor(cls: string, kind: string, parent: HTMLElement) {
    this.el = div('m2-gauge ' + cls, parent);
    this.el.dataset.kind = kind;
    this.trailEl = div('m2-trail', this.el);
    this.fillEl = div('m2-fill', this.el);
    div('m2-gloss', this.el);
    div('m2-notches', this.el);
    div('m2-low', this.el);
    this.labelEl = div('m2-glabel', this.el);
  }

  setKind(kind: string): void {
    if (this.el.dataset.kind !== kind) this.el.dataset.kind = kind;
  }

  /** Next set() snaps to the value (new player / style switched on) instead of animating a fake loss. */
  reprime(): void {
    this.primed = false;
  }

  set(frac: number, dt: number, text: string): void {
    const t = clamp01(frac);
    if (!this.primed) {
      this.primed = true;
      this.v = this.trail = this.lastTarget = t;
      this.hold = 0;
    }
    if (t < this.lastTarget - 0.0005) {
      // value lost: the trail keeps the old level for TRAIL_DELAY (a new hit restarts the wait)
      if (this.trail < this.v) this.trail = this.v;
      this.hold = TRAIL_DELAY;
      if (this.lastTarget - t > 0.015) pulse(this.el, 'hit');
    }
    this.lastTarget = t;
    if (t < this.v) this.v = t;
    else {
      this.v = approach(this.v, t, 8, dt);
      if (t - this.v < 0.0015) this.v = t;
    }
    if (this.trail < this.v) this.trail = this.v;
    else if (this.hold > 0) this.hold -= dt;
    else {
      this.trail = approach(this.trail, this.v, 6, dt);
      if (this.trail - this.v < 0.002) this.trail = this.v;
    }
    setStyle(this.fillEl, 'transform', `scaleX(${this.v.toFixed(4)})`);
    setStyle(this.trailEl, 'transform', `scaleX(${this.trail.toFixed(4)})`);
    setText(this.labelEl, text);
  }
}

/** One of the four EXP beads: round glass with a liquid that rises from the bottom (purple, turns golden + glows when full). */
class Bead {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private q = -1;

  constructor(parent: HTMLElement) {
    this.el = div('m2-bead empty', parent);
    div('m2-bead-ring', this.el);
    const inner = div('m2-bead-in', this.el);
    this.fill = div('m2-bead-fill', inner);
    div('m2-bead-glass', this.el);
  }

  set(f: number): void {
    const v = clamp01(f);
    const q = Math.round(v * 500);
    if (q === this.q) return;
    this.q = q;
    setStyle(this.fill, 'height', (q / 5).toFixed(1) + '%');
    setClass(this.el, 'full', v >= 0.996);
    setClass(this.el, 'part', v > 0.004 && v < 0.996);
    setClass(this.el, 'empty', v <= 0.004);
  }
}

export class Metin2Bar implements HudWidget {
  /** The stone board (`.m2`). The HUD mounts it in the bottom-centre cluster. */
  readonly el: HTMLElement;
  /** Receives the ActionBar element while the Metin2 style is active. */
  readonly slotsHost: HTMLElement;
  /** Receives the dodge charges / combo points row (shown just above the slots). */
  readonly extrasHost: HTMLElement;

  private statEl: HTMLElement;
  private lvlEl: HTMLElement;
  private nameEl: HTMLElement;
  private clsEl: HTMLElement;
  private hp: M2Gauge;
  private res: M2Gauge;
  private beadsEl: HTMLElement;
  private beads: Bead[] = [];
  private tipEl: HTMLElement;
  private pctEl: HTMLElement;
  private floaters: HTMLElement;

  private classId = '';
  private resType = '';
  // exp state
  private shown = 0;
  private hold = 0;
  private lastLevel = -1;
  private lastChar: unknown = null;
  private lastPlayer: unknown = null;
  // fit-to-window cache
  private fitKey = '';

  constructor() {
    this.el = div('m2');

    // ---- left: level badge + name, HP + SP gauges ----
    this.statEl = div('m2-well m2-stat', this.el);
    const head = div('m2-head', this.statEl);
    this.lvlEl = div('m2-lvl', head);
    this.nameEl = div('m2-name', head);
    this.clsEl = div('m2-cls', head);
    this.hp = new M2Gauge('m2-hp', 'hp', this.statEl);
    this.res = new M2Gauge('m2-sp', 'mana', this.statEl);

    // ---- middle: the four EXP beads ----
    this.beadsEl = div('m2-well m2-beads hud-interactive', this.el);
    div('m2-explabel', this.beadsEl).textContent = 'TECRÜBE';
    const row = div('m2-beadrow', this.beadsEl);
    for (let i = 0; i < BEADS; i++) this.beads.push(new Bead(row));
    this.pctEl = div('m2-exppct', this.beadsEl);
    this.tipEl = div('m2-exptip', this.beadsEl);
    this.floaters = div('m2-floaters', this.beadsEl);

    // ---- right: action bar slots (+ extras row above) ----
    const wrap = div('m2-slotswrap', this.el);
    this.extrasHost = div('m2-extras', wrap);
    this.slotsHost = div('m2-well m2-slots', wrap);

    G.events.on('player:xp', ({ gained }) => {
      if (gained <= 0) return;
      const f = div('xp-float', this.floaters);
      f.textContent = `+${Math.round(gained)} XP`;
      setTimeout(() => f.remove(), 1500);
      pulse(this.beadsEl, 'gain');
    });
  }

  update(ctx: HudCtx): void {
    this.fit(ctx);
    const p = ctx.player;
    setClass(this.el, 'dead', !!p && p.isDead);
    if (p) {
      if (p !== this.lastPlayer) {
        this.lastPlayer = p;
        this.hp.reprime();
        this.res.reprime();
      }
      if (this.classId !== p.classId) {
        this.classId = p.classId;
        this.el.style.setProperty('--cc', classColor(p.classId));
        setText(this.clsEl, classNameTr(p.classId));
      }
      setText(this.nameEl, p.name);
      setText(this.lvlEl, String(ctx.character?.level ?? p.level));
      const hp = Math.max(0, p.hp);
      const hpFrac = p.maxHp > 0 ? hp / p.maxHp : 0;
      this.hp.set(hpFrac, ctx.dt, `Can ${fmtVal(hp)}/${fmtVal(p.maxHp)}`);
      setClass(this.hp.el, 'low', hpFrac < 0.3 && !p.isDead && p.maxHp > 0);
      if (this.resType !== p.resourceType) {
        this.resType = p.resourceType;
        this.res.setKind(p.resourceType);
      }
      const rs = Math.max(0, p.resource);
      this.res.set(p.maxResource > 0 ? rs / p.maxResource : 0, ctx.dt, `${RES_NAME[p.resourceType] ?? 'SP'} ${fmtVal(rs)}/${fmtVal(p.maxResource)}`);
    }
    this.updateExp(ctx);
  }

  /** Shrink the whole board (never enlarge) when the window is too narrow for its fixed layout width. */
  private fit(ctx: HudCtx): void {
    const vw = ctx.ui.viewW;
    const key = vw + '|' + ctx.scale.toFixed(3);
    if (key === this.fitKey) return;
    this.fitKey = key;
    const hudW = vw / Math.max(0.01, ctx.scale); // available width in HUD css px
    const hard = (hudW - 24) / M2_WIDTH; // never wider than the window
    const soft = (hudW - 2 * 392) / M2_WIDTH; // would keep clear of the chat / loot columns
    const fit = Math.max(0.45, Math.min(1, hard, Math.max(soft, 0.93)));
    setStyle(this.el, '--m2-fit', fit.toFixed(3));
  }

  /** EXP beads: each bead is 25% of the current level's xp; level-ups flash all four, hold them full, then drain to the new progress. */
  private updateExp(ctx: HudCtx): void {
    const c = ctx.character;
    if (!c) return;
    const level = c.level;
    const capped = level >= LEVEL_CAP;
    const xp = Math.max(0, c.save.xp);
    const need = capped ? 1 : Math.max(1, G.progression?.xpToNext(level) ?? 1);
    const target = capped ? 1 : clamp01(xp / need);

    if (c !== this.lastChar) {
      // other character selected: snap, no fake level-up
      this.lastChar = c;
      this.lastLevel = level;
      this.shown = target;
      this.hold = 0;
    } else if (level > this.lastLevel) {
      this.hold = LEVELUP_HOLD;
      this.lastLevel = level;
      pulse(this.beadsEl, 'lvlup');
    } else this.lastLevel = level;

    if (this.hold > 0) {
      this.hold -= ctx.dt;
      this.shown = approach(this.shown, 1, 9, ctx.dt);
    } else {
      this.shown = approach(this.shown, target, 4, ctx.dt);
      if (Math.abs(this.shown - target) < 0.0004) this.shown = target;
    }

    const s = clamp01(this.shown) * BEADS;
    for (let i = 0; i < BEADS; i++) this.beads[i].set(s - i);

    setText(this.pctEl, capped ? 'MAKS' : `%${(target * 100).toFixed(1)}`);
    setText(this.tipEl, capped ? 'Tecrübe: Azami seviye' : `Tecrübe: ${(target * 100).toFixed(1)}% (${Math.floor(xp)}/${Math.round(need)})`);
  }

  /** Drop transient state (HUD hidden, or this style just became active): floaters go, gauges and beads re-snap. */
  reset(): void {
    this.floaters.textContent = '';
    this.lastChar = null;
    this.lastPlayer = null;
    this.hold = 0;
    this.fitKey = '';
  }
}
