import type { ArenaBracket, QueueAnnounce, QueueDiff, QueueKey } from '../../types/finder';
import type { RoleId } from '../../types/v2';

/**
 * DETERMINISTIC MATCHER (GDD_PVP_FINDER §2.9.3, package PV-02). PURE: no transport, no clock, no DOM, no randomness. Every queued peer runs
 * these functions on its local view of the lobby; only the PROPOSER (earliest `since` in the match, ties: smaller peer id) acts on the
 * result. Same inputs give the same output, so two peers with the same view agree on the group, the roles and the teams.
 */

/** A pool entry: the peer id comes from the transport meta, `age` is seconds since THIS peer received the entry's last `qann`. */
export interface Candidate {
  peerId: string;
  entry: QueueAnnounce;
  age: number;
}

/** Entries older than this (s) are not present any more (lobby TTL, NETCODE §3.4). */
export const QUEUE_PRESENT_SEC = 12;
export const ARENA_TEAM_SIZE: Record<ArenaBracket, number> = { '1v1': 1, '2v2': 2, '3v3': 3 };
export const RATING_WINDOW = { base: 150, perStep: 25, stepSec: 10, cap: 600 } as const;
/** Dungeon relaxations (§2.9.3): after RELAX_SEC a missing tank OR healer may be a dps; after PARTIAL_SEC a group of >= 3 starts. */
export const DUNGEON_RELAX = { relaxSec: 60, partialSec: 120, minPartial: 3 } as const;

// ---------------------------------------------------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------------------------------------------------

export type ParsedKey =
  | { kind: 'arena'; bracket: ArenaBracket; ranked: boolean }
  | { kind: 'dungeon'; random: boolean; dungeon: string; diff: QueueDiff; level: number };

export function parseQueueKey(key: string): ParsedKey | null {
  const a = /^arena:(1v1|2v2|3v3):([ru])$/.exec(key);
  if (a) return { kind: 'arena', bracket: a[1] as ArenaBracket, ranked: a[2] === 'r' };
  const r = /^dun:rnd:(normal|heroic|mythic|mplus):b(\d{1,2})$/.exec(key);
  if (r) return { kind: 'dungeon', random: true, dungeon: '', diff: r[1] as QueueDiff, level: Number(r[2]) };
  const d = /^dun:([A-Za-z0-9_.-]{1,40}):(normal|heroic|mythic|mplus):(\d{1,2})$/.exec(key);
  if (d) return { kind: 'dungeon', random: false, dungeon: d[1], diff: d[2] as QueueDiff, level: Number(d[3]) };
  return null;
}

export const arenaKey = (bracket: ArenaBracket, ranked: boolean): QueueKey => `arena:${bracket}:${ranked ? 'r' : 'u'}`;
export const randomDungeonKey = (diff: QueueDiff, level: number): QueueKey => `dun:rnd:${diff}:b${Math.max(0, Math.floor(level / 8))}`;

/** Can an entry queued under `b` match one queued under `a`? Equal keys always; Mitik+ keys of the same dungeon match within +-2 levels. */
export function keysCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseQueueKey(a), pb = parseQueueKey(b);
  if (!pa || !pb || pa.kind !== 'dungeon' || pb.kind !== 'dungeon') return false;
  return !pa.random && !pb.random && pa.diff === 'mplus' && pb.diff === 'mplus' && pa.dungeon === pb.dungeon && Math.abs(pa.level - pb.level) <= 2;
}

const byPeer = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** Queue order: oldest first, ties by peer id. */
export const bySince = (a: Candidate, b: Candidate): number => a.entry.since - b.entry.since || byPeer(a.peerId, b.peerId);

const eligibleFor = (pool: readonly Candidate[], key: QueueKey): Candidate[] => {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of [...pool].sort(bySince)) {
    if (c.age > QUEUE_PRESENT_SEC || seen.has(c.peerId) || !keysCompatible(c.entry.key, key)) continue;
    seen.add(c.peerId);
    out.push(c);
  }
  return out;
};

/** The proposer of a match: the member with the earliest `since` (ties: smaller peer id). */
export function proposerOf(members: readonly Candidate[]): string | null {
  if (!members.length) return null;
  return [...members].sort(bySince)[0].peerId;
}

// ---------------------------------------------------------------------------------------------------------------------
// arena
// ---------------------------------------------------------------------------------------------------------------------

/** Matchmaking rating of an entry: the hidden MMR when announced, else the visible rating. */
export const mmrOf = (e: QueueAnnounce): number => e.mmr ?? e.rating;

/** Rating window (+- around the anchor) after `waitSec` of waiting: 150 + 25 per 10 s, capped at 600. */
export const ratingWindow = (waitSec: number): number =>
  Math.min(RATING_WINDOW.cap, RATING_WINDOW.base + RATING_WINDOW.perStep * Math.floor(Math.max(0, waitSec) / RATING_WINDOW.stepSec));

export interface ArenaMatchPick {
  /** All players, oldest first. */
  members: Candidate[];
  teams: { A: string[]; B: string[] };
  /** Mean MMR of each team. */
  mean: [number, number];
  /** Rating spread of the group (max - min). */
  spread: number;
}

/** Snake draft pattern by rating: A B B A A B ... keeps |sum(A) - sum(B)| small. */
export function splitTeams(players: readonly Candidate[]): { A: Candidate[]; B: Candidate[] } {
  const ordered = [...players].sort((x, y) => mmrOf(y.entry) - mmrOf(x.entry) || byPeer(x.peerId, y.peerId));
  const A: Candidate[] = [], B: Candidate[] = [];
  ordered.forEach((c, i) => {
    const slot = i % 4;
    (slot === 0 || slot === 3 ? A : B).push(c);
  });
  return { A, B };
}

const meanOf = (xs: readonly Candidate[]): number => (xs.length ? xs.reduce((s, c) => s + mmrOf(c.entry), 0) / xs.length : 0);

/**
 * Arena group (§2.9.3): anchor = the oldest candidate; the group is the run of `2 x teamSize` neighbours in rating order that contains the
 * anchor and has the smallest spread, all of them inside the anchor's rating window. null when fewer than the needed players fit.
 */
export function matchArena(pool: readonly Candidate[], key: QueueKey, waitSec: number): ArenaMatchPick | null {
  const pk = parseQueueKey(key);
  if (!pk || pk.kind !== 'arena') return null;
  const size = ARENA_TEAM_SIZE[pk.bracket] * 2;
  const eligible = eligibleFor(pool, key);
  if (eligible.length < size) return null;
  const anchor = eligible[0];
  const win = ratingWindow(waitSec);
  const am = mmrOf(anchor.entry);
  const near = eligible.filter((c) => Math.abs(mmrOf(c.entry) - am) <= win);
  if (near.length < size) return null;
  const sorted = [...near].sort((x, y) => mmrOf(x.entry) - mmrOf(y.entry) || byPeer(x.peerId, y.peerId));
  const ai = sorted.findIndex((c) => c.peerId === anchor.peerId);
  let best: Candidate[] | null = null;
  let bestSpread = Infinity;
  for (let start = Math.max(0, ai - size + 1); start <= ai && start + size <= sorted.length; start++) {
    const run = sorted.slice(start, start + size);
    const spread = mmrOf(run[run.length - 1].entry) - mmrOf(run[0].entry);
    if (spread < bestSpread) {
      bestSpread = spread;
      best = run;
    }
  }
  if (!best) return null;
  const { A, B } = splitTeams(best);
  return {
    members: [...best].sort(bySince),
    teams: { A: A.map((c) => c.peerId), B: B.map((c) => c.peerId) },
    mean: [meanOf(A), meanOf(B)],
    spread: bestSpread,
  };
}

/** Rating window shown in the queue bar: [anchor - window, anchor + window] for the local entry. */
export function windowFor(myMmr: number, waitSec: number): [number, number] {
  const w = ratingWindow(waitSec);
  return [Math.max(0, Math.round(myMmr - w)), Math.round(myMmr + w)];
}

// ---------------------------------------------------------------------------------------------------------------------
// dungeon
// ---------------------------------------------------------------------------------------------------------------------

export interface DungeonPick {
  members: { cand: Candidate; role: RoleId }[];
  /** none: strict 1/1/3; tank / healer: that slot is filled by a dps; partial: fewer than 5. */
  relaxed: 'none' | 'tank' | 'healer' | 'partial';
}

const SLOTS: readonly RoleId[] = ['tank', 'healer', 'dps', 'dps', 'dps'];

/** Earliest-assignment search over the slots (tank, healer, dps x3); `relax` lets ONE tank / healer slot take any candidate. */
function fill(cands: readonly Candidate[], relax: 'none' | 'tank' | 'healer', minSize: number): { cand: Candidate; role: RoleId }[] | null {
  const taken = new Set<string>();
  const out: { cand: Candidate; role: RoleId }[] = [];
  const can = (c: Candidate, slot: number): boolean => {
    const role = SLOTS[slot];
    return c.entry.roles.includes(role) || (relax === role && c.entry.roles.length > 0);
  };
  let best: { cand: Candidate; role: RoleId }[] | null = null;
  const limit = Math.min(SLOTS.length, cands.length);
  const dfs = (slot: number): void => {
    if (best && best.length >= limit) return;
    if (slot === SLOTS.length) {
      if (out.length >= minSize && (!best || out.length > best.length)) best = out.slice();
      return;
    }
    for (const c of cands) {
      if (taken.has(c.peerId) || !can(c, slot)) continue;
      taken.add(c.peerId);
      out.push({ cand: c, role: SLOTS[slot] });
      dfs(slot + 1);
      out.pop();
      taken.delete(c.peerId);
      if (best && best.length >= limit) return;
    }
    // a partial group may leave the slot empty (only when minSize allows it)
    if (minSize < SLOTS.length) dfs(slot + 1);
  };
  dfs(0);
  return best;
}

/**
 * Dungeon group (§2.9.3). Strict: 1 tank, 1 healer, 3 dps (a peer counts once; the oldest peers win). waitSec >= 60: a missing tank OR
 * healer may be filled by another queuer ("Tanksız/Şifacısız başlıyor"). waitSec >= 120: a partial group of >= 3 starts.
 */
export function matchDungeon(pool: readonly Candidate[], key: QueueKey, waitSec: number): DungeonPick | null {
  const pk = parseQueueKey(key);
  if (!pk || pk.kind !== 'dungeon') return null;
  // only the oldest 15 take part (bounds the search); a peer with no declared role never matches
  const eligible = eligibleFor(pool, key).filter((c) => c.entry.roles.length > 0).slice(0, 15);
  if (eligible.length < DUNGEON_RELAX.minPartial) return null;
  const strict = fill(eligible, 'none', SLOTS.length);
  if (strict) return { members: strict, relaxed: 'none' };
  if (waitSec >= DUNGEON_RELAX.relaxSec) {
    for (const r of ['tank', 'healer'] as const) {
      const g = fill(eligible, r, SLOTS.length);
      if (g) return { members: g, relaxed: r };
    }
  }
  if (waitSec >= DUNGEON_RELAX.partialSec) {
    const g = fill(eligible, 'none', DUNGEON_RELAX.minPartial) ?? fill(eligible, 'tank', DUNGEON_RELAX.minPartial) ?? fill(eligible, 'healer', DUNGEON_RELAX.minPartial);
    if (g) return { members: g, relaxed: 'partial' };
  }
  return null;
}

/** What a dungeon queue still misses (display only): the local view of the pool. */
export function missingRoles(pool: readonly Candidate[], key: QueueKey): { tank: boolean; healer: boolean; dps: number } {
  const eligible = eligibleFor(pool, key);
  const has = (r: RoleId): number => eligible.filter((c) => c.entry.roles.includes(r)).length;
  return { tank: has('tank') === 0, healer: has('healer') === 0, dps: Math.min(3, has('dps')) };
}
