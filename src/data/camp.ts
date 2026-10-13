/**
 * GDD_ITEMS_V2 §5.1 / §5.3: Kamp (placeable camp in the open world, P3). IT-00: the constants are the doc's numbers verbatim.
 * `CAMP_ENABLED` stays false until the camping phase (IT-50 … IT-51) ships.
 * OWNER: items (data), scenes (runtime: scenes/Camping.ts).
 */

export const CAMP_ENABLED = false;

/** §5.3 KAMP. Seconds unless stated; `placeMinDist` in metres; `restedPerMin` and `restedMax` are fractions of xpToNext. */
export const KAMP = {
  initialFuelSec: 900,         // 15 min on placing
  woodSec: 300,                // each Kamp Odunu adds 5 min
  maxFuelSec: 1800,            // cap 30 min
  radius: 8,                   // Kamp Alanı, metres
  restDelaySec: 6,             // out of combat before rest regen starts
  comfortAfterSec: 60,         // cumulative rest before Kamp Konforu
  comfortSec: 1800,            // Kamp Konforu duration
  respawnFuelCostSec: 180,     // "Kampta Dirilt" costs 3 min of fuel
  placeMinDist: { waypoint: 40, village: 40, entrance: 40, metin: 40, boss: 40, camp: 15 },
  restedPerMin: 0.01,
  restedMax: 0.25,
  restedXpBonus: 1.0,          // +100 % kill XP while the pool lasts
} as const;
