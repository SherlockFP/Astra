/**
 * GDD_TALENTS §4.2 — skill mastery (Ustalık). XP per skill id, the three specialisation tiers and the rank events.
 * Owner: items (T6). Stored in `CharacterSave.skillMastery` (XP per skill id, shared by every spec that uses the skill).
 * Emits `skillmastery:changed { skillId, rank }` whenever a tier opens (XP threshold or level catch-up) and a toast.
 * Pure rank math (`masteryRankAt`) takes the save values, so StatCalc can read the picks without `G`.
 */
import { G } from '../game/G';
import type { ClassId } from '../types/common';
import type { SkillDef } from '../types/skills';
import { SKILLS } from '../data/skills';
import { SIGNATURE_SKILLS } from '../data/skillSpecs';
import { emit, toast } from './notify';

/** XP that opens tier 1 / 2 / 3 (§4.2). */
export const MASTERY_XP: readonly number[] = [200, 1000, 3000];
/** Level that opens tier 1 / 2 / 3 regardless of XP (§4.2 level catch-up). */
export const MASTERY_LEVEL: readonly number[] = [30, 45, 60];
/** Highest tier rank. */
export const MASTERY_MAX_RANK = 3;
/** Cap of the XP of one award (§4.2: `min(20, 1 + floor(cooldown / 2))`). */
const XP_CAP = 20;

/**
 * Tier rank (0–3) of a skill with `xp` XP at character `level`. A tier is open when its XP threshold is reached or the
 * level catch-up is met; the thresholds rise with the tier, so the result is the highest open tier.
 */
export function masteryRankAt(xp: number, level: number): number {
  let rank = 0;
  for (let t = 0; t < MASTERY_XP.length; t++) {
    if (xp >= MASTERY_XP[t] || level >= MASTERY_LEVEL[t]) rank = t + 1;
  }
  return rank;
}

/** XP of one cast of a skill (§4.2): 1 for an instant skill, 20 for a 60 s ultimate. Multiplied by Ustalık Kazancı at award time. */
export function xpFor(def: SkillDef): number {
  return Math.min(XP_CAP, 1 + Math.floor(Math.max(0, def.cooldown || 0) / 2));
}

/** Mastery XP of a skill on the local character (0 without a character). */
export function masteryXp(skillId: string): number {
  return Math.max(0, G.character?.save.skillMastery?.[skillId] ?? 0);
}

/** Mastery tier rank (0–3) of a skill on the local character. */
export function masteryRank(skillId: string): number {
  const ch = G.character;
  if (!ch) return 0;
  return masteryRankAt(masteryXp(skillId), ch.level);
}

/** Turkish announcement of a tier that just opened (toast + the event for SkillSpecView). */
function announce(skillId: string, rank: number): void {
  const name = SKILLS[skillId]?.name ?? skillId;
  toast(`Ustalık: ${name} — Kademe ${rank} açıldı!`, 'levelup');
  emit('skillmastery:changed', { skillId, rank });
}

/**
 * Awards mastery XP to a skill after a cast that hit or helped at least one target (the caller decides; SkillSystem
 * owns that rule). `baseXp` is the award before Ustalık Kazancı (`StatCalc` stat `skillMasteryPct`, a fraction).
 * Emits `skillmastery:changed` and a toast only when a tier opens.
 */
export function addSkillMastery(skillId: string, baseXp: number): void {
  const ch = G.character;
  if (!ch || !SKILLS[skillId] || !(baseXp > 0) || !Number.isFinite(baseXp)) return;
  const save = ch.save;
  save.skillMastery ??= {};
  const before = masteryRankAt(save.skillMastery[skillId] ?? 0, save.level);
  const pct = Math.max(0, ch.stats.skillMasteryPct ?? 0);
  const gain = baseXp * (1 + pct);
  save.skillMastery[skillId] = Math.round(((save.skillMastery[skillId] ?? 0) + gain) * 100) / 100;
  const after = masteryRankAt(save.skillMastery[skillId], save.level);
  if (after > before) announce(skillId, after);
  ch.persist();
}

/**
 * Announces the signature skills of a class whose tier opened by the level catch-up between two levels (called from
 * Progression.onLevelUp). Pure reads of the save; emits like `addSkillMastery`.
 */
export function announceLevelRanks(classId: ClassId, from: number, to: number): void {
  const ch = G.character;
  if (!ch || to <= from) return;
  for (const skillId of SIGNATURE_SKILLS[classId] ?? []) {
    const xp = ch.save.skillMastery?.[skillId] ?? 0;
    const before = masteryRankAt(xp, from);
    const after = masteryRankAt(xp, to);
    if (after > before) announce(skillId, after);
  }
}
