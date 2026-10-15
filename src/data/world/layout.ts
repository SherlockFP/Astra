import LAYOUT_JSON from './sisli_vadi.layout.json' with { type: 'json' };
import { dg, fu, gp, hw, ip, kc, kf, kg, kn, ks, tw } from '../dungeons/kit';
import type { TileRect, WorldPerf } from '../../types/dungeons';

/**
 * Sisli Vadi design layout (OWNER: content module). `sisli_vadi.layout.json` is a copy of docs/GDD_OPENWORLD.layout.json, the
 * source of truth for the map. The typed modules of this folder (regions, camps, villages, pois, metin, quests) convert it with
 * the helpers below. Only the fields the converters read are typed here; design prose (notes, goals, sky text) is mined for
 * small facts only (panel names, quoted barks, patrol loops, texture names).
 *
 * Coordinates: tile coords on the 160 x 160 map (1 tile = 4 m) unless a field says metres; village props / npcs are metres
 * relative to the village centre (+x east, +z south), as in the layout.
 */

export interface LRect { x: number; z: number; w: number; h: number }
export interface LRoom { id: string; name: string; rect: LRect }
export interface LWater { id: string; x0: number; z0: number; x1: number; z1: number }
export interface LRoad { id: string; kind: 'dirt' | 'cobble' | 'boardwalk' | 'bridge'; width: number; pts: [number, number][] }
export interface LRegion {
  room: string; name: string; levels: [number, number];
  theme: {
    fog: [number, number, number]; hemi: [number, number, number]; sun: [number, number];
    sky: string; tex: [string, string, string, string]; music: string; vfx: string; trees?: string; landmark?: string;
  };
}
export interface LMember { enemyId: string; count: number }
export interface LPack {
  id: string; name: string; region: string; center: [number, number]; radius: number; levelRange: [number, number];
  respawnSec: number; members: LMember[]; flags?: string[]; note?: string;
}
export interface LPatrol {
  id: string; name: string; region: string; members: LMember[]; levelRange: [number, number]; respawnSec: number; patrol: [number, number][];
}
export interface LSettlement { id: string; name: string; kind: 'village' | 'camp'; center: [number, number]; halfTiles: [number, number] }
export interface LArena { id: string; name: string; region: string; center: [number, number]; radiusTiles: number }
export interface LWaypoint { id: string; name: string; region: string; pos: [number, number] }
export interface LEntrance {
  id: string; name: string; dungeonId: string; region: string; pos: [number, number]; facing: number; minLevel: number;
}
export interface LMetinSpot { id: string; region: string; pos: [number, number]; tier: string }
export interface LMetinTier { id: string; name: string; level: number; region: string; hpMult: number; armorMult: number }
export interface LRare {
  id: string; base: string; scale: number; tint: string; level: number; hpMult: number; spots: [number, number][];
  respawnMin: [number, number]; special: string; drop: string;
}
export interface LMiniboss {
  id: string; base: string; scale: number; tint: string; level: number; hpMult: number; lair: [number, number]; region: string;
  abilities: string; respawnMin: number; loot: string;
}
export interface LShrine { id: string; type: string; region: string; pos: [number, number] }
export interface LChest { id: string; kind: 'chest_wood' | 'chest_iron' | 'chest_gold'; region: string; pos: [number, number] }
export interface LCursed { id: string; region: string; pos: [number, number] }
export interface LGather {
  id: string; kind: 'ore' | 'herb'; region: string; center: [number, number]; radiusTiles: number; count: number; respawnSec: number; yield: string;
}
export interface LHidden { id: string; name: string; region: string; pos: [number, number]; radiusTiles: number }
export interface LVista { id: string; name: string; region: string; pos: [number, number] }
/** Named sub-area: its silhouette is drawn by `recipe` (WorldDecor); the id is the default key when no recipe is given. */
export interface LLandmark { id: string; name: string; region: string; pos: [number, number]; recipe?: string; rot?: number }
/**
 * Decor entry (tools/world-fill.mjs writes them; WorldDecorFill draws them). `kind`: vignette (a small story: camp, cart, grave,
 * shrine), field (farm beside a village), signpost (a road junction with destination `lines`), flora / rocks (filler clusters).
 * pos in tiles, rot in degrees.
 */
export interface LDecor {
  id: string; kind: 'vignette' | 'field' | 'signpost' | 'flora' | 'rocks' | 'grove'; recipe: string; region: string;
  pos: [number, number]; rot: number; lines?: string[];
}
export interface LFarm { id: string; name: string; pack: string; region: string; lootTable: string; focus: string }
export interface LBuilding { label: string; model: string; x: number; z: number; rot: number; scale: number }
export interface LRow { label: string; model: string; placement: string; count: string }
export interface LNpc { id: string; name: string; role: string; model: string; x: number; z: number; rot: number; note?: string }
export interface LVillage {
  id: string; name: string; bounds: [number, number]; buildings: LBuilding[]; rows: LRow[]; npcs: LNpc[];
}
export interface LQuestMain {
  id: string; name: string; giver: string; place: string; level: number; kind: string; goal: string;
  xpPct: number; goldPerLevel: number; items: string; next?: string;
}
export interface LQuestSide { id: string; name: string; giver: string; place: string; level: number; goal: string; xpPct: number; items: string }
export interface LBio { step: number; minLevel: number; item: string; count: number; source: string; reward: string }

/**
 * Zone size and streaming (OPTIONAL; docs/ENGINE_BIGMAPS.md). Without it `grid` (tiles) is the zone size, as before.
 * `sizeM` is the zone edge in METRES (a number = square, or [x, z]); gridOf() turns it into tiles. Zones above 800 m stream their
 * terrain and scenery by chunk automatically ('auto'); the other fields tune that.
 */
export interface LZone {
  sizeM?: number | [number, number];
  stream?: 'auto' | 'on' | 'off';
  /** Streaming chunk edge (m), a multiple of 16, default 64. */
  chunkM?: number;
  /** Radius around the player that stays built (m), default widest region fogFar + 64, 96..320. */
  viewM?: number;
}

export interface LayoutDoc {
  id: string;
  grid: { w: number; h: number };
  /** Optional zone size / streaming block (see LZone). */
  zone?: LZone;
  tileSize: number;
  levels: number[];
  rooms: LRoom[];
  water: LWater[];
  roads: LRoad[];
  regions: Record<string, LRegion>;
  packs: LPack[];
  patrols: LPatrol[];
  settlements: LSettlement[];
  arenas: LArena[];
  waypoints: LWaypoint[];
  entrances: LEntrance[];
  metinSpots: LMetinSpot[];
  metinTiers: LMetinTier[];
  rares: LRare[];
  minibosses: LMiniboss[];
  shrines: LShrine[];
  chests: LChest[];
  cursedChests: LCursed[];
  gatherFields: LGather[];
  hiddenAreas: LHidden[];
  vistas: LVista[];
  landmarks: LLandmark[];
  /** Decor entries (see LDecor); absent in maps without the fill pass. */
  decor?: LDecor[];
  farmSpots: LFarm[];
  villages: LVillage[];
  quests: { main: LQuestMain[]; side: LQuestSide[]; bio: LBio[] };
}

/** The layout JSON, typed by the interfaces above (the JSON is hand-written design data, checked by tools/content-check.mjs). */
export const LAYOUT = LAYOUT_JSON as unknown as LayoutDoc;

// ---------------------------------------------------------------------------------------------------------------------
// Converters shared by the typed modules
// ---------------------------------------------------------------------------------------------------------------------

export const round2 = (v: number): number => Math.round(v * 100) / 100;

export const tileRect = (r: LRect): TileRect => ({ x: r.x, z: r.z, w: r.w, h: r.h });

/** "0xe8e8f0" -> 0xe8e8f0; anything else (e.g. "-") -> undefined. */
export function hexOf(s: string | undefined): number | undefined {
  return s && /^0x[0-9a-fA-F]+$/.test(s) ? parseInt(s, 16) : undefined;
}

const MODEL_FNS: Record<string, (...a: string[]) => string> = { dg, fu, gp, hw, ip, kc, kf, kg, kn, ks, tw };

/**
 * Layout model expression -> GLB url: "tw('buildings/red/building_tower_A_red')" -> /assets/models/town/...glb,
 * "ip('psx-walls-fences','plackard-wall/plackard_closed_full')" -> itch pack url. Plain urls pass through unchanged. Unknown
 * forms are returned as they are, so tools/content-check.mjs reports them as missing models.
 */
export function modelUrl(expr: string): string {
  const m = /^\s*(\w+)\((.*)\)\s*$/.exec(expr);
  const fn = m ? MODEL_FNS[m[1]] : undefined;
  if (!m || !fn) return expr.trim();
  return fn(...[...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]));
}

/** Ground texture name (tt1-grass-04, tt2-dirt-03, tt3-stone-23) -> /assets/textures/itch/tiny-texture-pack-N/name.png. */
export function texUrl(name: string): string {
  const pack = /^tt(\d)-/.exec(name)?.[1] ?? '1';
  return `/assets/textures/itch/tiny-texture-pack-${pack}/${name}.png`;
}

/** Panorama file name (cloudy-sky-02.jpg) -> url. */
export const skyUrl = (file: string): string => `/assets/sky/itch/cloudy-skyboxes-panorama/${file}`;

// ---------------------------------------------------------------------------------------------------------------------
// Zone size (docs/ENGINE_BIGMAPS.md)
// ---------------------------------------------------------------------------------------------------------------------

/** What the zone helpers read: a layout doc, or a TypeScript-authored zone (Karakır Bozkırı, karakir_world.ts). */
export type ZoneSource = Pick<LayoutDoc, 'grid' | 'tileSize' | 'zone'>;

/** DungeonDef.grid of a layout: `zone.sizeM` (metres, rounded up to whole tiles) when present, else the `grid` tile counts. */
export function gridOf(doc: ZoneSource): { w: number; h: number } {
  const m = doc.zone?.sizeM;
  if (m === undefined) return { w: doc.grid.w, h: doc.grid.h };
  const [mx, mz] = typeof m === 'number' ? [m, m] : m;
  const t = doc.tileSize || 4;
  return { w: Math.ceil(mx / t), h: Math.ceil(mz / t) };
}

/** WorldExtras.perf of a layout: the given budgets plus the layout's streaming fields. */
export function perfOf(doc: ZoneSource, base: WorldPerf): WorldPerf {
  const z = doc.zone;
  if (!z) return base;
  const out: WorldPerf = { ...base };
  if (z.stream !== undefined) out.stream = z.stream;
  if (z.chunkM !== undefined) out.streamChunkM = z.chunkM;
  if (z.viewM !== undefined) out.viewM = z.viewM;
  return out;
}
