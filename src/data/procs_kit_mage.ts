/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-MAGE). Proc rows, proc mods and glow rules of the mage kit. Merged by one
 * line each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). KIT PK-MAGE: the Berrak Zihin
 * (`clearcasting`) mod makes the next Arkan Füzeler or Arkan Baraj free; the full-damage tier of the Füzeler is read from the
 * resolved procMods in combat/skills/mageKit.ts. The PROC_DEFS row of `clearcasting` (glow on mage_arcane_blast) is in procs.ts
 * and still needs the q / e glow (see the PK-MAGE report). OWNER: combat.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

export const PROC_DEFS_KIT_MAGE: ProcDef[] = [];
export const PROC_MODS_KIT_MAGE: ProcMod[] = [
  { status: 'clearcasting', skills: ['mage_arcane_missiles', 'mage_arcane_barrage'], costMult: 0, consume: 'cast' },
];
export const GLOW_RULES_KIT_MAGE: Record<string, GlowRule> = {};
