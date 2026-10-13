/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §g statuses). StatusDef and STATUS_RULES rows of the mage kit, merged into
 * STATUSES / STATUS_RULES by data/statuses.ts. `clearcasting`, `heating_up`, `hot_streak`, `fingers_of_frost`, `brain_freeze`,
 * `combustion`, `chill`, `freeze` live in statuses_talents.ts / statuses.ts and are not repeated here. OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_MAGE: Partial<Record<StatusId, StatusDef>> = {
  // Gizem (Füzeler)
  arcane_salvo: { id: 'arcane_salvo', name: 'Gizem Mermisi', icon: I('skill-arcane-missiles'), kind: 'buff', maxStacks: 20, defaultDuration: 15 },
  // Ateş
  pyroclasm: { id: 'pyroclasm', name: 'Piroklazm', icon: I('skill-fire-wave'), kind: 'buff', maxStacks: 2, defaultDuration: 20 },
  // Buz
  freezing: { id: 'freezing', name: 'Donma', icon: I('skill-frost-nova'), kind: 'debuff', maxStacks: 12, defaultDuration: 15 },
  icicles: { id: 'icicles', name: 'Buz Sarkıtları', icon: I('skill-ice-lance'), kind: 'buff', maxStacks: 5, defaultDuration: 20 },
  glacial_ready: { id: 'glacial_ready', name: 'Buz Sarkıtı Hazır', icon: I('skill-ice-lance'), kind: 'buff', defaultDuration: 15 },
  comet_ready: { id: 'comet_ready', name: 'Kuyruklu Yıldız Hazır', icon: I('skill-meteor'), kind: 'buff', defaultDuration: 8 },
  freezing_rain: { id: 'freezing_rain', name: 'Dondurucu Yağmur', icon: I('skill-blizzard'), kind: 'buff', defaultDuration: 12 },
  // Shields (HUD labels of the absorb)
  ice_barrier: { id: 'ice_barrier', name: 'Buz Bariyeri', icon: I('skill-ice-block'), kind: 'buff', defaultDuration: 60 },
  prismatic_barrier: { id: 'prismatic_barrier', name: 'Prizmatik Bariyer', icon: I('skill-mana-shield'), kind: 'buff', defaultDuration: 30 },
};

export const STATUS_RULES_KIT_MAGE: Partial<Record<StatusId, StatusRule>> = {
  arcane_salvo: { stack: 'stack' },
  pyroclasm: { stack: 'stack' },
  freezing: { stack: 'stack' },
  icicles: { stack: 'stack' },
};
