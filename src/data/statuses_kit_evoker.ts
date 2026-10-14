/**
 * AE-4 (docs/kits/agile-evoker.md §4): StatusDef and STATUS_RULES rows of the Ejderhasoy kit, merged into STATUSES / STATUS_RULES by
 * data/statuses.ts. Numbers follow the proc tables of §4.1b / §4.2b / §4.3b.
 *
 *  - Stat statuses (`dragonrage`, `hover`, `obsidian`, `time_dilation`, `prescience`, `ebon_might`) carry their numbers in `stats`; the
 *    perMag ones (`ebon_might`) take the value from the magnitude the applier passes (0.11 on allies, 0.08 on the caster).
 *  - `reversion` / `dream_breath` are heal-over-time statuses (rule `hot`): the magnitude is HP per second (healFormula / duration).
 *  - `echo`, `lifebind`, `stasis`, `temporal_wound` are labels: the engine side lives in combat/skills/evokerKit.ts (caster-side tables),
 *    the status is what the HUD shows and what the APL reads.
 *  - `dragonrage` halves the cooldown of Ateş Nefesi and Ebedi Dalga while it is up (rule `cdMult`).
 *  - `essence_burst` is the shared Öz Patlaması proc of all three specs (2 stacks, 15 s); its ProcMod is in procs_kit_evoker.ts.
 *  - `bronze_blessing` (Bronz Kudret party aura) has a def but no engine source: the aura is a listed gap.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_EVOKER: Partial<Record<StatusId, StatusDef>> = {
  // ---- Yıkım Nefesi (devastation)
  essence_burst: { id: 'essence_burst', name: 'Öz Patlaması', icon: I('buff-mana-regen'), kind: 'buff', maxStacks: 2, defaultDuration: 15 },
  leaping_flames: { id: 'leaping_flames', name: 'Sıçrayan Alevler', icon: I('buff-strength'), kind: 'buff', maxStacks: 3, defaultDuration: 20 },
  burnout: { id: 'burnout', name: 'Alev Tükenişi', icon: I('buff-crit'), kind: 'buff', defaultDuration: 10 },
  iridescence: { id: 'iridescence', name: 'Gökkuşağı', icon: I('buff-aura'), kind: 'buff', maxStacks: 2, defaultDuration: 10 },
  tip_scales: { id: 'tip_scales', name: 'Terazi Eğimi', icon: I('buff-haste'), kind: 'buff', defaultDuration: 30 },
  dragonrage: { id: 'dragonrage', name: 'Ejder Öfkesi', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.15 }, vfx: 'enrage_aura', defaultDuration: 18 },
  unbound_flame: { id: 'unbound_flame', name: 'Serbest Alev', icon: I('buff-crit'), kind: 'buff', maxStacks: 4, defaultDuration: 15 },
  fire_breath_burn: { id: 'fire_breath_burn', name: 'Ejder Alevi', icon: I('debuff-burn'), kind: 'debuff', dotType: 'fire', vfx: 'burn_loop', dispellable: true, defaultDuration: 14 },
  hover: { id: 'hover', name: 'Süzül', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.30 }, vfx: 'wings_aura', defaultDuration: 6 },
  obsidian: { id: 'obsidian', name: 'Obsidyen Pullar', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.30 }, vfx: 'shield_bubble', defaultDuration: 12 },
  empowering: { id: 'empowering', name: 'Nefes Hazırlığı', icon: I('buff-aura'), kind: 'buff', hidden: true, defaultDuration: 3 },

  // ---- Koruyucu Nefes (preservation)
  reversion: { id: 'reversion', name: 'Geri Dönüş', icon: I('skill-renew'), kind: 'buff', vfx: 'heal_loop', defaultDuration: 12 },
  dream_breath: { id: 'dream_breath', name: 'Rüya Nefesi', icon: I('skill-regeneration'), kind: 'buff', vfx: 'heal_loop', defaultDuration: 8 },
  merithras_blessing: { id: 'merithras_blessing', name: "Merithra'nın Lütfu", icon: I('buff-blessing'), kind: 'buff', defaultDuration: 30 },
  echo: { id: 'echo', name: 'Yankı', icon: I('buff-regen'), kind: 'buff', maxStacks: 2, defaultDuration: 20 },
  twin_echoes: { id: 'twin_echoes', name: 'İkiz Yankılar', icon: I('buff-regen'), kind: 'buff', defaultDuration: 15 },
  lifebind: { id: 'lifebind', name: 'Yaşam Bağı', icon: I('buff-lifesteal'), kind: 'buff', defaultDuration: 8 },
  stasis: { id: 'stasis', name: 'Durgunluk', icon: I('buff-aura'), kind: 'buff', defaultDuration: 30 },
  time_dilation: { id: 'time_dilation', name: 'Zaman Genişlemesi', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.40 }, vfx: 'time_ripple', defaultDuration: 8 },

  // ---- Yüceltme (augmentation)
  ebon_might: { id: 'ebon_might', name: 'Abanoz Kudret', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 1 }, vfx: 'ebon_wings', defaultDuration: 20 },
  prescience: { id: 'prescience', name: 'Öngörü', icon: I('buff-crit'), kind: 'buff', stats: { critChance: 0.13 }, defaultDuration: 20 },
  temporal_wound: { id: 'temporal_wound', name: 'Zamansal Yara', icon: I('debuff-marked'), kind: 'debuff', vfx: 'temporal_wound', defaultDuration: 10 },

  // ---- class aura (no engine source yet, see the header)
  bronze_blessing: { id: 'bronze_blessing', name: 'Bronz Kudret', icon: I('buff-haste'), kind: 'buff', stats: { castSpeed: 0.03 }, defaultDuration: 10 },
};

export const STATUS_RULES_KIT_EVOKER: Partial<Record<StatusId, StatusRule>> = {
  essence_burst: { stack: 'stack' },
  leaping_flames: { stack: 'stack' },
  burnout: { stack: 'refresh' },
  iridescence: { stack: 'stack' },
  tip_scales: { stack: 'refresh' },
  // Ateş Nefesi and Ebedi Dalga cooldowns x0.5 for the 18 s (the doc's "CD -50 %")
  dragonrage: { stack: 'refresh', cdMult: { mult: 0.5, skills: ['evoker_fire_breath', 'evoker_eternity_surge'] } },
  unbound_flame: { stack: 'stack' },
  fire_breath_burn: { stack: 'strongest' },
  hover: { stack: 'refresh' },
  obsidian: { stack: 'refresh' },
  empowering: { stack: 'refresh' },
  // HoT magnitude = HP per second (StatusEffects.tick heals the owner)
  reversion: { stack: 'refresh', hot: true },
  dream_breath: { stack: 'refresh', hot: true },
  merithras_blessing: { stack: 'refresh' },
  echo: { stack: 'refresh' },
  twin_echoes: { stack: 'refresh' },
  lifebind: { stack: 'refresh' },
  stasis: { stack: 'refresh' },
  time_dilation: { stack: 'refresh' },
  // Abanoz Kudret: damagePct 1 x magnitude (0.11 allies, 0.08 the Evoker)
  ebon_might: { stack: 'refresh', perMag: true, defMag: 0.11 },
  prescience: { stack: 'refresh' },
  temporal_wound: { stack: 'refresh' },
  bronze_blessing: { stack: 'refresh' },
};
