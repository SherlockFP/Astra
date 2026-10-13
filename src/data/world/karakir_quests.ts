import type { QuestDef, QuestObjective, QuestReward } from '../../types/quests';
import { gemId } from '../materials'; // gem grades are 1-based there: 1 Kırık, 2 Kusurlu, 3 normal, 4 Kusursuz

/**
 * KARAKIR BOZKIRI quests (GDD_OPENWORLD section 1.8, levels 30-40). OWNER: content module. The runtime is systems/Quests.ts.
 *
 * 12 quests, Turkish text in the WoW style (kill X, bring Y, talk to Z; nobody escorts):
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
    objectives: [collect('item_kervan_muhru', 6, 'Eski Kervan Mührü topla')],
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
    objectives: [collect('item_bozkir_postu', 8, 'Bozkır Kurdu Postu topla')],
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
  { id: 'sq_kk_c02_corak_kristalleri', name: 'Çorak Kristalleri', level: 35, region: 'r8', giver: 'npc_kv_gozcu', xpPct: 8, goldPerLevel: 9,
    objectives: [collect('item_corak_kristali', 8, 'Çorak Kristali topla')], items: [{ id: 'buyulu_toz', count: 5 }],
    offer: 'Kızıl Çorak\'ın yaratıkları ölünce içlerinden sıcak kristaller düşüyor. Işık tüccarları iyi para ödüyor. Sekiz tane topla.',
    progress: 'Çorak Kristali topla (8).', done: 'Güzel parça! Kervan Başı\'na götürürüm.' },
  { id: 'sq_kk_b01_ulu_boz', name: 'Ulu-Boz', level: 39, region: 'r10', giver: 'npc_kv_gozcu', xpPct: 20, goldPerLevel: 12,
    objectives: [boss('wb_ulu_boz', 1, 'Kadim Mamut Ulu-Boz\'u yen')], generic: [{ rarity: 'epic' }],
    offer: "Ayaz Eteği'nin kalbinde, buzul çanağında Kadim Mamut Ulu-Boz uyanıyor. Yer onun adımlarıyla sarsılıyor. Grupla git, onu devir.",
    progress: "Ulu-Boz'u yen.", done: 'Buzullar sustu. Efsaneyi yendin.' },
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
