/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10b / §11b). Proc rows, the Dönüş Alevi cast-time mod and the glow rules of the warlock
 * kit. Merged by one line each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). OWNER: combat.
 * GlowState has no shard field (only pips = adalet, combo), so the fragment-threshold glows are not written (see the PK-WARLOCK report).
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_WARLOCK: ProcDef[] = [
  { id: 'backdraft', status: 'backdraft', name: 'Dönüş Alevi', school: 'fire', overlay: 'left', glow: ['warlock_chaos_bolt'], durationHint: 12, priority: 2, ...FX },
  { id: 'fiendish_cruelty', status: 'fiendish_cruelty', name: 'Şeytani Zalimlik', school: 'shadow', overlay: 'top', glow: ['warlock_shadowburn'], durationHint: 10, priority: 2, ...FX },
  { id: 'haunt', status: 'haunt', name: 'Musallat', school: 'shadow', overlay: 'right', glow: ['warlock_haunt'], durationHint: 18, priority: 2, ...FX },
  { id: 'malevolence', status: 'malevolence', name: 'Kötülük', school: 'shadow', overlay: 'center', glow: [], durationHint: 20, priority: 2, ...FX },
  { id: 'darkglare_active', status: 'darkglare_active', name: 'Karanlık Göz', school: 'shadow', overlay: 'center', glow: [], durationHint: 20, priority: 2, ...FX },
];

/** Dönüş Alevi (§11b): Kaos Oku and Kül Etme cast 30 % faster while the stacks last (cast time x0.7). */
export const PROC_MODS_KIT_WARLOCK: ProcMod[] = [
  { status: 'backdraft', skills: ['warlock_chaos_bolt', 'warlock_incinerate'], castTimeMult: 0.7, consume: 'cast' },
];

export const GLOW_RULES_KIT_WARLOCK: Record<string, GlowRule> = {};
