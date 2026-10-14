/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10, §11, SpecDef wiring), WoW Midnight rework (docs/WOW_ABILITY_MAP.md §8, §16).
 * SpecDef rows of the three warlock specs, merged into SPECS by data/specs.ts. Majors m45 = Kötülük (shared), m90 = Karanlık Göz
 * (Azap) / Cehennem Muhafızı (Yıkım) / Demonik Tiran (İblis Ustalığı), m180 = Bitmeyen Kararlılık (shared).
 * Key layout (WoW, §16): rmb 1, q 2, e 3, r 4, s1 5, s2 Q (Demonic Circle), s3 E (Dark Pact), s4 R (Spell Lock).
 * Shared rows on every spec, off the default bar: Gölge Patlaması, Ölüm Halkası, Sağlık Taşı (Shift+ row).
 * OWNER: combat (data).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_WARLOCK: Partial<Record<SpecId, SpecDef>> = {
  // ---- Azap (§10): DoT web, Musallat window, Karanlık Göz; Malefic Rapture is the spender on Q (Dengesiz Azap moves to Shift+)
  warlock_affliction: {
    id: 'warlock_affliction', classId: 'warlock', name: 'Azap', role: 'dps',
    desc: 'Azap, Yozlaşma ve Dengesiz Azap DoT\'leri; Kötücül Coşku ile Ruh Parçalarını harcarsın. Musallat ve Karanlık Göz penceresi.',
    stats: { dotPct: 0.25, castSpeed: 0.08 },
    specials: [
      { id: 'trait_affliction', desc: 'Ruh Parçası: öldürmelerde +1 parça; DoT kritleri %50 ile daha fazla vurur.', params: { shardOnKill: 1, dotCrit: 0.5 } },
    ],
    skills: [
      'warlock_shadow_bolt', 'warlock_agony', 'warlock_corruption', 'warlock_demonic_circle', 'warlock_haunt',
      'warlock_unstable_affliction', 'warlock_malefic_rapture', 'warlock_spell_lock', 'warlock_seed_of_corruption', 'warlock_dark_pact',
      'warlock_malevolence', 'warlock_summon_darkglare', 'warlock_unending_resolve', 'warlock_shadowfury', 'warlock_mortal_coil',
      'warlock_healthstone',
    ],
    unlock: {
      warlock_shadow_bolt: 1, warlock_agony: 1, warlock_corruption: 6, warlock_demonic_circle: 1, warlock_haunt: 10,
      warlock_unstable_affliction: 10, warlock_malefic_rapture: 10, warlock_spell_lock: 10, warlock_malevolence: 10,
      warlock_seed_of_corruption: 12, warlock_dark_pact: 15, warlock_summon_darkglare: 20, warlock_unending_resolve: 30,
      warlock_shadowfury: 15, warlock_mortal_coil: 15, warlock_healthstone: 10,
    },
    majors: { m45: 'warlock_malevolence', m90: 'warlock_summon_darkglare', m180: 'warlock_unending_resolve' },
    mods: [],
    // treeSkills { warlock_haunt: 's05' } is the T-step (talent JSON still grants Spell Lock at s05); Haunt is on the bar at level 10 meanwhile
    defaultBar: {
      lmb: 'warlock_basic', rmb: 'warlock_shadow_bolt', q: 'warlock_malefic_rapture', e: 'warlock_agony', r: 'warlock_corruption',
      s1: 'warlock_haunt', s2: 'warlock_demonic_circle', s3: 'warlock_dark_pact', s4: 'warlock_spell_lock',
      m45: 'warlock_malevolence', m90: 'warlock_summon_darkglare', m180: 'warlock_unending_resolve',
    },
  },

  // ---- Yıkım (§11): fragments to Kaos Oku, Alevlendirme windows, Ateş Yağmuru, Cehennem Muhafızı; Kargaşa and Cehennem Kıyameti
  warlock_destruction: {
    id: 'warlock_destruction', classId: 'warlock', name: 'Yıkım', role: 'dps',
    desc: 'Kül Etme ve Alevlendirme ile Ruh Parçası topla; Kaos Oku ve Ateş Yağmuru ile patlat. Kargaşa ve Cehennem Kıyameti ile alanı yak.',
    stats: { fireDamagePct: 0.2, critChance: 0.06, critDamage: 0.2 },
    specials: [
      { id: 'trait_destruction', desc: 'Yıkım: doğrudan ateş vuruşları %10 daha fazla vurur.', params: { directMore: 0.1 } },
    ],
    skills: [
      'warlock_incinerate', 'warlock_conflagrate', 'warlock_immolate', 'warlock_demonic_circle', 'warlock_chaos_bolt',
      'warlock_shadowburn', 'warlock_rain_of_fire', 'warlock_spell_lock', 'warlock_dark_pact', 'warlock_malevolence',
      'warlock_summon_infernal', 'warlock_unending_resolve', 'warlock_havoc', 'warlock_cataclysm', 'warlock_shadowfury',
      'warlock_mortal_coil', 'warlock_healthstone',
    ],
    unlock: {
      warlock_incinerate: 1, warlock_conflagrate: 3, warlock_immolate: 6, warlock_demonic_circle: 1, warlock_shadowburn: 10,
      warlock_spell_lock: 10, warlock_malevolence: 10, warlock_rain_of_fire: 12, warlock_chaos_bolt: 15, warlock_dark_pact: 15,
      warlock_summon_infernal: 20, warlock_unending_resolve: 30, warlock_havoc: 15, warlock_cataclysm: 20,
      warlock_shadowfury: 15, warlock_mortal_coil: 15, warlock_healthstone: 10,
    },
    majors: { m45: 'warlock_malevolence', m90: 'warlock_summon_infernal', m180: 'warlock_unending_resolve' },
    // Yıkım flavour: the LMB chain hits as fire (cv=fire:1, step 4 applies Yakıp Yıkma). Consumer is a hook, see the PK-WARLOCK report.
    mods: [{ skill: 'warlock_basic', params: { convertFire: 1 } }],
    treeSkills: { warlock_chaos_bolt: 's05' },
    defaultBar: {
      lmb: 'warlock_basic', rmb: 'warlock_incinerate', q: 'warlock_chaos_bolt', e: 'warlock_conflagrate', r: 'warlock_immolate',
      s1: 'warlock_rain_of_fire', s2: 'warlock_demonic_circle', s3: 'warlock_dark_pact', s4: 'warlock_spell_lock',
      m45: 'warlock_malevolence', m90: 'warlock_summon_infernal', m180: 'warlock_unending_resolve',
    },
  },

  // ---- İblis Ustalığı (Demonology, WoW Midnight): Vahşi Cinler, Dreadstalkers, Felguard, Demonik Tiran; Implosion pops the imps
  warlock_demonology: {
    id: 'warlock_demonology', classId: 'warlock', name: 'İblis Ustalığı', role: 'dps',
    desc: 'Vahşi Cinler, Dreadstalkerlar ve Felguard ile çalışırsın; Demonik Tiran ile yoldaşlarını güçlendirir, Patlama ile cinleri patlatırsın.',
    stats: { minionDamagePct: 0.1, critChance: 0.04 },
    specials: [
      { id: 'trait_demonology', desc: 'İblis Ustalığı: yoldaş hasarı +%10; Patlama her cin için bir kez vurur.', params: { minionDmg: 0.1 } },
    ],
    skills: [
      'warlock_demonbolt', 'warlock_hand_of_guldan', 'warlock_call_dreadstalkers', 'warlock_implosion', 'warlock_summon_felguard',
      'warlock_demonic_circle', 'warlock_dark_pact', 'warlock_spell_lock', 'warlock_malevolence', 'warlock_summon_demonic_tyrant',
      'warlock_unending_resolve', 'warlock_shadowfury', 'warlock_mortal_coil', 'warlock_healthstone',
    ],
    unlock: {
      warlock_demonbolt: 1, warlock_demonic_circle: 1, warlock_hand_of_guldan: 10, warlock_summon_felguard: 10,
      warlock_spell_lock: 10, warlock_malevolence: 10, warlock_healthstone: 10, warlock_call_dreadstalkers: 15,
      warlock_dark_pact: 15, warlock_shadowfury: 15, warlock_mortal_coil: 15, warlock_implosion: 20,
      warlock_summon_demonic_tyrant: 20, warlock_unending_resolve: 30,
    },
    majors: { m45: 'warlock_malevolence', m90: 'warlock_summon_demonic_tyrant', m180: 'warlock_unending_resolve' },
    mods: [],
    defaultBar: {
      lmb: 'warlock_basic', rmb: 'warlock_demonbolt', q: 'warlock_hand_of_guldan', e: 'warlock_call_dreadstalkers', r: 'warlock_implosion',
      s1: 'warlock_summon_felguard', s2: 'warlock_demonic_circle', s3: 'warlock_dark_pact', s4: 'warlock_spell_lock',
      m45: 'warlock_malevolence', m90: 'warlock_summon_demonic_tyrant', m180: 'warlock_unending_resolve',
    },
  },
};
