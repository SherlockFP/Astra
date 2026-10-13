import type { Rarity } from '../types/common';
import type { ItemCategory } from '../types/items';

/**
 * Loot tuning tables (GDD_SYSTEMS section 7). OWNER: items module.
 * Numbers here are data; the logic lives in systems/LootSystem.ts.
 */
export type RankKey = 'swarm' | 'trash' | 'elite' | 'miniboss' | 'boss';

export interface DropTable {
  /** Chance that the first item roll happens (1 = guaranteed). */
  itemChance: number;
  /** Number of guaranteed item rolls. */
  itemRolls: number;
  /** Extra rolls, each with its own chance. */
  extraRolls: number[];
  /** Minimum rarity of the FIRST `minRarityCount` items. */
  minRarity?: Rarity;
  minRarityCount?: number;
  goldChance: number;
  goldMult: number;
  potionChance: number;
  globeChance: number;
  globeCount: [number, number];
  gemChance: number;
  /** Material drops: id -> chance. */
  materials: { id: string; chance: number; minLevel?: number }[];
}

export const DROP_TABLES: Record<RankKey, DropTable> = {
  swarm: {
    itemChance: 0.03, itemRolls: 1, extraRolls: [], goldChance: 0.15, goldMult: 0.5, potionChance: 0.01, globeChance: 0.03, globeCount: [1, 1], gemChance: 0.002,
    materials: [{ id: 'kara_demir', chance: 0.005 }],
  },
  trash: {
    itemChance: 0.08, itemRolls: 1, extraRolls: [], goldChance: 0.3, goldMult: 1, potionChance: 0.03, globeChance: 0.08, globeCount: [1, 1], gemChance: 0.005,
    materials: [{ id: 'kara_demir', chance: 0.015 }],
  },
  elite: {
    itemChance: 1, itemRolls: 1, extraRolls: [0.4], minRarity: 'uncommon', minRarityCount: 1, goldChance: 1, goldMult: 6, potionChance: 0.25, globeChance: 1, globeCount: [1, 2], gemChance: 0.05,
    materials: [{ id: 'ejderha_pulu', chance: 0.03 }, { id: 'takviye_nesnesi', chance: 0.01 }],
  },
  miniboss: {
    itemChance: 1, itemRolls: 2, extraRolls: [0.5], minRarity: 'rare', minRarityCount: 1, goldChance: 1, goldMult: 25, potionChance: 1, globeChance: 1, globeCount: [2, 2], gemChance: 0.2,
    materials: [{ id: 'ejderha_pulu', chance: 0.15 }],
  },
  boss: {
    itemChance: 1, itemRolls: 4, extraRolls: [0.5, 0.25], minRarity: 'rare', minRarityCount: 2, goldChance: 1, goldMult: 60, potionChance: 1, globeChance: 1, globeCount: [3, 3], gemChance: 0.5,
    materials: [
      { id: 'ejderha_pulu', chance: 0.4 }, { id: 'takviye_nesnesi', chance: 0.1 }, { id: 'demirci_el_kitabi', chance: 0.02 },
      { id: 'kadim_efsun', chance: 0.05, minLevel: 50 }, { id: 'oyma_kalemi', chance: 0.05 },
    ],
  },
};

/** Base rarity weights and rank multipliers (7.2). `minIlvl`: availability. */
export const RARITY_WEIGHTS: Record<Rarity, { base: number; elite: number; boss: number; minIlvl: number }> = {
  poor: { base: 300, elite: 0, boss: 0, minIlvl: 1 },
  common: { base: 400, elite: 0, boss: 0, minIlvl: 1 },
  uncommon: { base: 230, elite: 1, boss: 1, minIlvl: 1 },
  rare: { base: 60, elite: 1.5, boss: 3, minIlvl: 1 },
  epic: { base: 8, elite: 2, boss: 4, minIlvl: 10 },
  legendary: { base: 1.0, elite: 2, boss: 4, minIlvl: 20 },
  set: { base: 0.8, elite: 0, boss: 4, minIlvl: 40 },
};

/** Monster level -> item level offset by rank (4.3). */
export const RANK_ILVL_BONUS: Record<RankKey, number> = { swarm: 0, trash: 0, elite: 1, miniboss: 2, boss: 3 };
/** Rank multiplier for gold (matches dropTable.goldMult) and the Mythic+ rules (7.4). */
export const MPLUS = {
  ilvlBase: 60, ilvlCap: 75, bossBonus: 2, bossCap: 77,
  chestIlvl: (key: number) => Math.min(90, 60 + 2 * Math.min(key, 15)),
  vaultIlvl: (key: number) => Math.min(93, 63 + 2 * Math.min(key, 15)),
  eliteItemChance: 0.3,
};

/** Legendary pity per boss kill without a legendary (+25% of the base weight, cap x5). */
export const PITY_STEP = 0.25;
export const PITY_CAP = 5;

export const LOOT = {
  /** Anti-leech distance (units). */
  maxDistance: 60,
  goldMagnet: 4,
  goldPickup: 1.2,
  itemMagnet: 0,         // equipment is never magnetised
  pouchMagnet: 3,
  pouchPickup: 1.4,
  interactRange: 2.5,
  globeMagnet: 2,
  globeLife: 30,
  dropLife: 300,         // unpicked drops expire after 5 minutes
  globeHealPct: 0.15,
  globeAllyRadius: 8,
};

/** Named loot tables (EnemyDef.lootTable). Unknown ids fall back to the rank table; `focus` biases 50% of the equipment rolls. */
export interface LootTableDef {
  focus?: ItemCategory[];
  /** Chance that an epic+ roll from this table is a class set piece (default 0.10). */
  setChance?: number;
  /** Legendary uniques that can drop from this table (otherwise any eligible). */
  uniqueIds?: string[];
  /** Additional guaranteed rarity floor. */
  minRarity?: Rarity;
  extraItems?: number;
  /** Replaces the rank's item count with a random count in [min, max] (open world / normal dungeons). */
  items?: [number, number];
  /** Gold multiplier override (x goldAvg) and number of coin piles. */
  goldMult?: number;
  piles?: number;
  /** In Mythic+ the table still drops one item per player (Hazine Goblini). */
  mplusItem?: boolean;
  // ---- open world additions (GDD_OPENWORLD 3.5-3.8, 4.5) ----
  /** Rank table the named table is built on (default: the killed member's rank). Metin/mini-boss tables use 'elite'/'miniboss'. */
  base?: RankKey;
  /** Overrides of the base rank table for this named table. */
  potionChance?: number;
  gemChance?: number;
  globeChance?: number;
  globeCount?: [number, number];
  /** Multiplies the base chance of a material of the rank table (farm spots: "%0.5 -> %2.5" = 5). */
  matMult?: Record<string, number>;
  /** Extra independent rolls per killed member. Ids: material ids, `gem_<type>_<grade>` or `gem_random_<grade>` (random gem type). */
  bonus?: { id: string; chance: number; count?: [number, number]; rank?: 'trash' | 'elite' }[];
  /** Multiplies the rank table's item chance (chance-based item counts only). */
  itemChanceMult?: number;
  /** Multiplies the legendary weight of this table's equipment rolls. */
  legendaryMult?: number;
  /** With `uniqueIds`: chance per killed member of one extra unique from the list (uniqueChance default 0.15). */
  uniqueChance?: number;
  /** Number of the first items that obey minRarity (default 1; 99 = all items). */
  minRarityCount?: number;
}

/** Gather node tables (GDD_OPENWORLD 5.5): rolled once per node harvest via LootSystem.rollGather(). */
export interface GatherTableDef {
  entries: { id: string; chance: number; count: [number, number] }[];
}
export const LOOT_TABLES: Record<string, LootTableDef> = {
  loot_d1_b1: { focus: ['sword1h', 'shield', 'helm', 'shoulders'], setChance: 0.15 },
  loot_d1_b2: { focus: ['staff', 'wand', 'amulet', 'chest', 'gloves'], setChance: 0.15 },
  loot_d1_b3: { focus: ['chest', 'legs', 'amulet'], setChance: 0.2, extraItems: 1 },
  loot_d2_b1: { focus: ['axe2h', 'gloves', 'belt'], setChance: 0.15 },
  loot_d2_b2: { focus: ['ring', 'amulet', 'boots'], setChance: 0.15 },
  loot_d2_b3: { focus: ['chest', 'helm', 'ring', 'sword1h', 'axe2h', 'dagger', 'staff'], setChance: 0.2, extraItems: 1 },
  loot_d3_b1: { focus: ['axe2h', 'boots', 'chest', 'legs'], setChance: 0.15 },
  loot_d3_b2: { focus: ['staff', 'wand', 'tome', 'gloves', 'shoulders'], setChance: 0.15 },
  loot_d3_b3: { focus: ['chest', 'helm', 'sword1h', 'axe2h'], setChance: 0.2, extraItems: 1 },
  loot_d4_b1: { focus: ['dagger', 'chest', 'gloves', 'boots'], setChance: 0.15 },
  loot_d4_b2: { focus: ['ring', 'amulet', 'belt', 'shoulders', 'legs'], setChance: 0.15 },
  loot_d4_b3: { focus: ['chest', 'helm', 'sword1h', 'axe2h', 'dagger', 'staff', 'wand'], setChance: 0.25, extraItems: 1 },
};
/** Hazine Goblini (GDD_CONTENT 1.6): 4-8 items (1 Nadir+) + 20 x goldAvg; in M+ gold, materials, globes and one item. */
LOOT_TABLES.treasure_goblin = { items: [4, 8], minRarity: 'rare', goldMult: 20, piles: 12, mplusItem: true, extraItems: 0 };

// ============================================================================ open world tables (GDD_OPENWORLD 3.5-3.8, 3.7, 4.5, 5.5)
// Ids are the ones the content layout uses (PackDef.lootTable, MetinTierDef.lootTable, RareSpawnDef.lootTable, ...).
// Gem ids: gem_<type>_<grade>; grade 1 = Kirik, 2 = Kusurlu, 3 = plain, 4 = Kusursuz. `gem_random_<grade>` = random type.

/** Farm spots (GDD 3.7): a camp with a named table biases what drops; the rank table still applies. */
export const FARM_TABLES: Record<string, LootTableDef> = {
  /** fs01 Fare Yuvasi: first hour's Kara Demir source. */
  farm_rat_nest: { matMult: { kara_demir: 5 }, goldMult: 2 },
  /** fs02 Yagmaci Kampi: first ring/amulet/belt and gold. Leader (elite) also brings Metin Kalintisi. */
  farm_goblin_camp: { focus: ['ring', 'amulet', 'belt'], goldMult: 3, minRarity: 'uncommon', minRarityCount: 1,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [2, 2], rank: 'elite' }] },
  /** fs03 Orumcek Korusu: first gem socket. */
  farm_spider_grove: { bonus: [{ id: 'gem_emerald_1', chance: 0.02 }, { id: 'pot_hp_1', chance: 0.08 }] },
  /** fs04 Mantar Tarlasi: easy warm-up. */
  farm_mushroom_field: { bonus: [{ id: 'gem_emerald_1', chance: 0.03 }, { id: 'pot_res_1', chance: 0.06 }, { id: 'buyulu_toz', chance: 0.04, rank: 'elite' }] },
  /** fs05 Haydut Karakolu: first efsun object and weapons. */
  farm_bandit_post: { focus: ['dagger', 'sword1h', 'gloves'], goldMult: 3,
    bonus: [{ id: 'efsun_nesnesi', chance: 0.008, rank: 'trash' }, { id: 'efsun_nesnesi', chance: 0.06, rank: 'elite' }] },
  /** fs06 Haydut Kalesi: "gold + Efsun" camp. */
  farm_bandit_fort: { focus: ['sword1h', 'dagger', 'chest', 'legs'], goldMult: 4,
    bonus: [{ id: 'efsun_nesnesi', chance: 0.015, rank: 'trash' }, { id: 'efsun_nesnesi', chance: 0.1, rank: 'elite' }, { id: 'takviye_nesnesi', chance: 0.02 }] },
  /** fs07 Gergedan Otlagi: blacksmith +4..+6 material. */
  farm_rhino_pasture: { bonus: [{ id: 'buyulu_toz', chance: 0.04, rank: 'trash' }, { id: 'buyulu_toz', chance: 0.25, count: [2, 4], rank: 'elite' }, { id: 'kara_demir', chance: 0.05 }] },
  /** fs08 Zehirli Magara: poison gems (resistance / crit sockets). */
  farm_poison_cave: { bonus: [{ id: 'gem_emerald_2', chance: 0.05, rank: 'trash' }, { id: 'gem_emerald_2', chance: 0.3, rank: 'elite' }, { id: 'gem_emerald_1', chance: 0.08 }, { id: 'trophy_zehir_ozu', chance: 0.2 }] },
  /** fs09 Cıyan Cukuru: attack speed gems (topaz). */
  farm_centipede_pit: { bonus: [{ id: 'gem_topaz_2', chance: 0.04 }, { id: 'buyulu_toz', chance: 0.03 }] },
  /** fs10 Batik Mezarlik: life steal gems (amethyst). */
  farm_sunken_graves: { bonus: [{ id: 'gem_amethyst_2', chance: 0.04 }, { id: 'pot_hp_2', chance: 0.06 }] },
  /** fs11 Ork Karakolu: heavy armour and axes, early dragon scale. */
  farm_orc_outpost: { focus: ['axe2h', 'helm', 'shoulders', 'chest', 'boots'],
    bonus: [{ id: 'ejderha_pulu', chance: 0.03, rank: 'elite' }, { id: 'buyulu_toz', chance: 0.03 }] },
  /** fs12 Kor Ocagi Girisi: fire gems. */
  farm_ember_vent: { bonus: [{ id: 'gem_ruby_2', chance: 0.05, rank: 'trash' }, { id: 'gem_ruby_2', chance: 0.3, rank: 'elite' }, { id: 'ejderha_pulu', chance: 0.02 }] },
  /** fs13 Tas Ocagi: upgrade material camp (+4..+9). */
  farm_stone_quarry: { matMult: { kara_demir: 12 },
    bonus: [{ id: 'buyulu_toz', chance: 0.06, rank: 'trash' }, { id: 'buyulu_toz', chance: 0.35, count: [2, 5], rank: 'elite' }, { id: 'ejderha_pulu', chance: 0.06, rank: 'elite' }] },
  /** fs14 Lanetli Avlu: crafting (takviye / efsun / kutsama). */
  farm_cursed_court: { bonus: [{ id: 'takviye_nesnesi', chance: 0.04 }, { id: 'efsun_nesnesi', chance: 0.012 }, { id: 'kutsama_kagidi', chance: 0.003 }] },
  /** fs15 Eski Kutuphane: caster gear, sockets and skill books. */
  farm_old_library: { focus: ['staff', 'wand', 'tome', 'amulet'], bonus: [{ id: 'oyma_kalemi', chance: 0.015 }, { id: 'beceri_kitabi_2', chance: 0.03 }] },
  /** fs16 Kan Lordu Salonu: world-end camp, legendary weight x2 and top gems. */
  farm_blood_hall: { legendaryMult: 2, bonus: [{ id: 'gem_amethyst_4', chance: 0.06 }, { id: 'gem_diamond_2', chance: 0.04 }] },
};

/** Metin stone tables (GDD 4.5): built on the elite rank table; item level = tier level + 2 (miniboss-like offset). */
const METIN_BASE: LootTableDef = { base: 'elite', potionChance: 0.3, globeChance: 1, globeCount: [2, 2] };
export const METIN_TABLES: Record<string, LootTableDef> = {
  loot_metin_t1: { ...METIN_BASE, items: [2, 3], minRarity: 'uncommon', minRarityCount: 99, goldMult: 12,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [5, 5] }, { id: 'kara_demir', chance: 1, count: [5, 5] }, { id: 'beceri_kitabi_1', chance: 0.25 }, { id: 'gem_random_1', chance: 0.3 }] },
  loot_metin_t2: { ...METIN_BASE, items: [2, 3], minRarity: 'uncommon', minRarityCount: 99, goldMult: 14,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 8] }, { id: 'buyulu_toz', chance: 1, count: [2, 2] }, { id: 'beceri_kitabi_1', chance: 0.3 }, { id: 'beceri_kitabi_2', chance: 0.1 }, { id: 'gem_random_1', chance: 0.35 }] },
  loot_metin_t3: { ...METIN_BASE, items: [3, 4], minRarity: 'rare', minRarityCount: 1, goldMult: 16,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 12] }, { id: 'beceri_kitabi_1', chance: 0.35 }, { id: 'beceri_kitabi_2', chance: 0.08 }, { id: 'gem_random_2', chance: 0.35 }, { id: 'efsun_nesnesi', chance: 0.03 }] },
  loot_metin_t4: { ...METIN_BASE, items: [3, 4], minRarity: 'rare', minRarityCount: 1, goldMult: 18,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [16, 16] }, { id: 'beceri_kitabi_2', chance: 0.2 }, { id: 'gem_random_2', chance: 0.4 }, { id: 'efsun_nesnesi', chance: 0.05 }, { id: 'takviye_nesnesi', chance: 0.08 }] },
  loot_metin_t5: { ...METIN_BASE, items: [3, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 20,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [22, 22] }, { id: 'beceri_kitabi_2', chance: 0.28 }, { id: 'beceri_kitabi_3', chance: 0.05 }, { id: 'gem_random_3', chance: 0.35 }, { id: 'efsun_nesnesi', chance: 0.07 }, { id: 'kutsama_kagidi', chance: 0.03 }] },
  loot_metin_t6: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 24,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [30, 30] }, { id: 'beceri_kitabi_3', chance: 0.15 }, { id: 'gem_random_3', chance: 0.4 }, { id: 'gem_random_4', chance: 0.05 }, { id: 'efsun_nesnesi', chance: 0.1 }, { id: 'kutsama_kagidi', chance: 0.06 }, { id: 'oyma_kalemi', chance: 0.05 }] },
};

/** Ara Patron (GDD 3.6): the miniboss rank table + Metin Kalintisi x(4 + level/3) + themed focus. */
const MB_KALINTI: Record<string, number> = { mb_girtlak: 5, mb_hovardan: 7, mb_karabiyik: 8, mb_zehra: 10, mb_gorak: 12, mb_valdemar: 13 };
const mbKalinti = (id: string): LootTableDef['bonus'] => [{ id: 'metin_kalintisi', chance: 1, count: [MB_KALINTI[id], MB_KALINTI[id]] }];
export const MINIBOSS_TABLES: Record<string, LootTableDef> = {
  loot_mb_r1: { base: 'miniboss', focus: ['sword1h', 'shield', 'helm', 'shoulders'], bonus: mbKalinti('mb_girtlak') },
  loot_mb_r2: { base: 'miniboss', focus: ['staff', 'wand', 'amulet', 'chest', 'gloves'], bonus: mbKalinti('mb_hovardan') },
  loot_mb_r3: { base: 'miniboss', focus: ['chest', 'legs', 'amulet', 'sword1h', 'axe2h'], bonus: mbKalinti('mb_karabiyik') },
  loot_mb_r4: { base: 'miniboss', focus: ['ring', 'amulet', 'belt', 'boots'], bonus: mbKalinti('mb_zehra') },
  loot_mb_r5: { base: 'miniboss', focus: ['axe2h', 'helm', 'shoulders', 'chest', 'boots'], bonus: mbKalinti('mb_gorak') },
  loot_mb_r6: { base: 'miniboss', focus: ['staff', 'wand', 'tome', 'helm', 'gloves'], bonus: mbKalinti('mb_valdemar') },
};

/** Named rares (GDD 3.5): Nadir x1-2 guaranteed, Metin Kalintisi, one themed bonus; four of them carry a Vadi Efsanevisi (15%). */
const RARE_BASE: LootTableDef = { base: 'elite', minRarity: 'rare', minRarityCount: 99 };
export const RARE_TABLES: Record<string, LootTableDef> = {
  loot_rare_gumus_yele: { ...RARE_BASE, minRarity: 'uncommon', items: [2, 2], uniqueIds: ['leg_vadi_gumus_pence'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [3, 3] }] },
  loot_rare_kizil_kuyruk: { ...RARE_BASE, minRarity: 'uncommon', items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [2, 2] }, { id: 'kara_demir', chance: 1, count: [8, 8] }] },
  loot_rare_korkuluk_kral: { ...RARE_BASE, items: [1, 1],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }, { id: 'buyulu_toz', chance: 1, count: [3, 3] }] },
  loot_rare_buyuk_boz: { ...RARE_BASE, items: [1, 1], uniqueIds: ['leg_vadi_boz_postu'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }] },
  loot_rare_mantar_ana: { ...RARE_BASE, items: [1, 1],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }, { id: 'gem_emerald_1', chance: 0.3 }] },
  loot_rare_golge_alfa: { ...RARE_BASE, items: [2, 2], uniqueIds: ['leg_vadi_gece_tuyu'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [6, 6] }] },
  loot_rare_demir_boynuz: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [6, 6] }, { id: 'buyulu_toz', chance: 1, count: [6, 6] }] },
  loot_rare_agit_kralicesi: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 8] }, { id: 'gem_amethyst_2', chance: 0.3 }] },
  loot_rare_zehir_ana: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 8] }, { id: 'gem_emerald_2', chance: 0.35 }] },
  loot_rare_camur_baba: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [7, 7] }, { id: 'gem_topaz_2', chance: 0.3 }] },
  loot_rare_kor_efendisi: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [10, 10] }, { id: 'gem_ruby_2', chance: 0.35 }] },
  loot_rare_tas_yurek: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [10, 10] }, { id: 'ejderha_pulu', chance: 1, count: [1, 1] }] },
  loot_rare_kizil_boynuz: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [9, 9] }, { id: 'buyulu_toz', chance: 1, count: [8, 8] }] },
  loot_rare_gece_gezgini: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 12] }, { id: 'gem_amethyst_4', chance: 0.2 }] },
  loot_rare_kemik_kral: { ...RARE_BASE, items: [2, 2], uniqueIds: ['leg_vadi_kemik_tac'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 12] }] },
  loot_rare_sessiz_rahip: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 12] }, { id: 'gem_diamond_2', chance: 0.2 }] },
};

/** World bosses (GDD 3.8): boss rank table (item level = level + 3) plus extra Metin Kalintisi. */
export const WORLD_BOSS_TABLES: Record<string, LootTableDef> = {
  loot_wb_curukkok: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 12] }] },
  loot_wb_alevkanat: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 18] }] },
};

/** Gather nodes (GDD 5.5): one harvest rolls every entry. Ore = Kara Demir / Buyulu Toz, herb = potions. */
export const GATHER_TABLES: Record<string, GatherTableDef> = {
  gather_ore_r1: { entries: [{ id: 'kara_demir', chance: 1, count: [2, 4] }] },
  gather_herb_r1: { entries: [{ id: 'pot_hp_1', chance: 1, count: [1, 1] }] },
  gather_ore_r2: { entries: [{ id: 'kara_demir', chance: 1, count: [3, 5] }] },
  gather_herb_r2: { entries: [{ id: 'pot_hp_1', chance: 1, count: [1, 2] }] },
  gather_ore_r3: { entries: [{ id: 'kara_demir', chance: 1, count: [3, 6] }, { id: 'buyulu_toz', chance: 0.2, count: [1, 1] }] },
  gather_herb_r3: { entries: [{ id: 'pot_hp_2', chance: 1, count: [1, 1] }] },
  gather_ore_r4: { entries: [{ id: 'buyulu_toz', chance: 1, count: [1, 3] }] },
  gather_herb_r4: { entries: [{ id: 'pot_hp_2', chance: 0.5, count: [1, 2] }, { id: 'pot_res_2', chance: 0.5, count: [1, 2] }] },
  gather_ore_r5: { entries: [{ id: 'buyulu_toz', chance: 1, count: [2, 4] }, { id: 'ejderha_pulu', chance: 0.05, count: [1, 1] }] },
  gather_herb_r5: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 1] }] },
  gather_ore_r6: { entries: [{ id: 'buyulu_toz', chance: 1, count: [2, 4] }, { id: 'ejderha_pulu', chance: 0.08, count: [1, 1] }] },
  gather_herb_r6: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 1] }, { id: 'pot_res_3', chance: 0.5, count: [1, 1] }] },
};

/** Every open-world table is also reachable through the shared registry (LootSystem looks named tables up there). */
Object.assign(LOOT_TABLES, FARM_TABLES, METIN_TABLES, MINIBOSS_TABLES, RARE_TABLES, WORLD_BOSS_TABLES);

export function registerLootTable(id: string, def: LootTableDef): void {
  LOOT_TABLES[id] = def;
}
