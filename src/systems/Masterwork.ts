/**
 * GDD_ITEMS_V2 §2.8: Ustalık (masterworking, ranks 1..5 on +15 equipment, never fails).
 * COMPILE-ONLY STUB (IT-00). OWNER: items (IT-04).
 */
import type { ItemInstance } from '../types/items';
import type { OpResult } from '../types/itemsV2';

export interface MasterworkCost { gold: number; ruh: number; pulu: number; dust: number }

/** Cost of the NEXT rank of this item, or null when the item cannot be mastered. STUB. */
export function masterworkCost(_item: ItemInstance): MasterworkCost | null {
  return null;
}

/** Raise the item's rank by one (`item.mw`), paying `masterworkCost`. STUB. */
export function masterwork(_uid: string): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}
