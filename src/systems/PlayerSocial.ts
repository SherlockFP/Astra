/**
 * PLAYER SOCIAL - the state behind the WoW unit popup menu (ui/hud/PlayerMenu.ts). OWNER: net module.
 *
 * Pure on purpose (no G, no DOM, no network): the menu drives these, and dev/combat-sim/social.mjs tests them headless.
 *   - Friends: a character-name list kept in localStorage (per browser). Online status is NOT stored; it comes from the presence
 *     registry (G.presence.find) when the menu opens.
 *   - DuelMachine: challenge -> accept / decline (30 s timeout) -> 3-2-1 countdown -> active inside a flag radius. Leaving the
 *     radius forfeits, surrender forfeits, and a hit that would take the victim to 0 HP leaves them at 1 HP and ends the duel.
 *     The fight itself (damage routing between two peers) is not wired yet, so the menu item ships as "Yakında".
 *   - TradeMachine: request -> open window -> offers (gold + item ids) -> both lock and accept -> atomic swap result. Any change
 *     to an offer clears both locks. The window is not wired yet ("Yakında").
 */

/* ------------------------------------------------------------------------------------------------ friends */

export const FRIENDS_KEY = 'astra.friends.v1';
export const FRIENDS_MAX = 50;
const NAME_MAX = 20;

/** The subset of Storage the friends list needs (tests pass a Map-backed fake). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Character name for the friends list: trimmed, at most 20 chars, no `~` (the presence duplicate suffix). */
export function friendKey(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.replace(/~/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
}

/** Reads the list. Corrupt data, a missing store or a blocked storage all read as an empty list. */
export function loadFriends(store: KeyValueStore | null = defaultStore()): string[] {
  try {
    const raw = store?.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      const n = friendKey(x);
      if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
      if (out.length >= FRIENDS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Writes the list. A failed write (quota, private mode) is ignored: the list then lasts for this session only. */
export function saveFriends(list: readonly string[], store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(FRIENDS_KEY, JSON.stringify(list.slice(0, FRIENDS_MAX)));
  } catch {
    /* storage unavailable */
  }
}

export function isFriend(list: readonly string[], name: string): boolean {
  const low = friendKey(name).toLowerCase();
  return !!low && list.some((f) => f.toLowerCase() === low);
}

export type FriendResult = { ok: true; list: string[] } | { ok: false; reason: string };

export function addFriend(list: readonly string[], nameIn: string, self: string = ''): FriendResult {
  const name = friendKey(nameIn);
  if (!name) return { ok: false, reason: 'Geçersiz isim.' };
  if (self && name.toLowerCase() === friendKey(self).toLowerCase()) return { ok: false, reason: 'Kendini arkadaş ekleyemezsin.' };
  if (isFriend(list, name)) return { ok: false, reason: `${name} zaten arkadaşın.` };
  if (list.length >= FRIENDS_MAX) return { ok: false, reason: `En fazla ${FRIENDS_MAX} arkadaş ekleyebilirsin.` };
  return { ok: true, list: [...list, name] };
}

export function removeFriend(list: readonly string[], nameIn: string): string[] {
  const low = friendKey(nameIn).toLowerCase();
  return list.filter((f) => f.toLowerCase() !== low);
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------ duel */

export const DUEL = {
  /** An unanswered challenge expires after this long (WoW style). */
  INVITE_TIMEOUT_MS: 30_000,
  /** 3-2-1 countdown before the duel is live. */
  COUNTDOWN_MS: 3_000,
  /** Flag radius in metres around the ring centre (midpoint at the start): stepping out forfeits. */
  RADIUS: 40,
  /** The loser is left at this HP instead of dying. */
  FLOOR_HP: 1,
} as const;

export type DuelState = 'idle' | 'invited' | 'countdown' | 'active' | 'ended';
export type DuelEndReason = 'hp' | 'surrender' | 'leave' | 'declined' | 'timeout' | 'cancel';

export interface DuelSnapshot {
  state: DuelState;
  challenger: string;
  target: string;
  /** Live (active) from this clock value; countdown runs until then. */
  liveAt: number;
  winner: string | null;
  reason: DuelEndReason | null;
}

/**
 * One duel between two players, driven by the local client for the local player. `now` is a caller clock in ms.
 * Every transition returns true when it changed state, false when the call does not apply (wrong state or wrong player).
 */
export class DuelMachine {
  private st: DuelState = 'idle';
  private a = '';
  private b = '';
  private invitedAt = 0;
  private liveAt = 0;
  private win: string | null = null;
  private why: DuelEndReason | null = null;

  get state(): DuelState {
    return this.st;
  }

  snapshot(): DuelSnapshot {
    return { state: this.st, challenger: this.a, target: this.b, liveAt: this.liveAt, winner: this.win, reason: this.why };
  }

  /** Challenge `to` from `from`. Only from idle, and never against yourself. */
  invite(now: number, from: string, to: string): boolean {
    const a = friendKey(from);
    const b = friendKey(to);
    if (this.st !== 'idle' && this.st !== 'ended') return false;
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) return false;
    this.reset();
    this.st = 'invited';
    this.a = a;
    this.b = b;
    this.invitedAt = now;
    return true;
  }

  /** The target accepts: the countdown starts. */
  accept(now: number, by: string): boolean {
    if (this.st !== 'invited' || !same(by, this.b)) return false;
    this.st = 'countdown';
    this.liveAt = now + DUEL.COUNTDOWN_MS;
    return true;
  }

  /** The target declines, or the challenger cancels before the duel starts. */
  decline(by: string): boolean {
    if (this.st !== 'invited') return false;
    if (same(by, this.b)) return this.end(null, 'declined', this.a);
    if (same(by, this.a)) return this.end(null, 'cancel', this.b);
    return false;
  }

  /** Drives the clock: an unanswered invite times out, a countdown turns live, an active duel checks the flag radius. */
  tick(now: number, dist?: { a: number; b: number }): void {
    if (this.st === 'invited' && now - this.invitedAt >= DUEL.INVITE_TIMEOUT_MS) {
      this.end(null, 'timeout', this.a);
      return;
    }
    if (this.st === 'countdown' && now >= this.liveAt) {
      this.st = 'active';
      return;
    }
    if (this.st === 'active' && dist) {
      if (dist.a > DUEL.RADIUS) this.end(this.b, 'leave', this.a);
      else if (dist.b > DUEL.RADIUS) this.end(this.a, 'leave', this.b);
    }
  }

  /** `by` gives up. Only during countdown or active. */
  surrender(by: string, reason: DuelEndReason = 'surrender'): boolean {
    if (this.st !== 'active' && this.st !== 'countdown') return false;
    if (same(by, this.a)) return this.end(this.b, reason, this.a);
    if (same(by, this.b)) return this.end(this.a, reason, this.b);
    return false;
  }

  /** The other player's name (null when no duel is set up). */
  opponentOf(name: string): string | null {
    if (same(name, this.a)) return this.b || null;
    if (same(name, this.b)) return this.a || null;
    return null;
  }

  /**
   * A hit of `dmg` on `victim` whose HP is `hp` before the hit. During an active duel the victim keeps FLOOR_HP and the duel ends
   * with the other player as winner. Returns the HP the victim keeps (unchanged when no duel rule applies).
   */
  damage(victim: string, hp: number, dmg: number): number {
    if (this.st !== 'active' || dmg <= 0) return hp;
    if (same(victim, this.a)) {
      if (hp - dmg > DUEL.FLOOR_HP) return hp - dmg;
      this.end(this.b, 'hp', this.a);
      return DUEL.FLOOR_HP;
    }
    if (same(victim, this.b)) {
      if (hp - dmg > DUEL.FLOOR_HP) return hp - dmg;
      this.end(this.a, 'hp', this.b);
      return DUEL.FLOOR_HP;
    }
    return hp;
  }

  /** Back to idle after the result has been shown. */
  reset(): void {
    this.st = 'idle';
    this.a = '';
    this.b = '';
    this.invitedAt = 0;
    this.liveAt = 0;
    this.win = null;
    this.why = null;
  }

  private end(winner: string | null, reason: DuelEndReason, _loser: string): boolean {
    this.st = 'ended';
    this.win = winner;
    this.why = reason;
    return true;
  }
}

function same(a: string, b: string): boolean {
  return friendKey(a).toLowerCase() === friendKey(b).toLowerCase();
}

/* ------------------------------------------------------------------------------------------------ trade */

export const TRADE = {
  MAX_ITEMS: 6,
  MAX_GOLD: 1_000_000_000,
} as const;

export type TradeState = 'requested' | 'open' | 'done' | 'cancelled';

export interface TradeOffer {
  gold: number;
  items: string[];
}

export interface TradeSide extends TradeOffer {
  name: string;
  locked: boolean;
  accepted: boolean;
}

export interface TradeSwap {
  /** What the first party gets (the second party's offer), and what the second party gets. */
  toA: TradeOffer;
  toB: TradeOffer;
}

/**
 * A two-sided trade window. The host of the trade (the local side) validates the swap; when both sides are locked AND accepted the
 * state becomes `done` and `swap` is the atomic exchange: either both sides change hands or neither does.
 */
export class TradeMachine {
  private st: TradeState = 'cancelled';
  private a: TradeSide = blankSide('');
  private b: TradeSide = blankSide('');

  get state(): TradeState {
    return this.st;
  }

  sides(): { a: TradeSide; b: TradeSide } {
    return { a: { ...this.a, items: [...this.a.items] }, b: { ...this.b, items: [...this.b.items] } };
  }

  request(from: string, to: string): boolean {
    const a = friendKey(from);
    const b = friendKey(to);
    if (this.st === 'open' || this.st === 'requested') return false;
    if (!a || !b || same(a, b)) return false;
    this.a = blankSide(a);
    this.b = blankSide(b);
    this.st = 'requested';
    return true;
  }

  accept(by: string): boolean {
    if (this.st !== 'requested' || !same(by, this.b.name)) return false;
    this.st = 'open';
    return true;
  }

  /** Either side closes the window before it is done. */
  cancel(by: string): boolean {
    if (this.st !== 'requested' && this.st !== 'open') return false;
    if (!same(by, this.a.name) && !same(by, this.b.name)) return false;
    this.st = 'cancelled';
    return true;
  }

  /** Replace `by`'s offer. Any change clears both locks and both accepts. Rejects bad gold or item lists. */
  offer(by: string, o: TradeOffer): boolean {
    if (this.st !== 'open') return false;
    const side = this.sideOf(by);
    if (!side) return false;
    const gold = Math.floor(Number(o.gold));
    if (!Number.isFinite(gold) || gold < 0 || gold > TRADE.MAX_GOLD) return false;
    const items = [...new Set(o.items)].filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 64);
    if (items.length !== o.items.length || items.length > TRADE.MAX_ITEMS) return false;
    side.gold = gold;
    side.items = items;
    this.a.locked = this.a.accepted = this.b.locked = this.b.accepted = false;
    return true;
  }

  /** Lock `by`'s offer (no more changes until someone changes theirs). */
  lock(by: string): boolean {
    const side = this.sideOf(by);
    if (this.st !== 'open' || !side) return false;
    side.locked = true;
    return true;
  }

  /** Accept the locked trade. Needs the offer locked first. Completes the trade when both sides accepted. */
  confirm(by: string): TradeSwap | null {
    const side = this.sideOf(by);
    if (this.st !== 'open' || !side || !side.locked) return null;
    side.accepted = true;
    if (!(this.a.accepted && this.b.accepted && this.a.locked && this.b.locked)) return null;
    this.st = 'done';
    return { toA: { gold: this.b.gold, items: [...this.b.items] }, toB: { gold: this.a.gold, items: [...this.a.items] } };
  }

  private sideOf(name: string): TradeSide | null {
    if (same(name, this.a.name)) return this.a;
    if (same(name, this.b.name)) return this.b;
    return null;
  }
}

function blankSide(name: string): TradeSide {
  return { name, gold: 0, items: [], locked: false, accepted: false };
}

/* ------------------------------------------------------------------------------------------------ wire (lobby channel `psoc`) */

export const PSOC = {
  /** Strike cadence and reach inside a duel (metres, ms). */
  STRIKE_MS: 1500,
  STRIKE_RANGE: 4,
  /** Share of the attacker's max HP per strike (at least 1). */
  STRIKE_FRAC: 0.07,
  /** Trade cancels when either side walks further than this from the other (metres). */
  TRADE_RANGE: 10,
  /** Follow stops within FOLLOW_STOP and gives up beyond FOLLOW_MAX (metres). */
  FOLLOW_STOP: 3,
  FOLLOW_MAX: 30,
  /** An opponent missing from the room this long counts as having left (ms). */
  ABSENT_MS: 3000,
  /** Most items in one trade offer. */
  TRADE_ITEMS: TRADE.MAX_ITEMS,
  /** Most equipment rows in a gear view. */
  GEAR_MAX: 12,
} as const;

export type PsocKind = 'duel' | 'trade' | 'party';

export type PsocMsg =
  | { op: 'req'; id: string; kind: 'duel' | 'trade'; to: string }
  | { op: 'party'; id: string; code: string; room: string; to: string }
  | { op: 'res'; id: string; ok: boolean; kind: PsocKind }
  | { op: 'end'; id: string; why: DuelEndReason }
  | { op: 'hit'; id: string; dmg: number }
  | { op: 'tOffer'; id: string; gold: number; items: PsocItem[] }
  | { op: 'tLock'; id: string }
  | { op: 'tAcc'; id: string }
  | { op: 'gearReq'; id: string }
  | { op: 'gear'; id: string; slots: PsocGearRow[] };

/** Item as it travels in a trade offer: the instance itself (uid, baseId, rarity ...). Shape-checked only. */
export interface PsocItem {
  uid: string;
  baseId: string;
  rarity: string;
  itemLevel: number;
  quantity?: number;
  [key: string]: unknown;
}

export interface PsocGearRow {
  /** Equipment slot id (EQUIP_SLOTS). */
  s: string;
  /** Display name. */
  n: string;
  /** Rarity id. */
  r: string;
  /** Item level. */
  l: number;
}

const ID_RE = /^[a-z0-9]{6,16}$/;
const WHY: readonly DuelEndReason[] = ['hp', 'surrender', 'leave', 'declined', 'timeout', 'cancel'];

/** Validates one `psoc` wire message (anything from the network is untrusted). Null for anything malformed. */
export function parsePsoc(d: unknown): PsocMsg | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return null;
  const id = o.id;
  const name = (x: unknown): string | null => friendKey(x) || null;
  const int = (x: unknown, lo: number, hi: number): number | null => {
    const v = Number(x);
    return Number.isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi ? v : null;
  };
  switch (o.op) {
    case 'req': {
      const to = name(o.to);
      if (!to || (o.kind !== 'duel' && o.kind !== 'trade')) return null;
      return { op: 'req', id, kind: o.kind, to };
    }
    case 'party': {
      const to = name(o.to);
      const code = typeof o.code === 'string' && /^[A-Za-z0-9_-]{2,16}$/.test(o.code) ? o.code : null;
      if (!to || !code) return null;
      const room = typeof o.room === 'string' ? o.room.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '';
      return { op: 'party', id, code, room, to };
    }
    case 'res':
      if (typeof o.ok !== 'boolean' || (o.kind !== 'duel' && o.kind !== 'trade' && o.kind !== 'party')) return null;
      return { op: 'res', id, ok: o.ok, kind: o.kind };
    case 'end':
      return (WHY as readonly unknown[]).includes(o.why) ? { op: 'end', id, why: o.why as DuelEndReason } : null;
    case 'hit': {
      const dmg = int(o.dmg, 1, 1_000_000);
      return dmg === null ? null : { op: 'hit', id, dmg };
    }
    case 'tOffer': {
      const gold = int(o.gold, 0, TRADE.MAX_GOLD);
      if (gold === null || !Array.isArray(o.items) || o.items.length > PSOC.TRADE_ITEMS) return null;
      const items: PsocItem[] = [];
      for (const it of o.items) {
        if (!it || typeof it !== 'object') return null;
        const r = it as Record<string, unknown>;
        if (typeof r.uid !== 'string' || !r.uid || r.uid.length > 64) return null;
        if (typeof r.baseId !== 'string' || !r.baseId || r.baseId.length > 64) return null;
        if (typeof r.rarity !== 'string' || r.rarity.length > 24) return null;
        if (typeof r.itemLevel !== 'number' || !Number.isFinite(r.itemLevel)) return null;
        items.push(r as PsocItem);
      }
      return { op: 'tOffer', id, gold, items };
    }
    case 'tLock':
      return { op: 'tLock', id };
    case 'tAcc':
      return { op: 'tAcc', id };
    case 'gearReq':
      return { op: 'gearReq', id };
    case 'gear': {
      if (!Array.isArray(o.slots) || o.slots.length > PSOC.GEAR_MAX) return null;
      const slots: PsocGearRow[] = [];
      for (const r of o.slots) {
        if (!r || typeof r !== 'object') return null;
        const g = r as Record<string, unknown>;
        const l = int(g.l, 0, 999);
        if (typeof g.s !== 'string' || typeof g.n !== 'string' || typeof g.r !== 'string' || l === null) return null;
        slots.push({ s: g.s.slice(0, 16), n: g.n.replace(/[\u0000-\u001f]/g, '').slice(0, 60), r: g.r.slice(0, 16), l });
      }
      return { op: 'gear', id, slots };
    }
    default:
      return null;
  }
}

/** Distance in the ground plane (x, z). */
export function groundDist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Short random id for one request (lowercase alphanumerics). `rnd` is injectable for tests. */
export function newPsocId(rnd: () => number = Math.random): string {
  let s = '';
  while (s.length < 10) s += Math.floor(rnd() * 36).toString(36);
  return s;
}
