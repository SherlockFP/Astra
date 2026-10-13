import type { StatBlock } from '../types/stats';

/**
 * Av Defteri (biologist-style collection, GDD_OPENWORLD 6.4). Six steps; each needs `count` trophies that drop at 15%
 * (swarm 6%) from the listed sources ONLY while the step is active. Delivering a step gives a permanent stat bonus
 * (StatCalc adds `stats` of every completed step). OWNER: items module (runtime in systems/Quests.ts).
 */
export interface AvDefteriStep {
  step: number;
  minLevel: number;
  /** Trophy material id (data/materials.ts, kind 'quest'). */
  item: string;
  count: number;
  /** Turkish source label for the questlog. */
  sourceText: string;
  /** Enemy ids and/or enemy families that drop the trophy. */
  sources: { ids?: string[]; families?: string[] };
  /** Turkish reward label. */
  rewardText: string;
  /** Permanent bonus (fractions for percent stats). */
  stats: StatBlock;
}

export const AV_DEFTERI: AvDefteriStep[] = [
  { step: 1, minLevel: 5, item: 'trophy_kurt_disi', count: 15, sourceText: 'Kurtlar', sources: { ids: ['ow_wolf', 'ow_wolf_dire', 'ow_warg'] },
    rewardText: 'Maks. Can +%1', stats: { maxHpPct: 0.01 } },
  { step: 2, minLevel: 10, item: 'trophy_domuz_disi', count: 20, sourceText: 'Yaban Domuzu / Gergedan', sources: { ids: ['ow_boar', 'ow_rhino'] },
    rewardText: 'Hasar +%1', stats: { damagePct: 0.01 } },
  { step: 3, minLevel: 15, item: 'trophy_haydut_muhru', count: 25, sourceText: 'Haydutlar', sources: { families: ['bandit'] },
    rewardText: 'Zırh +%2', stats: { armorPct: 0.02 } },
  { step: 4, minLevel: 20, item: 'trophy_zehir_ozu', count: 30, sourceText: 'Gulyabani / Çamur / Hortlak', sources: { ids: ['ow_ghoul', 'ow_ooze', 'ow_wraith'] },
    rewardText: 'Zehir Direnci +%3', stats: { resPoison: 0.03 } },
  { step: 5, minLevel: 25, item: 'trophy_ork_disi', count: 35, sourceText: 'Orklar', sources: { families: ['orc'] },
    rewardText: 'Kritik Şansı +%1', stats: { critChance: 0.01 } },
  { step: 6, minLevel: 30, item: 'trophy_lanetli_kemik', count: 40, sourceText: 'İskelet / Tarikat / Gölge', sources: { families: ['skeleton', 'cultist'], ids: ['shade'] },
    rewardText: 'Hareket Hızı +%2', stats: { moveSpeedPct: 0.02 } },
];

/** Delivery cooldown after a completed step (flag `world.bio.cd`, epoch ms). */
export const AV_DELIVERY_COOLDOWN_MS = 20 * 60 * 1000;
/** Trophy drop chances while the step is active. */
export const AV_TROPHY_CHANCE = 0.15;
export const AV_TROPHY_CHANCE_SWARM = 0.06;
