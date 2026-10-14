/**
 * CLASS SCAFFOLD: Druid StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. Empty until the druid kit lands.
 * OWNER: druid kit.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

export const STATUSES_KIT_DRUID: Partial<Record<StatusId, StatusDef>> = {};
export const STATUS_RULES_KIT_DRUID: Partial<Record<StatusId, StatusRule>> = {};
