import { G } from '../game/G';

/**
 * OWNER: combat module. Beceri Kitabı (GDD_OPENWORLD 4.6) skill ranks of the LOCAL character (`save.skillRanks`, written by
 * CharacterState.readSkillBook). Rank 1 is the base; every rank above 1 gives +5% skill damage and -2% cooldown (rank capped at 10).
 * Remote players are never scaled here: callers only use these helpers for the local player's skills.
 */
export const SKILL_RANK_CAP = 10;
export const SKILL_RANK_DAMAGE_PER = 0.05;
export const SKILL_RANK_COOLDOWN_PER = 0.02;

const COMBO_STEP = /^(.+_basic)_\d+$/;

/** Basic-attack combo steps (`knight_basic_3`) share the rank of their basic attack (`knight_basic`). */
export function skillRankKey(skillId: string): string {
  const m = COMBO_STEP.exec(skillId);
  return m ? m[1] : skillId;
}

/** Rank of a skill in the local character's save: 1..SKILL_RANK_CAP. Never throws (1 when unknown). */
export function localSkillRank(skillId: string | null | undefined): number {
  if (!skillId) return 1;
  try {
    const ranks = G.character?.save?.skillRanks;
    const r = ranks ? ranks[skillRankKey(skillId)] : undefined;
    if (typeof r !== 'number' || !Number.isFinite(r)) return 1;
    return Math.min(SKILL_RANK_CAP, Math.max(1, Math.floor(r)));
  } catch {
    return 1;
  }
}

/** Clamp any number to a valid rank (1..SKILL_RANK_CAP). */
export function clampSkillRank(rank: number): number {
  return Math.min(SKILL_RANK_CAP, Math.max(1, Math.floor(Number.isFinite(rank) ? rank : 1)));
}

/** Damage multiplier of a rank (x1.00 at rank 1, +5% per extra rank). Pure: used by the Yetenek Kitabı preview too. */
export function skillRankDamageMultOf(rank: number): number {
  return 1 + SKILL_RANK_DAMAGE_PER * (clampSkillRank(rank) - 1);
}

/** Cooldown multiplier of a rank (x1.00 at rank 1, -2% per extra rank). Pure. */
export function skillRankCooldownMultOf(rank: number): number {
  return 1 - SKILL_RANK_COOLDOWN_PER * (clampSkillRank(rank) - 1);
}

/** Outgoing damage multiplier of a local skill hit (x1.00 at rank 1, +5% per extra rank). */
export function skillRankDamageMult(skillId: string | null | undefined): number {
  return skillRankDamageMultOf(localSkillRank(skillId));
}

/** Cooldown multiplier of a local skill (x1.00 at rank 1, -2% per extra rank). */
export function skillRankCooldownMult(skillId: string | null | undefined): number {
  return skillRankCooldownMultOf(localSkillRank(skillId));
}
