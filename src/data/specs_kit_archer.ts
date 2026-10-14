/**
 * WP-02 Okçu kit SpecDefs (docs/GDD_CLASSES_V2.md §3.5 / §3.9, Midnight-aligned). Merged into SPECS by data/specs.ts.
 * Nişancı (archer_marksman), Av Ustası (archer_beastmaster), Hayatta Kalma (archer_survival, melee + explosives + traps).
 * OWNER: archer package. Default bars are the GDD §3.9 rows; the bench (call_pet, snare_trap, hunters_mark ...) is not on the bar.
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_ARCHER: Partial<Record<SpecId, SpecDef>> = {
  // ---- Nişancı (MS, DPS): ranged single target, Keşiş-style pressure from a held draw and Son Atış on marked targets
  archer_marksman: {
    id: 'archer_marksman', classId: 'archer', name: 'Nişancı (Marksmanship)', role: 'dps',
    desc: 'Tek Ok, Tek Hedef. Nişanlı Atış ve Son Atış ile tek hedefi vurur; Avcı İşareti ve Keskin Nişan ile hasarını artırır.',
    stats: { critChance: 0.08, projectileDamagePct: 0.10 },
    specials: [
      { id: 'trait_marksman', desc: 'Keskin Nişancı: kritik şansı +%8, mermi hasarı +%10. Nişanlı Atış %30 daha hızlı çekilir.', params: { chargeSpeed: 0.3, petMult: 0.5 } },
    ],
    skills: ['archer_rapid_fire', 'archer_kill_shot', 'archer_ms_deadeye', 'archer_ms_trueshot', 'archer_arcane_shot'],
    unlock: { archer_rapid_fire: 10, archer_kill_shot: 15, archer_ms_deadeye: 10, archer_ms_trueshot: 20, archer_arcane_shot: 1 },
    majors: { m45: 'archer_ms_deadeye', m90: 'archer_ms_trueshot' },
    mods: [],
    weaponArt: 'wa_piercing_bolt',
    defaultBar: {
      lmb: 'archer_basic', rmb: 'archer_aimed_shot', q: 'archer_arcane_shot', e: 'archer_multishot',
      s1: 'archer_rapid_fire', s2: 'archer_disengage', s3: 'archer_kill_shot', r: 'archer_arrow_storm',
      m45: 'archer_ms_deadeye', m90: 'archer_ms_trueshot',
    },
  },

  // ---- Av Ustası (BM, DPS): the wolf does the work (Av Emri, Zehirli Ok, pack majors)
  archer_beastmaster: {
    id: 'archer_beastmaster', classId: 'archer', name: 'Av Ustası (Beast Mastery)', role: 'dps',
    desc: 'Sürünün Lideri. Yoldaşın Av Emri ile ısırır; Zehirli Ok ve Vahşi Gazap ile yoldaşını ve kendini güçlendirir.',
    stats: { minionDamagePct: 0.40, minionHpPct: 0.30 },
    specials: [
      { id: 'trait_beastmaster', desc: 'Sürü Lideri: yoldaş hasarı +%40, canı +%30.', params: { petBleed: 1, bleedSec: 3 } },
    ],
    skills: ['archer_kill_command', 'archer_serpent_sting', 'archer_bm_bestial_wrath', 'archer_bm_pack_hunt',
      'archer_cobra_shot', 'archer_barbed_shot', 'archer_counter_shot', 'archer_freezing_trap'],
    unlock: { archer_kill_command: 1, archer_serpent_sting: 15, archer_bm_bestial_wrath: 10, archer_bm_pack_hunt: 20,
      archer_cobra_shot: 1, archer_barbed_shot: 10, archer_counter_shot: 1, archer_freezing_trap: 15 },
    majors: { m45: 'archer_bm_bestial_wrath', m90: 'archer_bm_pack_hunt' },
    mods: [],
    weaponArt: 'wa_piercing_bolt',
    defaultBar: {
      lmb: 'archer_basic', rmb: 'archer_cobra_shot', q: 'archer_disengage', e: 'archer_kill_command',
      s3: 'archer_serpent_sting', s4: 'archer_counter_shot', r: 'archer_multishot',
      m45: 'archer_bm_bestial_wrath', m90: 'archer_bm_pack_hunt',
    },
  },

  // ---- Hayatta Kalma (SV, DPS, melee): the trap-and-explosive spec. Wildfire Bomb is the AoE, Raptor Strike the melee spender,
  // Boomstick (m45) the cone. Design of this package (wave 2 seed in the GDD; see the archer report for the Midnight notes).
  archer_survival: {
    id: 'archer_survival', classId: 'archer', name: 'Hayatta Kalma (Survival)', role: 'dps',
    desc: 'Tuzak ve patlayıcılar. Pençe Tuzağı ile köklet, Yangın Bombası ile yak, Yırtıcı Vuruş ve Namlu Patlatıcı ile yakın dövüşte bitir.',
    stats: { maxHpPct: 0.05, trapDamagePct: 0.20 },
    specials: [
      { id: 'trait_survival', desc: 'Tuzakçı: Pençe Tuzağı hasarı +%20; canın %5 fazla.', params: { trapDamagePct: 0.2, maxHpPct: 0.05 } },
    ],
    skills: ['archer_sv_wildfire_bomb', 'archer_sv_raptor_strike', 'archer_sv_boomstick', 'archer_sv_last_stand',
      'archer_coordinated_assault', 'archer_aspect_turtle'],
    unlock: { archer_sv_wildfire_bomb: 1, archer_sv_raptor_strike: 1, archer_sv_boomstick: 10, archer_sv_last_stand: 10,
      archer_coordinated_assault: 20, archer_aspect_turtle: 15 },
    majors: { m45: 'archer_sv_last_stand', m90: 'archer_coordinated_assault' },
    mods: [],
    weaponArt: 'wa_piercing_bolt',
    defaultBar: {
      lmb: 'archer_basic', rmb: 'archer_sv_raptor_strike', q: 'archer_snare_trap', s1: 'archer_sv_wildfire_bomb',
      s2: 'archer_disengage', s3: 'archer_explosive_arrow', r: 'archer_arrow_storm',
      m45: 'archer_sv_last_stand', m90: 'archer_coordinated_assault',
    },
  },
};
