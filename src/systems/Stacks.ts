/**
 * GDD_ITEMS_V2 §2.4: Talih Birikimi state and Değerli Taş (stones: create, load, buy, sell).
 * COMPILE-ONLY STUB (IT-00). OWNER: items (IT-04). Stacks live in CharacterSave.upg.stacks (persisted per character).
 */
import { STACK_MAX } from '../data/upgradesV2';
import type { OpResult } from '../types/itemsV2';

export interface StackState { stacks: number; max: number }

/** Current character-wide stacks and the cap. STUB: 0 until IT-04 reads CharacterSave.upg. */
export function stackState(): StackState {
  return { stacks: 0, max: STACK_MAX };
}

/** Taşa Aktar: turn `size` stacks into one stone (fee 400 × size gold). STUB. */
export function makeStone(_size: number): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}

/** Taştan Yükle: consume one stone, add its size to the stacks (cap 60). STUB. */
export function loadStone(_size: number): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}

/** Satın Al: buy one stone of this size (1 per size per day). STUB. */
export function buyStone(_size: number): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}

/** Sat: sell one stone back at 25 % of the buy price. STUB. */
export function sellStone(_size: number): OpResult {
  return { ok: false, reason: 'Henüz yok.' };
}
