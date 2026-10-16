import type { BossPlacement, DungeonDef, WorldExtras } from '../../types/dungeons';
import {
  AYAZ_GRID, AYAZ_ZONE_SRC, BORDERS, BOSS_ARENA, CHESTS, CURSED, ENTRANCES, GATHER, HIDDEN, LANDMARKS, MINIBOSSES, RARES, REGIONS, ROADS, ROOMS,
  ROOM_OF_REGION, SHRINES, VISTAS, WATER, WAYPOINTS, WORLD_BOSSES, WORLD_BOSS_ID, WORLD_PACKS,
} from './ayaz_daglari';
import { AYAZ_VILLAGES } from './ayaz_villages';
import { AYAZ_METIN_SPOTS, AYAZ_METIN_TIERS } from './ayaz_metin';
import { perfOf } from './layout';
import AYAZ_DECOR from './ayaz_decor.json' with { type: 'json' };
import { zoneDecor, zoneFlats, zoneLandmarks } from './decor_zones';

/**
 * AYAZ DAGLARI, open-world map 3 (levels 45-60, GDD_OPENWORLD section 1.8 successor). OWNER: content module.
 *
 * Assembles the typed pieces of this folder, the same shape as karakir.ts (DungeonDef + WorldExtras, no new engine system):
 *  - ayaz_daglari.ts   rooms, 6 regions (r16..r21), roads, water, landmarks, waypoints, the Kartal Geçidi zone link, the eight
 *                      season dungeon doors (moved from Karakır), 104 packs, 6 rares, 3 mini-bosses, the world boss schedule, shrines,
 *                      chests, gathering, hidden areas, vistas, the zone block
 *  - ayaz_villages.ts  Ayaz Geçidi Karakolu, Kırağı Konağı and Buz Kulesi Gözlemevi: props, NPCs, vendors, innkeepers
 *  - ayaz_metin.ts     six metin tiers (one per region) and 24 spots
 *  - ayaz_quests.ts    25 quests, appended to QUESTS (data/world/quests.ts)
 *  - ../enemies_ayaz.ts  ad_* mobs, rare_ad_*, mb_ad_*, wb_ad_zemheri (registered at the end of data/enemies.ts)
 *
 * Entry: the Kartal Geçidi pass from Karakır's far region (r12, `ent_ayaz_gecidi` in karakir_world.ts, gate level 45); the way back is
 * `ent_karakir_gecidi` at tile (6, 200). The exit portal of a run returns to town (Kuzgunkale). Rooms are the region rects + the pass
 * strip; no doors, connectivity is by adjacency. 400 x 400 tiles = 1600 x 1600 m, streamed (AYAZ_ZONE_SRC). Registered in OPEN_ZONES.
 */

/** Streaming / AI budgets (GDD_OPENWORLD section 1.5), the same as the other open zones; the zone block of ayaz_daglari.ts sets the size. */
const PERF: WorldExtras['perf'] = perfOf(AYAZ_ZONE_SRC, { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 });

/**
 * Rolling terrain (docs/ENGINE_BIGMAPS.md section 10), 4 m cells: the pass band climbs from the west, the frozen valley is a basin,
 * the lake plateau is raised, the storm ridge and the summit belt carry the strongest relief (15-25 m), and the deep-winter highland
 * is a broad plateau with the boss arena on top. Two ridges wall the valley and the lake from the east. Villages, roads, landmarks,
 * camps and POIs are flattened by the engine (world/Relief.ts); the two lakes sit in basins.
 */
/** Generated life of the zone (tools/world-fill.mjs --zone ayaz, the snow and ice palette). */
const DECOR = zoneDecor(AYAZ_DECOR, 'ayaz');

const RELIEF: WorldExtras['relief'] = {
  seed: 'ayaz_daglari',
  cellM: 4,
  profile: { amp: 10, scale: 120 },
  regions: {
    r16: { amp: 14, scale: 120, base: 6 },
    r17: { amp: 16, scale: 110, ridged: 0.4 },
    r18: { amp: 12, scale: 130, base: 8 },
    r19: { amp: 20, scale: 100, base: 10, ridged: 0.5 },
    r20: { amp: 14, scale: 120, base: 6 },
    r21: { amp: 22, scale: 95, base: 14, ridged: 0.45 },
  },
  edge: { rise: 30, width: 110 },
  ridges: [
    { pts: [[124, 100], [124, 250]], height: 14, width: 26 },
    { pts: [[250, 240], [250, 300]], height: 16, width: 28 },
  ],
  plateaus: [{ pos: [350, 250], radius: 22, height: 12, falloff: 14 }],
  flat: zoneFlats(DECOR),
};

const WORLD: WorldExtras = {
  relief: RELIEF,
  regions: REGIONS,
  villages: AYAZ_VILLAGES,
  waypoints: WAYPOINTS,
  entrances: ENTRANCES,
  roads: ROADS,
  water: WATER,
  borders: BORDERS,
  landmarks: [...LANDMARKS, ...zoneLandmarks(AYAZ_DECOR)],
  decor: DECOR,
  metin: { tiers: AYAZ_METIN_TIERS, spots: AYAZ_METIN_SPOTS },
  rares: RARES,
  minibosses: MINIBOSSES,
  bosses: WORLD_BOSSES,
  gather: GATHER,
  chests: CHESTS,
  cursed: CURSED,
  shrines: SHRINES,
  hidden: HIDDEN,
  vistas: VISTAS,
  perf: PERF,
};

const BOSSES: BossPlacement[] = [{ bossId: WORLD_BOSS_ID, roomId: ROOM_OF_REGION.r20, pos: BOSS_ARENA, facing: 0, order: 1 }];

export const AYAZ_DAGLARI: DungeonDef = {
  id: 'ayaz_daglari',
  name: 'Ayaz Dağları',
  shortName: 'Ayaz',
  lore: 'Kartal Sırtı\'nın ardındaki geçitten çıkılan karlı dağlar. Donmuş vadiler, rüzgârlı yaylalar ve zirvelerin ötesinde bitmeyen kış.',
  levelRange: [45, 60],
  timerSec: 0,
  forcesRequired: 0,
  theme: {
    fogColor: 0xc8d8e8, fogNear: 22, fogFar: 105, ambient: 0x5a6878, ambientIntensity: 0.3, hemiSky: 0xdce8f4, hemiGround: 0x3c4658,
    torchColor: 0xa8d0ff, bloomStrength: 0.35, music: 'dungeon_frost', palette: [0x3c4658, 0x7a8ea4, 0xc8d8e8, 0xf0f4ff, 0x80c8ff], tint: 0xe6f0ff, snowCover: 0.92,
  },
  grid: { w: AYAZ_GRID.w, h: AYAZ_GRID.h },
  rooms: ROOMS,
  doors: [],
  packs: WORLD_PACKS,
  bosses: BOSSES,
  start: { pos: [6, 200], facing: 90 },
  exit: { pos: [10, 196] },
  outdoor: true,
  world: WORLD,
};
