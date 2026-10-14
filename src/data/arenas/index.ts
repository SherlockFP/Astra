/**
 * PvP arena maps (GDD_PVP_FINDER §3.2). OWNER: content module (data).
 *
 * Maps are small tile grids built through the dungeon builder: `arenaToDungeonDef()` turns one map into a `DungeonDef` with one room.
 * The arena scene (DungeonParams.arena) builds it with buildDungeon(); `getDungeon(id)` resolves arena ids too, but they stay out
 * of DUNGEON_IDS, so the keystone UI, portals and the M+ list never see them.
 *
 * COORDINATES. The GDD writes arena coordinates as cell edges: cell i spans [i, i+1), so a spawn at 1.5 is the centre of cell 1
 * and a wall rect {x,z,w,h} covers cells x..x+w-1, z..z+h-1. The dungeon kit uses cell centres (integer = centre, see
 * data/dungeons/kit.ts). `arenaToDungeonDef()` shifts every point by -0.5 and keeps rects as they are; a wall cell becomes a prop at
 * its centre (integer coordinates in the kit).
 *
 * The arena types are kept here until src/types/arena.ts (ArenaDef) lands; the shapes match GDD §3.2.1 (except `brackets`, which
 * uses the bracket union of §2.8).
 */
import type { DoorDef, DungeonDef, DungeonTheme, FloorStyle, PropPlacement, RoomDef, TileRect, WallStyle } from '../../types/dungeons';
import { hashString } from '../../core/utils';
import { dg } from '../dungeons/kit';
import { KIRIK_KEMER } from './kirik_kemer';
import { KIZIL_HALKA } from './kizil_halka';
import { BUZ_HAVUZU } from './buz_havuzu';

export type ArenaBracket = '1v1' | '2v2' | '3v3';

/** One arena map (GDD §3.2.1). Spawn and pillar points use the GDD cell-edge convention (see above). */
export interface ArenaMapData {
  id: string;
  name: string;
  brackets: ArenaBracket[];
  grid: { w: number; h: number };
  floor: FloorStyle;
  wall: WallStyle;
  theme: DungeonTheme;
  lightColor: number;
  /** Blocking rectangles (cover). */
  walls: TileRect[];
  /** Pillars: centre (GDD coords) and radius in tiles. Block projectiles and ground-AoE line of sight. */
  pillars: { pos: [number, number]; r: number }[];
  /** Spawn points, 3 per team (1v1 uses index 0). */
  spawns: { A: [number, number][]; B: [number, number][] };
  /** Team gates, closed during prep. Visual and logic are the arena scene's. */
  gates: { team: 'A' | 'B'; rect: TileRect }[];
  /** Visual only (never blocked). */
  zones?: { kind: 'ice'; rect: TileRect }[];
}

/** Arena id → map. Ids: kirik_kemer, kizil_halka, buz_havuzu. */
export const ARENAS: Record<string, ArenaMapData> = {
  [KIRIK_KEMER.id]: KIRIK_KEMER,
  [KIZIL_HALKA.id]: KIZIL_HALKA,
  [BUZ_HAVUZU.id]: BUZ_HAVUZU,
};

export const ARENA_IDS: string[] = Object.keys(ARENAS).sort();

/** Arena id → dungeon-def adapter output (cache). */
const adapted: Record<string, DungeonDef> = {};

const toKit = (p: [number, number]): [number, number] => [p[0] - 0.5, p[1] - 0.5];

/** Adapter (GDD_PVP_FINDER §3.2.2): one room over the grid, one prop per pillar and per wall cell. No packs, bosses or doors. */
export function arenaToDungeonDef(def: ArenaMapData): DungeonDef {
  const cached = adapted[def.id];
  if (cached) return cached;
  const props: PropPlacement[] = [];
  for (const p of def.pillars) props.push({ model: dg('pillar'), pos: toKit(p.pos), collide: true, tag: 'pillar' });
  for (const w of def.walls) {
    for (let i = 0; i < w.w; i++) {
      for (let j = 0; j < w.h; j++) props.push({ model: dg('crates_stacked'), pos: [w.x + i, w.z + j], collide: true, tag: 'breakable' });
    }
  }
  const room: RoomDef = {
    id: 'arena', name: def.name, rect: { x: 0, z: 0, w: def.grid.w, h: def.grid.h },
    floor: def.floor, wall: def.wall, lightColor: def.lightColor, props,
  };
  const doors: DoorDef[] = [];
  const start = toKit(def.spawns.A[0]);
  const out: DungeonDef = {
    id: def.id, name: def.name, shortName: def.name, lore: 'PvP arenası. Kızıl ve Mavi takım, tek tur: son kalan takım kazanır.',
    levelRange: [60, 60], timerSec: 300, forcesRequired: 0, theme: def.theme, grid: { ...def.grid },
    rooms: [room], doors, packs: [], bosses: [],
    start: { pos: start, facing: 90 }, exit: { pos: start },
  };
  adapted[def.id] = out;
  return out;
}

/** Dungeon-def view of every arena (for getDungeon()). */
export const ARENA_DUNGEONS: Record<string, DungeonDef> = Object.fromEntries(ARENA_IDS.map((id) => [id, arenaToDungeonDef(ARENAS[id])]));

/**
 * Map of a match (GDD §3.1): the candidate list of the bracket, sorted by id, indexed by hash(mid). Every peer computes the same map
 * from the match id, so no sync message is needed. Returns undefined when no map fits the bracket.
 */
export function pickArenaMap(mid: string, bracket: ArenaBracket): ArenaMapData | undefined {
  const list = ARENA_IDS.map((id) => ARENAS[id]).filter((a) => a.brackets.includes(bracket));
  if (!list.length) return undefined;
  return list[hashString(mid) % list.length];
}
