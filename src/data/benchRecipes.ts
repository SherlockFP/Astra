/**
 * GDD_ITEMS_V2 §3.5: Tezgâh (efsun slot 6, PoE-style deterministic bench). IT-00 STUB: the cost table, the slot lists and the
 * signature are final; `BENCH_COST_CLASS` (50 ids) and `benchValue` are filled by IT-01.
 * OWNER: items.
 */
import type { AffixDef } from '../types/items';

export type BenchCostClass = 'A' | 'B' | 'C';

/** Filled by IT-01: cost class per affix id (A 22 ids, B 21 ids, C 7 ids, §3.5). */
export const BENCH_COST_CLASS: Record<string, BenchCostClass> = {};

/** §3.5 cost classes. Gold = `gold + goldPerIlvl × ilvl`. */
export const BENCH_COST: Record<BenchCostClass, { gold: number; goldPerIlvl: number; toz: number; pulu: number; ruh: number; chaos: number }> = {
  A: { gold: 3000, goldPerIlvl: 250, toz: 6, pulu: 2, ruh: 0, chaos: 2 },
  B: { gold: 5000, goldPerIlvl: 350, toz: 12, pulu: 4, ruh: 0, chaos: 4 },
  C: { gold: 8000, goldPerIlvl: 500, toz: 20, pulu: 8, ruh: 1, chaos: 8 },
};

/** §3.2: slot 6 is open on the eight body and hand slots. */
export const BENCH_SLOTS = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'] as const;
/** §3.2: slot 7 is open on the three big slots. */
export const SPECIAL_SLOTS = ['weapon', 'chest', 'amulet'] as const;

/** Value of a bench line: `round(0.75 × mid(best non-T0 tier eligible at ilvl))` (§3.3). STUB: returns 0 until IT-01. */
export function benchValue(_def: AffixDef, _ilvl: number): number {
  return 0;
}
