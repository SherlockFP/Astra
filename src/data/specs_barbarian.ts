/**
 * PM-00c (docs/kits/plate-melee.md §h): Barbar (barbarian) SpecDefs, moved verbatim out of data/specs.ts.
 * OWNER: PM-BA from now on (this file only). Merged into SPECS by data/specs.ts.
 */
import type { SpecDef, SpecId } from '../types/v2';

const BARBARIAN_SPEC_LIST: SpecDef[] = [
  {
    id: 'barbarian_warlord', classId: 'barbarian', name: 'Savaş Lordu', role: 'tank',
    desc: 'Öfke zırhı: hasar aldıkça güçlenir. Demir Duruş ve Kan Zırhı ile aktif savunma.',
    stats: { maxHpPct: 0.30, armorPct: 0.35, lifeSteal: 0.02, threatPct: 1.5, damagePct: -0.25 },
    specials: [{ id: 'warlord_rage_armor', desc: 'Her 1 Öfke puanı için aldığın hasar %0.25 azalır (en fazla %25).', params: { perPoint: 0.0025, max: 0.25 } }],
    skills: ['barbarian_provoke', 'barbarian_iron_stance', 'barbarian_blood_shield', 'barbarian_last_stand', 'barbarian_rallying_roar'],
    unlock: { barbarian_provoke: 10, barbarian_iron_stance: 10, barbarian_blood_shield: 15, barbarian_last_stand: 10, barbarian_rallying_roar: 20 },
    majors: { m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar' },
    mods: [
      { skill: 'barbarian_cleave', params: { threatMult: 1.5 } },
      { skill: 'barbarian_whirlwind', params: { threatMult: 2.0 } },
      // Savaş Narası also taunts 3 s (fear stays 1.5 s), cooldown 16 s
      { skill: 'barbarian_war_cry', patch: { cooldown: 16, statuses: [{ status: 'fear', duration: 1.5 }, { status: 'taunt', duration: 3 }] } },
      { skill: 'barbarian_ancestral_tempest', params: { threatMult: 2.0 } },
    ],
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_cleave', q: 'barbarian_provoke', e: 'barbarian_whirlwind', s1: 'barbarian_war_cry',
      s2: 'barbarian_iron_stance', s3: 'barbarian_blood_shield', r: 'barbarian_ancestral_tempest',
      m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar',
    },
  },
  {
    id: 'barbarian_butcher', classId: 'barbarian', name: 'Kasap', role: 'dps',
    desc: 'Kanama yığınları ve İdam. Kurt Narası sahibi.',
    stats: { bleedDamagePct: 0.40, bleedChance: 0.15, executeDamagePct: 0.40, attackSpeed: 0.05, resourceGainPct: 0.20 },
    specials: [{ id: 'butcher_bleed_cap', desc: 'Kanama yığın sınırı 8 olur (sınır verisi; motor 5 ile çalışır).', params: { cap: 8 } }],
    skills: ['barbarian_rend', 'barbarian_execute', 'barbarian_bloodbath', 'barbarian_carnage', 'barbarian_wolf_howl'],
    unlock: { barbarian_rend: 10, barbarian_execute: 15, barbarian_bloodbath: 10, barbarian_carnage: 20, barbarian_wolf_howl: 30 },
    majors: { m45: 'barbarian_bloodbath', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl' },
    mods: [],
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_rend', q: 'barbarian_leap', e: 'barbarian_whirlwind', s1: 'barbarian_execute',
      s2: 'barbarian_fissure', s3: 'barbarian_axe_throw', r: 'barbarian_ancestral_tempest',
      m45: 'barbarian_bloodbath', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl',
    },
  },
];

export const BARBARIAN_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(BARBARIAN_SPEC_LIST.map((s) => [s.id, s]));
