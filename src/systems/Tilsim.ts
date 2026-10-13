/**
 * GDD_ITEMS_V2 §4.4: Tılsım Yuvası (proc socket on weapon and chest). COMPILE-ONLY STUB (IT-00).
 * OWNER: items (IT-40); the combat hooks by id are IT-43 (combat).
 */
import type { ItemInstance } from '../types/items';

export interface TilsimSpecial {
  /** The `ts_*` id, registered as a `special` id for the combat owner. */
  id: string;
  params: { grade: number; chance: number; coef: number; icd: number };
}

/** The Tılsım special of an item, or null when the socket is empty or closed. STUB. */
export function tilsimSpecial(_item: ItemInstance): TilsimSpecial | null {
  return null;
}
