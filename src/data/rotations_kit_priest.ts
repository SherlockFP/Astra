/**
 * Rahip APL rows (same shape as rotations_kit_monk.ts: the A.3 condition DSL, first match wins; the last `st` line is the spec's
 * basic). `pips:insanity` counts Delilik in internal units (max 100, 20 per shown pip). OWNER: priest kit.
 * Healers: a heal priority with the Atonement or HoT rows first; the `aoe` list is the group version of the damage rotation.
 */
import type { KitApl } from './rotations_kit_monk';

export const ROTATIONS_KIT_PRIEST: Record<string, KitApl> = {
  // ---- Disiplin (HEALER): Evangelism and Vecd on the group, Tövbe and Güç Işıması keep Keffara up, Güç Kalkanı and Hızlı Şifa on injured allies
  priest_discipline: {
    st: [
      'priest_disc_rapture if cd_ready(priest_disc_rapture) && allies.injured >= 4',
      'priest_disc_evangelism if cd_ready(priest_disc_evangelism) && allies.injured >= 2',
      'priest_disc_power_infusion if cd_ready(priest_disc_power_infusion)',
      'priest_disc_pain_suppression if cd_ready(priest_disc_pain_suppression) && ally.low% < 0.4',
      'priest_desperate_prayer if cd_ready(priest_desperate_prayer) && hp% < 35',
      'priest_power_word_shield if cd_ready(priest_power_word_shield) && ally.low% < 0.8',
      'priest_renew if !status:renew && ally.low% < 0.9',
      'priest_flash_heal if ally.low% < 0.6',
      'priest_disc_radiance if cd_ready(priest_disc_radiance) && allies.injured >= 2',
      'priest_disc_penance if cd_ready(priest_disc_penance)',
      'priest_smite if allies.injured == 0',
      'priest_basic',
    ],
    aoe: [
      'priest_disc_rapture if cd_ready(priest_disc_rapture)',
      'priest_disc_radiance if cd_ready(priest_disc_radiance)',
      'priest_disc_penance if cd_ready(priest_disc_penance)',
      'priest_power_word_shield if cd_ready(priest_power_word_shield) && ally.low% < 0.9',
      'priest_smite',
      'priest_basic',
    ],
  },
  // ---- Kutsal (HEALER): Kutsal Söz on emergencies, Şifa Duası and Şifa Çemberi for groups, Onarım Duası on injured allies, Yenileme on the rest, holy basic last
  priest_holy: {
    st: [
      'priest_holy_hymn if cd_ready(priest_holy_hymn) && allies.injured >= 3',
      'priest_holy_guardian if cd_ready(priest_holy_guardian) && ally.low% < 0.3',
      'priest_holy_serenity if cd_ready(priest_holy_serenity) && ally.low% < 0.4',
      'priest_holy_sanctify if cd_ready(priest_holy_sanctify) && allies.injured >= 3',
      'priest_holy_prayer if allies.injured >= 3',
      'priest_holy_circle if cd_ready(priest_holy_circle) && allies.injured >= 2',
      'priest_holy_mending if allies.injured >= 2',
      'priest_desperate_prayer if cd_ready(priest_desperate_prayer) && hp% < 35',
      'priest_renew if !status:renew && ally.low% < 0.9',
      'priest_flash_heal if ally.low% < 0.7',
      'priest_dispel if allies.debuffed',
      'priest_holy_basic',
    ],
    aoe: [
      'priest_holy_sanctify if cd_ready(priest_holy_sanctify)',
      'priest_holy_prayer',
      'priest_holy_circle if cd_ready(priest_holy_circle)',
      'priest_holy_mending',
      'priest_holy_basic',
    ],
  },
  // ---- Gölge (DPS): Boşluk Formu and Gölge Canavarı on cooldown, Delilik spent on Boşluk Oku and Yiyici Veba, acılar and Zihin Patlaması, Zihin Sızması filler
  priest_shadow: {
    st: [
      'priest_shadow_voidform if cd_ready(priest_shadow_voidform) && pips:insanity >= 40',
      'priest_shadow_fiend if cd_ready(priest_shadow_fiend)',
      'priest_shadow_dispersion if cd_ready(priest_shadow_dispersion) && hp% < 35',
      'priest_shadow_void_bolt if cd_ready(priest_shadow_void_bolt) && pips:insanity >= 40',
      'priest_shadow_devouring if pips:insanity >= 50 && !target.status:devouring_plague',
      'priest_shadow_swp if !target.status:shadow_word_pain',
      'priest_shadow_vt if !target.status:vampiric_touch',
      'priest_shadow_death if cd_ready(priest_shadow_death)',
      'priest_shadow_mind_blast if cd_ready(priest_shadow_mind_blast)',
      'priest_shadow_mind_flay',
      'priest_basic',
    ],
    aoe: [
      'priest_shadow_voidform if cd_ready(priest_shadow_voidform) && pips:insanity >= 40',
      'priest_shadow_void_bolt if cd_ready(priest_shadow_void_bolt) && pips:insanity >= 40',
      'priest_shadow_devouring if pips:insanity >= 50 && !target.status:devouring_plague',
      'priest_shadow_swp if !target.status:shadow_word_pain',
      'priest_shadow_mind_blast if cd_ready(priest_shadow_mind_blast)',
      'priest_psychic_scream if cd_ready(priest_psychic_scream)',
      'priest_shadow_mind_flay',
      'priest_basic',
    ],
  },
};
