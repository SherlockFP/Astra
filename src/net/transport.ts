/**
 * EFSUN ONLINE - network transport abstraction.
 *
 * Framework-agnostic (no three.js, no DOM rendering). Every multiplayer feature talks to a
 * `NetTransport`, never to trystero / BroadcastChannel directly, so that the exact same game code
 * runs in three modes:
 *
 *   - TrysteroTransport  real P2P over WebRTC (Nostr signalling, trystero 0.26)
 *   - LocalTransport     BroadcastChannel between tabs of the same browser (offline MP testing)
 *   - OfflineTransport   single player: the local player is the host with zero peers
 *
 * Semantics shared by all implementations (see docs/NETCODE.md section 7):
 *   - Messages are sent on named channels. A channel maps to one payload type (ChannelMap).
 *   - Payloads are either JSON-serialisable plain data or a Uint8Array (binary). Never send class
 *     instances (THREE.Vector3, Map, Set) or typed arrays nested inside JSON objects.
 *   - Delivery is reliable and ordered per sender (trystero uses one reliable, ordered
 *     RTCDataChannel; LocalTransport preserves order even with simulated jitter).
 *   - `send()` without `to` goes to every remote peer. `includeSelf` (or listing selfId in `to`)
 *     additionally loops the message back to the local handlers on a microtask. This lets the
 *     host's own player use the same client code path as remote players.
 *   - Received data must be treated as immutable and UNTRUSTED (validate before use).
 */

export type PeerId = string;
export type Unsubscribe = () => void;

export type JsonPrimitive = null | string | number | boolean;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Map of channel name -> payload type. Channel names must be 1..32 UTF-8 bytes (trystero limit). */
export type ChannelMap = Record<string, unknown>;
export type ChannelKey<M extends ChannelMap> = Extract<keyof M, string>;

export type TransportKind = 'trystero' | 'local' | 'offline';
export type TransportState = 'connecting' | 'open' | 'closed';

export interface SendOptions {
  /** Target peer(s). Omitted = all remote peers. May contain selfId (= loopback). */
  to?: PeerId | readonly PeerId[];
  /** Also deliver to the local handlers (loopback). Default false. */
  includeSelf?: boolean;
}

export interface MessageMeta {
  /** Sender peer id (selfId for loopback). Set by the transport, never by the payload. */
  from: PeerId;
  channel: string;
  /** performance.now() at local delivery. */
  receivedAt: number;
  loopback: boolean;
}

export type MessageHandler<T> = (data: T, meta: MessageMeta) => void;
export type PeerHandler = (peer: PeerId) => void;

export type NetErrorCode =
  | 'bad_password' // trystero: "incorrect password for overlapping room"
  | 'join_failed' // handshake timeout / WebRTC could not connect (TURN needed)
  | 'send_failed'
  | 'payload_too_large'
  | 'bad_payload'
  | 'unsupported';

export interface NetError {
  code: NetErrorCode;
  message: string;
  peerId?: PeerId;
}
export type ErrorHandler = (error: NetError) => void;

export interface ChannelStats {
  sentMsgs: number;
  sentBytes: number;
  recvMsgs: number;
  recvBytes: number;
}

export interface NetStats extends ChannelStats {
  byChannel: Record<string, ChannelStats>;
  /** performance.now() when the transport was created (for rate computation). */
  since: number;
}

export interface NetTransport<M extends ChannelMap> {
  readonly kind: TransportKind;
  readonly selfId: PeerId;
  readonly roomId: string;
  readonly state: TransportState;

  /** Currently connected remote peers (never includes selfId). */
  getPeers(): PeerId[];
  hasPeer(peer: PeerId): boolean;

  send<K extends ChannelKey<M>>(channel: K, data: M[K], opts?: SendOptions): void;
  on<K extends ChannelKey<M>>(channel: K, handler: MessageHandler<M[K]>): Unsubscribe;

  /** Called for each peer that joins. A newly registered handler is replayed the current peers. */
  onPeerJoin(handler: PeerHandler): Unsubscribe;
  onPeerLeave(handler: PeerHandler): Unsubscribe;
  onError(handler: ErrorHandler): Unsubscribe;

  /** Round-trip time in ms to a peer (0 for selfId / offline). */
  ping(peer: PeerId): Promise<number>;
  getStats(): NetStats;
  /** Leave the room. All handlers are dropped; the instance cannot be reused. */
  leave(): Promise<void>;
}

/** Options common to every transport implementation. */
export interface TransportConfig {
  /** Application namespace (NET_APP_ID). Different appIds never see each other. */
  appId: string;
  roomId: string;
  /** Shared room secret. Peers with a different password never connect. */
  password?: string;
  /** Channels to register eagerly (recommended: the full channel list of the ChannelMap). */
  channels?: readonly string[];
}

/**
 * trystero frames are 16384 bytes; an inline action frame has a 36 byte header. Payloads larger
 * than this are sent with an offer/accept/chunk protocol (extra round trip), so keep every
 * real-time message (snapshots, event batches) below it.
 */
export const MAX_INLINE_PAYLOAD_BYTES = 16384 - 36;
export const MAX_CHANNEL_NAME_BYTES = 32;

const textEncoder = new TextEncoder();

export function channelNameBytes(name: string): number {
  return textEncoder.encode(name).length;
}

export function assertChannelName(name: string): void {
  const n = channelNameBytes(name);
  if (n < 1 || n > MAX_CHANNEL_NAME_BYTES || name.includes('\0') || name.startsWith('@_')) {
    throw new Error(`[net] invalid channel name "${name}" (1-32 UTF-8 bytes, no "@_" prefix)`);
  }
}

/** Approximate wire size of a payload (UTF-16 length for JSON is close enough for stats). */
export function approxPayloadBytes(data: unknown): number {
  if (data instanceof Uint8Array) return data.byteLength;
  if (typeof data === 'string') return data.length;
  try {
    return JSON.stringify(data)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Random id from [0-9A-Za-z] (same alphabet as trystero's selfId). */
export function randomId(length = 20): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function emptyChannelStats(): ChannelStats {
  return { sentMsgs: 0, sentBytes: 0, recvMsgs: 0, recvBytes: 0 };
}

function clonePayload<T>(data: T): T {
  if (data instanceof Uint8Array) return data.slice() as unknown as T;
  return structuredClone(data);
}

/**
 * Shared plumbing: handler registries, loopback, target resolution, stats, safe dispatch.
 * Subclasses implement `sendRemote`, `ping` and `leave`, and call `peerJoined`, `peerLeft`,
 * `deliver` and `emitError`.
 */
export abstract class BaseTransport<M extends ChannelMap> implements NetTransport<M> {
  abstract readonly kind: TransportKind;
  readonly selfId: PeerId;
  readonly roomId: string;

  protected _state: TransportState = 'connecting';
  protected readonly peerSet = new Set<PeerId>();

  private readonly handlers = new Map<string, Set<MessageHandler<any>>>();
  private readonly joinHandlers = new Set<PeerHandler>();
  private readonly leaveHandlers = new Set<PeerHandler>();
  private readonly errorHandlers = new Set<ErrorHandler>();
  private readonly oversizeWarned = new Set<string>();
  private readonly stats: NetStats;

  protected constructor(selfId: PeerId, roomId: string) {
    this.selfId = selfId;
    this.roomId = roomId;
    this.stats = { ...emptyChannelStats(), byChannel: {}, since: performance.now() };
  }

  get state(): TransportState {
    return this._state;
  }

  getPeers(): PeerId[] {
    return [...this.peerSet];
  }

  hasPeer(peer: PeerId): boolean {
    return this.peerSet.has(peer);
  }

  send<K extends ChannelKey<M>>(channel: K, data: M[K], opts?: SendOptions): void {
    if (this._state === 'closed') return;
    if (data === undefined) {
      this.emitError({ code: 'bad_payload', message: `undefined payload on "${channel}"` });
      return;
    }
    let toSelf = opts?.includeSelf === true;
    let remote: PeerId[] | null;
    if (opts?.to === undefined) {
      remote = null; // broadcast to all remote peers
    } else {
      const list: readonly PeerId[] = typeof opts.to === 'string' ? [opts.to] : opts.to;
      remote = [];
      for (const id of list) {
        if (id === this.selfId) toSelf = true;
        else if (this.peerSet.has(id) && !remote.includes(id)) remote.push(id);
      }
    }

    const hasRemote = remote === null ? this.peerSet.size > 0 : remote.length > 0;
    if (hasRemote) {
      const bytes = approxPayloadBytes(data);
      if (bytes > MAX_INLINE_PAYLOAD_BYTES && !this.oversizeWarned.has(channel)) {
        this.oversizeWarned.add(channel);
        const msg = `payload on "${channel}" is ${bytes} B (> ${MAX_INLINE_PAYLOAD_BYTES} B inline frame); it will be chunked`;
        console.warn(`[net] ${msg}`);
        this.emitError({ code: 'payload_too_large', message: msg });
      }
      const fanout = remote === null ? this.peerSet.size : remote.length;
      this.countSent(channel, bytes * fanout, fanout);
      this.channelUsed(channel);
      this.sendRemote(channel, data, remote);
    }
    if (toSelf) {
      const copy = clonePayload(data);
      queueMicrotask(() => this.deliver(channel, copy, this.selfId, true));
    }
  }

  on<K extends ChannelKey<M>>(channel: K, handler: MessageHandler<M[K]>): Unsubscribe {
    assertChannelName(channel);
    this.channelUsed(channel);
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler as MessageHandler<any>);
    return () => {
      set?.delete(handler as MessageHandler<any>);
    };
  }

  onPeerJoin(handler: PeerHandler): Unsubscribe {
    this.joinHandlers.add(handler);
    const existing = [...this.peerSet];
    if (existing.length) {
      queueMicrotask(() => {
        if (!this.joinHandlers.has(handler)) return;
        for (const id of existing) if (this.peerSet.has(id)) this.safeCall(() => handler(id));
      });
    }
    return () => {
      this.joinHandlers.delete(handler);
    };
  }

  onPeerLeave(handler: PeerHandler): Unsubscribe {
    this.leaveHandlers.add(handler);
    return () => {
      this.leaveHandlers.delete(handler);
    };
  }

  onError(handler: ErrorHandler): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  getStats(): NetStats {
    const byChannel: Record<string, ChannelStats> = {};
    for (const [k, v] of Object.entries(this.stats.byChannel)) byChannel[k] = { ...v };
    return { ...this.stats, byChannel };
  }

  abstract ping(peer: PeerId): Promise<number>;
  abstract leave(): Promise<void>;

  /** Send to remote peers. `targets === null` means every connected remote peer. */
  protected abstract sendRemote(channel: string, data: unknown, targets: PeerId[] | null): void;

  /** Hook: a channel is about to be used (TrysteroTransport registers its action here). */
  protected channelUsed(_channel: string): void {}

  protected peerJoined(peer: PeerId): void {
    if (this._state === 'closed' || peer === this.selfId || this.peerSet.has(peer)) return;
    this.peerSet.add(peer);
    for (const h of [...this.joinHandlers]) this.safeCall(() => h(peer));
  }

  protected peerLeft(peer: PeerId): void {
    if (!this.peerSet.delete(peer)) return;
    for (const h of [...this.leaveHandlers]) this.safeCall(() => h(peer));
  }

  protected deliver(channel: string, data: unknown, from: PeerId, loopback = false): void {
    if (this._state === 'closed') return;
    if (!loopback && from === this.selfId) return;
    if (!loopback) this.countRecv(channel, approxPayloadBytes(data));
    const set = this.handlers.get(channel);
    if (!set || set.size === 0) return;
    const meta: MessageMeta = { from, channel, receivedAt: performance.now(), loopback };
    for (const h of [...set]) this.safeCall(() => h(data, meta));
  }

  protected emitError(error: NetError): void {
    if (this.errorHandlers.size === 0) {
      console.warn(`[net] ${error.code}: ${error.message}`);
      return;
    }
    for (const h of [...this.errorHandlers]) this.safeCall(() => h(error));
  }

  /** Call from subclass `leave()`: emits leave for all peers, then drops every handler. */
  protected closeBase(): void {
    if (this._state === 'closed') return;
    for (const id of [...this.peerSet]) this.peerLeft(id);
    this._state = 'closed';
    this.handlers.clear();
    this.joinHandlers.clear();
    this.leaveHandlers.clear();
    this.errorHandlers.clear();
  }

  private safeCall(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('[net] handler error:', err);
    }
  }

  private countSent(channel: string, bytes: number, msgs: number): void {
    const c = (this.stats.byChannel[channel] ??= emptyChannelStats());
    c.sentMsgs += msgs;
    c.sentBytes += bytes;
    this.stats.sentMsgs += msgs;
    this.stats.sentBytes += bytes;
  }

  private countRecv(channel: string, bytes: number): void {
    const c = (this.stats.byChannel[channel] ??= emptyChannelStats());
    c.recvMsgs += 1;
    c.recvBytes += bytes;
    this.stats.recvMsgs += 1;
    this.stats.recvBytes += bytes;
  }
}

/**
 * Single-player transport. The local player is the host and there are never any peers, so the
 * host/client code path is identical to multiplayer: client code sends to `hostId === selfId`,
 * which loops back.
 */
export class OfflineTransport<M extends ChannelMap> extends BaseTransport<M> {
  readonly kind = 'offline' as const;

  constructor(roomId = 'offline', selfId: PeerId = `offline-${randomId(8)}`) {
    super(selfId, roomId);
    this._state = 'open';
  }

  ping(_peer: PeerId): Promise<number> {
    return Promise.resolve(0);
  }

  async leave(): Promise<void> {
    this.closeBase();
  }

  protected sendRemote(): void {
    /* no peers */
  }
}
