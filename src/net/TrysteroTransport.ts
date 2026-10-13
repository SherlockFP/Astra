/**
 * Real P2P transport on top of trystero 0.26 (default strategy = Nostr relays for signalling,
 * data flows directly peer-to-peer over one reliable+ordered RTCDataChannel per peer).
 *
 * Verified against node_modules/trystero 0.26.0 + @trystero-p2p/core 0.26.0:
 *   joinRoom(config: JoinRoomConfig, roomId: string, callbacks?: JoinRoomCallbacks) => Room
 *   room.makeAction<T>(namespace, config?) => MessageAction<T> { send, onMessage, onReceive, ... }
 *   send(data, { target?: string | string[] | null }) => Promise<void>   (local send finished)
 *   room.onPeerJoin / onPeerLeave are assignable properties (null clears)
 *   room.ping(id) => Promise<number>, room.leave() => Promise<void>, selfId: string (20 chars)
 * Only the Nostr strategy is installed. `trystero/torrent|mqtt|...` subpaths THROW on import in
 * 0.26; other strategies require installing `@trystero-p2p/<name>` (see docs/NETCODE.md).
 */
import {
  getRelaySockets,
  joinRoom,
  selfId as trysteroSelfId,
  type DataPayload,
  type JoinError,
  type JoinRoomConfig,
  type MessageAction,
  type Room,
  type TurnServerConfig,
} from 'trystero';
import {
  assertChannelName,
  BaseTransport,
  type ChannelMap,
  type PeerId,
  type TransportConfig,
} from './transport';

export interface TrysteroTransportConfig extends TransportConfig {
  /** Custom Nostr relay URLs (wss://). Default: trystero picks 5 of its built-in relays. */
  relayUrls?: string[];
  /** How many default relays to use (ignored when relayUrls is set). trystero default 5. */
  relayRedundancy?: number;
  /** TURN servers, added on top of trystero's default STUN servers. */
  turnServers?: TurnServerConfig[];
  /** Full RTCConfiguration override (replaces default STUN list). */
  rtcConfig?: RTCConfiguration;
  /** Max inbound payload budget. We never send big files, so keep it small. Default 2 MiB. */
  maxReceiveBytes?: number;
  /** Passive peers do not announce while dormant (see docs: NOT used for the lobby). */
  passive?: boolean;
  /** Suppress trystero console warnings about relay failures. Default true. */
  quietRelayWarnings?: boolean;
  /** Pending-peer handshake timeout (password check). Default 15000 ms. */
  handshakeTimeoutMs?: number;
}

const openRooms = new Set<string>();

function normalizeIncoming(data: DataPayload): unknown {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data) && !(data instanceof Uint8Array)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) return undefined; // never used by us
  return data; // JSON value or Uint8Array (0.26 delivers binary as Uint8Array)
}

export class TrysteroTransport<M extends ChannelMap> extends BaseTransport<M> {
  readonly kind = 'trystero' as const;
  private readonly room: Room;
  private readonly roomKey: string;
  private readonly actions = new Map<string, MessageAction<DataPayload>>();

  constructor(cfg: TrysteroTransportConfig) {
    super(trysteroSelfId, cfg.roomId);
    this.roomKey = `${cfg.appId}/${cfg.roomId}`;
    // joinRoom() is idempotent per (appId, roomId): a second transport would steal the handlers.
    if (openRooms.has(this.roomKey)) {
      throw new Error(`[net] already joined room ${this.roomKey}; leave() the old transport first`);
    }
    openRooms.add(this.roomKey);

    const relayConfig: NonNullable<JoinRoomConfig['relayConfig']> = {
      warnOnRelayFailure: cfg.quietRelayWarnings === false,
    };
    if (cfg.relayUrls?.length) relayConfig.urls = cfg.relayUrls;
    if (cfg.relayRedundancy !== undefined) relayConfig.redundancy = cfg.relayRedundancy;

    const config: JoinRoomConfig = {
      appId: cfg.appId,
      maxReceiveBytes: cfg.maxReceiveBytes ?? 2 * 1024 * 1024,
      relayConfig,
    };
    if (cfg.password) config.password = cfg.password;
    if (cfg.passive) config.passive = true;
    if (cfg.turnServers?.length) config.turnConfig = cfg.turnServers;
    if (cfg.rtcConfig) config.rtcConfig = cfg.rtcConfig;

    this.room = joinRoom(config, cfg.roomId, {
      onJoinError: (details) => this.handleJoinError(details),
      handshakeTimeoutMs: cfg.handshakeTimeoutMs ?? 15000,
    });

    // Register actions before any peer can connect so no early message is dropped.
    for (const ch of cfg.channels ?? []) this.channelUsed(ch);

    this.room.onPeerJoin = (peer) => this.peerJoined(peer);
    this.room.onPeerLeave = (peer) => this.peerLeft(peer);
    this._state = 'open';
  }

  /** Signalling health for the UI ("Sunuculara baglaniliyor 3/5"). */
  getSignalStatus(): { open: number; total: number } {
    let open = 0;
    let total = 0;
    try {
      const sockets = getRelaySockets() as Record<string, WebSocket> | undefined;
      for (const ws of Object.values(sockets ?? {})) {
        total++;
        if (ws.readyState === 1) open++;
      }
    } catch {
      /* not available */
    }
    return { open, total };
  }

  ping(peer: PeerId): Promise<number> {
    if (peer === this.selfId) return Promise.resolve(0);
    return this.room.ping(peer);
  }

  async leave(): Promise<void> {
    if (this._state === 'closed') return;
    this.room.onPeerJoin = null;
    this.room.onPeerLeave = null;
    for (const a of this.actions.values()) a.onMessage = null;
    this.closeBase();
    openRooms.delete(this.roomKey);
    try {
      await this.room.leave();
    } catch (err) {
      console.warn('[net] trystero leave failed', err);
    }
  }

  protected channelUsed(channel: string): void {
    if (this.actions.has(channel)) return;
    assertChannelName(channel);
    const action = this.room.makeAction<DataPayload>(channel);
    action.onMessage = (data, ctx) => {
      const payload = normalizeIncoming(data);
      if (payload === undefined) return;
      this.deliver(channel, payload, ctx.peerId);
    };
    this.actions.set(channel, action);
  }

  protected sendRemote(channel: string, data: unknown, targets: PeerId[] | null): void {
    const action = this.actions.get(channel);
    if (!action) return;
    const opts = targets ? { target: targets } : undefined;
    action.send(data as DataPayload, opts).catch((err: unknown) => {
      if (this._state === 'closed') return;
      this.emitError({
        code: 'send_failed',
        message: `send on "${channel}" failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    });
  }

  private handleJoinError(details: JoinError): void {
    const badPassword = /password/i.test(details.error);
    this.emitError({
      code: badPassword ? 'bad_password' : 'join_failed',
      message: details.error,
      peerId: details.peerId,
    });
  }
}
