import * as THREE from 'three';
import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { EntityId } from '../../types/common';
import { localHardTargetId } from '../../game/PlayerController';
import type { UI } from '../UI';
import { UNINTERRUPTIBLE_ICON, type CastTracker } from './CastBar';
import { ICON, clamp01, clampN, div, iconEl, pulse, setClass, setDisplay, setStyle, setText } from './dom';
import { statusView } from './status';
import { StatusRow } from './StatusRow';

const _v = new THREE.Vector3();
const _p = { x: 0, y: 0 };
const MAX_PLATES = 40;

/** Plates keep this many px inside the viewport (clamped instead of clipped at the edge). */
const EDGE = 8;
/** Declutter: a plate may be lifted this many steps (one plate height + gap each) to clear the plates in front of it. */
const MAX_NUDGE_STEPS = 2;
/** Gap between stacked plates (px). */
const STEP_GAP = 4;
/** Padding added around each box for the overlap test (px). */
const PAD = 2;
/** Re-measure a plate's box this often (ms), in case its text changed without a redraw. */
const MEASURE_EVERY = 500;
/** A plate whose actor was hit / engaged this recently (s) is "hot": it is never hidden by the declutter. */
const HOT_SECONDS = 3;
/** Anchors this far (px) outside the window are off screen: no plate (they are not pinned to the edge). */
const OFFSCREEN = 60;

const RANK_NAME_COLOR: Record<string, string> = { trash: '#f1e6cf', elite: '#ffd36a', miniboss: '#ffa040', boss: '#ff6a52' };
/** Şampiyon (champion pack leader) plates are blue (WoW rare-elite style); boss mechanic entities use a cold steel tint. */
const CHAMPION_COLOR = '#58b0ff';
const MECH_COLOR = '#9fd8ff';
/** proc_* mechanic entities that can be smashed (HP bar shown); proc_soul_orb / proc_rift are projectiles / hazards without a plate. */
const MECH_WITH_HP = new Set(['proc_phylactery', 'proc_bone_cage', 'proc_ice_tomb', 'proc_ice_pillar']);

const isMechanic = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('proc_');
const isChampion = (a: Actor): boolean => a.kind !== 'player' && !!(a as Enemy).champion;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

class Plate {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private lvlEl: HTMLElement;
  private rankIco: HTMLElement;
  private barEl: HTMLElement;
  private fill: HTMLElement;
  private ghost: HTMLElement;
  /** Poise (Duruş) bar under the HP bar: shown while the enemy builds poise and gold + "SENDELEDİ!" while broken. */
  private poiseEl: HTMLElement;
  private poiseFill: HTMLElement;
  private poiseTag: HTMLElement;
  private castWrap: HTMLElement;
  private castFill: HTMLElement;
  private castName: HTMLElement;
  private castShield: HTMLElement;
  private dispelEl: HTMLElement;
  private status: StatusRow;
  private lastFrac = -1;
  private rank = '';
  private flavor = '-';
  seen = 0;
  shown = false;
  /** Box size in the plate's own (unscaled) CSS px; w = 0 means "measure again". */
  w = 0;
  h = 0;
  measuredAt = -1e9;

  constructor(ui: UI, parent: HTMLElement, readonly actor: Actor, private opts: { showName?: boolean; color?: string }) {
    this.el = div('np', parent);
    const top = div('np-top', this.el);
    this.lvlEl = div('np-lvl', top);
    this.nameEl = div('np-name', top);
    this.rankIco = iconEl(null, 'np-rank', top);
    const bar = div('np-bar', this.el);
    this.barEl = bar;
    this.ghost = div('np-ghost', bar);
    this.fill = div('np-fill', bar);
    div('np-gloss', bar);
    this.poiseEl = div('np-poise', this.el);
    this.poiseFill = div('np-poise-fill', this.poiseEl);
    this.poiseTag = div('np-poise-tag', this.poiseEl, 'SENDELEDİ!');
    setDisplay(this.poiseEl, false);
    this.castWrap = div('np-cast', this.el);
    this.castFill = div('np-cast-fill', this.castWrap);
    this.castName = div('np-cast-name', this.castWrap);
    // P-23 must-answer: grey bar + shield for uninterruptible casts (gold otherwise)
    this.castShield = iconEl(UNINTERRUPTIBLE_ICON, 'np-cast-shield', this.castWrap);
    this.castShield.style.cssText = 'position:absolute;right:3px;top:50%;width:10px;height:10px;margin-top:-5px;color:#f0f0f8;filter:drop-shadow(0 1px 0 #000);';
    setDisplay(this.castShield, false);
    // P-23 dispel mark: green chip under the cast bar while the cast must be cleansed
    this.dispelEl = div('np-dispel', this.el);
    this.dispelEl.style.cssText = 'align-self:flex-start;margin-top:2px;padding:0 4px;font:700 9px/13px var(--font-head, sans-serif);color:#d8ffc8;background:#1f6a2a;border:1px solid #7ee862;border-radius:2px;white-space:nowrap;box-shadow:0 0 4px rgba(126,232,98,0.6);';
    setDisplay(this.dispelEl, false);
    this.status = new StatusRow(ui, 'debuff', 4, 'np-st', false);
    this.el.appendChild(this.status.el);
    this.el.style.display = 'none';
    const isPlayer = actor.kind === 'player';
    const rank = isPlayer ? 'player' : ((actor as Enemy).def?.rank ?? 'trash');
    this.rank = rank;
    this.el.dataset.rank = rank;
    this.applyFlavor();
  }

  /** Colour + icon by kind: boss / elite ranks, blue champions (flag set after spawn, so re-checked every frame), mechanic entities. */
  private applyFlavor(): void {
    const a = this.actor;
    const isPlayer = a.kind === 'player';
    const flavor = isPlayer ? 'player' : isMechanic(a) ? 'mech' : isChampion(a) ? 'champ' : this.rank;
    if (flavor === this.flavor) return;
    this.flavor = flavor;
    const col = this.opts.color ?? (isPlayer ? '#7fe08a' : flavor === 'champ' ? CHAMPION_COLOR : flavor === 'mech' ? MECH_COLOR : RANK_NAME_COLOR[this.rank] ?? '#f1e6cf');
    this.el.style.setProperty('--nc', col);
    if (flavor === 'champ' || flavor === 'mech') this.el.dataset.flavor = flavor;
    else delete this.el.dataset.flavor;
    const showIco = !isPlayer && (flavor === 'champ' || this.rank === 'boss' || this.rank === 'elite' || this.rank === 'miniboss') && flavor !== 'mech';
    if (showIco) this.rankIco.style.setProperty('--i', `url("${ICON(this.rank === 'boss' ? 'ui-boss' : 'ui-elite')}")`);
    setDisplay(this.rankIco, showIco);
  }

  setShown(v: boolean): void {
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.display = v ? '' : 'none';
  }

  /** Content (name, level, HP, cast, debuffs). The position is set by place(), once the declutter has run. */
  update(ctx: { now: number; world: number; casts: CastTracker; isTarget: boolean; isSoft: boolean; playerLevel: number }): void {
    const a = this.actor;
    this.applyFlavor();
    setText(this.nameEl, a.name);
    setDisplay(this.nameEl, this.opts.showName !== false);
    setDisplay(this.lvlEl, this.flavor !== 'mech');
    setText(this.lvlEl, String(a.level));
    const diff = a.level - ctx.playerLevel;
    setStyle(this.lvlEl, 'color', a.kind === 'player' ? '#e8c46a' : diff >= 5 ? '#ff4a3a' : diff >= 3 ? '#ff9a3a' : diff >= -2 ? '#ffe050' : '#9ad86a');
    const frac = a.maxHp > 0 ? clamp01(a.hp / a.maxHp) : 0;
    if (frac !== this.lastFrac) {
      // white flash + bump on every visible HP loss (hit feedback right on the enemy)
      if (this.lastFrac >= 0 && frac < this.lastFrac - 0.003) pulse(this.barEl, 'hit');
      this.lastFrac = frac;
      const w = (frac * 100).toFixed(1) + '%';
      this.fill.style.width = w;
      this.ghost.style.width = w;
    }
    this.updatePoise(a);
    setClass(this.el, 'target', ctx.isTarget);
    setClass(this.el, 'soft', ctx.isSoft);
    const cv = ctx.casts.get(a, ctx.now, ctx.world);
    if (cv && !cv.interrupted) {
      setDisplay(this.castWrap, true);
      setStyle(this.castFill, 'width', (clamp01(cv.channel ? 1 - cv.frac : cv.frac) * 100).toFixed(1) + '%');
      setText(this.castName, cv.name);
      setClass(this.castWrap, 'locked', !cv.interruptible);
      setDisplay(this.castShield, !cv.interruptible, 'inline-block');
      setDisplay(this.dispelEl, !!cv.dispel, 'block');
      if (cv.dispel) setText(this.dispelEl, 'Temizle: ' + statusView(cv.dispel).name);
    } else if (cv && cv.interrupted) {
      setDisplay(this.castWrap, true);
      setStyle(this.castFill, 'width', '100%');
      setText(this.castName, 'Kesildi!');
      setClass(this.castWrap, 'interrupted', true);
      setDisplay(this.castShield, false);
      setDisplay(this.dispelEl, false);
    } else {
      setDisplay(this.castWrap, false);
      setClass(this.castWrap, 'interrupted', false);
      setDisplay(this.castShield, false);
      setDisplay(this.dispelEl, false);
    }
    this.status.update(a);
  }

  /** Poise bar of an enemy: visible while poise is building or the enemy is broken (then full, gold, with the tag). */
  private updatePoise(a: Actor): void {
    const combat = G.combat;
    const enemy = a.kind !== 'player' && !!combat;
    const broken = enemy && combat.isStaggerBroken(a);
    const frac = enemy && !broken ? combat.staggerFrac(a) : 0;
    const show = broken || frac > 0.001;
    setDisplay(this.poiseEl, show);
    if (!show) return;
    setClass(this.poiseEl, 'broken', broken);
    setStyle(this.poiseFill, 'width', broken ? '100%' : (clamp01(frac) * 100).toFixed(1) + '%');
    setDisplay(this.poiseTag, broken);
  }

  /** Box size of the plate (unscaled CSS px). Call after its content is up to date and the plate is shown. */
  measure(now: number): void {
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    this.measuredAt = now;
  }

  /** Anchor the plate at (x, y) (bottom centre, screen px), lifted `lift` px, scaled by `scale`. */
  place(x: number, y: number, scale: number, lift: number, z: number): void {
    setStyle(this.el, 'transform', `translate(${Math.round(x)}px, ${Math.round(y - lift)}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`);
    setStyle(this.el, 'zIndex', String(z));
  }

  dispose(): void {
    this.status.clear();
    this.el.remove();
  }

  get rankId(): string {
    return this.rank;
  }
}

/** One plate for this frame: its projected anchor, scale, the declutter result and whether it is drawn. */
interface Laid {
  plate: Plate;
  /** Distance to the player (m). */
  d: number;
  /** Scale of the plate. */
  k: number;
  /** Anchor (bottom centre, screen px), clamped into the window. */
  x: number;
  y: number;
  /** Target / hovered / recently hit: drawn on top and never hidden. */
  exempt: boolean;
  lift: number;
  show: boolean;
}

/**
 * Auto-managed nameplates: scans G.world.enemies and remote players every frame. Trash is hidden at full HP unless aggroed /
 * targeted / hovered; elites and bosses always show within range (boss hides while the boss frame shows it); enemy cast bars
 * appear under the plate; capped to the nearest plates for performance in hordes.
 * Screen layout: plates stay EDGE px inside the window (clamped, not clipped), and a declutter like the world labels: the
 * target and the hot plates (hit / engaged in the last few seconds) first, then nearest first; a plate that overlaps a placed
 * one is lifted in up to MAX_NUDGE_STEPS steps, and a plate that still does not fit is hidden unless it is hot.
 */
export class Nameplates {
  private plates = new Map<EntityId, Plate>();
  private manual = new Map<EntityId, { showName?: boolean; color?: string }>();
  private tick = 0;
  private readonly laid: Laid[] = [];
  private readonly placed: Box[] = [];
  /** Soft target ring (CW-16 §2.14): a flat ellipse at the hovered enemy's feet. */
  private readonly ring: HTMLElement;

  constructor(private ui: UI, private layer: HTMLElement) {
    this.ring = div('np-soft-ring', layer);
    setDisplay(this.ring, false);
  }

  addManual(actor: Actor, opts: { showName?: boolean; color?: string } = {}): { remove(): void } {
    this.manual.set(actor.id, opts);
    return {
      remove: () => {
        this.manual.delete(actor.id);
        const p = this.plates.get(actor.id);
        if (p) {
          p.dispose();
          this.plates.delete(actor.id);
        }
      },
    };
  }

  clear(): void {
    for (const p of this.plates.values()) p.dispose();
    this.plates.clear();
  }

  /** Soft target ring (CW-16 §2.14): drawn at the hovered enemy's feet, hidden for the Tab-locked target or off screen. */
  private placeRing(hover: Actor | null, hardId: EntityId | null): void {
    const ui = this.ui;
    if (!hover || hover.removed || hover.isDead || hover.id === hardId || !ui.projectWorld(hover.position.x, hover.position.y, hover.position.z, _p)) {
      setDisplay(this.ring, false);
      return;
    }
    if (_p.x < 0 || _p.x > ui.viewW || _p.y < 0 || _p.y > ui.viewH) {
      setDisplay(this.ring, false);
      return;
    }
    setStyle(this.ring, 'transform', `translate(${Math.round(_p.x)}px, ${Math.round(_p.y)}px) translate(-50%, -50%)`);
    setDisplay(this.ring, true);
  }

  update(now: number, casts: CastTracker, hover: Actor | null, bossEntity: EntityId | null): void {
    this.tick++;
    const ui = this.ui;
    const w = G.world;
    const me = G.player;
    if (!w || !me || !ui.camera || ui.mode === 'menu' || ui.mode === 'loading') {
      setDisplay(this.ring, false);
      if (this.plates.size) this.clear();
      return;
    }
    const wt = w.time;
    const hardTarget = me.targetId;
    // the Tab-locked target only: a hovered (soft) enemy is brighter and gets the ring
    const hardId = localHardTargetId();
    type Cand = { a: Actor; d: number; always: boolean; hot: boolean };
    const cands: Cand[] = [];
    const px = me.position.x, pz = me.position.z;
    const consider = (a: Actor, isPlayer: boolean) => {
      if (a.removed || a.isDead) return;
      const dx = a.position.x - px, dz = a.position.z - pz;
      const d = Math.hypot(dx, dz);
      const manual = this.manual.has(a.id);
      let show = false;
      if (manual) show = d < 80;
      else if (isPlayer) show = d < 45;
      else {
        const e = a as Enemy;
        const rank = e.def?.rank ?? 'trash';
        const isTarget = a.id === hardTarget || a === hover;
        if (isMechanic(a)) show = MECH_WITH_HP.has(e.def.id) && (d < 32 || isTarget);
        else if (rank === 'boss') show = d < 70 && a.id !== bossEntity;
        else if (rank === 'elite' || rank === 'miniboss' || e.champion) show = d < 34 || isTarget;
        else show = (d < 22 && (a.hp < a.maxHp || e.aggroed)) || (isTarget && d < 40);
      }
      if (show) cands.push({ a, d, always: manual || a.id === hardTarget, hot: a.id === hardTarget || a === hover || a.combatTimer < HOT_SECONDS });
    };
    for (const e of w.enemies) consider(e, false);
    for (const p of w.players) if (!p.isLocal) consider(p as Player, true);
    // placement order: the target and manual plates, then the hot ones (hit / engaged), then nearest first
    cands.sort((x, y) => {
      const rx = x.always ? 0 : x.hot ? 1 : 2;
      const ry = y.always ? 0 : y.hot ? 1 : 2;
      return rx !== ry ? rx - ry : x.d - y.d;
    });
    if (cands.length > MAX_PLATES) cands.length = MAX_PLATES;

    const vw = ui.viewW;
    const vh = ui.viewH;
    const laid = this.laid;
    laid.length = 0;

    // 1. project, create / update the content of each plate (writes only: the layout is read after all of them)
    for (const c of cands) {
      const a = c.a;
      a.pointAt(1, _v);
      _v.y += 0.35;
      if (!ui.projectWorld(_v.x, _v.y, _v.z, _p)) continue;
      if (_p.x < -OFFSCREEN || _p.x > vw + OFFSCREEN || _p.y < -OFFSCREEN || _p.y > vh + OFFSCREEN) continue;
      let plate = this.plates.get(a.id);
      if (!plate) {
        plate = new Plate(ui, this.layer, a, this.manual.get(a.id) ?? {});
        this.plates.set(a.id, plate);
      }
      plate.seen = this.tick;
      plate.setShown(true);
      plate.update({ now, world: wt, casts, isTarget: a.id === hardTarget || a === hover, isSoft: a === hover && a.id !== hardId, playerLevel: me.level });
      laid.push({
        plate, d: c.d, k: Math.max(0.68, Math.min(1.05, 1.18 - c.d / 55)),
        x: _p.x, y: _p.y, exempt: c.always || c.hot, lift: 0, show: true,
      });
    }

    // 2. measure the plates whose box is new or stale (one layout pass)
    for (const e of laid) if (e.plate.w === 0 || now - e.plate.measuredAt > MEASURE_EVERY) e.plate.measure(now);

    // 3. clamp into the window (EDGE px margin), then declutter in placement order
    for (const e of laid) {
      const hw = (e.plate.w * e.k) / 2;
      const ph = e.plate.h * e.k;
      e.x = clampN(e.x, EDGE + hw, vw - EDGE - hw);
      e.y = clampN(e.y, EDGE + ph, vh - EDGE);
    }
    const placed = this.placed;
    placed.length = 0;
    for (const e of laid) {
      const ph = e.plate.h * e.k;
      const step = ph + STEP_GAP;
      let fitted = false;
      let last = 0;
      for (let s = 0; s <= MAX_NUDGE_STEPS; s++) {
        const lift = s * step;
        // a lifted plate keeps its top inside the window
        if (s > 0 && e.y - lift - ph < EDGE) break;
        last = lift;
        const box = boxOf(e, lift);
        if (!placed.some((p) => overlaps(box, p))) {
          e.lift = lift;
          placed.push(box);
          fitted = true;
          break;
        }
      }
      if (fitted) continue;
      if (e.exempt) {
        // target / hot plates are always drawn, at the highest lift they reached
        e.lift = last;
        placed.push(boxOf(e, last));
      } else e.show = false;
    }

    // 4. write the positions (hidden plates keep their state and come back when there is room)
    for (const e of laid) {
      if (!e.show) {
        e.plate.setShown(false);
        continue;
      }
      e.plate.place(e.x, e.y, e.k, e.lift, Math.max(1, (e.exempt ? 700 : 500) - Math.round(e.d * 4)));
    }

    this.placeRing(hover, hardId);

    for (const [id, p] of this.plates) {
      if (p.seen !== this.tick) {
        if (p.actor.removed || p.actor.isDead || !w.entities.has(id)) {
          p.dispose();
          this.plates.delete(id);
        } else p.setShown(false);
      }
    }
  }
}

/** Screen box of a plate anchored at (e.x, e.y) (bottom centre), lifted `lift` px, scaled by its k. */
function boxOf(e: Laid, lift: number): Box {
  const hw = (e.plate.w * e.k) / 2 + PAD;
  const bottom = e.y - lift;
  return { x0: e.x - hw, x1: e.x + hw, y0: bottom - e.plate.h * e.k - PAD, y1: bottom + PAD };
}
