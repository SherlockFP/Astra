import type { ClassId } from '../types/common';
import type { ItemBaseDef, ItemInstance } from '../types/items';
import { CLASS_ARMOR_WEIGHT, CLASS_OFFHANDS, CLASS_WEAPONS, isWeaponCategory } from '../data/itemBases';
import { CLASS_AFFINITY } from '../data/affixes';
import { baseOf } from './ItemGen';

/**
 * Loot V3 §4 helpers. OWNER: items module. The smart roll itself lives in ItemGen.generateItem (one SMART_LOOT coin per item,
 * class armour weight, class weapons / off-hands, main-stat line); these are the predicates the checker, AutoSalvage and the
 * chest use to answer "can this class use that gear?".
 */

/** Armour needs the class's weight; weapons and off-hands must be in the class lists; jewellery and belts fit everyone. */
export function classCanUseBase(classId: ClassId, base: ItemBaseDef): boolean {
  // off-hands first: a shield carries armorWeight (heavy) for its stats, but its usability is the class's off-hand list (shamans wear medium armour and shields)
  if (base.category === 'shield' || base.category === 'tome' || base.category === 'quiver') return CLASS_OFFHANDS[classId].includes(base.category);
  if (base.armorWeight) return CLASS_ARMOR_WEIGHT[classId] === base.armorWeight;
  if (isWeaponCategory(base.category)) return CLASS_WEAPONS[classId].includes(base.category);
  return true;
}

export function classCanUseItem(classId: ClassId, item: ItemInstance): boolean {
  const base = baseOf(item);
  return !!base && classCanUseBase(classId, base);
}

/** AutoSalvage's "is it better" score: item level (halved for gear the class cannot use) + 2 per line on the class affinity list. */
export function itemScore(item: ItemInstance, classId: ClassId): number {
  const fav = new Set<string>(CLASS_AFFINITY[classId] ?? []);
  const lines = item.affixes.filter((a) => fav.has(a.stat)).length;
  return item.itemLevel * (classCanUseItem(classId, item) ? 1 : 0.5) + 2 * lines;
}
