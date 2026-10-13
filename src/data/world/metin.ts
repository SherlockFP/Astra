import type { MetinSpotDef, MetinTierDef } from '../../types/dungeons';
import { LAYOUT } from './layout';

/**
 * Metin stones (GDD_OPENWORLD §4): six tiers, one per region, and their 24 spots. OWNER: content module.
 * HP / armour / level / region / ids come from the layout (`metinTiers`, `metinSpots`); the waves, periodic adds, aura and pulse
 * rules are GDD §4.2-4.4 and are authored here. The stone itself is the enemy def `metin_<tier>` (WP3), loot table `loot_metin_tN`
 * (WP4).
 */

type Group = [enemyId: string, count: number];

/** GDD §4.3: wave mobs for the thresholds 85 / 65 / 45 / 25 / 10 % HP, per tier (index 0 = keder ... 5 = olum). */
const WAVES: Group[][][] = [
  [[['ow_wolf', 6]], [['ow_goblin', 4], ['ow_goblin_shaman', 1]], [['ow_rat', 8]], [['ow_boar', 4], ['ow_puglin_chief', 1]], [['ow_mushnub', 10]]],
  [[['ow_bandit', 6]], [['ow_scarecrow', 4], ['ow_bandit_archer', 2]], [['ow_bat', 8]], [['ow_bear', 1], ['ow_boar', 4]], [['ow_wasp', 10]]],
  [[['ow_bandit', 6]], [['ow_puglin', 4], ['ow_bandit_archer', 2]], [['ow_wasp', 8]], [['ow_warg', 1], ['ow_wolf', 4]], [['ow_bandit_brute', 1], ['ow_bandit', 6]]],
  [[['ow_ghoul', 6]], [['ow_wraith', 4], ['ow_ooze', 2]], [['ow_will', 8]], [['ow_spider_giant', 1], ['ow_centipede', 4]], [['ow_wasp_swamp', 10]]],
  [[['ow_orc', 6]], [['ow_orc_archer', 4], ['ow_orc_shaman', 2]], [['ow_imp', 8]], [['ow_orc_brute', 1], ['ow_orc', 4]], [['ow_ember', 2], ['ow_imp', 6]]],
  [[['skel_minion', 6]], [['cult_acolyte', 4], ['skel_archer', 2]], [['shade', 8]], [['ow_grave_knight', 1], ['skel_minion', 4]], [['ow_vampire', 1], ['ow_bat', 8]]],
];

/** GDD §4.3 periodic add (every 20 s while engaged, 2 per tick, cap 12 alive from the stone). */
const ADD_ENEMY = ['ow_rat', 'ow_bat', 'ow_wasp', 'ow_will', 'ow_imp', 'shade'];

const WAVE_THRESHOLDS = [0.85, 0.65, 0.45, 0.25, 0.1];

/** GDD §4.4: respawn 6 min (tiers 1-2), 8 min (3-4), 10 min (5-6). */
const RESPAWN_MIN: [number, number][] = [[6, 6], [6, 6], [8, 8], [8, 8], [10, 10], [10, 10]];

export const METIN_TIERS: MetinTierDef[] = LAYOUT.metinTiers.map((t, i) => {
  const tier = i + 1;
  const add = ADD_ENEMY[i];
  return {
    id: t.id,
    enemyId: t.id,
    level: t.level,
    regionId: t.region,
    maxActive: 2,
    respawnMin: RESPAWN_MIN[i],
    idleDespawnMin: 25,
    waves: WAVES[i].map((members, w) => ({
      hpBelow: WAVE_THRESHOLDS[w],
      members: members.map(([enemyId, count]) => ({ enemyId, count })),
    })),
    add: { enemyId: add, count: 2, everySec: 20, cap: 12 },
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
