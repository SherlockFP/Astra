/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10b / §11b / §g). StatusDef and STATUS_RULES rows of the warlock kit, merged into
 * STATUSES / STATUS_RULES by data/statuses.ts AFTER the shared rows (so resolve_pact overrides the talent row: 30 % -> 25 %).
 * DoT magnitude = DoT total / applying roll coefficient (Combat: dps = noCrit x magnitude / duration). The watchers aoe_mode and
 * exec_window are in data/watchers.ts. OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_WARLOCK: Partial<Record<StatusId, StatusDef>> = {
  // ---- Azap (affliction) and shared DoTs
  agony: { id: 'agony', name: 'Azap', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow', maxStacks: 8 },
  corruption: { id: 'corruption', name: 'Yozlaşma', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow' },
  unstable_affliction: { id: 'unstable_affliction', name: 'Dengesiz Azap', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow', maxStacks: 3 },
  seed: { id: 'seed', name: 'Yozlaşma Tohumu', icon: I('debuff-poison'), kind: 'debuff' },
  haunt: { id: 'haunt', name: 'Musallat', icon: I('buff-crit'), kind: 'debuff' },
  malevolence: { id: 'malevolence', name: 'Kötülük', icon: I('buff-crit'), kind: 'buff', stats: { dotPct: 0.12, castSpeed: 0.08 } },
  darkglare_active: { id: 'darkglare_active', name: 'Karanlık Göz', icon: I('buff-crit'), kind: 'buff', stats: { dotPct: 0.2 } },
  // ---- Yıkım (destruction)
  immolate: { id: 'immolate', name: 'Yakıp Yıkma', icon: I('debuff-burn'), kind: 'debuff', dotType: 'fire' },
  backdraft: { id: 'backdraft', name: 'Dönüş Alevi', icon: I('buff-haste'), kind: 'buff', maxStacks: 2 },
  fiendish_cruelty: { id: 'fiendish_cruelty', name: 'Şeytani Zalimlik', icon: I('buff-crit'), kind: 'buff' },
  // ---- Karanlık Pakt: the absorb is a `shield`; this row is its HUD label
  dark_pact: { id: 'dark_pact', name: 'Karanlık Pakt', icon: I('buff-invulnerable'), kind: 'buff' },
  // ---- Bitmeyen Kararlılık (§9 m180): -25 % damage taken (talent row had -30 %)
  resolve_pact: { id: 'resolve_pact', name: 'Bitmeyen Kararlılık', icon: I('buff-strength'), kind: 'buff', stats: { damageReductionPct: 0.25 } },
};

export const STATUS_RULES_KIT_WARLOCK: Partial<Record<StatusId, StatusRule>> = {
  agony: { stack: 'dotstack' },
  corruption: { stack: 'refresh' },
  unstable_affliction: { stack: 'dotstack' },
  seed: { stack: 'refresh' },
  // Musallat: the target takes +16 % damage (x(1 + 0.16)) from the caster
  haunt: { stack: 'refresh', takenMore: 0.16 },
  malevolence: { stack: 'refresh' },
  darkglare_active: { stack: 'refresh' },
  immolate: { stack: 'refresh' },
  backdraft: { stack: 'stack' },
  fiendish_cruelty: { stack: 'refresh' },
  dark_pact: { stack: 'refresh' },
  resolve_pact: { stack: 'refresh' },
};
