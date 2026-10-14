import { LEVEL_CAP, type CharacterSave } from '../types/character';
import { SKILL_RANK_CAP } from '../combat/skillRanks';

/**
 * Yetenek Puanı (skill points from levelling). Each level-up grants one point; a point raises one unlocked skill by one rank
 * (+5% skill damage, -2% cooldown per rank above 1, see combat/skillRanks.ts). The rank a character may reach grows with its
 * level: cap = min(SKILL_RANK_CAP, 1 + floor(level / 6)). Beceri Kitabı items (CharacterState.readSkillBook) still raise
 * ranks; both sources share the same cap.
 * Pure helpers (no G) so the sims can check them; the mutating ones are CharacterState.spendSkillPoint / resetSkillPoints /
 * grantSkillPoints. OWNER: systems (progression).
 */
export const SKILL_POINTS_PER_LEVEL = 1;
/** Sıfırla (refund all points): gold per character level. */
export const SKILL_RESET_GOLD_PER_LEVEL = 20;
/** Save flag: the one-time migration of pre-Yetenek-Puanı saves ran. */
export const SKILL_POINTS_FLAG = 'skillpts.migrated';

/** Highest rank a skill can reach at this character level: min(10, 1 + floor(level / 6)). */
export function skillRankCapAt(level: number): number {
  const l = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return Math.min(SKILL_RANK_CAP, 1 + Math.floor(l / 6));
}

/** Points a character at this level has earned from levelling alone (one per level above 1). */
export function skillPointsForLevel(level: number): number {
  const l = Number.isFinite(level) ? Math.min(LEVEL_CAP, Math.max(1, Math.floor(level))) : 1;
  return (l - 1) * SKILL_POINTS_PER_LEVEL;
}

/** Ranks already above 1 across all skills (from points or from Beceri Kitapları). */
export function ranksAboveOne(save: Pick<CharacterSave, 'skillRanks'>): number {
  let n = 0;
  for (const r of Object.values(save.skillRanks ?? {})) if (typeof r === 'number' && r > 1) n += Math.floor(r) - 1;
  return n;
}

/** Unspent Yetenek Puanı of a save (0 when the save has no field yet). */
export function skillPointsFree(save: Pick<CharacterSave, 'skillPts'>): number {
  const p = save.skillPts;
  return p ? Math.max(0, p.earned - p.spent) : 0;
}

/** Gold the Sıfırla button costs at this level. */
export function skillResetCost(level: number): number {
  return SKILL_RESET_GOLD_PER_LEVEL * Math.max(1, Math.floor(level || 1));
}

/**
 * One-time migration (flag `skillpts.migrated`, run from CharacterState.normalize, so every load and every new character goes
 * through it): the points a pre-existing character has earned are its levels above 1 minus the ranks it already holds above 1
 * (the ranks came from Beceri Kitapları). New characters compute 0 here (level 1); beta characters at the cap get the full pool.
 * Idempotent: a save with the flag keeps its `skillPts`.
 */
export function migrateSkillPoints(save: CharacterSave): void {
  save.flags ??= {};
  save.skillPts ??= { earned: 0, spent: 0, by: {} };
  save.skillPts.by ??= {};
  if (save.flags[SKILL_POINTS_FLAG]) return;
  save.flags[SKILL_POINTS_FLAG] = 1;
  save.skillPts.earned = Math.max(0, skillPointsForLevel(save.level) - ranksAboveOne(save));
}
