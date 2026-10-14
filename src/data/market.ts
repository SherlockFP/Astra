import type { ClassId } from '../types/common';
import type { TownDef } from '../types/dungeons';
import type { NpcPreset } from '../entities/NPC';

/**
 * CM14 PAZAR - Metin2-style AFK player shops (docs/CORE_MECHANICS.md §11). Pure data and pure helpers: no G, no three.js, no DOM,
 * so the headless check (dev/combat-sim/market.mjs) and the wire code can use it. Behaviour lives in systems/Market.ts (+ MarketWire.ts),
 * the stalls in world/MarketStalls.ts, the panels in ui/panels/game/market/*.
 */

/* ------------------------------------------------------------------------------------------------ rules */

export const MARKET = {
  /** Listing fee: share of the total list price, paid when the stall opens (gold sink). */
  LISTING_FEE: 0.01,
  /** Pazar Vergisi: share of every sale price the seller does not receive (gold sink). */
  SALE_TAX: 0.03,
  /** Stall slots with a Pazar Bohçası / a Büyük Bohça. */
  SLOTS: 12,
  SLOTS_BIG: 24,
  TITLE_MAX: 32,
  /** The `shop` announcement is repeated this often (seconds) and on every change. */
  ANNOUNCE_S: 30,
  /** A stall whose last announcement is older than this is dropped (three missed announcements). */
  STALE_S: 100,
  /** A buy that gets no answer after this long is refunded (seconds). */
  BUY_TIMEOUT_S: 10,
  /** A late reply for a refunded buy is still honoured for this long (seconds). */
  LATE_REPLY_S: 120,
  /** Metres: the buyer must stand this close to the stall to open it (F) and to buy. */
  BUY_RANGE: 6,
  /** Only the nearest N boards draw their title (canvas text sprites); the others show a blank board. */
  TEXT_LOD: 40,
  /** Metres: the seller must be inside this radius around the grid centre (plus the grid half extent) to open a stall. */
  DISTRICT_MARGIN: 8,
  MIN_PRICE: 1,
  MAX_PRICE: 999_999_999,
  /** Transactions remembered for the txId dedup on each side. */
  TX_MEMORY: 256,
  /** Most buy requests one peer may send to one stall per 10 seconds. */
  BUYER_RATE: 6,
  /** Hard cap on announced stalls a client keeps (spam protection); a zone never needs more than the spot count. */
  MAX_STALLS: 160,
  /** Largest item snapshot list accepted from a `shop` announcement. */
  MAX_ITEMS_WIRE: 24,
  /** Sales kept in the save log. */
  LOG_MAX: 60,
  /** Pazarcı Modu: idle seconds near the own stall before it switches on by itself. */
  AFK_IDLE_S: 20,
  /** Pazarcı Modu: render rate while on (frames per second). */
  AFK_FPS: 2,
  /** Metres from the own seat beyond which the player counts as "moved away". */
  AFK_LEAVE_DIST: 3.5,
  /** Seconds a "Göster" beam stays up. */
  PIN_S: 12,
  /** Price history samples kept per item base (observed listings). */
  HISTORY_MAX: 24,
} as const;

/** Bound ("Ruha Bağlı") items are personal; flip to true if the owner wants them tradeable (GDD_LOOT_V3 open question 8). */
export const MARKET_ALLOW_BOUND = false;

export const MARKET_ZONE_TOWN = 'town';

/** Item-pouch ids of the two stall licences. One is consumed when a stall opens. */
export const BOHCA_ID = 'pazar_bohcasi';
export const BOHCA_BIG_ID = 'buyuk_bohca';
export const BOHCA_PRICE = 400;
export const BOHCA_BIG_PRICE = 4000;

/* ------------------------------------------------------------------------------------------------ gold maths */

/** Listing fee for a total list price (>= 1 gold when anything is listed). */
export function listingFee(totalPrice: number): number {
  return totalPrice > 0 ? Math.max(1, Math.ceil(totalPrice * MARKET.LISTING_FEE)) : 0;
}
/** Pazar Vergisi on one sale (rounded down: a 33 gold sale is tax free). `mult` = a local tax cut (WP-14: 0.9 for the siege holder's guild). */
export function saleTax(price: number, mult = 1): number {
  return Math.max(0, Math.floor(price * MARKET.SALE_TAX * mult));
}
/** What the seller receives for one sale. */
export function saleNet(price: number): number {
  return price - saleTax(price);
}

/* ------------------------------------------------------------------------------------------------ spot grid */

export type MarketKind = 'plaza' | 'village';

/**
 * Where a market sits in the current scene. `zone` is 'town' for the capital's Pazar Meydanı or the village id; `x`,`z` the centre
 * of the spot grid in world metres; `yaw` (radians, default 0) rotates the grid: the stall fronts face local +z (yaw 0 = south).
 */
export interface MarketOrigin {
  zone: string;
  kind: MarketKind;
  x: number;
  z: number;
  yaw?: number;
}

export const SPOT_SPACING = 2.5;
export const PLAZA_COLS = 10;
export const PLAZA_ROWS = 6;
export const VILLAGE_COLS = 4;
export const VILLAGE_ROWS = 3;

export const gridSize = (kind: MarketKind): { cols: number; rows: number } =>
  kind === 'plaza' ? { cols: PLAZA_COLS, rows: PLAZA_ROWS } : { cols: VILLAGE_COLS, rows: VILLAGE_ROWS };
export const spotCount = (kind: MarketKind): number => {
  const g = gridSize(kind);
  return g.cols * g.rows;
};

/** Stall geometry in a 2.5 m cell, local metres (+z is the stall front): counter left of centre, the seller sits on its right. */
export const STALL_LOCAL = { x: -0.3, z: -0.4, w: 1.6, d: 0.9 } as const;
export const SEAT_LOCAL = { x: 0.85, z: -0.3 } as const;

export interface MarketSpot {
  index: number;
  /** World position of the stall counter centre. */
  x: number;
  z: number;
  /** World position of the seller's seat (where the local seller is moved to). */
  seatX: number;
  seatZ: number;
  /** Facing of the stall front (radians, model yaw: 0 faces +z). */
  yaw: number;
}

/** Local grid offset -> world offset (rotation about Y by `yaw`, three.js convention). */
function rot(lx: number, lz: number, yaw: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

/** All spots of a market, index = row * cols + col. */
export function marketSpots(o: MarketOrigin): MarketSpot[] {
  const { cols, rows } = gridSize(o.kind);
  const yaw = o.yaw ?? 0;
  const out: MarketSpot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = (c - (cols - 1) / 2) * SPOT_SPACING;
      const lz = (r - (rows - 1) / 2) * SPOT_SPACING;
      const [sx, sz] = rot(lx + STALL_LOCAL.x, lz + STALL_LOCAL.z, yaw);
      const [px, pz] = rot(lx + SEAT_LOCAL.x, lz + SEAT_LOCAL.z, yaw);
      out.push({ index: r * cols + c, x: o.x + sx, z: o.z + sz, seatX: o.x + px, seatZ: o.z + pz, yaw });
    }
  }
  return out;
}

/** Radius around the grid centre inside which a seller may open a stall (grid half diagonal + margin). */
export function districtRadius(kind: MarketKind): number {
  const { cols, rows } = gridSize(kind);
  return Math.hypot((cols * SPOT_SPACING) / 2, (rows * SPOT_SPACING) / 2) + MARKET.DISTRICT_MARGIN;
}

/** FNV-1a 32-bit. Stable across clients and sessions (the whole point of the spot rule). */
export function hashSeller(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The spot a seller starts probing from. */
export const homeSpot = (sellerId: string, count: number): number => hashSeller(sellerId) % count;

/**
 * Deterministic spot: `hash(sellerId) mod count`, then linear probing over the occupied set. -1 = every spot is taken.
 * Two clients with the same occupied set always agree (announcements carry the pick, so a differing view only matters in a race,
 * which `spotPriority` settles).
 */
export function assignSpot(sellerId: string, count: number, occupied: ReadonlySet<number>): number {
  const h = homeSpot(sellerId, count);
  for (let i = 0; i < count; i++) {
    const s = (h + i) % count;
    if (!occupied.has(s)) return s;
  }
  return -1;
}

/** Probe distance of `spot` from the seller's home spot (0 = the home spot itself). */
export const probeDistance = (sellerId: string, spot: number, count: number): number => (spot - homeSpot(sellerId, count) + count) % count;

/**
 * Two sellers announced the same spot: the one with the shorter probe distance keeps it, ties go to the lower id. Returns <0 when `a`
 * wins. Every client evaluates the same function, so they all drop the same loser (which then re-picks and re-announces).
 */
export function spotPriority(aId: string, bId: string, spot: number, count: number): number {
  const da = probeDistance(aId, spot, count), db = probeDistance(bId, spot, count);
  if (da !== db) return da - db;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/* ------------------------------------------------------------------------------------------------ text */

/** Title rule: <= 32 chars, no control characters, single spaces, never empty. */
// eslint-disable-next-line no-control-regex
const TITLE_BAD = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿<>]/g;
export function cleanTitle(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.replace(TITLE_BAD, '').replace(/\s+/g, ' ').trim().slice(0, MARKET.TITLE_MAX).trim();
  return t || fallback;
}

export const DEFAULT_TITLES = ['Ucuz Mal Bol Çeşit', 'Acil Satılık', 'Zindan Ganimeti', 'Gezgin Tüccar', 'Efsun Pazarı', 'Altın Tezgâh'];

/* ------------------------------------------------------------------------------------------------ seller look */

/** Body colour of a seller's seated stand-in, by class (the same hues as the class icons). */
export const CLASS_BODY_COLOR: Record<ClassId, number> = {
  knight: 0x9aa8c4, barbarian: 0xb8532e, mage: 0x5d6bd6, rogue: 0x4f9e63, monk: 0x3fb0a6, archer: 0xc09a38,
  paladin: 0xd8c880, necromancer: 0x7aa860, warlock: 0x9a4cba, demonhunter: 0x8a2aaa, evoker: 0x2c8a78,
  priest: 0xffffff, shaman: 0x0070dd, druid: 0xff7c0a, // CLASS SCAFFOLD
};
/** Canopy cloth colours, picked by the seller's hash so a stall keeps its colour on every client. */
export const CANOPY_COLORS = [0xb03a2e, 0x2e6db0, 0x3a8a4a, 0xc8a02c, 0x8a3ab0, 0xd0702a, 0x2aa0a0, 0xc04a7a];

/* ------------------------------------------------------------------------------------------------ licences + NPC */

/** Rows appended to data/materials.ts (kept here so the numbers live next to the rules). */
export const BOHCA_DEFS = [
  {
    id: BOHCA_ID, name: 'Pazar Bohçası', slots: MARKET.SLOTS, price: BOHCA_PRICE,
    desc: 'Pazar Meydanı\'nda ya da bir köy pazarında 12 gözlü bir tezgâh açar. Tezgâh açılırken bir bohça harcanır.',
  },
  {
    id: BOHCA_BIG_ID, name: 'Büyük Bohça', slots: MARKET.SLOTS_BIG, price: BOHCA_BIG_PRICE,
    desc: 'Pazar tezgâhına 24 göz verir. Tezgâh açılırken bir bohça harcanır.',
  },
] as const;

export const TEZGAH_USTASI_ID = 'npc_tezgah_ustasi';

/** Look and lines of the Tezgâh Ustası (merged into NPC_PRESETS by registerMarketNpc). */
export const TEZGAH_USTASI_PRESET: NpcPreset = {
  base: 'Rogue_Hooded', show: ['Rogue_Cape'], tint: 0xb08a3a, title: 'Tezgâh Ustası', idle: 'Idle', interactClip: 'Interact',
  periodic: { clip: 'Use_Item', every: 7 },
  greeting: 'Tezgâhını kur, malını sergile; sen uyurken bile altın kazan. Pazar Bohçası bende.',
  barks: ['Tezgâh açan kazanır!', 'Meydanda yer var, yiğidim.', 'Bohçanı al, malını diz.', 'Vergi küçük, kazanç büyük.'],
};

/** Town NPC definition of the Tezgâh Ustası (pass to `new NPC(id, def)`); `x`,`z`,`rotDeg` place him next to the plaza. */
export function tezgahUstasiDef(x: number, z: number, rotDeg = 0): TownDef['npcs'][number] {
  return {
    id: TEZGAH_USTASI_ID, name: 'Tezgâh Ustası Rıfat', role: 'merchant', model: 'Rogue_Hooded', pos: [x, 0, z], rot: rotDeg,
    title: 'Tezgâh Ustası', ui: { panel: 'marketOpen' },
  };
}

/* ------------------------------------------------------------------------------------------------ placement */

/**
 * Default place of the capital's Pazar Meydanı (world metres, +x east, +z south): the east side of Kuzgunkale, centre (28, 18). A scan of
 * data/town.ts found a 26 x 16 m patch there with no prop or NPC inside (the grid itself is 25 x 15 m, stall fronts face south). The
 * town author may move it: this one constant is the only place that names it.
 */
export const PAZAR_MEYDANI: MarketOrigin = { zone: MARKET_ZONE_TOWN, kind: 'plaza', x: 28, z: 18, yaw: 0 };
/** Where the Tezgâh Ustası stands: at the western edge of the Pazar Meydanı, facing the stalls (rotation in degrees, 90 = faces east). */
export const PAZAR_USTASI_AT = { x: PAZAR_MEYDANI.x - 15.5, z: PAZAR_MEYDANI.z, rotDeg: 90 } as const;
