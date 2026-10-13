// CW-02 · Global cooldown (COMBAT_WOW §2.1). Pure: no imports, no engine state.
// Numbers mirror Appendix A (`WOW.gcd`); CW-04 may re-export them from combat/feel.ts.

export type GcdProfile = 'arpg' | 'wow';

export const GCD_CFG = {
  profile: 'arpg' as GcdProfile,
  arpg: { base: 1.0 },
  wow: { base: 1.5, rogue: 1.0 },
  floorMul: 0.5,
  rogueFixed: true,
} as const;

/** Minimal structural view of a skill def; avoids importing types/skills.ts. */
export interface GcdDefLike {
  tags?: readonly string[];
  defaultSlot?: string;
}

const MAJOR_SLOT_IDS: readonly string[] = ['m45', 'm90', 'm180'];

/** Off-GCD tier (§2.1): tag `offgcd`, or a major slot (m45/m90/m180). */
export function isOffGcd(def: GcdDefLike): boolean {
  if (def.tags?.includes('offgcd')) return true;
  return def.defaultSlot !== undefined && MAJOR_SLOT_IDS.includes(def.defaultSlot);
}

/** Base GCD in seconds for a profile and class. */
export function gcdBase(profile: GcdProfile, classId: string): number {
  if (profile === 'wow') return classId === 'rogue' ? GCD_CFG.wow.rogue : GCD_CFG.wow.base;
  return GCD_CFG.arpg.base;
}

/**
 * GCD length for a skill. `speed` is the haste multiplier (1 = no haste; castSpeed for `spell` skills,
 * attackSpeed otherwise). Haydut (rogue) ignores haste as in WoW. Off-GCD skills return 0.
 * GCD = max(base * floorMul, base / speed).
 */
export function gcdFor(profile: GcdProfile, classId: string, speed: number, def: GcdDefLike): number {
  if (isOffGcd(def)) return 0;
  const base = gcdBase(profile, classId);
  const haste = classId === 'rogue' && GCD_CFG.rogueFixed ? 1 : (Number.isFinite(speed) && speed > 0 ? speed : 1);
  return Math.max(base * GCD_CFG.floorMul, base / haste);
}
