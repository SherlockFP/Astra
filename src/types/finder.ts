import type { ClassId } from './common';
import type { RoleId, SpecId } from './v2';
import type { AffixId } from './mythic';

/**
 * GDD_PVP_FINDER §2.8 / §3.4 (PV-00): matchmaking queue, arena profile and the queue API the UI uses.
 * Pure types. The queue rides on the GLOBAL lobby (net/messages.ts LobbyChannels `qann`..`qdecl`), not on shard rooms (design delta
 * recorded in net/queue/QueueCore.ts).
 */

export type QueueDiff = 'normal' | 'heroic' | 'mythic' | 'mplus';
export type ArenaBracket = '1v1' | '2v2' | '3v3';
export const ARENA_BRACKETS: readonly ArenaBracket[] = ['1v1', '2v2', '3v3'];

/** Queue key. Equal keys can match. */
export type QueueKey =
  | `dun:rnd:${QueueDiff}:b${number}`        // random normal/heroic, level band b = floor(level / 8)
  | `dun:${string}:${QueueDiff}:${number}`   // specific dungeon (id), difficulty, key level (0 when not M+)
  | `arena:${ArenaBracket}:${'r' | 'u'}`;    // bracket, ranked or unranked

/** Lobby queue announcement (channel `qann`). The sender id comes from the transport meta, never from the payload. */
export interface QueueAnnounce {
  t: 'qann';
  proto: number;
  gameVersion: string;
  key: QueueKey;
  /** Reserved for shard rooms (always 1 on the global lobby). */
  shard: number;
  /** Sanitised display name, max 20. */
  name: string;
  classId: ClassId;
  level: number;
  /** Item level (summary.itemLevel). */
  ilvl: number;
  /** Declared roles (dungeon queues); [] for arena. */
  roles: RoleId[];
  spec?: SpecId;
  /** Arena: visible rating of the bracket (display). M+: mplus rating. Else 0. */
  rating: number;
  /** Arena: hidden matchmaking rating (MMR). Absent = use `rating`. */
  mmr?: number;
  /** Accepted dungeon ids (random queues), max 4. */
  dungeons?: string[];
  /** M+ only, 2..30. */
  keyLevel?: number;
  /** Sender's WALL clock (Date.now) when it queued. Receivers only use it to ORDER entries (proposer = earliest), never as a duration. Design delta: the GDD says performance.now(), which is not comparable between peers. */
  since: number;
  /** In a pending proposal (acked or proposing): excluded from other proposals. Absent = free. */
  busy?: boolean;
  /** Increments on every send; older revs ignored. */
  rev: number;
}
export interface QueueCancel { t: 'qcancel'; key: QueueKey; shard: number }

/** Match proposal (`qprop`, to each member). Only the proposer sends it. */
export interface MatchProposal {
  t: 'qprop';
  /** Random 8-char id, proposer generated. */
  mid: string;
  key: QueueKey;
  shard: number;
  /** Game room code the proposer will host (makeRoomCode()). */
  code: string;
  mode: 'coop' | 'pvp';
  dungeonId: string | null;
  diff: QueueDiff | null;
  keyLevel: number;
  /** Arena queues. */
  bracket: ArenaBracket | null;
  ranked: boolean;
  /** Arena only: peer ids; dungeon: null. */
  teams: { A: string[]; B: string[] } | null;
  /** Arena map id picked by the proposer (seeded by `mid`), '' for dungeons. */
  arenaId: string;
  members: { peerId: string; role: RoleId | null; classId: ClassId; level: number; ilvl: number; rating: number }[];
  affixes: AffixId[];
}
export interface MatchAck { t: 'qack' | 'qdecl'; mid: string; reason?: 'busy' | 'moved' | 'cancel' }

/** Local queue state of this peer (not sent). */
export interface QueueState {
  key: QueueKey | null;
  shard: number;
  /** Local ms (QueueClock.now) when the queue was entered. */
  since: number;
  phase: 'idle' | 'searching' | 'proposed' | 'joining' | 'in_match';
  mid: string | null;
  /** Dungeon queues: what is still missing (display only). */
  roleFill: { tank: boolean; healer: boolean; dps: number };
  /** Arena queues: the rating window currently searched ([lo, hi]); null for dungeons. */
  window: [number, number] | null;
  /** Peers of the same key seen alive in the lobby (including self). */
  pool: number;
}

/** Arena rating and season profile, stored in `CharacterSave.arena` (the existing `CharacterSave.pvp` is the world-PvP record). */
export interface ArenaProfile {
  /** Season index = floor(weekIndex / PVP_SEASON_WEEKS). */
  season: number;
  /** Visible rating per bracket, default 1500. */
  rating: Record<ArenaBracket, number>;
  /** Hidden matchmaking rating per bracket. */
  mmr: Record<ArenaBracket, number>;
  /** Ranked games played this season (provisional while < 10). */
  games: Record<ArenaBracket, number>;
  wins: Record<ArenaBracket, number>;
  /** Highest visible rating this season. */
  peak: Record<ArenaBracket, number>;
  /** Bounty day key of the last first-win bonus. */
  firstWinDay: number;
  /** Local queue lock after a forfeit / leave (epoch ms) and the forfeits counted in the last 24 h. */
  lockUntil: number;
  leaves: { n: number; day: number };
  /** Archive of ended seasons (best rating per bracket), newest last, max 8. */
  history: { season: number; best: Record<ArenaBracket, number> }[];
}
/** GDD name for the profile. */
export type PvpProfile = ArenaProfile;

/** What `G.net.queue.enter` needs. Arena: only `rating` / `mmr` are read from the profile when absent. */
export interface QueueEnterOpts {
  roles?: RoleId[];
  dungeons?: string[];
  keyLevel?: number;
  rating?: number;
  mmr?: number;
}

/** Events the queue emits through `onChange` (the same data goes to G.events 'finder:queue'). */
export type QueueNotice =
  | { k: 'state'; state: QueueState }
  | { k: 'found'; mid: string; key: QueueKey }
  | { k: 'declined'; reason: string }
  | { k: 'timeout' }
  | { k: 'joinFail'; reason: string }
  | { k: 'cooldown'; until: number };

export interface FinderApi {
  state(): QueueState;
  /** Joins the queue. Fails (ok false, Turkish reason) when not in town, already queued, locked, under level, or arena data missing. */
  enter(key: QueueKey, opts?: QueueEnterOpts): { ok: boolean; reason?: string };
  cancel(): void;
  /** Subscribe to state changes and notices. Returns the unsubscribe function. */
  onChange(cb: (s: QueueState, notice?: QueueNotice) => void): () => void;
  /** The arena match is over (ArenaController calls it on exit): the queue goes back to idle. */
  matchOver?(): void;
  /** Results card "Kuyruğa Tekrar Gir": the arena exit runs first, then the same key is queued once the player is in town. */
  requeueAfterMatch?(key: QueueKey): void;
}
