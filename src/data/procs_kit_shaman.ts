/**
 * KIT ŞAMAN procs (WoW Midnight direction): Fırtına Bekçisi (stormkeeper, 2 stacks), Rüzgar Silahı (windfury, Geliştirme melee
 * proc) and Lav Dalgası (lava_surge, Elementel proc). Triggers are `T` rows of the spec fx strings (data/specs_kit_shaman.ts);
 * the effects are ProcMod rows, merged into combat/procMods.ts by one line, and the overlays into data/procs.ts.
 */
import type { ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_SHAMAN: ProcDef[] = [
  { id: 'stormkeeper', status: 'stormkeeper', name: 'Fırtına Bekçisi', school: 'lightning', overlay: 'top', glow: ['shaman_lightning_bolt'], durationHint: 20, priority: 2, ...FX },
  { id: 'windfury', status: 'windfury', name: 'Rüzgar Silahı', school: 'physical', overlay: 'right', glow: ['shaman_stormstrike'], durationHint: 6, priority: 2, ...FX },
  { id: 'lava_surge', status: 'lava_surge', name: 'Lav Dalgası', school: 'fire', overlay: 'left', glow: ['shaman_lava_burst'], durationHint: 8, priority: 2, ...FX },
];

/**
 * Fırtına Bekçisi: the next two Yıldırım Okları are instant and +25 % (each cast spends one of the two stacks).
 * Rüzgar Silahı: the next Fırtına Vuruşu is +20 %. Lav Dalgası: the next Lav Patlaması is instant and its cooldown is reset.
 */
export const PROC_MODS_KIT_SHAMAN: ProcMod[] = [
  { status: 'stormkeeper', skills: ['shaman_lightning_bolt'], castTimeMult: 0, more: 1.25, consume: 'cast', consumeOne: true },
  { status: 'windfury', skills: ['shaman_stormstrike'], more: 1.2, consume: 'cast' },
  { status: 'lava_surge', skills: ['shaman_lava_burst'], castTimeMult: 0, cdReset: true, consume: 'cast' },
];
