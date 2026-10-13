/**
 * KIT PM-PA (docs/kits/plate-melee.md §5b, §6b, §7b). Proc rows and proc mods of the Paladin kit. Merged by one line each into
 * data/procs.ts (PROC_DEFS) and combat/procMods.ts (PROC_MODS). OWNER: PM-PA.
 * The procs themselves are `T` rows of the SpecDef.fx strings (data/specs_paladin.ts): righteous / shining_light (Doğruluk Kalkanı),
 * infusion_of_light (Kutsal Şok, Üçlü Işık, İlahi Çınlama), templar_combo / art_of_war / crusade (Ceza). Statuses without a row here
 * (righteous, crusade, judged, ...) have no glow: righteous / crusade are auras. templar_combo is a hidden `replaces` trigger; its row only glows the
 * transformed button (Tapınakçı Kılıcı) for its 4 s, and keeps tools/smoke/procs_data.mjs happy (every PROC_MODS status needs a ProcDef).
 */
import type { ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

export const PROC_DEFS_KIT_PALADIN: ProcDef[] = [
  { id: 'shining_light', status: 'shining_light', name: 'Parlak Işık', school: 'holy', overlay: 'right', glow: ['paladin_word_of_glory'], durationHint: 15, priority: 2, ...FX },
  { id: 'infusion_of_light', status: 'infusion_of_light', name: 'Işık Aşısı', school: 'holy', overlay: 'top', glow: ['paladin_flash_of_light'], durationHint: 15, priority: 2, ...FX },
  { id: 'art_of_war', status: 'art_of_war', name: 'Adalet Savaşı', school: 'holy', overlay: 'left', glow: ['paladin_blade_of_justice'], durationHint: 12, priority: 2, ...FX },
  { id: 'templar_combo', status: 'templar_combo', name: 'Tapınakçı Zinciri', school: 'holy', overlay: 'left', glow: ['paladin_templar_slash'], durationHint: 4, priority: 1, ...FX },
  { id: 'hammer_window', status: 'hammer_window', name: 'Işık Çekici Hazır', school: 'holy', overlay: 'top', glow: ['paladin_hammer_of_light'], durationHint: 12, priority: 3, ...FX },
];

/**
 * Proc mods:
 *  - Parlak Işık: the next Işığın Sözü costs no Kutsal Güç (`pipFree`, ProcMod addition of PM-PA) and no faith.
 *  - Işık Aşısı: the next Işık Parlaması is instant, free, +20 % and gives +1 Kutsal Güç (`procInstant` on the skill row).
 *  - Adalet Savaşı: the next Adalet Bıçağı resets its own cooldown and hits +25 %.
 *  - Işık Çekici Hazır (2 stacks): one stack per Işık Çekici cast (the row replaces Kutsal Hüküm while the status is up).
 *  - Tapınakçı Zinciri: consumed by the Tapınakçı Kılıcı cast (the row replaces Haçlı Darbesi while the status is up).
 */
export const PROC_MODS_KIT_PALADIN: ProcMod[] = [
  { status: 'shining_light', skills: ['paladin_word_of_glory'], costMult: 0, pipFree: true, consume: 'cast' },
  { status: 'infusion_of_light', skills: ['paladin_flash_of_light'], costMult: 0, castTimeMult: 0, more: 1.2, bonusPips: { id: 'holypower', n: 1 }, consume: 'cast' },
  { status: 'art_of_war', skills: ['paladin_blade_of_justice'], cdReset: true, more: 1.25, consume: 'cast' },
  { status: 'hammer_window', skills: ['paladin_hammer_of_light'], consume: 'cast', consumeOne: true },
  { status: 'templar_combo', skills: ['paladin_templar_slash'], consume: 'cast' },
];
