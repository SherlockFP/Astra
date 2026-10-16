/**
 * WoW target selection rules (Midnight retail, default settings): the ability auto-pick and the Tab cycle. Pure: no three, no G,
 * so tools/controls-check.mjs can test the rules directly. PlayerController feeds the candidates (distance, facing cosine, HP,
 * line of sight) and applies the answer.
 */

export const WOW_TARGET = {
  /** Half cone (deg) around the facing for the ability auto-pick: the front enemy only. */
  frontHalfDeg: 45,
  /** Enemies whose distance is within this (m) of the nearest one are tie-broken by the lower HP. */
  hpTieM: 1,
} as const;

export interface FrontCand {
  id: number;
  /** Metres from the character to the enemy centre. */
  dist: number;
  /** Cosine between the facing and the direction to the enemy (1 = straight ahead). */
  cos: number;
  /** HP fraction 0..1. */
  hpFrac: number;
}

/**
 * Ability with no target: the nearest enemy in the front cone (cos >= cos(frontHalfDeg)); among those within `hpTieM` of the nearest,
 * the lowest HP wins. Candidates must already be in range and visible to the caller. Null when none is in front.
 */
export function pickFrontTarget(cands: readonly FrontCand[]): number | null {
  const cosLim = Math.cos((WOW_TARGET.frontHalfDeg * Math.PI) / 180);
  const front = cands.filter((c) => c.cos >= cosLim).sort((a, b) => a.dist - b.dist || a.id - b.id);
  if (!front.length) return null;
  const lim = front[0].dist + WOW_TARGET.hpTieM;
  let pick = front[0];
  for (const c of front) {
    if (c.dist > lim) break;
    if (c.hpFrac < pick.hpFrac) pick = c;
  }
  return pick.id;
}

export interface TabCand {
  id: number;
  dist: number;
}

/**
 * WoW Tab (dir 1) and Shift+Tab (dir -1): the candidates in nearest-first order, stepping from the current target and wrapping.
 * No current target (or one not in the list): Tab takes the nearest, Shift+Tab the farthest. A sole candidate that is already the
 * target returns the same id (the caller keeps the selection). Null only for an empty list.
 */
export function wowTabNext(list: readonly TabCand[], curId: number | null, dir: 1 | -1): number | null {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a.dist - b.dist || a.id - b.id);
  const first = dir > 0 ? sorted[0] : sorted[sorted.length - 1];
  if (curId == null) return first.id;
  const i = sorted.findIndex((c) => c.id === curId);
  if (i < 0) return first.id;
  if (sorted.length === 1) return curId;
  return sorted[(i + dir + sorted.length) % sorted.length].id;
}
