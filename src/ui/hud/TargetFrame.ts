import { G } from '../../game/G';
import { localHardTargetId } from '../../game/PlayerController';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { ClassId, EntityId } from '../../types/common';
import type { UI } from '../UI';
import { ICON, div, fmtCompact, iconEl, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { CastBarEl } from '../widgets/CastBar';
import { StatusRow } from '../widgets/StatusRow';
import { Bar, classColor, classNameTr } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-target.css';

const RANK_TR: Record<string, string> = { trash: '', elite: 'Seçkin', miniboss: 'Ara Patron', boss: 'Patron' };

/** WoW-style level difficulty colour. */
export function levelCon(playerLevel: number, level: number): string {
  const d = level - playerLevel;
  if (d >= 5) return '#ff3030';
  if (d >= 3) return '#ff8030';
  if (d >= -2) return '#ffe040';
  if (d >= -6) return '#6fdc50';
  return '#9a9a9a';
}

export function enemyRank(a: Actor): string {
  return ((a as Enemy).def?.rank as string | undefined) ?? 'trash';
}

/** Şampiyon pack leader (flag set by ai/champion.ts). */
export const isChampion = (a: Actor): boolean => a.kind !== 'player' && !!(a as Enemy).champion;
/** Boss mechanic entity (bone cage, ice tomb, phylactery...). */
export const isMechanic = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('proc_');

export function nameColor(a: Actor): string {
  if (a.kind === 'player') return '#7fe08a';
  if (isMechanic(a)) return '#9fd8ff';
  if (isChampion(a)) return '#58b0ff';
  switch (enemyRank(a)) {
    case 'boss': return '#ff6a52';
    case 'miniboss': return '#ffa040';
    case 'elite': return '#ffd36a';
    default: return '#f1e6cf';
  }
}

/** Top-centre target frame: soft (hover) or hard target with HP, level, rank, cast bar and debuffs. */
export class TargetFrame implements HudWidget {
  readonly el: HTMLElement;
  private portrait: HTMLElement;
  private pico: HTMLElement;
  private nameEl: HTMLElement;
  private lvlEl: HTMLElement;
  private rankEl: HTMLElement;
  private hp: Bar;
  /** Poise (Duruş) stripe under the HP bar; gold + the SENDELEDİ tag while the enemy is broken. */
  private poise: HTMLElement;
  private poiseFill: HTMLElement;
  private cast: CastBarEl;
  /** Aura rows (CW-16): own debuffs first and larger, other debuffs dim; enemy buffs in their own row. */
  private debuffs: StatusRow;
  private buffs: StatusRow;
  /** Target-of-target label (CW-16 §2.14): whom this enemy is attacking. */
  private totEl: HTMLElement;
  private curId: EntityId | null = null;
  private curChamp = false;
  /** Set by the HUD: the boss frame is visible for this entity (hide the duplicate target frame). */
  bossEntityId: EntityId | null = null;
  bossFrameVisible = false;

  constructor(ui: UI) {
    this.el = div('tf');
    this.portrait = div('tf-portrait', this.el);
    this.pico = iconEl(null, 'tf-pico', this.portrait);
    const body = div('tf-body', this.el);
    const top = div('tf-top', body);
    this.nameEl = div('tf-name', top);
    this.rankEl = div('tf-rank', top);
    div('tf-stag', top, 'SENDELEDİ!');
    this.lvlEl = div('tf-lvl', top);
    this.hp = new Bar('hp tf-hp', body);
    this.poise = div('tf-poise', body);
    this.poiseFill = div('tf-poise-fill', this.poise);
    setDisplay(this.poise, false);
    this.totEl = div('tf-tot', body);
    setDisplay(this.totEl, false);
    this.cast = new CastBarEl('tf-cast');
    body.appendChild(this.cast.el);
    this.debuffs = new StatusRow(ui, 'debuff', 8, 'tf-debuffs', true, true);
    this.buffs = new StatusRow(ui, 'buff', 6, 'tf-buffs', true, true);
    body.appendChild(this.debuffs.el);
    body.appendChild(this.buffs.el);
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
    const isPlayer = a.kind === 'player';
    const rank = isPlayer ? 'player' : enemyRank(a);
    const champ = isChampion(a);
    if (this.curId !== a.id || this.curChamp !== champ) {
      this.curId = a.id;
      this.curChamp = champ;
      this.clearRows();
      this.el.dataset.rank = rank;
      const col = nameColor(a);
      this.el.style.setProperty('--nc', col);
      if (isPlayer) {
        const cid = (a as unknown as { classId?: ClassId }).classId;
        setIconUrl(this.pico, ICON('class-' + (cid ?? 'knight')));
        this.el.style.setProperty('--cc', classColor(cid));
      } else {
        setIconUrl(this.pico, ICON(rank === 'boss' ? 'ui-boss' : rank === 'elite' || rank === 'miniboss' || champ ? 'ui-elite' : 'ui-enemy-forces'));
      }
      setText(this.rankEl, isPlayer ? classNameTr((a as unknown as { classId?: ClassId }).classId) : champ ? 'Şampiyon' : isMechanic(a) ? 'Mekanik' : RANK_TR[rank] ?? '');
    }
    setText(this.nameEl, a.name);
    const pl = ctx.player?.level ?? 1;
    const skull = !isPlayer && a.level - pl >= 10;
    setText(this.lvlEl, skull ? '☠' : String(a.level));
    setStyle(this.lvlEl, 'color', isPlayer ? '#e8c46a' : levelCon(pl, a.level));
    const frac = a.maxHp > 0 ? a.hp / a.maxHp : 0;
    this.hp.set(frac, ctx.dt, `${fmtCompact(Math.max(0, a.hp))} / ${fmtCompact(a.maxHp)}  ·  ${Math.round(frac * 100)}%`);
    this.updatePoise(a);
    this.updateTot(a, ctx);
    const cv = ctx.casts.get(a, ctx.now, ctx.world?.time ?? 0);
    if (cv) this.cast.set(cv.name, cv.frac, cv.remaining, cv);
    else this.cast.hide();
    this.debuffs.update(a);
    this.buffs.update(a);
  }

  /** Target-of-target (CW-16 §2.14): 'Sana saldırıyor' in threat red when the enemy is on the local player, else its victim's name. */
  private updateTot(a: Actor, ctx: HudCtx): void {
    const id = a.kind === 'player' ? null : a.targetId;
    const v = id != null && ctx.world ? ctx.world.getActor(id) : undefined;
    if (!v || v.isDead || v.removed) {
      setDisplay(this.totEl, false);
      return;
    }
    const onMe = v === ctx.player;
    setText(this.totEl, onMe ? 'Sana saldırıyor' : '→ ' + v.name);
    setClass(this.totEl, 'threat', onMe);
    setDisplay(this.totEl, true);
  }

  private clearRows(): void {
    this.debuffs.clear();
    this.buffs.clear();
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

