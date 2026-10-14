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
  archer_beastmaster: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_marksman: { dmg: [2.820, 2.102, 2.300], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_survival: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_butcher: { dmg: [0.407, 0.261, 0.269], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_warlord: { dmg: [0.549, 0.578, 0.322], heal: [1.000, 1.000, 1.000], taken: [1.096, 1.393, 0.946] },
  demonhunter_chaos: { dmg: [1.669, 1.635, 2.465], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_devourer: { dmg: [4.000, 1.448, 1.890], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_vengeance: { dmg: [1.773, 1.631, 1.687], heal: [1.000, 1.000, 1.000], taken: [0.695, 0.530, 0.560] },
  druid_balance: { dmg: [1.939, 1.321, 0.666], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_feral: { dmg: [0.932, 0.691, 0.994], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_guardian: { dmg: [0.913, 1.127, 1.611], heal: [1.000, 1.000, 1.000], taken: [1.206, 1.372, 1.652] },
  druid_restoration: { dmg: [1.000, 1.000, 1.000], heal: [0.942, 0.644, 0.250], taken: [1.000, 1.000, 1.000] },
  evoker_augmentation: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_devastation: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_preservation: { dmg: [1.000, 1.000, 1.000], heal: [0.250, 0.250, 0.250], taken: [1.000, 1.000, 1.000] },
  knight_blademaster: { dmg: [0.576, 0.503, 0.758], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  knight_protector: { dmg: [0.990, 1.365, 1.962], heal: [1.000, 1.000, 1.000], taken: [2.255, 4.000, 4.000] },
  mage_arcane: { dmg: [0.637, 0.496, 0.633], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_fire: { dmg: [1.688, 0.947, 0.797], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_frost: { dmg: [0.964, 1.030, 1.145], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  monk_brewmaster: { dmg: [0.726, 0.722, 0.876], heal: [1.000, 1.000, 1.000], taken: [0.837, 0.648, 0.785] },
  monk_mistweaver: { dmg: [1.000, 1.000, 1.000], heal: [4.000, 4.000, 3.299], taken: [1.000, 1.000, 1.000] },
  monk_windwalker: { dmg: [0.460, 1.918, 2.302], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_bone: { dmg: [2.303, 2.837, 1.994], heal: [1.000, 1.000, 1.000], taken: [0.870, 0.849, 0.706] },
  necromancer_frost: { dmg: [1.855, 2.770, 2.116], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_summoner: { dmg: [2.752, 2.963, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  paladin_holy: { dmg: [1.000, 1.000, 1.000], heal: [0.574, 0.250, 0.250], taken: [1.000, 1.000, 1.000] },
  paladin_protection: { dmg: [1.099, 1.151, 0.796], heal: [1.000, 1.000, 1.000], taken: [1.905, 3.296, 4.000] },
  paladin_retribution: { dmg: [0.782, 0.812, 0.794], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  priest_discipline: { dmg: [1.000, 1.000, 1.000], heal: [1.915, 1.174, 0.527], taken: [1.000, 1.000, 1.000] },
  priest_holy: { dmg: [1.000, 1.000, 1.000], heal: [4.000, 4.000, 4.000], taken: [1.000, 1.000, 1.000] },
  priest_shadow: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_assassin: { dmg: [0.496, 0.472, 0.610], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_outlaw: { dmg: [0.472, 0.385, 0.413], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_subtlety: { dmg: [0.705, 0.560, 0.388], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_elemental: { dmg: [2.567, 3.162, 3.589], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_enhancement: { dmg: [2.536, 1.888, 2.818], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_restoration: { dmg: [1.000, 1.000, 1.000], heal: [4.000, 4.000, 4.000], taken: [1.000, 1.000, 1.000] },
  warlock_affliction: { dmg: [1.247, 1.168, 1.319], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_demonology: { dmg: [0.658, 0.787, 1.001], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_destruction: { dmg: [1.578, 1.117, 1.926], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
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
