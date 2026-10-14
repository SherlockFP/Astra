import type { QuestDef, QuestObjective } from '../../types/quests';

/**
 * Sisli Vadi görev çeşitliliği (WoW tarzı). OWNER: content module.
 *
 * Seviye 1-15 görevlerinin bir kısmı "N yaratık öldür" yerine yeni hedef türlerini kullanır (systems/Quests.ts):
 *  - drop: N eşya, belirli yaratıklardan yüzde şansla düşer (öldürme sayısı kabaca eskisiyle aynı: N / 0.6 ≈ eski sayı).
 *  - elite: adlandırılmış bir elit (rare) avı (rare_* id, rank elite).
 *  - bonus (BONUS_QUESTS): bir bölgenin bonus görevi; karışık hedefler, tek ilerleme çubuğu (progressPct).
 * Bu dosya görev verisini `VARIETY` ile üzerine yazar (applyVariety, data/world/quests.ts). Ödül ve XP yüzdeleri değişmez;
 * `node tools/pace-check.mjs` aynı kalır. Görev ve hedef kimlikleri kendi `id`'lerinden gelir, metinler Türkçedir.
 *
 * interact (qo_sack / qo_crystal / qo_banner props, F), use (qt_* altar, F with the item) and escort (NPC walk with ambushes) are
 * placed by scenes/world/WorldQuestProps.ts in the quest's region.
 */

const drop = (target: string, count: number, from: string[], text: string): QuestObjective =>
  ({ kind: 'drop', target, count, from, chance: 0.6, text });
const kill = (target: string, count: number, text: string): QuestObjective => ({ kind: 'kill', target, count, text });
const elite = (target: string, text: string): QuestObjective => ({ kind: 'elite', target, count: 1, text });
const boss = (target: string, count: number, text: string): QuestObjective => ({ kind: 'boss', target, count, text });
const explore = (target: string, text: string): QuestObjective => ({ kind: 'explore', target, count: 1, text });
/** interact: `count` uses of world props (qo_sack / qo_crystal / qo_banner, F; a prop is empty for 60 s after each use). */
const interact = (target: string, count: number, text: string): QuestObjective => ({ kind: 'interact', target, count, text });
/** escort: stay within reach of the escort NPC for `seconds` seconds of walking (the NPC walks and is ambushed on the way). */
const escort = (seconds: number, text: string): QuestObjective => ({ kind: 'escort', count: seconds, text });
/** use: the quest item `item` used on the altar `target` (F, one item per use). */
const use = (item: string, target: string, count: number, text: string): QuestObjective => ({ kind: 'use', item, target, count, text });

interface VarietyPatch {
  objectives: QuestObjective[];
  offer?: string;
  progress?: string;
  /** Quest items handed over on accept (use objectives). */
  startItems?: { id: string; count: number }[];
}

/** Quest id -> new objectives (and flavour text) for levelling quests (levels 1-15 of Sisli Vadi). */
export const VARIETY: Record<string, VarietyPatch> = {
  // ---- main chain (mq_01..mq_06 keep their objectives: the first-10-minutes path in tools/pace-check.mjs)
  mq_08_ciftlik_isgali: {
    objectives: [kill('ow_boar', 12, 'Yaban Domuzu öldür'), drop('item_saman_cobani', 5, ['ow_scarecrow'], 'Korkuluklardan Saman Demeti topla (5)')],
    offer: 'Domuzlar tarlaları ezdi, korkuluklar da yerinden oynadı. Domuzları durdur, korkuluklardan düşen samanla ekinleri yeniden dik.',
    progress: 'Yaban Domuzu öldür (12). Korkuluklardan Saman Demeti topla (5).',
  },
  mq_09_mezarligin_sirri: {
    objectives: [drop('item_kirik_kemik', 6, ['skel_minion'], 'Mezarlıktan Kırık Kemik topla (6)')],
    offer: "Kayıp Mezarlık'ta iskeletler yeniden kalkıyor. Kırık kemiklerini topla ki mezarlığın sırrını çözebilelim; Kemik Mahzeni'nin kapısı da orada.",
    progress: "Kayıp Mezarlık iskeletlerinden Kırık Kemik topla (6).",
  },
  mq_12_haydut_kalesi: {
    objectives: [boss('mb_karabiyik', 1, "Haydut Kralı Karabıyık'ı öldür"), drop('item_haydut_kemeri', 9, ['ow_bandit', 'ow_bandit_archer', 'ow_bandit_brute'], 'Haydutlardan Haydut Kemeri topla (9)')],
    offer: "Haydutlar kalesini kurdu. Kralları Karabıyık'ı alt et ve askerlerinin ganimet kemerlerini topla; karakol mühürleri kale kapısını açacak.",
    progress: "Haydut Kralı Karabıyık'ı öldür. Haydutlardan Haydut Kemeri topla (9).",
  },
  mq_13_kizilkaya_haberi: {
    objectives: [explore('koy_kizilkaya', "Kızılkaya Karakolu'na ulaş"), drop('item_kurt_postu', 6, ['ow_wolf'], 'Kurtlardan Kurt Postu topla (6)')],
    offer: "Kızılkaya'dan haber alamıyoruz. Karakola git ve yol boyunca kurt postları getir; Komutan Aslan yolun güvende olduğunu bununla kanıtlayacak.",
    progress: "Kızılkaya'ya ulaş ve kurtlardan 6 Kurt Postu topla.",
  },

  // ---- Sisli Koru (r1)
  sq_r1_k04_orman_kurtlari: {
    objectives: [drop('item_kurt_postu', 8, ['ow_wolf'], 'Orman Kurdu postu topla (8)')],
    offer: 'Orman kurtları yolcuların peşinden iniyor. Postlarını topla, kervancılar iyi post için yol açar.',
    progress: 'Orman Kurdu postu topla (8).',
  },
  sq_r1_k05_mantar_ormani: {
    objectives: [drop('item_mantar_sapi', 9, ['ow_mushnub'], 'Mantarcıklardan Şifalı Mantar Sapı topla (9)')],
    offer: "Mantar ormanında Mantarcıklar çoğaldı. Sapları Rahibe Meryem'in merhemine lazım; onları topla.",
    progress: 'Mantarcıklardan Şifalı Mantar Sapı topla (9).',
  },
  sq_r1_k06_kizgin_arilar: {
    objectives: [drop('item_orman_balı', 7, ['ow_wasp'], 'Orman Arılarından Orman Balı topla (7)')],
    offer: 'Arılar kovanını büyüttü. Balını geri almak için kovanın etrafındaki arıları avla.',
    progress: 'Orman Arılarından Orman Balı topla (7).',
  },

  // ---- Sisli Koru (r2, Gümüşdere cephesi)
  sq_r2_k01_korkuluk_isyani: {
    objectives: [drop('item_saman_cobani', 8, ['ow_scarecrow'], 'Korkuluklardan Saman Demeti topla (8)')],
    offer: 'Korkuluklar tarlada isyan çıkardı. Samanlarını topla; çiftçiler onlarla yeni korkuluk yapacak.',
    progress: 'Korkuluklardan Saman Demeti topla (8).',
  },
  sq_r2_k03_curumus_koylular: {
    objectives: [interact('qo_crystal', 3, 'Mezar kristallerini kır (3)'), kill('ow_zombie', 10, 'Çürümüş Köylü öldür (10)')],
    offer: 'Çürümüş köylüler mezarlıktan çıkıp tarlaya yürüyor. Mezarlardaki kristaller onları çağırıyor; kır ve köylüleri dağıt.',
    progress: 'Mezar kristallerini kır (3). Çürümüş Köylü öldür (10).',
  },
  sq_r2_k04_magara_yarasalari: {
    objectives: [drop('item_yarasa_kanadi', 9, ['ow_bat'], 'Mağara Yarasalarından Yarasa Kanadı topla (9)')],
    offer: 'Mağara yarasaları köyün üstünde daireler çiziyor. Kanatlarını topla, rahibe bunlarla bir tılsım yapacak.',
    progress: 'Mağara Yarasalarından Yarasa Kanadı topla (9).',
  },
  sq_r2_k05_haydut_bozgunu: {
    objectives: [drop('item_haydut_kemeri', 7, ['ow_bandit'], 'Haydutlardan Haydut Kemeri topla (7)')],
    offer: 'Haydutlar yolu yeniden kesti. Kemerlerini topla ki karakol onların kimliğini doğrulayabilsin.',
    progress: 'Haydutlardan Haydut Kemeri topla (7).',
  },
  sq_r2_k06_puglin_baskini: {
    objectives: [drop('item_puglin_disi', 6, ['ow_puglin'], 'Puglin Yağmacılardan Puglin Dişi topla (6)')],
    offer: 'Puglin yağmacılar tarlaya baskın düzenledi. Yağmacıların sarı dişlerini topla, kanıt olarak götüreceğim.',
    progress: 'Puglin Yağmacılardan Puglin Dişi topla (6).',
  },
  sq_r2_k07_takirdayan_kemikler: {
    objectives: [drop('item_kirik_kemik', 6, ['skel_rattler'], 'Takırdayan İskeletlerden Kırık Kemik topla (6)')],
    offer: 'Takırdayan iskeletler harabelerde dolaşıyor. Kırık kemiklerini topla; bu kemiklerle harabeyi temizlemek istiyorum.',
    progress: 'Takırdayan İskeletlerden Kırık Kemik topla (6).',
  },
  sq_r2_k08_mantarcik_bahcesi: {
    objectives: [drop('item_mantar_sapi', 7, ['ow_mushnub'], 'Mantarcıklardan Şifalı Mantar Sapı topla (7)')],
    offer: 'Mantarcıklar bahçeye yayıldı. Sapları topla; hem bahçeyi temizler hem de merhem yapmamıza yarar.',
    progress: 'Mantarcıklardan Şifalı Mantar Sapı topla (7).',
  },
  sq_r2_k09_kurt_avcisi: {
    objectives: [drop('item_kurt_postu', 7, ['ow_wolf'], 'Orman Kurdu postu topla (7)')],
    offer: 'Bir kurt avcısı gerekiyor. Kurtların postlarını topla, avcı sürünün izini bu postlardan sürecek.',
    progress: 'Orman Kurdu postu topla (7).',
  },

  // ---- Kızılkaya (r3)
  sq_r3_k01_haydut_karakolu: {
    objectives: [drop('item_haydut_kemeri', 8, ['ow_bandit'], 'Haydutlardan Haydut Kemeri topla (8)')],
    offer: 'Haydut karakolu bu yolu tutuyor. Kemerlerini topla, komutan karakolun gerçekten düşüp düşmediğini bunlardan anlayacak.',
    progress: 'Haydutlardan Haydut Kemeri topla (8).',
  },
  sq_r3_k03_tepe_kurtlari: {
    objectives: [drop('item_kurt_postu', 10, ['ow_wolf'], 'Orman Kurdu postu topla (10)')],
    offer: 'Tepe kurtları kervanlara saldırıyor. Postlarını topla; avcı Karaca bunlarla sürünün nereden geldiğini çözecek.',
    progress: 'Orman Kurdu postu topla (10).',
  },
  sq_r3_k04_puglin_seferi: {
    objectives: [drop('item_puglin_disi', 7, ['ow_puglin'], 'Puglin Yağmacılardan Puglin Dişi topla (7)')],
    offer: 'Puglin seferi yolu tutuyor. Yağmacıların dişlerini topla; kervanlar bu dişlerle geçiş ücretini ödeyecek.',
    progress: 'Puglin Yağmacılardan Puglin Dişi topla (7).',
  },
  sq_r3_k09_tepe_arilari: {
    objectives: [drop('item_orman_balı', 6, ['ow_wasp'], 'Orman Arılarından Orman Balı topla (6)')],
    offer: 'Tepedeki arılar kovanlarını büyüttü. Balını topla; kervanlar bu balla yolculuk ikmalini yapacak.',
    progress: 'Orman Arılarından Orman Balı topla (6).',
  },

  sq_r2_n05_haydut_izleri: {
    objectives: [drop('item_haydut_kemeri', 6, ['ow_bandit'], 'Haydutlardan Haydut Kemeri topla (6)'), kill('ow_bandit_archer', 4, 'Haydut okçusu öldür')],
    offer: 'Haydut izleri Gümüşdere yoluna çıkıyor. Kemerleri topla ve okçuları da indir, izi kesmek istiyoruz.',
    progress: 'Haydutlardan Haydut Kemeri topla (6). Haydut okçusu öldür (4).',
  },
  sq_r3_k02_okcu_avi: {
    objectives: [drop('item_haydut_kemeri', 7, ['ow_bandit_archer'], 'Haydut Okçularından Haydut Kemeri topla (7)')],
    offer: 'Haydut okçuları tepelerden ok yağdırıyor. Okçuların ganimet kemerlerini topla; karakol bu mühürle geçidi açacak.',
    progress: 'Haydut Okçularından Haydut Kemeri topla (7).',
  },
  sq_r3_k05_pehlivanlar: {
    objectives: [kill('ow_bandit_brute', 4, 'Haydut Pehlivanı öldür'), drop('item_haydut_kemeri', 4, ['ow_bandit'], 'Haydutlardan Haydut Kemeri topla (4)')],
    offer: 'Haydut pehlivanları kervan yolunu bloke etti. Pehlivanları indir ve sıradan haydutların kemerlerini topla.',
    progress: 'Haydut Pehlivanı öldür (4). Haydutlardan Haydut Kemeri topla (4).',
  },
  sq_k_01_gol_kiyisi: {
    objectives: [kill('ow_bear', 2, 'Boz Ayı öldür'), drop('item_kurt_postu', 4, ['ow_wolf'], 'Orman Kurdu postu topla (4)')],
    offer: 'Göl kıyısındaki mağarada ayılar ve kurtlar var. İki ayıyı indir, kurt postlarını da getir.',
    progress: 'Boz Ayı öldür (2). Orman Kurdu postu topla (4).',
  },

  // ---- interact / use / escort conversions (levels 1-10; props and escort NPCs are placed by scenes/world/WorldQuestProps.ts)
  sq_r1_k01_ambar_sicanlari: {
    objectives: [interact('qo_sack', 4, 'Ambardaki sıçan yuvası çuvallarını aç (4)'), kill('ow_rat', 8, 'Orman Sıçanı öldür (8)')],
    offer: 'Ambardaki sıçanlar buğdayın yarısını yedi. Yuvaladıkları çuvalları aç ve sıçanları dağıt.',
    progress: 'Ambar çuvallarını aç (4). Orman Sıçanı öldür (8).',
  },
  sq_r1_k02_balcik_avi: {
    objectives: [interact('qo_crystal', 4, 'Balçık kristallerini kır (4)'), kill('ow_slime', 6, 'Yeşil Balçık öldür (6)')],
    offer: 'Göl kenarındaki balçıklar kristallerin ışığıyla çoğalıyor. Kristalleri kır, balçıkları temizle.',
    progress: 'Balçık kristallerini kır (4). Yeşil Balçık öldür (6).',
  },
  sq_r1_k03_goblin_yagmasi: {
    objectives: [interact('qo_banner', 4, 'Goblin sancaklarını indir (4)'), kill('ow_goblin', 6, 'Goblin Yağmacı öldür (6)')],
    offer: 'Goblin yağmacıları kervan yollarına sancaklarını dikti. Sancakları indir ve yağmacıların gücünü kır.',
    progress: 'Goblin sancaklarını indir (4). Goblin Yağmacı öldür (6).',
  },
  sq_r1_ch02_gozcu_avi: {
    objectives: [escort(40, 'Yaralı gözcüyü 40 sn eskort et (yolda pusu var)'), kill('ow_goblin', 4, 'Goblin Gözcüsü öldür (4)')],
    offer: 'Gözcü yaralı dönüyor ve goblinler peşinde. Onu kampa kadar yanında tut; yolda pusu kurulmuş olabilir.',
    progress: 'Gözcüyü 40 sn eskort et. Goblin öldür (4).',
  },
  sq_r1_c03_sifali_mantar: {
    objectives: [interact('qo_sack', 4, 'Mantar sepetlerini aç (4)')],
    offer: 'Rahibe merhem için şifalı mantar istiyor. Mantar sepetlerini bul ve aç; sapları sen topla.',
    progress: 'Mantar sepetlerini aç (4).',
  },
  sq_r1_k07_domuz_avi: {
    objectives: [interact('qo_banner', 3, 'Domuz tuzaklarının sancaklarını indir (3)'), kill('ow_boar', 7, 'Yaban Domuzu öldür (7)')],
    offer: 'Domuzlar tarlaların kenarına tuzak kurdu. Tuzakların sancaklarını indir ve domuzları avla.',
    progress: 'Tuzak sancaklarını indir (3). Yaban Domuzu öldür (7).',
  },
  sq_g_03_orumcek_aglari: {
    objectives: [interact('qo_sack', 3, 'Ağlardaki çuvalları kes (3)'), kill('ow_spider', 6, 'Orman Örümceği öldür (6)')],
    offer: 'Örümcekler ağlarını tarlaların üstüne ördü. Ağlara takılmış çuvalları kes ve örümcekleri uzaklaştır.',
    progress: 'Ağlardaki çuvalları kes (3). Orman Örümceği öldür (6).',
  },
  sq_r2_c01_mezar_tozu: {
    objectives: [use('item_mezar_tozu', 'qt_kutsama_tasi', 4, "Kutsama Taşı'nda Mezar Tozu kullan (4)")],
    startItems: [{ id: 'item_mezar_tozu', count: 4 }],
    offer: "Mezarlıktaki kutsanmamış tozu rahibe kutsatmam gerek. Verdiğim tozu Kutsama Taşı'nda dört kez kullan.",
    progress: "Kutsama Taşı'nda Mezar Tozu kullan (4).",
  },
  sq_c_02_korkuluk_sirri: {
    objectives: [interact('qo_banner', 3, 'Korkuluk sancaklarını indir (3)'), kill('ow_scarecrow', 5, 'Korkuluk öldür (5)'), elite('rare_korkuluk_kral', 'Korkuluk Kral öldür')],
    offer: "Korkuluklar bir gün yürüyüp köye gelebilir. Sancaklarını indir, sürüyü dağıt ve Korkuluk Kral'ı bul.",
    progress: 'Korkuluk sancaklarını indir (3). Korkuluk öldür (5). Korkuluk Kral öldür.',
  },

  // ---- Sisli side chains (sq_g / sq_c) and the r4 bataklık quest
  sq_g_01_kurt_tehlikesi: {
    objectives: [drop('item_kurt_postu', 5, ['ow_wolf'], 'Orman Kurdu postu topla (5)')],
    offer: 'Kurtlar yol kenarında dolaşıyor. Beş kurt postu getir; yolcular bunu bekliyor.',
    progress: 'Orman Kurdu postu topla (5).',
  },
  sq_g_04_ari_yuvasi: {
    objectives: [drop('item_orman_balı', 6, ['ow_wasp'], 'Orman Arılarından Orman Balı topla (6)')],
    offer: 'Arılar yuvasını büyüttü. Kovanın balını topla; dağıtmadan önce iş bitmez.',
    progress: 'Orman Arılarından Orman Balı topla (6).',
  },
  sq_g_05_mantar_halkasi: {
    objectives: [drop('item_mantar_sapi', 7, ['ow_mushnub'], 'Mantarcıklardan Şifalı Mantar Sapı topla (7)')],
    offer: 'Mantar halkası zehirli bulut saçıyor. Sapları topla ki halkanın gücünü kırabilelim.',
    progress: 'Mantarcıklardan Şifalı Mantar Sapı topla (7).',
  },
  sq_c_01_bugday_hirsizlari: {
    objectives: [drop('item_puglin_disi', 6, ['ow_puglin'], 'Puglin Yağmacılardan Puglin Dişi topla (6)')],
    offer: 'Buğday hırsızları tarlaları soyuyor. Yağmacıların dişlerini getir, hırsızlığın kimin işi olduğunu kanıtlayalım.',
    progress: 'Puglin Yağmacılardan Puglin Dişi topla (6).',
  },
  sq_c_03_terk_edilmis_ciftlik: {
    objectives: [drop('item_mezar_tozu', 3, ['ow_zombie'], 'Zombilerden Mezar Tozu topla (3)'), kill('ow_bat', 4, 'Yarasa öldür')],
    offer: 'Terk edilmiş çiftlikte ölüler dolaşıyor. Zombilerin mezar tozunu topla ve yarasaları kovala.',
    progress: 'Zombilerden Mezar Tozu topla (3). Yarasa öldür (4).',
  },
  sq_r4_k01_gulyabani_surusu: {
    objectives: [drop('item_camur_kesesi', 9, ['ow_ghoul'], 'Bataklık Gulyabanilerinden Çamur Kesesi topla (9)')],
    offer: 'Gulyabaniler bataklıkta sürü halinde dolaşıyor. Keselerini topla; simyacılar bunlardan panzehir yapmak istiyor.',
    progress: 'Bataklık Gulyabanilerinden Çamur Kesesi topla (9).',
  },
};

/**
 * Bonus objectives per region (WoW bonus tasks): one short area, mixed actions (kill, drop, a named elite), one progress bar.
 * Levels 4, 9 and 14: they come right after the region's first quests and are not on the main chain.
 */
export const BONUS_QUESTS: QuestDef[] = [
  {
    id: 'sq_r1_b01_kizil_kuyruk_pususu', name: 'Kızıl Kuyruk Pususu', level: 4, region: 'r1', place: 'r1_c07', giver: 'npc_g_avci', bonus: true,
    objectives: [
      kill('ow_goblin', 6, 'Goblin Yağmacı öldür'),
      drop('item_goblin_kulagi', 4, ['ow_goblin'], 'Goblin Kulağı topla (4)'),
      elite('rare_kizil_kuyruk', 'Kızıl Kuyruk öldür'),
    ],
    reward: { xpPct: 3, goldPerLevel: 2, items: [{ id: 'pot_hp_1', count: 2 }] },
    text: {
      offer: 'Goblinler ambarların arkasında pusu kurdu ve Kızıl Kuyruk onlara liderlik ediyor. Pusuyu boz, kulakları topla ve dev sıçanı avla.',
      progress: 'Goblin Yağmacı öldür (6). Goblin Kulağı topla (4). Kızıl Kuyruk öldür.',
      done: 'Pusu bozuldu, ambarlar yeniden senin dediğin gibi.',
    },
  },
  {
    id: 'sq_r2_b01_hortlak_mezarligi', name: 'Hortlak Mezarlığı', level: 9, region: 'r2', place: 'r2_c05', giver: 'npc_g_rahibe', bonus: true,
    objectives: [
      kill('ow_zombie', 6, 'Çürümüş Köylü öldür'),
      drop('item_mezar_tozu', 4, ['ow_zombie'], 'Mezar Tozu topla (4)'),
      elite('rare_buyuk_boz', 'Büyük Boz öldür'),
    ],
    reward: { xpPct: 4, goldPerLevel: 3, items: [{ id: 'pot_hp_1', count: 3 }] },
    text: {
      offer: 'Mezarlıkta bir Büyük Boz hortlakları çağırıyor. Hortlakları dağıt, kutsanacak tozu topla ve ayıyı yere serin.',
      progress: 'Çürümüş Köylü öldür (6). Mezar Tozu topla (4). Büyük Boz öldür.',
      done: 'Mezarlık sessizleşti. Rahibe Meryem tozu kutsadı.',
    },
  },
  {
    id: 'sq_r3_b01_tepe_pususu', name: 'Tepe Pususu', level: 14, region: 'r3', place: 'r3_c09', giver: 'npc_k_avci', bonus: true,
    objectives: [
      kill('ow_bandit_archer', 6, 'Haydut okçusu öldür'),
      drop('item_haydut_kemeri', 4, ['ow_bandit', 'ow_bandit_archer'], 'Haydut Kemeri topla (4)'),
      elite('rare_golge_alfa', 'Gölge Alfa öldür'),
    ],
    reward: { xpPct: 5, goldPerLevel: 4, items: [{ id: 'pot_hp_2', count: 2 }] },
    text: {
      offer: 'Yıkık kulenin üstünde haydut okçuları pusuda. Okçuları indir, kemerlerini al ve sürünün başındaki Gölge Alfa ile yüzleş.',
      progress: 'Haydut okçusu öldür (6). Haydut Kemeri topla (4). Gölge Alfa öldür.',
      done: 'Tepe yeniden bizim. Gölge Alfa düştü.',
    },
  },
];

/** Applies VARIETY to the registered levelling quests and appends BONUS_QUESTS. Ids in VARIETY that no quest has are ignored here (sims/questtypes.mjs checks them). */
export function applyVariety(defs: readonly QuestDef[]): QuestDef[] {
  const out = defs.map((d) => {
    const p = VARIETY[d.id];
    if (!p) return d;
    return {
      ...d,
      objectives: p.objectives,
      text: { ...d.text, offer: p.offer ?? d.text.offer, progress: p.progress ?? d.text.progress },
      ...(p.startItems ? { startItems: p.startItems } : {}),
    };
  });
  return [...out, ...BONUS_QUESTS];
}
