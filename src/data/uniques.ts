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

// ---------------------------------------------------------------------------- Season 1 dungeon named items (K18)
// Source: docs/dungeons/*.md loot sections. Every `special.id` is the unique id; the combat hook is not written yet
// (only `leg_merchant_kings_ring` is read today). Bases: weapon bases exist only for sword1h, axe2h, staff, wand, dagger,
// shield, tome; 2H swords, maces and polearms use axe2h / sword1h. Trinket slots do not exist: trinkets are amulets or rings.

// ---- Büyücü Terasi (buyucu_terasi): loot_mt_b1..b4
u({ id: 'mt_gloves_kural', baseId: 'gloves_medium_t3', name: 'Kuralsız Eldivenler', minItemLevel: 60, classes: ['rogue', 'monk'], source: 'Arkanotron (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'attackSpeed', min: p(6), max: p(8) }, { stat: 'dex', min: 20, max: 30 }, { stat: 'critChance', min: p(2), max: p(3) }],
  special: { id: 'mt_gloves_kural', desc: 'Kıl payı kaçış İhlal yığını verir (8 sn, en fazla 5). 5 yığında bir sonraki hasar veren yeteneğin %150 hasar verir.', params: { stackSec: 8, maxStacks: 5, bonus: 1.5 } } });
u({ id: 'mt_belt_shackle', baseId: 'belt_heavy', name: 'Eterik Pranga Kemeri', minItemLevel: 60, classes: ['knight', 'barbarian'], source: 'Arkanotron (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(6), max: p(8) }, { stat: 'str', min: 20, max: 30 }, { stat: 'resAll', min: p(6), max: p(8) }],
  special: { id: 'mt_belt_shackle', desc: 'Kök ve Yavaşlatma etkileri %50 kısalır. Bir kök bittiğinde 4 m çevreye silah hasarının %80\'i kadar Arkan patlaması yapar (10 sn bekleme).', params: { rootReduce: 0.5, burstCoef: 0.8, radius: 4, icd: 10 } } });
u({ id: 'mt_ring_orb', baseId: 'ring_gold', name: 'Enerji Küresi Mührü', minItemLevel: 60, classes: ['mage', 'warlock', 'necromancer', 'evoker', 'paladin'], source: 'Arkanotron (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'castSpeed', min: p(5), max: p(6) }, { stat: 'int', min: 15, max: 20 }, { stat: 'critChance', min: p(2), max: p(3) }],
  special: { id: 'mt_ring_orb', desc: 'Kritik vuruşların %20 şansla seni izleyen bir Enerji Küresi doğurur (en fazla 3, 8 sn). Küre 2 sn\'de bir en yakın düşmana %60 büyü hasarı verir.', params: { chance: 0.2, orbSec: 8, tick: 2, coef: 0.6, maxOrbs: 3, icd: 3 } } });
u({ id: 'leg_cynosure_pendant', baseId: 'amulet_ancient', name: 'Alacakaranlık Feneri Kolyesi', minItemLevel: 60, source: 'Seranel (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'resAll', min: p(7), max: p(9) }, { stat: 'moveSpeedPct', min: p(6), max: p(8) }, { stat: 'vit', min: 15, max: 20 }],
  special: { id: 'leg_cynosure_pendant', desc: 'Susturma ve Korku etkilerine karşı 6 sn bağışıklık kazanırsın (45 sn bekleme); bağışıklık sürerken hareket hızın %15 artar.', params: { immuneSec: 6, icd: 45, moveSpeed: 0.15 } } });
u({ id: 'mt_shield_dome', baseId: 'shield_t3', name: 'Kubbe Kırıcı Kalkan', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Seranel (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(50), max: p(70) }, { stat: 'blockChance', min: p(4), max: p(6) }, { stat: 'maxHp', min: 150, max: 220 }],
  special: { id: 'mt_shield_dome', desc: 'Başarılı bir blok veya savuşturma 6 m çevredeki düşmanların büyülerini 2 sn susturur (12 sn bekleme) ve 25 sersemletme hasarı verir.', params: { silenceSec: 2, radius: 6, icd: 12, poiseDmg: 25 } } });
u({ id: 'mt_sword_glaive', baseId: 'sword1h_t3', name: 'Güneşkamçı\'nın Rünlü Kılıcı', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Seranel (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'attackSpeed', min: p(5), max: p(6) }, { stat: 'str', min: 20, max: 25 }],
  special: { id: 'mt_sword_glaive', desc: 'Her 3. hafif saldırı bir Rünlü Mızrak fırlatır: mızrak 2 kez sekip %70 silah hasarı verir; vurduğu büyücü düşmanın büyüsünü keser (8 sn\'de bir).', params: { everyNth: 3, bounces: 2, coef: 0.7, interruptIcd: 8 } } });
u({ id: 'mt_helm_triplicate', baseId: 'helm_light_t3', name: 'Üçlü Boşluk Başlığı', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker', 'necromancer'], source: 'Gemellus (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'aoePct', min: p(15), max: p(20) }, { stat: 'int', min: 20, max: 30 }, { stat: 'cdr', min: p(3), max: p(4) }],
  special: { id: 'mt_helm_triplicate', desc: 'En az 3 farklı düşmana vuran her saldırı Çoğalma yığını verir (6 sn, en fazla 5, yığın başına +%6 hasar). Tek hedefe vurmak yığınları söndürür.', params: { minTargets: 3, stackSec: 6, maxStacks: 5, perStack: 0.06 } } });
u({ id: 'mt_legs_neural', baseId: 'legs_medium_t3', name: 'Sinirsel Bağ Pantolonu', minItemLevel: 60, classes: ['rogue', 'monk'], source: 'Gemellus (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'dex', min: 20, max: 30 }, { stat: 'critChance', min: p(2), max: p(3) }, { stat: 'damagePct', min: p(6), max: p(8) }],
  special: { id: 'mt_legs_neural', desc: 'Tek hedefe verdiğin hasarın %25\'i hedefe en yakın 2 düşmana (6 m) yayılır.', params: { share: 0.25, targets: 2, radius: 6 } } });
u({ id: 'mt_staff_echo', baseId: 'staff_t3', name: 'Gemellus\'un Yankı Asası', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker'], source: 'Gemellus (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'damagePct', min: p(8), max: p(10) }, { stat: 'castSpeed', min: p(6), max: p(7) }, { stat: 'int', min: 20, max: 30 }],
  special: { id: 'mt_staff_echo', desc: 'Her 4. büyü 1.2 sn sonra %50 hasarla yankılanır (aynı hedef); yankı sürerken büyü hızın %15 artar.', params: { everyNth: 4, delay: 1.2, coef: 0.5, haste: 0.15 } } });
u({ id: 'leg_orrery_staff', baseId: 'staff_t4', name: 'Yörünge Asası', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker'], source: 'Degentrius (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'arcaneDamagePct', min: p(15), max: p(20) }, { stat: 'int', min: 25, max: 35 }],
  special: { id: 'leg_orrery_staff', desc: 'Arkan veya Gölge hasarı veren büyülerin her 3 sn\'de bir hedefin çevresinde Mercek Küresi başlatır: küre 6 sn döner, 1.5 sn\'de bir %60 hasar verir (en fazla 3).', params: { icd: 3, orbSec: 6, tick: 1.5, coef: 0.6, maxOrbs: 3 } } });
u({ id: 'mt_chest_entropy', baseId: 'chest_heavy_t4', name: 'Entropi Zırhı', minItemLevel: 60, classes: ['knight', 'barbarian', 'paladin'], source: 'Degentrius (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(8), max: p(10) }, { stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'resAll', min: p(6), max: p(7) }],
  special: { id: 'mt_chest_entropy', desc: 'Aldığın hasarın %25\'i 8 sn\'ye yayılır. Ertelenmiş hasar sürerken hasar azaltman +%10 olur (20 sn bekleme).', params: { deferPct: 0.25, spreadSec: 8, drBonus: 0.10, icd: 20 } } });
u({ id: 'mt_ring_splinter', baseId: 'ring_gold', name: 'Gölge Kıymığı Yüzüğü', minItemLevel: 60, classes: ['rogue', 'demonhunter'], source: 'Degentrius (Büyücü Terasi)',
  fixedAffixes: [{ stat: 'critChance', min: p(4), max: p(5) }, { stat: 'critDamage', min: p(20), max: p(25) }, { stat: 'dex', min: 15, max: 20 }],
  special: { id: 'mt_ring_splinter', desc: 'Kritik vuruşlar hedefe Kıymık yığını bırakır (en fazla 5, 10 sn). 5. yığında 2.5 m çevreye %150 silah hasarı verir ve yığınlar sıfırlanır.', params: { maxStacks: 5, stackSec: 10, burstCoef: 1.5, radius: 2.5 } } });

// ---- Kefaret Salonları (kefaret_salonlari): loot_kef_b1..b4
u({ id: 'leg_kef_halkor_shard', baseId: 'ring_gold', name: 'Halkor\'un Kıymığı', minItemLevel: 60, source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_halkor_shard', desc: 'Kritik vuruşlarının %12\'si hedefin altında 3 m\'lik bir Cam Kırığı bırakır (4 sn, saniyede %50 hasar, 3 sn bekleme).', params: { chance: 0.12, radius: 3, dur: 4, coefPerSec: 0.5, icd: 3 } } });
u({ id: 'leg_kef_sinstone_aegis', baseId: 'shield_t3', name: 'Günah Taşı Siperi', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(50), max: p(70) }, { stat: 'blockChance', min: p(4), max: p(6) }, { stat: 'staggerPct', min: p(20), max: p(30) }],
  special: { id: 'leg_kef_sinstone_aegis', desc: 'Bir saldırıyı engellediğinde veya bir Duruşu kırdığında 8 sn boyunca Taş Deri yığını alırsın (en çok 5). 5 yığında Kalkan Darbesi %250 hasar verir ve Duruş çubuğunu doldurur.', params: { maxStacks: 5, dur: 8, armor: 0.03, dr: 0.02, coef: 2.5, radius: 5, poiseFill: 0.4 } } });
u({ id: 'leg_kef_fracture_axe', baseId: 'axe2h_t4', name: 'Kırık Hüküm', minItemLevel: 60, classes: ['barbarian', 'knight'], source: 'Halkor (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'staggerPct', min: p(25), max: p(35) }, { stat: 'str', min: 25, max: 35 }],
  special: { id: 'leg_kef_fracture_axe', desc: 'Bir düşmanın Duruşunu kırdığında 4 m\'lik bir Günah Çatlağı açılır (6 sn, saniyede %60 hasar); çatlaktaki düşmanlar %20 daha fazla Duruş hasarı alır.', params: { radius: 4, dur: 6, coefPerSec: 0.6, poiseTaken: 0.2, poiseDamage: 0.3 } } });
u({ id: 'leg_kef_ekelon_eye', baseId: 'amulet_ancient', name: 'Gözcünün Gözü', minItemLevel: 60, source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'attackSpeed', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_ekelon_eye', desc: 'Bir düşmanı sersemlettiğinde veya sendelettiğinde 6 sn boyunca %8 hasar azaltma (10 sn bekleme).', params: { dr: 0.08, dur: 6, icd: 10 } } });
u({ id: 'leg_kef_dive_boots', baseId: 'boots_medium_t3', name: 'Gökten İniş Çizmeleri', minItemLevel: 60, source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(8), max: p(10) }, { stat: 'cdr', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(2), max: p(4) }],
  special: { id: 'leg_kef_dive_boots', desc: 'Atılma, sıçrama, ışınlanma veya hamle yeteneğinden sonra 5 m çevrede %180 hasarlı bir iniş dalgası bırakır (8 sn bekleme); sendelemiş düşmanlara iki kat vurur.', params: { coef: 1.8, radius: 5, icd: 8, staggerMult: 2, cdReduce: 1 } } });
u({ id: 'leg_kef_commander_dagger', baseId: 'dagger_t4', name: 'Gözcü Hançeri', minItemLevel: 60, classes: ['rogue'], source: 'Taş Komutan Ekelon (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'dex', min: 25, max: 35 }],
  special: { id: 'leg_kef_commander_dagger', desc: 'Arkadan veya sendelemiş bir düşmana vurduğunda 8 sn boyunca hedeften aldığın hasar %10 azalır ve sonraki 3 vuruşun %50 ek kritik şansı olur (12 sn bekleme).', params: { dr: 0.1, dur: 8, critAdd: 0.5, hits: 3, icd: 12 } } });
u({ id: 'leg_kef_vessel', baseId: 'tome_t4', name: 'Kefaret Kabı', minItemLevel: 60, source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'healingPct', min: p(6), max: p(8) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_vessel', desc: 'Bir müttefikten olumsuz etki arındırdığında veya iyileştirme taşırdığında o müttefike %5 canlık anima kalkanı verir (6 sn, 8 sn bekleme).', params: { shieldPct: 0.05, dur: 6, icd: 8 } } });
u({ id: 'leg_kef_judge_seal', baseId: 'helm_light_t3', name: 'Hâkimin Mührü', minItemLevel: 60, source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'cdr', min: p(4), max: p(6) }, { stat: 'maxHpPct', min: p(3), max: p(5) }],
  special: { id: 'leg_kef_judge_seal', desc: 'Başarılı her kesinti 30 m içindeki müttefiklere 8 sn boyunca %4 hasar ve %6 hız verir (3 yığına kadar). 3 yığında kesinti yeteneğinin bekleme süresi sıfırlanır.', params: { dmg: 0.04, speed: 0.06, dur: 8, maxStacks: 3, radius: 30, resetIcd: 30 } } });
u({ id: 'leg_kef_halo_wand', baseId: 'wand_t4', name: 'Altın Halka Asası', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker'], source: 'Yüce Hâkim Alyez (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'castSpeed', min: p(6), max: p(8) }, { stat: 'int', min: 20, max: 30 }],
  special: { id: 'leg_kef_halo_wand', desc: 'Kanalize ettiğin büyüler her 1 sn\'de 1 Anima Halkası biriktirir (en çok 4). 4 halkada bir sonraki kanalsız büyün %200 hasarlı bir patlama yapar ve 4 sn boyunca %15 ek hasar verir.', params: { perSec: 1, maxRings: 4, coef: 2.0, radius: 6, bonus: 0.15, bonusDur: 4 } } });
u({ id: 'leg_kef_ferula', baseId: 'staff_t4', name: 'Kızıl Ferula', minItemLevel: 60, classes: ['mage', 'warlock', 'necromancer'], source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'damagePct', min: p(8), max: p(12) }, { stat: 'int', min: 25, max: 35 }],
  special: { id: 'leg_kef_ferula', desc: 'Hasar veren her büyünün %10 ihtimaliyle hedefin altında 4 m\'lik bir Kefaret Halkası bırakır; içindeki düşmanlar 5 sn boyunca %12 daha fazla hasar alır (6 sn bekleme).', params: { chance: 0.10, radius: 4, dur: 5, taken: 0.12, icd: 6 } } });
u({ id: 'leg_kef_reaper', baseId: 'sword1h_t4', name: 'Hasat Pençesi', minItemLevel: 60, classes: ['knight', 'paladin', 'demonhunter'], source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(85), max: p(105) }, { stat: 'critDamage', min: p(15), max: p(25) }, { stat: 'str', min: 20, max: 30 }],
  special: { id: 'leg_kef_reaper', desc: 'Vuruşlarının %12\'si hedefe bir Hasat işareti koyar (6 sn, en çok 3). 3. işarette Kibir Hasadı patlar: hedefte %300 hasar, en yakın 2 düşmana işaret yayılır.', params: { chance: 0.12, maxMarks: 3, dur: 6, coef: 3.0, spread: 2 } } });
u({ id: 'leg_kef_pride_mantle', baseId: 'shoulders_heavy_t4', name: 'Kibirli Efendinin Omuzluğu', minItemLevel: 60, source: 'Baş Kamarar Velkaan (Kefaret Salonları)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(4), max: p(6) }, { stat: 'damagePct', min: p(5), max: p(7) }, { stat: 'resAll', min: p(6), max: p(8) }],
  special: { id: 'leg_kef_pride_mantle', desc: 'Elit düşmanlara ve Kibir Tecessümü\'ne %15 daha fazla hasar verirsin. Bir elit, Kibir Tecessümü veya patron öldüğünde 20 sn boyunca %10 hasar ve %5 hız kazanırsın.', params: { eliteDamage: 0.15, dur: 20, dmg: 0.10, speed: 0.05 } } });

// ---- Leş Uyanışı (les_uyanisi): loot_mp_les_b1..b4
u({ id: 'leg_les_curukkemik', baseId: 'belt_heavy', name: 'Dikişli Hasat Kuşağı', minItemLevel: 63, source: 'Çürükkemik (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(8), max: p(10) }, { stat: 'str', min: 25, max: 35 }, { stat: 'resAll', min: p(6), max: p(8) }],
  special: { id: 'leg_les_curukkemik', desc: 'Öldürdüğün düşman 4 m çevreye saniyede %60 zehir hasarlı Çürük Bulutu bırakır (6 sn, en fazla 3 bulut).', params: { radius: 4, coef: 0.6, duration: 6, max: 3 } } });
u({ id: 'leg_les_kanemici', baseId: 'gloves_heavy_t3', name: 'Kan Emici Eldivenler', minItemLevel: 63, classes: ['knight', 'barbarian'], source: 'Çürükkemik (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'str', min: 20, max: 30 }, { stat: 'vit', min: 15, max: 20 }],
  special: { id: 'leg_les_kanemici', desc: 'Zehir ve kanama etkilerin, hedefin canı %30\'un altındayken %60 daha hızlı tikler ve kritik vurabilir; etki düşmanı öldürürse kalan süresi en yakın düşmana geçer.', params: { hpBelow: 0.3, tickMul: 1.6, canCrit: 1, transfer: 1 } } });
u({ id: 'leg_les_cukur_kalkan', baseId: 'shield_t3', name: 'Çukur Bekçisinin Kalkanı', minItemLevel: 63, classes: ['knight', 'paladin'], source: 'Çürükkemik (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'blockChance', min: p(5), max: p(5) }, { stat: 'maxHp', min: 150, max: 220 }],
  special: { id: 'leg_les_cukur_kalkan', desc: 'Zehir ve gölge havuzlarının içindeyken aldığın hasar %30 azalır ve saniyede %1.5 maks can yenilersin; engellenen her vuruş 4 m\'de Çürük Bulutu bırakır (en fazla 2).', params: { dr: 0.3, regen: 0.015, cloudOnBlock: 1, max: 2 } } });
u({ id: 'leg_les_amarth', baseId: 'axe2h_t4', name: 'Hasatçının Tırpanı', minItemLevel: 63, classes: ['barbarian'], source: 'Hasatçı Amarth (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critDamage', min: p(25), max: p(35) }, { stat: 'str', min: 25, max: 35 }],
  special: { id: 'leg_les_amarth', desc: 'Kritik vuruşlar hedefe İşkence Yankısı yükü verir; 5. yükte hedefin çevresinde %200 gölge hasarı patlar (3 sn bekleme).', params: { stacks: 5, coef: 2.0, icd: 3 } } });
u({ id: 'leg_les_ruh_hasadi', baseId: 'ring_gold', name: 'Ruh Hasadı Mührü', minItemLevel: 63, classes: ['mage', 'necromancer', 'warlock'], source: 'Hasatçı Amarth (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'damagePct', min: p(8), max: p(12) }, { stat: 'critChance', min: p(2), max: p(3) }, { stat: 'int', min: 15, max: 20 }],
  special: { id: 'leg_les_ruh_hasadi', desc: 'Bir düşmanı öldürdüğünde 1 Ruh Hasadı yığını kazanırsın (en fazla 8, 20 sn). 8 yığında bir sonraki yeteneğin %100 daha fazla gölge hasarı verir ve tüm yığınları harcar.', params: { max: 8, dur: 20, bonus: 1.0 } } });
u({ id: 'leg_les_kanat_omuz', baseId: 'shoulders_medium_t3', name: 'Cesaret Kanatları Omuzluğu', minItemLevel: 63, classes: ['rogue'], source: 'Hasatçı Amarth (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'dex', min: 20, max: 30 }, { stat: 'speedRating', min: 8, max: 12 }, { stat: 'critChance', min: p(2), max: p(3) }],
  special: { id: 'leg_les_kanat_omuz', desc: 'Yuvarlanmadan sonra 3 sn %25 hareket hızı kazanırsın ve bir sonraki saldırın arkadan sayılır (+%30 hasar, +%15 kritik); 5 sn bekleme.', params: { speed: 0.25, dur: 3, backstab: 1, icd: 5 } } });
u({ id: 'leg_les_dikisat', baseId: 'amulet_ancient', name: 'Dikişet\'in Kalbi', minItemLevel: 63, source: 'Cerrah Dikişet (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(8), max: p(10) }, { stat: 'vit', min: 20, max: 30 }, { stat: 'critChance', min: p(3), max: p(4) }],
  special: { id: 'leg_les_dikisat', desc: 'Canın %40\'ın altına düşünce %50 maks can kalkanı ve 6 sn Dikiş Hırsı (+%20 hasar) kazanırsın. 90 sn bekleme.', params: { hpBelow: 0.4, shieldPct: 0.5, dmg: 0.2, dur: 6, icd: 90 } } });
u({ id: 'leg_les_onluk', baseId: 'chest_heavy_t3', name: 'Cerrah Önlüğü', minItemLevel: 63, classes: ['knight', 'barbarian'], source: 'Cerrah Dikişet (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(10), max: p(14) }, { stat: 'vit', min: 25, max: 35 }, { stat: 'armorPct', local: 'armorPct', min: p(30), max: p(40) }],
  special: { id: 'leg_les_onluk', desc: 'Aldığın hasarın %30\'u 8 sn boyunca yayılarak tikler; bu sırada tüm iyileştirmeler %15 artar. Biriken hasar maks canın %25\'ini geçemez.', params: { defer: 0.3, over: 8, healMul: 1.15, cap: 0.25 } } });
u({ id: 'leg_les_mumya_tomu', baseId: 'tome_t4', name: 'Mumyalama Tomu', minItemLevel: 63, classes: ['mage', 'warlock', 'necromancer'], source: 'Cerrah Dikişet (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'damagePct', min: p(12), max: p(16) }, { stat: 'int', min: 20, max: 30 }, { stat: 'castSpeed', min: p(8), max: p(10) }],
  special: { id: 'leg_les_mumya_tomu', desc: 'Hedefte 3 farklı hasar-zamanla etkisi varken o hedefe %20 fazla hasar verirsin; her yeni etki türü DoT süresini %10 uzatır (en fazla 3).', params: { kinds: 3, dmg: 0.2, ext: 0.1 } } });
u({ id: 'leg_les_nalthor', baseId: 'staff_t4', name: 'Ayazbağlayan\'ın Asası', minItemLevel: 63, classes: ['mage', 'warlock'], source: 'Ayazbağlayan Nalthor (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'frostDamagePct', min: p(20), max: p(30) }, { stat: 'int', min: 25, max: 35 }],
  special: { id: 'leg_les_nalthor', desc: 'Buz hasarın Kırağı Damgası uygular (3 yığın); 3 yığındaki düşman 1.5 sn donar (8 sn bekleme).', params: { stacks: 3, freeze: 1.5, icd: 8 } } });
u({ id: 'leg_les_ayaz_tac', baseId: 'helm_light_t3', name: 'Kırağı Taçı', minItemLevel: 63, classes: ['mage', 'warlock', 'evoker'], source: 'Ayazbağlayan Nalthor (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'cdr', min: p(6), max: p(8) }, { stat: 'resFrost', min: p(20), max: p(20) }],
  special: { id: 'leg_les_ayaz_tac', desc: 'Donmuş veya Kırağı Damgalı düşmanlara hasarın %30 artar; bir düşman donduğunda 8 m çevresindeki diğer düşmanlar Kırağı Damgası alır (2 sn bekleme).', params: { frozenDmg: 0.3, spreadR: 8, icd: 2 } } });
u({ id: 'leg_les_surgun_muhru', baseId: 'ring_iron', name: 'Sürgün Mührü', minItemLevel: 63, source: 'Ayazbağlayan Nalthor (Leş Uyanışı)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(6), max: p(8) }, { stat: 'vit', min: 15, max: 25 }, { stat: 'resAll', min: p(5), max: p(6) }],
  special: { id: 'leg_les_surgun_muhru', desc: 'Ölümcül hasar aldığında ölmek yerine 2 sn dokunulmaz olursun, %30 maks canla kalırsın ve 12 m çevredeki düşmanlar 3 sn yavaşlar; 180 sn bekleme.', params: { invuln: 2, healPct: 0.3, slowR: 12, slow: 3, icd: 180 } } });

// ---- Peri Sisleri (peri_sisleri): loot_ps_b1..b3
u({ id: 'leg_ps_antler_charm', baseId: 'amulet_amber', name: 'Boynuzlu Bilgenin Tılsımı', minItemLevel: 66, source: 'Ingra Malok (Peri Sisleri)',
  fixedAffixes: [{ stat: 'str', min: 15, max: 20 }, { stat: 'critChance', min: p(2), max: p(3) }, { stat: 'staggerPct', min: p(15), max: p(20) }],
  special: { id: 'leg_ps_antler_charm', desc: 'Bir düşmanın Duruşunu kırdığında veya büyüsünü kestiğinde 8 sn boyunca +%12 hasar ve +%8 hareket hızı kazanırsın. Kritik vuruş süreyi tazeler.', params: { dmg: 0.12, moveSpeed: 0.08, dur: 8 } } });
u({ id: 'leg_ps_soul_splitter', baseId: 'staff_t3', name: 'Ruh Yarıcı Asa', minItemLevel: 66, classes: ['mage', 'necromancer', 'warlock', 'evoker'], source: 'Ingra Malok (Peri Sisleri)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'castSpeed', min: p(5), max: p(6) }, { stat: 'damagePct', min: p(8), max: p(10) }],
  special: { id: 'leg_ps_soul_splitter', desc: 'Hasar veren büyülerin %20 şansla hedefin ruhunu yarar: 1.5 sn sonra %60 gölge hasarlı bir Ruh Yankısı vurur. Yankı bir düşmanı öldürürse 4 m çevreye sıçrar.', params: { chance: 0.2, delay: 1.5, coef: 0.6, bounceRadius: 4 } } });
u({ id: 'leg_ps_wicker_mantle', baseId: 'shoulders_heavy_t3', name: 'Hasır Totem Omuzluğu', minItemLevel: 66, classes: ['knight', 'paladin', 'barbarian', 'demonhunter'], source: 'Ingra Malok (Peri Sisleri)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(40), max: p(55) }, { stat: 'blockChance', min: p(3), max: p(4) }, { stat: 'str', min: 15, max: 20 }],
  special: { id: 'leg_ps_wicker_mantle', desc: 'Başarılı bir savuşturma yaptığında 6 sn boyunca aldığın hasarı %12 azaltırsın ve bir sonraki vuruşun %50 fazla Duruş hasarı verir.', params: { dr: 0.12, dur: 6, poiseNext: 0.5 } } });
u({ id: 'leg_ps_mist_ocarina', baseId: 'ring_silver', name: 'Sis Çağıran\'ın Ocarinası', minItemLevel: 66, source: 'Sis Çağıran (Peri Sisleri)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(3), max: p(5) }, { stat: 'resAll', min: p(5), max: p(5) }, { stat: 'vit', min: 10, max: 15 }],
  special: { id: 'leg_ps_mist_ocarina', desc: 'Canın %40\'ın altına düştüğünde otomatik olarak Sis Perdesi açar: 4 sn boyunca %30 daha az hasar alırsın. 45 sn bekleme süresi.', params: { hpBelow: 0.4, dr: 0.3, dur: 4, icd: 45 } } });
u({ id: 'leg_ps_vulpin_treads', baseId: 'boots_light_t3', name: 'Sis Tilkisi Adımları', minItemLevel: 66, source: 'Sis Çağıran (Peri Sisleri)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(10), max: p(12) }, { stat: 'dodgeChance', min: p(2), max: p(3) }, { stat: 'cdr', min: p(3), max: p(5) }],
  special: { id: 'leg_ps_vulpin_treads', desc: 'Her kaçınma yuvarlanışında arkanda 3 sn süren bir sis izi bırakırsın: izin içindeki müttefikler %20 hareket hızı kazanır. Kaçınma yenilenmesi %20 hızlanır.', params: { allyMs: 0.2, dur: 3, rollCdr: 0.2 } } });
u({ id: 'leg_ps_player_dagger', baseId: 'dagger_t3', name: 'Oyuncunun Hançeri', minItemLevel: 66, classes: ['rogue', 'demonhunter'], source: 'Sis Çağıran (Peri Sisleri)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'dex', min: 20, max: 30 }],
  special: { id: 'leg_ps_player_dagger', desc: 'Arkadan vuruşların %25 şansla hedefi Oyun işaretiyle işaretler (6 sn): işaretli hedef senden aldığı hasarın %10\'unu ek gölge hasarı olarak geri öder.', params: { chance: 0.25, dur: 6, returnPct: 0.10 } } });
u({ id: 'leg_ps_acid_fang', baseId: 'dagger_t4', name: 'Tred\'ova\'nın Asit Dişi', minItemLevel: 66, classes: ['rogue', 'demonhunter', 'knight', 'paladin'], source: 'Tred\'ova (Peri Sisleri)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'poisonDamagePct', min: p(15), max: p(20) }, { stat: 'dex', min: 15, max: 25 }],
  special: { id: 'leg_ps_acid_fang', desc: 'Vuruşların %15 şansla hedefe Asit Yarası uygular (+%10 alınan hasar, en çok 5 yığın). 5 yığında patlar: 4 m çevrede %150 zehir hasarı.', params: { chance: 0.15, stacks: 5, takenMore: 0.10, burst: 1.5, radius: 4 } } });
u({ id: 'leg_ps_lakali_tear', baseId: 'amulet_amber', name: 'Lakali\'nin Gözyaşı', minItemLevel: 66, source: 'Tred\'ova (Peri Sisleri, nadir)',
  fixedAffixes: [{ stat: 'vit', min: 15, max: 20 }, { stat: 'resAll', min: p(4), max: p(4) }, { stat: 'healReceivedPct', min: p(5), max: p(5) }],
  special: { id: 'leg_ps_lakali_tear', desc: 'Her 25 sn\'de bir en düşük canlı müttefikin canını %12 iyileştiren ve ona 6 sn %10 hasar azaltma veren bir Anima Küresi bırakırsın.', params: { interval: 25, heal: 0.12, dr: 0.10, dur: 6 } } });
u({ id: 'leg_ps_brood_carapace', baseId: 'chest_heavy_t4', name: 'Kuluçka Zırhı', minItemLevel: 66, classes: ['knight', 'paladin', 'barbarian', 'demonhunter', 'monk'], source: 'Tred\'ova (Peri Sisleri)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'maxHpPct', min: p(6), max: p(8) }, { stat: 'resPoison', min: p(20), max: p(20) }],
  special: { id: 'leg_ps_brood_carapace', desc: 'Aldığın zehir hasarı %30 azalır. Bir düşman seni zehirlediğinde 3 yığına kadar Kitin Kabuğu kazanırsın: her yığın bir sonraki vuruşun %50\'sini emer, 20 sn sürer.', params: { poisonDr: 0.3, stacks: 3, absorb: 0.5, dur: 20 } } });

// ---- Yankı Ağı (yanki_agi): loot_yk_b1..b3
u({ id: 'uni_yk_sacbrood', baseId: 'amulet_amber', name: 'Yumurta Kesesi', minItemLevel: 66, source: 'Avanoksa (Yankı Ağı)',
  fixedAffixes: [{ stat: 'poisonDamagePct', min: p(7), max: p(8) }, { stat: 'vit', min: 15, max: 20 }, { stat: 'resPoison', min: p(14), max: p(15) }],
  special: { id: 'uni_yk_sacbrood', desc: 'Kullanımda 3 Yavru Sürünen 18 sn boyunca seninle savaşır; her ısırık %80 silah hasarlı bir zehir tiki bırakır (120 sn bekleme). Pasif: zehir hasarı +%8.', params: { minions: 3, dur: 18, bite: 0.8, cd: 120, poisonBonus: 0.08 } } });
u({ id: 'uni_yk_maw', baseId: 'axe2h_t4', name: 'Doyumsuzun Azısı', minItemLevel: 66, classes: ['barbarian', 'knight'], source: 'Avanoksa (Yankı Ağı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'str', min: 25, max: 35 }, { stat: 'meleeDamagePct', min: p(6), max: p(8) }],
  special: { id: 'uni_yk_maw', desc: 'Düşmanlara (canı %25\'in altındayken) vuruşlar ve her öldürme Doyum yığını verir (en fazla 10, 12 sn, yığın başına +%2 hasar). 10 yığında bir sonraki vuruş %300 hasarlı bir ısırık olur ve maks canının %8\'ini iyileştirir.', params: { maxStacks: 10, dur: 12, perStack: 0.02, finishCoef: 3.0, cone: 5, heal: 0.08, executeThreshold: 0.25 } } });
u({ id: 'uni_yk_webwrap', baseId: 'shoulders_medium_t4', name: 'Kozalak Ağı Omuzluğu', minItemLevel: 66, classes: ['rogue', 'archer', 'mage', 'necromancer'], source: 'Avanoksa (Yankı Ağı)',
  fixedAffixes: [{ stat: 'dex', min: 15, max: 25 }, { stat: 'moveSpeedPct', min: p(5), max: p(5) }, { stat: 'damagePct', min: p(4), max: p(6) }],
  special: { id: 'uni_yk_webwrap', desc: 'Yavaşlatmaların ayrıca 1.2 sn kök uygular (hedef başına 8 sn\'de bir). Yavaşlatılmış veya kökleştirilmiş düşmanlar senden %12 fazla hasar alır.', params: { root: 1.2, icd: 8, dmgTaken: 0.12 } } });
u({ id: 'uni_yk_impaler', baseId: 'axe2h_t3', name: 'Gözetmenin Mızrağı', minItemLevel: 66, classes: ['knight', 'paladin', 'barbarian'], source: 'Anubzek (Yankı Ağı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'str', min: 20, max: 25 }, { stat: 'critChance', min: p(2), max: p(3) }],
  special: { id: 'uni_yk_impaler', desc: 'Vuruşların %12 şansla (6 sn iç bekleme) 10 m uzunluğunda bir kazı çizgisi açar: %220 silah hasarı ve 3 sn %30 yavaşlatma.', params: { chance: 0.12, icd: 6, coef: 2.2, slow: 0.3, slowDur: 3, length: 10 } } });
u({ id: 'uni_yk_echoshield', baseId: 'shield_t4', name: 'Yankı Kalkanı', minItemLevel: 66, classes: ['knight', 'paladin'], source: 'Anubzek (Yankı Ağı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'blockChance', min: p(4), max: p(4) }, { stat: 'maxHp', min: 150, max: 200 }],
  special: { id: 'uni_yk_echoshield', desc: 'Engellediğin veya savuşturduğun hasar saklanır; 1.5 sn sonra saklanan hasarın %70\'i 8 m çevrede şok dalgası olarak yankılanır (3 sn iç bekleme). Mükemmel savuşturma %120 yankılanır.', params: { echoDelay: 1.5, coef: 0.7, perfectCoef: 1.2, radius: 8, icd: 3 } } });
u({ id: 'uni_yk_hiveeye', baseId: 'ring_gold', name: 'Kovan Gözü', minItemLevel: 66, classes: ['rogue', 'archer', 'mage'], source: 'Anubzek (Yankı Ağı)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'aoePct', min: p(15), max: p(20) }, { stat: 'critDamage', min: p(10), max: p(15) }],
  special: { id: 'uni_yk_hiveeye', desc: 'Kritik vuruşlar 8 sn boyunca Kovan İşareti uygular; işaretli düşman ölünce 5 m\'lik bir sürü bulutu (4 sn) saniyede %120 hasar verir ve ilk dokunduğu düşmanı işaretler.', params: { markDur: 8, radius: 5, dur: 4, coefPerSec: 1.2, redirect: 1 } } });
u({ id: 'uni_yk_sickle', baseId: 'dagger_t4', name: 'Kara Kan Orağı', minItemLevel: 66, classes: ['rogue', 'demonhunter'], source: 'Kikatal (Yankı Ağı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'shadowDamagePct', min: p(15), max: p(15) }, { stat: 'dex', min: 20, max: 30 }],
  special: { id: 'uni_yk_sickle', desc: 'Gölge hasarı veren vuruşlar Kara Kan yükü biriktirir (8 yük); 8 yükte 8 m çevreye %450 silah hasarlı gölge patlaması yapar.', params: { charges: 8, coef: 4.5, radius: 8 } } });
u({ id: 'uni_yk_echo', baseId: 'ring_jade', name: 'Kozmik Yankı', minItemLevel: 66, classes: ['mage', 'warlock', 'necromancer', 'evoker'], source: 'Kikatal (Yankı Ağı)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'shadowDamagePct', min: p(12), max: p(15) }, { stat: 'cdr', min: p(5), max: p(5) }],
  special: { id: 'uni_yk_echo', desc: 'Kullanımda 10 m içindeki düşmanları sana çeker; 1.5 sn sonra %600 gölge hasarıyla patlarlar (90 sn bekleme).', params: { pullRadius: 10, delay: 1.5, coef: 6.0, cd: 90 } } });
u({ id: 'uni_yk_harvestrobe', baseId: 'chest_medium_t4', name: 'Hasatçının Kaftanı', minItemLevel: 66, classes: ['necromancer', 'warlock', 'monk'], source: 'Kikatal (Yankı Ağı)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(5), max: p(7) }, { stat: 'vit', min: 20, max: 30 }, { stat: 'dotPct', min: p(10), max: p(12) }],
  special: { id: 'uni_yk_harvestrobe', desc: 'Süreli hasar tikleri maks canının %0.5\'ini iyileştirir (0.5 sn\'de bir); bir düşmanda her farklı DoT, diğer DoT\'lerini %4 güçlendirir (en fazla 5 yığın).', params: { healPct: 0.005, tickCd: 0.5, spreadPct: 0.04, maxStacks: 5 } } });

// ---- Yiğitler Sarayı (yigitler_sarayi): loot_yg_b1..b4
u({ id: 'leg_yg_borusu', baseId: 'amulet_ancient', name: 'Yiğitlik Borusu', minItemLevel: 60, source: 'Heymdal (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'allAttr', min: 10, max: 14 }, { stat: 'resAll', min: p(4), max: p(4) }],
  special: { id: 'leg_yg_borusu', desc: 'Kullanımda 30 sn boyunca ana özelliğin %8 artar ve 20 m içindeki müttefikler %4 daha fazla hasar verir (90 sn bekleme).', params: { mainStat: 0.08, dur: 30, allyRadius: 20, allyBonus: 0.04, cd: 90 } } });
u({ id: 'leg_yg_kapi_kilic', baseId: 'axe2h_t4', name: 'Kapı Bekçisinin Kılıcı', minItemLevel: 60, classes: ['barbarian', 'knight'], source: 'Heymdal (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'staggerPct', min: p(25), max: p(25) }, { stat: 'str', min: 25, max: 35 }],
  special: { id: 'leg_yg_kapi_kilic', desc: 'Her 3. bitiriş vuruşu 8 m / 110° konide %150 silah hasarlı ve 4 sn kanama uygulayan bir Kanlı Süpürme açar. Bitiriş vuruşların Duruş hasarı +%25.', params: { everyNth: 3, radius: 8, arc: 110, coef: 1.5, bleed: 4, poiseMul: 0.25 } } });
u({ id: 'leg_yg_statik_kusak', baseId: 'belt_chain', name: 'Statik Kuşak', minItemLevel: 60, classes: ['rogue'], source: 'Heymdal (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'dodgeChance', min: p(2), max: p(3) }, { stat: 'dex', min: 15, max: 20 }, { stat: 'lightningDamagePct', min: p(10), max: p(12) }],
  special: { id: 'leg_yg_statik_kusak', desc: 'Bir saniye hareketsiz kalmak Statik Yük biriktirir (en fazla 5, yük başına +%4 hasar). Kaçınma yuvarlanması tüm yükleri boşaltıp 12 m içinde 3 düşmana yıldırım verir (yük başına %60).', params: { maxStacks: 5, perStack: 0.04, standSec: 1, coef: 0.6, targets: 3, radius: 12 } } });
u({ id: 'leg_yg_valkyr_pelerin', baseId: 'shoulders_heavy_t4', name: 'Valkyr Kanat Pelerini', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Hirya (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'vit', min: 20, max: 30 }, { stat: 'maxHpPct', min: p(4), max: p(6) }, { stat: 'healingPct', min: p(6), max: p(6) }],
  special: { id: 'leg_yg_valkyr_pelerin', desc: 'Vuruşların %6 şansla 3 düşmana kutsal ok zincirler. Canın %35\'in altındayken kanatlar 90 sn\'de bir açılır: 4 sn boyunca saniyede %4 can yeniler ve +%30 hareket hızı verir.', params: { procChance: 0.06, bolts: 3, threshold: 0.35, healPct: 0.04, healDur: 4, cd: 90, msBonus: 0.3 } } });
u({ id: 'leg_yg_isik_asa', baseId: 'staff_t4', name: 'Eyra\'nın Işık Asası', minItemLevel: 60, classes: ['mage', 'necromancer', 'warlock', 'evoker', 'paladin'], source: 'Hirya (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'castSpeed', min: p(6), max: p(8) }, { stat: 'healingPct', min: p(8), max: p(8) }],
  special: { id: 'leg_yg_isik_asa', desc: 'Altı saniyelik pencerede her yetenek Işık Bilgisi yığını verir (en fazla 4). 4 yığında bir sonraki yetenek 20 m çizgide %300 hasar veren ve geçtiği müttefikleri iyileştiren bir Işık Mızrağı fırlatır.', params: { window: 6, maxStacks: 4, lineLen: 20, coef: 3.0, healShare: 0.4 } } });
u({ id: 'leg_yg_ikiz_muhur', baseId: 'ring_jade', name: 'İkiz Mühür', minItemLevel: 60, source: 'Hirya (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(3) }, { stat: 'lightningDamagePct', min: p(12), max: p(15) }, { stat: 'healReceivedPct', min: p(6), max: p(6) }],
  special: { id: 'leg_yg_ikiz_muhur', desc: '12 sn\'de bir Gök (+%20 yıldırım ve fiziksel hasar) ile Işık (+%20 iyileştirme ve kalkan; verdiğin hasar en düşük müttefiki %8 iyileştirir) arasında geçiş yapar.', params: { period: 12, gokPct: 0.2, isikPct: 0.2, isikHealSplash: 0.08 } } });
u({ id: 'leg_yg_kanli_av', baseId: 'dagger_t4', name: 'Kanlı Av Pençeleri', minItemLevel: 60, classes: ['rogue', 'monk'], source: 'Fenrür (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(70), max: p(90) }, { stat: 'attackSpeed', min: p(6), max: p(6) }, { stat: 'bleedDamagePct', min: p(10), max: p(10) }],
  special: { id: 'leg_yg_kanli_av', desc: 'Kanayan hedeflere %10 fazla hasar verirsin; her 3. hafif vuruş 4 sn kanama uygular; kanayan düşmanın içinden geçen yuvarlanma kaçınma süresinin %15\'ini geri verir.', params: { bleedDmgBonus: 0.10, everyNth: 3, bleedDur: 4, rollRefund: 0.15 } } });
u({ id: 'leg_yg_av_yuzugu', baseId: 'ring_silver', name: 'Av Yüzüğü', minItemLevel: 60, classes: ['rogue', 'archer'], source: 'Fenrür (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'moveSpeedPct', min: p(6), max: p(8) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'magicFindPct', min: p(5), max: p(5) }],
  special: { id: 'leg_yg_av_yuzugu', desc: 'Her öldürme 8 sn boyunca %8 hareket hızı ve %4 kritik şansı verir (en fazla 5 yığın; elit öldürmeleri 3 yığın sayılır). 15% can kaybında yığınlar düşer.', params: { dur: 8, crit: 0.04, ms: 0.08, maxStacks: 5, eliteMul: 3, resetPct: 0.15 } } });
u({ id: 'leg_yg_surusu_kurk', baseId: 'shoulders_medium_t4', name: 'Sürü Başı Kürkü', minItemLevel: 60, classes: ['rogue', 'archer'], source: 'Fenrür (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'dex', min: 20, max: 30 }, { stat: 'poiseDamagePct', min: p(25), max: p(25) }, { stat: 'vit', min: 10, max: 15 }],
  special: { id: 'leg_yg_surusu_kurk', desc: 'Yuvarlanman 6 m içindeki düşmanları 3 sn boyunca %30 yavaşlatan bir uluma bırakır (12 sn bekleme). Duruş hasarın +%25.', params: { radius: 6, slow: 0.3, dur: 3, icd: 12, poiseMul: 0.25 } } });
u({ id: 'leg_yg_sinav_mizragi', baseId: 'axe2h_t3', name: 'Odyn\'in Sınav Mızrağı', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Odyn (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(90), max: p(110) }, { stat: 'str', min: 25, max: 30 }, { stat: 'poiseDamagePct', min: p(20), max: p(20) }],
  special: { id: 'leg_yg_sinav_mizragi', desc: 'Mükemmel blok veya savuşturma hedefi 8 sn boyunca Sınanmış işaretler: ona %20 fazla hasar verirsin. İşaretli hedefe 5 vuruştan sonra mızrak 12 m\'lik bir şimşek atışı olarak döner (%500 hasar).', params: { markDur: 8, markDmg: 0.2, hitsToReturn: 5, returnCoef: 5.0, range: 12 } } });
u({ id: 'leg_yg_yargi_muhru', baseId: 'ring_jade', name: 'Odyn\'in Yargı Mührü', minItemLevel: 60, source: 'Odyn (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'str', min: 15, max: 20 }, { stat: 'cdr', min: p(5), max: p(5) }, { stat: 'staggerPct', min: p(15), max: p(15) }],
  special: { id: 'leg_yg_yargi_muhru', desc: 'Kullanımda 15 sn boyunca Rünle Kutsanırsın (+%30 hasar, +%25 hareket hızı). Kesinti veya Duruş kırma süreyi 1 sn uzatır (en fazla +8 sn). 120 sn bekleme.', params: { dur: 15, dmg: 0.30, speed: 0.25, maxExtend: 8, cd: 120 } } });
u({ id: 'leg_yg_aegis_golgesi', baseId: 'shield_t4', name: 'Aegis\'in Gölgesi', minItemLevel: 60, classes: ['knight', 'paladin'], source: 'Odyn (Yiğitler Sarayı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(70), max: p(90) }, { stat: 'blockChance', min: p(5), max: p(6) }, { stat: 'vit', min: 25, max: 35 }],
  special: { id: 'leg_yg_aegis_golgesi', desc: 'Her mükemmel blok en yakın 3 müttefike 0.8 sn boyunca %75 hasar azaltma verir (8 sn bekleme) ve saldırgana 25 Duruş hasarı ekler.', params: { wardDr: 0.75, wardDur: 0.8, allies: 3, icd: 8, postureDmg: 25 } } });

// ---- Yıldız Divanı (yildiz_divani): loot_ys_b1..b3
u({ id: 'leg_ys_nobet_cani', baseId: 'shield_t3', name: 'Nöbet Çanı', minItemLevel: 56, classes: ['knight', 'paladin'], source: 'Gerdan (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(60), max: p(80) }, { stat: 'blockChance', min: p(5), max: p(5) }, { stat: 'maxHp', min: 150, max: 220 }],
  special: { id: 'leg_ys_nobet_cani', desc: 'Her engellenen vuruş 4 sn\'de bir çanı çalar: 8 m içindeki düşmanları 1.5 sn sersemletir ve yakın müttefiklere 4 sn boyunca %8 daha az hasar verir.', params: { radius: 8, stun: 1.5, dr: 0.08, icd: 4 } } });
u({ id: 'leg_ys_kilitlenme_zinciri', baseId: 'belt_chain', name: 'Kilitlenme Zinciri', minItemLevel: 56, source: 'Gerdan (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(30), max: p(40) }, { stat: 'maxHp', min: 120, max: 180 }],
  special: { id: 'leg_ys_kilitlenme_zinciri', desc: 'Her kaçınma yuvarlanması yavaşlatma ve kökleri temizler ve 3 sn boyunca %15 daha az hasar alırsın (12 sn bekleme). Yuvarlanma sırasında 0.1 sn ek dokunulmazlık kazanırsın.', params: { cleanse: 1, dr: 0.15, dur: 3, icd: 12, iframe: 0.1 } } });
u({ id: 'leg_ys_fener_yuzugu', baseId: 'ring_gold', name: 'Fener Yüzüğü', minItemLevel: 56, source: 'Gerdan (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'attackSpeed', min: p(3), max: p(4) }],
  special: { id: 'leg_ys_fener_yuzugu', desc: 'Başarılı bir kesinti hedefi 8 sn boyunca işaretler: müttefiklerin ona verdiği hasar %12 artar ve kesinti bekleme süresi 2 sn kısalır.', params: { mark: 8, amp: 0.12, cdr: 2 } } });
u({ id: 'leg_ys_alevcelenk', baseId: 'ring_gold', name: 'Alevçelenk Yüzüğü', minItemLevel: 58, classes: ['mage', 'warlock', 'evoker'], source: 'Taliksa (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'fireDamagePct', min: p(18), max: p(22) }, { stat: 'int', min: 15, max: 20 }, { stat: 'critChance', min: p(2), max: p(2) }],
  special: { id: 'leg_ys_alevcelenk', desc: 'Yanan bir düşman öldüğünde 6 m içindeki en fazla 2 düşmanı yakar (%80 hasar, 2 sn yanma).', params: { burnPct: 0.2, spread: 2, radius: 6, coef: 0.8 } } });
u({ id: 'leg_ys_zumrut_sozlesme', baseId: 'staff_t4', name: 'Zümrüt Sözleşme Asası', minItemLevel: 58, classes: ['mage', 'warlock', 'necromancer', 'evoker'], source: 'Taliksa (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'spellPower', min: 80, max: 100 }, { stat: 'int', min: 20, max: 30 }, { stat: 'damagePct', min: p(8), max: p(10) }],
  special: { id: 'leg_ys_zumrut_sozlesme', desc: 'Zamanla etkili büyülerin %25 daha hızlı tikler. Hedefteki her DoT Sözleşme yığını verir (en fazla 5, +%3 hasar); bir sonraki doğrudan büyün tüm yığınları harcayıp ateş patlaması yapar.', params: { tick: 0.25, perStack: 0.03, max: 5, burst: 0.04 } } });
u({ id: 'leg_ys_yakici_siddet', baseId: 'amulet_ancient', name: 'Yakıcı Şiddet Kolyesi', minItemLevel: 58, classes: ['mage', 'warlock', 'evoker'], source: 'Taliksa (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'critChance', min: p(4), max: p(5) }, { stat: 'spellPower', min: 40, max: 60 }],
  special: { id: 'leg_ys_yakici_siddet', desc: 'Ateş hasarın 12 sn boyunca Şiddet yığını verir (en fazla 10, yığın başına +%2 hasar). Her 5 yığında saniyede maks canının %1\'ini kaybedersin.', params: { perStack: 0.02, max: 10, hpPer5: 0.01, dur: 12 } } });
u({ id: 'leg_ys_pinar_keser', baseId: 'dagger_t4', name: 'Pınar Kesen', minItemLevel: 58, classes: ['rogue'], source: 'Melandros (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critChance', min: p(3), max: p(4) }, { stat: 'dex', min: 20, max: 30 }],
  special: { id: 'leg_ys_pinar_keser', desc: 'Kritik vuruşlar ek %12 arkan hasarı verir ve 6 sn boyunca hareket hızını %2 artıran Pınar yığını bırakır (en fazla 8).', params: { arcaneCoef: 0.12, stackMax: 8, msPer: 0.02, dur: 6 } } });
u({ id: 'leg_ys_yildiz_haritasi', baseId: 'amulet_ancient', name: 'Yıldız Haritası Kolyesi', minItemLevel: 58, source: 'Melandros (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(3) }, { stat: 'attackSpeed', min: p(3), max: p(3) }],
  special: { id: 'leg_ys_yildiz_haritasi', desc: 'Mitik+ de her 45 sn\'de bir (ilk patron veya elit vuruşundan başlayarak) 8 sn boyunca +%12 kritik şansı ve +%10 hareket hızı veren Yıldız Hizalanması açılır.', params: { every: 45, dur: 8, crit: 0.12, ms: 0.10 } } });
u({ id: 'leg_ys_yanki_kusagi', baseId: 'belt_heavy', name: 'Yankı Kuşağı', minItemLevel: 58, source: 'Melandros (Yıldız Divanı)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(30), max: p(40) }, { stat: 'damageReductionPct', min: p(3), max: p(4) }],
  special: { id: 'leg_ys_yanki_kusagi', desc: 'Her yuvarlanma veya atılma 4 sn süren bir kılıç yansıması bırakır (en fazla 3). Bir sonraki yakın dövüş vuruşun her yansımayı %50 hasarla 0.6 sn sonra tekrarlatır.', params: { dur: 4, max: 3, echoCoef: 0.5, delay: 0.6 } } });

// ---- Taşkasa (taskasa): loot_tk_b1..b4
u({ id: 'leg_seda_lens', baseId: 'ring_gold', name: 'Seda\'nın Lens Gözü', minItemLevel: 60, source: 'Seda (Taşkasa)',
  fixedAffixes: [{ stat: 'critChance', min: p(3), max: p(4) }, { stat: 'critDamage', min: p(12), max: p(15) }, { stat: 'aoePct', min: p(10), max: p(10) }],
  special: { id: 'leg_seda_lens', desc: 'Kritik vuruşların %12 şansla hedefin arkasında 8 m\'lik bir çizgide %70 silah hasarı verir; çizgi 3 veya daha fazla düşmana vurursa en kısa bekleme süren 1.5 sn azalır (6 sn iç bekleme).', params: { chance: 0.12, lineRange: 8, coef: 0.7, refund: 1.5, minHits: 3, icd: 6 } } });
u({ id: 'leg_seda_aegis', baseId: 'shield_t3', name: 'Yer Parçalayıcı Kalkan', minItemLevel: 60, classes: ['knight', 'paladin', 'monk'], source: 'Seda (Taşkasa)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(55), max: p(70) }, { stat: 'blockChance', min: p(4), max: p(6) }, { stat: 'poiseDamagePct', min: p(20), max: p(20) }],
  special: { id: 'leg_seda_aegis', desc: 'Savuşturma 5 m\'lik bir şok dalgası açar (%150 silah hasarı, 2 sn iç bekleme) ve 3 sn boyunca %50 az hasar alan Sismik Kalkan verir (20 sn\'de bir).', params: { shockRadius: 5, coef: 1.5, icd: 2, shieldDr: 0.5, shieldDur: 3, shieldCd: 20 } } });
u({ id: 'leg_seda_gauntlets', baseId: 'gloves_heavy_t3', name: 'Çekirdek Nöbetçisi Eldivenleri', minItemLevel: 60, classes: ['knight', 'barbarian'], source: 'Seda (Taşkasa)',
  fixedAffixes: [{ stat: 'str', min: 20, max: 30 }, { stat: 'poiseDamagePct', min: p(30), max: p(30) }, { stat: 'critDamage', min: p(8), max: p(10) }],
  special: { id: 'leg_seda_gauntlets', desc: 'Kritik Vuruşlar 6 m içinde %150 silah hasarlı patlar ve ağır saldırı yükünün %25\'ini geri verir.', params: { radius: 6, coef: 1.5, refundPct: 0.25 } } });
u({ id: 'leg_skarmorak_heart', baseId: 'amulet_ancient', name: 'Çatlak Yürek', minItemLevel: 60, source: 'Skarmorak (Taşkasa)',
  fixedAffixes: [{ stat: 'maxHpPct', min: p(5), max: p(5) }, { stat: 'vit', min: 15, max: 20 }, { stat: 'resAll', min: p(4), max: p(4) }],
  special: { id: 'leg_skarmorak_heart', desc: 'Her 12 sn\'de bir maks canının %6\'sı kadar kristal kalkan açılır; kalkan kırıldığında 4 sn boyunca %15 daha fazla hasar verirsin.', params: { interval: 12, shieldPct: 0.06, dmgBonus: 0.15, dur: 4 } } });
u({ id: 'leg_skar_fragment_belt', baseId: 'belt_heavy', name: 'Kararsız Parça Kemeri', minItemLevel: 60, source: 'Skarmorak (Taşkasa)',
  fixedAffixes: [{ stat: 'str', min: 15, max: 20 }, { stat: 'vit', min: 15, max: 20 }, { stat: 'critChance', min: p(2), max: p(2) }],
  special: { id: 'leg_skar_fragment_belt', desc: 'Her 12. ve her elit öldürme yerde Kararsız Parça bırakır; alınca yığın başına +%8 hasar verir (en fazla 6, 15 sn). 6 yığında 6 m çevreye %200 silah hasarı verir.', params: { killsPerDrop: 12, eliteDrop: 1, perStack: 0.08, maxStacks: 6, dur: 15, icd: 5, burstCoef: 2.0, radius: 6 } } });
u({ id: 'leg_skar_pauldrons', baseId: 'shoulders_medium_t3', name: 'Skardyn Omuzlukları', minItemLevel: 60, source: 'Skarmorak (Taşkasa)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(35), max: p(45) }, { stat: 'maxHpPct', min: p(4), max: p(4) }, { stat: 'damagePct', min: p(8), max: p(8) }],
  special: { id: 'leg_skar_pauldrons', desc: 'Emilim kalkanların %30 daha güçlüdür; kalkanın emdiği hasarın %20\'si 5 m içindeki saldırganlara arkan hasarı olarak döner. Kalkan varken hasarın +%8.', params: { absorbBoost: 0.3, returnPct: 0.2, returnRadius: 5, dmgWithShield: 0.08 } } });
u({ id: 'leg_dorlita_hammer', baseId: 'sword1h_t3', name: 'Dorlita\'nın Eriyik Çekici', minItemLevel: 60, classes: ['knight', 'paladin', 'barbarian', 'monk'], source: 'Dorlita ve Brokk (Taşkasa)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'str', min: 20, max: 30 }, { stat: 'fireDamagePct', min: p(15), max: p(15) }],
  special: { id: 'leg_dorlita_hammer', desc: 'Ağır vuruşlar 3 sn boyunca 5 m\'lik bir magma izi bırakır (saniyede %30 silah hasarı ateş olarak).', params: { trailRadius: 5, trailDur: 3, dps: 0.3 } } });
u({ id: 'leg_brokk_anvil_staff', baseId: 'staff_t4', name: 'Brokk\'un Örs Asası', minItemLevel: 60, classes: ['mage', 'warlock', 'evoker'], source: 'Dorlita ve Brokk (Taşkasa)',
  fixedAffixes: [{ stat: 'fireDamagePct', min: p(20), max: p(25) }, { stat: 'int', min: 20, max: 30 }, { stat: 'castSpeed', min: p(6), max: p(6) }],
  special: { id: 'leg_brokk_anvil_staff', desc: 'Ateş büyüleri %12 şansla bir Örs Kıvılcımı verir: sonraki ateş büyün anlık, bedava ve %40 fazla hasarlıdır. Her 5. ateş vuruşu 4 m çevreye örs halkası bırakır (3 sn, +%10 ateş hasarı alınır).', params: { procChance: 0.12, bonusDmg: 0.4, everyNth: 5, anvilRadius: 4, anvilDur: 3, fireTaken: 0.10 } } });
u({ id: 'leg_crescendo_plate', baseId: 'chest_heavy_t3', name: 'Kızgın Kreşendo Zırhı', minItemLevel: 60, classes: ['knight', 'paladin', 'barbarian'], source: 'Dorlita ve Brokk (Taşkasa)',
  fixedAffixes: [{ stat: 'armorPct', local: 'armorPct', min: p(70), max: p(90) }, { stat: 'maxHpPct', min: p(6), max: p(6) }, { stat: 'str', min: 20, max: 30 }],
  special: { id: 'leg_crescendo_plate', desc: 'Aldığın her vuruş Isı yığını verir (en fazla 8, 6 sn). 8 yığında 10 m\'lik bir Kızgın Kreşendo dalgası %250 ateş hasarı verir ve 4 sn boyunca %20 az hasar alırsın (15 sn bekleme).', params: { maxStacks: 8, dur: 6, radius: 10, coef: 2.5, dr: 0.2, durSelf: 4, icd: 15 } } });
u({ id: 'leg_eirich_staff', baseId: 'staff_t4', name: 'Eirich\'in Fısıltı Asası', minItemLevel: 60, classes: ['mage', 'evoker', 'warlock'], source: 'Eirich (Taşkasa)',
  fixedAffixes: [{ stat: 'int', min: 20, max: 30 }, { stat: 'shadowDamagePct', min: p(12), max: p(12) }, { stat: 'arcaneDamagePct', min: p(10), max: p(10) }],
  special: { id: 'leg_eirich_staff', desc: 'Gölge ve Arkan büyüleri %10 şansla Boşluk Yankısı bırakır: aynı büyü 1.5 sn sonra %60 hasarla tekrarlanır.', params: { chance: 0.10, delay: 1.5, coef: 0.6 } } });
u({ id: 'leg_eirich_crown', baseId: 'helm_light_t4', name: 'Boşluk Sözcüsü Tacı', minItemLevel: 60, classes: ['necromancer', 'warlock', 'evoker', 'monk'], source: 'Eirich (Taşkasa)',
  fixedAffixes: [{ stat: 'int', min: 25, max: 35 }, { stat: 'dotPct', min: p(12), max: p(12) }, { stat: 'resShadow', min: p(15), max: p(15) }],
  special: { id: 'leg_eirich_crown', desc: 'Gölge DoT\'lerin %25 daha hızlı tikler; her 8. tik 6 m\'lik bir nova olarak yankılanır (tikin %40\'ı). 3 veya daha fazla DoT\'un olan hedefler senden %10 fazla hasar alır.', params: { tickSpeed: 0.25, echoEvery: 8, nova: 6, novaCoef: 0.4, dotBonusTargets: 3, dotBonus: 0.10 } } });
u({ id: 'leg_eirich_dagger', baseId: 'dagger_t4', name: 'Son Sözcü\'nün Hançeri', minItemLevel: 60, classes: ['rogue', 'demonhunter'], source: 'Eirich (Taşkasa)',
  fixedAffixes: [{ stat: 'weaponMax', local: 'wpnDamagePct', min: p(80), max: p(100) }, { stat: 'critDamage', min: p(15), max: p(20) }, { stat: 'dex', min: 25, max: 35 }],
  special: { id: 'leg_eirich_dagger', desc: 'Arkadan vuruş veya Kritik Vuruş hedefin altında bir yarık açar: 5 m içindeki düşmanları çeker ve 6 sn boyunca %15 fazla hasar aldırır (12 sn bekleme).', params: { pullR: 5, dur: 6, dmgTaken: 0.15, icd: 12 } } });

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
