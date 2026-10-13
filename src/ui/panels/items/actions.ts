import { G } from '../../../game/G';
import { RARITY_COLORS } from '../../../types/common';
import type { EquipSlot, ItemInstance } from '../../../types/items';
import type { ItemLocation } from '../../../systems/CharacterState';
import { vendorApi } from './backend';
import { registry, openPanel } from './PanelBase';
import { CATEGORY_ORDER, CATEGORY_TR, categoryOf, describe, fmt, isEquipItem, locEq, rarityOrder, sfx, slotsForItem, toast } from './common';

export function itemAt(loc: ItemLocation): ItemInstance | null {
  const c = G.character;
  if (!c) return null;
  if (loc.where === 'bag') return c.save.bag[loc.index] ?? null;
  if (loc.where === 'stash') return c.save.stash[loc.index] ?? null;
  return c.save.equipment[loc.slot] ?? null;
}

export function firstFree(arr: (ItemInstance | null)[], from = 0, to = arr.length): number {
  for (let i = from; i < to; i++) if (!arr[i]) return i;
  return -1;
}

/** Can `item` be dropped on this location (cheap check used for drop highlights)? */
export function canPlace(item: ItemInstance, to: ItemLocation): boolean {
  if (to.where !== 'equipment') return true;
  return slotsForItem(item).includes(to.slot);
}

/** Move/swap with validation and feedback. */
export function moveItem(from: ItemLocation, to: ItemLocation): boolean {
  const c = G.character;
  if (!c || locEq(from, to)) return false;
  const item = itemAt(from);
  if (!item) return false;
  if (to.where === 'equipment' && !canPlace(item, to)) {
    toast('Bu eşya o yuvaya takılamaz', 'warning');
    return false;
  }
  // CharacterState validates (class, level, two-handed rules) and toasts the reason itself
  const ok = c.moveItem(from, to);
  if (!ok) return false;
  if (to.where === 'equipment') sfx('equip');
  else if (from.where === 'equipment') sfx('unequip');
  return true;
}

export function equipFromBag(item: ItemInstance): boolean {
  const c = G.character;
  if (!c) return false;
  const ok = c.equip(item.uid);
  if (ok) sfx('equip');
  else sfx('ui_error');
  return ok;
}

export function unequipSlot(slot: EquipSlot): boolean {
  const c = G.character;
  if (!c) return false;
  if (c.freeBagSlots() <= 0 && firstFree(c.save.bag) < 0) {
    toast('Çanta dolu!', 'warning');
    sfx('ui_error');
    return false;
  }
  const ok = c.unequip(slot);
  if (ok) sfx('unequip');
  else sfx('ui_error');
  return ok;
}

export function toggleLock(item: ItemInstance): void {
  item.locked = !item.locked;
  sfx('ui_click');
  try {
    G.character?.persist();
    G.events.emit('inventory:changed', {});
  } catch {
    /* ignore */
  }
}

/** A vendor that buys items is open (merchant / alchemist; not the Gizemli Tuccar or the Muhurdar). */
export function vendorSells(): boolean {
  const v = registry.vendor as unknown as { isOpen: boolean; canSell?: () => boolean } | undefined;
  return !!v?.isOpen && v.canSell?.() !== false;
}

/** Sell one item at the open vendor. */
export function sellItem(item: ItemInstance): boolean {
  if (item.locked) {
    toast('Kilitli eşya satılamaz', 'warning');
    sfx('ui_error');
    return false;
  }
  const r = vendorApi.sell(item.uid);
  if (r.ok) {
    sfx('sell');
    if (r.gold > 0) toast(`+${fmt(r.gold)} altın`, 'loot');
    return true;
  }
  sfx('ui_error');
  toast('Bu eşya satılamaz', 'warning');
  return false;
}

export function depositToStash(bagIndex: number): boolean {
  const c = G.character;
  if (!c) return false;
  const range = (registry.stash as unknown as { currentRange?: () => [number, number] } | undefined)?.currentRange?.();
  let free = range ? firstFree(c.save.stash, range[0], range[1]) : -1;
  if (free < 0) free = firstFree(c.save.stash);
  if (free < 0) {
    toast('Depo dolu!', 'warning');
    sfx('ui_error');
    return false;
  }
  const ok = c.moveItem({ where: 'bag', index: bagIndex }, { where: 'stash', index: free });
  if (ok) sfx('ui_drop');
  return ok;
}

export function withdrawToBag(stashIndex: number): boolean {
  const c = G.character;
  if (!c) return false;
  const free = firstFree(c.save.bag);
  if (free < 0) {
    toast('Çanta dolu!', 'warning');
    sfx('ui_error');
    return false;
  }
  const ok = c.moveItem({ where: 'stash', index: stashIndex }, { where: 'bag', index: free });
  if (ok) sfx('ui_drop');
  return ok;
}

/** Right click on an item anywhere. Behaviour depends on the open windows (stash, anvil, vendor). */
export function quickAction(loc: ItemLocation, item: ItemInstance, e: MouseEvent): void {
  if (e.ctrlKey) {
    toggleLock(item);
    return;
  }
  if (loc.where === 'equipment') {
    if (registry.blacksmith?.isOpen) {
      (registry.blacksmith as unknown as { setItem(uid: string): void }).setItem(item.uid);
      return;
    }
    unequipSlot(loc.slot);
    return;
  }
  if (loc.where === 'stash') {
    withdrawToBag(loc.index);
    return;
  }
  // bag
  if (registry.stash?.isOpen) {
    depositToStash(loc.index);
    return;
  }
  if (vendorSells() && e.shiftKey) {
    sellItem(item);
    return;
  }
  if (registry.blacksmith?.isOpen && isEquipItem(item)) {
    (registry.blacksmith as unknown as { setItem(uid: string): void }).setItem(item.uid);
    return;
  }
  if (isEquipItem(item)) {
    equipFromBag(item);
    return;
  }
  const cat = categoryOf(item);
  if (cat === 'keystone') {
    openPanel('keystone');
    return;
  }
  toast('Bu eşya kullanılamaz', 'info');
}

/** Potion / elixir use from the pouch. */
export function useConsumable(id: string): boolean {
  const c = G.character;
  if (!c || c.material(id) <= 0) return false;
  try {
    const r = c.useConsumable(id);
    if (!r.ok && r.reason) toast(r.reason, 'warning');
    return r.ok;
  } catch (e) {
    console.warn('[panels-items] consumable failed', e);
    return false;
  }
}

export function itemSortCompare(a: ItemInstance, b: ItemInstance): number {
  const ca = categoryOf(a);
  const cb = categoryOf(b);
  const ia = ca ? CATEGORY_ORDER.indexOf(ca) : 99;
  const ib = cb ? CATEGORY_ORDER.indexOf(cb) : 99;
  if (ia !== ib) return ia - ib;
  const ra = rarityOrder(a.rarity);
  const rb = rarityOrder(b.rarity);
  if (ra !== rb) return rb - ra;
  if (a.itemLevel !== b.itemLevel) return b.itemLevel - a.itemLevel;
  if ((a.upgrade ?? 0) !== (b.upgrade ?? 0)) return (b.upgrade ?? 0) - (a.upgrade ?? 0);
  return describe(a).name.localeCompare(describe(b).name, 'tr');
}

/** Sort a bag/stash range: by slot, rarity, item level (uses CharacterState.sortBag when present, else swaps). */
export function sortContainer(where: 'bag' | 'stash', start = 0, end?: number): void {
  const c = G.character;
  if (!c) return;
  const sc = c as unknown as { sortBag?: () => void };
  if (where === 'bag' && typeof sc.sortBag === 'function' && start === 0 && end === undefined) {
    sc.sortBag();
    sfx('ui_click');
    return;
  }
  const arr = () => (where === 'bag' ? c.save.bag : c.save.stash);
  const stop = end ?? arr().length;
  const items = arr().slice(start, stop).filter((x): x is ItemInstance => !!x);
  items.sort(itemSortCompare);
  const target: (ItemInstance | null)[] = [...items];
  while (target.length < stop - start) target.push(null);
  for (let i = 0; i < target.length; i++) {
    const idx = start + i;
    const want = target[i];
    if (!want) break;
    const cur = arr()[idx] ?? null;
    if (cur && cur.uid === want.uid) continue;
    let j = -1;
    for (let k = idx + 1; k < stop; k++) {
      if (arr()[k]?.uid === want.uid) {
        j = k;
        break;
      }
    }
    if (j < 0) continue;
    c.moveItem({ where, index: j }, { where, index: idx });
  }
  sfx('ui_click');
}

export function itemCategoryLabel(item: ItemInstance): string {
  const c = categoryOf(item);
  return c ? CATEGORY_TR[c] : '';
}

export function rarityColor(item: ItemInstance): string {
  return RARITY_COLORS[item.rarity];
}
