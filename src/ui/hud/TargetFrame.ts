import { G } from '../../game/G';
import { localHardTargetId } from '../../game/PlayerController';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { ClassId, EntityId } from '../../types/common';
import type { UI } from '../UI';
import { div, setClass, setDisplay, setStyle, setText } from '../widgets/dom';
import { CastBarEl } from '../widgets/CastBar';
import { StatusRow } from '../widgets/StatusRow';
import { isSkullLevel, levelColor } from '../widgets/levelColor';
import { Bar, classColor } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-target.css';

/** Relative-level colour (§2.8); kept under its old name for existing callers. */
export const levelCon = levelColor;

export function enemyRank(a: Actor): string {
  return ((a as Enemy).def?.rank as string | undefined) ?? 'trash';
}

/** Şampiyon pack leader (flag set by ai/champion.ts). */
export const isChampion = (a: Actor): boolean => a.kind !== 'player' && !!(a as Enemy).champion;
/** Named rare (enemy ids rare_*, WoW rare-elite): silver dragon marker. */
export const isRareEnemy = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('rare_');
/** Boss mechanic entity (bone cage, ice tomb, phylactery...). */
export const isMechanic = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('proc_');

/** Name colour used by the nameplates (the target frame's own name is white, §2.8). */
export function nameColor(a: Actor): string {
  if (a.kind === 'player') return '#7fe08a';
  if (isMechanic(a)) return '#9fd8ff';
  if (isChampion(a)) return '#58b0ff';
  if (isRareEnemy(a)) return '#d6e2f0';
  switch (enemyRank(a)) {
    case 'boss': return '#ff6a52';
    case 'miniboss': return '#ffa040';
    case 'elite': return '#ffd36a';
    default: return '#f1e6cf';
  }
}

/** Threat dot colours (§2.8): grey = no target, yellow = another player, red = on the local player. */
const THREAT_NONE = '#8a8a92';
const THREAT_OTHER = '#ffe040';
const THREAT_ME = '#ff3030';

/** Classification text shown after the name (docs/UI_WOW_CLASSIC.md §3). */
const RANK_TEXT: Record<string, string> = { elite: 'Elit', miniboss: 'Nadir', boss: 'Boss' };

/**
 * Target frame (UI_REDESIGN §2.8, retail ElvUI): one flat health bar in the reaction colour (class colour for players)
 * with `{level} {name} {classification}` left and the `{pct}%` right, the target cast bar attached under it, own debuffs
 * and other auras above it, and the target-of-target as a small bar beside it. Soft target dims the frame.
 */
export class TargetFrame implements HudWidget {
  readonly el: HTMLElement;
  private hp: Bar;
  private lvlEl: HTMLElement;
  private nameEl: HTMLElement;
  private clsEl: HTMLElement;
  private pctEl: HTMLElement;
  private threatDot: HTMLElement;
  /** Target-of-target: a small bar beside the frame (name inside, class / reaction colour). */
  private tot: HTMLElement;
  private totBar: Bar;
  private totEl: HTMLElement;
  /** Entity shown in the target-of-target slot (clicking it selects it, event target:select), or null. */
  private totId: EntityId | null = null;
  /** Poise (Duruş) stripe under the strip; gold + the SENDELEDİ tag while the enemy is broken. */
  private poise: HTMLElement;
  private poiseFill: HTMLElement;
  private cast: CastBarEl;
  /** Aura rows (CW-16 / §2.8): own debuffs first and larger; the others row holds other debuffs and enemy buffs, dimmed. */
  private ownRow: StatusRow;
  private othersRow: StatusRow;
  private curId: EntityId | null = null;
  private curChamp = false;
  /** Set by the HUD: the boss frame is visible for this entity (hide the duplicate target frame). */
  bossEntityId: EntityId | null = null;
  bossFrameVisible = false;

  constructor(ui: UI) {
    this.el = div('tf uf-target');
    // auras sit above the frame in their own host, so the frame does not move when a debuff appears
    const auraHost = div('uf-aurahost', this.el);
    this.ownRow = new StatusRow(ui, 'debuff', 8, 'uf-auras-own', true, true, 'own');
    this.othersRow = new StatusRow(ui, 'all', 8, 'uf-auras-oth', true, true, 'others');
    auraHost.appendChild(this.othersRow.el);
    auraHost.appendChild(this.ownRow.el);
    const main = div('uf-main', this.el);
    this.hp = new Bar('uf-hp tf-hp', main);
    const left = div('uf-lname', this.hp.label);
    this.lvlEl = div('uf-lvl', left);
    this.nameEl = div('uf-tname', left);
    this.clsEl = div('uf-cls', left);
    const right = div('uf-rt', this.hp.label);
    this.threatDot = div('uf-tdot', right);
    this.pctEl = div('uf-pct', right);
    setDisplay(this.threatDot, false);
    // poise stripe: the bottom edge of the health bar (gold + the SENDELEDİ tag while the enemy is broken)
    this.poise = div('tf-poise', main);
    this.poiseFill = div('tf-poise-fill', this.poise);
    setDisplay(this.poise, false);
    div('tf-stag', this.el, 'SENDELEDİ!');
    // target cast bar: attached under the frame, same width (hud-elvui.css)
    const castWrap = div('uf-cast', this.el);
    this.cast = new CastBarEl('tf-cast');
    castWrap.appendChild(this.cast.el);
    // target of target: small bar beside the frame
    this.tot = div('uf-totf', this.el);
    this.totBar = new Bar('uf-hp uf-totbar', this.tot);
    this.totEl = div('uf-tot', this.totBar.label);
    this.tot.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.totId === null) return;
      e.preventDefault();
      // PlayerController subscribes and selects the unit (the HUD never changes the selection itself)
      G.events.emit('target:select', { entityId: this.totId });
    });
    setDisplay(this.tot, false);
    setDisplay(this.el, false);
    G.events.on('scene:leaving', () => {
      this.curId = null;
    });
  }

  update(ctx: HudCtx): void {
    const w = ctx.world;
    let a: Actor | undefined;
    let soft = false;
    // the Tab-locked target (PlayerController); without one, the crosshair soft target (player.targetId) shows soft
    const hard = localHardTargetId();
    const hid = hard ?? ctx.player?.targetId ?? null;
    if (w && hid != null) {
      const t = w.getActor(hid);
      if (t && !t.isDead && t !== ctx.player) a = t;
    }
    if (a && hard == null) soft = true;
    if (!a && ctx.hover && !ctx.hover.isDead) {
      a = ctx.hover;
      soft = true;
    }
    if (a && this.bossFrameVisible && a.id === this.bossEntityId) a = undefined;
    if (!a) {
      this.curId = null;
      setDisplay(this.el, false);
      this.clearRows();
      return;
    }
    setDisplay(this.el, true);
    setClass(this.el, 'soft', soft);
    setClass(this.el, 'hard', !soft);
    const isPlayer = a.kind === 'player';
    const rank = isPlayer ? 'player' : enemyRank(a);
    const champ = isChampion(a);
    const rare = isRareEnemy(a);
    if (this.curId !== a.id || this.curChamp !== champ) {
      this.curId = a.id;
      this.curChamp = champ;
      this.clearRows();
      this.el.dataset.rank = champ ? 'elite' : rank;
      this.hp.el.dataset.kind = isPlayer ? 'class' : 'hostile';
      if (isPlayer) setStyle(this.hp.el, '--cls', classColor((a as unknown as { classId?: ClassId }).classId));
      setText(this.clsEl, champ ? 'Şampiyon' : rare ? 'Nadir Elit' : RANK_TEXT[rank] ?? '');
    }
    setText(this.nameEl, a.name);
    const pl = ctx.player?.level ?? 1;
    const skull = !isPlayer && isSkullLevel(pl, a.level);
    setText(this.lvlEl, skull ? '☠ ' + a.level : String(a.level));
    setStyle(this.lvlEl, 'color', isPlayer ? '#ffffff' : levelColor(pl, a.level));
    const frac = a.maxHp > 0 ? Math.max(0, Math.min(1, a.hp / a.maxHp)) : 0;
    const pc = frac > 0 ? Math.max(1, Math.ceil(frac * 100)) : 0;
    this.hp.set(frac, ctx.dt);
    setText(this.pctEl, `${pc}%`);
    this.updatePoise(a);
    this.updateTot(a, ctx);
    const cv = ctx.casts.get(a, ctx.now, ctx.world?.time ?? 0);
    if (cv) this.cast.set(cv.name, cv.frac, cv.remaining, cv);
    else this.cast.hide();
    this.ownRow.update(a);
    this.othersRow.update(a);
  }

  /**
   * Target-of-target (§2.8): a small bar beside the frame with the name inside, the threat dot in the health row. Hidden when the target has
   * no target. The threat dot is grey (none), yellow (another player) or red (the local player): the enemy threat table
   * is private to the AI, so the HUD cannot show the graded orange step yet.
   */
  private updateTot(a: Actor, ctx: HudCtx): void {
    const id = a.kind === 'player' ? null : a.targetId;
    const v = id != null && ctx.world ? ctx.world.getActor(id) : undefined;
    if (!v || v.isDead || v.removed) {
      this.totId = null;
      setDisplay(this.tot, false);
      setDisplay(this.threatDot, false);
      return;
    }
    const onMe = v === ctx.player;
    const isPl = v.kind === 'player';
    // only units that can be selected (not the local player, not other players) are clickable
    this.totId = !onMe && !isPl ? v.id : null;
    this.tot.classList.toggle('ui-capture', this.totId !== null);
    this.tot.classList.toggle('tot-click', this.totId !== null);
    setText(this.totEl, v.name);
    this.totBar.el.dataset.kind = isPl ? 'class' : 'hostile';
    if (isPl) setStyle(this.totBar.el, '--cls', classColor((v as unknown as { classId?: ClassId }).classId));
    this.totBar.set(v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 0, ctx.dt);
    setStyle(this.threatDot, 'background', onMe ? THREAT_ME : isPl ? THREAT_OTHER : THREAT_NONE);
    setDisplay(this.tot, true);
    setDisplay(this.threatDot, true);
  }

  private clearRows(): void {
    this.ownRow.clear();
    this.othersRow.clear();
  }

  /** Poise stripe: visible while poise builds, full and gold (+ tag) while the enemy is broken. */
  private updatePoise(a: Actor): void {
    const combat = G.combat;
    const enemy = a.kind !== 'player' && !!combat;
    const broken = enemy && combat.isStaggerBroken(a);
    const f = enemy && !broken ? combat.staggerFrac(a) : 0;
    const show = broken || f > 0.001;
    setDisplay(this.poise, show);
    setClass(this.el, 'stag', broken);
    if (!show) return;
    setStyle(this.poiseFill, 'width', broken ? '100%' : (Math.min(1, f) * 100).toFixed(1) + '%');
  }

  reset(): void {
    this.clearRows();
    this.curId = null;
  }
}
