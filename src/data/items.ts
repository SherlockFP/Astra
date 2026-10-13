/**
 * OWNER: items/progression module. Item bases, affix pools, uniques, sets, gems.
 * The actual tables live in itemBases.ts / affixes.ts / uniques.ts / gems.ts (this file is the stable import point).
 */
import type { ItemBaseDef } from '../types/items';
import { ITEM_BASES } from './itemBases';
import { MATERIALS, type MaterialDef } from './materials';

export { ITEM_BASES, IMPLICIT_PER_ILVL, BASES_BY_CATEGORY, TIER_MIN_ILVL, tierForIlvl, tierRange, CLASS_ARMOR_WEIGHT, CLASS_WEAPONS, CLASS_OFFHANDS, CLASS_NAMES_TR, CATEGORY_NAMES_TR, ARMOR_WEIGHT_NAMES_TR, WEIGHT_CLASSES, isWeaponCategory, isArmorCategory, isEquipmentCategory, classCanUseBase, WEAPON_CATEGORIES, ARMOR_SLOT_CATEGORIES, OFFHAND_CATEGORIES, JEWELRY_CATEGORIES, TWO_HANDED_CATEGORIES } from './itemBases';
export { ITEM_AFFIXES, AFFIX_BY_ID, getAffix, TIER_GATES, TIER_WEIGHTS, tierNumberOfGate, DECIMAL_PCT_STATS, CLASS_AFFINITY } from './affixes';
export { UNIQUES, SETS, SET_PIECES, CLASS_SET } from './uniques';
export { GEMS, getGem, parseGemId } from './gems';

export const getItemBase = (id: string): ItemBaseDef | undefined => ITEM_BASES[id];

/**
 * K18 consumable (P-30): Panzehir İksiri cleanses one debuff and shares the 60 s potion cooldown.
 * Registered into the shared materials registry (kind 'consumable', no `potion` block, because Combat.usePotion only
 * handles hp / mp). The cleanse hook is NOT implemented yet: Combat.usePotion must learn the new kind.
 */
export const POTION_PANZEHIR: MaterialDef = {
  id: 'potion_panzehir',
  name: 'Panzehir İksiri',
  desc: 'Üzerindeki bir olumsuz etkiyi (zehir, kanama, yanma, yavaşlatma, kök, sersemletme) temizler. Tüm iksirler gibi 60 sn bekleme süresini paylaşır.',
  icon: '/assets/icons/item-potion-elixir.svg',
  rarity: 'uncommon',
  sellPrice: 15,
  buyPrice: 60,
  kind: 'consumable',
  maxStack: 99,
  requiredLevel: 20,
};
MATERIALS[POTION_PANZEHIR.id] = POTION_PANZEHIR;
