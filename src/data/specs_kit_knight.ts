/**
 * PM-00c (docs/kits/plate-melee.md §h): Şövalye (knight) SpecDefs, moved verbatim out of data/specs.ts.
 * OWNER: PM-KN from now on (this file only). Merged into SPECS by data/specs.ts.
 */
import type { SpecDef, SpecId } from '../types/v2';

const KNIGHT_SPEC_LIST: SpecDef[] = [
  {
    id: 'knight_protector', classId: 'knight', name: 'Koruyucu', role: 'tank',
    desc: 'Kalkan Kaldır ve Yemin Siperi ile aktif azaltma. Tehdit ×3.0, kendi hasarı düşük.',
    stats: { maxHpPct: 0.30, armorPct: 0.40, blockChance: 0.15, blockAmount: 0.10, threatPct: 2.0, damagePct: -0.25, parryWindow: 0.07 },
    specials: [
      { id: 'protector_cheat', desc: '90 saniyede bir ölümcül darbe canını %15\'e indirir ve 1.5 saniye dokunulmazlık verir (Son Savunma).', params: { cooldown: 90, hpLeft: 0.15, invul: 1.5 } },
    ],
    skills: ['knight_provoke', 'knight_shield_block', 'knight_ward_of_oath', 'knight_unbroken_bastion', 'knight_oath_aegis'],
    unlock: { knight_provoke: 10, knight_shield_block: 10, knight_unbroken_bastion: 10, knight_ward_of_oath: 15, knight_oath_aegis: 20 },
    majors: { m45: 'knight_unbroken_bastion', m90: 'knight_oath_aegis' },
    mods: [
      { skill: 'knight_shield_bash', patch: { cooldown: 2.5 }, params: { threat: 300 } },
      { skill: 'knight_radiant_cleave', patch: { cost: 25 }, params: { threatMult: 1.5 } },
      { skill: 'knight_challenge', patch: { cooldown: 12 }, params: { threat: 50 } },
      { skill: 'knight_heavens_judgment', params: { threat: 150 } },
    ],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_shield_bash', q: 'knight_provoke', e: 'knight_radiant_cleave', s1: 'knight_challenge',
      s2: 'knight_shield_block', s3: 'knight_ward_of_oath', r: 'knight_heavens_judgment',
      m45: 'knight_unbroken_bastion', m90: 'knight_oath_aegis',
    },
  },
  {
    id: 'knight_blademaster', classId: 'knight', name: 'Kılıç Ustası', role: 'dps',
    desc: 'Adalet Puanı biriktirip Karar Darbesi ile bitirir. Kahramanlık Çağrısı sahibi.',
    stats: { attackSpeed: 0.10, holyDamagePct: 0.25, critChance: 0.05, meleeDamagePct: 0.10 },
    specials: [{ id: 'blademaster_pips', desc: 'Adalet Puanı (0–5): Kutsal Alev Dalgası biriktirir, Karar Darbesi harcar.', params: { max: 5 } }],
    skills: ['knight_templar_verdict', 'knight_wake_of_flames', 'knight_zeal', 'knight_wings_of_judgment', 'knight_heroism_call'],
    unlock: { knight_templar_verdict: 10, knight_zeal: 10, knight_wake_of_flames: 15, knight_wings_of_judgment: 20, knight_heroism_call: 30 },
    majors: { m45: 'knight_zeal', m90: 'knight_wings_of_judgment', m180: 'knight_heroism_call' },
    mods: [
      // Savaş Çağrısı: no taunt, enemies deal less damage (curse -20% stands in for -10%), the caster takes -20% (fortify, base row)
      { skill: 'knight_challenge', patch: { statuses: [{ status: 'curse', duration: 6 }] } },
    ],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_templar_verdict', q: 'knight_charge', e: 'knight_radiant_cleave', s1: 'knight_wake_of_flames',
      s2: 'knight_consecration', s3: 'knight_shield_bash', r: 'knight_heavens_judgment',
      m45: 'knight_zeal', m90: 'knight_wings_of_judgment', m180: 'knight_heroism_call',
    },
  },
];

export const KNIGHT_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(KNIGHT_SPEC_LIST.map((s) => [s.id, s]));
