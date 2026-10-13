import { G } from '../../../game/G';
import type { DungeonDef } from '../../../types/dungeons';
import type { AffixId } from '../../../types/mythic';
import type { DungeonParams } from '../../../scenes/scenes';
import { affixesForLevel, clampN, toast } from './base';
import { HEROIC_LEVEL, type LadderDiff } from './ladder';

/**
 * Run start shared by the Zindan Bulucu (finder) and, later, the keystone panel (UX-52a). Ported from keystone.ts
 * (baseParams / enemyLevelFor / go) so both start the same DungeonParams. keystone.ts itself is not edited here.
 * OWNER: panels-game module.
 */

/** Party size and average level: the local player plus every peer (a peer without a summary counts as the local level). */
export function partyLevels(): { size: number; avgLevel: number } {
  const levels: number[] = [G.character?.level ?? 1];
  for (const p of G.net.peers.values()) if (p.peerId !== G.net.selfId) levels.push(p.summary?.level ?? levels[0]);
  return { size: levels.length, avgLevel: Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) };
}

/** Enemy level for the run (GDD_CONTENT 6): Normal clamp(avg, min, min + 10), Kahramanlık clamp(avg, 50, 60), Mitik 0 / Mitik+ 60. */
export function enemyLevelFor(def: DungeonDef | undefined, diff: LadderDiff, partyAvgLevel: number): number {
  if (diff === 'normal') {
    const min = def?.levelRange?.[0] ?? 1;
    return clampN(partyAvgLevel, min, Math.min(60, min + 10));
  }
  if (diff === 'heroic') return clampN(partyAvgLevel, HEROIC_LEVEL, 60);
  return 60;
}

export interface BuildOpts {
  /** Mitik+ only: the key level (the key's own dungeon must be `def`). */
  keyLevel?: number;
  /** REAL peer id of the key owner (default: the local player). */
  keyOwner?: string;
  returnTo?: DungeonParams['returnTo'];
}

/** DungeonParams for one run, as the keystone panel builds them. */
export function buildParams(def: DungeonDef, diff: LadderDiff, opts: BuildOpts = {}): DungeonParams {
  const party = partyLevels();
  const isMp = diff === 'mythicplus';
  const keyLevel = isMp ? opts.keyLevel ?? 2 : 0;
  return {
    dungeonId: def.id,
    difficulty: diff,
    keyLevel,
    seed: (Math.random() * 0xffffffff) >>> 0,
    affixes: isMp ? (affixesForLevel(keyLevel) as AffixId[]) : [],
    enemyLevel: enemyLevelFor(def, diff, party.avgLevel),
    partySize: party.size,
    keyOwner: opts.keyOwner || G.net.selfId || 'local',
    ...(opts.returnTo ? { returnTo: opts.returnTo } : {}),
  };
}

/** Sends the run to the host (authority) or asks the host to start it. Returns false (toast shown) on failure. */
export function startRun(params: DungeonParams): boolean {
  try {
    if (G.net.isAuthority) G.net.requestScene('dungeon', params);
    else G.net.requestSceneFromHost('dungeon', params);
    return true;
  } catch (e) {
    console.error('[finder] start failed', e);
    toast('Zindan başlatılamadı.', 'error');
    return false;
  }
}
