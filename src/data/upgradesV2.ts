/**
 * GDD_ITEMS_V2 §2.2–§2.12: Talih Birikimi (stacks), Değerli Taş (stones), Yükseltme Kâğıtları (scrolls), Ustalık (masterwork).
 * IT-00 STUB: the numeric constants and table rows of §2.3 / §2.5 / §2.8 / §2.12 are final here. IT-01 adds the pure helpers
 * (stackBonusPp, chanceOf, stackGain, stackAfterSuccess, failOutcomeOf). Tuning lives here only, never inline in logic.
 * Units: `base` is a percent, `pp` and `cap` are percentage points, `keep` and CHANCE_CAP are fractions (as in §2.3).
 * OWNER: items.
 */

/** Hard cap of the character-wide stack pool (Kader Eşiği at this value). §2.3. */
export const STACK_MAX = 60;
/** Final chance cap (only Kader Eşiği reaches 100 %). §2.2. */
export const CHANCE_CAP = 0.97;

/** §2.3 table, targets +7..+15. `base` = base success in percent; `gain` = stacks per failure; `pp` = percentage points per stack;
 *  `cap` = max stack bonus in pp; `keep` = fraction of stacks kept after a success at this target. */
export const STACK_RULES: Record<number, { base: number; gain: number; pp: number; cap: number; keep: number }> = {
  7:  { base: 60, gain: 1, pp: 0.5, cap: 25, keep: 0.75 },
  8:  { base: 50, gain: 1, pp: 0.5, cap: 25, keep: 0.75 },
  9:  { base: 40, gain: 1, pp: 0.5, cap: 25, keep: 0.75 },
  10: { base: 30, gain: 2, pp: 0.6, cap: 30, keep: 0.4 },
  11: { base: 25, gain: 2, pp: 0.6, cap: 30, keep: 0.4 },
  12: { base: 20, gain: 2, pp: 0.6, cap: 30, keep: 0.4 },
  13: { base: 15, gain: 3, pp: 0.5, cap: 30, keep: 0 },
  14: { base: 10, gain: 3, pp: 0.5, cap: 30, keep: 0 },
  15: { base: 5,  gain: 3, pp: 0.5, cap: 30, keep: 0 },
};

/** Failure outcome of one attempt (§2.6). `stay` = level kept; `down1` = −1; `down3` = −3 (Yüksek / Demirci Acıması); `destroy` / `break` = bound or unbound. */
export type FailOutcome = 'stay' | 'down1' | 'down3' | 'destroy' | 'break';

/** Yükseltme Kâğıdı ids (§2.5). `demirci_el_kitabi` is the existing id of the Orta scroll (O-IT3). */
export type ScrollId = 'yukseltme_dusuk' | 'demirci_el_kitabi' | 'yukseltme_yuksek';
/** §2.5. `pp` = chance bonus; `min` / `max` = usable targets; `softenDown` = −1 becomes "stays" (targets set by the table);
 *  `softenDestroy` = destroy / Kırık becomes −3 levels. */
export const SCROLLS: Record<ScrollId, { pp: number; min: number; max: number; softenDown: boolean; softenDestroy: boolean; name: string }> = {
  yukseltme_dusuk:   { pp: 5,  min: 3, max: 9,  softenDown: false, softenDestroy: false, name: 'Düşük Yükseltme Kâğıdı' },
  demirci_el_kitabi: { pp: 10, min: 5, max: 12, softenDown: true,  softenDestroy: false, name: 'Orta Yükseltme Kâğıdı' },
  yukseltme_yuksek:  { pp: 15, min: 8, max: 15, softenDown: true,  softenDestroy: true,  name: 'Yüksek Yükseltme Kâğıdı' },
};

/** §2.4 Değerli Taş sizes (stacks stored in one stone). */
export const STONE_SIZES = [10, 20, 30, 40, 50] as const;
export const stoneId = (size: number) => `degerli_tas_${size}`;
/** Taşa Aktar fee in gold. */
export const stoneFee = (size: number) => 400 * size;
/** Demirci buy price (1 per size per day). */
export const stoneBuyPrice = (size: number) => Math.round(6000 * size * (1 + size / 40));
/** Sell-back price: 25 % of the buy price. */
export const stoneSellPrice = (size: number) => Math.round(stoneBuyPrice(size) * 0.25);

/** §2.8 Ustalık (masterworking). Rank 1..5. Costs are per rank (index = rank − 1). `ilvlEq` = MW_ILVL (O-IT8). */
export const MASTERWORK = {
  maxRank: 5,
  pctPerRank: 0.03,
  goldMult: [1, 2, 4, 7, 12],
  ruh: [2, 3, 4, 6, 8],
  pulu: [10, 14, 18, 24, 30],
  dust: [5, 10, 15, 25, 40],
  ilvlEq: [0, 1, 2, 3, 5, 7],
} as const;
