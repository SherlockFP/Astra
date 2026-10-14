/**
 * AE-4 (docs/kits/agile-evoker.md §4.1b / §4.2b / §4.3b): proc rows, proc mods and glow rules of the Ejderhasoy kit. Merged by one line
 * each into data/procs.ts (PROC_DEFS, GLOW_RULES) and combat/procMods.ts (PROC_MODS).
 *
 * The triggers are `T` rows of the SpecDef.fx strings (data/specs_kit_evoker.ts) or happen inside the behaviours (combat/skills/evokerKit.ts):
 *   essence_burst   Ateş Nefesi release (certain, behaviour), Ejder Öfkesi (behaviour), Serbest Alev 25 %, Geri Dönüş 15 %, Yaşayan Alev
 *                   20 % (Koruyucu), Öngörü 30 %, chain finisher 1 % (fx). ONE ProcMod serves every spender of the three specs.
 *   leaping_flames  Ateş Nefesi / rank (behaviour); read and consumed by Yaşayan Alev (kit_living_flame, +1 extra bolt per stack).
 *   burnout         Yaşayan Alev 15 % (fx, Yıkım): the next Yaşayan Alev is instant and +30 %.
 *   iridescence     Ebedi Dalga (+2 stacks): the next 2 Parçala / Pyre / Püskürme are +20 % each.
 *   tip_scales      Ejder Öfkesi / Çağların Nefesi: the next empowered hold fires at rank 3 instantly (kit_empower consumes it).
 *   unbound_flame   4 charges after Ejder Öfkesi: the rmb button becomes Serbest Alev (SkillDef.replaces); the ProcMod spends one stack.
 *   merithras_blessing, twin_echoes, stasis   consumed by the behaviours themselves (bounce / double Yankı / Durgunluk Salımı).
 * Not written: ProcDefs for hover, obsidian, reversion, dream_breath, echo, lifebind, time_dilation, ebon_might, prescience, temporal_wound
 * (frames / HUD statuses, no overlay).
 */
import type { GlowRule, ProcDef } from './procs';
import type { ProcMod } from '../combat/procMods';

const FX = { sfxGain: 'proc_gain', sfxUse: 'proc_use', vfxGain: 'proc_burst', vfxUse: 'proc_consume' } as const;

/** Every spender that Öz Patlaması (essence_burst) makes free: Yıkım (Parçala, Pyre), Koruyucu (Yankı, Zümrüt Çiçek), Yüceltme (Püskürme). */
const BURST_SKILLS = ['evoker_disintegrate', 'evoker_pyre', 'evoker_echo', 'evoker_emerald_blossom', 'evoker_eruption'];

export const PROC_DEFS_KIT_EVOKER: ProcDef[] = [
  { id: 'essence_burst', status: 'essence_burst', name: 'Öz Patlaması', school: 'arcane', overlay: 'left', overlayByStacks: { 2: 'both' }, glow: BURST_SKILLS, durationHint: 15, priority: 2, ...FX },
  { id: 'leaping_flames', status: 'leaping_flames', name: 'Sıçrayan Alevler', school: 'fire', overlay: 'center', glow: ['evoker_living_flame'], durationHint: 20, priority: 1, ...FX },
  { id: 'burnout', status: 'burnout', name: 'Alev Tükenişi', school: 'fire', overlay: 'right', glow: ['evoker_living_flame'], durationHint: 10, priority: 2, ...FX },
  { id: 'iridescence', status: 'iridescence', name: 'Gökkuşağı', school: 'frost', overlay: 'right', glow: [], durationHint: 10, priority: 1, ...FX },
  { id: 'tip_scales', status: 'tip_scales', name: 'Terazi Eğimi', school: 'physical', overlay: 'top', glow: ['evoker_fire_breath', 'evoker_dream_breath', 'evoker_eternity_surge', 'evoker_upheaval'], durationHint: 30, priority: 2, ...FX },
  { id: 'dragonrage', status: 'dragonrage', name: 'Ejder Öfkesi', school: 'fire', overlay: 'both', glow: [], durationHint: 18, priority: 1, ...FX },
  { id: 'unbound_flame', status: 'unbound_flame', name: 'Serbest Alev', school: 'fire', overlay: 'center', glow: ['evoker_unbound_flame'], durationHint: 15, priority: 3, ...FX },
  { id: 'merithras_blessing', status: 'merithras_blessing', name: "Merithra'nın Lütfu", school: 'holy', overlay: 'top', glow: ['evoker_reversion', 'evoker_living_flame'], durationHint: 30, priority: 2, ...FX },
  { id: 'twin_echoes', status: 'twin_echoes', name: 'İkiz Yankılar', school: 'holy', overlay: 'right', glow: ['evoker_echo'], durationHint: 15, priority: 2, ...FX },
  { id: 'stasis', status: 'stasis', name: 'Durgunluk', school: 'frost', overlay: 'center', glow: ['evoker_stasis_release'], durationHint: 30, priority: 3, ...FX },
];

/**
 * One ProcMod per status. Öz Patlaması: the pip cost of the listed spenders is waived (pipFree) and one stack is consumed per cast.
 * Alev Tükenişi: the next Yaşayan Alev is instant (+30 %). Gökkuşağı: +20 % per stack on the next two Parçala / Pyre / Püskürme.
 * Serbest Alev: the transformed button spends one of its 4 stacks.
 */
export const PROC_MODS_KIT_EVOKER: ProcMod[] = [
  { status: 'essence_burst', skills: BURST_SKILLS, pipFree: true, consume: 'cast', consumeOne: true },
  { status: 'burnout', skills: ['evoker_living_flame'], castTimeMult: 0, more: 1.3, consume: 'cast' },
  { status: 'iridescence', skills: ['evoker_disintegrate', 'evoker_pyre', 'evoker_eruption'], more: 1.2, consume: 'cast', consumeOne: true },
  { status: 'unbound_flame', skills: ['evoker_unbound_flame'], costMult: 0, consume: 'cast', consumeOne: true },
];

/** No conditional glow rules: every glow of the kit is a proc status. */
export const GLOW_RULES_KIT_EVOKER: Record<string, GlowRule> = {};
