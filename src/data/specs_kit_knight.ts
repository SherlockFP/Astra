/**
 * Şövalye (knight) SpecDefs (docs/kits/plate-melee.md §1, §2, f3, §g). PM-00c moved them here; PM-KN rewrites them to the
 * Arms (Kılıç Ustası) and Protection (Koruyucu) kits. OWNER: PM-KN (this file only). Merged into SPECS by data/specs.ts.
 * Anger Management (G3): trait_anger `angerPer` 20 (every 20 rage spent cuts the m45 / m90 / m180 cooldowns by 1 s).
 * Spec `fx` trigger strings (sudden_death PRD, battlelord PRD, revenge_ready on block / parry) are not written here: no kit code
 * reads SpecDef.fx yet (PM-TAL / CW-07 own the trigger wiring); see the PM-KN report.
 */
import type { SpecDef, SpecId } from '../types/v2';

const KNIGHT_SPEC_LIST: SpecDef[] = [
  {
    id: 'knight_protector', classId: 'knight', name: 'Koruyucu', role: 'tank',
    desc: 'Kalkan Kaldır ve Yemin Siperi ile aktif azaltma. Kalkan Darbesi, Gök Gürültüsü ve İntikam ile tehdit üretir.',
    stats: { maxHpPct: 0.30, armorPct: 0.40, blockChance: 0.15, blockAmount: 0.10, threatPct: 2.0, parryWindow: 0.07 },
    specials: [
      { id: 'protector_cheat', desc: '90 saniyede bir ölümcül darbe canını %15\'e indirir ve 1.5 saniye dokunulmazlık verir (Son Savunma).', params: { cooldown: 90, hpLeft: 0.15, invul: 1.5 } },
      { id: 'trait_anger', desc: 'Harcanan her 20 Kararlılık, majör bekleme sürelerini 1 saniye azaltır (Öfke Yönetimi).', params: { angerPer: 20 } },
    ],
    skills: ['knight_provoke', 'knight_shield_block', 'knight_ward_of_oath', 'knight_revenge', 'knight_thunder_clap', 'knight_pummel'],
    unlock: { knight_provoke: 10, knight_shield_block: 10, knight_pummel: 10, knight_revenge: 12, knight_thunder_clap: 12, knight_ward_of_oath: 15 },
    majors: { m45: 'knight_challenge', m90: 'knight_avatar', m180: 'knight_unbroken_bastion' },
    mods: [
      { skill: 'knight_shield_bash', params: { threat: 300 } },
      // Hücum (Kalkan Hücumu): 45 s cooldown, AoE r 3 stun 1.5 s, grants revenge_ready on landing (Koruyucu spec patch, §2a)
      {
        skill: 'knight_charge', patch: {
          cooldown: 45, radius: 3, damage: { coef: 1.6, type: 'physical' }, statuses: [{ status: 'stun', duration: 1.5 }],
          selfStatuses: [{ status: 'revenge_ready', duration: 6 }],
        },
      },
      // The +1 R per extra target hit is an Arms-only rule (§1a); Koruyucu's chain gains are the flat 4/4/5/6 of §2a.
      { skill: 'knight_basic_1', params: { gainPerTarget: 0 } },
      { skill: 'knight_basic_2', params: { gainPerTarget: 0 } },
      { skill: 'knight_basic_3', params: { gainPerTarget: 0 } },
      { skill: 'knight_basic_4', params: { gainPerTarget: 0 } },
    ],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_shield_bash', q: 'knight_revenge', e: 'knight_shield_block', r: 'knight_provoke',
      s1: 'knight_thunder_clap', s2: 'knight_charge', s3: 'knight_ward_of_oath', s4: 'knight_pummel',
      m45: 'knight_challenge', m90: 'knight_avatar', m180: 'knight_unbroken_bastion',
    },
  },
  {
    id: 'knight_blademaster', classId: 'knight', name: 'Kılıç Ustası', role: 'dps',
    desc: 'Kararlılık harcayıp Ölümcül Darbe ve Cellat Vuruşu ile vuran; Dev Ezme ve Savaş Avatarı pencereleriyle patlayan Arms savaşçısı.',
    stats: { meleeDamagePct: 0.10, critChance: 0.05, attackSpeed: 0.05, resourceGainPct: 0.75 },
    specials: [
      { id: 'trait_anger', desc: 'Harcanan her 20 Kararlılık, majör bekleme sürelerini 1 saniye azaltır (Öfke Yönetimi).', params: { angerPer: 20 } },
    ],
    skills: ['knight_mortal_strike', 'knight_overpower', 'knight_rend', 'knight_die_by_sword', 'knight_pummel'],
    unlock: { knight_mortal_strike: 10, knight_overpower: 10, knight_pummel: 10, knight_rend: 12, knight_die_by_sword: 15 },
    majors: { m45: 'knight_colossus_smash', m90: 'knight_avatar', m180: 'knight_bladestorm' },
    mods: [],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_mortal_strike', q: 'knight_execute', e: 'knight_overpower', r: 'knight_rend',
      s1: 'knight_radiant_cleave', s2: 'knight_charge', s3: 'knight_die_by_sword', s4: 'knight_pummel',
      m45: 'knight_colossus_smash', m90: 'knight_avatar', m180: 'knight_bladestorm',
    },
  },
];

export const KNIGHT_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(KNIGHT_SPEC_LIST.map((s) => [s.id, s]));
