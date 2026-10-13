/**
 * Shared type of the per-class skillset stub files (GDD_CLASSES_V2 §14, NC04). Every file in this folder exports
 * `register<Name>(add)`; data/skills.ts calls each one exactly once with its local `add()` (which writes into SKILLS).
 * OWNER: combat. The package that fills a file only edits that file.
 */
import type { SkillDef } from '../../types/skills';

/** What data/skills.ts `add()` takes: the identity fields are required, every other SkillDef field is optional. */
export type SkillInput = Partial<SkillDef> & Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;

export type SkillAdd = (d: SkillInput) => unknown;
