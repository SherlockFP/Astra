import { QUEST_DROP_CHANCE, type QuestDef, type QuestKind, type QuestObjective, type QuestReward } from '../../types/quests';
import { gemId } from '../materials'; // gem grades are 1-based there: 1 Kırık, 2 Kusurlu, 3 normal, 4 Kusursuz
import { LAYOUT } from './layout';
import { REGION_QUESTS } from './quests_extra';
import { KARAKIR_QUESTS } from './karakir_quests';
import { KARAKIR_PACE_QUESTS } from './karakir_quests_pace';
import { AYAZ_QUESTS } from './ayaz_quests';
import { applyVariety } from './quests_variety';

/**
 * Sisli Vadi quest DATA (GDD_OPENWORLD §6.2-6.4). OWNER: content module. The runtime is systems/Quests.ts (WP4).
 * Ids, names, levels, XP %, gold per level and quest givers come from the layout JSON (`quests.main`, `quests.side`, `quests.bio`).
 * The objectives, reward items and Turkish dialogue are authored in EXTRA below from the GDD tables.
 *
 * Conventions: NPC ids are the layout / town ids. The camp hub NPCs are layout villages too: Çiftlik Sahibi Rıza (npc_c_riza,
 * kamp_ciftlik) and Teğmen Deniz (npc_c_deniz, kamp_kanyon). Item ids are data/materials.ts ids,
 * quest-only items are `item_*`. Enemy ids are mob / rare / mini-boss / boss ids (WP3). `kill` counts mobs of that id.
 */

/** Layout giver text -> TownNpc id. */
const GIVER_ID: Record<string, string> = {
  'Muhtar Cemal (Kuzgunkale)': 'npc_muhtar',
  'Muhtar Ferhat': 'npc_g_muhtar',
  'Çiftlik Sahibi Rıza': 'npc_c_riza',
  'Komutan Aslan': 'npc_k_komutan',
  'Kanyon Girişi Kampı (Teğmen Deniz)': 'npc_c_deniz',
  'Teğmen Deniz': 'npc_c_deniz',
  'Gözcü Selim (Orta Karakol)': 'npc_o_gozcu',
  'Nöbetçi Başı Talha': 'npc_s_nobetci',
  'Avcı Yıldız': 'npc_g_avci',
  'Çiftçi Hatice': 'npc_g_ciftci',
  'Rahibe Meryem': 'npc_g_rahibe',
  'Avcı Karaca': 'npc_k_avci',
};

type Reward = { items?: { id: string; count: number }[]; generic?: NonNullable<QuestReward['generic']>; choice?: QuestReward['choice'] };
interface Extra extends Reward {
  objectives: QuestObjective[];
  offer: string;
  progress: string;
  done: string;
  turnIn?: string;
  /** Region of a main quest (use / interact props, escort path and hidden areas are placed in it). */
  region?: string;
  /** Quest items handed over on accept (use objectives need them in the bag). */
  startItems?: { id: string; count: number }[];
  /** NPC id that offers the quest when it differs from the layout giver (second hub NPC, so the chain does not walk back to Ferhat). */
  giver?: string;
  unlocks?: string[];
}

const obj = (kind: QuestKind, target: string, count: number, text: string): QuestObjective => ({ kind, target, count, text });
const kill = (target: string, count: number, text: string): QuestObjective => obj('kill', target, count, text);
const boss = (target: string, count: number, text: string): QuestObjective => obj('boss', target, count, text);
const talk = (target: string, text: string): QuestObjective => obj('talk', target, 1, text);
const metin = (target: string, text: string): QuestObjective => obj('metin', target, 1, text);
const dungeon = (target: string, text: string): QuestObjective => obj('dungeon', target, 1, text);
const collect = (target: string, count: number, text: string): QuestObjective => obj('collect', target, count, text);
const explore = (target: string, text: string): QuestObjective => obj('explore', target, 1, text);
const drop = (target: string, count: number, from: string[], text: string): QuestObjective => ({ kind: 'drop', target, count, from, chance: QUEST_DROP_CHANCE, text });
const use = (item: string, target: string, count: number, text: string): QuestObjective => ({ kind: 'use', item, target, count, text });
/** escort = the defend event: stay beside the escorted NPC while its ambushers attack (QuestSystem.tickEscort). */
const escort = (seconds: number, text: string): QuestObjective => ({ kind: 'escort', count: seconds, text });

/** Main chain "Kadim Mühür" (§6.2). Rewards: items as the layout text names them, generic = "Büyülü / Nadir / Destansı" drops. */
const EXTRA_MAIN: Record<string, Extra> = {
  mq_01_kuzgunun_cagrisi: {
    objectives: [talk('npc_g_muhtar', "Gümüşdere Köyü'nde Muhtar Ferhat ile konuş")], turnIn: 'npc_g_muhtar',
    items: [{ id: 'scroll_town', count: 2 }, { id: 'pot_hp_1', count: 3 }],
    offer: "Kuzgunkale'nin surlarında bir gölge belirdi. Güney Kapısı'ndan çık, Gümüşdere'de Muhtar Ferhat seni bekliyor.",
    progress: "Gümüşdere Köyü'nde Muhtar Ferhat ile konuş.", done: 'Ferhat gölgeyi de görmüş. Vadinin işi uzun olacak.',
  },
  mq_02_fare_yuvasi: {
    objectives: [kill('ow_rat', 10, 'Orman Sıçanı öldür')], choice: { rarity: 'uncommon', slots: ['weapon', 'armor', 'jewelry'] }, turnIn: 'npc_g_ciftci',
    offer: "Fareler tarlaları bastı. Fare Yuvası'nı temizle, sonra Çiftçi Hatice'ye haber ver.", progress: 'Orman Sıçanı öldür (10).', done: 'Tarlalar yeniden güvende.',
  },
  mq_03_balcik_temizligi: {
    objectives: [use('item_camur_kesesi', 'qt_kutsama_tasi', 4, "Kutsama Taşı'nda Çamur Kesesi kutsat (4)")], startItems: [{ id: 'item_camur_kesesi', count: 4 }], region: 'r1', items: [{ id: 'pot_hp_1', count: 3 }],
    giver: 'npc_g_ciftci', turnIn: 'npc_o_gozcu',
    offer: "Hatice'nin verdiği dört Çamur Kesesi'ni Kutsama Taşı'nda kutsat. Merhemi Orta Karakol'daki Gözcü Selim'e götür.",
    progress: "Kutsama Taşı'nda Çamur Kesesi kutsat (4).", done: 'Merhem hazır. Gözcü Selim cepheye götürdü.',
  },
  mq_04_samani_sustur: {
    // defend (escort, the event of the chain): the scout walks the r1 road while ambushers come in waves. The shaman kills stay in the open world.
    objectives: [escort(90, 'Yaralı gözcüyü 90 sn koru (üç dalga pusu)')], region: 'r1', choice: { rarity: 'uncommon', slots: ['weapon', 'armor', 'jewelry'] },
    giver: 'npc_o_gozcu', turnIn: 'npc_o_gozcu',
    offer: 'Yaralı gözcü kampa dönmek istiyor, yolda goblin pususu var. Onu Gümüşdere Köyü\'ne kadar koru; sonra Orta Karakol\'da Gözcü Selim\'e dön.', progress: 'Yaralı gözcüyü 90 sn koru.', done: 'Gözcü kurtuldu. Pusuya düşenler dağıldı.',
  },
  mq_05_yagmaci_kampi: {
    giver: 'npc_o_gozcu', turnIn: 'npc_o_gozcu', objectives: [boss('mb_girtlak', 1, "Yağmacı Başı Gırtlak'ı öldür")], choice: { rarity: 'uncommon', slots: ['weapon', 'armor', 'jewelry'] },
    offer: 'Gırtlak kampından kaçtı ama izi taze. Yakala ve başını getir.', progress: "Yağmacı Başı Gırtlak'ı öldür.", done: "Gırtlak'ın gölgesi dağıldı. Köy rahat nefes alıyor.",
  },
  mq_06_ilk_metin: {
    giver: 'npc_o_gozcu', turnIn: 'npc_o_gozcu', objectives: [metin('metin_keder', "Keder Metini'ni yık")], items: [{ id: 'metin_kalintisi', count: 5 }, { id: 'beceri_kitabi_1', count: 1 }],
    offer: "Vadinin ortasında kara bir taş var. Keder Metini'ni yık; yanındaki kayaların arkasında bir sandık da var.", progress: "Keder Metini'ni yık.", done: 'Taş çatladı. Kalıntılar artık senin.',
  },
  mq_07_kopruyu_gec: {
    giver: 'npc_o_gozcu', objectives: [explore('hd_r1', "Kurtların Gizli Çayırı'nı bul (sandık)")],
    turnIn: 'npc_g_muhtar', unlocks: ['wp_ciftlik'], region: 'r1',
    offer: "Gözcü Selim'in haritasında Kurtların Gizli Çayırı'nda bir sandık işaretli. Git, bul ve sandığı aç.", progress: "Kurtların Gizli Çayırı'nı bul.",
    done: "Sandık senin. Rıza'nın çiftliğine giden yol artık açık.",
  },
  mq_08_ciftlik_isgali: {
    objectives: [kill('ow_boar', 12, 'Yaban Domuzu öldür'), kill('ow_scarecrow', 8, 'Korkuluk öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Domuzlar tarlaları ezdi, korkuluklar bile yerinden oynadı.', progress: 'Yaban Domuzu (12) ve Korkuluk (8) öldür.', done: 'Tarlalar yine ekilebilir.',
  },
  mq_09_mezarligin_sirri: {
    objectives: [kill('skel_minion', 10, "Kayıp Mezarlık'ta iskelet öldür")], unlocks: ['ent_kemik_mahzeni'],
    offer: "Kayıp Mezarlık'ta uyanan iskeletler var. Kemik Mahzeni'nin kapısı da orada.",
    progress: 'Mezarlıkta 10 iskelet öldür.', done: "Mezarlığın sırrı açığa çıktı. Kemik Mahzeni'nin kapısı etkin.",
  },
  mq_10_kemik_mahzeni: {
    objectives: [dungeon('kemik_mahzeni:normal', "Kemik Mahzeni'ni Normal zorlukta bitir")], items: [{ id: 'item_muhur_parcasi_1', count: 1 }],
    generic: [{ rarity: 'rare' }],
    offer: "Kemik Mahzeni'nin derinliklerinde ilk Mühür Parçası saklı.", progress: "Kemik Mahzeni'ni Normal zorlukta bitir.", done: 'İlk Mühür Parçası ele geçti.',
  },
  mq_11_curukkok: {
    objectives: [boss('wb_curukkok', 1, "Çürükkök'ü yen")], generic: [{ rarity: 'rare' }],
    offer: "Çürük Höyük'te bir mantar kral uyanıyor. Grupla gitmen önerilir.", progress: "Çürükkök'ü yen.", done: 'Mantar Kral düştü. Höyük sessizliğe gömüldü.',
  },
  mq_12_haydut_kalesi: {
    objectives: [boss('mb_karabiyik', 1, "Haydut Kralı Karabıyık'ı öldür"), kill('ow_bandit', 15, '15 haydut öldür')],
    items: [{ id: 'item_muhur_parcasi_2', count: 1 }], generic: [{ rarity: 'rare' }],
    offer: "Haydutlar kalesini kurdu. Kralları Karabıyık'ı alt et.", progress: "Karabıyık'ı öldür ve 15 haydut öldür.", done: 'Kale düştü, Mühür Parçası II bulundu.',
  },
  mq_13_kizilkaya_haberi: {
    objectives: [explore('koy_kizilkaya', "Kızılkaya Karakolu'na ulaş"), kill('ow_wolf', 10, 'Kurt öldür')],
    generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: "Kızılkaya'dan haber alamıyoruz. Karakola git, Komutan Aslan seni bekliyor.", progress: "Kızılkaya'ya ulaş ve 10 kurt öldür.",
    done: 'Komutan Aslan haberi aldı. Kızılkaya sana minnettar.',
  },
  mq_14_bataklik_cadisi: {
    objectives: [boss('mb_zehra', 1, "Cadı Zehra'yı öldür"), collect('item_cadi_otu', 6, 'Cadı Otu topla')],
    items: [{ id: 'item_muhur_parcasi_3', count: 1 }], generic: [{ rarity: 'rare' }],
    offer: 'Bataklıkta bir cadı kaynıyor. Otlarını topla ve kendisini durdur.', progress: "Cadı Zehra'yı öldür ve 6 Cadı Otu topla.",
    done: 'Bataklık sessizleşti. Mühür Parçası III bulundu.',
  },
  mq_15_kor_ocagi: {
    objectives: [dungeon('kizil_dokumhane:normal', "Kızıl Dökümhane'yi Normal zorlukta bitir")], generic: [{ rarity: 'rare' }],
    unlocks: ['wp_kor_ocagi'],
    offer: "Kızıl Dökümhane'den alevler yükseliyor. Dökümhaneyi temizle.", progress: "Kızıl Dökümhane'yi Normal zorlukta bitir.",
    done: 'Kor Ocağı Taşı artık yolunu gösteriyor.',
  },
  mq_16_ork_istilasi: {
    objectives: [kill('ow_orc_shaman', 3, 'Ork Savaş Sancağı taşıyıcısı 3 Ork Şamanı yık'), boss('mb_gorak', 1, "Ork Reisi Gorak'ı öldür")],
    generic: [{ rarity: 'rare' }, { rarity: 'rare' }],
    offer: 'Orklar kanyonun girişini tuttu. Sancaklarını yık, reislerini bul.', progress: "3 Ork Savaş Sancağı'nı yık ve Gorak'ı öldür.",
    done: 'Kanyon yeniden açıldı.',
  },
  mq_17_lanetli_yol: {
    objectives: [kill('skel_minion', 12, 'İskelet öldür'), kill('cult_acolyte', 6, 'Kara Tarikat müridi öldür')],
    items: [{ id: 'buyulu_toz', count: 10 }],
    offer: 'Lanetli yol iskeletlerle dolu. Tarikat müridleri de peşinden geliyor.', progress: '12 iskelet ve 6 Kara Tarikat müridi öldür.', done: 'Yol yeniden yürünebilir.',
  },
  mq_18_kara_anit: {
    objectives: [metin('metin_olum', "Ölüm Metini'ni yık"), boss('mb_valdemar', 1, "Kan Lordu Valdemar'ı öldür")],
    items: [{ id: 'item_muhur_parcasi_4', count: 1 }], generic: [{ rarity: 'epic' }],
    offer: "Kara Anıt'ın gölgesinde son Metin yükseliyor. Önce onu yık, sonra Valdemar'ı bul.",
    progress: "Ölüm Metini'ni yık ve Kan Lordu Valdemar'ı öldür.", done: 'Mühür Parçası IV bulundu. Son parça yakın.',
  },
  mq_19_kuzgunkaleye_donus: {
    objectives: [
      collect('item_muhur_parcasi_1', 1, 'Mühür Parçası I'), collect('item_muhur_parcasi_2', 1, 'Mühür Parçası II'),
      collect('item_muhur_parcasi_3', 1, 'Mühür Parçası III'), collect('item_muhur_parcasi_4', 1, 'Mühür Parçası IV'),
    ],
    generic: [{ rarity: 'epic' }], unlocks: ['dungeon:buzul_tahti', 'karakir_bozkiri'],
    offer: "Dört Mühür Parçası toplandı. Kuzgunkale'ye dön ve Muhtar Cemal'e teslim et.",
    progress: "Dört Mühür Parçası'nı Muhtar Cemal'e teslim et.", done: 'Kadim Mühür yeniden sağlamlaştı. Doğu Kapısı açıldı.',
  },
};

/** Side quests (§6.3). Rewards in the table are the layout `items` text mapped to ids; gems and named rings are noted in the report. */
const EXTRA_SIDE: Record<string, Extra> = {
  sq_g_01_kurt_tehlikesi: {
    objectives: [kill('ow_wolf', 8, 'Orman Kurdu öldür')], items: [{ id: 'pot_hp_1', count: 2 }],
    offer: 'Kurtlar yol kenarında dolaşıyor. Sekiz kurdu avla.', progress: 'Orman Kurdu öldür (8).', done: 'Yol yeniden güvenli.',
  },
  sq_g_02_geyik_derisi: {
    objectives: [{ kind: 'collect', target: 'item_geyik_derisi', count: 5, from: ['ow_deer'], text: 'Geyiklerden Geyik Derisi topla (5)' }], generic: [{ rarity: 'uncommon', slot: 'jewelry' }],
    offer: 'Geyik Çayırı\'nda bir sürü geyik otluyor. Kaçarlar, peşlerinden git ve beş deri getir.', progress: 'Geyiklerden Geyik Derisi topla (5).', done: 'Gümüş Yüzük senin olsun.',
  },
  sq_g_03_orumcek_aglari: {
    giver: 'npc_o_gozcu', objectives: [kill('ow_spider', 8, 'Orman Örümceği öldür')],
    offer: 'Örümcekler ağlarını tarlaların üstüne ördü.', progress: 'Orman Örümceği öldür (8).', done: 'Ağlar temizlendi.',
  },
  sq_g_04_ari_yuvasi: {
    giver: 'npc_o_gozcu', objectives: [kill('ow_wasp', 10, 'Orman Arısı öldür')], items: [{ id: 'buyulu_toz', count: 2 }],
    offer: 'Arılar yuvasını büyüttü. Kovanı dağıt.', progress: 'Orman Arısı öldür (10).', done: 'Kovan dağıldı.',
  },
  sq_g_05_mantar_halkasi: {
    giver: 'npc_o_gozcu', objectives: [kill('ow_mushnub', 12, 'Mantarcık öldür')], items: [{ id: 'pot_res_1', count: 3 }],
    offer: 'Mantar halkası zehirli bulut saçıyor. Dikkatli ol.', progress: 'Mantarcık öldür (12).', done: 'Halka sönük. Teşekkür ederim.',
  },
  sq_g_06_degirmen: {
    giver: 'npc_o_gozcu', objectives: [kill('ow_wolf', 3, 'Kurt öldür'), kill('ow_boar', 2, 'Domuz öldür'), kill('rare_gumus_yele', 1, 'Gümüş Yele öldür')],
    generic: [{ rarity: 'rare', slot: 'jewelry' }],
    offer: 'Eski değirmende kurt ini var. Gümüş Yele de orada dolaşıyor.', progress: 'Kurt (3), domuz (2) ve Gümüş Yele öldür.', done: 'Değirmen yeniden çalışabilir.',
  },
  sq_c_01_bugday_hirsizlari: {
    objectives: [kill('ow_puglin', 10, 'Puglin Yağmacı öldür')],
    offer: 'Buğday hırsızları tarlaları soyuyor.', progress: 'Puglin Yağmacı öldür (10).', done: 'Buğdaylar kurtarıldı.',
  },
  sq_c_02_korkuluk_sirri: {
    objectives: [kill('ow_scarecrow', 8, 'Korkuluk öldür'), kill('rare_korkuluk_kral', 1, 'Korkuluk Kral öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Korkuluklar bir gün yürüyüp köye gelebilir. Sırrı çöz.', progress: 'Korkuluk (8) öldür ve Korkuluk Kral\'ı bul.', done: 'Sır çözüldü.',
  },
  sq_c_03_terk_edilmis_ciftlik: {
    objectives: [kill('ow_zombie', 5, 'Zombi öldür'), kill('ow_bat', 4, 'Yarasa öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: 'Terk edilmiş çiftlikte ölüler dolaşıyor.', progress: 'Zombi (5) ve yarasa (4) öldür.', done: 'Çiftlik yeniden sessizleşti.',
  },
  sq_c_04_mantar_kokusu: {
    objectives: [kill('ow_mushroom_brute', 6, 'Mantar Zorbası öldür')], items: [{ id: gemId('emerald', 1), count: 1 }],
    offer: 'Dev mantarlar tarlaya kök salıyor. Zorbaları indir.', progress: 'Mantar Zorbası öldür (6).', done: 'Tarlalar temizlendi.',
  },
  sq_c_05_haydut_devriyesi: {
    objectives: [kill('ow_bandit', 4, 'Haydut öldür'), kill('ow_bandit_archer', 2, 'Haydut okçusu öldür'), kill('ow_bandit_brute', 1, 'Haydut pehlivanı öldür')],
    items: [{ id: 'efsun_nesnesi', count: 1 }],
    offer: 'Haydut karakolu bu devriyenin üssü. Karakolu temizle.', progress: 'Haydut (4), okçu (2) ve pehlivan (1) öldür.', done: 'Karakol yeniden bizim.',
  },
  sq_k_01_gol_kiyisi: {
    objectives: [kill('ow_bear', 2, 'Boz Ayı öldür'), kill('ow_wolf', 6, 'Kurt öldür')], items: [{ id: 'buyulu_toz', count: 5 }],
    offer: 'Göl kıyısındaki mağarada ayılar ve kurtlar var.', progress: 'Boz Ayı (2) ve kurt (6) öldür.', done: 'Göl kıyısı güvende.',
  },
  sq_k_02_warg_sürüsü: {
    objectives: [kill('ow_warg', 2, 'Savaş Kurdu öldür'), kill('ow_puglin', 6, 'Puglin öldür')], generic: [{ rarity: 'rare' }],
    offer: 'Savaş kurtları sürüsüyle kemik totemlerin çevresinde dolaşıyor.', progress: 'Savaş Kurdu (2) ve Puglin (6) öldür.', done: 'Sürü dağıldı.',
  },
  sq_k_03_gozcu_kulesi: {
    objectives: [kill('ow_bandit_archer', 4, 'Haydut okçusu öldür')], generic: [{ rarity: 'rare' }],
    offer: 'Yıkık kulede haydut okçuları pusu kurdu.', progress: 'Haydut okçusu öldür (4).', done: 'Kule yeniden gözcü olabilir.',
  },
  sq_k_04_gergedan: {
    objectives: [kill('ow_rhino', 2, 'Dağ Gergedanı öldür')], items: [{ id: 'buyulu_toz', count: 6 }],
    offer: 'Gergedanlar otlağı ele geçirdi. Hücumlarından kaçarak onları indir.', progress: 'Dağ Gergedanı öldür (2).', done: 'Otlak yeniden açık.',
  },
  sq_k_05_agit_isigi: {
    objectives: [kill('ow_will', 10, 'Bataklık Işığı öldür')], items: [{ id: 'pot_hp_2', count: 4 }],
    offer: 'Ağıt bataklığında ışıklar yanıp sönüyor. Patlamalarından uzak dur.', progress: 'Bataklık Işığı öldür (10).', done: 'Işıklar söndü.',
  },
  sq_k_06_zehirli_magara: {
    objectives: [kill('ow_spider_giant', 2, 'Dev Örümcek öldür'), kill('ow_spider', 6, 'Örümcek öldür')], items: [{ id: gemId('emerald', 2), count: 1 }],
    offer: 'Zehirli mağarada dev örümcekler yuva kurdu.', progress: 'Dev Örümcek (2) ve Örümcek (6) öldür.', done: 'Mağara temizlendi.',
  },
  sq_k_07_ciyan_cukuru: {
    objectives: [kill('ow_centipede', 8, 'Çürük Çıyanı öldür')], items: [{ id: gemId('topaz', 2), count: 1 }],
    offer: 'Toprak çukurlarında çıyanlar yaşıyor. Çukuru temizle.', progress: 'Çürük Çıyanı öldür (8).', done: 'Çukur sessiz.',
  },
  sq_s_01_kanyon_gecidi: {
    objectives: [kill('ow_orc', 6, 'Ork Savaşçısı öldür'), kill('ow_orc_archer', 3, 'Ork okçusu öldür')], items: [{ id: 'buyulu_toz', count: 6 }],
    offer: 'Kanyon geçidini orklar tutuyor. Geçidi geri al.', progress: 'Ork Savaşçısı (6) ve Fırlatıcı (3) öldür.', done: 'Geçit yeniden açık.',
  },
  sq_s_02_tas_ocagi: {
    objectives: [kill('ow_golem', 2, 'Kanyon Golemi öldür')], items: [{ id: 'ejderha_pulu', count: 1 }],
    offer: 'Taş ocağında golemler uyandı.', progress: 'Kanyon Golemi öldür (2).', done: 'Ocak sessizleşti.',
  },
  sq_s_03_kor_ocagi_ates: {
    objectives: [kill('ow_imp', 5, 'Kanyon İblisçiği öldür'), kill('ow_ember', 1, 'Kor Elementali öldür')], items: [{ id: gemId('ruby', 2), count: 1 }],
    offer: 'Kor çatlağında iblisçikler ve bir kor elementali dolaşıyor.', progress: 'İblisçik (5) ve Kor Elementali öldür.', done: 'Çatlak söndü.',
  },
  sq_s_04_kemik_nobeti: {
    objectives: [kill('skel_minion', 5, 'İskelet öldür'), kill('skel_archer', 2, 'İskelet okçusu öldür')], items: [{ id: 'buyulu_toz', count: 8 }],
    offer: 'Son Ocak nöbeti kemiklerle dolu. Kampı geri al.', progress: 'İskelet (5) ve okçu (2) öldür.', done: 'Nöbet yeniden bizde.',
  },
  sq_s_05_kutuphane: {
    objectives: [kill('skel_mage', 3, 'Kemik Büyücüsü öldür')], items: [{ id: 'oyma_kalemi', count: 1 }],
    offer: 'Eski kütüphanede kemik büyücüleri kitap okuyor.', progress: 'Kemik Büyücüsü öldür (3).', done: 'Kitaplar kurtarıldı.',
  },
  sq_s_06_vampir_izi: {
    objectives: [boss('mb_valdemar', 1, "Kan Lordu'nu öldür")], items: [{ id: gemId('amethyst', 4), count: 1 }],
    offer: 'Kan Lordu Salonu\'nda bir vampir yaşıyor. Onu bul ve yok et.', progress: "Kan Lordu'nu öldür.", done: 'Vampir yok oldu.',
  },
};

/**
 * One-time quest XP (F3 first 10 minutes + XP parity, 2026-10-13): xpPct of the 19 main and 24 side quests, replacing the layout
 * values. Bands 6+ give ~35 % of their XP to one-time quests (region quests in quests_extra.ts follow the same factor). Band 1-5 is
 * the tutorial band and may take up to 60 %: mq_03..mq_07 are 15-25 % each. mq_03 + mq_04 stay below the level 3 threshold before
 * the mq_05 boss (Gırtlak). mq_04 (escort defend) is level 2 (layout had 3): the level is also the GATE (QuestSystem.stateOf locks a quest
 * above the player's level), and at level 3 it could not be taken before the level 3 that only its own turn-in gives, so the chain stalled
 * on 18 grind kills. At level 2 it is taken right after quest 3 and its 43 % of xpToNext(2) (344 XP, the old 26 % of xpToNext(3)) lands level 3
 * right after quest 4 (first-hour target, pace-check). mq_01 / mq_02 are 8.5x / 3x their layout value:
 * level 2 lands right after quest 2 (EARLY_NEED_MULT in systems/Progression.ts doubles the levels 1-5 needs; quest XP % is of that need).
 * Check with `node tools/pace-check.mjs`. docs/GDD_OPENWORLD.layout.json (and its §6.2-6.3 tables) still show the layout values.
 */
const XP_PCT: Record<string, number> = {
  mq_01_kuzgunun_cagrisi: 85, mq_02_fare_yuvasi: 60, mq_03_balcik_temizligi: 20, mq_04_samani_sustur: 43,
  mq_05_yagmaci_kampi: 21, mq_06_ilk_metin: 25, mq_07_kopruyu_gec: 14, mq_08_ciftlik_isgali: 6,
  mq_09_mezarligin_sirri: 7, mq_10_kemik_mahzeni: 13, mq_11_curukkok: 13, mq_12_haydut_kalesi: 11,
  mq_13_kizilkaya_haberi: 9, mq_14_bataklik_cadisi: 14, mq_15_kor_ocagi: 15, mq_16_ork_istilasi: 16,
  mq_17_lanetli_yol: 10, mq_18_kara_anit: 13, mq_19_kuzgunkaleye_donus: 18,
  sq_g_01_kurt_tehlikesi: 25, sq_g_02_geyik_derisi: 25, sq_g_03_orumcek_aglari: 9, sq_g_04_ari_yuvasi: 12,
  sq_g_05_mantar_halkasi: 12, sq_g_06_degirmen: 12, sq_c_01_bugday_hirsizlari: 4, sq_c_02_korkuluk_sirri: 4,
  sq_c_03_terk_edilmis_ciftlik: 4, sq_c_04_mantar_kokusu: 4, sq_c_05_haydut_devriyesi: 4, sq_k_01_gol_kiyisi: 5,
  sq_k_02_warg_sürüsü: 5, sq_k_03_gozcu_kulesi: 5, sq_k_04_gergedan: 5, sq_k_05_agit_isigi: 6,
  sq_k_06_zehirli_magara: 8, sq_k_07_ciyan_cukuru: 6, sq_s_01_kanyon_gecidi: 7, sq_s_02_tas_ocagi: 7,
  sq_s_03_kor_ocagi_ates: 7, sq_s_04_kemik_nobeti: 5, sq_s_05_kutuphane: 5, sq_s_06_vampir_izi: 5,
};

/** Build a QuestDef from layout fields + the extra table. */
function quest(
  p: { id: string; name: string; level: number; giver: string; xpPct: number; goldPerLevel?: number; region?: string; place?: string; main: boolean; prereq?: string },
  x: Extra,
): QuestDef {
  const reward: QuestReward = { xpPct: p.xpPct };
  if (p.goldPerLevel !== undefined) reward.goldPerLevel = p.goldPerLevel;
  if (x.items) reward.items = x.items;
  if (x.generic) reward.generic = x.generic;
  if (x.choice) reward.choice = x.choice;
  const def: QuestDef = {
    id: p.id, name: p.name, level: p.level, giver: x.giver ?? GIVER_ID[p.giver] ?? p.giver, objectives: x.objectives, reward,
    text: { offer: x.offer, progress: x.progress, done: x.done },
  };
  if (p.main) def.main = true;
  if (p.region) def.region = p.region;
  if (p.place) def.place = p.place;
  if (p.prereq) def.prereq = [p.prereq];
  if (x.turnIn) def.turnIn = x.turnIn;
  if (x.startItems) def.startItems = x.startItems;
  if (x.unlocks) def.unlocks = x.unlocks;
  return def;
}

/** Main chain, linear: each quest requires the previous one. */
export const MAIN_QUESTS: QuestDef[] = LAYOUT.quests.main.map((q, i) =>
  quest(
    {
      id: q.id, name: q.name, level: q.level, giver: q.giver, xpPct: XP_PCT[q.id] ?? q.xpPct, goldPerLevel: q.goldPerLevel, main: true, place: q.place, region: EXTRA_MAIN[q.id]?.region,
      prereq: i > 0 ? LAYOUT.quests.main[i - 1].id : undefined,
    },
    EXTRA_MAIN[q.id] ?? { objectives: [], offer: q.goal, progress: q.goal, done: q.goal },
  ),
);

/** Side quests: the region is the first `rN` token of the place (camp id or "r1 ambient"). */
export const SIDE_QUESTS: QuestDef[] = LAYOUT.quests.side.map((q) =>
  quest(
    { id: q.id, name: q.name, level: q.level, giver: q.giver, xpPct: XP_PCT[q.id] ?? q.xpPct, region: /^(r\d)/.exec(q.place)?.[1], place: q.place, main: false },
    EXTRA_SIDE[q.id] ?? { objectives: [], offer: q.goal, progress: q.goal, done: q.goal },
  ),
);

/**
 * Starter-dungeon side quest "Mağaradaki Sis" (Gümüşdere, Avcı Yıldız, level 3 after mq_04). Optional: not on the main chain (no
 * other quest needs it). Objective 1 opens the Group Finder (I, explore target `finder`, fired from FinderPanel); objective 2 is the
 * Sisli Mağara run, whose final boss is the Kadim Bekçi (boss_mag_bekci). Reward: XP and a blue (rare) item.
 */
/** `explore` target the game emits when the Group Finder (Zindan Bulucu) opens (FinderPanel.onOpen). Not a place: tools/content-check.mjs lists it. */
export const FINDER_EXPLORE_ID = 'finder';

const MAGARA_QUEST: QuestDef = {
  id: 'sq_g_07_magaradaki_sis', name: 'Mağaradaki Sis', level: 3, giver: 'npc_g_avci', turnIn: 'npc_g_avci', region: 'r1', place: 'Gümüşdere',
  prereq: ['mq_04_samani_sustur'],
  objectives: [explore(FINDER_EXPLORE_ID, "Zindan Bulucu'yu aç (I)"), dungeon('sisli_magara', "Sisli Mağara'ya gir ve Kadim Bekçi'yi yen")],
  reward: { xpPct: 12, generic: [{ rarity: 'rare' }] },
  text: {
    offer: "Sisli Mağara'ya gir ve Kadim Bekçi'yi yen. Önce Zindan Bulucu'yu aç (I), girişi Gümüşdere'nin kuzeyinde bulacaksın.",
    progress: "Zindan Bulucu'yu aç (I) ve Sisli Mağara'yı bitir.", done: 'Sis dağıldı. Kadim Bekçi artık seni tanıyor.',
  },
};

/** Region quests (kill / collect / hunt / metin / chain / daily per region, data/world/quests_extra.ts). */
/** Karakır Bozkırı (mq_20..22 continue the main chain after mq_19, 9 zone quests): data/world/karakir_quests.ts. */
export const QUESTS: QuestDef[] = applyVariety([...MAIN_QUESTS, ...SIDE_QUESTS, MAGARA_QUEST, ...REGION_QUESTS, ...KARAKIR_QUESTS, ...KARAKIR_PACE_QUESTS, ...AYAZ_QUESTS]);

/** Quest ids an NPC offers or turns in (TownNpc.quests). */
export function questIdsFor(npcId: string): string[] {
  return QUESTS.filter((q) => q.giver === npcId || q.turnIn === npcId).map((q) => q.id);
}

// ---------------------------------------------------------------------------------------------------------------------
// Av Defteri (biologist collection, §6.4): permanent bonuses while the step is active. Flags: `world.bio` >= step.
// ---------------------------------------------------------------------------------------------------------------------

export interface BioStep {
  step: number;
  minLevel: number;
  /** Trophy item id (data/materials.ts, kind 'quest'): drops only while the step is active. */
  item: string;
  count: number;
  /** Monster source as the layout names it (Turkish). */
  source: string;
  /** Permanent StatCalc key and value (fraction for percentages, e.g. 0.01 = +1%). */
  stat: string;
  value: number;
}

/** Layout trophy names -> item ids. */
const TROPHY_ID: Record<string, string> = {
  'Kurt Dişi': 'trophy_kurt_disi',
  'Domuz Dişi': 'trophy_domuz_disi',
  'Haydut Mührü': 'trophy_haydut_muhru',
  'Bataklık Özü': 'trophy_zehir_ozu',
  'Ork Dişi Kolye': 'trophy_ork_disi',
  'Lanetli Kemik': 'trophy_lanetli_kemik',
};

export const AV_DEFTERI: BioStep[] = LAYOUT.quests.bio.map((b) => {
  const r = /(\w+)\s*\+%(\d+)/.exec(b.reward);
  return {
    step: b.step, minLevel: b.minLevel, item: TROPHY_ID[b.item] ?? b.item, count: b.count, source: b.source,
    stat: r?.[1] ?? 'unknown', value: r ? Number(r[2]) / 100 : 0,
  };
});
