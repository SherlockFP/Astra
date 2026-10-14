import { G } from '../game/G';
import type { CharacterSummary } from '../types/character';
import type { KeystoneData } from '../types/items';
import type { ChatLink, NetChannel, NetChannels } from '../types/net';
import { sanitizeLinks } from '../systems/ChatLinks';
import { PARTY_ID_BASE, type SceneId } from '../types/common';
import type { DungeonParams } from '../scenes/scenes';
import { isOpenWorld } from '../scenes/flow';
import { getDungeon } from '../data/dungeons';
import {
  ALWAYS_LIVE_CHANNELS,
  GAME_ROOM_PREFIX,
  GAME_VERSION,
  HOST_RECEIVES_ONLY,
  clientMaySend,
  KNOWN_CHANNELS,
  LATEST_WINS_CHANNELS,
  MAX_PARTY_SIZE,
  MAX_ROOM_SIZE,
  MAX_SLOTS,
  NET,
  PROTOCOL_VERSION,
  clampNum,
  gameRoomId,
  ident,
  isObj,
  isPlayerEntity,
  makeRoomCode,
  normalizeRoomCode,
  sanitizeKeystone,
  sanitizeLfg,
  sanitizeParty,
  sanitizeReturnTo,
  sanitizeSceneId,
  sanitizeSummary,
  sanitizeText,
  sanitizeWorldSpawn,
  type CtlMsg,
  type GameChannels,
  type LfgListing,
  type GameEnvelope,
  type PartyMemberMsg,
  type PartyStateMsg,
  type RejectReason,
  type RoomActivity,
} from './messages';
import { netOptionsFromUrl, openGameRoom } from './index';
import { randomId, type NetTransport, type Unsubscribe } from './transport';
import { LobbyManager, type NetKind } from './LobbyManager';
import type { AnnouncementInput, ListedRoom, LobbyTransport } from './lobby';
import { Replication } from './Replication';
import { decodePayload, encodePayload } from './codec';
import { canParty, nationName } from '../data/nations';
import {
  CHANNELS,
  INTEREST,
  INTEREST_CHANNELS,
  InterestFilter,
  ChannelLedger,
  TIMING_LOCAL,
  TIMING_P2P,
  channelCap,
  channelKey,
  channelLines,
  channelRoomCode,
  channelTag,
  chatRadius,
  claimBefore,
  countChannels,
  dist2d,
  electHost,
  parseChannelKey,
  pickChannel,
  successorOf,
  zoneKeyOf,
  type ChannelInfo,
  type ChannelTiming,
  type Claim,
} from './Channels';

export type NetRole = 'offline' | 'host' | 'client';
export type { NetKind } from './LobbyManager';
export type { ChannelInfo } from './Channels';

export interface PeerInfo {
  peerId: string;
  slot: number;                 // party slot 0..4 (player entity id = 1 + slot); public channels use 0..14
  /** Public channels: join sequence assigned by the host (lowest = oldest = next host). 0 in party rooms. */
  js?: number;
  name: string;
  summary: CharacterSummary | null;
  ready: boolean;
  ping: number;                 // ms
  isHost: boolean;
  keystone: KeystoneData | null;
  /** Scene the peer has finished loading (party load sync). */
  loadedScene: SceneId | null;
}

export interface RoomInfo {
  roomId: string;               // room code (pass it to joinRoom)
  name: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  /** 'world' = open-world map (display only; the scene is still 'dungeon'). */
  activity: RoomActivity;
  dungeonId?: string;
  keyLevel?: number;
  hasPassword: boolean;
  version: string;
  lastSeen: number;             // ms timestamp
  ping?: number;
  // ---- additions (optional) ----
  hostLevel?: number;
  hostClass?: string;
  /** WP-06: 'pvp' = a room where both nations may join (Kızıl Sınır). Absent = coop. */
  mode?: 'coop' | 'pvp';
  affixes?: string[];
  minLevel?: number;
  /** Same protocol + game version. */
  compatible?: boolean;
  /** compatible && not in progress && not full. */
  joinable?: boolean;
  inProgress?: boolean;
  /** Which transport the room was announced on. */
  transport?: NetKind;
  /** UX-41: the host's LFG listing (Gruplar tab). */
  lfg?: LfgListing;
}

export interface ReadyCheckState {
  id: number;
  active: boolean;
  startedAt: number;            // ms (Date.now)
  timeoutMs: number;
  by: string;                   // initiator name
  /** Host only: ms deadline (performance.now). */
  deadline: number;
  /** Result once finished (null while active). */
  result: { ok: boolean; notReady: string[] } | null;
  /** What is being confirmed (e.g. "Gölge Tapınağı +4 anahtarı"), set by startReadyCheck(label); shown in the toast. */
  label?: string;
}

export interface NetStats {
  role: NetRole;
  transport: NetKind | null;
  peers: number;
  rttMs: number;
  buffered: number;
  sentMsgs: number;
  sentBytes: number;
  recvMsgs: number;
  recvBytes: number;
  byChannel: Record<string, { sentMsgs: number; sentBytes: number; recvMsgs: number; recvBytes: number }>;
}

type Handler<K extends NetChannel> = (payload: NetChannels[K], fromPeerId: string) => void;

interface JoinPending {
  tr: NetTransport<GameChannels>;
  code: string;
  kind: NetKind;
  timer: ReturnType<typeof setTimeout>;
  helloSent: Set<string>;
  resolve: () => void;
  /** Public channel join (net/Channels.ts): the settle / election state. */
  ch?: ChannelJoin;
}

/** A public channel join in progress: discovery window, claims heard, the scene to enter once in. */
interface ChannelJoin {
  info: ChannelInfo;
  scene: SceneId;
  params: unknown;
  /** Our election claim (wall clock when the join started). */
  since: number;
  /** Monotonic ms when the discovery window ends. */
  settleEnd: number;
  /** What the other peers announced (`cpeer`). */
  peers: Map<string, { st: 'settle' | 'host'; since: number }>;
  /** Elected winners that never claimed hosting. */
  ignored: Set<string>;
  waitFor: string | null;
  waitUntil: number;
  tick: ReturnType<typeof setInterval> | null;
  done: (r: 'ok' | 'full' | 'fail') => void;
}

/** A host loss being handled by a member of a public channel. */
interface Migration {
  from: string;
  /** Peers skipped as successor (left, or never claimed). */
  dead: Set<string>;
  succ: string | null;
  /** Monotonic ms when the wait for `succ` ends. */
  until: number;
  /** Re-handshake in flight (hello sent to the new host, welcome not yet seen). */
  hello: boolean;
  /** This peer WAS the host (split-brain merge): its own authority world must be rebuilt as a client. */
  wasHost: boolean;
}

/**
 * Constructor options. The game passes nothing; the headless channel sim (dev/combat-sim/channels.mjs) gives every NetSession its own
 * environment, a fake transport factory and short timings, so several peers can live in one process.
 */
export interface NetSessionOpts {
  /** G-like environment (events, ui, scenes, character, engine, player, world, presence). Default: the game's G. */
  env?: Record<string, unknown>;
  openTransport?: (kind: NetKind, code: string, password?: string) => Promise<NetTransport<GameChannels>>;
  /** Overrides defaultTransport (null = offline). */
  kind?: NetKind | null;
  /** Wall clock (Date.now) and monotonic clock (performance.now), ms. */
  wallNow?: () => number;
  monoNow?: () => number;
  timing?: Partial<ChannelTiming>;
  /** Do not create net/Replication (tests). */
  noReplication?: boolean;
  /** Public channels on/off (default on; `?channels=0` turns them off). */
  channels?: boolean;
}

interface LoadWaiter {
  scene: SceneId;
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const REJECT_TEXT: Record<RejectReason, (detail?: string) => string> = {
  version: (d) => `Sürüm uyumsuz (lider: v${d ?? '?'}, sen: v${GAME_VERSION}). Sayfayı yenile (Ctrl+F5).`,
  full: () => 'Oda dolu.',
  in_progress: () => 'Grup şu anda zindanda. Daha sonra tekrar dene.',
  kicked: () => 'Bu gruptan çıkarıldın.',
  bad_data: () => 'Karakter verisi geçersiz.',
  level: (d) => `Bu oda için seviyen yetersiz (gerekli: ${d ?? '?'}).`,
  nation: (d) => `Bu oda ${d ?? 'karşı ulusun'} odası. Yalnızca PvP odalarında iki ulus bir arada olabilir.`,
};

const MSG_INSECURE = 'Çok oyunculu mod güvenli bağlantı (https veya localhost) gerektirir. Oyunu localhost veya https adresinden aç.';
const MSG_TIMEOUT = 'Lidere bağlanılamadı. Oda kodunu/şifreyi kontrol et; ağ ayarların P2P bağlantıya izin vermiyor olabilir.';

/**
 * Party networking session over WebRTC (trystero) with a LocalTransport (BroadcastChannel) for same-machine
 * testing and an offline mode (local player is host, zero peers — the SAME code path).
 *
 * Typed channel messaging (types/net.ts NetChannels): gameplay modules call broadcast/sendToHost/sendTo/on; the net
 * module carries them in its generic envelope (host-relayed star topology; client->client sendTo relays via host).
 * DELIVERY RULES: broadcast/sendTo/sendToHost NEVER deliver to self. sendToHost() while isAuthority is dropped (dev
 * warning) — authority code calls local logic directly. on() handlers may be registered at any time (before a room
 * exists) and survive join/leave. Messages for a scene the local peer has not finished loading are buffered until
 * sceneReady() and then delivered in order (stale scene sequences are dropped; `pstate`/`snap` are latest-wins and
 * simply dropped while loading; `scene`, `sceneRequest`, `chat`, `keystone` are never gated).
 * PARTY SLOT: the local Player id = PARTY_ID_BASE + localSlot. Whenever localSlot changes (welcome, host left, kicked)
 * NetSession moves the local peer to the right scene (G.scenes.go) so the Player is recreated with the new id.
 * net/Replication.ts does pstate/gear/snap sync and creates/removes remote Player entities (on scene:changed and
 * net:peerJoined, using PeerInfo.summary); interpolation time base = G.engine.time.
 * Hosting enables G.engine.setBackgroundTick(true) so AI/timers keep running in a hidden tab.
 *
 * `peers` ALWAYS contains the local peer too (offline: just us, slot 0, isHost) — use remotePeers() for the others
 * and members() for a slot-sorted party list. joinRoom()/hostRoom() never throw: failures show a Turkish toast and
 * set `lastError` (check `role` afterwards); hostRoom() returns '' on failure.
 * OWNER: net module.
 */
export class NetSession {
  role: NetRole = 'offline';
  selfId = 'local';
  roomId: string | null = null;
  readonly peers = new Map<string, PeerInfo>();
  /** Our party slot (0 when offline/host). */
  localSlot = 0;
  /** Host peer id (selfId when hosting/offline). */
  hostId = 'local';
  roomName = '';
  maxPlayers = MAX_PARTY_SIZE;
  /** WP-06: 'pvp' rooms may mix the two nations (up to MAX_ROOM_SIZE players); 'coop' rooms are single-nation. Host-chosen, mirrored on clients. */
  roomMode: 'coop' | 'pvp' = 'coop';
  /** Increments on every party scene change (host-owned); stale messages are dropped. */
  sceneSeq = 0;
  readyCheck: ReadyCheckState | null = null;
  /** Last join/host failure message (Turkish), null after a success. */
  lastError: string | null = null;
  /** GDD_PVP_FINDER: matchmaking (net/queue/QueueService.ts, installed by systems/ArenaInstall.ts). Undefined until installed / in sims. */
  queue?: import('../types/finder').FinderApi;
  /** Why the last room was left: 'self' (leaveRoom), 'host_closed' (the host closed it), 'kicked'. Reset when a room is hosted / joined. The arena reads it to tell a forfeit from a void match. */
  lastLeave: 'self' | 'host_closed' | 'kicked' | null = null;
  /** Transport the current room uses (null offline). */
  transportKind: NetKind | null = null;
  replication: Replication | null = null;
  /**
   * Public zone channel (net/Channels.ts) the current room is, or null (party room, dungeon, offline). In a channel `peers` holds
   * EVERYBODY in the room (up to 12), which is not a party: UI that means "my party" reads partyMembers() / inParty instead.
   */
  channel: ChannelInfo | null = null;
  /**
   * Soft party (net/Channels.ts "party follow"): character name of the leader this player follows across channels. A party room
   * sets it (host = own name, members = the host's name) and it OUTLIVES the room, so the group stays together in the public world.
   * Own name = I lead. Cleared by switching to a channel other than the leader's, or when the leader stays offline.
   */
  partyLeader: string | null = null;
  /** Camp respawn timers of the current channel (CampDirector notes wipes, a promoted host reads them back). */
  readonly ledger = new ChannelLedger();

  /** offline or host: this peer simulates enemies, AI, run state. */
  get isAuthority(): boolean {
    return this.role !== 'client';
  }
  get isOnline(): boolean {
    return this.role !== 'offline';
  }
  /** Inside a PRIVATE party room (not a public channel). */
  get inParty(): boolean {
    return this.role !== 'offline' && this.channel === null;
  }
  /** "Party leader" for UI gating: offline, a channel player (nobody else's party) or the host of a party room. */
  get isPartyLeader(): boolean {
    return this.channel !== null || this.role !== 'client';
  }
  /** A guest of somebody else's party room (never true in a public channel). */
  get isPartyGuest(): boolean {
    return this.role === 'client' && this.channel === null;
  }
  /** "CH2" in a public channel, '' elsewhere (minimap tag). */
  get channelTag(): string {
    return this.channel ? channelTag(this.channel.num) : '';
  }
  /** Party members: the room in a party room, only the local player in a channel / offline. */
  partyMembers(): PeerInfo[] {
    return this.channel ? this.members().filter((p) => p.peerId === this.selfId) : this.members();
  }
  /** Party members except the local player. */
  partyRemotePeers(): PeerInfo[] {
    return this.channel ? [] : this.remotePeers();
  }
  /**
   * Is this peer in my group? Everybody of a party room is; in a public channel only the soft party counts (the followed leader and the
   * players who follow the same leader), so the party frames never fill up with the whole zone.
   */
  isPartyMate(peerId: string): boolean {
    if (!this.channel) return true;
    const lead = this.partyLeader?.toLowerCase();
    if (!lead) return false;
    const e = this.presenceEntries().find((r) => r.id === peerId);
    return !!e && (e.raw.toLowerCase() === lead || e.leader?.toLowerCase() === lead);
  }
  /** Party size for enemy scaling / run params: 1 in a public channel (more players = faster kills, not tankier monsters). */
  get partySize(): number {
    return this.channel ? 1 : Math.max(1, this.peers.size);
  }
  get isJoining(): boolean {
    return this.joinPending !== null;
  }
  /** False while the local scene is loading (incoming gameplay messages are buffered; true while the buffer is being flushed). */
  get sceneIsReady(): boolean {
    return this.sceneReadyFlag;
  }
  /** Our own entry in `peers`. */
  get self(): PeerInfo | undefined {
    return this.peers.get(this.selfId);
  }
  /**
   * Host: the party is on an open-world map (DungeonDef.world). Joins are accepted there, the room stays listed and its
   * activity reads 'world'. Replication uses it for interest management and late-join entity replay.
   */
  get inOpenWorld(): boolean {
    return this.openWorldParams() !== null;
  }
  /** Host: the current open-world DungeonParams (spawn / returnTo included), or null when not on an open-world map. */
  private openWorldParams(): DungeonParams | null {
    const cur = this.currentScene;
    if (cur?.scene !== 'dungeon') return null;
    const p = cur.params as Partial<DungeonParams> | undefined;
    return p && isOpenWorld(p.dungeonId) ? (p as DungeonParams) : null;
  }

  // ---- internals ----
  private tr: NetTransport<GameChannels> | null = null;
  private trUnsubs: Unsubscribe[] = [];
  private readonly handlers = new Map<string, Set<(payload: any, from: string) => void>>();
  private readonly lobby: LobbyManager;
  private readonly localSessionId = `L${randomId(15)}`;
  private joinPending: JoinPending | null = null;
  private busy = false;
  private sceneReadyFlag = true;
  private flushPending = false;
  private loadedSceneId: SceneId | null = null;
  private buffer: { c: NetChannel; p: unknown; from: string; s: number }[] = [];
  private currentScene: { scene: SceneId; params: unknown } | null = null;
  private hostPublic = true;
  private hasPassword = false;
  private partyRev = 0;
  private readonly kicked = new Set<string>();
  private readonly chatTimes = new Map<string, number[]>();
  private readonly reqTimes = new Map<string, number[]>();
  private readonly loadWaiters: LoadWaiter[] = [];
  private allLoadedFired = false;
  private readyCheckSeq = 0;
  private nextPing = 0;
  private lastSelfRefresh = 0;
  /** UX-41: LFG listing of this host (re-announced with the room). */
  private lfg: LfgListing | null = null;
  private charInfoTimer: ReturnType<typeof setTimeout> | null = null;
  private rttMs = 0;
  private readonly warned = new Set<string>();
  private readonly urlOpts = netOptionsFromUrl();

  // ---- public channels (net/Channels.ts) ----
  private readonly timing: ChannelTiming;
  /** A channel join/switch/migration is running (one at a time). */
  private chBusy = false;
  private chJoin: ChannelJoin | null = null;
  private mig: Migration | null = null;
  /** Host: when this peer became host of the channel (monotonic ms), and the claim it announces. */
  private hostSinceMono = 0;
  private hostClaim: Claim | null = null;
  private joinSeqCtr = 0;
  /** Host after a migration: members that have not re-handshaken yet, and the deadline to drop them. */
  private readonly pendingRehome = new Set<string>();
  private rehomeDeadline = 0;
  private readonly interest = new InterestFilter();
  /** Host: last reported position of every member (from their `pstate`), for the interest tiers and the chat radius. */
  private readonly chPos = new Map<string, { x: number; z: number; at: number }>();
  private lastSwitchAt = -Infinity;
  /** Channel number last used per zone (a return from a dungeon lands in the same channel when it has room). */
  private readonly lastChan = new Map<string, number>();
  /** Scene + params the local peer is in (set by goScene), for channel travel and a re-seed after a host migration. */
  private zoneScene: { scene: SceneId; params: unknown } | null = null;
  private ledgerSentAt = 0;
  private nextFollow = 0;
  private leaderGoneSince = 0;
  /** Monotonic ms of the last frame update inside a channel, the last time this host's loop stalled, and the last message from our host. */
  private lastTickAt = 0;
  private stallAt = -Infinity;
  private lastHostMsg = 0;
  /** `cpeer host` claims heard (a member may hear the successor's claim before it noticed the host leave). */
  private readonly hostClaims = new Map<string, { claim: Claim; at: number }>();
  /** Bumped by abortChannelWork(): a join/switch that started before it must not enter its scene. */
  private chEpoch = 0;
  private readonly channelsOff = new URLSearchParams(globalThis.location?.search ?? '').get('channels') === '0';

  constructor(private readonly opts: NetSessionOpts = {}) {
    this.timing = { ...(opts.kind === 'local' || (opts.kind === undefined && this.urlOpts.mode === 'local') ? TIMING_LOCAL : TIMING_P2P), ...opts.timing };
    this.peers.set(this.selfId, this.makeSelf(0, true));
    this.lobby = new LobbyManager({
      localSelfId: () => this.localSessionId,
      latencyMs: this.urlOpts.local.latencyMs,
      jitterMs: this.urlOpts.local.jitterMs,
    });
    this.lobby.onRooms = () => this.g.events?.emit('net:rooms', {});
    this.lobby.onError = (m) => this.toast(m, 'error');

    // built-in channel handlers
    this.on('chat', (p, from) => this.onChat(p, from));
    this.on('sceneRequest', (p, from) => this.onSceneRequest(p, from));

    const ev = this.g.events;
    if (ev) {
      ev.on('scene:leaving', () => {
        this.sceneReadyFlag = false;
      });
      // Safety net: a scene that forgot sceneReady() must not leave gameplay messages buffered forever.
      ev.on('scene:changed', ({ to }) => {
        if (!this.sceneReadyFlag) this.sceneReady(to);
        this.onSceneChangedForChannel(to);
      });
      // a party room names the leader the group keeps following in the public world (partyLeader)
      ev.on('party:changed', () => this.noteParty());
      ev.on('player:levelup', () => this.scheduleCharInfo());
      ev.on('equipment:changed', () => this.scheduleCharInfo());
      ev.on('keystone:changed', () => this.scheduleCharInfo());
      ev.on('spec:changed', () => this.scheduleCharInfo()); // UX-41: summary.role follows the active spec
    }
  }

  /* ================================================================================================
   * Rooms ("sunucular")
   * ============================================================================================== */

  /** Default transport: ?net=local -> 'local', otherwise 'trystero'; null for ?net=offline. */
  get defaultTransport(): NetKind | null {
    if (this.opts.kind !== undefined) return this.opts.kind;
    return this.urlOpts.mode === 'offline' ? null : this.urlOpts.mode === 'local' ? 'local' : 'trystero';
  }

  /** The injected environment (tests) or the game's G. */
  private get g(): typeof G {
    return (this.opts.env ?? G) as typeof G;
  }

  /**
   * CM14 Pazar: borrow the shared lobby transport (global room, independent of the party room) for the shop channels.
   * null offline (`?net=offline`) or when the lobby cannot open. Call `release()` when done.
   */
  async leaseLobby(): Promise<{ tr: LobbyTransport; release: () => void } | null> {
    const kind = this.defaultTransport;
    if (!kind) return null;
    return this.lobby.lease(kind);
  }

  startBrowsing(opts?: { transport?: NetKind }): void {
    const kind = opts?.transport ?? this.defaultTransport;
    if (!kind) return;
    this.lastBrowseKind = kind;
    void this.lobby.startBrowsing(kind).catch((e) => console.warn('[net] browse failed', e));
  }
  stopBrowsing(): void {
    this.lobby.stopBrowsing();
  }
  get browsing(): boolean {
    return this.lobby.browsing;
  }
  /** Signalling relay health of the trystero lobby ("Sunuculara bağlanılıyor 3/5"), null if unknown. */
  signalStatus(): { open: number; total: number } | null {
    return this.lobby.signalStatus();
  }

  listRooms(): RoomInfo[] {
    const now = performance.now();
    const kind = this.lobby.browsing ? this.lastBrowseKind ?? undefined : undefined;
    return this.lobby.rooms.map((r: ListedRoom): RoomInfo => ({
      roomId: r.ann.code,
      name: r.ann.name,
      hostName: r.ann.hostName,
      players: r.ann.players,
      maxPlayers: r.ann.maxPlayers,
      activity: r.ann.activity,
      dungeonId: r.ann.dungeon ?? undefined,
      keyLevel: r.ann.keyLevel || undefined,
      hasPassword: r.ann.hasPassword,
      version: r.ann.gameVersion,
      lastSeen: Date.now() - (now - r.lastSeen),
      ping: r.pingMs ?? undefined,
      hostLevel: r.ann.hostLevel,
      hostClass: r.ann.hostClass,
      affixes: r.ann.affixes,
      minLevel: r.ann.minLevel,
      compatible: r.compatible,
      joinable: r.joinable,
      inProgress: r.ann.inProgress,
      lfg: r.ann.lfg,
      mode: r.ann.mode,
      transport: kind,
    }));
  }
  private lastBrowseKind: NetKind | null = null;

  /** Open a room (you become the leader/host). Resolves to the 6-letter room code, or '' on failure (toast shown). */
  async hostRoom(opts: { name: string; password?: string; maxPlayers?: number; transport?: NetKind; public?: boolean; mode?: 'coop' | 'pvp'; /** matchmaking: the room code the proposer announced (qprop) */ code?: string }): Promise<string> {
    // a public channel is left for a private party room (the town scene is re-entered below: the slot, so the Player id, changes)
    const fromChannel = this.channel !== null && !this.chBusy;
    if (!fromChannel && (this.role !== 'offline' || this.joinPending || this.busy)) {
      this.toast('Zaten bir grubun içindesin.', 'warning');
      return '';
    }
    const kind = opts.transport ?? this.defaultTransport;
    if (!kind) return this.failHost('Çevrimdışı mod: oda kurulamaz.');
    if (!this.g.character) return this.failHost('Önce bir karakter seçmelisin.');
    if (kind === 'trystero' && globalThis.isSecureContext === false) return this.failHost(MSG_INSECURE); // trystero needs crypto.subtle
    if (this.g.scenes?.current?.id === 'dungeon') return this.failHost('Oda kurmak için kasabada olmalısın.');
    if (this.chBusy) return this.failHost('Kanal değişimi sürüyor. Birazdan tekrar dene.');
    if (fromChannel) this.leaveChannel();
    this.busy = true;
    try {
      const code = (opts.code ? normalizeRoomCode(opts.code) : null) ?? makeRoomCode();
      this.lastLeave = null;
      const tr = await this.openTransport(kind, code, opts.password);
      this.tr = tr;
      this.transportKind = kind;
      this.attach(tr);
      this.selfId = tr.selfId;
      this.hostId = tr.selfId;
      this.role = 'host';
      this.roomId = code;
      this.localSlot = 0;
      this.roomMode = opts.mode === 'pvp' ? 'pvp' : 'coop';
      this.maxPlayers = Math.round(clampNum(opts.maxPlayers, 2, this.roomMode === 'pvp' ? MAX_ROOM_SIZE : MAX_PARTY_SIZE, this.roomMode === 'pvp' ? MAX_ROOM_SIZE : MAX_PARTY_SIZE));
      this.hasPassword = !!opts.password;
      this.hostPublic = opts.public !== false;
      this.sceneSeq = 0;
      this.partyRev = 0;
      this.kicked.clear();
      this.chatTimes.clear();
      this.readyCheck = null;
      this.lastError = null;
      this.peers.clear();
      const me = this.makeSelf(0, true);
      this.peers.set(this.selfId, me);
      this.roomName = sanitizeText(opts.name, NET.MAX_ROOM_NAME_LEN) || `${me.name} - Oda`;
      this.currentScene = { scene: (this.g.scenes?.current?.id as SceneId | undefined) ?? 'town', params: undefined };
      this.loadedSceneId = this.sceneReadyFlag ? this.currentScene.scene : null;
      me.loadedScene = this.loadedSceneId;
      this.nextPing = 0;
      this.g.engine?.setBackgroundTick?.(true);
      this.ensureReplication()?.setActive(true);
      this.emitStatus();
      this.g.events?.emit('party:changed', {});
      this.syncAnnounce();
      this.toast(`Oda kuruldu. Kod: ${code}`, 'success');
      // coming from a channel slot (id 1 + n) to the host slot 0: rebuild the scene so the local Player gets the right id
      if (fromChannel) void this.goScene(this.currentScene.scene, this.zoneScene?.params);
      return code;
    } catch (err) {
      console.warn('[net] hostRoom failed', err);
      this.dropTransport();
      return this.failHost('Oda kurulamadı. Ağ bağlantını kontrol et.');
    } finally {
      this.busy = false;
    }
  }

  /**
   * Join a room by its code (RoomInfo.roomId or typed by the player). Resolves once the host answered (success or
   * failure); on failure a Turkish toast is shown, `lastError` is set and `role` stays 'offline'.
   */
  async joinRoom(roomId: string, opts?: { password?: string; transport?: NetKind }): Promise<void> {
    const fromChannel = this.channel !== null && !this.chBusy;
    if (!fromChannel && (this.role !== 'offline' || this.joinPending || this.busy)) {
      this.toast('Zaten bir grubun içindesin.', 'warning');
      return;
    }
    const kind = opts?.transport ?? this.defaultTransport;
    if (!kind) return this.failJoinEarly('Çevrimdışı mod: odaya katılınamaz.');
    const code = normalizeRoomCode(String(roomId ?? '').replace(GAME_ROOM_PREFIX, ''));
    if (!code) return this.failJoinEarly('Geçersiz oda kodu.');
    if (!this.g.character) return this.failJoinEarly('Önce bir karakter seçmelisin.');
    if (kind === 'trystero' && globalThis.isSecureContext === false) return this.failJoinEarly(MSG_INSECURE);
    if (this.chBusy) return this.failJoinEarly('Kanal değişimi sürüyor. Birazdan tekrar dene.');
    if (fromChannel) this.leaveChannel();
    this.busy = true;
    let tr: NetTransport<GameChannels>;
    try {
      tr = await this.openTransport(kind, code, opts?.password);
    } catch (err) {
      console.warn('[net] joinRoom failed', err);
      this.busy = false;
      this.failJoinEarly('Odaya bağlanılamadı. Ağ bağlantını kontrol et.');
      this.rejoinChannelAfterParty(fromChannel);
      return;
    }
    this.busy = false;
    this.tr = tr;
    this.transportKind = kind;
    this.attach(tr);
    await new Promise<void>((resolve) => {
      const jp: JoinPending = {
        tr, code, kind, helloSent: new Set(), resolve,
        timer: setTimeout(() => this.failJoin(MSG_TIMEOUT), kind === 'local' ? NET.HELLO_TIMEOUT_MS : NET.P2P_HELLO_TIMEOUT_MS),
      };
      this.joinPending = jp;
      // Hello goes to every peer that appears; only the host answers (first welcome wins).
      this.trUnsubs.push(tr.onPeerJoin((peer) => this.sendHello(peer)));
    });
    this.rejoinChannelAfterParty(fromChannel);
  }

  /** A party join that came from a public channel failed: go back to a channel (the scene is rebuilt, the slot changed). */
  private rejoinChannelAfterParty(fromChannel: boolean): void {
    if (!fromChannel || this.role !== 'offline') return;
    const zs = this.zoneScene;
    if (zs) void this.enterScene(zs.scene, zs.params);
  }

  /** Leave the room (host: closes it for everybody). Clients return to their own offline town. */
  leaveRoom(): void {
    if (this.joinPending) {
      this.abortChannelWork();
      this.failJoin(null);
      return;
    }
    if (this.role === 'offline') return;
    // a public channel: hand the host role over and stay where we are (the caller decides where to go next)
    if (this.channel) {
      this.abortChannelWork();
      this.leaveChannel();
      return;
    }
    const was = this.role;
    this.lastLeave = 'self';
    if (was === 'host') this.sendCtl({ t: 'closed' }, this.remoteMemberIds());
    else if (was === 'client') this.sendCtl({ t: 'bye' }, [this.hostId]);
    this.teardown();
    // a client always goes back to the town / its public channel; a host does so only from the town (the arena and the dungeon exits place the host themselves)
    // - otherwise the host that disbanded the party would sit alone in a private offline town, invisible to the public channel
    if (was === 'client' || this.g.scenes?.current?.id === 'town') this.returnToTown();
  }

  /* ================================================================================================
   * Messaging
   * ============================================================================================== */

  broadcast<K extends NetChannel>(channel: K, payload: NetChannels[K], _opts?: { reliable?: boolean }): void {
    const tr = this.tr;
    if (!tr || this.role === 'offline') return;
    const env: GameEnvelope = { c: channel, p: encodePayload(channel, payload), s: this.sceneSeq };
    if (this.role === 'host') {
      let to = this.remoteMemberIds();
      // public channel: position streams / casts / chat only go to the peers that can use them (INTEREST)
      if (this.channel && to.length) to = this.interestTargets(channel, env.p, this.selfId, to);
      if (to.length) tr.send('g', env, { to });
    } else {
      if (!clientMaySend(channel, payload)) return this.warnOnce(`bc:${channel}`, `broadcast('${channel}') from a client is dropped (host-only channel)`);
      env.t = '*';
      tr.send('g', env, { to: this.hostId });
    }
  }

  sendTo<K extends NetChannel>(peerId: string, channel: K, payload: NetChannels[K]): void {
    const tr = this.tr;
    if (!tr || this.role === 'offline' || peerId === this.selfId) return;
    const env: GameEnvelope = { c: channel, p: encodePayload(channel, payload), s: this.sceneSeq };
    if (this.role === 'host') {
      if (!this.peers.has(peerId)) return;
      tr.send('g', env, { to: peerId });
    } else {
      if (!clientMaySend(channel, payload)) return this.warnOnce(`st:${channel}`, `sendTo('${channel}') from a client is dropped (host-only channel)`);
      if (!this.peers.has(peerId)) return;
      if (peerId !== this.hostId) env.t = peerId; // host relays
      tr.send('g', env, { to: this.hostId });
    }
  }

  sendToHost<K extends NetChannel>(channel: K, payload: NetChannels[K]): void {
    if (this.role === 'host') {
      return this.warnOnce(`sh:${channel}`, `sendToHost('${channel}') while host: dropped — authority code must call the local logic directly`);
    }
    if (this.role !== 'client' || !this.tr) return;
    if (!clientMaySend(channel, payload)) return this.warnOnce(`sh:${channel}`, `sendToHost('${channel}'): host-only channel`);
    this.tr.send('g', { c: channel, p: encodePayload(channel, payload), s: this.sceneSeq }, { to: this.hostId });
  }

  on<K extends NetChannel>(channel: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(channel);
    if (!set) this.handlers.set(channel, (set = new Set()));
    set.add(handler as (payload: any, from: string) => void);
    return () => {
      set!.delete(handler as (payload: any, from: string) => void);
    };
  }

  /**
   * Small client -> host event request (types/net.ts `req`): a guest asks the host to do something the host owns (start the
   * Lanetli Sandık, open a gate...). On the host / offline the registered onRequest() handlers run locally (same code path, no
   * wire). `kind` is an identifier (max 48), `data` a small plain object (max ~2 KB). Handlers must validate `data`.
   */
  sendRequest(kind: string, data?: Record<string, unknown>): void {
    const k = ident(kind, 48);
    if (!k) return;
    const payload: NetChannels['req'] = data === undefined ? { kind: k } : { kind: k, data };
    if (this.role === 'client') {
      this.sendToHost('req', payload);
      return;
    }
    this.dispatch('req', payload, this.selfId);
  }

  /** Handle `sendRequest(kind, ...)` calls (host / offline only ever receive). Returns an unsubscribe fn; survives scene changes. */
  onRequest(kind: string, handler: (data: Record<string, unknown>, fromPeerId: string) => void): () => void {
    return this.on('req', (p, from) => {
      if (!isObj(p) || p.kind !== kind) return;
      handler(isObj(p.data) ? p.data : {}, from);
    });
  }

  /** Peer id that owns a player entity id (for sendTo of heals/statuses); selfId for the local player. */
  peerOfEntity(entityId: number): string | null {
    if (!isPlayerEntity(entityId)) return null;
    const slot = entityId - PARTY_ID_BASE;
    if (slot === this.localSlot) return this.selfId;
    for (const p of this.peers.values()) if (p.slot === slot) return p.peerId;
    return null;
  }

  peerBySlot(slot: number): PeerInfo | undefined {
    for (const p of this.peers.values()) if (p.slot === slot) return p;
    return undefined;
  }

  /** Party members sorted by slot (includes the local player). */
  members(): PeerInfo[] {
    return [...this.peers.values()].sort((a, b) => a.slot - b.slot);
  }
  /** Everybody except the local player. */
  remotePeers(): PeerInfo[] {
    return this.members().filter((p) => p.peerId !== this.selfId);
  }

  getStats(): NetStats {
    const s = this.tr?.getStats();
    return {
      role: this.role,
      transport: this.transportKind,
      peers: this.peers.size,
      rttMs: this.rttMs,
      buffered: this.buffer.length,
      sentMsgs: s?.sentMsgs ?? 0,
      sentBytes: s?.sentBytes ?? 0,
      recvMsgs: s?.recvMsgs ?? 0,
      recvBytes: s?.recvBytes ?? 0,
      byChannel: s?.byChannel ?? {},
    };
  }

  /* ================================================================================================
   * Party flow
   * ============================================================================================== */

  /** Host (or offline): move the whole party to a scene with params; offline it just calls G.scenes.go. */
  requestScene(scene: 'town' | 'dungeon', params: unknown): void {
    if (this.channelFlow(scene, params)) return;
    if (this.role === 'client') {
      this.requestSceneFromHost(scene, params);
      return;
    }
    if (this.role === 'host') {
      this.sceneSeq++;
      this.currentScene = { scene, params };
      this.allLoadedFired = false;
      for (const p of this.peers.values()) p.loadedScene = null;
      this.loadedSceneId = null;
      this.sceneReadyFlag = false;
      this.broadcast('scene', { scene, params });
      this.syncAnnounce();
      this.g.events?.emit('party:changed', {});
    }
    this.goScene(scene, params);
  }

  /** Client: ask the host to move the party (keystone owner starting a run, exit portal). Host validates. */
  requestSceneFromHost(scene: 'town' | 'dungeon', params: unknown): void {
    if (this.channelFlow(scene, params)) return;
    if (this.role === 'host' || this.role === 'offline') {
      this.requestScene(scene, params);
      return;
    }
    this.sendToHost('sceneRequest', { scene, params });
  }

  /** Called by every scene at the END of enter(): flushes buffered messages, tells the host we're loaded. */
  sceneReady(scene: SceneId): void {
    this.sceneReadyFlag = true;
    this.loadedSceneId = scene;
    const me = this.self;
    if (me) me.loadedScene = scene;
    if (this.role === 'client') {
      this.sendCtl({ t: 'loaded', seq: this.sceneSeq, scene }, [this.hostId]);
    } else if (this.role === 'host') {
      this.broadcastParty();
      this.checkLoaded();
    }
    if (!this.flushPending) {
      this.flushPending = true;
      // after enter() returned and SceneManager set `current`, but before the next frame
      setTimeout(() => this.flushBuffer(), 0);
    }
  }

  /** Host: resolves when every member reported sceneReady(scene) (immediately offline); also emits 'party:allLoaded'. */
  waitForPartyLoaded(scene: SceneId, timeoutMs: number = NET.SCENE_LOAD_TIMEOUT_MS): Promise<void> {
    // a public channel never waits for its members: they come and go on their own schedule
    if (this.role !== 'host' || this.channel) {
      queueMicrotask(() => this.g.events?.emit('party:allLoaded', {}));
      return Promise.resolve();
    }
    if (this.remotePeers().every((p) => p.loadedScene === scene)) {
      this.allLoadedFired = true;
      queueMicrotask(() => this.g.events?.emit('party:allLoaded', {}));
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const w: LoadWaiter = {
        scene,
        resolve,
        timer: setTimeout(() => {
          const i = this.loadWaiters.indexOf(w);
          if (i >= 0) this.loadWaiters.splice(i, 1);
          const late = this.remotePeers().filter((p) => p.loadedScene !== scene).map((p) => p.name);
          if (late.length) this.toast(`Yüklenemeyen oyuncular: ${late.join(', ')}`, 'warning');
          resolve();
          this.g.events?.emit('party:allLoaded', {});
        }, timeoutMs),
      };
      this.loadWaiters.push(w);
    });
  }

  /** Re-announce our character summary + keystone to the party (level-up, gear, keystone changes). */
  updateCharacterInfo(): void {
    if (this.charInfoTimer) {
      clearTimeout(this.charInfoTimer);
      this.charInfoTimer = null;
    }
    const me = this.self;
    if (!me) return;
    const summary = this.localSummary();
    me.summary = summary;
    me.name = summary.name;
    me.keystone = this.localKeystone();
    if (this.role === 'client') {
      this.sendCtl({ t: 'char', summary, keystone: me.keystone }, [this.hostId]);
    } else if (this.role === 'host') {
      this.broadcastParty();
      this.syncAnnounce();
    }
    this.g.events?.emit('party:changed', {});
  }

  /**
   * Host: start a 30 s ready check. Everybody answers with setReady(). Offline: nothing to check.
   * `label` (optional) says what is being confirmed ("Gölge Tapınağı +4 anahtarı"): it travels with the check, lands in
   * `G.net.readyCheck.label` on every peer and in the toast (GDD 5.13 key-selection confirm).
   */
  startReadyCheck(label?: string): void {
    if (this.role !== 'host') return;
    if (this.readyCheck?.active) return;
    const id = ++this.readyCheckSeq;
    const by = this.self?.name ?? 'Lider';
    const lb = sanitizeText(label, 80);
    this.readyCheck = {
      id, active: true, startedAt: Date.now(), timeoutMs: NET.READY_CHECK_TIMEOUT_MS, by,
      deadline: performance.now() + NET.READY_CHECK_TIMEOUT_MS, result: null, ...(lb ? { label: lb } : {}),
    };
    for (const p of this.peers.values()) p.ready = p.peerId === this.selfId;
    this.sendCtl({ t: 'readyCheck', id, timeoutMs: NET.READY_CHECK_TIMEOUT_MS, by, ...(lb ? { label: lb } : {}) }, this.remoteMemberIds());
    this.broadcastParty();
    this.g.events?.emit('party:readyCheck', { active: true });
    this.toast(lb ? `Hazır mısın? ${lb}` : 'Hazır mısın? Hazır olduğunda onayla.', 'info');
    this.evaluateReadyCheck();
  }

  setReady(ready: boolean): void {
    const me = this.self;
    if (!me) return;
    me.ready = ready;
    if (this.role === 'client') {
      this.sendCtl({ t: 'ready', id: this.readyCheck?.active ? this.readyCheck.id : 0, ready }, [this.hostId]);
    } else if (this.role === 'host') {
      this.broadcastParty();
      this.evaluateReadyCheck();
    }
    this.g.events?.emit('party:changed', {});
  }

  /** Host: remove a member from the party (they cannot rejoin this session). */
  kick(peerId: string): void {
    if (this.role !== 'host') return;
    const p = this.peers.get(peerId);
    if (!p || p.isHost) return;
    this.kicked.add(peerId);
    this.sendCtl({ t: 'kick', reason: 'leader' }, [peerId]);
    this.removePeer(peerId, 'kicked');
  }

  /** Chat line to the party. `ch` is the send channel (party = default; say / yell are relayed with the line). */
  sendChat(text: string, ch: 'party' | 'say' | 'yell' = 'party', linksIn?: ChatLink[]): void {
    const t = sanitizeText(text, NET.MAX_CHAT_LEN);
    if (!t) return;
    const links = sanitizeLinks(linksIn);
    const withLinks = links.length ? { links } : {};
    // a public channel is not a party: the default "Grup" line becomes "Yakın" (heard within INTEREST.SAY_M), yell carries further
    if (ch === 'party' && this.channel) ch = 'say';
    this.g.events?.emit('net:chat', { from: this.self?.name ?? 'Sen', text: t, channel: ch, ...withLinks });
    this.broadcast('chat', ch === 'party' ? { text: t, ...withLinks } : { text: t, ch, ...withLinks });
  }

  /** Emote (WoW-style /dance ...): the emote id travels on the chat channel; receivers play the clip and show the line. */
  sendEmote(id: string): void {
    const e = ident(id, 16);
    if (!e) return;
    this.broadcast('chat', { text: e, ch: 'emote', emote: e });
  }

  /** UX-41 (§6.5): the host's LFG listing (`null` = not looking). Re-announced with the room; read back as RoomInfo.lfg. */
  setLfg(listing: LfgListing | null): void {
    this.lfg = listing ? sanitizeLfg(listing) ?? null : null;
    if (this.role === 'host') this.syncAnnounce();
  }

  /* ================================================================================================
   * Frame update (Engine order -100)
   * ============================================================================================== */

  update(dt: number): void {
    const now = performance.now();
    if (now - this.lastSelfRefresh > 1000) {
      this.lastSelfRefresh = now;
      if (this.role === 'offline') this.refreshSelfOffline();
    }
    try {
      this.replication?.update(dt);
    } catch (err) {
      console.error('[net] replication update failed', err);
    }
    if (this.channel || this.mig) this.channelTick();
    if (this.role === 'offline') return;
    if (now >= this.nextPing) {
      this.nextPing = now + NET.PING_INTERVAL_MS;
      this.pingAll();
    }
    const rc = this.readyCheck;
    if (rc?.active && this.role === 'host' && now >= rc.deadline) this.finishReadyCheck(false);
  }

  /* ================================================================================================
   * Transport plumbing
   * ============================================================================================== */

  private async openTransport(kind: NetKind, code: string, password?: string): Promise<NetTransport<GameChannels>> {
    if (this.opts.openTransport) return this.opts.openTransport(kind, code, password);
    return openGameRoom(kind === 'local' ? 'local' : 'p2p', code, password || undefined, {
      local: { selfId: this.localSessionId, latencyMs: this.urlOpts.local.latencyMs, jitterMs: this.urlOpts.local.jitterMs },
    });
  }

  private attach(tr: NetTransport<GameChannels>): void {
    this.trUnsubs.push(
      tr.on('ctl', (msg, meta) => this.safe(() => this.onCtl(msg, meta.from))),
      tr.on('g', (env, meta) => this.safe(() => this.onGame(env, meta.from))),
      tr.onPeerLeave((peer) => this.safe(() => this.onTransportPeerLeft(peer))),
      tr.onError((e) => {
        if (e.code === 'bad_password') {
          if (this.joinPending) this.failJoin('Şifre yanlış.');
        } else if (e.code !== 'payload_too_large') {
          console.warn(`[net] ${e.code}: ${e.message}`);
        }
      }),
    );
  }

  private dropTransport(): void {
    for (const u of this.trUnsubs.splice(0)) u();
    const tr = this.tr;
    this.tr = null;
    this.transportKind = null;
    if (tr) void tr.leave().catch(() => {});
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('[net] handler error', err);
    }
  }

  private sendCtl(msg: CtlMsg, to: string[]): void {
    if (!this.tr || to.length === 0) return;
    this.tr.send('ctl', msg, { to });
  }

  private remoteMemberIds(): string[] {
    const out: string[] = [];
    for (const id of this.peers.keys()) if (id !== this.selfId) out.push(id);
    return out;
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[net] ${msg}`);
  }

  private toast(text: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    try {
      this.g.ui?.toast?.(text, kind);
    } catch {
      /* UI not ready */
    }
  }

  private emitStatus(): void {
    this.g.events?.emit('net:status', { role: this.role, connected: this.role !== 'offline', roomId: this.roomId });
  }

  private failHost(msg: string): string {
    this.lastError = msg;
    this.toast(msg, 'error');
    return '';
  }

  private failJoinEarly(msg: string): void {
    this.lastError = msg;
    this.toast(msg, 'error');
  }

  /** Abort a pending join. msg null = silent (user cancelled). */
  private failJoin(msg: string | null): void {
    const jp = this.joinPending;
    if (!jp) return;
    this.joinPending = null;
    clearTimeout(jp.timer);
    this.dropTransport();
    if (msg) {
      this.lastError = msg;
      this.toast(msg, 'error');
    }
    jp.ch?.done('fail');
    jp.resolve();
  }

  private sendHello(peer: string): void {
    const jp = this.joinPending;
    if (!jp || jp.helloSent.has(peer)) return;
    jp.helloSent.add(peer);
    this.sendCtl({
      t: 'hello', proto: PROTOCOL_VERSION, gameVersion: GAME_VERSION, summary: this.localSummary(), keystone: this.localKeystone(),
      ...(jp.ch ? { ch: jp.ch.info.key } : {}),
    }, [peer]);
  }

  /* ================================================================================================
   * Control channel
   * ============================================================================================== */

  private onCtl(msg: CtlMsg, from: string): void {
    if (!isObj(msg as unknown) || typeof (msg as { t?: unknown }).t !== 'string') return;
    if (this.role === 'client' && from === this.hostId) this.lastHostMsg = this.mono();
    // public channels: election claims travel between any two peers of the room
    if (msg.t === 'cpeer') return this.onChannelPeer(msg, from);
    if (this.joinPending && this.role === 'offline') {
      if (msg.t === 'welcome') this.onWelcome(msg, from);
      else if (msg.t === 'reject') {
        const reason = (['version', 'full', 'in_progress', 'kicked', 'bad_data', 'level', 'nation'] as const).find((r) => r === msg.reason);
        const jp = this.joinPending;
        if (jp.ch) {
          // a full channel is not an error: the next one is tried; anything else is reported once
          if (reason === 'full') jp.ch.done('full');
          else this.failJoin((REJECT_TEXT[reason ?? 'bad_data'])(typeof msg.detail === 'string' ? sanitizeText(msg.detail, 24) : undefined));
          return;
        }
        this.failJoin((REJECT_TEXT[reason ?? 'bad_data'])(typeof msg.detail === 'string' ? sanitizeText(msg.detail, 24) : undefined));
      }
      return;
    }
    // host migration / merge: the answer of the new host to our re-handshake
    if (this.mig && this.role === 'client' && from === this.hostId && this.channel) {
      if (msg.t === 'welcome') return this.onRehomeWelcome(msg, from);
      if (msg.t === 'reject') return this.onRehomeRejected(from);
    }
    if (this.role === 'host') this.onCtlHost(msg, from);
    else if (this.role === 'client' && from === this.hostId) this.onCtlClient(msg);
  }

  /* ---------------------------------------------------------------- host side */

  private onCtlHost(msg: CtlMsg, from: string): void {
    switch (msg.t) {
      case 'hello':
        return this.onHello(msg, from);
      case 'char': {
        const p = this.peers.get(from);
        const summary = sanitizeSummary(msg.summary);
        if (!p || !summary) return;
        p.summary = summary;
        p.name = summary.name;
        p.keystone = sanitizeKeystone(msg.keystone);
        this.broadcastParty();
        this.g.events?.emit('party:changed', {});
        return;
      }
      case 'ready': {
        const p = this.peers.get(from);
        if (!p) return;
        p.ready = msg.ready === true;
        this.broadcastParty();
        this.evaluateReadyCheck();
        this.g.events?.emit('party:changed', {});
        return;
      }
      case 'loaded': {
        const p = this.peers.get(from);
        const scene = sanitizeSceneId(msg.scene);
        if (!p || !scene || msg.seq !== this.sceneSeq) return;
        p.loadedScene = scene;
        this.broadcastParty();
        this.checkLoaded();
        return;
      }
      case 'bye':
        this.removePeer(from, 'left');
        return;
      default:
        return;
    }
  }

  private onHello(msg: Extract<CtlMsg, { t: 'hello' }>, from: string): void {
    const reject = (reason: RejectReason, detail?: string) => this.sendCtl({ t: 'reject', reason, detail }, [from]);
    // a public channel only takes hellos for ITS channel key, a party room only hellos without one
    const chKey = this.channel?.key ?? null;
    if ((msg.ch ?? null) !== chKey) return reject('bad_data');
    if (this.peers.has(from)) {
      // duplicate hello: resend. A member of a migrated channel re-handshaking with its new host counts as arrived (the world
      // runtime resends the live camps to a peer that "joins").
      if (this.pendingRehome.delete(from)) {
        const p = this.peers.get(from);
        this.g.events?.emit('net:peerJoined', { peerId: from, name: p?.name ?? '' });
        this.g.events?.emit('party:changed', {});
      }
      this.sendWelcome(from);
      this.sendLedgerTo(from);
      return;
    }
    if (this.kicked.has(from)) return reject('kicked');
    if (msg.proto !== PROTOCOL_VERSION || msg.gameVersion !== GAME_VERSION) return reject('version', GAME_VERSION);
    if (this.peers.size >= this.maxPlayers) return reject('full');
    // Dungeon runs cannot be joined; open-world maps can (GDD_OPENWORLD §9.3 point 6). A public channel is always joinable.
    if (!this.channel && this.currentScene?.scene === 'dungeon' && !this.inOpenWorld) return reject('in_progress');
    const summary = sanitizeSummary(msg.summary);
    if (!summary) return reject('bad_data');
    // WP-06: coop rooms are single-nation; only a `pvp` room mixes Gök Kartal and Kızıl Kurt. Public channels are shared by both
    // nations (they are hostile only inside the PvP zone, which the zone rules decide).
    const hostNation = this.self?.summary?.nation;
    if (!canParty(hostNation, summary.nation, this.channel ? 'pvp' : this.roomMode)) return reject('nation', nationName(hostNation));
    let slot = this.channel ? 0 : 1;
    const used = new Set([...this.peers.values()].map((p) => p.slot));
    while (used.has(slot)) slot++;
    if (slot >= (this.channel ? MAX_SLOTS : this.maxPlayers)) return reject('full');
    this.peers.set(from, {
      peerId: from, slot, js: ++this.joinSeqCtr, name: summary.name, summary, ready: false, ping: 0, isHost: false,
      keystone: sanitizeKeystone(msg.keystone), loadedScene: null,
    });
    this.sendWelcome(from);
    this.broadcastParty([from]);
    this.sendLedgerTo(from);
    this.g.events?.emit('net:peerJoined', { peerId: from, name: summary.name });
    if (!this.channel) {
      this.g.events?.emit('net:chat', { from: '', text: `${summary.name} gruba katıldı.`, channel: 'system' });
      this.toast(`${summary.name} gruba katıldı.`, 'info');
    }
    this.g.events?.emit('party:changed', {});
    this.syncAnnounce();
  }

  private sendWelcome(to: string): void {
    const p = this.peers.get(to);
    if (!p) return;
    // Town joins get the town; an open-world party hands the joiner its current map params untouched (spawn / returnTo
    // included), so the joiner appears at the same gate. Dungeon runs and stale town params are never replayed.
    const openParams = this.openWorldParams();
    const scene: { scene: SceneId; params: unknown } | null = this.channel
      ? null // a channel joiner enters the zone it asked for (its own spawn), never the host's
      : openParams
        ? { scene: 'dungeon', params: openParams }
        : { scene: 'town', params: undefined };
    this.sendCtl(
      {
        t: 'welcome', hostId: this.selfId, slot: p.slot, roomName: this.roomName, code: this.roomId ?? '',
        maxPlayers: this.maxPlayers, sceneSeq: this.sceneSeq, scene, party: this.buildParty(),
        ...(this.channel ? { ch: this.channel.key } : {}),
      },
      [to],
    );
  }

  private buildParty(): PartyStateMsg {
    const members: PartyMemberMsg[] = [];
    for (const p of this.members()) {
      members.push({
        id: p.peerId, slot: p.slot, host: p.isHost, summary: p.summary ?? this.localSummary(), ks: p.keystone,
        ready: p.ready, ls: p.loadedScene,
        ...(this.channel ? { js: p.js ?? 0 } : {}),
      });
    }
    return {
      t: 'party', rev: ++this.partyRev, hostId: this.selfId, roomName: this.roomName, code: this.roomId ?? '', maxPlayers: this.maxPlayers,
      ...(this.roomMode === 'pvp' ? { mode: 'pvp' as const } : {}),
      ...(this.channel ? { ch: this.channel.key } : {}),
      members,
    };
  }

  /** Host: send the party state to every member (except `skip`, who just got a welcome with it). */
  private broadcastParty(skip: string[] = []): void {
    if (this.role !== 'host') return;
    const to = this.remoteMemberIds().filter((id) => !skip.includes(id));
    if (to.length) this.sendCtl(this.buildParty(), to);
  }

  private removePeer(peerId: string, why: 'left' | 'kicked' | 'lost'): void {
    const p = this.peers.get(peerId);
    if (!p || p.isHost || this.role !== 'host') return;
    this.peers.delete(peerId);
    this.chatTimes.delete(peerId);
    this.reqTimes.delete(peerId);
    this.pendingRehome.delete(peerId);
    this.chPos.delete(peerId);
    this.interest.forget(peerId);
    this.g.events?.emit('net:peerLeft', { peerId, name: p.name });
    if (!this.channel) {
      const text = why === 'kicked' ? `${p.name} gruptan çıkarıldı.` : why === 'lost' ? `${p.name} bağlantısı koptu.` : `${p.name} gruptan ayrıldı.`;
      this.g.events?.emit('net:chat', { from: '', text, channel: 'system' });
      this.toast(text, 'warning');
    }
    this.broadcastParty();
    this.g.events?.emit('party:changed', {});
    this.checkLoaded();
    this.evaluateReadyCheck();
    this.syncAnnounce();
  }

  private checkLoaded(): void {
    if (this.role !== 'host' || !this.currentScene) return;
    const scene = this.currentScene.scene;
    const remotes = this.remotePeers();
    const all = remotes.every((p) => p.loadedScene === scene);
    for (let i = this.loadWaiters.length - 1; i >= 0; i--) {
      const w = this.loadWaiters[i];
      if (remotes.every((p) => p.loadedScene === w.scene)) {
        clearTimeout(w.timer);
        this.loadWaiters.splice(i, 1);
        w.resolve();
      }
    }
    if (all && this.self?.loadedScene === scene && !this.allLoadedFired) {
      this.allLoadedFired = true;
      this.g.events?.emit('party:allLoaded', {});
    }
  }

  /* ---------------------------------------------------------------- ready check */

  private evaluateReadyCheck(): void {
    const rc = this.readyCheck;
    if (!rc?.active || this.role !== 'host') return;
    const members = this.members();
    const notReady = members.filter((p) => !p.ready);
    if (notReady.length === 0) this.finishReadyCheck(true);
  }

  private finishReadyCheck(ok: boolean): void {
    const rc = this.readyCheck;
    if (!rc?.active) return;
    const notReady = this.members().filter((p) => !p.ready).map((p) => p.name);
    rc.active = false;
    rc.result = { ok, notReady };
    this.sendCtl({ t: 'readyResult', id: rc.id, ok, notReady }, this.remoteMemberIds());
    this.applyReadyResult(ok, notReady);
    for (const p of this.peers.values()) p.ready = false;
    this.broadcastParty();
    this.g.events?.emit('party:changed', {});
  }

  private applyReadyResult(ok: boolean, notReady: string[]): void {
    this.g.events?.emit('party:readyCheck', { active: false });
    if (ok) this.toast('Herkes hazır!', 'success');
    else this.toast(notReady.length ? `Hazır değil: ${notReady.join(', ')}` : 'Hazırlık kontrolü başarısız.', 'warning');
  }

  /* ---------------------------------------------------------------- client side */

  private onWelcome(msg: Extract<CtlMsg, { t: 'welcome' }>, from: string): void {
    const jp = this.joinPending;
    if (!jp) return;
    const party = sanitizeParty(msg.party);
    const ch = jp.ch ?? null;
    // a channel host can hand out slot 0 (the old host's, after a migration); a party host never does
    const slot = Math.round(clampNum(msg.slot, ch ? 0 : 1, (ch ? MAX_SLOTS : MAX_ROOM_SIZE) - 1, -1));
    if (!party || slot < (ch ? 0 : 1) || msg.hostId !== from) return; // ignore bogus welcomes; the timeout still guards the join
    if (ch && (msg.ch !== ch.info.key || party.ch !== ch.info.key)) return; // not the room we asked for
    this.joinPending = null;
    clearTimeout(jp.timer);
    this.lobby.stopBrowsing();
    this.selfId = jp.tr.selfId;
    this.hostId = from;
    this.role = 'client';
    this.roomId = jp.code;
    this.localSlot = slot;
    this.roomName = sanitizeText(msg.roomName, NET.MAX_ROOM_NAME_LEN) || party.roomName;
    this.maxPlayers = party.maxPlayers;
    this.roomMode = party.mode === 'pvp' ? 'pvp' : 'coop';
    this.sceneSeq = Math.round(clampNum(msg.sceneSeq, 0, 2 ** 31, 0));
    this.readyCheck = null;
    this.lastError = null;
    this.lastLeave = null;
    this.buffer = [];
    this.nextPing = 0;
    this.peers.clear();
    if (ch) {
      this.channel = { ...ch.info, cap: Math.min(ch.info.cap, party.maxPlayers) };
      this.hostPublic = false;
      this.lastChan.set(ch.info.zone, ch.info.num);
      this.lastHostMsg = this.mono();
      this.lastTickAt = 0;
    }
    this.applyParty(party, true);
    // a hidden client tab keeps simulating its own character (hit shapes, pstate keep-alive) instead of freezing for the party
    this.g.engine?.setBackgroundTick?.(true);
    this.ensureReplication()?.setActive(true);
    this.emitStatus();
    this.g.events?.emit('party:changed', {});
    if (ch) {
      // The Player id depends on the slot: enter the zone we came for (not the host's scene) now that the slot is known.
      this.pokePresence();
      ch.done('ok');
      void this.goScene(ch.scene, ch.params);
      jp.resolve();
      return;
    }
    this.toast(`Gruba katıldın: ${this.roomName}`, 'success');
    // The Player id depends on the slot: re-enter the host's scene so the local Player is recreated.
    const scene = isObj(msg.scene) ? sanitizeSceneId(msg.scene.scene) : null;
    this.goScene(scene === 'dungeon' ? 'dungeon' : 'town', isObj(msg.scene) ? msg.scene.params : undefined);
    jp.resolve();
  }

  private onCtlClient(msg: CtlMsg): void {
    switch (msg.t) {
      case 'party': {
        const party = sanitizeParty(msg);
        if (party) this.applyParty(party, false);
        return;
      }
      case 'readyCheck': {
        const id = Math.round(clampNum(msg.id, 0, 2 ** 31, 0));
        const timeoutMs = clampNum(msg.timeoutMs, 1000, 120000, NET.READY_CHECK_TIMEOUT_MS);
        const lb = sanitizeText(msg.label, 80);
        this.readyCheck = {
          id, active: true, startedAt: Date.now(), timeoutMs, by: sanitizeText(msg.by, NET.MAX_NAME_LEN) || 'Lider',
          deadline: performance.now() + timeoutMs, result: null, ...(lb ? { label: lb } : {}),
        };
        const me = this.self;
        if (me) me.ready = false;
        this.g.events?.emit('party:readyCheck', { active: true });
        this.g.events?.emit('party:changed', {});
        this.toast(lb ? `Hazır mısın? ${lb}` : 'Hazır mısın? Hazır olduğunda onayla.', 'info');
        return;
      }
      case 'readyResult': {
        const ok = msg.ok === true;
        const notReady = Array.isArray(msg.notReady) ? msg.notReady.slice(0, MAX_PARTY_SIZE).map((n) => sanitizeText(n, NET.MAX_NAME_LEN)) : [];
        if (this.readyCheck) {
          this.readyCheck.active = false;
          this.readyCheck.result = { ok, notReady };
        }
        this.applyReadyResult(ok, notReady);
        return;
      }
      case 'pings': {
        if (!isObj(msg.p)) return;
        for (const [id, ms] of Object.entries(msg.p)) {
          const peer = this.peers.get(id);
          if (!peer || id === this.selfId || id === this.hostId) continue;
          peer.ping = Math.round(clampNum(ms, 0, 9999, 0));
        }
        return;
      }
      case 'kick':
        this.toast('Gruptan çıkarıldın.', 'error');
        if (this.channel) return this.leaveChannelAndRejoin();
        this.lastLeave = 'kicked';
        this.teardown();
        this.returnToTown();
        return;
      case 'closed':
        // a channel host never closes the room, it hands it over (hostleft); a stray `closed` is treated as that
        if (this.channel) return this.onChannelHostLost(this.hostId, null);
        this.toast('Lider odayı kapattı. Kasabaya dönülüyor...', 'warning');
        this.lastLeave = 'host_closed';
        this.teardown();
        this.returnToTown();
        return;
      case 'hostleft':
        if (this.channel) this.onChannelHostLost(this.hostId, typeof msg.next === 'string' ? ident(msg.next, 40) || null : null);
        return;
      case 'rehome':
        if (this.channel) this.onRehomeOrder(ident(msg.to, 40));
        return;
      case 'cledger':
        if (this.channel) this.ledger.merge(msg.e, this.wall());
        return;
      default:
        return;
    }
  }

  /** Client: rebuild `peers` from the host's party state and emit join/leave events for the differences. */
  private applyParty(party: PartyStateMsg, initial: boolean): void {
    const before = new Map(this.peers);
    this.peers.clear();
    for (const m of party.members) {
      const prev = before.get(m.id);
      this.peers.set(m.id, {
        peerId: m.id, slot: m.slot, js: m.js ?? 0, name: m.summary.name, summary: m.summary, ready: m.ready,
        ping: prev?.ping ?? 0, isHost: m.host, keystone: m.ks, loadedScene: m.ls,
      });
    }
    this.roomName = party.roomName || this.roomName;
    this.maxPlayers = party.maxPlayers;
    this.roomMode = party.mode === 'pvp' ? 'pvp' : 'coop';
    const me = this.peers.get(this.selfId);
    if (me && me.slot !== this.localSlot) {
      console.warn('[net] local slot changed by host', this.localSlot, '->', me.slot);
      this.localSlot = me.slot;
      // (a channel member re-enters the zone it is in, not "town")
      const zs = this.channel ? this.zoneScene : null;
      void this.goScene(zs ? zs.scene : this.loadedSceneId === 'dungeon' ? 'dungeon' : 'town', zs ? this.withResume(zs.scene, zs.params) : undefined);
    }
    if (!me) this.warnOnce('nome', 'party state without the local peer');
    // public channels have no "joined / left the group" chat lines: a 12-player zone would drown in them
    const say = !initial && !this.channel;
    for (const [id, p] of before) {
      if (id !== this.selfId && !this.peers.has(id)) {
        this.g.events?.emit('net:peerLeft', { peerId: id, name: p.name });
        if (say) this.g.events?.emit('net:chat', { from: '', text: `${p.name} gruptan ayrıldı.`, channel: 'system' });
      }
    }
    for (const [id, p] of this.peers) {
      if (id !== this.selfId && !before.has(id)) {
        this.g.events?.emit('net:peerJoined', { peerId: id, name: p.name });
        if (say) this.g.events?.emit('net:chat', { from: '', text: `${p.name} gruba katıldı.`, channel: 'system' });
      }
    }
    this.g.events?.emit('party:changed', {});
  }

  private onTransportPeerLeft(peerId: string): void {
    if (this.joinPending) return;
    this.hostClaims.delete(peerId);
    if (this.role === 'client') {
      if (this.channel) {
        // public channel: the host leaving is a migration, not the end of the session
        if (peerId === this.hostId || this.mig?.succ === peerId) this.onChannelHostLost(peerId, null);
        else this.mig?.dead.add(peerId);
        return;
      }
      if (peerId === this.hostId) {
        this.toast('Lider oyundan ayrıldı. Kasabaya dönülüyor...', 'warning');
        this.teardown();
        this.returnToTown();
      }
    } else if (this.role === 'host') {
      this.removePeer(peerId, 'lost');
    }
  }

  /* ================================================================================================
   * Generic gameplay envelope
   * ============================================================================================== */

  private onGame(env: GameEnvelope, from: string): void {
    if (!isObj(env as unknown) || typeof env.c !== 'string' || !KNOWN_CHANNELS.has(env.c) || env.p === undefined) return;
    const c = env.c;
    const s = typeof env.s === 'number' && Number.isFinite(env.s) ? env.s : 0;
    if (this.role === 'client') {
      if (from !== this.hostId) return;
      this.lastHostMsg = this.mono();
      if (HOST_RECEIVES_ONLY.has(c)) return;
      const relayed = typeof env.f === 'string';
      if (relayed && !clientMaySend(c, env.p)) return;
      this.receive(c, env.p, relayed ? (env.f as string) : from, s);
    } else if (this.role === 'host') {
      if (!this.peers.has(from)) return; // not handshaken
      if (!clientMaySend(c, env.p)) return;
      if (c === 'chat' && !this.chatAllowed(from)) return;
      if (HOST_RECEIVES_ONLY.has(c)) {
        if (!this.requestAllowed(from)) return;
        this.receive(c, env.p, from, s); // never relayed, whatever target the sender put on it
        return;
      }
      const t = typeof env.t === 'string' ? env.t : undefined;
      if (t === '*') {
        let to = this.remoteMemberIds().filter((id) => id !== from);
        if (this.channel) {
          if (c === 'pstate') this.notePos(from, env.p);
          // public channel: only the peers that can use it get it (position streams by distance, chat by radius)
          if (to.length) to = this.interestTargets(c, env.p, from, to);
        }
        if (to.length) this.tr?.send('g', { c, p: env.p, s, f: from }, { to });
        this.receive(c, env.p, from, s);
      } else if (t === undefined || t === this.selfId) {
        this.receive(c, env.p, from, s);
      } else if (this.peers.has(t) && t !== from) {
        this.tr?.send('g', { c, p: env.p, s, f: from }, { to: t });
      }
    }
  }

  private receive(c: NetChannel, p: unknown, from: string, s: number): void {
    if (c === 'scene') {
      if (this.role === 'client') this.onSceneMsg(p, s);
      return;
    }
    if (!ALWAYS_LIVE_CHANNELS.has(c)) {
      if (s < this.sceneSeq) return; // sent for a scene we already left
      if (LATEST_WINS_CHANNELS.has(c)) {
        if (!this.sceneIsReady) return;
      } else if (!this.sceneReadyFlag || this.flushPending) {
        if (this.buffer.length >= NET.BUFFER_CAP) this.buffer.shift();
        this.buffer.push({ c, p, from, s });
        return;
      }
    }
    this.dispatch(c, p, from);
  }

  private flushBuffer(): void {
    // Loop by index: messages that arrive while we flush are appended and handled in order.
    for (let i = 0; i < this.buffer.length; i++) {
      const m = this.buffer[i];
      if (m.s >= this.sceneSeq) this.dispatch(m.c, m.p, m.from);
    }
    this.buffer = [];
    this.flushPending = false;
  }

  private dispatch(c: NetChannel, p: unknown, from: string): void {
    const set = this.handlers.get(c);
    if (!set || set.size === 0) return;
    const payload = decodePayload(c, p);
    for (const h of [...set]) {
      try {
        h(payload, from);
      } catch (err) {
        console.error(`[net] handler for "${c}" threw`, err);
      }
    }
  }

  /** Client -> host requests: at most 40 per 10 s per peer (a buggy or hostile client must not flood host handlers). */
  private requestAllowed(from: string): boolean {
    const now = performance.now();
    const list = (this.reqTimes.get(from) ?? []).filter((t) => now - t < 10000);
    if (list.length >= 40) {
      this.reqTimes.set(from, list);
      return false;
    }
    list.push(now);
    this.reqTimes.set(from, list);
    return true;
  }

  private chatAllowed(from: string): boolean {
    const now = performance.now();
    const list = (this.chatTimes.get(from) ?? []).filter((t) => now - t < 10000);
    if (list.length >= NET.CHAT_BURST) {
      this.chatTimes.set(from, list);
      return false;
    }
    list.push(now);
    this.chatTimes.set(from, list);
    return true;
  }

  private onChat(p: NetChannels['chat'], from: string): void {
    if (!isObj(p)) return;
    const name = this.peers.get(from)?.name ?? 'Bilinmeyen';
    // emote: the id is the text (validated as an identifier); the receiver turns it into the line and the clip
    if (p.ch === 'emote') {
      const id = ident(p.emote ?? p.text, 16);
      if (id) this.g.events?.emit('net:chat', { from: name, text: id, channel: 'emote' });
      return;
    }
    const text = sanitizeText(p.text, NET.MAX_CHAT_LEN);
    if (!text) return;
    const channel = p.ch === 'say' || p.ch === 'yell' ? p.ch : 'party';
    // WP-13 item links: validated snapshots, display only (a linked item is never added to an inventory)
    const links = sanitizeLinks(p.links);
    this.g.events?.emit('net:chat', { from: name, text, channel, ...(links.length ? { links } : {}) });
  }

  /** Client: host moved the party. */
  private onSceneMsg(p: unknown, s: number): void {
    if (!isObj(p)) return;
    const scene = sanitizeSceneId(p.scene);
    if (scene !== 'town' && scene !== 'dungeon') return;
    if (s < this.sceneSeq) return;
    this.sceneSeq = s;
    this.sceneReadyFlag = false;
    this.flushPending = false;
    this.loadedSceneId = null;
    this.buffer = this.buffer.filter((m) => m.s >= s);
    for (const peer of this.peers.values()) peer.loadedScene = null;
    this.goScene(scene, p.params);
  }

  /** Peers whose refused sceneRequest was already logged as [net-guard] (one line per peer). */
  private readonly sceneGuardLogged = new Set<string>();

  /** Host: a client asks to move the party (keystone owner starts a run / exit portal). */
  private onSceneRequest(p: NetChannels['sceneRequest'], from: string): void {
    if (this.role !== 'host' || !isObj(p) || !this.peers.has(from)) return;
    // a public channel is never moved as a group: every player travels on its own (a stranger must not drag the zone into a dungeon)
    if (this.channel) return;
    const scene = sanitizeSceneId(p.scene);
    // A key run is in progress (dungeon, not open world): only the host (party leader) may move the party. A client's request
    // would move everyone, so it is refused. A client that wants out alone still uses the game menu (its own local leave).
    if (this.currentScene?.scene === 'dungeon' && !this.inOpenWorld && from !== this.selfId) {
      if (!this.sceneGuardLogged.has(from)) {
        this.sceneGuardLogged.add(from);
        console.warn('[net-guard]', `sceneRequest "${scene}" refused: a dungeon run is in progress, only the host moves the party`, from);
      }
      return;
    }
    if (scene === 'dungeon') {
      if (this.currentScene?.scene === 'dungeon' || !isObj(p.params)) return;
      const raw = p.params;
      const dungeonId = ident(raw.dungeonId, 48);
      if (!dungeonId) return;
      const difficulty = (['normal', 'heroic', 'mythic', 'mythicplus'] as const).find((d) => d === raw.difficulty) ?? 'normal';
      // Open-world fields are shape-checked and kept as sent (a world entrance sends returnTo, a gate/village spawn sends spawn).
      const spawn = sanitizeWorldSpawn(raw.spawn);
      const returnTo = sanitizeReturnTo(raw.returnTo);
      // Rebuild the params from known fields only (a client must not inject arbitrary data into everybody's scene).
      const params: DungeonParams = {
        dungeonId,
        difficulty,
        keyLevel: Math.round(clampNum(raw.keyLevel, 0, 60, 0)),
        seed: Math.round(clampNum(raw.seed, 0, 4294967295, 1)),
        affixes: (Array.isArray(raw.affixes) ? raw.affixes.slice(0, 6).map((a) => ident(a, 32)).filter((a) => a.length > 0) : []) as DungeonParams['affixes'],
        enemyLevel: Math.round(clampNum(raw.enemyLevel, 1, 70, 1)),
        partySize: this.peers.size,
        keyOwner: from, // the requester owns the key
        ...(spawn ? { spawn } : {}),
        ...(returnTo ? { returnTo } : {}),
      };
      this.requestScene('dungeon', params);
    } else if (scene === 'town') {
      if (this.currentScene?.scene === 'town') return;
      this.requestScene('town', isObj(p.params) ? p.params : undefined);
    }
  }

  /* ================================================================================================
   * Scenes
   * ============================================================================================== */

  private goScene(scene: SceneId, params: unknown): Promise<void> {
    this.sceneReadyFlag = false;
    this.zoneScene = { scene, params };
    let done: Promise<void> = Promise.resolve();
    try {
      const p = this.g.scenes?.go(scene, params);
      if (p) done = p.catch((err: unknown) => console.warn(`[net] scene change to "${scene}" failed`, err));
    } catch (err) {
      console.warn(`[net] scene change to "${scene}" failed`, err);
      this.sceneReadyFlag = true;
    }
    this.lastGo = done;
    return done;
  }

  /** The promise of the latest goScene (enterScene resolves when the scene is up, like G.scenes.go does). */
  private lastGo: Promise<void> = Promise.resolve();

  /** After a client left/lost the room: re-enter town offline (or its public channel) so the Player is recreated with the right slot. */
  private returnToTown(): void {
    const cur = this.g.scenes?.current?.id;
    if (cur === 'town' || cur === 'dungeon' || (cur === undefined && this.g.character)) void this.enterScene('town', undefined);
  }

  /* ================================================================================================
   * Public zone channels (net/Channels.ts, docs/NETCODE.md §18)
   *
   * A channel room is a normal game room (host-authoritative star) with a deterministic name, entered automatically when the local
   * player walks into the town or an open-world zone without being in a party room. Everything below is the glue between the pure rules
   * of Channels.ts and the existing room code: join + election, host migration, merge of split brains, interest-managed relay, the
   * camp ledger, /kanal and party follow.
   * ============================================================================================== */

  private wall(): number {
    return this.opts.wallNow ? this.opts.wallNow() : Date.now();
  }
  private mono(): number {
    return this.opts.monoNow ? this.opts.monoNow() : performance.now();
  }

  private pokePresence(): void {
    try {
      (this.g.presence as { poke?: () => void } | undefined)?.poke?.();
    } catch {
      /* presence not ready */
    }
  }

  /** Channels are in play: online-capable, a character, not inside a private party room, no party join in flight. */
  private channelsAvailable(): boolean {
    if (this.channelsOff || this.opts.channels === false) return false;
    if (this.defaultTransport === null || !this.g.character) return false;
    if (this.role !== 'offline' && this.channel === null) return false;
    if (this.busy || (this.joinPending !== null && this.chJoin === null)) return false;
    if (this.defaultTransport === 'trystero' && globalThis.isSecureContext === false) return false;
    return true;
  }

  /** requestScene / requestSceneFromHost: the channel layer takes the request when it applies (true = handled, do nothing else). */
  private channelFlow(scene: SceneId, params: unknown): boolean {
    if (this.chBusy) return true; // a channel join / switch is running: a second travel request (double click) is dropped
    if (!this.channelsAvailable()) return false;
    void this.enterScene(scene, params);
    return true;
  }

  /**
   * THE travel funnel for everything that is not a party move: menu -> town, portals, return scrolls, leaving a party. When the target is
   * the town or an open-world zone the player is put into a public channel of it (picked by pickChannel, see Channels.ts) BEFORE the
   * scene is built, so the scene is created once, with the final slot. Any other target (dungeon runs...) leaves the channel and enters
   * the scene on its own. Resolves when the scene is up. `here` = the scene is already running (a direct G.scenes.go happened): leave /
   * join without re-entering when no channel is wanted.
   */
  async enterScene(scene: SceneId, params?: unknown, opts: { here?: boolean } = {}): Promise<void> {
    const zone = this.channelsAvailable() ? this.zoneOf(scene, params) : null;
    if (!zone) {
      if (this.channel) this.leaveChannel();
      if (!opts.here) {
        await this.goScene(scene, params);
      }
      return;
    }
    if (this.chBusy) return;
    if (this.channel && this.channel.zone === zone && this.role === 'client' && !opts.here) {
      await this.goScene(scene, params); // same zone, same room (a gate teleport): nothing to rejoin
      return;
    }
    this.chBusy = true;
    try {
      await this.joinZone(zone, scene, params, 0);
      await this.lastGo;
    } finally {
      this.chBusy = false;
    }
  }

  /** Channel zone of a scene ('town', an open-world map id with legacy aliases resolved, or null = private instance). */
  private zoneOf(scene: SceneId | null | undefined, params: unknown): string | null {
    const k = zoneKeyOf(scene, params, isOpenWorld);
    return k && k !== 'town' ? getDungeon(k)?.id ?? k : k;
  }

  private zoneLabel(zone: string): string {
    return zone === 'town' ? 'Kuzgunkale' : getDungeon(zone)?.name ?? zone;
  }

  private presenceEntries(): import('../systems/Social').PresenceEntry[] {
    try {
      return this.g.presence?.list() ?? [];
    } catch {
      return [];
    }
  }

  private presenceRows(): { self: boolean; channel: { zone: string; num: number } | null; name: string }[] {
    return this.presenceEntries().map((e) => ({ self: e.self, channel: e.ch ?? null, name: e.raw }));
  }

  /** Channel number to try for `zone`: the leader's, else the one we left last, else by pickChannel (fullest below capacity). */
  private pickChannelNum(zone: string, tried: ReadonlySet<number>): number {
    const counts = countChannels(this.presenceRows(), zone);
    const prefer = this.leaderChannel(zone) || this.lastChan.get(zone) || null;
    return pickChannel(counts, { cap: channelCap(zone), prefer, exclude: tried });
  }

  /** Channel number the followed party leader is in, in `zone` (0 = unknown). */
  private leaderChannel(zone: string): number {
    const lead = this.partyLeader?.toLowerCase();
    if (!lead || lead === (this.self?.name ?? '').replace(/~/g, '').toLowerCase()) return 0;
    for (const e of this.presenceEntries()) if (!e.self && e.raw.toLowerCase() === lead && e.ch?.zone === zone) return e.ch.num;
    return 0;
  }

  /** Put the local player into a channel of `zone` and enter `scene` there. Falls back to a solo entry when no channel works. */
  private async joinZone(zone: string, scene: SceneId, params: unknown, forceNum: number): Promise<void> {
    const kind = this.defaultTransport;
    const epoch = this.chEpoch;
    if (this.channel) this.leaveChannel();
    if (!kind) {
      await this.goScene(scene, params);
      return;
    }
    const tried = new Set<number>();
    const cap = channelCap(zone);
    // peer discovery over the relays takes a moment: say so instead of leaving the player at the gate in silence
    const hint = setTimeout(() => this.toast(`${this.zoneLabel(zone)}: kanal aranıyor...`, 'info'), 1200);
    try {
      for (let attempt = 0; attempt < CHANNELS.JOIN_TRIES; attempt++) {
        const num = attempt === 0 && forceNum ? forceNum : this.pickChannelNum(zone, tried);
        if (!num) break;
        const r = await this.tryJoinChannel(kind, { zone, num, key: channelKey(zone, num), cap }, scene, params);
        if (epoch !== this.chEpoch) {
          if (r === 'ok') this.leaveChannel(); // the player went elsewhere (menu) while we were connecting
          return;
        }
        if (r === 'ok') return;
        tried.add(num);
        if (r === 'fail') break; // network trouble: do not hammer the relays
      }
    } finally {
      clearTimeout(hint);
    }
    this.toast('Kanala bağlanılamadı; bu bölgede tek başınasın. (/kanal ile yeniden dene)', 'warning');
    await this.goScene(scene, params);
  }

  /**
   * Open the room of one channel and settle in: join the host that answers, or (nobody there) get elected. Resolves 'ok' once the
   * role is decided (the scene is entered by onWelcome / becomeChannelHost), 'full' on a reject, 'fail' on timeout / transport error.
   */
  private tryJoinChannel(kind: NetKind, info: ChannelInfo, scene: SceneId, params: unknown): Promise<'ok' | 'full' | 'fail'> {
    return new Promise((resolve) => {
      void (async () => {
        const epoch = this.chEpoch;
        let tr: NetTransport<GameChannels>;
        try {
          tr = await this.openTransport(kind, channelRoomCode(info.zone, info.num, GAME_VERSION));
        } catch (err) {
          console.warn('[net] channel open failed', err);
          resolve('fail');
          return;
        }
        if (this.tr || this.role !== 'offline' || epoch !== this.chEpoch) {
          // something else took the session (or the player went to the menu) while the transport opened
          void tr.leave().catch(() => {});
          resolve('fail');
          return;
        }
        this.tr = tr;
        this.transportKind = kind;
        this.attach(tr);
        if (this.selfId !== tr.selfId) {
          this.peers.clear();
          this.selfId = tr.selfId;
          this.hostId = tr.selfId;
          this.peers.set(this.selfId, this.makeSelf(0, true));
        }
        let settled = false;
        // eslint-disable-next-line prefer-const
        let jp: JoinPending;
        // The presence list says whether somebody is in this channel: then give the relays time to introduce us (a host exists, do not
        // elect a second one); an empty channel is decided sooner. Without a lobby connection nothing is known: the full window.
        const online = this.g.presence?.status === 'online';
        const expected = online ? (countChannels(this.presenceRows(), info.zone).get(info.num) ?? 0) : -1;
        const settleMs = expected > 0 ? this.timing.settleMs * 1.6 : expected === 0 ? Math.max(this.timing.settleMs * 0.6, 15) : this.timing.settleMs;
        const cj: ChannelJoin = {
          info, scene, params, since: this.wall(), settleEnd: this.mono() + settleMs, peers: new Map(), ignored: new Set(),
          waitFor: null, waitUntil: 0, tick: null,
          done: (r) => {
            if (settled) return;
            settled = true;
            if (cj.tick) clearInterval(cj.tick);
            clearTimeout(jp.timer);
            if (this.joinPending === jp) this.joinPending = null;
            if (this.chJoin === cj) this.chJoin = null;
            if (r !== 'ok' && this.tr === tr) this.dropTransport();
            resolve(r);
          },
        };
        jp = {
          tr, code: info.key, kind, helloSent: new Set(), resolve: () => {}, ch: cj,
          timer: setTimeout(() => cj.done('fail'), this.timing.joinTimeoutMs),
        };
        this.joinPending = jp;
        this.chJoin = cj;
        this.trUnsubs.push(
          tr.onPeerJoin((peer) => this.safe(() => this.onChannelPeerJoined(peer))),
          tr.onPeerLeave((peer) => cj.peers.delete(peer)),
        );
        cj.tick = setInterval(() => this.safe(() => this.channelJoinTick()), Math.max(15, Math.min(100, Math.round(this.timing.settleMs / 5))));
      })();
    });
  }

  /** A peer appeared in the channel room: a joiner introduces itself (and says hello in case it is the host), a host claims the room. */
  private onChannelPeerJoined(peer: string): void {
    if (this.chJoin && this.role === 'offline') {
      this.sendCtl({ t: 'cpeer', st: 'settle', since: this.chJoin.since }, [peer]);
      this.sendHello(peer);
    } else if (this.role === 'host' && this.channel && this.hostClaim) {
      this.sendCtl({ t: 'cpeer', st: 'host', since: this.hostClaim.since }, [peer]);
    }
  }

  /** Election after the discovery window: nobody claimed hosting -> the oldest settler (lowest (since, id)) becomes host, the others wait for it. */
  private channelJoinTick(): void {
    const cj = this.chJoin;
    if (!cj || this.role !== 'offline' || !this.tr) return;
    const now = this.mono();
    if (now < cj.settleEnd) return;
    for (const [id, c] of cj.peers) if (c.st === 'host' && !cj.ignored.has(id)) return; // a host exists: it answers our hello
    if (cj.waitFor) {
      if (now < cj.waitUntil) return;
      cj.ignored.add(cj.waitFor);
      cj.waitFor = null;
    }
    const mine: Claim = { since: cj.since, id: this.tr.selfId };
    const others: Claim[] = [];
    for (const [id, c] of cj.peers) if (c.st === 'settle' && !cj.ignored.has(id) && this.tr.hasPeer(id)) others.push({ since: c.since, id });
    const winner = electHost(mine, others);
    if (winner.id === mine.id) this.becomeChannelHost(cj);
    else {
      cj.waitFor = winner.id;
      cj.waitUntil = now + this.timing.graceMs;
    }
  }

  /** The join found nobody (or won the election): this peer hosts the channel. Mirrors hostRoom() without opening a transport. */
  private becomeChannelHost(cj: ChannelJoin): void {
    const jp = this.joinPending;
    const tr = this.tr;
    if (!jp || !tr || jp.ch !== cj) return;
    const info = cj.info;
    this.selfId = tr.selfId;
    this.hostId = tr.selfId;
    this.role = 'host';
    this.roomId = info.key;
    this.channel = info;
    this.localSlot = 0;
    this.roomMode = 'coop';
    this.maxPlayers = info.cap;
    this.hasPassword = false;
    this.hostPublic = false;
    this.sceneSeq = 0;
    this.partyRev = 0;
    this.joinSeqCtr = 0;
    this.kicked.clear();
    this.chatTimes.clear();
    this.readyCheck = null;
    this.lastError = null;
    this.mig = null;
    this.pendingRehome.clear();
    this.peers.clear();
    const me = this.makeSelf(0, true);
    me.loadedScene = null;
    this.peers.set(this.selfId, me);
    this.roomName = `${this.zoneLabel(info.zone)} CH${info.num}`;
    this.currentScene = { scene: cj.scene, params: cj.params };
    this.loadedSceneId = null;
    this.hostClaim = { since: cj.since, id: this.selfId };
    this.hostSinceMono = this.mono();
    this.lastTickAt = 0;
    this.stallAt = -Infinity;
    this.lastChan.set(info.zone, info.num);
    this.nextPing = 0;
    this.g.engine?.setBackgroundTick?.(true);
    this.ensureReplication()?.setActive(true);
    // tell everybody who is waiting in the room: "say hello to me" (they answered an offline peer before and were ignored)
    this.sendCtl({ t: 'cpeer', st: 'host', since: cj.since }, tr.getPeers());
    this.emitStatus();
    this.g.events?.emit('party:changed', {});
    this.pokePresence();
    cj.done('ok');
    void this.goScene(cj.scene, cj.params);
    jp.resolve();
  }

  /** `cpeer`: election claims. A joiner announces itself ('settle'), a host claims the room ('host'). */
  private onChannelPeer(msg: Extract<CtlMsg, { t: 'cpeer' }>, from: string): void {
    const since = typeof msg.since === 'number' && Number.isFinite(msg.since) ? msg.since : NaN;
    if (!Number.isFinite(since) || (msg.st !== 'settle' && msg.st !== 'host')) return;
    const cj = this.chJoin;
    if (cj && this.role === 'offline') {
      cj.peers.set(from, { st: msg.st, since });
      if (msg.st === 'host') {
        // it was an offline joiner when our hello reached it: say hello again now that it hosts
        const jp = this.joinPending;
        if (jp) {
          jp.helloSent.delete(from);
          this.sendHello(from);
        }
      }
      return;
    }
    if (!this.channel || msg.st !== 'host') return;
    const claim: Claim = { since, id: from };
    this.hostClaims.set(from, { claim, at: this.mono() });
    if (this.role === 'client') {
      // the successor of a lost host announces itself
      const m = this.mig;
      if (m && m.succ === from && !m.hello) this.rehomeTo(from);
      return;
    }
    // two hosts in one room (both found it empty at the same moment, or a partition healed): the older claim wins, and only a young
    // host yields (a long-running host is never talked down by a stranger's claim)
    if (this.role === 'host' && this.hostClaim && from !== this.selfId) {
      const now = this.mono();
      const young = now - this.hostSinceMono < this.timing.mergeWindowMs;
      if (young && claimBefore(claim, this.hostClaim)) {
        this.yieldTo(from);
        return;
      }
      // A host that was frozen (suspended laptop, long hitch) and wakes up to a claim from one of ITS OWN members has been replaced:
      // the members gave up on it. The frozen time shows as a gap between frame updates.
      const frozen = this.lastTickAt > 0 && now - this.lastTickAt > this.timing.hostSilenceMs;
      if ((frozen || now - this.stallAt < this.timing.mergeWindowMs) && this.peers.has(from)) this.yieldTo(from);
    }
  }

  /** Leave the public channel (no scene change): a host hands the room over first. Idempotent. */
  private leaveChannel(): void {
    if (this.chJoin) this.chJoin.done('fail');
    if (!this.channel) {
      if (this.tr && this.role === 'offline' && !this.joinPending) this.dropTransport();
      return;
    }
    if (this.role === 'host') {
      this.sendCtl({ t: 'hostleft', next: this.successorHint() }, this.remoteMemberIds());
    } else if (this.role === 'client') {
      this.sendCtl({ t: 'bye' }, [this.hostId]);
    }
    this.teardown();
  }

  /** Successor the leaving host names (the same one every member computes): lowest join sequence among the connected others. */
  private successorHint(): string | null {
    const roster = [...this.peers.values()].filter((p) => p.peerId !== this.selfId && this.tr?.hasPeer(p.peerId)).map((p) => ({ id: p.peerId, js: p.js ?? 0 }));
    return successorOf(roster, new Set());
  }

  /** The host removed us (or misbehaved): leave and come back through the normal pick, away from the room we just left. */
  private leaveChannelAndRejoin(): void {
    const zs = this.zoneScene;
    const zone = this.channel?.zone;
    if (zone) this.lastChan.delete(zone);
    this.leaveChannel();
    if (zs) void this.enterScene(zs.scene, this.withResume(zs.scene, zs.params));
  }

  /** The player went elsewhere (menu, party room): a join / switch in flight must not enter its scene any more. */
  private abortChannelWork(): void {
    this.chEpoch++;
    this.chJoin?.done('fail');
  }

  /** A scene change this class did not start (return scroll, tools): keep the channel in step with the scene the player is in now. */
  private onSceneChangedForChannel(to: SceneId): void {
    if (to === 'menu' || to === 'loading') {
      this.abortChannelWork();
      if (this.channel) this.leaveChannel();
      return;
    }
    if (this.zoneScene?.scene === to) return; // ours
    this.zoneScene = { scene: to, params: undefined };
    if (!this.channel || this.chBusy || !this.channelsAvailable()) return;
    if (this.channel.zone === this.zoneOf(to, undefined)) return;
    void this.enterScene(to, undefined, { here: true });
  }

  /* ---------------------------------------------------------------- host migration */

  /** The host of our channel is gone (graceful `hostleft` with a hint, or the transport saw it leave). */
  private onChannelHostLost(peerId: string, hint: string | null): void {
    if (!this.channel || this.role !== 'client') return;
    if (this.mig) {
      if (this.mig.dead.has(peerId)) return; // hostleft was followed by the transport event
      this.mig.dead.add(peerId);
    } else {
      if (peerId !== this.hostId) return;
      this.mig = { from: peerId, dead: new Set([peerId]), succ: null, until: 0, hello: false, wasHost: false };
    }
    const gone = this.peers.get(peerId);
    this.peers.delete(peerId);
    this.hostClaims.delete(peerId);
    if (gone) this.g.events?.emit('net:peerLeft', { peerId, name: gone.name });
    this.nextSuccessor(hint);
  }

  /** Everybody computes the same successor (lowest join sequence among the survivors); skipped ones are dead. */
  private nextSuccessor(hint: string | null): void {
    const m = this.mig;
    if (!m || !this.channel || this.role !== 'client' || !this.tr) return;
    const roster = [...this.peers.values()].map((p) => ({ id: p.peerId, js: p.js ?? 0 }));
    const alive = (id: string): boolean => id === this.selfId || this.tr?.hasPeer(id) === true;
    let succ: string | null = hint && !m.dead.has(hint) && this.peers.has(hint) && alive(hint) ? hint : null;
    while (!succ) {
      const cand = successorOf(roster, m.dead);
      if (!cand) break;
      if (alive(cand)) {
        succ = cand;
        break;
      }
      m.dead.add(cand);
    }
    if (!succ || succ === this.selfId) {
      this.promoteToHost();
      return;
    }
    m.succ = succ;
    m.hello = false;
    m.until = this.mono() + this.timing.migrateWaitMs;
    if (this.hostClaims.has(succ)) this.rehomeTo(succ); // it announced itself before we noticed the loss
  }

  /** Re-handshake with the new host: hello (kept slot when it can), then its welcome re-syncs the roster. */
  private rehomeTo(succ: string): void {
    const m = this.mig;
    if (!m || !this.channel) return;
    this.hostId = succ;
    m.succ = succ;
    m.hello = true;
    m.until = this.mono() + this.timing.migrateWaitMs;
    this.sendCtl({
      t: 'hello', proto: PROTOCOL_VERSION, gameVersion: GAME_VERSION, summary: this.localSummary(), keystone: this.localKeystone(),
      ch: this.channel.key, rh: true,
    }, [succ]);
  }

  /** Per frame while migrating: a successor that never claimed / never welcomed us is skipped. */
  private migrationTick(now: number): void {
    const m = this.mig;
    if (!m || now < m.until) return;
    if (m.succ) m.dead.add(m.succ);
    this.nextSuccessor(null);
  }

  private onRehomeWelcome(msg: Extract<CtlMsg, { t: 'welcome' }>, from: string): void {
    const m = this.mig;
    const party = sanitizeParty(msg.party);
    if (!m || !this.channel || !party || msg.hostId !== from || msg.ch !== this.channel.key) return;
    this.mig = null;
    this.hostClaims.delete(from);
    this.sceneSeq = Math.round(clampNum(msg.sceneSeq, 0, 2 ** 31, 0));
    this.nextPing = 0;
    const slotChanged = party.members.some((pm) => pm.id === this.selfId && pm.slot !== this.localSlot);
    this.applyParty(party, false); // roster, slots (a changed slot re-enters the zone), crown
    this.pokePresence();
    // The new host re-seeds the world and streams it to us like to a late joiner: drop the replicas of the old host's enemies.
    this.purgeEnemyReplicas();
    // we were an authority a moment ago: rebuild our world as a client (applyParty already did when the slot changed)
    if (m.wasHost && !slotChanged) this.reseedLocalScene();
    this.g.events?.emit('net:hostChanged', { hostId: from, self: false });
  }

  /** The new host refused us (full / version): start over through the normal pick. */
  private onRehomeRejected(from: string): void {
    if (!this.mig || from !== this.hostId) return;
    this.leaveChannelAndRejoin();
  }

  /** The (young, losing) host of our channel tells us to follow the older one. */
  private onRehomeOrder(to: string): void {
    if (!this.channel || this.role !== 'client' || this.mig || !to || to === this.selfId || !this.tr?.hasPeer(to)) return;
    this.mig = { from: this.hostId, dead: new Set([this.hostId]), succ: to, until: 0, hello: false, wasHost: false };
    this.rehomeTo(to);
  }

  /**
   * This peer is the successor: it becomes the host of the channel. The roster (slots, join order) is already here; members re-handshake
   * within rehomeGraceMs (the others are dropped). The authoritative world is NOT handed over - it lived in the old host's process.
   * An open-world zone is re-seeded: the local scene is rebuilt as an authority at the player's own position (camps and events start
   * from the deterministic data; camp respawn timers come back from the ledger). The town has nothing authoritative: no reload.
   */
  private promoteToHost(): void {
    this.mig = null;
    const tr = this.tr;
    if (!this.channel || !tr) return;
    this.role = 'host';
    this.hostId = this.selfId;
    let maxJs = 0;
    for (const p of this.peers.values()) {
      p.isHost = p.peerId === this.selfId;
      maxJs = Math.max(maxJs, p.js ?? 0);
    }
    this.joinSeqCtr = maxJs;
    this.pendingRehome.clear();
    for (const id of [...this.peers.keys()]) {
      if (id === this.selfId) continue;
      if (tr.hasPeer(id)) this.pendingRehome.add(id);
      else {
        const gone = this.peers.get(id);
        this.peers.delete(id);
        if (gone) this.g.events?.emit('net:peerLeft', { peerId: id, name: gone.name });
      }
    }
    this.rehomeDeadline = this.mono() + this.timing.rehomeGraceMs;
    this.hostClaim = { since: this.wall(), id: this.selfId };
    this.hostSinceMono = this.mono();
    this.lastTickAt = 0;
    this.stallAt = -Infinity;
    this.chPos.clear();
    this.interest.clear();
    const zs = this.zoneScene;
    this.currentScene = zs ? { scene: zs.scene, params: zs.params } : null;
    this.g.engine?.setBackgroundTick?.(true);
    this.sendCtl({ t: 'cpeer', st: 'host', since: this.hostClaim.since }, tr.getPeers());
    this.emitStatus();
    this.g.events?.emit('net:hostChanged', { hostId: this.selfId, self: true });
    this.g.events?.emit('party:changed', {});
    this.pokePresence();
    this.reseedLocalScene();
  }

  /** Split brain: an older host exists. Tell our members to follow it and become its member ourselves. */
  private yieldTo(winner: string): void {
    if (!this.channel || this.role !== 'host' || !this.tr?.hasPeer(winner)) return;
    this.sendCtl({ t: 'rehome', to: winner }, this.remoteMemberIds());
    this.role = 'client';
    this.pendingRehome.clear();
    this.hostClaim = null;
    this.lastHostMsg = this.mono();
    const me = this.self;
    if (me) me.isHost = false;
    this.mig = { from: this.selfId, dead: new Set(), succ: winner, until: 0, hello: false, wasHost: true };
    this.rehomeTo(winner);
    this.emitStatus();
  }

  /** Rebuild the local open-world scene (new authority role) at the player's own position; the town and dungeons are left alone. */
  private reseedLocalScene(): void {
    const zs = this.zoneScene;
    if (!zs || zs.scene !== 'dungeon' || this.zoneOf('dungeon', zs.params) === null) return;
    void this.goScene('dungeon', this.withResume('dungeon', zs.params));
  }

  /** The new host streams the zone again: forget every enemy replica of the old host. */
  private purgeEnemyReplicas(): void {
    const w = this.g.world;
    const zs = this.zoneScene;
    if (!w || !zs || zs.scene !== 'dungeon') return;
    for (const e of [...w.enemies]) {
      try {
        w.remove(e);
      } catch {
        /* already gone */
      }
    }
  }

  /** Scene params with the player's current position (DungeonParams.resumeAt): a re-enter keeps the player where it stands. Open-world only. */
  private withResume(scene: SceneId, params: unknown): unknown {
    if (scene !== 'dungeon' || typeof params !== 'object' || params === null || this.zoneOf(scene, params) === null) return params;
    const pos = this.localPos();
    return pos ? { ...(params as object), resumeAt: pos } : params;
  }

  /* ---------------------------------------------------------------- interest management */

  private localPos(): { x: number; z: number } | null {
    const pl = this.g.player ?? this.g.world?.localPlayer;
    const p = pl?.position;
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : null;
  }

  /** Host: remember where a member is (from its `pstate`, wire form [x, y, z, ...] or the object form). */
  private notePos(from: string, p: unknown): void {
    let x: unknown;
    let z: unknown;
    if (Array.isArray(p)) {
      x = p[0];
      z = p[2];
    } else if (isObj(p)) {
      x = p.x;
      z = p.z;
    }
    if (typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z)) this.chPos.set(from, { x, z, at: this.mono() });
  }

  private posOf(id: string): { x: number; z: number } | null {
    if (id === this.selfId) return this.localPos();
    const e = this.chPos.get(id);
    return e && this.mono() - e.at <= INTEREST.STALE_POS_MS ? e : null;
  }

  /**
   * Host, public channel: which of `candidates` should get this message from `from`. Position streams (`pstate`, `minion`) go at full
   * rate to peers within INTEREST.NEAR_M, at INTEREST.MID_HZ out to FAR_M and not at all beyond; `cast` events stop at FAR_M; chat uses
   * its radius (party chat does not exist in a channel). Unknown positions fail open (everybody gets it).
   */
  private interestTargets(c: string, payload: unknown, from: string, candidates: string[]): string[] {
    if (c === 'chat') {
      const r = chatRadius(isObj(payload) ? payload.ch : undefined);
      if (r === null) return []; // "party" line: nobody
      const fp = this.posOf(from);
      if (!fp) return candidates;
      return candidates.filter((id) => {
        const tp = this.posOf(id);
        return !tp || dist2d(fp.x, fp.z, tp.x, tp.z) <= r;
      });
    }
    const kind = INTEREST_CHANNELS[c];
    if (!kind) return candidates;
    const now = this.mono();
    const fp = this.posOf(from);
    const out: string[] = [];
    for (const id of candidates) {
      const tp = this.posOf(id);
      const d = fp && tp ? dist2d(fp.x, fp.z, tp.x, tp.z) : null;
      if (this.interest.allow(kind, c, from, id, d, now)) out.push(id);
    }
    return out;
  }

  /* ---------------------------------------------------------------- ledger (camp respawn timers) */

  /** Host of a channel: "this camp was wiped, it is back in ttlSec" (wall-clock). No-op outside a hosted channel. */
  ledgerNote(key: string, ttlSec: number): void {
    if (this.channel && this.role === 'host') this.ledger.note(key, ttlSec, this.wall());
  }

  /** Seconds left on a ledger entry (0 = none). Only a channel has a ledger. */
  ledgerRemaining(key: string): number {
    return this.channel ? this.ledger.remaining(key, this.wall()) : 0;
  }

  private sendLedgerTo(peer: string): void {
    if (this.channel && this.role === 'host' && this.ledger.size > 0) this.sendCtl({ t: 'cledger', e: this.ledger.encode(this.wall()) }, [peer]);
  }

  /* ---------------------------------------------------------------- tick, follow, commands */

  private channelTick(): void {
    const now = this.mono();
    // Our own frame loop stalled (scene load, suspended tab): a host must remember it (it may have been replaced meanwhile), and a
    // member must not blame its host for the silence it caused itself.
    const gap = this.lastTickAt > 0 ? now - this.lastTickAt : 0;
    this.lastTickAt = now;
    if (gap > 1500) {
      this.lastHostMsg = now;
      if (this.role === 'host' && gap > this.timing.hostSilenceMs) this.stallAt = now;
    }
    // a host that went silent without the transport noticing (frozen tab, dead route): members move on after hostSilenceMs
    if (this.role === 'client' && this.channel && !this.mig && now - this.lastHostMsg > this.timing.hostSilenceMs) this.onChannelHostLost(this.hostId, null);
    if (this.mig && this.role === 'client') this.migrationTick(now);
    if (this.role === 'host' && this.channel) {
      if (this.pendingRehome.size && now >= this.rehomeDeadline) {
        for (const id of [...this.pendingRehome]) this.removePeer(id, 'lost'); // never re-handshook: gone
        this.pendingRehome.clear();
      }
      if (this.ledger.dirty && now - this.ledgerSentAt >= this.timing.ledgerEveryMs) {
        this.ledgerSentAt = now;
        this.sendCtl({ t: 'cledger', e: this.ledger.encode(this.wall()) }, this.remoteMemberIds());
      }
    }
    if (this.channel && now >= this.nextFollow) {
      this.nextFollow = now + 1000;
      this.followLeader(now);
    }
  }

  /** A party room names the leader the group keeps following (host = own name, members = the host's name). */
  private noteParty(): void {
    if (this.channel || this.role === 'offline' || this.peers.size < 2) return;
    const host = [...this.peers.values()].find((p) => p.isHost);
    const name = host ? host.name.replace(/~/g, '').slice(0, NET.MAX_NAME_LEN) : '';
    if (name && name !== this.partyLeader) {
      this.partyLeader = name;
      this.pokePresence();
    }
  }

  /** Soft-party follow: when the leader is in another channel of MY zone, move there (out of combat, if it has room). */
  private followLeader(now: number): void {
    const leader = this.partyLeader?.toLowerCase();
    const ch = this.channel;
    if (!leader || !ch || this.chBusy || this.mig) return;
    if (leader === (this.self?.name ?? '').replace(/~/g, '').toLowerCase()) return;
    const entries = this.presenceEntries();
    const e = entries.find((r) => !r.self && r.raw.toLowerCase() === leader);
    if (!e) {
      if (!this.leaderGoneSince) this.leaderGoneSince = now;
      else if (now - this.leaderGoneSince > CHANNELS.LEADER_LOST_MS) {
        this.partyLeader = null; // the leader has not been seen for a long while: the group is over
        this.leaderGoneSince = 0;
        this.pokePresence();
      }
      return;
    }
    this.leaderGoneSince = 0;
    const lc = e.ch;
    if (!lc || lc.zone !== ch.zone || lc.num === ch.num) return;
    if (this.g.player?.inCombat) return;
    if (now - this.lastSwitchAt < CHANNELS.SWITCH_COOLDOWN_MS) return;
    const counts = countChannels(this.presenceRows(), ch.zone);
    if ((counts.get(lc.num) ?? 0) >= ch.cap) return; // the leader's channel is full: stay, try again later
    void this.runSwitch(ch.zone, lc.num);
  }

  private async runSwitch(zone: string, num: number): Promise<void> {
    const zs = this.zoneScene;
    if (!zs || this.chBusy) return;
    this.chBusy = true;
    this.lastSwitchAt = this.mono();
    const old = this.channel?.num ?? 0;
    try {
      if (old) this.lastChan.set(zone, old); // if the new one turns out full the player goes back
      await this.joinZone(zone, zs.scene, this.withResume(zs.scene, zs.params), num);
      await this.lastGo;
    } finally {
      this.chBusy = false;
    }
  }

  /** `/kanal` (list) and `/kanal <n>` (switch). Returns the lines to print. */
  channelCommand(arg: string): string[] {
    const zs = this.zoneScene;
    const zone = this.channel?.zone ?? (zs ? this.zoneOf(zs.scene, zs.params) : null);
    if (!zone) return ['Burada kanal yok: zindanlarda ve grup odalarında herkes kendi örneğindedir.'];
    if (this.role !== 'offline' && !this.channel) return ['Bir grup odasındasın. Kanallar, odadan ayrılınca açılır.'];
    const label = this.zoneLabel(zone);
    const cap = channelCap(zone);
    const counts = countChannels(this.presenceRows(), zone, true);
    const a = arg.trim().toLowerCase().replace(/^ch/, '');
    if (!a) {
      if (!this.channel) return [`${label}: bir kanala bağlı değilsin (tek başınasın). /kanal 1 ile bağlanmayı dene.`];
      return channelLines(label, counts, this.channel.num, cap);
    }
    const n = Number(a);
    if (!Number.isInteger(n) || n < 1 || n > CHANNELS.MAX_CHANNELS) return [`Kanal numarası 1 ile ${CHANNELS.MAX_CHANNELS} arasında olmalı.`];
    if (this.channel && n === this.channel.num) return [`Zaten CH${n} kanalındasın.`];
    if (this.chBusy) return ['Kanal değişimi sürüyor...'];
    if (this.g.player?.inCombat) return ['Savaşta kanal değiştirilemez.'];
    if (this.mono() - this.lastSwitchAt < CHANNELS.SWITCH_COOLDOWN_MS) return ['Kanalı çok sık değiştiriyorsun. Biraz bekle.'];
    if ((counts.get(n) ?? 0) >= cap) return [`CH${n} dolu (${counts.get(n)}/${cap}).`];
    // leaving the leader's channel by choice ends the follow
    const lead = this.leaderChannel(zone);
    const lines = [`CH${n} kanalına geçiliyor...`];
    if (this.partyLeader && lead && lead !== n) {
      this.partyLeader = null;
      lines.push('Grup liderinin kanalından ayrıldın; artık onu takip etmiyorsun.');
    }
    void this.runSwitch(zone, n);
    return lines;
  }

  /* ================================================================================================
   * Teardown, announcements, helpers
   * ============================================================================================== */

  /** Reset to offline (no scene change). Idempotent. */
  private teardown(): void {
    const wasOnline = this.role !== 'offline';
    this.lobby.stopAnnouncing();
    this.replication?.setActive(false);
    this.dropTransport();
    for (const w of this.loadWaiters.splice(0)) {
      clearTimeout(w.timer);
      w.resolve();
    }
    this.role = 'offline';
    this.roomId = null;
    this.roomName = '';
    this.roomMode = 'coop';
    this.localSlot = 0;
    this.hostId = this.selfId; // selfId stays (stable ids across sessions)
    this.sceneSeq = 0;
    this.readyCheck = null;
    this.currentScene = null;
    this.allLoadedFired = false;
    this.buffer = [];
    this.flushPending = false;
    this.kicked.clear();
    this.chatTimes.clear();
    this.reqTimes.clear();
    this.sceneGuardLogged.clear();
    // public channel state
    const wasChannel = this.channel !== null;
    this.channel = null;
    this.mig = null;
    this.hostClaim = null;
    this.joinSeqCtr = 0;
    this.pendingRehome.clear();
    this.hostClaims.clear();
    this.chPos.clear();
    this.interest.clear();
    this.ledger.clear();
    this.hostPublic = true;
    this.peers.clear();
    this.peers.set(this.selfId, this.makeSelf(0, true));
    this.g.engine?.setBackgroundTick?.(false);
    if (wasChannel) this.pokePresence();
    if (wasOnline) {
      this.emitStatus();
      this.g.events?.emit('party:changed', {});
    }
  }

  private syncAnnounce(): void {
    if (this.role !== 'host' || !this.hostPublic || !this.transportKind || !this.roomId) {
      this.lobby.stopAnnouncing();
      return;
    }
    const inDungeon = this.currentScene?.scene === 'dungeon';
    // Full or running (a dungeon run; open-world maps stay listed and joinable): leave the lobby to keep the mesh small.
    if (this.peers.size >= this.maxPlayers || (inDungeon && !this.inOpenWorld)) {
      this.lobby.stopAnnouncing();
      return;
    }
    void this.lobby.announce(this.transportKind, this.announceInput()).catch((e) => console.warn('[net] announce failed', e));
  }

  private announceInput(): AnnouncementInput {
    const me = this.self;
    const code = this.roomId ?? '';
    const params = (this.currentScene?.params ?? {}) as Partial<DungeonParams>;
    const inDungeon = this.currentScene?.scene === 'dungeon';
    const open = this.inOpenWorld;
    let activity: RoomActivity = 'town';
    if (inDungeon) activity = open ? 'world' : params.difficulty === 'mythicplus' ? 'mythic' : 'dungeon';
    return {
      roomId: gameRoomId(code),
      code,
      name: this.roomName,
      hostName: me?.name ?? 'Lider',
      hostLevel: me?.summary?.level ?? 1,
      hostClass: me?.summary?.classId ?? 'knight',
      activity,
      dungeon: inDungeon ? params.dungeonId ?? null : null,
      keyLevel: inDungeon ? params.keyLevel ?? 0 : 0,
      affixes: inDungeon ? [...(params.affixes ?? [])].map(String) : [],
      players: this.peers.size,
      maxPlayers: this.maxPlayers,
      minLevel: 1,
      hasPassword: this.hasPassword,
      inProgress: inDungeon && !open, // an open-world party accepts joins
      lang: 'tr',
      ...(this.roomMode === 'pvp' ? { mode: 'pvp' as const } : {}),
      // UX-41: undefined clears a previous listing when the merged announcement is updated
      lfg: this.lfg ?? undefined,
    };
  }

  private pingAll(): void {
    const tr = this.tr;
    if (!tr) return;
    if (this.role === 'host') {
      for (const id of this.remoteMemberIds()) {
        tr.ping(id).then((ms) => {
          const p = this.peers.get(id);
          if (p) p.ping = Math.round(ms);
        }).catch(() => {});
      }
      const p: Record<string, number> = {};
      for (const peer of this.peers.values()) p[peer.peerId] = peer.ping;
      this.sendCtl({ t: 'pings', p }, this.remoteMemberIds());
    } else if (this.role === 'client') {
      tr.ping(this.hostId).then((ms) => {
        this.rttMs = Math.round(ms);
        const host = this.peers.get(this.hostId);
        const me = this.self;
        if (host) host.ping = this.rttMs;
        if (me) me.ping = this.rttMs;
      }).catch(() => {});
    }
  }

  private ensureReplication(): Replication | null {
    if (this.opts.noReplication) return null;
    if (!this.replication) this.replication = new Replication(this);
    return this.replication;
  }

  private localSummary(): CharacterSummary {
    try {
      const s = this.g.character?.summary();
      if (s) return s;
    } catch {
      /* character not ready */
    }
    return { id: 'local', name: 'Maceracı', classId: 'knight', level: 1, itemLevel: 0, rating: 0, variant: 0 };
  }

  private localKeystone(): KeystoneData | null {
    try {
      const k = this.g.character?.save?.mythic?.keystone;
      return k ? { dungeonId: k.dungeonId, level: k.level, depleted: k.depleted } : null;
    } catch {
      return null;
    }
  }

  private makeSelf(slot: number, isHost: boolean): PeerInfo {
    const summary = this.localSummary();
    return {
      peerId: this.selfId, slot, js: 0, name: summary.name, summary, ready: false, ping: 0, isHost,
      keystone: this.localKeystone(), loadedScene: this.loadedSceneId,
    };
  }

  private refreshSelfOffline(): void {
    const me = this.peers.get(this.selfId);
    if (!me) {
      this.peers.set(this.selfId, this.makeSelf(0, true));
      return;
    }
    const s = this.localSummary();
    me.summary = s;
    me.name = s.name;
    me.keystone = this.localKeystone();
  }

  private scheduleCharInfo(): void {
    if (this.charInfoTimer) return;
    this.charInfoTimer = setTimeout(() => {
      this.charInfoTimer = null;
      this.updateCharacterInfo();
    }, 250);
  }
}
