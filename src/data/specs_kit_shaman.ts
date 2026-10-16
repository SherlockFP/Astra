/**
 * Şaman SpecDef rows (Elementel, Geliştirme, Restorasyon). Merged into SPECS by data/specs.ts. OWNER: shaman kit.
 * Bars follow docs/WOW_ABILITY_MAP.md section 16 (1 rmb, 2 q, 3 e, 4 r, 5 s1, Q s2, E s3, R s4, X/V/T majors). Spec roles and
 * ids are in data/specs.ts. Numbers are the kit's picks (the repo has no shaman GDD).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_SHAMAN: Partial<Record<SpecId, SpecDef>> = {
  // ---- Elementel (DPS, ranged): Lava Burst / Flame Shock / Earth Shock / Chain Lightning, Fire Elemental (r), Stormkeeper (X), Ascendance (V), Earth Elemental (T)
  shaman_elemental: {
    id: 'shaman_elemental', classId: 'shaman', name: 'Elementel', role: 'dps',
    desc: 'Girdap biriktirip yıldırım ve lav ile vurur; elementaller yanında savaşır, Fırtına Bekçisi ve Yükseliş ile patlarsın.',
    stats: { critChance: 0.05, castSpeed: 0.08 },
    specials: [
      { id: 'trait_elemental', desc: 'Yıldırım Ustası: büyü hasarın %8 artar.', params: { dealtMore: 0.08 } },
    ],
    // Lav Dalgası: a Alev Şoku cast has a 30 % chance (2 s icd) to make the next Lav Patlaması instant
    fx: 'T cast:shaman_flame_shock ch=.3 icd=2 => st(self,lava_surge,8)',
    skills: [
      'shaman_flame_shock', 'shaman_lava_burst', 'shaman_earth_shock', 'shaman_chain_lightning', 'shaman_elemental_blast', 'shaman_earthquake',
      'shaman_totem_earthbind', 'shaman_stormkeeper', 'shaman_totem_fire', 'shaman_ascendance', 'shaman_earth_elemental',
    ],
    unlock: {
      shaman_flame_shock: 1, shaman_lava_burst: 1, shaman_earth_shock: 10, shaman_chain_lightning: 15, shaman_elemental_blast: 20,
      shaman_earthquake: 20, shaman_totem_earthbind: 15, shaman_stormkeeper: 10, shaman_totem_fire: 20, shaman_ascendance: 20,
      shaman_earth_elemental: 25,
    },
    majors: { m45: 'shaman_stormkeeper', m90: 'shaman_ascendance', m180: 'shaman_earth_elemental' },
    mods: [],
    basic: 'shaman_basic',
    defaultBar: {
      lmb: 'shaman_basic', rmb: 'shaman_lightning_bolt', q: 'shaman_flame_shock', e: 'shaman_lava_burst', s1: 'shaman_earth_shock',
      s2: 'shaman_ghost_wolf', s3: 'shaman_astral_shift', r: 'shaman_totem_fire', s4: 'shaman_wind_shear',
      m45: 'shaman_stormkeeper', m90: 'shaman_ascendance', m180: 'shaman_earth_elemental',
    },
  },

  // ---- Geliştirme (DPS, melee): Stormstrike, Lava Lash, Crash Lightning, Maelstrom Weapon, Doom Winds (X), Feral Spirit (V), Ascendance (T)
  shaman_enhancement: {
    id: 'shaman_enhancement', classId: 'shaman', name: 'Geliştirme', role: 'dps',
    desc: 'Silahınla yakın dövüşte vurur, Girdap yığınlarını Girdap Patlaması ile harcarsın; Ruh Kurtları seni yalnız bırakmaz.',
    stats: { attackSpeed: 0.08, critChance: 0.05 },
    specials: [
      { id: 'trait_enhancement', desc: 'Girdap Silahı: silah vuruşların Girdap kazandırır.', params: { maelstromOnHit: 1 } },
    ],
    // Rüzgar Silahı: a melee hit has a 20 % chance (1 s icd) to empower the next Fırtına Vuruşu
    fx: 'T hit:@melee ch=.2 icd=1 => st(self,windfury,6)',
    skills: [
      'shaman_stormstrike', 'shaman_lava_lash', 'shaman_crash_lightning', 'shaman_maelstrom_spender', 'shaman_frost_shock',
      'shaman_enh_unleash', 'shaman_feral_spirit', 'shaman_enh_ascendance',
    ],
    unlock: {
      shaman_stormstrike: 1, shaman_lava_lash: 10, shaman_crash_lightning: 10, shaman_maelstrom_spender: 1, shaman_frost_shock: 10,
      shaman_enh_unleash: 10, shaman_feral_spirit: 20, shaman_enh_ascendance: 25,
    },
    majors: { m45: 'shaman_enh_unleash', m90: 'shaman_feral_spirit', m180: 'shaman_enh_ascendance' },
    mods: [],
    basic: 'shaman_enh_basic',
    defaultBar: {
      lmb: 'shaman_enh_basic', rmb: 'shaman_stormstrike', q: 'shaman_ghost_wolf', e: 'shaman_lava_lash', r: 'shaman_bloodlust',
      s1: 'shaman_maelstrom_spender', s2: 'shaman_crash_lightning', s3: 'shaman_astral_shift', s4: 'shaman_wind_shear',
      m45: 'shaman_enh_unleash', m90: 'shaman_feral_spirit', m180: 'shaman_enh_ascendance',
    },
  },

  // ---- Restorasyon (HEALER): Healing Wave (rmb), Riptide (Q-slot q), Chain Heal, Healing Rain, Purify Spirit, Healing Stream Totem, Nature's Swiftness, Healing Tide Totem
  shaman_restoration: {
    id: 'shaman_restoration', classId: 'shaman', name: 'Restorasyon', role: 'healer',
    desc: 'Gel-Git Dalgası ve Zincir Şifa ile grubu ayakta tutar; totemler ve Şifa Yağmuru ile toplu iyileştirme yaparsın.',
    stats: { healingPct: 0.2, castSpeed: 0.05, resourceRegenPct: 0.2 },
    specials: [
      { id: 'trait_restoration', desc: 'Şifa Akışı: iyileştirmelerin %15 fazla etkili olur.', params: { healMore: 0.15 } },
    ],
    skills: ['shaman_spirit_link', 'shaman_earthen_wall', 
      'shaman_healing_wave', 'shaman_riptide', 'shaman_chain_heal', 'shaman_purify_spirit', 'shaman_stream_totem', 'shaman_healing_rain',
      'shaman_nature_swiftness', 'shaman_tide_totem',
    ],
    unlock: { shaman_spirit_link: 20, shaman_earthen_wall: 16, 
      shaman_healing_wave: 1, shaman_riptide: 1, shaman_chain_heal: 1, shaman_purify_spirit: 10, shaman_stream_totem: 10,
      shaman_healing_rain: 15, shaman_nature_swiftness: 10, shaman_tide_totem: 20,
    },
    majors: { m45: 'shaman_nature_swiftness', m90: 'shaman_tide_totem' },
    mods: [],
    basic: 'shaman_resto_basic',
    defaultBar: {
      lmb: 'shaman_resto_basic', rmb: 'shaman_healing_wave', q: 'shaman_riptide', e: 'shaman_lightning_bolt', r: 'shaman_wind_shear',
      s1: 'shaman_chain_heal', s2: 'shaman_healing_rain', s3: 'shaman_astral_shift', s4: 'shaman_bloodlust',
      m45: 'shaman_nature_swiftness', m90: 'shaman_tide_totem', m180: 'shaman_earthen_wall',
    },
  },
};

/** Spec ids of this file (for the sim and the talent tree check). */
export const SHAMAN_KIT_SPEC_IDS: SpecId[] = ['shaman_elemental', 'shaman_enhancement', 'shaman_restoration'];
