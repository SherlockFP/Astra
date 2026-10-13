/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §h PK-MAGE, §2b / §3b / §4b). Proc rows, proc mods and glow rules of the mage kit.
 * Merged into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS).
 *
 * Mods (consumed by the cast they list): Berrak Zihin (clearcasting) makes Füzeler / Baraj free; Beyin Donması (brain_freeze)
 * makes Dondurucu Sağanak free without spending a charge (cdFree); Dondurucu Yağmur makes Kar Fırtınası instant and free;
 * Kuyruklu Yıldız Hazır makes the comet storm free; Piroklazm (pyroclasm) gives the next hard-cast Piroblast / Alev Sütunu
 * -40 % cast time and +25 % damage. Hot Streak (Sıcak Seri) stays in combat/specs/mage.ts (resolveCast), because it is a
 * trait hook, not a generic mod.
 *
 * Deviation: Piroklazm is one status with 2 stacks; a cast consumes the whole status (both charges), not one per cast.
 * The glow rows of the fire / frost procs still list the old ids in procs.ts (see the PK-MAGE report). OWNER: combat.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

export const PROC_DEFS_KIT_MAGE: ProcDef[] = [];
export const PROC_MODS_KIT_MAGE: ProcMod[] = [
  { status: 'clearcasting', skills: ['mage_arcane_missiles', 'mage_arcane_barrage'], costMult: 0, consume: 'cast' },
  { status: 'brain_freeze', skills: ['mage_flurry'], costMult: 0, cdFree: true, consume: 'cast' },
  { status: 'freezing_rain', skills: ['mage_blizzard'], costMult: 0, castTimeMult: 0, cdFree: true, consume: 'cast' },
  { status: 'comet_ready', skills: ['mage_comet_storm'], costMult: 0, cdFree: true, consume: 'cast' },
  { status: 'pyroclasm', skills: ['mage_pyroblast', 'mage_flamestrike'], castTimeMult: 0.6, more: 1.25, consume: 'cast' },
];
export const GLOW_RULES_KIT_MAGE: Record<string, GlowRule> = {};
