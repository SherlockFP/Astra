import { G } from '../game/G';
import { RNG } from '../core/utils';
import type { ClassId } from '../types/common';
import type { EquipSlot, ItemInstance } from '../types/items';
import { getMaterial } from '../data/materials';
import { baseOf, isEquipmentItem, rarityIndex, sellValue, slotsForCategory } from './ItemGen';
import { classCanUseItem, itemScore } from './SmartLoot';
import { salvageYield } from './Upgrade';
import { bountyEvent } from './Bounties';
import { toast } from './notify';

/**
 * Loot V3 §6 auto-salvage. OWNER: items module. LootSystem runs every generic equipment drop through `decide` before it spawns:
 *   keep     -> the normal drop
 *   sell     -> gold straight to the purse (gray items; the vendor price)
 *   salvage  -> the blacksmith yield straight to the pouch
 * A coalesced toast reports what happened every 4 s. Setting: `autoSalvage` ('off' default) in core/Settings; the inventory has the toggle.
 */
export type AutoSalvageMode = 'off' | 'poor' | 'common' | 'unneeded';
export type AutoSalvageAction = 'keep' | 'sell' | 'salvage';

export const AUTO_SALVAGE_MODES: { id: AutoSalvageMode; label: string; help: string }[] = [
  { id: 'off', label: 'Kapalı', help: 'Hiçbir eşya otomatik işlenmez.' },
  { id: 'poor', label: 'Gri', help: 'Gri eşyalar düştüğünde otomatik satılır.' },
  { id: 'common', label: 'Beyaz', help: 'Gri eşyalar satılır, beyaz eşyalar parçalanır.' },
  { id: 'unneeded', label: 'Gereksiz', help: 'Gri satılır, beyaz parçalanır, yeşil eşyalar da yükseltme değilse parçalanır.' },
];

export function currentMode(): AutoSalvageMode {
  const m = G.settings?.data.autoSalvage;
  return m === 'poor' || m === 'common' || m === 'unneeded' ? m : 'off';
}

/** Next mode in the cycle (inventory toggle). */
export function nextMode(m: AutoSalvageMode): AutoSalvageMode {
  const order: AutoSalvageMode[] = ['off', 'poor', 'common', 'unneeded'];
  return order[(order.indexOf(m) + 1) % order.length];
}

/** Items that are never touched (§6.2): locked, unique / set / aspect, upgraded, socketed, on a track, bound Nadir+, anything Nadir+, non-equipment. */
export function isProtected(item: ItemInstance): boolean {
  return !!(
    item.locked || item.listed || item.uniqueId || item.setId || item.aspectId || (item.upgrade ?? 0) > 0 || item.track || item.corrupted ||
    item.sockets?.some((s) => !!s) || rarityIndex(item.rarity) >= rarityIndex('rare') || !isEquipmentItem(item)
  );
}

/** A piece that could fill a slot the character has nothing in (and is not far below the character's level). */
function fillsEmptySlot(item: ItemInstance, equipment: Partial<Record<EquipSlot, ItemInstance>>, level: number): boolean {
  const cat = baseOf(item)?.category;
  if (!cat) return false;
  return slotsForCategory(cat).some((s) => !equipment[s]) && item.itemLevel >= level - 6;
}

/**
 * Is `item` an upgrade (§6.2): usable by the class and either filling an empty slot or scoring above the worst equipped piece
 * of its slot kind. Wrong-class items are never upgrades.
 */
export function isUpgrade(item: ItemInstance, classId: ClassId, equipment: Partial<Record<EquipSlot, ItemInstance>>, level: number): boolean {
  if (!classCanUseItem(classId, item)) return false;
  if (fillsEmptySlot(item, equipment, level)) return true;
  const cat = baseOf(item)?.category;
  const slots = cat ? slotsForCategory(cat) : [];
  let worst = Infinity;
  for (const s of slots) {
    const eq = equipment[s];
    worst = Math.min(worst, eq ? itemScore(eq, classId) : 0);
  }
  return slots.length > 0 && itemScore(item, classId) > worst;
}

/** What to do with a freshly rolled item under a mode (default: the current setting). Pure given the mode and the character. */
export function decide(item: ItemInstance, mode: AutoSalvageMode = currentMode()): AutoSalvageAction {
  if (mode === 'off' || isProtected(item)) return 'keep';
  const ch = G.character;
  const eq = (ch?.save.equipment ?? {}) as Partial<Record<EquipSlot, ItemInstance>>;
  if (item.rarity === 'poor') return 'sell';
  if (mode === 'poor') return 'keep';
  if (item.rarity === 'common') return ch && fillsEmptySlot(item, eq, ch.level) && classCanUseItem(ch.classId, item) ? 'keep' : 'salvage';
  if (mode === 'unneeded' && item.rarity === 'uncommon' && ch) return isUpgrade(item, ch.classId, eq, ch.level) ? 'keep' : 'salvage';
  return 'keep';
}

// ---- processing + coalesced report
const report = { count: 0, sold: 0, gold: 0, yields: new Map<string, number>(), since: 0 };
let clock = 0;
let rng = new RNG(((Date.now() ^ 0x5a17) >>> 0) || 1);

/** Sells or salvages the item (call only when `decide` said so). Returns what it gave, or null for 'keep'. */
export function applyAction(item: ItemInstance, action: AutoSalvageAction): { gold?: number; yields?: { id: string; count: number }[] } | null {
  const ch = G.character;
  if (!ch || action === 'keep') return null;
  if (!report.since) report.since = clock + 0.0001;
  if (action === 'sell') {
    const gold = Math.max(0, sellValue(item));
    if (gold > 0) ch.addGold(gold);
    report.sold++;
    report.gold += gold;
    return { gold };
  }
  const yields = salvageYield(item, rng);
  for (const y of yields) {
    ch.addMaterial(y.id, y.count);
    report.yields.set(y.id, (report.yields.get(y.id) ?? 0) + y.count);
  }
  report.count++;
  bountyEvent('salvage', 1);
  return { yields };
}

/** Per-frame: flushes the coalesced toast every 4 s and shows the one-time hint at level 10. */
export function tick(dt: number): void {
  clock += dt;
  const ch = G.character;
  if (ch && ch.level >= 10 && currentMode() === 'off' && !ch.save.flags['hint.autoSalvage']) {
    ch.save.flags['hint.autoSalvage'] = 1;
    toast('Otomatik Parçala\'yı çantadaki düğmeden açabilirsin.', 'info');
  }
  if (report.since && clock - report.since >= 4) flush();
}

/** Shows the coalesced toast now and clears the counters. */
export function flush(): void {
  if (report.count > 0 || report.sold > 0) {
    const parts: string[] = [];
    if (report.count > 0) {
      const ys = [...report.yields.entries()].map(([id, n]) => `+${n} ${getMaterial(id)?.name ?? id}`).join(', ');
      parts.push(`${report.count} eşya parçalandı${ys ? ` (${ys})` : ''}`);
    }
    if (report.sold > 0) parts.push(`${report.sold} eşya satıldı (+${report.gold} altın)`);
    toast(`Otomatik: ${parts.join(', ')}`, 'info');
  }
  report.count = 0;
  report.sold = 0;
  report.gold = 0;
  report.yields.clear();
  report.since = 0;
}

/** Test hook: the counters of the pending report. */
export function pendingReport(): { count: number; sold: number; gold: number } {
  return { count: report.count, sold: report.sold, gold: report.gold };
}
