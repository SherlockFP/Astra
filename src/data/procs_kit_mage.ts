/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-MAGE). Proc rows, proc mods and glow rules of the mage kit. Merged by one
 * line each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). Empty until PK-MAGE. OWNER: combat.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

export const PROC_DEFS_KIT_MAGE: ProcDef[] = [];
export const PROC_MODS_KIT_MAGE: ProcMod[] = [];
export const GLOW_RULES_KIT_MAGE: Record<string, GlowRule> = {};
