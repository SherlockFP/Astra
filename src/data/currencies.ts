/**
 * GDD_ITEMS_V2 §3.1 / §3.11: the efsun currency catalogue (one engine, two layers, one verb = one item).
 * IT-00 STUB: types final; the 20 entries (§3.1 table + §3.7 items) are added by IT-01. Only `systems/Crafting.ts` reads it.
 * OWNER: items.
 */

/** One verb of the efsun engine (§3.1 table). */
export type CraftVerb =
  | 'rerollAll' | 'rerollOne' | 'addOne' | 'addHigh' | 'removeOne' | 'values' | 'lock' | 'rarity' | 'alchemy'
  | 'corrupt' | 'unlock6' | 'bench' | 'unlock7' | 'rerollSpecial' | 'transfer';

/** Layer A = Demirci Efsunu (gold + efsun items, tab `efsun`). Layer B = Zanaat Küreleri (orbs, tab `craft`). S = slot items. */
export interface CurrencyDef {
  id: string;
  verb: CraftVerb;
  layer: 'A' | 'B' | 'S';
  tab: 'efsun' | 'craft';
  name: string;
  desc: string;
  icon: string;
}

/** Filled by IT-01 (20 entries). Neutral in IT-00. */
export const CURRENCIES: Record<string, CurrencyDef> = {};
