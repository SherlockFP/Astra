/**
 * WP-02 Okçu APL rows (docs/GDD_CLASSES_V2.md §3.7 combo routes and the §3.9 bars). Lines use the A.3 condition DSL, first match wins.
 * `res` is the Odak pool. archer_call_pet is not in the lines: its recast dismisses a healthy pet, so the player casts it by hand.
 * OWNER: archer package.
 */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_ARCHER: Record<string, KitApl> = {
  archer_marksman: {
    st: [
      'archer_hunters_mark if cd_ready(archer_hunters_mark) && !target.status:hunters_mark',
      'archer_ms_deadeye if cd_ready(archer_ms_deadeye) && res >= 60',
      'archer_ms_trueshot if cd_ready(archer_ms_trueshot) && status:deadeye',
      'archer_kill_shot if target.hp% < 25 || target.status:hunters_mark',
      'archer_rapid_fire if cd_ready(archer_rapid_fire) && res >= 90 && !moving',
      'archer_explosive_arrow if cd_ready(archer_explosive_arrow) && target.status:root',
      'archer_snare_trap if cd_ready(archer_snare_trap) && !target.status:root',
      'archer_aimed_shot if res >= 25',
      'archer_basic',
    ],
    aoe: [
      'archer_arrow_storm if cd_ready(archer_arrow_storm) && targets >= 3',
      'archer_multishot if targets >= 3 && res >= 30',
      'archer_snare_trap if cd_ready(archer_snare_trap) && targets >= 2',
      'archer_basic',
    ],
  },

  archer_beastmaster: {
    st: [
      'archer_bm_bestial_wrath if cd_ready(archer_bm_bestial_wrath)',
      'archer_bm_pack_hunt if cd_ready(archer_bm_pack_hunt)',
      'archer_kill_command if cd_ready(archer_kill_command)',
      'archer_serpent_sting if cd_ready(archer_serpent_sting) && !target.status:poison',
      'archer_snare_trap if cd_ready(archer_snare_trap)',
      'archer_arrow_storm if cd_ready(archer_arrow_storm) && targets >= 3',
      'archer_aimed_shot if res >= 25',
      'archer_basic',
    ],
    aoe: [
      'archer_bm_pack_hunt if cd_ready(archer_bm_pack_hunt)',
      'archer_bm_bestial_wrath if cd_ready(archer_bm_bestial_wrath)',
      'archer_arrow_storm if cd_ready(archer_arrow_storm)',
      'archer_multishot if res >= 30',
      'archer_kill_command if cd_ready(archer_kill_command)',
      'archer_basic',
    ],
  },

  archer_survival: {
    st: [
      'archer_sv_last_stand if cd_ready(archer_sv_last_stand) && hp% < 50',
      'archer_sv_boomstick if cd_ready(archer_sv_boomstick)',
      'archer_snare_trap if cd_ready(archer_snare_trap) && !target.status:root',
      'archer_explosive_arrow if cd_ready(archer_explosive_arrow) && target.status:root',
      'archer_sv_wildfire_bomb if cd_ready(archer_sv_wildfire_bomb) && !target.status:burn',
      'archer_sv_raptor_strike if res >= 20',
      'archer_aimed_shot if res >= 25',
      'archer_basic',
    ],
    aoe: [
      'archer_sv_wildfire_bomb if cd_ready(archer_sv_wildfire_bomb)',
      'archer_snare_trap if cd_ready(archer_snare_trap) && targets >= 2',
      'archer_arrow_storm if cd_ready(archer_arrow_storm) && targets >= 3',
      'archer_multishot if res >= 30',
      'archer_basic',
    ],
  },
};
