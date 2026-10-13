/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10 / §11, SpecDef wiring). SpecDef rows of the two warlock specs, merged into SPECS by
 * data/specs.ts. Majors m45 = Kötülük (shared), m90 = Karanlık Göz (Azap) / Cehennem Muhafızı (Yıkım), m180 = Bitmeyen Kararlılık.
 * OWNER: combat (data).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_WARLOCK: Partial<Record<SpecId, SpecDef>> = {
  // ---- Azap (§10): DoT web, Musallat window, Karanlık Göz
  warlock_affliction: {
    id: 'warlock_affliction', classId: 'warlock', name: 'Azap', role: 'dps',
    desc: 'Azap, Yozlaşma ve Dengesiz Azap DoT\'leri; Musallat ve Karanlık Göz penceresi.',
    stats: { dotPct: 0.25, castSpeed: 0.08 },
    specials: [
      { id: 'trait_affliction', desc: 'Ruh Parçası: öldürmelerde +1 parça; DoT kritleri %50 ile daha fazla vurur.', params: { shardOnKill: 1, dotCrit: 0.5 } },
    ],
    skills: [
      'warlock_shadow_bolt', 'warlock_agony', 'warlock_corruption', 'warlock_demonic_circle', 'warlock_haunt',
      'warlock_unstable_affliction', 'warlock_spell_lock', 'warlock_seed_of_corruption', 'warlock_dark_pact',
      'warlock_malevolence', 'warlock_summon_darkglare', 'warlock_unending_resolve',
    ],
    unlock: {
      warlock_shadow_bolt: 1, warlock_agony: 1, warlock_corruption: 6, warlock_demonic_circle: 1, warlock_haunt: 10,
      warlock_unstable_affliction: 10, warlock_spell_lock: 10, warlock_malevolence: 10, warlock_seed_of_corruption: 12,
      warlock_dark_pact: 15, warlock_summon_darkglare: 20, warlock_unending_resolve: 30,
    },
    majors: { m45: 'warlock_malevolence', m90: 'warlock_summon_darkglare', m180: 'warlock_unending_resolve' },
    mods: [],
    // treeSkills { warlock_haunt: 's05' } is the T-step (talent JSON still grants Spell Lock at s05); Haunt is on the bar at level 10 meanwhile
    defaultBar: {
      lmb: 'warlock_basic', rmb: 'warlock_shadow_bolt', q: 'warlock_unstable_affliction', e: 'warlock_agony', r: 'warlock_corruption',
      s1: 'warlock_haunt', s2: 'warlock_demonic_circle', s3: 'warlock_dark_pact', s4: 'warlock_spell_lock',
      m45: 'warlock_malevolence', m90: 'warlock_summon_darkglare', m180: 'warlock_unending_resolve',
    },
  },

  // ---- Yıkım (§11): fragments to Kaos Oku, Alevlendirme windows, Ateş Yağmuru, Cehennem Muhafızı
  warlock_destruction: {
    id: 'warlock_destruction', classId: 'warlock', name: 'Yıkım', role: 'dps',
    desc: 'Kül Etme ve Alevlendirme ile Ruh Parçası topla; Kaos Oku ve Ateş Yağmuru ile patlat.',
    stats: { fireDamagePct: 0.2, critChance: 0.06, critDamage: 0.2 },
    specials: [
      { id: 'trait_destruction', desc: 'Yıkım: doğrudan ateş vuruşları %10 daha fazla vurur.', params: { directMore: 0.1 } },
    ],
    skills: [
      'warlock_incinerate', 'warlock_conflagrate', 'warlock_immolate', 'warlock_demonic_circle', 'warlock_chaos_bolt',
      'warlock_shadowburn', 'warlock_rain_of_fire', 'warlock_spell_lock', 'warlock_dark_pact', 'warlock_malevolence',
      'warlock_summon_infernal', 'warlock_unending_resolve',
    ],
    unlock: {
      warlock_incinerate: 1, warlock_conflagrate: 3, warlock_immolate: 6, warlock_demonic_circle: 1, warlock_shadowburn: 10,
      warlock_spell_lock: 10, warlock_malevolence: 10, warlock_rain_of_fire: 12, warlock_chaos_bolt: 15, warlock_dark_pact: 15,
      warlock_summon_infernal: 20, warlock_unending_resolve: 30,
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
};
