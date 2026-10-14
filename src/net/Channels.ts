/**
 * PUBLIC ZONE CHANNELS (Metin2 style "kanal") - the pure rules. No three.js, no G, no timers: NetSession (net/NetSession.ts) owns the
 * rooms, this file owns the decisions, so net/Channels can be tested headless (dev/combat-sim/channels.mjs). OWNER: net module.
 *
 * A channel is an ordinary game room with a deterministic name, `zone:<id>:ch<N>` (+ the game version), joined by everybody who stands
 * in that open-world zone or in the town and is not inside a party room. Discovery needs no server: trystero finds the peers of a room
 * name by itself, and the global lobby presence (`lpres` `cz` / `ch`) tells everybody how full each channel is.
 *
 *   pick     fullest channel below capacity, else the lowest empty one (a leader's channel first)
 *   capacity CHANNELS.CAP_* players (room max). The slot / entity-id range allows 15 (MAX_SLOTS); 12 is what the relay budget allows
 *            (see INTEREST and the numbers measured in dev/combat-sim/channels.mjs).
 *   election a peer that finds nobody waits SETTLE ms, then the OLDEST settler (lowest (since, id)) hosts; late split brains are merged
 *            by the same order inside a short window. Members keep a join sequence `js` (host-assigned); when the host leaves, every
 *            member computes the same successor = lowest `js` among the survivors (successorOf), so no election message is needed.
 *   interest the host relays position streams by distance (INTEREST): near full rate, mid 2 Hz, far nothing.
 *   ledger   wall-clock respawn timers of camps (the part of the world a re-seeded host would otherwise forget).
 */
import { MAX_SLOTS, ident } from './messages';

/* ------------------------------------------------------------------------------------------------ constants */

export const CHANNELS = {
  /** Players per open-world channel (room max). Hard ceiling is MAX_SLOTS = 15 (entity-id range). */
  CAP_WORLD: 12,
  /** Players per town channel. */
  CAP_TOWN: 12,
  /** Kızıl Sınır (PvP zone): its capture points and score are tuned for the 8-player PvP room (MAX_ROOM_SIZE), so its channels stay at 8. */
  CAP_PVP: 8,
  /** Hard ceiling: player entity ids are 1..15. */
  HARD_MAX: MAX_SLOTS,
  /** Highest channel number a zone can open. */
  MAX_CHANNELS: 12,
  /** Rooms tried (full / failed) before the player continues alone. */
  JOIN_TRIES: 4,
  /** Minimum gap between two manual channel switches. */
  SWITCH_COOLDOWN_MS: 8000,
  /** A followed leader that has been absent from the presence list this long is forgotten. */
  LEADER_LOST_MS: 120000,
  /** Entries of the camp ledger sent in one message / kept. */
  LEDGER_MAX: 256,
  /** The longest respawn timer worth remembering (s). */
  LEDGER_MAX_TTL_S: 3600,
} as const;

/** Interest management (host relay of player position streams). Distances in metres. */
export const INTEREST = {
  /** Inside this distance a stream is relayed at its full rate. */
  NEAR_M: 150,
  /** Beyond this distance a stream is not relayed at all (the peer still counts for the roster / presence). */
  FAR_M: 400,
  /** Rate of a stream between NEAR_M and FAR_M. */
  MID_HZ: 2,
  /** Chat radius: `say` (Yakın) and emotes, `yell` (Bağır). */
  SAY_M: 60,
  YELL_M: 250,
  /** A position older than this (ms) is treated as unknown (= near, fail open). */
  STALE_POS_MS: 8000,
} as const;

/** Channels whose host relay is distance-gated, and how. `stream` = continuous state (tiers + MID_HZ), `event` = discrete (cut only beyond FAR_M). */
export const INTEREST_CHANNELS: Readonly<Record<string, 'stream' | 'event'>> = {
  pstate: 'stream',
  minion: 'stream',
  cast: 'event',
};

export interface ChannelTiming {
  /** Peer-discovery window before a joiner that heard no host elects one. */
  settleMs: number;
  /** How long an elected winner may take to claim hosting before it is ignored and the election repeats. */
  graceMs: number;
  /** Whole-join timeout (then the next channel / solo). */
  joinTimeoutMs: number;
  /** After the host left: how long members wait for the successor to claim before skipping it. */
  migrateWaitMs: number;
  /** A promoted host keeps un-rehomed members this long. */
  rehomeGraceMs: number;
  /** A host younger than this yields to an older competing claim (split-brain merge). */
  mergeWindowMs: number;
  /** Camp-ledger broadcast cadence (when dirty). */
  ledgerEveryMs: number;
  /** A member that hears nothing from its host this long (the host pings every 2 s) treats it as lost; a host that was frozen this long yields to a member's claim. */
  hostSilenceMs: number;
}

export const TIMING_P2P: ChannelTiming = {
  settleMs: 2500, graceMs: 4000, joinTimeoutMs: 15000, migrateWaitMs: 5000, rehomeGraceMs: 10000, mergeWindowMs: 20000, ledgerEveryMs: 5000, hostSilenceMs: 9000,
};
export const TIMING_LOCAL: ChannelTiming = {
  settleMs: 500, graceMs: 900, joinTimeoutMs: 5000, migrateWaitMs: 1500, rehomeGraceMs: 3000, mergeWindowMs: 20000, ledgerEveryMs: 2000, hostSilenceMs: 3500,
};

/* ------------------------------------------------------------------------------------------------ names */

export interface ChannelInfo {
  zone: string;
  num: number;
  /** `zone:<id>:ch<N>` */
  key: string;
  /** Room maximum. */
  cap: number;
}

export const channelKey = (zone: string, num: number): string => `zone:${zone}:ch${num}`;

/** Parses `zone:<id>:ch<N>`; null when malformed. The zone id is an identifier (letters, digits, `_ . -`), at most 32 chars. */
export function parseChannelKey(key: unknown): { zone: string; num: number } | null {
  if (typeof key !== 'string' || key.length > 64) return null;
  const m = /^zone:([A-Za-z0-9_.-]{1,32}):ch(\d{1,2})$/.exec(key);
  if (!m) return null;
  const num = Number(m[2]);
  return num >= 1 && num <= CHANNELS.MAX_CHANNELS ? { zone: m[1], num } : null;
}

/** Room code of a channel. The game version is part of it, so peers on another build never meet (and never fight over the host role). */
export const channelRoomCode = (zone: string, num: number, gameVersion: string): string => `${channelKey(zone, num)}@${ident(gameVersion, 16) || '0'}`;

/** data/pvpZone.ts PVP_ZONE_ID (kept literal so this file stays dependency-free; the sim checks they match). */
export const PVP_CHANNEL_ZONE = 'kizil_sinir';
export const channelCap = (zone: string): number => Math.min(CHANNELS.HARD_MAX, zone === 'town' ? CHANNELS.CAP_TOWN : zone === PVP_CHANNEL_ZONE ? CHANNELS.CAP_PVP : CHANNELS.CAP_WORLD);

export const channelTag = (num: number): string => `CH${num}`;

/**
 * Which channel zone a scene belongs to: 'town' for the town, the map id for an open-world map, null for everything else (dungeon
 * runs, Kadim Yarıklar, house visits stay in their private instance). `isWorld` is flow.isOpenWorld.
 */
export function zoneKeyOf(scene: string | null | undefined, params: unknown, isWorld: (id: string) => boolean): string | null {
  if (scene === 'town') return 'town';
  if (scene !== 'dungeon' || typeof params !== 'object' || params === null) return null;
  const id = (params as { dungeonId?: unknown }).dungeonId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,32}$/.test(id)) return null;
  return isWorld(id) ? id : null;
}

/* ------------------------------------------------------------------------------------------------ picking */

/** One row of the presence list, as far as channels care. */
export interface ChannelPresenceRow {
  self: boolean;
  channel?: { zone: string; num: number } | null;
  name?: string;
}

/** Players per channel number in `zone` from the presence list (the local player is skipped: it is about to move). */
export function countChannels(rows: readonly ChannelPresenceRow[], zone: string, includeSelf = false): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.self && !includeSelf) continue;
    if (!r.channel || r.channel.zone !== zone) continue;
    out.set(r.channel.num, (out.get(r.channel.num) ?? 0) + 1);
  }
  return out;
}

export interface PickOptions {
  cap: number;
  /** Channel to take when it has room (leader's channel, the one the player left last). */
  prefer?: number | null;
  /** Channels already tried this attempt (full / unreachable). */
  exclude?: ReadonlySet<number>;
  maxChannels?: number;
}

/**
 * Channel to join: the preferred one when it has room, else the FULLEST below capacity (ties: lowest number), else the lowest number
 * that nobody is in ("open the next channel"). 0 when every channel up to maxChannels is excluded or full.
 */
export function pickChannel(counts: ReadonlyMap<number, number>, o: PickOptions): number {
  const max = o.maxChannels ?? CHANNELS.MAX_CHANNELS;
  const ex = o.exclude;
  const room = (n: number): boolean => n >= 1 && n <= max && !ex?.has(n) && (counts.get(n) ?? 0) < o.cap;
  if (o.prefer && room(o.prefer)) return o.prefer;
  let best = 0;
  let bestN = -1;
  for (const [n, c] of counts) {
    if (c <= 0 || !room(n)) continue;
    if (c > bestN || (c === bestN && n < best)) {
      best = n;
      bestN = c;
    }
  }
  if (best) return best;
  for (let n = 1; n <= max; n++) if (room(n)) return n;
  return 0;
}

/** `/kanal` listing: header + one line per channel that has players, plus the current one and the next free one. */
export function channelLines(zoneLabel: string, counts: ReadonlyMap<number, number>, current: number, cap: number, max: number = CHANNELS.MAX_CHANNELS): string[] {
  const lines: string[] = [`${zoneLabel} - kanallar (CH${current}):`];
  const shown = new Set<number>([current]);
  for (const [n, c] of counts) if (c > 0) shown.add(n);
  let nextFree = 0;
  for (let n = 1; n <= max; n++) {
    if (!shown.has(n) && (counts.get(n) ?? 0) === 0) {
      nextFree = n;
      break;
    }
  }
  if (nextFree) shown.add(nextFree);
  for (const n of [...shown].sort((a, b) => a - b)) {
    const c = counts.get(n) ?? 0;
    lines.push(`  CH${n}  ${c}/${cap}${c >= cap ? ' (dolu)' : ''}${n === current ? '  <- buradasın' : ''}`);
  }
  lines.push('Değiştirmek için: /kanal <numara> (savaş dışında).');
  return lines;
}

/* ------------------------------------------------------------------------------------------------ election / migration */

export interface Claim {
  /** The claimant's own wall clock when it started joining the room (used only to ORDER claims, never compared with a local clock). */
  since: number;
  id: string;
}

/** Total order on claims: earlier `since` first, then the lower peer id. The same on every peer, whatever its clock says. */
export const claimBefore = (a: Claim, b: Claim): boolean => a.since < b.since || (a.since === b.since && a.id < b.id);

/** The oldest of `self` and `others`. */
export function electHost(self: Claim, others: readonly Claim[]): Claim {
  let w = self;
  for (const o of others) if (claimBefore(o, w)) w = o;
  return w;
}

export interface Rostered {
  id: string;
  /** Join sequence the host assigned (lower = joined earlier). */
  js: number;
}

/** Successor of a lost host: the survivor with the lowest join sequence (ties: lowest id). Deterministic from the replicated roster. */
export function successorOf(roster: readonly Rostered[], exclude: ReadonlySet<string>): string | null {
  let best: Rostered | null = null;
  for (const r of roster) {
    if (exclude.has(r.id)) continue;
    if (!best || r.js < best.js || (r.js === best.js && r.id < best.id)) best = r;
  }
  return best ? best.id : null;
}

/* ------------------------------------------------------------------------------------------------ interest management */

export type Tier = 'near' | 'mid' | 'none';

/** Interest tier of a distance in metres; unknown (null / NaN) is `near` (fail open: never starve a peer because a position is missing). */
export function tierOf(dist: number | null): Tier {
  if (dist === null || !Number.isFinite(dist)) return 'near';
  return dist <= INTEREST.NEAR_M ? 'near' : dist <= INTEREST.FAR_M ? 'mid' : 'none';
}

export const dist2d = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** Chat radius for the `ch` of a chat message in a public channel (party chat does not exist there: null). */
export function chatRadius(ch: unknown): number | null {
  if (ch === 'yell') return INTEREST.YELL_M;
  if (ch === 'say' || ch === 'emote') return INTEREST.SAY_M;
  return null;
}

/**
 * Host-side relay gate for one (channel, sender, recipient) triple. Stateless except for the per-triple clock that thins the mid tier to
 * INTEREST.MID_HZ. `nowMs` is any monotonic ms clock.
 */
export class InterestFilter {
  private readonly last = new Map<string, number>();

  allow(kind: 'stream' | 'event', channel: string, from: string, to: string, dist: number | null, nowMs: number): boolean {
    const t = tierOf(dist);
    if (t === 'none') return false;
    if (t === 'near' || kind === 'event') return true;
    const key = `${channel}|${from}|${to}`;
    const prev = this.last.get(key);
    // 10 % slack: a 15 Hz source arrives every 66.7 ms, so "500 ms later" lands on the 8th message (1.9 Hz); with slack on the 7th (2.1 Hz)
    if (prev !== undefined && nowMs - prev < (1000 / INTEREST.MID_HZ) * 0.9) return false;
    this.last.set(key, nowMs);
    return true;
  }

  /** Drop every clock that involves `peer`. */
  forget(peer: string): void {
    for (const k of [...this.last.keys()]) {
      const p = k.split('|');
      if (p[1] === peer || p[2] === peer) this.last.delete(k);
    }
  }

  clear(): void {
    this.last.clear();
  }

  get size(): number {
    return this.last.size;
  }
}

/* ------------------------------------------------------------------------------------------------ camp ledger */

/**
 * Wall-clock respawn memory of a channel. The host notes "camp X was wiped, back in S seconds"; the entries are replicated to every member
 * as REMAINING seconds (no clock is shared), so whoever becomes host after a migration can re-seed its camps with the timers that were
 * running instead of resurrecting every camp at once. Pure data; the keys are `camp:<packId>`.
 */
const KEY_RE = /^[A-Za-z0-9_.:-]{1,48}$/;

export class ChannelLedger {
  private readonly exp = new Map<string, number>();
  private dirtyFlag = false;

  note(key: string, ttlSec: number, nowMs: number): void {
    const k = ident(key, 48);
    if (!k || !Number.isFinite(ttlSec) || ttlSec <= 0) return;
    const t = Math.min(ttlSec, CHANNELS.LEDGER_MAX_TTL_S);
    if (!this.exp.has(k) && this.exp.size >= CHANNELS.LEDGER_MAX) this.prune(nowMs);
    if (!this.exp.has(k) && this.exp.size >= CHANNELS.LEDGER_MAX) return;
    this.exp.set(k, nowMs + t * 1000);
    this.dirtyFlag = true;
  }

  /** Seconds left on `key` (0 = none / expired). */
  remaining(key: string, nowMs: number): number {
    const k = ident(key, 48);
    const e = this.exp.get(k);
    if (e === undefined) return 0;
    const left = (e - nowMs) / 1000;
    if (left <= 0) {
      this.exp.delete(k);
      return 0;
    }
    return left;
  }

  /** Wire form: [key, remaining seconds] of every live entry. */
  encode(nowMs: number): [string, number][] {
    this.prune(nowMs);
    const out: [string, number][] = [];
    for (const [k, e] of this.exp) out.push([k, Math.round(((e - nowMs) / 1000) * 10) / 10]);
    this.dirtyFlag = false;
    return out.slice(0, CHANNELS.LEDGER_MAX);
  }

  /** Apply a wire list from the host (untrusted: keys are identifiers, times are clamped). */
  merge(list: unknown, nowMs: number): void {
    if (!Array.isArray(list)) return;
    for (const row of list.slice(0, CHANNELS.LEDGER_MAX)) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const k = typeof row[0] === 'string' && KEY_RE.test(row[0]) ? row[0] : '';
      const rem = row[1];
      if (!k || typeof rem !== 'number' || !Number.isFinite(rem)) continue;
      if (rem <= 0) this.exp.delete(k);
      else this.exp.set(k, nowMs + Math.min(rem, CHANNELS.LEDGER_MAX_TTL_S) * 1000);
    }
    while (this.exp.size > CHANNELS.LEDGER_MAX) this.exp.delete(this.exp.keys().next().value as string);
  }

  prune(nowMs: number): void {
    for (const [k, e] of this.exp) if (e <= nowMs) this.exp.delete(k);
  }

  get dirty(): boolean {
    return this.dirtyFlag;
  }

  clear(): void {
    this.exp.clear();
    this.dirtyFlag = false;
  }

  get size(): number {
    return this.exp.size;
  }
}
