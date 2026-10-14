/**
 * Paladin SpecDefs (docs/kits/plate-melee.md §5-§7, f3, PM-PA sketch): Koruma (tank), Kutsal (healer), Ceza (dps).
 * PM-00c created the empty table; PM-PA fills it. OWNER: PM-PA. Merged into SPECS by data/specs.ts.
 *
 * Own-damage handicaps of the GDD_CLASSES_V2 sketch (`moreDamage 0.75` / `0.60`) are dropped (G10: the coefficients are final).
 * Spec `fx` rows (§5b-§7b) are chance / PRD triggers read by StatCalc.collectFx -> ProcEngine (combat/Procs.ts):
 *   Koruma  righteous 6 s + 50 % PRD shining_light per Doğruluk Kalkanı; block = +4 İnanç (class trait), 20 % of blocks and every
 *           perfect parry +1 Kutsal Güç; Yılmaz Savunucu lethal save (heal 25 %, the status is cut to 0.2 s so no expiry heal follows).
 *   Kutsal  infusion_of_light: Kutsal Şok 25 % (icd 3 s), Üçlü Işık 15 % (İlahi Çınlama rolls its own 15 % in its behaviour).
 *   Ceza    templar_combo 4 s after Haçlı Darbesi, art_of_war 12 % per chain hit (icd 2 s) / 8 % per Haçlı Darbesi,
 *           Kutsal Hüküm 15 % resets Yargı, one crusade stack per Holy Power spent under wrath_wings (a spender always costs 3).
 * Kutsal faith regen is 1.7 / s: class regen 5 + resourceRegen -3.64, x (1 + resourceRegenPct 0.25).
 */
import type { SpecDef, SpecId } from '../types/v2';

const PALADIN_SPEC_LIST: SpecDef[] = [
  {
    id: 'paladin_protection', classId: 'paladin', name: 'Koruma', role: 'tank', mainStat: 'str',
    desc: 'Kutsal Güç döngüsüyle Doğruluk Kalkanı\'nı neredeyse sürekli açık tutan tank. İntikamcı Kalkan düşmanları susturup kışkırtır; Kutsanmış Çekiç ve Kutsal Zemin tehdit üretir.',
    stats: { maxHpPct: 0.30, armorPct: 0.40, blockChance: 0.15, blockAmount: 0.10, healReceivedPct: 0.10, threatPct: 2.0 },
    specials: [
      { id: 'trait_protection', desc: 'Blok +4 İnanç ve %20 ihtimalle +1 Kutsal Güç kazandırır; kusursuz savuşturma +1 Kutsal Güç verir.', params: { blockFaith: 4, blockHolyPower: 0.2 } },
    ],
    skills: ['paladin_blessing_protection', 'paladin_blessing_freedom', 'paladin_reckoning', 'paladin_shield_of_righteous', 'paladin_blessed_hammer', 'paladin_word_of_glory', 'paladin_avengers_shield', 'paladin_consecration', 'paladin_divine_steed', 'paladin_hammer_of_justice', 'paladin_rebuke'],
    unlock: { paladin_blessing_protection: 10, paladin_blessing_freedom: 16, 
      paladin_reckoning: 10, paladin_shield_of_righteous: 1, paladin_avengers_shield: 10, paladin_consecration: 1,
      paladin_blessed_hammer: 10, paladin_word_of_glory: 1, paladin_divine_steed: 1,
      paladin_rebuke: 1, paladin_prot_ardent: 20, paladin_prot_bulwark: 30, paladin_avenging_wrath: 10, paladin_hammer_of_justice: 10,
    },
    majors: { m45: 'paladin_avenging_wrath', m90: 'paladin_prot_ardent', m180: 'paladin_prot_bulwark' },
    fx: [
      'T cast:paladin_shield_of_righteous => st(self,righteous,6)',
      'T cast:paladin_shield_of_righteous ch=.5 => st(self,shining_light,15)',
      'T block => res(4)',
      'T block ch=.2 icd=1 => pip(holypower,1)',
      'T parry => pip(holypower,1)',
      'T lethal if=sst:ardent => heal(.25) ; st(self,ardent,0.2)',
    ].join(' ;; '),
    mods: [
      // İntikam Kanatları for the tank: 45 s, +10 % damage / healing / crit
      { skill: 'paladin_avenging_wrath', patch: { cooldown: 45, selfStatuses: [{ status: 'wrath_wings', duration: 20, magnitude: 0.10 }] } },
      // Gazap Çekici for the tank: 2.8 (Ceza 4.0); both transform rows (wrath_wings / exec_window)
      { skill: 'paladin_hammer_of_wrath', patch: { damage: { coef: 2.8, type: 'holy' } } },
      { skill: 'paladin_hammer_of_wrath_exec', patch: { damage: { coef: 2.8, type: 'holy' } } },
    ],
    defaultBar: {
      lmb: 'paladin_basic', rmb: 'paladin_avengers_shield', q: 'paladin_shield_of_righteous', e: 'paladin_judgement', r: 'paladin_blessed_hammer',
      s1: 'paladin_consecration', s2: 'paladin_divine_steed', s3: 'paladin_word_of_glory', s4: 'paladin_rebuke',
      m45: 'paladin_avenging_wrath', m90: 'paladin_prot_ardent', m180: 'paladin_prot_bulwark',
    },
  },
  {
    id: 'paladin_holy', classId: 'paladin', name: 'Kutsal', role: 'healer', mainStat: 'int', basic: 'paladin_holy_basic',
    desc: 'Menzilli akıllı şifa: Kutsal Şok ritmini korur, Işık Aşısı ile bedava Işık Parlaması atar, Kutsal Gücü Işığın Sözü ve Şafak Işığı\'na harcar. İlahi Çınlama ile büyük şifa penceresi açar.',
    stats: { healingPct: 0.30, resourceRegenPct: 0.25, resourceRegen: -3.64, castSpeed: 0.10, threatPct: -0.4 },
    specials: [
      { id: 'trait_holy', desc: 'Akıllı şifa: seçili, imleçteki ya da en yaralı müttefik iyileşir. Işığın Sözü canı %35\'in altındaki hedefe %15 daha güçlüdür. Taşan şifanın %40\'ı hedefe kısa süreli kalkan olur.', params: { smartHeal: 1, overhealWard: 0.4 } },
    ],
    skills: ['paladin_beacon_of_light', 'paladin_blessing_protection', 'paladin_blessing_freedom', 
      'paladin_holy_shock', 'paladin_flash_of_light', 'paladin_cleanse', 'paladin_word_of_glory', 'paladin_light_of_dawn',
      'paladin_divine_steed', 'paladin_rebuke', 'paladin_divine_shield', 'paladin_holy_light', 'paladin_lay_on_hands', 'paladin_divine_toll', 'paladin_holy_aura_mastery',
    ],
    unlock: { paladin_beacon_of_light: 10, paladin_blessing_protection: 10, paladin_blessing_freedom: 16, 
      paladin_holy_shock: 1, paladin_flash_of_light: 1, paladin_rebuke: 1, paladin_cleanse: 12, paladin_word_of_glory: 1,
      paladin_light_of_dawn: 15, paladin_divine_shield: 15, paladin_divine_steed: 1, paladin_holy_light: 20, paladin_lay_on_hands: 25,
      paladin_divine_toll: 10, paladin_holy_aura_mastery: 30,
    },
    majors: { m45: 'paladin_divine_toll', m90: 'paladin_avenging_wrath', m180: 'paladin_holy_aura_mastery' },
    fx: [
      'T cast:paladin_holy_shock ch=.25 icd=3 => st(self,infusion_of_light,15)',
      'T cast:paladin_holy_basic_3 ch=.15 => st(self,infusion_of_light,15)',
    ].join(' ;; '),
    mods: [
      // Işığın Sözü (Eternal Flame version): heal 1.4 + 12 s HoT 1.6, x1.15 under 35 % HP, no missing-HP bonus / faith refund
      {
        skill: 'paladin_word_of_glory', patch: { heal: { coef: 1.4 } },
        params: { hotCoef: 1.6, hotDur: 12, lowHpBelow: 0.35, lowHpMult: 1.15, missingHpBonus: 0, selfRefund: 0 },
      },
      { skill: 'paladin_avengers_shield', params: { tauntDur: 0 } },
      { skill: 'paladin_divine_shield', patch: { cooldown: 300 } },
    ],
    defaultBar: {
      lmb: 'paladin_holy_basic', rmb: 'paladin_holy_shock', q: 'paladin_flash_of_light', e: 'paladin_light_of_dawn', r: 'paladin_word_of_glory',
      s1: 'paladin_cleanse', s2: 'paladin_divine_steed', s3: 'paladin_divine_shield', s4: 'paladin_rebuke',
      m45: 'paladin_divine_toll', m90: 'paladin_avenging_wrath', m180: 'paladin_holy_aura_mastery',
    },
  },
  {
    id: 'paladin_retribution', classId: 'paladin', name: 'Ceza', role: 'dps', mainStat: 'str',
    desc: 'Kutsal Güç biriktirip Kutsal Hüküm ve İlahi Fırtına\'ya harcayan hüküm sahibi. İntikam Kanatları ve İdam Hükmü Işık Çekici pencerelerini açar; Küllerin Uyanışı ve Adalet Savaşı ritmi bozmaz.',
    stats: { holyDamagePct: 0.20, attackSpeed: 0.10, critChance: 0.05 },
    specials: [
      { id: 'trait_retribution', desc: 'Zincirin üçüncü ve dördüncü vuruşları Kutsal Güç kazandırır; Kanatlar sırasında harcanan her Kutsal Güç bir Sefer yığını verir.', params: { crusadeStacks: 10 } },
    ],
    skills: ['paladin_blessing_protection', 'paladin_blessing_freedom', 
      'paladin_crusader_strike', 'paladin_verdict', 'paladin_divine_storm', 'paladin_blade_of_justice', 'paladin_judgement',
      'paladin_wake_of_ashes', 'paladin_divine_steed', 'paladin_rebuke', 'paladin_hammer_of_justice',
    ],
    unlock: { paladin_blessing_protection: 10, paladin_blessing_freedom: 16, 
      paladin_crusader_strike: 1, paladin_verdict: 1, paladin_divine_storm: 1, paladin_rebuke: 1, paladin_blade_of_justice: 12,
      paladin_judgement: 1, paladin_wake_of_ashes: 15, paladin_divine_steed: 1,
      paladin_hammer_of_wrath: 15, paladin_ret_execution: 10, paladin_avenging_wrath: 10, paladin_divine_shield: 15, paladin_hammer_of_justice: 10,
    },
    treeSkills: { paladin_hammer_of_wrath: 's05' },
    majors: { m45: 'paladin_ret_execution', m90: 'paladin_avenging_wrath', m180: 'paladin_divine_shield' },
    fx: [
      'T cast:paladin_crusader_strike => st(self,templar_combo,4)',
      'T hit:@basic ch=.12 icd=2 => st(self,art_of_war,12)',
      'T hit:paladin_crusader_strike ch=.08 => st(self,art_of_war,12)',
      'T cast:paladin_verdict ch=.15 => rst(paladin_judgement)',
      'T spend:holypower if=sst:wrath_wings => st(self,crusade,20) ; st(self,crusade,20) ; st(self,crusade,20)',
    ].join(' ;; '),
    mods: [
      // İntikam Kanatları for Ceza: 90 s, +15 %, opens two Işık Çekici
      {
        skill: 'paladin_avenging_wrath', patch: {
          cooldown: 90,
          selfStatuses: [{ status: 'wrath_wings', duration: 20, magnitude: 0.15 }, { status: 'hammer_window', duration: 12, stacks: 2 }],
        },
      },
      // Yargı for Ceza: one charge, 1.2; judged = target takes +10 % from the paladin (STATUS_RULES.judged takenMoreFromSource)
      { skill: 'paladin_judgement', patch: { charges: 1, damage: { coef: 1.2, type: 'holy' } } },
      { skill: 'paladin_avengers_shield', params: { tauntDur: 0 } },
    ],
    defaultBar: {
      lmb: 'paladin_basic', rmb: 'paladin_crusader_strike', q: 'paladin_verdict', e: 'paladin_judgement', r: 'paladin_wake_of_ashes',
      s1: 'paladin_blade_of_justice', s2: 'paladin_divine_steed', s3: 'paladin_divine_storm', s4: 'paladin_rebuke',
      m45: 'paladin_ret_execution', m90: 'paladin_avenging_wrath', m180: 'paladin_divine_shield',
    },
  },
];

export const PALADIN_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(PALADIN_SPEC_LIST.map((s) => [s.id, s]));
