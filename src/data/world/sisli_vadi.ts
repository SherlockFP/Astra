import type { BossPlacement, DungeonDef, WorldExtras } from '../../types/dungeons';
import { LAYOUT, gridOf, perfOf } from './layout';
import { BORDERS, LANDMARKS, REGIONS, ROADS, ROOM_OF_REGION, ROOMS, WATER } from './regions';
import { WORLD_PACKS } from './camps';
import { VILLAGES } from './villages';
import { CHESTS, CURSED, ENTRANCES, GATHER, GHOST_BOAT, HIDDEN, MINIBOSSES, RARES, SHRINES, VISTAS, WAYPOINTS, WORLD_BOSSES } from './pois';
import { METIN_SPOTS, METIN_TIERS } from './metin';

/**
 * SISLI VADI, the open-world map (GDD_OPENWORLD §1, §9.1). OWNER: content module. Levels 1-30, 400 x 400 tiles (1600 m), a streamed
 * zone (docs/ENGINE_BIGMAPS.md section 6: the `zone` block of the layout, gridOf / perfOf).
 *
 * This file only ASSEMBLES the typed pieces of this folder; the data itself lives in:
 *  - sisli_vadi.layout.json  the design layout (copy of docs/GDD_OPENWORLD.layout.json, the source of truth)
 *  - layout.ts              loader, typed layout shape, model / texture url converters
 *  - regions.ts             rooms, regions (6 themes), roads, water, landmarks, borders
 *  - camps.ts               camps + patrols as PackDefs (WORLD_PACKS: camps first; the enemy id scheme depends on this order, < 2079)
 *  - villages.ts            Gümüşdere, Kızılkaya, Son Ocak, camp hubs Altın Ambar and Kanyon: props, NPCs, gates, spawn points
 *  - pois.ts                waypoints, entrances, shrines, chests, cursed chests, gathering, hidden areas, vistas, rares,
 *                           mini-bosses, world boss schedules, ghost boat
 *  - metin.ts               six metin tiers (waves, adds, aura, pulse, respawn) and 24 spots
 *  - quests.ts              main chain (19), side quests (24), Av Defteri (6)
 * Other districts: karakir.ts (skeleton, map 2), sisli_koru.ts (deprecated predecessor, recipes only).
 *
 * Entry: tile (200, 1) facing 0 (+z, into the map) from the Kuzgunkale south gate (the 640 m entry tile (80, 1) x 2.5); the return portal
 * stands at tile (200, 2).
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

/**
 * Rolling terrain (opt-in, docs/ENGINE_BIGMAPS.md section 10): modest relief of 2-5 m. 4 m cells (rivers 1-2 tiles wide need them); the
 * classic one-mesh ground is then about 80k triangles (WorldDecor builds it 440 m around the map centre, the fog hides the rest).
 * Haydut Tepeleri (the bandit hills) are the liveliest, the marsh and the ruins lie flatter; hills frame the map edge.
 */
const RELIEF: WorldExtras['relief'] = {
  seed: 'sisli_vadi',
  cellM: 4,
  profile: { amp: 4, scale: 110 },
  regions: {
    r1: { amp: 3.5, scale: 120 },
    r2: { amp: 3, scale: 140 },
    r3: { amp: 5, scale: 100, base: 1 },
    r4: { amp: 1.6, scale: 90 },
    r5: { amp: 4.5, scale: 90, ridged: 0.3 },
    r6: { amp: 3, scale: 100 },
  },
  edge: { rise: 20, width: 60 },
};

const WORLD: WorldExtras = {
  relief: RELIEF,
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
  grid: gridOf(LAYOUT),
  rooms: ROOMS,
  doors: [],
  packs: WORLD_PACKS,
  bosses: BOSSES,
  start: { pos: [200, 1], facing: 0 },
  exit: { pos: [200, 2] },
  outdoor: true,
  world: { ...WORLD, perf: perfOf(LAYOUT, PERF) },
};
