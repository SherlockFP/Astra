import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import type { Rarity } from '../types/common';
import type { ItemInstance } from '../types/items';
import { RARITY_ORDER } from '../types/common';
import { MATERIALS, GEM_TYPES, gemId, gemName, type GemType } from '../data/materials';
import { parseGemId } from '../data/gems';
import { MAX_UPGRADE, UPGRADE_STEPS, stepOf, upgradeGold, type UpgradeStep } from '../data/upgrades';
import { baseOf, canEfsun, cleanName, isEquipmentItem, maxUpgradeOf, refreshItemName, rerollAffixes, rerollAffixValues, rerollableAffixIndices, addRandomAffix, rarityIndex, defaultRng } from './ItemGen';
import { bountyEvent } from './Bounties';

export interface UpgradeCost {
  gold: number;
  materials: { id: string; count: number }[];
  successChance: number;        // 0..1
  failOutcome: 'stay' | 'downgrade' | 'destroy';
  protectedBy?: string;         // material id that prevents destroy/downgrade (Kutsama Kağıdı)
  /** items module extras */
  target?: number;              // the level this attempt tries to reach
  bookBonus?: number;           // +pp with Demircinin El Kitabi (0.10)
  failStacksBonus?: number;     // Demircinin Hatirasi bonus already included in successChance
}

export interface UpgradeResult {
  ok: boolean;                  // attempt happened
  success: boolean;
  destroyed: boolean;
  newLevel: number;
  reason?: string;              // Turkish error when !ok
  /** items module extras */
  downgraded?: boolean;
  protectedUsed?: boolean;
  item?: ItemInstance;
}

/**
 * Metin2 / Knight Online style blacksmith (Demirci): +0..+15 upgrades, efsun (affix reroll + locks), gem sockets.
 * Operates on items in G.character (bag or equipment) by uid; emits 'item:upgraded'.
 * The panel plays the anvil animation and the upgrade_* sounds/vfx AFTER calling these (results are synchronous).
 * OWNER: items module.
 */
/** GDD 6.3 unlock levels for blacksmith features. NOT enforced by default (set enforce = true for the shipping progression). */
export const BLACKSMITH_GATES = { enforce: false, upgrade: 10, upgradeHigh: 30, salvage: 10, efsun: 15, combine: 15 };
const BOOK_BONUS = 0.1;
const FAIL_STACK_BONUS = 0.02;
const FAIL_STACK_MAX = 10;

let _rng: RNG | null = null;
let _rngFor = '';
function rng(): RNG {
  const id = G.character?.save.id ?? '';
  if (!_rng || _rngFor !== id) {
    _rng = new RNG(((Date.now() ^ hashString(id)) >>> 0) || 1);
    _rngFor = id;
  }
  return _rng;
}

const matName = (id: string) => MATERIALS[id]?.name ?? id;

function stepMaterials(step: UpgradeStep): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  if (step.kara_demir) out.push({ id: 'kara_demir', count: step.kara_demir });
  if (step.buyulu_toz) out.push({ id: 'buyulu_toz', count: step.buyulu_toz });
  if (step.ejderha_pulu) out.push({ id: 'ejderha_pulu', count: step.ejderha_pulu });
  if (step.ruh_tasi) out.push({ id: 'ruh_tasi', count: step.ruh_tasi });
  return out;
}

/** Cost and odds of the NEXT upgrade attempt of an item (null when it cannot be upgraded further). */
export function upgradeCost(item: ItemInstance, opts: { useBook?: boolean } = {}): UpgradeCost | null {
  if (!isEquipmentItem(item)) return null;
  const up = item.upgrade ?? 0;
  if (up >= maxUpgradeOf(item) || up >= MAX_UPGRADE) return null;
  const target = up + 1;
  const step = stepOf(target);
  const stacksBonus = target >= 10 ? Math.min(FAIL_STACK_MAX, item.failStacks ?? 0) * FAIL_STACK_BONUS : 0;
  const book = opts.useBook ? BOOK_BONUS : 0;
  const failOutcome: UpgradeCost['failOutcome'] = step.fail === 'none' ? 'stay' : step.fail;
  return {
    gold: upgradeGold(item.itemLevel, target),
    materials: stepMaterials(step),
    successChance: Math.min(1, step.chance + stacksBonus + book),
    failOutcome,
    protectedBy: failOutcome === 'stay' ? undefined : 'kutsama_kagidi',
    target, bookBonus: book || undefined, failStacksBonus: stacksBonus || undefined,
  };
}

/** Pure odds helper for tests/UI: chance to reach `target` (1..15). */
export function upgradeChance(target: number, failStacks = 0, useBook = false): number {
  const step = stepOf(target);
  return Math.min(1, step.chance + (target >= 10 ? Math.min(FAIL_STACK_MAX, failStacks) * FAIL_STACK_BONUS : 0) + (useBook ? BOOK_BONUS : 0));
}

/** Pure outcome roll (no state): used by upgradeItem and by the dev simulation. */
export function rollUpgradeOutcome(target: number, opts: { failStacks?: number; useBook?: boolean; useProtection?: boolean } = {}, r: RNG = defaultRng): { success: boolean; outcome: 'success' | 'stay' | 'downgrade' | 'destroy' } {
  const chance = upgradeChance(target, opts.failStacks ?? 0, !!opts.useBook);
  if (r.next() < chance) return { success: true, outcome: 'success' };
  const fail = stepOf(target).fail;
  if (fail === 'none' || fail === 'stay') return { success: false, outcome: 'stay' };
  if (opts.useProtection) return { success: false, outcome: 'stay' };
  return { success: false, outcome: fail };
}

function locate(uid: string) {
  const ch = G.character;
  return ch ? ch.findItem(uid) : null;
}

function finishEquipChange(loc: { where: string; slot?: string }): void {
  const ch = G.character!;
  if (loc.where === 'equipment') {
    ch.recomputeStats();
    G.events.emit('equipment:changed', { slot: loc.slot as string });
  }
  G.events.emit('inventory:changed', {});
  ch.persist();
}

export function upgradeItem(uid: string, opts: { useProtection?: boolean; useBook?: boolean } = {}): UpgradeResult {
  const ch = G.character;
  if (!ch) return { ok: false, success: false, destroyed: false, newLevel: 0, reason: 'Karakter yok.' };
  const f = locate(uid);
  if (!f) return { ok: false, success: false, destroyed: false, newLevel: 0, reason: 'Eşya bulunamadı.' };
  const item = f.item;
  const cur = item.upgrade ?? 0;
  if (item.rarity === 'poor') return { ok: false, success: false, destroyed: false, newLevel: cur, reason: 'Sıradan eşyalar yükseltilemez.' };
  const cost = upgradeCost(item, { useBook: opts.useBook });
  if (!cost) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: cur > 0 && cur >= maxUpgradeOf(item) ? 'Bu eşya en yüksek seviyede.' : 'Eşya yükseltilemez.' };
  const target = cost.target ?? cur + 1;
  if (BLACKSMITH_GATES.enforce) {
    if (target >= 10 && ch.level < BLACKSMITH_GATES.upgradeHigh) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: `+10 ve üstü için ${BLACKSMITH_GATES.upgradeHigh}. seviye gerekir.` };
    if (ch.level < BLACKSMITH_GATES.upgrade) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: `Demirci yükseltmeleri ${BLACKSMITH_GATES.upgrade}. seviyeden itibaren açılır.` };
  }
  if (ch.save.gold < cost.gold) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: 'Yeterli altının yok.' };
  const missing = cost.materials.find((m) => ch.material(m.id) < m.count);
  if (missing) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: `Yeterli malzeme yok: ${matName(missing.id)} ×${missing.count}` };
  const protect = !!opts.useProtection && cost.failOutcome !== 'stay';
  if (protect && ch.material('kutsama_kagidi') < 1) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: 'Kutsama Kağıdın yok.' };
  if (opts.useBook && ch.material('demirci_el_kitabi') < 1) return { ok: false, success: false, destroyed: false, newLevel: cur, reason: 'Demircinin El Kitabın yok.' };

  // pay
  ch.spendGold(cost.gold);
  ch.spendMaterials(cost.materials);
  if (protect) ch.useMaterial('kutsama_kagidi', 1);
  if (opts.useBook) ch.useMaterial('demirci_el_kitabi', 1);

  const roll = rollUpgradeOutcome(target, { failStacks: item.failStacks ?? 0, useBook: opts.useBook, useProtection: protect }, rng());
  let destroyed = false, downgraded = false;
  if (roll.success) {
    item.upgrade = target;
    item.failStacks = 0;
    if (target >= 15) {
      item.sockets = [...(item.sockets ?? []), null];
    }
    refreshItemName(item);
    if (target >= 12) {
      // party-wide announcement (GDD 5.2): local system line + the party sees it as chat from this player
      const clean = cleanName(item.name) || baseOf(item)?.name || 'Eşya';
      G.events.emit('net:chat', { from: 'Demirci', text: `${ch.name}, ${clean} eşyasını +${target}'e yükseltti!`, channel: 'system' });
      try {
        G.net?.broadcast('chat', { text: `${clean} eşyasını +${target}'e yükseltti!` });
      } catch {
        /* offline */
      }
    }
  } else {
    if (target >= 10) item.failStacks = Math.min(FAIL_STACK_MAX, (item.failStacks ?? 0) + 1);
    if (roll.outcome === 'downgrade') {
      item.upgrade = Math.max(0, cur - 1);
      downgraded = true;
      refreshItemName(item);
    } else if (roll.outcome === 'destroy') destroyed = true;
  }
  const newLevel = destroyed ? 0 : item.upgrade ?? 0;
  if (destroyed) ch.removeItem(item.uid);
  else finishEquipChange(f.loc);
  G.events.emit('item:upgraded', { item, success: roll.success, destroyed, newLevel });
  if (roll.success) bountyEvent('upgrade', 1);
  return { ok: true, success: roll.success, destroyed, newLevel, downgraded, protectedUsed: protect && !roll.success, item };
}

// ============================================================================ efsun
const EFSUN_GOLD_BASE = 300;
const EFSUN_GOLD_PER_ILVL = 40;
export function efsunCost(item: ItemInstance, lockedCount: number): { gold: number; materials: { id: string; count: number }[] } | null {
  if (!canEfsun(item) || lockedCount < 0 || lockedCount > 2) return null;
  const mats = [{ id: 'efsun_nesnesi', count: 1 }];
  if (lockedCount === 1) mats.push({ id: 'efsun_kilidi', count: 1 });
  else if (lockedCount === 2) mats.push({ id: 'efsun_kilidi', count: 3 });
  return { gold: EFSUN_GOLD_BASE + EFSUN_GOLD_PER_ILVL * item.itemLevel, materials: mats };
}

/** Reroll unlocked affixes. `locked` = affix indices to keep (costs Efsun Kilidi each). */
export function efsun(uid: string, locked: number[]): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const item = f.item;
  if (!isEquipmentItem(item)) return { ok: false, reason: 'Bu eşyaya efsun yapılamaz.' };
  if (item.rarity === 'common') return { ok: false, reason: 'Normal eşyalara Takviye Nesnesi kullan.' };
  if (item.rarity === 'poor') return { ok: false, reason: 'Sıradan eşyalara efsun yapılamaz.' };
  if (item.rarity === 'set') return { ok: false, reason: 'Set eşyalarına efsun yapılamaz.' };
  if (BLACKSMITH_GATES.enforce && ch.level < BLACKSMITH_GATES.efsun) return { ok: false, reason: `Efsun ${BLACKSMITH_GATES.efsun}. seviyeden itibaren kullanılabilir.` };
  const rerollable = rerollableAffixIndices(item);
  if (!rerollable.length) return { ok: false, reason: 'Değiştirilebilir efsun yok.' };
  const keep = [...new Set(locked)].filter((i) => rerollable.includes(i));
  if (keep.length > 2) return { ok: false, reason: 'En fazla 2 efsun kilitlenebilir.' };
  if (keep.length >= rerollable.length) return { ok: false, reason: 'Tüm efsunlar kilitli.' };
  const cost = efsunCost(item, keep.length);
  if (!cost) return { ok: false, reason: 'Efsun yapılamaz.' };
  if (ch.save.gold < cost.gold) return { ok: false, reason: 'Yeterli altının yok.' };
  const missing = cost.materials.find((m) => ch.material(m.id) < m.count);
  if (missing) return { ok: false, reason: `Yeterli malzeme yok: ${matName(missing.id)} ×${missing.count}` };
  ch.spendGold(cost.gold);
  ch.spendMaterials(cost.materials);
  rerollAffixes(item, keep, rng(), ch.classId);
  finishEquipChange(f.loc);
  return { ok: true };
}

/** Kadim Efsun: reroll only the numbers within their current tiers. */
export function kadimEfsun(uid: string): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  if (!canEfsun(f.item) || !rerollableAffixIndices(f.item).length) return { ok: false, reason: 'Bu eşyada değiştirilebilir efsun yok.' };
  if (!ch.useMaterial('kadim_efsun', 1)) return { ok: false, reason: 'Kadim Efsun yok.' };
  rerollAffixValues(f.item, rng());
  finishEquipChange(f.loc);
  return { ok: true };
}

/** Takviye Nesnesi: adds one random affix (Normal items become Büyülü). */
export function takviye(uid: string): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const item = f.item;
  if (!isEquipmentItem(item) || item.rarity === 'poor' || item.rarity === 'set' || item.rarity === 'legendary') return { ok: false, reason: 'Bu eşyaya efsun eklenemez.' };
  if (ch.material('takviye_nesnesi') < 1) return { ok: false, reason: 'Takviye Nesnesi yok.' };
  const before = item.affixes.length;
  const prevRarity: Rarity = item.rarity;
  if (!addRandomAffix(item, rng(), ch.classId)) {
    item.rarity = prevRarity;
    return { ok: false, reason: 'Efsun sınırına ulaşıldı.' };
  }
  void before;
  ch.useMaterial('takviye_nesnesi', 1);
  finishEquipChange(f.loc);
  return { ok: true };
}

// ============================================================================ sockets & gems
export function maxSocketsOf(item: ItemInstance): number {
  const base = baseOf(item);
  return (base?.maxSockets ?? 1) + ((item.upgrade ?? 0) >= 15 ? 1 : 0);
}
export function addSocketCost(item: ItemInstance): { gold: number; materials: { id: string; count: number }[] } | null {
  if (!isEquipmentItem(item) || item.rarity === 'poor') return null;
  const n = item.sockets?.length ?? 0;
  if (n >= maxSocketsOf(item)) return null;
  return { gold: 5000 * (n + 1), materials: [{ id: 'oyma_kalemi', count: 1 }] };
}

export function socketGem(uid: string, socketIndex: number, gemMaterialId: string): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const item = f.item;
  const gem = parseGemId(gemMaterialId);
  if (!gem) return { ok: false, reason: 'Bu bir taş değil.' };
  if (!item.sockets || socketIndex < 0 || socketIndex >= item.sockets.length) return { ok: false, reason: 'Geçersiz taş yuvası.' };
  if (ch.material(gemMaterialId) < 1) return { ok: false, reason: 'Bu taştan yok.' };
  ch.useMaterial(gemMaterialId, 1);
  item.sockets[socketIndex] = gemMaterialId; // overwriting destroys the old gem
  finishEquipChange(f.loc);
  return { ok: true };
}

/** Remove a gem (500 x grade gold); the gem returns to the pouch. */
export function removeGem(uid: string, socketIndex: number): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const gid = f.item.sockets?.[socketIndex];
  const gem = parseGemId(gid);
  if (!gid || !gem) return { ok: false, reason: 'Yuva boş.' };
  const price = 500 * gem.grade;
  if (!ch.spendGold(price)) return { ok: false, reason: 'Yeterli altının yok.' };
  f.item.sockets![socketIndex] = null;
  ch.addMaterial(gid, 1);
  finishEquipChange(f.loc);
  return { ok: true };
}

export function addSocket(uid: string): { ok: boolean; reason?: string } {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const cost = addSocketCost(f.item);
  if (!cost) return { ok: false, reason: 'Daha fazla yuva açılamaz.' };
  if (ch.save.gold < cost.gold) return { ok: false, reason: 'Yeterli altının yok.' };
  if (ch.material('oyma_kalemi') < 1) return { ok: false, reason: 'Oyma Kalemi yok.' };
  ch.spendGold(cost.gold);
  ch.useMaterial('oyma_kalemi', 1);
  f.item.sockets = [...(f.item.sockets ?? []), null];
  finishEquipChange(f.loc);
  return { ok: true };
}

const COMBINE_GOLD = [100, 500, 2500, 10000, 40000];
const COMBINE_DUST = [0, 1, 3, 6, 10];
export function combineCost(grade: number): { gold: number; materials: { id: string; count: number }[] } | null {
  if (grade < 1 || grade > 5) return null;
  const mats: { id: string; count: number }[] = [];
  if (COMBINE_DUST[grade - 1]) mats.push({ id: 'buyulu_toz', count: COMBINE_DUST[grade - 1] });
  return { gold: COMBINE_GOLD[grade - 1], materials: mats };
}
/** 3 gems of the same type and grade -> 1 of the next grade. */
export function combineGems(type: GemType, grade: number): { ok: boolean; reason?: string; resultId?: string } {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  if (!GEM_TYPES.includes(type)) return { ok: false, reason: 'Geçersiz taş.' };
  const cost = combineCost(grade);
  if (!cost) return { ok: false, reason: 'Bu taş birleştirilemez.' };
  if (BLACKSMITH_GATES.enforce && ch.level < BLACKSMITH_GATES.combine) return { ok: false, reason: `Taş birleştirme ${BLACKSMITH_GATES.combine}. seviyeden itibaren açılır.` };
  const id = gemId(type, grade);
  if (ch.material(id) < 3) return { ok: false, reason: `3 adet ${gemName(type, grade)} gerekir.` };
  if (ch.save.gold < cost.gold) return { ok: false, reason: 'Yeterli altının yok.' };
  const missing = cost.materials.find((m) => ch.material(m.id) < m.count);
  if (missing) return { ok: false, reason: `Yeterli malzeme yok: ${matName(missing.id)} ×${missing.count}` };
  ch.spendGold(cost.gold);
  ch.spendMaterials(cost.materials);
  ch.useMaterial(id, 3);
  const out = gemId(type, grade + 1);
  ch.addMaterial(out, 1);
  return { ok: true, resultId: out };
}

// ============================================================================ salvage (Parçalama)
export interface SalvageResult { ok: boolean; reason?: string; yields: { id: string; count: number }[] }

function salvageYield(item: ItemInstance, r: RNG): { id: string; count: number }[] {
  const out = new Map<string, number>();
  const add = (id: string, n: number) => {
    if (n > 0) out.set(id, (out.get(id) ?? 0) + n);
  };
  switch (item.rarity) {
    case 'poor': if (r.chance(0.5)) add('kara_demir', 1); break;
    case 'common': add('kara_demir', r.int(1, 2)); break;
    case 'uncommon': add('kara_demir', r.int(2, 3)); add('buyulu_toz', 1); break;
    case 'rare': add('kara_demir', r.int(1, 2)); add('buyulu_toz', r.int(2, 4)); if (r.chance(0.1)) add('ejderha_pulu', 1); break;
    case 'epic': add('buyulu_toz', r.int(4, 6)); add('ejderha_pulu', r.int(1, 2)); break;
    default: add('buyulu_toz', r.int(6, 8)); add('ejderha_pulu', r.int(2, 3)); add('ruh_tasi', 1); break;
  }
  // 30% of upgrade materials invested
  const up = item.upgrade ?? 0;
  for (let t = 1; t <= up; t++) {
    const s = UPGRADE_STEPS[t];
    add('kara_demir', Math.floor(s.kara_demir * 0.3));
    add('buyulu_toz', Math.floor(s.buyulu_toz * 0.3));
    add('ejderha_pulu', Math.floor(s.ejderha_pulu * 0.3));
    add('ruh_tasi', Math.floor(s.ruh_tasi * 0.3));
  }
  return [...out.entries()].map(([id, count]) => ({ id, count }));
}

export function salvageItem(uid: string): SalvageResult {
  const ch = G.character;
  const f = locate(uid);
  if (!ch || !f) return { ok: false, reason: 'Eşya bulunamadı.', yields: [] };
  if (f.loc.where === 'equipment') return { ok: false, reason: 'Kuşanılan eşya parçalanamaz.', yields: [] };
  if (f.item.locked) return { ok: false, reason: 'Eşya kilitli.', yields: [] };
  if (!isEquipmentItem(f.item)) return { ok: false, reason: 'Bu eşya parçalanamaz.', yields: [] };
  if (BLACKSMITH_GATES.enforce && ch.level < BLACKSMITH_GATES.salvage) return { ok: false, reason: `Parçalama ${BLACKSMITH_GATES.salvage}. seviyeden itibaren açılır.`, yields: [] };
  const yields = salvageYield(f.item, rng());
  for (const g of f.item.sockets ?? []) if (g) ch.addMaterial(g, 1);
  ch.removeItem(f.item.uid);
  for (const y of yields) ch.addMaterial(y.id, y.count);
  bountyEvent('salvage', 1);
  return { ok: true, yields };
}

/** Salvage every unlocked bag item of a rarity or lower ("Toplu Parçala"). */
export function salvageAll(maxRarity: Rarity): { count: number; yields: { id: string; count: number }[] } {
  const ch = G.character;
  const total = new Map<string, number>();
  let count = 0;
  if (!ch) return { count, yields: [] };
  const limit = rarityIndex(maxRarity);
  for (const it of [...ch.save.bag]) {
    if (!it || it.locked || !isEquipmentItem(it) || rarityIndex(it.rarity) > limit) continue;
    const res = salvageItem(it.uid);
    if (!res.ok) continue;
    count++;
    for (const y of res.yields) total.set(y.id, (total.get(y.id) ?? 0) + y.count);
  }
  return { count, yields: [...total.entries()].map(([id, c]) => ({ id, count: c })) };
}

export { RARITY_ORDER };
