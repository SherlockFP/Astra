import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import { getMaterial } from '../../data/materials';
import type { InputAction } from '../../core/Input';
import type { SkillDef, SkillSlotKey } from '../../types/skills';
import type { AutoInfo } from '../../combat/SkillSystem';
import type { Actor } from '../../entities/Actor';
import { lockoutSchool } from '../../combat/castRules';
import { glowSkillsOf, type GlowState } from '../../data/procs';
import { DAMAGE_COLORS, ICON, div, fmtCd, fmtNum, pulse, setClass, setDisplay, setIconUrl, setStyle, setText, iconEl, esc } from '../widgets/dom';
import { skillTooltipHTML } from '../widgets/tooltips';
import { TalentBadge } from './Extras';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-wow.css';

/**
 * CONTROLS_WOW §8 / Q5: the event PlayerController emits on every change of the auto-attack armed flag.
 * Typed here as a string so this file compiles whether or not core/events.ts already declares it.
 */
const AUTO_STATE_EVENT = 'autoattack:state';
interface AutoStatePayload { armed: boolean; targetId: number | null }

interface SlotSpec {
  id: string;
  action: InputAction;
  size: 'lg' | 'md' | 'sm';
  skill?: SkillSlotKey;
  potion?: 'hp' | 'mp';
}

const SPECS: SlotSpec[] = [
  { id: 'lmb', action: 'skill_lmb', size: 'lg', skill: 'lmb' },
  { id: 'rmb', action: 'skill_rmb', size: 'lg', skill: 'rmb' },
  { id: 'q', action: 'skill_q', size: 'md', skill: 'q' },
  { id: 'e', action: 'skill_e', size: 'md', skill: 'e' },
  { id: 'r', action: 'skill_r', size: 'md', skill: 'r' },
  { id: 's1', action: 'skill_s1', size: 'md', skill: 's1' },
  { id: 's2', action: 'skill_s2', size: 'md', skill: 's2' },
  { id: 's3', action: 'skill_s3', size: 'md', skill: 's3' },
  { id: 's4', action: 'skill_s4', size: 'md', skill: 's4' },
  // majors (GDD_V2 §2, UI_REDESIGN §2.6.2): after a small gap following s4, before the potion group
  { id: 'm45', action: 'skill_m45', size: 'md', skill: 'm45' },
  { id: 'm90', action: 'skill_m90', size: 'md', skill: 'm90' },
  { id: 'm180', action: 'skill_m180', size: 'md', skill: 'm180' },
  { id: 'potHp', action: 'potionHp', size: 'sm', potion: 'hp' },
  { id: 'potMp', action: 'potionMp', size: 'sm', potion: 'mp' },
];

const FAIL_TEXT: Record<string, string> = {
  cooldown: 'Henüz hazır değil',
  resource: 'Yeterli kaynak yok',
  range: 'Hedef menzil dışında',
  target: 'Geçerli bir hedef yok',
  stunned: 'Sersemlemiş durumdasın',
  casting: 'Zaten bir yetenek kullanıyorsun',
  silenced: 'Susturuldun',
  lockout: 'Okul kilitli',
};

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
const MAJOR_SLOTS = new Set<string>(['m45', 'm90', 'm180']);
/** A queued press is dropped after this long if no `skill:queued null` arrives (ms). */
const QUEUE_TTL_MS = 2000;

/** Per-frame values shared by every slot (computed once in ActionBar.update). */
interface BarFrame {
  /** Glow ids from glowSkillsOf (skill ids and `@lmb` / `@tag` tokens). */
  glow: Set<string>;
  /** Setting Settings.abilityGlow. */
  glowOn: boolean;
  /** Target for the out-of-range check: the hover (soft) target, or null. */
  target: Actor | null;
  /** Local school lock (school + seconds left), or null. */
  locked: { school: string; remaining: number } | null;
  /** Spell queue: the queued skill id / slot, or null. */
  queued: { skillId: string | null; slot: string | null } | null;
}

class Slot {
  readonly el: HTMLElement;
  private ico: HTMLElement;
  private tint: HTMLElement;
  private cd: HTMLElement;
  private gcd: HTMLElement;
  private swing: HTMLElement;
  private cdText: HTMLElement;
  private keyEl: HTMLElement;
  private charges: HTMLElement;
  private flash: HTMLElement;
  private school: HTMLElement;
  private skillId: string | null = null;
  private def: SkillDef | null = null;
  private prevCd = 0;
  private potionCount = 0;
  private potionId: string | null = null;
  private hover = false;
  private glowing = false;
  /** WoW auto-attack cell (lmb with skill_lmb unbound): the last frame's chain info, for the tooltip. */
  private autoInfo: AutoInfo | null = null;
  failUntil = 0;

  constructor(readonly spec: SlotSpec, ui: { showTooltip(html: string, x: number, y: number): void; hideTooltip(): void }) {
    this.el = div('slot sz-' + spec.size + (spec.potion ? ' potion ' + spec.potion : ''));
    this.el.dataset.slot = spec.id;
    div('slot-bg', this.el);
    this.ico = iconEl(null, 'slot-ico', this.el);
    this.tint = div('slot-tint', this.el);
    this.cd = div('slot-cd', this.el);
    this.gcd = div('slot-gcd', this.el);
    this.swing = div('slot-swing', this.el);
    this.flash = div('slot-flash', this.el);
    div('slot-frame', this.el);
    // marching ants for `.glow` (and the soft `.spend` cue); the CSS draws them, the class toggles them
    div('slot-ants', this.el);
    this.cdText = div('slot-cdtext', this.el);
    this.school = div('slot-school', this.el);
    this.keyEl = div('slot-key', this.el);
    this.charges = div('slot-charges', this.el);
    this.el.classList.add('hud-interactive');
    this.el.addEventListener('mouseenter', (e) => {
      this.hover = true;
      this.showTip(e.clientX, e.clientY, ui);
    });
    this.el.addEventListener('mousemove', (e) => this.hover && this.showTip(e.clientX, e.clientY, ui));
    this.el.addEventListener('mouseleave', () => {
      this.hover = false;
      ui.hideTooltip();
    });
  }

  private showTip(x: number, y: number, ui: { showTooltip(html: string, x: number, y: number): void }): void {
    const bind = G.input?.bindingLabel(this.spec.action);
    if (this.autoInfo) {
      const a = this.autoInfo;
      const autoKey = G.input?.bindingLabel('autoAttack') ?? '-';
      const toggle = autoKey === '-' ? 'Sağ tık (düşman)' : `Sağ tık (düşman) / ${esc(autoKey)}`;
      const step = `Adım ${a.step + 1}/${a.steps}${a.finisherNext ? ' · Bitiriş' : ''}`;
      ui.showTooltip(`<div class="sk"><div class="sk-head"><div><div class="sk-name">Otomatik Saldırı</div><div class="sk-tags">${esc(step)}</div></div></div><div class="sk-desc">${toggle} ile aç-kapat</div></div>`, x, y);
      return;
    }
    if (this.spec.potion) {
      const m = this.potionId ? getMaterial(this.potionId) : undefined;
      const name = m?.name ?? (this.spec.potion === 'hp' ? 'Can İksiri' : 'Ruh İksiri');
      const desc = m?.desc ?? (this.spec.potion === 'hp' ? 'Canının bir kısmını yeniler. Ortak bekleme süresi vardır.' : 'Kaynağının bir kısmını yeniler.');
      ui.showTooltip(`<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(name)}</div><div class="sk-tags">İksir · Elindeki: ${fmtNum(this.potionCount)}</div></div></div><div class="sk-desc">${esc(desc)}</div><div class="sk-key">Tuş: <b>${esc(bind ?? '')}</b></div></div>`, x, y);
      return;
    }
    if (!this.def) {
      ui.showTooltip(`<div class="sk"><div class="sk-name">Boş Yuva</div><div class="sk-desc">Yetenek Kitabı'ndan (${esc(G.input?.bindingLabel('skills') ?? 'K')}) bir yetenek sürükle.</div></div>`, x, y);
      return;
    }
    ui.showTooltip(skillTooltipHTML(this.def, G.player, bind), x, y);
  }

  /** The skill id this slot resolves to this frame (bound skill, or the class basic attack on an unbound lmb). */
  resolveSkill(ctx: HudCtx): string | null {
    const key = this.spec.skill;
    if (!key) return null;
    const c = ctx.character;
    let id: string | undefined = c?.save.skillBar[key];
    if (!id && key === 'lmb') {
      const cls = c?.classId ?? ctx.player?.classId;
      id = cls ? CLASSES[cls]?.basicAttack : undefined;
    }
    return id ?? null;
  }

  /** Highest HP/resource potion tier the character owns (tier 5..1), else tier 1 (count 0). */
  private resolvePotion(ctx: HudCtx): { id: string; count: number } {
    const base = this.spec.potion === 'hp' ? 'pot_hp_' : 'pot_res_';
    const c = ctx.character;
    for (let t = 5; t >= 1; t--) {
      const n = c ? c.material(base + t) : 0;
      if (n > 0) return { id: base + t, count: n };
    }
    return { id: base + 1, count: 0 };
  }

  setFlash(kind: 'press' | 'fail'): void {
    if (kind === 'press') {
      pulse(this.el, 'press');
      pulse(this.flash, 'go');
    } else {
      pulse(this.el, 'fail');
    }
  }

  /**
   * @param auto the auto-attack view when this is the WoW auto cell (lmb with skill_lmb unbound), else null.
   * @param armed the auto-attack armed flag from the `autoattack:state` event (only read when `auto` is set).
   */
  update(ctx: HudCtx, auto: AutoInfo | null, armed: boolean, frame: BarFrame): void {
    const p = ctx.player;
    this.autoInfo = auto;
    setText(this.keyEl, auto ? 'Oto' : G.input ? G.input.bindingLabel(this.spec.action) : '');
    setClass(this.el, 'auto', !!auto);
    setClass(this.el, 'armed', !!auto && armed);
    const swingOn = !!auto && auto.total > 0 && auto.elapsed < auto.total;
    if (auto && swingOn) setStyle(this.swing, '--e', String(Math.round((auto.elapsed / auto.total) * 100)));
    setDisplay(this.swing, swingOn);
    let rem = 0, total = 0, charges = 1, maxCharges = 1;
    let noRes = false;
    let casting = false;
    if (this.spec.potion) {
      const pot = this.resolvePotion(ctx);
      if (pot.id !== this.potionId) {
        this.potionId = pot.id;
        const m = getMaterial(pot.id);
        setIconUrl(this.ico, m?.icon ?? ICON(this.spec.potion === 'hp' ? 'item-potion-health' : 'item-potion-mana'));
      }
      this.potionCount = pot.count;
      const s = p?.statuses.get('potion_cd');
      if (s) {
        rem = s.remaining;
        total = s.duration;
      }
      setText(this.charges, pot.count > 0 ? String(pot.count) : '0');
      setClass(this.el, 'empty', pot.count <= 0);
      setClass(this.charges, 'zero', pot.count <= 0);
      setDisplay(this.charges, true);
    } else {
      const sid = this.resolveSkill(ctx);
      if (sid !== this.skillId) {
        this.skillId = sid;
        this.def = sid ? (G.skills.getDef(sid) ?? null) : null;
        setIconUrl(this.ico, this.def?.icon ?? null);
        const dtype = this.def?.damage?.type;
        const accent = dtype ? DAMAGE_COLORS[dtype] ?? '#e8c46a' : this.def?.tags.includes('buff') ? '#9be86a' : '#e8c46a';
        this.el.style.setProperty('--ac', accent);
      }
      // def may appear later (data loaded after first frame)
      if (sid && !this.def) {
        this.def = G.skills.getDef(sid) ?? null;
        if (this.def) setIconUrl(this.ico, this.def.icon);
      }
      // empty socket (no skill bound / def not loaded): checked every frame. It used to be set only when the bound skill changed,
      // so a slot that was empty from the start never got the class and its icon box showed as a bright beige square.
      setClass(this.el, 'noskill', !this.spec.potion && !this.def);
      if (this.def && p) {
        const cdi = G.skills.getCooldown(p, this.def.id);
        rem = cdi.remaining;
        total = cdi.total;
        charges = cdi.charges;
        maxCharges = cdi.maxCharges;
        noRes = this.def.cost > 0 && p.resource < this.def.cost;
        casting = !!p.cast && p.cast.skillId === this.def.id;
      }
      setText(this.charges, maxCharges > 1 ? String(charges) : '');
      setDisplay(this.charges, maxCharges > 1);
    }
    // own cooldown sweep
    const onCd = rem > 0.05 && total > 0;
    // charge skills only dim while NO charge is available
    const lockedByCd = onCd && (maxCharges <= 1 || charges <= 0);
    if (lockedByCd) {
      const elapsed = Math.round((1 - Math.min(1, rem / total)) * 100);
      setStyle(this.cd, '--e', String(elapsed));
      setDisplay(this.cd, true, 'block');
      setText(this.cdText, fmtCd(rem));
      setStyle(this.cdText, 'color', cdColor(rem));
      setDisplay(this.cdText, true, 'flex');
    } else {
      setDisplay(this.cd, false);
      setDisplay(this.cdText, false);
      if (onCd) {
        // recharging a charge: show small sweep only
        setStyle(this.cd, '--e', String(Math.round((1 - Math.min(1, rem / total)) * 100)));
        setDisplay(this.cd, true, 'block');
      }
    }
    if (this.prevCd > 0.05 && rem <= 0.05 && !this.spec.potion) {
      pulse(this.el, 'ready');
      const major = MAJOR_SLOTS.has(this.spec.id);
      if (this.def && (major || total >= READY_EVENT_CD)) G.events.emit('skill:ready', { skillId: this.def.id, major });
    }
    this.prevCd = rem;
    // global cooldown sweep (skills only, when the own cooldown is not longer)
    let gcdOn = false;
    if (!this.spec.potion && this.def && p) {
      const g = G.skills.getGcd(p);
      if (g.remaining > 0.02 && g.total > 0 && rem <= g.remaining + 0.02) {
        setStyle(this.gcd, '--e', String(Math.round((1 - Math.min(1, g.remaining / g.total)) * 100)));
        gcdOn = true;
      }
    }
    setDisplay(this.gcd, gcdOn, 'block');
    setClass(this.el, 'nores', noRes);
    setClass(this.el, 'casting', casting);
    setClass(this.el, 'oncd', lockedByCd);
    setClass(this.el, 'failing', ctx.now < this.failUntil);
    this.updateStates(ctx, frame, noRes);
  }

  /** CW-08 / UI §2.6.8 states: queued, out of range, school lock, proc glow, spender cap. One class each, painted by hud-wow.css. */
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
    // school lock: the local school lock matches this skill's school; the countdown replaces the number
    const school = isSkill && def ? lockoutSchool(def) : null;
    const lockRem = school !== null && frame.locked && frame.locked.school === school ? frame.locked.remaining : 0;
    const locked = lockRem > 0;
    setClass(this.el, 'locked', locked);
    setText(this.school, locked && school ? (SCHOOL_GLYPH[school] ?? school.toUpperCase()) : '');
    if (locked) {
      setText(this.cdText, String(Math.ceil(lockRem)));
      setStyle(this.cdText, 'color', '#ffffff');
      setDisplay(this.cdText, true, 'flex');
    }
  }
}

/** Cooldown number colour: under 5 s red, under 60 s yellow, otherwise white (COMBAT_WOW §2.12). */
function cdColor(sec: number): string {
  return sec < 5 ? '#ff6a5a' : sec < 60 ? '#ffe27a' : '#ffffff';
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

/** The 8 skill slots + 2 potion slots with cooldown sweeps, GCD, charges, resource tint and press flashes. */
export class ActionBar implements HudWidget {
  readonly el: HTMLElement;
  private slots: Slot[] = [];
  private lastFailFrame = -10;
  private hasFail = false;
  private lastFailReason = '';
  private lastFailRemaining: number | undefined;
  private errEl: HTMLElement;
  /** Spell queue (skill:queued): the queued skill / slot and when the entry expires (performance.now ms). */
  private queued: { skillId: string | null; slot: string | null; until: number } | null = null;
  /** Local school lock (skill:lockout): school and when it ends (performance.now ms). */
  private lockSchool: string | null = null;
  /** Auto-attack armed flag, kept current by the `autoattack:state` event (CONTROLS_WOW Q5). */
  private autoArmed = false;
  /** "N" unspent-points badge on the bar's top edge (GDD_TALENTS §5.9); absolute, so it takes no slot room. */
  private talentBadge: TalentBadge;

  /**
   * `hosts` (UX-01 contract, optional until UX-10): the grid and consumables hosts that the composition flip hands in.
   * Not used yet; the bar still builds its own groups.
   */
  constructor(ui: { showTooltip(html: string, x: number, y: number): void; hideTooltip(): void }, _hosts?: { grid: HTMLElement; cons: HTMLElement }) {
    this.el = div('actionbar');
    const skills = div('ab-group skills', this.el);
    const pots = div('ab-group potions', this.el);
    for (const spec of SPECS) {
      const s = new Slot(spec, ui);
      this.slots.push(s);
      (spec.potion ? pots : skills).appendChild(s.el);
      if (spec.id === 'rmb' || spec.id === 'r' || spec.id === 's4') div('ab-gap', skills);
    }
    this.errEl = div('ab-error');
    this.talentBadge = new TalentBadge(ui);
    this.el.appendChild(this.talentBadge.el);
    G.events.on('skill:fail', ({ reason, remaining }) => {
      this.lastFailFrame = G.engine.frame;
      this.hasFail = true;
      this.lastFailReason = reason;
      this.lastFailRemaining = remaining;
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

  /** Error text line mounted by the HUD above the bar. */
  get errorEl(): HTMLElement {
    return this.errEl;
  }

  private showError(text: string): void {
    this.errEl.textContent = text;
    pulse(this.errEl, 'show');
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
        if (s.spec.potion) continue;
        const id = s.resolveSkill(ctx);
        const def = id ? G.skills.getDef(id) : undefined;
        if (!id || !def || !def.tags.includes('spender')) continue;
        firstSpender ??= id;
        if (def.cost <= p.resource && (!best || def.cost > best.cost)) best = { id, cost: def.cost };
      }
      const target = ctx.hover && !ctx.hover.isDead ? ctx.hover : null;
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
      target: ctx.hover && !ctx.hover.isDead ? ctx.hover : null,
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
    const frame = this.buildFrame(ctx, this.slots);
    for (const s of this.slots) {
      s.update(ctx, s.spec.id === 'lmb' ? auto : null, this.autoArmed, frame);
      const down = G.input && ctx.mode !== 'menu' && G.input.pressed(s.spec.action);
      const swallowed = relock && (s.spec.action === 'skill_lmb' || s.spec.action === 'skill_rmb');
      if (down && !swallowed && !G.ui.wantsCursor()) {
        s.setFlash('press');
        // a failure reported during this frame belongs to the pressed slot
        if (this.hasFail && G.engine.frame - this.lastFailFrame <= 1) {
          s.setFlash('fail');
          s.failUntil = ctx.now + 260;
          const base = FAIL_TEXT[this.lastFailReason] ?? 'Şu an kullanılamaz';
          // lockout carries the time left on the school lock
          const lockLeft = this.lastFailRemaining ?? ctx.player?.statuses.get('lockout')?.remaining;
          const left = this.lastFailReason === 'lockout' && lockLeft !== undefined ? ` (${Math.ceil(lockLeft)} sn)` : '';
          this.showError(base + left);
          // (the 'ui_error' sound itself is played by the audio module on 'skill:fail')
          this.hasFail = false;
        }
      }
    }
  }

  /** Bar width helper for the XP bar below. */
  get width(): number {
    return this.el.offsetWidth;
  }
}

