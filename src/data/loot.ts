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
  // Loot V3 O-L6: elite / mini-boss weights rare 1.5 -> 2.5, epic 2 -> 3, legendary 2 -> 3
  rare: { base: 60, elite: 2.5, boss: 3, minIlvl: 1 },
  epic: { base: 8, elite: 3, boss: 4, minIlvl: 10 },
  legendary: { base: 1.0, elite: 3, boss: 4, minIlvl: 20 },
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

// ============================================================================ Loot V3 (docs/GDD_LOOT_V3.md)
/** Highest item level an item can be generated at (Loot V3 §1: raid last bosses are 99; was 95). */
export const ILVL_MAX = 100;
/** Smart loot (§4): chance that a rolled item is built for the looter's class (armour weight, weapon, main stat). */
export const SMART_LOOT = 0.7;
/** Anti-streak (§4.2): after this many consecutive non-smart guaranteed chest items the next one is smart. */
export const SMART_STREAK = 2;

/** Pity (§8): the legendary counter is a float fed by every source below; `PITY_STEP` / `PITY_CAP` above turn it into the weight multiplier. */
export const PITY = {
  cap: 60,
  /** Added to the counter per source (M+ elites 0.05). Boss: once per chest. */
  feed: { boss: 1, miniboss: 0.2, rare: 0.34, elite: 0.1, eliteMplus: 0.05 },
  /** At this value the next boss-chest generic guaranteed item is forced to legendary / set and the counter resets. */
  hard: 30,
  /** Seçkin guard: after this many consecutive elite items below Nadir the next elite item is Nadir or better. */
  eliteGuard: 4,
};
/** Named pity (§8.2): per-boss chance = min(cap, p0 + step x misses); at `hard` misses the chance is 1. */
export const NAMED_PITY = { step: 0.025, cap: 0.75, hard: 16 };

export type ChestCtxId = 'normal' | 'heroic' | 'mythic0' | 'mplus' | 'world';
export interface ChestRule {
  /** Guaranteed generic-or-named items (named replaces the first one). */
  items: number;
  /** Chance of one more item (uncommon or better). */
  second: number;
  /** Rarity weights of the guaranteed generic item (legendary is multiplied by the pity multiplier); `undefined` = the boss rank weights. */
  weights?: Partial<Record<Rarity, number>>;
  /** Base chance that the boss's named item drops (0 = no named channel). */
  named: number;
}
/** Boss chest rules (§2.2). `mplus` rows depend on the key level: use `chestRuleFor`. */
export const CHEST_RULES: Record<ChestCtxId, ChestRule> = {
  normal: { items: 2, second: 0.5, weights: { rare: 70, epic: 24, legendary: 1, set: 5 }, named: 0.1 },
  heroic: { items: 1, second: 0.35, weights: { rare: 60, epic: 33, legendary: 3, set: 4 }, named: 0.12 },
  mythic0: { items: 1, second: 0.4, weights: { rare: 45, epic: 45, legendary: 4, set: 6 }, named: 0.15 },
  mplus: { items: 1, second: 0.1, named: 0.15 },
  world: { items: 2, second: 0.25, named: 0 },
};
/** Final boss multipliers: second-item chance x2 (cap 0.75), named base x1.25 (cap NAMED_PITY.cap); M+ x1.5 second cap 0.6. */
export const CHEST_FINAL = { second: 2, secondCap: 0.75, named: 1.25 };

/** The rule of a chest for a key level (M+ rows scale with L, §2.2). */
export function chestRuleFor(ctx: ChestCtxId, keyLevel: number): ChestRule {
  if (ctx !== 'mplus') return CHEST_RULES[ctx];
  const L = Math.max(2, keyLevel);
  const epic = Math.min(70, 25 + 3 * L), legend = Math.min(6, 1.5 + 0.25 * L), set = Math.min(7, 2.5 + 0.25 * L);
  return {
    items: 1,
    second: Math.min(0.4, 0.1 + 0.015 * L),
    weights: { rare: Math.max(4, 100 - epic - legend - set), epic, legendary: legend, set },
    named: 0.15 + 0.01 * Math.min(L, 10),
  };
}

/**
 * Yiğitlik Taşı income of a boss chest (§2.2 / §9.2): stone id + count, or null. Final boss: +1 / +2 (normal, heroic, Mitik 0),
 * x1.5 in M+. Open world: none.
 */
export function chestStones(ctx: ChestCtxId, keyLevel: number, final: boolean): { id: string; count: number } | null {
  switch (ctx) {
    case 'normal': return { id: 'yt_cirak', count: 2 + (final ? 1 : 0) };
    case 'heroic': return { id: 'yt_usta', count: 3 + (final ? 2 : 0) };
    case 'mythic0': return { id: 'yt_sampiyon', count: 3 + (final ? 2 : 0) };
    case 'mplus': {
      const L = Math.max(2, keyLevel);
      const base = L >= 7 ? 2 + Math.floor(L / 3) : 3 + Math.floor(L / 2);
      return { id: L >= 7 ? 'yt_efsane' : 'yt_sampiyon', count: Math.floor(base * (final ? 1.5 : 1)) };
    }
    default: return null;
  }
}

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
  // Karakır Bozkırı stones (tiers 7-10): the Sisli curve continued
  loot_metin_t7: { ...METIN_BASE, items: [3, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 22,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [24, 24] }, { id: 'beceri_kitabi_2', chance: 0.28 }, { id: 'beceri_kitabi_3', chance: 0.05 }, { id: 'gem_random_3', chance: 0.35 }, { id: 'efsun_nesnesi', chance: 0.07 }, { id: 'kutsama_kagidi', chance: 0.03 }] },
  loot_metin_t8: { ...METIN_BASE, items: [3, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 24,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [28, 28] }, { id: 'beceri_kitabi_2', chance: 0.25 }, { id: 'beceri_kitabi_3', chance: 0.08 }, { id: 'gem_random_3', chance: 0.38 }, { id: 'gem_random_4', chance: 0.03 }, { id: 'efsun_nesnesi', chance: 0.08 }, { id: 'kutsama_kagidi', chance: 0.04 }, { id: 'oyma_kalemi', chance: 0.03 }] },
  loot_metin_t9: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 26,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [32, 32] }, { id: 'beceri_kitabi_3', chance: 0.12 }, { id: 'gem_random_3', chance: 0.4 }, { id: 'gem_random_4', chance: 0.06 }, { id: 'efsun_nesnesi', chance: 0.1 }, { id: 'kutsama_kagidi', chance: 0.05 }, { id: 'oyma_kalemi', chance: 0.05 }] },
  loot_metin_t10: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 28,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [36, 36] }, { id: 'beceri_kitabi_3', chance: 0.18 }, { id: 'gem_random_4', chance: 0.08 }, { id: 'efsun_nesnesi', chance: 0.12 }, { id: 'kutsama_kagidi', chance: 0.07 }, { id: 'oyma_kalemi', chance: 0.06 }, { id: 'takviye_nesnesi', chance: 0.08 }] },
  loot_metin_t11: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 30,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [40, 40] }, { id: 'beceri_kitabi_3', chance: 0.2 }, { id: 'gem_random_4', chance: 0.09 }, { id: 'efsun_nesnesi', chance: 0.13 }, { id: 'kutsama_kagidi', chance: 0.08 }, { id: 'oyma_kalemi', chance: 0.07 }, { id: 'takviye_nesnesi', chance: 0.09 }] },
  loot_metin_t12: { ...METIN_BASE, items: [4, 6], minRarity: 'rare', minRarityCount: 2, goldMult: 32,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [44, 44] }, { id: 'beceri_kitabi_3', chance: 0.22 }, { id: 'gem_random_4', chance: 0.1 }, { id: 'efsun_nesnesi', chance: 0.14 }, { id: 'kutsama_kagidi', chance: 0.09 }, { id: 'oyma_kalemi', chance: 0.08 }, { id: 'takviye_nesnesi', chance: 0.1 }] },
  // Ayaz Dağları stones (tiers 1-6 = r16..r21, levels 45-60): the Karakır curve continued
  loot_metin_ad_t1: { ...METIN_BASE, items: [3, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 34,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [48, 48] }, { id: 'beceri_kitabi_3', chance: 0.2 }, { id: 'gem_random_3', chance: 0.4 }, { id: 'gem_random_4', chance: 0.08 }, { id: 'efsun_nesnesi', chance: 0.12 }, { id: 'kutsama_kagidi', chance: 0.07 }, { id: 'oyma_kalemi', chance: 0.06 }, { id: 'takviye_nesnesi', chance: 0.09 }] },
  loot_metin_ad_t2: { ...METIN_BASE, items: [3, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 36,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [52, 52] }, { id: 'beceri_kitabi_3', chance: 0.2 }, { id: 'gem_random_3', chance: 0.4 }, { id: 'gem_random_4', chance: 0.09 }, { id: 'efsun_nesnesi', chance: 0.12 }, { id: 'kutsama_kagidi', chance: 0.08 }, { id: 'oyma_kalemi', chance: 0.07 }, { id: 'takviye_nesnesi', chance: 0.09 }] },
  loot_metin_ad_t3: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 38,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [56, 56] }, { id: 'beceri_kitabi_3', chance: 0.18 }, { id: 'gem_random_4', chance: 0.1 }, { id: 'efsun_nesnesi', chance: 0.13 }, { id: 'kutsama_kagidi', chance: 0.08 }, { id: 'oyma_kalemi', chance: 0.07 }, { id: 'takviye_nesnesi', chance: 0.09 }] },
  loot_metin_ad_t4: { ...METIN_BASE, items: [4, 5], minRarity: 'rare', minRarityCount: 2, goldMult: 40,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [60, 60] }, { id: 'beceri_kitabi_3', chance: 0.18 }, { id: 'gem_random_4', chance: 0.11 }, { id: 'efsun_nesnesi', chance: 0.13 }, { id: 'kutsama_kagidi', chance: 0.09 }, { id: 'oyma_kalemi', chance: 0.08 }, { id: 'takviye_nesnesi', chance: 0.1 }] },
  loot_metin_ad_t5: { ...METIN_BASE, items: [4, 6], minRarity: 'rare', minRarityCount: 2, goldMult: 42,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [64, 64] }, { id: 'beceri_kitabi_3', chance: 0.2 }, { id: 'gem_random_4', chance: 0.12 }, { id: 'efsun_nesnesi', chance: 0.14 }, { id: 'kutsama_kagidi', chance: 0.09 }, { id: 'oyma_kalemi', chance: 0.08 }, { id: 'takviye_nesnesi', chance: 0.1 }] },
  loot_metin_ad_t6: { ...METIN_BASE, items: [4, 6], minRarity: 'rare', minRarityCount: 2, goldMult: 44,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [68, 68] }, { id: 'beceri_kitabi_3', chance: 0.22 }, { id: 'gem_random_4', chance: 0.14 }, { id: 'efsun_nesnesi', chance: 0.14 }, { id: 'kutsama_kagidi', chance: 0.1 }, { id: 'oyma_kalemi', chance: 0.09 }, { id: 'takviye_nesnesi', chance: 0.1 }] },
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
  // Karakır Bozkırı (levels 30-40)
  loot_mb_kb_horgan: { base: 'miniboss', focus: ['axe2h', 'helm', 'shoulders', 'chest', 'boots'], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [16, 16] }] },
  loot_mb_kb_kul_efendisi: { base: 'miniboss', focus: ['axe2h', 'helm', 'shoulders', 'chest', 'boots'], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [20, 20] }] },
  // Ayaz Dağları (levels 45-60)
  loot_mb_ad_buz_dev: { base: 'miniboss', focus: ['axe2h', 'helm', 'shoulders', 'chest', 'boots'], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [30, 30] }, { id: 'gem_sapphire_2', chance: 0.2 }] },
  loot_mb_ad_kar_alfa: { base: 'miniboss', focus: ['dagger', 'sword1h', 'gloves', 'legs'], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [34, 34] }, { id: 'gem_sapphire_2', chance: 0.25 }] },
  loot_mb_ad_zirve_muhafizi: { base: 'miniboss', focus: ['chest', 'helm', 'shield', 'legs', 'ring'], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [40, 40] }, { id: 'gem_diamond_2', chance: 0.15 }] },
};

/** Named rares (GDD 3.5): Nadir x1-2 guaranteed, Metin Kalintisi, one themed bonus; four of them carry a Vadi Efsanevisi (15%). */
const RARE_BASE: LootTableDef = { base: 'elite', minRarity: 'rare', minRarityCount: 99 };
export const RARE_TABLES: Record<string, LootTableDef> = {
  loot_rare_gumus_yele: { ...RARE_BASE, minRarity: 'uncommon', items: [2, 2], uniqueIds: ['leg_vadi_gumus_pence'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [3, 3] }] },
  loot_rare_kizil_kuyruk: { ...RARE_BASE, minRarity: 'uncommon', items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [2, 2] }, { id: 'kara_demir', chance: 1, count: [8, 8] }, { id: 'pet_kizil_tilki', chance: 0.04 }] },
  loot_rare_korkuluk_kral: { ...RARE_BASE, items: [1, 1],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }, { id: 'buyulu_toz', chance: 1, count: [3, 3] }] },
  loot_rare_buyuk_boz: { ...RARE_BASE, items: [1, 1], uniqueIds: ['leg_vadi_boz_postu'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }] },
  loot_rare_mantar_ana: { ...RARE_BASE, items: [1, 1],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }, { id: 'gem_emerald_1', chance: 0.3 }] },
  loot_rare_golge_alfa: { ...RARE_BASE, items: [2, 2], uniqueIds: ['leg_vadi_gece_tuyu'], uniqueChance: 0.15,
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [6, 6] }, { id: 'pet_kurt_yavrusu', chance: 0.04 }] },
  loot_rare_demir_boynuz: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [6, 6] }, { id: 'buyulu_toz', chance: 1, count: [6, 6] }] },
  loot_rare_agit_kralicesi: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 8] }, { id: 'gem_amethyst_2', chance: 0.3 }] },
  loot_rare_zehir_ana: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 8] }, { id: 'gem_emerald_2', chance: 0.35 }] },
  loot_rare_gumus_ejder: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }, { id: 'gem_sapphire_1', chance: 0.3 }] },
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
  // Karakır Bozkırı (levels 30-40)
  loot_rare_keseli_goblin: { ...RARE_BASE, items: [1, 1], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [3, 3] }, { id: 'buyulu_toz', chance: 1, count: [2, 2] }] },
  loot_rare_tarla_yirtici: { ...RARE_BASE, items: [1, 1], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [2, 2] }, { id: 'kara_demir', chance: 1, count: [4, 4] }] },
  loot_rare_ala_domuz: { ...RARE_BASE, items: [1, 1], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [3, 3] }, { id: 'buyulu_toz', chance: 1, count: [3, 3] }] },
  loot_rare_puglin_agasi: { ...RARE_BASE, items: [1, 1], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [4, 4] }] },
  loot_rare_bozkurt_reisi: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [5, 5] }, { id: 'buyulu_toz', chance: 1, count: [4, 4] }] },
  loot_rare_haydut_tirani: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [5, 5] }, { id: 'efsun_nesnesi', chance: 0.2 }] },
  loot_rare_sulu_kralice: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [7, 7] }] },
  loot_rare_isik_avcisi: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [7, 7] }, { id: 'buyulu_toz', chance: 1, count: [6, 6] }] },
  loot_rare_kara_disli_aga: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [9, 9] }] },
  loot_rare_kul_kertenkelesi: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [9, 9] }] },
  loot_rare_hayalet_sovalye: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [11, 11] }] },
  loot_rare_kara_rahibe: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 12] }] },
  loot_rare_kb_alaca_yele: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [14, 14] }, { id: 'gem_topaz_2', chance: 0.3 }] },
  loot_rare_kb_kor_pehlivan: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [16, 16] }, { id: 'buyulu_toz', chance: 1, count: [8, 8] }, { id: 'ejderha_pulu', chance: 0.5, count: [1, 1] }] },
  // Karakır Bozkırı r11 / r12 (levels 40-45)
  loot_rare_kb_kul_hayaleti: { ...RARE_BASE, items: [2, 2],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [18, 18] }, { id: 'gem_topaz_2', chance: 0.3 }, { id: 'buyulu_toz', chance: 1, count: [8, 8] }] },
  loot_rare_kb_kartal_kral: { ...RARE_BASE, items: [2, 3],
    bonus: [{ id: 'metin_kalintisi', chance: 1, count: [20, 20] }, { id: 'ejderha_pulu', chance: 0.6, count: [1, 1] }, { id: 'gem_topaz_2', chance: 0.25 }] },
  // Ayaz Dağları (levels 45-60): Nadir x2, Metin Kalıntısı and one themed bonus
  loot_rare_ad_kiragi_kurdu: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [22, 22] }, { id: 'gem_sapphire_2', chance: 0.3 }] },
  loot_rare_ad_buz_aga: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [24, 24] }, { id: 'gem_sapphire_2', chance: 0.3 }, { id: 'buyulu_toz', chance: 1, count: [8, 8] }] },
  loot_rare_ad_kar_yeti: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [26, 26] }, { id: 'gem_diamond_2', chance: 0.2 }] },
  loot_rare_ad_firtina_kartali: { ...RARE_BASE, items: [2, 3], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [28, 28] }, { id: 'ejderha_pulu', chance: 0.6, count: [1, 1] }, { id: 'gem_topaz_3', chance: 0.25 }] },
  loot_rare_ad_don_kral: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [30, 30] }, { id: 'gem_amethyst_3', chance: 0.3 }] },
  loot_rare_ad_donmus_sovalye: { ...RARE_BASE, items: [2, 2], bonus: [{ id: 'metin_kalintisi', chance: 1, count: [32, 32] }, { id: 'gem_diamond_3', chance: 0.25 }, { id: 'ejderha_pulu', chance: 0.5, count: [1, 1] }] },
};

/** World bosses (GDD 3.8): boss rank table (item level = level + 3) plus extra Metin Kalintisi. */
export const WORLD_BOSS_TABLES: Record<string, LootTableDef> = {
  loot_wb_curukkok: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [8, 12] }, { id: 'pet_tas_kaplumbaga', chance: 0.05 }] },
  loot_wb_alevkanat: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [12, 18] }] },
  loot_wb_ulu_boz: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [20, 28] }, { id: 'pet_ejder_yavrusu', chance: 0.05 }] },
  // Ayaz Dağları (levels 45-60): Zemheri, the r20 arena
  loot_wb_ad_zemheri: { base: 'boss', bonus: [{ id: 'metin_kalintisi', chance: 1, count: [30, 40] }, { id: 'pet_buz_tilkisi', chance: 0.05 }] },
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
  // Karakır Bozkırı (r7..r10)
  gather_ore_r7: { entries: [{ id: 'kara_demir', chance: 1, count: [4, 6] }, { id: 'buyulu_toz', chance: 0.25, count: [1, 2] }] },
  gather_herb_r7: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 1] }] },
  gather_ore_r8: { entries: [{ id: 'buyulu_toz', chance: 1, count: [2, 4] }, { id: 'ejderha_pulu', chance: 0.06, count: [1, 1] }] },
  gather_herb_r8: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 1] }, { id: 'pot_res_3', chance: 0.4, count: [1, 1] }] },
  gather_ore_r9: { entries: [{ id: 'buyulu_toz', chance: 1, count: [2, 4] }, { id: 'ejderha_pulu', chance: 0.08, count: [1, 1] }] },
  gather_herb_r9: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 2] }, { id: 'pot_res_3', chance: 0.5, count: [1, 1] }] },
  gather_ore_r10: { entries: [{ id: 'buyulu_toz', chance: 1, count: [3, 5] }, { id: 'ejderha_pulu', chance: 0.1, count: [1, 1] }] },
  gather_herb_r10: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 2] }, { id: 'pot_res_3', chance: 0.6, count: [1, 2] }] },
  gather_ore_r11: { entries: [{ id: 'buyulu_toz', chance: 1, count: [3, 5] }, { id: 'ejderha_pulu', chance: 0.1, count: [1, 1] }] },
  gather_herb_r11: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 2] }, { id: 'pot_res_3', chance: 0.6, count: [1, 2] }] },
  gather_ore_r12: { entries: [{ id: 'buyulu_toz', chance: 1, count: [3, 6] }, { id: 'ejderha_pulu', chance: 0.12, count: [1, 1] }] },
  gather_herb_r12: { entries: [{ id: 'pot_hp_3', chance: 1, count: [1, 2] }, { id: 'pot_res_3', chance: 0.7, count: [1, 2] }] },
  // Ayaz Dağları (r16..r21): ore tier 4 (r16-r17), 5 (r18-r19), 6 (r20-r21); herbs on the same tiers (professions.ts NODE_TYPES)
  gather_ore_r16: { entries: [{ id: 'ore_gold', chance: 1, count: [2, 4] }] },
  gather_herb_r16: { entries: [{ id: 'herb_dragontongue', chance: 1, count: [1, 2] }] },
  gather_ore_r17: { entries: [{ id: 'ore_gold', chance: 1, count: [3, 5] }] },
  gather_herb_r17: { entries: [{ id: 'herb_dragontongue', chance: 1, count: [2, 3] }] },
  gather_ore_r18: { entries: [{ id: 'ore_dragon', chance: 1, count: [2, 4] }] },
  gather_herb_r18: { entries: [{ id: 'herb_moonviolet', chance: 1, count: [1, 2] }] },
  gather_ore_r19: { entries: [{ id: 'ore_dragon', chance: 1, count: [3, 5] }] },
  gather_herb_r19: { entries: [{ id: 'herb_moonviolet', chance: 1, count: [2, 3] }] },
  gather_ore_r20: { entries: [{ id: 'ore_ancient', chance: 1, count: [2, 3] }] },
  gather_herb_r20: { entries: [{ id: 'herb_lotus', chance: 1, count: [1, 2] }] },
  gather_ore_r21: { entries: [{ id: 'ore_ancient', chance: 1, count: [3, 4] }] },
  gather_herb_r21: { entries: [{ id: 'herb_lotus', chance: 1, count: [2, 3] }] },
};

/** Every open-world table is also reachable through the shared registry (LootSystem looks named tables up there). */
Object.assign(LOOT_TABLES, FARM_TABLES, METIN_TABLES, MINIBOSS_TABLES, RARE_TABLES, WORLD_BOSS_TABLES);

/**
 * Season 1 Mythic+ dungeon boss tables (K18, docs/dungeons/*.md section 5 loot). Keys are the doc table ids
 * (`loot_<dungeon>_b<n>`); each boss's 3 named items are its `uniqueIds` (UniqueDef ids in uniques.ts), rolled with
 * `uniqueChance` per personal roll. Trinket slots do not exist: the docs' trinkets are amulets or rings here.
 * `focus` uses the item categories of the docs; the 2H sword / mace / polearm slots map to the categories that have bases.
 */
export const SEASON_LOOT_TABLES: Record<string, LootTableDef> = {
  // Büyücü Terasi (buyucu_terasi)
  loot_mt_b1: { focus: ['gloves', 'belt', 'wand', 'tome', 'ring'], setChance: 0.15, uniqueIds: ['mt_gloves_kural', 'mt_belt_shackle', 'mt_ring_orb'], uniqueChance: 0.22 },
  loot_mt_b2: { focus: ['amulet', 'shield', 'sword1h', 'dagger', 'shoulders'], setChance: 0.15, uniqueIds: ['leg_cynosure_pendant', 'mt_shield_dome', 'mt_sword_glaive'], uniqueChance: 0.22 },
  loot_mt_b3: { focus: ['staff', 'wand', 'tome', 'helm', 'legs'], setChance: 0.2, uniqueIds: ['mt_helm_triplicate', 'mt_legs_neural', 'mt_staff_echo'], uniqueChance: 0.22 },
  loot_mt_b4: { focus: ['chest', 'helm', 'staff', 'sword1h', 'ring', 'amulet'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_orrery_staff', 'mt_chest_entropy', 'mt_ring_splinter'], uniqueChance: 0.3 },
  // Kefaret Salonları (kefaret_salonlari)
  loot_kef_b1: { focus: ['axe2h', 'shield', 'gloves', 'boots', 'belt'], setChance: 0.2, uniqueIds: ['leg_kef_halkor_shard', 'leg_kef_sinstone_aegis', 'leg_kef_fracture_axe'], uniqueChance: 0.25 },
  loot_kef_b2: { focus: ['dagger', 'chest', 'legs', 'amulet', 'helm'], setChance: 0.2, uniqueIds: ['leg_kef_ekelon_eye', 'leg_kef_dive_boots', 'leg_kef_commander_dagger'], uniqueChance: 0.25 },
  loot_kef_b3: { focus: ['staff', 'wand', 'tome', 'ring', 'shoulders'], setChance: 0.2, uniqueIds: ['leg_kef_vessel', 'leg_kef_judge_seal', 'leg_kef_halo_wand'], uniqueChance: 0.25 },
  loot_kef_b4: { focus: ['chest', 'helm', 'staff', 'sword1h', 'axe2h', 'dagger', 'wand'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_kef_ferula', 'leg_kef_reaper', 'leg_kef_pride_mantle'], uniqueChance: 0.35 },
  // Leş Uyanışı (les_uyanisi)
  loot_mp_les_b1: { focus: ['gloves', 'belt', 'boots', 'shield', 'sword1h'], setChance: 0.15, uniqueIds: ['leg_les_curukkemik', 'leg_les_kanemici', 'leg_les_cukur_kalkan'], uniqueChance: 0.14 },
  loot_mp_les_b2: { focus: ['axe2h', 'ring', 'amulet', 'shoulders', 'dagger'], setChance: 0.15, uniqueIds: ['leg_les_amarth', 'leg_les_ruh_hasadi', 'leg_les_kanat_omuz'], uniqueChance: 0.14 },
  loot_mp_les_b3: { focus: ['chest', 'legs', 'tome', 'wand', 'gloves'], setChance: 0.15, uniqueIds: ['leg_les_dikisat', 'leg_les_onluk', 'leg_les_mumya_tomu'], uniqueChance: 0.14 },
  loot_mp_les_b4: { focus: ['helm', 'staff', 'chest', 'ring', 'sword1h', 'axe2h', 'wand'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_les_nalthor', 'leg_les_ayaz_tac', 'leg_les_surgun_muhru'], uniqueChance: 0.2 },
  // Peri Sisleri (peri_sisleri)
  loot_ps_b1: { focus: ['staff', 'wand', 'tome', 'helm', 'shoulders', 'amulet'], setChance: 0.15, uniqueIds: ['leg_ps_antler_charm', 'leg_ps_soul_splitter', 'leg_ps_wicker_mantle'], uniqueChance: 0.22 },
  loot_ps_b2: { focus: ['gloves', 'boots', 'ring', 'dagger', 'belt'], setChance: 0.15, uniqueIds: ['leg_ps_mist_ocarina', 'leg_ps_vulpin_treads', 'leg_ps_player_dagger'], uniqueChance: 0.22 },
  loot_ps_b3: { focus: ['chest', 'legs', 'sword1h', 'axe2h', 'staff', 'amulet', 'ring'], setChance: 0.25, extraItems: 1, legendaryMult: 1.5, uniqueIds: ['leg_ps_acid_fang', 'leg_ps_lakali_tear', 'leg_ps_brood_carapace'], uniqueChance: 0.28 },
  // Yankı Ağı (yanki_agi)
  loot_yk_b1: { focus: ['helm', 'gloves', 'legs'], setChance: 0.15, uniqueIds: ['uni_yk_sacbrood', 'uni_yk_maw', 'uni_yk_webwrap'], uniqueChance: 0.45 },
  loot_yk_b2: { focus: ['shoulders', 'chest'], setChance: 0.15, uniqueIds: ['uni_yk_impaler', 'uni_yk_echoshield', 'uni_yk_hiveeye'], uniqueChance: 0.45 },
  loot_yk_b3: { focus: ['chest', 'belt', 'boots', 'ring'], setChance: 0.2, uniqueIds: ['uni_yk_sickle', 'uni_yk_echo', 'uni_yk_harvestrobe'], uniqueChance: 0.45 },
  // Yiğitler Sarayı (yigitler_sarayi)
  loot_yg_b1: { focus: ['shoulders', 'helm', 'amulet', 'axe2h'], setChance: 0.15, uniqueIds: ['leg_yg_borusu', 'leg_yg_kapi_kilic', 'leg_yg_statik_kusak'], uniqueChance: 0.66 },
  loot_yg_b2: { focus: ['chest', 'legs', 'shoulders', 'staff'], setChance: 0.15, uniqueIds: ['leg_yg_valkyr_pelerin', 'leg_yg_isik_asa', 'leg_yg_ikiz_muhur'], uniqueChance: 0.66 },
  loot_yg_b3: { focus: ['ring', 'amulet', 'legs', 'dagger'], setChance: 0.15, uniqueIds: ['leg_yg_kanli_av', 'leg_yg_av_yuzugu', 'leg_yg_surusu_kurk'], uniqueChance: 0.66 },
  loot_yg_b4: { focus: ['axe2h', 'shield', 'staff', 'helm', 'chest', 'ring'], setChance: 0.2, uniqueIds: ['leg_yg_sinav_mizragi', 'leg_yg_yargi_muhru', 'leg_yg_aegis_golgesi'], uniqueChance: 0.66 },
  // Yıldız Divanı (yildiz_divani)
  loot_ys_b1: { focus: ['axe2h', 'shield', 'chest', 'gloves', 'helm'], setChance: 0.2, uniqueIds: ['leg_ys_nobet_cani', 'leg_ys_kilitlenme_zinciri', 'leg_ys_fener_yuzugu'], uniqueChance: 0.3 },
  loot_ys_b2: { focus: ['staff', 'wand', 'tome', 'ring', 'amulet'], setChance: 0.2, uniqueIds: ['leg_ys_alevcelenk', 'leg_ys_zumrut_sozlesme', 'leg_ys_yakici_siddet'], uniqueChance: 0.3 },
  loot_ys_b3: { focus: ['dagger', 'sword1h', 'amulet', 'ring', 'belt'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_ys_pinar_keser', 'leg_ys_yildiz_haritasi', 'leg_ys_yanki_kusagi'], uniqueChance: 0.3 },
  // Taşkasa (taskasa)
  loot_tk_b1: { focus: ['axe2h', 'chest', 'gloves', 'boots'], setChance: 0.15, uniqueIds: ['leg_seda_lens', 'leg_seda_aegis', 'leg_seda_gauntlets'], uniqueChance: 0.35 },
  loot_tk_b2: { focus: ['ring', 'amulet', 'belt', 'shoulders', 'legs'], setChance: 0.15, uniqueIds: ['leg_skarmorak_heart', 'leg_skar_fragment_belt', 'leg_skar_pauldrons'], uniqueChance: 0.35 },
  loot_tk_b3: { focus: ['mace', 'sword1h', 'gloves', 'shoulders', 'tome'], setChance: 0.15, uniqueIds: ['leg_dorlita_hammer', 'leg_brokk_anvil_staff', 'leg_crescendo_plate'], uniqueChance: 0.35 },
  loot_tk_b4: { focus: ['staff', 'helm', 'chest', 'legs', 'dagger', 'wand'], setChance: 0.25, extraItems: 1, uniqueIds: ['leg_eirich_staff', 'leg_eirich_crown', 'leg_eirich_dagger'], uniqueChance: 0.4 },
};
Object.assign(LOOT_TABLES, SEASON_LOOT_TABLES);

export function registerLootTable(id: string, def: LootTableDef): void {
  LOOT_TABLES[id] = def;
}
