/**
 * KIT PK-0 scaffold (docs/kits/casters-rogue.md §h PK-ROGUE). Proc rows, proc mods and glow rules of the rogue kit. Merged by one
 * line each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). Empty until PK-ROGUE. OWNER: combat.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

export const PROC_DEFS_KIT_ROGUE: ProcDef[] = [];
export const PROC_MODS_KIT_ROGUE: ProcMod[] = [];
export const GLOW_RULES_KIT_ROGUE: Record<string, GlowRule> = {};
