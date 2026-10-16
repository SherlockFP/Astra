/**
 * Nekromant SpecDefs (docs/kits/plate-melee.md §8, §9, f3, PM-NE sketch): Kemik Muhafızı (Blood Death Knight, tank) and Ordu Efendisi
 * (Unholy Death Knight, dps). PM-00c created the empty table; PM-NE fills it. OWNER: PM-NE. Merged into SPECS by data/specs.ts.
 *
 * Both specs are Strength specs (mainStat str). The own-damage handicaps of the GDD_CLASSES_V2 sketch are dropped (G10: the coefficients are final).
 * Öz (Runic Power) does not regenerate by itself (ClassDef necromancer baseStats.resourceRegen 0, decays out of combat like rage); the rune pip
 * (TALENT_PIPS.rune, max 6, +1 per 10 s) is registered by plateKit.ts and read for the necromancer class by SkillSystem.activePips.
 * Spec `fx` rows (§8b / §9b) are chance / PRD triggers read by StatCalc.collectFx -> ProcEngine (combat/Procs.ts):
 *   Kemik Muhafızı  dancing_rune_weapon echoes 50 % of Kalp Darbesi / Kan Kaynatma / İlik Söken / Ölüm Darbesi (the echo is a plain hit; castEcho
 *                   does not replay the behaviour, so an echoed Ölüm Darbesi does not heal). Ölüm Darbesi applies blood_shield by itself (behaviour).
 *   Ordu Efendisi   Ani Kıyamet (sudden_doom) 12 % per Çürüten Darbe / Ölüm Kırbacı hit and per chain step 3 (icd 2 s each).
 * Kemik Muhafızı trait_anger (Vampirik Kan Anger Management): every 20 Öz spent shortens m45 / m90 / m180 by 1 s (combat/specials.ts onSpend).
 * Ordu Efendisi trait_summoner.pet = 1: Minions.ensurePets keeps one necro_ghoul alive (cap 1, free respawn is the MinionDef.respawn row).
 */
import type { SpecDef, SpecId } from '../types/v2';

const NECRO_SPEC_LIST: SpecDef[] = [
  {
    id: 'necromancer_bone', classId: 'necromancer', name: 'Kemik Muhafızı', role: 'tank', mainStat: 'str', basic: 'necro_blood_basic',
    desc: 'Kemik Zırhı yüklerini İlik Söken ile tazeleyen, Ölüm Darbesi ile son 5 saniyede aldığı hasarı geri iyileşen kan tankı. Kalp Darbesi ve Kan Kaynatma tehdit üretir, Ölüm Kancası düşmanı çekip kışkırtır.',
    stats: { maxHpPct: 0.30, armorPct: 0.35, lifeSteal: 0.03, threatPct: 2.0 },
    specials: [
      { id: 'trait_bone_shield', desc: 'Kemik Zırhı: her yük hasarı %3 azaltır; aldığın her yakın dövüş vuruşu 2.5 saniyede bir yük harcar.', params: { icd: 2.5 } },
      { id: 'trait_anger', desc: 'Harcanan her 20 Öz, majör bekleme sürelerini 1 saniye azaltır (Vampirik Kan\'ın Öfke Yönetimi).', params: { angerPer: 20 } },
      { id: 'mastery_blood_shield', desc: 'Kan Kalkanı: Ölüm Darbesi iyileşmesinin %20\'si kadar emici Kan Zırhı kazandırır.', params: { shieldPct: 0.2 } },
    ],
    skills: [
      'necro_heart_strike', 'necro_death_strike', 'necro_marrowrend', 'necro_deaths_grip', 'necro_blood_boil',
      'necro_deaths_advance', 'necro_anti_magic_shell', 'necro_mind_freeze', 'necro_death_and_decay', 'necro_raise_dead',
    ],
    unlock: {
      necro_heart_strike: 10, necro_death_strike: 10, necro_mind_freeze: 1, necro_marrowrend: 12, necro_blood_boil: 12,
      necro_deaths_grip: 15, necro_anti_magic_shell: 4, necro_deaths_advance: 1, necro_death_and_decay: 12, necro_raise_dead: 20,
    },
    treeSkills: { necro_marrowrend: 's05' },
    majors: { m45: 'necro_vampiric_blood', m90: 'necro_dancing_rune_weapon', m180: 'necro_icebound_fortitude' },
    // Hayalet Orak Dansı: the four rotation skills echo at 50 % (0.2 s later) while the status is up
    fx: [
      'T cast:necro_heart_strike if=sst:dancing_rune_weapon => echo(necro_heart_strike,0.5,0.2)',
      'T cast:necro_blood_boil if=sst:dancing_rune_weapon => echo(necro_blood_boil,0.5,0.2)',
      'T cast:necro_marrowrend if=sst:dancing_rune_weapon => echo(necro_marrowrend,0.5,0.2)',
      'T cast:necro_death_strike if=sst:dancing_rune_weapon => echo(necro_death_strike,0.5,0.2)',
    ].join(' ;; '),
    mods: [],
    defaultBar: {
      lmb: 'necro_blood_basic', rmb: 'necro_heart_strike', q: 'necro_death_strike', e: 'necro_marrowrend', r: 'necro_deaths_grip',
      s1: 'necro_blood_boil', s2: 'necro_deaths_advance', s3: 'necro_anti_magic_shell', s4: 'necro_mind_freeze',
      m45: 'necro_vampiric_blood', m90: 'necro_dancing_rune_weapon', m180: 'necro_icebound_fortitude',
    },
  },
  {
    id: 'necromancer_summoner', classId: 'necromancer', name: 'Ordu Efendisi', role: 'dps', mainStat: 'str',
    desc: 'Kalıcı Kemik Ghul\'u, Küçük Ghullar ve Ölüler Ordusu ile savaşan ölüm şövalyesi. Çürüten Darbe yük biriktirir, Ölüm Kırbacı onları patlatıp ghul doğurur; Ani Kıyamet bedava Ölüm Sarmalı verir, Karanlık Dönüşüm ve Ölüler Ordusu patlama pencereleridir.',
    stats: { minionDamagePct: 0.25, minionHpPct: 0.20, shadowDamagePct: 0.10 },
    specials: [
      { id: 'trait_summoner', desc: 'Kemik Ghul\'u her zaman yanındadır (ölürse 10 saniyede, sahne değişince 2 saniyede geri döner). Küçük Ghul sınırı 3.', params: { lesserGhoulCap: 3, ghoulRevive: 0, pet: 1 } },
    ],
    skills: [
      'necro_scourge_strike', 'necro_death_coil', 'necro_festering_strike', 'necro_outbreak', 'necro_apocalypse',
      'necro_deaths_advance', 'necro_anti_magic_shell', 'necro_mind_freeze', 'necro_death_and_decay', 'necro_raise_dead',
    ],
    unlock: {
      necro_scourge_strike: 1, necro_death_coil: 1, necro_festering_strike: 1, necro_outbreak: 10, necro_dark_transformation: 5, necro_apocalypse: 20,
      necro_mind_freeze: 1, necro_anti_magic_shell: 4, necro_deaths_advance: 1, necro_death_and_decay: 12, necro_raise_dead: 20,
    },
    treeSkills: { necro_epidemic: 's05' },
    majors: { m45: 'necro_dark_transformation', m90: 'necro_army_of_the_dead', m180: 'necro_icebound_fortitude' },
    // Ani Kıyamet: Çürüten Darbe / Ölüm Kırbacı hit and chain step 3, 12 % PRD each (icd 2 s); makes Ölüm Sarmalı / Salgın free (PROC_MODS)
    fx: [
      'T hit:necro_scourge_strike ch=.12 icd=2 => st(self,sudden_doom,12)',
      'T hit:necro_festering_strike ch=.12 icd=2 => st(self,sudden_doom,12)',
      'T hit:necro_basic_3 ch=.12 icd=2 => st(self,sudden_doom,12)',
    ].join(' ;; '),
    mods: [],
    defaultBar: {
      lmb: 'necro_basic', rmb: 'necro_scourge_strike', q: 'necro_death_coil', e: 'necro_festering_strike', r: 'necro_outbreak',
      s1: 'necro_epidemic', s2: 'necro_deaths_advance', s3: 'necro_anti_magic_shell', s4: 'necro_mind_freeze',
      m45: 'necro_dark_transformation', m90: 'necro_army_of_the_dead', m180: 'necro_icebound_fortitude',
    },
  },
  {
    id: 'necromancer_frost', classId: 'necromancer', name: 'Buz Kıyıcısı', role: 'dps', mainStat: 'str', basic: 'necro_basic',
    desc: 'Yok Edici Darbe ve Buz Darbesi ile savaşan buz ölüm şövalyesi. Öldürücü Makine kesin kritik, Kırağı Uluyan Patlama\'yı güçlendirir; Buz Sütunu ve Buz Ejderi Öfkesi büyük patlama pencereleridir.',
    stats: { critChance: 0.05, damagePct: 0.10 },
    specials: [],
    skills: [
      'necro_obliterate', 'necro_frost_strike', 'necro_howling_blast', 'necro_remorseless_winter', 'necro_chains_of_ice',
      'necro_deaths_advance', 'necro_icebound_fortitude', 'necro_mind_freeze', 'necro_empower_rune_weapon', 'necro_pillar_of_frost',
      'necro_frostwyrms_fury', 'necro_death_and_decay', 'necro_raise_dead',
    ],
    unlock: {
      necro_obliterate: 1, necro_frost_strike: 1, necro_mind_freeze: 1, necro_deaths_advance: 1, necro_howling_blast: 10,
      necro_chains_of_ice: 10, necro_empower_rune_weapon: 10, necro_remorseless_winter: 12, necro_death_and_decay: 12,
      necro_pillar_of_frost: 20, necro_raise_dead: 20, necro_icebound_fortitude: 30, necro_frostwyrms_fury: 30,
    },
    treeSkills: { necro_obliterate: 's05' },
    majors: { m45: 'necro_empower_rune_weapon', m90: 'necro_pillar_of_frost', m180: 'necro_frostwyrms_fury' },
    // Öldürücü Makine (Killing Machine): Frost Strike crit (15 %) -> next Yok Edici Darbe forced crit; Kırağı (Rime): Obliterate 20 % -> next Uluyan Patlama +50 %
    fx: [
      'T hit:necro_frost_strike ch=.15 icd=2 => st(self,killing_machine,8)',
      'T hit:necro_obliterate ch=.2 icd=1 => st(self,rime,15)',
    ].join(' ;; '),
    mods: [],
    defaultBar: {
      lmb: 'necro_basic', rmb: 'necro_obliterate', q: 'necro_frost_strike', e: 'necro_howling_blast', r: 'necro_chains_of_ice',
      s1: 'necro_remorseless_winter', s2: 'necro_deaths_advance', s3: 'necro_icebound_fortitude', s4: 'necro_mind_freeze',
      m45: 'necro_empower_rune_weapon', m90: 'necro_pillar_of_frost', m180: 'necro_frostwyrms_fury',
    },
  },
];

export const NECRO_SPECS: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(NECRO_SPEC_LIST.map((s) => [s.id, s]));
