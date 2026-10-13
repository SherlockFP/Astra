import type { TownDef } from '../types/dungeons';

/**
 * Fallback hub layout (GDD_CONTENT 2.3) used by TownScene when data/town.ts has no NPCs yet. Same shape as TownDef.npcs so
 * the scene has a single code path; `rot` is degrees (0 = facing +Z / south, 180 = north).
 */
export const DEFAULT_TOWN_SPAWN = { pos: [0, 0, 26] as [number, number, number], facing: 180 };
/** Arrival point after a dungeon run (in front of the portal arc). */
export const DEFAULT_PORTAL_ARRIVAL = { pos: [0, 0, -38] as [number, number, number], facing: 0 };

type N = TownDef['npcs'][number];
const npc = (id: string, name: string, role: N['role'], model: string, x: number, z: number, rot = 0, extra: Partial<N> = {}): N => ({
  id, name, role, model, pos: [x, 0, z], rot, ...extra,
});

export const DEFAULT_TOWN_NPCS: N[] = [
  npc('npc_demirci', 'Demirci Haldun Usta', 'blacksmith', 'Barbarian', 24, -6, -90),
  npc('npc_cirak', 'Çırak Murat', 'citizen', 'Worker', 26, -9.5, -120),
  npc('npc_efsuncu', 'Efsuncu Nergis', 'blacksmith', 'Mage', 24, 8, -90),
  npc('npc_tuccar', 'Tüccar Selim', 'merchant', 'Rogue_Hooded', -24, -8, 90),
  npc('npc_simyaci', 'Simyacı Lale', 'alchemist', 'Mage', -24, 4, 90),
  npc('npc_depocu', 'Depocu Bekir', 'stash', 'Barbarian', -24, 14, 90),
  npc('npc_anahtar_ustasi', 'Anahtar Ustası Yaşar', 'keystone', 'Knight', 0, -34, 0),
  npc('npc_lord_tarhan', 'Lord Tarhan', 'keystone', 'King', -8, -34, 0),
  npc('obj_seref_tasi', 'Şeref Taşı', 'citizen', 'prop', 8, -34, 0),
  npc('portal_kemik_mahzeni', 'Kemik Mahzeni', 'portal', 'portal', -10.4, -50, 60, { dungeonId: 'kemik_mahzeni' }),
  npc('portal_kizil_dokumhane', 'Kızıl Dökümhane', 'portal', 'portal', -4.1, -55.3, 20, { dungeonId: 'kizil_dokumhane' }),
  npc('portal_buzul_tahti', 'Buzul Tahtı', 'portal', 'portal', 4.1, -55.3, -20, { dungeonId: 'buzul_tahti' }),
  npc('portal_golge_tapinagi', 'Gölge Tapınağı', 'portal', 'portal', 10.4, -50, -60, { dungeonId: 'golge_tapinagi' }),
  npc('npc_egitmen', 'Eğitmen Kaya', 'trainer', 'Knight', -24, 32, -90),
  npc('obj_kukla_1', 'Eğitim Kuklası', 'citizen', 'dummy', -48, 40, 180),
  npc('obj_kukla_2', 'Eğitim Kuklası', 'citizen', 'dummy', -43, 40, 180),
  npc('obj_kukla_3', 'Elit Kukla', 'citizen', 'dummy', -38, 40, 180),
  npc('obj_kukla_4', 'Boss Kuklası', 'citizen', 'dummy', -33, 40, 180),
  npc('obj_kukla_5a', 'Grup Kuklası', 'citizen', 'dummy', -42, 48, 180),
  npc('obj_kukla_5b', 'Grup Kuklası', 'citizen', 'dummy', -40, 47, 180),
  npc('obj_kukla_5c', 'Grup Kuklası', 'citizen', 'dummy', -38, 48, 180),
  npc('obj_kukla_5d', 'Grup Kuklası', 'citizen', 'dummy', -41, 50, 180),
  npc('obj_kukla_5e', 'Grup Kuklası', 'citizen', 'dummy', -39, 50, 180),
  npc('npc_muhtar', 'Muhtar Cemal', 'bounty', 'Barbarian', 10, 18, -150),
  npc('obj_bulusma_tasi', 'Buluşma Taşı', 'lobby', 'prop', -8, 18, 0),
  npc('npc_muhafiz_1', 'Kale Muhafızı', 'guard', 'Knight', -5, 55, 0),
  npc('npc_muhafiz_2', 'Kale Muhafızı', 'guard', 'Knight', 5, 55, 0),
  npc('npc_muhafiz_3', 'Kale Muhafızı', 'guard', 'Knight', -7, -24, 0),
  npc('npc_muhafiz_4', 'Kale Muhafızı', 'guard', 'Knight', 7, -24, 0),
  npc('npc_muhafiz_5', 'Devriye', 'guard', 'Knight', 17, 8, 0),
  npc('npc_muhafiz_6', 'Devriye', 'guard', 'Knight', -17, 8, 0),
  npc('npc_meyhaneci', 'Meyhaneci Hasan', 'citizen', 'Barbarian', 34, 34, -90),
  npc('npc_koylu_1', 'Köylü', 'citizen', 'Rogue', 4.5, 12, 200),
  npc('npc_koylu_2', 'Köylü', 'citizen', 'Knight', -4.5, 4, 40),
  npc('npc_koylu_3', 'Köylü', 'citizen', 'Mage', 38, 41, 90),
  npc('npc_koylu_4', 'Köylü', 'citizen', 'Barbarian', 41, 45, -30),
  npc('npc_koylu_5', 'Köylü', 'citizen', 'Rogue', -20, -2, 150),
  npc('npc_koylu_6', 'Köylü', 'citizen', 'Knight', 30, 38, 120),
];

/** Props drawn by TownScene itself only when the content/world modules provided none (decor around the stations). */
export const DEFAULT_TOWN_DECOR: { prop: string; pos: [number, number]; rot?: number; scale?: number; block?: number }[] = [
  { prop: 'forge', pos: [28, -2], rot: -1.57, scale: 1, block: 1.6 },
  { prop: 'anvil', pos: [22.3, -6], rot: -1.57, scale: 1.1, block: 0.6 },
  { prop: 'alchemy_table', pos: [-21.5, 4], rot: 1.57, scale: 1.1, block: 1 },
  { prop: 'cauldron', pos: [-21.5, 8], rot: 1.57, scale: 1, block: 0.8 },
  { prop: 'market_stall', pos: [-21, -14], rot: 1.57, scale: 1, block: 1.6 },
  { prop: 'market_stall', pos: [-21, -2], rot: 1.57, scale: 1, block: 1.6 },
  { prop: 'chest_iron', pos: [-27, 12], rot: 1.57, scale: 1, block: 0.6 },
  { prop: 'chest_iron', pos: [-27, 14], rot: 1.57, scale: 1, block: 0.6 },
  { prop: 'chest_iron', pos: [-27, 16], rot: 1.57, scale: 1, block: 0.6 },
  { prop: 'well', pos: [0, 8], rot: 0, scale: 1.2, block: 2.0 },
  { prop: 'tent', pos: [32, 8], rot: -1.57, scale: 1.2, block: 2.2 },
  { prop: 'signpost', pos: [3, 50], rot: 0, scale: 1, block: 0.6 },
  { prop: 'lamp_post', pos: [-6, 40], rot: 0 }, { prop: 'lamp_post', pos: [6, 40], rot: 3.14 },
  { prop: 'lamp_post', pos: [-6, 24], rot: 0 }, { prop: 'lamp_post', pos: [6, 24], rot: 3.14 },
  { prop: 'lamp_post', pos: [-6, -10], rot: 0 }, { prop: 'lamp_post', pos: [6, -10], rot: 3.14 },
  { prop: 'barrel', pos: [34, 36], block: 0.5 }, { prop: 'barrel', pos: [36, 37], block: 0.5 },
  { prop: 'crate_a', pos: [-48, 53], block: 0.6 }, { prop: 'crate_a', pos: [-34, 53], block: 0.6 },
  { prop: 'banner_red', pos: [-12, -27], rot: 0 }, { prop: 'banner_blue', pos: [12, -27], rot: 0 },
  { prop: 'banner_green', pos: [-16, -57], rot: 0 }, { prop: 'banner_red', pos: [16, -57], rot: 0 },
  { prop: 'statue_hooded', pos: [0, 44], rot: 0, scale: 1, block: 1.2 },
];
