import type {
  BorderSeg, ChestSpotDef, EntranceDef, GatherFieldDef, HiddenAreaDef, LandmarkDef, MiniBossDef, PackDef, PackMember, RareSpawnDef, RegionTheme,
  RoadDef, RoomDef, ShrineSpotDef, TileRect, VistaDef, WaypointDef, WorldBossSched, WorldRegion,
} from '../../types/dungeons';
import type { MusicId } from '../../types/audio';
import type { VfxId } from '../../types/vfx';
import { gridOf, texUrl, type LZone, type ZoneSource } from './layout';

/**
 * KARAKIR BOZKIRI world data (GDD_OPENWORLD section 1.8, levels 30-45). OWNER: content module.
 *
 * Same schema as Sisli Vadi (types/dungeons.ts WorldExtras): rooms + regions, roads, water, landmarks, waypoints, entrances, camps and
 * patrols as PackDefs, rares, mini-bosses, world boss, shrines, chests, gathering, hidden areas, vistas. Authored here in TypeScript
 * (Sisli Vadi's come from its layout JSON).
 *
 * ZONE: 1600 x 1200 m (400 x 300 tiles), a streamed zone (docs/ENGINE_BIGMAPS.md section 6): KARAKIR_ZONE is the `zone` block of a
 * layout, gridOf / perfOf (layout.ts) turn it into the grid and the streaming budgets. Terrain and scenery build in 64 m chunks around
 * the player. The v1 map (200 x 200 tiles) was rescaled by 1.5 on both axes into the west 300 x 300 tiles; the east strip (x 300..400)
 * holds the two new regions.
 *
 * Six regions in a ring that climbs east, one band each. Region ids r7..r12 continue the Sisli numbering on purpose:
 * `regionOfPack` (data/families.ts) reads `r<digits>_` from a pack id, and the open-world loot, quest `region` filter and the
 * discovery flags `world.region.<id>` all hang on that.
 *
 *   r7  Karakır Otlakları  30-33  west, golden grass, wolves / raiders / dust goblins, outpost Karakır Karakolu
 *   r8  Kızıl Çorak        33-36  south centre, red badlands, orcs / centipedes / stone
 *   r9  Rüzgâr Yaylası     36-38  north centre, windswept plateau, burial mounds (kurgan), dark wargs
 *   r10 Ayaz Eteği         38-40  east centre, snow foothills, ice, mammoths, Buzul Tahtı gate, world boss Ulu-Boz
 *   r11 Kül Ovası          40-43  south-east, ash plain, ash ghouls, will-o'-wisps, outpost Kül Ocağı, mini-boss Kül Efendisi
 *   r12 Kartal Sırtı       43-45  north-east, eagle ridge, cliff bandits, eagle priests, rare Kartal Kralı
 *
 * Coordinates: tile coords (1 tile = 4 m). Rooms are tile-corner rects; every other point follows the (c + 0.5) * 4 convention.
 * Entry from Kuzgunkale's East Gate: tile (4, 150) facing +x; the way back (exit portal) stands at (4, 153).
 */

/** The zone block of this map (layout.ts `zone`): 1600 x 1200 m, streams above 800 m (the default 'auto'). */
export const KARAKIR_ZONE: LZone = { sizeM: [1600, 1200], stream: 'auto', chunkM: 64 };
/** Zone source for gridOf / perfOf. `grid` is the classic tile count, used only when `zone` is absent. */
export const KARAKIR_ZONE_SRC: ZoneSource = { grid: { w: 300, h: 300 }, tileSize: 4, zone: KARAKIR_ZONE };
export const KARAKIR_GRID: { w: number; h: number } = gridOf(KARAKIR_ZONE_SRC);

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const room = (id: string, name: string, r: TileRect): RoomDef => ({ id, name, rect: r, floor: 'dirt', wall: 'cave', explicitDecor: true });

// ---------------------------------------------------------------------------------------------------------------------
// Rooms and regions
// ---------------------------------------------------------------------------------------------------------------------

export const ROOMS: RoomDef[] = [
  room('k0_dogu_yolu', 'Doğu Yolu', rect(0, 144, 12, 12)),
  room('k1_otlaklar', 'Karakır Otlakları', rect(12, 90, 102, 132)),
  room('k2_kizil_corak', 'Kızıl Çorak', rect(114, 168, 120, 120)),
  room('k3_ruzgar_yaylasi', 'Rüzgâr Yaylası', rect(114, 12, 120, 156)),
  room('k4_ayaz_etegi', 'Ayaz Eteği', rect(234, 24, 66, 240)),
  room('k5_kul_ovasi', 'Kül Ovası', rect(300, 156, 96, 132)),
  room('k6_kartal_sirti', 'Kartal Sırtı', rect(300, 12, 96, 132)),
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
  { id: 'r11', roomId: 'k5_kul_ovasi', name: 'Kül Ovası', levels: [40, 43], fog: [0xa8a296, 24, 100], hemi: [0xd0ccc0, 0x46423c, 1.25], sun: [0xe0d8c8, 1.05],
    tex: ['tt2-dirt-19', 'tt2-dirt-09', 'tt2-stone-07', 'tt2-dirt-01'], tint: 0xd0ccc0, music: 'world_ruins', vfx: 'ambient_dust', vfxColor: 0x9a9288 },
  { id: 'r12', roomId: 'k6_kartal_sirti', name: 'Kartal Sırtı', levels: [43, 45], fog: [0xa8c0d8, 30, 115], hemi: [0xd8e4f0, 0x485060, 1.3], sun: [0xf4f4ff, 1.15],
    tex: ['tt3-stone-21', 'tt3-stone-23', 'tt3-terrain-17', 'tt2-stone-15'], tint: 0xe4ecf8, music: 'world_hills', vfx: 'ambient_snow' },
];

/** Signature silhouette per region: existing landmark recipes of WorldDecor (windmill, watch tower, red castle, obelisk ring). */
export const LANDMARKS: LandmarkDef[] = [
  { id: 'lm_karakir_gozcu', name: 'Karakır Gözcü Kulesi', regionId: 'r7', pos: [84, 108], recipe: 'watch_tower_ruin' },
  { id: 'lm_kizil_kale_k', name: 'Kızıl Kale Harabesi', regionId: 'r8', pos: [168, 267], recipe: 'red_castle_ruin' },
  { id: 'lm_ruzgar_degirmeni', name: 'Rüzgâr Değirmeni', regionId: 'r9', pos: [144, 60], recipe: 'windmill_cluster' },
  { id: 'lm_atalar_aniti', name: 'Atalar Anıtı', regionId: 'r9', pos: [195, 114], recipe: 'obelisk_shrine' },
  { id: 'lm_ayaz_gozcusu', name: 'Ayaz Gözcüsü', regionId: 'r10', pos: [246, 42], recipe: 'watch_tower_ruin' },
  { id: 'lm_karlibel_kalesi', name: 'Karlıbel Kalesi', regionId: 'r10', pos: [291, 198], recipe: 'red_castle_ruin' },
  { id: 'lm_kul_kulesi', name: 'Kül Gözetleme Kulesi', regionId: 'r11', pos: [388, 228], recipe: 'watch_tower_ruin' },
  { id: 'lm_kartal_kayasi', name: 'Kartal Kayası Anıtı', regionId: 'r12', pos: [350, 24], recipe: 'obelisk_shrine' },
  // WP-14 Kale Kuşatması: the weekly siege fortress (data/siege.ts SIEGE_FORT, same tile)
  { id: 'lm_bozkir_kalesi', name: 'Bozkır Kalesi', regionId: 'r9', pos: [162, 92], recipe: 'red_castle_ruin' },
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
  { id: 'kara_gol', rect: rect(78, 138, 18, 14) },
  { id: 'donuk_gol', rect: rect(264, 126, 18, 18) },
];

/** Wall dressing by the walkable side: grass edge = trees, badlands = canyon cliffs, plateau / foothills / ridges = rock cliffs. */
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
  ...edgesOf(ROOMS[5].rect, 'cliff'),
  ...edgesOf(ROOMS[6].rect, 'cliff'),
];

// ---------------------------------------------------------------------------------------------------------------------
// Roads (tile coords; they stay inside the rooms). The three outposts are linked: Karakol - Kervansaray - Kül Ocağı.
// ---------------------------------------------------------------------------------------------------------------------

export const ROADS: RoadDef[] = [
  { id: 'yol_dogu', kind: 'cobble', width: 4, pts: [[1, 150], [15, 150], [24, 156], [33, 159]] },
  { id: 'yol_karakol_ici', kind: 'cobble', width: 3, pts: [[33, 159], [57, 159]] },
  { id: 'yol_kervan', kind: 'dirt', width: 3.4, pts: [[57, 159], [75, 168], [96, 174], [114, 180], [138, 186], [166.5, 192]] },
  { id: 'yol_yayla', kind: 'dirt', width: 3.4, pts: [[174, 186], [171, 156], [162, 126], [165, 90], [168, 60]] },
  { id: 'yol_ayaz', kind: 'dirt', width: 3.4, pts: [[181.5, 192], [210, 189], [234, 174], [252, 144], [258, 114], [264, 90]] },
  { id: 'yol_corak', kind: 'dirt', width: 3.4, pts: [[174, 198], [171, 225], [162, 255]] },
  { id: 'yol_otlak', kind: 'dirt', width: 3.4, pts: [[45, 150], [51, 129], [66, 114], [72, 111]] },
  { id: 'yol_buzul', kind: 'dirt', width: 3, pts: [[264, 90], [276, 84], [285, 84]] },
  { id: 'yol_kul', kind: 'dirt', width: 3.4, pts: [[181.5, 192], [205, 200], [240, 206], [270, 210], [300, 210], [330, 211], [340, 211]] },
  { id: 'yol_kartal', kind: 'dirt', width: 3.4, pts: [[264, 90], [290, 84], [312, 74], [330, 60]] },
  { id: 'yol_kartal_sirt', kind: 'dirt', width: 3, pts: [[330, 60], [348, 86], [372, 120]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Waypoints (10), entrance, world boss
// ---------------------------------------------------------------------------------------------------------------------

export const WAYPOINTS: WaypointDef[] = [
  { id: 'wp_karakir_karakol', name: 'Karakol Taşı', pos: [46, 161.5], regionId: 'r7', villageId: 'koy_karakir_karakolu' },
  { id: 'wp_karakir_otlak', name: 'Otlak Taşı', pos: [72, 111], regionId: 'r7' },
  { id: 'wp_karakir_kervansaray', name: 'Kervansaray Taşı', pos: [175, 193.5], regionId: 'r8', villageId: 'kamp_kervansaray' },
  { id: 'wp_karakir_corak', name: 'Kızıl Kale Taşı', pos: [162, 255], regionId: 'r8' },
  { id: 'wp_karakir_yayla', name: 'Yayla Taşı', pos: [168, 60], regionId: 'r9' },
  { id: 'wp_karakir_ayaz', name: 'Ayaz Geçidi Taşı', pos: [264, 90], regionId: 'r10' },
  { id: 'wp_karakir_kul_ocagi', name: 'Kül Ocağı Taşı', pos: [349, 211.5], regionId: 'r11', villageId: 'koy_kul_ocagi' },
  { id: 'wp_karakir_kul_cukuru', name: 'Kül Çukuru Taşı', pos: [318, 172], regionId: 'r11' },
  { id: 'wp_karakir_kartal_tepe', name: 'Kartal Tepe Taşı', pos: [330, 60], regionId: 'r12' },
  { id: 'wp_karakir_kartal_sirt', name: 'Kartal Sırt Taşı', pos: [372, 120], regionId: 'r12' },
];

/** Open-world dungeon entrances of the zone: Buzul Tahtı (ice cave mouth at the Ayaz Geçidi), Gölge Tapınağı and the eight season dungeons. */
export const ENTRANCES: EntranceDef[] = [
  { id: 'ent_buzul_tahti', name: 'Buzul Tahtı Girişi', dungeonId: 'buzul_tahti', pos: [285, 84], facing: -90, minLevel: 30, regionId: 'r10', look: 'ice' },
  // Gölge Tapınağı (42-52) and the eight season dungeons (50-60, Mythic+ pool). The band of a dungeon is its levelRange; the
  // sign shows it (DungeonScene). The zone tops out at 45, so the 50+ doors are visible from the zone and open at their band.
  { id: 'ent_golge_tapinagi', name: 'Gölge Tapınağı Girişi', dungeonId: 'golge_tapinagi', pos: [327, 269], facing: 177, minLevel: 42, regionId: 'r11', look: 'temple' },
  { id: 'ent_peri_sisleri', name: 'Peri Sisleri Girişi', dungeonId: 'peri_sisleri', pos: [47, 95], facing: 45, minLevel: 60, regionId: 'r7', look: 'grove' },
  { id: 'ent_yanki_agi', name: 'Yankı Ağı Girişi', dungeonId: 'yanki_agi', pos: [40, 183], facing: -164, minLevel: 60, regionId: 'r7', look: 'web' },
  { id: 'ent_taskasa', name: 'Taşkasa Kapısı', dungeonId: 'taskasa', pos: [206, 216], facing: -176, minLevel: 56, regionId: 'r8', look: 'forge' },
  { id: 'ent_kefaret_salonlari', name: 'Kefaret Salonları Girişi', dungeonId: 'kefaret_salonlari', pos: [138, 155], facing: 0, minLevel: 60, regionId: 'r9', look: 'temple_large' },
  { id: 'ent_buyucu_terasi', name: 'Büyücüler Terası', dungeonId: 'buyucu_terasi', pos: [281, 181], facing: -21, minLevel: 60, regionId: 'r10', look: 'arcane' },
  { id: 'ent_les_uyanisi', name: 'Leş Uyanışı Girişi', dungeonId: 'les_uyanisi', pos: [359, 177], facing: -29, minLevel: 50, regionId: 'r11', look: 'temple' },
  { id: 'ent_yildiz_divani', name: 'Yıldız Kapısı', dungeonId: 'yildiz_divani', pos: [368, 79], facing: -71, minLevel: 55, regionId: 'r12', look: 'palace' },
  { id: 'ent_yigitler_sarayi', name: 'Yiğitler Sarayı Girişi', dungeonId: 'yigitler_sarayi', pos: [324, 139], facing: 112, minLevel: 60, regionId: 'r12', look: 'valor' },
];

export const WORLD_BOSS_ID = 'wb_ulu_boz';
/** Ulu-Boz: first spawn 10 min after a level 38+ player enters Ayaz Eteği, 45 min respawn, two warnings. */
export const WORLD_BOSSES: WorldBossSched[] = [
  { bossId: WORLD_BOSS_ID, firstSec: 600, respawnSec: 2700, announceSec: [120, 20], minLevelToStart: 38, announceText: 'Buzul çanağında yer sarsılıyor! Ulu-Boz uyanıyor.' },
];
/** Boss arena centre (tile); the BossDef arena in data/enemies_karakir.ts is the same point in metres. */
export const BOSS_ARENA: [number, number] = [276, 222];

// ---------------------------------------------------------------------------------------------------------------------
// Camps (90 packs in all with the patrols). Camps first: the enemy id of member m of pack p is DUNGEON_ENEMY_ID_BASE + p * 24 + m.
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
  // ---- R7 Karakır Otlakları (30-33): 12 camps
  { id: 'r7_c01', name: 'Çoban Ağılı Kurtları', at: [33, 126], radius: 12, lv: [30, 31], respawn: 60, members: [['kb_kurt', 6]], note: 'Çobanların terk ettiği ağıl' },
  { id: 'r7_c02', name: 'Toz Goblin Obası', at: [69, 102], radius: 13, lv: [30, 32], respawn: 70, members: [['kb_goblin', 5], ['kb_goblin_saman', 1]], note: 'Keçe çadırlar, kuru ot yığınları' },
  { id: 'r7_c03', name: 'Kurt Çayırı', at: [24, 189], radius: 14, lv: [30, 31], respawn: 60, members: [['kb_kurt', 4], ['kb_ari', 3]] },
  { id: 'r7_c04', name: 'Dikenli Domuz Otlağı', at: [51, 201], radius: 13, lv: [31, 32], respawn: 65, members: [['kb_domuz', 5]] },
  { id: 'r7_c05', name: 'Haydut Konak Yeri', at: [78, 183], radius: 14, lv: [31, 33], respawn: 100, farm: 'farm_bandit_fort', elite: true,
    members: [['kb_haydut', 4], ['kb_haydut_okcu', 2], ['kb_haydut_pehlivan', 1]], note: 'Yıkık han, haydut kampı' },
  { id: 'r7_c06', name: 'Toz Arısı Kovanı', at: [99, 108], radius: 12, lv: [31, 32], respawn: 60, members: [['kb_ari', 6]] },
  { id: 'r7_c07', name: 'Bozkır Ayıları', at: [102, 192], radius: 14, lv: [32, 33], respawn: 90, elite: true, members: [['kb_ayi', 2], ['kb_kurt', 3]] },
  { id: 'r7_c08', name: 'Gözcü Kulesi Haydutları', at: [96, 123], radius: 13, lv: [32, 33], respawn: 80, members: [['kb_haydut_okcu', 4], ['kb_haydut', 3]] },
  { id: 'r7_c09', name: 'Otlak Sınırı Goblinleri', at: [21, 105], radius: 13, lv: [30, 31], respawn: 60, members: [['kb_goblin', 6], ['kb_goblin_saman', 2]] },
  { id: 'r7_c10', name: 'Kurt Kovuğu', at: [105, 162], radius: 13, lv: [32, 33], respawn: 70, members: [['kb_kurt', 4], ['kb_domuz', 3]] },
  { id: 'r7_c11', name: 'Yaban Su Kuyusu', at: [60, 150], radius: 12, lv: [30, 31], respawn: 65, members: [['kb_kurt', 4], ['kb_goblin', 2]], note: 'Kuyunun başında kurt izleri' },
  { id: 'r7_c12', name: 'Haydut Gözetleme Tepesi', at: [84, 162], radius: 12, lv: [32, 33], respawn: 80, members: [['kb_haydut_okcu', 4], ['kb_haydut', 2]] },
  // ---- R8 Kızıl Çorak (33-36): 13 camps
  { id: 'r8_c01', name: 'Kızıl Çıyan Çukuru', at: [135, 189], radius: 13, lv: [33, 34], respawn: 70, members: [['kb_ciyan', 7]] },
  { id: 'r8_c02', name: 'Çorak Ork Karakolu', at: [138, 225], radius: 15, lv: [34, 35], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['kb_ork', 4], ['kb_ork_atici', 2], ['kb_ork_saman', 1], ['kb_ork_cellat', 1]], note: 'Kazıklı sur, kızıl sancaklar' },
  { id: 'r8_c03', name: 'Kızıl Örümcek İni', at: [126, 264], radius: 14, lv: [33, 35], respawn: 90, farm: 'farm_poison_cave', elite: true, members: [['kb_orumcek', 5], ['kb_orumcek_dev', 1]] },
  { id: 'r8_c04', name: 'Kızıl Taş Ocağı', at: [192, 225], radius: 14, lv: [35, 36], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['kb_golem', 3]] },
  { id: 'r8_c05', name: 'Kül Çatlağı', at: [219, 201], radius: 14, lv: [34, 36], respawn: 100, farm: 'farm_ember_vent', elite: true, members: [['kb_iblis', 5], ['kb_kor', 1]] },
  { id: 'r8_c06', name: 'Kızıl Gergedan Otlağı', at: [195, 276], radius: 15, lv: [35, 36], respawn: 100, farm: 'farm_rhino_pasture', elite: true, members: [['kb_gergedan', 3], ['kb_ciyan', 3]] },
  { id: 'r8_c07', name: 'Çorak Avcıları', at: [150, 207], radius: 13, lv: [34, 35], respawn: 80, members: [['kb_ork', 5], ['kb_ork_atici', 2]] },
  { id: 'r8_c08', name: 'Kızıl Kale Muhafızları', at: [183, 258], radius: 14, lv: [35, 36], respawn: 110, elite: true, members: [['kb_ork_cellat', 2], ['kb_ork', 4], ['kb_ork_saman', 1]] },
  { id: 'r8_c09', name: 'Dev Örümcek Yuvası', at: [225, 240], radius: 14, lv: [35, 36], respawn: 100, elite: true, members: [['kb_orumcek_dev', 2], ['kb_orumcek', 4]] },
  { id: 'r8_c10', name: 'Ork Sürüsü Obası', at: [135, 249], radius: 13, lv: [34, 36], respawn: 80, members: [['kb_ork', 5], ['kb_ork_atici', 1]] },
  { id: 'r8_c11', name: 'Çorak Vahası', at: [168, 186], radius: 13, lv: [34, 35], respawn: 90, members: [['kb_ciyan', 5], ['kb_orumcek', 2]], note: 'Tek su kaynağı, yaratıkların toplandığı yer' },
  { id: 'r8_c12', name: 'Kızıl Kervan Yıkıntısı', at: [210, 176], radius: 13, lv: [34, 35], respawn: 100, members: [['kb_ork', 4], ['kb_ork_saman', 1]] },
  { id: 'r8_c13', name: 'Kızıl Gölge Pususu', at: [160, 270], radius: 14, lv: [35, 36], respawn: 100, members: [['kb_ork_atici', 3], ['kb_ork', 3]] },
  // ---- R9 Rüzgâr Yaylası (36-38): 11 camps
  { id: 'r9_c01', name: 'Kurgan Mezarlığı', at: [204, 93], radius: 14, lv: [36, 37], respawn: 120, farm: 'farm_cursed_court', dormant: true,
    members: [['kb_iskelet', 5], ['kb_iskelet_okcu', 2], ['kb_iskelet_buyucu', 1]], note: 'Toprak höyükler, devrik taşlar' },
  { id: 'r9_c02', name: 'Rüzgâr Kurtları', at: [138, 90], radius: 13, lv: [36, 37], respawn: 80, elite: true, members: [['kb_yayla_kurdu', 3]] },
  { id: 'r9_c03', name: 'Yayla Ayıları', at: [225, 60], radius: 14, lv: [37, 38], respawn: 100, elite: true, members: [['kb_yayla_ayisi', 2], ['kb_yayla_kurdu', 2]] },
  { id: 'r9_c04', name: 'Hortlak Çayırı', at: [150, 138], radius: 13, lv: [36, 38], respawn: 90, members: [['kb_hortlak', 5], ['kb_iskelet_buyucu', 1]] },
  { id: 'r9_c05', name: 'Wargın Yuvası', at: [126, 45], radius: 14, lv: [37, 38], respawn: 100, elite: true, members: [['kb_warg', 2], ['kb_yayla_kurdu', 2]] },
  { id: 'r9_c06', name: 'Kurgan Muhafızları', at: [177, 30], radius: 14, lv: [37, 38], respawn: 120, dormant: true, elite: true,
    members: [['kb_iskelet_muhafiz', 2], ['kb_iskelet', 4]] },
  { id: 'r9_c07', name: 'Şövalyeler Anıtı', at: [210, 147], radius: 14, lv: [37, 38], respawn: 110, elite: true, members: [['kb_sovalye', 2], ['kb_hortlak', 3]] },
  { id: 'r9_c08', name: 'Yayla Ork Öncüleri', at: [132, 114], radius: 13, lv: [36, 37], respawn: 90, members: [['kb_ork_cellat', 1], ['kb_ork_atici', 3], ['kb_ork', 3]] },
  { id: 'r9_c09', name: 'Rüzgâr Taşları', at: [180, 70], radius: 13, lv: [37, 38], respawn: 100, elite: true, members: [['kb_yayla_kurdu', 3], ['kb_warg', 2]] },
  { id: 'r9_c10', name: 'Yayla Hortlakları', at: [180, 108], radius: 13, lv: [37, 38], respawn: 90, members: [['kb_hortlak', 4], ['kb_iskelet_buyucu', 1]] },
  { id: 'r9_c11', name: 'Kurgan Taşları', at: [160, 60], radius: 14, lv: [36, 37], respawn: 110, members: [['kb_iskelet', 4], ['kb_iskelet_okcu', 2]] },
  // ---- R10 Ayaz Eteği (38-40): 11 camps
  { id: 'r10_c01', name: 'Ayaz Kurtları', at: [255, 51], radius: 13, lv: [38, 39], respawn: 80, members: [['kb_ayaz_kurdu', 5], ['kb_ayaz_warg', 1]] },
  { id: 'r10_c02', name: 'Kar Ayısı İni', at: [285, 114], radius: 14, lv: [38, 39], respawn: 100, elite: true, members: [['kb_ayaz_ayisi', 2], ['kb_ayaz_kurdu', 3]] },
  { id: 'r10_c03', name: 'Buz Golemleri', at: [249, 159], radius: 14, lv: [39, 40], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['kb_buz_golemi', 3]] },
  { id: 'r10_c04', name: 'Ayaz Ork Çadırları', at: [285, 162], radius: 15, lv: [38, 40], respawn: 120, farm: 'farm_orc_outpost', elite: true, members: [['kb_ayaz_ork', 5], ['kb_ayaz_cellat', 1]] },
  { id: 'r10_c05', name: 'Donmuş Hortlaklar', at: [249, 252], radius: 13, lv: [39, 40], respawn: 100, members: [['kb_buz_hortlak', 5]] },
  { id: 'r10_c06', name: 'Mamut Sürüsü', at: [246, 222], radius: 15, lv: [39, 40], respawn: 140, elite: true, members: [['kb_mamut', 2], ['kb_ayaz_kurdu', 2]] },
  { id: 'r10_c07', name: 'Buz Örümcekleri', at: [288, 48], radius: 13, lv: [38, 40], respawn: 80, members: [['kb_ayaz_orumcek', 6]] },
  { id: 'r10_c08', name: 'Karlıbel Muhafızları', at: [285, 249], radius: 14, lv: [39, 40], respawn: 120, elite: true, members: [['kb_ayaz_cellat', 2], ['kb_ayaz_ork', 3], ['kb_ayaz_warg', 1]] },
  { id: 'r10_c09', name: 'Ayaz Buz Kuyusu', at: [262, 96], radius: 13, lv: [38, 39], respawn: 80, members: [['kb_ayaz_kurdu', 4], ['kb_ayaz_warg', 1]] },
  { id: 'r10_c10', name: 'Buzul Taşları', at: [246, 132], radius: 13, lv: [39, 40], respawn: 110, members: [['kb_buz_hortlak', 4], ['kb_buz_golemi', 1]] },
  { id: 'r10_c11', name: 'Ayaz Yaban Örümcekleri', at: [264, 192], radius: 13, lv: [39, 40], respawn: 90, members: [['kb_ayaz_orumcek', 5]] },
  // ---- R11 Kül Ovası (40-43): 14 camps around the outpost Kül Ocağı (348, 210)
  { id: 'r11_c01', name: 'Kül Akrep Çukuru', at: [306, 164], radius: 13, lv: [40, 41], respawn: 70, members: [['kb_kul_akrep', 7]] },
  { id: 'r11_c02', name: 'Kül Ovası Golemleri', at: [326, 164], radius: 14, lv: [41, 42], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['kb_kul_golem', 3]] },
  { id: 'r11_c03', name: 'Kül Hortlakları', at: [378, 164], radius: 13, lv: [40, 41], respawn: 100, dormant: true, members: [['kb_kul_hortlak', 5], ['kb_kul_ates', 1]] },
  { id: 'r11_c04', name: 'Küllü Ork Karakolu', at: [390, 184], radius: 14, lv: [41, 42], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['kb_kul_cellat', 2], ['kb_ork', 4], ['kb_ork_atici', 1]] },
  { id: 'r11_c05', name: 'Kül Cin Yuvası', at: [310, 190], radius: 13, lv: [41, 42], respawn: 100, elite: true, members: [['kb_kul_cin', 4], ['kb_kul_ates', 2]] },
  { id: 'r11_c06', name: 'Kül Kurdu Sürüsü', at: [330, 190], radius: 13, lv: [40, 41], respawn: 80, members: [['kb_kul_kurdu', 6]] },
  { id: 'r11_c07', name: 'Ateş Kurtları', at: [392, 212], radius: 13, lv: [41, 42], respawn: 90, elite: true, members: [['kb_kul_kurdu', 4], ['kb_kul_ates', 2]] },
  { id: 'r11_c08', name: 'Kül Örümceği İni', at: [306, 232], radius: 14, lv: [41, 42], respawn: 100, farm: 'farm_poison_cave', elite: true, members: [['kb_orumcek', 5], ['kb_orumcek_dev', 1]] },
  { id: 'r11_c09', name: 'Kül Kurdu Yuvası', at: [330, 246], radius: 13, lv: [40, 41], respawn: 80, members: [['kb_kul_kurdu', 5], ['kb_kul_hortlak', 2]] },
  { id: 'r11_c10', name: 'Kül Çatlağı Ateşleri', at: [370, 246], radius: 14, lv: [42, 43], respawn: 100, farm: 'farm_ember_vent', elite: true, members: [['kb_kul_ates', 4], ['kb_iblis', 2]] },
  { id: 'r11_c11', name: 'Kül Mezarlığı', at: [388, 256], radius: 14, lv: [42, 43], respawn: 120, farm: 'farm_cursed_court', dormant: true,
    members: [['kb_kul_hortlak', 4], ['kb_iskelet_muhafiz', 1]], note: 'Küle gömülü tabutlar' },
  { id: 'r11_c12', name: 'Kül Sürüsü', at: [310, 272], radius: 13, lv: [42, 43], respawn: 90, members: [['kb_kul_akrep', 5], ['kb_kul_kurdu', 3]] },
  { id: 'r11_c13', name: 'Kül Nöbetçileri', at: [344, 272], radius: 14, lv: [42, 43], respawn: 120, elite: true, members: [['kb_kul_cellat', 3], ['kb_kul_golem', 1]] },
  { id: 'r11_c14', name: 'Kül Yağmacıları', at: [362, 226], radius: 13, lv: [41, 42], respawn: 80, members: [['kb_haydut', 4], ['kb_haydut_okcu', 3]] },
  // ---- R12 Kartal Sırtı (43-45): 13 camps on the ridge
  { id: 'r12_c01', name: 'Kartal Yuvası', at: [312, 24], radius: 13, lv: [43, 44], respawn: 80, members: [['kb_kartal_yirtici', 6]] },
  { id: 'r12_c02', name: 'Sırt Karakolu', at: [340, 26], radius: 14, lv: [43, 44], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['kb_kartal_dagci', 3], ['kb_kartal_gozcu', 2]] },
  { id: 'r12_c03', name: 'Kartal Rahipleri Tapınağı', at: [372, 30], radius: 14, lv: [44, 45], respawn: 120, farm: 'farm_cursed_court', dormant: true, elite: true,
    members: [['kb_kartal_rahip', 5], ['kb_kartal_karakus', 1]] },
  { id: 'r12_c04', name: 'Taş Sırtı Golemleri', at: [388, 56], radius: 14, lv: [43, 44], respawn: 120, farm: 'farm_stone_quarry', elite: true,
    members: [['kb_kul_golem', 2], ['kb_kartal_dagci', 2]] },
  { id: 'r12_c05', name: 'Kayalık Kurtlar', at: [314, 66], radius: 13, lv: [43, 44], respawn: 90, members: [['kb_kartal_yirtici', 4], ['kb_kartal_karakus', 2]] },
  { id: 'r12_c06', name: 'Rüzgâr Kartalları', at: [344, 84], radius: 13, lv: [44, 45], respawn: 90, members: [['kb_kartal_karakus', 5], ['kb_kartal_gozcu', 1]] },
  { id: 'r12_c07', name: 'Kartal Kaya Odası', at: [372, 96], radius: 14, lv: [44, 45], respawn: 110, farm: 'farm_ember_vent', elite: true,
    members: [['kb_kartal_rahip', 3], ['kb_kartal_karakus', 2]] },
  { id: 'r12_c08', name: 'Dağ Kurtları', at: [322, 112], radius: 13, lv: [44, 45], respawn: 90, members: [['kb_kartal_yirtici', 5], ['kb_kartal_gozcu', 2]] },
  { id: 'r12_c09', name: 'Sırt Haydutları', at: [340, 130], radius: 14, lv: [44, 45], respawn: 100, elite: true, members: [['kb_kartal_dagci', 4], ['kb_kartal_gozcu', 2]] },
  { id: 'r12_c10', name: 'Yarık Kartalları', at: [386, 130], radius: 13, lv: [44, 45], respawn: 90, elite: true, members: [['kb_kartal_karakus', 4]] },
  { id: 'r12_c11', name: 'Kayalık Yaban', at: [306, 136], radius: 13, lv: [43, 44], respawn: 80, members: [['kb_kartal_dagci', 4]] },
  { id: 'r12_c12', name: 'Kartal Kuşatması', at: [340, 50], radius: 13, lv: [43, 44], respawn: 100, members: [['kb_kartal_karakus', 3], ['kb_kartal_gozcu', 2], ['kb_kartal_dagci', 1]] },
  { id: 'r12_c13', name: 'Rüzgâr Yaban Obası', at: [316, 92], radius: 13, lv: [44, 45], respawn: 90, members: [['kb_kartal_dagci', 3], ['kb_kartal_yirtici', 2]] },
];

const PATROL_SPECS: PatrolSpec[] = [
  { id: 'r7_p01', name: 'Haydut Devriyesi', lv: [31, 32], respawn: 90, members: [['kb_haydut', 3], ['kb_haydut_okcu', 1]], loop: [[57, 132], [72, 129], [75, 117], [60, 120]] },
  { id: 'r7_p02', name: 'Kurt Sürüsü', lv: [30, 32], respawn: 90, members: [['kb_kurt', 5]], loop: [[30, 201], [42, 213], [66, 210], [60, 192]] },
  { id: 'r8_p01', name: 'Ork Devriyesi', lv: [33, 35], respawn: 100, members: [['kb_ork', 3], ['kb_ork_atici', 1]], loop: [[144, 174], [159, 177], [156, 201], [141, 198]] },
  { id: 'r8_p02', name: 'Kızıl Şaman Alayı', lv: [34, 36], respawn: 100, members: [['kb_ork', 3], ['kb_ork_saman', 1]], loop: [[198, 177], [219, 174], [222, 186], [201, 186]] },
  { id: 'r9_p01', name: 'Kurgan Nöbetçileri', lv: [36, 37], respawn: 100, members: [['kb_iskelet', 3], ['kb_iskelet_okcu', 1]], loop: [[138, 72], [156, 78], [159, 96], [141, 93]] },
  { id: 'r9_p02', name: 'Rüzgâr Sürüsü', lv: [37, 38], respawn: 100, members: [['kb_warg', 2], ['kb_yayla_kurdu', 1]], loop: [[219, 114], [228, 129], [222, 150], [210, 138]] },
  { id: 'r10_p01', name: 'Ayaz Devriyesi', lv: [38, 39], respawn: 100, members: [['kb_ayaz_ork', 3], ['kb_ayaz_kurdu', 1]], loop: [[243, 99], [255, 111], [246, 123], [237, 111]] },
  { id: 'r10_p02', name: 'Buz Hortlakları', lv: [39, 40], respawn: 100, members: [['kb_buz_hortlak', 3], ['kb_buz_golemi', 1]], loop: [[243, 180], [258, 186], [255, 201], [240, 195]] },
  { id: 'r11_p01', name: 'Kül Devriyesi', lv: [40, 41], respawn: 100, members: [['kb_kul_akrep', 3], ['kb_kul_hortlak', 1]], loop: [[318, 178], [334, 176], [336, 194], [320, 196]] },
  { id: 'r11_p02', name: 'Kül Nöbet Kervanı', lv: [41, 42], respawn: 100, members: [['kb_kul_golem', 1], ['kb_kul_cin', 2]], loop: [[302, 216], [318, 218], [318, 226], [302, 226]] },
  { id: 'r11_p03', name: 'Kül Akıncıları', lv: [42, 43], respawn: 100, members: [['kb_kul_kurdu', 2], ['kb_kul_ates', 1]], loop: [[372, 200], [380, 202], [380, 222], [372, 222]] },
  { id: 'r11_p04', name: 'Kül Nöbetçi Yolu', lv: [40, 41], respawn: 100, members: [['kb_kul_hortlak', 2]], loop: [[360, 256], [372, 256], [372, 266], [360, 266]] },
  { id: 'r12_p01', name: 'Sırt Nöbetçileri', lv: [43, 44], respawn: 100, members: [['kb_kartal_gozcu', 2], ['kb_kartal_dagci', 1]], loop: [[352, 40], [364, 40], [364, 46], [352, 46]] },
  { id: 'r12_p02', name: 'Kartal Sürüsü', lv: [44, 45], respawn: 100, members: [['kb_kartal_karakus', 3]], loop: [[330, 96], [338, 96], [338, 104], [330, 104]] },
  { id: 'r12_p03', name: 'Ayaz Sırtı Yolcuları', lv: [44, 45], respawn: 100, members: [['kb_kartal_yirtici', 2], ['kb_kartal_rahip', 1]], loop: [[384, 80], [392, 84], [388, 100], [380, 96]] },
  { id: 'r12_p04', name: 'Kartal Devriyesi', lv: [43, 44], respawn: 100, members: [['kb_kartal_dagci', 3]], loop: [[356, 118], [366, 118], [366, 124], [356, 124]] },
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
// Rares (4), mini-bosses (2), world boss placement
// ---------------------------------------------------------------------------------------------------------------------

export const RARES: RareSpawnDef[] = [
  { id: 'rare_kb_alaca_yele', enemyId: 'rare_kb_alaca_yele', level: 32, spots: [[36, 114], [66, 207], [99, 177]], respawnMin: [10, 14], announce: true, lootTable: 'loot_rare_kb_alaca_yele' },
  { id: 'rare_kb_kor_pehlivan', enemyId: 'rare_kb_kor_pehlivan', level: 35, spots: [[147, 258], [222, 222], [132, 213]], respawnMin: [10, 15], announce: true, lootTable: 'loot_rare_kb_kor_pehlivan' },
  { id: 'rare_kb_kul_hayaleti', enemyId: 'rare_kb_kul_hayaleti', level: 41, spots: [[336, 178], [376, 204], [342, 262]], respawnMin: [12, 16], announce: true, lootTable: 'loot_rare_kb_kul_hayaleti' },
  { id: 'rare_kb_kartal_kral', enemyId: 'rare_kb_kartal_kral', level: 44, spots: [[330, 40], [350, 108], [392, 104]], respawnMin: [12, 16], announce: true, lootTable: 'loot_rare_kb_kartal_kral' },
];

export const MINIBOSSES: MiniBossDef[] = [
  { id: 'mb_kb_horgan', enemyId: 'mb_kb_horgan', level: 35, lair: [207, 258], regionId: 'r8', respawnMin: 20, lootTable: 'loot_mb_kb_horgan' },
  { id: 'mb_kb_kul_efendisi', enemyId: 'mb_kb_kul_efendisi', level: 42, lair: [384, 280], regionId: 'r11', respawnMin: 25, lootTable: 'loot_mb_kb_kul_efendisi' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Shrines, chests, cursed chests, gathering, hidden areas, vistas
// ---------------------------------------------------------------------------------------------------------------------

export const SHRINES: ShrineSpotDef[] = [
  { id: 'sh_r7_a', type: 'shrine_haste', regionId: 'r7', pos: [27, 168] },
  { id: 'sh_r7_b', type: 'shrine_wisdom', regionId: 'r7', pos: [90, 96] },
  { id: 'sh_r8_a', type: 'shrine_power', regionId: 'r8', pos: [156, 240] },
  { id: 'sh_r8_b', type: 'shrine_ward', regionId: 'r8', pos: [225, 264] },
  { id: 'sh_r9_a', type: 'shrine_greed', regionId: 'r9', pos: [126, 78] },
  { id: 'sh_r9_b', type: 'shrine_haste', regionId: 'r9', pos: [186, 150] },
  { id: 'sh_r10_a', type: 'shrine_ward', regionId: 'r10', pos: [249, 69] },
  { id: 'sh_r10_b', type: 'shrine_power', regionId: 'r10', pos: [280, 200] },
  { id: 'sh_r11_a', type: 'shrine_power', regionId: 'r11', pos: [336, 236] },
  { id: 'sh_r12_a', type: 'shrine_ward', regionId: 'r12', pos: [352, 100] },
];

const chest = (id: string, kind: ChestSpotDef['kind'], regionId: string, pos: [number, number]): ChestSpotDef => ({ id, kind, regionId, pos, respawnSec: 1800 });
export const CHESTS: ChestSpotDef[] = [
  chest('ch_r7_a', 'chest_wood', 'r7', [18, 114]), chest('ch_r7_b', 'chest_wood', 'r7', [105, 210]), chest('ch_r7_c', 'chest_iron', 'r7', [69, 156]),
  chest('ch_r8_a', 'chest_iron', 'r8', [126, 177]), chest('ch_r8_b', 'chest_iron', 'r8', [219, 276]), chest('ch_r8_c', 'chest_gold', 'r8', [180, 282]),
  chest('ch_r9_a', 'chest_iron', 'r9', [225, 24]), chest('ch_r9_b', 'chest_iron', 'r9', [120, 150]), chest('ch_r9_c', 'chest_gold', 'r9', [174, 18]),
  chest('ch_r10_a', 'chest_iron', 'r10', [297, 33]), chest('ch_r10_b', 'chest_gold', 'r10', [240, 258]), chest('ch_r10_c', 'chest_gold', 'r10', [297, 255]),
  chest('ch_r11_a', 'chest_iron', 'r11', [334, 206]), chest('ch_r11_b', 'chest_gold', 'r11', [386, 236]),
  chest('ch_r12_a', 'chest_iron', 'r12', [318, 44]), chest('ch_r12_b', 'chest_gold', 'r12', [378, 116]),
];

export const CURSED = [
  { id: 'cc_r7', regionId: 'r7', pos: [42, 201] as [number, number] },
  { id: 'cc_r8', regionId: 'r8', pos: [225, 177] as [number, number] },
  { id: 'cc_r9', regionId: 'r9', pos: [222, 99] as [number, number] },
  { id: 'cc_r10', regionId: 'r10', pos: [243, 138] as [number, number] },
  { id: 'cc_r11', regionId: 'r11', pos: [312, 206] as [number, number] },
  { id: 'cc_r12', regionId: 'r12', pos: [330, 74] as [number, number] },
];

/** Gathering tables are `gather_<kind>_<region>` (loot.ts GATHER_TABLES). */
const gather = (id: string, kind: GatherFieldDef['kind'], regionId: string, center: [number, number], radius: number, count: number, respawnSec: number): GatherFieldDef =>
  ({ id, kind, regionId, center, radius, count, respawnSec, lootTable: `gather_${kind}_${regionId}` });
export const GATHER: GatherFieldDef[] = [
  gather('gf_r7_ore', 'ore', 'r7', [21, 153], 4, 4, 300), gather('gf_r7_herb', 'herb', 'r7', [105, 156], 4, 6, 240),
  gather('gf_r8_ore', 'ore', 'r8', [120, 255], 4, 4, 300), gather('gf_r8_herb', 'herb', 'r8', [225, 219], 5, 6, 240),
  gather('gf_r9_ore', 'ore', 'r9', [150, 24], 4, 4, 300), gather('gf_r9_herb', 'herb', 'r9', [219, 36], 5, 6, 240),
  gather('gf_r10_ore', 'ore', 'r10', [294, 69], 4, 4, 300), gather('gf_r10_herb', 'herb', 'r10', [255, 258], 4, 6, 240),
  gather('gf_r11_ore', 'ore', 'r11', [318, 236], 4, 4, 300), gather('gf_r11_herb', 'herb', 'r11', [350, 234], 4, 6, 240),
  gather('gf_r12_ore', 'ore', 'r12', [352, 20], 4, 4, 300), gather('gf_r12_herb', 'herb', 'r12', [306, 108], 4, 6, 240),
];

export const HIDDEN: HiddenAreaDef[] = [
  { id: 'hd_r7', name: 'Atalar Çadırı', regionId: 'r7', pos: [15, 198], radius: 3, xpPct: 8, rewards: ['chest_wood', 'Kurt Postu x3'] },
  { id: 'hd_r8', name: 'Kayıp Kervan', regionId: 'r8', pos: [126, 282], radius: 3, xpPct: 8, rewards: ['chest_iron', '2 Orta Can İksiri'] },
  { id: 'hd_r9', name: 'Rüzgârın Kapısı', regionId: 'r9', pos: [228, 156], radius: 3, xpPct: 8, rewards: ['chest_iron x2', 'Efsun Nesnesi %25'] },
  { id: 'hd_r10', name: 'Donmuş Tapınak', regionId: 'r10', pos: [297, 150], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
  { id: 'hd_r11', name: 'Külün Altındaki Tapınak', regionId: 'r11', pos: [318, 284], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
  { id: 'hd_r12', name: 'Kartal Yuvası Mağarası', regionId: 'r12', pos: [390, 36], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
];

export const VISTAS: VistaDef[] = [
  { id: 'vs_r7', name: 'Gözcü Tepesi', regionId: 'r7', pos: [15, 93], xpPct: 6 },
  { id: 'vs_r8', name: 'Kızıl Uçurum', regionId: 'r8', pos: [228, 285], xpPct: 6 },
  { id: 'vs_r9', name: 'Rüzgâr Zirvesi', regionId: 'r9', pos: [225, 15], xpPct: 6 },
  { id: 'vs_r10', name: 'Ayaz Tepesi', regionId: 'r10', pos: [297, 27], xpPct: 6 },
  { id: 'vs_r11', name: 'Kül Tepesi', regionId: 'r11', pos: [388, 162], xpPct: 7 },
  { id: 'vs_r12', name: 'Kartal Kayası', regionId: 'r12', pos: [336, 16], xpPct: 7 },
];
