/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2 / §3 / §4 SpecDef wiring, §10.1 bar layout). SpecDef rows of the three mage specs,
 * merged into SPECS by data/specs.ts after the talent rows (they replace `mage_fire`, `mage_frost`, `mage_arcane` by id).
 * defaultBar: lmb = the chain, rmb = the filler / builder, q = spender or proc button, e / r = rotational cooldowns,
 * s1 = AoE, s2 = mobility (Blink), s3 = defensive, s4 = Counterspell (KeyG), m45 / m90 / m180 = majors (X V T).
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
    skills: ['mage_pyroblast', 'mage_fire_blast', 'mage_scorch', 'mage_flamestrike', 'mage_combustion'],
    unlock: { mage_fireball: 1, mage_pyroblast: 3, mage_fire_blast: 6, mage_scorch: 10, mage_flamestrike: 12, mage_blazing_barrier: 15, mage_combustion: 20 },
    // the s05 tree row is Anka Alevleri (talent tree, T-step); the kit doc's Meteor-on-s05 needs a tree change
    treeSkills: { mage_phoenix_flames: 's05' },
    majors: { m45: 'mage_meteor', m90: 'mage_combustion', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Ateş Oku' } }],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_pyroblast', e: 'mage_fire_blast', r: 'mage_scorch', s1: 'mage_flamestrike',
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
    skills: ['mage_frostbolt', 'mage_ice_lance', 'mage_flurry', 'mage_ice_barrier', 'mage_ray_of_frost', 'mage_glacial_spike', 'mage_comet_storm'],
    unlock: { mage_frostbolt: 1, mage_ice_lance: 3, mage_flurry: 6, mage_frost_nova: 10, mage_blizzard: 12, mage_ice_barrier: 15, mage_frozen_orb: 20, mage_ray_of_frost: 20 },
    // the s05 tree row is Dondurucu Sağanak (talent tree, T-step); the kit doc's Buz Sarkıtı-on-s05 needs a tree change
    treeSkills: { mage_flurry: 's05' },
    majors: { m45: 'mage_ray_of_frost', m90: 'mage_frozen_orb', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Buz Oku' } }],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_frostbolt', q: 'mage_ice_lance', e: 'mage_flurry', r: 'mage_frost_nova', s1: 'mage_blizzard',
      s2: 'mage_blink', s3: 'mage_ice_barrier', s4: 'mage_counterspell', m45: 'mage_ray_of_frost', m90: 'mage_frozen_orb', m180: 'mage_time_warp',
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
    skills: ['mage_arcane_missiles', 'mage_arcane_barrage', 'mage_arcane_pulse', 'mage_prismatic_barrier'],
    unlock: { mage_arcane_blast: 1, mage_arcane_missiles: 3, mage_arcane_barrage: 6, mage_arcane_orb: 10, mage_arcane_pulse: 12, mage_prismatic_barrier: 15 },
    treeSkills: { mage_arcane_barrage: 's05' },
    majors: { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp' },
    mods: [],
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_arcane_blast', q: 'mage_arcane_missiles', e: 'mage_arcane_barrage', r: 'mage_arcane_orb', s1: 'mage_arcane_pulse',
      s2: 'mage_blink', s3: 'mage_prismatic_barrier', s4: 'mage_counterspell', m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp',
    },
  },
};
