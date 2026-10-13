/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §6b / §7b / §8b / §g). StatusDef and STATUS_RULES rows of the rogue kit, merged into
 * STATUSES / STATUS_RULES by data/statuses.ts AFTER the shared rows (so these override same-id rows such as shadow_blades).
 * DoT ticks: `dotType` + the StatusApply `magnitude` (dps coefficient per the statuses convention).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_ROGUE: Partial<Record<StatusId, StatusDef>> = {
  // ---- Gölge (Subtlety) and shared
  shadowstep_haste: { id: 'shadowstep_haste', name: 'Gölge Hızı', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.7 } },
  behind_grace: { id: 'behind_grace', name: 'Arkada', icon: I('buff-crit'), kind: 'buff', hidden: true },
  find_weakness: { id: 'find_weakness', name: 'Zayıflık Bulma', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.1 } },
  feint: { id: 'feint', name: 'Aldatma', icon: I('buff-stealth'), kind: 'buff' },
  // Gölge Bıçakları: +20 % damage for 16 s, no cost reduction (replaces the shared -30 % cost row, §7a).
  shadow_blades: { id: 'shadow_blades', name: 'Gölge Bıçakları', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.2 } },
  improved_garrote: { id: 'improved_garrote', name: 'Gelişmiş Gırtlak Kesme', icon: I('buff-stealth'), kind: 'buff' },
  goremaw: { id: 'goremaw', name: 'Kan Isırığı', icon: I('buff-crit'), kind: 'buff' },
  // ---- Suikastçı (Assassination)
  garrote: { id: 'garrote', name: 'Gırtlak Kesme', icon: I('debuff-poison'), kind: 'debuff', dotType: 'physical' },
  rupture: { id: 'rupture', name: 'Yırtma', icon: I('debuff-poison'), kind: 'debuff', dotType: 'physical' },
  kingsbane: { id: 'kingsbane', name: 'Kral Belası', icon: I('debuff-poison'), kind: 'debuff', dotType: 'poison' },
  deathmark: { id: 'deathmark', name: 'Ölüm İşareti', icon: I('debuff-poison'), kind: 'debuff' },
  darkest_night: { id: 'darkest_night', name: 'Karanlık Gece', icon: I('buff-crit'), kind: 'buff' },
  // ---- Simyacı (Alchemist)
  alchemy_link: { id: 'alchemy_link', name: 'Simya Bağı', icon: I('buff-regen'), kind: 'buff' },
  elixir_ramp: { id: 'elixir_ramp', name: 'Hayat İksiri Hazırlığı', icon: I('buff-regen'), kind: 'buff' },
  brew_boost: { id: 'brew_boost', name: 'Köpüren Karışım', icon: I('buff-regen'), kind: 'buff' },
  ascendant: { id: 'ascendant', name: 'Yüce Karışım', icon: I('buff-invulnerable'), kind: 'buff' },
};

export const STATUS_RULES_KIT_ROGUE: Partial<Record<StatusId, StatusRule>> = {
  shadowstep_haste: { stack: 'refresh' },
  behind_grace: { stack: 'refresh' },
  find_weakness: { stack: 'refresh' },
  feint: { stack: 'refresh' },
  shadow_blades: { stack: 'refresh' },
  improved_garrote: { stack: 'refresh' },
  goremaw: { stack: 'refresh' },
  garrote: { stack: 'refresh' },
  rupture: { stack: 'refresh' },
  kingsbane: { stack: 'refresh' },
  deathmark: { stack: 'refresh' },
  darkest_night: { stack: 'refresh' },
  alchemy_link: { stack: 'refresh' },
  elixir_ramp: { stack: 'refresh' },
  brew_boost: { stack: 'refresh' },
  ascendant: { stack: 'refresh' },
};
