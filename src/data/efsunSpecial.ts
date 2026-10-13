/**
 * GDD_ITEMS_V2 §3.6: Özel Efsun (efsun slot 7, Metin2 "special bonus"). IT-00 STUB: the S-tier gates and weights are final;
 * the 24-row pool `SPECIAL_AFFIXES` and `SPECIAL_BY_SLOT` are filled by IT-01. Lines whose `stat` is not in STAT_INFO are skipped.
 * OWNER: items.
 */
import { STAT_INFO, type StatId } from '../types/stats';

/** One line of the Özel pool (§3.6). `tiers` = [S4, S3, S2, S1] as [min, max], already divided by 100 for `pct`. */
export interface SpecialAffixDef {
  id: string;
  name: string;
  stat: StatId;
  slots: ('weapon' | 'chest' | 'amulet')[];
  tiers: [number, number][];
  unit: 'pct' | 'flat' | 'sec';
  tags: string[];
}

/** §3.3: S-tier ilvl gates, S4 first (S4 1, S3 30, S2 50, S1 72 = M+ only). */
export const S_TIER_GATES = [1, 30, 50, 72] as const;
/** §3.3: S-tier weights, S4 first. */
export const S_TIER_WEIGHTS = [100, 60, 30, 10] as const;

/** Filled by IT-01 (24 rows of §3.6). */
export const SPECIAL_AFFIXES: SpecialAffixDef[] = [];

/** Filled by IT-01: ids per slot (weapon 16, chest 10, amulet 15). */
export const SPECIAL_BY_SLOT: Record<'weapon' | 'chest' | 'amulet', string[]> = { weapon: [], chest: [], amulet: [] };

/** A pool line can roll only when its stat exists in STAT_INFO at runtime (GDD_V2 WP1 appends many of them). */
export function specialUsable(def: SpecialAffixDef): boolean {
  return Object.prototype.hasOwnProperty.call(STAT_INFO, def.stat);
}
