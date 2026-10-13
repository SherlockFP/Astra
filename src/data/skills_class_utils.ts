/**
 * GDD_TALENTS §1.4 class utility skills (the s05 choice of every class tree, 18 new rows). OWNER: combat (T9).
 * Merged into SKILLS at the end of data/skills.ts (Object.assign). Behaviours: combat/skills/utilities.ts.
 *
 * Every row is granted by its class tree node only (`unlockLevel 99`, no default slot). All interrupts share the
 * behaviour `interrupt`: it cuts an interruptible cast, locks that ability for 4 s, and applies the silence / stun
 * given in `params` (default silence 3 s; bosses only lose the cast). `params.gainRes` is refunded on a successful cut.
 */
import type { SkillDef } from '../types/skills';
import { KNIGHT_UTIL_ROWS } from './skills_class_utils_knight';
import { BARBARIAN_UTIL_ROWS } from './skills_class_utils_barbarian';
import { PALADIN_UTIL_ROWS } from './skills_class_utils_paladin';
import { NECROMANCER_UTIL_ROWS } from './skills_class_utils_necromancer';
import { OTHER_UTIL_ROWS } from './skills_class_utils_other';

const ROWS: SkillDef[] = [...KNIGHT_UTIL_ROWS, ...BARBARIAN_UTIL_ROWS, ...PALADIN_UTIL_ROWS, ...NECROMANCER_UTIL_ROWS, ...OTHER_UTIL_ROWS];

export const CLASS_UTIL_SKILLS: Record<string, SkillDef> = Object.fromEntries(ROWS.map((r) => [r.id, r]));
