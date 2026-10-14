/**
 * Barbar SpecDefs. PM-BA (docs/kits/plate-melee.md §3, §4, §h PM-BA sketch, f3). OWNER: PM-BA (this file only).
 * Merged into SPECS by data/specs.ts.
 *
 * Savaş Lordu = Guardian-druid-style tank loop (rage economy, Demir Duruş stacks, Kanlı Kürk procs).
 * Kasap = Fury DPS (Enrage loop, Pervasızlık transforms, İdam).
 */
import type { SpecDef, SpecId } from '../types/v2';

const BARBARIAN_SPEC_LIST: SpecDef[] = [
  {
    id: 'barbarian_warlord', classId: 'barbarian', name: 'Savaş Lordu', role: 'tank',
    desc: 'Öfke zırhı: hasar aldıkça güçlenir. Kalkan Kaldırma yığınları, Acı Yutma ve Savaş Avatarı ile aktif savunma.',
    stats: { maxHpPct: 0.30, armorPct: 0.35, lifeSteal: 0.02, threatPct: 1.5 },
    specials: [
      // f3: warlord_rage_armor max 25 % -> 15 % (per point .0025 -> .0015, Demir Duruş now stacks)
      { id: 'warlord_rage_armor', desc: 'Her 1 Öfke puanı için aldığın hasar %0.15 azalır (en fazla %15).', params: { perPoint: 0.0015, max: 0.15 } },
      // Ayı Gazabı (f3): Paralama and Ezici Balta damage absorbed 35 % (data; the absorb shield is not wired yet, see report)
      { id: 'ursoc_fury', desc: 'Paralama ve Ezici Balta hasarının %35\'i kalkan olarak geri döner (en fazla maks. canın %20\'si, 8 saniye).', params: { absorb: 0.35, cap: 0.20, dur: 8 } },
    ],
    skills: ['barbarian_shield_slam', 'barbarian_revenge', 'barbarian_thunder_clap', 'barbarian_iron_stance', 'barbarian_blood_shield', 'barbarian_shield_wall', 'barbarian_provoke', 'barbarian_maul', 'barbarian_thrash', 'barbarian_pummel'],
    unlock: { barbarian_shield_slam: 10, barbarian_revenge: 12, barbarian_thunder_clap: 12, barbarian_iron_stance: 10, barbarian_blood_shield: 15, barbarian_shield_wall: 15, barbarian_provoke: 10, barbarian_maul: 15, barbarian_thrash: 12, barbarian_pummel: 10 },
    majors: { m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar', m180: 'barbarian_incarnation' },
    mods: [
      { skill: 'barbarian_cleave', params: { threatMult: 1.5 } },
      { skill: 'barbarian_thrash', params: { threatMult: 2.0 } },
      { skill: 'barbarian_maul', params: { threatMult: 2.0 } },
    ],
    // treeSkills: Kan Yenilenmesi is granted by the class/spec s05 node instead of level 10 (GDD_TALENTS)
    treeSkills: { barbarian_blood_shield: 's05' },
    fx: 'T hurt icd=.5 => res(2) ;; T hit:barbarian_thrash ch=.15 icd=2 => st(self,gore,10) ;; T hit:barbarian_cleave ch=.15 icd=2 => st(self,gore,10) ;; T cast:barbarian_iron_stance ch=.20 => st(self,gory_maul,12) ;; T cast:barbarian_maul ch=.20 => st(self,gory_iron,12)',
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_iron_stance', q: 'barbarian_shield_slam', e: 'barbarian_revenge', r: 'barbarian_provoke',
      s1: 'barbarian_thunder_clap', s2: 'barbarian_leap', s3: 'barbarian_blood_shield', s4: 'barbarian_pummel',
      m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar', m180: 'barbarian_incarnation',
    },
  },
  {
    id: 'barbarian_butcher', classId: 'barbarian', name: 'Kasap', role: 'dps',
    desc: 'Kan Susuzluğu, Öfkeli Darbe ve Öfkeli Saldırı ile öfke döngüsü. Pervasızlık ile Kan Banyosu ve Kemik Ezici\'ye dönüşür. Kurt Narası sahibi.',
    stats: { executeDamagePct: 0.40, attackSpeed: 0.05, resourceGainPct: 0.20, critChance: 0.05 },
    specials: [{ id: 'trait_anger', desc: 'Öfke Yönetimi: her 20 Öfke harcandığında majorlerin kalan bekleme süresi 1 saniye kısalır.', params: { angerPer: 20 } }],
    skills: ['barbarian_bloodthirst', 'barbarian_rampage', 'barbarian_raging_blow', 'barbarian_crushing_blow', 'barbarian_bloodbath', 'barbarian_execute', 'barbarian_enraged_regeneration', 'barbarian_intimidating_shout', 'barbarian_pummel'],
    unlock: { barbarian_bloodthirst: 10, barbarian_pummel: 10, barbarian_raging_blow: 12, barbarian_rampage: 15, barbarian_crushing_blow: 12, barbarian_bloodbath: 10, barbarian_execute: 15, barbarian_enraged_regeneration: 15, barbarian_intimidating_shout: 10 },
    majors: { m45: 'barbarian_avatar', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl' },
    mods: [],
    // treeSkills: İdam is granted by the class s05 node
    treeSkills: { barbarian_execute: 's05' },
    fx: 'T hit:@melee ch=.10 icd=3 => st(self,sudden_death,12) ;; T cast:barbarian_bloodthirst ch=.30 icd=1 => st(self,enrage,4,.15) ;; T cast:barbarian_rampage => st(self,enrage,4,.15)',
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_bloodthirst', q: 'barbarian_rampage', e: 'barbarian_raging_blow', r: 'barbarian_execute',
      s1: 'barbarian_whirlwind', s2: 'barbarian_leap', s3: 'barbarian_enraged_regeneration', s4: 'barbarian_pummel',
      m45: 'barbarian_avatar', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl',
    },
  },
];

export const BARBARIAN_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(BARBARIAN_SPEC_LIST.map((s) => [s.id, s]));
