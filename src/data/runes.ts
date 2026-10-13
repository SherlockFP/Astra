/**
 * Destek Rünleri (support runes, GDD_V2 §4.1). COMPILE-ONLY STUB (WP1): empty until items owner fills it (WP3).
 * Keys: rune ids `sup_*`. OWNER: items (data). Types: types/v2.ts.
 */
import type { RuneDef } from '../types/v2';

export const SUPPORT_RUNES: Readonly<Record<string, RuneDef>> = {};

/** Support rune by id; undefined while the registry is empty or the id is unknown. */
export function getRune(id: string): RuneDef | undefined {
  return SUPPORT_RUNES[id];
}
