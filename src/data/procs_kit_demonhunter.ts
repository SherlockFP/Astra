/**
 * AE-3 (docs/kits/agile-evoker.md §3b + the Yutucu): proc rows and glow rules of the İblis Avcısı kit. Merged by one line each into
 * data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS). The windows themselves are set by the skill rows
 * (initiative, metamorphosis, void_meta, exergy) or by the pip (soul_overflow, PipDef.statusAt); the ProcDefs draw the overlays and
 * glow the buttons. No free-cast procs: PROC_MODS is empty. OWNER: combat (data).
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_DEMONHUNTER: ProcDef[] = [
  // Girişim (İntikam Geri Çekilişi): lights Göz Işını
  { id: 'initiative', status: 'initiative', name: 'Girişim', school: 'shadow', overlay: 'left', glow: ['demonhunter_eye_beam'], durationHint: 6, priority: 2, ...FX },
  // Metamorfoz (Kaos): Kaos Darbesi / Bıçak Dansı become Yok Ediş / Ölüm Süpürmesi
  { id: 'metamorphosis', status: 'metamorphosis', name: 'Metamorfoz', school: 'shadow', overlay: 'center', glow: ['demonhunter_annihilation', 'demonhunter_death_sweep'], durationHint: 24, priority: 3, ...FX },
  { id: 'exergy', status: 'exergy', name: 'Taşkınlık', school: 'shadow', overlay: 'right', glow: [], durationHint: 10, priority: 1, ...FX },
  // Ruh Taşması (İntikam): beş parçacıkta Ruh Bombası
  { id: 'soul_overflow', status: 'soul_overflow', name: 'Ruh Taşması', school: 'holy', overlay: 'top', glow: ['demonhunter_spirit_bomb'], durationHint: 30, priority: 3, ...FX },
  // Boşluk Metamorfozu (Yutucu): Çöken Yıldız açılır, Boşluk Fırtınası
  { id: 'void_meta', status: 'void_meta', name: 'Boşluk Metamorfozu', school: 'shadow', overlay: 'both', glow: ['demonhunter_collapsing_star', 'demonhunter_void_storm'], durationHint: 90, priority: 3, ...FX },
  { id: 'metamorphosis_v', status: 'metamorphosis_v', name: 'Metamorfoz', school: 'fire', overlay: 'center', glow: [], durationHint: 15, priority: 1, ...FX },
];

export const PROC_MODS_KIT_DEMONHUNTER: ProcMod[] = [];

export const GLOW_RULES_KIT_DEMONHUNTER: Record<string, GlowRule> = {};
