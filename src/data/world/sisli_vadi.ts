import type { BossPlacement, DungeonDef, WorldExtras } from '../../types/dungeons';
import { LAYOUT } from './layout';
import { BORDERS, LANDMARKS, REGIONS, ROADS, ROOM_OF_REGION, ROOMS, WATER } from './regions';
import { WORLD_PACKS } from './camps';
import { VILLAGES } from './villages';
import { CHESTS, CURSED, ENTRANCES, GATHER, GHOST_BOAT, HIDDEN, MINIBOSSES, RARES, SHRINES, VISTAS, WAYPOINTS, WORLD_BOSSES } from './pois';
import { METIN_SPOTS, METIN_TIERS } from './metin';

/**
 * SISLI VADI, the open-world map (GDD_OPENWORLD §1, §9.1). OWNER: content module. Levels 1-30, 160 x 160 tiles (640 m).
 *
 * This file only ASSEMBLES the typed pieces of this folder; the data itself lives in:
 *  - sisli_vadi.layout.json  the design layout (copy of docs/GDD_OPENWORLD.layout.json, the source of truth)
 *  - layout.ts              loader, typed layout shape, model / texture url converters
 *  - regions.ts             rooms, regions (6 themes), roads, water, landmarks, borders
 *  - camps.ts               70 camps + 11 patrols as PackDefs (WORLD_PACKS: camps first; the enemy id scheme depends on this order)
 *  - villages.ts            Gümüşdere, Kızılkaya, Son Ocak, camp hubs Altın Ambar and Kanyon: props, NPCs, gates, spawn points
 *  - pois.ts                waypoints, entrances, shrines, chests, cursed chests, gathering, hidden areas, vistas, rares,
 *                           mini-bosses, world boss schedules, ghost boat
 *  - metin.ts               six metin tiers (waves, adds, aura, pulse, respawn) and 24 spots
 *  - quests.ts              main chain (19), side quests (24), Av Defteri (6)
 * Other districts: karakir.ts (skeleton, map 2), sisli_koru.ts (deprecated predecessor, recipes only).
 *
 * Entry: tile (80, 1) facing 0 (+z, into the map) from the Kuzgunkale south gate; the return portal stands at tile (80, 2).
 * Bosses: wb_curukkok (Çürük Höyük, R2) and wb_alevkanat (Ejder Yuvası, R5) are BossPlacements; their schedules are WORLD_BOSSES.
 * Rooms are the region rects + the bridge / approach / island rects. There are no doors: connectivity is by adjacency (the nav).
 */


/** Arena -> boss placement. The arena list order gives the boss order (1 = Çürükkök, 2 = Alevkanat). */
const BOSSES: BossPlacement[] = LAYOUT.arenas.map((a, i) => ({
  bossId: a.id,
  roomId: ROOM_OF_REGION[a.region],
  pos: a.center,
  facing: 0,
  order: i + 1,
}));

/** Streaming / AI budgets (GDD_OPENWORLD §1.5): activation 70 m, deactivation 110 m, AI sleep 45 m, 240 active mobs, 40 m chunks. */
const PERF: WorldExtras['perf'] = { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 };

const WORLD: WorldExtras = {
  regions: REGIONS,
  villages: VILLAGES,
  waypoints: WAYPOINTS,
  entrances: ENTRANCES,
  roads: ROADS,
  water: WATER,
  borders: BORDERS,
  landmarks: LANDMARKS,
  metin: { tiers: METIN_TIERS, spots: METIN_SPOTS },
  rares: RARES,
  minibosses: MINIBOSSES,
  bosses: WORLD_BOSSES,
  gather: GATHER,
  chests: CHESTS,
  cursed: CURSED,
  shrines: SHRINES,
  hidden: HIDDEN,
  vistas: VISTAS,
  ghostBoat: GHOST_BOAT,
  perf: PERF,
};

export const SISLI_VADI: DungeonDef = {
  id: 'sisli_vadi',
  name: 'Sisli Vadi',
  shortName: 'Vadi',
  lore: "Kuzgunkale'nin güneyinde, sisle örtülü geniş bir vadi. Bir göl etrafında halka şeklinde uzanır.",
  levelRange: [1, 30],
  timerSec: 0,
  forcesRequired: 0,
  theme: {
    fogColor: 0x9aa890, fogNear: 15, fogFar: 70, ambient: 0x607060, ambientIntensity: 0.3, hemiSky: 0xc0d0b0, hemiGround: 0x303820,
    torchColor: 0xffa050, bloomStrength: 0.3, music: 'world_vale', palette: [0x303820, 0x6a7a58, 0x9aa890, 0xc0d0b0, 0xffa050], tint: 0xdde4d0,
  },
  grid: { w: LAYOUT.grid.w, h: LAYOUT.grid.h },
  rooms: ROOMS,
  doors: [],
  packs: WORLD_PACKS,
  bosses: BOSSES,
  start: { pos: [80, 1], facing: 0 },
  exit: { pos: [80, 2] },
  outdoor: true,
  world: WORLD,
};
