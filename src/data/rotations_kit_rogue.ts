/**
 * HAYDUT APL rows (docs/WOW_ABILITY_MAP.md §15, §16). Lines are in the A.3 condition DSL, first match wins.
 * Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. Owner: combat (data).
 * Only the three WoW specs have rows: the Simyacı healer is removed.
 */
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
  rogue_outlaw: {
    st: [
      'rogue_adrenaline_rush if cd_ready(rogue_adrenaline_rush)',
      'rogue_killing_spree if cd_ready(rogue_killing_spree) && pips:combo <= 4',
      'rogue_roll_the_bones if !status:roll_the_bones && res >= 25',
      'rogue_between_the_eyes if pips:combo >= 5 && !target.status:stun',
      'rogue_slice_and_dice if pips:combo >= 4 && !status:slice_and_dice',
      'rogue_dispatch if pips:combo >= 5',
      'rogue_crossbow_shot if pips:combo <= 4',
      'rogue_sinister_strike',
      'rogue_basic',
    ],
    aoe: [
      'rogue_blade_flurry if cd_ready(rogue_blade_flurry) && targets >= 2',
      'rogue_slice_and_dice if pips:combo >= 4 && !status:slice_and_dice',
      'rogue_between_the_eyes if pips:combo >= 5',
      'rogue_sinister_strike',
      'rogue_basic',
    ],
  },
  rogue_subtlety: {
    st: [
      'rogue_goremaws_bite if cd_ready(rogue_goremaws_bite)',
      'rogue_shadow_dance if pips:combo >= 6 && cd_ready(rogue_secret_technique) && !status:shadow_veil_cd',
      'rogue_shadow_blades if status:shadow_veil_cd && cd_ready(rogue_shadow_blades)',
      'rogue_symbols_of_death if cd_ready(rogue_symbols_of_death) && pips:combo >= 4',
      'rogue_secret_technique if pips:combo >= 6 && status:shadow_veil_cd',
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
      'rogue_black_powder if pips:combo >= 6 && targets >= 3',
      'rogue_shuriken_storm if targets >= 2',
      'rogue_shadowstrike if stealthed && targets < 3',
      'rogue_basic',
    ],
  },
};
