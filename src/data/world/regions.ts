import type { BorderSeg, LandmarkDef, RegionTheme, RoadDef, RoomDef, WorldRegion } from '../../types/dungeons';
import type { MusicId } from '../../types/audio';
import type { VfxId } from '../../types/vfx';
import { LAYOUT, skyUrl, tileRect, texUrl } from './layout';

/**
 * Sisli Vadi regions, rooms and terrain features (GDD_OPENWORLD §1.2-1.5, §5.7). OWNER: content module.
 * Numbers come from the layout JSON (fog / hemi / sun / tex / levels / rects); the few textual extras (music, panorama, ambient
 * particles) are listed in EXTRA below, copied from the layout's theme prose.
 */

/** Rooms = region rects + bridge / island / approach rects. Outdoor: `wall: 'cave'` draws tree walls (OutdoorScenery). */
export const ROOMS: RoomDef[] = LAYOUT.rooms.map((r) => ({
  id: r.id, name: r.name, rect: tileRect(r.rect), floor: 'dirt', wall: 'cave', explicitDecor: true,
}));

export const ROADS: RoadDef[] = LAYOUT.roads.map((r) => ({ id: r.id, kind: r.kind, width: r.width, pts: r.pts }));

/** Lakes and rivers (tile rects). The lake island (r7_mabed_adasi) sits inside the lake and is reached by the Hayalet Kayık. */
export const WATER = LAYOUT.water.map((w) => ({ id: w.id, rect: { x: w.x0, z: w.z0, w: w.x1 - w.x0, h: w.z1 - w.z0 } }));

/**
 * Map border / shore segments. The layout does not list them: unlisted void edges default to 'trees' (types/dungeons.ts).
 * Shore and cliff segments are a follow-up for the world builder (WP5).
 */
export const BORDERS: BorderSeg[] = [];

/** Sign-post silhouettes per region. `recipe` is a key the world builder (WP5, OutdoorBuilder) maps to its scenery kit. */
const LANDMARK_RECIPE: Record<string, string> = {
  lm_degirmen: 'windmill_cluster',
  lm_hoyuk: 'mushroom_ring',
  lm_kule: 'watch_tower_ruin',
  lm_agit_agaci: 'dead_tree_lanterns',
  lm_kizil_kale: 'red_castle_ruin',
  lm_kara_anit: 'obelisk_shrine',
  lm_tarla_kulesi: 'watch_tower_ruin',
  lm_haydut_kalesi: 'red_castle_ruin',
  lm_bataklik_mantari: 'mushroom_ring',
  lm_ork_agaci: 'dead_tree_lanterns',
  lm_harabe_anit: 'obelisk_shrine',
  lm_kanyon_gozcu: 'watch_tower_ruin',
};
export const LANDMARKS: LandmarkDef[] = LAYOUT.landmarks.map((l) => ({
  id: l.id, name: l.name, regionId: l.region, pos: l.pos, recipe: LANDMARK_RECIPE[l.id] ?? l.id,
}));

/** Textual theme extras (layout `theme.music`, `theme.sky`, `theme.vfx`). Numeric theme values come from the layout. */
interface RegionExtra {
  music: MusicId;
  skyImage?: string;
  skyZenith?: number;
  skyHorizon?: number;
  ambientVfx?: VfxId;
  ambientColor?: number;
}
const EXTRA: Record<string, RegionExtra> = {
  r1: { music: 'world_vale', skyZenith: 0x8fa090, skyHorizon: 0x9aa890, ambientVfx: 'ambient_dust', ambientColor: 0xc8d8b0 },
  r2: { music: 'world_vale', skyImage: skyUrl('cloudy-sky-02.jpg'), ambientVfx: 'ambient_dust', ambientColor: 0xd0a050 },
  r3: { music: 'world_hills', skyImage: skyUrl('cloudy-sky-03.jpg'), ambientVfx: 'ambient_dust', ambientColor: 0xc8a878 },
  r4: { music: 'world_marsh', skyImage: skyUrl('cloudy-sky-10.jpg'), ambientVfx: 'ambient_shadow_wisps', ambientColor: 0x60ffd0 },
  r5: { music: 'world_canyon', skyImage: skyUrl('cloudy-sky-21.jpg'), ambientVfx: 'ambient_embers' },
  r6: { music: 'world_ruins', skyImage: skyUrl('cloudy-sky-12.jpg'), ambientVfx: 'ambient_shadow_wisps', ambientColor: 0xb060ff },
};

/** The six themed regions. The layout tex order is [grass, dirt, cobble, dark]. */
export const REGIONS: WorldRegion[] = Object.entries(LAYOUT.regions).map(([id, r]): WorldRegion => {
  const t = r.theme;
  const ex = EXTRA[id] ?? { music: 'world_vale' as MusicId };
  const theme: RegionTheme = {
    fogColor: t.fog[0], fogNear: t.fog[1], fogFar: t.fog[2],
    hemiSky: t.hemi[0], hemiGround: t.hemi[1], hemiIntensity: t.hemi[2],
    sunColor: t.sun[0], sunIntensity: t.sun[1],
    skyZenith: ex.skyZenith ?? t.hemi[0], skyHorizon: ex.skyHorizon ?? t.fog[0], skyImage: ex.skyImage,
    groundTex: { grass: texUrl(t.tex[0]), dirt: texUrl(t.tex[1]), cobble: texUrl(t.tex[2]), dark: texUrl(t.tex[3]) },
    music: ex.music,
    ambientVfx: ex.ambientVfx, ambientColor: ex.ambientColor,
  };
  return {
    id, roomId: r.room, name: r.name, levels: r.levels, theme,
    landmarkId: LANDMARKS.find((l) => l.regionId === id)?.id,
  };
});

/** Region id -> room id (packs, pois and villages resolve their room through this). */
export const ROOM_OF_REGION: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.roomId]));
