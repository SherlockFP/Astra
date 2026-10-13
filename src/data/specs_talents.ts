/**
 * GDD_TALENTS spec data: SpecDefs of the 21-spec list (mage_fire / mage_frost / mage_arcane first, §1.3.1) and the pip
 * definitions of the new pips. OWNER: combat (T8). `TALENT_SPECS` is merged into SPECS in data/specs.ts.
 *
 * The mage specs reference skill ids that have no SkillDef yet (V2 WP5 rows, not written by any wave so far):
 * mage_flame_wave (fire core skill + Ateş unlock), mage_ice_lance (Buz core skill), mage_icy_veins (Buz m45),
 * mage_combustion (Ateş m90), mage_time_warp (m180, all three). Those slots stay empty until the rows exist.
 */
import type { SpecDef } from '../types/v2';
import type { PipDef } from '../types/classes';
import type { PipId } from '../types/common';

export const TALENT_SPECS: Partial<Record<string, SpecDef>> = {
  // ---------------------------------------------------------------- Ateş Büyücüsü
  mage_fire: {
    id: 'mage_fire', classId: 'mage', name: 'Ateş Büyücüsü', role: 'dps',
    desc: 'Art arda kritiklerle Sıcak Seri kurar; yanmayı sürüye yayar.',
    stats: { fireDamagePct: 0.20, critChance: 0.06, castSpeed: 0.05, burnChance: 0.25 },
    specials: [{
      id: 'trait_pyromancer', params: { streakCrits: 2, streakDur: 8, streakIcd: 0, streakCrit: 0.25, burnCrit: 0.5 },
      desc: 'Art arda 2 ateş kritiği 8 sn Sıcak Seri verir: sonraki Alev Dalgası, Meteor ve Anka Alevleri anında dökülür, mana harcamaz ve +%25 kritik şansı alır. Yanma tikleri kritik yapabilir (kritik şansının %50\'si).',
    }],
    skills: ['mage_flame_wave'], unlock: { mage_flame_wave: 10 }, treeSkills: { mage_phoenix_flames: 's05' },
    majors: { m45: 'mage_blazing_barrier', m90: 'mage_combustion', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Ateş Oku' } }],
    fx: 'M mage_basic cv=fire:1 ;; M mage_fireball dotx=1.4 ;; M mage_blink cd=-1',
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_flame_wave',
      s3: 'mage_phoenix_flames', r: 'mage_arcane_cataclysm', m45: 'mage_blazing_barrier', m90: 'mage_combustion', m180: 'mage_time_warp',
    },
  },

  // ---------------------------------------------------------------- Buz Büyücüsü
  mage_frost: {
    id: 'mage_frost', classId: 'mage', name: 'Buz Büyücüsü', role: 'dps',
    desc: 'Buz Parmakları ile Buz Mızraklarını kırar; alanı dondurur ve yavaşlatır.',
    stats: { frostDamagePct: 0.20, chilledDamagePct: 0.15, castSpeed: 0.08, ccDurationPct: 0.15 },
    specials: [{
      id: 'trait_cryomancer', params: { fofChance: 0.15, fofMax: 2, fofDur: 15, fofCrit: 0.5 },
      desc: 'Buz vuruşları %15 şansla Buz Parmağı verir (en fazla 2, 15 sn): sonraki Buz Mızrağı hedefi Donmuş sayar (×3, parçalanma) ve +%50 kritik şansı alır. Buz Halkası donduran her düşman bir Buz Parmağı verir.',
    }],
    skills: ['mage_ice_lance'], unlock: { mage_ice_lance: 10 }, treeSkills: { mage_flurry: 's05' },
    majors: { m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp' },
    mods: [{ skill: 'mage_basic', patch: { name: 'Buz Oku' } }],
    fx: 'M mage_basic cv=frost:1 ;; M mage_frost_nova cd=-1 ;; M mage_blizzard st=chill:3:2 ;; M mage_blink cd=-1',
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_ice_lance', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_flurry', s2: 'mage_blizzard',
      s3: 'mage_mana_barrier', r: 'mage_arcane_cataclysm', m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp',
    },
  },

  // ---------------------------------------------------------------- Gizem Ustası
  mage_arcane: {
    id: 'mage_arcane', classId: 'mage', name: 'Gizem Ustası', role: 'dps',
    desc: 'Gizem Yükü biriktirir, manayı silaha çevirir; yükle, harca, patlat.',
    stats: { arcaneDamagePct: 0.20, resourceRegenPct: 0.30, castSpeed: 0.05, maxResource: 20 },
    specials: [{
      id: 'trait_arcanist', params: { chargeMax: 4, chargeDmg: 0.12, chargeCost: 0.25, manaFloor: 0.4, manaSlope: 0.003, chargeDecay: 5, chargeDecayDelay: 8 },
      desc: 'Gizem Yükü (0–4): her yük gizem hasarını %12 artırır, gizem büyülerinin mana maliyetini %25 artırır. Manan %40\'ın üzerinde her %1 için gizem hasarı +%0.3 (tam manada +%18). Yükler 8 sn savaş dışı kalınca 5 sn\'de bir azalır.',
    }],
    skills: ['mage_arcane_blast'], unlock: { mage_arcane_blast: 10 }, treeSkills: { mage_arcane_barrage: 's05' },
    majors: { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp' },
    mods: [],
    fx: 'M mage_arcane_orb dmgx=1.2 ;; M mage_blink cd=-1',
    defaultBar: {
      lmb: 'mage_basic', rmb: 'mage_arcane_blast', q: 'mage_arcane_barrage', e: 'mage_blink', s1: 'mage_arcane_orb', s2: 'mage_mana_barrier',
      s3: 'mage_frost_nova', r: 'mage_arcane_cataclysm', m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp',
    },
  },
};

/**
 * Pip definitions of the new pips (GDD_TALENTS §1.3.1). Not attached to any class: the Gizem Yükü pip belongs to the
 * `mage_arcane` spec (shown and stored only while that spec is active; SkillDef.pip `arcane` drives it). Decay is the
 * generic PipDef.decay rule (-1 every 5 s after 8 s out of combat). The icon is an icon name (no path, no extension).
 */
export const TALENT_PIPS: Partial<Record<PipId, PipDef>> = {
  arcane: { id: 'arcane', name: 'Gizem Yükü', max: 4, color: '#b78cff', icon: 'skill-arcane-orb', decay: { after: 8, every: 5 } },
  // KIT PK-0 (docs/kits/casters-rogue.md §g E6): warlock shard fragments. max / costs / gains are fragments; 10 = one shown pip.
  shard: { id: 'shard', name: 'Ruh Parçası', max: 50, scale: 10, color: '#b06bff', icon: 'skill-curse' },
};
