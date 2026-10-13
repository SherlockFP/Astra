/**
 * KARAKIR BOZKIRI, open-world map 2 (levels 30-45, GDD_OPENWORLD §1.8). OWNER: content module. SKELETON (WP2): constants only.
 * No DungeonDef yet, so it is not registered in OPEN_ZONES and getDungeon('karakir_bozkiri') stays undefined; the town's East Gate
 * (exit `dogu_kapisi`, data/town.ts) leads here once the map exists. The full layout is a follow-up that reuses the Sisli Vadi
 * generator (camps, metin, rares, villages, quests from the Karakır chain mq_20..mq_30).
 */
export const KARAKIR_BOZKIRI = {
  id: 'karakir_bozkiri',
  name: 'Karakır Bozkırı',
  levelRange: [30, 45] as [number, number],
  grid: { w: 180, h: 140 },
  /** Entry from Kuzgunkale's East Gate: flag q.mq_19_kuzgunkaleye_donus done, or level 30. */
  entry: { exit: 'dogu_kapisi', gateFlag: 'q.mq_19_kuzgunkaleye_donus', gateLevel: 30 },
  /** Two halves, one per level band. */
  halves: [
    { id: 'karakir_bozkiri', name: 'Karakır Bozkırı', levels: [30, 37] as [number, number], fogColor: 0xcfc2a0, fogNear: 30, fogFar: 110, ambientVfx: 'ambient_dust' },
    { id: 'ayaz_etegi', name: 'Ayaz Eteği', levels: [38, 45] as [number, number], fogColor: 0xb8c8d8, fogNear: 20, fogFar: 90, ambientVfx: 'ambient_snow' },
  ],
  /** Dungeons reached from this map (world entrances, §1.8). */
  entrances: ['buzul_tahti', 'golge_tapinagi'],
} as const;
