/**
 * KIT PM-BA APL rows (docs/kits/plate-melee.md §3c Kasap, §4c Savaş Lordu). Lines are in the A.3 condition DSL, first match wins.
 * Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. OWNER: PM-BA.
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
      'barbarian_axe_throw if !status:rend@tgt || remaining:rend@tgt < 4.5   (also the taunt)',
      'barbarian_thrash if cd == 0 && (stacks:bleed@tgt < 3 || targets >= 2)',
      'barbarian_cleave if status:gore || cd == 0',
      'barbarian_maul if status:gory_maul || resource >= 70',
      'barbarian_last_stand if hp < 0.6 && cd == 0   (never overlap with ancestral_tempest)',
      'barbarian_ancestral_tempest if cd == 0 && targets >= 1',
      'lmb (weapon chain) as filler',
    ],
    aoe: [
      'barbarian_leap if cd == 0 (pull opener)',
      'barbarian_iron_stance (as ST)',
      'barbarian_thrash if cd == 0',
      'barbarian_cleave if status:gore || cd == 0',
      'barbarian_maul if status:gory_maul || resource >= 60   (Raze behaviour: cone 3 targets)',
      'barbarian_ancestral_tempest if cd == 0',
      'barbarian_axe_throw to pick up strays',
      'lmb (weapon chain) as filler',
    ],
  },
};
