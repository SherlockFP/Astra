/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §g PK-MAGE). StatusDef and STATUS_RULES rows of the mage kit (§g statuses),
 * merged into STATUSES / STATUS_RULES by data/statuses.ts. KIT PK-MAGE: `arcane_salvo` (Gizem Mermisi, +1 per Füzeler missile
 * that lands, cap 20, 15 s since the last gain). `clearcasting` lives in statuses_talents.ts (CW-03) and is not repeated here.
 * OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_MAGE: Partial<Record<StatusId, StatusDef>> = {
  arcane_salvo: { id: 'arcane_salvo', name: 'Gizem Mermisi', icon: I('skill-arcane-missiles'), kind: 'buff', maxStacks: 20, defaultDuration: 15 },
};
export const STATUS_RULES_KIT_MAGE: Partial<Record<StatusId, StatusRule>> = {
  arcane_salvo: { stack: 'stack' },
};
