import type { QuestDef, QuestObjective, QuestReward } from '../../types/quests';

/**
 * Sisli Vadi bölge görevleri (MMO tarzı "şu kadar yaratık kes" işleri). OWNER: content module.
 *
 * Her bölge (r1..r6) için: 9 öldürme, 3 toplama, 2 nadir / elit avı, 1 metin taşı, 1 zincir (3 adım, talk hedefli)
 * ve 3 günlük görev (`daily`: her yerel gün yeniden alınır, ödül Av Mührü). Toplama eşyaları data/materials.ts içindeki
 * `item_*` görev malzemeleridir; görev `region` alanındaki herhangi bir yaratıktan düşer (systems/Quests.ts rollDrops).
 *
 * Verenler yalnızca var olan NPC id'leridir: Gümüşdere (npc_g_*), Kızılkaya (npc_k_*), Son Ocak (npc_s_nobetci) ve
 * Kuzgunkale (npc_muhtar, yalnızca zincir teslimi). Kamp hub'ları (Altın Ambar npc_c_riza, Kanyon npc_c_deniz) ana ve yan
 * zincirlerde görev verir; bölge görevlerini ise köy ve karakol NPC'leri verir.
 *
 * tools/content-check.mjs her hedef düşmanın bir kampta, nadirde, mini-bossta ya da metinde gerçekten doğduğunu, seviye
 * bandının ve zincir sıralamasının tutarlı olduğunu kontrol eder.
 *
 * xpPct (2026-10-13 XP parity): bantlar 6+ için tek seferlik görev XP'si bandın ~%35'i. Bant 1-5 öğreticidir (%60'a kadar); bu
 * yüzden R1 (sq_r1_*) bölge görevleri bir basamak aşağı alındı (taban %2). Günlükler %5-8 bir seviye (`node tools/pace-check.mjs`).
 */

type Reward = { items?: { id: string; count: number }[]; generic?: NonNullable<QuestReward['generic']> };

interface Spec extends Reward {
  id: string;
  name: string;
  level: number;
  region: string;
  giver: string;
  turnIn?: string;
  prereq?: string;
  daily?: boolean;
  objectives: QuestObjective[];
  xpPct: number;
  goldPerLevel?: number;
  offer: string;
  progress: string;
  done: string;
}

const kill = (target: string, count: number, text: string): QuestObjective => ({ kind: 'kill', target, count, text });
const collect = (target: string, count: number, text: string): QuestObjective => ({ kind: 'collect', target, count, text });
/** collect with a named source: `count` items of `target` roll from the kills of the listed enemies (QuestSystem.rollDrops, collect rate). */
const collectFrom = (target: string, count: number, from: string[], text: string): QuestObjective => ({ kind: 'collect', target, count, from, text });
const metin = (target: string, count: number, text: string): QuestObjective => ({ kind: 'metin', target, count, text });
const talk = (target: string, text: string): QuestObjective => ({ kind: 'talk', target, count: 1, text });
const explore = (target: string, text: string): QuestObjective => ({ kind: 'explore', target, count: 1, text });
/** Av Mührü (daily currency, data/materials.ts av_muhru). */
const mu = (count: number): { id: string; count: number } => ({ id: 'av_muhru', count });

// ---------------------------------------------------------------------------------------------------------------------
// R1 Sisli Koru (lv 1-5). Verenler: Muhtar Ferhat, Avcı Yıldız, Çiftçi Hatice, Rahibe Meryem (Gümüşdere).
// ---------------------------------------------------------------------------------------------------------------------
const R1: Spec[] = [
  { id: 'sq_r1_k01_ambar_sicanlari', name: 'Ambar Sıçanları', level: 1, region: 'r1', giver: 'npc_g_ciftci', xpPct: 35, goldPerLevel: 1,
    objectives: [kill('ow_rat', 15, 'Orman Sıçanı öldür')],
    offer: 'Ambardaki sıçanlar buğdayın yarısını yedi. Onlar bitmeden sürüyü dağıt.', progress: 'Orman Sıçanı öldür (15).', done: 'Ambar yeniden güvende.' },
  { id: 'sq_r1_k02_balcik_avi', name: 'Balçık Avı', level: 2, region: 'r1', giver: 'npc_g_muhtar', xpPct: 31, goldPerLevel: 1,
    objectives: [kill('ow_slime', 10, 'Yeşil Balçık öldür')],
    offer: 'Göl kenarındaki yeşil balçıklar yollara yayıldı. On tanesini temizle.', progress: 'Yeşil Balçık öldür (10).', done: 'Yollar yeniden açık.' },
  { id: 'sq_r1_k03_goblin_yagmasi', name: 'Goblin Yağması', level: 3, region: 'r1', giver: 'npc_g_avci', xpPct: 10, goldPerLevel: 2,
    objectives: [kill('ow_goblin', 12, 'Goblin Yağmacı öldür')],
    offer: 'Goblin yağmacıları kervan yollarını soyuyor. Sürünün gücünü kır.', progress: 'Goblin Yağmacı öldür (12).', done: 'Kervanlar yeniden geçiyor.' },
  { id: 'sq_r1_k04_orman_kurtlari', name: 'Orman Kurtları', level: 3, region: 'r1', giver: 'npc_g_avci', xpPct: 10, goldPerLevel: 2,
    objectives: [kill('ow_wolf', 14, 'Orman Kurdu öldür')],
    offer: 'Orman kurtları sürü halinde dolaşıyor. Çobanlar korku içinde.', progress: 'Orman Kurdu öldür (14).', done: 'Çobanlar sürüleri yeniden otlatıyor.' },
  { id: 'sq_r1_k05_mantar_ormani', name: 'Mantar Ormanı Temizliği', level: 4, region: 'r1', giver: 'npc_o_gozcu', xpPct: 13, goldPerLevel: 2,
    objectives: [kill('ow_mushnub', 15, 'Mantarcık öldür')],
    offer: 'Mantarcıklar ormanın patikalarını kapatıyor. Onları kes ve patikayı aç.', progress: 'Mantarcık öldür (15).', done: 'Patikalar açıldı.' },
  { id: 'sq_r1_k06_kizgin_arilar', name: 'Kızgın Arılar', level: 4, region: 'r1', giver: 'npc_o_gozcu', xpPct: 12, goldPerLevel: 2,
    objectives: [kill('ow_wasp', 12, 'Orman Arısı öldür')],
    offer: 'Arılar bahçelere saldırıyor. Sürüyü dağıt, meyveler kurtulsun.', progress: 'Orman Arısı öldür (12).', done: 'Bahçeler yeniden sakin.' },
  { id: 'sq_r1_k07_domuz_avi', name: 'Domuz Avı', level: 4, region: 'r1', giver: 'npc_g_ciftci', xpPct: 9, goldPerLevel: 2,
    objectives: [kill('ow_boar', 10, 'Yaban Domuzu öldür')],
    offer: 'Yaban domuzları ekinleri ezip geçiyor. On tanesini avla.', progress: 'Yaban Domuzu öldür (10).', done: 'Ekinler kurtuldu.' },
  { id: 'sq_r1_k08_orumcek_yuvasi', name: 'Örümcek Yuvası', level: 5, region: 'r1', giver: 'npc_o_gozcu', xpPct: 16, goldPerLevel: 3,
    objectives: [kill('ow_spider', 10, 'Orman Örümceği öldür')],
    offer: 'Ormanın derinliklerinde örümcekler yuva kurdu. Yuvanın sahiplerini kes.', progress: 'Orman Örümceği öldür (10).', done: 'Yuva dağıldı.' },
  // shamans spawn only in level 3 camps (no level 4-6 shaman camp near the outpost): the quest hunts the goblins of the outer ring
  { id: 'sq_r1_k09_samanin_golgesi', name: 'Kutsal Yollar', level: 5, region: 'r1', giver: 'npc_o_gozcu', xpPct: 19, goldPerLevel: 3,
    objectives: [kill('ow_goblin', 9, 'Goblin Yağmacı öldür')],
    offer: 'Goblin sürüsü kutsal yolları bozuyor. Yağmacıları kır ve yolları yeniden kutsanabilir kıl.',
    progress: 'Goblin Yağmacı öldür (9).', done: 'Kutsal yollar yeniden açık.' },
  { id: 'sq_r1_c01_kulak_avcisi', name: 'Kulak Avcısı', level: 2, region: 'r1', giver: 'npc_g_avci', xpPct: 29, goldPerLevel: 2,
    objectives: [collectFrom('item_goblin_kulagi', 8, ['ow_goblin'], 'Goblin Kulağı topla')], items: [{ id: 'pot_hp_1', count: 2 }],
    offer: 'Ödül avcıları her goblin için bir kulak ister. Sekiz kulak getir.', progress: 'Goblin Kulağı topla (8).', done: 'Ödül avcıları memnun.' },
  { id: 'sq_r1_c02_bal_toplayicisi', name: 'Bal Toplayıcısı', level: 3, region: 'r1', giver: 'npc_g_ciftci', xpPct: 13, goldPerLevel: 2,
    objectives: [collectFrom('item_orman_balı', 6, ['ow_goblin'], 'Orman Balı topla')],
    offer: 'Goblin yağmacılar kovanların balını çalıp kamplarına taşıyor. Çaldıkları balı geri al.', progress: 'Goblinlerden Orman Balı topla (6).', done: 'Bal kavanozları dolu.' },
  { id: 'sq_r1_c03_sifali_mantar', name: 'Şifalı Mantar', level: 4, region: 'r1', giver: 'npc_g_rahibe', xpPct: 13, goldPerLevel: 2,
    objectives: [collect('item_mantar_sapi', 10, 'Şifalı Mantar Sapı topla')],
    offer: 'Şapelde merhem kalmadı. Mantarcıkların sapları işe yarar.', progress: 'Şifalı Mantar Sapı topla (10).', done: 'Merhemler hazır.' },
  { id: 'sq_r1_h01_kizil_kuyruk_avi', name: 'Kızıl Kuyruk Avı', level: 3, region: 'r1', giver: 'npc_g_avci', xpPct: 4, goldPerLevel: 3,
    objectives: [kill('rare_kizil_kuyruk', 1, 'Kızıl Kuyruk öldür')], generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: 'Kızıl Kuyruk adlı dev sıçan ambarları yağmalıyor. Onu avlayabilir misin?', progress: 'Kızıl Kuyruk öldür.', done: 'Ambarlar onun korkusundan kurtuldu.' },
  { id: 'sq_r1_h02_gumus_yele_avi', name: 'Gümüş Yele Avı', level: 4, region: 'r1', giver: 'npc_o_gozcu', xpPct: 5, goldPerLevel: 4,
    objectives: [kill('rare_gumus_yele', 1, 'Gümüş Yele öldür')], generic: [{ rarity: 'uncommon', slot: 'jewelry' }],
    offer: 'Gümüş Yele ormanın en hızlı kurdu. Yakalayıp kesmen gerek.', progress: 'Gümüş Yele öldür.', done: 'Yele artık ormanda dolaşmıyor.' },
  { id: 'sq_r1_m01_keder_metinleri', name: 'Keder Kristalleri', level: 5, region: 'r1', giver: 'npc_o_gozcu', xpPct: 15, goldPerLevel: 3,
    objectives: [metin('metin_keder', 3, 'Keder Metini yık')], items: [{ id: 'metin_kalintisi', count: 3 }],
    offer: 'Vadinin kara taşları birer birer kırılmalı. Keder Metinleri\'ni üç kez yık.', progress: 'Keder Metini yık (3).', done: 'Kristaller kırıldı, taşların gücü dağıldı. Kalıntılar senin.' },
  { id: 'sq_r1_ch01_muhtarin_haberi', name: 'Muhtarın Haberi', level: 2, region: 'r1', giver: 'npc_g_muhtar', turnIn: 'npc_g_avci', xpPct: 29, goldPerLevel: 1,
    objectives: [talk('npc_g_avci', 'Avcı Yıldız ile konuş')],
    offer: 'Goblin gözcüleri köyün çevresinde dolaşıyor. Bu haberi Avcı Yıldız\'a ilet.', progress: 'Avcı Yıldız ile konuş.', done: 'Avcı Yıldız haberi duydu. İşin devamı var.' },
  { id: 'sq_r1_ch02_gozcu_avi', name: 'Gözcü Avı', level: 2, region: 'r1', giver: 'npc_g_avci', prereq: 'sq_r1_ch01_muhtarin_haberi', xpPct: 31, goldPerLevel: 2,
    objectives: [kill('ow_goblin', 10, 'Goblin Gözcüsü öldür')],
    offer: 'Yol kenarındaki gözcüleri temizle ve bana geri dön.', progress: 'Goblin Gözcüsü öldür (10).', done: 'Yol kenarı temiz.' },
  { id: 'sq_r1_ch03_saman_raporu', name: 'Şaman Raporu', level: 4, region: 'r1', giver: 'npc_g_avci', turnIn: 'npc_g_muhtar', prereq: 'sq_r1_ch02_gozcu_avi', xpPct: 14, goldPerLevel: 4,
    objectives: [talk('npc_g_rahibe', 'Rahibe Meryem ile konuş')], items: [{ id: 'pot_hp_1', count: 3 }],
    offer: 'Rahibe Meryem goblin şamanının izlerini de duymak istiyor. Önce ona uğra, sonra Muhtar Ferhat\'a dön.',
    progress: 'Rahibe Meryem ile konuş, sonra Muhtar Ferhat\'a dön.', done: 'Gözcü raporu tamamlandı. Köy seni anıyor.' },
  { id: 'dq_r1_01_gunluk_orman_avi', name: 'Günlük Orman Avı', level: 2, region: 'r1', giver: 'npc_g_avci', daily: true, xpPct: 6, goldPerLevel: 2,
    objectives: [kill('ow_wolf', 8, 'Orman Kurdu öldür'), kill('ow_boar', 6, 'Yaban Domuzu öldür')], items: [mu(1)],
    offer: 'Orman kurtları ve domuzlar bugün de kalabalık. Hepsini kesmek için hazırlan.',
    progress: 'Orman Kurdu (8) ve Yaban Domuzu (6) öldür.', done: 'Bugünlük iş bitti. Yarın yeniden gel.' },
  { id: 'dq_r1_02_gunluk_goblin_devriyesi', name: 'Günlük Goblin Devriyesi', level: 3, region: 'r1', giver: 'npc_g_muhtar', daily: true, xpPct: 7, goldPerLevel: 2,
    objectives: [kill('ow_goblin', 10, 'Goblin Yağmacı öldür'), kill('ow_goblin_shaman', 1, 'Goblin Şamanı öldür')], items: [mu(2)],
    offer: 'Goblin devriyeleri her sabah yollara çıkıyor. Bugün de onları durdur.',
    progress: 'Goblin Yağmacı (10) ve Goblin Şamanı (1) öldür.', done: 'Devriye bozguna uğradı. Yarın yeniden gel.' },
  { id: 'dq_r1_03_gunluk_mantar_temizligi', name: 'Günlük Mantar Temizliği', level: 4, region: 'r1', giver: 'npc_o_gozcu', daily: true, xpPct: 6, goldPerLevel: 2,
    objectives: [kill('ow_mushnub', 10, 'Mantarcık öldür'), kill('ow_spider', 4, 'Orman Örümceği öldür')], items: [mu(1)],
    offer: 'Şapelin çevresi her gün mantar ve örümcek ağına bulanıyor. Bugünlük temizle.',
    progress: 'Mantarcık (10) ve Orman Örümceği (4) öldür.', done: 'Şapel bugünlük temiz. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// R2 Altın Tarlalar (lv 5-10). Verenler: Çiftçi Hatice, Rahibe Meryem, Avcı Yıldız (Gümüşdere).
// ---------------------------------------------------------------------------------------------------------------------
const R2: Spec[] = [
  { id: 'sq_r2_k01_korkuluk_isyani', name: 'Korkuluk İsyanı', level: 5, region: 'r2', giver: 'npc_g_ciftci', xpPct: 9, goldPerLevel: 3,
    objectives: [kill('ow_scarecrow', 14, 'Korkuluk öldür')],
    offer: 'Tarlalardaki korkuluklar bir gece yerinden kalktı. Hepsini yeniden çakıya bağla.', progress: 'Korkuluk öldür (14).', done: 'Tarlalar yeniden ekilebilir.' },
  { id: 'sq_r2_k02_tarla_domuzlari', name: 'Tarla Domuzları', level: 5, region: 'r2', giver: 'npc_g_ciftci', xpPct: 16, goldPerLevel: 3,
    objectives: [kill('ow_boar', 12, 'Yaban Domuzu öldür')],
    offer: 'Domuz sürüsü buğday tarlasının ortasına yerleşti. Onları oradan çıkar.', progress: 'Yaban Domuzu öldür (12).', done: 'Buğdaylar kurtuldu.' },
  { id: 'sq_r2_k03_curumus_koylular', name: 'Çürümüş Köylüler', level: 6, region: 'r2', giver: 'npc_g_rahibe', xpPct: 5, goldPerLevel: 3,
    objectives: [kill('ow_zombie', 15, 'Çürümüş Köylü öldür')],
    offer: 'Mezarlıktan kalkan köylüler kutsal toprağa yürüyor. Onları durdurmalısın.', progress: 'Çürümüş Köylü öldür (15).', done: 'Mezarlık yeniden huzurlu.' },
  { id: 'sq_r2_k04_magara_yarasalari', name: 'Mağara Yarasaları', level: 6, region: 'r2', giver: 'npc_g_rahibe', xpPct: 5, goldPerLevel: 3,
    objectives: [kill('ow_bat', 15, 'Mağara Yarasası öldür')],
    offer: 'Yarasalar eski kilisenin çatısına yuva kurdu. Gece uçuşlarını kes.', progress: 'Mağara Yarasası öldür (15).', done: 'Çatı sessiz.' },
  { id: 'sq_r2_k05_haydut_bozgunu', name: 'Haydut Bozgunu', level: 7, region: 'r2', giver: 'npc_g_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_bandit', 12, 'Haydut öldür')],
    offer: 'Haydutlar tarlaların kenarına kamp kurdu. Kampı bozguna uğrat.', progress: 'Haydut öldür (12).', done: 'Haydutlar kaçtı.' },
  { id: 'sq_r2_k06_puglin_baskini', name: 'Puglin Baskını', level: 7, region: 'r2', giver: 'npc_g_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_puglin', 10, 'Puglin Yağmacı öldür')],
    offer: 'Puglin yağmacılar tarla evlerini basıyor. On tanesini kes.', progress: 'Puglin Yağmacı öldür (10).', done: 'Tarla evleri yeniden güvende.' },
  { id: 'sq_r2_k07_takirdayan_kemikler', name: 'Takırdayan Kemikler', level: 8, region: 'r2', giver: 'npc_g_rahibe', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('skel_rattler', 10, 'Takırdayan İskelet öldür')],
    offer: 'Eski mezarlıkta takırdayan kemikler uyanmış. Dinlerine geri gönder.', progress: 'Takırdayan İskelet öldür (10).', done: 'Mezarlık yeniden sessiz.' },
  { id: 'sq_r2_k08_mantarcik_bahcesi', name: 'Mantarcık Bahçesi', level: 8, region: 'r2', giver: 'npc_g_ciftci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_mushnub', 12, 'Mantarcık öldür')],
    offer: 'Çiftçilerin bahçesine mantarcıklar sızdı. Bahçeyi geri al.', progress: 'Mantarcık öldür (12).', done: 'Bahçe yeniden bize ait.' },
  { id: 'sq_r2_k09_kurt_avcisi', name: 'Kurt Avcısı', level: 9, region: 'r2', giver: 'npc_g_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_wolf', 12, 'Orman Kurdu öldür')],
    offer: 'Kurtlar çobanların peşini bırakmıyor. Sürüyü avla ve dönüşte haber ver.', progress: 'Orman Kurdu öldür (12).', done: 'Kurtlar bozguna uğradı.' },
  { id: 'sq_r2_c01_mezar_tozu', name: 'Mezar Tozu', level: 6, region: 'r2', giver: 'npc_g_rahibe', xpPct: 5, goldPerLevel: 3,
    objectives: [collect('item_mezar_tozu', 10, 'Mezar Tozu topla')],
    offer: 'Çürümüş köylülerin mezarında kutsanmamış bir toz var. Bunu toplamam gerek.', progress: 'Mezar Tozu topla (10).', done: 'Toz kutsandı, mezar rahatladı.' },
  { id: 'sq_r2_c02_saman_demeti', name: 'Saman Demeti', level: 7, region: 'r2', giver: 'npc_g_ciftci', xpPct: 5, goldPerLevel: 3,
    objectives: [collectFrom('item_saman_cobani', 12, ['ow_scarecrow'], 'Saman Demeti topla')], items: [{ id: 'pot_hp_2', count: 2 }],
    offer: 'Korkuluklar yıkıldı, ahırda saman kalmadı. Bize saman demeti getir.', progress: 'Saman Demeti topla (12).', done: 'Ahır yeniden dolu.' },
  { id: 'sq_r2_c03_yarasa_kanatlari', name: 'Yarasa Kanatları', level: 8, region: 'r2', giver: 'npc_g_rahibe', xpPct: 5, goldPerLevel: 3,
    objectives: [collectFrom('item_yarasa_kanadi', 8, ['ow_bat'], 'Yarasa Kanadı topla')],
    offer: 'Şapelin kandilleri için yarasa kanadından zar lazım. Sekiz kanat getir.', progress: 'Yarasa Kanadı topla (8).', done: 'Kandiller yeniden yanıyor.' },
  { id: 'sq_r2_h01_buyuk_boz', name: 'Büyük Boz Avı', level: 9, region: 'r2', giver: 'npc_g_avci', xpPct: 9, goldPerLevel: 5,
    objectives: [kill('rare_buyuk_boz', 1, 'Büyük Boz öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Büyük Boz tarla yollarını ayılarla tuttu. Onu avla, yolu geri al.', progress: 'Büyük Boz öldür.', done: 'Yollar yeniden açık.' },
  { id: 'sq_r2_h02_mantar_ana', name: 'Mantar Ana', level: 9, region: 'r2', giver: 'npc_g_rahibe', xpPct: 9, goldPerLevel: 5,
    objectives: [kill('rare_mantar_ana', 1, 'Mantar Ana öldür')], generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: 'Mantar Ana bütün bahçeyi sardı. Kökünü kazımazsan köy yanacak.', progress: 'Mantar Ana öldür.', done: 'Bahçe nefes aldı.' },
  { id: 'sq_r2_m01_hirs_metinleri', name: 'Hırs Metinleri', level: 10, region: 'r2', giver: 'npc_g_avci', xpPct: 7, goldPerLevel: 4,
    objectives: [metin('metin_hirs', 3, 'Hırs Metini yık')], items: [{ id: 'metin_kalintisi', count: 3 }],
    offer: 'Tarlanın ortasındaki Hırs Metinleri altın gibi parlıyor ama kötü. Üç tanesini yık.', progress: 'Hırs Metini yık (3).', done: 'Metinler kırıldı.' },
  { id: 'sq_r2_ch01_hortlak_sesleri', name: 'Hortlak Sesleri', level: 5, region: 'r2', giver: 'npc_g_ciftci', turnIn: 'npc_g_rahibe', xpPct: 17, goldPerLevel: 1,
    objectives: [talk('npc_g_rahibe', 'Rahibe Meryem ile konuş')],
    offer: 'Geceleri mezarlıktan sesler geliyor. Rahibe Meryem\'e anlat.', progress: 'Rahibe Meryem ile konuş.', done: 'Rahibe işin ne olduğunu biliyor.' },
  { id: 'sq_r2_ch02_hortlak_temizligi', name: 'Hortlak Temizliği', level: 6, region: 'r2', giver: 'npc_g_rahibe', prereq: 'sq_r2_ch01_hortlak_sesleri', xpPct: 5, goldPerLevel: 3,
    objectives: [kill('ow_zombie', 10, 'Çürümüş Köylü öldür'), kill('ow_bat', 6, 'Mağara Yarasası öldür')],
    offer: 'Hortlakları ve yarasaları temizle. Kutsal su hazır.', progress: 'Çürümüş Köylü (10) ve Mağara Yarasası (6) öldür.', done: 'Mezarlık sessizleşti.' },
  { id: 'sq_r2_ch03_tarla_huzuru', name: 'Tarla Huzuru', level: 7, region: 'r2', giver: 'npc_g_rahibe', turnIn: 'npc_g_ciftci', prereq: 'sq_r2_ch02_hortlak_temizligi', xpPct: 7, goldPerLevel: 5,
    objectives: [talk('npc_g_ciftci', 'Çiftçi Hatice ile konuş')], items: [mu(2)],
    offer: 'Mezarlık temizlendi. Çiftçi Hatice\'ye haber ver, tarlalar yeniden ekilecek.', progress: 'Çiftçi Hatice ile konuş.', done: 'Tarlalar yeniden ekiliyor.' },
  { id: 'dq_r2_01_gunluk_hortlak', name: 'Günlük Hortlak Avı', level: 6, region: 'r2', giver: 'npc_g_rahibe', daily: true, xpPct: 6, goldPerLevel: 2,
    objectives: [kill('ow_zombie', 8, 'Çürümüş Köylü öldür'), kill('ow_bat', 6, 'Mağara Yarasası öldür')], items: [mu(1)],
    offer: 'Mezarlık her gece yeniden dolup taşıyor. Bugünlük temizle.', progress: 'Çürümüş Köylü (8) ve Mağara Yarasası (6) öldür.', done: 'Mezarlık bugünlük sakin. Yarın yeniden gel.' },
  { id: 'dq_r2_02_gunluk_haydut_kovalama', name: 'Günlük Haydut Kovalama', level: 7, region: 'r2', giver: 'npc_g_avci', daily: true, xpPct: 7, goldPerLevel: 2,
    objectives: [kill('ow_bandit', 8, 'Haydut öldür'), kill('ow_bandit_archer', 3, 'Haydut Okçusu öldür')], items: [mu(2)],
    offer: 'Haydutlar her gün başka bir tarlaya çıkıyor. Bugün de onları kovala.', progress: 'Haydut (8) ve Haydut Okçusu (3) öldür.', done: 'Tarlalar bugünlük güvende. Yarın yeniden gel.' },
  { id: 'dq_r2_03_gunluk_korkuluk', name: 'Günlük Korkuluk Nöbeti', level: 5, region: 'r2', giver: 'npc_g_ciftci', daily: true, xpPct: 5, goldPerLevel: 2,
    objectives: [kill('ow_scarecrow', 10, 'Korkuluk öldür')], items: [mu(1)],
    offer: 'Korkuluklar gece yeniden kalkıyor. Sabaha kadar onları indir.', progress: 'Korkuluk öldür (10).', done: 'Nöbet bitti. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// R3 Haydut Tepeleri (lv 10-15). Verenler: Komutan Aslan, Avcı Karaca (Kızılkaya Karakolu).
// ---------------------------------------------------------------------------------------------------------------------
const R3: Spec[] = [
  { id: 'sq_r3_k01_haydut_karakolu', name: 'Haydut Karakolu', level: 10, region: 'r3', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_bandit', 14, 'Haydut öldür')],
    offer: 'Tepelerdeki haydutlar Kızılkaya yolunu kesiyor. Karakolun askerlerini kes.', progress: 'Haydut öldür (14).', done: 'Yol yeniden bizim.' },
  { id: 'sq_r3_k02_okcu_avi', name: 'Okçu Avı', level: 10, region: 'r3', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_bandit_archer', 12, 'Haydut Okçusu öldür')],
    offer: 'Okçular kayalıkların arkasından vuruyor. Menzile sızıp onları indir.', progress: 'Haydut Okçusu öldür (12).', done: 'Kayalıklar yeniden güvenli.' },
  { id: 'sq_r3_k03_tepe_kurtlari', name: 'Tepe Kurtları', level: 11, region: 'r3', giver: 'npc_k_avci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_wolf', 16, 'Orman Kurdu öldür')],
    offer: 'Tepe kurtları çobanların sürülerine dadandı. On altı kurdu kes.', progress: 'Orman Kurdu öldür (16).', done: 'Sürüler yeniden otluyor.' },
  { id: 'sq_r3_k04_puglin_seferi', name: 'Puglin Seferi', level: 11, region: 'r3', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_puglin', 12, 'Puglin Yağmacı öldür')],
    offer: 'Puglin yağmacılar tepe yollarını ele geçirdi. Seferi başlat.', progress: 'Puglin Yağmacı öldür (12).', done: 'Puglinler dağıldı.' },
  { id: 'sq_r3_k05_pehlivanlar', name: 'Pehlivanların Sonu', level: 12, region: 'r3', giver: 'npc_k_komutan', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_bandit_brute', 4, 'Haydut Pehlivanı öldür'), kill('ow_bandit', 6, 'Haydut öldür')],
    offer: 'Haydut pehlivanları karakolu kurdu. Pehlivanları ve yandaşlarını kes.', progress: 'Haydut Pehlivanı (4) ve Haydut (6) öldür.', done: 'Karakol sessiz.' },
  { id: 'sq_r3_k06_dehset_kurtlari', name: 'Dehşet Kurtları', level: 13, region: 'r3', giver: 'npc_k_avci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_wolf_dire', 4, 'Dehşet Kurdu öldür')],
    offer: 'Dehşet kurtları sürünün başında. Dördünü kes, sürü dağılsın.', progress: 'Dehşet Kurdu öldür (4).', done: 'Sürü dağıldı.' },
  { id: 'sq_r3_k07_boz_ayilari', name: 'Boz Ayıları', level: 13, region: 'r3', giver: 'npc_k_komutan', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_bear', 3, 'Boz Ayı öldür')],
    offer: 'Boz ayılar kervanların yiyeceğini yağmalıyor. Üç ayıyı avla.', progress: 'Boz Ayı öldür (3).', done: 'Kervanlar yiyecekleriyle geçiyor.' },
  { id: 'sq_r3_k08_savas_kurtlari', name: 'Savaş Kurtları', level: 14, region: 'r3', giver: 'npc_k_avci', xpPct: 9, goldPerLevel: 6,
    objectives: [kill('ow_warg', 4, 'Savaş Kurdu öldür')],
    offer: 'Savaş kurtları tepenin sırtında av bekliyor. Dördünü indir.', progress: 'Savaş Kurdu öldür (4).', done: 'Tepe sırtı yeniden bizim.' },
  { id: 'sq_r3_k09_tepe_arilari', name: 'Tepe Arıları', level: 12, region: 'r3', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_wasp', 10, 'Orman Arısı öldür')],
    offer: 'Arılar haydutların eski kamplarını sardı. Sürüyü dağıt.', progress: 'Orman Arısı öldür (10).', done: 'Kamplar yeniden kullanılabilir.' },
  { id: 'sq_r3_c01_kurt_postu', name: 'Kürk Ticareti', level: 10, region: 'r3', giver: 'npc_k_avci', xpPct: 5, goldPerLevel: 4,
    objectives: [collectFrom('item_kurt_postu', 8, ['ow_wolf'], 'Kurt Postu topla')],
    offer: 'Kervancılar sağlam kurt postu istiyor. Sekiz post getir.', progress: 'Kurt Postu topla (8).', done: 'Kervancılar kürkleri aldı.' },
  { id: 'sq_r3_c02_haydut_ganimeti', name: 'Haydut Ganimeti', level: 12, region: 'r3', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 4,
    objectives: [collectFrom('item_haydut_kemeri', 6, ['ow_bandit', 'ow_bandit_archer'], 'Haydut Kemeri topla')],
    offer: 'Haydutların kemerlerinde karakol mührü var. Mühürleri bize getir.', progress: 'Haydut Kemeri topla (6).', done: 'Mühürler karakola teslim edildi.' },
  { id: 'sq_r3_c03_puglin_disleri', name: 'Puglin Dişleri', level: 13, region: 'r3', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [collectFrom('item_puglin_disi', 10, ['ow_puglin'], 'Puglin Dişi topla')],
    offer: 'Dişlerle silah ustaları iyi kolye yapar. On diş getir.', progress: 'Puglin Dişi topla (10).', done: 'Ustalar dişleri aldı.' },
  { id: 'sq_r3_h01_golge_alfa', name: 'Gölge Alfa Peşinde', level: 14, region: 'r3', giver: 'npc_k_avci', xpPct: 12, goldPerLevel: 6,
    objectives: [kill('rare_golge_alfa', 1, 'Gölge Alfa öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Gölge Alfa tepe yollarında kurt sürüsünü yönetiyor. Alfayı avla.', progress: 'Gölge Alfa öldür.', done: 'Sürü liderini kaybetti.' },
  { id: 'sq_r3_h02_demir_boynuz', name: 'Demir Boynuz', level: 14, region: 'r3', giver: 'npc_k_komutan', xpPct: 12, goldPerLevel: 6,
    objectives: [kill('rare_demir_boynuz', 1, 'Demir Boynuz öldür')], generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: 'Demir Boynuz gergedan sürüsünü tepeye çekti. Onu durdurmadan yol açılmaz.', progress: 'Demir Boynuz öldür.', done: 'Tepeler yeniden geçilebilir.' },
  { id: 'sq_r3_m01_nefret_metinleri', name: 'Nefret Metinleri', level: 15, region: 'r3', giver: 'npc_k_komutan', xpPct: 10, goldPerLevel: 6,
    objectives: [metin('metin_nefret', 3, 'Nefret Metini yık')], items: [{ id: 'metin_kalintisi', count: 4 }],
    offer: 'Tepenin zirvesindeki Nefret Metinleri tüm haydutları çağırıyor. Üç tanesini yık.', progress: 'Nefret Metini yık (3).', done: 'Zirve sessiz.' },
  { id: 'sq_r3_ch01_kervan_haberi', name: 'Kervan Haberi', level: 10, region: 'r3', giver: 'npc_k_komutan', turnIn: 'npc_k_avci', xpPct: 3, goldPerLevel: 2,
    objectives: [talk('npc_k_avci', 'Avcı Karaca ile konuş')],
    offer: 'Kervanlar tepelerdeki haydutlar yüzünden durdu. Avcı Karaca yol durumunu biliyor.', progress: 'Avcı Karaca ile konuş.', done: 'Karaca yolun haritasını çıkardı.' },
  { id: 'sq_r3_ch02_yol_temizligi', name: 'Yol Temizliği', level: 11, region: 'r3', giver: 'npc_k_avci', prereq: 'sq_r3_ch01_kervan_haberi', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_bandit', 12, 'Haydut öldür'), kill('ow_bandit_archer', 6, 'Haydut Okçusu öldür')],
    offer: 'Kervan yolunu tutan haydutları temizle.', progress: 'Haydut (12) ve Haydut Okçusu (6) öldür.', done: 'Kervan yolu açıldı.' },
  { id: 'sq_r3_ch03_yolun_acilisi', name: 'Yolun Açılışı', level: 12, region: 'r3', giver: 'npc_k_avci', turnIn: 'npc_k_komutan', prereq: 'sq_r3_ch02_yol_temizligi', xpPct: 10, goldPerLevel: 6,
    objectives: [talk('npc_k_komutan', 'Komutan Aslan ile konuş')], items: [{ id: 'pot_hp_2', count: 3 }],
    offer: 'Yol açıldı. Komutan Aslan\'a bu haberi götür.', progress: 'Komutan Aslan ile konuş.', done: 'Kervanlar yeniden Kızılkaya\'ya geliyor.' },
  { id: 'dq_r3_01_gunluk_kurt', name: 'Günlük Kurt Avı', level: 11, region: 'r3', giver: 'npc_k_avci', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('ow_wolf', 10, 'Orman Kurdu öldür'), kill('ow_wolf_dire', 1, 'Dehşet Kurdu öldür')], items: [mu(2)],
    offer: 'Tepe kurtları her gün çobanlara saldırıyor. Bugün de sürüyü dağıt.', progress: 'Orman Kurdu (10) ve Dehşet Kurdu (1) öldür.', done: 'Sürü bugünlük dağıldı. Yarın yeniden gel.' },
  { id: 'dq_r3_02_gunluk_puglin', name: 'Günlük Puglin Devriyesi', level: 10, region: 'r3', giver: 'npc_k_komutan', daily: true, xpPct: 6, goldPerLevel: 2,
    objectives: [kill('ow_puglin', 8, 'Puglin Yağmacı öldür'), kill('ow_bandit', 6, 'Haydut öldür')], items: [mu(1)],
    offer: 'Karakolun devriyesi her gün puglin ve haydutla çatışıyor. Bugün de devriye at.', progress: 'Puglin Yağmacı (8) ve Haydut (6) öldür.', done: 'Devriye bugünlük tamam. Yarın yeniden gel.' },
  { id: 'dq_r3_03_gunluk_kervan_korumasi', name: 'Günlük Kervan Koruması', level: 12, region: 'r3', giver: 'npc_k_avci', daily: true, xpPct: 8, goldPerLevel: 3,
    objectives: [kill('ow_bandit_archer', 6, 'Haydut Okçusu öldür'), kill('ow_bandit_brute', 1, 'Haydut Pehlivanı öldür')], items: [mu(2)],
    offer: 'Bir kervan bugün yola çıkıyor. Okçuları ve pehlivanı indir ki güvenle geçsin.', progress: 'Haydut Okçusu (6) ve Haydut Pehlivanı (1) öldür.', done: 'Kervan güvenle geçti. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// R4 Ağıt Bataklığı (lv 15-20). Verenler: Avcı Karaca, Komutan Aslan (Kızılkaya, bataklık yönü).
// ---------------------------------------------------------------------------------------------------------------------
const R4: Spec[] = [
  { id: 'sq_r4_k01_gulyabani_surusu', name: 'Gulyabani Sürüsü', level: 15, region: 'r4', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_ghoul', 15, 'Bataklık Gulyabanisi öldür')],
    offer: 'Gulyabaniler bataklık kenarındaki köylere yürüyor. Sürüyü geri çevir.', progress: 'Bataklık Gulyabanisi öldür (15).', done: 'Köy kenarları güvende.' },
  { id: 'sq_r4_k02_sonmeyen_isiklar', name: 'Sönmeyen Işıklar', level: 16, region: 'r4', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_will', 14, 'Bataklık Işığı öldür')],
    offer: 'Bataklıktaki ışıklar sönmüyor. Patlamalarından uzak durarak söndür.', progress: 'Bataklık Işığı öldür (14).', done: 'Işıklar söndü.' },
  { id: 'sq_r4_k03_camur_yiginlari', name: 'Çamur Yığınları', level: 16, region: 'r4', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_ooze', 12, 'Bataklık Çamuru öldür')],
    offer: 'Çamur yığınları yolu kapatıyor. Hepsini dağıt, kanal açılsın.', progress: 'Bataklık Çamuru öldür (12).', done: 'Kanal açıldı.' },
  { id: 'sq_r4_k04_agit_hortlaklari', name: 'Ağıt Hortlakları', level: 17, region: 'r4', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_wraith', 12, 'Ağıt Hortlağı öldür')],
    offer: 'Ağıt hortlakları gece yürüyüşlerine başladı. Onları gün doğmadan bitir.', progress: 'Ağıt Hortlağı öldür (12).', done: 'Hortlaklar dinlendi.' },
  { id: 'sq_r4_k05_batak_arilari', name: 'Bataklık Arıları', level: 17, region: 'r4', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_wasp_swamp', 11, 'Bataklık Arısı öldür')],
    offer: 'Bataklık arıları kamp yerlerini bastı. Sürüyü temizle.', progress: 'Bataklık Arısı öldür (11).', done: 'Kamp yerleri güvende.' },
  { id: 'sq_r4_k06_dev_orumcekler', name: 'Dev Örümcekler', level: 18, region: 'r4', giver: 'npc_k_avci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_spider_giant', 4, 'Dev Örümcek öldür'), kill('ow_spider', 4, 'Orman Örümceği öldür')],
    offer: 'Dev örümcekler mağara girişine ağ örüyor. Yuvayı kır.', progress: 'Dev Örümcek (4) ve Örümcek (4) öldür.', done: 'Mağara girişi temiz.' },
  { id: 'sq_r4_k07_curuk_yuva', name: 'Çürük Yuva', level: 18, region: 'r4', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_centipede', 10, 'Çürük Çıyanı öldür')],
    offer: 'Toprak çukurlarında çıyanlar üredi. Çukuru çıyanlardan arındır.', progress: 'Çürük Çıyanı öldür (10).', done: 'Çukur sessiz.' },
  { id: 'sq_r4_k08_takirdayan_bekciler', name: 'Takırdayan Bekçiler', level: 19, region: 'r4', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 6,
    objectives: [kill('skel_rattler', 8, 'Takırdayan İskelet öldür')],
    offer: 'Eski bekçi kulesinin iskeletleri hâlâ nöbette. Nöbeti sona erdir.', progress: 'Takırdayan İskelet öldür (8).', done: 'Kule yeniden bizim.' },
  { id: 'sq_r4_k09_agit_kusatmasi', name: 'Ağıt Kuşatması', level: 19, region: 'r4', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 6,
    objectives: [kill('ow_wraith', 8, 'Ağıt Hortlağı öldür'), kill('ow_ghoul', 10, 'Bataklık Gulyabanisi öldür')],
    offer: 'Hortlaklar ve gulyabaniler birlikte kuşatma kurdu. İkisini de kır.',
    progress: 'Ağıt Hortlağı (8) ve Bataklık Gulyabanisi (10) öldür.', done: 'Kuşatma dağıldı.' },
  { id: 'sq_r4_c01_camur_kesesi', name: 'Çamur Kesesi', level: 15, region: 'r4', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 4,
    objectives: [collectFrom('item_camur_kesesi', 8, ['ow_ooze'], 'Çamur Kesesi topla')],
    offer: 'Simyacılar çamurun içindeki zehirli keseleri istiyor. Sekiz kese getir.', progress: 'Çamur Kesesi topla (8).', done: 'Simyacılar keseleri aldı.' },
  { id: 'sq_r4_c02_hortlak_parcalari', name: 'Hortlak Parçaları', level: 17, region: 'r4', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 5,
    objectives: [collectFrom('item_hortlak_parcasi', 10, ['ow_ghoul', 'ow_wraith'], 'Hortlak Parçası topla')],
    offer: 'Hortlakların parçaları ruhları bağlamakta kullanılır. On parça topla.', progress: 'Hortlak Parçası topla (10).', done: 'Parçalar mühürlendi.' },
  { id: 'sq_r4_c03_ciyan_kabuklari', name: 'Çıyan Kabukları', level: 18, region: 'r4', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [collectFrom('item_ciyan_kabugu', 6, ['ow_centipede'], 'Çıyan Kabuğu topla')], items: [{ id: 'pot_hp_2', count: 2 }],
    offer: 'Çıyan kabuklarından iksir yapılır. Altı kabuk getir.', progress: 'Çıyan Kabuğu topla (6).', done: 'Eczacı memnun kaldı.' },
  { id: 'sq_r4_h01_camur_baba', name: 'Çamur Baba\'yı Avla', level: 17, region: 'r4', giver: 'npc_k_avci', xpPct: 10, goldPerLevel: 7,
    objectives: [kill('rare_camur_baba', 1, 'Çamur Baba öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Çamur Baba bataklığın ortasındaki adada yaşıyor. Onu yenmeden kanal açılmaz.', progress: 'Çamur Baba öldür.', done: 'Bataklık sakinleşti.' },
  { id: 'sq_r4_h02_zehir_ana', name: 'Zehir Ana\'nın Yuvası', level: 19, region: 'r4', giver: 'npc_k_avci', xpPct: 11, goldPerLevel: 7,
    objectives: [kill('rare_zehir_ana', 1, 'Zehir Ana öldür')], generic: [{ rarity: 'rare', slot: 'jewelry' }],
    offer: 'Zehir Ana mağaranın dibinde yumurtalarını koruyor. Yuvayı kırmadan dönme.', progress: 'Zehir Ana öldür.', done: 'Yuva yok oldu.' },
  { id: 'sq_r4_m01_aci_metinleri', name: 'Acı Metinleri', level: 20, region: 'r4', giver: 'npc_k_komutan', xpPct: 9, goldPerLevel: 7,
    objectives: [metin('metin_aci', 3, 'Acı Metini yık')], items: [{ id: 'metin_kalintisi', count: 5 }],
    offer: 'Bataklığın kıyısındaki Acı Metinleri zehir saçıyor. Üç tanesini yık.', progress: 'Acı Metini yık (3).', done: 'Zehir dağıldı.' },
  { id: 'sq_r4_ch01_isiklarin_haberi', name: 'Işıkların Haberi', level: 15, region: 'r4', giver: 'npc_k_avci', turnIn: 'npc_k_komutan', xpPct: 4, goldPerLevel: 2,
    objectives: [talk('npc_k_komutan', 'Komutan Aslan ile konuş')],
    offer: 'Bataklıkta yanıp sönen ışıklar köyü tedirgin ediyor. Komutan Aslan\'a bildir.', progress: 'Komutan Aslan ile konuş.', done: 'Komutan bataklığın durumunu biliyor.' },
  { id: 'sq_r4_ch02_bataklik_taramasi', name: 'Bataklık Taraması', level: 16, region: 'r4', giver: 'npc_k_komutan', prereq: 'sq_r4_ch01_isiklarin_haberi', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_will', 10, 'Bataklık Işığı öldür'), kill('ow_ghoul', 8, 'Bataklık Gulyabanisi öldür')],
    offer: 'Bataklığı tara. Işıkları ve gulyabanileri temizle.', progress: 'Bataklık Işığı (10) ve Bataklık Gulyabanisi (8) öldür.', done: 'Bataklık taranmış.' },
  { id: 'sq_r4_ch03_iz_surme', name: 'İz Sürme', level: 17, region: 'r4', giver: 'npc_k_komutan', turnIn: 'npc_k_avci', prereq: 'sq_r4_ch02_bataklik_taramasi', xpPct: 9, goldPerLevel: 7,
    objectives: [talk('npc_k_avci', 'Avcı Karaca ile konuş')], items: [mu(2)],
    offer: 'Bataklıktaki izler bir yere çıkıyor. Avcı Karaca\'ya götür.', progress: 'Avcı Karaca ile konuş.', done: 'Karaca izleri inceledi, iş bitti.' },
  { id: 'dq_r4_01_gunluk_gulyabani', name: 'Günlük Gulyabani Avı', level: 16, region: 'r4', giver: 'npc_k_avci', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('ow_ghoul', 12, 'Bataklık Gulyabanisi öldür')], items: [mu(2)],
    offer: 'Gulyabaniler her gece bataklıktan çıkıyor. Bugün sayıyı düşür.', progress: 'Bataklık Gulyabanisi öldür (12).', done: 'Bugünlük yeter. Yarın yeniden gel.' },
  { id: 'dq_r4_02_gunluk_isik_avi', name: 'Günlük Işık Avı', level: 17, region: 'r4', giver: 'npc_k_komutan', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('ow_will', 10, 'Bataklık Işığı öldür'), kill('ow_wraith', 4, 'Ağıt Hortlağı öldür')], items: [mu(2)],
    offer: 'Işıklar ve hortlaklar bugün de ortalığı karıştırdı. Patlamalardan kaçarak temizle.', progress: 'Bataklık Işığı (10) ve Ağıt Hortlağı (4) öldür.', done: 'Bataklık bugünlük sakin. Yarın yeniden gel.' },
  { id: 'dq_r4_03_gunluk_camur', name: 'Günlük Çamur Temizliği', level: 15, region: 'r4', giver: 'npc_k_avci', daily: true, xpPct: 6, goldPerLevel: 2,
    objectives: [kill('ow_ooze', 8, 'Bataklık Çamuru öldür'), kill('ow_centipede', 4, 'Çürük Çıyanı öldür')], items: [mu(1)],
    offer: 'Çamur ve çıyanlar kamp yerine sızıyor. Bugünlük onları temizle.', progress: 'Bataklık Çamuru (8) ve Çürük Çıyanı (4) öldür.', done: 'Kamp bugünlük güvende. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// R5 Ork Kanyonu (lv 20-25). Verenler: Komutan Aslan, Avcı Karaca (Kızılkaya).
// ---------------------------------------------------------------------------------------------------------------------
const R5: Spec[] = [
  { id: 'sq_r5_k01_ork_savaslilari', name: 'Ork Savaşçıları', level: 20, region: 'r5', giver: 'npc_k_komutan', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_orc', 16, 'Ork Savaşçısı öldür')],
    offer: 'Orklar kanyonun girişini tutuyor. Savaşçılarını bir bir kes.', progress: 'Ork Savaşçısı öldür (16).', done: 'Kanyon girişi açık.' },
  { id: 'sq_r5_k02_firlatici_avi', name: 'Fırlatıcı Avı', level: 20, region: 'r5', giver: 'npc_k_avci', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_orc_archer', 6, 'Ork Fırlatıcısı öldür'), kill('ow_orc', 6, 'Ork Savaşçısı öldür')],
    offer: 'Fırlatıcılar kayalıklardan zıpkın yağdırıyor. Fırlatıcıları ve yanlarındakileri indir.', progress: 'Ork Fırlatıcısı (6) ve Ork Savaşçısı (6) öldür.', done: 'Kayalıklar temiz.' },
  { id: 'sq_r5_k03_ork_samanlari', name: 'Ork Şamanları', level: 21, region: 'r5', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_orc_shaman', 6, 'Ork Şamanı öldür')],
    offer: 'Ork şamanları ateş ritüeli yapıyor. Ritüel bitmeden sustur.', progress: 'Ork Şamanı öldür (6).', done: 'Ateş söndü.' },
  { id: 'sq_r5_k04_kanyon_iblisleri', name: 'Kanyon İblisleri', level: 21, region: 'r5', giver: 'npc_k_avci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('ow_imp', 12, 'Kanyon İblisçiği öldür')],
    offer: 'İblisçikler kanyonun çatlaklarından fırlıyor. Hepsini geri gönder.', progress: 'Kanyon İblisçiği öldür (12).', done: 'Çatlaklar kapandı.' },
  { id: 'sq_r5_k05_kanyon_vahsileri', name: 'Kanyon Vahşileri', level: 22, region: 'r5', giver: 'npc_k_avci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_bear', 3, 'Boz Ayı öldür'), kill('ow_boar', 3, 'Yaban Domuzu öldür')],
    offer: 'Kanyonun vahşi ayıları ve domuzları yolcuları dağıtıyor. Onları avla.', progress: 'Boz Ayı (3) ve Yaban Domuzu (3) öldür.', done: 'Yollar yeniden yolcularla dolu.' },
  { id: 'sq_r5_k06_cellatlar', name: 'Cellatların Sonu', level: 23, region: 'r5', giver: 'npc_k_komutan', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_orc_brute', 3, 'Ork Cellatı öldür'), kill('ow_orc', 8, 'Ork Savaşçısı öldür')],
    offer: 'Ork cellatları esir kamplarını yakıyor. Cellatları ve savaşçılarını durdur.', progress: 'Ork Cellatı (3) ve Ork Savaşçısı (8) öldür.', done: 'Esirler kurtuldu.' },
  { id: 'sq_r5_k07_kor_elementalleri', name: 'Kor Elementalleri', level: 23, region: 'r5', giver: 'npc_k_avci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_ember', 5, 'Kor Elementali öldür')],
    offer: 'Kor elementalleri kanyon tabanını yakıyor. Beş elementali söndür.', progress: 'Kor Elementali öldür (5).', done: 'Kanyon tabanı soğudu.' },
  { id: 'sq_r5_k08_kanyon_kurtlari', name: 'Kanyon Kurtları', level: 22, region: 'r5', giver: 'npc_k_komutan', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('ow_warg', 5, 'Savaş Kurdu öldür'), kill('ow_orc', 4, 'Ork Savaşçısı öldür')],
    offer: 'Savaş kurtları orklarla birlikte avlanıyor. Sürüyü ve orkları birlikte kes.', progress: 'Savaş Kurdu (5) ve Ork Savaşçısı (4) öldür.', done: 'Kanyon sürüsü dağıldı.' },
  { id: 'sq_r5_k09_golem_yikimi', name: 'Golem Yıkımı', level: 24, region: 'r5', giver: 'npc_k_avci', xpPct: 8, goldPerLevel: 7,
    objectives: [kill('ow_golem', 2, 'Kanyon Golemi öldür'), kill('ow_imp', 6, 'Kanyon İblisçiği öldür')],
    offer: 'Taş ocağında iki golem uyandı. Onları ve yanlarındaki iblisleri yık.', progress: 'Kanyon Golemi (2) ve Kanyon İblisçiği (6) öldür.', done: 'Taş ocağı sessiz.' },
  { id: 'sq_r5_c01_ork_kemikleri', name: 'Ork Kemikleri', level: 20, region: 'r5', giver: 'npc_k_avci', xpPct: 5, goldPerLevel: 4,
    objectives: [collectFrom('item_ork_kemigi', 12, ['ow_orc'], 'Ork Kemiği topla')],
    offer: 'Kanyon köprüsünü onarmak için ork kemikleri kullanılıyor. On iki kemik getir.', progress: 'Ork Kemiği topla (12).', done: 'Köprü onarılıyor.' },
  { id: 'sq_r5_c02_kor_kristalleri', name: 'Kor Kristalleri', level: 22, region: 'r5', giver: 'npc_k_komutan', xpPct: 7, goldPerLevel: 5,
    objectives: [collectFrom('item_kor_kristali', 6, ['ow_imp'], 'Kor Kristali topla')],
    offer: 'Kor kristalleri sıcak tutar ve silahları ateşler. Altı kristal getir.', progress: 'Kor Kristali topla (6).', done: 'Kristaller işlenmek üzere alındı.' },
  { id: 'sq_r5_c03_tas_parcalari', name: 'Taş Parçaları', level: 23, region: 'r5', giver: 'npc_k_avci', xpPct: 7, goldPerLevel: 5,
    objectives: [collectFrom('item_tas_parcasi', 6, ['ow_orc', 'ow_orc_archer'], 'Kanyon Taş Parçası topla')], items: [{ id: 'pot_hp_2', count: 2 }],
    offer: 'Golemlerin taşları ocak onarımında işe yarar. Altı parça getir.', progress: 'Kanyon Taş Parçası topla (6).', done: 'Ocak onarıldı.' },
  { id: 'sq_r5_h01_kor_efendisi', name: 'Kor Efendisi', level: 24, region: 'r5', giver: 'npc_k_komutan', xpPct: 12, goldPerLevel: 8,
    objectives: [kill('rare_kor_efendisi', 1, 'Kor Efendisi öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: 'Kor Efendisi kanyonun en derin çatlağında alevleniyor. Onu söndür.', progress: 'Kor Efendisi öldür.', done: 'Çatlak sönük.' },
  { id: 'sq_r5_h02_tas_yurek', name: 'Taş Yürek\'i Kır', level: 24, region: 'r5', giver: 'npc_k_avci', xpPct: 12, goldPerLevel: 8,
    objectives: [kill('rare_tas_yurek', 1, 'Taş Yürek öldür')], generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: 'Taş Yürek kanyon geçidini kapatan dev bir golem. Kalbini kır.', progress: 'Taş Yürek öldür.', done: 'Geçit açık.' },
  { id: 'sq_r5_m01_ofke_metinleri', name: 'Öfke Metinleri', level: 25, region: 'r5', giver: 'npc_k_komutan', xpPct: 10, goldPerLevel: 7,
    objectives: [metin('metin_ofke', 3, 'Öfke Metini yık')], items: [{ id: 'metin_kalintisi', count: 5 }],
    offer: 'Kanyonun kızgın taşları öfkeyle titriyor. Üç Öfke Metini\'ni kır.', progress: 'Öfke Metini yık (3).', done: 'Öfke dindi.' },
  { id: 'sq_r5_ch01_kanyon_izleri', name: 'Kanyon İzleri', level: 20, region: 'r5', giver: 'npc_k_komutan', turnIn: 'npc_k_avci', xpPct: 3, goldPerLevel: 2,
    objectives: [talk('npc_k_avci', 'Avcı Karaca ile konuş')],
    offer: 'Kanyondan ork izleri geliyor. Avcı Karaca bu izleri biliyor.', progress: 'Avcı Karaca ile konuş.', done: 'Karaca izleri inceledi.' },
  { id: 'sq_r5_ch02_gecit_savasi', name: 'Geçit Savaşı', level: 21, region: 'r5', giver: 'npc_k_avci', prereq: 'sq_r5_ch01_kanyon_izleri', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_orc', 12, 'Ork Savaşçısı öldür'), kill('ow_orc_archer', 6, 'Ork Fırlatıcısı öldür')],
    offer: 'Geçitteki orkları püskürt. Fırlatıcılar kaçmadan önce indir.', progress: 'Ork Savaşçısı (12) ve Ork Fırlatıcısı (6) öldür.', done: 'Geçit tutuldu.' },
  { id: 'sq_r5_ch03_kanyon_raporu', name: 'Kanyon Raporu', level: 22, region: 'r5', giver: 'npc_k_avci', turnIn: 'npc_k_komutan', prereq: 'sq_r5_ch02_gecit_savasi', xpPct: 9, goldPerLevel: 8,
    objectives: [talk('npc_k_komutan', 'Komutan Aslan ile konuş')], items: [mu(2)],
    offer: 'Geçit tutuldu. Komutan Aslan\'a kanyonun raporunu ver.', progress: 'Komutan Aslan ile konuş.', done: 'Kanyon raporu kayda geçti.' },
  { id: 'dq_r5_01_gunluk_ork', name: 'Günlük Ork Baskını', level: 21, region: 'r5', giver: 'npc_k_komutan', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('ow_orc', 12, 'Ork Savaşçısı öldür')], items: [mu(2)],
    offer: 'Orklar her gece geçide yeniden sızıyor. Bugün de onları püskürt.', progress: 'Ork Savaşçısı öldür (12).', done: 'Geçit bugünlük güvende. Yarın yeniden gel.' },
  { id: 'dq_r5_02_gunluk_iblis', name: 'Günlük İblis Avı', level: 22, region: 'r5', giver: 'npc_k_avci', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('ow_imp', 8, 'Kanyon İblisçiği öldür'), kill('ow_ember', 1, 'Kor Elementali öldür')], items: [mu(2)],
    offer: 'İblisler ve bir kor elementali bugün de çatlaklardan çıktı. Hepsini geri gönder.', progress: 'Kanyon İblisçiği (8) ve Kor Elementali (1) öldür.', done: 'Çatlaklar bugünlük kapalı. Yarın yeniden gel.' },
  { id: 'dq_r5_03_gunluk_sahman', name: 'Günlük Şaman Avı', level: 20, region: 'r5', giver: 'npc_k_avci', daily: true, xpPct: 6, goldPerLevel: 3,
    objectives: [kill('ow_orc_shaman', 4, 'Ork Şamanı öldür'), kill('ow_orc_archer', 4, 'Ork Fırlatıcısı öldür')], items: [mu(1)],
    offer: 'Şamanlar ve fırlatıcılar her gün yeni bir ritüel deniyor. Bugün de bozmalısın.', progress: 'Ork Şamanı (4) ve Ork Fırlatıcısı (4) öldür.', done: 'Ritüel bozuldu. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// R6 Lanetli Harabeler (lv 25-30). Veren: Nöbetçi Başı Talha (Son Ocak Kampı); zincirin teslimi Kuzgunkale'de Muhtar Cemal.
// ---------------------------------------------------------------------------------------------------------------------
const R6: Spec[] = [
  { id: 'sq_r6_k01_iskelet_askerleri', name: 'İskelet Askerleri', level: 25, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('skel_minion', 14, 'İskelet Er öldür')],
    offer: 'Harabelerdeki iskelet erleri yeniden sıraya girdi. Nöbet yerlerini geri al.', progress: 'İskelet Er öldür (14).', done: 'Nöbet yerleri geri alındı.' },
  { id: 'sq_r6_k02_takirdayan_surusu', name: 'Takırdayan Sürüsü', level: 25, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('skel_rattler', 15, 'Takırdayan İskelet öldür')],
    offer: 'Takırdayan iskeletler gece sesleriyle nöbetçileri uyutmuyor. Sürüyü sus.', progress: 'Takırdayan İskelet öldür (15).', done: 'Harabe sessizleşti.' },
  { id: 'sq_r6_k03_buyucu_ve_okcular', name: 'Büyücüler ve Okçular', level: 26, region: 'r6', giver: 'npc_s_nobetci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('skel_mage', 5, 'Kemik Büyücüsü öldür'), kill('skel_archer', 4, 'İskelet Okçu öldür')],
    offer: 'Kemik büyücüleri ve okçular kuleden ateş yağdırıyor. Kuleyi boşalt.', progress: 'Kemik Büyücüsü (5) ve İskelet Okçu (4) öldür.', done: 'Kule yeniden bizim.' },
  { id: 'sq_r6_k04_mahzen_gulyabanileri', name: 'Mahzen Gulyabanileri', level: 26, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 6,
    objectives: [kill('crypt_ghoul', 4, 'Gulyabani öldür'), kill('crypt_wraith', 3, 'Mahzen Hortlağı öldür')],
    offer: 'Mahzenlerden gulyabaniler ve hortlaklar çıkıyor. Mahzenin girişini kapat.', progress: 'Gulyabani (4) ve Mahzen Hortlağı (3) öldür.', done: 'Mahzen kapandı.' },
  { id: 'sq_r6_k05_tarikat_muritleri', name: 'Tarikat Müritleri', level: 27, region: 'r6', giver: 'npc_s_nobetci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('cult_acolyte', 12, 'Tarikat Müridi öldür')],
    offer: 'Kara Tarikat müritleri harabede ayin yapıyor. Müritleri ayinin ortasında kes.', progress: 'Tarikat Müridi öldür (12).', done: 'Ayin bozuldu.' },
  { id: 'sq_r6_k06_golge_avi', name: 'Gölge Avı', level: 27, region: 'r6', giver: 'npc_s_nobetci', xpPct: 8, goldPerLevel: 6,
    objectives: [kill('shade', 12, 'Gölge öldür')],
    offer: 'Gölgeler harabe duvarlarının arasında dolaşıyor. On ikisini dağıt.', progress: 'Gölge öldür (12).', done: 'Duvarlar yeniden aydınlık.' },
  { id: 'sq_r6_k07_golge_suikastcilari', name: 'Gölge Suikastçıları', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 9, goldPerLevel: 7,
    objectives: [kill('cult_assassin', 7, 'Gölge Suikastçısı öldür'), kill('shadow_priest', 2, 'Gölge Rahibi öldür')],
    offer: 'Suikastçılar nöbetçileri tek tek avlıyor. Suikastçıları ve rahipleri yakala.', progress: 'Gölge Suikastçısı (7) ve Gölge Rahibi (2) öldür.', done: 'Nöbetçiler güvende.' },
  { id: 'sq_r6_k08_mezar_sovalyeleri', name: 'Mezar Şövalyeleri', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 9, goldPerLevel: 7,
    objectives: [kill('ow_grave_knight', 5, 'Mezar Şövalyesi öldür')],
    offer: 'Mezar şövalyeleri ölümsüz nöbetlerine devam ediyor. Beş şövalyeyi yere ser.', progress: 'Mezar Şövalyesi öldür (5).', done: 'Mezarlar huzura kavuştu.' },
  { id: 'sq_r6_k09_harabe_yarasalari', name: 'Harabe Yarasaları', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 6, goldPerLevel: 5,
    objectives: [kill('ow_bat', 10, 'Mağara Yarasası öldür')],
    offer: 'Harabenin çatısı yarasalarla dolu. Gece uçuşlarını kes.', progress: 'Mağara Yarasası öldür (10).', done: 'Çatı sessiz.' },
  { id: 'sq_r6_c01_kirik_kemikler', name: 'Kırık Kemikler', level: 25, region: 'r6', giver: 'npc_s_nobetci', xpPct: 6, goldPerLevel: 5,
    objectives: [collectFrom('item_kirik_kemik', 12, ['skel_minion', 'skel_rattler'], 'Kırık Kemik topla')],
    offer: 'Nöbet kulesinin duvarlarını kırık kemiklerle yeniden örmek gerek. On iki kemik getir.', progress: 'Kırık Kemik topla (12).', done: 'Duvarlar onarılıyor.' },
  { id: 'sq_r6_c02_tarikat_muhurleri', name: 'Tarikat Mühürleri', level: 27, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 6,
    objectives: [collectFrom('item_tarikat_muhru', 6, ['cult_acolyte', 'cult_summoner'], 'Tarikat Mührü topla')],
    offer: 'Müritlerin mühürleri tarikatın kanıtı. Altı mühür getir.', progress: 'Tarikat Mührü topla (6).', done: 'Mühürler kanıt olarak kaydedildi.' },
  { id: 'sq_r6_c03_golge_ozu', name: 'Gölge Özü', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 6,
    objectives: [collectFrom('item_golge_ozu', 8, ['shade', 'crypt_wraith'], 'Gölge Özü topla')],
    offer: 'Gölgeler öldüğünde bir öz bırakır. Sekiz öz topla, tılsım yapacağız.', progress: 'Gölge Özü topla (8).', done: 'Tılsım hazır.' },
  { id: 'sq_r6_h01_kemik_kral', name: 'Kemik Kral Hargar', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 13, goldPerLevel: 9,
    objectives: [kill('rare_kemik_kral', 1, 'Kemik Kral Hargar öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: 'Kemik Kral Hargar harabenin kalbinde tahtında oturuyor. Tahtını yık.', progress: 'Kemik Kral Hargar öldür.', done: 'Harabe özgür.' },
  { id: 'sq_r6_h02_sessiz_rahip', name: 'Sessiz Rahip', level: 28, region: 'r6', giver: 'npc_s_nobetci', xpPct: 13, goldPerLevel: 9,
    objectives: [kill('rare_sessiz_rahip', 1, 'Sessiz Rahip öldür')], generic: [{ rarity: 'rare', slot: 'jewelry' }],
    offer: 'Sessiz Rahip tarikatın son ayinini yönetiyor. Ayini yarıda kes.', progress: 'Sessiz Rahip öldür.', done: 'Ayin yarıda kaldı.' },
  { id: 'sq_r6_m01_olum_metinleri', name: 'Ölüm Metinleri', level: 29, region: 'r6', giver: 'npc_s_nobetci', xpPct: 10, goldPerLevel: 8,
    objectives: [metin('metin_olum', 2, 'Ölüm Metini yık')], items: [{ id: 'metin_kalintisi', count: 6 }],
    offer: 'Harabenin en derin taşları ölümü çağırıyor. İki Ölüm Metini\'ni yık.', progress: 'Ölüm Metini yık (2).', done: 'Ölüm metinleri kırıldı.' },
  { id: 'sq_r6_ch01_nobet_raporu', name: 'Nöbet Raporu', level: 25, region: 'r6', giver: 'npc_s_nobetci', xpPct: 5, goldPerLevel: 4,
    objectives: [kill('skel_minion', 8, 'İskelet Er öldür')],
    offer: 'Nöbet yerlerinin durumunu raporlamak için önce iskeletleri temizle.', progress: 'İskelet Er öldür (8).', done: 'Nöbet raporu hazır.' },
  { id: 'sq_r6_ch02_kuzgunkale_haberi', name: 'Kuzgunkale Haberi', level: 26, region: 'r6', giver: 'npc_s_nobetci', turnIn: 'npc_muhtar', prereq: 'sq_r6_ch01_nobet_raporu', xpPct: 7, goldPerLevel: 6,
    objectives: [talk('npc_muhtar', 'Muhtar Cemal ile konuş')],
    offer: 'Lanetli Harabeler\'in durumunu Kuzgunkale\'ye bildirmek gerek. Muhtar Cemal\'i bul.', progress: 'Kuzgunkale\'ye dön ve Muhtar Cemal ile konuş.', done: 'Muhtar Cemal raporu aldı.' },
  { id: 'sq_r6_ch03_gece_nobeti', name: 'Gece Nöbeti', level: 27, region: 'r6', giver: 'npc_s_nobetci', prereq: 'sq_r6_ch02_kuzgunkale_haberi', xpPct: 9, goldPerLevel: 8,
    objectives: [kill('shade', 10, 'Gölge öldür'), kill('cult_assassin', 4, 'Gölge Suikastçısı öldür')], items: [{ id: 'pot_hp_3', count: 2 }],
    offer: 'Muhtar gece nöbetini istedi. Gölgeleri ve suikastçıları temizle, sonra Talha\'ya dön.',
    progress: 'Gölge (10) ve Gölge Suikastçısı (4) öldür.', done: 'Gece nöbeti tamamlandı.' },
  { id: 'dq_r6_01_gunluk_iskelet', name: 'Günlük İskelet Nöbeti', level: 26, region: 'r6', giver: 'npc_s_nobetci', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('skel_minion', 12, 'İskelet Er öldür'), kill('skel_rattler', 8, 'Takırdayan İskelet öldür')], items: [mu(2)],
    offer: 'Harabe iskeletleri her sabah yeniden toplanıyor. Bugünlük nöbeti tut.', progress: 'İskelet Er (12) ve Takırdayan İskelet (8) öldür.', done: 'Nöbet bugünlük tamam. Yarın yeniden gel.' },
  { id: 'dq_r6_02_gunluk_tarikat', name: 'Günlük Tarikat Avı', level: 27, region: 'r6', giver: 'npc_s_nobetci', daily: true, xpPct: 8, goldPerLevel: 4,
    objectives: [kill('cult_acolyte', 8, 'Tarikat Müridi öldür'), kill('cult_assassin', 4, 'Gölge Suikastçısı öldür')], items: [mu(2)],
    offer: 'Tarikat müritleri her gece ayin için yeniden toplanıyor. Bugün ayini bozmalısın.', progress: 'Tarikat Müridi (8) ve Gölge Suikastçısı (4) öldür.', done: 'Ayin bozuldu. Yarın yeniden gel.' },
  { id: 'dq_r6_03_gunluk_gulyabani', name: 'Günlük Mahzen Temizliği', level: 25, region: 'r6', giver: 'npc_s_nobetci', daily: true, xpPct: 7, goldPerLevel: 3,
    objectives: [kill('crypt_ghoul', 4, 'Gulyabani öldür'), kill('shade', 6, 'Gölge öldür')], items: [mu(1)],
    offer: 'Mahzenlerden gelen gulyabaniler ve gölgeler bugün de sızdı. Mahzeni temizle.', progress: 'Gulyabani (4) ve Gölge (6) öldür.', done: 'Mahzen bugünlük temiz. Yarın yeniden gel.' },
];

// ---------------------------------------------------------------------------------------------------------------------
// 1600 m haritası: 15 yeni bölge görevi (2-3 / bölge). Seviye boşlukları kalmasın diye 1-30 arasına dağıtıldı. Verenler: yeni karakol
// NPC'leri (npc_t_*, npc_gc_*, npc_bk_*) ve mevcut köy / kamp NPC'leri. Hedefler mevcut kamp, devriye, nadir ve metin düşmanlarıdır.
// ---------------------------------------------------------------------------------------------------------------------
const NEW15: Spec[] = [
  { id: 'sq_r1_n01_tarla_domuzlari', name: 'Tarla Domuzları', level: 2, region: 'r1', giver: 'npc_g_ciftci', xpPct: 5, goldPerLevel: 1,
    objectives: [kill('ow_boar', 6, 'Yaban Domuzu öldür')],
    offer: 'Yaban domuzları Gümüşdere tarlalarını ezip geçiyor. Altı tanesini indir.', progress: 'Yaban Domuzu öldür (6).', done: 'Tarlalar yeniden ekilebilir.' },
  { id: 'sq_r1_n02_goblin_seferi', name: 'Goblin Seferi', level: 4, region: 'r1', giver: 'npc_g_muhtar', xpPct: 11, goldPerLevel: 2,
    objectives: [kill('ow_goblin', 8, 'Goblin öldür'), kill('ow_goblin_shaman', 2, 'Goblin Şamanı öldür')], items: [{ id: 'pot_hp_1', count: 2 }],
    offer: 'Goblinler köy yolunu kesmeye başladı. Şamanlarını da bulup indir.', progress: 'Goblin (8) ve Goblin Şamanı (2) öldür.', done: 'Yol yeniden kervanlara açık.' },
  { id: 'sq_r2_n03_tarla_kervani', name: 'Tarla Kervanı', level: 6, region: 'r2', giver: 'npc_c_riza', xpPct: 3, goldPerLevel: 2,
    objectives: [kill('ow_boar', 8, 'Yaban Domuzu öldür'), kill('ow_scarecrow', 4, 'Korkuluk öldür')],
    offer: 'Kervanlar Altın Tarlalar üzerinden geçiyor ama domuzlar yolu kesti.', progress: 'Yaban Domuzu (8) ve Korkuluk (4) öldür.', done: 'Kervan yoluna döndü.' },
  { id: 'sq_r2_n04_cadi_otu_tarlasi', name: 'Karakola Ot', level: 7, region: 'r2', giver: 'npc_t_komutan', xpPct: 3, goldPerLevel: 2,
    objectives: [collectFrom('item_cadi_otu', 5, ['ow_mushnub'], 'Cadı Otu topla'), talk('npc_t_komutan', "Tarla Kenarı Karakolu'nda Komutan Şahin'e teslim et")],
    turnIn: 'npc_t_komutan', items: [{ id: 'buyulu_toz', count: 2 }],
    offer: 'Karakolun eczacısı bataklık otu istiyor. Otları topla ve komutana getir.', progress: "Cadı Otu (5) topla ve Komutan Şahin'e teslim et.", done: 'Eczacı otları aldı. Karakolun iksirleri artık daha iyi.' },
  { id: 'sq_r2_n05_haydut_izleri', name: 'Haydut İzleri', level: 9, region: 'r2', giver: 'npc_t_komutan', xpPct: 3, goldPerLevel: 2,
    objectives: [kill('ow_bandit', 10, 'Haydut öldür'), kill('ow_bandit_archer', 4, 'Haydut okçusu öldür')], items: [{ id: 'pot_hp_2', count: 2 }],
    offer: 'Karakolun doğusundan haydut izleri geliyor. Okçularını da indir.', progress: 'Haydut (10) ve okçu (4) öldür.', done: 'Haydutların izi kayboldu.' },
  { id: 'sq_r3_n06_gecit_nobeti', name: 'Geçit Nöbeti', level: 11, region: 'r3', giver: 'npc_gc_komutan', xpPct: 4, goldPerLevel: 3,
    objectives: [kill('ow_bandit', 10, 'Haydut öldür'), kill('ow_wolf', 6, 'Kurt öldür')],
    offer: 'Haydut Geçidi\'ni kurtlar ve haydutlar tutuyor. Nöbeti geri al.', progress: 'Haydut (10) ve Kurt (6) öldür.', done: 'Geçit yeniden bizim.' },
  { id: 'sq_r3_n07_bozkurt_izi', name: 'Bozkurt İzi', level: 13, region: 'r3', giver: 'npc_gc_avci', xpPct: 4, goldPerLevel: 3,
    objectives: [kill('ow_wolf_dire', 3, 'Dehşet Kurdu öldür'), explore('wp_gecit_karakol', "Haydut Geçidi Karakol Taşı'nı bul")],
    offer: 'Dehşet kurtlarının sürüsü geçidin kuzeyinde dolaşıyor. Üçünü indir, sonra karakol taşını bul.', progress: "Dehşet Kurdu (3) öldür, Geçit Karakol Taşı'nı bul.", done: 'Bozkurt izleri temizlendi.' },
  { id: 'sq_r3_n08_nefret_metini', name: 'Nefret Taşları', level: 15, region: 'r3', giver: 'npc_gc_komutan', xpPct: 4, goldPerLevel: 3,
    objectives: [metin('metin_nefret', 2, 'Nefret Metini yık')], generic: [{ rarity: 'uncommon', slot: 'weapon' }],
    offer: 'Haydut Tepeleri\'nde nefret taşları çoğalıyor. İkisini yık.', progress: 'Nefret Metini (2) yık.', done: 'Taşlar çatladı. Kalıntılar senin.' },
  { id: 'sq_r4_n09_sulu_yavrular', name: 'Sülük Yavruları', level: 16, region: 'r4', giver: 'npc_bk_nobetci', xpPct: 5, goldPerLevel: 3,
    objectives: [kill('ow_ooze', 8, 'Sülük öldür'), kill('ow_will', 6, 'Bataklık Işığı öldür')],
    offer: 'Ağıt Bataklığı\'nda sülükler yuvalanıyor. Yavruları ve ışıkları temizle.', progress: 'Sülük (8) ve Bataklık Işığı (6) öldür.', done: 'Bataklık sakinleşti.' },
  { id: 'sq_r4_n10_olu_kokusu', name: 'Ölü Kokusu', level: 18, region: 'r4', giver: 'npc_bk_nobetci', xpPct: 5, goldPerLevel: 3,
    objectives: [kill('ow_wraith', 6, 'Hayalet öldür'), kill('ow_ghoul', 6, 'Gulyabani öldür')], items: [{ id: 'pot_hp_2', count: 3 }],
    offer: 'Bataklıkta hayaletler ve gulyabaniler dolaşıyor. Ölü kokusunu kesmek için hepsini indir.', progress: 'Hayalet (6) ve Gulyabani (6) öldür.', done: 'Koku dağıldı.' },
  { id: 'sq_r4_n11_otacinin_sepeti', name: 'Otacının Sepeti', level: 20, region: 'r4', giver: 'npc_bk_eczaci', xpPct: 5, goldPerLevel: 3,
    objectives: [collect('item_cadi_otu', 8, 'Cadı Otu topla'), kill('ow_spider', 6, 'Örümcek öldür')], items: [{ id: 'pot_res_1', count: 3 }],
    offer: 'Otacı Filiz bataklık otlarını istiyor. Otları topla, yoldaki örümcekleri de temizle.', progress: 'Cadı Otu (8) topla, Örümcek (6) öldür.', done: 'Otacı teşekkür etti. Sepet dolu.' },
  { id: 'sq_r5_n12_kanyon_pusu', name: 'Kanyon Pususu', level: 22, region: 'r5', giver: 'npc_c_deniz', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_orc', 8, 'Ork Savaşçısı öldür'), kill('ow_orc_shaman', 3, 'Ork Şamanı öldür')],
    offer: 'Orklar kanyon yolunda pusu kurdu. Şamanlarını avla, geçidi aç.', progress: 'Ork Savaşçısı (8) ve Ork Şamanı (3) öldür.', done: 'Kanyon yolu güvende.' },
  { id: 'sq_r5_n13_golem_tasi', name: 'Golem Taşları', level: 24, region: 'r5', giver: 'npc_c_deniz', xpPct: 6, goldPerLevel: 4,
    objectives: [kill('ow_golem', 2, 'Kanyon Golemi öldür'), kill('ow_imp', 6, 'Kanyon İblisçiği öldür')], items: [{ id: 'buyulu_toz', count: 6 }],
    offer: 'Taş ocağındaki golemler iblisçiklerle birlikte geziyor. İkisini de indir.', progress: 'Kanyon Golemi (2) ve İblisçik (6) öldür.', done: 'Taş ocağı yeniden çalışıyor.' },
  { id: 'sq_r6_n14_kemik_tarlasi', name: 'Kemik Tarlası', level: 26, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 4,
    objectives: [kill('skel_minion', 10, 'İskelet Er öldür'), kill('crypt_ghoul', 4, 'Gulyabani öldür')], items: [{ id: 'buyulu_toz', count: 5 }],
    offer: 'Harabelerin ortasında kemik tarlası büyüyor. Kökünü kaz.', progress: 'İskelet Er (10) ve Gulyabani (4) öldür.', done: 'Kemik tarlası temizlendi.' },
  { id: 'sq_r6_n15_lanetli_kitap', name: 'Lanetli Kitap', level: 29, region: 'r6', giver: 'npc_s_nobetci', xpPct: 7, goldPerLevel: 5,
    objectives: [kill('shade', 8, 'Gölge öldür'), kill('cult_acolyte', 6, 'Tarikat Müridi öldür')], generic: [{ rarity: 'rare' }],
    offer: 'Kütüphanedeki lanetli kitap gölgeleri çağırıyor. Gölgeleri ve müritleri yok et.', progress: 'Gölge (8) ve Tarikat Müridi (6) öldür.', done: 'Kitap kapandı. Gölgeler dağıldı.' },
];

/** Quest definition from a table row (the same shape as the layout-driven quests in quests.ts). */
function toDef(s: Spec): QuestDef {
  const reward: QuestReward = { xpPct: s.xpPct };
  if (s.goldPerLevel !== undefined) reward.goldPerLevel = s.goldPerLevel;
  if (s.items) reward.items = s.items;
  if (s.generic) reward.generic = s.generic;
  const def: QuestDef = {
    id: s.id, name: s.name, level: s.level, region: s.region, giver: s.giver, objectives: s.objectives, reward,
    text: { offer: s.offer, progress: s.progress, done: s.done },
  };
  if (s.turnIn) def.turnIn = s.turnIn;
  if (s.prereq) def.prereq = [s.prereq];
  if (s.daily) def.daily = true;
  return def;
}

/** All region quests (6 regions x 21: 9 kill, 3 collect, 2 hunt, 1 metin, 3 chain steps, 3 daily) and the 15 quests of the 1600 m map. */
export const REGION_QUESTS: QuestDef[] = [...R1, ...R2, ...R3, ...R4, ...R5, ...R6, ...NEW15].map(toDef);
