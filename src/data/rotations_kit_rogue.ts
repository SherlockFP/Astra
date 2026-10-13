/**
 * KIT PK-ROGUE APL rows (docs/kits/casters-rogue.md §6c, §7c, §8c). Lines are in the A.3 condition DSL, first match wins.
 * Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. Owner: combat (data).
 */
/** The healer has no AoE list in docs/kits/casters-rogue.md §8c (ST only). */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_ROGUE: Record<string, KitApl> = {
  rogue_assassin: {
    st: [
      'rogue_deathmark if cd_ready(rogue_deathmark) && target.status:garrote && target.status:rupture',
      'rogue_kingsbane if cd_ready(rogue_kingsbane) && (target.status:deathmark || cd(rogue_deathmark) > 20)',
      'rogue_vanish if cd_ready(rogue_vanish) && cd(rogue_deathmark) < 3 && !status:stealth',
      'rogue_garrote if status:improved_garrote',
      'rogue_garrote if (!target.status:garrote || dot_refresh:garrote) && res >= 20',
      'rogue_rupture if pips:combo >= 5 && (!target.status:rupture || dot_refresh:rupture)',
      'rogue_envenom if pips:combo >= 5',
      'rogue_mutilate if pips:combo <= 3',
      'rogue_envenom if pips:combo >= 4',
      'rogue_mutilate',
      'rogue_basic',
    ],
    aoe: [
      'rogue_deathmark if cd_ready(rogue_deathmark)',
      'rogue_kingsbane if cd_ready(rogue_kingsbane)',
      'rogue_garrote @each if !target.status:garrote && res >= 20',
      'rogue_crimson_tempest if pips:combo >= 4 && targets >= 3',
      'rogue_fan_of_knives if pips:combo < 5',
      'rogue_envenom if pips:combo >= 5 && targets < 3',
      'rogue_basic',
    ],
  },
  rogue_subtlety: {
    st: [
      'rogue_goremaws_bite if cd_ready(rogue_goremaws_bite)',
      'rogue_shadow_dance if pips:combo >= 6 && cd_ready(rogue_secret_technique) && !status:shadow_veil_cd',
      'rogue_shadow_blades if status:shadow_veil_cd && cd_ready(rogue_shadow_blades)',
      'rogue_secret_technique if pips:combo >= 6 && status:shadow_veil_cd',
      'rogue_vanish if cd_ready(rogue_vanish) && pips:combo <= 2 && !status:shadow_veil_cd',
      'rogue_shadowstrike if stealthed',
      'rogue_eviscerate if pips:combo >= 6 && !status:shadow_veil_cd',
      'rogue_secret_technique if pips:combo >= 6 && cd_ready(rogue_secret_technique)',
      'rogue_shadow_step if !behind && cd_ready(rogue_shadow_step)',
      'rogue_backstab',
      'rogue_basic',
    ],
    aoe: [
      'rogue_goremaws_bite if cd_ready(rogue_goremaws_bite)',
      'rogue_shadow_dance if pips:combo >= 6 && cd_ready(rogue_secret_technique)',
      'rogue_shadow_blades if status:shadow_veil_cd',
      'rogue_secret_technique if pips:combo >= 6 && status:shadow_veil_cd',
      'rogue_vanish if cd_ready(rogue_vanish) && pips:combo <= 2 && !status:shadow_veil_cd',
      'rogue_black_powder if pips:combo >= 6 && targets >= 3',
      'rogue_shuriken_storm if targets >= 2',
      'rogue_shadowstrike if stealthed && targets < 3',
      'rogue_basic',
    ],
  },
  rogue_alchemist: {
    st: [
      'rogue_miracle_brew if cd_ready(rogue_miracle_brew) && allies.injured >= 3 && ally.low% < 50',
      'rogue_elixir_of_life if cd_ready(rogue_elixir_of_life) && allies.linked < 3 && allies.injured >= 2',
      'rogue_ascendant_brew if cd_ready(rogue_ascendant_brew) && allies.linked >= 4 && allies.injured >= 3',
      'rogue_mending_draught if ally.low% < 40 && pips:karisim >= 1',
      'rogue_ward_potion if allies.linked < 5',
      'rogue_vial_heal if allies.injured >= 3 && (allies.linked < 4 || status:elixir_ramp)',
      'rogue_antidote if allies.debuffed >= 1',
      'rogue_acid_flask',
      'rogue_vial_throw',
    ],
  },
};
