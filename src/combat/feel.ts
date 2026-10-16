import type { DamageType } from '../types/common';
import type { VfxId } from '../types/vfx';
import type { SfxId } from '../types/audio';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import { G } from '../game/G';
import { getItemBase } from '../data/items';

/**
 * Game-feel constants for the combat module (GDD_LIFE §5 "Vuruş Hissi v2", GDD_SYSTEMS §8). EVERY hit path reads its numbers from
 * this file: `resolveHitFeel()` (per hit: weight row + crit / kill / boss modifiers + weapon multiplier), `freezeActors()`
 * (selective hit-freeze), `SLOWMO` (time dilation), `FEEL_WEAPON` (tempo + per-weapon multipliers). Hit-stop in ms, camera
 * trauma 0..1, times in seconds, kicks in metres, FOV kicks in degrees. Old values stay in `FEEL_V1` for the A/B toggle.
 * OWNER: combat module.
 */
export type HitWeight =
  | 'light' | 'medium' | 'finisher' | 'heavy' | 'ultimate' | 'projectile' | 'tick'
  /** GDD_LIFE §5.2: successful parry / riposte (attacker-side beat). */
  | 'parry'
  /** GDD_LIFE §5.2: poise-break "kritik vuruş". */
  | 'stagger_break'
  /** GDD_LIFE §5.2: hit from behind (backstab). */
  | 'backstab';

export const FEEL = {
  /** Base hit-stop (ms) by weight (GDD_LIFE §5.2). */
  hitstop: { light: 50, medium: 62, finisher: 90, heavy: 115, ultimate: 150, projectile: 0, tick: 0, parry: 70, stagger_break: 160, backstab: 80 } as Record<HitWeight, number>,
  hitstopCrit: 40,          // crit: +40 ms (WoW-style hit-stop 30-50 ms)
  hitstopKill: 25,
  hitstopBossCap: 70,       // boss hits: capped for light..heavy (ultimate and stagger_break are exempt)
  hitstopCap: 160,          // total hit-stop per hitstopWindow (GDD §5.2 caps)
  hitstopWindow: 0.3,
  hitstopProjectileCrit: 30,
  hurtBigFrac: 0.15,        // player hurt by > 15% max HP -> global hit-stop
  hurtBigStop: 55,
  /** Selective hit-freeze (§5.4): attacker + victims freeze, the rest of the world keeps running. false = v1 global stop. */
  selectiveFreeze: true,
  /** At most this many actors frozen by one hit frame. */
  freezeMaxAtOnce: 3,
  /** Clip / forced-move time scale of a frozen actor (AnimController / Actor). */
  freezeScale: 0.04,
  /** Camera trauma by weight (GDD_LIFE §5.2). The camera module maps trauma -> shake. */
  shake: { light: 0.04, medium: 0.08, finisher: 0.32, heavy: 0.5, ultimate: 0.7, projectile: 0.05, tick: 0.02, parry: 0.3, stagger_break: 0.7, backstab: 0.2 } as Record<HitWeight, number>,
  shakeCrit: 0.12,
  shakeKill: 0.10,
  shakeHurt: 0.32,
  /** Camera trauma cap: the active sum (GDD_LIFE §4.11). The camera module owns the per-entry cap and the per-second budget. */
  shakeCap: 0.85,
  /** Slow-mo on big crits / boss kills (legacy values, the table is SLOWMO). */
  slowmoScale: 0.45,
  slowmoHold: 0.07,
  slowmoRecover: 0.18,
  /** Enemy hit reaction. Two-stage flash is FEEL_TABLE-driven (resolveHitFeel), this is the legacy single-stage length. */
  flashDuration: 0.085,
  reactCooldown: 0.32,      // per enemy: min seconds between light-hit flinches
  jiggle: 0.16,
  squash: 0.13,
  /** Combo counter (GDD_LIFE §5.9): 5 tiers, bonus per tier, drain one tier per comboDrain seconds after the window. */
  comboWindow: 2.0,
  comboTiers: [5, 12, 24, 40, 70],                    // hits needed for tier 1..5
  comboBonus: [0, 0.03, 0.06, 0.1, 0.15, 0.2],        // damage bonus per tier 0..5
  comboDrain: 0.8,
  /** Chain finish at tier >= 2 refunds this share of max resource once per chain. */
  comboRefundPct: 0.1,
  /** Melee soft-targeting */
  meleeAssistExtra: 1.5,    // candidates within range + this
  meleeAssistCone: 60,      // degrees
  /** Input (GDD_LIFE §5.8): last input wins inside the buffer, dodge can be buffered during any recovery. */
  inputBuffer: 0.3,
  dodgeBuffer: 0.2,
  /** Global tempo of LMB basic-attack chains (1 = designed speed). Per-weapon tempo is FEEL_WEAPON.tempo. Skills are unaffected. */
  basicTempo: 1,
  gcd: 0.3,
  /** Corpse safety-net removal */
  corpseLifetime: 20,
};

/** Feel row of one hit weight (GDD_LIFE §5.2). `flash.c2` = 'type' uses the damage-type colour. */
export interface FlashSpec { c1: number | 'type'; ms1: number; c2: number | 'type' | null; ms2: number }
export interface WeightRow {
  shakeDur: number; kick: number; fov: number;
  knock: number; knockDur: number; flinch: number;
  flash: FlashSpec; jiggle: number; squash: number; sparks: number; chips: number; layers: string;
}

const WHITE = 0xffffff;
const GOLD = 0xffd24a;
const CRIT_GOLD = 0xfff0a0;

export const WEIGHT_ROWS: Record<HitWeight, WeightRow> = {
  light: { shakeDur: 0.19, kick: 0, fov: 0, knock: 0.6, knockDur: 0.2, flinch: 0.4,
    flash: { c1: WHITE, ms1: 115, c2: null, ms2: 0 }, jiggle: 1, squash: 1, sparks: 6, chips: 3, layers: 'material impact 0.9' },
  medium: { shakeDur: 0.22, kick: 0.02, fov: 0.8, knock: 1.3, knockDur: 0.22, flinch: 0.6,
    flash: { c1: WHITE, ms1: 125, c2: null, ms2: 0 }, jiggle: 1.15, squash: 1.2, sparks: 9, chips: 5, layers: 'impact 1.0 + hit_blunt thump 0.3' },
  finisher: { shakeDur: 0.29, kick: 0.14, fov: 2.0, knock: 2.0, knockDur: 0.26, flinch: 1,
    flash: { c1: WHITE, ms1: 55, c2: 'type', ms2: 55 }, jiggle: 1.5, squash: 1.6, sparks: 14, chips: 8, layers: 'impact 1.0 + ground_slam 0.35 @0.85 + voice 45% + shockwave r1.2' },
  heavy: { shakeDur: 0.37, kick: 0.2, fov: 3.0, knock: 3.2, knockDur: 0.3, flinch: 1,
    flash: { c1: WHITE, ms1: 60, c2: 'type', ms2: 70 }, jiggle: 1.8, squash: 2.0, sparks: 22, chips: 12, layers: 'impact + ground_slam 0.5 @0.8 + explosion 0.25 + voice 70%' },
  ultimate: { shakeDur: 0.46, kick: 0.28, fov: 4.5, knock: 4.5, knockDur: 0.35, flinch: 1,
    flash: { c1: WHITE, ms1: 70, c2: 'type', ms2: 90 }, jiggle: 2.2, squash: 2.4, sparks: 36, chips: 20, layers: 'impact + explosion 0.5 + voice 100% + shockwave r3.5' },
  projectile: { shakeDur: 0.12, kick: 0.02, fov: 0, knock: 0.3, knockDur: 0.15, flinch: 0.25,
    flash: { c1: 'type', ms1: 70, c2: null, ms2: 0 }, jiggle: 0.8, squash: 0.8, sparks: 5, chips: 2, layers: 'impact 0.8' },
  tick: { shakeDur: 0.1, kick: 0, fov: 0, knock: 0, knockDur: 0, flinch: 0,
    flash: { c1: WHITE, ms1: 0, c2: null, ms2: 0 }, jiggle: 0, squash: 0, sparks: 1, chips: 0, layers: 'quiet 0.3' },
  parry: { shakeDur: 0.25, kick: 0.12, fov: 2.5, knock: 2.0, knockDur: 0.25, flinch: 0,
    flash: { c1: WHITE, ms1: 80, c2: GOLD, ms2: 80 }, jiggle: 1.5, squash: 1.5, sparks: 10, chips: 0, layers: 'block + hit_metal bell' },
  stagger_break: { shakeDur: 0.45, kick: 0.25, fov: 6.0, knock: 0, knockDur: 0, flinch: 0,
    flash: { c1: WHITE, ms1: 100, c2: CRIT_GOLD, ms2: 120 }, jiggle: 2.0, squash: 2.0, sparks: 2, chips: 0, layers: 'explosion + stun + hit_crit' },
  backstab: { shakeDur: 0.22, kick: 0.1, fov: 1.5, knock: 0.5, knockDur: 0.2, flinch: 1,
    flash: { c1: GOLD, ms1: 100, c2: null, ms2: 0 }, jiggle: 1.4, squash: 1.4, sparks: 0, chips: 8, layers: 'hit_flesh low + dagger_throw' },
};

/**
 * GDD_LIFE §5.2 "Modifiers": crit and kill. Hit-stop / trauma of the modifiers are FEEL.hitstopCrit / shakeCrit / hitstopKill / shakeKill
 * (they follow the v1/v2 toggle); the kick, FOV and flash values are here.
 */
export const CRIT_MOD = { kick: 0.04, fov: 1.0, flashC: CRIT_GOLD, flashMs: 120, knockMul: 1.15, numberMul: 1.5 };
export const KILL_MOD = { kick: 0.04, fov: 1.0 };
export const BOSS_MOD = { kickMul: 0.8, trauma: 1.0, jiggle: 0.3 };

/**
 * Per-weapon multipliers (GDD_LIFE §5.3). `tempo` multiplies FEEL.basicTempo for that class's LMB chain. Bows use trauma 0.8 on the
 * projectile row (0.05 -> 0.04) and kick 1.0 (0.02), and no hit-stop on release.
 */
export type FeelWeapon = 'sword1h' | 'axe2h' | 'dagger' | 'staff' | 'fist' | 'mace' | 'bow';
export const FEEL_WEAPON: Record<FeelWeapon, { stop: number; trauma: number; kick: number; tempo: number }> = {
  sword1h: { stop: 1, trauma: 1, kick: 1, tempo: 1 },
  axe2h: { stop: 1.2, trauma: 1.3, kick: 1.3, tempo: 0.92 },
  dagger: { stop: 0.8, trauma: 0.7, kick: 0.7, tempo: 1.12 },
  staff: { stop: 1, trauma: 1, kick: 1, tempo: 1 },
  fist: { stop: 0.7, trauma: 0.6, kick: 0.6, tempo: 1.15 },
  mace: { stop: 1.15, trauma: 1.15, kick: 1.15, tempo: 0.95 },
  bow: { stop: 0, trauma: 0.8, kick: 1, tempo: 1 },
};

/** Weapon kind of an item category (main hand). */
export function feelWeaponOfCategory(category: string | undefined): FeelWeapon | undefined {
  switch (category) {
    case 'sword1h': case 'axe1h': return 'sword1h';
    case 'sword2h': case 'axe2h': return 'axe2h';
    case 'dagger': return 'dagger';
    case 'staff': case 'wand': return 'staff';
    case 'fist': return 'fist';
    case 'mace': return 'mace';
    case 'bow': case 'crossbow': return 'bow';
    default: return undefined;
  }
}

/** Class default when no weapon is equipped (new classes map to their kit weapon). */
const CLASS_WEAPON: Record<string, FeelWeapon> = {
  knight: 'sword1h', barbarian: 'axe2h', rogue: 'dagger', mage: 'staff', monk: 'fist', archer: 'bow', paladin: 'mace',
  necromancer: 'staff', warlock: 'staff', demonhunter: 'dagger', evoker: 'staff',
};

/** weaponKind of an actor: the equipped main hand (local: save equipment, remote: visible gear), else the class default. */
export function weaponKindOf(a: Actor | Player | null | undefined): FeelWeapon {
  if (!a || a.kind !== 'player') return 'sword1h';
  const p = a as Player;
  const w = p.isLocal ? p.character?.save.equipment.weapon : p.visibleGear.weapon;
  const base = w ? getItemBase(w.baseId) : undefined;
  return feelWeaponOfCategory(base?.category) ?? CLASS_WEAPON[p.classId] ?? 'sword1h';
}

/** Tempo multiplier of the attacker's LMB chain (1 for non-players). */
export function weaponTempoOf(a: Actor | Player | null | undefined): number {
  return FEEL_WEAPON[weaponKindOf(a)].tempo;
}

/** Map a skill's `params.weight` (0 light, 1 finisher, 2 heavy, 3 ultimate, 4 medium, 5 parry, 6 stagger_break, 7 backstab). */
export function weightFromParam(w: number | undefined, step: number | undefined, basic: boolean, projectile: boolean): HitWeight {
  switch (w) {
    case 1: return 'finisher';
    case 2: return 'heavy';
    case 3: return 'ultimate';
    case 4: return 'medium';
    case 5: return 'parry';
    case 6: return 'stagger_break';
    case 7: return 'backstab';
    default:
      // GDD_LIFE §5.2 / §5.13: chain step 3 of a basic combo is a medium hit (it used to be light)
      if (basic && step === 3) return 'medium';
      return projectile ? 'projectile' : 'light';
  }
}

export interface HitFeelInput {
  weight: HitWeight;
  weapon?: FeelWeapon;
  crit?: boolean;
  kill?: boolean;
  /** kill of an elite / miniboss / boss (FOV kick applies) */
  eliteKill?: boolean;
  boss?: boolean;
}

/** Everything one hit asks for, resolved from the table (pure). */
export interface HitFeel {
  stop: number; trauma: number; shakeDur: number; kick: number; fov: number;
  knock: number; knockDur: number; flinch: number;
  flashC1: number; flashMs1: number; flashC2: number | null; flashMs2: number;
  jiggle: number; squash: number; sparks: number; chips: number;
}

/**
 * Resolve one hit: weight row x weapon multiplier, plus crit / kill modifiers and the boss rules (GDD_LIFE §5.2 / §5.3).
 * `typeColor` is the damage-type colour used by 'type' flash stages.
 */
export function resolveHitFeel(i: HitFeelInput, typeColor = WHITE): HitFeel {
  const w = WEIGHT_ROWS[i.weight] ? i.weight : 'light';
  const row = WEIGHT_ROWS[w];
  const wm = FEEL_WEAPON[i.weapon ?? 'sword1h'];
  // hit-stop and trauma per weight live in FEEL.hitstop / FEEL.shake (so the v1/v2 toggle applies)
  let stop = (FEEL.hitstop[w] ?? 0) * wm.stop;
  let trauma = (FEEL.shake[w] ?? 0) * wm.trauma;
  let kick = row.kick * wm.kick;
  let fov = row.fov;
  let c2: number | null = row.flash.c2 === 'type' ? typeColor : row.flash.c2;
  let ms2 = row.flash.ms2;
  if (i.crit) {
    stop += FEEL.hitstopCrit;
    trauma += FEEL.shakeCrit;
    kick += CRIT_MOD.kick;
    fov += CRIT_MOD.fov;
    c2 = CRIT_MOD.flashC; ms2 = CRIT_MOD.flashMs;
  }
  if (i.kill) {
    stop += FEEL.hitstopKill;
    trauma += FEEL.shakeKill;
    kick += KILL_MOD.kick;
    if (i.eliteKill) fov += KILL_MOD.fov;
  }
  if (i.boss) {
    // bosses: capped hit-stop for light..heavy (ultimate and stagger_break exempt), softer kick, jiggle is scaled in Combat
    if (w !== 'ultimate' && w !== 'stagger_break') stop = Math.min(stop, FEEL.hitstopBossCap);
    kick *= BOSS_MOD.kickMul;
    trauma *= BOSS_MOD.trauma;
  }
  return {
    stop: Math.max(0, stop), trauma: Math.min(1, Math.max(0, trauma)), shakeDur: row.shakeDur, kick, fov,
    knock: row.knock * (i.crit ? CRIT_MOD.knockMul : 1), knockDur: row.knockDur, flinch: row.flinch,
    flashC1: row.flash.c1 === 'type' ? typeColor : row.flash.c1,
    flashMs1: row.flash.ms1, flashC2: c2, flashMs2: ms2,
    jiggle: row.jiggle, squash: row.squash, sparks: row.sparks, chips: row.chips,
  };
}

/** Row lookup (dev tools, telemetry): the static row plus the live hit-stop / trauma of the weight. */
export function weightRow(w: HitWeight): WeightRow & { stop: number; trauma: number } {
  const k = WEIGHT_ROWS[w] ? w : 'light';
  return { ...WEIGHT_ROWS[k], stop: FEEL.hitstop[k] ?? 0, trauma: FEEL.shake[k] ?? 0 };
}

/** Weapon multiplier lookup for an attacker (dev tools, telemetry). */
export function weaponMul(kind: FeelWeapon): { stop: number; trauma: number; kick: number; tempo: number } {
  return FEEL_WEAPON[kind];
}

/**
 * Time dilation (GDD_LIFE §5.7). `Combat.slowmo` runs them; at most one per 1.2 s except boss death.
 */
export const SLOWMO = {
  critHeavy: { scale: 0.45, hold: 0.07, recover: 0.18 },
  eliteKill: { scale: 0.35, hold: 0.11, recover: 0.22 },
  lastKill: { scale: 0.35, hold: 0.12, recover: 0.25 },
  ultimate: { scale: 0.3, hold: 0.12, recover: 0.25 },
  perfectDodge: { scale: 0.45, hold: 0.11, recover: 0.22 },
  staggerBreak: { scale: 0.25, hold: 0.14, recover: 0.3 },
  bossDeath: { scale: 0.25, hold: 0.6, recover: 0.6 },
} as const;

/** Min seconds between two non-boss-death slow-mos (GDD_LIFE §5.7). */
export const SLOWMO_GAP = 1.2;

/**
 * Selective hit-freeze (GDD_LIFE §5.4): the actors' clips and forced movement run at FEEL.freezeScale until `ms` from now. Particles,
 * projectiles, other enemies, camera springs and UI keep running. Never throws. Local feedback only (no net messages).
 */
export function freezeActors(actors: readonly (Actor | null | undefined)[], ms: number, maxAtOnce = FEEL.freezeMaxAtOnce): void {
  if (!(ms > 0)) return;
  const now = performance.now();
  let n = 0;
  for (const a of actors) {
    if (!a || a.removed || n >= maxAtOnce) continue;
    const until = now + ms;
    a.hitFreezeUntil = Math.max(a.hitFreezeUntil, until);
    if (a.anim) a.anim.freezeUntil = Math.max(a.anim.freezeUntil, until);
    n++;
  }
}

/**
 * GDD_LIFE §5.2 / §5.4 / §5.11 "v2" values vs the v1 snapshot (A/B toggle in dev/combat.ts). `setFeelVersion` writes the values into
 * FEEL in place, so every reader picks them up on the next hit.
 */
export const FEEL_V1 = {
  hitstop: { light: 42, medium: 42, finisher: 75, heavy: 95, ultimate: 125, projectile: 0, tick: 0, parry: 42, stagger_break: 125, backstab: 42 } as Record<HitWeight, number>,
  hitstopCrit: 28,
  hitstopKill: 22,
  hitstopBossCap: 62,
  hitstopCap: 125,
  hitstopProjectileCrit: 25,
  hurtBigStop: 50,
  shake: { light: 0.1, medium: 0.1, finisher: 0.24, heavy: 0.42, ultimate: 0.6, projectile: 0.04, tick: 0.02, parry: 0.1, stagger_break: 0.6, backstab: 0.1 } as Record<HitWeight, number>,
  shakeCrit: 0.1,
  shakeKill: 0.08,
  shakeHurt: 0.28,
  flashDuration: 0.085,
  inputBuffer: 0.4,
  comboTiers: [5, 12, 24, 40],
  comboBonus: [0, 0.03, 0.06, 0.1, 0.15, 0.15],
  selectiveFreeze: false,
};

const FEEL_V2_SNAPSHOT = {
  hitstop: { ...FEEL.hitstop },
  hitstopCrit: FEEL.hitstopCrit,
  hitstopKill: FEEL.hitstopKill,
  hitstopBossCap: FEEL.hitstopBossCap,
  hitstopCap: FEEL.hitstopCap,
  hitstopProjectileCrit: FEEL.hitstopProjectileCrit,
  hurtBigStop: FEEL.hurtBigStop,
  shake: { ...FEEL.shake },
  shakeCrit: FEEL.shakeCrit,
  shakeKill: FEEL.shakeKill,
  shakeHurt: FEEL.shakeHurt,
  flashDuration: FEEL.flashDuration,
  inputBuffer: FEEL.inputBuffer,
  comboTiers: [...FEEL.comboTiers],
  comboBonus: [...FEEL.comboBonus],
  selectiveFreeze: FEEL.selectiveFreeze,
};

let feelVersion: 'v1' | 'v2' = 'v2';
export function getFeelVersion(): 'v1' | 'v2' { return feelVersion; }
/** Dev A/B toggle: 'v1' restores the old global numbers, 'v2' the GDD_LIFE table. */
export function setFeelVersion(v: 'v1' | 'v2'): void {
  feelVersion = v;
  const src = v === 'v1' ? FEEL_V1 : FEEL_V2_SNAPSHOT;
  FEEL.hitstop = { ...src.hitstop };
  FEEL.hitstopCrit = src.hitstopCrit;
  FEEL.hitstopKill = src.hitstopKill;
  FEEL.hitstopBossCap = src.hitstopBossCap;
  FEEL.hitstopCap = src.hitstopCap;
  FEEL.hitstopProjectileCrit = src.hitstopProjectileCrit;
  FEEL.hurtBigStop = src.hurtBigStop;
  FEEL.shake = { ...src.shake };
  FEEL.shakeCrit = src.shakeCrit;
  FEEL.shakeKill = src.shakeKill;
  FEEL.shakeHurt = src.shakeHurt;
  FEEL.flashDuration = src.flashDuration;
  FEEL.inputBuffer = src.inputBuffer;
  FEEL.comboTiers = [...src.comboTiers];
  FEEL.comboBonus = [...src.comboBonus];
  FEEL.selectiveFreeze = src.selectiveFreeze;
}

/**
 * Visible ground-ring radius (m) of the area presets at spawn scale 1 (measured from vfx/presets_*.ts). Use vfxScale() so a ring /
 * explosion drawn for a skill matches the radius it really hits (a 5 m nova draws a 5 m ring, not a 10 m one).
 */
const VFX_R0: Partial<Record<VfxId, number>> = {
  shockwave: 5.5, ground_slam: 4.4, leap_land: 3.4, frost_nova: 5, blizzard: 6, fire_ground: 2.2,
  holy_burst: 3.2, fire_burst: 3.4, frost_burst: 3, arcane_burst: 3.6, poison_burst: 2.8, shadow_burst: 3,
  spin_slash: 3.4, war_cry: 6.5, buff_aura: 0.97, meteor_fall: 2.6, stealth_smoke: 2.2, hit_magic: 1,
};
/** True for presets that draw a big ground ring / blast (they must be shrunk when used as a per-target impact). */
export const isAreaVfx = (id: VfxId | string | undefined): boolean => (VFX_R0[id as VfxId] ?? 0) >= 2.5;

export function vfxScale(id: VfxId | string | undefined, radius: number, min = 0.3): number {
  return Math.max(min, radius / (VFX_R0[id as VfxId] ?? 3));
}

/** Knockback by "class" (GDD §8.5): distance (m), duration (s). */
export const KNOCKBACK = {
  light: { dist: 0.7, dur: 0.2 },
  medium: { dist: 2.0, dur: 0.25 },
  heavy: { dist: 3.0, dur: 0.3 },
  ultimate: { dist: 4.5, dur: 0.35 },
};

export function knockbackDuration(dist: number): number {
  if (dist <= 1) return 0.2;
  if (dist <= 2.6) return 0.25;
  if (dist <= 3.2) return 0.3;
  return 0.35;
}

/**
 * GDD_V2 §3.2 / §3.5 / §3.7 charged-attack, guard and poise timings. Tuning only; logic lives in SkillSystem / Combat.
 * The charge decision for a basic step is `min(chargeThreshold, hitAt - 0.04)` so a light hit can never beat it.
 */
export const COMBAT_FEEL = {
  chargeThreshold: 0.28,     // hold LMB this long -> the charge pose replaces the light swing
  chargeTier2: 0.75,         // held this long -> weapon art (tier 2), hyper-armour on release
  chargeMoveMul: 0.5,        // movement while charging
  hyperArmorHitFrac: 0.2,    // hyper-armour ignores flinch/knockback from hits below this share of max HP
  riposteRange: 3.5,         // m, from the parried enemy
  riposteWindow: 1.6,        // s the riposte status lasts
  riposteInvuln: 0.35,       // s
  krtRange: 3.2,             // Kritik Vuruş reach (m)
  krtInvuln: 0.6,            // s
  krtCritBuff: 5,            // s of critbuff (+15% damage)
  krtResource: 25,
  parryResource: 10,
  parryRecoilSec: 0.8,       // trash parry recoil (poise break)
  poiseBreakSec: 2.0,        // GDD_V2 O1: the broken window
  poiseSwarmFlinch: 0.4,
};

/** Feel beats (GDD_V2 §3.11): hit-stop ms + camera trauma 0..1. Crits/finishers are not capped by the swing window. */
export type FeelKind = 'heavy' | 'weaponArt' | 'parry' | 'riposte' | 'guardHit' | 'guardBreak' | 'poiseBreak' | 'finisher' | 'interrupt' | 'charge'
  | 'runAttack' | 'rollAttack' | 'jumpLand' | 'backstab';
export const FEEL_TABLE: Record<FeelKind, { stop: number; trauma: number }> = {
  heavy: { stop: 115, trauma: 0.5 },
  weaponArt: { stop: 110, trauma: 0.32 },
  parry: { stop: 70, trauma: 0.3 },
  riposte: { stop: 140, trauma: 0.35 },
  guardHit: { stop: 50, trauma: 0.12 },
  guardBreak: { stop: 110, trauma: 0.4 },
  poiseBreak: { stop: 160, trauma: 0.7 },
  finisher: { stop: 90, trauma: 0.32 },
  interrupt: { stop: 60, trauma: 0.1 },
  charge: { stop: 0, trauma: 0.06 },
  /** GDD_V2 §3.11: running attack (dust trail) and roll attack. */
  runAttack: { stop: 55, trauma: 0.12 },
  rollAttack: { stop: 55, trauma: 0.12 },
  /** Jump attack landing (dust ring, ground slam). */
  jumpLand: { stop: 90, trauma: 0.3 },
  /** Backstab hit (green mark). */
  backstab: { stop: 80, trauma: 0.2 },
};

/** Feel kinds that keep a GLOBAL hit-stop (GDD_LIFE §5.4: ultimate, stagger break, big hurt, boss kills). */
const GLOBAL_FEEL_KINDS = new Set<FeelKind>(['poiseBreak']);

/**
 * One-shot feel beat: hit-stop + camera trauma + optional sfx / vfx at a point. With `actors` the hit-stop is a selective freeze of
 * those actors (GDD_LIFE §5.4); without them (or for the global kinds) it stays the global hitstop event. Never throws.
 */
export function feelBeat(
  kind: FeelKind,
  o: { pos?: [number, number, number]; sfx?: SfxId; vfx?: VfxId | string; scale?: number; color?: number; dir?: [number, number, number]; actors?: (Actor | null | undefined)[] } = {},
): void {
  const f = FEEL_TABLE[kind];
  try {
    if (f.stop > 0) {
      if (o.actors && FEEL.selectiveFreeze && !GLOBAL_FEEL_KINDS.has(kind)) freezeActors(o.actors, f.stop);
      else G.events?.emit('hitstop', { ms: f.stop });
    }
    G.events?.emit('camera:shake', { intensity: f.trauma, duration: 0.14 + f.trauma * 0.45 });
    if (o.sfx) G.audio?.play(o.sfx, { pos: o.pos, pitchVar: 0.06 });
    if (o.vfx && o.pos) G.vfx?.spawn(o.vfx as VfxId, o.pos, { scale: o.scale, color: o.color, dir: o.dir });
  } catch {
    /* feedback must never break gameplay */
  }
}

/** Damage-type colours (hex) used for trails, projectiles and impact tints. */
export const TYPE_COLORS: Record<DamageType, number> = {
  physical: 0xffe9c8,
  fire: 0xff8a2a,
  frost: 0x7fd8ff,
  lightning: 0xffe14a,
  shadow: 0xa46bff,
  poison: 0x7dff5a,
  holy: 0xffe9a0,
  arcane: 0xff6bd8,
  true: 0xff3b3b,
};

/** Rank mass factor for knockback distance (GDD §8.5). */
export function massFactor(rank: string | undefined, role?: string): number {
  if (role === 'swarm') return 1.25;
  switch (rank) {
    case 'elite': return 0.5;
    case 'miniboss': return 0.2;
    case 'boss': return 0;
    default: return 1;
  }
}

/** COMBAT_WOW Appendix A: WoW-style skill loop numbers (single source). CW-04 reads gcd / queue / lead. */
export const WOW = {
  gcd:   { profile: 'arpg' as 'arpg' | 'wow', arpg: { base: 1.0 }, wow: { base: 1.5, rogue: 1.0 }, floorMul: 0.5, rogueFixed: true },
  queue: { window: 0.40, ttl: 0.80 },
  lead:  { enabled: true, instant: 0.14, basic: 0.17, min: 0.08 },
  pushback: { add: 0.5, max: 2, minHpFrac: 0.03, channelCut: 0.25 },
  lockout:  { sec: 4, silenceSec: 3 },
  proc:  { prd: true, overlayIn: 0.15, overlayOut: 0.35, warnSec: 1.5, maxOverlays: 3 },
  glow:  { spendFrac: 0.90 },
  text:  { critMul: 1.5, mergeSec: 0.45, bounce: [[0.18, 14], [0.34, 6]] },
  spellFeel: { projectileTrauma: 0.06, bigSpellStop: 40, bigSpellTrauma: [0.14, 0.22], bigSpellFovPull: -2 },
};

/**
 * Lead skip (COMBAT_WOW §2.3): seconds of the clip to skip so the hit lands at `target` instead of `hit`.
 * Never pushes the hit below WOW.lead.min. `target <= 0` = keep authored (0).
 */
export function leadSkipSec(hit: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(hit - target, hit - WOW.lead.min));
}
