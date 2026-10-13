/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §6, §7, §8). SpecDef rows of the three rogue specs. Merged into SPECS by data/specs.ts
 * AFTER the shared SPEC_LIST, so these replace the legacy rogue_assassin / rogue_alchemist rows and add rogue_subtlety.
 * Owner: combat (data).
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_ROGUE: Partial<Record<SpecId, SpecDef>> = {
  // ---- Suikastçı (§6): Zehir bloğu, Kral Belası, Ölüm İşareti, Kaybol
  rogue_assassin: {
    id: 'rogue_assassin', classId: 'rogue', name: 'Suikastçı', role: 'dps',
    desc: 'Zehir yığınları, kanamalar ve Ölüm İşareti penceresi. Gizlenmeden sakin, pencerede sert.',
    stats: { critChance: 0.06, critDamage: 0.20, attackSpeed: 0.05, parryWindow: 0.04, resourceRegenPct: 0.17, threatPct: -0.2 },
    specials: [
      { id: 'assassin_vanish', desc: 'Kaybol tehdidin %50\'sini düşürür (veri; tehdit kancası bekliyor).', params: { threatDown: 0.5 } },
      { id: 'trait_assassination', desc: 'Sakatlama, Bıçak Yelpazesi ve LMB vuruşları zehir uygular (en çok 10 yığın, 12 sn).', params: { poisonCap: 10, poisonMag: 0.18, poisonDur: 12 } },
    ],
    skills: ['rogue_mutilate', 'rogue_envenom', 'rogue_garrote', 'rogue_rupture', 'rogue_crimson_tempest', 'rogue_fan_of_knives',
      'rogue_kingsbane', 'rogue_deathmark', 'rogue_vanish', 'rogue_shadow_step', 'rogue_feint', 'rogue_kick'],
    unlock: {
      rogue_mutilate: 1, rogue_envenom: 3, rogue_shadow_step: 3, rogue_garrote: 6, rogue_rupture: 10, rogue_kick: 10,
      rogue_fan_of_knives: 12, rogue_crimson_tempest: 12, rogue_feint: 15, rogue_vanish: 15, rogue_kingsbane: 10, rogue_deathmark: 20,
    },
    majors: { m45: 'rogue_kingsbane', m90: 'rogue_deathmark', m180: 'rogue_vanish' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_mutilate', q: 'rogue_envenom', e: 'rogue_garrote', r: 'rogue_rupture', s1: 'rogue_fan_of_knives',
      s2: 'rogue_shadow_step', s3: 'rogue_feint', s4: 'rogue_kick', m45: 'rogue_kingsbane', m90: 'rogue_deathmark', m180: 'rogue_vanish',
    },
  },

  // ---- Gölge (§7): Gölge Adımı, Sırttan Bıçak, Gölge Dansı, Gizli Teknik. The 22nd spec id.
  rogue_subtlety: {
    id: 'rogue_subtlety', classId: 'rogue', name: 'Gölge', role: 'dps',
    desc: 'Gölge Adımıyla hedefin arkasına geçer, Gölge Dansında Gizli Teknik klonlarıyla patlar.',
    stats: { critChance: 0.05, critDamage: 0.25, attackSpeed: 0.05, resourceRegenPct: 0.17, threatPct: -0.2, parryWindow: 0.04 },
    specials: [
      { id: 'trait_subtlety', desc: 'Derin Strateji: Kombo Puanı üst sınırı 6.', params: { maxCombo: 6 } },
      { id: 'shadow_technique', desc: 'Gölge Tekniği: her 4. LMB vuruşunda (Gölge Dansında her 2.) +1 Kombo Puanı ve +8 enerji.', params: { every: 4, everyInDance: 2, cp: 1, energy: 8 } },
      { id: 'find_weakness', desc: 'Zayıflık Bulma: Gölge Vuruşu ya da gizlenmişken Sırttan Bıçak 10 sn +%10 hasar.', params: { dur: 10, dmgPct: 0.1 } },
    ],
    skills: ['rogue_backstab', 'rogue_shadowstrike', 'rogue_eviscerate', 'rogue_black_powder', 'rogue_secret_technique', 'rogue_shuriken_storm',
      'rogue_shadow_dance', 'rogue_goremaws_bite', 'rogue_shadow_blades', 'rogue_vanish', 'rogue_shadow_step', 'rogue_feint', 'rogue_kick'],
    unlock: {
      rogue_backstab: 10, rogue_shadowstrike: 10, rogue_eviscerate: 10, rogue_black_powder: 10, rogue_shuriken_storm: 6,
      rogue_secret_technique: 20, rogue_shadow_dance: 20, rogue_goremaws_bite: 10, rogue_shadow_blades: 10, rogue_vanish: 15,
      rogue_shadow_step: 3, rogue_feint: 15, rogue_kick: 10,
    },
    majors: { m45: 'rogue_goremaws_bite', m90: 'rogue_shadow_blades', m180: 'rogue_vanish' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_backstab', q: 'rogue_eviscerate', e: 'rogue_shadow_dance', r: 'rogue_secret_technique', s1: 'rogue_shuriken_storm',
      s2: 'rogue_shadow_step', s3: 'rogue_feint', s4: 'rogue_kick', m45: 'rogue_goremaws_bite', m90: 'rogue_shadow_blades', m180: 'rogue_vanish',
    },
  },

  // ---- Simyacı (§8): healer. basic = Şişe Fırlat (legacy row), Simya Bağı core.
  rogue_alchemist: {
    id: 'rogue_alchemist', classId: 'rogue', name: 'Simyacı', role: 'healer',
    desc: 'Vurdukça iyileştiren Simya Bağı ve iksirler. Yalnız değil; müttefiklerle.',
    stats: { healingPct: 0.25, damagePct: -0.40, resourceRegenPct: 0.33, moveSpeedPct: 0.05 },
    specials: [
      { id: 'alchemist_overheal', desc: 'Taşan Şifa: fazla iyileştirme +%10 (en çok 4 yığın, 4 sn).', params: { perStack: 0.1, maxStacks: 4, dur: 4 } },
      { id: 'alchemy_link', desc: 'Simya Bağı: Simyacının her hasarı bağlı müttefiklere %46 iyileştirme olarak döner (ilk 5 yaralı tam, gerisi yarı).', params: { frac: 0.46, full: 5, beyond: 0.5 } },
    ],
    skills: ['rogue_vial_throw', 'rogue_acid_flask', 'rogue_ward_potion', 'rogue_vial_heal', 'rogue_mending_draught', 'rogue_antidote',
      'rogue_smoke_ward', 'rogue_elixir_of_life', 'rogue_miracle_brew', 'rogue_ascendant_brew', 'rogue_shadow_step'],
    unlock: {
      rogue_vial_throw: 1, rogue_acid_flask: 3, rogue_shadow_step: 3, rogue_ward_potion: 6, rogue_vial_heal: 10, rogue_antidote: 15,
      rogue_smoke_ward: 15, rogue_mending_draught: 12, rogue_elixir_of_life: 10, rogue_miracle_brew: 20, rogue_ascendant_brew: 30,
    },
    majors: { m45: 'rogue_elixir_of_life', m90: 'rogue_miracle_brew', m180: 'rogue_ascendant_brew' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_vial_throw', rmb: 'rogue_acid_flask', e: 'rogue_ward_potion', r: 'rogue_vial_heal', s1: 'rogue_mending_draught',
      s2: 'rogue_shadow_step', s3: 'rogue_smoke_ward', s4: 'rogue_antidote', m45: 'rogue_elixir_of_life', m90: 'rogue_miracle_brew', m180: 'rogue_ascendant_brew',
    },
    basic: 'rogue_vial_throw',
  },
};
