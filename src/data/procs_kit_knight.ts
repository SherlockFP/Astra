/**
 * KIT PM-KN (docs/kits/plate-melee.md §1b, §2b). Proc rows and proc mods of the Şövalye kit. Merged by one line each into
 * data/procs.ts (PROC_DEFS) and combat/procMods.ts (PROC_MODS). OWNER: PM-KN.
 * `sudden_death` is shared with the barbarian Fury (Ani Ölüm): its glow and its mod cover barbarian_execute too (§1b, §g).
 * `sweeping` (Süpürme) is a cleave rider (STATUS_RULES.sweeping, data/statuses_kit_plate.ts): it has a glow row only.
 */
import type { ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_KNIGHT: ProcDef[] = [
  { id: 'sudden_death', status: 'sudden_death', name: 'Ani Ölüm', school: 'bleed', overlay: 'top', glow: ['knight_execute', 'barbarian_execute'], durationHint: 12, priority: 3, ...FX },
  { id: 'battlelord', status: 'battlelord', name: 'Savaş Efendisi', school: 'physical', overlay: 'right', glow: ['knight_overpower'], durationHint: 8, priority: 2, ...FX },
  { id: 'revenge_ready', status: 'revenge_ready', name: 'İntikam Hazır', school: 'physical', overlay: 'both', glow: ['knight_revenge'], durationHint: 6, priority: 3, ...FX },
  { id: 'sweeping', status: 'sweeping', name: 'Süpürme', school: 'physical', overlay: 'left', glow: ['knight_mortal_strike', 'knight_execute'], durationHint: 6, priority: 1, ...FX },
];

/**
 * Proc mods (§1b / §2b). Ani Ölüm: Cellat Vuruşu costs 0 and is usable at any target HP, +15 % damage, one stack per cast.
 * Savaş Efendisi: Üstün Vuruş is free and does not start its cooldown (the spent charge is not refunded: no chargeFree field yet).
 * İntikam Hazır: İntikam costs 0 and deals +25 %; its threat x2 is the knight_revenge `threatMult` param (skill row, not here).
 * Ani Ölüm consumes ONE stack per execute (both Şövalye and Barbar execute), the status keeps the rest.
 */
export const PROC_MODS_KIT_KNIGHT: ProcMod[] = [
  { status: 'sudden_death', skills: ['knight_execute', 'barbarian_execute'], costMult: 0, anyHp: true, more: 1.15, consume: 'cast', consumeOne: true },
  { status: 'battlelord', skills: ['knight_overpower'], costMult: 0, cdFree: true, consume: 'cast' },
  { status: 'revenge_ready', skills: ['knight_revenge'], costMult: 0, more: 1.25, consume: 'cast' },
];
