/**
 * EFSUN ONLINE - wire protocol (PROTOCOL_VERSION 3). ARCHITECTURE.md "Net channels" + "Precedence" are normative.
 *
 * Topology: logical STAR over trystero's physical mesh. Every message goes client <-> host; the host relays
 * client -> client traffic. Two physical channels in the game room:
 *
 *   ctl  JSON  session control (handshake, party state, ready check, scene-load reports, pings, kick)
 *   g    JSON  the GENERIC ENVELOPE that carries every typed gameplay channel of types/net.ts (NetChannels):
 *              { c: 'pstate' | 'snap' | 'hit' | ..., p: payload, s: sceneSeq, t?: target, f?: origin }
 *
 * and two lobby channels (room browser): ann / unann.
 *
 * Damage model (client-computed, see ARCHITECTURE.md): player -> enemy damage is computed by the attacker and sent
 * to the host over the typed `hit` channel; enemy -> player hits are resolved by every peer for its own player.
 * The research draft messages (CastCmd, HitReportCmd, PickupCmd, snapshot binary codecs, ...) are NOT used and were
 * removed. Everything received from the network is untrusted: validate before use (sanitize* helpers below).
 */
import { HOST_DYNAMIC_ID_BASE, LOCAL_ID_BASE, PARTY_ID_BASE, type ClassId, type EntityId, type Vec2, type Vec3 } from '../types/common';
import type { SceneId } from '../types/common';
import type { CharacterSummary } from '../types/character';
import type { KeystoneData } from '../types/items';
import type { NetChannel, ShopAnnounce, ShopBuyMsg, ShopSoldMsg } from '../types/net';
import type { WorldSpawn } from '../scenes/scenes';
import type { GuildChatMsg, GuildInviteMsg, GuildSyncMsg } from '../types/guild';
import { cleanNation } from '../data/nations';
import type { MatchAck, MatchProposal, QueueAnnounce, QueueCancel, QueueKey } from '../types/finder';
import { ARENA_BRACKETS } from '../types/finder';
import type { ArenaMsg } from '../types/net';

export type { EntityId, Vec2, Vec3 };

/* ================================================================================================
 * Versions, room ids, constants
 * ============================================================================================== */

/** Bump on ANY wire-format change. Lobby and game rooms are namespaced by it. */
export const PROTOCOL_VERSION = 3;
/** Bump when gameplay data that must match between peers changes (dungeon defs, enemy tables, skill ids). */
export const GAME_VERSION = '0.1.0';

export const NET_APP_ID = 'efsun-online';
export const LOBBY_ROOM_ID = `efsun-lobby-v${PROTOCOL_VERSION}`;
export const GAME_ROOM_PREFIX = `efsun-g${PROTOCOL_VERSION}-`;
export const MAX_PARTY_SIZE = 5;
/** GDD_LIFE §7.5 (L-00): room size of the `pvp` room mode (team skirmish). `coop` rooms stay at MAX_PARTY_SIZE. */
export const MAX_ROOM_SIZE = 8;
/**
 * Hard ceiling of players in ONE room: player entity ids are PARTY_ID_BASE + slot and must stay below the dungeon-enemy range
 * (types/common.ts: ids 1..15), so slots are 0..14. Public zone channels (net/Channels.ts) use up to this; party rooms keep
 * MAX_PARTY_SIZE / MAX_ROOM_SIZE. Wire sanitisers clamp slots / member lists to it.
 */
export const MAX_SLOTS = 15;

/** Room codes: 6 chars without look-alikes (0/O, 1/I/L). 31^6 ~ 8.9e8 combinations. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const NET = {
  /** Host -> client enemy snapshot rate. */
  SNAPSHOT_HZ: 15,
  /** Every peer -> all own-player state rate while moving. */
  PLAYER_STATE_HZ: 15,
  /** Idle players still send a keep-alive state this often (seconds). */
  IDLE_STATE_INTERVAL_S: 0.3,
  /** NC43: owner -> all `minion` snapshot rate (GDD_CLASSES_V2 §1.5 rule 1); an unchanged list is repeated every IDLE_STATE_INTERVAL_S. */
  MINION_HZ: 10,
  /** NC43: a remote minion with no snapshot for this long is dropped (seconds). */
  MINION_STALE_S: 1.5,
  /** NC43: most minions one peer may own (Minions.MINION_PER_OWNER_CAP); longer lists are cut. */
  MAX_MINIONS_PER_PEER: 14,
  /** Initial remote interpolation delay (seconds); Replication adapts it per peer to the measured jitter (0.1..0.3). */
  INTERP_DELAY_S: 0.13,
  PING_INTERVAL_MS: 2000,
  HELLO_TIMEOUT_MS: 10000,
  /** Real P2P: Nostr peer discovery + WebRTC/ICE needs longer before the host even shows up as a peer. */
  P2P_HELLO_TIMEOUT_MS: 25000,
  READY_CHECK_TIMEOUT_MS: 30000,
  SCENE_LOAD_TIMEOUT_MS: 45000,
  LOBBY_ANNOUNCE_INTERVAL_MS: 4000,
  /** Lobby entries not refreshed for this long are dropped (3 missed announcements). */
  LOBBY_TTL_MS: 12000,
  /** Enemies within this distance of any remote player are included in host snapshots (dungeons; open world: below). */
  RELEVANCE_RADIUS: 70,
  /** Host re-sends every relevant enemy at least this often (late joiners / lost updates), seconds. */
  KEYFRAME_INTERVAL_S: 1.5,
  /** Max enemies per `snap` message (keeps frames below trystero's 16 KB inline limit). */
  SNAP_CHUNK: 48,
  /** Open world (DungeonDef.world): enemies within this distance of a remote player are streamed to the party, metres. */
  OPEN_WORLD_RELEVANCE_RADIUS: 120,
  /** Max enemies the host puts into ONE snapshot tick, nearest first (the rest follow on the next tick). */
  MAX_SNAP_ENEMIES: 60,
  /** Messages buffered while a scene loads (oldest dropped beyond this). */
  BUFFER_CAP: 800,
  MAX_NAME_LEN: 20,
  MAX_ROOM_NAME_LEN: 32,
  MAX_CHAT_LEN: 200,
  /** Chat rate limit enforced by the host: messages per 10 s per peer. */
  CHAT_BURST: 8,
  // ---- GDD_PVP_FINDER §8.1: matchmaking queue (lobby channels qann / qcancel / qprop / qack / qdecl) and arena rounds.
  QUEUE_ANN_MS: 3000,
  QUEUE_TTL_MS: 12000,
  QUEUE_SHARD_CAP: 30,
  QUEUE_ACK_TIMEOUT_MS: 8000,
  QUEUE_MAX_WAIT_MS: 900000,
  ARENA_PREP_SEC: 30,
  ARENA_ROUND_SEC: 300,
  ARENA_INTERMISSION_SEC: 15,
  PHIT_MAX_PER_SEC: 12,
} as const;

/* Entity ids (see src/types/common.ts):
 *   1..15            players, id = PARTY_ID_BASE + slot
 *   100..49_999      dungeon enemies, deterministic from DungeonDef
 *   50_000..899_999  host-spawned dynamic entities
 *   1_000_000+       local-only, never on the wire */
export const playerEntityId = (slot: number): EntityId => PARTY_ID_BASE + slot;
export const isPlayerEntity = (id: EntityId): boolean => id >= PARTY_ID_BASE && id < PARTY_ID_BASE + 15;
export const slotOfPlayerEntity = (id: EntityId): number => id - PARTY_ID_BASE;
export const isHostDynamicEntity = (id: EntityId): boolean => id >= HOST_DYNAMIC_ID_BASE && id < LOCAL_ID_BASE;
export const isNetworkedEntity = (id: EntityId): boolean => id >= PARTY_ID_BASE && id < LOCAL_ID_BASE;

export function makeRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return code;
}

/** Normalises user input ("k7q 2xm" -> "K7Q2XM"); null if not a valid code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export const gameRoomId = (code: string): string => GAME_ROOM_PREFIX + code;

/* ================================================================================================
 * Lobby room (channels 'ann' / 'unann')
 * ============================================================================================== */

/** 'world' = an open-world map (DungeonDef.world). Display only: the game logic treats it as a dungeon scene. */
export type RoomActivity = 'town' | 'dungeon' | 'mythic' | 'world';

/** UX-41 (§6.5): what a host looks for, shown in the room browser (Gruplar tab). Append-only; absent = no listing. */
export interface LfgListing {
  dungeon: string;
  diff: 'normal' | 'heroic' | 'mythic' | 'mythicplus';
  key?: number;
  need: { tank: number; healer: number; dps: number };
  ilvl?: number;
  note?: string;
}

export interface RoomAnnouncement {
  t: 'ann';
  proto: number;
  gameVersion: string;
  /** gameRoomId(code) */
  roomId: string;
  code: string;
  name: string;
  hostName: string;
  hostLevel: number;
  hostClass: string;
  activity: RoomActivity;
  dungeon: string | null;
  /** 0 = no keystone selected. */
  keyLevel: number;
  /** Plain strings: lobby data comes from strangers; UI must handle unknown ids. */
  affixes: string[];
  players: number;
  maxPlayers: number;
  minLevel: number;
  hasPassword: boolean;
  /** A run is in progress; joins are refused until the party is back in town. */
  inProgress: boolean;
  lang: string;
  /** Incremented by the host on every change. */
  rev: number;
  /** GDD_LIFE §6.7 (L-00): host-set item-level gate; joins below it are refused ("Eşya Seviyesi yetersiz"). Default 0 / absent = none. */
  minIlvl?: number;
  /** GDD_LIFE §7.5 (L-00): room mode. Absent = 'coop'. 'pvp' allows up to MAX_ROOM_SIZE peers. */
  mode?: 'coop' | 'pvp';
  /** UX-41: LFG listing of the host (Grup Ara / Gruplar). Absent = not looking for members. */
  lfg?: LfgListing;
}

export interface RoomUnannounceMsg {
  t: 'unann';
  roomId: string;
}

/** GDD_LIFE §3.8 (L-00): global / trade chat on the lobby transport. The sender id comes from the transport meta, never the payload. */
export interface LobbyChatMsg {
  t: 'lchat';
  name: string;
  text: string;
  cls?: ClassId;
  lvl?: number;
  trade?: boolean;
}

/** Social (global lobby): presence announcement. Sender id from the transport meta. `bye` = leaving (character switch / logout). Owner: systems/Social.ts. */
export interface LobbyPresenceMsg {
  t: 'lpres';
  name: string;
  cls: ClassId;
  lvl: number;
  /** Scene / region id (identifier characters only) and an optional display name. */
  zone: string;
  zn?: string;
  /** WP-06: nation id (absent from old clients). */
  nat?: string;
  /** WP-12 (append-only): id of the summoned cosmetic pet (data/pets.ts), absent = none. */
  pet?: string;
  bye?: boolean;
  /** WP-05 Lonca (systems/Guild.ts): guild name (tag), guild id and the roster version the sender holds (`gv`, see rosterVersion). Absent = no guild. */
  g?: string;
  gid?: string;
  gv?: number;
  /**
   * Public zone channel (net/Channels.ts): zone id (`cz`) and channel number (`ch`, 1..) of the room the sender is in; absent = no public
   * channel (party room, dungeon, offline). `pl` = character name of the party leader the sender follows (soft party, NetSession.partyLeader).
   */
  cz?: string;
  ch?: number;
  pl?: string;
  /** Append-only (GDD_PVP_FINDER §3.4): best 2v2 / 3v3 rating `r` and its bracket `b`; absent = not announced. Receiver validates (arenaRules sanitizePresence). */
  ar?: { r: number; b: '2v2' | '3v3' };
}

/** Social: whisper, sent to ONE peer id (never broadcast). `to` is the target's character name (receiver checks it against its own). */
export interface LobbyWhisperMsg {
  t: 'lwhis';
  name: string;
  to: string;
  text: string;
  cls?: ClassId;
  lvl?: number;
}

export type LobbyChannels = {
  ann: RoomAnnouncement;
  unann: RoomUnannounceMsg;
  lchat: LobbyChatMsg;
  /** Social presence + whispers (systems/Social.ts). */
  lpres: LobbyPresenceMsg;
  lwhis: LobbyWhisperMsg;
  /** CM14 Pazar: stall announcements (broadcast), buy requests (to the seller) and sale replies (to the buyer). Owner: systems/Market.ts. */
  shop: ShopAnnounce;
  shopBuy: ShopBuyMsg;
  shopSold: ShopSoldMsg;
  /** WP-05 Lonca (systems/Guild.ts): invite handshake, roster / key sync and encrypted guild chat. Always sent to single peer ids. */
  ginv: GuildInviteMsg;
  gsync: GuildSyncMsg;
  gchat: GuildChatMsg;
  /**
   * GDD_PVP_FINDER §2.9 matchmaking (net/queue/QueueService.ts). Design delta: the queue rides on this GLOBAL lobby, not on per-key shard
   * rooms (one fewer WebRTC mesh; the lobby is already open for Social / Pazar / Lonca). `qann` is broadcast every QUEUE_ANN_MS; `qprop` /
   * `qack` / `qdecl` are always sent to single peer ids; `qcancel` is broadcast.
   */
  qann: QueueAnnounce;
  qcancel: QueueCancel;
  qprop: MatchProposal;
  qack: MatchAck;
  qdecl: MatchAck;
};
export const LOBBY_CHANNELS = ['ann', 'unann', 'lchat', 'lpres', 'lwhis', 'shop', 'shopBuy', 'shopSold', 'ginv', 'gsync', 'gchat', 'qann', 'qcancel', 'qprop', 'qack', 'qdecl'] as const satisfies readonly (keyof LobbyChannels)[];
/** The queue subset of LOBBY_CHANNELS (GDD §2.9.1 name). */
export const QUEUE_CHANNELS = ['qann', 'qcancel', 'qprop', 'qack', 'qdecl'] as const satisfies readonly (keyof LobbyChannels)[];

/* ================================================================================================
 * Control channel 'ctl'
 * ============================================================================================== */

/** 'nation' (WP-06): the room is a coop room of the other nation (only `pvp` rooms mix nations). */
export type RejectReason = 'version' | 'full' | 'in_progress' | 'kicked' | 'bad_data' | 'level' | 'nation';
export type KickReason = 'leader' | 'afk' | 'version' | 'cheat' | 'desync';

/** One party member as the host describes it. */
export interface PartyMemberMsg {
  id: string;
  slot: number;
  host: boolean;
  summary: CharacterSummary;
  ks: KeystoneData | null;
  ready: boolean;
  /** Scene the member finished loading for the host's current scene sequence. */
  ls: SceneId | null;
  /** Public channels: join sequence assigned by the host (oldest = lowest). Host migration picks the lowest `js` among the survivors. */
  js?: number;
}

export interface PartyStateMsg {
  t: 'party';
  rev: number;
  hostId: string;
  roomName: string;
  code: string;
  maxPlayers: number;
  /** WP-06: room mode ('pvp' = both nations may join, up to MAX_ROOM_SIZE). Absent = coop. */
  mode?: 'pvp';
  /** Public channel key (`zone:<id>:ch<N>`); absent = a party room. */
  ch?: string;
  members: PartyMemberMsg[];
}

export type CtlMsg =
  // client -> host
  | { t: 'hello'; proto: number; gameVersion: string; summary: CharacterSummary; keystone: KeystoneData | null; /** public channel key the sender wants (absent = party room) */ ch?: string; /** re-handshake with a new host after a migration / merge */ rh?: boolean }
  | { t: 'char'; summary: CharacterSummary; keystone: KeystoneData | null }
  | { t: 'ready'; id: number; ready: boolean }
  | { t: 'loaded'; seq: number; scene: SceneId }
  | { t: 'bye' }
  // host -> client(s)
  | { t: 'welcome'; hostId: string; slot: number; roomName: string; code: string; maxPlayers: number; sceneSeq: number; scene: { scene: SceneId; params: unknown } | null; party: PartyStateMsg; ch?: string }
  | { t: 'reject'; reason: RejectReason; detail?: string }
  | PartyStateMsg
  | { t: 'readyCheck'; id: number; timeoutMs: number; by: string; /** what is being confirmed (keystone / dungeon choice): shown in the toast and G.net.readyCheck.label */ label?: string }
  | { t: 'readyResult'; id: number; ok: boolean; notReady: string[] }
  | { t: 'pings'; p: Record<string, number> }
  | { t: 'kick'; reason: KickReason }
  | { t: 'closed' }
  // public channels (net/Channels.ts): election, migration, camp ledger. Any peer may send `cpeer`; the others are host -> member.
  | { t: 'cpeer'; st: 'settle' | 'host'; since: number }
  | { t: 'rehome'; to: string }
  | { t: 'hostleft'; next: string | null }
  | { t: 'cledger'; e: [string, number][] };

export type CtlTag = CtlMsg['t'];
export const CLIENT_CTL_TAGS: ReadonlySet<string> = new Set<CtlTag>(['hello', 'char', 'ready', 'loaded', 'bye', 'cpeer']);
export const HOST_CTL_TAGS: ReadonlySet<string> = new Set<CtlTag>(['welcome', 'reject', 'party', 'readyCheck', 'readyResult', 'pings', 'kick', 'closed', 'rehome', 'hostleft', 'cledger', 'cpeer']);

/* ================================================================================================
 * Generic gameplay envelope 'g' (carries NetChannels)
 * ============================================================================================== */

/**
 * c: logical channel (types/net.ts NetChannels key)      p: payload (validated by the receiving module)
 * s: sender's scene sequence (stale messages are dropped)
 * t: target set by the SENDER: undefined = host only, '*' = everyone (host relays), '<peerId>' = that peer only
 * f: origin peer id, set by the HOST when relaying a client's message (never trusted when it comes from a client)
 */
export interface GameEnvelope {
  c: NetChannel;
  p: unknown;
  s: number;
  t?: string;
  f?: string;
}

export type GameChannels = {
  ctl: CtlMsg;
  g: GameEnvelope;
};
export const GAME_CHANNELS = ['ctl', 'g'] as const satisfies readonly (keyof GameChannels)[];

/** Every logical channel of types/net.ts that rides the game room. (CM14 `shop` / `shopBuy` / `shopSold` are in the NetChannels type but travel on the LOBBY room only: see LOBBY_CHANNELS, deliberately not listed here.) A `satisfies` check keeps this list complete when channels are added. */
export const KNOWN_CHANNELS: ReadonlySet<string> = new Set<NetChannel>([
  'pstate', 'gear', 'snap', 'spawn', 'hit', 'dmg', 'death', 'estatus', 'heal', 'pstatus', 'revive', 'pdeath', 'cast', 'ecast',
  'hitshape', 'hitshape_x', 'run', 'affix', 'gate', 'scene', 'sceneRequest', 'chat', 'keystone', 'req',
  'minion', // GDD_CLASSES_V2 §1.5 (NC01): owner -> all, 10 Hz
  'threat', 'kick', 'spec', // GDD_V2 WP1 (threat = host -> all)
  'camp', 'home', 'pvp', // GDD_ITEMS_V2 / GDD_LIFE contracts
  'dungeon_event', // K8 (P-12): host-authoritative dungeon event flags
  'arena', // GDD_PVP_FINDER §3.5.2: host-authored arena state (start, phase, damp, out, forfeit, result)
]);

/** Channels only the HOST may originate: a client's envelope on these is dropped by the host, and clients ignore relayed copies. */
export const HOST_ONLY_CHANNELS: ReadonlySet<string> = new Set<NetChannel>([
  'snap', 'spawn', 'dmg', 'death', 'estatus', 'ecast', 'hitshape', 'hitshape_x', 'run', 'affix', 'scene', 'threat', 'dungeon_event',
  'pvp', // WP-07: hit delivery, capture state, scoreboard and kill feed are host-authored; clients ask through the existing `hit` channel
  'arena',
]);

/**
 * 'gate' is host-authored (boss gates, boss events) EXCEPT shrine use: any peer may announce `shrine:<key>` so the other
 * peers' copies of that shrine go dark; the host relays it. Everything else a client puts on 'gate' is dropped.
 */
const CLIENT_RESTRICTED: Partial<Record<NetChannel, (p: unknown) => boolean>> = {
  gate: (p) => isObj(p) && typeof p.key === 'string' && p.key.startsWith('shrine:') && p.key.length <= 64 && p.bossEvent === undefined,
  req: (p) => isObj(p) && typeof p.kind === 'string' && p.kind.length > 0 && p.kind.length <= 48 && /^[A-Za-z0-9_.:-]+$/.test(p.kind) && reqDataOk(p.data),
};

/** `req` payload data: a small plain object (the receiving module validates the fields it uses). */
function reqDataOk(d: unknown): boolean {
  if (d === undefined) return true;
  if (!isObj(d)) return false;
  try {
    return JSON.stringify(d).length <= 2048;
  } catch {
    return false;
  }
}

/** Channels only the HOST ever receives: a client's copy is never relayed to other clients (even with a '*' target) and clients ignore it. */
export const HOST_RECEIVES_ONLY: ReadonlySet<string> = new Set<NetChannel>(['req']);

/** May a CLIENT originate this message (and may a relayed copy of it be accepted)? Host-only channels never; restricted ones by content. */
export function clientMaySend(channel: string, payload: unknown): boolean {
  if (HOST_ONLY_CHANNELS.has(channel)) return false;
  const f = CLIENT_RESTRICTED[channel as NetChannel];
  return !f || f(payload);
}

/** Never buffered / never dropped by scene gating (they are not scene state). */
export const ALWAYS_LIVE_CHANNELS: ReadonlySet<string> = new Set<NetChannel>(['scene', 'sceneRequest', 'chat', 'keystone']);

/** High-rate "latest wins" channels: dropped (not buffered) while the local scene is loading. */
export const LATEST_WINS_CHANNELS: ReadonlySet<string> = new Set<NetChannel>(['pstate', 'snap']);

/* ================================================================================================
 * Validation / sanitising of untrusted input
 * ============================================================================================== */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Strip control / bidi-override characters, collapse whitespace, cap length. Render with textContent only. */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
export const clampNum = (x: unknown, min: number, max: number, fallback: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
const int = (x: unknown, min: number, max: number, fallback: number): number => Math.round(clampNum(x, min, max, fallback));
const text = (x: unknown, maxLen: number, fallback: string): string => sanitizeText(x, maxLen) || fallback;
/** Identifier-like strings (def ids, versions). */
export const ident = (x: unknown, maxLen = 48): string => (typeof x === 'string' ? x.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, maxLen) : '');
const identList = (x: unknown, maxItems: number): string[] =>
  Array.isArray(x) ? x.slice(0, maxItems).map((a) => ident(a)).filter((a) => a.length > 0) : [];

const CLASS_IDS: readonly ClassId[] = ['knight', 'barbarian', 'mage', 'rogue', 'paladin', 'necromancer', 'warlock', 'monk', 'archer'];
const SCENE_IDS: readonly SceneId[] = ['loading', 'menu', 'town', 'dungeon'];

export function sanitizeSceneId(x: unknown): SceneId | null {
  return SCENE_IDS.find((s) => s === x) ?? null;
}

/** Open-world spawn point (DungeonParams.spawn) from an untrusted peer. Values are kept as sent; bad shapes give undefined. */
export function sanitizeWorldSpawn(x: unknown): WorldSpawn | undefined {
  if (!isObj(x)) return undefined;
  const type = (['gate', 'village', 'waypoint', 'entrance'] as const).find((t) => t === x.type);
  const id = ident(x.id, 48);
  return type && id ? { type, id } : undefined;
}

/** DungeonParams.returnTo ({ dungeonId, spawn }) from an untrusted peer. */
export function sanitizeReturnTo(x: unknown): { dungeonId: string; spawn: WorldSpawn } | undefined {
  if (!isObj(x)) return undefined;
  const dungeonId = ident(x.dungeonId, 48);
  const spawn = sanitizeWorldSpawn(x.spawn);
  return dungeonId && spawn ? { dungeonId, spawn } : undefined;
}

/** Validates a CharacterSummary received over the network. */
export function sanitizeSummary(x: unknown): CharacterSummary | null {
  if (!isObj(x)) return null;
  const classId = CLASS_IDS.find((c) => c === x.classId);
  if (!classId) return null;
  const role = x.role === 'tank' || x.role === 'healer' || x.role === 'dps' ? x.role : undefined;
  return {
    ...(role ? { role } : {}),
    id: ident(x.id, 40) || 'unknown',
    name: text(x.name, NET.MAX_NAME_LEN, 'Maceracı'),
    classId,
    level: int(x.level, 1, 60, 1),
    itemLevel: int(x.itemLevel, 0, 999, 0),
    rating: int(x.rating, 0, 10000, 0),
    variant: int(x.variant, 0, 255, 0),
    ...(cleanNation(x.nation) ? { nation: cleanNation(x.nation) } : {}),
  };
}

export function sanitizeKeystone(x: unknown): KeystoneData | null {
  if (!isObj(x)) return null;
  const dungeonId = ident(x.dungeonId);
  if (!dungeonId) return null;
  return { dungeonId, level: int(x.level, 1, 60, 2), depleted: x.depleted === true };
}

export function sanitizePartyMember(x: unknown): PartyMemberMsg | null {
  if (!isObj(x)) return null;
  const summary = sanitizeSummary(x.summary);
  const id = ident(x.id, 40);
  if (!summary || !id) return null;
  return {
    id,
    slot: int(x.slot, 0, MAX_SLOTS - 1, 0),
    ...(typeof x.js === 'number' ? { js: int(x.js, 0, 2 ** 31, 0) } : {}),
    host: x.host === true,
    summary,
    ks: sanitizeKeystone(x.ks),
    ready: x.ready === true,
    ls: sanitizeSceneId(x.ls),
  };
}

export function sanitizeParty(x: unknown): PartyStateMsg | null {
  if (!isObj(x) || x.t !== 'party' || !Array.isArray(x.members)) return null;
  const members: PartyMemberMsg[] = [];
  const slots = new Set<number>();
  for (const m of x.members.slice(0, MAX_SLOTS)) {
    const pm = sanitizePartyMember(m);
    if (pm && !slots.has(pm.slot)) {
      slots.add(pm.slot);
      members.push(pm);
    }
  }
  if (members.length === 0) return null;
  return {
    t: 'party',
    rev: int(x.rev, 0, 2 ** 31, 0),
    hostId: ident(x.hostId, 40),
    roomName: text(x.roomName, NET.MAX_ROOM_NAME_LEN, 'Oda'),
    code: ident(x.code, 12),
    maxPlayers: int(x.maxPlayers, 1, MAX_SLOTS, MAX_PARTY_SIZE),
    ...(x.mode === 'pvp' ? { mode: 'pvp' as const } : {}),
    ...(typeof x.ch === 'string' && ident(x.ch, 64) ? { ch: ident(x.ch, 64) } : {}),
    members,
  };
}

/** UX-41: validates an LFG listing (ids via ident, counts clamped to 0..5, note 40 chars). Undefined when malformed. */
export function sanitizeLfg(x: unknown): LfgListing | undefined {
  if (!isObj(x)) return undefined;
  const dungeon = ident(x.dungeon);
  if (!dungeon) return undefined;
  const diff = x.diff === 'heroic' || x.diff === 'mythic' || x.diff === 'mythicplus' ? x.diff : 'normal';
  const need = isObj(x.need) ? x.need : {};
  const out: LfgListing = {
    dungeon,
    diff,
    need: { tank: int(need.tank, 0, 5, 0), healer: int(need.healer, 0, 5, 0), dps: int(need.dps, 0, 5, 0) },
  };
  if (typeof x.key === 'number') out.key = int(x.key, 1, 60, 1);
  if (typeof x.ilvl === 'number') out.ilvl = int(x.ilvl, 0, 999, 0);
  const note = text(x.note, 40, '');
  if (note) out.note = note;
  return out;
}

/** Validates a lobby announcement. Lobby peers are strangers from the internet. */
export function sanitizeAnnouncement(x: unknown): RoomAnnouncement | null {
  if (!isObj(x) || x.t !== 'ann') return null;
  const code = typeof x.code === 'string' ? normalizeRoomCode(x.code) : null;
  if (!code) return null;
  const roomId = gameRoomId(code);
  if (x.roomId !== roomId) return null;
  const maxPlayers = int(x.maxPlayers, 1, MAX_ROOM_SIZE, MAX_PARTY_SIZE);
  const activity: RoomActivity = x.activity === 'dungeon' || x.activity === 'mythic' || x.activity === 'world' ? x.activity : 'town';
  const lfg = sanitizeLfg(x.lfg);
  return {
    t: 'ann',
    proto: int(x.proto, 0, 1e6, 0),
    gameVersion: ident(x.gameVersion, 16),
    roomId,
    code,
    name: text(x.name, NET.MAX_ROOM_NAME_LEN, 'İsimsiz Oda'),
    hostName: text(x.hostName, NET.MAX_NAME_LEN, 'Maceracı'),
    hostLevel: int(x.hostLevel, 1, 60, 1),
    hostClass: ident(x.hostClass, 24),
    activity,
    dungeon: ident(x.dungeon) || null,
    keyLevel: int(x.keyLevel, 0, 60, 0),
    affixes: identList(x.affixes, 6),
    players: int(x.players, 1, maxPlayers, 1),
    maxPlayers,
    minLevel: int(x.minLevel, 1, 60, 1),
    hasPassword: x.hasPassword === true,
    inProgress: x.inProgress === true,
    lang: ident(x.lang, 8) || 'tr',
    rev: int(x.rev, 0, 2 ** 31, 0),
    ...(x.mode === 'pvp' ? { mode: 'pvp' as const } : {}),
    ...(lfg ? { lfg } : {}),
  };
}

/* ================================================================================================
 * GDD_PVP_FINDER §8.2: matchmaking and arena sanitisers (PV-02). Lobby peers are strangers: every field is clamped or dropped.
 * ============================================================================================== */

const ROLE_IDS = ['tank', 'healer', 'dps'] as const;
const QUEUE_KEY_RE = /^(arena:(1v1|2v2|3v3):[ru]|dun:rnd:(normal|heroic|mythic|mplus):b\d{1,2}|dun:[A-Za-z0-9_.-]{1,40}:(normal|heroic|mythic|mplus):\d{1,2})$/;
const MID_RE = /^[A-Za-z0-9]{8}$/;

/** A queue key in one of the three known formats (<= 64 chars), else null. */
export function sanitizeQueueKey(x: unknown): QueueKey | null {
  return typeof x === 'string' && x.length <= 64 && QUEUE_KEY_RE.test(x) ? (x as QueueKey) : null;
}

const roleList = (x: unknown): ('tank' | 'healer' | 'dps')[] => {
  if (!Array.isArray(x)) return [];
  const out: ('tank' | 'healer' | 'dps')[] = [];
  for (const r of x.slice(0, 8)) {
    const role = ROLE_IDS.find((q) => q === r);
    if (role && !out.includes(role)) out.push(role);
    if (out.length >= 3) break;
  }
  return out;
};

export function sanitizeQueueAnnounce(x: unknown): QueueAnnounce | null {
  if (!isObj(x) || x.t !== 'qann') return null;
  const key = sanitizeQueueKey(x.key);
  const classId = CLASS_IDS.find((c) => c === x.classId);
  if (!key || !classId) return null;
  if (typeof x.since !== 'number' || !Number.isFinite(x.since)) return null;
  const spec = typeof x.spec === 'string' ? ident(x.spec, 32) : '';
  const dungeons = identList(x.dungeons, 4);
  const out: QueueAnnounce = {
    t: 'qann',
    proto: int(x.proto, 0, 1e6, 0),
    gameVersion: ident(x.gameVersion, 16),
    key,
    shard: int(x.shard, 1, 99, 1),
    name: text(x.name, NET.MAX_NAME_LEN, 'Maceracı'),
    classId,
    level: int(x.level, 1, 60, 1),
    ilvl: int(x.ilvl, 0, 999, 0),
    roles: roleList(x.roles),
    rating: int(x.rating, 0, 5000, 0),
    since: x.since,
    rev: int(x.rev, 0, 2 ** 31, 0),
  };
  if (spec) out.spec = spec as QueueAnnounce['spec'];
  if (typeof x.mmr === 'number') out.mmr = int(x.mmr, 0, 5000, 0);
  if (dungeons.length) out.dungeons = dungeons;
  if (typeof x.keyLevel === 'number') out.keyLevel = int(x.keyLevel, 2, 30, 2);
  if (x.busy === true) out.busy = true;
  return out;
}

export function sanitizeQueueCancel(x: unknown): QueueCancel | null {
  if (!isObj(x) || x.t !== 'qcancel') return null;
  const key = sanitizeQueueKey(x.key);
  return key ? { t: 'qcancel', key, shard: int(x.shard, 1, 99, 1) } : null;
}

export function sanitizeMatchAck(x: unknown): MatchAck | null {
  if (!isObj(x) || (x.t !== 'qack' && x.t !== 'qdecl')) return null;
  const mid = typeof x.mid === 'string' && MID_RE.test(x.mid) ? x.mid : '';
  if (!mid) return null;
  const reason = x.reason === 'busy' || x.reason === 'moved' || x.reason === 'cancel' ? x.reason : undefined;
  return { t: x.t, mid, ...(reason ? { reason } : {}) };
}

export function sanitizeMatchProposal(x: unknown): MatchProposal | null {
  if (!isObj(x) || x.t !== 'qprop') return null;
  const key = sanitizeQueueKey(x.key);
  const mid = typeof x.mid === 'string' && MID_RE.test(x.mid) ? x.mid : '';
  const code = typeof x.code === 'string' ? normalizeRoomCode(x.code) : null;
  if (!key || !mid || !code || !Array.isArray(x.members)) return null;
  const members: MatchProposal['members'] = [];
  for (const m of x.members.slice(0, 6)) {
    if (!isObj(m)) continue;
    const peerId = ident(m.peerId, 40);
    const classId = CLASS_IDS.find((c) => c === m.classId);
    if (!peerId || !classId || members.some((q) => q.peerId === peerId)) continue;
    const role = ROLE_IDS.find((r) => r === m.role) ?? null;
    members.push({ peerId, role, classId, level: int(m.level, 1, 60, 1), ilvl: int(m.ilvl, 0, 999, 0), rating: int(m.rating, 0, 5000, 0) });
  }
  if (members.length < 2) return null;
  let teams: MatchProposal['teams'] = null;
  const bracket = ARENA_BRACKETS.find((b) => b === x.bracket) ?? null;
  if (isObj(x.teams)) {
    const side = (v: unknown): string[] => (Array.isArray(v) ? v.slice(0, 4).map((p) => ident(p, 40)).filter((p) => p.length > 0) : []);
    const A = side(x.teams.A), B = side(x.teams.B);
    if (A.length && B.length && A.length + B.length <= MAX_ROOM_SIZE) teams = { A, B };
  }
  if (key.startsWith('arena:') && (!teams || !bracket)) return null;
  return {
    t: 'qprop',
    mid,
    key,
    shard: int(x.shard, 1, 99, 1),
    code,
    mode: x.mode === 'pvp' ? 'pvp' : 'coop',
    dungeonId: ident(x.dungeonId) || null,
    diff: x.diff === 'normal' || x.diff === 'heroic' || x.diff === 'mythic' || x.diff === 'mplus' ? x.diff : null,
    keyLevel: int(x.keyLevel, 0, 30, 0),
    bracket,
    ranked: x.ranked === true,
    teams,
    arenaId: ident(x.arenaId, 32),
    members,
    affixes: identList(x.affixes, 6) as MatchProposal['affixes'],
  };
}

const arenaTeam = (x: unknown): 'A' | 'B' | null => (x === 'A' || x === 'B' ? x : null);

/** Host-authored arena state (channel `arena`). Unknown / malformed messages give null. */
export function sanitizeArenaMsg(x: unknown): ArenaMsg | null {
  if (!isObj(x) || typeof x.k !== 'string') return null;
  const m = typeof x.m === 'string' && MID_RE.test(x.m) ? x.m : '';
  if (!m) return null;
  const score = (v: unknown): [number, number] => (Array.isArray(v) ? [int(v[0], 0, 2, 0), int(v[1], 0, 2, 0)] : [0, 0]);
  switch (x.k) {
    case 'start': {
      const bracket = ARENA_BRACKETS.find((b) => b === x.bracket);
      if (!bracket || !isObj(x.teams)) return null;
      const side = (v: unknown): string[] => (Array.isArray(v) ? v.slice(0, 4).map((p) => ident(p, 40)).filter((p) => p.length > 0) : []);
      return { k: 'start', m, arenaId: ident(x.arenaId, 32), bracket, ranked: x.ranked === true, teams: { A: side(x.teams.A), B: side(x.teams.B) }, seed: int(x.seed, 0, 2 ** 31, 0) };
    }
    case 'phase': {
      const ph = x.ph === 'prep' || x.ph === 'live' || x.ph === 'round_end' || x.ph === 'match_end' ? x.ph : null;
      if (!ph) return null;
      const rw = x.rw === 'A' || x.rw === 'B' || x.rw === 'draw' ? x.rw : undefined;
      return { k: 'phase', m, ph, round: int(x.round, 1, 9, 1), left: clampNum(x.left, 0, 600, 0), score: score(x.score), ...(rw ? { rw } : {}) };
    }
    case 'damp':
      return { k: 'damp', m, pct: clampNum(x.pct, 0, 50, 0) };
    case 'out': {
      const team = arenaTeam(x.team);
      const peer = ident(x.peer, 40);
      return team && peer ? { k: 'out', m, peer, team } : null;
    }
    case 'forfeit': {
      const peer = ident(x.peer, 40);
      return peer ? { k: 'forfeit', m, peer } : null;
    }
    case 'result': {
      const winner = x.winner === 'A' || x.winner === 'B' || x.winner === 'draw' ? x.winner : null;
      const why = x.why === 'normal' || x.why === 'forfeit' || x.why === 'draw' || x.why === 'void' ? x.why : null;
      if (!winner || !why) return null;
      const mean: [number, number] = Array.isArray(x.mean) ? [int(x.mean[0], 0, 5000, 1500), int(x.mean[1], 0, 5000, 1500)] : [1500, 1500];
      return { k: 'result', m, winner, why, score: score(x.score), mean };
    }
    default:
      return null;
  }
}
