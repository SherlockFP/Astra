import type { MetinSpotDef, MetinTierDef } from '../../types/dungeons';
import { METIN_SPECS } from '../enemies';

/**
 * AYAZ DAĞLARI metin stones (levels 45-60, regions r16..r21). OWNER: content module.
 *
 * Same shape as karakir_metin.ts: one stone tier per region (tier n = region r15+n, so t1 sits in r16 ... t6 in r21) and four spots
 * per region, 24 in all. The stone defs (`ad_metin_t1` ... `ad_metin_t6`), their wave / add / aura / pulse scripts (METIN_SPECS in
 * data/enemies.ts, from enemies_ayaz.ts) and the loot tables (`loot_metin_ad_t1` ... `t6`) belong to the enemies and loot modules;
 * this file only places them. Tier id = the stone's enemy id.
 *
 * Spots are tile coordinates inside the region rect (r16 x14..124 z120..280, r17 x124..250 z250..380, r18 x124..250 z40..200,
 * r19 x250..380 z20..150, r20 x250..380 z150..300, r21 x250..385 z300..385), kept clear of the three outposts (about 10 tiles).
 */

interface TierPlacement {
  id: string;
  level: number;
  regionId: string;
  respawnMin: [number, number];
  lootTable: string;
}

const TIERS: TierPlacement[] = [
  { id: 'ad_metin_t1', level: 46, regionId: 'r16', respawnMin: [10, 10], lootTable: 'loot_metin_ad_t1' },
  { id: 'ad_metin_t2', level: 49, regionId: 'r17', respawnMin: [10, 10], lootTable: 'loot_metin_ad_t2' },
  { id: 'ad_metin_t3', level: 52, regionId: 'r18', respawnMin: [10, 10], lootTable: 'loot_metin_ad_t3' },
  { id: 'ad_metin_t4', level: 55, regionId: 'r19', respawnMin: [12, 12], lootTable: 'loot_metin_ad_t4' },
  { id: 'ad_metin_t5', level: 58, regionId: 'r20', respawnMin: [12, 12], lootTable: 'loot_metin_ad_t5' },
  { id: 'ad_metin_t6', level: 60, regionId: 'r21', respawnMin: [12, 12], lootTable: 'loot_metin_ad_t6' },
];

/** Tier defs: the script (waves, add, aura, pulse) is read from METIN_SPECS, the single source of the stone's behaviour. */
export const AYAZ_METIN_TIERS: MetinTierDef[] = TIERS.map((t) => {
  const s = METIN_SPECS[t.id];
  if (!s) throw new Error(`ayaz_metin: METIN_SPECS has no entry for ${t.id} (enemies_ayaz.ts)`);
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

/** The 24 spots: off the camps, patrol loops, roads, lakes and the outpost safe zones. */
export const AYAZ_METIN_SPOTS: MetinSpotDef[] = [
  { id: 'ms_ad_r16_a', regionId: 'r16', pos: [60, 150] },
  { id: 'ms_ad_r16_b', regionId: 'r16', pos: [100, 190] },
  { id: 'ms_ad_r16_c', regionId: 'r16', pos: [50, 250] },
  { id: 'ms_ad_r16_d', regionId: 'r16', pos: [110, 262] },
  { id: 'ms_ad_r17_a', regionId: 'r17', pos: [150, 282] },
  { id: 'ms_ad_r17_b', regionId: 'r17', pos: [200, 300] },
  { id: 'ms_ad_r17_c', regionId: 'r17', pos: [170, 352] },
  { id: 'ms_ad_r17_d', regionId: 'r17', pos: [236, 362] },
  { id: 'ms_ad_r18_a', regionId: 'r18', pos: [150, 70] },
  { id: 'ms_ad_r18_b', regionId: 'r18', pos: [232, 60] },
  { id: 'ms_ad_r18_c', regionId: 'r18', pos: [140, 166] },
  { id: 'ms_ad_r18_d', regionId: 'r18', pos: [234, 152] },
  { id: 'ms_ad_r19_a', regionId: 'r19', pos: [276, 40] },
  { id: 'ms_ad_r19_b', regionId: 'r19', pos: [340, 52] },
  { id: 'ms_ad_r19_c', regionId: 'r19', pos: [300, 122] },
  { id: 'ms_ad_r19_d', regionId: 'r19', pos: [360, 132] },
  { id: 'ms_ad_r20_a', regionId: 'r20', pos: [270, 180] },
  { id: 'ms_ad_r20_b', regionId: 'r20', pos: [355, 176] },
  { id: 'ms_ad_r20_c', regionId: 'r20', pos: [275, 276] },
  { id: 'ms_ad_r20_d', regionId: 'r20', pos: [352, 292] },
  { id: 'ms_ad_r21_a', regionId: 'r21', pos: [280, 330] },
  { id: 'ms_ad_r21_b', regionId: 'r21', pos: [330, 360] },
  { id: 'ms_ad_r21_c', regionId: 'r21', pos: [370, 310] },
  { id: 'ms_ad_r21_d', regionId: 'r21', pos: [300, 376] },
];
