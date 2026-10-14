/**
 * WP-02 Keşiş APL rows (docs/GDD_CLASSES_V2.md §2.7 / §2.9). Lines use the A.3 condition DSL, first match wins. `pips:chi` counts
 * Çi (max 5). The last line of each `st` list is the weapon chain (the spec's basic). OWNER: monk package.
 * Mistweaver: a heal priority (no aoe list); its last line is the healer basic (monk_mw_basic).
 */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_MONK: Record<string, KitApl> = {
  // ---- Rüzgâr Yürüyen (DPS): Çi spender loop (§2.7): palm +2, kick -1, rising sun -3 (+1 back after the kick), dragon -2
  monk_windwalker: {
    st: [
      'monk_ww_tigers_fury if cd_ready(monk_ww_tigers_fury) && pips:chi <= 3',
      'monk_ww_storm_earth_fire if cd_ready(monk_ww_storm_earth_fire) && status:tigerfury',
      'monk_rising_sun_kick if cd_ready(monk_rising_sun_kick) && pips:chi >= 3 && !target.status:rising_sun',
      'monk_whirling_dragon if cd_ready(monk_whirling_dragon) && pips:chi >= 2',
      'monk_fists_of_fury if cd_ready(monk_fists_of_fury) && pips:chi >= 3',
      'monk_flying_serpent if cd_ready(monk_flying_serpent) && pips:chi >= 2',
      'monk_blackout_kick if cd_ready(monk_blackout_kick) && pips:chi >= 1',
      'monk_tiger_palm if pips:chi <= 3',
      'monk_chi_torpedo if cd_ready(monk_chi_torpedo)',
      'monk_basic',
    ],
    aoe: [
      'monk_ww_tigers_fury if cd_ready(monk_ww_tigers_fury)',
      'monk_fists_of_fury if cd_ready(monk_fists_of_fury) && pips:chi >= 3',
      'monk_spinning_crane if cd_ready(monk_spinning_crane) && pips:chi >= 2 && targets >= 3',
      'monk_whirling_dragon if cd_ready(monk_whirling_dragon) && pips:chi >= 2',
      'monk_chi_wave if cd_ready(monk_chi_wave) && pips:chi <= 3',
      'monk_blackout_kick if cd_ready(monk_blackout_kick) && pips:chi >= 1',
      'monk_tiger_palm if pips:chi <= 3',
      'monk_basic',
    ],
  },
  // ---- Demci (TANK): Alay Et on cooldown, Fıçı Darbesi (+2 Çi, threat x3) as the generator, Arındırıcı İksir when the pool is up
  monk_brewmaster: {
    st: [
      'monk_provoke if cd_ready(monk_provoke) && !target.status:taunt',
      'monk_bm_fortifying_brew if cd_ready(monk_bm_fortifying_brew) && hp% < 60',
      'monk_bm_black_ox if cd_ready(monk_bm_black_ox)',
      'monk_purifying_brew if charges(monk_purifying_brew) >= 1 && status:stagger_pool',
      'monk_keg_smash if cd_ready(monk_keg_smash)',
      'monk_blackout_kick if cd_ready(monk_blackout_kick) && pips:chi >= 1',
      'monk_tiger_palm if pips:chi <= 3',
      'monk_basic',
    ],
    aoe: [
      'monk_keg_smash if cd_ready(monk_keg_smash)',
      'monk_provoke if cd_ready(monk_provoke) && !target.status:taunt',
      'monk_bm_black_ox if cd_ready(monk_bm_black_ox)',
      'monk_breath_of_fire if cd_ready(monk_breath_of_fire)',
      'monk_purifying_brew if charges(monk_purifying_brew) >= 1 && status:stagger_pool',
      'monk_blackout_kick if cd_ready(monk_blackout_kick) && pips:chi >= 1',
      'monk_tiger_palm if pips:chi <= 3',
      'monk_basic',
    ],
  },
  // ---- Sis Dokuyan (HEALER): HoTs on the lowest ally, Dinginlik Sisi for the rest, Diriliş for a party in need, basic last
  monk_mistweaver: {
    st: [
      'monk_mw_revival if cd_ready(monk_mw_revival) && allies.injured >= 3',
      'monk_mw_thunder_tea if cd_ready(monk_mw_thunder_tea) && ally.low% < 0.4',
      'monk_mw_enveloping_mist if ally.low% < 0.5',
      'monk_mw_renewing_mist if cd_ready(monk_mw_renewing_mist) && ally.low% < 0.9',
      'monk_mw_vivify if allies.injured >= 3',
      'monk_mw_detox if allies.debuffed',
      'monk_mw_soothing_mist if ally.low% < 0.8',
      'monk_essence_font if allies.injured >= 3',
      'monk_mw_basic',
    ],
  },
};
