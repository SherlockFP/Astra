/**
 * KIT PM-BA (docs/kits/plate-melee.md §3b, §4b). Proc rows (Spell Activation Overlay + glow) and proc mods of the barbarian kit.
 * Merged by one line each into data/procs.ts (PROC_DEFS) and combat/procMods.ts (PROC_MODS). OWNER: PM-BA.
 *
 * Not here: `sudden_death` (its ProcDef and ProcMod are in procs.ts / procMods.ts, shared with the Şövalye Arms execute; PM-KN
 * extends that ProcMod's `skills`), `enrage` / `avatar` / `bloodrage` / `iron_stance` / `ursoc_form` mods (no overlay: statuses only,
 * or cdMult in STATUS_RULES), `rend` (status only).
 */
import type { ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_BARBARIAN: ProcDef[] = [
  // Kanlı Fırsat: Yarma or Paralama hit 15 % PRD -> next Yarma resets its cooldown, +15 % damage
  { id: 'gore', status: 'gore', name: 'Kanlı Fırsat', school: 'bleed', overlay: 'left', glow: ['barbarian_cleave'], durationHint: 10, priority: 2, ...FX },
  // Kanlı Kürk: Demir Duruş cast -> next Ezici Balta costs 0
  { id: 'gory_maul', status: 'gory_maul', name: 'Kanlı Kürk: Balta', school: 'physical', overlay: 'right', glow: ['barbarian_maul'], durationHint: 12, priority: 2, ...FX },
  // Kanlı Kürk: Ezici Balta cast -> next Demir Duruş costs 0
  { id: 'gory_iron', status: 'gory_iron', name: 'Kanlı Kürk: Demir', school: 'physical', overlay: 'right', glow: ['barbarian_iron_stance'], durationHint: 12, priority: 2, ...FX },
  // Et Satırı: Kasırga ends -> next 2 Kan Susuzluğu / Öfkeli Darbe / Çılgın Hamle hits reach 3 extra targets at 60 %
  { id: 'meat_cleaver', status: 'meat_cleaver', name: 'Et Satırı', school: 'physical', overlay: 'left', glow: ['barbarian_bloodthirst', 'barbarian_raging_blow', 'barbarian_rampage'], durationHint: 8, priority: 2, ...FX },
  // Pervasızlık: rmb and e transform (Kan Banyosu, Kemik Ezici)
  { id: 'carnage', status: 'carnage', name: 'Pervasızlık', school: 'physical', overlay: 'both', glow: ['barbarian_bloodbath', 'barbarian_crushing_blow'], durationHint: 12, priority: 3, ...FX },
  // Ata Kılığı: Yarma and Paralama cooldowns x0.5
  { id: 'ursoc_form', status: 'ursoc_form', name: 'Ata Kılığı', school: 'physical', overlay: 'both', glow: ['barbarian_cleave', 'barbarian_thrash'], durationHint: 20, priority: 2, ...FX },
];

export const PROC_MODS_KIT_BARBARIAN: ProcMod[] = [
  // Kanlı Fırsat: the next Yarma is free of cooldown (reset) and hits for +15 %
  { status: 'gore', skills: ['barbarian_cleave'], cdReset: true, more: 1.15, consume: 'cast' },
  { status: 'gory_maul', skills: ['barbarian_maul'], costMult: 0, consume: 'cast' },
  { status: 'gory_iron', skills: ['barbarian_iron_stance'], costMult: 0, consume: 'cast' },
];
