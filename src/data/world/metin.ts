import type { MetinSpotDef, MetinTierDef } from '../../types/dungeons';
import { LAYOUT } from './layout';
import { METIN_SPECS } from '../enemies';

/**
 * Metin stones (GDD_OPENWORLD §4): six tiers, one per region, and their 24 spots. OWNER: content module.
 * HP / armour / level / region / ids come from the layout (`metinTiers`, `metinSpots`); the waves, periodic adds, aura and pulse
 * rules are GDD §4.2-4.4 and are authored here. The stone itself is the enemy def `metin_<tier>` (WP3), loot table `loot_metin_tN`
 * (WP4).
 */

/** GDD §4.4: respawn 6 min (tiers 1-2), 8 min (3-4), 10 min (5-6). */
const RESPAWN_MIN: [number, number][] = [[6, 6], [6, 6], [8, 8], [8, 8], [10, 10], [10, 10]];

export const METIN_TIERS: MetinTierDef[] = LAYOUT.metinTiers.map((t, i) => {
  const tier = i + 1;
  const spec = METIN_SPECS[t.id];
  if (!spec) throw new Error(`no metin script for ${t.id}`);
  return {
    id: t.id,
    enemyId: t.id,
    level: t.level,
    regionId: t.region,
    maxActive: 2,
    respawnMin: RESPAWN_MIN[i],
    idleDespawnMin: 25,
    waves: spec.waves,
    add: spec.add,
    // Bozulma Aurası r 10 m: slow 15 % for all tiers, Zayıflama (curse) from tier 3, Kirlenme (1 % max HP/s) from tier 5
    aura: {
      radius: 10,
      slowPct: 15,
      ...(tier >= 3 ? { curse: true } : {}),
      ...(tier >= 5 ? { dotPctPerSec: 1 } : {}),
    },
    // Metin Nabzı from tier 3: every 12 s, expanding ring to 12 m
    ...(tier >= 3 ? { pulse: { everySec: 12, coef: 1.0, rMax: 12 } } : {}),
    lootTable: `loot_metin_t${tier}`,
  };
});

/** The 24 spots (4 per region, two stones active at a time per region). */
export const METIN_SPOTS: MetinSpotDef[] = LAYOUT.metinSpots.map((s) => ({ id: s.id, regionId: s.region, pos: s.pos }));
