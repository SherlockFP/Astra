/**
 * KIT PM-NE (docs/kits/plate-melee.md §8b, §9b). Proc rows, proc mods and glow rules of the Nekromant kit. Merged by one line each into
 * data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). OWNER: PM-NE.
 * The procs themselves are `T` rows of the SpecDef.fx strings (data/specs_necromancer.ts): sudden_doom (Ordu Efendisi, 12 % PRD per
 * Çürüten Darbe / Ölüm Kırbacı hit and per chain step 3). The windows (army, dark_transformation, vampiric_blood, dancing_rune_weapon) are
 * set by the major skill rows; their ProcDefs only draw the overlay (army also glows the transformed button Ölüm Emri).
 * Not written: the "<5 Kemik Zırhı charges" glow on İlik Söken, the "<3 Çürük Bulaşı" glow on Çürüten Darbe and the "plague missing"
 * glow on Salgın Çıkışı. GlowState carries neither self statuses nor target debuffs (only resource / pips / target HP), so the
 * rules would need new GlowState fields filled by ActionBar (a UI file outside PM-NE); the APL conditions use the real stacks.
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_NECROMANCER: ProcDef[] = [
  { id: 'sudden_doom', status: 'sudden_doom', name: 'Ani Kıyamet', school: 'shadow', overlay: 'top', glow: ['necro_death_coil', 'necro_epidemic'], durationHint: 12, priority: 3, ...FX },
  { id: 'army', status: 'army', name: 'Ölüler Ordusu', school: 'shadow', overlay: 'center', glow: ['necro_death_order'], durationHint: 30, priority: 3, ...FX },
  { id: 'dark_transformation', status: 'dark_transformation', name: 'Karanlık Dönüşüm', school: 'shadow', overlay: 'both', glow: [], durationHint: 15, priority: 1, ...FX },
  { id: 'vampiric_blood', status: 'vampiric_blood', name: 'Vampirik Kan', school: 'bleed', overlay: 'center', glow: [], durationHint: 10, priority: 1, ...FX },
  { id: 'dancing_rune_weapon', status: 'dancing_rune_weapon', name: 'Hayalet Orak', school: 'physical', overlay: 'both', glow: [], durationHint: 12, priority: 1, ...FX },
];

/**
 * Ani Kıyamet: Ölüm Sarmalı and Salgın cost no Öz and consume the status on cast. Dark Transformation's +20 % on the same two skills is
 * the behaviours' `dtMore` param, not a proc mod.
 */
export const PROC_MODS_KIT_NECROMANCER: ProcMod[] = [
  { status: 'sudden_doom', skills: ['necro_death_coil', 'necro_epidemic'], costMult: 0, consume: 'cast' },
];

/** Ölüm Darbesi glows from 75 Öz (Kemik Muhafızı, §8a "resource90 glow (>= 75 Öz)"; the other spec has no Ölüm Darbesi on its bar). */
export const GLOW_RULES_KIT_NECROMANCER: Record<string, GlowRule> = {
  necroDeathStrike75: {
    id: 'necroDeathStrike75',
    test: (s) => s.resourcePct >= 0.75,
    skills: () => ['necro_death_strike'],
  },
};
