/**
 * KIT APL rows, Barbar (WoW Midnight Warrior): Kasap = Fury, Savaş Lordu = Protection (docs/WOW_ABILITY_MAP.md §3.1, §3.2).
 * Lines are in the A.3 condition DSL, first match wins. Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. OWNER: PM-BA.
 */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_BARBARIAN: Record<string, KitApl> = {
  barbarian_butcher: {
    st: [
      'barbarian_carnage if cd == 0 (with barbarian_avatar)',
      'barbarian_avatar if cd == 0',
      'barbarian_rampage if !status:enrage || resource >= 100',
      'barbarian_execute if status:sudden_death >= 2',
      'barbarian_rampage if resource >= 80',
      'barbarian_execute if status:sudden_death >= 1 || target.hp < 0.35',
      'barbarian_enraged_regeneration if hp < 0.4 && cd == 0',
      'barbarian_raging_blow if charges >= 1   (Kemik Ezici while carnage)',
      'barbarian_bloodthirst if cd == 0   (Kan Banyosu while carnage)',
      'lmb (weapon chain) as filler',
    ],
    aoe: [
      'barbarian_carnage + barbarian_avatar on cd',
      'barbarian_whirlwind if !status:meat_cleaver',
      'barbarian_rampage if resource >= 80 && status:meat_cleaver',
      'barbarian_bloodthirst if status:meat_cleaver',
      'barbarian_raging_blow if status:meat_cleaver',
      'barbarian_execute if status:sudden_death',
      'barbarian_whirlwind (filler)',
      'lmb (weapon chain) as filler',
    ],
  },
  barbarian_warlord: {
    st: [
      'barbarian_iron_stance if !status:iron_stance || remaining:iron_stance < 1.5 || status:gory_iron   (off-GCD, rage reserve 30)',
      'barbarian_blood_shield if hp < 0.55 && cd == 0',
      'barbarian_provoke if cd == 0   (taunt, r key)',
      'barbarian_shield_slam if cd == 0',
      'barbarian_revenge if resource >= 20',
      'barbarian_thunder_clap if cd == 0 && (!status:rend@tgt || targets >= 2)',
      'barbarian_thrash if cd == 0 && (stacks:bleed@tgt < 3 || targets >= 2)',
      'barbarian_maul if status:gory_maul || resource >= 70',
      'barbarian_last_stand if hp < 0.6 && cd == 0',
      'barbarian_incarnation if cd == 0',
      'lmb (weapon chain) as filler',
    ],
    aoe: [
      'barbarian_leap if cd == 0 (pull opener)',
      'barbarian_iron_stance (as ST)',
      'barbarian_thunder_clap if cd == 0',
      'barbarian_thrash if cd == 0',
      'barbarian_revenge if resource >= 40',
      'barbarian_shield_slam if cd == 0',
      'barbarian_maul if status:gory_maul || resource >= 60   (cone, 3 targets)',
      'barbarian_rallying_roar on cd (group)',
      'lmb (weapon chain) as filler',
    ],
  },
};
