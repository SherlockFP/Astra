import type { DamageType, EntityId } from './common';

/**
 * Death recap (GDD_V2 §8.5), owned by the combat module. `combat/deathLog.ts` keeps a 10 s ring buffer of the LOCAL player's
 * incoming hits and received heals; on local death Combat emits `death:recap` with the snapshot so the death panel can show it.
 */

/** One incoming hit that reached the local player (after mitigation). */
export interface DeathHitEntry {
  /** Combat clock of the hit (s). */
  t: number;
  source: EntityId | null;
  /** Turkish display name of the source (enemy name, "Çevre" for hazards / unknown). */
  sourceName: string;
  /** Level of the source when it is an enemy (absent for hazards and unknown sources). */
  sourceLevel?: number;
  /** Distance (m) from the source to the local player when the hit landed (absent when unknown). */
  sourceDist?: number;
  /** Ability name of the hit (the enemy ability, or "Saldırı" for a plain attack). */
  ability: string;
  /** Final damage taken. */
  amount: number;
  /** Raw damage removed by armour, resists, blocks and buffs before the hit landed. */
  mitigated: number;
  type: DamageType;
  /** The ability could have been dodged or blocked (not an unavoidable / damage-over-time hit). */
  avoidable: boolean;
  /** HP after the hit, 0..1. */
  hpPct: number;
}

/** One heal the local player received. */
export interface DeathHealEntry {
  t: number;
  source: EntityId | null;
  amount: number;
  /** Heal that could not be applied because the player was already full. */
  overheal: number;
}

export interface DeathRecap {
  /** Combat clock of the death (s). */
  at: number;
  /** Length of the recap window (s). */
  windowSec: number;
  /** Hits inside the window, oldest first. */
  hits: DeathHitEntry[];
  /** Heals inside the window, oldest first. */
  heals: DeathHealEntry[];
  /** The hit that brought the player to 0 HP (null when unknown, e.g. a DoT tick). */
  killingBlow: DeathHitEntry | null;
  /** Top 3 damage sources inside the window, most damage first. */
  topSources: { source: EntityId | null; name: string; amount: number; level?: number; dist?: number }[];
  /** Total damage taken inside the window. */
  taken: number;
  /** Total effective healing inside the window. */
  healed: number;
  /** The killing blow was avoidable ("Kaçınılabilirdi"). */
  avoidable: boolean;
  /** HP% line for the timeline (one point per hit). */
  hpSeries: { t: number; hpPct: number }[];
  /** Turkish labels of defensives that were ready at death ("Kullanılmayan: ..."). */
  unused: string[];
}
