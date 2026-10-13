import { G } from '../game/G';
import type { CharacterState } from './CharacterState';
import { RARITY_ORDER } from '../types/common';
import type { ItemInstance, EquipSlot } from '../types/items';
import type { MarketSaleRecord, MarketSaveData } from '../types/character';
import type { ShopAnnounce, ShopBuyMsg, ShopListingWire, ShopLook, ShopSoldMsg } from '../types/net';
import type { LobbyTransport } from '../net/lobby';
import type { Unsubscribe } from '../net/transport';
import {
  BOHCA_BIG_ID, BOHCA_DEFS, BOHCA_ID, MARKET, MARKET_ALLOW_BOUND, MARKET_ZONE_TOWN, assignSpot, cleanTitle, districtRadius, homeSpot, listingFee,
  marketSpots, saleNet, saleTax, spotCount, spotPriority, DEFAULT_TITLES, type MarketKind, type MarketOrigin, type MarketSpot,
} from '../data/market';
import { baseOf, slotsForCategory } from './ItemGen';
import { cleanWireItem, fromSnapshot, listingName, sanitizeAnnounce, sanitizeBuy, sanitizeSold, toSnapshot, toWireItem } from './MarketWire';
import { emit, toast } from './notify';
import { siegeTaxMult } from './SiegeRules';

/**
 * CM14 PAZAR - Metin2-style AFK player shops (docs/CORE_MECHANICS.md §11). OWNER: items module.
 *
 * Trust model (co-op, no server): the SELLER is authoritative over the item (it removes it from its bag, credits itself the price
 * minus the 3 % Pazar Vergisi and answers `shopSold`), the BUYER is authoritative over the gold (it reserves the price locally and
 * refunds it on a reject / timeout). Plausibility checks only: price >= 1, item schema valid, the listing still exists at the same
 * price and uid, the buyer was in range, rate limits, txId dedup on both sides.
 *
 * Transport: the three shop channels (`shop` announce, `shopBuy`, `shopSold`) ride the global LOBBY room, so buyers and sellers need
 * not share a party instance. Offline (?net=offline) there is no transport and everything still works locally: the own stall is part
 * of `stalls` like every announced one.
 *
 * Spots: `hash(sellerId) mod spots` + linear probing over the occupied set (data/market.ts assignSpot). The announcement carries the
 * pick; a race on one spot is settled by `spotPriority` on every client, the loser re-picks and re-announces.
 */

/* ------------------------------------------------------------------------------------------------ types */

/** A listing as the UI sees it (seller side: backed by a real bag item; buyer side: rebuilt from the snapshot). */
export interface ListingView {
  slot: number;
  uid: string;
  price: number;
  qty: number;
  item: ItemInstance;
}

export interface Stall {
  sellerId: string;
  zone: string;
  spot: number;
  title: string;
  rev: number;
  big: boolean;
  look: ShopLook;
  listings: ListingView[];
  /** performance-independent ms clock of the last announcement (ctx.now). */
  lastSeen: number;
  own: boolean;
  /** Lost a spot race: kept out of the world and the search until it re-announces elsewhere. */
  hidden: boolean;
}

interface OwnListing {
  slot: number;
  uid: string;
  price: number;
}

export interface OwnShop {
  title: string;
  zone: string;
  spot: number;
  big: boolean;
  licence: string;
  listings: OwnListing[];
  openedAt: number;
  rev: number;
  /** Sales of this session (newest last). */
  sales: MarketSaleRecord[];
  grossGold: number;
  netGold: number;
}

export interface MarketResult {
  ok: boolean;
  reason?: string;
}

interface Pending {
  txId: string;
  sellerId: string;
  slot: number;
  itemUid: string;
  price: number;
  baseId: string;
  qty: number;
  t0: number;
}

export interface SearchFilter {
  text?: string;
  slot?: EquipSlot | 'any';
  /** Minimum rarity index (RARITY_ORDER). */
  minRarity?: number;
  /** Stat id that must appear among the affix / implicit lines. */
  stat?: string;
  /** Minimum number of efsun (affix) lines. */
  minAffixes?: number;
  minPrice?: number;
  maxPrice?: number;
  zone?: string;
  sort?: 'price' | 'rarity' | 'ilvl';
}

export interface SearchRow {
  stall: Stall;
  listing: ListingView;
  unit: number;
  /** Average observed unit price of this item base (null = first sighting). */
  avg: number | null;
}

export interface PriceHistory {
  n: number;
  min: number;
  max: number;
  avg: number;
  last: number;
}

/** Everything Market needs from the outside; tests replace it (two characters in one process). */
export interface MarketCtx {
  character(): CharacterState | null;
  now(): number;
  /** Local player's ground position, null when no scene. */
  playerPos(): { x: number; z: number } | null;
  /** Move the local player to a seat (fx + camera snap are the caller's business). */
  teleport(x: number, z: number, yaw: number): void;
  newId(): string;
  /** True when a lobby connection is expected (online play): a stall waits for it so its spot is hashed from the real peer id. */
  expectNetwork?(): boolean;
}

const defaultCtx: MarketCtx = {
  character: () => G.character,
  now: () => Date.now(),
  playerPos: () => {
    const p = G.player;
    return p ? { x: p.position.x, z: p.position.z } : null;
  },
  teleport: (x, z, yaw) => {
    const p = G.player;
    if (!p) return;
    const y = G.world?.groundY?.(x, z) ?? p.position.y;
    p.position.set(x, y, z);
    p.yaw = yaw;
    try {
      (G.camera as unknown as { snap?: () => void } | null)?.snap?.();
    } catch {
      /* camera not ready */
    }
  },
  newId: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5),
  expectNetwork: () => !!G.net?.defaultTransport,
};

const BOHCA_SLOTS: Record<string, number> = { [BOHCA_ID]: MARKET.SLOTS, [BOHCA_BIG_ID]: MARKET.SLOTS_BIG };

const fmt = (n: number): string => Math.round(n).toLocaleString('tr-TR');
const baseKey = (it: ItemInstance): string => it.uniqueId ?? it.baseId;

/* ------------------------------------------------------------------------------------------------ Market */

export class Market {
  /** Every known stall by seller id, own included. */
  readonly stalls = new Map<string, Stall>();
  own: OwnShop | null = null;
  /** Mounted market district (null outside town / villages). */
  origin: MarketOrigin | null = null;
  spots: MarketSpot[] = [];
  /** Local transport self id (offline: 'local'). */
  selfId = 'local';
  pin: { zone: string; x: number; z: number; label: string; sellerId: string } | null = null;
  readonly history = new Map<string, number[]>();

  private tr: LobbyTransport | null = null;
  private offs: Unsubscribe[] = [];
  private releaseLease: (() => void) | null = null;
  private wantConnected = false;
  private connecting = false;
  /** The lobby could not be opened (or there is none): stalls then work offline-only. */
  private netFailed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private announceAt = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly expired = new Map<string, Pending & { until: number }>();
  private readonly finished = new Set<string>();
  private readonly replies = new Map<string, ShopSoldMsg>();
  private readonly buyerTimes = new Map<string, number[]>();
  private initFor: string | null = null;

  constructor(private ctx: MarketCtx = defaultCtx, opts: { autoTick?: boolean } = {}) {
    if (opts.autoTick !== false) this.timer = setInterval(() => this.tick(), 1000);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.detach();
  }

  get ch(): CharacterState | null {
    return this.ctx.character();
  }

  /* ------------------------------------------------------------------------ session / transport */

  /** Per character: clear stale `listed` flags (a closed tab cannot close the stall) and show the next-login summary once. */
  init(): void {
    const ch = this.ch;
    if (!ch) return;
    if (this.initFor === ch.save.id) return;
    this.initFor = ch.save.id;
    if (!this.own) {
      let cleared = false;
      for (const it of ch.save.bag) {
        if (it?.listed) {
          delete it.listed;
          cleared = true;
        }
      }
      if (cleared) ch.persist();
    }
    const m = ch.save.market;
    if (m && m.unseenCount > 0) {
      toast(`Pazar özeti: ${m.unseenCount} eşya satıldı, ${fmt(m.unseenGold)} altın kazandın.`, 'success');
      m.unseenCount = 0;
      m.unseenGold = 0;
      ch.persist();
    }
  }

  /** Join the global lobby room (async; safe to call repeatedly). Offline there is nothing to join and that is fine. */
  async connect(lease?: () => Promise<{ tr: LobbyTransport; release: () => void } | null>): Promise<void> {
    this.wantConnected = true;
    if (this.tr || this.connecting) return;
    this.connecting = true;
    try {
      const l = await (lease ?? (() => G.net?.leaseLobby?.() ?? Promise.resolve(null)))();
      if (!l) {
        this.netFailed = true;
        return;
      }
      this.netFailed = false;
      if (!this.wantConnected || this.tr) {
        l.release();
        return;
      }
      this.attach(l.tr, l.release);
    } catch (e) {
      this.netFailed = true;
      console.warn('[market] lobby unavailable', e);
    } finally {
      this.connecting = false;
    }
  }

  disconnect(): void {
    this.wantConnected = false;
    this.detach();
  }

  /** Bind to a lobby transport (tests pass a fake one). */
  attach(tr: LobbyTransport, release?: () => void): void {
    this.detach();
    this.tr = tr;
    this.selfId = tr.selfId;
    this.releaseLease = release ?? null;
    this.offs.push(
      tr.on('shop', (d, meta) => this.onShop(d, meta.from)),
      tr.on('shopBuy', (d, meta) => this.onShopBuy(d, meta.from)),
      tr.on('shopSold', (d, meta) => this.onShopSold(d, meta.from)),
      tr.onPeerLeave((peer) => this.removeStall(peer)),
      tr.onPeerJoin((peer) => {
        if (this.own) this.send('shop', this.buildAnnounce(), peer);
      }),
    );
    if (this.own) {
      // our stall was opened offline / before the lobby: re-key it under the real peer id and tell everybody
      const mine = [...this.stalls.values()].find((s) => s.own);
      if (mine && mine.sellerId !== this.selfId) {
        this.stalls.delete(mine.sellerId);
        mine.sellerId = this.selfId;
        this.stalls.set(this.selfId, mine);
      }
      this.announce(true);
    }
    emit('market:changed', { what: 'stalls' });
  }

  detach(): void {
    for (const o of this.offs.splice(0)) o();
    const tr = this.tr;
    this.tr = null;
    if (tr && this.own) this.send('shop', { ...this.buildAnnounce(), open: false, items: [] }, undefined, tr);
    const rel = this.releaseLease;
    this.releaseLease = null;
    rel?.();
  }

  get connected(): boolean {
    return this.tr !== null;
  }

  /* ------------------------------------------------------------------------ district */

  /** The scene's market district (town plaza / village corner). Closes nothing; unmount() does. */
  mount(o: MarketOrigin): void {
    this.origin = o;
    this.spots = marketSpots(o);
    this.resolveConflicts();
    emit('market:changed', { what: 'stalls' });
  }

  unmount(): void {
    if (this.own) this.closeShop('Pazardan ayrıldın, tezgâh kapandı.');
    this.origin = null;
    this.spots = [];
    this.setPin(null);
    emit('market:changed', { what: 'stalls' });
  }

  spotPos(zone: string, spot: number): MarketSpot | null {
    if (!this.origin || this.origin.zone !== zone) return null;
    return this.spots[spot] ?? null;
  }

  /** Stalls of the mounted zone that are not hidden (what the world draws). */
  visibleStalls(): Stall[] {
    const z = this.origin?.zone;
    return z ? [...this.stalls.values()].filter((s) => s.zone === z && !s.hidden) : [];
  }

  /** True when the open own stall exists and the player stands within `maxDist` metres of the seat. */
  nearOwnSeat(maxDist: number): boolean {
    const o = this.own;
    const sp = o ? this.spotPos(o.zone, o.spot) : null;
    const pp = this.ctx.playerPos();
    return !!sp && !!pp && Math.hypot(pp.x - sp.seatX, pp.z - sp.seatZ) <= maxDist;
  }

  /** Distance from the local player to a stall in the mounted zone (Infinity when unknown). */
  distanceTo(stall: Stall): number {
    const sp = this.spotPos(stall.zone, stall.spot);
    const pp = this.ctx.playerPos();
    return sp && pp ? Math.hypot(pp.x - sp.x, pp.z - sp.z) : Infinity;
  }

  /* ------------------------------------------------------------------------ own stall */

  /** Bag items that may be listed right now. */
  listableItems(): ItemInstance[] {
    const ch = this.ch;
    if (!ch) return [];
    return ch.save.bag.filter((it): it is ItemInstance => !!it && this.whyNotListable(it) === null);
  }

  /** Turkish reason an item cannot go on a stall, null when it can. */
  whyNotListable(it: ItemInstance): string | null {
    if (it.listed) return 'Zaten tezgâhta.';
    if (it.locked) return 'Kilitli eşya. Kilidi aç.';
    if (it.bound && !MARKET_ALLOW_BOUND) return 'Ruha bağlı eşya satılamaz.';
    if (!baseOf(it)) return 'Bilinmeyen eşya.';
    return null;
  }

  /**
   * Opens the stall. `listings` = bag item uids with their total price. One licence is consumed (Büyük Bohça for 13..24 slots).
   * Pays the 1 % listing fee, locks the items (`item.listed`), picks the spot, moves the player to the seat and announces.
   */
  openShop(input: { title: string; listings: { uid: string; price: number }[]; licence?: string }): MarketResult {
    const ch = this.ch;
    if (!ch) return { ok: false, reason: 'Karakter yok.' };
    if (this.own) return { ok: false, reason: 'Zaten bir tezgâhın açık.' };
    if (!this.origin) return { ok: false, reason: 'Burada pazar yok. Pazar Meydanı\'na ya da bir köy pazarına git.' };
    if (this.ctx.expectNetwork?.() && !this.tr && !this.netFailed) return { ok: false, reason: 'Pazar ağına bağlanılıyor. Birkaç saniye sonra tekrar dene.' };
    const pp = this.ctx.playerPos();
    if (pp && Math.hypot(pp.x - this.origin.x, pp.z - this.origin.z) > districtRadius(this.origin.kind)) {
      return { ok: false, reason: 'Tezgâh açmak için pazar alanının içinde olmalısın.' };
    }
    // licence: the one asked for, else the smallest one that fits (a Büyük Bohça serves a short list only if it is all the player has)
    let licence = input.licence && BOHCA_SLOTS[input.licence] ? input.licence : BOHCA_ID;
    if (!input.licence) {
      if (input.listings.length > MARKET.SLOTS) licence = BOHCA_BIG_ID;
      else if (ch.material(BOHCA_ID) < 1 && ch.material(BOHCA_BIG_ID) > 0) licence = BOHCA_BIG_ID;
    }
    const slots = BOHCA_SLOTS[licence];
    if (ch.material(licence) < 1) return { ok: false, reason: (licence === BOHCA_BIG_ID ? 'Büyük Bohça' : 'Pazar Bohçası') + ' gerekir. Tezgâh Ustası\'ndan al.' };
    if (input.listings.length < 1) return { ok: false, reason: 'Tezgâha en az bir eşya koy.' };
    if (input.listings.length > slots) return { ok: false, reason: `Bu bohçayla en fazla ${slots} eşya konur.` };
    const title = cleanTitle(input.title, '');
    if (!title) return { ok: false, reason: 'Tezgâha bir isim ver.' };

    const seen = new Set<string>();
    let total = 0;
    const rows: OwnListing[] = [];
    for (const l of input.listings) {
      if (seen.has(l.uid)) return { ok: false, reason: 'Aynı eşya iki kez konamaz.' };
      seen.add(l.uid);
      const f = ch.findItem(l.uid);
      if (!f || f.loc.where !== 'bag') return { ok: false, reason: 'Eşya çantanda değil.' };
      const why = this.whyNotListable(f.item);
      if (why) return { ok: false, reason: `${listingName(f.item)}: ${why}` };
      const price = Math.round(l.price);
      if (!Number.isFinite(price) || price < MARKET.MIN_PRICE || price > MARKET.MAX_PRICE) return { ok: false, reason: `${listingName(f.item)}: fiyat 1 ile ${fmt(MARKET.MAX_PRICE)} arasında olmalı.` };
      total += price;
      rows.push({ slot: rows.length, uid: l.uid, price });
    }
    const fee = listingFee(total);
    if (ch.save.gold < fee) return { ok: false, reason: `Tezgâh harcı için ${fmt(fee)} altın gerekir.` };
    const count = spotCount(this.origin.kind);
    const spot = assignSpot(this.selfId, count, this.occupiedSpots(this.origin.zone, this.selfId));
    if (spot < 0) return { ok: false, reason: 'Pazar dolu. Biraz sonra tekrar dene.' };

    // all checks passed: commit
    if (!ch.spendGold(fee)) return { ok: false, reason: 'Altın yetmiyor.' };
    if (!ch.useMaterial(licence, 1)) {
      ch.addGold(fee); // cannot happen after the check above; stay safe
      return { ok: false, reason: 'Bohça bulunamadı.' };
    }
    for (const r of rows) {
      const f = ch.findItem(r.uid);
      if (f) f.item.listed = true;
    }
    const now = this.ctx.now();
    this.own = {
      title, zone: this.origin.zone, spot, big: slots > MARKET.SLOTS, licence, listings: rows, openedAt: now,
      rev: Math.floor(now / 1000), sales: [], grossGold: 0, netGold: 0,
    };
    this.syncOwnStall();
    ch.persist(true);
    emit('inventory:changed', {});
    const sp = this.spotPos(this.origin.zone, spot);
    if (sp) this.ctx.teleport(sp.seatX, sp.seatZ, sp.yaw);
    this.announce(true);
    toast(`Tezgâhın açıldı: "${title}". Harç: ${fmt(fee)} altın.`, 'success');
    emit('market:changed', { what: 'own' });
    return { ok: true };
  }

  /** Closes the stall: unlocks the items, withdraws the announcement, shows the session summary. */
  closeShop(message?: string): void {
    const ch = this.ch;
    const o = this.own;
    if (!o) return;
    if (ch) {
      for (const l of o.listings) {
        const f = ch.findItem(l.uid);
        if (f) delete f.item.listed;
      }
      // belt and braces: no stale flag survives a close
      for (const it of ch.save.bag) if (it?.listed) delete it.listed;
      const m = this.market(ch);
      m.unseenCount = 0;
      m.unseenGold = 0;
      ch.persist(true);
      emit('inventory:changed', {});
    }
    this.send('shop', { ...this.buildAnnounce(), open: false, items: [] });
    this.stalls.delete(this.selfId);
    this.own = null;
    const sold = o.sales.length;
    toast(message ?? (sold ? `Tezgâh kapandı: ${sold} eşya satıldı, ${fmt(o.netGold)} altın kazandın.` : 'Tezgâh kapandı.'), sold ? 'success' : 'info');
    emit('market:changed', { what: 'own' });
    emit('market:changed', { what: 'stalls' });
  }

  /** Change the price of a listed slot (no fee). */
  setPrice(slot: number, price: number): MarketResult {
    const o = this.own;
    const row = o?.listings.find((l) => l.slot === slot);
    const p = Math.round(price);
    if (!o || !row) return { ok: false, reason: 'Böyle bir göz yok.' };
    if (!Number.isFinite(p) || p < MARKET.MIN_PRICE || p > MARKET.MAX_PRICE) return { ok: false, reason: 'Geçersiz fiyat.' };
    row.price = p;
    this.syncOwnStall();
    this.announce(true);
    emit('market:changed', { what: 'own' });
    return { ok: true };
  }

  /** Buy a stall licence (Pazar Bohçası / Büyük Bohça) from the Tezgâh Ustası for gold. */
  buyLicence(id: string): MarketResult {
    const ch = this.ch;
    const def = BOHCA_DEFS.find((b) => b.id === id);
    if (!ch || !def) return { ok: false, reason: 'Böyle bir bohça yok.' };
    if (!ch.spendGold(def.price)) return { ok: false, reason: 'Altının yetmiyor.' };
    ch.addMaterial(def.id, 1);
    ch.persist(true);
    toast(`${def.name} satın alındı (${fmt(def.price)} altın).`, 'success');
    return { ok: true };
  }

  /** Take one item off the stall (it stays in the bag, unlocked). Closing is automatic when the last one goes. */
  delist(slot: number): MarketResult {
    const o = this.own;
    const ch = this.ch;
    const i = o ? o.listings.findIndex((l) => l.slot === slot) : -1;
    if (!o || !ch || i < 0) return { ok: false, reason: 'Böyle bir göz yok.' };
    const f = ch.findItem(o.listings[i].uid);
    if (f) delete f.item.listed;
    o.listings.splice(i, 1);
    ch.persist();
    emit('inventory:changed', {});
    if (!o.listings.length) {
      this.closeShop('Tezgâh boşaldı, kapandı.');
      return { ok: true };
    }
    this.syncOwnStall();
    this.announce(true);
    emit('market:changed', { what: 'own' });
    return { ok: true };
  }

  /** Mirror the own shop into `stalls` (so the world, the search and the panels treat it like any announced stall). */
  private syncOwnStall(): void {
    const o = this.own;
    const ch = this.ch;
    if (!o || !ch) return;
    const listings: ListingView[] = [];
    for (const l of o.listings) {
      const f = ch.findItem(l.uid);
      if (f) listings.push({ slot: l.slot, uid: l.uid, price: l.price, qty: f.item.quantity ?? 1, item: f.item });
    }
    this.stalls.set(this.selfId, {
      sellerId: this.selfId, zone: o.zone, spot: o.spot, title: o.title, rev: o.rev, big: o.big, look: this.ownLook(), listings,
      lastSeen: this.ctx.now(), own: true, hidden: false,
    });
    emit('market:changed', { what: 'stalls' });
  }

  private ownLook(): ShopLook {
    const s = this.ch?.save;
    const look: ShopLook = { c: s?.classId ?? 'knight', v: s?.appearance.variant ?? 0, n: s?.name ?? 'Tüccar', l: s?.level ?? 1 };
    if (s?.appearance.tint !== undefined) look.t = s.appearance.tint;
    return look;
  }

  private market(ch: CharacterState): MarketSaveData {
    ch.save.market ??= { sales: [], unseenCount: 0, unseenGold: 0, totalSold: 0, totalGold: 0 };
    return ch.save.market;
  }

  /** Spots taken in a zone by stalls other than `exceptId` (hidden losers do not occupy). */
  private occupiedSpots(zone: string, exceptId: string): Set<number> {
    const set = new Set<number>();
    for (const s of this.stalls.values()) if (s.zone === zone && s.sellerId !== exceptId && !s.hidden) set.add(s.spot);
    return set;
  }

  /* ------------------------------------------------------------------------ announce */

  buildAnnounce(): ShopAnnounce {
    const o = this.own;
    const ch = this.ch;
    const items: ShopListingWire[] = [];
    if (o && ch) {
      for (const l of o.listings) {
        const f = ch.findItem(l.uid);
        if (!f) continue;
        const row: ShopListingWire = { s: l.slot, u: l.uid, p: l.price, it: toSnapshot(f.item) };
        if ((f.item.quantity ?? 1) > 1) row.q = f.item.quantity;
        items.push(row);
      }
    }
    return {
      z: o?.zone ?? this.origin?.zone ?? MARKET_ZONE_TOWN, title: o?.title ?? '', spot: o?.spot ?? 0, rev: o?.rev ?? 0, open: !!o,
      ...(o?.big ? { big: true } : {}), look: this.ownLook(), items,
    };
  }

  /** Broadcast the own stall. `changed` bumps the revision (listing / price / spot change); the 30 s repeat does not. */
  announce(changed = false): void {
    const o = this.own;
    if (!o) return;
    if (changed) o.rev = Math.max(o.rev + 1, Math.floor(this.ctx.now() / 1000));
    this.announceAt = this.ctx.now() + MARKET.ANNOUNCE_S * 1000;
    this.send('shop', this.buildAnnounce());
  }

  private send(channel: 'shop' | 'shopBuy' | 'shopSold', data: ShopAnnounce | ShopBuyMsg | ShopSoldMsg, to?: string, tr: LobbyTransport | null = this.tr): void {
    if (!tr || tr.state !== 'open') return;
    try {
      (tr as unknown as { send(c: string, d: unknown, o?: { to: string }): void }).send(channel, data, to ? { to } : undefined);
    } catch (e) {
      console.warn('[market] send failed', channel, e);
    }
  }

  /* ------------------------------------------------------------------------ receive: announcements */

  private onShop(raw: unknown, from: string): void {
    if (from === this.selfId) return;
    const a = sanitizeAnnounce(raw);
    if (!a) return;
    const now = this.ctx.now();
    if (!a.open) {
      this.removeStall(from);
      return;
    }
    const count = spotCount(a.z === MARKET_ZONE_TOWN ? 'plaza' : 'village');
    if (a.spot >= count) return;
    const prev = this.stalls.get(from);
    if (prev && a.rev < prev.rev) return; // stale
    if (!prev && this.stalls.size >= MARKET.MAX_STALLS) return;
    const listings: ListingView[] = a.items.map((r) => ({ slot: r.s, uid: r.u, price: r.p, qty: r.q ?? 1, item: fromSnapshot(r.it, r.u, r.q ?? 1) }));
    // price memory: every new / repriced listing is one observation
    for (const l of listings) {
      const old = prev?.listings.find((x) => x.uid === l.uid);
      if (!old || old.price !== l.price) this.observe(l);
    }
    this.stalls.set(from, {
      sellerId: from, zone: a.z, spot: a.spot, title: a.title, rev: a.rev, big: a.big === true, look: a.look, listings, lastSeen: now, own: false, hidden: false,
    });
    this.resolveConflicts();
    emit('market:changed', { what: 'stalls' });
  }

  private observe(l: ListingView): void {
    const key = baseKey(l.item);
    const arr = this.history.get(key) ?? [];
    arr.push(l.price / Math.max(1, l.qty));
    while (arr.length > MARKET.HISTORY_MAX) arr.shift();
    this.history.set(key, arr);
  }

  priceHistory(item: ItemInstance): PriceHistory | null {
    const arr = this.history.get(baseKey(item));
    if (!arr || !arr.length) return null;
    let min = Infinity, max = 0, sum = 0;
    for (const v of arr) {
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
    return { n: arr.length, min, max, avg: sum / arr.length, last: arr[arr.length - 1] };
  }

  private removeStall(sellerId: string): void {
    const s = this.stalls.get(sellerId);
    if (!s || s.own) return;
    this.stalls.delete(sellerId);
    // a hidden loser may be allowed back now
    this.resolveConflicts();
    emit('market:changed', { what: 'stalls' });
  }

  /** Same spot announced twice: the better `spotPriority` keeps it; the own stall, when it loses, re-picks and re-announces. */
  private resolveConflicts(): void {
    const zones = new Map<string, Map<number, Stall[]>>();
    for (const s of this.stalls.values()) {
      s.hidden = false;
      let bySpot = zones.get(s.zone);
      if (!bySpot) zones.set(s.zone, (bySpot = new Map()));
      const list = bySpot.get(s.spot);
      if (list) list.push(s);
      else bySpot.set(s.spot, [s]);
    }
    for (const [zone, bySpot] of zones) {
      const count = spotCount(zone === MARKET_ZONE_TOWN ? 'plaza' : 'village');
      for (const [spot, list] of bySpot) {
        if (list.length < 2) continue;
        list.sort((a, b) => spotPriority(a.sellerId, b.sellerId, spot, count));
        for (let i = 1; i < list.length; i++) list[i].hidden = true;
      }
    }
    const mine = this.stalls.get(this.selfId);
    if (mine?.own && mine.hidden && this.own) this.relocateOwn();
  }

  private relocateOwn(): void {
    const o = this.own;
    if (!o) return;
    const kind: MarketKind = o.zone === MARKET_ZONE_TOWN ? 'plaza' : 'village';
    const spot = assignSpot(this.selfId, spotCount(kind), this.occupiedSpots(o.zone, this.selfId));
    if (spot < 0 || spot === o.spot) return;
    o.spot = spot;
    this.syncOwnStall();
    const sp = this.spotPos(o.zone, spot);
    if (sp) this.ctx.teleport(sp.seatX, sp.seatZ, sp.yaw);
    this.announce(true);
    toast('Tezgâhın başka bir yere taşındı (aynı yeri iki kişi seçti).', 'info');
  }

  /* ------------------------------------------------------------------------ seller: handle a buy */

  private onShopBuy(raw: unknown, from: string): void {
    const m = sanitizeBuy(raw);
    if (!m) return;
    if (from === this.selfId) return;
    this.handleBuy(m, from);
  }

  /** Public for the headless check (a fake peer calls it directly). Replies through the transport. */
  handleBuy(m: ShopBuyMsg, from: string): ShopSoldMsg {
    const key = `${from}|${m.txId}`;
    const cached = this.replies.get(key);
    if (cached) {
      this.send('shopSold', cached, from); // duplicate request: the same answer, never a second sale
      return cached;
    }
    const reply = this.executeSale(m, from);
    this.replies.set(key, reply);
    while (this.replies.size > MARKET.TX_MEMORY) this.replies.delete(this.replies.keys().next().value as string);
    this.send('shopSold', reply, from);
    return reply;
  }

  private executeSale(m: ShopBuyMsg, from: string): ShopSoldMsg {
    const no = (reason: string): ShopSoldMsg => ({ txId: m.txId, ok: false, reason });
    const ch = this.ch;
    const o = this.own;
    if (!ch || !o) return no('Tezgâh kapalı.');
    if (m.sellerId !== this.selfId) return no('Yanlış satıcı.');
    // rate limit per buyer
    const now = this.ctx.now();
    const times = (this.buyerTimes.get(from) ?? []).filter((t) => now - t < 10_000);
    if (times.length >= MARKET.BUYER_RATE) return no('Çok fazla istek. Biraz bekle.');
    times.push(now);
    this.buyerTimes.set(from, times);
    if (this.buyerTimes.size > 200) this.buyerTimes.delete(this.buyerTimes.keys().next().value as string);
    // plausibility: the listing is still there, same uid, same price
    const row = o.listings.find((l) => l.slot === m.slot);
    if (!row || row.uid !== m.itemUid) return no('Bu eşya artık satışta değil.');
    if (row.price !== m.price) return no('Fiyat değişti. Tezgâhı yeniden aç.');
    const f = ch.findItem(row.uid);
    if (!f || f.loc.where !== 'bag' || !f.item.listed) return no('Eşya artık satışta değil.');
    // commit: the seller is authoritative over the item
    const item = f.item;
    const wire = toWireItem(item);
    const label = listingName(item);
    ch.removeItem(item.uid);
    delete item.listed;
    o.listings = o.listings.filter((l) => l !== row);
    // WP-14: the holding guild of the last siege pays a smaller Pazar tax (local, trust-based)
    const tax = saleTax(row.price, siegeTaxMult(ch.save.siege?.holder, ch.save.guild?.gid));
    const net = row.price - tax;
    ch.addGold(net);
    const rec: MarketSaleRecord = { t: now, name: label, rarity: item.rarity, price: row.price, net, ...(m.buyer ? { buyer: m.buyer } : {}) };
    o.sales.push(rec);
    o.grossGold += row.price;
    o.netGold += net;
    const ms = this.market(ch);
    ms.sales.push(rec);
    while (ms.sales.length > MARKET.LOG_MAX) ms.sales.shift();
    ms.unseenCount++;
    ms.unseenGold += net;
    ms.totalSold++;
    ms.totalGold += net;
    ch.persist(true);
    emit('market:sale', { name: label, price: row.price, net, ...(m.buyer ? { buyer: m.buyer } : {}) });
    toast(`Satıldı: ${label} (${fmt(net)} altın${tax ? `, ${fmt(tax)} vergi` : ''})`, 'loot');
    emit('market:changed', { what: 'sales' });
    if (!o.listings.length) {
      this.syncOwnStall();
      this.closeShop(`Tezgâh boşaldı: ${o.sales.length} eşya satıldı, ${fmt(o.netGold)} altın kazandın.`);
    } else {
      this.syncOwnStall();
      this.announce(true);
      emit('market:changed', { what: 'own' });
    }
    return { txId: m.txId, ok: true, item: wire };
  }

  /* ------------------------------------------------------------------------ buyer */

  /** Turkish reason a listing cannot be bought now, null if it can. */
  whyNotBuyable(stall: Stall, listing: ListingView): string | null {
    const ch = this.ch;
    if (!ch) return 'Karakter yok.';
    if (stall.own) return 'Kendi tezgâhından alamazsın.';
    if (stall.hidden) return 'Tezgâh taşınıyor.';
    if (ch.save.gold < listing.price) return 'Altının yetmiyor.';
    if (this.pendingFor(stall.sellerId, listing.slot)) return 'Bu satın alma sürüyor.';
    if (this.distanceTo(stall) > MARKET.BUY_RANGE + 0.5) return 'Tezgâha yaklaş.';
    const base = baseOf(listing.item);
    const stackRoom = !!base?.stackable && ch.save.bag.some((s) => s && !s.listed && s.baseId === listing.item.baseId && (s.quantity ?? 1) < (base.maxStack ?? 99));
    if (ch.freeBagSlots() < 1 && !stackRoom) return 'Çantan dolu.';
    return null;
  }

  pendingFor(sellerId: string, slot: number): Pending | null {
    for (const p of this.pending.values()) if (p.sellerId === sellerId && p.slot === slot) return p;
    return null;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Reserve the gold, ask the seller. Resolves later through onShopSold / the timeout. */
  buy(sellerId: string, slot: number): MarketResult & { txId?: string } {
    const stall = this.stalls.get(sellerId);
    const listing = stall?.listings.find((l) => l.slot === slot);
    const ch = this.ch;
    if (!stall || !listing || !ch) return { ok: false, reason: 'Bu eşya artık satışta değil.' };
    const why = this.whyNotBuyable(stall, listing);
    if (why) return { ok: false, reason: why };
    if (!ch.spendGold(listing.price)) return { ok: false, reason: 'Altının yetmiyor.' };
    const txId = 'T' + this.ctx.newId() + this.ctx.newId();
    const p: Pending = { txId, sellerId, slot, itemUid: listing.uid, price: listing.price, baseId: listing.item.baseId, qty: listing.qty, t0: this.ctx.now() };
    this.pending.set(txId, p);
    ch.persist(true);
    const msg: ShopBuyMsg = { txId, sellerId, slot, itemUid: listing.uid, price: listing.price, buyer: ch.save.name };
    if (!this.tr) {
      // no transport (offline): only the own stall exists and it cannot be bought from; refund at once
      this.refund(p, 'Satıcıya ulaşılamadı.');
      return { ok: false, reason: 'Satıcıya ulaşılamadı.' };
    }
    this.send('shopBuy', msg, sellerId);
    emit('market:changed', { what: 'tx' });
    return { ok: true, txId };
  }

  private onShopSold(raw: unknown, from: string): void {
    const m = sanitizeSold(raw);
    if (!m) return;
    this.handleSold(m, from);
  }

  /** Public for the headless check. */
  handleSold(m: { txId: string; ok: boolean; item?: unknown; reason?: string }, from: string): void {
    const ch = this.ch;
    if (!ch) return;
    if (this.finished.has(m.txId)) return; // dedup: a repeated answer is ignored
    const p = this.pending.get(m.txId);
    const late = !p ? this.expired.get(m.txId) : undefined;
    const tx = p ?? late;
    if (!tx || from !== tx.sellerId) return; // unknown tx or somebody else answering
    if (!m.ok || !m.item) {
      if (p) {
        this.pending.delete(m.txId);
        this.remember(m.txId);
        this.refund(p, m.reason ?? 'Satıcı reddetti.', false);
      } else if (late) {
        this.expired.delete(m.txId);
        this.remember(m.txId);
      }
      return;
    }
    const item = cleanWireItem(m.item, 'm' + this.ctx.newId());
    // plausibility: a different base than listed means the seller cheated or the data is broken: refuse, refund
    if (!item || item.baseId !== tx.baseId || (item.quantity ?? 1) !== tx.qty) {
      this.pending.delete(m.txId);
      this.expired.delete(m.txId);
      this.remember(m.txId);
      if (p) this.refund(p, 'Satıcı geçersiz eşya gönderdi.', false);
      return;
    }
    if (late) {
      // the 10 s window passed and the gold was refunded: charge it again (best effort; the item is already gone from the seller)
      this.expired.delete(m.txId);
      if (!ch.spendGold(tx.price)) ch.save.gold = 0;
    } else {
      this.pending.delete(m.txId);
    }
    this.remember(m.txId);
    this.deliver(item);
    toast(`Satın alındı: ${listingName(item)} (${fmt(tx.price)} altın)`, 'loot');
    emit('market:changed', { what: 'tx' });
  }

  private deliver(item: ItemInstance): void {
    const ch = this.ch;
    if (!ch) return;
    if (ch.addItem(item)) {
      ch.persist(true);
      return;
    }
    // the bag filled up while the answer was in flight: stash, else the item would be lost
    const i = ch.save.stash.findIndex((x) => !x);
    if (i >= 0) {
      ch.save.stash[i] = item;
      toast('Çanta doluydu, eşya depoya kondu.', 'warning');
    } else {
      ch.save.bag.push(item); // last resort: never lose a paid item (bag array grows by one)
      toast('Çanta ve depo dolu! Eşya fazladan bir göze kondu, yer aç.', 'warning');
    }
    emit('inventory:changed', {});
    ch.persist(true);
  }

  private remember(txId: string): void {
    this.finished.add(txId);
    while (this.finished.size > MARKET.TX_MEMORY) this.finished.delete(this.finished.values().next().value as string);
  }

  private refund(p: Pending, why: string, keepForLate = false): void {
    const ch = this.ch;
    this.pending.delete(p.txId);
    if (keepForLate) {
      this.expired.set(p.txId, { ...p, until: this.ctx.now() + MARKET.LATE_REPLY_S * 1000 });
    }
    if (ch) {
      ch.addGold(p.price);
      ch.persist(true);
    }
    toast(`Satın alma olmadı: ${why} Altının iade edildi.`, 'warning');
    emit('market:changed', { what: 'tx' });
  }

  /* ------------------------------------------------------------------------ timers */

  /** One second tick (also called directly by the headless check with a fake clock). */
  tick(): void {
    const now = this.ctx.now();
    for (const p of [...this.pending.values()]) {
      if (now - p.t0 >= MARKET.BUY_TIMEOUT_S * 1000) this.refund(p, 'Satıcı yanıt vermedi.', true);
    }
    for (const [id, e] of this.expired) if (now > e.until) this.expired.delete(id);
    if (this.own && now >= this.announceAt) this.announce(false);
    let dropped = false;
    for (const [id, s] of this.stalls) {
      if (!s.own && now - s.lastSeen > MARKET.STALE_S * 1000) {
        this.stalls.delete(id);
        dropped = true;
      }
    }
    if (dropped) {
      this.resolveConflicts();
      emit('market:changed', { what: 'stalls' });
    }
  }

  /* ------------------------------------------------------------------------ search ("Pazar Arama") */

  /** Every announced listing (hidden stalls excluded) that matches the filter. */
  search(f: SearchFilter = {}): SearchRow[] {
    const text = (f.text ?? '').trim().toLocaleLowerCase('tr-TR');
    const rows: SearchRow[] = [];
    for (const stall of this.stalls.values()) {
      if (stall.hidden || (f.zone && stall.zone !== f.zone)) continue;
      for (const listing of stall.listings) {
        const it = listing.item;
        const base = baseOf(it);
        if (f.minPrice !== undefined && listing.price < f.minPrice) continue;
        if (f.maxPrice !== undefined && listing.price > f.maxPrice) continue;
        if (f.minRarity !== undefined && RARITY_IDX(it.rarity) < f.minRarity) continue;
        if (f.slot && f.slot !== 'any') {
          const slots = base ? slotsForCategory(base.category) : [];
          if (!slots.includes(f.slot)) continue;
        }
        if (f.minAffixes !== undefined && it.affixes.length < f.minAffixes) continue;
        if (f.stat && !it.affixes.some((a) => a.stat === f.stat) && !(it.implicit && (it.implicit as Record<string, number | undefined>)[f.stat] !== undefined)) continue;
        if (text) {
          const name = `${it.name ?? ''} ${base?.name ?? ''} ${stall.title}`.toLocaleLowerCase('tr-TR');
          if (!name.includes(text)) continue;
        }
        const unit = listing.price / Math.max(1, listing.qty);
        const h = this.priceHistory(it);
        rows.push({ stall, listing, unit, avg: h && h.n > 1 ? h.avg : null });
      }
    }
    const sort = f.sort ?? 'price';
    rows.sort((a, b) => {
      if (sort === 'rarity') return RARITY_IDX(b.listing.item.rarity) - RARITY_IDX(a.listing.item.rarity) || a.unit - b.unit;
      if (sort === 'ilvl') return b.listing.item.itemLevel - a.listing.item.itemLevel || a.unit - b.unit;
      return a.unit - b.unit;
    });
    return rows;
  }

  /** "Göster": set the map pin and (same zone) the beam over the stall. */
  show(sellerId: string): MarketResult {
    const s = this.stalls.get(sellerId);
    if (!s || s.hidden) return { ok: false, reason: 'Tezgâh artık yok.' };
    const sp = this.spotPos(s.zone, s.spot);
    if (!sp) {
      toast(`Bu tezgâh ${s.zone === MARKET_ZONE_TOWN ? 'Kuzgunkale Pazar Meydanı\'nda' : 'başka bir köy pazarında'}.`, 'info');
      this.setPin({ zone: s.zone, x: 0, z: 0, label: s.title, sellerId });
      return { ok: true };
    }
    this.setPin({ zone: s.zone, x: sp.x, z: sp.z, label: s.title, sellerId });
    return { ok: true };
  }

  setPin(p: Market['pin']): void {
    this.pin = p;
    emit('market:pin', p);
  }

  /** Stable per-seller picks used by the renderer: where the spot would start probing (diagnostics). */
  homeOf(sellerId: string): number {
    return this.origin ? homeSpot(sellerId, spotCount(this.origin.kind)) : 0;
  }

  titleSuggestion(): string {
    return DEFAULT_TITLES[Math.floor(Math.random() * DEFAULT_TITLES.length)];
  }
}

const RARITY_IDX = (r: string): number => RARITY_ORDER.indexOf(r as (typeof RARITY_ORDER)[number]);

/* ------------------------------------------------------------------------------------------------ singleton */

let instance: Market | null = null;
/** The game's Market (created on first use; the panels, the stalls and Pazarcı Modu share it). */
export function getMarket(): Market {
  if (!instance) {
    instance = new Market();
    (G as unknown as { market?: Market }).market = instance;
  }
  return instance;
}
export function peekMarket(): Market | null {
  return instance;
}

