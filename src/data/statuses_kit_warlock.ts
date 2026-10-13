/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-WARLOCK). StatusDef and STATUS_RULES rows of the warlock kit (§g statuses),
 * merged into STATUSES / STATUS_RULES by data/statuses.ts. Empty until PK-WARLOCK. OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

export const STATUSES_KIT_WARLOCK: Partial<Record<StatusId, StatusDef>> = {};
export const STATUS_RULES_KIT_WARLOCK: Partial<Record<StatusId, StatusRule>> = {};
