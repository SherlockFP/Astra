import type { BossPlacement, DungeonDef, WorldExtras } from '../../types/dungeons';
import {
  BORDERS, BOSS_ARENA, CHESTS, CURSED, ENTRANCES, GATHER, HIDDEN, KARAKIR_GRID, LANDMARKS, MINIBOSSES, RARES, REGIONS, ROADS, ROOMS,
  ROOM_OF_REGION, SHRINES, VISTAS, WATER, WAYPOINTS, WORLD_BOSSES, WORLD_BOSS_ID, WORLD_PACKS,
} from './karakir_world';
import { VILLAGES } from './karakir_villages';
import { KARAKIR_METIN_SPOTS, KARAKIR_METIN_TIERS } from './karakir_metin';

/**
 * KARAKIR BOZKIRI, open-world map 2 (levels 30-40 in this slice, GDD_OPENWORLD section 1.8). OWNER: content module.
 *
 * Assembles the typed pieces of this folder, the same shape as sisli_vadi.ts (DungeonDef + WorldExtras, no new engine system):
 *  - karakir_world.ts     rooms, 4 regions (r7..r10), roads, water, landmarks, waypoints, Buzul Tahtı gate, 36 camps + 8 patrols,
 *                         2 rares, 1 mini-boss, the world boss schedule, shrines, chests, gathering, hidden areas, vistas
 *  - karakir_villages.ts  Karakır Karakolu (fort) and Kervansaray (caravan hub): props, NPCs, gates
 *  - karakir_metin.ts     four metin tiers (one per region, levels 31-39) and 12 spots (three per region)
 *  - karakir_quests.ts    12 quests (mq_20..22 + zone chain + standalone), appended to QUESTS in quests.ts
 *  - ../enemies_karakir.ts  kb_* mobs, rare_kb_*, mb_kb_horgan, wb_ulu_boz (registered at the end of data/enemies.ts)
 *
 * Entry: tile (3, 100) facing +x (90 deg) from Kuzgunkale's East Gate (`dogu_kapisi`, data/town.ts; TownScene.exitLock: level 30 or the
 * quest mq_19); the exit portal stands at tile (3, 103). Rooms are the region rects + the entry strip; no doors, connectivity is by
 * adjacency. 200 x 200 tiles = 800 m. Registered in OPEN_ZONES (data/dungeons/index.ts).
 */

/** Streaming / AI budgets (GDD_OPENWORLD section 1.5), the same as Sisli Vadi. */
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
  lore: "Doğu Kapısı'ndan çıkan yol, rüzgârın hiç dinmediği kurak bir bozkıra ve karlı eteklere açılır.",
  levelRange: [30, 40],
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
  start: { pos: [3, 100], facing: 90 },
  exit: { pos: [3, 103] },
  outdoor: true,
  world: WORLD,
};
