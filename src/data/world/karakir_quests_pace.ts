import type { QuestDef, QuestObjective, QuestReward } from '../../types/quests';

/**
 * KARAKIR BOZKIRI region quests for levels 31-35 (pace fix). OWNER: content module. Merged into QUESTS in quests.ts next to karakir_quests.
 *
 * Why: pace-check (tools/pace-check.mjs) wants one-time quest XP of 25-45 % of every band; the 31-35 band had only the three main
 * quests (6.7 %). These nine region quests (ids sq_r<N>_*, which pace-check counts as `region`) bring the band to about 32 %.
 * Regions: r7 Karakır Otlakları (30-33) and r8 Kızıl Çorak (33-36) only; r9 starts at 36, so a 31-35 quest cannot sit there
 * (content-check: the quest level must be in its region band).
 *
 * Givers: Karakır Karakolu (npc_kk_coban, npc_kk_avci) and Kervansaray (npc_kv_gozcu, npc_kv_basi). Objectives are kill / collect
 * on the Karakır roster (kb_* ids of enemies_karakir.ts, items of data/materials.ts). xpPct 14 each (13 on the collect quest),
 * goldPerLevel 7-9.
 */

type Reward = { items?: { id: string; count: number }[]; generic?: NonNullable<QuestReward['generic']> };

interface Spec extends Reward {
  id: string;
  name: string;
  level: number;
  region: string;
  giver: string;
  turnIn?: string;
  objectives: QuestObjective[];
  xpPct: number;
  goldPerLevel: number;
  offer: string;
  progress: string;
  done: string;
}

const kill = (target: string, count: number, text: string): QuestObjective => ({ kind: 'kill', target, count, text });
const collect = (target: string, count: number, text: string): QuestObjective => ({ kind: 'collect', target, count, text });
/** collect with a named source: `count` items of `target` roll from the kills of the listed enemies (QuestSystem.rollDrops, collect rate). */
const collectFrom = (target: string, count: number, from: string[], text: string): QuestObjective => ({ kind: 'collect', target, count, from, text });

const SPECS: Spec[] = [
  // ---- r7 Karakır Otlakları (30-33)
  { id: 'sq_r7_goblin_avi', name: 'Toz Goblinleri', level: 31, region: 'r7', giver: 'npc_kk_coban', xpPct: 14, goldPerLevel: 7,
    objectives: [kill('kb_goblin', 10, 'Toz Goblini öldür (10)')],
    offer: 'Otlağın ortasındaki obaya toz goblinleri yerleşmiş; sürünün etrafında dolaşıp kuzuları kaçırıyorlar. Obayı dağıt ve on goblini avla.',
    progress: 'Toz Goblini öldür (10).', done: 'Oba dağıldı, sürü rahat otluyor. Bu kuzuların hayatını kurtardın.' },
  { id: 'sq_r7_kurt_postu', name: 'Kurt Postu', level: 31, region: 'r7', giver: 'npc_kk_coban', xpPct: 14, goldPerLevel: 7,
    objectives: [collectFrom('item_kurt_postu', 6, ['kb_kurt'], 'Kurt Postu topla (6)')],
    offer: 'Kış yaklaşıyor ve çadırların postları eskidi. Otlaktaki kurtların postları kalın olur; altı tane getir, kışlık çadırları yenileyeceğiz.',
    progress: 'Kurt Postu topla (6).', done: 'Postlar kalın ve sağlam. Bu kış çoban ailesi üşümeyecek.' },
  { id: 'sq_r7_haydut_hani', name: 'Yıkık Hanın Haydutları', level: 32, region: 'r7', giver: 'npc_kk_avci', xpPct: 14, goldPerLevel: 8,
    objectives: [kill('kb_haydut', 6, 'Bozkır Haydutu öldür (6)'), kill('kb_haydut_okcu', 4, 'Bozkır Okçusu öldür (4)')],
    offer: 'Yıkık handa haydutlar yeniden toplandı. Okçular çatının üstünden yolcuları vuruyor. Altı haydutu ve dört okçuyu avla, han boşalsın.',
    progress: 'Bozkır Haydutu (6) ve Bozkır Okçusu (4) öldür.', done: 'Han boşaldı. Yolcular artık oradan geçebilir.' },
  { id: 'sq_r7_ayi_avi', name: 'Bozkır Ayıları', level: 32, region: 'r7', giver: 'npc_kk_avci', xpPct: 14, goldPerLevel: 8,
    objectives: [kill('kb_ayi', 4, 'Bozkır Ayısı öldür (4)'), kill('kb_kurt', 4, 'Bozkır Kurdu öldür (4)')],
    offer: 'Kuzeydeki ayılar yaz boyunca çiftliklerin yolunu kesti; yanlarında da kurtlar dolaşıyor. Dört ayıyı ve dört kurdu devirmek gerekiyor.',
    progress: 'Bozkır Ayısı (4) ve Bozkır Kurdu (4) öldür.', done: 'Ayılar çekildi. Çiftçiler yeniden tarlaya çıkabilir.' },
  { id: 'sq_r7_ari_kovani', name: 'Toz Arısı Kovanı', level: 33, region: 'r7', giver: 'npc_kk_coban', xpPct: 14, goldPerLevel: 8,
    objectives: [kill('kb_ari', 10, 'Toz Arısı öldür (10)')],
    offer: 'Otlağın doğusundaki kovandan çıkan arılar, çobanların köpeklerini bile kovalıyor. On arıyı öldür, kovanın yolunu kapat.',
    progress: 'Toz Arısı öldür (10).', done: 'Kovan sessiz. Köpekler yine çayırda koşuyor.' },

  // ---- r8 Kızıl Çorak (33-36)
  { id: 'sq_r8_orumcek_ini', name: 'Kızıl Örümcek İni', level: 34, region: 'r8', giver: 'npc_kv_gozcu', xpPct: 14, goldPerLevel: 9,
    objectives: [kill('kb_orumcek', 8, 'Çorak Örümceği öldür (8)'), kill('kb_orumcek_dev', 1, 'Kızıl Ana Örümcek öldür')],
    offer: 'Kızıl Örümcek İni\'nden çıkan örümcekler kervan yolunun kenarına kadar sarkıyor. Sekiz sıradan örümceği ve ana örümceği öldür, ini sessizleşsin.',
    progress: 'Çorak Örümceği (8) ve Kızıl Ana Örümcek öldür.', done: 'İn sustu. Kervanlar bu yoldan yeniden geçebilir.' },
  { id: 'sq_r8_ork_atici', name: 'Çorak Mızrakçıları', level: 34, region: 'r8', giver: 'npc_kv_gozcu', turnIn: 'npc_kv_basi', xpPct: 14, goldPerLevel: 9,
    objectives: [kill('kb_ork_atici', 8, 'Çorak Mızrakçısı öldür (8)'), kill('kb_ork_saman', 3, 'Kızıl Şaman öldür (3)')],
    offer: 'Orklar Kızıl Çorak\'ın vadilerinde pusu kurmuş; mızrakçılar tepeden vuruyor, şamanlar da onları iyileştiriyor. Sekiz mızrakçıyı ve üç şamanı avla.',
    progress: 'Çorak Mızrakçısı (8) ve Kızıl Şaman (3) öldür.', done: 'Vadi temizlendi. Kervan Başı Cengiz bu haberi bekliyordu.' },
  { id: 'sq_r8_corak_kristali', name: 'Çorak Kristalleri', level: 34, region: 'r8', giver: 'npc_kv_basi', xpPct: 13, goldPerLevel: 9,
    objectives: [collectFrom('item_corak_kristali', 6, ['kb_iblis'], 'Çorak Kristali topla (6)')],
    offer: 'Kızıl Çorak\'ın yaratıkları ölünce sıcak kristaller düşüyor. Işık tüccarları bu kristalleri iyi fiyata alıyor. Altı tane getir.',
    progress: 'Çorak Kristali topla (6).', done: 'Kristaller sıcak ve temiz. Tüccarlara götüreceğim.' },
  { id: 'sq_r8_golem_avi', name: 'Kaya Golemleri', level: 35, region: 'r8', giver: 'npc_kv_basi', xpPct: 14, goldPerLevel: 9,
    objectives: [kill('kb_golem', 4, 'Kızıl Kaya Golemi öldür (4)'), kill('kb_ork_cellat', 2, 'Çorak Cellatı öldür (2)')],
    offer: 'Eski taş ocağında golemler uyandı; yanlarında da bir iki cellat var. Dört golemi ve iki cellatı devir, ocağın yolu açılsın.',
    progress: 'Kızıl Kaya Golemi (4) ve Çorak Cellatı (2) öldür.', done: 'Ocak sessiz. Taşlar yeniden kervanlara hizmet edecek.' },
];

function toDef(s: Spec): QuestDef {
  const reward: QuestReward = { xpPct: s.xpPct, goldPerLevel: s.goldPerLevel };
  if (s.items) reward.items = s.items;
  if (s.generic) reward.generic = s.generic;
  const def: QuestDef = {
    id: s.id, name: s.name, level: s.level, region: s.region, giver: s.giver, objectives: s.objectives, reward,
    text: { offer: s.offer, progress: s.progress, done: s.done },
  };
  if (s.turnIn) def.turnIn = s.turnIn;
  return def;
}

/** Karakır region quests of levels 31-35 (sq_r7_* / sq_r8_*: pace-check's region band). */
export const KARAKIR_PACE_QUESTS: QuestDef[] = SPECS.map(toDef);
