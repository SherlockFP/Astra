import type { ArenaDef } from '../../types/arena';
import type { ArenaBracket } from '../../types/finder';
import type { DungeonDef, PropPlacement } from '../../types/dungeons';
import { tileToWorld } from './arenaRules';

/**
 * ARENA MAPS FOR THE MATCH FLOW (GDD_PVP_FINDER §3.2, package PV-04). The content package owns `src/data/arenas/index.ts` (ARENAS,
 * pickArenaMap, arenaToDungeonDef). This file does NOT import it statically: an eager `import.meta.glob` finds it when it exists and gives
 * an empty module otherwise, so the match flow compiles and runs either way. When the content module is missing, a built-in fallback
 * arena (flat ring with 4 pillars) is used.
 *
 * Contract used from the content module (all optional, duck-typed):
 *   ARENAS: Record<string, ArenaDef>
 *   pickArenaMap(mid: string, bracket: ArenaBracket): ArenaDef | string
 *   arenaToDungeonDef(def: ArenaDef): DungeonDef
 */

/** Built-in fallback: 12 x 12 tiles (48 m), four pillars, spawns at the west / east end. Pillars as the Kırık Kemer layout, no cover walls. */
export const FALLBACK_ARENA: ArenaDef = {
  id: 'halka_yedek',
  name: 'Yedek Halka',
  brackets: ['1v1', '2v2', '3v3'],
  grid: { w: 12, h: 12 },
  floor: 'stone_dark',
  wall: 'stone',
  theme: {
    fogColor: 0x1c1a1a, fogNear: 16, fogFar: 70, ambient: 0x504a44, ambientIntensity: 0.5, hemiSky: 0x808aa0, hemiGround: 0x302820,
    torchColor: 0xffa860, bloomStrength: 0.25, music: 'dungeon_crypt', tint: 0xd8d0c8,
  },
  lightColor: 0xffc890,
  walls: [],
  pillars: [{ pos: [3, 3], r: 0.6 }, { pos: [9, 3], r: 0.6 }, { pos: [3, 9], r: 0.6 }, { pos: [9, 9], r: 0.6 }],
  spawns: {
    A: [[1, 5.5], [1, 6.5], [1, 4.5]],
    B: [[11, 5.5], [11, 6.5], [11, 7.5]],
  },
  // a full-height gate wall 2 tiles in front of each spawn pocket (seals the pocket during prep)
  gates: [{ team: 'A', rect: { x: 2, z: 0, w: 0.5, h: 12 } }, { team: 'B', rect: { x: 9.5, z: 0, w: 0.5, h: 12 } }],
};

const MODEL = '/assets/models/dungeon/';

/** Generic ArenaDef -> DungeonDef (used when the content module has no adapter of its own). One room, pillar + cover props, no packs. */
export function arenaDefToDungeon(def: ArenaDef): DungeonDef {
  const props: PropPlacement[] = [];
  // the GDD writes cell EDGES (cell i spans [i, i+1)); the dungeon kit uses cell CENTRES, so points shift by -0.5 (data/arenas/index.ts)
  for (const p of def.pillars) props.push({ model: `${MODEL}pillar.glb`, pos: [p.pos[0] - 0.5, p.pos[1] - 0.5], collide: true, tag: 'pillar' });
  for (const w of def.walls) {
    for (let dx = 0; dx < w.w; dx++) {
      for (let dz = 0; dz < w.h; dz++) props.push({ model: `${MODEL}crates_stacked.glb`, pos: [w.x + dx, w.z + dz], collide: true });
    }
  }
  const s = def.spawns.A[0];
  return {
    id: def.id,
    name: def.name,
    shortName: def.name,
    lore: '',
    levelRange: [60, 60],
    timerSec: 300,
    forcesRequired: 0,
    theme: def.theme,
    grid: { w: def.grid.w, h: def.grid.h },
    rooms: [{
      id: 'arena', name: def.name, rect: { x: 0, z: 0, w: def.grid.w, h: def.grid.h }, floor: def.floor, wall: def.wall, lightColor: def.lightColor,
      explicitDecor: true, autoDecor: 0, props,
    }],
    doors: [],
    packs: [],
    bosses: [],
    start: { pos: [s[0] - 0.5, s[1] - 0.5], facing: 90 },
    exit: { pos: [s[0] - 0.5, s[1] - 0.5] },
  };
}

interface ContentModule {
  ARENAS?: Record<string, ArenaDef>;
  pickArenaMap?: (mid: string, bracket: ArenaBracket) => ArenaDef | string | undefined;
  arenaToDungeonDef?: (def: ArenaDef) => DungeonDef;
}

// Present once src/data/arenas/index.ts exists; an empty record before that (Vite resolves the glob at build time).
const found = import.meta.glob('../../data/arenas/index.ts', { eager: true }) as Record<string, ContentModule>;
const content: ContentModule = Object.values(found)[0] ?? {};

/** True when the content package's arenas are available. */
export const hasContentArenas = (): boolean => !!content.ARENAS && Object.keys(content.ARENAS).length > 0;

const hash32 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Arena definition by id (content first, then the fallback). */
export function getArenaDef(id: string): ArenaDef | undefined {
  if (id === FALLBACK_ARENA.id) return FALLBACK_ARENA;
  return content.ARENAS?.[id];
}

/** The map of a match: content `pickArenaMap` when present, else a seeded pick from ARENAS that allows the bracket, else the fallback. */
export function pickArena(mid: string, bracket: ArenaBracket): ArenaDef {
  try {
    const r = content.pickArenaMap?.(mid, bracket);
    const def = typeof r === 'string' ? content.ARENAS?.[r] : r;
    if (def) return def;
    const list = Object.values(content.ARENAS ?? {}).filter((a) => a.brackets.includes(bracket));
    if (list.length) return list[hash32(mid) % list.length];
  } catch (e) {
    console.warn('[arena] content map pick failed, using the fallback', e);
  }
  return FALLBACK_ARENA;
}

/** DungeonDef the scene builds for an arena (content adapter first). */
export function arenaDungeon(def: ArenaDef): DungeonDef {
  if (def.id !== FALLBACK_ARENA.id && content.arenaToDungeonDef) {
    try {
      return content.arenaToDungeonDef(def);
    } catch (e) {
      console.warn('[arena] content adapter failed, using the generic one', e);
    }
  }
  return arenaDefToDungeon(def);
}

export { tileToWorld };
