/**
 * Minion / pet / summon definitions (GDD_CLASSES_V2 §1.5, NC23). Aggregates the per-class files in data/minions/. Owner: combat.
 * Ids are unique across classes; a duplicate is logged and the first one wins.
 */
import type { ClassId } from '../types/common';
import type { MinionDef } from '../types/minions';
import { MONK_MINIONS } from './minions/monk';
import { ARCHER_MINIONS } from './minions/archer';
import { NECRO_MINIONS } from './minions/necromancer';
import { WARLOCK_MINIONS } from './minions/warlock';
import { SHAMAN_MINIONS } from './minions/shaman';

const ALL: MinionDef[] = [...MONK_MINIONS, ...ARCHER_MINIONS, ...NECRO_MINIONS, ...WARLOCK_MINIONS, ...SHAMAN_MINIONS];

export const MINION_DEFS: Record<string, MinionDef> = {};
for (const d of ALL) {
  if (MINION_DEFS[d.id]) console.error(`[minions] duplicate minion id ${d.id}`);
  else MINION_DEFS[d.id] = d;
}

/** Group caps (GDD §1.5 rule 4). Groups not listed (`army`) are uncapped; the per-owner (14) and per-world (40) hard caps still apply. */
export const MINION_GROUP_CAPS: Record<string, number> = {
  skeleton: 4, golem: 1, knight: 2, pet: 1, pack: 2, demon: 1, infernal: 1, clone: 2, guardian: 1, lesser: 3,
};

/** Class default for `minion.id === 'auto'` (necro_raise_skeleton style rows). */
export const CLASS_DEFAULT_MINION: Partial<Record<ClassId, string>> = {
  necromancer: 'necro_ghoul',
};

export function minionDef(id: string): MinionDef | undefined {
  return MINION_DEFS[id];
}
