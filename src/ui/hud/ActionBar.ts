import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import { getMaterial } from '../../data/materials';
import type { InputAction } from '../../core/Input';
import type { AimInfo, SkillDef, SkillSlotKey } from '../../types/skills';
import type { AutoInfo } from '../../combat/SkillSystem';
import type { Actor } from '../../entities/Actor';
import { lockoutSchool } from '../../combat/castRules';
import { glowSkillsOf, type GlowState } from '../../data/procs';
import { localHardTargetId } from '../../game/PlayerController';
import { DAMAGE_COLORS, ICON, div, fmtCd, fmtNum, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText, esc } from '../widgets/dom';
import { skillTooltipHTML } from '../widgets/tooltips';
import { TalentBadge } from './Extras';
import { drag } from '../panels/items/common';
import { applyBarDrop, barAccepts, barDropOutside, barPayload, readBars, useBarMat } from './barDrop';
import { type CellRef, itemCount, sharedCooldown } from './barModel';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-wow.css';

/**
 * CONTROLS_WOW §8 / Q5: the event PlayerController emits on every change of the auto-attack armed flag.
 * Typed here as a string so this file compiles whether or not core/events.ts already declares it.
 */
const AUTO_STATE_EVENT = 'autoattack:state';
interface AutoStatePayload { armed: boolean; targetId: number | null }

/** Reveal state of a skill cell (UI_REDESIGN §2.6.4): absent, dashed "+" socket, or a ready button. */
type Reveal = 'hidden' | 'socket' | 'ready';

interface SlotSpec {
  id: string;
  action: InputAction;
  skill?: SkillSlotKey;
  potion?: 'hp' | 'mp' | 'cleanse';
  /** Fallback unlock level (§2.6.2); a bound skill's own unlockLevel wins. */
  unlock: number;
  /** Major (45 / 90 / 180 s) cell: needs a chosen spec before it can appear. */
  major?: boolean;
}

/** The 12-slot main row, left to right (§2.6.2). */
const MAIN_SPECS: SlotSpec[] = [
  { id: 'lmb', action: 'skill_lmb', skill: 'lmb', unlock: 1 },
  { id: 'rmb', action: 'skill_rmb', skill: 'rmb', unlock: 1 },
  { id: 'q', action: 'skill_q', skill: 'q', unlock: 3 },
  { id: 'e', action: 'skill_e', skill: 'e', unlock: 6 },
  { id: 'r', action: 'skill_r', skill: 'r', unlock: 30 },
  { id: 's1', action: 'skill_s1', skill: 's1', unlock: 10 },
  { id: 's2', action: 'skill_s2', skill: 's2', unlock: 15 },
  { id: 's3', action: 'skill_s3', skill: 's3', unlock: 20 },
  { id: 's4', action: 'skill_s4', skill: 's4', unlock: 8 },
  { id: 'm45', action: 'skill_m45', skill: 'm45', unlock: 10, major: true },
  { id: 'm90', action: 'skill_m90', skill: 'm90', unlock: 20, major: true },
  { id: 'm180', action: 'skill_m180', skill: 'm180', unlock: 30, major: true },
];

/** The consumable strip under the player frame (§2.6.5): potions and the Panzehir cleanse, always present. */
const POTION_SPECS: SlotSpec[] = [
  { id: 'potHp', action: 'potionHp', potion: 'hp', unlock: 1 },
  { id: 'potMp', action: 'potionMp', potion: 'mp', unlock: 1 },
  { id: 'potCleanse', action: 'potionCleanse', potion: 'cleanse', unlock: 1 },
];

const CLEANSE_ID = 'potion_panzehir';
const MAJOR_LABEL: Record<string, string> = { m45: '45 sn', m90: '90 sn', m180: '3 dk' };
/** The YENİ chip stays this long after a cell is revealed (ms), unless the cell is hovered or used. */
const YENI_MS = 30000;

/** Short school glyphs for the `.locked` state (CW-08 / UI §2.6.8: grey icon + school glyph + seconds). */
const SCHOOL_GLYPH: Record<string, string> = {
  fire: 'ATE', frost: 'BUZ', arcane: 'ARK', holy: 'KUT', shadow: 'GÖL', poison: 'ZEH',
};

/** Resource fraction at which spender skills get the `.spend` cap cue (CW-08 / COMBAT_WOW §2.12). */
const SPEND_PCT = 0.9;
/** Skill targeting kinds that need a target for the out-of-range check (CW-08). */
const OOR_TARGETING = new Set<string>(['melee_arc', 'projectile', 'dash']);
/** Melee assist distance added to `def.range` before a melee skill counts as out of range (COMBAT_WOW §2.12). */
const MELEE_ASSIST = 1.5;
/** Skills with a cooldown of at least this many seconds announce readiness (`skill:ready`, ready pulse). */
const READY_EVENT_CD = 8;
/** A queued press is dropped after this long if no `skill:queued null` arrives (ms). */
const QUEUE_TTL_MS = 2000;

/** Per-frame values shared by every slot (computed once in ActionBar.update). */
interface BarFrame {
  /** Glow ids from glowSkillsOf (skill ids and `@lmb` / `@tag` tokens). */
  glow: Set<string>;
  /** Setting Settings.abilityGlow. */
  glowOn: boolean;
  /** Target for the out-of-range check: the selected (hard) target, else the hover (soft) target, or null. */
  target: Actor | null;
  /** Local school lock (school + seconds left), or null. */
  locked: { school: string; remaining: number } | null;
  /** Spell queue: the queued skill id / slot, or null. */
  queued: { skillId: string | null; slot: string | null } | null;
}

interface TipUi {
  showTooltip(html: string, x: number, y: number): void;
  hideTooltip(): void;
}

/** Stands in for the skill id of an item cell, so the next skill frame refreshes the icon. */
const MAT_SENTINEL = '\u0000mat';
/** Classes a skill cell paints that an item cell must not show. */
const ITEM_OFF = ['auto', 'armed', 'queued', 'oor', 'glow', 'spend', 'is-disabled', 'locked', 'casting', 'nores', 'slot-gcd'];

/** Cooldown number colour: white, red under 3 s (docs/UI_WOW_CLASSIC.md §2). */
function cdColor(sec: number): string {
  return sec < 3 ? '#ff4a3a' : '#ffffff';
}

/** Cooldown text: one decimal under 3 s (decimal comma), else the shared short format. */
function cdText(sec: number): string {
  return sec < 3 ? sec.toFixed(1).replace('.', ',') : fmtCd(sec);
}

class Slot {
  readonly el: HTMLElement;
  private art: HTMLElement;
  private tone: HTMLElement;
  private swing: HTMLElement;
  private sweep: HTMLElement;
  private edge: HTMLElement;
  private cdEl: HTMLElement;
  private school: HTMLElement;
  private sated: HTMLElement;
  private keyEl: HTMLElement;
  private count: HTMLElement;
  private chip: HTMLElement;
  private skillId: string | null = null;
  private def: SkillDef | null = null;
  private prevCd = 0;
  private prevReveal: Reveal | null = null;
  private newUntil = 0;
  private potionCount = 0;
  private potionId: string | null = null;
  private hover = false;
  private glowing = false;
  private toneKey = '';
  /** WoW auto-attack cell (lmb with skill_lmb unbound): the last frame's chain info, for the tooltip. */
  private autoInfo: AutoInfo | null = null;
  failUntil = 0;
  /** A mouse click cast this slot since the last frame: ActionBar.update flashes the cell and shows the failure text. */
  clicked = false;
  /** Consumable on this main-bar cell (set per frame by ActionBar from the save), or null. */
  matId: string | null = null;
  private shownMat: string | null = null;

  constructor(readonly spec: SlotSpec, private readonly ui: TipUi) {
    this.el = div(spec.potion ? 'k-slot ab-btn k-slot--cons pot' : 'k-slot ab-btn');
    this.el.dataset.slot = spec.id;
    this.art = iconEl(null, 'k-art', this.el);
    this.tone = div('k-tone', this.el);
    this.swing = div('k-swing', this.el);
    this.sweep = div('k-sweep', this.el);
    this.edge = div('k-edge', this.el);
    this.cdEl = div('k-cdnum', this.el);
    this.school = div('k-school', this.el);
    div('k-plus', this.el, '+');
    this.sated = div('k-sated', this.el);
    this.keyEl = div('k-key-lbl', this.el);
    this.count = div('k-count', this.el);
    this.chip = div('ab-new', this.el, 'YENİ');
    this.el.classList.add('hud-interactive');
    this.el.addEventListener('mouseenter', (e) => {
      this.hover = true;
      this.newUntil = 0;
      this.showTip(e.clientX, e.clientY);
    });
    this.el.addEventListener('mousemove', (e) => this.hover && this.showTip(e.clientX, e.clientY));
    this.el.addEventListener('mouseleave', () => {
      this.hover = false;
      ui.hideTooltip();
    });
    this.el.addEventListener('click', () => this.onClick());
    // right click on a cell is a no-op (the browser menu is already suppressed globally); keep it from reaching the world
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * A socket opens the skill book; a potion cell drinks (the same call as its key); a skill cell casts its slot through the
   * same SkillSystem path as the key (tryCast with the controller's live aim, so a click behaves like a press).
   */
  private onClick(): void {
    if (this.el.classList.contains('is-socket')) {
      G.ui.openPanel('skills');
      return;
    }
    if (this.matId) {
      this.useMat();
      return;
    }
    if (this.spec.potion) {
      G.combat?.usePotion(this.spec.potion);
      return;
    }
    const key = this.spec.skill;
    const p = G.player;
    if (!key || !p || p.isDead || this.el.classList.contains('is-hidden') || this.el.classList.contains('is-ghost')) return;
    if (G.ui.mode !== 'town' && G.ui.mode !== 'dungeon') return;
    // an unbound WoW lmb cell is the auto-attack indicator, not a button
    if (this.el.classList.contains('auto')) return;
    const id = G.skills.getSlotSkill(p, key);
    if (!id) return;
    const aim: AimInfo = G.skills.aimProvider?.() ?? { point: [p.position.x, 0, p.position.z], dir: [Math.sin(p.yaw), 0, Math.cos(p.yaw)], targetId: p.targetId ?? null };
    this.clicked = true;
    try {
      G.skills.tryCast(p, id, aim, key);
    } catch (err) {
      console.error('[actionbar] click cast failed', err);
    }
  }

  /** Uses the consumable on this cell (a click, or the cell's key). */
  useMat(): void {
    if (!this.matId) return;
    pulse(this.el, useBarMat(this.matId) ? 'press' : 'fail');
  }

  private showTip(x: number, y: number): void {
    const bind = G.input?.bindingLabel(this.spec.action);
    if (this.matId) {
      const m = getMaterial(this.matId);
      const n = G.character?.material(this.matId) ?? 0;
      this.ui.showTooltip(`<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(m?.name ?? this.matId)}</div><div class="sk-tags">Tüketilebilir · Elindeki: ${fmtNum(n)}</div></div></div><div class="sk-desc">${esc(m?.desc ?? '')}</div><div class="sk-key">Tuş: <b>${esc(bind ?? '')}</b></div></div>`, x, y);
      return;
    }
    if (this.autoInfo) {
      const a = this.autoInfo;
      const autoKey = G.input?.bindingLabel('autoAttack') ?? '-';
      const toggle = autoKey === '-' ? 'Sağ tık (düşman)' : `Sağ tık (düşman) / ${esc(autoKey)}`;
      const step = `Adım ${a.step + 1}/${a.steps}${a.finisherNext ? ' · Bitiriş' : ''}`;
      this.ui.showTooltip(`<div class="sk"><div class="sk-head"><div><div class="sk-name">Otomatik Saldırı</div><div class="sk-tags">${esc(step)}</div></div></div><div class="sk-desc">${toggle} ile aç-kapat</div></div>`, x, y);
      return;
    }
    if (this.spec.potion) {
      const m = this.potionId ? getMaterial(this.potionId) : undefined;
      const fallback = this.spec.potion === 'hp' ? 'Can İksiri' : this.spec.potion === 'mp' ? 'Ruh İksiri' : 'Panzehir İksiri';
      const name = m?.name ?? fallback;
      const desc = m?.desc ?? (this.spec.potion === 'hp' ? 'Canının bir kısmını yeniler. Ortak bekleme süresi vardır.' : 'Kaynağının bir kısmını yeniler.');
      this.ui.showTooltip(`<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(name)}</div><div class="sk-tags">İksir · Elindeki: ${fmtNum(this.potionCount)}</div></div></div><div class="sk-desc">${esc(desc)}</div><div class="sk-key">Tuş: <b>${esc(bind ?? '')}</b></div></div>`, x, y);
      return;
    }
    if (!this.def) {
      this.ui.showTooltip(`<div class="sk"><div class="sk-name">Boş Yuva</div><div class="sk-desc">Yetenek Kitabı'ndan (${esc(G.input?.bindingLabel('skills') ?? 'K')}) bir yetenek sürükle.</div></div>`, x, y);
      return;
    }
    let html = skillTooltipHTML(this.def, G.player, bind, G.character?.save.skillRanks?.[this.def.id] ?? 1);
    if (this.spec.major) {
      html += `<div class="sk"><div class="sk-desc">Büyük Yetenek · Bekleme ${esc(MAJOR_LABEL[this.spec.id] ?? '')}</div></div>`;
    }
    this.ui.showTooltip(html, x, y);
  }

  /**
   * The skill id this slot resolves to this frame (bound skill, or the class basic attack on an unbound lmb). A button
   * transform (SkillDef.replaces) shows the replacing skill while its status is up, the same skill SkillSystem casts.
   */
  resolveSkill(ctx: HudCtx): string | null {
    const key = this.spec.skill;
    if (!key || this.matId) return null;
    const c = ctx.character;
    let id: string | undefined = c?.save.skillBar[key];
    if (!id && key === 'lmb') {
      const cls = c?.classId ?? ctx.player?.classId;
      id = cls ? CLASSES[cls]?.basicAttack : undefined;
    }
    if (id && key !== 'lmb' && ctx.player) return G.skills.replacementFor(ctx.player, id) ?? id;
    return id ?? null;
  }

  /** Highest HP/resource potion tier the character owns (tier 5..1), else tier 1 (count 0). The cleanse potion has one tier. */
  private resolvePotion(ctx: HudCtx): { id: string; count: number } {
    const c = ctx.character;
    if (this.spec.potion === 'cleanse') return { id: CLEANSE_ID, count: c ? c.material(CLEANSE_ID) : 0 };
    const base = this.spec.potion === 'hp' ? 'pot_hp_' : 'pot_res_';
    for (let t = 5; t >= 1; t--) {
      const n = c ? c.material(base + t) : 0;
      if (n > 0) return { id: base + t, count: n };
    }
    return { id: base + 1, count: 0 };
  }

  /**
   * Progressive reveal (UI §2.6.4): a skill cell is absent until its unlock level, a dashed socket once unlocked and empty,
   * and a ready button once a skill is bound and learned. Majors need a chosen spec before they can appear.
   */
  private reveal(ctx: HudCtx, sid: string | null): Reveal {
    if (this.spec.skill === 'lmb') return 'ready';
    const level = ctx.character?.level ?? 1;
    if (sid) {
      if (!this.def) return 'ready'; // the bound skill's data is still loading: keep the cell
      // unlockLevel >= 99 = granted by a talent (no level gate): a bound skill is always shown
      const need = this.def.unlockLevel ?? this.spec.unlock;
      return need >= 99 || level >= need ? 'ready' : 'hidden';
    }
    if (this.spec.major && !ctx.character?.save.spec) return 'hidden';
    return level >= this.spec.unlock ? 'socket' : 'hidden';
  }

  setFlash(kind: 'press' | 'fail'): void {
    if (kind === 'press') {
      pulse(this.el, 'press');
      this.newUntil = 0;
    } else {
      pulse(this.el, 'fail');
    }
  }

  /**
   * @param auto the auto-attack view when this is the WoW auto cell (lmb with skill_lmb unbound), else null.
   * @param armed the auto-attack armed flag from the `autoattack:state` event (only read when `auto` is set).
   * @param ghost Settings.barGhostSlots: hidden cells stay as dim, non-interactive placeholders.
   */
  update(ctx: HudCtx, auto: AutoInfo | null, armed: boolean, frame: BarFrame, ghost: boolean): void {
    const p = ctx.player;
    this.autoInfo = auto;
    if (this.matId) {
      this.updateMat(ctx);
      return;
    }
    let rev: Reveal = 'ready';
    if (!this.spec.potion) {
      const sid = this.resolveSkill(ctx);
      if (sid !== this.skillId) {
        this.skillId = sid;
        this.def = sid ? (G.skills.getDef(sid) ?? null) : null;
        setIconUrl(this.art, this.def?.icon ?? null);
        const dtype = this.def?.damage?.type;
        const accent = dtype ? DAMAGE_COLORS[dtype] ?? '#fff' : this.def?.tags.includes('buff') ? '#9be86a' : '#fff';
        this.el.style.setProperty('--ac', accent);
      }
      // def may appear later (data loaded after first frame)
      if (sid && !this.def) {
        this.def = G.skills.getDef(sid) ?? null;
        if (this.def) setIconUrl(this.art, this.def.icon);
      }
      rev = this.reveal(ctx, sid);
    }
    // reveal bookkeeping: a cell that goes from absent to ready (after the first frame) shows the YENİ chip for 30 s
    if (this.prevReveal === 'hidden' && rev === 'ready') this.newUntil = ctx.now + YENI_MS;
    this.prevReveal = rev;
    if (this.newUntil > 0 && ctx.now >= this.newUntil) this.newUntil = 0;
    const isNew = this.newUntil > 0 && !this.hover;
    setClass(this.el, 'is-new', isNew);
    setDisplay(this.chip, isNew, 'block');
    setClass(this.el, 'is-hidden', rev === 'hidden' && !ghost);
    setClass(this.el, 'is-ghost', rev === 'hidden' && ghost);
    setClass(this.el, 'is-socket', rev === 'socket');
    setClass(this.el, 'noskill', rev === 'socket' || (!this.spec.potion && !this.def));
    if (rev === 'hidden') {
      setDisplay(this.swing, false);
      setDisplay(this.sweep, false);
      setDisplay(this.cdEl, false);
      setDisplay(this.school, false);
      setDisplay(this.sated, false);
      setDisplay(this.count, false);
      setClass(this.el, 'oncd', false);
      setClass(this.el, 'slot-gcd', false);
      this.prevCd = 0;
      return;
    }
    setText(this.keyEl, auto ? 'Oto' : G.input ? G.input.bindingLabel(this.spec.action) : '');
    setClass(this.el, 'auto', !!auto);
    setClass(this.el, 'armed', !!auto && armed);
    const swingOn = !!auto && auto.total > 0 && auto.elapsed < auto.total;
    if (auto && swingOn) setStyle(this.el, '--p', (1 - Math.min(1, auto.elapsed / auto.total)).toFixed(3));
    setDisplay(this.swing, swingOn, 'block');
    let rem = 0, total = 0, charges = 1, maxCharges = 1;
    let noRes = false;
    let casting = false;
    let countN = 0;
    let countShown = false;
    if (this.spec.potion) {
      const pot = this.resolvePotion(ctx);
      if (pot.id !== this.potionId) {
        this.potionId = pot.id;
        const m = getMaterial(pot.id);
        setIconUrl(this.art, m?.icon ?? ICON(this.spec.potion === 'mp' ? 'item-potion-mana' : 'item-potion-health'));
      }
      this.potionCount = pot.count;
      const s = p?.statuses.get('potion_cd');
      if (s) {
        rem = s.remaining;
        total = s.duration;
      }
      countN = pot.count;
      countShown = true;
      setClass(this.el, 'empty', pot.count <= 0);
    } else {
      setClass(this.el, 'empty', false);
      if (this.def && p) {
        const cdi = G.skills.getCooldown(p, this.def.id);
        rem = cdi.remaining;
        total = cdi.total;
        charges = cdi.charges;
        maxCharges = cdi.maxCharges;
        noRes = this.def.cost > 0 && p.resource < this.def.cost;
        casting = !!p.cast && p.cast.skillId === this.def.id;
      }
      countN = charges;
      countShown = maxCharges > 1;
    }
    // counts: shown when > 1, or 0 (charge-based skill or potion out of stock: `.is-zero`); exactly 1 shows nothing
    setText(this.count, String(countN));
    setClass(this.count, 'is-zero', countN <= 0);
    setDisplay(this.count, countShown && (countN > 1 || countN <= 0));
    // own cooldown sweep: --p is the remaining fraction (kit.css); charge skills only dim while NO charge is available
    const onCd = rem > 0.05 && total > 0;
    const lockedByCd = onCd && (maxCharges <= 1 || charges <= 0);
    const cdFrac = onCd ? Math.min(1, rem / total) : 0;
    setClass(this.el, 'oncd', lockedByCd);
    setClass(this.el, 'has-edge', lockedByCd && total > 2);
    if (lockedByCd) {
      setText(this.cdEl, cdText(rem));
      setStyle(this.cdEl, 'color', cdColor(rem));
    }
    setDisplay(this.cdEl, lockedByCd, 'flex');
    if (onCd) setStyle(this.el, '--p', cdFrac.toFixed(3));
    setDisplay(this.sweep, onCd, 'block');
    if (this.prevCd > 0.05 && rem <= 0.05 && !this.spec.potion) {
      pulse(this.el, 'ready');
      if (this.def && (this.spec.major || total >= READY_EVENT_CD)) G.events.emit('skill:ready', { skillId: this.def.id, major: !!this.spec.major });
    }
    this.prevCd = rem;
    // global cooldown sweep (skills only, when the own cooldown is not longer); drawn by the kit's `.slot-gcd` sweep
    let gcdOn = false;
    if (!this.spec.potion && this.def && p) {
      const g = G.skills.getGcd(p);
      if (g.remaining > 0.02 && g.total > 0 && rem <= g.remaining + 0.02) {
        setStyle(this.el, '--p', Math.min(1, g.remaining / g.total).toFixed(3));
        gcdOn = true;
      }
    }
    setClass(this.el, 'slot-gcd', gcdOn);
    setDisplay(this.sweep, onCd || gcdOn, 'block');
    setClass(this.el, 'nores', noRes);
    setClass(this.el, 'casting', casting);
    setClass(this.el, 'failing', ctx.now < this.failUntil);
    this.updateStates(ctx, frame, noRes);
    this.updateMajor(ctx);
  }

  /**
   * An item cell (a consumable on the main bar): icon, stack count (total in the bags), the shared cooldown (potion_cd),
   * greyed at 0 but kept on the bar.
   */
  private updateMat(ctx: HudCtx): void {
    const id = this.matId ?? '';
    if (this.shownMat !== id) {
      this.shownMat = id;
      const m = getMaterial(id);
      setIconUrl(this.art, m?.icon ?? null);
      this.el.style.setProperty('--ac', m?.potion ? (m.potion.kind === 'mp' ? '#6aa8ff' : '#ff6a5a') : '#e8c46a');
      this.skillId = MAT_SENTINEL;
      this.def = null;
    }
    setClass(this.el, 'is-hidden', false);
    setClass(this.el, 'is-ghost', false);
    setClass(this.el, 'is-socket', false);
    setClass(this.el, 'noskill', false);
    setClass(this.el, 'is-new', false);
    setDisplay(this.chip, false);
    setDisplay(this.school, false);
    setDisplay(this.sated, false);
    setDisplay(this.swing, false);
    for (const c of ITEM_OFF) setClass(this.el, c, false);
    setText(this.keyEl, G.input ? G.input.bindingLabel(this.spec.action) : '');
    const n = itemCount(ctx.character?.save.materials ?? {}, id);
    setClass(this.el, 'empty', n <= 0);
    setText(this.count, String(n));
    setClass(this.count, 'is-zero', n <= 0);
    setDisplay(this.count, n > 1 || n <= 0);
    const cd = sharedCooldown(ctx.player?.statuses.get('potion_cd'));
    const onCd = cd.remaining > 0.05 && cd.total > 0;
    setClass(this.el, 'oncd', onCd);
    setClass(this.el, 'has-edge', onCd && cd.total > 2);
    if (onCd) {
      setStyle(this.el, '--p', Math.min(1, cd.remaining / cd.total).toFixed(3));
      setText(this.cdEl, cdText(cd.remaining));
      setStyle(this.cdEl, 'color', cdColor(cd.remaining));
    }
    setDisplay(this.cdEl, onCd, 'flex');
    setDisplay(this.sweep, onCd, 'block');
    this.prevCd = cd.remaining;
  }

  /** Major tone line (`--tone`: defensive blue, heal green, otherwise gold; the hero slot is always gold), `Yorgun m:ss` on T. */
  private updateMajor(ctx: HudCtx): void {
    if (!this.spec.major) return;
    const def = this.def;
    const tone = this.spec.id === 'm180' ? 'gold' : def?.tags.includes('defensive') ? 'info' : def?.tags.includes('heal') ? 'ok' : 'gold2';
    if (tone !== this.toneKey) {
      this.toneKey = tone;
      this.el.dataset.tone = tone;
    }
    setClass(this.el, 'major', true);
    const st = this.spec.id === 'm180' ? ctx.player?.statuses.get('sated') : undefined;
    setDisplay(this.sated, !!st, 'block');
    if (st) {
      const s = Math.max(0, Math.ceil(st.remaining));
      setText(this.sated, `Yorgun ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }
  }

  /** CW-08 / UI §2.6.8 states: queued, out of range, school lock, proc glow, spender cap, stun / silence. One class each, painted by kit.css. */
  private updateStates(ctx: HudCtx, frame: BarFrame, noRes: boolean): void {
    const p = ctx.player;
    const def = this.def;
    const isSkill = !this.spec.potion && !!def;
    // queued: the spell queue holds this slot's skill (or its key), until the queue clears
    const q = frame.queued;
    setClass(this.el, 'queued', isSkill && !!q && (q.slot === this.spec.skill || (q.skillId !== null && q.skillId === def?.id)));
    // out of range: a targeted skill whose hover target is farther (edge to edge) than its range
    let oor = false;
    if (isSkill && def && p && def.range && OOR_TARGETING.has(def.targeting) && frame.target && !frame.target.isDead) {
      const dx = frame.target.position.x - p.position.x, dz = frame.target.position.z - p.position.z;
      const edge = Math.hypot(dx, dz) - frame.target.radius - p.radius;
      oor = edge > def.range + (def.targeting === 'melee_arc' ? MELEE_ASSIST : 0);
    }
    setClass(this.el, 'oor', oor);
    // proc / usable glow (setting abilityGlow); the button pops once when the glow turns on
    const glow = frame.glowOn && isSkill && !!def && (frame.glow.has(def.id) || (this.spec.id === 'lmb' && frame.glow.has('@lmb')) || def.tags.some((t) => frame.glow.has('@' + t)));
    if (glow && !this.glowing) pulse(this.el, 'glowpop');
    this.glowing = glow;
    setClass(this.el, 'glow', glow);
    // spender cap cue: resource at or above 90 % of max on a spender-tagged skill
    const spend = isSkill && !!def && def.tags.includes('spender') && !!p && p.maxResource > 0 && p.resource >= SPEND_PCT * p.maxResource && !noRes;
    setClass(this.el, 'spend', spend);
    // stunned / silenced: the skill cannot be used at all (grey + hatch, no hover)
    setClass(this.el, 'is-disabled', isSkill && !!p && (p.statuses.has('stun') || p.statuses.has('silence')));
    // school lock: the local school lock matches this skill's school; the countdown replaces the number
    const school = isSkill && def ? lockoutSchool(def) : null;
    const lockRem = school !== null && frame.locked && frame.locked.school === school ? frame.locked.remaining : 0;
    const locked = lockRem > 0;
    setClass(this.el, 'locked', locked);
    setText(this.school, locked && school ? (SCHOOL_GLYPH[school] ?? school.toUpperCase()) : '');
    setDisplay(this.school, locked, 'block');
    if (locked) {
      setText(this.cdEl, String(Math.ceil(lockRem)));
      setStyle(this.cdEl, 'color', '#ffffff');
      setDisplay(this.cdEl, true, 'flex');
    }
  }
}

/** Target for the range check and glow rules: the selected (hard) target first, then the player's current target, then the hover (soft) one. */
function pickTarget(ctx: HudCtx): Actor | null {
  const w = ctx.world;
  const ids = [localHardTargetId(), ctx.player?.targetId ?? null];
  if (w) {
    for (const id of ids) {
      if (id == null) continue;
      const t = w.getActor(id);
      if (t && !t.isDead && !t.removed && t !== ctx.player) return t;
    }
  }
  return ctx.hover && !ctx.hover.isDead ? ctx.hover : null;
}

/** Living enemies within 12 m of the player with at least 5 bleed stacks (GLOW_RULES.bloodbath3). */
function countBleeding(ctx: HudCtx, p: Actor): number {
  let n = 0;
  for (const e of ctx.world?.enemies ?? []) {
    if (e.isDead || e.statuses.stacks('bleed') < 5) continue;
    if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) <= 12) n++;
  }
  return n;
}

/**
 * The 12-slot ElvUI action grid (UI §2.6.1): one main row of square buttons, 1 px apart, keybind top-right, charges bottom-right,
 * cooldown sweep. The consumable strip (potions + Panzehir) mounts into `hosts.cons` (the player frame's strip, §2.6.5).
 */
export class ActionBar implements HudWidget {
  /** `.actionbar`: the root that holds `.ab-bars` (and the TalentBadge). */
  readonly el: HTMLElement;
  private slots: Slot[] = [];
  private potSlots: Slot[] = [];
  private lastFailFrame = -10;
  private hasFail = false;
  /** Spell queue (skill:queued): the queued skill / slot and when the entry expires (performance.now ms). */
  private queued: { skillId: string | null; slot: string | null; until: number } | null = null;
  /** Local school lock (skill:lockout): school and when it ends (performance.now ms). */
  private lockSchool: string | null = null;
  /** Auto-attack armed flag, kept current by the `autoattack:state` event (CONTROLS_WOW Q5). */
  private autoArmed = false;
  /** "N" unspent-points badge, re-anchored above the grid's top-left corner (GDD_TALENTS §5.9, UI §2.6.1). */
  private talentBadge: TalentBadge;

  /**
   * `hosts`: `grid` receives the `.ab-bars` block (default: this bar's own root), `cons` receives the potion strip
   * (the player frame's consumable host, UI §2.6.5; default: this bar's root).
   */
  constructor(ui: TipUi, hosts?: { grid?: HTMLElement; cons?: HTMLElement }) {
    this.el = div('actionbar');
    const bars = div('ab-bars', hosts?.grid ?? this.el);
    const row = div('ab-row r1', bars);
    for (const spec of MAIN_SPECS) {
      const s = new Slot(spec, ui);
      const ref: CellRef = { bar: 'main', idx: this.slots.length };
      drag.zone(s.el, {
        accepts: (p) => barAccepts(ref, p),
        drop: (p) => applyBarDrop(ref, p),
      });
      drag.bindSource(s.el, {
        payload: (ev) => barPayload(ref, ev),
        onDropOutside: barDropOutside,
      });
      this.slots.push(s);
      row.appendChild(s.el);
    }
    const cons = hosts?.cons ?? this.el;
    for (const spec of POTION_SPECS) {
      const s = new Slot(spec, ui);
      this.potSlots.push(s);
      cons.appendChild(s.el);
    }
    this.talentBadge = new TalentBadge(ui);
    this.el.appendChild(this.talentBadge.el);
    G.events.on('skill:fail', () => {
      this.lastFailFrame = G.engine.frame;
      this.hasFail = true;
    });
    G.events.on('skill:queued', ({ skillId, slot }) => {
      // both null = the queue was cleared
      this.queued = skillId === null && slot === null ? null : { skillId, slot, until: performance.now() + QUEUE_TTL_MS };
    });
    G.events.on('skill:lockout', ({ school }) => {
      this.lockSchool = String(school);
    });
    // typed through a string name: the event is appended to core/events.ts by another package (Q5)
    const bus = G.events as unknown as { on(name: string, fn: (p: AutoStatePayload) => void): unknown };
    bus.on(AUTO_STATE_EVENT, (p) => {
      this.autoArmed = !!p?.armed;
    });
  }

  /** Clears the transient queue / lockout state (scene change, HUD hidden). */
  reset(): void {
    this.queued = null;
    this.lockSchool = null;
  }

  /** Once-per-frame inputs for the CW-08 states: the glow set (glowSkillsOf), the target, the lock and the queue. */
  private buildFrame(ctx: HudCtx, slots: Slot[]): BarFrame {
    const p = ctx.player;
    const now = performance.now();
    if (this.queued && now > this.queued.until) this.queued = null;
    // a queued skill that has started casting is no longer waiting
    if (this.queued && this.queued.skillId !== null && p?.cast?.skillId === this.queued.skillId) this.queued = null;
    const statusLock = p?.statuses.get('lockout');
    const lockRem = statusLock ? statusLock.remaining : 0;
    // the status is the authority for the countdown; the event supplies the school (ActiveStatus has none)
    const locked = this.lockSchool !== null && lockRem > 0 ? { school: this.lockSchool, remaining: lockRem } : null;
    const glowOn = G.settings?.data.abilityGlow !== false;
    let glow = new Set<string>();
    if (p) {
      // bestSpender: the affordable spender on the bar with the highest cost (else the first spender)
      let best: { id: string; cost: number } | null = null;
      let firstSpender: string | null = null;
      for (const s of slots) {
        const id = s.resolveSkill(ctx);
        const def = id ? G.skills.getDef(id) : undefined;
        if (!id || !def || !def.tags.includes('spender')) continue;
        firstSpender ??= id;
        if (def.cost <= p.resource && (!best || def.cost > best.cost)) best = { id, cost: def.cost };
      }
      const target = pickTarget(ctx);
      const state: GlowState = {
        resourcePct: p.maxResource > 0 ? p.resource / p.maxResource : 0,
        bestSpender: best?.id ?? firstSpender,
        pips: G.skills.pipCount(p, 'adalet'),
        combo: G.skills.pipCount(p, 'combo'),
        arcane: G.skills.pipCount(p, 'arcane'),
        targetHpPct: target && target.maxHp > 0 ? target.hp / target.maxHp : null,
        stealthed: p.statuses.has('stealth') || p.statuses.has('shadow_veil_cd') || p.statuses.has('ambush') || p.statuses.has('dancer'),
        riposteOpen: p.statuses.has('riposte'),
        targetGuardBroken: !!target && target.statuses.has('guard_broken'),
        bleedingEnemies: countBleeding(ctx, p),
      };
      glow = glowSkillsOf(p.statuses, state);
    }
    return {
      glow,
      glowOn,
      target: pickTarget(ctx),
      locked,
      queued: this.queued,
    };
  }

  update(ctx: HudCtx): void {
    this.talentBadge.update(ctx);
    // action camera without a pointer lock: the first mouse click only re-acquires the lock (PlayerController swallows it), no slot flash
    const relock = !!G.input && !G.input.isLocked() && G.settings?.data.cameraMode === 'action';
    // WoW: lmb is the auto-attack cell while skill_lmb has no key (CONTROLS_WOW §9)
    const autoCell = !!G.input && !!G.settings && G.settings.data.controlScheme === 'wow' && G.input.bindings.skill_lmb.length === 0;
    const auto = autoCell && ctx.player ? G.skills.autoInfo(ctx.player) : null;
    // the main row's consumables come from the save (skills come from skillBar, read by each slot)
    const mainRow = readBars().main;
    this.slots.forEach((s, i) => {
      const c = mainRow[i];
      s.matId = c?.k === 'mat' ? c.id : null;
    });
    const frame = this.buildFrame(ctx, this.slots);
    const ghost = G.settings?.data.barGhostSlots === true;
    for (const s of this.slots) {
      s.update(ctx, s.spec.id === 'lmb' && !s.matId ? auto : null, this.autoArmed, frame, ghost);
      const clicked = s.clicked;
      s.clicked = false;
      const down = clicked || (G.input && ctx.mode !== 'menu' && G.input.pressed(s.spec.action));
      const swallowed = relock && (s.spec.action === 'skill_lmb' || s.spec.action === 'skill_rmb');
      if (down && (clicked || (!swallowed && !G.ui.wantsCursor()))) {
        // an item cell fires from its key (a skill cell casts through SkillSystem)
        if (s.matId) {
          s.useMat();
          continue;
        }
        s.setFlash('press');
        // a failure reported during this frame belongs to the pressed slot
        if (this.hasFail && G.engine.frame - this.lastFailFrame <= 1) {
          s.setFlash('fail');
          s.failUntil = ctx.now + 260;
          // the reason text is CastErrors (top centre, WoW error line); the sound is the audio module's ('skill:fail')
          this.hasFail = false;
        }
      }
    }
    // consumable strip: PlayerController keys the two potions; the Panzehir key is read here (flash + drink)
    for (const s of this.potSlots) {
      s.update(ctx, null, false, frame, ghost);
      const down = G.input && ctx.mode !== 'menu' && G.input.pressed(s.spec.action) && !G.ui.wantsCursor();
      if (down) {
        s.setFlash('press');
        if (s.spec.potion === 'cleanse') G.combat?.usePotion('cleanse');
      }
    }
  }

  /** Bar width helper (kept for callers that size against the bar). */
  get width(): number {
    return this.el.offsetWidth;
  }
}
