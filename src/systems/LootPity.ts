import { CHEST_FINAL, NAMED_PITY, PITY, PITY_CAP, PITY_STEP, SMART_STREAK } from '../data/loot';

/**
 * Loot V3 pity and bad-luck counters (GDD_LOOT_V3 §4.2, §7, §8). OWNER: items module. Pure functions over the character's
 * `save.flags` (Record<string, number | boolean | string>, persisted with the save), so no type change was needed:
 *
 *   loot.pity                 legendary pity, float 0..60 (was an integer 0..40 fed by boss kills only)
 *   loot.namedMiss.<bossId>   boss chests since that boss last dropped a named item
 *   loot.eliteSinceRare       consecutive elite items below Nadir
 *   loot.offSmart             consecutive non-smart guaranteed chest items
 *   loot.seen.<uniqueId>      1 once the unique was obtained (duplicate protection, collection log)
 */
export type Flags = Record<string, number | boolean | string>;

const num = (f: Flags, k: string): number => {
  const v = f[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

// ---- legendary pity
export const getPity = (f: Flags): number => num(f, 'loot.pity');
export function addPity(f: Flags, n: number): void {
  f['loot.pity'] = Math.min(PITY.cap, Math.max(0, +(getPity(f) + n).toFixed(4)));
}
export const resetPity = (f: Flags): void => {
  f['loot.pity'] = 0;
};
/** Weight multiplier of the legendary rarity (existing formula, new input): min(PITY_CAP, 1 + PITY_STEP x pity). */
export const pityMult = (f: Flags): number => Math.min(PITY_CAP, 1 + PITY_STEP * getPity(f));
/** Hard pity: the next boss-chest generic guaranteed item must be legendary / set. */
export const hardPityDue = (f: Flags): boolean => getPity(f) >= PITY.hard;

// ---- named pity (per boss)
export const namedMiss = (f: Flags, bossId: string): number => num(f, `loot.namedMiss.${bossId}`);
/** min(cap, p0 x finalBonus + step x misses); 1 from `hard` misses on. */
export function namedChance(p0: number, miss: number, final = false): number {
  if (miss >= NAMED_PITY.hard) return 1;
  const base = Math.min(NAMED_PITY.cap, final ? p0 * CHEST_FINAL.named : p0);
  return Math.min(NAMED_PITY.cap, base + NAMED_PITY.step * miss);
}
export function noteNamed(f: Flags, bossId: string, hit: boolean): void {
  const k = `loot.namedMiss.${bossId}`;
  if (hit) delete f[k];
  else f[k] = namedMiss(f, bossId) + 1;
}
export const markSeen = (f: Flags, uniqueId: string): void => {
  f[`loot.seen.${uniqueId}`] = 1;
};
export const isSeen = (f: Flags, uniqueId: string): boolean => f[`loot.seen.${uniqueId}`] === 1;

// ---- elite bad-luck guard (§7)
export const eliteGuardDue = (f: Flags): boolean => num(f, 'loot.eliteSinceRare') >= PITY.eliteGuard;
export function noteEliteItem(f: Flags, rareOrBetter: boolean): void {
  f['loot.eliteSinceRare'] = rareOrBetter ? 0 : num(f, 'loot.eliteSinceRare') + 1;
}

// ---- smart anti-streak (§4.2)
/** True when the next guaranteed item must be smart (2 non-smart in a row). */
export const smartForced = (f: Flags): boolean => num(f, 'loot.offSmart') >= SMART_STREAK;
export function noteSmart(f: Flags, smart: boolean): void {
  f['loot.offSmart'] = smart ? 0 : num(f, 'loot.offSmart') + 1;
}
