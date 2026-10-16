// Low-level open-world trash scaling (levels 1-10). Applies ONLY to open-world trash / swarm spawns (CampDirector camps, flagged
// `openWorld` on the spawn and on the net payload). Global monsterHP / monsterDmg (dungeons, guardians, arena, PvP, siege) and every
// elite / miniboss / boss are untouched. Same-level solo fights take a WoW-like 5-11 s with the player ending at 50-98 % HP.
//
// Multipliers are 1 from L20 up, so there is no step at the band edge: L1-10 at the low value, linear taper L10 -> L20.

/** Trash HP end points: x12 at L1, falling to LOW_LEVEL_HP_L10 at L10. */
const LOW_LEVEL_HP_L1 = 12;
export const LOW_LEVEL_HP_L10 = 4;
/** Trash HP x monsterHP. */
export const lowLevelHpMult = (L: number): number => {
  if (L <= 10) return LOW_LEVEL_HP_L1 + ((LOW_LEVEL_HP_L10 - LOW_LEVEL_HP_L1) * (Math.max(1, L) - 1)) / 9;
  if (L >= 20) return 1;
  return LOW_LEVEL_HP_L10 - ((LOW_LEVEL_HP_L10 - 1) * (L - 10)) / 10;
};

/** Trash damage x monsterDmg on L1-10 (tapers to x1 at L20). */
export const LOW_LEVEL_DMG_MULT = 1.1;
export const lowLevelDmgMult = (L: number): number => {
  if (L <= 10) return LOW_LEVEL_DMG_MULT; // the new-player damage cut is on the player side (Combat.newPlayerDr), not here
  if (L >= 20) return 1;
  return LOW_LEVEL_DMG_MULT + ((1 - LOW_LEVEL_DMG_MULT) * (L - 10)) / 10;
};

/** Kill XP x for open-world trash / swarm kills: the fight is longer, so the kill pays for the time (XP per minute ~ the same). */
export const lowLevelKillXpMult = (L: number): number => {
  if (L <= 10) return 2.25;
  if (L >= 20) return 1;
  return 2.25 - (1.25 * (L - 10)) / 10;
};

/** Open-world trash and swarm (the mobs the low-level curve applies to). */
export const isLowLevelTrashRank = (rank: string, role: string | undefined): boolean => rank === 'trash' || role === 'swarm';

// ---- New-player ease (WoW-style modern start, owner playtest 2026-10-16: "the start is too hard") ----------------------------------
// One curve for every easing knob of levels 1-9: 1 at L1, linear to 0 at L10, 0 from L10 up. Each knob multiplies its L10+ value by
// (1 - cut * ease), so L10 and above are untouched (no step at the band edge). Read by EnemyFactory (trash aggro radius), EnemyAI
// (camp leash), EnemyDirector (pull cap, social pulls), Combat (out-of-combat regen; the damage cut is Combat.newPlayerDr, its table
// runs to L9), Progression / the death panel (Burada Diril price and wait), scenes/respawn (release HP) and CharacterState (potions).

export const NEW_PLAYER_END_LEVEL = 10;

/** 1 at L1, 0 from L10 (linear). */
export const newPlayerEase = (L: number): number => Math.min(1, Math.max(0, (NEW_PLAYER_END_LEVEL - Math.max(1, L)) / (NEW_PLAYER_END_LEVEL - 1)));

/** Aggro radius of open-world trash: x(1 - cut) at L1 (a mob sees you from 65 % of its normal range). */
export const NEW_PLAYER_AGGRO_CUT = 0.35;
/** Camp leash pad (EnemyAI.CAMP_LEASH_PAD_M): x(1 - cut) at L1, so a camp member gives up the chase and evades home sooner. */
export const NEW_PLAYER_LEASH_CUT = 0.5;
/** Out-of-combat regen: the 4 %/s bonus is x(1 + extra) at L1 (8 %/s); the out-of-combat delay drops by `delayCut` seconds. */
export const NEW_PLAYER_OOC_HP_EXTRA = 1.0;
export const NEW_PLAYER_OOC_RES_EXTRA = 0.5;
export const NEW_PLAYER_OOC_DELAY_CUT = 2;
/** Burada Diril wait (s) below L10 (the death panel's REVIVE_HERE_DELAY is 5 s); its price is free below L10 (Progression.reviveHereCost). */
export const NEW_PLAYER_REVIVE_HERE_DELAY = 2;
/** Release HP (corpse run): +25 % at L1 over the 50 % of L10+. */
export const NEW_PLAYER_RELEASE_HP_CUT = 0.25;

/** Aggro radius multiplier of open-world trash. */
export const newPlayerAggroMult = (L: number): number => 1 - NEW_PLAYER_AGGRO_CUT * newPlayerEase(L);
/** Camp leash pad multiplier. */
export const newPlayerLeashMult = (L: number): number => 1 - NEW_PLAYER_LEASH_CUT * newPlayerEase(L);
/** Out-of-combat HP regen multiplier on the base 4 %/s. */
export const newPlayerOocHpMult = (L: number): number => 1 + NEW_PLAYER_OOC_HP_EXTRA * newPlayerEase(L);
/** Out-of-combat resource regen multiplier. */
export const newPlayerOocResMult = (L: number): number => 1 + NEW_PLAYER_OOC_RES_EXTRA * newPlayerEase(L);
/** Seconds out of combat before the out-of-combat regen starts (5 s at L10+). */
export const newPlayerOocDelay = (L: number, base: number): number => base - NEW_PLAYER_OOC_DELAY_CUT * newPlayerEase(L);
/** HP fraction a released (dead) player comes back with: 50 % at L10+, 75 % at L1. */
export const newPlayerReleaseHp = (L: number, base = 0.5): number => base + NEW_PLAYER_RELEASE_HP_CUT * newPlayerEase(L);

/** Open-world trash def with its aggro radius eased for a new player (the shared registry def is never changed). */
export function newPlayerAggroDef<T extends { aggroRange: number }>(def: T, L: number): T {
  if (!(def.aggroRange > 0) || newPlayerEase(L) <= 0) return def;
  return { ...def, aggroRange: Math.round(def.aggroRange * newPlayerAggroMult(L) * 10) / 10 };
}
