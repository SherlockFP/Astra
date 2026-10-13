import { G } from '../game/G';
import type { CharacterSummary } from '../types/character';
import type { KeystoneData } from '../types/items';
import type { ChatLink, NetChannel, NetChannels } from '../types/net';
import { sanitizeLinks } from '../systems/ChatLinks';
import { PARTY_ID_BASE, type SceneId } from '../types/common';
import type { DungeonParams } from '../scenes/scenes';
import { isOpenWorld } from '../scenes/flow';
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

export type NetRole = 'offline' | 'host' | 'client';
export type { NetKind } from './LobbyManager';

export interface PeerInfo {
  peerId: string;
  slot: number;                 // party slot 0..4 (player entity id = 1 + slot)
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
  /** Transport the current room uses (null offline). */
  transportKind: NetKind | null = null;
  replication: Replication | null = null;

  /** offline or host: this peer simulates enemies, AI, run state. */
  get isAuthority(): boolean {
    return this.role !== 'client';
  }
  get isOnline(): boolean {
    return this.role !== 'offline';
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

  constructor() {
    this.peers.set(this.selfId, this.makeSelf(0, true));
    this.lobby = new LobbyManager({
      localSelfId: () => this.localSessionId,
      latencyMs: this.urlOpts.local.latencyMs,
      jitterMs: this.urlOpts.local.jitterMs,
    });
    this.lobby.onRooms = () => G.events?.emit('net:rooms', {});
    this.lobby.onError = (m) => this.toast(m, 'error');

    // built-in channel handlers
    this.on('chat', (p, from) => this.onChat(p, from));
    this.on('sceneRequest', (p, from) => this.onSceneRequest(p, from));

    const ev = G.events;
    if (ev) {
      ev.on('scene:leaving', () => {
        this.sceneReadyFlag = false;
      });
      // Safety net: a scene that forgot sceneReady() must not leave gameplay messages buffered forever.
      ev.on('scene:changed', ({ to }) => {
        if (!this.sceneReadyFlag) this.sceneReady(to);
      });
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
    return this.urlOpts.mode === 'offline' ? null : this.urlOpts.mode === 'local' ? 'local' : 'trystero';
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
  async hostRoom(opts: { name: string; password?: string; maxPlayers?: number; transport?: NetKind; public?: boolean; mode?: 'coop' | 'pvp' }): Promise<string> {
    if (this.role !== 'offline' || this.joinPending || this.busy) {
      this.toast('Zaten bir grubun içindesin.', 'warning');
      return '';
    }
    const kind = opts.transport ?? this.defaultTransport;
    if (!kind) return this.failHost('Çevrimdışı mod: oda kurulamaz.');
    if (!G.character) return this.failHost('Önce bir karakter seçmelisin.');
    if (kind === 'trystero' && globalThis.isSecureContext === false) return this.failHost(MSG_INSECURE); // trystero needs crypto.subtle
    if (G.scenes?.current?.id === 'dungeon') return this.failHost('Oda kurmak için kasabada olmalısın.');
    this.busy = true;
    try {
      const code = makeRoomCode();
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
      this.currentScene = { scene: (G.scenes?.current?.id as SceneId | undefined) ?? 'town', params: undefined };
      this.loadedSceneId = this.sceneReadyFlag ? this.currentScene.scene : null;
      me.loadedScene = this.loadedSceneId;
      this.nextPing = 0;
      G.engine?.setBackgroundTick?.(true);
      this.ensureReplication().setActive(true);
      this.emitStatus();
      G.events?.emit('party:changed', {});
      this.syncAnnounce();
      this.toast(`Oda kuruldu. Kod: ${code}`, 'success');
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
    if (this.role !== 'offline' || this.joinPending || this.busy) {
      this.toast('Zaten bir grubun içindesin.', 'warning');
      return;
    }
    const kind = opts?.transport ?? this.defaultTransport;
    if (!kind) return this.failJoinEarly('Çevrimdışı mod: odaya katılınamaz.');
    const code = normalizeRoomCode(String(roomId ?? '').replace(GAME_ROOM_PREFIX, ''));
    if (!code) return this.failJoinEarly('Geçersiz oda kodu.');
    if (!G.character) return this.failJoinEarly('Önce bir karakter seçmelisin.');
    if (kind === 'trystero' && globalThis.isSecureContext === false) return this.failJoinEarly(MSG_INSECURE);
    this.busy = true;
    let tr: NetTransport<GameChannels>;
    try {
      tr = await this.openTransport(kind, code, opts?.password);
    } catch (err) {
      console.warn('[net] joinRoom failed', err);
      this.busy = false;
      return this.failJoinEarly('Odaya bağlanılamadı. Ağ bağlantını kontrol et.');
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
  }

  /** Leave the room (host: closes it for everybody). Clients return to their own offline town. */
  leaveRoom(): void {
    if (this.joinPending) {
      this.failJoin(null);
      return;
    }
    if (this.role === 'offline') return;
    const was = this.role;
    if (was === 'host') this.sendCtl({ t: 'closed' }, this.remoteMemberIds());
    else if (was === 'client') this.sendCtl({ t: 'bye' }, [this.hostId]);
    this.teardown();
    if (was === 'client') this.returnToTown();
  }

  /* ================================================================================================
   * Messaging
   * ============================================================================================== */

  broadcast<K extends NetChannel>(channel: K, payload: NetChannels[K], _opts?: { reliable?: boolean }): void {
    const tr = this.tr;
    if (!tr || this.role === 'offline') return;
    const env: GameEnvelope = { c: channel, p: encodePayload(channel, payload), s: this.sceneSeq };
    if (this.role === 'host') {
      const to = this.remoteMemberIds();
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
      G.events?.emit('party:changed', {});
    }
    this.goScene(scene, params);
  }

  /** Client: ask the host to move the party (keystone owner starting a run, exit portal). Host validates. */
  requestSceneFromHost(scene: 'town' | 'dungeon', params: unknown): void {
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
    if (this.role !== 'host') {
      queueMicrotask(() => G.events?.emit('party:allLoaded', {}));
      return Promise.resolve();
    }
    if (this.remotePeers().every((p) => p.loadedScene === scene)) {
      this.allLoadedFired = true;
      queueMicrotask(() => G.events?.emit('party:allLoaded', {}));
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
          G.events?.emit('party:allLoaded', {});
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
    G.events?.emit('party:changed', {});
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
    G.events?.emit('party:readyCheck', { active: true });
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
    G.events?.emit('party:changed', {});
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
    G.events?.emit('net:chat', { from: this.self?.name ?? 'Sen', text: t, channel: ch, ...withLinks });
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
      G.ui?.toast?.(text, kind);
    } catch {
      /* UI not ready */
    }
  }

  private emitStatus(): void {
    G.events?.emit('net:status', { role: this.role, connected: this.role !== 'offline', roomId: this.roomId });
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
    jp.resolve();
  }

  private sendHello(peer: string): void {
    const jp = this.joinPending;
    if (!jp || jp.helloSent.has(peer)) return;
    jp.helloSent.add(peer);
    this.sendCtl({ t: 'hello', proto: PROTOCOL_VERSION, gameVersion: GAME_VERSION, summary: this.localSummary(), keystone: this.localKeystone() }, [peer]);
  }

  /* ================================================================================================
   * Control channel
   * ============================================================================================== */

  private onCtl(msg: CtlMsg, from: string): void {
    if (!isObj(msg as unknown) || typeof (msg as { t?: unknown }).t !== 'string') return;
    if (this.joinPending && this.role === 'offline') {
      if (msg.t === 'welcome') this.onWelcome(msg, from);
      else if (msg.t === 'reject') {
        const reason = (['version', 'full', 'in_progress', 'kicked', 'bad_data', 'level', 'nation'] as const).find((r) => r === msg.reason);
        this.failJoin((REJECT_TEXT[reason ?? 'bad_data'])(typeof msg.detail === 'string' ? sanitizeText(msg.detail, 24) : undefined));
      }
      return;
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
        G.events?.emit('party:changed', {});
        return;
      }
      case 'ready': {
        const p = this.peers.get(from);
        if (!p) return;
        p.ready = msg.ready === true;
        this.broadcastParty();
        this.evaluateReadyCheck();
        G.events?.emit('party:changed', {});
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
    if (this.peers.has(from)) {
      this.sendWelcome(from); // duplicate hello: resend
      return;
    }
    if (this.kicked.has(from)) return reject('kicked');
    if (msg.proto !== PROTOCOL_VERSION || msg.gameVersion !== GAME_VERSION) return reject('version', GAME_VERSION);
    if (this.peers.size >= this.maxPlayers) return reject('full');
    // Dungeon runs cannot be joined; open-world maps can (GDD_OPENWORLD §9.3 point 6).
    if (this.currentScene?.scene === 'dungeon' && !this.inOpenWorld) return reject('in_progress');
    const summary = sanitizeSummary(msg.summary);
    if (!summary) return reject('bad_data');
    // WP-06: coop rooms are single-nation; only a `pvp` room mixes Gök Kartal and Kızıl Kurt
    const hostNation = this.self?.summary?.nation;
    if (!canParty(hostNation, summary.nation, this.roomMode)) return reject('nation', nationName(hostNation));
    let slot = 1;
    const used = new Set([...this.peers.values()].map((p) => p.slot));
    while (used.has(slot)) slot++;
    if (slot >= this.maxPlayers) return reject('full');
    this.peers.set(from, {
      peerId: from, slot, name: summary.name, summary, ready: false, ping: 0, isHost: false,
      keystone: sanitizeKeystone(msg.keystone), loadedScene: null,
    });
    this.sendWelcome(from);
    this.broadcastParty([from]);
    G.events?.emit('net:peerJoined', { peerId: from, name: summary.name });
    G.events?.emit('net:chat', { from: '', text: `${summary.name} gruba katıldı.`, channel: 'system' });
    this.toast(`${summary.name} gruba katıldı.`, 'info');
    G.events?.emit('party:changed', {});
    this.syncAnnounce();
  }

  private sendWelcome(to: string): void {
    const p = this.peers.get(to);
    if (!p) return;
    // Town joins get the town; an open-world party hands the joiner its current map params untouched (spawn / returnTo
    // included), so the joiner appears at the same gate. Dungeon runs and stale town params are never replayed.
    const openParams = this.openWorldParams();
    const scene: { scene: SceneId; params: unknown } = openParams
      ? { scene: 'dungeon', params: openParams }
      : { scene: 'town', params: undefined };
    this.sendCtl(
      {
        t: 'welcome', hostId: this.selfId, slot: p.slot, roomName: this.roomName, code: this.roomId ?? '',
        maxPlayers: this.maxPlayers, sceneSeq: this.sceneSeq, scene, party: this.buildParty(),
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
      });
    }
    return { t: 'party', rev: ++this.partyRev, hostId: this.selfId, roomName: this.roomName, code: this.roomId ?? '', maxPlayers: this.maxPlayers, ...(this.roomMode === 'pvp' ? { mode: 'pvp' as const } : {}), members };
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
    G.events?.emit('net:peerLeft', { peerId, name: p.name });
    const text = why === 'kicked' ? `${p.name} gruptan çıkarıldı.` : why === 'lost' ? `${p.name} bağlantısı koptu.` : `${p.name} gruptan ayrıldı.`;
    G.events?.emit('net:chat', { from: '', text, channel: 'system' });
    this.toast(text, 'warning');
    this.broadcastParty();
    G.events?.emit('party:changed', {});
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
      G.events?.emit('party:allLoaded', {});
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
    G.events?.emit('party:changed', {});
  }

  private applyReadyResult(ok: boolean, notReady: string[]): void {
    G.events?.emit('party:readyCheck', { active: false });
    if (ok) this.toast('Herkes hazır!', 'success');
    else this.toast(notReady.length ? `Hazır değil: ${notReady.join(', ')}` : 'Hazırlık kontrolü başarısız.', 'warning');
  }

  /* ---------------------------------------------------------------- client side */

  private onWelcome(msg: Extract<CtlMsg, { t: 'welcome' }>, from: string): void {
    const jp = this.joinPending;
    if (!jp) return;
    const party = sanitizeParty(msg.party);
    const slot = Math.round(clampNum(msg.slot, 1, MAX_ROOM_SIZE - 1, 0));
    if (!party || slot < 1 || msg.hostId !== from) return; // ignore bogus welcomes; the timeout still guards the join
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
    this.buffer = [];
    this.nextPing = 0;
    this.peers.clear();
    this.applyParty(party, true);
    // a hidden client tab keeps simulating its own character (hit shapes, pstate keep-alive) instead of freezing for the party
    G.engine?.setBackgroundTick?.(true);
    this.ensureReplication().setActive(true);
    this.emitStatus();
    G.events?.emit('party:changed', {});
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
        G.events?.emit('party:readyCheck', { active: true });
        G.events?.emit('party:changed', {});
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
        this.teardown();
        this.returnToTown();
        return;
      case 'closed':
        this.toast('Lider odayı kapattı. Kasabaya dönülüyor...', 'warning');
        this.teardown();
        this.returnToTown();
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
        peerId: m.id, slot: m.slot, name: m.summary.name, summary: m.summary, ready: m.ready,
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
      this.goScene(this.loadedSceneId === 'dungeon' ? 'dungeon' : 'town', undefined);
    }
    if (!me) this.warnOnce('nome', 'party state without the local peer');
    for (const [id, p] of before) {
      if (id !== this.selfId && !this.peers.has(id)) {
        G.events?.emit('net:peerLeft', { peerId: id, name: p.name });
        if (!initial) G.events?.emit('net:chat', { from: '', text: `${p.name} gruptan ayrıldı.`, channel: 'system' });
      }
    }
    for (const [id, p] of this.peers) {
      if (id !== this.selfId && !before.has(id)) {
        G.events?.emit('net:peerJoined', { peerId: id, name: p.name });
        if (!initial) G.events?.emit('net:chat', { from: '', text: `${p.name} gruba katıldı.`, channel: 'system' });
      }
    }
    G.events?.emit('party:changed', {});
  }

  private onTransportPeerLeft(peerId: string): void {
    if (this.joinPending) return;
    if (this.role === 'client') {
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
        const to = this.remoteMemberIds().filter((id) => id !== from);
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
      if (id) G.events?.emit('net:chat', { from: name, text: id, channel: 'emote' });
      return;
    }
    const text = sanitizeText(p.text, NET.MAX_CHAT_LEN);
    if (!text) return;
    const channel = p.ch === 'say' || p.ch === 'yell' ? p.ch : 'party';
    // WP-13 item links: validated snapshots, display only (a linked item is never added to an inventory)
    const links = sanitizeLinks(p.links);
    G.events?.emit('net:chat', { from: name, text, channel, ...(links.length ? { links } : {}) });
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

  private goScene(scene: SceneId, params: unknown): void {
    this.sceneReadyFlag = false;
    try {
      const p = G.scenes?.go(scene, params);
      if (p) void p.catch((err: unknown) => console.warn(`[net] scene change to "${scene}" failed`, err));
    } catch (err) {
      console.warn(`[net] scene change to "${scene}" failed`, err);
      this.sceneReadyFlag = true;
    }
  }

  /** After a client left/lost the room: re-enter town offline so the Player is recreated with slot 0. */
  private returnToTown(): void {
    const cur = G.scenes?.current?.id;
    if (cur === 'town' || cur === 'dungeon' || (cur === undefined && G.character)) this.goScene('town', undefined);
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
    this.peers.clear();
    this.peers.set(this.selfId, this.makeSelf(0, true));
    G.engine?.setBackgroundTick?.(false);
    if (wasOnline) {
      this.emitStatus();
      G.events?.emit('party:changed', {});
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

  private ensureReplication(): Replication {
    if (!this.replication) this.replication = new Replication(this);
    return this.replication;
  }

  private localSummary(): CharacterSummary {
    try {
      const s = G.character?.summary();
      if (s) return s;
    } catch {
      /* character not ready */
    }
    return { id: 'local', name: 'Maceracı', classId: 'knight', level: 1, itemLevel: 0, rating: 0, variant: 0 };
  }

  private localKeystone(): KeystoneData | null {
    try {
      const k = G.character?.save?.mythic?.keystone;
      return k ? { dungeonId: k.dungeonId, level: k.level, depleted: k.depleted } : null;
    } catch {
      return null;
    }
  }

  private makeSelf(slot: number, isHost: boolean): PeerInfo {
    const summary = this.localSummary();
    return {
      peerId: this.selfId, slot, name: summary.name, summary, ready: false, ping: 0, isHost,
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
