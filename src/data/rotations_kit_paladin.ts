/**
 * KIT PM-PA APL rows (docs/kits/plate-melee.md §5c Koruma, §6c Kutsal, §7c Ceza). Lines are in the A.3 condition DSL
 * (docs/kits/casters-rogue.md), first match wins, same shape as rotations_kit_knight.ts. Consumed by CM5 (`src/data/rotations.ts`)
 * once it reads the kit tables; dev/combat-sim/kit_paladin.mjs runs the ST lists on a dev dummy. OWNER: PM-PA.
 * Skill names are the ids a bar slot casts: a button transform is written by the id it transforms INTO (`paladin_hammer_of_wrath`,
 * `paladin_hammer_of_light`, `paladin_templar_slash`) and the line is skipped while the slot still holds the base skill.
 * The last line is the weapon chain (`paladin_basic` / `paladin_holy_basic`) with no condition.
 * Grammar extras on top of A.3: `hp% OP N` (own HP in percent, like `res%`), `lmb_step OP N` (the weapon-chain step that comes next, 1-based).
 */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_PALADIN: Record<string, KitApl> = {
  paladin_protection: {
    st: [
      'paladin_prot_ardent if cd_ready(paladin_prot_ardent) && hp% < 40',
      'paladin_prot_bulwark if cd_ready(paladin_prot_bulwark) && hp% < 25',
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath)',
      'paladin_shield_of_righteous if pips:holypower >= 3 && (!status:righteous || pips:holypower >= 5)',
      'paladin_word_of_glory if status:shining_light && hp% < 70',
      'paladin_hammer_of_wrath if (status:wrath_wings || target.hp% < 20) && charges(paladin_hammer_of_wrath) >= 1',
      'paladin_avengers_shield if cd_ready(paladin_avengers_shield)',
      'paladin_judgement if charges(paladin_judgement) >= 1',
      'paladin_blessed_hammer if charges(paladin_blessed_hammer) >= 1',
      'paladin_consecration if cd_ready(paladin_consecration)',
      'paladin_basic',
    ],
    aoe: [
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath)',
      'paladin_consecration if cd_ready(paladin_consecration)',
      'paladin_shield_of_righteous if pips:holypower >= 3 && (!status:righteous || pips:holypower >= 5)',
      'paladin_avengers_shield if cd_ready(paladin_avengers_shield)',
      'paladin_blessed_hammer if charges(paladin_blessed_hammer) >= 1',
      'paladin_hammer_of_wrath if status:wrath_wings && charges(paladin_hammer_of_wrath) >= 1',
      'paladin_judgement if charges(paladin_judgement) >= 1',
      'paladin_basic',
    ],
  },
  paladin_holy: {
    st: [
      'paladin_divine_shield if hp% < 25 && cd_ready(paladin_divine_shield)',
      'paladin_cleanse if allies.debuffed >= 1 && cd_ready(paladin_cleanse)',
      'paladin_divine_toll if cd_ready(paladin_divine_toll) && (allies.injured >= 3 || pips:holypower <= 1)',
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath) && cd(paladin_divine_toll) > 30',
      'paladin_holy_aura_mastery if cd_ready(paladin_holy_aura_mastery) && allies.injured >= 4',
      'paladin_flash_of_light if status:infusion_of_light',
      'paladin_holy_shock if cd_ready(paladin_holy_shock)',
      'paladin_light_of_dawn if pips:holypower >= 3 && allies.injured >= 3',
      'paladin_word_of_glory if pips:holypower >= 5 || (pips:holypower >= 3 && ally.low% < 60)',
      'paladin_holy_light if ally.low% < 35 && !status:infusion_of_light',
      'paladin_flash_of_light if ally.low% < 60',
      'paladin_holy_basic',
    ],
    aoe: [
      'paladin_divine_toll if cd_ready(paladin_divine_toll)',
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath)',
      'paladin_holy_aura_mastery if cd_ready(paladin_holy_aura_mastery) && allies.injured >= 4',
      'paladin_light_of_dawn if pips:holypower >= 3 && allies.injured >= 3',
      'paladin_holy_shock if cd_ready(paladin_holy_shock)',
      'paladin_word_of_glory if pips:holypower >= 3 && ally.low% < 50',
      'paladin_holy_basic',
    ],
  },
  paladin_retribution: {
    st: [
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath)',
      'paladin_ret_execution if cd_ready(paladin_ret_execution)',
      'paladin_hammer_of_light if status:hammer_window && pips:holypower >= 3',
      'paladin_verdict if pips:holypower >= 5 || (pips:holypower >= 4 && lmb_step >= 3)',
      'paladin_wake_of_ashes if cd_ready(paladin_wake_of_ashes) && pips:holypower <= 2',
      'paladin_blade_of_justice if status:art_of_war',
      'paladin_blade_of_justice if cd_ready(paladin_blade_of_justice) && pips:holypower <= 4',
      'paladin_hammer_of_wrath if (status:wrath_wings || target.hp% < 20) && pips:holypower <= 4 && charges(paladin_hammer_of_wrath) >= 1',
      'paladin_judgement if charges(paladin_judgement) >= 1 && pips:holypower <= 4',
      'paladin_verdict if pips:holypower >= 3',
      'paladin_templar_slash if status:templar_combo',
      'paladin_crusader_strike if cd_ready(paladin_crusader_strike)',
      'paladin_basic',
    ],
    aoe: [
      'paladin_avenging_wrath if cd_ready(paladin_avenging_wrath)',
      'paladin_ret_execution if cd_ready(paladin_ret_execution)',
      'paladin_hammer_of_light if status:hammer_window && pips:holypower >= 3',
      'paladin_divine_storm if pips:holypower >= 5 || (pips:holypower >= 3 && targets >= 3)',
      'paladin_wake_of_ashes if cd_ready(paladin_wake_of_ashes) && pips:holypower <= 2',
      'paladin_blade_of_justice if status:art_of_war || cd_ready(paladin_blade_of_justice)',
      'paladin_hammer_of_wrath if charges(paladin_hammer_of_wrath) >= 1',
      'paladin_judgement if charges(paladin_judgement) >= 1',
      'paladin_templar_slash if status:templar_combo',
      'paladin_crusader_strike if cd_ready(paladin_crusader_strike)',
      'paladin_basic',
    ],
  },
};
