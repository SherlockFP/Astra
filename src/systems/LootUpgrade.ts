import { G } from '../game/G';
import { CLASSES } from '../data/classes';
import { getItemBase } from '../data/items';
import type { EquipSlot, ItemInstance } from '../types/items';
import type { StatId } from '../types/stats';
import { describeItem, slotsForCategory } from './ItemGen';

/**
 * WoW-style upgrade check: does this item beat what the local character wears in the slot it would take?
 * Item level decides; on an equal item level the class main stat (str / dex / int) breaks the tie. An empty slot counts as an
 * upgrade. Only items the character can equip right now (class, level, category) are ever upgrades.
 */
export interface UpgradeInfo {
  /** Usable now: class, required level and slot checks pass (CharacterState.canEquip). */
  usable: boolean;
  /** Beats the counterpart, or fills an empty slot. */
  upgrade: boolean;
  /** The slot the comparison is made against (null when the item fits nowhere). */
  slot: EquipSlot | null;
  /** The equipped item it would replace (null: the slot is empty). */
  counterpart: ItemInstance | null;
  /** Item level minus the counterpart's item level (the full item level for an empty slot). */
  ilvlDelta: number;
  /** Main-stat difference, item minus counterpart; only computed on an item-level tie (0 otherwise). */
  mainStatDelta: number;
}

const NONE: UpgradeInfo = { usable: false, upgrade: false, slot: null, counterpart: null, ilvlDelta: 0, mainStatDelta: 0 };

/** Upgrade state of an item against the local character's equipment. Safe to call every frame of a panel refresh. */
export function upgradeInfo(item: ItemInstance): UpgradeInfo {
  const c = G.character;
  const base = getItemBase(item.baseId);
  if (!c || !base || item.listed) return NONE;
  const slots = slotsForCategory(base.category);
  if (!slots.length) return NONE;
  const eq = c.save.equipment as Partial<Record<string, ItemInstance | undefined>>;
  // a worn item is never an upgrade of itself
  for (const it of Object.values(eq)) if (it && it.uid === item.uid) return NONE;
  // target: the first empty candidate slot, else the candidate holding the lowest item level (rings compare to the weaker one)
  let slot: EquipSlot | null = null;
  let worst: ItemInstance | null = null;
  for (const s of slots) {
    const it = eq[s] ?? null;
    if (!it) {
      slot = s;
      worst = null;
      break;
    }
    if (!worst || it.itemLevel < worst.itemLevel) {
      worst = it;
      slot = s;
    }
  }
  if (!slot) return NONE;
  if (!c.canEquip(item, slot).ok) return NONE;
  const ilvlDelta = item.itemLevel - (worst?.itemLevel ?? 0);
  // the main stat only breaks an item-level tie (describeItem is not cached, and panels call this for every slot)
  let mainStatDelta = 0;
  if (worst && ilvlDelta === 0) {
    const main = (CLASSES[c.classId]?.mainStat ?? 'str') as StatId;
    try {
      mainStatDelta = (describeItem(item).totalStats[main] ?? 0) - (describeItem(worst).totalStats[main] ?? 0);
    } catch {
      mainStatDelta = 0;
    }
  }
  const upgrade = !worst || ilvlDelta > 0 || (ilvlDelta === 0 && mainStatDelta > 0);
  return { usable: true, upgrade, slot, counterpart: worst, ilvlDelta, mainStatDelta };
}
