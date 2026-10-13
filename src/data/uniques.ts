import type { SetDef, SetPieceDef, UniqueDef } from '../types/items';

/**
 * Legendaries (GDD_SYSTEMS 4.9) and sets (4.10). `special.id` is implemented by the combat module through
 * `G.character.hasSpecial(id)` / `specialParams(id)` (see CharacterState). Percent values are fractions.
 * OWNER: items module.
 */
const p = (v: number) => +(v / 100).toFixed(5);

export const UNIQUES: Record<string, UniqueDef> = {};
function u(d: Omit<UniqueDef, 'rarity'>): void {
  UNIQUES[d.id] = { ...d, rarity: 'legendary' };
}

u({
  id: 'leg_dragonfang', baseId: 'sword1h_t4', name: 'Ejderdişi', minItemLevel: 40, classes: ['knight'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'fireDamagePct', min: p(15), max: p(20) }, { stat: 'str', min: 20, max: 30 }],
  special: { id: 'leg_dragonfang', desc: 'Kılıç Kombosu\'nun 3. vuruşu önüne 6 m ilerleyen bir ateş dalgası salar (%150 ateş hasarı).', params: { range: 6, coef: 1.5 } },
  flavor: 'Bir ejderin son nefesi bu çeliğe işlendi.',
});
u({
  id: 'leg_mountain_heart', baseId: 'shield_t3', name: 'Dağın Kalbi', minItemLevel: 40, classes: ['knight'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'blockChance', min: p(5), max: p(5) }, { stat: 'maxHp', min: 150, max: 220 }],
  special: { id: 'leg_mountain_heart', desc: 'Engellenen her vuruş 3 m şok dalgası yaratır (%100 hasar, 1 sn bekleme) ve Kalkan Darbesi\'nin bekleme süresini 0.5 sn azaltır.', params: { radius: 3, coef: 1, icd: 1, cdReduce: 0.5 } },
  flavor: 'Taşın içinde hâlâ bir kalp atıyor.',
});
u({
  id: 'leg_skullsplitter', baseId: 'axe2h_t4', name: 'Kafatası Yaran', minItemLevel: 40, classes: ['barbarian'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'critDamage', min: p(25), max: p(35) }, { stat: 'str', min: 20, max: 30 }],
  special: { id: 'leg_skullsplitter', desc: 'Yer Yaran 30°\'lik yelpazede 3 yarık açar (her biri %60 hasar). +%30 sarsma.', params: { fissures: 3, spreadDeg: 30, coef: 0.6, staggerPct: 0.3 } },
  flavor: 'Cellat bile bu baltadan korkar.',
});
u({
  id: 'leg_heart_of_storm', baseId: 'chest_heavy_t3', name: 'Kasırganın Yüreği', minItemLevel: 35, classes: ['barbarian'], source: 'Herhangi bir patron (35+)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(10), max: p(14) }, { stat: 'str', min: 25, max: 35 }, { stat: 'resAll', min: p(8), max: p(10) }],
  special: { id: 'leg_heart_of_storm', desc: 'Kasırga 6 m içindeki düşmanları içine çeker ve %30 daha az Öfke harcar.', params: { pullRadius: 6, costReduce: 0.3 } },
  flavor: 'Göğsünde bir fırtına uğulduyor.',
});
u({
  id: 'leg_ember_staff', baseId: 'staff_t4', name: 'Kül Asası', minItemLevel: 40, classes: ['mage'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'fireDamagePct', min: p(20), max: p(30) }, { stat: 'int', min: 20, max: 30 }],
  special: { id: 'leg_ember_staff', desc: 'Ateş Topu çarptığında 3 küçük ateş topuna bölünür (her biri %40 hasar). Yanan düşmanlar öldüğünde yanma 4 m çevreye yayılır.', params: { splitCount: 3, splitCoef: 0.4, spreadRadius: 4 } },
  flavor: 'Küllerin içinden doğan her şey yanmaya mahkûmdur.',
});
u({
  id: 'leg_frozen_crown', baseId: 'helm_light_t3', name: 'Donmuş Taç', minItemLevel: 35, classes: ['mage'], source: 'Herhangi bir patron (35+)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'cdr', min: p(6), max: p(8) }, { stat: 'resFrost', min: p(20), max: p(20) }],
  special: { id: 'leg_frozen_crown', desc: 'Buz Halkası 2 şarja sahip olur. Donmuş düşmanlar %25 daha fazla hasar alır.', params: { charges: 2, frozenDamage: 0.25 } },
  flavor: 'Buzul Tahtı\'nın soğuğu hâlâ içinde.',
});
u({
  id: 'leg_tome_of_echoes', baseId: 'tome_t4', name: 'Yankılar Kitabı', minItemLevel: 45, classes: ['mage'], source: 'Mitik+ sandığı / patron (45+)',
  fixedAffixes: [{ stat: 'damagePct', min: p(12), max: p(16) }, { stat: 'maxResource', min: 10, max: 15 }, { stat: 'castSpeed', min: p(8), max: p(10) }],
  special: { id: 'leg_tome_of_echoes', desc: 'Gizem büyülerin %20 şansla bedavaya ikinci kez atılır.', params: { echoChance: 0.2 } },
  flavor: 'Her sayfa bir önceki sayfanın yankısıdır.',
});
u({
  id: 'leg_whisper', baseId: 'dagger_t4', name: 'Fısıltı', minItemLevel: 40, classes: ['rogue'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'dex', min: 20, max: 30 }],
  special: { id: 'leg_whisper', desc: 'Kritik vuruşlar +2 Zehir yığını uygular. 5 Kombo ile İnfaz 2 Kombo Puanı iade eder.', params: { poisonStacks: 2, refundCombo: 2 } },
  flavor: 'Duyulmaz, yalnızca hissedilir.',
});
u({
  id: 'leg_nightstalker_hood', baseId: 'helm_medium_t3', name: 'Gece Avcısı Başlığı', minItemLevel: 35, classes: ['rogue'], source: 'Herhangi bir patron (35+)',
  fixedAffixes: [{ stat: 'dex', min: 20, max: 30 }, { stat: 'critChance', min: p(2), max: p(3) }, { stat: 'resShadow', min: p(20), max: p(20) }],
  special: { id: 'leg_nightstalker_hood', desc: 'Gölge Adımı\'ndan sonra 2 sn gizlenirsin; gizlenmeden yapılan ilk vuruş +%100 kritik hasarı alır.', params: { stealthSec: 2, critDamage: 1 } },
  flavor: 'Gece, onu giyeni asla unutmaz.',
});
u({
  id: 'leg_windrunner', baseId: 'boots_{w}_t3', name: 'Rüzgâr Koşucusu', minItemLevel: 30, source: 'Herhangi bir patron (30+)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(14), max: p(18) }, { stat: 'maxHp', min: 100, max: 150 }, { stat: 'str', mainStat: true, min: 15, max: 25 }],
  special: { id: 'leg_windrunner', desc: 'Kaçış Yuvarlanması +1 şarj kazanır; her yuvarlanma 3 sn boyunca +%15 hareket ve saldırı/büyü hızı verir.', params: { charges: 1, buffSec: 3, buffPct: 0.15 } },
  flavor: 'Rüzgâr onunla yarışmaktan vazgeçti.',
});
u({
  id: 'leg_blood_ring', baseId: 'ring_iron', name: 'Kan Yüzüğü', minItemLevel: 30, source: 'Herhangi bir patron (30+)',
  fixedAffixes: [{ stat: 'lifeSteal', min: p(2), max: p(3) }, { stat: 'critDamage', min: p(15), max: p(20) }, { stat: 'vit', min: 15, max: 20 }],
  special: { id: 'leg_blood_ring', desc: 'Can çalma süreli hasarlara (DoT) %50 verimle uygulanır.', params: { dotLifeSteal: 0.5 } },
  flavor: 'Kırmızı taş hiç kurumaz.',
});
u({
  id: 'leg_eye_of_ancients', baseId: 'amulet_ancient', name: 'Kadimlerin Gözü', minItemLevel: 50, source: 'Mitik+ sandığı',
  fixedAffixes: [{ stat: 'allAttr', min: 15, max: 20 }, { stat: 'resAll', min: p(10), max: p(14) }, { stat: 'cdr', min: p(5), max: p(5) }],
  special: { id: 'leg_eye_of_ancients', desc: 'Son 4 sn içinde verdiğin her farklı hasar türü için +%8 hasar (en fazla 3 tür).', params: { perType: 0.08, maxTypes: 3, window: 4 } },
  flavor: 'Her şeyi görür, hiçbir şeyi unutmaz.',
});
u({
  id: 'leg_madmans_belt', baseId: 'belt_heavy', name: 'Çılgının Kemeri', minItemLevel: 30, source: 'Herhangi bir patron (30+)',
  fixedAffixes: [{ stat: 'maxHp', min: 150, max: 220 }, { stat: 'potionPct', min: p(10), max: p(10) }, { stat: 'str', mainStat: true, min: 15, max: 20 }],
  special: { id: 'leg_madmans_belt', desc: 'Canın %50\'nin altındayken +%25 saldırı ve büyü hızı ile +%3 can çalma kazanırsın.', params: { hpBelow: 0.5, speed: 0.25, lifeSteal: 0.03 } },
  flavor: 'Delilik de bir tür cesarettir.',
});
u({
  id: 'leg_titan_grip', baseId: 'gloves_heavy_t3', name: 'Titan Kavrayışı', minItemLevel: 40, classes: ['knight', 'barbarian'], source: 'Herhangi bir patron (40+)',
  fixedAffixes: [{ stat: 'attackSpeed', min: p(8), max: p(10) }, { stat: 'str', min: 20, max: 30 }, { stat: 'critDamage', min: p(10), max: p(10) }],
  special: { id: 'leg_titan_grip', desc: 'Temel saldırının her 3. vuruşu 3 m geri iten bir şok dalgası yaratır (%200 hasar).', params: { radius: 3, coef: 2 } },
  flavor: 'Dağları kaldırmış eller.',
});
u({
  id: 'leg_phoenix_mantle', baseId: 'shoulders_{w}_t4', name: 'Anka Omuzluğu', minItemLevel: 45, source: 'Mitik+ sandığı / patron (45+)',
  fixedAffixes: [{ stat: 'fireDamagePct', min: p(8), max: p(12) }, { stat: 'resFire', min: p(20), max: p(20) }, { stat: 'maxHp', min: 100, max: 150 }],
  special: { id: 'leg_phoenix_mantle', desc: 'Ölümcül hasar aldığında %40 canla dirilir ve 6 m ateş patlaması yaratırsın (%400 ateş hasarı). 180 sn bekleme. (Mitik+ ölüm sayacına eklenmez.)', params: { hpFrac: 0.4, radius: 6, coef: 4, cooldown: 180 } },
  flavor: 'Küllerinden doğmayı bilenin armağanı.',
});
u({
  id: 'leg_merchant_kings_ring', baseId: 'ring_gold', name: 'Tüccar Kralın Yüzüğü', minItemLevel: 20, source: 'Herhangi bir patron (20+)',
  fixedAffixes: [{ stat: 'goldFindPct', min: p(40), max: p(60) }, { stat: 'magicFindPct', min: p(10), max: p(10) }, { stat: 'maxHp', min: 60, max: 100 }],
  special: { id: 'leg_merchant_kings_ring', desc: 'Altın toplamak maks. canının %0.5\'ini iyileştirir. Altın mıknatıs yarıçapı +4 m.', params: { healPct: 0.005, magnetBonus: 4 } },
  flavor: 'Altın, yalnızca onu sevenin elinde parlar.',
});

// ---------------------------------------------------------------------------- sets (4 sets x 4 pieces)
// ---- Vadi Efsanevileri (GDD_OPENWORLD 4.7): stat-only legendaries, no `special` (combat has nothing to implement).
// Dropped by named rares (LootTableDef.uniqueIds + uniqueChance). minItemLevel is below the usual legendary floor on purpose.
u({
  id: 'leg_vadi_gumus_pence', baseId: 'dagger_t1', name: 'Gümüş Pençe', minItemLevel: 3, source: 'Gümüş Yele (Vadi nadir)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(40), max: p(55) }, { stat: 'critChance', min: p(2), max: p(3) }, { stat: 'dex', min: 6, max: 9 }],
  flavor: 'Bir kurdun son pençesi hâlâ keskin.',
});
u({
  id: 'leg_vadi_boz_postu', baseId: 'chest_heavy_t1', name: 'Boz Postu', minItemLevel: 8, source: 'Büyük Boz (Vadi nadir)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(25), max: p(35) }, { stat: 'maxHp', min: 60, max: 90 }, { stat: 'vit', min: 8, max: 12 }],
  flavor: 'Tarlaların sahibi artık yok.',
});
u({
  id: 'leg_vadi_gece_tuyu', baseId: 'amulet_lapis', name: 'Gece Tüyü Kolyesi', minItemLevel: 13, source: 'Gölge Alfa (Vadi nadir)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(4), max: p(6) }, { stat: 'dodgeChance', min: p(2), max: p(3) }, { stat: 'critDamage', min: p(10), max: p(15) }],
  flavor: 'Sessiz adımlar, sessiz ölümler.',
});
u({
  id: 'leg_vadi_kemik_tac', baseId: 'helm_heavy_t3', name: 'Kemik Tacı', minItemLevel: 26, source: 'Kemik Kral Hargar (Vadi nadir)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(6), max: p(8) }, { stat: 'resShadow', min: p(15), max: p(20) }, { stat: 'allAttr', min: 10, max: 14 }],
  flavor: 'Taç ağır, hükümdarlık daha ağır.',
});

export const SET_PIECES: Record<string, SetPieceDef> = {};
export const SETS: Record<string, SetDef> = {};

function set(def: SetDef, pieces: { id: string; name: string; baseId: string; classId?: SetPieceDef['classId'] }[]): void {
  SETS[def.id] = def;
  for (const pc of pieces) SET_PIECES[pc.id] = { ...pc, setId: def.id };
}

set({
  id: 'set_holy_vanguard', name: 'Kutsal Öncü', pieces: ['sp_hv_helm', 'sp_hv_shoulders', 'sp_hv_chest', 'sp_hv_shield'],
  bonuses: [
    { count: 2, stats: { armorPct: 0.2 }, special: { id: 'set_holy_vanguard_2', desc: 'Kutsal Toprak müttefikleri saniyede ek %1.5 iyileştirir.' } },
    { count: 4, special: { id: 'set_holy_vanguard_4', desc: 'Meydan Okuma, Kalkan Darbesi\'nin bekleme süresini sıfırlar. Kalkan Darbesi %200 DAHA FAZLA hasar verir ve 4 m kutsal patlama yaratır (%200 kutsal hasar).' } },
  ],
}, [
  { id: 'sp_hv_helm', name: 'Kutsal Öncü Miğferi', baseId: 'helm_heavy_t{t}', classId: 'knight' },
  { id: 'sp_hv_shoulders', name: 'Kutsal Öncü Omuzlukları', baseId: 'shoulders_heavy_t{t}', classId: 'knight' },
  { id: 'sp_hv_chest', name: 'Kutsal Öncü Zırhı', baseId: 'chest_heavy_t{t}', classId: 'knight' },
  { id: 'sp_hv_shield', name: 'Kutsal Öncü Kalkanı', baseId: 'shield_t{t}', classId: 'knight' },
]);
set({
  id: 'set_wolfblood', name: 'Kurt Kanı', pieces: ['sp_wb_helm', 'sp_wb_chest', 'sp_wb_legs', 'sp_wb_axe'],
  bonuses: [
    { count: 2, special: { id: 'set_wolfblood_2', desc: 'Savaş Narası aktifken +%15 saldırı hızı.' } },
    { count: 4, special: { id: 'set_wolfblood_4', desc: 'Kasırga her 1 sn\'de düşman arayan bir kan hortumu çıkarır (%120 hasar/sn, 3 sn yaşar). Savaş Narası\'ndan sonraki 4 sn Kasırga Öfke harcamaz.' } },
  ],
}, [
  { id: 'sp_wb_helm', name: 'Kurt Kanı Başlığı', baseId: 'helm_heavy_t{t}', classId: 'barbarian' },
  { id: 'sp_wb_chest', name: 'Kurt Kanı Göğüslüğü', baseId: 'chest_heavy_t{t}', classId: 'barbarian' },
  { id: 'sp_wb_legs', name: 'Kurt Kanı Bacaklığı', baseId: 'legs_heavy_t{t}', classId: 'barbarian' },
  { id: 'sp_wb_axe', name: 'Kurt Kanı Baltası', baseId: 'axe2h_t{t}', classId: 'barbarian' },
]);
set({
  id: 'set_archmage_legacy', name: 'Başbüyücünün Mirası', pieces: ['sp_am_helm', 'sp_am_chest', 'sp_am_gloves', 'sp_am_amulet'],
  bonuses: [
    { count: 2, stats: { resourceRegenPct: 0.2, cdr: 0.1 }, special: { id: 'set_archmage_legacy_2', desc: '+%20 mana yenilenmesi; bekleme süreleri −%10.' } },
    { count: 4, special: { id: 'set_archmage_legacy_4', desc: 'Meteor 2 ek meteor çağırır (%60 hasar, 1.5 m sapma) ve Işınlanma\'nın bekleme süresini sıfırlar.' } },
  ],
}, [
  { id: 'sp_am_helm', name: 'Başbüyücü Şapkası', baseId: 'helm_light_t{t}', classId: 'mage' },
  { id: 'sp_am_chest', name: 'Başbüyücü Cübbesi', baseId: 'chest_light_t{t}', classId: 'mage' },
  { id: 'sp_am_gloves', name: 'Başbüyücü Eldivenleri', baseId: 'gloves_light_t{t}', classId: 'mage' },
  { id: 'sp_am_amulet', name: 'Başbüyücü Kolyesi', baseId: 'amulet_lapis', classId: 'mage' },
]);
set({
  id: 'set_shadow_veil', name: 'Gölge Peçesi', pieces: ['sp_sv_helm', 'sp_sv_gloves', 'sp_sv_boots', 'sp_sv_dagger'],
  bonuses: [
    { count: 2, special: { id: 'set_shadow_veil_2', desc: 'Kaçış Yuvarlanması\'ndan sonra 3 sn +%10 kritik şansı.' } },
    { count: 4, special: { id: 'set_shadow_veil_4', desc: '5 Kombo ile İnfaz, Gölge Adımı\'nı sıfırlar ve %150 DAHA FAZLA hasar verir.' } },
  ],
}, [
  { id: 'sp_sv_helm', name: 'Gölge Peçesi Başlığı', baseId: 'helm_medium_t{t}', classId: 'rogue' },
  { id: 'sp_sv_gloves', name: 'Gölge Peçesi Eldivenleri', baseId: 'gloves_medium_t{t}', classId: 'rogue' },
  { id: 'sp_sv_boots', name: 'Gölge Peçesi Botları', baseId: 'boots_medium_t{t}', classId: 'rogue' },
  { id: 'sp_sv_dagger', name: 'Gölge Peçesi Hançeri', baseId: 'dagger_t{t}', classId: 'rogue' },
]);

/** Set id of the class (for smart loot). */
export const CLASS_SET: Record<string, string> = { knight: 'set_holy_vanguard', barbarian: 'set_wolfblood', mage: 'set_archmage_legacy', rogue: 'set_shadow_veil' };
