/**
 * Party-size and level scaling of instanced content (handcrafted dungeons, Kadim Yarıklar, Mitik / Kahramanlık, Mythic+).
 * Pure: no game imports, so the spawn path (EnemyFactory via MythicPlus.enemyScaling), the finder, the door and the headless
 * sims all read the same numbers. OWNER: scenes module.
 *
 * Why a level-1 solo player died (playtest): the enemy level followed the party average (1) and the HP of a solo run was the
 * lowest of all party sizes, but the damage of every size was x1 (only Mythic+ had a party damage factor), and a Normal rift
 * spawned ~80-110 bodies whatever the party size. A solo player therefore faced the full pack pressure with no reduction.
 *
 * Party size (Normal / Heroic / Mitik, not Mythic+): enemy HP = (1 + 0.6 (n - 1)) x SHAPE[n] (the old GDD §0.3 factor, so 5 players
 * are unchanged); enemy damage = DAMAGE[n]; bosses take SOLO_BOSS_DMG[n] more reduction when alone or with one ally.
 * Mythic+ never scales by party size (WoW: the key level is the difficulty).
 */

export type ScaleMode = 'normal' | 'heroic' | 'mythic' | 'mythicplus';

export type PartyCount = 1 | 2 | 3 | 4 | 5;

/**
 * Solo curve on top of the old party HP factor (5 players 1.0 = unchanged). Retuned after the solo playtest (a level-15 solo knight
 * lost 58 of 810 HP to a Normal pack): solo / duo enemies now hit harder and last longer, so one trash pack costs ~25-55 % HP.
 */
export const PARTY_HP_SHAPE: Readonly<Record<PartyCount, number>> = { 1: 0.9, 2: 0.8, 3: 0.75, 4: 0.88, 5: 1 };
/** Enemy damage by party size, non-increasing towards 5 players (5 players 1.0 = unchanged; 3 and 4 raised to keep the curve monotone). */
export const PARTY_DAMAGE: Readonly<Record<PartyCount, number>> = { 1: 1.4, 2: 1.2, 3: 1.0, 4: 1.0, 5: 1 };
/** Extra boss damage reduction when the party is alone or a pair (the solo mechanic relief; 3+ players 1.0). */
export const SOLO_BOSS_DAMAGE: Readonly<Record<PartyCount, number>> = { 1: 0.8, 2: 0.9, 3: 1, 4: 1, 5: 1 };

/** Levels below the band minimum that may still enter (the door and the finder show "Seviye X gerekli"). */
export const LEVEL_GATE_SLACK = 2;

export function clampParty(n: number): PartyCount {
  const v = Math.floor(Number(n) || 1);
  return (v < 1 ? 1 : v > 5 ? 5 : v) as PartyCount;
}

/** The GDD §0.3 party HP factor of non-Mythic+ instances (1 + 0.6 (n - 1)); the solo curve multiplies it. */
export function legacyPartyHp(n: number): number {
  return 1 + 0.6 * (clampParty(n) - 1);
}

/** HP and damage multipliers of a party of `n` in an instance of `mode`. Mythic+ returns 1 / 1 (no party-size scaling). */
export function partyScales(n: number, mode: ScaleMode): { hp: number; dmg: number; bossDmg: number } {
  if (mode === 'mythicplus') return { hp: 1, dmg: 1, bossDmg: 1 };
  const p = clampParty(n);
  return { hp: legacyPartyHp(p) * PARTY_HP_SHAPE[p], dmg: PARTY_DAMAGE[p], bossDmg: SOLO_BOSS_DAMAGE[p] };
}

/** Enemy level of a Normal run: the party average clamped to the band [lo, hi] (a band without a range is 1..60). */
export function normalEnemyLevel(band: readonly [number, number] | undefined, avgLevel: number): number {
  const lo = Math.max(1, Math.min(60, Math.round(band?.[0] ?? 1)));
  const hi = Math.max(lo, Math.min(60, Math.round(band?.[1] ?? 60)));
  const a = Math.round(Number(avgLevel) || lo);
  return Math.max(lo, Math.min(hi, a));
}

/** Minimum character level to enter a Normal instance of this band (band minimum minus the slack, never below 1). */
export function normalLevelGate(band: readonly [number, number] | undefined): number {
  return Math.max(1, Math.round(band?.[0] ?? 1) - LEVEL_GATE_SLACK);
}
