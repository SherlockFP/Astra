/**
 * AE-3 (docs/kits/agile-evoker.md §3b + the WoW Midnight Yutucu): StatusDef and STATUS_RULES rows of the İblis Avcısı kit, merged into
 * STATUSES / STATUS_RULES by data/statuses.ts. `stats` are per stack. Enemy-side statuses (essence_break, fiery_brand, frailty, chaos_brand,
 * the_hunt) are applied by the DH's hits; `essence_break` and `fiery_brand` carry `takenMoreFromSource` (only the applying DH deals the
 * extra damage). Kaos Damgası (`chaos_brand`) is the class debuff of CORE_MECHANICS §3: the party-buff layer (CM3) does not exist yet, the
 * engine has no school-restricted takenMore either, so it is +5 % damage taken from every school (noted as a gap). OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_DEMONHUNTER: Partial<Record<StatusId, StatusDef>> = {
  // ---- Kaos
  metamorphosis: { id: 'metamorphosis', name: 'Metamorfoz', icon: I('skill-berserk'), kind: 'buff', stats: { attackSpeed: 0.25, castSpeed: 0.25, maxHpPct: 0.15 }, vfx: 'enrage_aura', defaultDuration: 24 },
  initiative: { id: 'initiative', name: 'Girişim', icon: I('buff-haste'), kind: 'buff', stats: { damagePct: 0.12, critChance: 0.15 }, defaultDuration: 6 },
  exergy: { id: 'exergy', name: 'Taşkınlık', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.10 }, defaultDuration: 10 },
  essence_break: { id: 'essence_break', name: 'Öz Kırılması', icon: I('debuff-marked'), kind: 'debuff', defaultDuration: 4 },
  the_hunt: { id: 'the_hunt', name: 'Av', icon: I('debuff-marked'), kind: 'debuff', dotType: 'shadow', defaultDuration: 6 },
  blur: { id: 'blur', name: 'Bulanıklık', icon: I('buff-stealth'), kind: 'buff', stats: { damageReductionPct: 0.35, dodgeChance: 0.30 }, defaultDuration: 10 },
  chaos_brand: { id: 'chaos_brand', name: 'Kaos Damgası', icon: I('debuff-curse'), kind: 'debuff', dispellable: false, defaultDuration: 30 },
  // ---- İntikam
  metamorphosis_v: { id: 'metamorphosis_v', name: 'Metamorfoz', icon: I('skill-berserk'), kind: 'buff', stats: { maxHpPct: 0.40, lifeSteal: 0.15, damagePct: 0.20 }, vfx: 'enrage_aura', defaultDuration: 15 },
  soul_overflow: { id: 'soul_overflow', name: 'Ruh Taşması', icon: I('skill-life-drain'), kind: 'buff', hidden: true, defaultDuration: 3600 },
  demon_spikes: { id: 'demon_spikes', name: 'Şeytan Dikenleri', icon: I('buff-defense'), kind: 'buff', stats: { armorPct: 1.0, parryWindow: 0.30 }, vfx: 'bone_armor', defaultDuration: 8 },
  fiery_brand: { id: 'fiery_brand', name: 'Ateş Mührü', icon: I('debuff-burn'), kind: 'debuff', stats: { damagePct: -0.40 }, defaultDuration: 8 },
  frailty: { id: 'frailty', name: 'Zayıflık', icon: I('debuff-weakness'), kind: 'debuff', stats: { damagePct: -0.10 }, defaultDuration: 6 },
  // ---- Yutucu
  void_meta: { id: 'void_meta', name: 'Boşluk Metamorfozu', icon: I('skill-curse'), kind: 'buff', stats: { damagePct: 0.25, castSpeed: 0.15, critChance: 0.10 }, vfx: 'enrage_aura', defaultDuration: 90 },
  collapsing_star: { id: 'collapsing_star', name: 'Çöken Yıldız', icon: I('buff-crit'), kind: 'buff', maxStacks: 6, defaultDuration: 60 },
  // ---- Karanlık: allies inside the zone take 20 % less damage (re-applied each second)
  darkness: { id: 'darkness', name: 'Karanlık', icon: I('buff-stealth'), kind: 'buff', stats: { damageReductionPct: 0.20 }, defaultDuration: 1.6 },
  sigil_flame: { id: 'sigil_flame', name: 'Alev Mührü', icon: I('debuff-burn'), kind: 'debuff', dotType: 'fire', defaultDuration: 6 },
};

export const STATUS_RULES_KIT_DEMONHUNTER: Partial<Record<StatusId, StatusRule>> = {
  metamorphosis: { stack: 'refresh' },
  initiative: { stack: 'refresh' },
  exergy: { stack: 'refresh' },
  // Öz Kırılması: +60 % damage from the DH who applied it, for 4 s
  essence_break: { stack: 'refresh', takenMoreFromSource: 0.6 },
  the_hunt: { stack: 'refresh' },
  blur: { stack: 'refresh' },
  // Kaos Damgası: +5 % damage taken (CORE_MECHANICS §3, every school here)
  chaos_brand: { stack: 'refresh', takenMore: 0.05 },
  metamorphosis_v: { stack: 'refresh' },
  soul_overflow: { stack: 'refresh', internal: true },
  demon_spikes: { stack: 'refresh' },
  // Ateş Mührü: the target also takes +10 % damage from the DH
  fiery_brand: { stack: 'refresh', takenMoreFromSource: 0.10 },
  frailty: { stack: 'refresh' },
  void_meta: { stack: 'refresh' },
  collapsing_star: { stack: 'stack' },
  darkness: { stack: 'refresh' },
  sigil_flame: { stack: 'refresh' },
};
