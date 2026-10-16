import type { DungeonDef } from '../../types/dungeons';
import type { EnemyDef } from '../../types/enemies';
import { BOSSES, ENEMIES } from '../enemies';

/**
 * Low-level dungeons (WoW-style "dungeons from level 1"): a Normal run whose band starts at or below LOW_LEVEL_MAX can be started
 * from level 1. The enemy level follows the party average clamped to the band (instanceScaling.normalEnemyLevel), so a level-1 run
 * fights level-1 enemies. Their kill XP is shaped by dungeonKillXpMult so one full run gives about one level at levels 1-5 and
 * about 65 % of a level around level 10 (tools/pace-check.mjs "dungeon route"). Pure: no G, shared by the finder, LootSystem and the tool.
 */

/** A dungeon is low-level when its whole band ends at or below this level (and it is a handcrafted levelling dungeon, not a rift / raid / zone). */
export const LOW_LEVEL_MAX = 10;

/**
 * Kill XP multiplier of a low-level dungeon by enemy level (linear between points, x1 above the band). The bosses are worth 100 x the
 * base (EnemyDef.xp 100), so packs and bosses together are scaled to the targets for Sisli Magara (raw ratio 2.93 / 1.46 / 1.80 at
 * L1 / L5 / L10): one run ~ 1 level at L1 and L5, ~ 65 % of a level at L10. The early XP curve doubles to L5, so the multiplier bends.
 */
const KILL_XP_POINTS: readonly [number, number][] = [[1, 0.34], [5, 0.68], [10, 0.36]];

/** A handcrafted levelling dungeon whose band starts at or below LOW_LEVEL_MAX. Kadim Yarik rifts (id `fis.` ...) never qualify. */
export function isLowLevelDungeon(def: Pick<DungeonDef, 'id' | 'levelRange' | 'raid' | 'season' | 'endgame' | 'outdoor'> | undefined): boolean {
  if (!def || def.raid || def.season || def.endgame || def.outdoor) return false;
  if (def.id.startsWith('fis.')) return false;
  return !!def.levelRange && def.levelRange[1] <= LOW_LEVEL_MAX;
}

/** Kill XP x for a kill at enemy level `lvl` inside `def` (x1 for every dungeon that is not low-level). */
export function dungeonKillXpMult(def: Parameters<typeof isLowLevelDungeon>[0], lvl: number): number {
  if (!isLowLevelDungeon(def) || lvl > (def?.levelRange?.[1] ?? 0)) return 1;
  const L = Math.max(KILL_XP_POINTS[0][0], Math.min(KILL_XP_POINTS[KILL_XP_POINTS.length - 1][0], lvl));
  for (let i = 1; i < KILL_XP_POINTS.length; i++) {
    const [x1, y1] = KILL_XP_POINTS[i];
    if (L <= x1) {
      const [x0, y0] = KILL_XP_POINTS[i - 1];
      return y0 + ((y1 - y0) * (L - x0)) / (x1 - x0);
    }
  }
  return KILL_XP_POINTS[KILL_XP_POINTS.length - 1][1];
}

/**
 * Seconds per route step of the planning model. Dungeon mobs come in pulls of 2-3 (7 s each, not the 9 s single quest kill of the
 * ledger) and the starter's rooms are a short line (15 s walks). Solo starter run = ~8.6 min with the overhead below.
 */
export const RUN_KILL_S = 7;
export const RUN_BOSS_S = 60;
export const RUN_WALK_S = 15;
/** Seconds added to every run for the queue, the walk in and the rest (tools/xp-ledger.mjs, finder estimate). */
export const RUN_OVERHEAD_S = 120;

/** The mandatory route of a dungeon: optional packs, optional rooms and shortcut rooms are not counted. */
export function mandatoryRoute(def: DungeonDef): { packs: DungeonDef['packs']; bosses: DungeonDef['bosses']; mobs: number; rooms: number } {
  const packs = def.packs.filter((p) => !p.optional);
  const mobs = packs.reduce((n, p) => n + p.members.length, 0);
  const rooms = def.rooms.filter((r) => !r.optional && !r.skip).length;
  return { packs, bosses: def.bosses, mobs, rooms };
}

/** Planning estimate of one full run in minutes (mandatory route: kills, boss fights, walks). */
export function runMinutes(def: DungeonDef): number {
  const r = mandatoryRoute(def);
  return (r.mobs * RUN_KILL_S + r.bosses.length * RUN_BOSS_S + r.rooms * RUN_WALK_S) / 60;
}

/** Kill XP of one enemy def at enemy level `lvl` (the caller passes Progression.monsterXp; enemy level = player level in a run). */
type MonsterXp = (enemyLevel: number, rank: EnemyDef['rank'] | 'swarm', xpMult: number, playerLevel: number) => number;

/** XP of one full mandatory run at enemy level `lvl` (solo, no group bonus). */
export function runXp(def: DungeonDef, lvl: number, monsterXp: MonsterXp): number {
  const r = mandatoryRoute(def);
  const mult = dungeonKillXpMult(def, lvl);
  let xp = 0;
  for (const p of r.packs) {
    for (const m of p.members) {
      const e = ENEMIES[m.enemyId] ?? BOSSES[m.enemyId];
      if (!e) continue;
      xp += monsterXp(lvl, e.role === 'swarm' ? 'swarm' : e.rank, e.xp, lvl) * mult;
    }
  }
  for (const b of r.bosses) {
    const e = BOSSES[b.bossId];
    if (e) xp += monsterXp(lvl, 'boss', e.xp, lvl) * mult;
  }
  return Math.round(xp);
}
