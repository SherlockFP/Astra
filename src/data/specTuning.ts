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
  demonhunter_vengeance: { dmg: [1.834, 2.331, 2.100], heal: [1.000, 1.000, 1.000], taken: [0.617, 0.645, 0.495] },
  druid_balance: { dmg: [2.210, 2.037, 0.824], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_feral: { dmg: [1.000, 0.974, 1.220], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_guardian: { dmg: [0.954, 1.743, 2.130], heal: [1.000, 1.000, 1.000], taken: [1.446, 1.235, 1.993] },
  druid_restoration: { dmg: [1.000, 1.000, 1.000], heal: [0.753, 0.660, 0.568], taken: [1.000, 1.000, 1.000] },
  evoker_augmentation: { dmg: [4.000, 4.000, 2.685], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_devastation: { dmg: [3.481, 2.681, 3.665], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_preservation: { dmg: [1.000, 1.000, 1.000], heal: [0.587, 0.660, 0.611], taken: [1.000, 1.000, 1.000] },
  knight_blademaster: { dmg: [0.371, 0.402, 0.565], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  knight_protector: { dmg: [0.651, 1.895, 2.311], heal: [1.000, 1.000, 1.000], taken: [2.034, 4.000, 4.000] },
  mage_arcane: { dmg: [0.746, 0.757, 0.821], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_fire: { dmg: [3.411, 1.259, 0.890], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_frost: { dmg: [1.042, 1.436, 1.371], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  monk_brewmaster: { dmg: [0.844, 1.117, 1.147], heal: [1.000, 1.000, 1.000], taken: [0.709, 1.110, 0.944] },
  monk_mistweaver: { dmg: [1.000, 1.000, 1.000], heal: [1.621, 1.633, 1.737], taken: [1.000, 1.000, 1.000] },
  monk_windwalker: { dmg: [0.556, 0.642, 0.695], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_bone: { dmg: [2.156, 2.492, 1.593], heal: [1.000, 1.000, 1.000], taken: [0.761, 0.973, 0.615] },
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

/** The factor `k` at character level `level`: linear between the knots, held at the end knots outside 10-60. */
export function tuneAt(k: TuneKnots, level: number): number {
  if (typeof k === 'number') return k;
  const [l10, l30, l60] = TUNE_LEVELS;
  const L = Math.min(l60, Math.max(l10, level));
  if (L <= l30) return k[0] + ((k[1] - k[0]) * (L - l10)) / (l30 - l10);
  return k[1] + ((k[2] - k[1]) * (L - l30)) / (l60 - l30);
}

/** The factor `key` for an actor: only a player with a spec is tuned; everything else (enemies, minions, environment) is 1.
 *  A player with no level reads the L60 knot (the level the table was first calibrated at). */
export function tuneOf(a: { kind?: string; spec?: string | null; level?: number } | null | undefined, key: keyof LevelTuning): number {
  if (!a || a.kind !== 'player' || !a.spec) return 1;
  const t = SPEC_TUNING[a.spec];
  if (!t) return 1;
  return tuneAt(t[key], typeof a.level === 'number' && Number.isFinite(a.level) ? a.level : TUNE_LEVELS[2]);
}
