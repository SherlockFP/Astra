import type { QuestDef, QuestObjective, QuestReward } from '../../types/quests';

/**
 * AYAZ DAĞLARI quests (levels 45-59, regions r16..r21). OWNER: content module. The runtime is systems/Quests.ts.
 *
 * 25 quests, Turkish text in the WoW style (kill X, collect Y, talk to Z, rare hunt, mini-boss, world boss; nobody escorts):
 *  - main chain mq_23..mq_26 ("Buz Geçidi" .. "Zirve Kapısı"), continuing mq_22_kizil_kagan (Karakır) through its prerequisite
 *  - 21 region quests sq_r<16..21>_* (region kind, `region` = the r16..r21 of the zone): 4 at level 45, 6 at 46-50, 6 at 51-55,
 *    5 at 56-59. Inside them: one rare hunt per region (rare_ad_*), one mini-boss quest (mb_ad_buz_dev), the world boss quest
 *    (wb_ad_zemheri, level 57), and metin quests on the tier stones ad_metin_t1..t3
 *
 * Givers: the three Ayaz outposts (data/world/ayaz_villages.ts): Ayaz Geçidi Karakolu (npc_ad_gecit_*), Kırağı Konağı (npc_ad_kiragi_*),
 * Buz Kulesi Gözlemevi (npc_ad_buz_*). Collect items are the gather materials of tiers 4-6 (data/professions.ts, data/materials.ts).
 *
 * Rewards: one-time quest XP is tuned to pace-check's band targets (about 30 % of each band's XP, allowed 25-45 %). xpPct is per
 * quest (% of xpToNext(quest level)): bands 41-45 22-32, 46-50 18-27, 51-55 19-29, 56-59 15-28. goldPerLevel 10-16 (gold = goldPerLevel x level).
 */

type Reward = { items?: { id: string; count: number }[]; generic?: NonNullable<QuestReward['generic']> };

interface Spec extends Reward {
  id: string;
  name: string;
  level: number;
  region?: string;
  giver: string;
  turnIn?: string;
  prereq?: string;
  main?: boolean;
  objectives: QuestObjective[];
  xpPct: number;
  goldPerLevel: number;
  offer: string;
  progress: string;
  done: string;
}

const kill = (target: string, count: number, text: string): QuestObjective => ({ kind: 'kill', target, count, text });
const boss = (target: string, count: number, text: string): QuestObjective => ({ kind: 'boss', target, count, text });
const metin = (target: string, count: number, text: string): QuestObjective => ({ kind: 'metin', target, count, text });
const collect = (target: string, count: number, text: string): QuestObjective => ({ kind: 'collect', target, count, text });
const talk = (target: string, text: string): QuestObjective => ({ kind: 'talk', target, count: 1, text });

const SPECS: Spec[] = [
  // ---- main chain: after mq_22 (Kızıl Kağan) the Ayaz pass opens; the Buzul Tahtı gate is the lead's (level 45)
  { id: 'mq_23_buz_gecidi', name: 'Buz Geçidi', level: 45, giver: 'npc_ad_gecit_komutan', prereq: 'mq_22_kizil_kagan', main: true, xpPct: 30, goldPerLevel: 10,
    objectives: [kill('ad_kar_kurdu', 8, 'Kar Kurdu öldür (8)'), talk('npc_ad_gecit_izci', 'İzci Sarp ile konuş')],
    items: [{ id: 'pot_hp_4', count: 3 }],
    offer: "Kızıl Çorak'tan dönen kervanlar Buz Geçidi'nden de haber getiriyor. Kar kurtları yolu kesmiş, karakol kapısına kadar gelmiş. Önce Ayaz Geçidi Karakolu'nda İzci Sarp'a uğra, sonra yolu temizle.",
    progress: 'Kar Kurdu öldür (8), sonra İzci Sarp ile konuş.', done: 'Geçit açık. Sarp bu dağların gerisini de biliyor; artık Kırağı Vadisi\'ne yönelebiliriz.' },
  { id: 'mq_24_kiragi_vadisi', name: 'Kırağı Vadisi', level: 48, giver: 'npc_ad_kiragi_komutan', prereq: 'mq_23_buz_gecidi', main: true, xpPct: 25, goldPerLevel: 12,
    objectives: [kill('ad_buz_orumcek', 8, 'Buz Örümceği öldür (8)'), kill('ad_don_iskelet', 6, 'Donmuş İskelet öldür (6)')],
    offer: "Kırağı Vadisi'nde buz örümcekleri kayaların arasına yuva kurmuş, eski kalenin kalıntılarında da iskeletler dolaşıyor. Konak Ağası Mirza vadiyi temizletmek istiyor. Sekiz örümceği ve altı iskeleti avla.",
    progress: 'Buz Örümceği (8) ve Donmuş İskelet (6) öldür.', done: 'Vadi biraz nefes aldı. Ama Mirza başka bir tehlikeden söz ediyor: Fırtına Sırtı.' },
  { id: 'mq_25_firtina_sirti', name: 'Fırtına Sırtı', level: 54, giver: 'npc_ad_kiragi_komutan', prereq: 'mq_24_kiragi_vadisi', main: true, xpPct: 26, goldPerLevel: 14,
    objectives: [kill('ad_kartal', 8, 'Dağ Kartalı öldür (8)'), boss('mb_ad_kar_alfa', 1, 'Kar Alfası\'nı öldür')], generic: [{ rarity: 'rare', slot: 'weapon' }],
    offer: "Fırtına Sırtı'nın kurtları artık sürü halinde dolaşıyor; başlarında Kar Alfası var. Kartallar da onun için avlanıyor. Sekiz kartalı indir, sonra alfayı bul ve bitir.",
    progress: "Dağ Kartalı (8) öldür, sonra Kar Alfası'nı öldür.", done: 'Alfa düştü, sürü dağıldı. Buz Kulesi Gözlemevi\'ndeki gözlemciler bu zaferi bilmek istiyor.' },
  { id: 'mq_26_zirve_kapisi', name: 'Zirve Kapısı', level: 59, giver: 'npc_ad_buz_gozlemci', prereq: 'mq_25_firtina_sirti', main: true, xpPct: 22, goldPerLevel: 16,
    objectives: [kill('ad_buz_muhafiz', 8, 'Buz Muhafızı öldür (8)'), boss('mb_ad_zirve_muhafizi', 1, 'Zirve Muhafızı\'nı öldür')],
    generic: [{ rarity: 'epic' }],
    offer: "Zirve Kuşağı'nın kapısı buz muhafızlarıyla kapanmış. Muhafızların efendisi Zirve Muhafızı, yukarı çıkan herkese kapıyı kapatıyor. Muhafızları devir, efendiyi yere ser.",
    progress: "Buz Muhafızı (8) öldür, sonra Zirve Muhafızı'nı öldür.", done: 'Zirve kapısı açıldı. Buradan sonrası artık bir efsanenin işi.' },

  // ---- r16 Buz Geçidi (45-48): entry band, Ayaz Geçidi Karakolu (npc_ad_gecit_*)
  { id: 'sq_r16_k01_gecit_kurtlari', name: 'Geçidin Kurtları', level: 45, region: 'r16', giver: 'npc_ad_gecit_komutan', xpPct: 25, goldPerLevel: 10,
    objectives: [kill('ad_kar_warg', 10, 'Kar Wargı öldür (10)'), kill('ad_kar_tilki', 6, 'Kar Tilkisi öldür (6)')],
    offer: 'Geçidin iki yanındaki kayalıklardan kurtlar iniyor; devriye bir hafta içinde iki kişiyi kaybetti. Wargları ve tilkileri yolun kenarından uzaklaştır.',
    progress: 'Kar Wargı (10) ve Kar Tilkisi (6) öldür.', done: 'Yol devriyeye açık. Bu kurtlar bir daha geçitte görünmeyecek.' },
  { id: 'sq_r16_c01_altin_cevheri', name: 'Altın Damarı', level: 45, region: 'r16', giver: 'npc_ad_gecit_izci', xpPct: 22, goldPerLevel: 10,
    objectives: [collect('ore_gold', 6, 'Altın Cevheri topla (6)')],
    offer: 'Geçidin kayalarında altın damarları parlıyor, ama madenciler yolun tehlikesi yüzünden çıkamıyor. Altın cevherinden altı parça topla; karakol kapısındaki ocakta eritilecek.',
    progress: 'Altın Cevheri topla (6).', done: 'Cevherler temiz. Ocaktaki demirci bunlardan iyi bir külçe yapabilir.' },
  { id: 'sq_r16_h01_kiragi_kurdu', name: 'Kırağı Kurdunun Avı', level: 45, region: 'r16', giver: 'npc_ad_gecit_komutan', xpPct: 32, goldPerLevel: 12,
    objectives: [kill('rare_ad_kiragi_kurdu', 1, 'Kırağı Kurdu\'nu öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: "Geçidin en yüksek kayasında, buz gibi bir kurt dolaşıyor. Kırağı Kurdu adını verdiğimiz bu yaratık, yolcuları soğuk nefesiyle donduruyor. Onu avla, geçit senin olsun.",
    progress: "Kırağı Kurdu'nu öldür.", done: 'Kurdun uluması kesildi. Geçit sessiz kaldı.' },
  { id: 'sq_r16_k02_dag_keci', name: 'Dağ Keçisi Sürüsü', level: 45, region: 'r16', giver: 'npc_ad_gecit_izci', xpPct: 25, goldPerLevel: 11,
    objectives: [kill('ad_dag_keci', 10, 'Dağ Keçisi öldür (10)')],
    offer: 'Dağ keçileri karakolun arkasındaki yamaçlara tırmanıp kervan atlarını kovalıyor. On keçiyi avla, yamaç güvene dönsün.',
    progress: 'Dağ Keçisi öldür (10).', done: 'Yamaç sakin. Atlar yeniden otlayabilir.' },
  { id: 'sq_r16_k03_kar_haydutlari', name: 'Kar Haydutları', level: 46, region: 'r16', giver: 'npc_ad_gecit_komutan', xpPct: 24, goldPerLevel: 11,
    objectives: [kill('ad_kar_haydut', 8, 'Kar Haydutu öldür (8)'), kill('ad_kar_haydut_okcu', 6, 'Kar Haydutu Okçusu öldür (6)')],
    generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Geçidin eski taş kulesinde haydutlar yeni bir pusu kurdu. Okçular kayaların üstünden vuruyor. Sekiz haydutu ve altı okçuyu temizle.',
    progress: 'Kar Haydutu (8) ve Kar Haydutu Okçusu (6) öldür.', done: 'Kule boşaldı. Geçidi koruyanlar artık nöbeti bırakabilir.' },
  { id: 'sq_r16_m01_buz_metini', name: 'Buz Metini', level: 47, region: 'r16', giver: 'npc_ad_gecit_izci', turnIn: 'npc_ad_gecit_komutan', xpPct: 22, goldPerLevel: 11,
    objectives: [metin('ad_metin_t1', 1, 'Buz Metini\'ni parçala')],
    offer: 'Geçidin ortasında bir buz kayası atıyor gibi duruyor; etrafındaki yaratıklar oradan çıkıyor. Metin taşını parçala, sonra karakola dön.',
    progress: "Buz Metini'ni parçala.", done: 'Taş çatladı, içinden yayılan soğuk çekildi.' },

  // ---- r17 Kırağı Vadisi (48-51): Kırağı Konağı (npc_ad_kiragi_*)
  { id: 'sq_r17_k01_kar_yetileri', name: 'Yeti Avı', level: 48, region: 'r17', giver: 'npc_ad_kiragi_kasif', xpPct: 21, goldPerLevel: 12,
    objectives: [kill('ad_yeti', 10, 'Yeti öldür (10)')],
    offer: 'Vadinin doğu yamacında yetiler görüldü. Sürüleri yakında konağa iner. On yetiyi avla, konak kapıları açık kalsın.',
    progress: 'Yeti öldür (10).', done: 'Yetiler yamaçtan çekildi. Konakta bir kez daha uyuyabileceğiz.' },
  { id: 'sq_r17_c01_ejder_dili', name: 'Ejder Dili Toplama', level: 49, region: 'r17', giver: 'npc_ad_kiragi_kasif', xpPct: 18, goldPerLevel: 12,
    objectives: [collect('herb_dragontongue', 6, 'Ejder Dili topla (6)')],
    offer: 'Vadinin sıcak kaynaklarında ateşli bir bitki açıyor. Ejder Dili iksirlerin en güçlü malzemesi. Altı tane topla, şifacı bekliyor.',
    progress: 'Ejder Dili topla (6).', done: 'Bitkiler sağlam. Şifacı iksirleri hemen karıştırmaya başladı.' },
  { id: 'sq_r17_h01_buz_aga', name: 'Buz Ağası', level: 49, region: 'r17', giver: 'npc_ad_kiragi_komutan', xpPct: 26, goldPerLevel: 12,
    objectives: [kill('rare_ad_buz_aga', 1, 'Buz Ağası\'nı öldür')], generic: [{ rarity: 'rare' }],
    offer: 'Vadinin ortasındaki buz kayalarında, kendini ağa ilan eden dev bir yaratık dolaşıyor. Yolcuları kayalara hapsediyor. Onu bulup vadiyi kurtar.',
    progress: "Buz Ağası'nı öldür.", done: 'Ağa düştü, kayalar çöktü. Vadi artık bizim.' },
  { id: 'sq_r17_b01_buz_devi', name: 'Buz Devi', level: 50, region: 'r17', giver: 'npc_ad_kiragi_komutan', xpPct: 27, goldPerLevel: 13,
    objectives: [boss('mb_ad_buz_dev', 1, 'Buz Devi\'ni öldür')], generic: [{ rarity: 'rare', slot: 'jewelry' }],
    offer: 'Vadinin kuzey ucunda bir buz devi uyanmış. Adımları yamaçları sallıyor, yolcular ondan kaçıyor. Grupla git, devi yere ser.',
    progress: "Buz Devi'ni öldür.", done: 'Dev yıkıldı. Vadideki yamaçlar yeniden sessiz.' },

  // ---- r18 Donmuş Göl Yaylası (51-54): Kırağı Konağı as well
  { id: 'sq_r18_k01_buz_ruhlari', name: 'Buz Ruhları', level: 51, region: 'r18', giver: 'npc_ad_kiragi_kasif', xpPct: 25, goldPerLevel: 13,
    objectives: [kill('ad_buz_ruhu', 8, 'Buz Ruhu öldür (8)'), kill('ad_kar_ork', 6, 'Kar Orku öldür (6)')],
    offer: 'Göl yaylasının kayalıklarında buz ruhları dolaşıyor; kıyıdaki orklar da onları kendi ocaklarına çağırıyor. Sekiz ruhu ve altı orku yok et, göl kıyısı rahat etsin.',
    progress: 'Buz Ruhu (8) ve Kar Orku (6) öldür.', done: 'Göl kıyısı sessiz. Ruhlar yeniden buzun altına döndü.' },
  { id: 'sq_r18_c01_ejder_tasi', name: 'Ejder Taşı Cevheri', level: 52, region: 'r18', giver: 'npc_ad_kiragi_komutan', xpPct: 21, goldPerLevel: 13,
    objectives: [collect('ore_dragon', 6, 'Ejder Taşı Cevheri topla (6)')],
    offer: 'Göl yaylasındaki kayalarda Ejder Taşı damarları var, ama kazmayı oraya kimse sokamıyor. Altı cevher parçası getir; konaktaki demirci onunla bir zırh yapacak.',
    progress: 'Ejder Taşı Cevheri topla (6).', done: 'Cevher ateşte ısındı. Bu kaliteli bir iş.' },
  { id: 'sq_r18_h01_kar_yeti', name: 'Kar Yetisi', level: 53, region: 'r18', giver: 'npc_ad_kiragi_kasif', xpPct: 29, goldPerLevel: 13,
    objectives: [kill('rare_ad_kar_yeti', 1, 'Kar Yetisi\'ni öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: 'Yaylanın en yüksek çığ hattında dev bir yeti dolaşıyor. Gölün kıyısındaki kulübeleri yıkıp geri çekiliyor. Onu yakalayıp yaylayı geri al.',
    progress: 'Kar Yetisi\'ni öldür.', done: 'Yeti düştü. Çığlar bu yaylada artık yalnızca kar yağdırıyor.' },
  { id: 'sq_r18_m01_okcu_pususu', name: 'Okçu Pususu', level: 54, region: 'r18', giver: 'npc_ad_kiragi_komutan', turnIn: 'npc_ad_kiragi_kasif', xpPct: 22, goldPerLevel: 14,
    objectives: [kill('ad_don_iskelet_okcu', 8, 'Donmuş İskelet Okçusu öldür (8)'), metin('ad_metin_t3', 1, 'Donmuş Metin\'i parçala')],
    offer: 'Göl yaylasının kıyısında iskelet okçuları pusu kurmuş. Önce okçuları indir, sonra gölün taşını parçala; taş okçuları geri çağırıyor.',
    progress: 'Donmuş İskelet Okçusu (8) öldür, sonra Donmuş Metin\'i parçala.', done: 'Pusu bozuldu, taş sustu. Yolcular gölü yeniden kullanabilir.' },

  // ---- r19 Fırtına Sırtı (54-57): Kırağı Konağı, the ridge above it
  { id: 'sq_r19_k01_kartal_avi', name: 'Sırt Kartallarının Avı', level: 55, region: 'r19', giver: 'npc_ad_kiragi_kasif', xpPct: 21, goldPerLevel: 14,
    objectives: [kill('ad_kartal', 10, 'Dağ Kartalı öldür (10)'), kill('ad_buz_rahip', 6, 'Buz Rahibi öldür (6)')],
    offer: 'Fırtına Sırtı\'nda kartallar yolcuların atlarını kapıyor; sırtın tepesindeki rahipler de kartal tanrısına kurban arıyor. On kartalı ve altı rahibi indir, sırtın yolu açılsın.',
    progress: 'Dağ Kartalı (10) ve Buz Rahibi (6) öldür.', done: 'Sırt sakinleşti. Kartal yuvalarına çıkmak artık güvenli.' },
  { id: 'sq_r19_c01_moonviolet', name: 'Ay Menekşesi', level: 55, region: 'r19', giver: 'npc_ad_kiragi_kasif', xpPct: 19, goldPerLevel: 14,
    objectives: [collect('herb_moonviolet', 6, 'Ay Menekşesi topla (6)')],
    offer: 'Sırtın rüzgârlı yamaçlarında Ay Menekşesi açıyor. Yalnızca gece parlar ve kolay bulunmaz. Altı çiçek topla, eczacı iksirlerini bu çiçekle yapacak.',
    progress: 'Ay Menekşesi topla (6).', done: 'Çiçekler parlıyor. Eczacı bunları özenle saklayacak.' },
  { id: 'sq_r19_h01_firtina_kartali', name: 'Fırtına Kartalı', level: 56, region: 'r19', giver: 'npc_ad_kiragi_komutan', xpPct: 23, goldPerLevel: 15,
    objectives: [kill('rare_ad_firtina_kartali', 1, 'Fırtına Kartalı\'nı öldür')], generic: [{ rarity: 'rare', slot: 'weapon' }],
    offer: 'Sırtın en yüksek kayasında Fırtına Kartalı kanatlarını açıyor; kanat çırpışı kar bulutlarını dağıtıyor. Onu indir, sırtın gökyüzü temiz kalsın.',
    progress: 'Fırtına Kartalı\'nı öldür.', done: 'Kartal düştü, fırtına dindi.' },

  // ---- r20 Zemheri Yaylası (57-59): Buz Kulesi Gözlemevi (npc_ad_buz_*)
  { id: 'sq_r20_b01_zemheri_kral', name: 'Zemheri Uyanıyor', level: 57, region: 'r20', giver: 'npc_ad_buz_gozlemci', xpPct: 28, goldPerLevel: 16,
    objectives: [boss('wb_ad_zemheri', 1, 'Zemheri\'yi yen')], generic: [{ rarity: 'epic' }],
    offer: "Gözlemevinin kadranları sabahın üçünde aynı yönü gösteriyor: Zemheri uyanıyor. Yaylanın ortasında dev bir kış ruhu, buzulları çatırdatıyor. Gözlemciler zamanı hesaplamış; bu gece onu yenmek gerek.",
    progress: "Zemheri'yi yen.", done: 'Kış çözüldü. Gözlemevinin kadranları yeniden normal akıyor.' },
  { id: 'sq_r20_h01_don_kral', name: 'Don Kralı', level: 58, region: 'r20', giver: 'npc_ad_buz_kahin', xpPct: 22, goldPerLevel: 16,
    objectives: [kill('rare_ad_don_kral', 1, 'Don Kralı\'nı öldür')], generic: [{ rarity: 'rare', slot: 'jewelry' }],
    offer: 'Yaylanın kuzey mezarlığında Don Kralı, soğuğu kendi tacına bağlamış. Yolcuların ölüleri kalkıyor. Kralı devir, mezarlığa huzur getir.',
    progress: "Don Kralı'nı öldür.", done: 'Kralın tacı kırıldı. Mezarlık yeniden toprağa döndü.' },
  { id: 'sq_r20_c01_ancient', name: 'Kadim Kristal Cevheri', level: 58, region: 'r20', giver: 'npc_ad_buz_gozlemci', xpPct: 15, goldPerLevel: 15,
    objectives: [collect('ore_ancient', 6, 'Kadim Kristal Cevheri topla (6)')],
    offer: 'Gözlemevinin arkasındaki buz damarlarında Kadim Kristal yatıyor. Çıkarmak zor, ama gözlemevinin büyücüleri kristalin enerjisini bekliyor. Altı cevher getir.',
    progress: 'Kadim Kristal Cevheri topla (6).', done: 'Kristaller ışıldıyor. Gözlemciler bunlarla kadranları yeniden kalibre edecek.' },
  { id: 'sq_r21_h01_donmus_sovalye', name: 'Donmuş Şövalye', level: 59, region: 'r21', giver: 'npc_ad_buz_kahin', xpPct: 21, goldPerLevel: 16,
    objectives: [kill('rare_ad_donmus_sovalye', 1, 'Donmuş Şövalye\'yi öldür')], generic: [{ rarity: 'epic', slot: 'weapon' }],
    offer: 'Zirve Kuşağı\'nda, buz zırhına bürünmüş bir şövalye yürüyor. Kimse onunla konuşmadı, ama her yaklaşan şövalyenin zırhına donuyor. Onu zirve yolunda durdur.',
    progress: "Donmuş Şövalye'yi öldür.", done: 'Zırh çatladı, şövalye son nefesini verdi. Zirve yolu açık.' },
];

function toDef(s: Spec): QuestDef {
  const reward: QuestReward = { xpPct: s.xpPct, goldPerLevel: s.goldPerLevel };
  if (s.items) reward.items = s.items;
  if (s.generic) reward.generic = s.generic;
  const def: QuestDef = {
    id: s.id, name: s.name, level: s.level, giver: s.giver, objectives: s.objectives, reward,
    text: { offer: s.offer, progress: s.progress, done: s.done },
  };
  if (s.main) def.main = true;
  if (s.region) def.region = s.region;
  if (s.turnIn) def.turnIn = s.turnIn;
  if (s.prereq) def.prereq = [s.prereq];
  return def;
}

/** Ayaz Dağları quests (mq_23..26 are `main`; appended to QUESTS in quests.ts). */
export const AYAZ_QUESTS: QuestDef[] = SPECS.map(toDef);
