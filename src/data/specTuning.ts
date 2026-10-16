import type { ClassId } from '../types/common';
import { CLASSES } from './classes';
// Per-spec calibration factors (CORE_MECHANICS §1.1 / §5.4, CM1). Players only; neutral = 1 (a spec not listed is 1).
// Level-aware: each factor is a knot triple [L10, L30, L60]; a character's factor is linearly interpolated by its level between the knots and
// held at the end knots outside 10-60. A plain number applies at every level. Written by tools/calibrate-balance.mjs, which fits each knot at
// its own level against dev/combat-sim/balance.mjs (docs/BALANCE.md §9).
// One choke point per factor, all through tuneOf: dmg -> Combat.rollOutgoing, heal -> Combat.healPlayer, taken -> Combat.hitLocalPlayer.

/** The levels of the knots, in the order of a factor's triple. */
export const TUNE_LEVELS: readonly [10, 30, 60] = [10, 30, 60];

/** One factor: a plain number (every level) or the knots [L10, L30, L60]. */
export type TuneKnots = number | readonly [number, number, number];
/** A spec's factors (players only). */
export interface LevelTuning { dmg: TuneKnots; heal: TuneKnots; taken: TuneKnots }

export const SPEC_TUNING: Record<string, LevelTuning> = {
  archer_beastmaster: { dmg: [0.506, 0.653, 0.831], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_marksman: { dmg: [0.621, 0.762, 0.759], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_survival: { dmg: [1.029, 1.387, 1.193], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_butcher: { dmg: [0.335, 0.347, 0.321], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_warlord: { dmg: [0.494, 0.765, 0.345], heal: [1.000, 1.000, 1.000], taken: [0.904, 1.466, 0.791] },
  demonhunter_chaos: { dmg: [0.822, 0.823, 1.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_devourer: { dmg: [1.907, 1.000, 0.969], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_vengeance: { dmg: [1.834, 2.331, 2.100], heal: [1.000, 1.000, 1.000], taken: [0.617, 0.550, 0.495] },
  druid_balance: { dmg: [2.210, 2.037, 0.824], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_feral: { dmg: [1.000, 0.974, 1.220], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_guardian: { dmg: [0.954, 1.743, 2.130], heal: [1.000, 1.000, 1.000], taken: [1.570, 1.235, 1.500] },
  druid_restoration: { dmg: [1.000, 1.000, 1.000], heal: [0.753, 0.660, 0.568], taken: [1.000, 1.000, 1.000] },
  evoker_augmentation: { dmg: [4.000, 4.000, 2.685], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_devastation: { dmg: [3.481, 2.681, 3.665], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_preservation: { dmg: [1.000, 1.000, 1.000], heal: [0.587, 0.660, 0.611], taken: [1.000, 1.000, 1.000] },
  knight_blademaster: { dmg: [0.371, 0.402, 0.565], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  knight_protector: { dmg: [0.651, 1.895, 2.311], heal: [1.000, 1.000, 1.000], taken: [2.034, 0.250, 0.700] },
  mage_arcane: { dmg: [0.746, 0.757, 0.821], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_fire: { dmg: [3.411, 1.259, 0.890], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_frost: { dmg: [1.042, 1.436, 1.371], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  monk_brewmaster: { dmg: [0.844, 1.117, 1.147], heal: [1.000, 1.000, 1.000], taken: [0.709, 1.000, 0.944] },
  monk_mistweaver: { dmg: [1.000, 1.000, 1.000], heal: [1.621, 1.633, 1.737], taken: [1.000, 1.000, 1.000] },
  monk_windwalker: { dmg: [0.556, 0.642, 0.695], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_bone: { dmg: [2.156, 2.492, 1.593], heal: [1.000, 1.000, 1.000], taken: [0.835, 0.973, 0.615] },
  necromancer_frost: { dmg: [2.208, 4.000, 2.909], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_summoner: { dmg: [2.344, 3.847, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  paladin_holy: { dmg: [1.000, 1.000, 1.000], heal: [0.468, 0.626, 0.560], taken: [1.000, 1.000, 1.000] },
  paladin_protection: { dmg: [1.047, 1.600, 0.804], heal: [1.000, 1.000, 1.000], taken: [2.550, 3.709, 4.000] },
  paladin_retribution: { dmg: [0.876, 1.049, 0.867], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  priest_discipline: { dmg: [1.000, 1.000, 1.000], heal: [4.000, 3.797, 1.392], taken: [1.000, 1.000, 1.000] },
  priest_holy: { dmg: [1.000, 1.000, 1.000], heal: [3.046, 1.918, 1.046], taken: [1.000, 1.000, 1.000] },
  priest_shadow: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_assassin: { dmg: [0.318, 0.429, 0.518], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_outlaw: { dmg: [0.349, 0.408, 0.361], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_subtlety: { dmg: [0.420, 0.488, 0.265], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_elemental: { dmg: [2.796, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_enhancement: { dmg: [0.610, 0.750, 1.098], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_restoration: { dmg: [1.000, 1.000, 1.000], heal: [2.463, 1.584, 2.314], taken: [1.000, 1.000, 1.000] },
  warlock_affliction: { dmg: [1.347, 1.658, 1.601], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_demonology: { dmg: [0.637, 0.981, 1.086], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_destruction: { dmg: [1.520, 1.693, 2.208], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
};

/** Player outgoing damage below L10 only: a curve [x at L1, x at L5, x at L8], piecewise linear through (1, x1), (5, x5), (8, x8), (10, 1),
 *  where x is the multiplier on the spec's L10-knot damage factor (tuneAt). L10 is untouched (the L10 balance gate measures it). L8 keeps the
 *  flat factor the L1-9 solo sims were tuned on; L1 and L5 are fitted to dev/combat-sim/class_ttk.mjs (every class's same-level normal mob
 *  dies in 6-10 s at L1 and L5). A spec not listed is 1. */
export const LOW_LEVEL_DMG: Record<string, readonly [number, number, number]> = {
  knight_protector: [1.37, 0.72, 0.6], barbarian_warlord: [0.76, 0.93, 1], mage_fire: [1.09, 1.20, 1.5], rogue_assassin: [0.89, 1.13, 1],
  paladin_protection: [0.85, 0.68, 0.6], necromancer_summoner: [0.27, 0.41, 0.35], warlock_affliction: [1.54, 0.85, 1.15], monk_brewmaster: [0.56, 0.69, 1],
  archer_marksman: [0.50, 0.58, 0.55], shaman_elemental: [0.89, 1.24, 1.15], demonhunter_chaos: [0.65, 0.76, 0.84], evoker_devastation: [0.31, 0.30, 0.30],
  priest_discipline: [1.51, 2.10, 1.92], druid_balance: [0.79, 1.01, 1],
};

/** The L1-9 damage multiplier of a spec (LOW_LEVEL_DMG): piecewise linear through (1, x1), (5, x5), (8, x8), (10, 1); 1 from L10 up. */
export function lowLevelDmgMult(spec: string, level: number): number {
  const k = LOW_LEVEL_DMG[spec];
  if (!k || level >= 10) return 1;
  const L = Math.max(1, level);
  if (L <= 5) return k[0] + ((k[1] - k[0]) * (L - 1)) / 4;
  if (L <= 8) return k[1] + ((k[2] - k[1]) * (L - 5)) / 3;
  return k[2] + ((1 - k[2]) * (L - 8)) / 2;
}

/** The factor `k` at character level `level`: linear between the knots, held at the end knots outside 10-60. */
export function tuneAt(k: TuneKnots, level: number): number {
  if (typeof k === 'number') return k;
  const [l10, l30, l60] = TUNE_LEVELS;
  const L = Math.min(l60, Math.max(l10, level));
  if (L <= l30) return k[0] + ((k[1] - k[0]) * (L - l10)) / (l30 - l10);
  return k[1] + ((k[2] - k[1]) * (L - l30)) / (l60 - l30);
}

/** The factor `key` for an actor: only a player is tuned (enemies, minions and the environment are 1). Below L10 a character has no spec
 *  yet (the choice is made at L10, CharacterState.spec): it is tuned as the first spec of its class, and below L10 only its damage factor
 *  (LOW_LEVEL_DMG on the L10 knot) applies, the way the solo sim (dev/combat-sim/solo_lowlevel.mjs) assumes. A player with no level reads the L60 knot. */
export function tuneOf(a: { kind?: string; spec?: string | null; level?: number; classId?: ClassId } | null | undefined, key: keyof LevelTuning): number {
  if (!a || a.kind !== 'player') return 1;
  const lvl = typeof a.level === 'number' && Number.isFinite(a.level) ? a.level : TUNE_LEVELS[2];
  const spec = a.spec ?? (lvl < TUNE_LEVELS[0] && a.classId ? CLASSES[a.classId]?.specs?.[0] ?? null : null);
  if (!spec) return 1;
  const t = SPEC_TUNING[spec];
  if (!t) return 1;
  if (lvl < TUNE_LEVELS[0]) return key === 'dmg' ? tuneAt(t.dmg, lvl) * lowLevelDmgMult(spec, lvl) : 1; // L1-9: the low-level damage curve only
  return tuneAt(t[key], lvl);
}
