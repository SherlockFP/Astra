/**
 * GDD_ITEMS_V2 §3.1 / §3.11: the efsun engine. One verb = one item; every currency goes through applyCurrency.
 * COMPILE-ONLY STUB (IT-00). OWNER: items (IT-03). Emits `efsun:changed` once IT-03 lands.
 */
import type { ClassId } from '../types/common';
import type { ItemInstance, RolledAffix } from '../types/items';
import type { OpResult } from '../types/itemsV2';
import type { RNG } from '../core/utils';

export interface CraftOpts {
  /** Line indices (slots 1–5) locked by Kilit. */
  lock?: number[];
  /** Tezgâh recipe id (slot 6) when the verb is `bench`. */
  recipe?: string;
  /** Target line index for single-line verbs. */
  line?: number;
}

export interface CraftPreview {
  ok: boolean;
  reason?: string;
  gold: number;
  materials: { id: string; count: number }[];
  /** Olası sonuçlar: tier probabilities for the item's ilvl (§3.3). */
  tierOdds?: { tier: number; pct: number }[];
  /** Expected value of a bench line (§3.5). */
  value?: number;
}

export interface CraftResult {
  ok: boolean;
  reason?: string;
  item?: ItemInstance;
  /** Line indices that changed. */
  changed?: number[];
  /** Bonus slot that changed, when relevant. */
  slot?: 6 | 7;
}

/** Quick gate for the UI (rarity, corruption, slot rules, currency present). STUB. */
export function canUseCurrency(_item: ItemInstance, _currencyId: string): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}

/** Pure preview of one operation: cost, materials, odds. STUB. */
export function previewCurrency(_uid: string, _currencyId: string, _o?: CraftOpts): CraftPreview {
  return { ok: false, reason: 'Henüz yok.', gold: 0, materials: [] };
}

/** Apply one operation and consume its cost. STUB. */
export function applyCurrency(_uid: string, _currencyId: string, _o?: CraftOpts): CraftResult {
  return { ok: false, reason: 'Henüz yok.' };
}

/** Roll one Özel Efsun line for slot 7 (weighted by S-tier and by the owner's role). STUB. */
export function rollSpecial(_item: ItemInstance, _rng: RNG, _classId?: ClassId, _role?: string): RolledAffix | null {
  return null;
}

/** The Tezgâh line for `affixId` (value = 0.75 × mid of the best tier, §3.5). STUB. */
export function benchLine(_item: ItemInstance, _affixId: string): RolledAffix | null {
  return null;
}
