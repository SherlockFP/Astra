/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §6b, §7b, §8b, §g). Proc rows, glow rules and the Gölge Tekniği counter of the rogue kit.
 * Merged by one line each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). OWNER: combat.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_ROGUE: ProcDef[] = [
  { id: 'darkest_night', status: 'darkest_night', name: 'Karanlık Gece', school: 'shadow', overlay: 'top', glow: ['rogue_envenom'], durationHint: 16, priority: 2, ...FX },
  { id: 'improved_garrote', status: 'improved_garrote', name: 'Gelişmiş Gırtlak Kesme', school: 'shadow', overlay: 'right', glow: ['rogue_garrote'], durationHint: 6, priority: 2, ...FX },
  { id: 'elixir_ramp', status: 'elixir_ramp', name: 'Hayat İksiri Hazırlığı', school: 'holy', overlay: 'center', glow: ['rogue_vial_heal'], durationHint: 10, priority: 2, ...FX },
  // Köpüren Karışım: its glow is the bubbling-brew row, which is not written yet (see report), so no glow entry yet.
  { id: 'brew_boost', status: 'brew_boost', name: 'Köpüren Karışım', school: 'poison', overlay: 'left', glow: [], durationHint: 12, priority: 2, ...FX },
];

export const PROC_MODS_KIT_ROGUE: ProcMod[] = [];

/**
 * Gölge Tekniği (§7b): a counter, not a status. Every 4th LMB hit (every 2nd while Gölge Dansı / shadow_veil_cd is up) grants
 * `cp` Kombo Puanı and `energy` enerji. Read by the Subtlety talent specials (params on SPECS_KIT_ROGUE.rogue_subtlety.specials).
 * Counted in Combat.kitHitHooks (direct Subtlety melee hits of the local player; 2nd hit while Gölge Dansı is up).
 */
export const SHADOW_TECHNIQUE = { every: 4, everyInDance: 2, cp: 1, energy: 8 } as const;

/** Glow rules for the rogue kit: the Gölge finisher glows at 6 points while stealthed (GlowState has no target-facing field). */
export const GLOW_RULES_KIT_ROGUE: Record<string, GlowRule> = {
  stealth_finisher: {
    id: 'stealth_finisher',
    test: (s) => s.stealthed && s.combo >= 6,
    skills: () => ['rogue_secret_technique'],
  },
};
