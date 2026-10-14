/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2 / §3 / §4 SpecDef wiring; bar layout, unlock levels and majors per
 * docs/WOW_ABILITY_MAP.md §14 and §16). SpecDef rows of the three mage specs, merged into SPECS by data/specs.ts after the
 * talent rows (they replace `mage_fire`, `mage_frost`, `mage_arcane` by id).
 *
 * defaultBar (WoW layout): lmb = the chain (Oto), 1 (rmb) = core builder / filler, 2 (q) = main spender, 3 (e) = second builder,
 * spender or DoT, 4 (r) = long cooldown / filler, 5 (s1) = AoE, Q (s2) = Blink, E (s3) = personal defensive, R (s4) = Counterspell,
 * X / V / T (m45 / m90 / m180) = majors. Time Warp is the T major of all three specs. Displaced skills stay in `skills`, off the bar:
 * Ateş: Ejderha Nefesi on R (cone, 20 s), Canlı Bomba on E (DoT; Ateş Patlaması leaves the bar). Buz: Buz Damarları (Icy Veins) on X
 * (Ray of Frost leaves the bar). Gizem: Büyü Çağırma (Evocation) on R (Gizemli Küre leaves the bar). Level 1 keeps at least 4 usable
 * skills per spec (sim rule: mage.l1), so every level-1 skill stays bound. The second bar does not exist in code yet.
 * OWNER: combat (data).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_MAGE: Partial<Record<SpecId, SpecDef>> = {
  // ---------------------------------------------------------------- Ateş Büyücüsü (§3)
  mage_fire: {
    id: 'mage_fire', classId: 'mage', name: 'Ateş Büyücüsü', role: 'dps',
    desc: 'Ateş kritikleriyle Isınıyor kurar; ikinci kritik Sıcak Seri\'ye döner ve Piroblast anında, bedava dökülür.',
    stats: { fireDamagePct: 0.20, critChance: 0.06, castSpeed: 0.05, burnChance: 0.25 },
    specials: [{
      id: 'trait_pyromancer', params: { streakDur: 8, streakCrit: 0.25, burnCrit: 0.5 },
      desc: 'Bir ateş kritiği Isınıyor başlatır (10 sn). Isınıyor varken bir kritik daha Sıcak Seri\'ye (8 sn) çevirir: Piroblast ve Alev Sütunu anında ve bedava olur, +%25 kritik şansı alır. Kritik olmayan vuruş Isınıyor\'u silmez. Yanma tikleri kritik yapabilir (kritik şansının %50\'si).',
    }],
    skills: ['mage_scorch', 'mage_living_bomb', 'mage_pyroblast', 'mage_fire_blast', 'mage_flamestrike', 'mage_dragons_breath',
      'mage_blazing_barrier', 'mage_phoenix_flames', 'mage_combustion', 'mage_time_warp'],
    unlock: {
      mage_fireball: 1, mage_scorch: 4, mage_living_bomb: 8, mage_pyroblast: 1, mage_fire_blast: 10, mage_flamestrike: 1,
      mage_dragons_breath: 14, mage_blazing_barrier: 1, mage_phoenix_flames: 15, mage_combustion: 20, mage_time_warp: 25,
    },
    // the s05 tree row is Anka Alevleri (talent tree, T-step)
    treeSkills: { mage_phoenix_flames: 's05' },
    majors: { m45: 'mage_meteor', m90: 'mage_combustion', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Ateş Oku (Fire Bolt)' } }],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_pyroblast', e: 'mage_living_bomb', r: 'mage_dragons_breath', s1: 'mage_flamestrike',
      s2: 'mage_blink', s3: 'mage_blazing_barrier', s4: 'mage_counterspell', m45: 'mage_meteor', m90: 'mage_combustion', m180: 'mage_time_warp',
    },
  },

  // ---------------------------------------------------------------- Buz Büyücüsü (§4)
  mage_frost: {
    id: 'mage_frost', classId: 'mage', name: 'Buz Büyücüsü', role: 'dps',
    desc: 'Donma biriktirir; Buz Mızrağı donmuş hedefleri kırar (x3), Buz Parmakları ve Beyin Donması ritmi taşır.',
    stats: { frostDamagePct: 0.20, chilledDamagePct: 0.15, castSpeed: 0.08, ccDurationPct: 0.15 },
    specials: [{
      id: 'trait_cryomancer', params: { fofChance: 0.15, fofMax: 2, fofDur: 15, fofCrit: 0.5 },
      desc: 'Buz isabetleri Buz Parmağı verir (en çok 2, 15 sn). Buz Mızrağı Donmuş hedefe, Buz Parmağı varken veya Donma 6 iken x3 vurur ve +%50 kritik alır. Buz Halkası her donmuş düşman için bir Buz Parmağı verir.',
    }],
    skills: ['mage_frostbolt', 'mage_ice_lance', 'mage_flurry', 'mage_frost_nova', 'mage_ice_barrier', 'mage_ray_of_frost',
      'mage_glacial_spike', 'mage_comet_storm', 'mage_frozen_orb', 'mage_icy_veins', 'mage_time_warp'],
    unlock: {
      mage_frostbolt: 1, mage_ice_lance: 3, mage_frost_nova: 3, mage_flurry: 6, mage_blizzard: 1, mage_ice_barrier: 1,
      mage_glacial_spike: 1, mage_frozen_orb: 20, mage_ray_of_frost: 20, mage_comet_storm: 20, mage_icy_veins: 20, mage_time_warp: 25,
    },
    // the s05 tree row is Dondurucu Sağanak (talent tree, T-step)
    treeSkills: { mage_flurry: 's05' },
    majors: { m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Buz Oku (Ice Bolt)' } }],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_frostbolt', q: 'mage_ice_lance', e: 'mage_flurry', r: 'mage_glacial_spike', s1: 'mage_blizzard',
      s2: 'mage_blink', s3: 'mage_ice_barrier', s4: 'mage_counterspell', m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp',
    },
  },

  // ---------------------------------------------------------------- Gizem Ustası (§2)
  mage_arcane: {
    id: 'mage_arcane', classId: 'mage', name: 'Gizem Ustası', role: 'dps',
    desc: 'Gizem Yükü biriktirir, manayı silaha çevirir; Berrak Zihin ile Arkan Füzeleri bedava atar.',
    stats: { arcaneDamagePct: 0.20, resourceRegenPct: 0.30, castSpeed: 0.05, maxResource: 20 },
    specials: [{
      id: 'trait_arcanist', params: { chargeMax: 4, chargeDmg: 0.12, chargeCost: 0.25, manaFloor: 0.4, manaSlope: 0.003, chargeDecay: 5, chargeDecayDelay: 8 },
      desc: 'Gizem Yükü (0–4): her yük gizem hasarını %12 artırır. Gizem Patlaması ve Prizma Oku her yük için mana maliyetini %25 artırır (Baraj hepsini harcar). Manan %40\'ın üzerinde her %1 için gizem hasarı +%0.3 (tam manada +%18). Yükler 8 sn savaş dışı kalınca 5 sn\'de bir azalır.',
    }],
    skills: ['mage_arcane_missiles', 'mage_arcane_barrage', 'mage_arcane_pulse', 'mage_prismatic_barrier', 'mage_arcane_orb',
      'mage_touch_of_magi', 'mage_arcane_surge', 'mage_evocation', 'mage_time_warp'],
    unlock: {
      mage_arcane_blast: 1, mage_arcane_missiles: 1, mage_arcane_barrage: 6, mage_touch_of_magi: 10, mage_arcane_pulse: 1,
      mage_evocation: 12, mage_prismatic_barrier: 1, mage_arcane_orb: 20, mage_arcane_surge: 20, mage_time_warp: 25,
    },
    treeSkills: { mage_arcane_barrage: 's05' },
    majors: { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp' },
    mods: [],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_arcane_blast', q: 'mage_arcane_missiles', e: 'mage_arcane_barrage', r: 'mage_evocation', s1: 'mage_arcane_pulse',
      s2: 'mage_blink', s3: 'mage_prismatic_barrier', s4: 'mage_counterspell', m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp',
    },
  },
};
