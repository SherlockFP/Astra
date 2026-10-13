import type { ClassId, Rarity } from '../types/common';
import { RARITY_ORDER } from '../types/common';
import type { ItemInstance, RolledAffix } from '../types/items';
import { STAT_IDS, type StatBlock, type StatId } from '../types/stats';
import type { ItemSnapshot, ShopAnnounce, ShopBuyMsg, ShopListingWire, ShopLook, ShopSoldMsg } from '../types/net';
import { ITEM_BASES } from '../data/itemBases';
import { AFFIX_BY_ID } from '../data/affixes';
import { MARKET, MARKET_ZONE_TOWN, CLASS_BODY_COLOR, cleanTitle, spotCount } from '../data/market';
import { clampNum, ident, isObj, sanitizeText } from '../net/messages';

/**
 * CM14 Pazar wire helpers: compact item snapshots for the `shop` announcement, and the sanitisers for everything that arrives on
 * `shop` / `shopBuy` / `shopSold` (all of it comes from strangers). Pure functions: no G, no DOM. OWNER: items module (Pazar).
 */

const STAT_SET: ReadonlySet<string> = new Set(STAT_IDS);
const CLASS_SET: ReadonlySet<string> = new Set(Object.keys(CLASS_BODY_COLOR));
const RARITY_SET: ReadonlySet<string> = new Set(RARITY_ORDER);
const fin = (x: unknown, lo: number, hi: number, d: number): number => clampNum(x, lo, hi, d);
const int = (x: unknown, lo: number, hi: number, d: number): number => Math.round(fin(x, lo, hi, d));
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------------------------------------------------------------------------ snapshots */

type LineIn = { affixId: string; value: number; tier: number; s?: number };

function cleanLine(x: unknown): LineIn | null {
  if (!isObj(x)) return null;
  const affixId = ident(x.affixId, 48);
  if (!affixId || !num(x.value)) return null;
  const out: LineIn = { affixId, value: fin(x.value, -1e6, 1e6, 0), tier: int(x.tier, 0, 12, 1) };
  if (num(x.s)) out.s = int(x.s, 0, 5, 0);
  return out;
}

function cleanStats(x: unknown): StatBlock | undefined {
  if (!isObj(x)) return undefined;
  const out: StatBlock = {};
  let n = 0;
  for (const [k, v] of Object.entries(x)) {
    if (n >= 24) break;
    if (STAT_SET.has(k) && num(v)) {
      out[k as StatId] = fin(v, -1e6, 1e6, 0);
      n++;
    }
  }
  return n ? out : undefined;
}

/** Validates an untrusted snapshot (announcement) or item body (sale). null = unusable (unknown base, wrong shape). */
export function cleanSnapshot(x: unknown): ItemSnapshot | null {
  if (!isObj(x)) return null;
  const baseId = ident(x.baseId, 64);
  if (!baseId || !ITEM_BASES[baseId]) return null;
  const rarity: Rarity = RARITY_SET.has(x.rarity as string) ? (x.rarity as Rarity) : 'common';
  const snap: ItemSnapshot = {
    baseId, rarity, itemLevel: int(x.itemLevel, 0, 999, 1),
    affixes: [],
  };
  if (num(x.upgrade) && x.upgrade > 0) snap.upgrade = int(x.upgrade, 0, 30, 0);
  const name = sanitizeText(x.name, 64);
  if (name) snap.name = name;
  if (Array.isArray(x.affixes)) {
    for (const a of x.affixes.slice(0, 12)) {
      const l = cleanLine(a);
      if (l && !l.s) snap.affixes.push({ affixId: l.affixId, value: l.value, tier: l.tier });
    }
  }
  if (Array.isArray(x.weaponDamage) && num(x.weaponDamage[0]) && num(x.weaponDamage[1])) {
    snap.weaponDamage = [fin(x.weaponDamage[0], 0, 1e6, 0), fin(x.weaponDamage[1], 0, 1e6, 0)];
  }
  const implicit = cleanStats(x.implicit);
  if (implicit) snap.implicit = implicit;
  if (Array.isArray(x.sockets)) snap.sockets = x.sockets.slice(0, 4).map((s) => (typeof s === 'string' ? ident(s, 48) || null : null));
  const unique = ident(x.uniqueId, 48);
  if (unique) snap.uniqueId = unique;
  const set = ident(x.setId, 48);
  if (set) snap.setId = set;
  const crafted = sanitizeText(x.craftedBy, 24);
  if (crafted) snap.craftedBy = crafted;
  if (num(x.mw) && x.mw > 0) snap.mw = int(x.mw, 0, 5, 0);
  const bench = cleanLine(x.bench);
  if (bench) snap.bench = { affixId: bench.affixId, value: bench.value, tier: bench.tier };
  const special = cleanLine(x.special);
  if (special) snap.special = { affixId: special.affixId, value: special.value, tier: special.tier, ...(special.s ? { s: special.s } : {}) };
  if (typeof x.tilsim === 'string') snap.tilsim = ident(x.tilsim, 32) || null;
  return snap;
}

/** The compact copy of an item that goes into a `shop` announcement. */
export function toSnapshot(item: ItemInstance): ItemSnapshot {
  const s: ItemSnapshot = {
    baseId: item.baseId, rarity: item.rarity, itemLevel: item.itemLevel,
    affixes: item.affixes.slice(0, 12).map((a) => ({ affixId: a.affixId, value: round3(a.value), tier: a.tier })),
  };
  if (item.upgrade) s.upgrade = item.upgrade;
  if (item.name) s.name = item.name;
  if (item.weaponDamage) s.weaponDamage = [round3(item.weaponDamage[0]), round3(item.weaponDamage[1])];
  if (item.implicit) {
    const imp: StatBlock = {};
    for (const [k, v] of Object.entries(item.implicit)) if (typeof v === 'number') imp[k as StatId] = round3(v);
    s.implicit = imp;
  }
  if (item.sockets?.length) s.sockets = item.sockets.slice(0, 4);
  if (item.uniqueId) s.uniqueId = item.uniqueId;
  if (item.setId) s.setId = item.setId;
  if (item.craftedBy) s.craftedBy = item.craftedBy;
  if (item.mw) s.mw = item.mw;
  if (item.bench) s.bench = { affixId: item.bench.affixId, value: round3(item.bench.value), tier: item.bench.tier };
  if (item.special) s.special = { affixId: item.special.affixId, value: round3(item.special.value), tier: item.special.tier, ...(item.special.s ? { s: item.special.s } : {}) };
  if (item.tilsim !== undefined) s.tilsim = item.tilsim;
  return s;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function rolled(l: { affixId: string; value: number; tier: number; s?: number }): RolledAffix | null {
  const stat = (AFFIX_BY_ID[l.affixId]?.stat ?? (STAT_SET.has(l.affixId) ? l.affixId : null)) as StatId | null;
  if (!stat) return null;
  return { affixId: l.affixId, stat, value: l.value, tier: l.tier, ...(l.s ? { s: l.s } : {}) };
}

/** Rebuilds a displayable ItemInstance from a snapshot (tooltips of announced listings). Unknown affix ids are dropped. */
export function fromSnapshot(s: ItemSnapshot, uid: string, quantity = 1): ItemInstance {
  const item: ItemInstance = {
    uid, baseId: s.baseId, rarity: s.rarity, itemLevel: s.itemLevel, affixes: [], identified: true,
  };
  for (const a of s.affixes) {
    const r = rolled(a);
    if (r) item.affixes.push(r);
  }
  if (quantity > 1) item.quantity = quantity;
  if (s.upgrade) item.upgrade = s.upgrade;
  if (s.name) item.name = s.name;
  if (s.weaponDamage) item.weaponDamage = [s.weaponDamage[0], s.weaponDamage[1]];
  if (s.implicit) item.implicit = { ...s.implicit };
  if (s.sockets) item.sockets = [...s.sockets];
  if (s.uniqueId) item.uniqueId = s.uniqueId;
  if (s.setId) item.setId = s.setId;
  if (s.craftedBy) item.craftedBy = s.craftedBy;
  if (s.mw) item.mw = s.mw;
  if (s.bench) item.bench = rolled(s.bench);
  if (s.special) item.special = rolled(s.special);
  if (s.tilsim !== undefined) item.tilsim = s.tilsim;
  return item;
}

/** Stack size limit of a base (1 for everything that does not stack). */
export function maxQuantityOf(baseId: string): number {
  const b = ITEM_BASES[baseId];
  return b?.stackable ? b.maxStack ?? 99 : 1;
}

/* ------------------------------------------------------------------------------------------------ full items (sale) */

/** The item body the seller sends in `shopSold`: the instance minus local flags. */
export function toWireItem(item: ItemInstance): ItemInstance {
  const copy = JSON.parse(JSON.stringify(item)) as ItemInstance;
  delete copy.listed;
  delete copy.locked;
  return copy;
}

/**
 * Validates and rebuilds an item that arrived in `shopSold` (untrusted). Whitelisted fields only; `bound`, `locked` and `listed` are
 * never taken from the wire; the buyer gets a fresh uid from `newUid`. null = schema invalid.
 */
export function cleanWireItem(x: unknown, newUid: string): ItemInstance | null {
  if (!isObj(x)) return null;
  const snap = cleanSnapshot(x);
  if (!snap) return null;
  const qty = num(x.quantity) ? int(x.quantity, 1, maxQuantityOf(snap.baseId), 1) : 1;
  const item = fromSnapshot(snap, newUid, qty);
  // lines the snapshot keeps lossy (locked flags, S-tier) and the fields it never carried
  if (Array.isArray(x.affixes)) {
    item.affixes = [];
    for (const a of x.affixes.slice(0, 12)) {
      const l = cleanLine(a);
      const r = l ? rolled(l) : null;
      if (r) {
        if (isObj(a) && a.locked === true) r.locked = true;
        item.affixes.push(r);
      }
    }
  }
  if (x.identified === false) item.identified = false;
  if (num(x.createdAt)) item.createdAt = Math.round(fin(x.createdAt, 0, 4e12, 0));
  if (isObj(x.keystone)) {
    const dungeonId = ident(x.keystone.dungeonId, 48);
    if (dungeonId) item.keystone = { dungeonId, level: int(x.keystone.level, 1, 60, 2), ...(x.keystone.depleted === true ? { depleted: true } : {}) };
  }
  const aspectId = ident(x.aspectId, 48);
  if (aspectId) {
    item.aspectId = aspectId;
    if (num(x.aspectRoll)) item.aspectRoll = fin(x.aspectRoll, 0, 1, 0);
  }
  if (x.exalted === true) item.exalted = true;
  if (x.corrupted === true) item.corrupted = true;
  if (num(x.flaskTier)) item.flaskTier = int(x.flaskTier, 1, 9, 1);
  if (x.broken === true) {
    item.broken = true;
    if (num(x.upgradeBroken)) item.upgradeBroken = int(x.upgradeBroken, 0, 30, 0);
  }
  if (Array.isArray(x.eng)) {
    item.eng = x.eng.slice(0, 4).filter(isObj).map((e) => ({ id: ident(e.id, 32), pts: int(e.pts, 0, 99, 0) })).filter((e) => e.id);
  }
  if (isObj(x.track)) {
    const t = ident(x.track.t, 24);
    if (t) (item as unknown as { track: unknown }).track = { t, b: int(x.track.b, 0, 999, 0), ...(num(x.track.sp) ? { sp: int(x.track.sp, 0, 1e6, 0) } : {}) };
  }
  if (isObj(x.src)) {
    const df = x.src.df === 'h' || x.src.df === 'm' || x.src.df === 'k' ? x.src.df : 'n';
    const src: { d?: string; b?: string; k?: number; df: string } = { df };
    const d = ident(x.src.d, 48), b = ident(x.src.b, 48);
    if (d) src.d = d;
    if (b) src.b = b;
    if (num(x.src.k)) src.k = int(x.src.k, 0, 60, 0);
    (item as unknown as { src: unknown }).src = src;
  }
  return item;
}

/* ------------------------------------------------------------------------------------------------ messages */

export const TX_RE = /^[A-Za-z0-9_-]{6,40}$/;

function cleanLook(x: unknown): ShopLook {
  const o = isObj(x) ? x : {};
  const c = CLASS_SET.has(o.c as string) ? (o.c as ClassId) : 'knight';
  const look: ShopLook = { c, v: int(o.v, 0, 255, 0), n: sanitizeText(o.n, 20) || 'Tüccar', l: int(o.l, 1, 60, 1) };
  if (num(o.t)) look.t = int(o.t, 0, 0xffffff, 0xffffff);
  return look;
}

/** Validates a `shop` announcement. Prices outside the allowed range drop that listing; a bad shape returns null. */
export function sanitizeAnnounce(x: unknown): ShopAnnounce | null {
  if (!isObj(x)) return null;
  const z = ident(x.z, 32) || MARKET_ZONE_TOWN;
  const title = cleanTitle(x.title, 'Tezgâh');
  const open = x.open !== false;
  const big = x.big === true;
  const maxSlots = big ? MARKET.SLOTS_BIG : MARKET.SLOTS;
  const out: ShopAnnounce = {
    z, title,
    // the spot is range-checked against the zone's grid by the receiver (it knows the zone kind); the absolute cap here is the plaza grid
    spot: int(x.spot, 0, spotCount('plaza') - 1, 0),
    rev: int(x.rev, 0, 2 ** 31, 0),
    open, ...(big ? { big: true } : {}),
    look: cleanLook(x.look),
    items: [],
  };
  if (open && Array.isArray(x.items)) {
    const used = new Set<number>();
    for (const e of x.items.slice(0, MARKET.MAX_ITEMS_WIRE)) {
      if (!isObj(e)) continue;
      const s = int(e.s, 0, maxSlots - 1, -1);
      const u = ident(e.u, 40);
      const p = Math.round(fin(e.p, 0, 1e12, 0));
      const it = cleanSnapshot(e.it);
      if (s < 0 || used.has(s) || !u || p < MARKET.MIN_PRICE || p > MARKET.MAX_PRICE || !it) continue;
      used.add(s);
      const q = num(e.q) ? int(e.q, 1, maxQuantityOf(it.baseId), 1) : 1;
      const row: ShopListingWire = { s, u, p, it };
      if (q > 1) row.q = q;
      out.items.push(row);
    }
  }
  return out;
}

export function sanitizeBuy(x: unknown): ShopBuyMsg | null {
  if (!isObj(x) || typeof x.txId !== 'string' || !TX_RE.test(x.txId)) return null;
  const sellerId = typeof x.sellerId === 'string' ? x.sellerId.slice(0, 80) : '';
  const itemUid = ident(x.itemUid, 40);
  if (!sellerId || !itemUid || !num(x.slot) || !num(x.price)) return null;
  const price = Math.round(x.price);
  if (price < MARKET.MIN_PRICE || price > MARKET.MAX_PRICE) return null;
  const buyer = sanitizeText(x.buyer, 20);
  return { txId: x.txId, sellerId, slot: int(x.slot, 0, MARKET.SLOTS_BIG - 1, -1), itemUid, price, ...(buyer ? { buyer } : {}) };
}

/** `shopSold`: the item body is validated later (cleanWireItem needs the buyer's new uid), here it only has to be an object. */
export function sanitizeSold(x: unknown): (Omit<ShopSoldMsg, 'item'> & { item?: unknown }) | null {
  if (!isObj(x) || typeof x.txId !== 'string' || !TX_RE.test(x.txId)) return null;
  const out: Omit<ShopSoldMsg, 'item'> & { item?: unknown } = { txId: x.txId, ok: x.ok === true };
  if (out.ok && isObj(x.item)) out.item = x.item;
  const reason = sanitizeText(x.reason, 80);
  if (reason) out.reason = reason;
  return out;
}

/** Display line of a listing: "Demir Kılıç x3". */
export function listingName(item: ItemInstance): string {
  const base = ITEM_BASES[item.baseId];
  const name = item.name || base?.name || item.baseId;
  return (item.quantity ?? 1) > 1 ? `${name} x${item.quantity}` : name;
}
