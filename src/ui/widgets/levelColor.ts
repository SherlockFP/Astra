/**
 * Relative-level colour of a unit, as WoW shows it: grey <= -8, green -7..-3, yellow -2..0 (same level and 2 below), orange +1,
 * red +2 and above. The skull glyph (>= +10) is drawn by the caller; this helper only returns the colour.
 */
export const LEVEL_COLORS = { trivial: '#9a9a9a', easy: '#6fdc50', even: '#ffe040', hard: '#ff8030', deadly: '#ff3030' } as const;

export function levelColor(playerLevel: number, targetLevel: number): string {
  const d = targetLevel - playerLevel;
  if (d >= 2) return LEVEL_COLORS.deadly;
  if (d >= 1) return LEVEL_COLORS.hard;
  if (d >= -2) return LEVEL_COLORS.even;
  if (d >= -7) return LEVEL_COLORS.easy;
  return LEVEL_COLORS.trivial;
}

/** Skull glyph threshold: a unit ten or more levels above the player (§2.8). */
export function isSkullLevel(playerLevel: number, targetLevel: number): boolean {
  return targetLevel - playerLevel >= 10;
}
