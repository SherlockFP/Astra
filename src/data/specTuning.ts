// Per-spec calibration factors (CORE_MECHANICS §1.1 / §5.4, CM1). Players only; neutral = 1 (a spec not listed is 1).
// Written by tools/calibrate-balance.mjs (runs dev/combat-sim/balance.mjs at L60 and tunes to the bands in docs/BALANCE.md).
// One choke point per factor: dmg -> Combat.rollOutgoing, heal -> Combat.healPlayer, taken -> Combat.hitLocalPlayer.
import type { SpecTuning } from '../types/v2';

export const SPEC_TUNING: Record<string, SpecTuning> = {
  archer_beastmaster: { dmg: 1.293, heal: 1.000, taken: 1.000 },
  archer_marksman: { dmg: 0.706, heal: 1.000, taken: 1.000 },
  archer_survival: { dmg: 1.186, heal: 1.000, taken: 1.000 },
  barbarian_butcher: { dmg: 0.271, heal: 1.000, taken: 1.000 },
  barbarian_warlord: { dmg: 0.291, heal: 1.000, taken: 1.000 },
  demonhunter_chaos: { dmg: 1.701, heal: 1.000, taken: 1.000 },
  demonhunter_devourer: { dmg: 0.688, heal: 1.000, taken: 1.000 },
  demonhunter_vengeance: { dmg: 1.732, heal: 1.000, taken: 0.586 },
  druid_balance: { dmg: 0.670, heal: 1.000, taken: 1.000 },
  druid_feral: { dmg: 1.028, heal: 1.000, taken: 1.000 },
  druid_guardian: { dmg: 1.702, heal: 1.000, taken: 4.000 },
  druid_restoration: { dmg: 1.000, heal: 0.288, taken: 1.000 },
  evoker_augmentation: { dmg: 4.000, heal: 1.000, taken: 1.000 },
  evoker_devastation: { dmg: 4.000, heal: 1.000, taken: 1.000 },
  evoker_preservation: { dmg: 1.000, heal: 0.290, taken: 1.000 },
  knight_blademaster: { dmg: 0.762, heal: 1.000, taken: 1.000 },
  knight_protector: { dmg: 1.911, heal: 1.000, taken: 4.000 },
  mage_arcane: { dmg: 0.637, heal: 1.000, taken: 1.000 },
  mage_fire: { dmg: 0.717, heal: 1.000, taken: 1.000 },
  mage_frost: { dmg: 1.151, heal: 1.000, taken: 1.000 },
  monk_brewmaster: { dmg: 0.964, heal: 1.000, taken: 0.723 },
  monk_mistweaver: { dmg: 1.000, heal: 2.596, taken: 1.000 },
  monk_windwalker: { dmg: 0.562, heal: 1.000, taken: 1.000 },
  necromancer_bone: { dmg: 1.946, heal: 1.000, taken: 0.708 },
  necromancer_frost: { dmg: 2.117, heal: 1.000, taken: 1.000 },
  necromancer_summoner: { dmg: 3.079, heal: 1.000, taken: 1.000 },
  paladin_holy: { dmg: 1.000, heal: 0.287, taken: 1.000 },
  paladin_protection: { dmg: 0.747, heal: 1.000, taken: 4.000 },
  paladin_retribution: { dmg: 0.822, heal: 1.000, taken: 1.000 },
  priest_discipline: { dmg: 1.000, heal: 0.542, taken: 1.000 },
  priest_holy: { dmg: 1.000, heal: 4.000, taken: 1.000 },
  priest_shadow: { dmg: 4.000, heal: 1.000, taken: 1.000 },
  rogue_assassin: { dmg: 0.612, heal: 1.000, taken: 1.000 },
  rogue_outlaw: { dmg: 0.415, heal: 1.000, taken: 1.000 },
  rogue_subtlety: { dmg: 0.389, heal: 1.000, taken: 1.000 },
  shaman_elemental: { dmg: 3.607, heal: 1.000, taken: 1.000 },
  shaman_enhancement: { dmg: 0.936, heal: 1.000, taken: 1.000 },
  shaman_restoration: { dmg: 1.000, heal: 2.982, taken: 1.000 },
  warlock_affliction: { dmg: 1.326, heal: 1.000, taken: 1.000 },
  warlock_demonology: { dmg: 1.000, heal: 1.000, taken: 1.000 },
  warlock_destruction: { dmg: 1.935, heal: 1.000, taken: 1.000 },
};

/** The factor `key` for an actor: only a player with a spec is tuned; everything else (enemies, minions, environment) is 1. */
export function tuneOf(a: { kind?: string; spec?: string | null } | null | undefined, key: keyof SpecTuning): number {
  if (!a || a.kind !== 'player' || !a.spec) return 1;
  return SPEC_TUNING[a.spec]?.[key] ?? 1;
}
