import { VIGNETTE_RULES, type VignetteDef } from '../../data/world/vignettes';

/**
 * Pure rules of the travel vignettes (data/world/vignettes.ts): the ring's level band, the eligible defs, the weighted pick, where a
 * vignette may stand (road and POI sites outside camps, villages, quest spots and escort routes) and the anchor candidates of a
 * passing player. No three.js and no game services, so scenes/world/Vignettes.ts and dev/combat-sim/vignettes.mjs share them.
 * OWNER: scenes module.
 */

export interface Pt { x: number; z: number }
/** A no-go disc (camp, village, quest spot, escort route point...), metres. */
export interface Disc extends Pt { r: number }

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The player's level clamped into a ring band (enemies and rewards scale to it). */
export function ringLevel(band: readonly [number, number], playerLevel: number): number {
  const lo = Math.max(1, Math.round(band[0]));
  const hi = Math.max(lo, Math.round(band[1]));
  const lv = Math.round(playerLevel);
  if (!(lv >= 1)) return lo;
  return Math.min(hi, Math.max(lo, lv));
}

/** A player may take the ring's vignettes up to its top level plus the over-level margin (a level 30 player gets none of the L1-5 ring). */
export function levelEligible(band: readonly [number, number], playerLevel: number): boolean {
  return playerLevel >= 1 && playerLevel <= band[1] + VIGNETTE_RULES.maxOverLevel;
}

/** Defs on `regionId` the player may take now (`free(defId)` is true when that def's cooldown for this player has run out). */
export function eligibleDefs(defs: readonly VignetteDef[], regionId: string, band: readonly [number, number], playerLevel: number, free: (defId: string) => boolean): VignetteDef[] {
  if (!levelEligible(band, playerLevel)) return [];
  return defs.filter((d) => d.regionId === regionId && free(d.id));
}

/** Weighted pick; `rnd` returns a value in [0, 1). Null when nothing can be picked. */
export function pickWeighted<T extends { weight: number }>(list: readonly T[], rnd: () => number): T | null {
  const total = list.reduce((s, d) => s + Math.max(0, d.weight), 0);
  if (!list.length || !(total > 0)) return null;
  let r = rnd() * total;
  for (const d of list) {
    r -= Math.max(0, d.weight);
    if (r < 0) return d;
  }
  return list[list.length - 1];
}

/** True when `p` lies inside the disc. */
export function inDisc(p: Pt, disc: Disc): boolean {
  return dist(p, disc) < disc.r;
}

/** The sites no exclusion disc covers. */
export function freeSites<T extends Pt>(sites: readonly T[], exclusions: readonly Disc[]): T[] {
  return sites.filter((s) => !exclusions.some((d) => inDisc(s, d)));
}

/**
 * Anchors a passing player may get: free sites between anchorMinM and anchorMaxM from the player, and not within spacingM of an
 * active vignette's anchor (at most one vignette per 200 m).
 */
export function anchorCandidates<T extends Pt>(sites: readonly T[], player: Pt, active: readonly Pt[]): T[] {
  const { anchorMinM, anchorMaxM, spacingM } = VIGNETTE_RULES;
  return sites.filter((s) => {
    const d = dist(s, player);
    return d >= anchorMinM && d <= anchorMaxM && !active.some((a) => dist(a, s) < spacingM);
  });
}

/** Distance (m) from `p` to the nearest point of `pts`; Infinity for an empty list. */
export function nearestDist(pts: readonly Pt[], p: Pt): number {
  let best = Infinity;
  for (const q of pts) {
    const d = dist(q, p);
    if (d < best) best = d;
  }
  return best;
}
