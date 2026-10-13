/** Shared primitive types. See ARCHITECTURE.md for the ownership rules of every type file. */

/**
 * Entity ids are numbers.
 *  1..15            party slots (players). Player id = PARTY_ID_BASE + slot.
 *  100..49_999      enemies spawned from a DungeonDef (deterministic: 100 + spawn index, identical on every peer)
 *  50_000..899_999  host-spawned dynamic networked entities (adds, affix orbs, hazards) — host counter
 *  1_000_000+       local-only entities (projectile visuals, loot drops, props, npcs) — never sent over the net
 *  900_000..999_999 minions / pets / summons (GDD_CLASSES_V2 §1.5): MINION_ID_BASE + slot*1000 + counter%1000, networked
 */
export type EntityId = number;
export const PARTY_ID_BASE = 1;
export const DUNGEON_ENEMY_ID_BASE = 100;
export const HOST_DYNAMIC_ID_BASE = 50_000;
export const LOCAL_ID_BASE = 1_000_000;
/** GDD_CLASSES_V2 §1.1 (NC01): minion entity ids. Below LOCAL_ID_BASE, above HOST_DYNAMIC (899_999). */
export const MINION_ID_BASE = 900_000;

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type Team = 'player' | 'enemy' | 'neutral';
export type EntityKind = 'player' | 'enemy' | 'npc' | 'projectile' | 'loot' | 'prop' | 'hazard' | 'interactable'
  // GDD_CLASSES_V2 §1.1 (NC01): minion / pet / summon entities (entities/Minion.ts)
  | 'minion';

/**
 * Class ids. The first four are the playable KayKit classes; the five new classes (GDD_CLASSES_V2 §0.2, NC01) are
 * registry entries in data/classes.ts and only become selectable through PLAYABLE_CLASSES (data/classes.ts).
 */
export type ClassId = 'knight' | 'barbarian' | 'mage' | 'rogue'
  | 'monk' | 'archer' | 'paladin' | 'necromancer' | 'warlock'
  // CORE_MECHANICS §2 / CM1 (append-only): İblis Avcısı and Ejderhasoy. Registry rows only; not in PLAYABLE_CLASSES yet.
  | 'demonhunter' | 'evoker';
/**
 * Resource bars. `focus` (Okçu), `faith` (Paladin), `essence` (Nekromant) are GDD_CLASSES_V2 §1.2 additions (NC01).
 */
export type ResourceType = 'rage' | 'mana' | 'energy' | 'focus' | 'faith' | 'essence'
  // CORE_MECHANICS §2 / CM1: İblis Avcısı (Fury builder/spender). Ejderhasoy reuses `essence`.
  | 'fury';
/**
 * Secondary pip counters (GDD_CLASSES_V2 §1.2, NC01): shown as small pips under the bar, stored in Player.pips.
 * `combo` = rogue combo points, `adalet`/`karisim` = GDD_V2 (knight / rogue), the rest are new classes.
 */
export type PipId = 'combo' | 'adalet' | 'karisim' | 'chi' | 'holypower' | 'shard'
  // GDD_TALENTS §0.4 (T0): Gizem Yükü (mage_arcane), max 4, #b78cff
  | 'arcane'
  // PM-00a (docs/kits/plate-melee.md §g need 1): Death Knight rune pip (max 6, timed regen via PipDef.regen).
  | 'rune';

export type DamageType = 'physical' | 'fire' | 'frost' | 'lightning' | 'shadow' | 'poison' | 'holy' | 'arcane' | 'true';

export type SceneId = 'loading' | 'menu' | 'town' | 'dungeon';

export type Difficulty = 'normal' | 'heroic' | 'mythic' | 'mythicplus';

/** WoW-style rarity tiers (ids are stable, display names are Turkish in data/rarities). */
export type Rarity = 'poor' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'set';

export const RARITY_COLORS: Record<Rarity, string> = {
  poor: '#9d9d9d',
  common: '#ffffff',
  uncommon: '#1eff00',
  rare: '#0070dd',
  epic: '#a335ee',
  legendary: '#ff8000',
  set: '#00d5a0',
};

export const RARITY_NAMES_TR: Record<Rarity, string> = {
  poor: 'Değersiz',
  common: 'Sıradan',
  uncommon: 'Büyülü',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
  set: 'Set',
};

export const RARITY_ORDER: Rarity[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
