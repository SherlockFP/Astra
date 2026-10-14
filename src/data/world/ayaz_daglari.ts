import type {
  BorderSeg, ChestSpotDef, EntranceDef, GatherFieldDef, HiddenAreaDef, LandmarkDef, MiniBossDef, PackDef, PackMember, RareSpawnDef, RegionTheme,
  RoadDef, RoomDef, ShrineSpotDef, TileRect, VistaDef, WaypointDef, WorldBossSched, WorldRegion,
} from '../../types/dungeons';
import type { MusicId } from '../../types/audio';
import type { VfxId } from '../../types/vfx';
import { gridOf, texUrl, type LZone, type ZoneSource } from './layout';

/**
 * AYAZ DAGLARI world data (levels 45-60, GDD_OPENWORLD). OWNER: content module.
 *
 * Same schema as Karakır Bozkırı (types/dungeons.ts WorldExtras): rooms + regions, roads, water, landmarks, waypoints, entrances,
 * camps and patrols as PackDefs, rares, mini-bosses, world boss, shrines, chests, gathering, hidden areas, vistas. Authored in TypeScript
 * like karakir_world.ts. The assembled DungeonDef is ayaz.ts (AYAZ_DAGLARI).
 *
 * ZONE: 1600 x 1600 m (400 x 400 tiles), a streamed zone (docs/ENGINE_BIGMAPS.md section 6): AYAZ_ZONE is the `zone` block; gridOf /
 * perfOf (layout.ts) turn it into the grid and the streaming budgets. Terrain builds in 64 m chunks around the player.
 *
 * Six regions in an arc, one band each, climbing north and east from the pass:
 *   r16 Buz Geçidi        45-48  west, the pass band, ice passes, wolves / snow bandits
 *   r17 Kırağı Vadisi     48-51  south-centre, frozen valley, golems / hortlaks / yeti
 *   r18 Donmuş Göl Yaylası 51-54  north-centre, frozen lake plateau, mammoths / ork camps
 *   r19 Fırtına Sırtı     54-57  north-east ridge, storm eagles / knights / warg packs
 *   r20 Zemheri Yaylası   57-59  east-centre, deep-winter highland, world boss Zemheri, outpost Buz Kulesi
 *   r21 Zirve Kuşağı      59-60  south-east summit belt, the season dungeon doors (band 59-60)
 *
 * Region ids r16..r21 continue the global numbering (r1..r15 are used by Sisli Vadi and Karakır r7..r12).
 * Coordinates: tile coords (1 tile = 4 m). Rooms are tile-corner rects; every other point follows the (c + 0.5) * 4 convention.
 * Entry: the Kartal Geçidi pass from Karakır's r12 (the Ayaz side is `ent_karakir_gecidi`, the Karakır side `ent_ayaz_gecidi`); the
 * pass is a zone link (EntranceDef.toZone), gate level 45 on the Karakır side.
 */

/** The zone block of this map (layout.ts `zone`): 1600 x 1600 m, streams above 800 m (the default 'auto'). */
export const AYAZ_ZONE: LZone = { sizeM: [1600, 1600], stream: 'auto', chunkM: 64 };
/** Zone source for gridOf / perfOf. `grid` is the classic tile count, used only when `zone` is absent. */
export const AYAZ_ZONE_SRC: ZoneSource = { grid: { w: 400, h: 400 }, tileSize: 4, zone: AYAZ_ZONE };
export const AYAZ_GRID: { w: number; h: number } = gridOf(AYAZ_ZONE_SRC);

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const room = (id: string, name: string, r: TileRect): RoomDef => ({ id, name, rect: r, floor: 'dirt', wall: 'cave', explicitDecor: true });

// ---------------------------------------------------------------------------------------------------------------------
// Rooms and regions
// ---------------------------------------------------------------------------------------------------------------------

export const ROOMS: RoomDef[] = [
  room('a0_gecit', 'Kartal Geçidi', rect(0, 192, 14, 16)),
  room('a1_buz_gecidi', 'Buz Geçidi', rect(14, 120, 110, 160)),
  room('a2_kiragi_vadisi', 'Kırağı Vadisi', rect(124, 250, 126, 130)),
  room('a3_donmus_gol', 'Donmuş Göl Yaylası', rect(124, 40, 126, 160)),
  room('a4_firtina_sirti', 'Fırtına Sırtı', rect(250, 20, 130, 130)),
  room('a5_zemheri', 'Zemheri Yaylası', rect(250, 150, 130, 150)),
  room('a6_zirve_kusagi', 'Zirve Kuşağı', rect(250, 300, 135, 85)),
];

/** Ground texture order of the layout: [grass, dirt, cobble, dark]. Music ids: existing tracks only. */
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
  { id: 'r16', roomId: 'a1_buz_gecidi', name: 'Buz Geçidi', levels: [45, 48], fog: [0xc8d8e8, 24, 105], hemi: [0xdce8f4, 0x3c4658, 1.35], sun: [0xf0f4ff, 1.05],
    tex: ['tt3-terrain-10', 'tt2-stone-07', 'tt3-stone-21', 'tt3-stone-09'], tint: 0xe6f0ff, music: 'world_hills', vfx: 'ambient_snow' },
  { id: 'r17', roomId: 'a2_kiragi_vadisi', name: 'Kırağı Vadisi', levels: [48, 51], fog: [0xb8cad8, 22, 98], hemi: [0xd0dcea, 0x384450, 1.3], sun: [0xe8f0ff, 1.0],
    tex: ['tt2-stone-15', 'tt2-stone-07', 'tt3-stone-23', 'tt3-terrain-17'], tint: 0xdce8f8, music: 'dungeon_frost', vfx: 'ambient_snow' },
  { id: 'r18', roomId: 'a3_donmus_gol', name: 'Donmuş Göl Yaylası', levels: [51, 54], fog: [0xaec8dc, 26, 110], hemi: [0xd4e2f0, 0x404c5c, 1.3], sun: [0xe6f0ff, 1.1],
    tex: ['tt3-terrain-05', 'tt2-stone-15', 'tt3-stone-21', 'tt2-dirt-19'], tint: 0xd8e6f6, music: 'world_vale', vfx: 'ambient_snow' },
  { id: 'r19', roomId: 'a4_firtina_sirti', name: 'Fırtına Sırtı', levels: [54, 57], fog: [0x9eb4c8, 20, 96], hemi: [0xc4d4e6, 0x343e4c, 1.25], sun: [0xdce8f8, 1.0],
    tex: ['tt3-stone-23', 'tt3-stone-21', 'tt3-terrain-17', 'tt2-stone-15'], tint: 0xcfdcec, music: 'world_hills', vfx: 'ambient_snow' },
  { id: 'r20', roomId: 'a5_zemheri', name: 'Zemheri Yaylası', levels: [57, 59], fog: [0x9ab0c4, 18, 92], hemi: [0xbccee2, 0x2c3644, 1.2], sun: [0xd4e0f4, 0.95],
    tex: ['tt3-terrain-10', 'tt2-stone-07', 'tt3-stone-09', 'tt3-stone-21'], tint: 0xc4d6ec, music: 'dungeon_frost', vfx: 'ambient_snow' },
  { id: 'r21', roomId: 'a6_zirve_kusagi', name: 'Zirve Kuşağı', levels: [59, 60], fog: [0xb4c4d8, 28, 110], hemi: [0xd0dcf0, 0x404a5a, 1.3], sun: [0xf4f8ff, 1.1],
    tex: ['tt3-stone-21', 'tt3-stone-23', 'tt3-terrain-17', 'tt2-stone-15'], tint: 0xe2ecfa, music: 'world_hills', vfx: 'ambient_snow' },
];

/** Signature silhouette per region: existing landmark recipes of WorldDecor (watch tower, windmill, obelisk, red castle). */
export const LANDMARKS: LandmarkDef[] = [
  { id: 'lm_ayaz_gecit_kulesi', name: 'Kartal Geçidi Gözcü Kulesi', regionId: 'r16', pos: [60, 230], recipe: 'watch_tower_ruin' },
  { id: 'lm_kiragi_degirmeni', name: 'Kırağı Değirmeni', regionId: 'r17', pos: [150, 360], recipe: 'windmill_cluster' },
  { id: 'lm_donmus_anit', name: 'Donmuş Anıt', regionId: 'r18', pos: [200, 60], recipe: 'obelisk_shrine' },
  { id: 'lm_firtina_kalesi', name: 'Fırtına Kalesi Harabesi', regionId: 'r19', pos: [300, 110], recipe: 'red_castle_ruin' },
  { id: 'lm_zemheri_kulesi', name: 'Zemheri Kulesi', regionId: 'r20', pos: [372, 164], recipe: 'watch_tower_ruin' },
  { id: 'lm_zirve_anit', name: 'Zirve Anıtı', regionId: 'r21', pos: [370, 300], recipe: 'obelisk_shrine' },
];

/** The whole zone is snow: the grass is replaced by the snow texture; the splat paths (rock, dirt) show through it. */
const SNOW_COVER = 0.92;

export const REGIONS: WorldRegion[] = REGION_SPECS.map((r): WorldRegion => {
  const theme: RegionTheme = {
    fogColor: r.fog[0], fogNear: r.fog[1], fogFar: r.fog[2],
    hemiSky: r.hemi[0], hemiGround: r.hemi[1], hemiIntensity: r.hemi[2],
    sunColor: r.sun[0], sunIntensity: r.sun[1],
    skyZenith: r.hemi[0], skyHorizon: r.fog[0],
    groundTex: { grass: texUrl(r.tex[0]), dirt: texUrl(r.tex[1]), cobble: texUrl(r.tex[2]), dark: texUrl(r.tex[3]) },
    groundTint: r.tint,
    snowCover: SNOW_COVER,
    music: r.music,
    ambientVfx: r.vfx, ambientColor: r.vfxColor,
  };
  return { id: r.id, roomId: r.roomId, name: r.name, levels: r.levels, theme, landmarkId: LANDMARKS.find((l) => l.regionId === r.id)?.id };
});

/** Region id -> room id (packs and POIs resolve their room through this). */
export const ROOM_OF_REGION: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.roomId]));

/** Frozen lakes: a plateau lake in r18 and a deep-winter tarn in r20. */
export const WATER = [
  { id: 'donmus_gol', rect: rect(150, 90, 18, 14) },
  { id: 'buz_golu', rect: rect(290, 200, 18, 16) },
];

/** Wall dressing: the badlands-like passes use canyon walls, every plateau and ridge uses rock cliffs. */
const edgesOf = (r: TileRect, style: BorderSeg['style']): BorderSeg[] => [
  { a: [r.x, r.z], b: [r.x + r.w, r.z], style },
  { a: [r.x, r.z + r.h], b: [r.x + r.w, r.z + r.h], style },
  { a: [r.x, r.z], b: [r.x, r.z + r.h], style },
  { a: [r.x + r.w, r.z], b: [r.x + r.w, r.z + r.h], style },
];
export const BORDERS: BorderSeg[] = [
  ...edgesOf(ROOMS[0].rect, 'canyon'),
  ...edgesOf(ROOMS[2].rect, 'cliff'),
  ...edgesOf(ROOMS[4].rect, 'cliff'),
  ...edgesOf(ROOMS[6].rect, 'cliff'),
];

// ---------------------------------------------------------------------------------------------------------------------
// Roads (tile coords; they stay inside the rooms). The three outposts are linked: Geçit Karakolu - Kırağı Konağı - Buz Kulesi.
// ---------------------------------------------------------------------------------------------------------------------

export const ROADS: RoadDef[] = [
  { id: 'yol_gecit', kind: 'cobble', width: 4, pts: [[1, 200], [14, 200], [22, 202], [30, 200]] },
  { id: 'yol_karakol_kiragi', kind: 'dirt', width: 3.4, pts: [[30, 200], [60, 180], [100, 160], [124, 140], [160, 120], [190, 110]] },
  { id: 'yol_kiragi_vadi', kind: 'dirt', width: 3.4, pts: [[190, 110], [186, 160], [180, 220], [186, 262], [190, 300]] },
  { id: 'yol_kiragi_kule', kind: 'dirt', width: 3.4, pts: [[190, 110], [230, 120], [270, 140], [300, 180], [320, 230]] },
  { id: 'yol_kule_zirve', kind: 'dirt', width: 3, pts: [[320, 230], [330, 270], [320, 310], [300, 340]] },
  { id: 'yol_ruzgar', kind: 'dirt', width: 3, pts: [[270, 140], [300, 100], [330, 70], [360, 60]] },
  { id: 'yol_firtina', kind: 'dirt', width: 3, pts: [[300, 100], [290, 50], [262, 40]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Waypoints (12, two per region), entrances, world boss
// ---------------------------------------------------------------------------------------------------------------------

export const WAYPOINTS: WaypointDef[] = [
  { id: 'wp_ayaz_gecit_karakol', name: 'Geçit Taşı', pos: [32, 203], regionId: 'r16', villageId: 'koy_ayaz_gecidi' },
  { id: 'wp_ayaz_gecit_yol', name: 'Buz Yolu Taşı', pos: [72, 178], regionId: 'r16' },
  { id: 'wp_ayaz_kiragi_1', name: 'Kırağı Girişi Taşı', pos: [150, 292], regionId: 'r17' },
  { id: 'wp_ayaz_kiragi_2', name: 'Vadi Dibi Taşı', pos: [214, 340], regionId: 'r17' },
  { id: 'wp_ayaz_kervan', name: 'Kırağı Konağı Taşı', pos: [190, 112], regionId: 'r18', villageId: 'kamp_kiragi_konagi' },
  { id: 'wp_ayaz_kervan_2', name: 'Göl Kıyısı Taşı', pos: [140, 60], regionId: 'r18' },
  { id: 'wp_ayaz_ruzgar_1', name: 'Fırtına Sırtı Taşı', pos: [300, 70], regionId: 'r19' },
  { id: 'wp_ayaz_ruzgar_2', name: 'Kartal Kayalığı Taşı', pos: [360, 108], regionId: 'r19' },
  { id: 'wp_ayaz_buz_kulesi', name: 'Buz Kulesi Taşı', pos: [322, 232], regionId: 'r20', villageId: 'koy_buz_kulesi' },
  { id: 'wp_ayaz_buz_2', name: 'Zemheri Yolu Taşı', pos: [276, 270], regionId: 'r20' },
  { id: 'wp_ayaz_zirve_1', name: 'Zirve Kapısı Taşı', pos: [300, 352], regionId: 'r21' },
  { id: 'wp_ayaz_zirve_2', name: 'Kuşak Rüzgârı Taşı', pos: [358, 332], regionId: 'r21' },
];

/**
 * Entrances. The Kartal Geçidi pair is a zone link (toZone): the Karakır side (in karakir_world.ts) is gated at level 45, the Ayaz side
 * (`ent_karakir_gecidi`) brings the party back. The eight season dungeons (50-60) moved here from Karakır; each sits in the region
 * whose band holds its levelRange (les 50 -> r17, yildiz 55 and taskasa 56 -> r19, the 60 doors -> r21, the zone tops out at 60).
 */
export const ENTRANCES: EntranceDef[] = [
  { id: 'ent_karakir_gecidi', name: 'Karakır Geçidi', dungeonId: 'karakir_bozkiri', pos: [6, 200], facing: 90, minLevel: 0, regionId: 'r16', look: 'cave', toZone: 'karakir_bozkiri', toEntrance: 'ent_ayaz_gecidi' },
  { id: 'ent_les_uyanisi', name: 'Leş Uyanışı Girişi', dungeonId: 'les_uyanisi', pos: [150, 330], facing: 0, minLevel: 50, regionId: 'r17', look: 'temple' },
  { id: 'ent_yildiz_divani', name: 'Yıldız Kapısı', dungeonId: 'yildiz_divani', pos: [290, 60], facing: -71, minLevel: 55, regionId: 'r19', look: 'palace' },
  { id: 'ent_taskasa', name: 'Taşkasa Kapısı', dungeonId: 'taskasa', pos: [350, 120], facing: -176, minLevel: 56, regionId: 'r19', look: 'forge' },
  { id: 'ent_kefaret_salonlari', name: 'Kefaret Salonları Girişi', dungeonId: 'kefaret_salonlari', pos: [262, 320], facing: 0, minLevel: 60, regionId: 'r21', look: 'temple_large' },
  { id: 'ent_buyucu_terasi', name: 'Büyücüler Terası', dungeonId: 'buyucu_terasi', pos: [300, 368], facing: -21, minLevel: 60, regionId: 'r21', look: 'arcane' },
  { id: 'ent_yanki_agi', name: 'Yankı Ağı Girişi', dungeonId: 'yanki_agi', pos: [338, 318], facing: -164, minLevel: 60, regionId: 'r21', look: 'web' },
  { id: 'ent_peri_sisleri', name: 'Peri Sisleri Girişi', dungeonId: 'peri_sisleri', pos: [370, 352], facing: 45, minLevel: 60, regionId: 'r21', look: 'grove' },
  { id: 'ent_yigitler_sarayi', name: 'Yiğitler Sarayı Girişi', dungeonId: 'yigitler_sarayi', pos: [262, 362], facing: 112, minLevel: 60, regionId: 'r21', look: 'valor' },
];

export const WORLD_BOSS_ID = 'wb_ad_zemheri';
/** Zemheri: first spawn 10 min after a level 55+ player enters Zemheri Yaylası, 45 min respawn, two warnings. */
export const WORLD_BOSSES: WorldBossSched[] = [
  { bossId: WORLD_BOSS_ID, firstSec: 600, respawnSec: 2700, announceSec: [120, 20], minLevelToStart: 55, announceText: 'Zemheri uyanıyor! Yaylada kar fırtınası kopuyor.' },
];
/** Boss arena centre (tile); the BossDef arena in data/enemies_ayaz.ts is the same point in metres. */
export const BOSS_ARENA: [number, number] = [350, 250];

// ---------------------------------------------------------------------------------------------------------------------
// Camps (about 105 packs with the patrols). Camps first: the enemy id of member m of pack p is DUNGEON_ENEMY_ID_BASE + p * 24 + m.
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

/** Golden-angle spiral inside the camp radius (the Karakır layout, see karakir_world.ts). */
function spread(ids: string[], radiusM: number): PackMember[] {
  const rT = Math.min(2.6, (radiusM / 4) * 0.55);
  return ids.map((enemyId, i) => {
    const a = i * 2.39996;
    const d = i === 0 && ids.length > 1 ? 0 : rT * Math.sqrt((i + 0.5) / ids.length);
    return { enemyId, offset: [r2(Math.sin(a) * d), r2(Math.cos(a) * d)] };
  });
}

const regionOf = (id: string): string => /^(r\d+)_/.exec(id)?.[1] ?? 'r16';

const CAMP_SPECS: CampSpec[] = [
  // ---- R16 Buz Geçidi (45-48): 13 camps
  { id: 'r16_c01', name: 'Kurt Geçidi Yuvası', at: [34, 150], radius: 12, lv: [45, 46], respawn: 60, members: [['ad_kar_kurdu', 6]] },
  { id: 'r16_c02', name: 'Tilki Vadisi', at: [60, 140], radius: 12, lv: [45, 46], respawn: 60, members: [['ad_kar_tilki', 6], ['ad_kar_kurdu', 2]] },
  { id: 'r16_c03', name: 'Dağ Keçisi Sürüsü', at: [104, 132], radius: 13, lv: [46, 47], respawn: 70, members: [['ad_dag_keci', 5]] },
  { id: 'r16_c04', name: 'Ayı İni', at: [112, 262], radius: 14, lv: [46, 47], respawn: 90, elite: true, members: [['ad_buz_ayisi', 2], ['ad_kar_kurdu', 3]] },
  { id: 'r16_c05', name: 'Kar Haydutları Kampı', at: [80, 262], radius: 14, lv: [46, 47], respawn: 100, farm: 'farm_bandit_fort', elite: true,
    members: [['ad_kar_haydut', 4], ['ad_kar_haydut_okcu', 2]], note: 'Kar altına gömülü han' },
  { id: 'r16_c06', name: 'Kar Kurdu Sığınağı', at: [30, 262], radius: 12, lv: [45, 46], respawn: 65, members: [['ad_kar_kurdu', 5], ['ad_kar_tilki', 2]] },
  { id: 'r16_c07', name: 'Kayalık Geçit Haydutları', at: [98, 212], radius: 13, lv: [46, 47], respawn: 80, members: [['ad_kar_haydut', 3], ['ad_kar_haydut_okcu', 3]] },
  { id: 'r16_c08', name: 'Buz Kuyusu Kurtları', at: [52, 230], radius: 12, lv: [45, 46], respawn: 65, members: [['ad_kar_kurdu', 4], ['ad_kar_warg', 1]] },
  { id: 'r16_c09', name: 'Kar Ayısı Çayırı', at: [116, 176], radius: 13, lv: [47, 48], respawn: 100, elite: true, members: [['ad_buz_ayisi', 2], ['ad_kar_tilki', 3]] },
  { id: 'r16_c10', name: 'Dağ Keçisi Yamacı', at: [20, 220], radius: 12, lv: [47, 48], respawn: 70, members: [['ad_dag_keci', 5]] },
  { id: 'r16_c11', name: 'Kurt Yolu Kovuğu', at: [50, 168], radius: 12, lv: [45, 46], respawn: 65, members: [['ad_kar_kurdu', 4], ['ad_kar_warg', 1]] },
  { id: 'r16_c12', name: 'Dağ Geçidi Keçileri', at: [116, 196], radius: 12, lv: [47, 48], respawn: 70, members: [['ad_dag_keci', 4], ['ad_kar_tilki', 2]] },
  { id: 'r16_c13', name: 'Zirve Kurt Ağılı', at: [76, 192], radius: 12, lv: [46, 47], respawn: 80, elite: true, members: [['ad_kar_warg', 3], ['ad_kar_kurdu', 3]] },
  // ---- R17 Kırağı Vadisi (48-51): 13 camps
  { id: 'r17_c01', name: 'Kırağı Ork Karakolu', at: [140, 270], radius: 14, lv: [48, 49], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['ad_kar_ork', 4], ['ad_kar_ork_okcu', 2], ['ad_kar_saman', 1]], note: 'Buz sur, donmuş sancaklar' },
  { id: 'r17_c02', name: 'Buz Golemi Ocağı', at: [170, 300], radius: 14, lv: [49, 50], respawn: 120, farm: 'farm_stone_quarry', elite: true, members: [['ad_buz_golemi', 3]] },
  { id: 'r17_c03', name: 'Donmuş Hortlaklar', at: [196, 262], radius: 13, lv: [48, 49], respawn: 90, members: [['ad_don_hortlak', 5], ['ad_don_iskelet_okcu', 1]] },
  { id: 'r17_c04', name: 'Buz Örümcek Vadisi', at: [228, 300], radius: 13, lv: [49, 50], respawn: 90, members: [['ad_buz_orumcek', 6]] },
  { id: 'r17_c05', name: 'Yeti İni', at: [150, 348], radius: 14, lv: [50, 51], respawn: 110, elite: true, members: [['ad_yeti', 2], ['ad_buz_orumcek', 2]] },
  { id: 'r17_c06', name: 'Kırağı İskeletleri', at: [205, 352], radius: 13, lv: [49, 50], respawn: 110, dormant: true, members: [['ad_don_iskelet', 5], ['ad_don_iskelet_okcu', 2]] },
  { id: 'r17_c07', name: 'Buz Cini Yuvası', at: [238, 350], radius: 13, lv: [50, 51], respawn: 110, elite: true, members: [['ad_buz_cin', 4], ['ad_don_hortlak', 2]] },
  { id: 'r17_c08', name: 'Dev Örümcek İni', at: [134, 326], radius: 13, lv: [49, 50], respawn: 100, farm: 'farm_poison_cave', elite: true, members: [['ad_buz_orumcek_dev', 2], ['ad_buz_orumcek', 4]] },
  { id: 'r17_c09', name: 'Kırağı Yeti Sahası', at: [160, 290], radius: 13, lv: [48, 49], respawn: 90, members: [['ad_kar_ork', 3], ['ad_kar_saman', 1]] },
  { id: 'r17_c10', name: 'Ork Nöbet Yolu', at: [212, 314], radius: 13, lv: [49, 50], respawn: 90, members: [['ad_kar_ork', 4], ['ad_kar_ork_okcu', 1]] },
  { id: 'r17_c11', name: 'Kırağı Mağara Ağzı', at: [130, 300], radius: 12, lv: [50, 51], respawn: 100, members: [['ad_buz_golemi', 1], ['ad_buz_orumcek', 4]] },
  { id: 'r17_c12', name: 'Don Mezarlığı', at: [240, 268], radius: 13, lv: [50, 51], respawn: 120, farm: 'farm_cursed_court', dormant: true,
    members: [['ad_don_hortlak', 4], ['ad_don_iskelet', 2]], note: 'Buz altında gömülü tabutlar' },
  { id: 'r17_c13', name: 'Kırağı Keşiş Taşları', at: [190, 360], radius: 12, lv: [48, 49], respawn: 100, members: [['ad_don_iskelet_okcu', 3], ['ad_don_iskelet', 3]] },
  // ---- R18 Donmuş Göl Yaylası (51-54): 13 camps
  { id: 'r18_c01', name: 'Yayla Ork Karakolu', at: [136, 56], radius: 14, lv: [51, 52], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['ad_kar_ork', 4], ['ad_kar_ork_okcu', 2], ['ad_kar_saman', 1]] },
  { id: 'r18_c02', name: 'Donmuş Göl Mamutları', at: [176, 58], radius: 15, lv: [52, 53], respawn: 140, elite: true, members: [['ad_mamut', 2], ['ad_buz_ruhu', 2]] },
  { id: 'r18_c03', name: 'Yeti Çukuru', at: [232, 60], radius: 14, lv: [53, 54], respawn: 120, elite: true, members: [['ad_yeti', 3], ['ad_kar_saman', 1]] },
  { id: 'r18_c04', name: 'Buz Ruhu Kayası', at: [132, 136], radius: 13, lv: [51, 52], respawn: 90, members: [['ad_buz_ruhu', 5]] },
  { id: 'r18_c05', name: 'Kar Orku Ocakları', at: [182, 130], radius: 13, lv: [52, 53], respawn: 110, farm: 'farm_stone_quarry', members: [['ad_kar_ork', 5]] },
  { id: 'r18_c06', name: 'Yeti Kovuğu', at: [226, 118], radius: 13, lv: [52, 53], respawn: 110, elite: true, members: [['ad_yeti', 2], ['ad_buz_ruhu', 1]] },
  { id: 'r18_c07', name: 'Buz Örümcek Obası', at: [134, 180], radius: 13, lv: [51, 52], respawn: 100, members: [['ad_buz_orumcek_dev', 2], ['ad_buz_orumcek', 3]] },
  { id: 'r18_c08', name: 'Kar Şamanı Tapınağı', at: [206, 186], radius: 13, lv: [53, 54], respawn: 120, farm: 'farm_cursed_court', elite: true,
    members: [['ad_kar_saman', 3], ['ad_don_iskelet_okcu', 2]] },
  { id: 'r18_c09', name: 'Mamut Yaylası', at: [236, 160], radius: 13, lv: [53, 54], respawn: 130, members: [['ad_mamut', 2], ['ad_yeti', 2]] },
  { id: 'r18_c10', name: 'Donmuş Kuyular', at: [168, 176], radius: 13, lv: [51, 52], respawn: 100, members: [['ad_don_iskelet_okcu', 4], ['ad_kar_ork', 2]] },
  { id: 'r18_c11', name: 'Göl Kıyısı Orkları', at: [196, 96], radius: 13, lv: [52, 53], respawn: 110, members: [['ad_kar_ork', 4], ['ad_kar_cellat', 1]] },
  { id: 'r18_c12', name: 'Kar Cellatları', at: [146, 186], radius: 13, lv: [53, 54], respawn: 120, elite: true, members: [['ad_kar_cellat', 3], ['ad_kar_ork', 2]] },
  { id: 'r18_c13', name: 'Yayla Keşifleri', at: [240, 96], radius: 13, lv: [51, 52], respawn: 100, members: [['ad_kar_ork_okcu', 3], ['ad_buz_ruhu', 2]] },
  // ---- R19 Fırtına Sırtı (54-57): 13 camps
  { id: 'r19_c01', name: 'Fırtına Kartalları', at: [270, 40], radius: 13, lv: [54, 55], respawn: 90, members: [['ad_kartal', 6]] },
  { id: 'r19_c02', name: 'Buz Şövalye Nöbeti', at: [300, 36], radius: 14, lv: [55, 56], respawn: 120, elite: true, members: [['ad_buz_sovalye', 2], ['ad_buz_rahip', 2]] },
  { id: 'r19_c03', name: 'Kar Haydut Tepesi', at: [340, 50], radius: 14, lv: [55, 56], respawn: 110, farm: 'farm_bandit_fort', elite: true,
    members: [['ad_kar_haydut', 4], ['ad_kar_haydut_okcu', 2]] },
  { id: 'r19_c04', name: 'Rüzgâr Kayası', at: [368, 32], radius: 13, lv: [56, 57], respawn: 110, members: [['ad_kartal', 4], ['ad_buz_ruhu', 2]] },
  { id: 'r19_c05', name: 'Kurtlar Sırtı', at: [262, 96], radius: 13, lv: [54, 55], respawn: 100, members: [['ad_kar_warg', 4], ['ad_kar_haydut', 1]] },
  { id: 'r19_c06', name: 'Buz Rahip Mabedi', at: [290, 96], radius: 13, lv: [55, 56], respawn: 130, farm: 'farm_cursed_court', dormant: true, elite: true,
    members: [['ad_buz_rahip', 4], ['ad_buz_sovalye', 1]] },
  { id: 'r19_c07', name: 'Kar Cellatı Karakolu', at: [330, 96], radius: 14, lv: [56, 57], respawn: 120, farm: 'farm_orc_outpost', elite: true,
    members: [['ad_kar_cellat', 3], ['ad_kar_haydut_okcu', 2]] },
  { id: 'r19_c08', name: 'Fırtına Yuvası', at: [360, 110], radius: 13, lv: [56, 57], respawn: 120, elite: true, members: [['ad_kartal', 3], ['ad_buz_sovalye', 1]] },
  { id: 'r19_c09', name: 'Buz Ruhu Vadisi', at: [276, 130], radius: 13, lv: [54, 55], respawn: 90, members: [['ad_buz_ruhu', 6]] },
  { id: 'r19_c10', name: 'Sırt Haydutları', at: [316, 134], radius: 13, lv: [55, 56], respawn: 110, members: [['ad_kar_haydut', 3], ['ad_kar_haydut_okcu', 2]] },
  { id: 'r19_c11', name: 'Kar Kartalı Yuvaları', at: [348, 124], radius: 13, lv: [54, 55], respawn: 90, members: [['ad_kartal', 4]] },
  { id: 'r19_c12', name: 'Buzlu Geçit', at: [262, 52], radius: 13, lv: [54, 55], respawn: 100, members: [['ad_kar_warg', 3], ['ad_buz_ruhu', 2]] },
  { id: 'r19_c13', name: 'Rüzgâr Taşları', at: [320, 70], radius: 13, lv: [55, 56], respawn: 120, elite: true, members: [['ad_buz_rahip', 2], ['ad_kar_cellat', 2]] },
  // ---- R20 Zemheri Yaylası (57-59): 13 camps around the Buz Kulesi outpost (322, 232)
  { id: 'r20_c01', name: 'Donmuş Hortlak Mezarlığı', at: [262, 170], radius: 13, lv: [57, 58], respawn: 130, farm: 'farm_cursed_court', dormant: true,
    members: [['ad_don_hortlak', 5], ['ad_don_iskelet', 2]] },
  { id: 'r20_c02', name: 'Buz Cin Kovuğu', at: [300, 164], radius: 13, lv: [58, 59], respawn: 130, elite: true, members: [['ad_buz_cin', 4], ['ad_don_hortlak', 2]] },
  { id: 'r20_c03', name: 'Zemheri Kar Ağılı', at: [346, 166], radius: 14, lv: [57, 58], respawn: 140, elite: true, members: [['ad_mamut', 2], ['ad_buz_sovalye', 1]] },
  { id: 'r20_c04', name: 'Buz Rahip Halkası', at: [368, 186], radius: 13, lv: [58, 59], respawn: 130, elite: true, members: [['ad_buz_rahip', 4], ['ad_kar_saman', 2]] },
  { id: 'r20_c05', name: 'Ayaz Golemleri Sahası', at: [262, 204], radius: 13, lv: [57, 58], respawn: 130, farm: 'farm_stone_quarry', elite: true, members: [['ad_buz_golemi', 3]] },
  { id: 'r20_c06', name: 'Muhafız Yolu', at: [270, 240], radius: 13, lv: [58, 59], respawn: 140, elite: true, members: [['ad_buz_muhafiz', 3], ['ad_buz_sovalye', 1]] },
  { id: 'r20_c07', name: 'Kar Şamanı Halkası', at: [336, 268], radius: 13, lv: [57, 58], respawn: 120, members: [['ad_kar_saman', 3], ['ad_don_iskelet', 3]] },
  { id: 'r20_c08', name: 'Donmuş İskelet Mezarı', at: [360, 280], radius: 13, lv: [58, 59], respawn: 140, farm: 'farm_cursed_court', dormant: true,
    members: [['ad_don_iskelet', 5], ['ad_buz_muhafiz', 1]] },
  { id: 'r20_c09', name: 'Buz Cin Yolu', at: [268, 282], radius: 13, lv: [57, 58], respawn: 120, members: [['ad_buz_cin', 3], ['ad_don_hortlak', 3]] },
  { id: 'r20_c10', name: 'Mamut Göl Kıyısı', at: [330, 152], radius: 14, lv: [57, 58], respawn: 140, members: [['ad_mamut', 2], ['ad_buz_sovalye', 1]] },
  { id: 'r20_c11', name: 'Buz Muhafız Barınağı', at: [316, 196], radius: 13, lv: [58, 59], respawn: 140, elite: true, members: [['ad_buz_muhafiz', 2], ['ad_buz_rahip', 2]] },
  { id: 'r20_c12', name: 'Buz Cin Sürüsü', at: [356, 232], radius: 13, lv: [57, 58], respawn: 120, members: [['ad_buz_cin', 2], ['ad_don_hortlak', 3]] },
  { id: 'r20_c13', name: 'Buz Tapınağı Gözcüleri', at: [366, 250], radius: 13, lv: [58, 59], respawn: 130, elite: true, members: [['ad_buz_rahip', 3], ['ad_buz_muhafiz', 1]] },
  // ---- R21 Zirve Kuşağı (59-60): 9 camps (the season doors take the rest of the belt)
  { id: 'r21_c01', name: 'Zirve Muhafızları', at: [296, 318], radius: 13, lv: [59, 60], respawn: 150, elite: true, members: [['ad_buz_muhafiz', 3], ['ad_buz_sovalye', 1]] },
  { id: 'r21_c02', name: 'Kartal Yuvası Zirvesi', at: [328, 340], radius: 13, lv: [59, 60], respawn: 120, members: [['ad_kartal', 5], ['ad_yeti', 1]] },
  { id: 'r21_c03', name: 'Yeti Mağarası', at: [360, 318], radius: 13, lv: [59, 60], respawn: 150, elite: true, members: [['ad_yeti', 3], ['ad_buz_golemi', 1]] },
  { id: 'r21_c04', name: 'Buz Cin Zirvesi', at: [278, 350], radius: 13, lv: [59, 60], respawn: 130, members: [['ad_buz_cin', 4], ['ad_don_iskelet_okcu', 2]] },
  { id: 'r21_c05', name: 'Buz Örümcek Kuyusu', at: [316, 366], radius: 12, lv: [59, 60], respawn: 130, members: [['ad_buz_orumcek_dev', 2], ['ad_buz_cin', 2]] },
  { id: 'r21_c06', name: 'Donmuş İskelet Mezarlığı', at: [370, 366], radius: 12, lv: [59, 60], respawn: 150, farm: 'farm_cursed_court', dormant: true,
    members: [['ad_don_iskelet_okcu', 4], ['ad_buz_muhafiz', 1]] },
  { id: 'r21_c07', name: 'Kar Rahipleri Mabedi', at: [262, 340], radius: 12, lv: [59, 60], respawn: 150, elite: true, members: [['ad_buz_rahip', 3], ['ad_buz_muhafiz', 1]] },
  { id: 'r21_c08', name: 'Yeti Yolu', at: [270, 304], radius: 12, lv: [59, 60], respawn: 130, members: [['ad_buz_rahip', 2], ['ad_yeti', 2]] },
  { id: 'r21_c09', name: 'Dondurucu Rüzgâr Sırtı', at: [352, 352], radius: 12, lv: [59, 60], respawn: 130, members: [['ad_buz_orumcek_dev', 1], ['ad_buz_cin', 2], ['ad_kartal', 2]] },
];

const PATROL_SPECS: PatrolSpec[] = [
  // ---- R16
  { id: 'r16_p01', name: 'Kar Haydutu Devriyesi', lv: [45, 46], respawn: 100, members: [['ad_kar_haydut', 3], ['ad_kar_haydut_okcu', 1]], loop: [[40, 240], [60, 240], [60, 256], [40, 256]] },
  { id: 'r16_p02', name: 'Kurt Sürüsü', lv: [45, 46], respawn: 100, members: [['ad_kar_kurdu', 5]], loop: [[22, 150], [40, 150], [40, 166], [22, 166]] },
  { id: 'r16_p03', name: 'Kar Ayısı Devriyesi', lv: [46, 47], respawn: 100, members: [['ad_buz_ayisi', 1], ['ad_kar_kurdu', 2]], loop: [[100, 230], [112, 230], [112, 240], [100, 240]] },
  { id: 'r16_p04', name: 'Keçi Sürüsü', lv: [47, 48], respawn: 100, members: [['ad_dag_keci', 3]], loop: [[84, 140], [100, 140], [100, 150], [84, 150]] },
  { id: 'r16_p05', name: 'Haydut Gözcüleri', lv: [46, 48], respawn: 100, members: [['ad_kar_haydut_okcu', 2], ['ad_kar_haydut', 2]], loop: [[60, 206], [72, 206], [72, 216], [60, 216]] },
  // ---- R17
  { id: 'r17_p01', name: 'Kırağı Nöbetçileri', lv: [48, 49], respawn: 100, members: [['ad_don_iskelet', 3], ['ad_don_iskelet_okcu', 1]], loop: [[150, 280], [166, 280], [166, 292], [150, 292]] },
  { id: 'r17_p02', name: 'Yeti Sürüsü', lv: [50, 51], respawn: 110, members: [['ad_yeti', 2], ['ad_buz_orumcek', 1]], loop: [[220, 330], [234, 330], [234, 344], [220, 344]] },
  { id: 'r17_p03', name: 'Ork Kervanı', lv: [49, 50], respawn: 100, members: [['ad_kar_ork', 3], ['ad_kar_saman', 1]], loop: [[180, 320], [196, 320], [196, 334], [180, 334]] },
  { id: 'r17_p04', name: 'Buz Örümcekleri', lv: [48, 50], respawn: 100, members: [['ad_buz_orumcek', 4]], loop: [[132, 300], [146, 300], [146, 310], [132, 310]] },
  { id: 'r17_p05', name: 'Kırağı Golem Devriyesi', lv: [50, 51], respawn: 110, members: [['ad_buz_golemi', 2]], loop: [[200, 280], [214, 280], [214, 292], [200, 292]] },
  // ---- R18
  { id: 'r18_p01', name: 'Ork Devriyesi', lv: [51, 52], respawn: 100, members: [['ad_kar_ork', 3], ['ad_kar_ork_okcu', 1]], loop: [[128, 110], [142, 110], [142, 122], [128, 122]] },
  { id: 'r18_p02', name: 'Mamut Otlağı', lv: [53, 54], respawn: 120, members: [['ad_mamut', 1], ['ad_yeti', 1]], loop: [[190, 150], [206, 150], [206, 164], [190, 164]] },
  { id: 'r18_p03', name: 'Kar Şamanı Yolu', lv: [52, 53], respawn: 100, members: [['ad_kar_saman', 2], ['ad_don_iskelet_okcu', 1]], loop: [[220, 140], [234, 140], [234, 154], [220, 154]] },
  { id: 'r18_p04', name: 'Buz Ruhları Sürüsü', lv: [51, 53], respawn: 100, members: [['ad_buz_ruhu', 3]], loop: [[130, 70], [144, 70], [144, 84], [130, 84]] },
  { id: 'r18_p05', name: 'Yayla Kurtları', lv: [52, 54], respawn: 100, members: [['ad_yeti', 1], ['ad_buz_orumcek_dev', 1]], loop: [[200, 56], [214, 56], [214, 70], [200, 70]] },
  // ---- R19
  { id: 'r19_p01', name: 'Kartal Sürüsü', lv: [54, 55], respawn: 100, members: [['ad_kartal', 3]], loop: [[258, 40], [270, 40], [270, 52], [258, 52]] },
  { id: 'r19_p02', name: 'Sövalye Nöbeti', lv: [55, 56], respawn: 110, members: [['ad_buz_sovalye', 2], ['ad_kar_haydut', 1]], loop: [[290, 110], [306, 110], [306, 122], [290, 122]] },
  { id: 'r19_p03', name: 'Kurt Devriyesi', lv: [54, 56], respawn: 100, members: [['ad_kar_warg', 2]], loop: [[360, 70], [372, 70], [372, 84], [360, 84]] },
  { id: 'r19_p04', name: 'Rahip Yürüyüşü', lv: [56, 57], respawn: 110, members: [['ad_buz_rahip', 2], ['ad_buz_ruhu', 1]], loop: [[330, 30], [346, 30], [346, 42], [330, 42]] },
  { id: 'r19_p05', name: 'Haydut Gözcüleri', lv: [55, 57], respawn: 110, members: [['ad_kar_haydut_okcu', 3]], loop: [[280, 62], [296, 62], [296, 74], [280, 74]] },
  // ---- R20
  { id: 'r20_p01', name: 'Hortlak Yürüyüşü', lv: [57, 58], respawn: 120, members: [['ad_don_hortlak', 3], ['ad_don_iskelet', 1]], loop: [[256, 186], [270, 186], [270, 198], [256, 198]] },
  { id: 'r20_p02', name: 'Zemheri Golemleri', lv: [58, 59], respawn: 130, members: [['ad_buz_golemi', 2], ['ad_kar_saman', 1]], loop: [[280, 226], [292, 226], [292, 240], [280, 240]] },
  { id: 'r20_p03', name: 'Muhafız Devriyesi', lv: [58, 59], respawn: 130, members: [['ad_buz_muhafiz', 2], ['ad_buz_sovalye', 1]], loop: [[340, 200], [354, 200], [354, 214], [340, 214]] },
  { id: 'r20_p04', name: 'Buz Rahip Yolu', lv: [57, 58], respawn: 120, members: [['ad_buz_rahip', 2], ['ad_kar_saman', 1]], loop: [[330, 278], [344, 278], [344, 290], [330, 290]] },
  { id: 'r20_p05', name: 'Mamut Sürüsü', lv: [58, 59], respawn: 140, members: [['ad_mamut', 2]], loop: [[360, 160], [374, 160], [374, 172], [360, 172]] },
  // ---- R21
  { id: 'r21_p01', name: 'Zirve Nöbetçileri', lv: [59, 60], respawn: 140, members: [['ad_buz_muhafiz', 2], ['ad_buz_sovalye', 1]], loop: [[280, 306], [294, 306], [294, 318], [280, 318]] },
  { id: 'r21_p02', name: 'Kartal Sürüsü Zirve', lv: [59, 60], respawn: 130, members: [['ad_kartal', 3]], loop: [[330, 330], [344, 330], [344, 342], [330, 342]] },
  { id: 'r21_p03', name: 'Yeti Devriyesi', lv: [59, 60], respawn: 130, members: [['ad_yeti', 2]], loop: [[300, 340], [312, 340], [312, 352], [300, 352]] },
  { id: 'r21_p04', name: 'Kar Rahip Yolu', lv: [59, 60], respawn: 130, members: [['ad_buz_rahip', 2]], loop: [[354, 306], [368, 306], [368, 318], [354, 318]] },
  { id: 'r21_p05', name: 'Don Gözcüleri', lv: [59, 60], respawn: 130, members: [['ad_don_iskelet_okcu', 2], ['ad_buz_cin', 1]], loop: [[262, 360], [276, 360], [276, 372], [262, 372]] },
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
// Rares (6), mini-bosses (3)
// ---------------------------------------------------------------------------------------------------------------------

export const RARES: RareSpawnDef[] = [
  { id: 'rare_ad_kiragi_kurdu', enemyId: 'rare_ad_kiragi_kurdu', level: 46, spots: [[40, 140], [90, 255], [110, 200]], respawnMin: [10, 14], announce: true, lootTable: 'loot_rare_ad_kiragi_kurdu' },
  { id: 'rare_ad_buz_aga', enemyId: 'rare_ad_buz_aga', level: 49, spots: [[160, 300], [220, 348], [190, 262]], respawnMin: [10, 15], announce: true, lootTable: 'loot_rare_ad_buz_aga' },
  { id: 'rare_ad_kar_yeti', enemyId: 'rare_ad_kar_yeti', level: 52, spots: [[186, 70], [240, 110], [140, 150]], respawnMin: [10, 15], announce: true, lootTable: 'loot_rare_ad_kar_yeti' },
  { id: 'rare_ad_firtina_kartali', enemyId: 'rare_ad_firtina_kartali', level: 55, spots: [[300, 20], [368, 96], [262, 116]], respawnMin: [12, 16], announce: true, lootTable: 'loot_rare_ad_firtina_kartali' },
  { id: 'rare_ad_don_kral', enemyId: 'rare_ad_don_kral', level: 58, spots: [[262, 212], [318, 160], [364, 244]], respawnMin: [12, 16], announce: true, lootTable: 'loot_rare_ad_don_kral' },
  { id: 'rare_ad_donmus_sovalye', enemyId: 'rare_ad_donmus_sovalye', level: 59, spots: [[300, 338], [360, 332], [268, 372]], respawnMin: [12, 16], announce: true, lootTable: 'loot_rare_ad_donmus_sovalye' },
];

export const MINIBOSSES: MiniBossDef[] = [
  { id: 'mb_ad_buz_dev', enemyId: 'mb_ad_buz_dev', level: 49, lair: [200, 318], regionId: 'r17', respawnMin: 20, lootTable: 'loot_mb_ad_buz_dev' },
  { id: 'mb_ad_kar_alfa', enemyId: 'mb_ad_kar_alfa', level: 55, lair: [330, 60], regionId: 'r19', respawnMin: 22, lootTable: 'loot_mb_ad_kar_alfa' },
  { id: 'mb_ad_zirve_muhafizi', enemyId: 'mb_ad_zirve_muhafizi', level: 59, lair: [320, 372], regionId: 'r21', respawnMin: 25, lootTable: 'loot_mb_ad_zirve_muhafizi' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Shrines, chests, cursed chests, gathering, hidden areas, vistas
// ---------------------------------------------------------------------------------------------------------------------

export const SHRINES: ShrineSpotDef[] = [
  { id: 'sh_r16_a', type: 'shrine_haste', regionId: 'r16', pos: [36, 176] },
  { id: 'sh_r17_a', type: 'shrine_power', regionId: 'r17', pos: [176, 286] },
  { id: 'sh_r18_a', type: 'shrine_wisdom', regionId: 'r18', pos: [158, 116] },
  { id: 'sh_r18_b', type: 'shrine_ward', regionId: 'r18', pos: [214, 74] },
  { id: 'sh_r19_a', type: 'shrine_greed', regionId: 'r19', pos: [292, 84] },
  { id: 'sh_r20_a', type: 'shrine_power', regionId: 'r20', pos: [290, 252] },
  { id: 'sh_r20_b', type: 'shrine_ward', regionId: 'r20', pos: [344, 210] },
  { id: 'sh_r21_a', type: 'shrine_haste', regionId: 'r21', pos: [330, 300] },
];

const chest = (id: string, kind: ChestSpotDef['kind'], regionId: string, pos: [number, number]): ChestSpotDef => ({ id, kind, regionId, pos, respawnSec: 1800 });
export const CHESTS: ChestSpotDef[] = [
  chest('ch_r16_a', 'chest_iron', 'r16', [56, 196]), chest('ch_r16_b', 'chest_gold', 'r16', [100, 150]),
  chest('ch_r17_a', 'chest_iron', 'r17', [146, 310]), chest('ch_r17_b', 'chest_gold', 'r17', [224, 330]),
  chest('ch_r18_a', 'chest_iron', 'r18', [150, 46]), chest('ch_r18_b', 'chest_gold', 'r18', [236, 140]),
  chest('ch_r19_a', 'chest_iron', 'r19', [300, 48]), chest('ch_r19_b', 'chest_gold', 'r19', [352, 90]),
  chest('ch_r20_a', 'chest_iron', 'r20', [280, 190]), chest('ch_r20_b', 'chest_gold', 'r20', [352, 262]),
  chest('ch_r21_a', 'chest_iron', 'r21', [290, 330]), chest('ch_r21_b', 'chest_gold', 'r21', [360, 300]),
];

export const CURSED = [
  { id: 'cc_r16', regionId: 'r16', pos: [44, 186] as [number, number] },
  { id: 'cc_r17', regionId: 'r17', pos: [214, 330] as [number, number] },
  { id: 'cc_r18', regionId: 'r18', pos: [200, 150] as [number, number] },
  { id: 'cc_r19', regionId: 'r19', pos: [312, 52] as [number, number] },
  { id: 'cc_r20', regionId: 'r20', pos: [300, 228] as [number, number] },
  { id: 'cc_r21', regionId: 'r21', pos: [350, 340] as [number, number] },
];

/** Gathering tables are `gather_<kind>_<region>` (loot.ts GATHER_TABLES): the tier 4-6 materials of the region. */
const gather = (id: string, kind: GatherFieldDef['kind'], regionId: string, center: [number, number], radius: number, count: number, respawnSec: number): GatherFieldDef =>
  ({ id, kind, regionId, center, radius, count, respawnSec, lootTable: `gather_${kind}_${regionId}` });
export const GATHER: GatherFieldDef[] = [
  gather('gf_r16_ore', 'ore', 'r16', [40, 246], 4, 4, 300), gather('gf_r16_herb', 'herb', 'r16', [40, 136], 4, 6, 240),
  gather('gf_r17_ore', 'ore', 'r17', [186, 330], 4, 4, 300), gather('gf_r17_herb', 'herb', 'r17', [160, 258], 4, 6, 240),
  gather('gf_r18_ore', 'ore', 'r18', [172, 144], 4, 4, 300), gather('gf_r18_herb', 'herb', 'r18', [232, 52], 4, 6, 240),
  gather('gf_r19_ore', 'ore', 'r19', [340, 112], 4, 4, 300), gather('gf_r19_herb', 'herb', 'r19', [268, 26], 4, 6, 240),
  gather('gf_r20_ore', 'ore', 'r20', [262, 262], 4, 4, 300), gather('gf_r20_herb', 'herb', 'r20', [356, 178], 4, 6, 240),
  gather('gf_r21_ore', 'ore', 'r21', [300, 304], 4, 4, 300), gather('gf_r21_herb', 'herb', 'r21', [360, 364], 4, 6, 240),
];

export const HIDDEN: HiddenAreaDef[] = [
  { id: 'hd_r16', name: 'Kartal Geçidi Mağarası', regionId: 'r16', pos: [16, 128], radius: 3, xpPct: 9, rewards: ['chest_iron', 'Kar Kurdu Postu x3'] },
  { id: 'hd_r17', name: 'Donmuş Kervan Enkazı', regionId: 'r17', pos: [124, 256], radius: 3, xpPct: 9, rewards: ['chest_gold', '2 Büyük Can İksiri'] },
  { id: 'hd_r18', name: 'Buz Altı Mabedi', regionId: 'r18', pos: [240, 44], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
  { id: 'hd_r19', name: 'Fırtınanın Gözü', regionId: 'r19', pos: [372, 40], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x2'] },
  { id: 'hd_r20', name: 'Zemheri Mezarı', regionId: 'r20', pos: [358, 194], radius: 3, xpPct: 10, rewards: ['chest_gold', 'Ejderha Pulu x3'] },
  { id: 'hd_r21', name: 'Kuşak Kapısı', regionId: 'r21', pos: [372, 318], radius: 3, xpPct: 11, rewards: ['chest_gold', 'Ejderha Pulu x3'] },
];

export const VISTAS: VistaDef[] = [
  { id: 'vs_r16', name: 'Geçit Bakışı', regionId: 'r16', pos: [112, 124], xpPct: 6 },
  { id: 'vs_r17', name: 'Kırağı Uçurumu', regionId: 'r17', pos: [236, 262], xpPct: 6 },
  { id: 'vs_r18', name: 'Göl Seyir Tepesi', regionId: 'r18', pos: [130, 48], xpPct: 6 },
  { id: 'vs_r19', name: 'Fırtına Zirvesi', regionId: 'r19', pos: [372, 26], xpPct: 7 },
  { id: 'vs_r20', name: 'Zemheri Tepesi', regionId: 'r20', pos: [374, 226], xpPct: 7 },
  { id: 'vs_r21', name: 'Zirve Kapısı Bakışı', regionId: 'r21', pos: [264, 306], xpPct: 7 },
];
