/**
 * Shared lobby plumbing for the room browser ("sunucu listesi") and the host's public announcement.
 *
 * One lobby transport per kind ('trystero' | 'local') is reference counted: browsing and announcing share it
 * (TrysteroTransport refuses to join the same room twice). Everything is async-safe: stopBrowsing()/stopAnnouncing()
 * called while a transport is still opening are honoured as soon as it is open.
 */
import { openLobby, type NetMode } from './index';
import { RoomAnnouncer, RoomBrowser, type AnnouncementInput, type ListedRoom, type LobbyTransport } from './lobby';
import { NET } from './messages';
import type { Unsubscribe } from './transport';

export type NetKind = 'trystero' | 'local';

interface LobbyEntry {
  kind: NetKind;
  tr: LobbyTransport;
  refs: number;
}

export interface LobbyOptions {
  /** Stable peer id for the local transport (same id in lobby and game room). */
  localSelfId?: () => string | undefined;
  latencyMs?: number;
  jitterMs?: number;
}

const toMode = (k: NetKind): Exclude<NetMode, 'offline'> => (k === 'local' ? 'local' : 'p2p');

export class LobbyManager {
  /** Latest sorted room list (valid while browsing). */
  rooms: ListedRoom[] = [];
  /** Called whenever `rooms` changed. */
  onRooms: (() => void) | null = null;
  /** Called when a lobby transport cannot be opened (UI toast). */
  onError: ((message: string) => void) | null = null;

  private readonly entries = new Map<NetKind, LobbyEntry>();
  private readonly opening = new Map<NetKind, Promise<LobbyEntry | null>>();

  private wantBrowse: NetKind | null = null;
  private browser: { kind: NetKind; rb: RoomBrowser; off: Unsubscribe; pingTimer: ReturnType<typeof setInterval> } | null = null;

  private wantAnnounce: { kind: NetKind; input: AnnouncementInput } | null = null;
  private announcer: { kind: NetKind; ann: RoomAnnouncer; roomId: string } | null = null;

  constructor(private readonly opts: LobbyOptions = {}) {}

  get browsing(): boolean {
    return this.wantBrowse !== null;
  }
  get announcing(): boolean {
    return this.wantAnnounce !== null;
  }
  /** Signalling health of the trystero lobby, for the UI ("Sunuculara bağlanılıyor 3/5"). */
  signalStatus(): { open: number; total: number } | null {
    const tr = this.entries.get('trystero')?.tr as (LobbyTransport & { getSignalStatus?: () => { open: number; total: number } }) | undefined;
    return tr?.getSignalStatus?.() ?? null;
  }

  /* ---------------------------------------------------------------- lobby transports */

  private async acquire(kind: NetKind): Promise<LobbyEntry | null> {
    const existing = this.entries.get(kind);
    if (existing) {
      existing.refs++;
      return existing;
    }
    let pending = this.opening.get(kind);
    if (!pending) {
      pending = (async () => {
        try {
          const selfId = kind === 'local' ? this.opts.localSelfId?.() : undefined;
          const tr = await openLobby(toMode(kind), {
            local: { ...(selfId ? { selfId } : {}), latencyMs: this.opts.latencyMs ?? 0, jitterMs: this.opts.jitterMs ?? 0 },
          });
          const entry: LobbyEntry = { kind, tr, refs: 0 };
          this.entries.set(kind, entry);
          return entry;
        } catch (err) {
          console.warn('[net] lobby open failed', err);
          this.onError?.('Eşleştirme sunucularına bağlanılamadı.');
          return null;
        } finally {
          this.opening.delete(kind);
        }
      })();
      this.opening.set(kind, pending);
    }
    const entry = await pending;
    if (entry) entry.refs++;
    return entry;
  }

  private release(kind: NetKind): void {
    const e = this.entries.get(kind);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0) {
      this.entries.delete(kind);
      void e.tr.leave().catch(() => {});
    }
  }

  /* ---------------------------------------------------------------- browsing */

  async startBrowsing(kind: NetKind): Promise<void> {
    if (this.wantBrowse === kind && (this.browser || this.opening.has(kind))) return;
    this.stopBrowsing();
    this.wantBrowse = kind;
    const entry = await this.acquire(kind);
    if (!entry) {
      if (this.wantBrowse === kind) this.wantBrowse = null;
      return;
    }
    if (this.wantBrowse !== kind || this.browser) {
      this.release(kind); // stopBrowsing() (or a newer start) happened while opening
      return;
    }
    const rb = new RoomBrowser(entry.tr, { ttlMs: NET.LOBBY_TTL_MS });
    const off = rb.onChange((rooms) => {
      this.rooms = rooms;
      this.onRooms?.();
    });
    const pingTimer = setInterval(() => void rb.refreshPings(), 5000);
    this.browser = { kind, rb, off, pingTimer };
  }

  stopBrowsing(): void {
    this.wantBrowse = null;
    const b = this.browser;
    if (!b) return;
    this.browser = null;
    clearInterval(b.pingTimer);
    b.off();
    b.rb.dispose();
    this.rooms = [];
    this.release(b.kind);
    this.onRooms?.();
  }

  /* ---------------------------------------------------------------- announcing (host) */

  /** Start announcing, or update the running announcement of the same room. */
  async announce(kind: NetKind, input: AnnouncementInput): Promise<void> {
    this.wantAnnounce = { kind, input };
    const a = this.announcer;
    if (a && a.kind === kind && a.roomId === input.roomId) {
      a.ann.update(input);
      return;
    }
    if (a) this.dropAnnouncer();
    const entry = await this.acquire(kind);
    if (!entry) {
      this.wantAnnounce = null;
      return;
    }
    const want = this.wantAnnounce as { kind: NetKind; input: AnnouncementInput } | null;
    if (!want || want.kind !== kind || want.input.roomId !== input.roomId || this.announcer) {
      this.release(kind); // stopped (or replaced) while opening
      return;
    }
    this.announcer = { kind, ann: new RoomAnnouncer(entry.tr, want.input), roomId: input.roomId };
  }

  stopAnnouncing(): void {
    this.wantAnnounce = null;
    this.dropAnnouncer();
  }

  private dropAnnouncer(): void {
    const a = this.announcer;
    if (!a) return;
    this.announcer = null;
    try {
      a.ann.stop();
    } catch {
      /* lobby already closed */
    }
    this.release(a.kind);
  }

  /* ---------------------------------------------------------------- shared transport (CM14 Pazar) */

  /**
   * Borrow the shared lobby transport for another lobby feature (the Pazar's `shop` / `shopBuy` / `shopSold` channels). It
   * stays open until every borrower called `release()` (reference counted with browsing and announcing). null when it cannot open.
   */
  async lease(kind: NetKind): Promise<{ tr: LobbyTransport; release: () => void } | null> {
    const entry = await this.acquire(kind);
    if (!entry) return null;
    let released = false;
    return {
      tr: entry.tr,
      release: () => {
        if (released) return;
        released = true;
        this.release(kind);
      },
    };
  }

  dispose(): void {
    this.stopBrowsing();
    this.stopAnnouncing();
  }
}
