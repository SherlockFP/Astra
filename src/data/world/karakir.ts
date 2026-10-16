import type { BossPlacement, DungeonDef, WorldExtras } from '../../types/dungeons';
import {
  BORDERS, BOSS_ARENA, CHESTS, CURSED, ENTRANCES, GATHER, HIDDEN, KARAKIR_GRID, KARAKIR_ZONE_SRC, LANDMARKS, MINIBOSSES, RARES, REGIONS, ROADS, ROOMS,
  ROOM_OF_REGION, SHRINES, VISTAS, WATER, WAYPOINTS, WORLD_BOSSES, WORLD_BOSS_ID, WORLD_PACKS,
} from './karakir_world';
import { VILLAGES } from './karakir_villages';
import { KARAKIR_METIN_SPOTS, KARAKIR_METIN_TIERS } from './karakir_metin';
import { perfOf } from './layout';
import KARAKIR_DECOR from './karakir_decor.json' with { type: 'json' };
import { zoneDecor, zoneFlats, zoneLandmarks } from './decor_zones';

/**
 * KARAKIR BOZKIRI, open-world map 2 (levels 30-45, GDD_OPENWORLD section 1.8). OWNER: content module.
 *
 * Assembles the typed pieces of this folder, the same shape as sisli_vadi.ts (DungeonDef + WorldExtras, no new engine system):
 *  - karakir_world.ts     rooms, 6 regions (r7..r12), roads, water, landmarks, waypoints, Buzul Tahtı gate, 74 camps + 16 patrols,
 *                         4 rares, 2 mini-bosses, the world boss schedule, shrines, chests, gathering, hidden areas, vistas, the zone block
 *  - karakir_villages.ts  Karakır Karakolu (fort), Kervansaray (caravan hub) and Kül Ocağı (ash outpost): props, NPCs, gates
 *  - karakir_metin.ts     six metin tiers (one per region, levels 31-44) and 20 spots
 *  - karakir_quests.ts    22 quests (mq_20..22 + zone chains + standalone), appended to QUESTS in quests.ts
 *  - ../enemies_karakir.ts  kb_* mobs, rare_kb_*, mb_kb_*, wb_ulu_boz (registered at the end of data/enemies.ts)
 *
 * Entry: tile (4, 150) facing +x (90 deg) from Kuzgunkale's East Gate (`dogu_kapisi`, data/town.ts; TownScene.exitLock: level 30 or the
 * quest mq_19); the exit portal stands at tile (4, 153). Rooms are the region rects + the entry strip; no doors, connectivity is by
 * adjacency. 400 x 300 tiles = 1600 x 1200 m, streamed (KARAKIR_ZONE_SRC: `zone` block, gridOf / perfOf). Registered in OPEN_ZONES
 * (data/dungeons/index.ts).
 */

/** Streaming / AI budgets (GDD_OPENWORLD section 1.5), the same as Sisli Vadi; the zone block of karakir_world.ts sets the size. */
const PERF: WorldExtras['perf'] = perfOf(KARAKIR_ZONE_SRC, { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 });

/**
 * Rolling terrain (docs/ENGINE_BIGMAPS.md section 10), 4 m cells: steppe hills of 8-15 m in the west, badlands with sharper crests, the
 * Rüzgâr plateau raised 8 m, Ayaz foothills climbing east, a flat ash plain and the Kartal Sırtı ridge (about 20 m above its valley).
 * Villages, roads, landmarks, camps' stones and POIs are flattened by the engine (world/Relief.ts); the two lakes sit in basins.
 */
/** Generated life of the zone (tools/world-fill.mjs --zone karakir, the dark rock palette). */
const DECOR = zoneDecor(KARAKIR_DECOR, 'karakir');

const RELIEF: WorldExtras['relief'] = {
  seed: 'karakir_bozkiri',
  cellM: 4,
  profile: { amp: 8, scale: 150 },
  regions: {
    r7: { amp: 12, scale: 150 },
    r8: { amp: 12, scale: 120, ridged: 0.35 },
    r9: { amp: 7, scale: 190, base: 8 },
    r10: { amp: 14, scale: 140, base: 6, ridged: 0.25 },
    r11: { amp: 4, scale: 210 },
    r12: { amp: 11, scale: 150, base: 6, ridged: 0.5 },
  },
  edge: { rise: 18, width: 90 },
  ridges: [{ pts: [[386, 16], [382, 56], [388, 96], [380, 138]], height: 20, width: 60 }],
  flat: zoneFlats(DECOR),
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
  landmarks: [...LANDMARKS, ...zoneLandmarks(KARAKIR_DECOR)],
  decor: DECOR,
  metin: { tiers: KARAKIR_METIN_TIERS, spots: KARAKIR_METIN_SPOTS },
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

const BOSSES: BossPlacement[] = [{ bossId: WORLD_BOSS_ID, roomId: ROOM_OF_REGION.r10, pos: BOSS_ARENA, facing: 0, order: 1 }];

export const KARAKIR_BOZKIRI: DungeonDef = {
  id: 'karakir_bozkiri',
  name: 'Karakır Bozkırı',
  shortName: 'Bozkır',
  lore: "Doğu Kapısı'ndan çıkan yol, rüzgârın hiç dinmediği kurak bir bozkıra, kül ovalarına ve karlı eteklere açılır.",
  levelRange: [30, 45],
  timerSec: 0,
  forcesRequired: 0,
  theme: {
    fogColor: 0xd4c8a4, fogNear: 30, fogFar: 110, ambient: 0x706850, ambientIntensity: 0.32, hemiSky: 0xf0e4c0, hemiGround: 0x504830,
    torchColor: 0xffa050, bloomStrength: 0.3, music: 'world_hills', palette: [0x504830, 0x8a7a50, 0xc89a78, 0xd4c8a4, 0xc4d4e4], tint: 0xfff0d0,
  },
  grid: { w: KARAKIR_GRID.w, h: KARAKIR_GRID.h },
  rooms: ROOMS,
  doors: [],
  packs: WORLD_PACKS,
  bosses: BOSSES,
  start: { pos: [4, 150], facing: 90 },
  exit: { pos: [4, 153] },
  outdoor: true,
  world: WORLD,
};
