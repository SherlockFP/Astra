import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import type { DungeonParams, WorldSpawn } from '../scenes';
import { worldSeedOf } from './util';

/**
 * DungeonParams of a trip into an open-world map (GDD_OPENWORLD §9.3 point 1): Normal difficulty, enemy level = the character's
 * level clamped to the map band, a seed fixed per map (camp levels and champion plates are the same on every peer and every
 * visit), and where to appear. The caller passes `returnTo` when the trip comes from a world entrance (exit = back there).
 * OWNER: scenes module.
 */
export function openWorldParams(dungeonId: string, spawn: WorldSpawn, returnTo?: DungeonParams['returnTo']): DungeonParams {
  const def = getDungeon(dungeonId);
  const [lo, hi] = def?.levelRange ?? [1, 30];
  const lvl = G.character?.level ?? lo;
  return {
    dungeonId,
    difficulty: 'normal',
    keyLevel: 0,
    seed: worldSeedOf(dungeonId),
    affixes: [],
    enemyLevel: Math.max(lo, Math.min(hi, lvl)),
    partySize: Math.max(1, G.net.partySize || 1),
    keyOwner: G.net.selfId,
    spawn,
    ...(returnTo ? { returnTo } : {}),
  };
}
