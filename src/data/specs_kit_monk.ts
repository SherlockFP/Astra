/**
 * WP-02 Keşiş kit SpecDefs (docs/GDD_CLASSES_V2.md §2.5 / §2.9 / §2.10, Midnight-aligned). Merged into SPECS by data/specs.ts.
 * Demci (monk_brewmaster, tank), Rüzgâr Yürüyen (monk_windwalker, DPS), Sis Dokuyan (monk_mistweaver, healer). OWNER: monk package.
 * The three specs have no hero layer here (the talent system has no hero trees; Midnight hero trees are not modelled).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_MONK: Partial<Record<SpecId, SpecDef>> = {
  // ---- Demci (TANK): Sarsma pool (§1.11), Fıçı Darbesi threat, Arındırıcı İksir purge
  monk_brewmaster: {
    id: 'monk_brewmaster', classId: 'monk', name: 'Demci', role: 'tank',
    desc: 'Ertelenmiş Hasar: alınan hasarın bir kısmı Sarsma havuzuna gider ve yavaşça sızar. Fıçı Darbesi ile tehdit üretir, Arındırıcı İksir ile havuzu boşaltırsın.',
    stats: { maxHpPct: 0.30, armorPct: 0.25, dodgeChance: 0.08, threatPct: 1.5 },
    specials: [
      { id: 'trait_brewmaster', desc: 'Ertelenmiş Hasar: alınan hasarın %40\'ı Sarsma havuzuna gider (havuz yarılanma süresi ~4 sn); başarılı parry havuzun %15\'ini temizler.', params: { moreDamage: 0.75, staggerAbsorb: 0.4, parryPurge: 0.15 } },
    ],
    skills: ['monk_provoke', 'monk_keg_smash', 'monk_purifying_brew', 'monk_bm_fortifying_brew', 'monk_bm_black_ox'],
    unlock: {
      monk_provoke: 10, monk_keg_smash: 10, monk_purifying_brew: 15,
      monk_bm_fortifying_brew: 10, monk_bm_black_ox: 20,
    },
    majors: { m45: 'monk_bm_fortifying_brew', m90: 'monk_bm_black_ox' },
    // threat: tiger palm x1.5, blackout kick x1.3 (GDD §2.5). The keg's threatMult 3 is in its own params.
    mods: [
      { skill: 'monk_tiger_palm', params: { threatMult: 1.5 } },
      { skill: 'monk_blackout_kick', params: { threatMult: 1.3 } },
    ],
    guard: { gauge: 80, arc: 120, blockAmount: 0.4 },
    weaponArt: 'wa_tiger_barrage',
    defaultBar: {
      lmb: 'monk_basic', rmb: 'monk_tiger_palm', q: 'monk_chi_torpedo', e: 'monk_keg_smash', s1: 'monk_blackout_kick',
      s2: 'monk_purifying_brew', s3: 'monk_provoke', r: 'monk_fists_of_fury',
      m45: 'monk_bm_fortifying_brew', m90: 'monk_bm_black_ox',
    },
  },

  // ---- Rüzgâr Yürüyen (DPS): Çi spender loop, Doğan Güneş / Dönen Ejder, Kaplan Öfkesi and Fırtına
  monk_windwalker: {
    id: 'monk_windwalker', classId: 'monk', name: 'Rüzgâr Yürüyen', role: 'dps',
    desc: 'Hiç Durmayan Yumruk: Çi harcayan zincirlerle sürekli vurur, Kaplan Öfkesi ve Fırtına, Toprak ve Ateş ile patlar.',
    stats: { attackSpeed: 0.12, critChance: 0.05 },
    specials: [
      { id: 'trait_windwalker', desc: 'Rüzgâr Yolu: her temel adım ve Kaplan Avucu %12 ihtimalle bir sonraki Kara Tekme\'yi bedava ve anında yapar.', params: { comboBreaker: 0.12 } },
    ],
    skills: ['monk_rising_sun_kick', 'monk_whirling_dragon', 'monk_ww_tigers_fury', 'monk_ww_storm_earth_fire'],
    unlock: { monk_rising_sun_kick: 10, monk_whirling_dragon: 15, monk_ww_tigers_fury: 10, monk_ww_storm_earth_fire: 20 },
    majors: { m45: 'monk_ww_tigers_fury', m90: 'monk_ww_storm_earth_fire' },
    mods: [],
    guard: { gauge: 60, arc: 120, blockAmount: 0.4 },
    weaponArt: 'wa_tiger_barrage',
    defaultBar: {
      lmb: 'monk_basic', rmb: 'monk_tiger_palm', q: 'monk_chi_torpedo', e: 'monk_spinning_crane', s1: 'monk_blackout_kick',
      s2: 'monk_rising_sun_kick', s3: 'monk_flying_serpent', r: 'monk_fists_of_fury',
      m45: 'monk_ww_tigers_fury', m90: 'monk_ww_storm_earth_fire',
    },
  },

  // ---- Sis Dokuyan (HEALER, wave 2 seed §2.10): Sis HoTs, Dinginlik Sisi channel, Diriliş. Passive numbers from §2.10.
  monk_mistweaver: {
    id: 'monk_mistweaver', classId: 'monk', name: 'Sis Dokuyan', role: 'healer',
    desc: 'Sis Örgüsü: Sis HoT\'ları ve Dinginlik Sisi ile grubu ayakta tutar; Diriliş ile toplu iyileştirme yapar.',
    stats: { healingPct: 0.30, resourceRegenPct: 0.25, castSpeed: 0.10, threatPct: -0.4 },
    specials: [
      { id: 'trait_mistweaver', desc: 'Sis Örgüsü: vuruşların %60 ile hasar verir; fazla iyileşme koruyucu kalkana döner (%40); Kara Tekme ve Dönen Turna, bir sis ile en düşük canlı müttefiki iyileştirir (vuruş hasarının %40\'ı).', params: { moreDamage: 0.6, overhealWard: 0.4, smartHeal: 1, mistLeech: 0.4 } },
    ],
    skills: ['monk_mw_soothing_mist', 'monk_mw_renewing_mist', 'monk_mw_detox', 'monk_mw_enveloping_mist', 'monk_mw_vivify', 'monk_mw_thunder_tea', 'monk_mw_revival'],
    unlock: {
      monk_mw_basic: 1, monk_mw_soothing_mist: 10, monk_mw_renewing_mist: 10, monk_mw_detox: 12, monk_mw_enveloping_mist: 15,
      monk_mw_vivify: 15, monk_mw_thunder_tea: 10, monk_mw_revival: 20,
    },
    majors: { m45: 'monk_mw_thunder_tea', m90: 'monk_mw_revival' },
    mods: [],
    basic: 'monk_mw_basic',
    weaponArt: 'wa_tiger_barrage',
    defaultBar: {
      lmb: 'monk_mw_basic', rmb: 'monk_mw_renewing_mist', q: 'monk_mw_soothing_mist', e: 'monk_mw_enveloping_mist',
      s1: 'monk_mw_vivify', s2: 'monk_mw_detox', s3: 'monk_chi_wave', r: 'monk_tigers_lust',
      m45: 'monk_mw_thunder_tea', m90: 'monk_mw_revival',
    },
  },
};

/** Spec ids of this file (for the sim and the talent tree check). */
export const MONK_KIT_SPEC_IDS: SpecId[] = ['monk_brewmaster', 'monk_windwalker', 'monk_mistweaver'];
