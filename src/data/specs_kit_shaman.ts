/**
 * Şaman SpecDef rows (Elementel, Geliştirme, Restorasyon). Merged into SPECS by data/specs.ts. OWNER: shaman kit.
 * Midnight 12.0 direction (search, see the shaman report): Elementel keeps Maelstrom spenders and totems, Geliştirme is a
 * Maelstrom-stack melee spec, Restorasyon has the Healing Wave / Chain Heal / Riptide core and the Healing Stream Totem.
 * Numbers are the kit's picks (the repo has no shaman GDD); the spec ids and roles are in data/specs.ts.
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_SHAMAN: Partial<Record<SpecId, SpecDef>> = {
  // ---- Elementel (DPS, ranged): Girdap spenders (Toprak Şoku), Lav Patlaması and Alev Şoku, Ateş and Toprak Bağlama totems
  shaman_elemental: {
    id: 'shaman_elemental', classId: 'shaman', name: 'Elementel', role: 'dps',
    desc: 'Girdap biriktirip yıldırım ve lav ile vurur; totemler yanında savaşır, Fırtına Bekçisi ve Yükseliş ile patlarsın.',
    stats: { critChance: 0.05, castSpeed: 0.08 },
    specials: [
      { id: 'trait_elemental', desc: 'Yıldırım Ustası: büyü hasarın %8 artar.', params: { dealtMore: 0.08 } },
    ],
    skills: ['shaman_flame_shock', 'shaman_lava_burst', 'shaman_earth_shock', 'shaman_chain_lightning', 'shaman_totem_fire', 'shaman_totem_earthbind', 'shaman_stormkeeper', 'shaman_ascendance'],
    unlock: {
      shaman_flame_shock: 1, shaman_lava_burst: 10, shaman_earth_shock: 10, shaman_chain_lightning: 15,
      shaman_totem_fire: 10, shaman_totem_earthbind: 15, shaman_stormkeeper: 10, shaman_ascendance: 20,
    },
    majors: { m45: 'shaman_stormkeeper', m90: 'shaman_ascendance' },
    mods: [],
    basic: 'shaman_basic',
    defaultBar: {
      lmb: 'shaman_basic', rmb: 'shaman_lightning_bolt', q: 'shaman_flame_shock', e: 'shaman_lava_burst', s1: 'shaman_earth_shock',
      s2: 'shaman_chain_lightning', s3: 'shaman_totem_fire', r: 'shaman_totem_earthbind',
      m45: 'shaman_stormkeeper', m90: 'shaman_ascendance',
    },
  },

  // ---- Geliştirme (DPS, melee): weapon chain grows Girdap, Fırtına Vuruşu, Girdap Patlaması spends it, Ruh Kurdu Çağrısı
  shaman_enhancement: {
    id: 'shaman_enhancement', classId: 'shaman', name: 'Geliştirme', role: 'dps',
    desc: 'Silahınla yakın dövüşte vurur, Girdap yığınlarını Girdap Patlaması ile harcarsın; Ruh Kurtları seni yalnız bırakmaz.',
    stats: { attackSpeed: 0.08, critChance: 0.05 },
    specials: [
      { id: 'trait_enhancement', desc: 'Girdap Silahı: silah vuruşların Girdap kazandırır.', params: { maelstromOnHit: 1 } },
    ],
    skills: ['shaman_stormstrike', 'shaman_lava_lash', 'shaman_crash_lightning', 'shaman_maelstrom_spender', 'shaman_enh_unleash', 'shaman_feral_spirit'],
    unlock: {
      shaman_stormstrike: 1, shaman_lava_lash: 10, shaman_crash_lightning: 10, shaman_maelstrom_spender: 10,
      shaman_enh_unleash: 10, shaman_feral_spirit: 20,
    },
    majors: { m45: 'shaman_enh_unleash', m90: 'shaman_feral_spirit' },
    mods: [],
    basic: 'shaman_enh_basic',
    defaultBar: {
      lmb: 'shaman_enh_basic', rmb: 'shaman_stormstrike', q: 'shaman_ghost_wolf', e: 'shaman_lava_lash', s1: 'shaman_maelstrom_spender',
      s2: 'shaman_crash_lightning', s3: 'shaman_wind_shear', r: 'shaman_bloodlust',
      m45: 'shaman_enh_unleash', m90: 'shaman_feral_spirit',
    },
  },

  // ---- Restorasyon (HEALER): Şifalı Dalga and Gel-Git Dalgası, Zincir Şifa, Yağmur Fırtınası, Şifa Akıntısı Totemi
  shaman_restoration: {
    id: 'shaman_restoration', classId: 'shaman', name: 'Restorasyon', role: 'healer',
    desc: 'Gel-Git Dalgası ve Zincir Şifa ile grubu ayakta tutar; totemler ve Yağmur Fırtınası ile toplu iyileştirme yaparsın.',
    stats: { healingPct: 0.2, castSpeed: 0.05, resourceRegenPct: 0.2 },
    specials: [
      { id: 'trait_restoration', desc: 'Şifa Akışı: iyileştirmelerin %15 fazla etkili olur.', params: { healMore: 0.15 } },
    ],
    skills: ['shaman_healing_wave', 'shaman_riptide', 'shaman_chain_heal', 'shaman_purify_spirit', 'shaman_stream_totem', 'shaman_healing_rain', 'shaman_nature_swiftness', 'shaman_tide_totem'],
    unlock: {
      shaman_healing_wave: 1, shaman_riptide: 1, shaman_chain_heal: 10, shaman_purify_spirit: 10, shaman_stream_totem: 10,
      shaman_healing_rain: 15, shaman_nature_swiftness: 10, shaman_tide_totem: 20,
    },
    majors: { m45: 'shaman_nature_swiftness', m90: 'shaman_tide_totem' },
    mods: [],
    basic: 'shaman_resto_basic',
    defaultBar: {
      lmb: 'shaman_resto_basic', rmb: 'shaman_healing_wave', q: 'shaman_riptide', e: 'shaman_chain_heal', s1: 'shaman_healing_rain',
      s2: 'shaman_purify_spirit', s3: 'shaman_stream_totem', r: 'shaman_bloodlust',
      m45: 'shaman_nature_swiftness', m90: 'shaman_tide_totem',
    },
  },
};

/** Spec ids of this file (for the sim and the talent tree check). */
export const SHAMAN_KIT_SPEC_IDS: SpecId[] = ['shaman_elemental', 'shaman_enhancement', 'shaman_restoration'];
