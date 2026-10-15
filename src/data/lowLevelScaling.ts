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
  if (L <= 10) return LOW_LEVEL_DMG_MULT;
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
