/**
 * GDD_TALENTS §1.4 class utility rows: shared helpers for the per-class files skills_class_utils_<class>.ts (PM-00c split).
 * `row()` and `I()` are the same code as before the split (the rows call them unchanged).
 */
import type { SkillDef } from '../types/skills';

export const I = (n: string) => `/assets/icons/${n}.svg`;

type Row = Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting' | 'cost' | 'cooldown' | 'behavior' | 'tags'>
  & Partial<Pick<SkillDef, 'animSpeed' | 'range' | 'arc' | 'radius' | 'statuses' | 'selfStatuses' | 'pip' | 'vfx' | 'params'>>;

/** Shared row defaults: unlockLevel 99 (granted by the node), instant, hit at 0.3 s, the template params of §1.4. */
export function row(r: Row): SkillDef {
  return {
    unlockLevel: 99,
    castTime: 0,
    hitTime: 0.3,
    animSpeed: 1,
    ...r,
    params: { end: 0.5, chain: 0.1, move: 0.15, weight: 0, ...(r.params ?? {}) },
  } as SkillDef;
}
