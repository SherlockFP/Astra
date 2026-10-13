import { STATUSES, STATUS_RULES, type StatusRule } from '../data/statuses';
import type { StatusDef, StatusId } from '../types/skills';

/**
 * Statuses of the Elden Ring layer (GDD_V2 §3.5 / §3.7): the poise break mark, the parry riposte window and the
 * Kritik Vuruş damage buff. Merged into the shared registries here (combat module, same pattern as the talent statuses in
 * data/statuses.ts). Imported by Combat.ts so the defs exist before any hit lands.
 * OWNER: combat module.
 */
const I = (n: string) => `/assets/icons/${n}.svg`;

export const FEEL_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  marked_crit: { id: 'marked_crit', name: 'Kritik Açık', icon: I('debuff-stun'), kind: 'debuff', vfx: 'mark_loop', dispellable: false },
  riposte: { id: 'riposte', name: 'Karşılık', icon: I('buff-strength'), kind: 'buff' },
  critbuff: { id: 'critbuff', name: 'Kritik Öfke', icon: I('buff-strength'), kind: 'buff', vfx: 'buff_aura' },
};

export const FEEL_RULES: Partial<Record<StatusId, StatusRule>> = {
  marked_crit: { stack: 'refresh' },
  riposte: { stack: 'refresh' },
  critbuff: { stack: 'refresh', dealtMore: 0.15 },
};

Object.assign(STATUSES, FEEL_STATUSES);
Object.assign(STATUS_RULES, FEEL_RULES);
