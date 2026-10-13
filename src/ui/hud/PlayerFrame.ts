import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import { getSpec } from '../../data/specs';
import { ROLE_TR } from '../../combat/specs';
import type { ClassId } from '../../types/common';
import type { RoleId, SpecId } from '../../types/v2';
import { LEVEL_CAP } from '../../types/character';
import type { UI } from '../UI';
import { ICON, approach, clamp01, div, fmtCompact, fmtNum, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { StatusRow } from '../widgets/StatusRow';
import { CastBarEl } from '../widgets/CastBar';
import type { HudCtx, HudWidget } from './types';
import { getSkill } from '../../data/skills';
import { COMBAT_FEEL } from '../../combat/feel';
import { LOCKOUT_SCHOOLS } from '../../combat/castRules';
import type { CastState } from '../../entities/Actor';
import type { Player } from '../../entities/Player';

export const CLASS_META: Record<ClassId, { name: string; color: string }> = {
  knight: { name: 'Şövalye', color: '#7aa8ff' },
  barbarian: { name: 'Barbar', color: '#ef6b3c' },
  mage: { name: 'Büyücü', color: '#a58aff' },
  rogue: { name: 'Haydut', color: '#8bd96a' },
  monk: { name: 'Keşiş', color: '#4fd1c5' },
  archer: { name: 'Okçu', color: '#d9a441' },
  paladin: { name: 'Paladin', color: '#fff0b8' },
  necromancer: { name: 'Nekromant', color: '#9ee07a' },
  warlock: { name: 'Warlock', color: '#c05ae0' },
  demonhunter: { name: 'İblis Avcısı', color: '#a330c9' }, // CM1 stub (WoW class colour)
  evoker: { name: 'Ejderhasoy', color: '#33937f' },        // CM1 stub (WoW class colour)
};

export function classColor(id: ClassId | undefined): string {
  if (!id) return '#e8c46a';
  return CLASSES[id]?.color || CLASS_META[id]?.color || '#e8c46a';
}
export function classNameTr(id: ClassId | undefined): string {
  if (!id) return '';
  return CLASSES[id]?.name || CLASS_META[id]?.name || id;
}

/** A thin game bar: dark inset, glossy fill, damage-lag ghost underlay and an optional centred label. */
export class Bar {
  readonly el: HTMLElement;
  readonly fill: HTMLElement;
  readonly ghost: HTMLElement;
  readonly label: HTMLElement;
  private v = 1;
  private g = 1;
  private lastTarget = 1;

  constructor(cls: string, parent?: HTMLElement) {
    this.el = div('bar ' + cls, parent);
    this.ghost = div('bar-ghost', this.el);
    this.fill = div('bar-fill', this.el);
    div('bar-gloss', this.el);
    this.label = div('bar-label', this.el);
  }

  set(frac: number, dt: number, text?: string): void {
    const t = clamp01(frac);
    // fill is exact; ghost trails behind when losing
    this.v = t;
    if (this.g < t) this.g = t;
    else this.g = approach(this.g, t, 1.8, dt);
    if (Math.abs(this.g - t) < 0.002) this.g = t;
    setStyle(this.fill, 'width', (this.v * 100).toFixed(2) + '%');
    setStyle(this.ghost, 'width', (this.g * 100).toFixed(2) + '%');
    if (text !== undefined) setText(this.label, text);
    if (t < this.lastTarget - 0.02) pulse(this.el, 'hit');
    this.lastTarget = t;
  }
}

/** Role colours of the spec chip (GDD_TALENTS §5.7: tank blue, healer green, DPS red). */
const ROLE_COLOR: Record<RoleId, string> = { tank: '#5aa8ff', healer: '#6fdc8c', dps: '#e0604e' };

/** Top-left player unit frame: class portrait, name, level, spec chip, HP and resource bars. */
export class PlayerFrame implements HudWidget {
  readonly el: HTMLElement;
  private portrait: HTMLElement;
  private portraitIco: HTMLElement;
  private lvl: HTMLElement;
  private nameEl: HTMLElement;
  private clsEl: HTMLElement;
  /** Spec chip under the name ("Ateş Büyücüsü · Hasarcı"); hidden until the level-10 spec choice. */
  private specEl: HTMLElement;
  private specKey: SpecId | null | undefined = undefined;
  private specDirty = true;
  private hp: Bar;
  private res: Bar;
  private classId: ClassId | null = null;
  private resType = '';
  readonly buffs: StatusRow;
  readonly debuffs: StatusRow;

  constructor(ui: UI) {
    this.el = div('pf');
    this.portrait = div('pf-portrait', this.el);
    this.portraitIco = iconEl(null, 'pf-pico', this.portrait);
    this.lvl = div('pf-lvl', this.portrait);
    const body = div('pf-body', this.el);
    const top = div('pf-top', body);
    this.nameEl = div('pf-name', top);
    this.clsEl = div('pf-cls', top);
    this.specEl = div('pf-spec', body);
    setDisplay(this.specEl, false);
    this.hp = new Bar('hp pf-hp', body);
    this.res = new Bar('res pf-res', body);
    this.buffs = new StatusRow(ui, 'buff', 14, 'buffs');
    this.debuffs = new StatusRow(ui, 'debuff', 10, 'debuffs');
    G.events.on('spec:changed', () => {
      this.specDirty = true;
    });
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    setClass(this.el, 'dead', !!p && p.isDead);
    if (!p) return;
    if (this.classId !== p.classId) {
      this.classId = p.classId;
      setIconUrl(this.portraitIco, ICON('class-' + p.classId));
      this.el.style.setProperty('--cc', classColor(p.classId));
      setText(this.clsEl, classNameTr(p.classId));
    }
    this.updateSpec(ctx);
    setText(this.nameEl, p.name);
    setText(this.lvl, String(p.level));
    this.hp.set(p.maxHp > 0 ? p.hp / p.maxHp : 0, ctx.dt, `${fmtCompact(Math.max(0, p.hp))} / ${fmtCompact(p.maxHp)}`);
    if (this.resType !== p.resourceType) {
      this.resType = p.resourceType;
      this.res.el.dataset.kind = p.resourceType;
    }
    this.res.set(p.maxResource > 0 ? p.resource / p.maxResource : 0, ctx.dt, `${fmtCompact(Math.max(0, p.resource))} / ${fmtCompact(p.maxResource)}`);
    this.buffs.update(p);
    this.debuffs.update(p);
  }

  reset(): void {
    this.buffs.clear();
    this.debuffs.clear();
  }

  /** Re-renders the spec chip when the spec changed (`spec:changed`) or on the first frame; cheap otherwise. */
  private updateSpec(ctx: HudCtx): void {
    const key: SpecId | null = ctx.character?.save.spec ?? null;
    if (!this.specDirty && key === this.specKey) return;
    this.specDirty = false;
    this.specKey = key;
    const def = getSpec(key);
    if (!def) {
      setDisplay(this.specEl, false);
      return;
    }
    const role = ROLE_TR[def.role];
    setText(this.specEl, role ? `${def.name} · ${role}` : def.name);
    this.specEl.style.setProperty('--rc', ROLE_COLOR[def.role] ?? '#e8c46a');
    setDisplay(this.specEl, true);
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
