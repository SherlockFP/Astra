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
import { isSkullLevel, levelColor } from './levelColor';
import { fmtHealth } from './numFormat';
import { statusView } from './status';
import { StatusRow } from './StatusRow';
import { selectedTitleName } from '../../systems/Achievements';
import { nationColor, nationTag } from '../../data/nations';
import { arenaController } from '../../scenes/arena/ArenaController';

/** GDD_PVP_FINDER §5.5: arena team colours (red A, blue B); the letter is also written in the name, so colour is not the only cue. */
const ARENA_TEAM_COLOR: Record<'A' | 'B', string> = { A: '#ff5a4a', B: '#4aa3ff' };

/** Arena team of a player plate while an arena runs (null outside arenas or for non-players). Local player: the team list has the self id. */
function arenaTeamOf(a: Actor): 'A' | 'B' | null {
  if (a.kind !== 'player') return null;
  const ac = arenaController();
  if (!ac) return null;
  const peer = (a as Player).isLocal ? G.net?.selfId ?? '' : (a as Player).peerId;
  if (!peer) return null;
  const t = ac.params.teams;
  return t.A.includes(peer) ? 'A' : t.B.includes(peer) ? 'B' : null;
}

const _v = new THREE.Vector3();
const _p = { x: 0, y: 0 };
const MAX_PLATES = 40;

/** Plates keep this many px inside the viewport (clamped instead of clipped at the edge). */
const EDGE = 8;
/** Declutter: a plate may be lifted this many steps (one plate height + gap each) to clear the plates in front of it. */
const MAX_NUDGE_STEPS = 3;
/** HUD panels no plate is drawn under: the quest tracker, the objective tracker and the minimap (screen rects, re-read this often in ms). */
const HUD_SEL = '.qt, .trk, .mm';
const HUD_RECT_EVERY = 150;
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
/** Enemy plates show within this distance (m) in the "always" and "combat" modes. */
const ENEMY_RANGE = 40;
/** The current target's plate is this much bigger (side arrows drawn by CSS). */
const TARGET_SCALE = 1.2;
/** Distance (m) where the plate starts to fade out. */
const FADE_FROM = 28;

const RANK_NAME_COLOR: Record<string, string> = { trash: '#f1e6cf', elite: '#ffd36a', miniboss: '#ffa040', boss: '#ff6a52' };
/** Şampiyon (champion pack leader) plates are blue (WoW rare-elite style); boss mechanic entities use a cold steel tint. */
const CHAMPION_COLOR = '#58b0ff';
const MECH_COLOR = '#9fd8ff';
/** Named rares (rare_* enemies) are silver: the dragon marker and the name. */
const RARE_COLOR = '#d6e2f0';
/** proc_* mechanic entities that can be smashed (HP bar shown); proc_soul_orb / proc_rift are projectiles / hazards without a plate. */
const MECH_WITH_HP = new Set(['proc_phylactery', 'proc_bone_cage', 'proc_ice_tomb', 'proc_ice_pillar']);

const isMechanic = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('proc_');
const isChampion = (a: Actor): boolean => a.kind !== 'player' && !!(a as Enemy).champion;
const isRare = (a: Actor): boolean => a.kind !== 'player' && ((a as Enemy).def?.id ?? '').startsWith('rare_');

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
  /** Chosen achievement title under the name (local player only, grey). */
  private titleEl: HTMLElement;
  /** The local player's own plate: shown only while a title is chosen; name, level and title, no bars. */
  private readonly self: boolean;
  private lvlEl: HTMLElement;
  private guildEl: HTMLElement;
  private guildTxt = '';
  private rankIco: HTMLElement;
  private barEl: HTMLElement;
  private fill: HTMLElement;
  private ghost: HTMLElement;
  /** "8,2M | 36%" text on the HP bar. */
  private hpEl: HTMLElement;
  /** Side arrows of the current target (shown by the `.target` class). */
  private arrowL: HTMLElement;
  private arrowR: HTMLElement;
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
    this.titleEl = div('np-title', this.el);
    setDisplay(this.titleEl, false);
    this.self = actor.kind === 'player' && (actor as Player).isLocal === true;
    // WP-05 Lonca: `<Lonca Adı>` under the name of another player (G.guild.tagOf, from the lobby presence)
    this.guildEl = div('np-guild', this.el);
    this.guildEl.style.cssText = 'display:none;align-self:center;margin-top:-1px;font:600 10px/12px var(--font-body, sans-serif);color:#40ff40;text-shadow:-1px 0 #000,1px 0 #000,0 -1px #000,0 1px #000;white-space:nowrap;pointer-events:none;';
    // debuff icons sit above the HP bar (Plater style)
    this.status = new StatusRow(ui, 'debuff', 4, 'np-st', false);
    this.el.appendChild(this.status.el);
    const barRow = div('np-barrow', this.el);
    this.arrowL = div('np-arrow np-arrow-l', barRow);
    const bar = div('np-bar', barRow);
    this.arrowR = div('np-arrow np-arrow-r', barRow);
    this.barEl = bar;
    this.ghost = div('np-ghost', bar);
    this.fill = div('np-fill', bar);
    div('np-gloss', bar);
    this.hpEl = div('np-hp', bar);
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
    this.el.style.display = 'none';
    if (this.self) {
      // own plate: name + level + title only (no HP bar, cast, poise, dispel or debuffs)
      for (const part of [barRow, this.poiseEl, this.castWrap, this.dispelEl, this.status.el]) setDisplay(part, false);
    }
    const isPlayer = actor.kind === 'player';
    // click-to-select: the name and the HP bar take the mouse (the rest of the plate stays click-through); other players are not selectable.
    // The HUD only reports the click; PlayerController subscribes to target:select (left = select, right = select + attack).
    if (!isPlayer) {
      for (const part of [this.nameEl, this.barEl]) {
        part.classList.add('ui-capture', 'np-click');
        part.addEventListener('mousedown', (e) => {
          if ((e.button !== 0 && e.button !== 2) || actor.removed || actor.isDead) return;
          e.preventDefault();
          G.events.emit('target:select', { entityId: actor.id, attack: e.button === 2 });
        });
      }
    }
    const rank = isPlayer ? 'player' : ((actor as Enemy).def?.rank ?? 'trash');
    this.rank = rank;
    this.el.dataset.rank = rank;
    this.applyFlavor();
  }

  /** Colour + icon by kind: boss / elite ranks, blue champions (flag set after spawn, so re-checked every frame), mechanic entities. */
  private applyFlavor(): void {
    const a = this.actor;
    const isPlayer = a.kind === 'player';
    // WP-06: a player's plate takes its nation's colour (Gök Kartal blue, Kızıl Kurt red); the nation is part of the key so a late-known nation repaints
    const nation = isPlayer ? (a as Player).nation : null;
    const team = arenaTeamOf(a);
    const flavor = team ? 'arena' + team : isPlayer ? 'player' + (nation ?? '') : isMechanic(a) ? 'mech' : isChampion(a) ? 'champ' : isRare(a) ? 'rare' : this.rank;
    if (flavor === this.flavor) return;
    this.flavor = flavor;
    const col = this.opts.color ?? (team ? ARENA_TEAM_COLOR[team] : isPlayer ? nationColor(nation) : flavor === 'champ' ? CHAMPION_COLOR : flavor === 'mech' ? MECH_COLOR : flavor === 'rare' ? RARE_COLOR : RANK_NAME_COLOR[this.rank] ?? '#f1e6cf');
    this.el.style.setProperty('--nc', col);
    if (flavor === 'champ' || flavor === 'mech') this.el.dataset.flavor = flavor;
    else delete this.el.dataset.flavor;
    const showIco = !isPlayer && (flavor === 'champ' || this.rank === 'boss' || this.rank === 'elite' || this.rank === 'miniboss') && flavor !== 'mech';
    if (showIco) this.rankIco.style.setProperty('--i', `url("${ICON(flavor === 'rare' ? 'ui-rare-dragon' : this.rank === 'boss' ? 'ui-boss' : 'ui-elite')}")`);
    setDisplay(this.rankIco, showIco);
  }

  setShown(v: boolean): void {
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.display = v ? '' : 'none';
  }

  /** Content (name, level, HP, cast, debuffs). The position is set by place(), once the declutter has run. */
  update(ctx: { now: number; world: number; casts: CastTracker; isTarget: boolean; isSoft: boolean; playerLevel: number; selfTitle: string }): void {
    const a = this.actor;
    this.applyFlavor();
    const team = arenaTeamOf(a);
    const tag = team ?? (a.kind === 'player' ? nationTag((a as Player).nation) : '');
    setText(this.nameEl, tag ? `[${tag}] ${a.name}` : a.name);
    setDisplay(this.nameEl, this.opts.showName !== false);
    setDisplay(this.lvlEl, this.flavor !== 'mech');
    // WoW: a unit 10+ levels above the player shows a skull (here "??"); colour by difficulty (levelColor)
    const skull = a.kind !== 'player' && isSkullLevel(ctx.playerLevel, a.level);
    setText(this.lvlEl, skull ? '??' : String(a.level));
    if (a.kind === 'player') {
      const tag = G.guild?.tagOf(a.name) ?? '';
      if (tag !== this.guildTxt) {
        this.guildTxt = tag;
        setText(this.guildEl, tag ? `<${tag}>` : '');
        this.guildEl.style.display = tag ? 'block' : 'none';
        this.w = 0; // the box grew / shrank: measure again
      }
    }
    setStyle(this.lvlEl, 'color', a.kind === 'player' ? '#ffffff' : levelColor(ctx.playerLevel, a.level));
    if (this.self) {
      // beta test character: a BETA badge under the name (the own plate shows for it even without a title)
      const betaTag = G.character?.save.beta ? 'BETA' : '';
      const line = [ctx.selfTitle, betaTag].filter(Boolean).join(' · ');
      setText(this.titleEl, line);
      setDisplay(this.titleEl, line !== '');
      setClass(this.el, 'target', false);
      setClass(this.el, 'soft', false);
      return;
    }
    const frac = a.maxHp > 0 ? clamp01(a.hp / a.maxHp) : 0;
    if (frac !== this.lastFrac) {
      // white flash + bump on every visible HP loss (hit feedback right on the enemy)
      if (this.lastFrac >= 0 && frac < this.lastFrac - 0.003) pulse(this.barEl, 'hit');
      this.lastFrac = frac;
      const w = (frac * 100).toFixed(1) + '%';
      this.fill.style.width = w;
      this.ghost.style.width = w;
      setText(this.hpEl, `${fmtHealth(a.hp)} | ${Math.round(frac * 100)}%`);
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
  place(x: number, y: number, scale: number, lift: number, z: number, alpha = 1): void {
    setStyle(this.el, 'transform', `translate(${Math.round(x)}px, ${Math.round(y - lift)}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`);
    setStyle(this.el, 'zIndex', String(z));
    setStyle(this.el, 'opacity', alpha.toFixed(2));
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
  /** Opacity (distance fade). */
  alpha: number;
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
  /** Screen rects of the HUD panels in layer px (see HUD_SEL); a hard blocker, even for the target and hot plates. */
  private hud: Box[] = [];
  private hudAt = -1e9;

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

  /** Re-read the HUD panel rects (quest tracker, minimap) every HUD_RECT_EVERY ms; hidden panels (zero size) are skipped. */
  private refreshHud(now: number): void {
    if (now - this.hudAt < HUD_RECT_EVERY) return;
    this.hudAt = now;
    const lr = this.layer.getBoundingClientRect();
    const out: Box[] = [];
    document.querySelectorAll<HTMLElement>(HUD_SEL).forEach((el) => {
      if (this.layer.contains(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ x0: r.left - lr.left, y0: r.top - lr.top, x1: r.right - lr.left, y1: r.bottom - lr.top });
    });
    this.hud = out;
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
    // Settings.nameplates: always (default) · combat (only in a fight) · off (the target still shows)
    const npMode = G.settings?.data.nameplates ?? 'always';
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
        else if (npMode === 'off') show = isTarget && d < ENEMY_RANGE;
        else if (rank === 'boss') show = d < 70 && a.id !== bossEntity;
        else if (npMode === 'combat') show = d < ENEMY_RANGE && (isTarget || e.aggroed || a.combatTimer < 8);
        else show = d < ENEMY_RANGE;
      }
      if (show) cands.push({ a, d, always: manual || a.id === hardTarget, hot: a.id === hardTarget || a === hover || a.combatTimer < HOT_SECONDS });
    };
    for (const e of w.enemies) consider(e, false);
    for (const p of w.players) if (!p.isLocal) consider(p as Player, true);
    // the local player gets a plate only while a title is chosen (name + title, see Plate.self)
    const selfTitle = selectedTitleName(G.character?.save);
    if (selfTitle || G.character?.save.beta) consider(me as Player, true);
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
      const isTarget = a.id === hardTarget;
      plate.update({ now, world: wt, casts, isTarget: isTarget || a === hover, isSoft: a === hover && a.id !== hardId, playerLevel: me.level, selfTitle });
      // the target is drawn larger; distance fade from 28 m (45 % at 48 m), never below 45 %
      const k = Math.max(0.68, Math.min(1.05, 1.18 - c.d / 55)) * (isTarget ? TARGET_SCALE : 1);
      const alpha = c.always ? 1 : clampN(1 - (c.d - FADE_FROM) / 20, 0.45, 1);
      laid.push({
        plate, d: c.d, k, alpha,
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
    // HUD panels are hard blockers: a plate never lands under the quest tracker or the minimap, not even the target
    this.refreshHud(now);
    const hud = this.hud;
    const onHud = (b: Box): boolean => hud.some((h) => overlaps(b, h));
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
        if (onHud(box) || placed.some((p) => overlaps(box, p))) continue;
        e.lift = lift;
        placed.push(box);
        fitted = true;
        break;
      }
      if (fitted) continue;
      const lastBox = boxOf(e, last);
      if (e.exempt && !onHud(lastBox)) {
        // target / hot plates are drawn over their neighbours, at the highest lift they reached (never under a HUD panel)
        e.lift = last;
        placed.push(lastBox);
      } else e.show = false;
    }

    // 4. write the positions (hidden plates keep their state and come back when there is room)
    for (const e of laid) {
      if (!e.show) {
        e.plate.setShown(false);
        continue;
      }
      e.plate.place(e.x, e.y, e.k, e.lift, Math.max(1, (e.exempt ? 700 : 500) - Math.round(e.d * 4)), e.alpha);
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
