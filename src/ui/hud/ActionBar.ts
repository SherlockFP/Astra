import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import { getMaterial } from '../../data/materials';
import type { InputAction } from '../../core/Input';
import type { SkillDef, SkillSlotKey } from '../../types/skills';
import type { AutoInfo } from '../../combat/SkillSystem';
import { DAMAGE_COLORS, ICON, div, fmtCd, fmtNum, pulse, setClass, setDisplay, setIconUrl, setStyle, setText, iconEl, esc } from '../widgets/dom';
import { skillTooltipHTML } from '../widgets/tooltips';
import { TalentBadge } from './Extras';
import type { HudCtx, HudWidget } from './types';

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
};

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
  private skillId: string | null = null;
  private def: SkillDef | null = null;
  private prevCd = 0;
  private potionCount = 0;
  private potionId: string | null = null;
  private hover = false;
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
    this.cdText = div('slot-cdtext', this.el);
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

  private resolveSkill(ctx: HudCtx): string | null {
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
  update(ctx: HudCtx, auto: AutoInfo | null, armed: boolean): void {
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
      setDisplay(this.cd, true);
      setText(this.cdText, fmtCd(rem));
      setDisplay(this.cdText, true);
    } else {
      setDisplay(this.cd, false);
      setDisplay(this.cdText, false);
      if (onCd) {
        // recharging a charge: show small sweep only
        setStyle(this.cd, '--e', String(Math.round((1 - Math.min(1, rem / total)) * 100)));
        setDisplay(this.cd, true);
      }
    }
    if (this.prevCd > 0.05 && rem <= 0.05 && !this.spec.potion) pulse(this.el, 'ready');
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
    setDisplay(this.gcd, gcdOn);
    setClass(this.el, 'nores', noRes);
    setClass(this.el, 'casting', casting);
    setClass(this.el, 'oncd', lockedByCd);
    setClass(this.el, 'failing', ctx.now < this.failUntil);
  }
}

/** The 8 skill slots + 2 potion slots with cooldown sweeps, GCD, charges, resource tint and press flashes. */
export class ActionBar implements HudWidget {
  readonly el: HTMLElement;
  private slots: Slot[] = [];
  private lastFailFrame = -10;
  private hasFail = false;
  private lastFailReason = '';
  private errEl: HTMLElement;
  /** Auto-attack armed flag, kept current by the `autoattack:state` event (CONTROLS_WOW Q5). */
  private autoArmed = false;
  /** "N" unspent-points badge on the bar's top edge (GDD_TALENTS §5.9); absolute, so it takes no slot room. */
  private talentBadge: TalentBadge;

  constructor(ui: { showTooltip(html: string, x: number, y: number): void; hideTooltip(): void }) {
    this.el = div('actionbar');
    const skills = div('ab-group skills', this.el);
    const pots = div('ab-group potions', this.el);
    for (const spec of SPECS) {
      const s = new Slot(spec, ui);
      this.slots.push(s);
      (spec.potion ? pots : skills).appendChild(s.el);
      if (spec.id === 'rmb' || spec.id === 'r') div('ab-gap', skills);
    }
    this.errEl = div('ab-error');
    this.talentBadge = new TalentBadge(ui);
    this.el.appendChild(this.talentBadge.el);
    G.events.on('skill:fail', ({ reason }) => {
      this.lastFailFrame = G.engine.frame;
      this.hasFail = true;
      this.lastFailReason = reason;
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

  update(ctx: HudCtx): void {
    this.talentBadge.update(ctx);
    // action camera without a pointer lock: the first mouse click only re-acquires the lock (PlayerController swallows it), no slot flash
    const relock = !!G.input && !G.input.isLocked() && G.settings?.data.cameraMode === 'action';
    // WoW: lmb is the auto-attack cell while skill_lmb has no key (CONTROLS_WOW §9)
    const autoCell = !!G.input && !!G.settings && G.settings.data.controlScheme === 'wow' && G.input.bindings.skill_lmb.length === 0;
    const auto = autoCell && ctx.player ? G.skills.autoInfo(ctx.player) : null;
    for (const s of this.slots) {
      s.update(ctx, s.spec.id === 'lmb' ? auto : null, this.autoArmed);
      const down = G.input && ctx.mode !== 'menu' && G.input.pressed(s.spec.action);
      const swallowed = relock && (s.spec.action === 'skill_lmb' || s.spec.action === 'skill_rmb');
      if (down && !swallowed && !G.ui.wantsCursor()) {
        s.setFlash('press');
        // a failure reported during this frame belongs to the pressed slot
        if (this.hasFail && G.engine.frame - this.lastFailFrame <= 1) {
          s.setFlash('fail');
          s.failUntil = ctx.now + 260;
          this.showError(FAIL_TEXT[this.lastFailReason] ?? 'Şu an kullanılamaz');
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

