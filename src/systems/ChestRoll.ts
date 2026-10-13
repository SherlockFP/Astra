import type { RNG } from '../core/utils';
import type { ClassId, Rarity } from '../types/common';
import type { ItemInstance } from '../types/items';
import { CHEST_FINAL, SMART_LOOT, chestRuleFor, chestStones, type ChestCtxId, type LootTableDef } from '../data/loot';
import { CLASS_SET, UNIQUES } from '../data/uniques';
import { generateItem, generateUnique } from './ItemGen';
import { addPity, hardPityDue, isSeen, markSeen, namedChance, namedMiss, noteNamed, noteSmart, pityMult, resetPity, smartForced, type Flags } from './LootPity';
import { stampTrack } from './Track';

/**
 * Loot V3 §2 boss chest roll, without the chest entity: the contents are rolled here and LootSystem drops them as the boss's
 * personal ground items (the beams already exist). OWNER: items module. Rules (§2.2, data/loot.ts CHEST_RULES):
 *  - 1 guaranteed item (2 while levelling in Normal, 2 in the open world) + a chance of one more;
 *  - the boss's named item (LootTableDef.uniqueIds) replaces the first guaranteed item with a per-boss chance that grows with
 *    every chest without one (named pity, hard at 16 misses);
 *  - the guaranteed generic item is Nadir+ (weights per context, the legendary weight times the pity multiplier); at hard pity
 *    (30) it is forced to legendary / set; every legendary, set or named item resets the pity, otherwise the chest adds 1;
 *  - 70 % of items are smart; two non-smart guaranteed items in a row force the third smart;
 *  - Yiğitlik Taşı of the context's grade (credited by the caller) and a track stamp on every equipment piece.
 */
export interface ChestCtx {
  bossId: string;
  ctx: ChestCtxId;
  keyLevel: number;
  final: boolean;
  /** Item level of the chest items (the caller's ladder). */
  ilvl: number;
  classId: ClassId;
  /** The boss's loot table (focus, setChance, uniqueIds = its named items). */
  table?: LootTableDef;
  /** Magic find (fraction): only used by the open-world chest, whose rarity weights are the boss rank weights. */
  magicFind?: number;
}

export interface ChestResult {
  items: ItemInstance[];
  /** The named item of the chest, when it dropped (also in `items`). */
  named: ItemInstance | null;
  stones: { id: string; count: number } | null;
  /** Hard pity forced a legendary / set. */
  hardPity: boolean;
}

/** Which chest context a kill belongs to. `openWorld` = outside a dungeon (world bosses). */
export function chestCtxOf(difficulty: string | undefined, keyLevel: number, openWorld: boolean): ChestCtxId {
  if (openWorld || !difficulty) return 'world';
  if (difficulty === 'mythicplus' && keyLevel >= 2) return 'mplus';
  if (difficulty === 'mythic' || difficulty === 'mythicplus') return 'mythic0';
  if (difficulty === 'heroic') return 'heroic';
  return 'normal';
}

/** Picks the named item of a boss: not-yet-seen x1, seen x0.25, wrong class x0.3 (the class rule stays soft). */
export function pickNamed(ids: readonly string[], classId: ClassId, flags: Flags, rng: RNG): string {
  const weights = ids.map((id) => {
    const u = UNIQUES[id];
    let w = isSeen(flags, id) ? 0.25 : 1;
    if (u?.classes && !u.classes.includes(classId)) w *= 0.3;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= weights[i];
    if (r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

/** The final-boss second-item chance (x2, capped). */
export function secondChance(base: number, final: boolean, ctx: ChestCtxId): number {
  if (!final) return base;
  return ctx === 'mplus' ? Math.min(0.6, base * 1.5) : Math.min(CHEST_FINAL.secondCap, base * CHEST_FINAL.second);
}

/** Rolls one boss chest. Updates the pity / named-pity / smart counters in `flags` (the character's save.flags). */
export function rollBossChest(c: ChestCtx, flags: Flags, rng: RNG): ChestResult {
  const rule = chestRuleFor(c.ctx, c.keyLevel);
  const items: ItemInstance[] = [];
  let named: ItemInstance | null = null;
  let hardPity = false;
  const ids = c.table?.uniqueIds ?? [];

  // ---- named channel (replaces the first guaranteed item)
  if (ids.length && rule.named > 0) {
    const p = namedChance(rule.named, namedMiss(flags, c.bossId), c.final);
    if (rng.chance(p)) {
      const id = pickNamed(ids, c.classId, flags, rng);
      named = generateUnique(id, c.ilvl, rng, c.classId);
      markSeen(flags, id);
      noteNamed(flags, c.bossId, true);
    } else noteNamed(flags, c.bossId, false);
  }
  if (named) items.push(named);

  // ---- generic guaranteed items
  const setChance = c.table?.setChance ?? 0.1;
  for (let i = items.length; i < rule.items; i++) {
    const smart = smartForced(flags) || rng.chance(SMART_LOOT);
    noteSmart(flags, smart);
    let rarity: Rarity | undefined;
    if (!hardPity && hardPityDue(flags)) {
      hardPity = true;
      rarity = CLASS_SET[c.classId] && rng.chance(0.5) ? 'set' : 'legendary';
    }
    const weights = rule.weights ? { ...rule.weights } : undefined;
    if (weights && weights.legendary) weights.legendary *= pityMult(flags);
    items.push(generateItem({
      itemLevel: c.ilvl, classId: c.classId, smart, rarity,
      rarityCtx: weights ? { weights, minRarity: 'rare', allowSet: true } : { rank: 'boss', magicFind: c.magicFind, minRarity: 'rare', legendaryMult: pityMult(flags), allowSet: true },
      focus: c.table?.focus, setChance,
    }, rng));
  }

  // ---- the second item
  if (rng.chance(secondChance(rule.second, c.final, c.ctx))) {
    const smart = rng.chance(SMART_LOOT);
    const weights = rule.weights ? { ...rule.weights } : undefined;
    items.push(generateItem({
      itemLevel: c.ilvl, classId: c.classId, smart,
      rarityCtx: weights ? { weights, minRarity: 'uncommon', allowSet: true } : { rank: 'boss', magicFind: c.magicFind, minRarity: 'uncommon', allowSet: true },
      focus: c.table?.focus, setChance,
    }, rng));
  }

  // ---- pity bookkeeping: a legendary / set / named item resets it, otherwise the chest adds one
  if (items.some((it) => it.rarity === 'legendary' || it.rarity === 'set')) resetPity(flags);
  else addPity(flags, 1);

  // ---- bound + track stamp
  const src = { b: c.bossId, k: c.keyLevel, df: c.ctx === 'normal' || c.ctx === 'world' ? 'n' : c.ctx === 'heroic' ? 'h' : c.ctx === 'mythic0' ? 'm' : 'k' } as const;
  for (const it of items) {
    it.bound = true;
    it.src = { ...src };
    stampTrack(it, c.ctx, c.keyLevel);
  }
  return { items, named, stones: chestStones(c.ctx, c.keyLevel, c.final), hardPity };
}
