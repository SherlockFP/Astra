/**
 * Serverless room browser on a shared lobby room (LOBBY_ROOM_ID).
 *
 *   Host:    RoomAnnouncer  - re-announces every 4 s, immediately to each newly joined lobby peer
 *                             and on every change; sends 'unann' when the room closes / fills up.
 *   Browser: RoomBrowser    - keeps one entry per announcing peer, drops entries on TTL expiry
 *                             (12 s), on 'unann' and when the peer leaves the lobby.
 *
 * The sender id comes from the transport (MessageMeta.from), never from the payload, so a peer
 * cannot list rooms on behalf of someone else. Payloads are sanitised (sanitizeAnnouncement).
 * Both classes only use the transport; they never leave it (the owner decides when to leave).
 */
import type { NetTransport, PeerId, Unsubscribe } from './transport';
import {
  GAME_VERSION,
  NET,
  PROTOCOL_VERSION,
  sanitizeAnnouncement,
  type LobbyChannels,
  type RoomAnnouncement,
} from './messages';

export type LobbyTransport = NetTransport<LobbyChannels>;

/** Fields the host fills in; protocol fields are added by the announcer. */
export type AnnouncementInput = Omit<RoomAnnouncement, 't' | 'proto' | 'gameVersion' | 'rev'>;

export class RoomAnnouncer {
  private ann: RoomAnnouncement;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly unsubs: Unsubscribe[] = [];

  constructor(
    private readonly lobby: LobbyTransport,
    input: AnnouncementInput,
    private readonly intervalMs: number = NET.LOBBY_ANNOUNCE_INTERVAL_MS,
  ) {
    this.ann = { ...input, t: 'ann', proto: PROTOCOL_VERSION, gameVersion: GAME_VERSION, rev: 1 };
    // Replayed for peers already present, then for every newcomer: they see us within one RTT.
    this.unsubs.push(lobby.onPeerJoin((peer) => this.lobby.send('ann', this.ann, { to: peer })));
    this.timer = setInterval(() => this.broadcast(), intervalMs);
    this.broadcast();
  }

  get current(): RoomAnnouncement {
    return this.ann;
  }

  /** Merge changes (player count, key level, inProgress ...) and announce immediately. */
  update(patch: Partial<AnnouncementInput>): void {
    this.ann = { ...this.ann, ...patch, rev: this.ann.rev + 1 };
    this.broadcast();
  }

  /** Stop announcing and tell browsers to drop the room. Safe to call twice. */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    for (const u of this.unsubs.splice(0)) u();
    this.lobby.send('unann', { t: 'unann', roomId: this.ann.roomId });
  }

  private broadcast(): void {
    if (this.lobby.state !== 'open') return;
    this.lobby.send('ann', this.ann);
  }
}

export interface ListedRoom {
  ann: RoomAnnouncement;
  hostPeerId: PeerId;
  /** performance.now() of the last announcement (local clock; host clocks are not trusted). */
  lastSeen: number;
  firstSeen: number;
  /** Same protocol + game version. */
  compatible: boolean;
  /** compatible && not in progress && not full. */
  joinable: boolean;
  /** Lobby RTT to the host if measured (refreshPings). */
  pingMs: number | null;
}

export interface RoomBrowserOptions {
  ttlMs?: number;
  /** Hard cap on listed rooms (spam protection). */
  maxRooms?: number;
}

export class RoomBrowser {
  private readonly rooms = new Map<PeerId, ListedRoom>();
  private readonly listeners = new Set<(rooms: ListedRoom[]) => void>();
  private readonly unsubs: Unsubscribe[] = [];
  private readonly sweepTimer: ReturnType<typeof setInterval>;
  private readonly ttlMs: number;
  private readonly maxRooms: number;
  private changed = false;

  constructor(private readonly lobby: LobbyTransport, opts: RoomBrowserOptions = {}) {
    this.ttlMs = opts.ttlMs ?? NET.LOBBY_TTL_MS;
    this.maxRooms = opts.maxRooms ?? 200;
    this.unsubs.push(
      lobby.on('ann', (data, meta) => this.onAnnounce(data, meta.from)),
      lobby.on('unann', (data, meta) => {
        const entry = this.rooms.get(meta.from);
        if (entry && typeof data === 'object' && data !== null && data.roomId === entry.ann.roomId) this.remove(meta.from);
      }),
      lobby.onPeerLeave((peer) => this.remove(peer)),
    );
    this.sweepTimer = setInterval(() => this.sweep(), 1000);
  }

  /** Sorted: joinable first, then higher key level, then fuller rooms, then newest. */
  list(): ListedRoom[] {
    return [...this.rooms.values()].sort(
      (a, b) =>
        Number(b.joinable) - Number(a.joinable) ||
        Number(b.compatible) - Number(a.compatible) ||
        b.ann.keyLevel - a.ann.keyLevel ||
        b.ann.players - a.ann.players ||
        b.firstSeen - a.firstSeen,
    );
  }

  get(roomId: string): ListedRoom | undefined {
    for (const r of this.rooms.values()) if (r.ann.roomId === roomId) return r;
    return undefined;
  }

  /** Called with the full sorted list whenever it changes (coalesced to <= 1 call per sweep). */
  onChange(cb: (rooms: ListedRoom[]) => void): Unsubscribe {
    this.listeners.add(cb);
    cb(this.list());
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Measure lobby RTT to every listed host (for the "Gecikme" column). */
  async refreshPings(): Promise<void> {
    await Promise.all(
      [...this.rooms.values()].map(async (r) => {
        try {
          r.pingMs = Math.round(await this.lobby.ping(r.hostPeerId));
          this.changed = true;
        } catch {
          /* peer gone */
        }
      }),
    );
    this.flush();
  }

  dispose(): void {
    clearInterval(this.sweepTimer);
    for (const u of this.unsubs.splice(0)) u();
    this.listeners.clear();
    this.rooms.clear();
  }

  private onAnnounce(data: unknown, from: PeerId): void {
    const ann = sanitizeAnnouncement(data);
    if (!ann) return;
    const now = performance.now();
    const prev = this.rooms.get(from);
    if (!prev && this.rooms.size >= this.maxRooms) return;
    if (prev && prev.ann.roomId === ann.roomId && ann.rev < prev.ann.rev) return; // stale
    // A room id is owned by the first peer that announced it (no listing hijack).
    for (const [peer, r] of this.rooms) {
      if (peer !== from && r.ann.roomId === ann.roomId) return;
    }
    const compatible = ann.proto === PROTOCOL_VERSION && ann.gameVersion === GAME_VERSION;
    this.rooms.set(from, {
      ann,
      hostPeerId: from,
      lastSeen: now,
      firstSeen: prev && prev.ann.roomId === ann.roomId ? prev.firstSeen : now,
      compatible,
      joinable: compatible && !ann.inProgress && ann.players < ann.maxPlayers,
      pingMs: prev?.pingMs ?? null,
    });
    if (!prev || prev.ann.rev !== ann.rev || prev.ann.roomId !== ann.roomId) {
      this.changed = true;
      this.flush();
    }
  }

  private remove(peer: PeerId): void {
    if (this.rooms.delete(peer)) {
      this.changed = true;
      this.flush();
    }
  }

  private sweep(): void {
    const now = performance.now();
    for (const [peer, r] of this.rooms) {
      if (now - r.lastSeen > this.ttlMs) {
        this.rooms.delete(peer);
        this.changed = true;
      }
    }
    this.flush();
  }

  private flush(): void {
    if (!this.changed) return;
    this.changed = false;
    const list = this.list();
    for (const cb of [...this.listeners]) {
      try {
        cb(list);
      } catch (err) {
        console.error('[net] room list listener error', err);
      }
    }
  }
}
