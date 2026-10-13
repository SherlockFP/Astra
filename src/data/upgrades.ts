/**
 * Metin2 / Knight Online style upgrade table (GDD_SYSTEMS 5.1) and weapon glow tiers (5.3).
 * Index = TARGET level (1..15). `fail`: what happens to an item on failure without protection.
 * OWNER: items module.
 */
export type UpgradeFail = 'none' | 'stay' | 'downgrade' | 'destroy';
export interface UpgradeStep {
  target: number;
  chance: number;            // 0..1
  goldMult: number;
  kara_demir: number;
  buyulu_toz: number;
  ejderha_pulu: number;
  ruh_tasi: number;
  fail: UpgradeFail;
  weaponPct: number;         // cumulative weapon damage bonus (fraction)
  armorPct: number;          // cumulative armour bonus (fraction)
  efsunBonus: number;        // multiplier bonus on random affix values (fraction), from +10
}

type Row = [number, number, number, number, number, number, number, UpgradeFail, number, number, number];
// target, chance%, goldMult, kara, toz, pulu, ruh, fail, weapon%, armor%, efsun%
const ROWS: Row[] = [
  [1, 100, 1, 2, 0, 0, 0, 'none', 3, 2, 0],
  [2, 100, 1.5, 3, 0, 0, 0, 'none', 6, 5, 0],
  [3, 95, 2, 4, 0, 0, 0, 'stay', 10, 8, 0],
  [4, 90, 3, 5, 1, 0, 0, 'stay', 14, 11, 0],
  [5, 80, 4, 6, 2, 0, 0, 'stay', 18, 14, 0],
  [6, 70, 6, 8, 3, 0, 0, 'stay', 23, 18, 0],
  [7, 60, 8, 0, 4, 1, 0, 'downgrade', 29, 23, 0],
  [8, 50, 11, 0, 5, 2, 0, 'downgrade', 35, 28, 0],
  [9, 40, 15, 0, 6, 3, 0, 'downgrade', 42, 34, 0],
  [10, 30, 20, 0, 8, 4, 1, 'destroy', 50, 40, 5],
  [11, 25, 27, 0, 10, 5, 2, 'destroy', 59, 47, 6],
  [12, 20, 36, 0, 12, 6, 3, 'destroy', 69, 55, 10],
  [13, 15, 48, 0, 15, 8, 4, 'destroy', 80, 64, 12],
  [14, 10, 64, 0, 18, 10, 5, 'destroy', 92, 74, 14],
  [15, 5, 85, 0, 22, 12, 6, 'destroy', 105, 84, 20],
];

export const UPGRADE_STEPS: UpgradeStep[] = [
  { target: 0, chance: 1, goldMult: 0, kara_demir: 0, buyulu_toz: 0, ejderha_pulu: 0, ruh_tasi: 0, fail: 'none', weaponPct: 0, armorPct: 0, efsunBonus: 0 },
  ...ROWS.map((r) => ({
    target: r[0], chance: r[1] / 100, goldMult: r[2], kara_demir: r[3], buyulu_toz: r[4], ejderha_pulu: r[5], ruh_tasi: r[6], fail: r[7],
    weaponPct: r[8] / 100, armorPct: r[9] / 100, efsunBonus: r[10] / 100,
  })),
];

export const MAX_UPGRADE = 15;
/** Max upgrade level by rarity (poor cannot be upgraded). */
export const MAX_UPGRADE_BY_RARITY: Record<string, number> = { poor: 0, common: 9, uncommon: 9, rare: 12, epic: 15, legendary: 15, set: 15 };

export const stepOf = (level: number): UpgradeStep => UPGRADE_STEPS[Math.max(0, Math.min(MAX_UPGRADE, Math.floor(level)))];

/** Glow tiers used by the vfx module / tooltip text. */
export function glowTier(upgrade: number): { id: 'none' | 'glow_blue' | 'glow_purple' | 'glow_crimson' | 'glow_rainbow'; name: string; color: string } {
  if (upgrade >= 15) return { id: 'glow_rainbow', name: 'Gökkuşağı', color: '#ffffff' };
  if (upgrade >= 12) return { id: 'glow_crimson', name: 'Kızıl', color: '#ff4030' };
  if (upgrade >= 9) return { id: 'glow_purple', name: 'Mor', color: '#b14cff' };
  if (upgrade >= 7) return { id: 'glow_blue', name: 'Mavi', color: '#3fa9ff' };
  return { id: 'none', name: '', color: '' };
}

export const UPGRADE_GOLD_BASE = 100;
export const UPGRADE_GOLD_PER_ILVL = 20;
/** Gold cost of the attempt that targets `target` for an item of `ilvl`. */
export const upgradeGold = (ilvl: number, target: number): number => Math.round((UPGRADE_GOLD_BASE + UPGRADE_GOLD_PER_ILVL * ilvl) * stepOf(target).goldMult);
