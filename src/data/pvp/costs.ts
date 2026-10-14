/**
 * PvP currency caps, the ilvl track and the vendor stock (GDD_PVP_FINDER §4.2, §4.4, §4.5). OWNER: items (data).
 * Rules live in systems/PvpGear.ts; this file only holds the numbers.
 */
import type { EquipSlot } from '../../types/items';

/** Daily Onur cap on earning (shared by every Onur source). */
export const ONUR_DAILY_CAP = 1500;

/** Fetih weekly cap on earning: min(3000, 1000 + 250 × (week_in_season − 1)). `week_in_season` is 1..8. */
export const FETIH_WEEK_MAX = 3000;
export const fetihWeeklyCap = (weekInSeason: number): number => {
  const w = Math.min(8, Math.max(1, Math.floor(weekInSeason)));
  return Math.min(FETIH_WEEK_MAX, 1000 + 250 * (w - 1));
};

/** Season length in mythic weeks (GDD_PVP_FINDER §3.4: PVP_SEASON_WEEKS). */
export const PVP_SEASON_WEEKS = 8;

/** PvP ilvl track (GDD_PVP_FINDER §4.5). Hard cap at the last step. */
export type PvpTier = 'er' | 'sampiyon' | 'sampiyon_plus';
export const PVP_TRACK: Record<PvpTier, number> = { er: 52, sampiyon: 58, sampiyon_plus: 62 };
export const PVP_TRACK_NAME: Record<PvpTier, string> = { er: 'Er', sampiyon: 'Şampiyon', sampiyon_plus: 'Şampiyon+' };
/** Fetih mührü cost of the step that ENDS at the given ilvl (Er to Şampiyon = 2, Şampiyon to Şampiyon+ = 4). */
export const PVP_UPGRADE_COST: Record<number, number> = { 58: 2, 62: 4 };

/** PvP power / resilience lines on a fresh PvP piece, by tier (weapon: pvpPower; armour: pvpResilience). */
export const PVP_LINE: Record<PvpTier, { power: number; resilience: number }> = {
  er: { power: 0.03, resilience: 0.02 },
  sampiyon: { power: 0.04, resilience: 0.03 },
  sampiyon_plus: { power: 0.05, resilience: 0.04 },
};

/** Share of a PvE item's stats a PvP piece carries (GDD_PVP_FINDER §4.1). */
export const PVP_PVE_STAT_SHARE = 0.8;

export type PvpStockSlot = EquipSlot | 'muhur';

export interface PvpStockRow {
  /** Stable id (vendor entry id suffix, weekly limit key). */
  id: string;
  /** Shop slot: an equipment slot (weapon / armour piece) or the mühür pack. */
  slot: PvpStockSlot;
  price: number;
  /** Weekly purchase limit (Fetih stock). Undefined = unlimited. */
  weeklyLimit?: number;
  /** Mühür pack: units per purchase. */
  count?: number;
}

/** Savaş Ustası (Onur, Er tier). Cosmetic glow and cape are not in v1 (no item art yet, §4.4). */
export const PVP_HONOR_STOCK: PvpStockRow[] = [
  { id: 'helm', slot: 'helm', price: 800 },
  { id: 'shoulders', slot: 'shoulders', price: 800 },
  { id: 'gloves', slot: 'gloves', price: 700 },
  { id: 'boots', slot: 'boots', price: 700 },
  { id: 'chest', slot: 'chest', price: 1500 },
  { id: 'legs', slot: 'legs', price: 1200 },
  { id: 'weapon', slot: 'weapon', price: 3000 },
];

/** Fetih Muhafızı (Fetih, Şampiyon tier) and the mühür pack. */
export const PVP_CONQUEST_STOCK: PvpStockRow[] = [
  { id: 'helm', slot: 'helm', price: 150, weeklyLimit: 1 },
  { id: 'shoulders', slot: 'shoulders', price: 150, weeklyLimit: 1 },
  { id: 'gloves', slot: 'gloves', price: 120, weeklyLimit: 1 },
  { id: 'boots', slot: 'boots', price: 120, weeklyLimit: 1 },
  { id: 'chest', slot: 'chest', price: 250, weeklyLimit: 1 },
  { id: 'legs', slot: 'legs', price: 200, weeklyLimit: 1 },
  { id: 'weapon', slot: 'weapon', price: 500, weeklyLimit: 1 },
  { id: 'muhur5', slot: 'muhur', price: 60, weeklyLimit: 4, count: 5 },
];
