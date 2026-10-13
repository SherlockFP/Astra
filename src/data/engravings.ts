/**
 * GDD_ITEMS_V2 §4.5: Kazıma (Lost Ark engravings on jewellery, P2). IT-00 STUB: rules and thresholds are final; the 12 engraving
 * rows are filled by IT-41. `ENGRAVING_ENABLED` stays false until IT-41 ships.
 * OWNER: items.
 */
import type { EquipSlot } from '../types/items';
import type { StatBlock } from '../types/stats';

export const ENGRAVING_ENABLED = false;

/** Carriers (rings and amulet). Belt and armour carry no engraving rows (§4.5). */
export const ENGRAVING_CARRIERS: readonly EquipSlot[] = ['amulet', 'ring1', 'ring2'];
/** Rows per item by rarity: Nadir 1, Destansı 2, Efsanevi 2 (other rarities 0). */
export const ENGRAVING_ROWS: Partial<Record<string, number>> = { rare: 1, epic: 2, legendary: 2 };
/** Points per row: 3 … 7 with these weights in percent (30 / 30 / 20 / 12 / 8). */
export const ENGRAVING_POINTS = { min: 3, max: 7, weights: [30, 30, 20, 12, 8] } as const;
/** Level thresholds on the summed points of one engraving id across the carriers: level 1 at 5, 2 at 10, 3 at 15 (cap). */
export const ENGRAVING_THRESHOLDS = [5, 10, 15] as const;
/** At most this many engravings are active (the highest levels, ties by id). */
export const ENGRAVING_ACTIVE_MAX = 3;

/** One engraving (§4.5 table). `levels` = stats of level 1, 2, 3. Folded by StatCalc; no specials. */
export interface EngravingDef {
  id: string;
  name: string;
  roles: ('tank' | 'healer' | 'melee' | 'caster')[];
  levels: [StatBlock, StatBlock, StatBlock];
}

/** Filled by IT-41 (12 rows). */
export const ENGRAVINGS: Record<string, EngravingDef> = {};
