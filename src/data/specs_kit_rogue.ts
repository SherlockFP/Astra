/**
 * HAYDUT specs (docs/WOW_ABILITY_MAP.md §15, §16): Suikastçı (Assassination), Haydut-Korsan (Outlaw, not pickable until a GDD_TALENTS
 * tree exists), Gölge (Subtlety). Merged into SPECS by data/specs.ts. Owner: combat (data).
 * The Simyacı healer is removed (no WoW counterpart). Its rows are gone from skills_kit_rogue.ts and rotations_kit_rogue.ts.
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_ROGUE: Partial<Record<SpecId, SpecDef>> = {
  // ---- Suikastçı (Assassination): poisons, bleeds, Kral Belası, Ölüm İşareti
  rogue_assassin: {
    id: 'rogue_assassin', classId: 'rogue', name: 'Suikastçı', role: 'dps',
    desc: 'Zehir yığınları, kanamalar ve Ölüm İşareti penceresi. Gizlenmeden sakin, pencerede sert.',
    stats: { critChance: 0.06, critDamage: 0.20, attackSpeed: 0.05, parryWindow: 0.04, resourceRegenPct: 0.17, threatPct: -0.2 },
    specials: [
      { id: 'assassin_vanish', desc: 'Kaybol tehdidin %50\'sini düşürür (veri; tehdit kancası bekliyor).', params: { threatDown: 0.5 } },
      { id: 'trait_assassination', desc: 'Sakatlama, Bıçak Yelpazesi ve oto saldırı vuruşları zehir uygular (en çok 10 yığın, 12 sn).', params: { poisonCap: 10, poisonMag: 0.18, poisonDur: 12 } },
    ],
    skills: ['rogue_mutilate', 'rogue_envenom', 'rogue_garrote', 'rogue_rupture', 'rogue_fan_of_knives', 'rogue_crimson_tempest',
      'rogue_kingsbane', 'rogue_deathmark', 'rogue_kick', 'rogue_shadow_step', 'rogue_vanish', 'rogue_feint', 'rogue_kidney_shot',
      'rogue_cloak_of_shadows', 'rogue_stealth', 'rogue_sprint', 'rogue_evasion', 'rogue_crimson_vial'],
    unlock: {
      rogue_mutilate: 1, rogue_envenom: 1, rogue_shadow_step: 1, rogue_garrote: 6, rogue_fan_of_knives: 6, rogue_rupture: 10,
      rogue_kick: 1, rogue_kingsbane: 10, rogue_kidney_shot: 10, rogue_crimson_tempest: 12, rogue_feint: 15, rogue_vanish: 15,
      rogue_cloak_of_shadows: 15, rogue_deathmark: 20,
    },
    majors: { m45: 'rogue_kingsbane', m90: 'rogue_deathmark', m180: 'rogue_vanish' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_mutilate', q: 'rogue_envenom', e: 'rogue_garrote', r: 'rogue_rupture', s1: 'rogue_fan_of_knives',
      s2: 'rogue_shadow_step', s3: 'rogue_feint', s4: 'rogue_kick', m45: 'rogue_kingsbane', m90: 'rogue_deathmark', m180: 'rogue_vanish',
    },
  },

  // ---- Kanun Kaçağı (Outlaw): Kalleş Darbe, Tabanca Atışı, Dilimleme, Gözler Arası, Adrenalin Dürtüsü, Katliam
  rogue_outlaw: {
    id: 'rogue_outlaw', classId: 'rogue', name: 'Kanun Kaçağı', role: 'dps',
    desc: 'Kalleş Darbelerle Kombo Puanı toplar, Dilimleme ve Gözler Arası ile harcarsın. Tek hedefte ve kalabalıkta dengeli.',
    stats: { critChance: 0.05, critDamage: 0.20, attackSpeed: 0.1, resourceRegenPct: 0.17, threatPct: -0.1 },
    specials: [],
    skills: ['rogue_sinister_strike', 'rogue_crossbow_shot', 'rogue_dispatch', 'rogue_slice_and_dice', 'rogue_between_the_eyes',
      'rogue_roll_the_bones', 'rogue_blade_flurry', 'rogue_adrenaline_rush', 'rogue_killing_spree', 'rogue_kick', 'rogue_shadow_step',
      'rogue_feint', 'rogue_vanish', 'rogue_kidney_shot', 'rogue_cloak_of_shadows', 'rogue_stealth', 'rogue_sprint', 'rogue_evasion',
      'rogue_crimson_vial'],
    unlock: {
      rogue_sinister_strike: 1, rogue_crossbow_shot: 3, rogue_slice_and_dice: 3, rogue_shadow_step: 1, rogue_dispatch: 6,
      rogue_kick: 1, rogue_between_the_eyes: 1, rogue_roll_the_bones: 10, rogue_adrenaline_rush: 10, rogue_kidney_shot: 10,
      rogue_blade_flurry: 12, rogue_feint: 15, rogue_vanish: 15, rogue_cloak_of_shadows: 15, rogue_killing_spree: 20,
    },
    majors: { m45: 'rogue_adrenaline_rush', m90: 'rogue_killing_spree', m180: 'rogue_vanish' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_sinister_strike', q: 'rogue_crossbow_shot', e: 'rogue_slice_and_dice', r: 'rogue_between_the_eyes',
      s1: 'rogue_blade_flurry', s2: 'rogue_shadow_step', s3: 'rogue_feint', s4: 'rogue_kick',
      m45: 'rogue_adrenaline_rush', m90: 'rogue_killing_spree', m180: 'rogue_vanish',
    },
  },

  // ---- Simyacı: legacy STUB only. Not in classes.ts specs (not pickable, no bar, no kit rows). It stays registered because
  // dev/combat-sim/pips.mjs pins its Karışım pip (SkillSystem.activePips reads specOf().id). Remove with that pin.
  rogue_alchemist: {
    id: 'rogue_alchemist', classId: 'rogue', name: 'Simyacı (kaldırıldı)', role: 'healer',
    desc: 'WoW Midnight Haydut\'unda yok. Yalnız eski kayıtlar ve sim pini için tutulur.',
    stats: {}, specials: [], skills: [], unlock: {}, majors: { m45: 'rogue_vanish', m90: 'rogue_vanish' }, mods: [], defaultBar: {},
  },

  // ---- Gölge (Subtlety): Gölge Adımı, Sırttan Bıçak, Gölge Dansı, Gizli Teknik, Ölüm Sembolleri
  rogue_subtlety: {
    id: 'rogue_subtlety', classId: 'rogue', name: 'Gölge', role: 'dps',
    desc: 'Gölge Adımıyla hedefin arkasına geçer, Gölge Dansında Gizli Teknik klonlarıyla patlar.',
    stats: { critChance: 0.05, critDamage: 0.25, attackSpeed: 0.05, resourceRegenPct: 0.17, threatPct: -0.2, parryWindow: 0.04 },
    specials: [
      { id: 'trait_subtlety', desc: 'Derin Strateji: Kombo Puanı üst sınırı 6.', params: { maxCombo: 6 } },
      { id: 'shadow_technique', desc: 'Gölge Tekniği: her 4. oto saldırı vuruşunda (Gölge Dansında her 2.) +1 Kombo Puanı ve +8 enerji.', params: { every: 4, everyInDance: 2, cp: 1, energy: 8 } },
      { id: 'find_weakness', desc: 'Zayıflık Bulma: Gölge Vuruşu ya da gizlenmişken Sırttan Bıçak 10 sn +%10 hasar.', params: { dur: 10, dmgPct: 0.1 } },
    ],
    skills: ['rogue_backstab', 'rogue_shadowstrike', 'rogue_eviscerate', 'rogue_black_powder', 'rogue_secret_technique', 'rogue_shuriken_storm',
      'rogue_shadow_dance', 'rogue_goremaws_bite', 'rogue_shadow_blades', 'rogue_symbols_of_death', 'rogue_kick', 'rogue_shadow_step',
      'rogue_kidney_shot', 'rogue_vanish', 'rogue_feint', 'rogue_cloak_of_shadows', 'rogue_stealth', 'rogue_sprint', 'rogue_evasion',
      'rogue_crimson_vial'],
    unlock: {
      rogue_shadow_step: 1, rogue_shuriken_storm: 1, rogue_backstab: 1, rogue_eviscerate: 1, rogue_shadowstrike: 10,
      rogue_black_powder: 10, rogue_goremaws_bite: 10, rogue_shadow_blades: 10, rogue_symbols_of_death: 10, rogue_kick: 1,
      rogue_kidney_shot: 10, rogue_secret_technique: 20, rogue_shadow_dance: 20, rogue_feint: 15, rogue_vanish: 15,
      rogue_cloak_of_shadows: 15,
    },
    majors: { m45: 'rogue_goremaws_bite', m90: 'rogue_shadow_blades', m180: 'rogue_symbols_of_death' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_backstab', q: 'rogue_eviscerate', r: 'rogue_secret_technique', s1: 'rogue_shuriken_storm',
      s2: 'rogue_shadow_step', s3: 'rogue_shadow_dance', s4: 'rogue_kick',
      m45: 'rogue_goremaws_bite', m90: 'rogue_shadow_blades', m180: 'rogue_symbols_of_death',
    },
  },
};
