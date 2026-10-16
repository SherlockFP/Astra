import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import type { ClassId, Rarity } from '../types/common';
import type { ItemCategory, ItemInstance } from '../types/items';
import { MATERIALS, GEM_TYPES, gemId } from '../data/materials';
import { BASES_BY_CATEGORY, CATEGORY_NAMES_TR, classCanUseBase } from '../data/itemBases';
import { bountyDayKey } from './Bounties';
import { categoriesForClass, defaultRng, generateItem, itemDisplayName, rollRarity, sellValue } from './ItemGen';
import { addWeeklyBought, pvpStockEntries, weeklyBought } from './PvpGear';

/** Merchant / alchemist trading for the local character. OWNER: items module. */
export interface VendorEntry {
  item?: ItemInstance;          // equipment for sale
  materialId?: string;          // stackable (potions, scrolls)
  price: number;
  stock?: number;
  /** items module extras */
  /** Stable key for UI lists. */
  id?: string;
  /** Daily purchase limit (e.g. Efsun Nesnesi 5/day). */
  dailyLimit?: number;
  /** Level needed to use/buy. */
  requiredLevel?: number;
  /** Open world (GDD_OPENWORLD 4.6): pay in this material instead of gold (Kalıntı Tüccarı pays Metin Kalıntısı). */
  currency?: string;
  /** Units of `materialId` per purchase (Dönüş Parşömeni x5 = 5). */
  perUnit?: number;
  /** Daily-limit key (`world.shop.<shopKey>.<day>`) for shop entries; default is the material id. */
  shopKey?: string;
  /** GDD_PVP_FINDER §4.4: purchases per week for this entry (flag `pvp.buy.<weeklyKey>.<week>`). */
  weeklyLimit?: number;
  weeklyKey?: string;
}

/** Vendor kinds: merchant (Kervancı), alchemist, blacksmith (materials), metin (Kalıntı Tüccarı), weaponsmith / armorsmith. */
export type VendorKind = 'merchant' | 'alchemist' | 'bakkal' | 'blacksmith' | 'metin' | 'weaponsmith' | 'armorsmith' | 'pvp_honor' | 'pvp_conquest';

const DAILY_LIMITS: Record<string, number> = { efsun_nesnesi: 5 };

interface Cache { key: string; entries: VendorEntry[] }
const caches: Partial<Record<VendorKind, Cache>> = {};

const buybackItems: { item?: ItemInstance; material?: { id: string; count: number }; price: number }[] = [];
let buybackFor = '';
const BUYBACK_MAX = 12;

function resetIfCharacterChanged(): void {
  const id = G.character?.save.id ?? '';
  if (id !== buybackFor) {
    buybackFor = id;
    buybackItems.length = 0;
    for (const k of Object.keys(caches)) delete caches[k as keyof typeof caches];
  }
}

const boughtKey = (id: string) => `vendor.${bountyDayKey()}.${id}`;
/** Flag key of a daily limit: shop entries use `world.shop.<shopKey>.<day>` (GDD_OPENWORLD 4.6), others `vendor.<day>.<id>`. */
const limitKey = (e: { materialId?: string; shopKey?: string }) =>
  e.shopKey ? `world.shop.${e.shopKey}.${bountyDayKey()}` : boughtKey(e.materialId ?? '');
function boughtToday(e: { materialId?: string; shopKey?: string }): number {
  return Number(G.character?.save.flags[limitKey(e)] ?? 0);
}

/** PvP stock: purchases this week of an entry (its weeklyKey is the vendor kind and stock id). */
function weeklyBoughtOf(e: { weeklyKey?: string }): number {
  return e.weeklyKey ? weeklyBought(pvpKindOf(e.weeklyKey), e.weeklyKey) : 0;
}
function addWeeklyBoughtOf(e: { weeklyKey?: string }, n = 1): void {
  if (e.weeklyKey) addWeeklyBought(pvpKindOf(e.weeklyKey), e.weeklyKey, n);
}
const pvpKindOf = (key: string): 'pvp_honor' | 'pvp_conquest' => (key.startsWith('pvp_honor.') ? 'pvp_honor' : 'pvp_conquest');

function pruneVendorFlags(): void {
  const flags = G.character?.save.flags;
  if (!flags) return;
  const day = bountyDayKey();
  for (const k of Object.keys(flags)) {
    if (k.startsWith('vendor.') && Number(k.split('.')[1]) !== day) delete flags[k];
    else if (k.startsWith('world.shop.') && Number(k.split('.').pop()) !== day) delete flags[k];
  }
}

function materialEntry(id: string, price: number): VendorEntry {
  const lim = DAILY_LIMITS[id];
  const def = MATERIALS[id];
  const entry: VendorEntry = { materialId: id, price, id: 'mat:' + id, requiredLevel: def?.requiredLevel };
  if (lim) {
    entry.dailyLimit = lim;
    entry.stock = Math.max(0, lim - boughtToday(entry));
  }
  return entry;
}

const WEAPON_CATS: ItemCategory[] = ['sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'crossbow', 'bow'];
const ARMOR_CATS: ItemCategory[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];

/**
 * Kalıntı Tüccarı stock (GDD_OPENWORLD 4.6): paid in Metin Kalıntısı, daily caps per product (flag `world.shop.<key>.<day>`).
 * `seed` is per character and day, so the random gem type rotates daily.
 */
function metinShopEntries(level: number, seed: number): VendorEntry[] {
  const rows: { id: string; key: string; price: number; per?: number; cap?: number; lvl: number }[] = [
    { id: 'beceri_kitabi_1', key: 'book1', price: 15, cap: 5, lvl: 5 },
    { id: 'beceri_kitabi_2', key: 'book2', price: 40, cap: 3, lvl: 15 },
    { id: 'beceri_kitabi_3', key: 'book3', price: 100, cap: 1, lvl: 25 },
    { id: 'kara_demir', key: 'kara_demir', price: 8, per: 10, lvl: 5 },
    { id: 'buyulu_toz', key: 'buyulu_toz', price: 14, per: 5, lvl: 10 },
    { id: 'efsun_nesnesi', key: 'efsun', price: 30, cap: 3, lvl: 15 },
    { id: 'takviye_nesnesi', key: 'takviye', price: 20, cap: 3, lvl: 15 },
    { id: 'kutsama_kagidi', key: 'kutsama', price: 120, cap: 1, lvl: 20 },
    { id: 'scroll_town', key: 'scroll', price: 4, per: 5, lvl: 1 },
    { id: 'elixir_wisdom', key: 'wisdom', price: 25, cap: 2, lvl: 5 },
    { id: 'elixir_fortune', key: 'fortune', price: 40, cap: 2, lvl: 20 },
  ];
  const out: VendorEntry[] = [];
  for (const r of rows) {
    const e: VendorEntry = {
      materialId: r.id, price: r.price, id: 'shop:' + r.key, currency: 'metin_kalintisi', perUnit: r.per, shopKey: r.key,
      requiredLevel: r.lvl,
    };
    if (r.cap) {
      e.dailyLimit = r.cap;
      e.stock = Math.max(0, r.cap - boughtToday(e));
    }
    out.push(e);
  }
  // Taş (random gem of the level's grade, 12 Kalıntı, 10 per day)
  const grade = level >= 60 ? 5 : level >= 45 ? 4 : level >= 30 ? 3 : level >= 15 ? 2 : 1;
  const type = GEM_TYPES[hashString(`gemshop:${seed}`) % GEM_TYPES.length];
  const gem: VendorEntry = {
    materialId: gemId(type, grade), price: 12, id: 'shop:gem', currency: 'metin_kalintisi', shopKey: 'gem', dailyLimit: 10,
    requiredLevel: level >= 60 ? 60 : level >= 45 ? 45 : level >= 30 ? 30 : level >= 15 ? 15 : 1,
  };
  gem.stock = Math.max(0, 10 - boughtToday(gem));
  out.push(gem);
  return out;
}

/** Weapon / armour smith stock: six generated items usable by the buyer's class, seeded per character and day. */
function smithEntries(kind: 'weaponsmith' | 'armorsmith', level: number, classId: ClassId, seed: number): VendorEntry[] {
  const allowed = new Set<ItemCategory>(categoriesForClass(classId));
  const pool = (kind === 'weaponsmith' ? WEAPON_CATS : ARMOR_CATS).filter((c) => allowed.has(c));
  const out: VendorEntry[] = [];
  if (!pool.length) return out;
  const rng = new RNG((seed ^ hashString(kind)) >>> 0 || 1);
  const lvl = Math.max(1, Math.min(60, level));
  for (let i = 0; i < 6; i++) {
    const item = generateItem({ itemLevel: lvl, rarity: rng.chance(0.25) ? 'rare' : 'uncommon', classId, category: rng.pick(pool) }, rng);
    out.push({ item, price: Math.max(1, sellValue(item) * 4), id: 'item:' + item.uid, requiredLevel: Math.max(1, item.itemLevel - 2) });
  }
  return out;
}

/**
 * Stock lists. Merchant: equipment (regenerates daily and on level-up); alchemist: potions/scrolls/elixirs; blacksmith: smithing materials;
 * metin: Kalıntı Tüccarı (Metin Kalıntısı, daily caps); weaponsmith / armorsmith: generated equipment (daily).
 */
export function vendorEntries(kind: VendorKind): VendorEntry[] {
  const ch = G.character;
  if (!ch) return [];
  resetIfCharacterChanged();
  pruneVendorFlags();
  const day = bountyDayKey();
  const key = `${ch.save.id}:${day}:${ch.level}`;
  const cached = caches[kind];
  if (cached && cached.key === key) {
    // refresh dynamic stock numbers
    for (const e of cached.entries) {
      if (e.dailyLimit && e.materialId) e.stock = Math.max(0, e.dailyLimit - boughtToday(e));
      if (e.weeklyLimit && e.weeklyKey) e.stock = Math.max(0, e.weeklyLimit - weeklyBoughtOf(e));
    }
    return cached.entries;
  }
  let entries: VendorEntry[] = [];
  if (kind === 'merchant') {
    const items = G.loot.vendorStock(ch.level, hashString(ch.save.id) ^ day);
    entries = items.map((item) => ({ item, price: Math.max(1, sellValue(item) * 4), id: 'item:' + item.uid, requiredLevel: Math.max(1, item.itemLevel - 2) }));
    entries.sort((a, b) => (a.item!.baseId < b.item!.baseId ? -1 : 1));
  } else if (kind === 'alchemist') {
    const ids: string[] = [];
    for (let t = 1; t <= 5; t++) ids.push(`pot_hp_${t}`);
    for (let t = 1; t <= 5; t++) ids.push(`pot_res_${t}`);
    ids.push('scroll_town', 'elixir_wisdom', 'elixir_swiftness', 'elixir_vitality', 'elixir_might', 'elixir_ironskin', 'elixir_fortune');
    for (const id of ids) {
      const def = MATERIALS[id];
      if (!def?.buyPrice) continue;
      // show tiers up to the next unlock so players can see what is coming
      if ((def.requiredLevel ?? 1) > ch.level + 10) continue;
      entries.push(materialEntry(id, def.buyPrice));
    }
  } else if (kind === 'bakkal') {
    // Gümüşdere bakkal: bread, spring water and the hunter's stew (data/consumables.ts)
    for (const id of ['food_kizarmis_ekmek', 'food_kaynak_suyu', 'food_avci_guvec']) {
      const def = MATERIALS[id];
      if (def?.buyPrice) entries.push(materialEntry(id, def.buyPrice));
    }
  } else if (kind === 'metin') {
    entries = metinShopEntries(ch.level, hashString(ch.save.id) ^ day);
  } else if (kind === 'weaponsmith' || kind === 'armorsmith') {
    entries = smithEntries(kind, ch.level, ch.classId, hashString(ch.save.id) ^ day);
  } else if (kind === 'pvp_honor' || kind === 'pvp_conquest') {
    entries = pvpStockEntries(kind, ch.classId, hashString(ch.save.id) ^ day);
  } else {
    const ids = ['kara_demir', 'buyulu_toz', 'efsun_nesnesi', ...GEM_TYPES.map((t) => gemId(t, 1))];
    for (const id of ids) {
      const def = MATERIALS[id];
      if (def?.buyPrice) entries.push(materialEntry(id, def.buyPrice));
    }
  }
  caches[kind] = { key, entries };
  return entries;
}

/** Buy an entry. `count` applies to stackables (potions, scrolls, materials). */
export function buy(entry: VendorEntry, count = 1): { ok: boolean; reason?: string } {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  const n = Math.max(1, Math.floor(count));
  if (entry.item) {
    const item = entry.item;
    if (ch.findItem(item.uid)) return { ok: false, reason: 'Bu eşya zaten satın alındı.' };
    if (entry.weeklyLimit && entry.weeklyKey && weeklyBoughtOf(entry) >= entry.weeklyLimit) return { ok: false, reason: 'Haftalık sınır doldu.' };
    if (entry.currency) {
      if (ch.material(entry.currency) < entry.price) return { ok: false, reason: `Yeterli ${MATERIALS[entry.currency]?.name ?? 'para birimin'} yok.` };
      if (ch.freeBagSlots() <= 0) return { ok: false, reason: 'Çantan dolu!' };
      ch.useMaterial(entry.currency, entry.price);
    } else {
      if (ch.save.gold < entry.price) return { ok: false, reason: 'Yeterli altının yok.' };
      if (ch.freeBagSlots() <= 0) return { ok: false, reason: 'Çantan dolu!' };
      ch.spendGold(entry.price);
    }
    if (entry.weeklyKey) addWeeklyBoughtOf(entry);
    ch.addItem(item);
    // remove from stock
    for (const c of Object.values(caches)) {
      if (!c) continue;
      const i = c.entries.indexOf(entry);
      if (i >= 0) c.entries.splice(i, 1);
    }
    G.events.emit('inventory:changed', {});
    return { ok: true };
  }
  const id = entry.materialId;
  if (!id) return { ok: false, reason: 'Geçersiz ürün.' };
  const def = MATERIALS[id];
  if (def?.requiredLevel && def.requiredLevel > ch.level) return { ok: false, reason: `Gerekli seviye: ${def.requiredLevel}` };
  if (entry.requiredLevel && entry.requiredLevel > ch.level) return { ok: false, reason: `Gerekli seviye: ${entry.requiredLevel}` };
  if (entry.dailyLimit) {
    const left = entry.dailyLimit - boughtToday(entry);
    if (left <= 0) return { ok: false, reason: 'Bugünlük satış limiti doldu.' };
    if (n > left) return { ok: false, reason: `Bugün en fazla ${left} adet daha alabilirsin.` };
  }
  if (entry.weeklyLimit && entry.weeklyKey) {
    const left = entry.weeklyLimit - weeklyBoughtOf(entry);
    if (left <= 0) return { ok: false, reason: 'Haftalık sınır doldu.' };
    if (n > left) return { ok: false, reason: `Bu hafta en fazla ${left} adet daha alabilirsin.` };
  }
  const unit = Math.max(1, entry.perUnit ?? 1);
  const total = entry.price * n;
  const currency = entry.currency;
  if ((currency ? ch.material(currency) : ch.save.gold) < total) {
    return { ok: false, reason: currency ? `Yeterli ${MATERIALS[currency]?.name ?? 'para birimin'} yok.` : 'Yeterli altının yok.' };
  }
  const max = def?.maxStack ?? 9999;
  if (ch.material(id) + n * unit > max) return { ok: false, reason: 'Kesede yer yok (üst sınır).' };
  if (currency) ch.useMaterial(currency, total);
  else ch.spendGold(total);
  ch.addMaterial(id, n * unit);
  if (entry.weeklyKey) {
    addWeeklyBoughtOf(entry, n);
    if (entry.weeklyLimit) entry.stock = Math.max(0, entry.weeklyLimit - weeklyBoughtOf(entry));
  }
  if (entry.dailyLimit) {
    ch.save.flags[limitKey(entry)] = boughtToday(entry) + n;
    entry.stock = Math.max(0, entry.dailyLimit - boughtToday(entry));
  }
  return { ok: true };
}

/** Sell an item from the bag; it can be bought back (last 12). */
export function sell(uid: string): { ok: boolean; gold: number } {
  const ch = G.character;
  if (!ch) return { ok: false, gold: 0 };
  resetIfCharacterChanged();
  const f = ch.findItem(uid);
  if (!f || f.loc.where === 'equipment' || f.item.locked || f.item.listed) return { ok: false, gold: 0 };
  const item = f.item;
  const gold = ch.sellItem(uid);
  if (gold <= 0) return { ok: false, gold: 0 };
  buybackItems.unshift({ item, price: gold });
  if (buybackItems.length > BUYBACK_MAX) buybackItems.pop();
  return { ok: true, gold };
}

/** Sell stackable materials (pouch) at their sell price. */
export function sellMaterial(id: string, count = 1): { ok: boolean; gold: number } {
  const ch = G.character;
  const def = MATERIALS[id];
  if (!ch || !def) return { ok: false, gold: 0 };
  const n = Math.min(Math.max(1, Math.floor(count)), ch.material(id));
  if (n <= 0 || def.sellPrice <= 0) return { ok: false, gold: 0 };
  resetIfCharacterChanged();
  ch.useMaterial(id, n);
  const gold = def.sellPrice * n;
  ch.addGold(gold);
  return { ok: true, gold };
}

export function buyback(index: number): { ok: boolean; reason?: string } {
  const ch = G.character;
  resetIfCharacterChanged();
  const e = buybackItems[index];
  if (!ch || !e) return { ok: false, reason: 'Eşya bulunamadı.' };
  if (ch.save.gold < e.price) return { ok: false, reason: 'Yeterli altının yok.' };
  if (e.item) {
    if (ch.freeBagSlots() <= 0) return { ok: false, reason: 'Çantan dolu!' };
    ch.spendGold(e.price);
    ch.addItem(e.item);
  } else if (e.material) {
    ch.spendGold(e.price);
    ch.addMaterial(e.material.id, e.material.count);
  }
  buybackItems.splice(index, 1);
  return { ok: true };
}

/** Last sold items (newest first); the array index is the index for buyback(index). */
export function buybackList(): ItemInstance[] {
  resetIfCharacterChanged();
  return buybackItems.map((e) => e.item!);
}

/** Same list with the buy-back price of each entry. */
export function buybackEntries(): { item: ItemInstance; price: number }[] {
  resetIfCharacterChanged();
  return buybackItems.map((e) => ({ item: e.item!, price: e.price }));
}

/** Price shown on a bag item in the sell tab. */
export function sellPriceOf(item: ItemInstance): number {
  return sellValue(item);
}

// ============================================================================ Mühürdar (Av Mührü vendor, GDD 6.8)
export interface SealOffer {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** Price in Av Mührü. */
  cost: number;
  kind: 'material' | 'gem' | 'chest';
  materialId?: string;
  count?: number;
  requiredLevel?: number;
  rarity: Rarity;
}

const SEAL_OFFERS: { id: string; cost: number; materialId?: string; count?: number; kind: SealOffer['kind']; requiredLevel?: number; name?: string; desc?: string; icon?: string; rarity?: Rarity }[] = [
  { id: 'seal_kutsama', materialId: 'kutsama_kagidi', cost: 50, kind: 'material' },
  { id: 'seal_kitap', materialId: 'demirci_el_kitabi', cost: 25, kind: 'material' },
  { id: 'seal_efsun', materialId: 'efsun_nesnesi', cost: 20, kind: 'material' },
  { id: 'seal_kilit', materialId: 'efsun_kilidi', cost: 40, kind: 'material' },
  { id: 'seal_takviye', materialId: 'takviye_nesnesi', cost: 15, kind: 'material' },
  { id: 'seal_oyma', materialId: 'oyma_kalemi', cost: 30, kind: 'material' },
  { id: 'seal_gem', cost: 30, kind: 'gem', name: 'Rastgele Taş', desc: 'Seviyene uygun kademede rastgele bir taş.', icon: '/assets/icons/item-gems.svg', rarity: 'rare' },
  { id: 'seal_pulu', materialId: 'ejderha_pulu', count: 3, cost: 20, kind: 'material' },
  { id: 'seal_ruh', materialId: 'ruh_tasi', count: 1, cost: 35, kind: 'material', requiredLevel: 60 },
  { id: 'seal_chest', cost: 60, kind: 'chest', name: 'Mühür Sandığı', desc: 'Seçtiğin türden bir Nadir veya daha iyi eşya (eşya seviyesi = karakter seviyesi).', icon: '/assets/icons/item-chest-locked.svg', rarity: 'epic' },
];

export function sealCount(): number {
  return G.character?.material('av_muhru') ?? 0;
}

/** Offers of the Mühürdar (prices in Av Mührü). */
export function sealOffers(): SealOffer[] {
  return SEAL_OFFERS.map((o) => {
    const def = o.materialId ? MATERIALS[o.materialId] : undefined;
    return {
      id: o.id, kind: o.kind, cost: o.cost, materialId: o.materialId, count: o.count, requiredLevel: o.requiredLevel,
      name: o.name ?? (def ? `${def.name}${o.count && o.count > 1 ? ' ×' + o.count : ''}` : o.id),
      desc: o.desc ?? def?.desc ?? '', icon: o.icon ?? def?.icon ?? '', rarity: o.rarity ?? def?.rarity ?? 'rare',
    };
  });
}

const gemGradeForLevel = (level: number) => (level >= 60 ? 5 : level >= 45 ? 4 : level >= 30 ? 3 : level >= 15 ? 2 : 1);

/** Buy a Mühürdar offer. `category` chooses the slot of the Mühür Sandığı item. */
export function buySealOffer(id: string, category?: ItemCategory): { ok: boolean; reason?: string; item?: ItemInstance; materialId?: string; count?: number } {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  const offer = sealOffers().find((o) => o.id === id);
  if (!offer) return { ok: false, reason: 'Geçersiz ürün.' };
  if (offer.requiredLevel && ch.level < offer.requiredLevel) return { ok: false, reason: `Gerekli seviye: ${offer.requiredLevel}` };
  if (ch.material('av_muhru') < offer.cost) return { ok: false, reason: 'Yeterli Av Mührün yok.' };
  if (offer.kind === 'chest') {
    const cat = category && gambleOptions().some((g) => g.category === category) ? category : undefined;
    if (!cat) return { ok: false, reason: 'Bir eşya türü seç.' };
    if (ch.freeBagSlots() <= 0) return { ok: false, reason: 'Çantan dolu!' };
    const ilvl = Math.max(1, Math.min(60, ch.level));
    const item = rollGambleItem(cat, ilvl, { rare: 80, epic: 18, legendary: 2 }, ch.classId);
    item.bound = true;
    ch.useMaterial('av_muhru', offer.cost);
    ch.addItem(item);
    G.events.emit('ui:toast', { text: `Mühür Sandığı: ${itemDisplayName(item)}`, kind: 'loot' });
    return { ok: true, item };
  }
  if (offer.kind === 'gem') {
    ch.useMaterial('av_muhru', offer.cost);
    const gid = gemId(GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)], gemGradeForLevel(ch.level));
    ch.addMaterial(gid, 1);
    return { ok: true, materialId: gid, count: 1 };
  }
  const mid = offer.materialId!;
  const n = offer.count ?? 1;
  const max = MATERIALS[mid]?.maxStack ?? 9999;
  if (ch.material(mid) + n > max) return { ok: false, reason: 'Kesede yer yok (üst sınır).' };
  ch.useMaterial('av_muhru', offer.cost);
  ch.addMaterial(mid, n);
  return { ok: true, materialId: mid, count: n };
}

// ============================================================================ Gizemli Tüccar (gamble vendor, L25+, GDD 6.4)
export const GAMBLE_MIN_LEVEL = 25;
export interface GambleOption { category: ItemCategory; name: string }

/** Item categories the character's class can gamble for. */
export function gambleOptions(): GambleOption[] {
  const cls = G.character?.classId ?? 'knight';
  return categoriesForClass(cls).map((category) => ({ category, name: CATEGORY_NAMES_TR[category] ?? String(category) }));
}

/** 20 x the sell price of a Normal item at the player's level. */
export function gambleCost(): number {
  const lvl = Math.max(1, G.character?.level ?? 1);
  return 20 * Math.round(5 + 1.2 * lvl);
}

function rollGambleItem(category: ItemCategory, ilvl: number, weights: Partial<Record<Rarity, number>>, classId: ClassId): ItemInstance {
  const rng = defaultRng;
  const rarity = rollRarity(ilvl, { weights }, rng);
  // class-usable base of the highest tier available at this item level
  const pool = (BASES_BY_CATEGORY[category] ?? []).filter((b) => ilvl >= b.itemLevelRange[0] && classCanUseBase(classId, b));
  const topTier = pool.reduce((m, b) => Math.max(m, b.tier ?? 1), 1);
  const best = pool.filter((b) => (b.tier ?? 1) === topTier);
  const base = best.length ? rng.pick(best) : undefined;
  return generateItem({ itemLevel: ilvl, rarity, category, baseId: base?.id, classId }, rng);
}

/** Gamble for an item of a category: Büyülü 70 / Nadir 25 / Destansı 4.5 / Efsanevi 0.5, item level = character level. */
export function gamble(category: ItemCategory): { ok: boolean; reason?: string; item?: ItemInstance; cost?: number } {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  if (ch.level < GAMBLE_MIN_LEVEL) return { ok: false, reason: `Gizemli Tüccar ${GAMBLE_MIN_LEVEL}. seviyeden itibaren açılır.` };
  if (!gambleOptions().some((o) => o.category === category)) return { ok: false, reason: 'Bu tür için kumar oynanamaz.' };
  const cost = gambleCost();
  if (ch.save.gold < cost) return { ok: false, reason: 'Yeterli altının yok.' };
  if (ch.freeBagSlots() <= 0) return { ok: false, reason: 'Çantan dolu!' };
  const item = rollGambleItem(category, Math.max(1, Math.min(60, ch.level)), { uncommon: 70, rare: 25, epic: 4.5, legendary: 0.5 }, ch.classId);
  if (item.rarity === 'legendary' || item.rarity === 'set') item.bound = true;
  ch.spendGold(cost);
  ch.addItem(item);
  return { ok: true, item, cost };
}
