import type { QuestDef, QuestObjective, QuestReward } from '../../types/quests';
import { gemId } from '../materials'; // gem grades are 1-based there: 1 Kırık, 2 Kusurlu, 3 normal, 4 Kusursuz

/**
 * KARAKIR BOZKIRI quests (GDD_OPENWORLD section 1.8, levels 30-40). OWNER: content module. The runtime is systems/Quests.ts.
 *
 * 22 quests, Turkish text in the WoW style (kill X, bring Y, talk to Z; nobody escorts):
 *  - main chain continuation mq_20..mq_22 ("Kadim Mühür" after mq_19; `main: true`, prerequisite chain from mq_19)
 *  - zone chain "Kervan Yolu" sq_kk_ch01..ch03 (talk -> collect -> kill, turned in across the two outposts)
 *  - 6 standalone: 2 kill, 2 collect, 1 rare hunt (Alaca Yele), 1 world boss (Ulu-Boz)
 *
 * Givers: Karakır Karakolu (npc_kk_*) and Kervansaray (npc_kv_*), data/world/karakir_villages.ts. Regions r7..r10 are the Karakır
 * regions (karakir_world.ts); `region` filters the collect drops of quests without kill objectives.
 *
 * Rewards follow the Sisli Vadi curve (data/world/quests_extra.ts R6, levels 25-29): kill 7-9 %, collect 7-8 %, hunts 13 %, main
 * 14-18 % of xpToNext(quest level); goldPerLevel 6-12. Collect items are `item_*` quest materials (data/materials.ts).
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
  unlocks?: string[];
  offer: string;
  progress: string;
  done: string;
}

const kill = (target: string, count: number, text: string): QuestObjective => ({ kind: 'kill', target, count, text });
const boss = (target: string, count: number, text: string): QuestObjective => ({ kind: 'boss', target, count, text });
const collect = (target: string, count: number, text: string): QuestObjective => ({ kind: 'collect', target, count, text });
/** collect with a named source: `count` items of `target` roll from the kills of the listed enemies (QuestSystem.rollDrops, collect rate). */
const collectFrom = (target: string, count: number, from: string[], text: string): QuestObjective => ({ kind: 'collect', target, count, from, text });
const talk = (target: string, text: string): QuestObjective => ({ kind: 'talk', target, count: 1, text });
const explore = (target: string, text: string): QuestObjective => ({ kind: 'explore', target, count: 1, text });

const SPECS: Spec[] = [
  // ---- main chain: after mq_19 (Kuzgunkale'ye Dönüş) the East Gate opens
  { id: 'mq_20_karakir_karakolu', name: 'Karakır Karakolu', level: 30, giver: 'npc_kk_komutan', prereq: 'mq_19_kuzgunkaleye_donus', main: true, xpPct: 14, goldPerLevel: 10,
    objectives: [talk('npc_kk_hanci', 'Hancı Aybala ile konuş')], items: [{ id: 'pot_hp_3', count: 3 }],
    offer: "Doğu Kapısı'ndan çıktığına göre Mühür haberi doğruymuş. Ben Binbaşı Tuğrul, bu karakolun komutanıyım. Yolcular bozkırda neler gördüğünü hancıya anlatır; Hancı Aybala'ya uğra, sonra bana dön.",
    progress: 'Hancı Aybala ile konuş.', done: "Aybala'nın anlattıkları doğru çıktı. Bozkırda haydutlar kol geziyor, sırada onlar var." },
  { id: 'mq_21_bozkir_gozculeri', name: 'Bozkırın Gözcüleri', level: 32, giver: 'npc_kk_komutan', prereq: 'mq_20_karakir_karakolu', main: true, xpPct: 14, goldPerLevel: 11,
    objectives: [kill('kb_haydut', 10, 'Bozkır Haydutu öldür'), kill('kb_haydut_okcu', 6, 'Bozkır Okçusu öldür')], generic: [{ rarity: 'uncommon', slot: 'armor' }],
    offer: 'Haydutlar eski handa toplanıp batı otlaklarını tutuyor; okçuları da kulenin dibinde pusu kurmuş. Yolu açmadan Kervansaray\'a geçemeyiz. On haydut ve altı okçuyu temizle.',
    progress: 'Bozkır Haydutu (10) ve Bozkır Okçusu (6) öldür.', done: 'Otlaklar nefes aldı. Şimdi asıl avımız Kızıl Çorak\'ta: Ork Kağanı Horgan.' },
  { id: 'mq_22_kizil_kagan', name: 'Kızıl Kağan', level: 35, giver: 'npc_kk_komutan', turnIn: 'npc_kv_basi', prereq: 'mq_21_bozkir_gozculeri', main: true, xpPct: 18, goldPerLevel: 12,
    objectives: [explore('wp_karakir_kervansaray', "Kervansaray Taşı'na ulaş"), boss('mb_kb_horgan', 1, "Çorak Kağanı Horgan'ı öldür")],
    generic: [{ rarity: 'rare' }, { rarity: 'rare', slot: 'weapon' }], unlocks: ['ent_buzul_tahti'],
    offer: "Çorak Kağanı Horgan Kızıl Çorak'ta kervan yollarını kesiyor. Kervansaray'a git, taşı etkinleştir ve Horgan'ın başını getir. Kervan Başı Cengiz sonrasını anlatır.",
    progress: "Kervansaray Taşı'na ulaş ve Çorak Kağanı Horgan'ı öldür; sonra Kervan Başı Cengiz ile konuş.", done: "Horgan düştü. Kervan yolu açıldı; Ayaz Geçidi'nde Buzul Tahtı'nın kapısı seni bekliyor." },

  // ---- zone chain "Kervan Yolu": talk -> collect -> kill, across the two outposts
  { id: 'sq_kk_ch01_kervan_mektubu', name: 'Kervancının Mektubu', level: 33, giver: 'npc_kv_basi', turnIn: 'npc_kk_avci', xpPct: 7, goldPerLevel: 7,
    objectives: [talk('npc_kk_avci', 'Avcı Börte ile konuş')],
    offer: "Kervanlar yolda kayboluyor. Karakol'daki Avcı Börte bozkırı iyi bilir; bu mektubu ona ulaştır.",
    progress: 'Avcı Börte ile konuş.', done: "Mektup yerine ulaştı. Cengiz'in derdi bana da dert: kayıp kervanların izini süreceğiz." },
  { id: 'sq_kk_ch02_eski_muhurler', name: 'Eski Kervan Mühürleri', level: 34, region: 'r8', giver: 'npc_kk_avci', prereq: 'sq_kk_ch01_kervan_mektubu', xpPct: 8, goldPerLevel: 8,
    objectives: [collectFrom('item_kervan_muhru', 6, ['kb_ork', 'kb_ork_atici'], 'Eski Kervan Mührü topla')],
    offer: "Kayıp kervanların mühürleri Kızıl Çorak'taki yaratıkların elinde kalmış. Altı mühür getirirsen hangi yolda kaybolduklarını çıkarırım.",
    progress: 'Eski Kervan Mührü topla (6).', done: 'Mühürler yolun orklar tarafından kesildiğini gösteriyor. Şimdi onları vurma zamanı.' },
  { id: 'sq_kk_ch03_kervan_yolu', name: 'Kervan Yolu', level: 36, giver: 'npc_kk_avci', turnIn: 'npc_kv_basi', prereq: 'sq_kk_ch02_eski_muhurler', xpPct: 9, goldPerLevel: 9,
    objectives: [kill('kb_ork_cellat', 2, 'Çorak Cellatı öldür'), kill('kb_ork', 8, 'Çorak Orku öldür')], items: [{ id: 'buyulu_toz', count: 6 }],
    offer: "Mühürlerin gösterdiği yolu ork cellatları tutuyor. İki cellatı ve sekiz orku kes, sonra Kervan Başı Cengiz'e haber ver.",
    progress: 'Çorak Cellatı (2) ve Çorak Orku (8) öldür.', done: 'Yol açıldı! Kervanlar yeniden Kervansaray\'a uğrayacak.' },

  // ---- standalone
  { id: 'sq_kk_k01_otlak_kurtlari', name: 'Otlak Kurtları', level: 30, region: 'r7', giver: 'npc_kk_coban', xpPct: 7, goldPerLevel: 6,
    objectives: [kill('kb_kurt', 12, 'Bozkır Kurdu öldür')],
    offer: 'Kurtlar sürüme dadandı, her gece bir koyun eksiliyor. On iki kurdu avla da ağıla huzur gelsin.',
    progress: 'Bozkır Kurdu öldür (12).', done: 'Sürü rahat uyuyabilir. Sağ ol, delikanlı.' },
  { id: 'sq_kk_c01_bozkir_postlari', name: 'Bozkır Postları', level: 31, region: 'r7', giver: 'npc_kk_coban', xpPct: 7, goldPerLevel: 7,
    objectives: [collectFrom('item_bozkir_postu', 8, ['kb_kurt'], 'Bozkır Kurdu Postu topla')],
    offer: 'Kış kapıda. Kurt postundan kalın mont olur; ama avlayacak genç kalmadı. Sekiz post getir.',
    progress: 'Bozkır Kurdu Postu topla (8).', done: 'Bu postlarla kimse donmaz. Al, ödülün.' },
  { id: 'sq_kk_h01_alaca_yele', name: 'Alaca Yele Avı', level: 32, region: 'r7', giver: 'npc_kk_avci', xpPct: 13, goldPerLevel: 9,
    objectives: [kill('rare_kb_alaca_yele', 1, 'Alaca Yele öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: "Alaca Yele otlakların en eski kurdu; sürüsünü uluyarak çağırıyor. Çoğu avcı peşine düşüp dönmedi. Onu bul ve bitir.",
    progress: 'Alaca Yele öldür.', done: 'Otlaklar onun gölgesinden kurtuldu.' },
  { id: 'sq_kk_k02_ciyan_cukuru', name: 'Kızıl Çıyan Çukuru', level: 34, region: 'r8', giver: 'npc_kv_gozcu', xpPct: 8, goldPerLevel: 8,
    objectives: [kill('kb_ciyan', 12, 'Kızıl Çıyan öldür')], items: [{ id: gemId('topaz', 2), count: 1 }],
    offer: 'Kervansaray\'ın güneyindeki çukurdan kızıl çıyanlar taşıyor. Develer bile yaklaşmıyor. Çukuru temizle.',
    progress: 'Kızıl Çıyan öldür (12).', done: 'Çukur sessiz. Develer rahat nefes aldı.' },
  { id: 'sq_kk_c02_corak_kristalleri', name: 'Işık Tüccarının Siparişi', level: 35, region: 'r8', giver: 'npc_kv_gozcu', xpPct: 8, goldPerLevel: 9,
    objectives: [collectFrom('item_corak_kristali', 8, ['kb_iblis'], 'Çorak Kristali topla')], items: [{ id: 'buyulu_toz', count: 5 }],
    offer: 'Kızıl Çorak\'ın yaratıkları ölünce içlerinden sıcak kristaller düşüyor. Işık tüccarları iyi para ödüyor. Sekiz tane topla.',
    progress: 'Çorak Kristali topla (8).', done: 'Güzel parça! Kervan Başı\'na götürürüm.' },
  { id: 'sq_kk_b01_ulu_boz', name: 'Ulu-Boz', level: 39, region: 'r10', giver: 'npc_kv_gozcu', xpPct: 20, goldPerLevel: 12,
    objectives: [boss('wb_ulu_boz', 1, 'Kadim Mamut Ulu-Boz\'u yen')], generic: [{ rarity: 'epic' }],
    offer: "Ayaz Eteği'nin kalbinde, buzul çanağında Kadim Mamut Ulu-Boz uyanıyor. Yer onun adımlarıyla sarsılıyor. Grupla git, onu devir.",
    progress: "Ulu-Boz'u yen.", done: 'Buzullar sustu. Efsaneyi yendin.' },

  // ---- r11 Kül Ovası and r12 Kartal Sırtı (levels 40-44): the Kül Ocağı outpost gives them (npc_ko_*)
  { id: 'sq_ko_ch01_kul_ocagi', name: 'Kül Ocağı Nöbeti', level: 40, giver: 'npc_kv_basi', turnIn: 'npc_ko_nobetci', xpPct: 7, goldPerLevel: 7,
    objectives: [talk('npc_ko_nobetci', 'Nöbetçi Yusuf ile konuş')],
    offer: "Kervan yolunun sonunda yeni bir karakol kurduk. Kül Ocağı'nın nöbetçisi Yusuf sana yeri gösterecek; ona selam ver.",
    progress: 'Nöbetçi Yusuf ile konuş.', done: 'Kül Ocağı artık bizim. Ovadaki tehlikeleri bir bir öğrenmeye başlayacaksın.' },
  { id: 'sq_ko_k01_kul_akrepleri', name: 'Kül Akrepleri', level: 40, region: 'r11', giver: 'npc_ko_nobetci', xpPct: 7, goldPerLevel: 7,
    objectives: [kill('kb_kul_akrep', 12, 'Kül Akrebi öldür')],
    offer: 'Ovanın küllü çukurlarından akrepler çıkıyor; devriye yolunu kapatıyorlar. On iki tanesini kes, yol açılsın.',
    progress: 'Kül Akrebi öldür (12).', done: 'Çukurlar sessizleşti. Devriyeler yeniden yola çıkabilir.' },
  { id: 'sq_ko_k02_hortlak_avi', name: 'Hortlak Avı', level: 41, region: 'r11', giver: 'npc_ko_nobetci', xpPct: 8, goldPerLevel: 8,
    objectives: [kill('kb_kul_hortlak', 10, 'Kül Hortlağı öldür')],
    offer: 'Gece olunca küllerin altından hortlaklar kalkıyor. Tabutları açmadan önce sayılarını azaltmalıyız. On tanesini yok et.',
    progress: 'Kül Hortlağı öldür (10).', done: 'Hortlaklar toprağa döndü. Gece biraz daha sakin.' },
  { id: 'sq_ko_c01_kul_tozu', name: 'Kül Tozu', level: 41, region: 'r11', giver: 'npc_ko_kasif', xpPct: 7, goldPerLevel: 8,
    objectives: [collectFrom('item_kul_tozu', 8, ['kb_kul_hortlak', 'kb_kul_cin'], 'Kül Tozu topla')], items: [{ id: 'buyulu_toz', count: 4 }],
    offer: 'Kül Ovası\'nın tozu bazı yaratıkların içinde saklı. Onları öldüğünde toz bırakıyor; sekiz avuç topla, analiz edeceğim.',
    progress: 'Kül Tozu topla (8).', done: 'Bu toz ateşe dayanıklı bir kaplama için birebir. Teşekkürler.' },
  { id: 'sq_ko_k03_golem_kiriklari', name: 'Golem Kırıkları', level: 42, region: 'r11', giver: 'npc_ko_kasif', xpPct: 8, goldPerLevel: 9,
    objectives: [kill('kb_kul_golem', 8, 'Kül Golemi öldür')],
    offer: 'Kül Golemleri ovanın ortasındaki eski kale duvarlarını yıkıyor. Sekiz tanesini devirirsen duvarın kalıntılarını kurtarabiliriz.',
    progress: 'Kül Golemi öldür (8).', done: 'Golemler sustu. Kaleden geriye kalan taşlar bize yol gösterecek.' },
  { id: 'sq_ko_h01_kul_efendisi', name: 'Kül Efendisi', level: 42, region: 'r11', giver: 'npc_ko_nobetci', turnIn: 'npc_ko_nobetci', xpPct: 13, goldPerLevel: 9,
    objectives: [boss('mb_kb_kul_efendisi', 1, 'Kül Efendisi Ruhan\'ı öldür')], generic: [{ rarity: 'rare', slot: 'weapon' }],
    offer: 'Ovanın dibindeki lahitte bir hükümdar uyuyor: Kül Efendisi Ruhan. Hortlakları o çağırıyor. Onu lahdinden çıkar ve bitir.',
    progress: 'Kül Efendisi Ruhan\'ı öldür.', done: 'Lahit açıldı, ova rahatladı. Efendinin kılıcı bizde kalacak.' },
  { id: 'sq_kt_k01_kartal_yirtici', name: 'Sırt Yırtıcıları', level: 43, region: 'r12', giver: 'npc_ko_kasif', xpPct: 8, goldPerLevel: 9,
    objectives: [kill('kb_kartal_yirtici', 12, 'Sırt Yırtıcısı öldür')],
    offer: 'Kartal Sırtı\'nda yırtıcılar kayalıkların üstünden atlayıp yolcuları kovalıyor. On iki tanesini yakalayıp sürüyü dağıt.',
    progress: 'Sırt Yırtıcısı öldür (12).', done: 'Sırtlar güvende. Kartal yuvalarına çıkmak artık daha az tehlikeli.' },
  { id: 'sq_kt_c01_kartal_tuyu', name: 'Kartal Tüyü', level: 43, region: 'r12', giver: 'npc_ko_kasif', xpPct: 8, goldPerLevel: 9,
    objectives: [collectFrom('item_kartal_tuyu', 8, ['kb_kartal_karakus', 'kb_kartal_gozcu'], 'Kartal Tüyü topla')], items: [{ id: 'buyulu_toz', count: 4 }],
    offer: 'Dev karakuşların tüyleri rüzgârı kesen oklar için aranıyor. Sekiz tüy getir, okçularımıza yeni ok yaptıracağım.',
    progress: 'Kartal Tüyü topla (8).', done: 'Ne güzel tüyler! Oklar bu sırttan da hedefi bulacak.' },
  { id: 'sq_kt_k02_kartal_rahipleri', name: 'Kartal Rahipleri', level: 44, region: 'r12', giver: 'npc_ko_nobetci', xpPct: 9, goldPerLevel: 10,
    objectives: [kill('kb_kartal_rahip', 10, 'Kartal Rahibi öldür')],
    offer: 'Sırtın tepesindeki tapınakta rahipler kartal tanrısına kurban kesiyor. On rahibi durdur, tapınağın kapısı kapansın.',
    progress: 'Kartal Rahibi öldür (10).', done: 'Tapınak sessiz. Rahiplerin sandıklarında eski bir harita bulduk.' },
  { id: 'sq_kt_h01_kartal_kral', name: 'Kartal Kralı', level: 44, region: 'r12', giver: 'npc_ko_kasif', xpPct: 13, goldPerLevel: 10,
    objectives: [kill('rare_kb_kartal_kral', 1, 'Kartal Kralı\'nı öldür')], generic: [{ rarity: 'rare', slot: 'armor' }],
    offer: 'Sırtın en yüksek kayasında Kartal Kralı dolaşıyor; kanatlarını açtığında gökyüzü kararıyor. Onu avlamadan sırt bize ait olmaz.',
    progress: 'Kartal Kralı\'nı öldür.', done: 'Kral düştü. Sırtın gökyüzü yeniden açık.' },
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
  if (s.unlocks) def.unlocks = s.unlocks;
  return def;
}

/** Karakır quests (mq_20..22 are `main`; appended to QUESTS in quests.ts). */
export const KARAKIR_QUESTS: QuestDef[] = SPECS.map(toDef);
