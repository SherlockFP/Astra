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
  archer_beastmaster: { dmg: [0.508, 0.662, 0.832], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_marksman: { dmg: [0.622, 0.767, 0.761], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  archer_survival: { dmg: [1.029, 1.378, 1.193], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_butcher: { dmg: [0.339, 0.369, 0.325], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  barbarian_warlord: { dmg: [0.495, 0.771, 0.349], heal: [1.000, 1.000, 1.000], taken: [0.972, 1.659, 1.045] },
  demonhunter_chaos: { dmg: [0.823, 0.827, 1.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_devourer: { dmg: [1.904, 1.000, 0.969], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  demonhunter_vengeance: { dmg: [1.832, 2.287, 2.096], heal: [1.000, 1.000, 1.000], taken: [0.606, 0.645, 0.609] },
  druid_balance: { dmg: [2.206, 2.011, 0.825], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_feral: { dmg: [1.000, 0.974, 1.220], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  druid_guardian: { dmg: [0.949, 1.591, 2.016], heal: [1.000, 1.000, 1.000], taken: [1.073, 0.943, 1.427] },
  druid_restoration: { dmg: [1.000, 1.000, 1.000], heal: [0.485, 0.463, 0.361], taken: [1.000, 1.000, 1.000] },
  evoker_augmentation: { dmg: [4.000, 4.000, 2.675], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_devastation: { dmg: [3.462, 2.616, 3.639], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  evoker_preservation: { dmg: [1.000, 1.000, 1.000], heal: [0.444, 0.459, 0.374], taken: [1.000, 1.000, 1.000] },
  knight_blademaster: { dmg: [0.374, 0.420, 0.566], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  knight_protector: { dmg: [0.652, 1.874, 2.306], heal: [1.000, 1.000, 1.000], taken: [2.042, 4.000, 4.000] },
  mage_arcane: { dmg: [0.747, 0.762, 0.822], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_fire: { dmg: [3.394, 1.253, 0.891], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  mage_frost: { dmg: [1.041, 1.426, 1.370], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  monk_brewmaster: { dmg: [0.845, 1.115, 1.147], heal: [1.000, 1.000, 1.000], taken: [0.709, 0.750, 0.836] },
  monk_mistweaver: { dmg: [1.000, 1.000, 1.000], heal: [0.947, 0.793, 1.088], taken: [1.000, 1.000, 1.000] },
  monk_windwalker: { dmg: [0.557, 0.650, 0.697], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_bone: { dmg: [2.151, 2.440, 1.591], heal: [1.000, 1.000, 1.000], taken: [0.809, 0.993, 0.789] },
  necromancer_frost: { dmg: [2.202, 4.000, 2.897], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  necromancer_summoner: { dmg: [2.336, 3.653, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  paladin_holy: { dmg: [1.000, 1.000, 1.000], heal: [0.346, 0.445, 0.356], taken: [1.000, 1.000, 1.000] },
  paladin_protection: { dmg: [1.047, 1.586, 0.805], heal: [1.000, 1.000, 1.000], taken: [2.493, 4.000, 4.000] },
  paladin_retribution: { dmg: [0.877, 1.048, 0.868], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  priest_discipline: { dmg: [1.000, 1.000, 1.000], heal: [4.000, 1.870, 0.854], taken: [1.000, 1.000, 1.000] },
  priest_holy: { dmg: [1.000, 1.000, 1.000], heal: [2.140, 1.142, 0.660], taken: [1.000, 1.000, 1.000] },
  priest_shadow: { dmg: [4.000, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_assassin: { dmg: [0.324, 0.448, 0.521], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_outlaw: { dmg: [0.353, 0.426, 0.365], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  rogue_subtlety: { dmg: [0.422, 0.501, 0.271], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_elemental: { dmg: [2.786, 4.000, 4.000], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_enhancement: { dmg: [0.611, 0.756, 1.098], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  shaman_restoration: { dmg: [1.000, 1.000, 1.000], heal: [1.736, 0.938, 1.450], taken: [1.000, 1.000, 1.000] },
  warlock_affliction: { dmg: [1.346, 1.643, 1.599], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_demonology: { dmg: [0.638, 0.982, 1.086], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
  warlock_destruction: { dmg: [1.518, 1.675, 2.203], heal: [1.000, 1.000, 1.000], taken: [1.000, 1.000, 1.000] },
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
