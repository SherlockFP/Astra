import type { MetinSpotDef, MetinTierDef } from '../../types/dungeons';
import { METIN_SPECS } from '../enemies';

/**
 * KARAKIR BOZKIRI metin stones (GDD_OPENWORLD section 1.8, levels 31-44). OWNER: content module.
 *
 * Same shape as metin.ts (Sisli Vadi): one stone tier per region (r7..r12, the tier level sits in the region's band) and 20 spots in all:
 * three per region in r7..r10, four in r11 and r12. The stone defs (`metin_susuzluk` ... `metin_kartal`), their wave / add / aura / pulse
 * scripts (METIN_SPECS) and the loot tables (`loot_metin_t7` ... `t12`) belong to the enemies and loot modules; this file only places them.
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
  { id: 'metin_kul', level: 41, regionId: 'r11', respawnMin: [10, 10], lootTable: 'loot_metin_t11' },
  { id: 'metin_kartal', level: 44, regionId: 'r12', respawnMin: [10, 10], lootTable: 'loot_metin_t12' },
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

/** The 20 spots: off the camps, patrol loops, roads, water, the lakes and the village safe zones. */
export const KARAKIR_METIN_SPOTS: MetinSpotDef[] = [
  { id: 'ms_r7_a', regionId: 'r7', pos: [36, 144] },
  { id: 'ms_r7_b', regionId: 'r7', pos: [84, 129] },
  { id: 'ms_r7_c', regionId: 'r7', pos: [87, 213] },
  { id: 'ms_r8_a', regionId: 'r8', pos: [129, 219] },
  { id: 'ms_r8_b', regionId: 'r8', pos: [210, 192] },
  { id: 'ms_r8_c', regionId: 'r8', pos: [153, 279] },
  { id: 'ms_r9_a', regionId: 'r9', pos: [180, 132] },
  { id: 'ms_r9_b', regionId: 'r9', pos: [156, 51] },
  { id: 'ms_r9_c', regionId: 'r9', pos: [192, 66] },
  { id: 'ms_r10_a', regionId: 'r10', pos: [264, 177] },
  { id: 'ms_r10_b', regionId: 'r10', pos: [240, 87] },
  { id: 'ms_r10_c', regionId: 'r10', pos: [270, 33] },
  { id: 'ms_r11_a', regionId: 'r11', pos: [340, 170] },
  { id: 'ms_r11_b', regionId: 'r11', pos: [366, 196] },
  { id: 'ms_r11_c', regionId: 'r11', pos: [316, 256] },
  { id: 'ms_r11_d', regionId: 'r11', pos: [358, 284] },
  { id: 'ms_r12_a', regionId: 'r12', pos: [324, 40] },
  { id: 'ms_r12_b', regionId: 'r12', pos: [360, 66] },
  { id: 'ms_r12_c', regionId: 'r12', pos: [304, 90] },
  { id: 'ms_r12_d', regionId: 'r12', pos: [372, 140] },
];
