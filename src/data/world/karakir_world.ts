import type {
  BorderSeg, ChestSpotDef, EntranceDef, GatherFieldDef, HiddenAreaDef, LandmarkDef, MiniBossDef, PackDef, PackMember, RareSpawnDef, RegionTheme,
  RoadDef, RoomDef, ShrineSpotDef, TileRect, VistaDef, WaypointDef, WorldBossSched, WorldRegion,
} from '../../types/dungeons';
import type { MusicId } from '../../types/audio';
import type { VfxId } from '../../types/vfx';
import { texUrl } from './layout';

/**
 * KARAKIR BOZKIRI world data (GDD_OPENWORLD section 1.8, levels 30-40). OWNER: content module.
 *
 * Same schema as Sisli Vadi (types/dungeons.ts WorldExtras): rooms + regions, roads, water, landmarks, waypoints, entrances, camps and
 * patrols as PackDefs, rares, mini-boss, world boss, shrines, chests, gathering, hidden areas, vistas. Authored here in TypeScript
 * (Sisli Vadi's come from its layout JSON). 200 x 200 tiles = 800 m (Sisli Vadi: 160 x 160); the walkable area is ~1.45x Sisli's.
 *
 * Four regions in a ring around the Kervansaray hub, one band each. Region ids r7..r10 continue the Sisli numbering on purpose:
 * `regionOfPack` (data/families.ts) reads `r<digits>_` from a pack id, and the open-world loot, quest `region` filter and the
 * discovery flags `world.region.<id>` all hang on that.
 *
 *   r7  Karakır Otlakları  30-33  west, golden grass, wolves / raiders / dust goblins, outpost Karakır Karakolu
 *   r8  Kızıl Çorak        33-36  south centre, red badlands, orcs / centipedes / stone, outpost Kervansaray (north edge)
 *   r9  Rüzgâr Yaylası     36-38  north centre, windswept plateau, burial mounds (kurgan), dark wargs
 *   r10 Ayaz Eteği         38-40  east, snow foothills, ice, mammoths, Buzul Tahtı gate, world boss Ulu-Boz
 *
 * Coordinates: tile coords (1 tile = 4 m). Rooms are tile-corner rects; every other point follows the (c + 0.5) * 4 convention.
 * Entry from Kuzgunkale's East Gate: tile (3, 100) facing +x; the way back (exit portal) stands at (3, 103).
 */

export const KARAKIR_GRID = { w: 200, h: 200 } as const;

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const room = (id: string, name: string, r: TileRect): RoomDef => ({ id, name, rect: r, floor: 'dirt', wall: 'cave', explicitDecor: true });

// ---------------------------------------------------------------------------------------------------------------------
// Rooms and regions
// ---------------------------------------------------------------------------------------------------------------------

export const ROOMS: RoomDef[] = [
  room('k0_dogu_yolu', 'Doğu Yolu', rect(0, 96, 8, 8)),
  room('k1_otlaklar', 'Karakır Otlakları', rect(8, 60, 68, 88)),
  room('k2_kizil_corak', 'Kızıl Çorak', rect(76, 112, 80, 80)),
  room('k3_ruzgar_yaylasi', 'Rüzgâr Yaylası', rect(76, 8, 80, 104)),
  room('k4_ayaz_etegi', 'Ayaz Eteği', rect(156, 16, 44, 160)),
];

/** Ground texture order of the layout: [grass, dirt, cobble, dark]. */
interface RegionSpec {
  id: string;
  roomId: string;
  name: string;
  levels: [number, number];
  fog: [number, number, number];
  hemi: [number, number, number];
  sun: [number, number];
  tex: [string, string, string, string];
  tint: number;
  music: MusicId;
  vfx: VfxId;
  vfxColor?: number;
}

const REGION_SPECS: RegionSpec[] = [
  { id: 'r7', roomId: 'k1_otlaklar', name: 'Karakır Otlakları', levels: [30, 33], fog: [0xd4c8a4, 30, 110], hemi: [0xf0e4c0, 0x504830, 1.4], sun: [0xffe8b0, 1.2],
    tex: ['tt1-grass-13', 'tt2-dirt-17', 'tt3-stone-03', 'tt2-dirt-15'], tint: 0xfff0c8, music: 'world_hills', vfx: 'ambient_dust', vfxColor: 0xd8c488 },
  { id: 'r8', roomId: 'k2_kizil_corak', name: 'Kızıl Çorak', levels: [33, 36], fog: [0xc89a78, 26, 105], hemi: [0xf0c8a0, 0x4a2c1c, 1.3], sun: [0xffc890, 1.25],
    tex: ['tt3-terrain-05', 'tt2-dirt-01', 'tt2-stone-17', 'tt2-dirt-09'], tint: 0xffd8b8, music: 'world_canyon', vfx: 'ambient_dust', vfxColor: 0xc88858 },
  { id: 'r9', roomId: 'k3_ruzgar_yaylasi', name: 'Rüzgâr Yaylası', levels: [36, 38], fog: [0xb8c4c0, 32, 105], hemi: [0xd0dce0, 0x3c4438, 1.3], sun: [0xf0f0e0, 1.1],
    tex: ['tt3-terrain-10', 'tt2-dirt-19', 'tt3-stone-23', 'tt3-terrain-17'], tint: 0xe8ecd8, music: 'world_vale', vfx: 'ambient_dust', vfxColor: 0xc8d0c0 },
  { id: 'r10', roomId: 'k4_ayaz_etegi', name: 'Ayaz Eteği', levels: [38, 40], fog: [0xc4d4e4, 22, 95], hemi: [0xd8e8ff, 0x384050, 1.35], sun: [0xe8f0ff, 1.0],
    tex: ['tt2-stone-15', 'tt2-stone-07', 'tt3-stone-21', 'tt3-stone-09'], tint: 0xe0ecff, music: 'dungeon_frost', vfx: 'ambient_snow' },
];

/** Signature silhouette per region: existing landmark recipes of WorldDecor (windmill, watch tower, red castle, obelisk ring). */
export const LANDMARKS: LandmarkDef[] = [
  { id: 'lm_karakir_gozcu', name: 'Karakır Gözcü Kulesi', regionId: 'r7', pos: [56, 72], recipe: 'watch_tower_ruin' },
  { id: 'lm_kizil_kale_k', name: 'Kızıl Kale Harabesi', regionId: 'r8', pos: [112, 178], recipe: 'red_castle_ruin' },
  { id: 'lm_ruzgar_degirmeni', name: 'Rüzgâr Değirmeni', regionId: 'r9', pos: [96, 40], recipe: 'windmill_cluster' },
  { id: 'lm_atalar_aniti', name: 'Atalar Anıtı', regionId: 'r9', pos: [130, 76], recipe: 'obelisk_shrine' },
  { id: 'lm_ayaz_gozcusu', name: 'Ayaz Gözcüsü', regionId: 'r10', pos: [164, 28], recipe: 'watch_tower_ruin' },
  { id: 'lm_karlibel_kalesi', name: 'Karlıbel Kalesi', regionId: 'r10', pos: [194, 132], recipe: 'red_castle_ruin' },
];

export const REGIONS: WorldRegion[] = REGION_SPECS.map((r): WorldRegion => {
  const theme: RegionTheme = {
    fogColor: r.fog[0], fogNear: r.fog[1], fogFar: r.fog[2],
    hemiSky: r.hemi[0], hemiGround: r.hemi[1], hemiIntensity: r.hemi[2],
    sunColor: r.sun[0], sunIntensity: r.sun[1],
    skyZenith: r.hemi[0], skyHorizon: r.fog[0],
    groundTex: { grass: texUrl(r.tex[0]), dirt: texUrl(r.tex[1]), cobble: texUrl(r.tex[2]), dark: texUrl(r.tex[3]) },
    groundTint: r.tint,
    music: r.music,
    ambientVfx: r.vfx, ambientColor: r.vfxColor,
  };
  return { id: r.id, roomId: r.roomId, name: r.name, levels: r.levels, theme, landmarkId: LANDMARKS.find((l) => l.regionId === r.id)?.id };
});

/** Region id -> room id (packs and POIs resolve their room through this). */
export const ROOM_OF_REGION: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.roomId]));

export const WATER = [
  { id: 'kara_gol', rect: rect(52, 92, 12, 9) },
  { id: 'donuk_gol', rect: rect(176, 84, 12, 12) },
];

/** Wall dressing by the walkable side: grass edge = trees, badlands = canyon cliffs, plateau / foothills = rock cliffs. */
const edgesOf = (r: TileRect, style: BorderSeg['style']): BorderSeg[] => [
  { a: [r.x, r.z], b: [r.x + r.w, r.z], style },
  { a: [r.x, r.z + r.h], b: [r.x + r.w, r.z + r.h], style },
  { a: [r.x, r.z], b: [r.x, r.z + r.h], style },
  { a: [r.x + r.w, r.z], b: [r.x + r.w, r.z + r.h], style },
];
export const BORDERS: BorderSeg[] = [
  ...edgesOf(ROOMS[2].rect, 'canyon'),
  ...edgesOf(ROOMS[3].rect, 'cliff'),
  ...edgesOf(ROOMS[4].rect, 'cliff'),
];

// ---------------------------------------------------------------------------------------------------------------------
// Roads (tile coords; they stay inside the rooms)
// ---------------------------------------------------------------------------------------------------------------------

export const ROADS: RoadDef[] = [
  { id: 'yol_dogu', kind: 'cobble', width: 4, pts: [[1, 100], [10, 100], [16, 104], [22, 106]] },
  { id: 'yol_karakol_ici', kind: 'cobble', width: 3, pts: [[22, 106], [38, 106]] },
  { id: 'yol_kervan', kind: 'dirt', width: 3.4, pts: [[38, 106], [50, 112], [64, 116], [76, 120], [92, 124], [111, 128]] },
  { id: 'yol_yayla', kind: 'dirt', width: 3.4, pts: [[116, 124], [114, 104], [108, 84], [110, 60], [112, 40]] },
  { id: 'yol_ayaz', kind: 'dirt', width: 3.4, pts: [[121, 128], [140, 126], [156, 116], [168, 96], [172, 76], [176, 60]] },
  { id: 'yol_corak', kind: 'dirt', width: 3.4, pts: [[116, 132], [114, 150], [108, 170]] },
  { id: 'yol_otlak', kind: 'dirt', width: 3.4, pts: [[30, 100], [34, 86], [44, 76], [48, 74]] },
  { id: 'yol_buzul', kind: 'dirt', width: 3, pts: [[176, 60], [184, 56], [190, 56]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Waypoints (6), entrance, world boss
// ---------------------------------------------------------------------------------------------------------------------

export const WAYPOINTS: WaypointDef[] = [
  { id: 'wp_karakir_karakol', name: 'Karakol Taşı', pos: [31, 108.5], regionId: 'r7', villageId: 'koy_karakir_karakolu' },
  { id: 'wp_karakir_otlak', name: 'Otlak Taşı', pos: [48, 74], regionId: 'r7' },
  { id: 'wp_karakir_kervansaray', name: 'Kervansaray Taşı', pos: [117, 129.5], regionId: 'r8', villageId: 'kamp_kervansaray' },
  { id: 'wp_karakir_corak', name: 'Kızıl Kale Taşı', pos: [108, 170], regionId: 'r8' },
  { id: 'wp_karakir_yayla', name: 'Yayla Taşı', pos: [112, 40], regionId: 'r9' },
  { id: 'wp_karakir_ayaz', name: 'Ayaz Geçidi Taşı', pos: [176, 60], regionId: 'r10' },
];

/** Buzul Tahtı (ice cave mouth at the Ayaz Geçidi). Gölge Tapınağı (level 42) is outside this slice. */
export const ENTRANCES: EntranceDef[] = [
  { id: 'ent_buzul_tahti', name: 'Buzul Tahtı Girişi', dungeonId: 'buzul_tahti', pos: [190, 56], facing: -90, minLevel: 30, regionId: 'r10', look: 'ice' },
];

export const WORLD_BOSS_ID = 'wb_ulu_boz';
/** Ulu-Boz: first spawn 10 min after a level 38+ player enters Ayaz Eteği, 45 min respawn, two warnings. */
export const WORLD_BOSSES: WorldBossSched[] = [
  { bossId: WORLD_BOSS_ID, firstSec: 600, respawnSec: 2700, announceSec: [120, 20], minLevelToStart: 38, announceText: 'Buzul çanağında yer sarsılıyor! Ulu-Boz uyanıyor.' },
];
/** Boss arena centre (tile); the BossDef arena in data/enemies_karakir.ts is the same point in metres. */
export const BOSS_ARENA: [number, number] = [184, 148];

// ---------------------------------------------------------------------------------------------------------------------
// Camps (36) and patrols (8). Camps first: the enemy id of member m of pack p is DUNGEON_ENEMY_ID_BASE + p * 24 + m.
// ---------------------------------------------------------------------------------------------------------------------

type Members = [enemyId: string, count: number][];

interface CampSpec {
  id: string; name: string; at: [number, number]; radius: number; lv: [number, number]; respawn: number; members: Members;
  /** FARM_TABLES id (loot.ts) = a farm spot; `elite` = leader camp; `dormant` = bones / coffins that wake near a player. */
  farm?: string; elite?: boolean; dormant?: boolean; note?: string;
}
interface PatrolSpec { id: string; name: string; lv: [number, number]; respawn: number; members: Members; loop: [number, number][] }

const expand = (m: Members): string[] => m.flatMap(([id, n]) => Array.from({ length: n }, () => id));
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Golden-angle spiral inside the camp radius (the Sisli Vadi layout, see camps.ts). */
function spread(ids: string[], radiusM: number): PackMember[] {
  const rT = Math.min(2.6, (radiusM / 4) * 0.55);
  return ids.map((enemyId, i) => {
    const a = i * 2.39996;
    const d = i === 0 && ids.length > 1 ? 0 : rT * Math.sqrt((i + 0.5) / ids.length);
    return { enemyId, offset: [r2(Math.sin(a) * d), r2(Math.cos(a) * d)] };
  });
}

const regionOf = (id: string): string => /^(r\d+)_/.exec(id)?.[1] ?? 'r7';

const CAMP_SPECS: CampSpec[] = [
  // ---- R7 Karakır Otlakları (30-33): 10 camps
  { id: 'r7_c01', name: 'Çoban Ağılı Kurtları', at: [22, 84], radius: 12, lv: [30, 31], respawn: 60, members: [['kb_kurt', 6]], note: 'Çobanların terk ettiği ağıl' },
  { id: 'r7_c02', name: 'Toz Goblin Obası', at: [46, 68], radius: 13, lv: [30, 32], respawn: 70, members: [['kb_goblin', 5], ['kb_goblin_saman', 1]], note: 'Keçe çadırlar, kuru ot yığınları' },
  { id: 'r7_c03', name: 'Kurt Çayırı', at: [16, 126], radius: 14, lv: [30, 31], respawn: 60, members: [['kb_kurt', 4], ['kb_ari', 3]] },
  { id: 'r7_c04', name: 'Dikenli Domuz Otlağı', at: [34, 134], radius: 13, lv: [31, 32], respawn: 65, members: [['kb_domuz', 5]] },
  { id: 'r7_c05', name: 'Haydut Konak Yeri', at: [52, 122], radius: 14, lv: [31, 33], respawn: 100, farm: 'farm_bandit_fort', elite: true,
    members: [['kb_haydut', 4], ['kb_haydut_okcu', 2], ['kb_haydut_pehlivan', 1]], note: 'Yıkık han, haydut kampı' },
  { id: 'r7_c06', name: 'Toz Arısı Kovanı', at: [66, 72], radius: 12, lv: [31, 32], respawn: 60, members: [['kb_ari', 6]] },
  { id: 'r7_c07', name: 'Bozkır Ayıları', at: [68, 128], radius: 14, lv: [32, 33], respawn: 90, elite: true, members: [['kb_ayi', 2], ['kb_kurt', 3]] },
  { id: 'r7_c08', name: 'Gözcü Kulesi Haydutları', at: [64, 82], radius: 13, lv: [32, 33], respawn: 80, members: [['kb_haydut_okcu', 4], ['kb_haydut', 3]] },
  { id: 'r7_c09', name: 'Otlak Sınırı Goblinleri', at: [14, 70], radius: 13, lv: [30, 31], respawn: 60, members: [['kb_goblin', 6], ['kb_goblin_saman', 2]] },
  { id: 'r7_c10', name: 'Kurt Kovuğu', at: [70, 108], radius: 13, lv: [32, 33], respawn: 70, members: [['kb_kurt', 4], ['kb_domuz', 3]] },
  // ---- R8 Kızıl Çorak (33-36): 10 camps
  { id: 'r8_c01', name: 'Kızıl Çıyan Çukuru', at: [90, 126], radius: 13, lv: [33, 34], respawn: 70, members: [['kb_ciyan', 7]] },
  { id: 'r8_c02', name: 'Çorak Ork Karakolu', at: [92, 150], radius: 15, lv: [34, 35], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['kb_ork', 4], ['kb_ork_atici', 2], ['kb_ork_saman', 1], ['kb_ork_cellat', 1]], note: 'Kazıklı sur, kızıl sancaklar' },
  { id: 'r8_c03', name: 'Kızıl Örümcek İni', at: [84, 176], radius: 14, lv: [33, 35], respawn: 90, farm: 'farm_poison_cave', elite: true, members: [['kb_orumcek', 5], ['kb_orumcek_dev', 1]] },
  { id: 'r8_c04', name: 'Kızıl Taş Ocağı', at: [128, 150], radius: 14, lv: [35, 36], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['kb_golem', 3]] },
  { id: 'r8_c05', name: 'Kül Çatlağı', at: [146, 134], radius: 14, lv: [34, 36], respawn: 100, farm: 'farm_ember_vent', elite: true, members: [['kb_iblis', 5], ['kb_kor', 1]] },
  { id: 'r8_c06', name: 'Kızıl Gergedan Otlağı', at: [130, 184], radius: 15, lv: [35, 36], respawn: 100, farm: 'farm_rhino_pasture', elite: true, members: [['kb_gergedan', 3], ['kb_ciyan', 3]] },
  { id: 'r8_c07', name: 'Çorak Avcıları', at: [100, 138], radius: 13, lv: [34, 35], respawn: 80, members: [['kb_ork', 5], ['kb_ork_atici', 2]] },
  { id: 'r8_c08', name: 'Kızıl Kale Muhafızları', at: [122, 172], radius: 14, lv: [35, 36], respawn: 110, elite: true, members: [['kb_ork_cellat', 2], ['kb_ork', 4], ['kb_ork_saman', 1]] },
  { id: 'r8_c09', name: 'Dev Örümcek Yuvası', at: [150, 160], radius: 14, lv: [35, 36], respawn: 100, elite: true, members: [['kb_orumcek_dev', 2], ['kb_orumcek', 4]] },
  { id: 'r8_c10', name: 'Ork Sürüsü Obası', at: [90, 166], radius: 13, lv: [34, 36], respawn: 80, members: [['kb_ork', 5], ['kb_ork_atici', 1]] },
  // ---- R9 Rüzgâr Yaylası (36-38): 8 camps
  { id: 'r9_c01', name: 'Kurgan Mezarlığı', at: [136, 62], radius: 14, lv: [36, 37], respawn: 120, farm: 'farm_cursed_court', dormant: true,
    members: [['kb_iskelet', 5], ['kb_iskelet_okcu', 2], ['kb_iskelet_buyucu', 1]], note: 'Toprak höyükler, devrik taşlar' },
  { id: 'r9_c02', name: 'Rüzgâr Kurtları', at: [92, 60], radius: 13, lv: [36, 37], respawn: 80, elite: true, members: [['kb_yayla_kurdu', 3]] },
  { id: 'r9_c03', name: 'Yayla Ayıları', at: [150, 40], radius: 14, lv: [37, 38], respawn: 100, elite: true, members: [['kb_yayla_ayisi', 2], ['kb_yayla_kurdu', 2]] },
  { id: 'r9_c04', name: 'Hortlak Çayırı', at: [100, 92], radius: 13, lv: [36, 38], respawn: 90, members: [['kb_hortlak', 5], ['kb_iskelet_buyucu', 1]] },
  { id: 'r9_c05', name: 'Wargın Yuvası', at: [84, 30], radius: 14, lv: [37, 38], respawn: 100, elite: true, members: [['kb_warg', 2], ['kb_yayla_kurdu', 2]] },
  { id: 'r9_c06', name: 'Kurgan Muhafızları', at: [118, 20], radius: 14, lv: [37, 38], respawn: 120, dormant: true, elite: true,
    members: [['kb_iskelet_muhafiz', 2], ['kb_iskelet', 4]] },
  { id: 'r9_c07', name: 'Şövalyeler Anıtı', at: [140, 98], radius: 14, lv: [37, 38], respawn: 110, elite: true, members: [['kb_sovalye', 2], ['kb_hortlak', 3]] },
  { id: 'r9_c08', name: 'Yayla Ork Öncüleri', at: [88, 76], radius: 13, lv: [36, 37], respawn: 90, members: [['kb_ork_cellat', 1], ['kb_ork_atici', 3], ['kb_ork', 3]] },
  // ---- R10 Ayaz Eteği (38-40): 8 camps
  { id: 'r10_c01', name: 'Ayaz Kurtları', at: [170, 34], radius: 13, lv: [38, 39], respawn: 80, members: [['kb_ayaz_kurdu', 5], ['kb_ayaz_warg', 1]] },
  { id: 'r10_c02', name: 'Kar Ayısı İni', at: [190, 76], radius: 14, lv: [38, 39], respawn: 100, elite: true, members: [['kb_ayaz_ayisi', 2], ['kb_ayaz_kurdu', 3]] },
  { id: 'r10_c03', name: 'Buz Golemleri', at: [166, 106], radius: 14, lv: [39, 40], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['kb_buz_golemi', 3]] },
  { id: 'r10_c04', name: 'Ayaz Ork Çadırları', at: [190, 108], radius: 15, lv: [38, 40], respawn: 120, farm: 'farm_orc_outpost', elite: true, members: [['kb_ayaz_ork', 5], ['kb_ayaz_cellat', 1]] },
  { id: 'r10_c05', name: 'Donmuş Hortlaklar', at: [166, 168], radius: 13, lv: [39, 40], respawn: 100, members: [['kb_buz_hortlak', 5]] },
  { id: 'r10_c06', name: 'Mamut Sürüsü', at: [164, 148], radius: 15, lv: [39, 40], respawn: 140, elite: true, members: [['kb_mamut', 2], ['kb_ayaz_kurdu', 2]] },
  { id: 'r10_c07', name: 'Buz Örümcekleri', at: [192, 32], radius: 13, lv: [38, 40], respawn: 80, members: [['kb_ayaz_orumcek', 6]] },
  { id: 'r10_c08', name: 'Karlıbel Muhafızları', at: [190, 166], radius: 14, lv: [39, 40], respawn: 120, elite: true, members: [['kb_ayaz_cellat', 2], ['kb_ayaz_ork', 3], ['kb_ayaz_warg', 1]] },
];

const PATROL_SPECS: PatrolSpec[] = [
  { id: 'r7_p01', name: 'Haydut Devriyesi', lv: [31, 32], respawn: 90, members: [['kb_haydut', 3], ['kb_haydut_okcu', 1]], loop: [[38, 88], [48, 86], [50, 78], [40, 80]] },
  { id: 'r7_p02', name: 'Kurt Sürüsü', lv: [30, 32], respawn: 90, members: [['kb_kurt', 5]], loop: [[20, 134], [28, 142], [44, 140], [40, 128]] },
  { id: 'r8_p01', name: 'Ork Devriyesi', lv: [33, 35], respawn: 100, members: [['kb_ork', 3], ['kb_ork_atici', 1]], loop: [[96, 116], [106, 118], [104, 134], [94, 132]] },
  { id: 'r8_p02', name: 'Kızıl Şaman Alayı', lv: [34, 36], respawn: 100, members: [['kb_ork', 3], ['kb_ork_saman', 1]], loop: [[132, 118], [146, 116], [148, 124], [134, 124]] },
  { id: 'r9_p01', name: 'Kurgan Nöbetçileri', lv: [36, 37], respawn: 100, members: [['kb_iskelet', 3], ['kb_iskelet_okcu', 1]], loop: [[92, 48], [104, 52], [106, 64], [94, 62]] },
  { id: 'r9_p02', name: 'Rüzgâr Sürüsü', lv: [37, 38], respawn: 100, members: [['kb_warg', 2], ['kb_yayla_kurdu', 1]], loop: [[146, 76], [152, 86], [148, 100], [140, 92]] },
  { id: 'r10_p01', name: 'Ayaz Devriyesi', lv: [38, 39], respawn: 100, members: [['kb_ayaz_ork', 3], ['kb_ayaz_kurdu', 1]], loop: [[162, 66], [170, 74], [164, 82], [158, 74]] },
  { id: 'r10_p02', name: 'Buz Hortlakları', lv: [39, 40], respawn: 100, members: [['kb_buz_hortlak', 3], ['kb_buz_golemi', 1]], loop: [[162, 120], [172, 124], [170, 134], [160, 130]] },
];

function campOf(s: CampSpec): PackDef {
  const ids = expand(s.members);
  const pack: PackDef = {
    id: s.id,
    roomId: ROOM_OF_REGION[regionOf(s.id)],
    center: s.at,
    members: spread(ids, s.radius),
    respawnSec: s.respawn,
    levelRange: s.lv,
    radius: s.radius,
    kind: s.farm ? 'farm' : s.elite ? 'elite' : 'camp',
    note: [s.name, s.note].filter(Boolean).join(' · '),
  };
  if (s.farm) pack.lootTable = s.farm;
  if (s.dormant) pack.dormant = { kind: 'coffin', wakeRadius: 12 };
  return pack;
}

function patrolOf(s: PatrolSpec): PackDef {
  return {
    id: s.id,
    roomId: ROOM_OF_REGION[regionOf(s.id)],
    center: s.loop[0],
    members: spread(expand(s.members), 8),
    patrol: s.loop,
    respawnSec: s.respawn,
    levelRange: s.lv,
    radius: 8,
    kind: 'patrol',
    note: s.name,
  };
}

export const WORLD_CAMPS: PackDef[] = CAMP_SPECS.map(campOf);
export const WORLD_PATROLS: PackDef[] = PATROL_SPECS.map(patrolOf);
export const WORLD_PACKS: PackDef[] = [...WORLD_CAMPS, ...WORLD_PATROLS];

// ---------------------------------------------------------------------------------------------------------------------
// Rares (2), mini-boss (1), world boss placement
// ---------------------------------------------------------------------------------------------------------------------

export const RARES: RareSpawnDef[] = [
  { id: 'rare_kb_alaca_yele', enemyId: 'rare_kb_alaca_yele', level: 32, spots: [[24, 76], [44, 138], [66, 118]], respawnMin: [10, 14], announce: true, lootTable: 'loot_rare_kb_alaca_yele' },
  { id: 'rare_kb_kor_pehlivan', enemyId: 'rare_kb_kor_pehlivan', level: 35, spots: [[98, 172], [148, 148], [88, 142]], respawnMin: [10, 15], announce: true, lootTable: 'loot_rare_kb_kor_pehlivan' },
];

export const MINIBOSSES: MiniBossDef[] = [
  { id: 'mb_kb_horgan', enemyId: 'mb_kb_horgan', level: 35, lair: [138, 172], regionId: 'r8', respawnMin: 20, lootTable: 'loot_mb_kb_horgan' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Shrines, chests, cursed chests, gathering, hidden areas, vistas
// ---------------------------------------------------------------------------------------------------------------------

export const SHRINES: ShrineSpotDef[] = [
  { id: 'sh_r7_a', type: 'shrine_haste', regionId: 'r7', pos: [18, 112] },
  { id: 'sh_r7_b', type: 'shrine_wisdom', regionId: 'r7', pos: [60, 64] },
  { id: 'sh_r8_a', type: 'shrine_power', regionId: 'r8', pos: [104, 160] },
  { id: 'sh_r8_b', type: 'shrine_ward', regionId: 'r8', pos: [150, 176] },
  { id: 'sh_r9_a', type: 'shrine_greed', regionId: 'r9', pos: [84, 52] },
  { id: 'sh_r9_b', type: 'shrine_haste', regionId: 'r9', pos: [124, 100] },
  { id: 'sh_r10_a', type: 'shrine_ward', regionId: 'r10', pos: [166, 46] },
  { id: 'sh_r10_b', type: 'shrine_power', regionId: 'r10', pos: [196, 128] },
];

const chest = (id: string, kind: ChestSpotDef['kind'], regionId: string, pos: [number, number]): ChestSpotDef => ({ id, kind, regionId, pos, respawnSec: 1800 });
export const CHESTS: ChestSpotDef[] = [
  chest('ch_r7_a', 'chest_wood', 'r7', [12, 76]), chest('ch_r7_b', 'chest_wood', 'r7', [70, 140]), chest('ch_r7_c', 'chest_iron', 'r7', [46, 104]),
  chest('ch_r8_a', 'chest_iron', 'r8', [84, 118]), chest('ch_r8_b', 'chest_iron', 'r8', [146, 184]), chest('ch_r8_c', 'chest_gold', 'r8', [120, 188]),
  chest('ch_r9_a', 'chest_iron', 'r9', [150, 16]), chest('ch_r9_b', 'chest_iron', 'r9', [80, 100]), chest('ch_r9_c', 'chest_gold', 'r9', [116, 12]),
  chest('ch_r10_a', 'chest_iron', 'r10', [198, 22]), chest('ch_r10_b', 'chest_gold', 'r10', [160, 172]), chest('ch_r10_c', 'chest_gold', 'r10', [198, 170]),
];

export const CURSED = [
  { id: 'cc_r7', regionId: 'r7', pos: [28, 134] as [number, number] },
  { id: 'cc_r8', regionId: 'r8', pos: [150, 118] as [number, number] },
  { id: 'cc_r9', regionId: 'r9', pos: [148, 66] as [number, number] },
  { id: 'cc_r10', regionId: 'r10', pos: [162, 92] as [number, number] },
];

/** Gathering tables are `gather_<kind>_<region>` (loot.ts GATHER_TABLES). */
const gather = (id: string, kind: GatherFieldDef['kind'], regionId: string, center: [number, number], radius: number, count: number, respawnSec: number): GatherFieldDef =>
  ({ id, kind, regionId, center, radius, count, respawnSec, lootTable: `gather_${kind}_${regionId}` });
export const GATHER: GatherFieldDef[] = [
  gather('gf_r7_ore', 'ore', 'r7', [14, 102], 4, 4, 300), gather('gf_r7_herb', 'herb', 'r7', [70, 104], 4, 6, 240),
  gather('gf_r8_ore', 'ore', 'r8', [80, 170], 4, 4, 300), gather('gf_r8_herb', 'herb', 'r8', [150, 146], 5, 6, 240),
  gather('gf_r9_ore', 'ore', 'r9', [100, 16], 4, 4, 300), gather('gf_r9_herb', 'herb', 'r9', [146, 24], 5, 6, 240),
  gather('gf_r10_ore', 'ore', 'r10', [196, 46], 4, 4, 300), gather('gf_r10_herb', 'herb', 'r10', [170, 172], 4, 6, 240),
];

export const HIDDEN: HiddenAreaDef[] = [
  { id: 'hd_r7', name: 'Atalar Çadırı', regionId: 'r7', pos: [10, 132], radius: 3, xpPct: 8, rewards: ['chest_wood', 'Kurt Postu x3'] },
  { id: 'hd_r8', name: 'Kayıp Kervan', regionId: 'r8', pos: [84, 188], radius: 3, xpPct: 8, rewards: ['chest_iron', '2 Orta Can İksiri'] },
  { id: 'hd_r9', name: 'Rüzgârın Kapısı', regionId: 'r9', pos: [152, 104], radius: 3, xpPct: 8, rewards: ['chest_iron x2', 'Efsun Nesnesi %25'] },
  { id: 'hd_r10', name: 'Donmuş Tapınak', regionId: 'r10', pos: [198, 100], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
];

export const VISTAS: VistaDef[] = [
  { id: 'vs_r7', name: 'Gözcü Tepesi', regionId: 'r7', pos: [10, 62], xpPct: 6 },
  { id: 'vs_r8', name: 'Kızıl Uçurum', regionId: 'r8', pos: [152, 190], xpPct: 6 },
  { id: 'vs_r9', name: 'Rüzgâr Zirvesi', regionId: 'r9', pos: [150, 10], xpPct: 6 },
  { id: 'vs_r10', name: 'Ayaz Tepesi', regionId: 'r10', pos: [198, 18], xpPct: 6 },
];
