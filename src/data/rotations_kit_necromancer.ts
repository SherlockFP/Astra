/**
 * KIT PM-NE APL rows (docs/kits/plate-melee.md §8c Kemik Muhafızı, §9c Ordu Efendisi). Lines are in the A.3 condition DSL, first match
 * wins (same shape as rotations_kit_knight.ts / rotations_kit_paladin.ts). Consumed by CM5 (`src/data/rotations.ts`) once it reads the
 * kit tables; dev/combat-sim/kit_necro.mjs runs the ST lists on a dev dummy. OWNER: PM-NE.
 * `@tgt` of the source APLs is written as `target.`. The last line is the weapon chain (`necro_blood_basic` / `necro_basic`), no condition.
 * Grammar extras on top of A.3 (same as the knight / paladin rows): `hp% OP N` (own HP in percent), `pips:rune`, `damage_taken_5s > f`.
 * Deviations from the source text (both keep the budget cadence of §8d / §9d):
 *  - Çürüten Darbe is refreshed when the target has NO Çürük Bulaşı stack (or when 5+ runes are idle), not at "< 3": the budget casts it
 *    6 times a minute for 18 Ölüm Kırbacı, a 1:3 cadence that a "< 3" rule would double.
 *  - Kemik Muhafızı's last rune dump (Kalp Darbesi at >= 1 rune) waits while Kemik Zırhı is below 5 charges or about to lapse, so the
 *    second rune for İlik Söken (2 runes) is saved instead of being spent one by one (priority 3 of the source APL keeps the shield up).
 */
import type { KitApl } from './rotations_kit_rogue';

export const ROTATIONS_KIT_NECROMANCER: Record<string, KitApl> = {
  necromancer_bone: {
    st: [
      'necro_vampiric_blood if cd_ready(necro_vampiric_blood) && hp% < 75',
      'necro_death_strike if res >= 75 || (res >= 45 && hp% < 75)',
      'necro_marrowrend if stacks:bone_armor < 5 || remaining:bone_armor < 6',
      'necro_blood_boil if charges(necro_blood_boil) >= 2 || !target.status:blood_plague',
      'necro_dancing_rune_weapon if cd_ready(necro_dancing_rune_weapon) && !status:icebound',
      'necro_heart_strike if pips:rune >= 3',
      'necro_death_strike if res >= 45 && hp% < 90',
      'necro_blood_boil if charges(necro_blood_boil) >= 1',
      'necro_heart_strike if pips:rune >= 1 && stacks:bone_armor >= 5 && remaining:bone_armor >= 6',
      'necro_blood_basic',
    ],
    aoe: [
      'necro_deaths_grip if cd_ready(necro_deaths_grip) && targets >= 3',
      'necro_blood_boil if charges(necro_blood_boil) >= 1 || !target.status:blood_plague',
      'necro_marrowrend if stacks:bone_armor < 5',
      'necro_death_strike if res >= 75 || (res >= 45 && hp% < 75)',
      'necro_dancing_rune_weapon if cd_ready(necro_dancing_rune_weapon) && !status:icebound',
      'necro_heart_strike if pips:rune >= 1',
      'necro_blood_basic',
    ],
  },
  necromancer_summoner: {
    st: [
      'necro_outbreak if !target.status:virulent_plague || target.remaining:virulent_plague < 6.3',
      'necro_dark_transformation if cd_ready(necro_dark_transformation)',
      'necro_army_of_the_dead if cd_ready(necro_army_of_the_dead)',
      'necro_death_coil if status:sudden_doom',
      'necro_festering_strike if target.stacks:vile_contagion <= 0 || (target.stacks:vile_contagion < 3 && pips:rune >= 5)',
      'necro_death_order if status:army && target.stacks:vile_contagion >= 1',
      'necro_scourge_strike if target.stacks:vile_contagion >= 1',
      'necro_death_coil if res >= 30',
      'necro_death_order if status:army',
      'necro_scourge_strike if pips:rune >= 1',
      'necro_basic',
    ],
    aoe: [
      'necro_outbreak if !target.status:virulent_plague',
      'necro_dark_transformation if cd_ready(necro_dark_transformation)',
      'necro_army_of_the_dead if cd_ready(necro_army_of_the_dead)',
      'necro_epidemic if status:sudden_doom || res >= 20',
      'necro_festering_strike if target.stacks:vile_contagion <= 0',
      'necro_death_order if status:army',
      'necro_scourge_strike if pips:rune >= 1',
      'necro_basic',
    ],
  },
  necromancer_frost: {
    st: [
      'necro_pillar_of_frost if cd_ready(necro_pillar_of_frost)',
      'necro_frostwyrms_fury if cd_ready(necro_frostwyrms_fury) && cd_ready(necro_pillar_of_frost)',
      'necro_empower_rune_weapon if cd_ready(necro_empower_rune_weapon) && pips:rune <= 1',
      'necro_obliterate if status:killing_machine',
      'necro_howling_blast if status:rime',
      'necro_chains_of_ice if !target.status:slow',
      'necro_howling_blast if !target.status:frost_fever',
      'necro_frost_strike if res >= 60',
      'necro_obliterate if pips:rune >= 1',
      'necro_frost_strike if res >= 30',
      'necro_basic',
    ],
    aoe: [
      'necro_remorseless_winter if cd_ready(necro_remorseless_winter)',
      'necro_howling_blast if status:rime || pips:rune >= 2',
      'necro_frost_strike if res >= 60',
      'necro_obliterate if pips:rune >= 1',
      'necro_basic',
    ],
  },
};
