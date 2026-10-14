/**
 * HAYDUT status rows (docs/WOW_ABILITY_MAP.md §15, §16). StatusDef and STATUS_RULES rows of the rogue kit, merged into
 * STATUSES / STATUS_RULES by data/statuses.ts AFTER the shared rows (so these override same-id rows such as shadow_blades).
 * DoT ticks: `dotType` + the StatusApply `magnitude` (dps coefficient per the statuses convention).
 * Values marked "yaklaşık" in the skill descs are approximations of the WoW effect.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_ROGUE: Partial<Record<StatusId, StatusDef>> = {
  // ---- Shared and Gölge (Subtlety)
  shadowstep_haste: { id: 'shadowstep_haste', name: 'Gölge Hızı', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.7 } },
  behind_grace: { id: 'behind_grace', name: 'Arkada', icon: I('buff-crit'), kind: 'buff', hidden: true },
  find_weakness: { id: 'find_weakness', name: 'Zayıflık Bulma', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.1 } },
  feint: { id: 'feint', name: 'Aldatma', icon: I('buff-stealth'), kind: 'buff' },
  shadow_blades: { id: 'shadow_blades', name: 'Gölge Bıçakları', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.2 } },
  symbols_of_death: { id: 'symbols_of_death', name: 'Ölüm Sembolleri', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.2 } },
  improved_garrote: { id: 'improved_garrote', name: 'Gelişmiş Gırtlak Kesme', icon: I('buff-stealth'), kind: 'buff' },
  goremaw: { id: 'goremaw', name: 'Kan Isırığı', icon: I('buff-crit'), kind: 'buff' },
  sprint: { id: 'sprint', name: 'Koşu', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.7 } },
  evasion: { id: 'evasion', name: 'Kaçınma', icon: I('buff-stealth'), kind: 'buff', stats: { dodgeChance: 0.5 } },
  // ---- Suikastçı (Assassination)
  garrote: { id: 'garrote', name: 'Gırtlak Kesme', icon: I('debuff-poison'), kind: 'debuff', dotType: 'physical' },
  rupture: { id: 'rupture', name: 'Yırtma', icon: I('debuff-poison'), kind: 'debuff', dotType: 'physical' },
  kingsbane: { id: 'kingsbane', name: 'Kral Belası', icon: I('debuff-poison'), kind: 'debuff', dotType: 'poison' },
  deathmark: { id: 'deathmark', name: 'Ölüm İşareti', icon: I('debuff-poison'), kind: 'debuff' },
  darkest_night: { id: 'darkest_night', name: 'Karanlık Gece', icon: I('buff-crit'), kind: 'buff' },
  // ---- Kanun Kaçağı (Outlaw)
  slice_and_dice: { id: 'slice_and_dice', name: 'Dilimleme', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.2 } },
  roll_the_bones: { id: 'roll_the_bones', name: 'Zar', icon: I('buff-crit'), kind: 'buff', stats: { attackSpeed: 0.1 } },
  adrenaline_rush: { id: 'adrenaline_rush', name: 'Adrenalin Dürtüsü', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.3, resourceRegenPct: 1.0 } },
  killing_spree: { id: 'killing_spree', name: 'Katliam', icon: I('buff-crit'), kind: 'buff', stats: { damagePct: 0.2 } },
  blade_flurry: { id: 'blade_flurry', name: 'Bıçak Fırtınası', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.2 } },
};

export const STATUS_RULES_KIT_ROGUE: Partial<Record<StatusId, StatusRule>> = {
  shadowstep_haste: { stack: 'refresh' },
  behind_grace: { stack: 'refresh' },
  find_weakness: { stack: 'refresh' },
  feint: { stack: 'refresh' },
  shadow_blades: { stack: 'refresh' },
  symbols_of_death: { stack: 'refresh' },
  improved_garrote: { stack: 'refresh' },
  goremaw: { stack: 'refresh' },
  sprint: { stack: 'refresh' },
  evasion: { stack: 'refresh' },
  garrote: { stack: 'refresh' },
  rupture: { stack: 'refresh' },
  kingsbane: { stack: 'refresh' },
  deathmark: { stack: 'refresh' },
  darkest_night: { stack: 'refresh' },
  slice_and_dice: { stack: 'refresh' },
  roll_the_bones: { stack: 'refresh' },
  adrenaline_rush: { stack: 'refresh' },
  killing_spree: { stack: 'refresh' },
  blade_flurry: { stack: 'refresh' },
};
