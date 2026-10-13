import type { MetinSpotDef, MetinTierDef } from '../../types/dungeons';
import { METIN_SPECS } from '../enemies';

/**
 * KARAKIR BOZKIRI metin stones (GDD_OPENWORLD section 1.8, levels 31-39). OWNER: content module.
 *
 * Same shape as metin.ts (Sisli Vadi): one stone tier per region (r7..r10, the tier level sits in the region's band) and three spots
 * per region, 12 in all. The stone defs (`metin_susuzluk` ... `metin_ayaz`), their wave / add / aura / pulse scripts (METIN_SPECS) and
 * the loot tables (`loot_metin_t7` ... `t10`) belong to the enemies and loot modules; this file only places them on the map.
 * Tier ids are the stone enemy ids, as in Sisli Vadi.
 */

interface TierPlacement {
  id: string;
  level: number;
  regionId: string;
  respawnMin: [number, number];
  lootTable: string;
}

const TIERS: TierPlacement[] = [
  { id: 'metin_susuzluk', level: 31, regionId: 'r7', respawnMin: [8, 8], lootTable: 'loot_metin_t7' },
  { id: 'metin_kavrulma', level: 34, regionId: 'r8', respawnMin: [8, 8], lootTable: 'loot_metin_t8' },
  { id: 'metin_firtina', level: 37, regionId: 'r9', respawnMin: [10, 10], lootTable: 'loot_metin_t9' },
  { id: 'metin_ayaz', level: 39, regionId: 'r10', respawnMin: [10, 10], lootTable: 'loot_metin_t10' },
];

/** Tier defs: the script (waves, add, aura, pulse) is read from METIN_SPECS, the single source of the stone's behaviour. */
export const KARAKIR_METIN_TIERS: MetinTierDef[] = TIERS.map((t) => {
  const s = METIN_SPECS[t.id];
  return {
    id: t.id,
    enemyId: t.id,
    level: t.level,
    regionId: t.regionId,
    maxActive: 2,
    respawnMin: t.respawnMin,
    idleDespawnMin: 25,
    waves: s.waves,
    add: s.add,
    aura: s.aura,
    ...(s.pulse ? { pulse: s.pulse } : {}),
    lootTable: t.lootTable,
  };
});

/** The 12 spots: three per region, off the camps, patrol loops, roads, water and the village safe zones. */
export const KARAKIR_METIN_SPOTS: MetinSpotDef[] = [
  { id: 'ms_r7_a', regionId: 'r7', pos: [24, 96] },
  { id: 'ms_r7_b', regionId: 'r7', pos: [56, 86] },
  { id: 'ms_r7_c', regionId: 'r7', pos: [58, 142] },
  { id: 'ms_r8_a', regionId: 'r8', pos: [86, 146] },
  { id: 'ms_r8_b', regionId: 'r8', pos: [140, 128] },
  { id: 'ms_r8_c', regionId: 'r8', pos: [102, 186] },
  { id: 'ms_r9_a', regionId: 'r9', pos: [120, 88] },
  { id: 'ms_r9_b', regionId: 'r9', pos: [104, 34] },
  { id: 'ms_r9_c', regionId: 'r9', pos: [128, 44] },
  { id: 'ms_r10_a', regionId: 'r10', pos: [176, 118] },
  { id: 'ms_r10_b', regionId: 'r10', pos: [160, 58] },
  { id: 'ms_r10_c', regionId: 'r10', pos: [180, 22] },
];
