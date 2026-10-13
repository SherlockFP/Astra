import type { ClassId, Rarity } from './common';
import type { StatBlock, StatId } from './stats';

export type EquipSlot =
  | 'helm' | 'shoulders' | 'chest' | 'gloves' | 'legs' | 'boots' | 'belt'
  | 'amulet' | 'ring1' | 'ring2' | 'weapon' | 'offhand';

export const EQUIP_SLOTS: EquipSlot[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'weapon', 'offhand'];

export const EQUIP_SLOT_NAMES_TR: Record<EquipSlot, string> = {
  helm: 'Kask', shoulders: 'Omuzluk', chest: 'Zırh', gloves: 'Eldiven', legs: 'Pantolon', boots: 'Çizme', belt: 'Kemer',
  amulet: 'Kolye', ring1: 'Yüzük', ring2: 'Yüzük', weapon: 'Silah', offhand: 'Yan El',
};

/** Item category decides which equip slot(s) it can go into. 'ring' fits ring1/ring2. */
export type ItemCategory =
  | 'helm' | 'shoulders' | 'chest' | 'gloves' | 'legs' | 'boots' | 'belt' | 'amulet' | 'ring'
  | 'sword1h' | 'sword2h' | 'axe1h' | 'axe2h' | 'mace' | 'staff' | 'wand' | 'dagger' | 'crossbow' | 'bow'
  | 'shield' | 'tome' | 'quiver'
  | 'material' | 'consumable' | 'keystone' | 'gem' | 'junk'
  // GDD_V2 §4.2 (WP1): flasks are items (Şişe Kemeri)
  | 'flask'
  // GDD_CLASSES_V2 §8 (NC01/NC04): "Yumruk Silahı" — Keşiş's weapon category (fist bases come with the items module)
  | 'fist';

export type WeaponKind = 'sword1h' | 'sword2h' | 'axe1h' | 'axe2h' | 'mace' | 'staff' | 'wand' | 'dagger' | 'crossbow' | 'bow';

/** Static definition of an item base (e.g. "Demir Kılıç"). Lives in data/items.ts. */
export interface ItemBaseDef {
  id: string;
  name: string;               // Turkish display name
  category: ItemCategory;
  icon: string;               // /assets/icons/... .svg
  model?: string;             // GLB/GLTF url for dropped/equipped visuals (weapons, shields)
  minLevel: number;           // required character level
  itemLevelRange: [number, number];
  classes?: ClassId[];        // allowed classes (undefined = all)
  implicit?: StatBlock;       // base stats scaled by item level (see ItemGen)
  weaponDamage?: [number, number]; // at item level 1; ItemGen scales
  attacksPerSecond?: number;
  twoHanded?: boolean;
  stackable?: boolean;
  maxStack?: number;
  sellPrice?: number;
  desc?: string;
  /** items module extras */
  tier?: number;                    // 1..5 (T5 = "Kadim", M+ only)
  armorWeight?: ArmorWeight;
  typeMult?: number;                // weapon damage type multiplier (GDD 4.4)
  slotMult?: number;                // armour slot multiplier
  maxSockets?: number;
  typeName?: string;                // Turkish type label ("Tek El Kılıç")
}

/** Armour weight classes (heavy = Şövalye/Barbar, medium = Haydut, light = Büyücü). */
export type ArmorWeight = 'heavy' | 'medium' | 'light';
/** Item-local modifiers (affect only the item they roll on; ItemGen/StatCalc apply them to the item's own numbers). */
export type LocalMod = 'wpnDamagePct' | 'wpnAddFlat' | 'armorPct';

export interface AffixDef {
  id: string;
  kind: 'prefix' | 'suffix';
  name: string;               // e.g. "Alevli" (prefix) / "Ayının" (suffix)
  stat: StatId;
  tiers: { minItemLevel: number; min: number; max: number }[];
  categories?: ItemCategory[]; // allowed categories (undefined = all equipment)
  weight: number;
  /** items module: item-local modifier (stat is then only the nearest display stat). */
  local?: LocalMod;
  /** items module: weapon-only multiplier applied to the rolled stat when on a weapon (e.g. attackSpeed x1.5). */
  weaponMult?: number;
}

export interface RolledAffix {
  affixId: string;
  stat: StatId;
  value: number;
  tier: number;
  locked?: boolean;           // efsun kilidi
  /** GDD_ITEMS_V2 §3.3 (IT-00): S-tier 4..1 for slot-7 (Özel Efsun) lines. Undefined on normal lines. */
  s?: number;
}

/** A concrete item. Plain JSON — stored in saves and sent over the net (trade later). */
export interface ItemInstance {
  uid: string;
  baseId: string;
  rarity: Rarity;
  itemLevel: number;
  quantity?: number;          // stackables
  upgrade?: number;           // Metin2 style +0..+15
  affixes: RolledAffix[];
  sockets?: (string | null)[]; // gem item base ids
  uniqueId?: string;          // legendary/unique definition id
  setId?: string;
  name?: string;              // generated full name (e.g. "Alevli Demir Kılıç +7")
  identified?: boolean;
  bound?: boolean;
  keystone?: KeystoneData;    // when category === 'keystone'
  weaponDamage?: [number, number]; // rolled (after item level scaling, before upgrade bonus)
  implicit?: StatBlock;            // rolled implicit
  createdAt?: number;
  /**
   * items module: Demircinin Hatirasi (+2pp per failed >= +10 attempt, max +20pp).
   * DEPRECATED (GDD_ITEMS_V2 O-IT4): ignored on read, deleted on the next upgrade of this item.
   * The character-wide pity is CharacterSave.upg.stacks (Talih Birikimi).
   */
  failStacks?: number;
  /** items module: user lock (blocks sell/salvage). */
  locked?: boolean;
  // GDD_V2 §A (WP1 contracts, all optional)
  /** Legendary aspect id (`asp_*`, GDD_V2 §5.1). */
  aspectId?: string;
  /** Aspect roll 0..1, rolled at drop (GDD_V2 §5.1). */
  aspectRoll?: number;
  /** Set by orb_exalt: the item was exalted once (GDD_V2 §4.3). */
  exalted?: boolean;
  /** Set by orb_corrupt (irreversible, GDD_V2 §4.3). */
  corrupted?: boolean;
  /** Flask tier when category === 'flask'. */
  flaskTier?: number;
  // ---- GDD_ITEMS_V2 §A (IT-00 contracts). All OPTIONAL: old saves load unchanged.
  /** Efsun slot 6 (Tezgâh, GDD_ITEMS_V2 §3.2/§3.5). undefined = slot not unlocked; null = unlocked and empty. */
  bench?: RolledAffix | null;
  /** Efsun slot 7 (Özel Efsun, GDD_ITEMS_V2 §3.2/§3.6). undefined = not unlocked; null = unlocked and empty. */
  special?: RolledAffix | null;
  /** Ustalık rank 0..5 (GDD_ITEMS_V2 §2.8). Only effective at +15 (`mwEffective`). */
  mw?: number;
  /** Tılsım Yuvası stone id (GDD_ITEMS_V2 §4.4). undefined = no socket opened; null = open and empty. */
  tilsim?: string | null;
  /** Kazıma engraving rows on jewellery (GDD_ITEMS_V2 §4.5). */
  eng?: { id: string; pts: number }[];
  /** Kırık (broken) state of a bound item (GDD_ITEMS_V2 §2.6). A broken item contributes 0 stats. */
  broken?: boolean;
  /** Upgrade level before the Kırık hit, kept for the repair (GDD_ITEMS_V2 §2.6). */
  upgradeBroken?: number;
  /** Name of the crafter (GDD_LIFE §1.12 crafted items; shown in tooltips and chat snapshots). */
  craftedBy?: string;
}

export interface KeystoneData {
  dungeonId: string;
  level: number;              // +2 .. +30
  depleted?: boolean;
}

export interface UniqueDef {
  id: string;
  baseId: string;
  name: string;
  rarity: 'legendary';
  fixedAffixes: { stat: StatId; min: number; max: number; local?: LocalMod; mainStat?: boolean }[];
  special?: { id: string; desc: string; params?: Record<string, number> }; // implemented by combat via id
  flavor?: string;
  /** items module extras */
  minItemLevel?: number;
  classes?: ClassId[];          // undefined = any class (looter-class bias 70%)
  source?: string;
}

export interface SetDef {
  id: string;
  name: string;
  pieces: string[];           // base ids or unique-like piece ids
  bonuses: { count: number; stats?: StatBlock; special?: { id: string; desc: string } }[];
}

/** items module: one named piece of a set (ItemInstance.uniqueId = piece id, setId = set id). */
export interface SetPieceDef {
  id: string;
  setId: string;
  name: string;
  baseId: string;               // may contain "{w}" (replaced by the owner's armour weight)
  classId?: ClassId;
}

export interface GemDef {
  id: string;
  name: string;
  color: string;
  stat: StatId;
  values: number[];           // by gem tier
  /** items module: effect by socket category (values indexed by grade 1..6 -> [0..5]). */
  weapon?: { stats: StatId[]; local?: LocalMod; values: number[] };
  armor?: { stats: StatId[]; values: number[] };
  jewelry?: { stats: StatId[]; values: number[] };
}
