/**
 * KIT PM-KN APL rows (docs/kits/plate-melee.md §1c Kılıç Ustası, §2c Koruyucu). Lines are in the A.3 condition DSL, first match
 * wins (same shape as rotations_kit_rogue.ts). Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. OWNER: PM-KN.
 * `lmb` of the source APLs is the weapon chain: `knight_basic`. `@tgt` is written as `target.` (the DSL of the rogue rows).
 */
import type { KitApl } from './rotations_kit_rogue';

export const ROTATIONS_KIT_KNIGHT: Record<string, KitApl> = {
  knight_blademaster: {
    st: [
      'knight_rend if (!target.status:rend || dot_refresh:rend)',
      'knight_avatar if cd_ready(knight_avatar) && (target.status:colossus || cd(knight_colossus_smash) > 5)',
      'knight_colossus_smash if cd_ready(knight_colossus_smash)',
      'knight_execute if status:sudden_death >= 2',
      'knight_mortal_strike if res >= 25',
      'knight_execute if status:sudden_death >= 1 || (target.hp < 0.20 && res >= 25)',
      'knight_overpower if charges(knight_overpower) >= 1',
      'knight_bladestorm if cd_ready(knight_bladestorm) && status:avatar',
      'knight_basic',
    ],
    aoe: [
      'knight_colossus_smash if cd_ready(knight_colossus_smash)',
      'knight_avatar if cd_ready(knight_avatar)',
      'knight_bladestorm if cd_ready(knight_bladestorm) && targets >= 4',
      'knight_radiant_cleave if res >= 20 && !status:sweeping',
      'knight_mortal_strike if status:sweeping && res >= 25',
      'knight_execute if status:sudden_death >= 1',
      'knight_overpower if charges(knight_overpower) >= 1',
      'knight_radiant_cleave if res >= 20',
      'knight_basic',
    ],
  },
  knight_protector: {
    st: [
      'knight_shield_block if charges(knight_shield_block) >= 2 || (!status:shield_block && charges(knight_shield_block) >= 1)',
      'knight_ward_of_oath if res >= 70 || (res >= 35 && !status:oath_ward && damage_taken_5s > 0.15)',
      'knight_challenge if cd_ready(knight_challenge)',
      'knight_charge if cd_ready(knight_charge) && !status:revenge_ready',
      'knight_shield_bash if cd_ready(knight_shield_bash)',
      'knight_revenge if status:revenge_ready || res >= 60',
      'knight_thunder_clap if cd_ready(knight_thunder_clap) && (!target.status:rend || targets >= 2)',
      'knight_avatar if cd_ready(knight_avatar)',
      'knight_basic',
    ],
    aoe: [
      'knight_charge if cd_ready(knight_charge)',
      'knight_challenge if cd_ready(knight_challenge)',
      'knight_shield_block if charges(knight_shield_block) >= 2 || (!status:shield_block && charges(knight_shield_block) >= 1)',
      'knight_thunder_clap if cd_ready(knight_thunder_clap)',
      'knight_revenge if status:revenge_ready || res >= 40',
      'knight_shield_bash if cd_ready(knight_shield_bash)',
      'knight_ward_of_oath if res >= 70',
      'knight_basic',
    ],
  },
};
