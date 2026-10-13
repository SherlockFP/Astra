// CW-02 · Cast pushback, channel cut and school lockout rules (COMBAT_WOW §2.4, §2.6). Pure: the caller owns the per-cast counter.

export const PUSHBACK_CFG = { add: 0.5, max: 2, minHpFrac: 0.03, channelCut: 0.25 } as const;

export interface HitForPushback {
  /** Hit damage as a fraction of max HP. */
  hitFrac: number;
  /** DoT ticks never push. */
  dot?: boolean;
  /** Fully absorbed hits never push. */
  absorbed?: boolean;
  /** Immune: shield, blazing_barrier, bastion, last_stand, iron_stance, params.unstoppable, or pushbackResistPct >= 1. */
  resist?: boolean;
}

/** True when this hit pushes back. `count` = pushbacks already applied to this cast (caller increments when this returns true). */
export function pushesBack(count: number, hit: HitForPushback): boolean {
  if (hit.dot || hit.absorbed || hit.resist) return false;
  if (hit.hitFrac < PUSHBACK_CFG.minHpFrac) return false;
  return count < PUSHBACK_CFG.max;
}

/** Seconds added to the remaining cast time for this hit (0 when it does not push). */
export function pushbackAdd(count: number, hit: HitForPushback): number {
  return pushesBack(count, hit) ? PUSHBACK_CFG.add : 0;
}

/** Seconds removed from a channel by this hit: 25 % of the total channel duration, first two hits only. */
export function channelCut(totalChannel: number, count: number, hit: HitForPushback): number {
  if (!pushesBack(count, hit)) return 0;
  return totalChannel * PUSHBACK_CFG.channelCut;
}

export const LOCKOUT_SCHOOLS = ['fire', 'frost', 'arcane', 'holy', 'shadow', 'poison'] as const;
export type LockoutSchool = typeof LOCKOUT_SCHOOLS[number];

/** School lock for a skill (first matching school tag). Melee / physical skills return null and are never locked. */
export function lockoutSchool(def: { tags?: readonly string[] }): LockoutSchool | null {
  for (const t of def.tags ?? []) {
    if ((LOCKOUT_SCHOOLS as readonly string[]).includes(t)) return t as LockoutSchool;
  }
  return null;
}
