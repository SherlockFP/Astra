import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import { getSkill } from '../../data/skills';
import { COMBAT_FEEL } from '../../combat/feel';
import { LOCKOUT_SCHOOLS } from '../../combat/castRules';
import type { ClassId } from '../../types/common';
import { LEVEL_CAP } from '../../types/character';
import type { CastState } from '../../entities/Actor';
import type { Player } from '../../entities/Player';
import type { UI } from '../UI';
import { ICON, approach, clamp01, div, fmtNum, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { CLASS_COLORS, classColor } from '../widgets/classColors';
import { fmtHealth } from '../widgets/numFormat';
import { StatusRow } from '../widgets/StatusRow';
import { CastBarEl } from '../widgets/CastBar';
import type { HudCtx, HudWidget } from './types';

export { classColor };

/** Class names and colours. The colours are the classColors.ts table (UI_REDESIGN §3.2), the single source. */
export const CLASS_META: Record<ClassId, { name: string; color: string }> = {
  knight: { name: 'Şövalye', color: CLASS_COLORS.knight },
  barbarian: { name: 'Barbar', color: CLASS_COLORS.barbarian },
  mage: { name: 'Büyücü', color: CLASS_COLORS.mage },
  rogue: { name: 'Haydut', color: CLASS_COLORS.rogue },
  monk: { name: 'Keşiş', color: CLASS_COLORS.monk },
  archer: { name: 'Okçu', color: CLASS_COLORS.archer },
  paladin: { name: 'Paladin', color: CLASS_COLORS.paladin },
  necromancer: { name: 'Nekromant', color: CLASS_COLORS.necromancer },
  warlock: { name: 'Warlock', color: CLASS_COLORS.warlock },
  demonhunter: { name: 'İblis Avcısı', color: CLASS_COLORS.demonhunter },
  evoker: { name: 'Ejderhasoy', color: CLASS_COLORS.evoker },
};

export function classNameTr(id: ClassId | undefined): string {
  if (!id) return '';
  return CLASSES[id]?.name || CLASS_META[id]?.name || id;
}

/** Ghost trail: a lost share holds this long (s), then drains to the fill at GHOST_LAMBDA (UI_REDESIGN §2.7). */
const GHOST_HOLD = 0.4;
const GHOST_LAMBDA = 6;

/**
 * A flat ElvUI bar (kit `.k-bar`): a damage-lag ghost behind the fill, a text row on top. Fill and ghost widths are
 * whole px (`--w` / `--gw` set on the bar, read by the kit); the bar width is cached so the frame reads layout rarely.
 */
export class Bar {
  readonly el: HTMLElement;
  readonly fill: HTMLElement;
  readonly ghost: HTMLElement;
  /** The `.k-text` row: a centred or left/right text (set via `set(…, text)` or appended spans). */
  readonly label: HTMLElement;
  private v = 1;
  private g = 1;
  private last = 1;
  private hold = 0;
  private w = 0;
  private wAge = 0;

  constructor(cls: string, parent?: HTMLElement) {
    this.el = div('k-bar ' + cls, parent);
    this.ghost = div('k-ghost', this.el);
    this.fill = div('k-fill', this.el);
    this.label = div('k-text', this.el);
  }

  set(frac: number, dt: number, text?: string): void {
    const t = clamp01(frac);
    if (t < this.last - 0.0005) this.hold = GHOST_HOLD;
    if (t >= this.g) this.g = t;
    else if (this.hold > 0) this.hold = Math.max(0, this.hold - dt);
    else this.g = approach(this.g, t, GHOST_LAMBDA, dt);
    if (Math.abs(this.g - t) < 0.002) this.g = t;
    if (t < this.last - 0.02) pulse(this.el, 'hit');
    this.last = t;
    this.v = t;
    if (this.w <= 0 || this.wAge-- <= 0) {
      this.w = this.el.clientWidth;
      this.wAge = 30;
    }
    setStyle(this.el, '--w', Math.round(this.v * this.w) + 'px');
    setStyle(this.el, '--gw', Math.round(this.g * this.w) + 'px');
    if (text !== undefined) setText(this.label, text);
  }
}

/** Cast host of the player frame: the overlay over the power strip. PlayerCastBar moves itself into it (see its update). */
let playerCastHost: HTMLElement | null = null;

/**
 * Player unit frame (UI_REDESIGN §2.7, ElvUI): one flat health bar in the class colour with `{level} {name}` left and
 * `{hp} | {pct}%` right, the power strip under it (replaced by the cast bar while casting), buffs above the frame,
 * pips above the buffs, consumables and typed debuffs below. Placed by its own CSS (`.uf-player`, centre cluster).
 */
export class PlayerFrame implements HudWidget {
  readonly el: HTMLElement;
  private hp: Bar;
  private res: Bar;
  private nameT: HTMLElement;
  private crownEl: HTMLElement;
  private hpVal: HTMLElement;
  private classId: ClassId | null = null;
  private resType = '';
  readonly buffs: StatusRow;
  readonly debuffs: StatusRow;
  /** UX-01 host slots: the consumables row (UX-10 ActionBar / FlaskRow mount here) and the combo / pip row above the buffs. */
  readonly consHost = div('uf-cons');
  readonly pipsHost = div('uf-pips');

  constructor(ui: UI) {
    this.el = div('pf uf-player');
    const top = div('uf-top', this.el);
    this.buffs = new StatusRow(ui, 'buff', 8, 'uf-auras pf-auras', true);
    top.appendChild(this.buffs.el);
    top.appendChild(this.pipsHost);
    const main = div('uf-main', this.el);
    const bars = div('uf-bars', main);
    this.hp = new Bar('uf-hp', bars);
    this.hp.el.dataset.kind = 'class';
    this.nameT = div('uf-name', this.hp.label);
    this.crownEl = iconEl(ICON('ui-crown'), 'uf-crown', this.hp.label);
    setDisplay(this.crownEl, false);
    this.hpVal = div('uf-val', this.hp.label);
    const stripWrap = div('uf-stripwrap', bars);
    this.res = new Bar('uf-strip', stripWrap);
    this.res.el.dataset.kind = 'mana';
    playerCastHost = div('uf-cast', stripWrap);
    this.el.appendChild(this.consHost);
    this.debuffs = new StatusRow(ui, 'debuff', 8, 'uf-debuffs pf-debuffs', true);
    this.el.appendChild(this.debuffs.el);
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    setClass(this.el, 'dead', !!p && p.isDead);
    if (!p) return;
    if (this.classId !== p.classId) {
      this.classId = p.classId;
      setStyle(this.hp.el, '--cls', classColor(p.classId));
    }
    const dead = p.isDead;
    const pct = p.maxHp > 0 ? clamp01(p.hp / p.maxHp) : 0;
    setClass(this.hp.el, 'is-low', !dead && pct < 0.3);
    setClass(this.hp.el, 'is-dead', dead);
    setText(this.nameT, dead ? '' : `${p.level} ${p.name}`);
    const leader = !!G.net?.isOnline && !!G.net.peerBySlot(p.slot)?.isHost;
    setDisplay(this.crownEl, leader && !dead);
    const pc = p.hp > 0 ? Math.max(1, Math.ceil(pct * 100)) : 0;
    setText(this.hpVal, dead ? 'Öldü' : `${fmtHealth(Math.max(0, p.hp))} | ${pc}%`);
    this.hp.set(pct, ctx.dt);
    if (this.resType !== p.resourceType) {
      this.resType = p.resourceType;
      this.res.el.dataset.kind = p.resourceType;
    }
    const rv = Math.max(0, p.resource);
    const rf = p.maxResource > 0 ? p.resource / p.maxResource : 0;
    this.res.set(rf, ctx.dt, p.resourceType === 'mana' ? fmtHealth(rv) : String(Math.round(rv)));
    this.buffs.update(p);
    this.debuffs.update(p);
  }

  reset(): void {
    this.buffs.clear();
    this.debuffs.clear();
  }
}

/** Experience bar under the action bar: purple fill with segment ticks, level text and "+N XP" floaters. */
export class XpBar implements HudWidget {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private glow: HTMLElement;
  private text: HTMLElement;
  private shown = 0;
  private floaters: HTMLElement;
  private lastXp = -1;
  private lastLevel = -1;

  constructor() {
    this.el = div('xpbar hud-interactive');
    this.fill = div('xp-fill', this.el);
    this.glow = div('xp-glow', this.el);
    div('xp-ticks', this.el);
    this.text = div('xp-text', this.el);
    this.floaters = div('xp-floaters', this.el);
    G.events.on('player:xp', ({ gained }) => {
      if (gained <= 0) return;
      const f = div('xp-float', this.floaters);
      f.textContent = `+${fmtNum(gained)} XP`;
      setTimeout(() => f.remove(), 1500);
      pulse(this.glow, 'go');
    });
  }

  update(ctx: HudCtx): void {
    const c = ctx.character;
    if (!c) return;
    const level = c.level;
    const need = Math.max(1, G.progression.xpToNext(level));
    const xp = c.save.xp;
    const capped = level >= LEVEL_CAP;
    let target = capped ? 1 : clamp01(xp / need);
    if (level !== this.lastLevel) {
      if (this.lastLevel > 0 && level > this.lastLevel) this.shown = 0; // level up: refill from empty
      this.lastLevel = level;
    }
    this.shown = approach(this.shown, target, 5, ctx.dt);
    setStyle(this.fill, 'width', (this.shown * 100).toFixed(2) + '%');
    if (xp !== this.lastXp) this.lastXp = xp;
    setText(this.text, capped ? `Seviye ${level} · Azami seviye` : `Seviye ${level} · ${fmtNum(xp)} / ${fmtNum(need)} XP (${(target * 100).toFixed(1).replace('.', ',')}%)`);
  }
}

/** LMB heavy charge (CW-17): the hold reads as a cast bar that fills to CHARGE_BAR_SEC; the tier tick sits at the tier 2 time. */
const CHARGE_BAR_SEC = 1;
const CHARGE_TIER_SEC = COMBAT_FEEL.chargeTier2;
const TIER_TICK_COLOR = '#ffe27a';
/** A queued skill ghost stays this long if the queue is not cleared (ms). */
const QUEUE_SHOW_MS = 2000;
/** Channel tick marks are capped (a fast channel can have many ticks). */
const TICK_CAP = 30;

/** School lock look after an interrupt (CW-08 glyphs; the colour is the school colour). */
const SCHOOL_LOCK: Record<string, { name: string; glyph: string; color: string }> = {
  fire: { name: 'Ateş', glyph: 'ATE', color: '#ff8a4a' },
  frost: { name: 'Buz', glyph: 'BUZ', color: '#8fe0ff' },
  arcane: { name: 'Arkan', glyph: 'ARK', color: '#c9a2ff' },
  holy: { name: 'Kutsal', glyph: 'KUT', color: '#fff0a0' },
  shadow: { name: 'Gölge', glyph: 'GÖL', color: '#b08ae0' },
  poison: { name: 'Zehir', glyph: 'ZEH', color: '#9de86a' },
};

/** Channel tick marks as fractions of the bar: the tick interval is params.tick, else duration / ticks (as SkillSystem does). */
export function channelTickFracs(skillId: string, duration: number): number[] {
  const def = getSkill(skillId);
  if (!def || duration <= 0.05) return [];
  const every = def.params?.tick ?? (def.duration ?? def.channel ?? duration) / Math.max(1, def.ticks ?? 8);
  if (!(every > 0.01)) return [];
  const out: number[] = [];
  for (let t = every; t < duration - 0.05 && out.length < TICK_CAP; t += every) out.push(t / duration);
  return out;
}

/**
 * Player cast bar above the action bar (CW-17): hard casts and channels with pushback (slide back + red '+0.5' flash),
 * channel tick marks, the LMB heavy charge as a cast bar, a ghost of the queued skill, and the school lock for the
 * lockout time after an interrupt.
 */
export class PlayerCastBar implements HudWidget {
  readonly el: HTMLElement;
  private bar: CastBarEl;
  private interruptedAt = 0;
  private interruptedName = '';
  /** cast:pushback fires inside the sim, before this HUD frame reads the cast: consumed (and cleared) in update(). */
  private pushPending: { skillId: string; add: number } | null = null;
  /** Key of the tick marks currently shown ('' = none). */
  private marksKey = '';
  /** World time the LMB heavy charge started, or -1 while not charging. */
  private chargeSince = -1;
  private queued: { skillId: string; until: number } | null = null;
  private ghost: HTMLElement;
  private ghostIco: HTMLElement;
  private ghostId: string | null = null;

  constructor() {
    this.el = div('pcast');
    this.bar = new CastBarEl('pcast-bar');
    this.el.appendChild(this.bar.el);
    // queued skill ghost right of the bar; its room is reserved so the bar does not jump when a skill is queued
    this.ghost = div('pcast-ghost', this.el);
    this.ghost.style.cssText = 'flex:0 0 26px;width:26px;height:26px;margin:0 0 6px 6px;align-self:center;opacity:0;pointer-events:none;';
    this.ghostIco = iconEl(null, 'pcast-ghost-ico', this.ghost);
    this.ghostIco.style.cssText = 'width:100%;height:100%;';
    G.events.on('skill:castInterrupted', ({ casterId }) => {
      if (G.player && casterId === G.player.id) {
        this.interruptedAt = performance.now();
        this.interruptedName = G.player.cast?.name ?? '';
      }
    });
    G.events.on('cast:pushback', ({ skillId, add }) => {
      if (G.player?.cast?.skillId === skillId) this.pushPending = { skillId, add };
    });
    G.events.on('skill:queued', ({ skillId }) => {
      this.queued = skillId ? { skillId, until: performance.now() + QUEUE_SHOW_MS } : null;
    });
  }

  update(ctx: HudCtx): void {
    // UX-11: the bar lives in the player frame's power-strip overlay (index.ts mounted it in .hud-bc); moved once, here
    if (playerCastHost && this.el.parentElement !== playerCastHost) playerCastHost.appendChild(this.el);
    const p = ctx.player;
    const c = p?.cast;
    const wt = ctx.world?.time ?? 0;
    this.updateQueue(ctx.now, c?.skillId ?? null);
    if (p && c && c.duration > 0.1) {
      this.interruptedAt = 0;
      this.chargeSince = -1;
      this.updateCast(c, wt);
    } else if (this.interruptedAt && ctx.now - this.interruptedAt < 650) {
      this.setMarks('', () => []);
      this.bar.set(this.interruptedName, 1, 0, { interrupted: true });
    } else if (p && this.updateCharge(wt)) {
      /* LMB heavy charge (its tier tick is set in updateCharge) */
    } else {
      this.setMarks('', () => []);
      if (this.updateScroll(ctx.now)) {
        /* town scroll channel or its 'Kesildi!' flash */
      } else if (p && this.updateLockout(p)) {
        /* school lock after an interrupt, for the lockout time */
      } else {
        this.bar.hide();
      }
    }
    this.pushPending = null;
  }

  private updateCast(c: CastState, wt: number): void {
    const el = wt - c.start;
    const frac = Math.min(1, el / c.duration);
    this.bar.set(c.name, frac, Math.max(0, c.duration - el), { interruptible: true, channel: c.channel });
    if (c.channel) this.setMarks(`ch:${c.skillId}:${c.duration.toFixed(2)}`, () => channelTickFracs(c.skillId, c.duration));
    else this.setMarks('', () => []);
    const pp = this.pushPending;
    if (pp && pp.skillId === c.skillId) {
      // the bar before the pushback: a hard cast was shorter by `add`; a channel was longer by the cut (add < 0)
      const before = Math.max(0.05, c.duration - pp.add);
      const label = (pp.add > 0 ? '+' : '') + pp.add.toFixed(1);
      if (c.channel) this.bar.flashPushback(1 - Math.min(1, el / before), 1 - frac, label);
      else this.bar.flashPushback(Math.min(1, el / before), frac, label);
    }
  }

  /** LMB heavy charge (SkillSystem.isCharging): the hold fills the bar to CHARGE_BAR_SEC, tier tick at CHARGE_TIER_SEC. */
  private updateCharge(wt: number): boolean {
    const p = G.player;
    const charging = !!p && !!G.skills && G.skills.isCharging(p);
    if (!charging) {
      this.chargeSince = -1;
      return false;
    }
    if (this.chargeSince < 0) this.chargeSince = wt;
    const hold = Math.max(0, wt - this.chargeSince);
    const tier = hold >= CHARGE_TIER_SEC;
    this.bar.set(tier ? 'Güçlü Vuruş · Tam' : 'Güçlü Vuruş', Math.min(1, hold / CHARGE_BAR_SEC), Math.max(0, CHARGE_TIER_SEC - hold), { interruptible: true });
    this.setMarks('charge', () => [CHARGE_TIER_SEC / CHARGE_BAR_SEC], TIER_TICK_COLOR);
    return true;
  }

  /** School lock: the `lockout` status (magnitude = school index + 1) with its seconds left, grey bar and school glyph. */
  private updateLockout(p: Player): boolean {
    const st = p.statuses.list().find((s) => s.id === 'lockout');
    if (!st || st.remaining <= 0.05) return false;
    const meta = SCHOOL_LOCK[LOCKOUT_SCHOOLS[st.magnitude - 1] ?? ''];
    this.bar.set(meta ? `${meta.name} kilidi` : 'Kilit', 1, st.remaining, {
      interruptible: false,
      school: meta ? { glyph: meta.glyph, color: meta.color } : undefined,
    });
    return true;
  }

  /** Tick marks, rebuilt only when their key changes. */
  private setMarks(key: string, fracs: () => number[], color?: string): void {
    if (key === this.marksKey) return;
    this.marksKey = key;
    this.bar.setTicks(key ? fracs() : [], color);
  }

  /** Queued skill ghost: shown while skill:queued holds a skill that is not casting yet (expires after QUEUE_SHOW_MS). */
  private updateQueue(now: number, castSkill: string | null): void {
    const q = this.queued;
    const live = !!q && now < q.until && q.skillId !== castSkill;
    if (q && !live) this.queued = null;
    const id = live && q ? q.skillId : null;
    if (id !== this.ghostId) {
      this.ghostId = id;
      setIconUrl(this.ghostIco, id ? getSkill(id)?.icon ?? null : null);
    }
    setStyle(this.ghost, 'opacity', id ? '0.9' : '0');
  }

  /** Dönüş Parşömeni: 3 s channel bar, then a short red 'Kesildi!' when it was cancelled (moved / hit). */
  private updateScroll(now: number): boolean {
    const loot = G.loot;
    if (!loot) return false;
    if (loot.townScrollActive) {
      const f = loot.townScrollProgress;
      this.bar.set('Dönüş Parşömeni', f, Math.max(0, 3 * (1 - f)), { interruptible: true });
      return true;
    }
    if (loot.townScrollCancelledAt && now - loot.townScrollCancelledAt < 700) {
      this.bar.set('Dönüş Parşömeni', 1, 0, { interrupted: true });
      return true;
    }
    return false;
  }
}
