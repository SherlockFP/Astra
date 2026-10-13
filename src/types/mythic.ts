import type { KeystoneData } from './items';

export type AffixId =
  | 'fortified' | 'tyrannical'
  | 'bolstering' | 'raging' | 'sanguine' | 'bursting' | 'inspiring' | 'volcanic' | 'quaking'
  | 'explosive' | 'necrotic' | 'spiteful' | 'storming' | 'grievous'
  | 'seasonal_efsun'
  // GDD_V2 §8.6 seasonal affixes (WP1). Registered as MythicAffixDef by the mythic owner (data/mythicAffixes.ts).
  | 'seasonal_kizil_ay' | 'seasonal_sis';

export interface MythicAffixDef {
  id: AffixId;
  name: string;               // Turkish
  desc: string;               // Turkish tooltip
  icon: string;
  minLevel: number;           // key level where it starts
  params: Record<string, number>;
}

/** Live state of a dungeon run. Host-authoritative; replicated in snapshots. */
export interface RunState {
  dungeonId: string;
  difficulty: 'normal' | 'heroic' | 'mythic' | 'mythicplus';
  keyLevel: number;           // 0 for non-M+
  affixes: AffixId[];
  seed: number;
  started: boolean;
  startTime: number;          // world time when the timer started (after countdown)
  elapsed: number;            // seconds incl. death penalties
  timerSec: number;
  deaths: number;
  deathPenaltySec: number;
  forces: number;             // current count
  forcesRequired: number;
  bossesKilled: string[];     // boss ids
  bossesTotal: number;
  completed: boolean;
  failed: boolean;            // abandoned
  inTime: boolean;
  upgradeLevels: number;      // 0..3 computed on completion
  countdown: number;          // pre-start countdown seconds remaining (10..0)
  // GDD_V2 §A (WP1 contracts, all optional)
  raid?: boolean;
  wipes?: number;
  brez?: number;
  /** Seal ids active for this run (GDD_V2 §4.4). */
  seals?: string[];
  /** Death log for the summary (GDD_V2 §8.5); host appends it. */
  deathLog?: { id: number; t: number; by: string; av: boolean }[];
  partySize?: number;
}

export interface RunRecord {
  dungeonId: string;
  keyLevel: number;
  timeSec: number;
  timerSec: number;
  inTime: boolean;
  upgrade: number;
  affixes: AffixId[];
  score: number;
  date: number;
  party?: string[];
  /** GDD_V2 §4.4 (WP1): seals used in this run. */
  seals?: string[];
}

export interface MythicProfile {
  rating: number;
  best: Record<string, { fortified?: RunRecord; tyrannical?: RunRecord }>;
  weekly: { week: number; runs: RunRecord[] };
  vaultClaimedWeek: number;
  keystone: KeystoneData | null;
  /** GDD_V2 §8.6 (WP1): archived season ratings keyed by season number. */
  seasons?: Record<number, { rating: number; best: Record<string, unknown> }>;
}
