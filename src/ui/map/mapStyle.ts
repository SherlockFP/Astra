/**
 * Shared look of the open-world map: the world map panel (ui/panels/game/map.ts) and the minimap (ui/hud/Minimap.ts) draw the same
 * painted atlas (atlas.ts) with the same palette, glyphs (glyphs.ts) and level-band colours. Pure data + small helpers, no DOM.
 * OWNER: hud module (map rendering).
 */

export type Rgb = readonly [number, number, number];

/** Biome colour per open-world region id (painted ground; the hill shading and the height tint are added by atlas.ts). */
export const BIOME: Record<string, Rgb> = {
  r1: [0x4c, 0x78, 0x38], // Sisli Koru: forest green
  r2: [0xc4, 0xa2, 0x4e], // Altın Tarlalar: wheat
  r3: [0x8a, 0x6f, 0x46], // Haydut Tepeleri: umber hills
  r4: [0x4e, 0x66, 0x55], // Ağıt Bataklığı: marsh grey-green
  r5: [0xa6, 0x62, 0x3c], // Ork Kanyonu: ochre red
  r6: [0x5c, 0x4c, 0x6c], // Lanetli Harabeler: violet grey
};
/** Ground of a land room that belongs to no region (bridges, approaches, islands). */
export const LAND_COL: Rgb = [0x8e, 0x88, 0x5e];
/** Off the land (rock, mountain flanks around the zone). */
export const VOID_COL: Rgb = [0x5a, 0x55, 0x49];
export const WATER_DEEP: Rgb = [0x22, 0x52, 0x70];
export const WATER_SHALLOW: Rgb = [0x4a, 0x84, 0xa0];
export const SHORE_COL: Rgb = [0xc4, 0xde, 0xdc];
export const HIGHLAND_TINT: Rgb = [0xe8, 0xdc, 0xb0];

export interface RoadStyle { fill: Rgb; edge: Rgb }
export const ROAD_STYLE: Record<'dirt' | 'cobble' | 'boardwalk' | 'bridge', RoadStyle> = {
  dirt: { fill: [0xa2, 0x80, 0x52], edge: [0x3e, 0x2c, 0x16] },
  cobble: { fill: [0xb0, 0xab, 0x9e], edge: [0x3c, 0x39, 0x33] },
  boardwalk: { fill: [0x80, 0x5a, 0x34], edge: [0x2a, 0x1a, 0x0a] },
  bridge: { fill: [0x6a, 0x4a, 0x2a], edge: [0x1a, 0x10, 0x06] },
};

export const TREE_TOP: Rgb = [0x2f, 0x52, 0x27];
export const TREE_LIGHT: Rgb = [0x5f, 0x8c, 0x48];
export const TREE_DEAD: Rgb = [0x5a, 0x4f, 0x42];
export const PLAZA_COL: Rgb = [0xbd, 0xad, 0x88];
export const PLAZA_EDGE: Rgb = [0x3e, 0x2e, 0x18];

export const rgbCss = (c: Rgb, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Level-band colour of a camp or zone for the player's level: red = 3+ levels above the band, yellow = in band, green = 3+ above it's top, grey = trivial. */
export const TONE_RED = '#ff6a5a';
export const TONE_YELLOW = '#ffe24a';
export const TONE_GREEN = '#7fe08a';
export const TONE_GREY = '#8a8a8a';
export function bandTone(p: number, [lo, hi]: [number, number]): string {
  if (p <= lo - 3) return TONE_RED;
  if (p >= hi + 8) return TONE_GREY;
  if (p >= hi + 3) return TONE_GREEN;
  return TONE_YELLOW;
}

/** Legend filter ids (the map's filter row). `camp` = farming spots, `graveyard` = release points. */
export type FilterId = 'village' | 'waypoint' | 'metin' | 'boss' | 'rare' | 'dungeon' | 'chest' | 'shrine' | 'vista' | 'landmark' | 'gather' | 'quest' | 'camp' | 'graveyard';

/** Tracking mode of the map and the minimap (per viewer, localStorage): everything, quests only, or nothing but the player. */
export type TrackMode = 'all' | 'quest' | 'off';
export const TRACK_LABEL: Record<TrackMode, string> = { all: 'Hepsi', quest: 'Görevler', off: 'Hiçbiri' };

/** Dungeon-gate and camp colours shared by the glyphs and the minimap. */
export const GATE_COL = '#c9a0ff';
export const GATE_LOCKED_COL = '#8d939c';
export const CAMP_COL = '#e8c46a';
export const METIN_COL = '#b070ff';
export const BOSS_COL = '#ff5a4a';
export const MINIBOSS_COL = '#ff9a2a';
export const RARE_COL = '#e2ecf7';
export const WAYPOINT_COL = '#6ec8ff';
export const QUEST_RING_COL = '#58b0ff';
