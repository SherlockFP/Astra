/**
 * BroadcastChannel transport: two (or more) tabs / windows of the same browser + origin form a
 * room without any network. Used for offline multiplayer testing (`?net=local`) and automated
 * tests (two LocalTransport instances in the same page also see each other).
 *
 * Emulates the trystero semantics the game relies on:
 *   - presence: hello/here handshake, heartbeats, timeout and explicit bye -> onPeerJoin/Leave
 *   - reliable + ordered per sender, even with simulated latency/jitter
 *   - JSON round-trip of non-binary payloads (strictJson) so non-serialisable data is caught in
 *     local tests instead of in real P2P sessions
 *   - password: peers with a different password ignore each other
 *
 * Keep test tabs VISIBLE (separate windows side by side): hidden tabs throttle timers and stop
 * requestAnimationFrame, which would freeze a hidden host.
 */
import {
  BaseTransport,
  randomId,
  type ChannelMap,
  type PeerId,
  type TransportConfig,
} from './transport';

export interface LocalTransportConfig extends TransportConfig {
  /** Override the generated peer id (tests). */
  selfId?: PeerId;
  /** Simulated one-way latency in ms. Default 0. */
  latencyMs?: number;
  /** Extra random one-way delay 0..jitterMs. Order is still preserved. Default 0. */
  jitterMs?: number;
  /** Heartbeat interval. Default 1000 ms. */
  heartbeatMs?: number;
  /** Peer is considered gone after this long without any frame. Default 6000 ms. */
  peerTimeoutMs?: number;
  /** JSON round-trip non-binary payloads like trystero does. Default true. */
  strictJson?: boolean;
}

type PresenceKind = 'hi' | 'here' | 'hb' | 'bye';

interface FrameBase {
  v: 1;
  from: PeerId;
  /** Password fingerprint; frames with a different value are ignored. */
  pw: string;
}
interface PresenceFrame extends FrameBase {
  k: PresenceKind;
  to?: PeerId[];
}
interface DataFrame extends FrameBase {
  k: 'msg';
  to: PeerId[] | null;
  ch: string;
  d: unknown;
}
interface PingFrame extends FrameBase {
  k: 'ping' | 'pong';
  to: PeerId[];
  n: number;
}
type Frame = PresenceFrame | DataFrame | PingFrame;

const FRAME_KINDS = new Set(['hi', 'here', 'hb', 'bye', 'msg', 'ping', 'pong']);

/** FNV-1a 32 bit. Not cryptographic: only keeps differently-passworded local rooms apart. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function isFrame(x: unknown): x is Frame {
  if (typeof x !== 'object' || x === null) return false;
  const f = x as Record<string, unknown>;
  return f.v === 1 && typeof f.from === 'string' && typeof f.pw === 'string' && typeof f.k === 'string' && FRAME_KINDS.has(f.k);
}

export class LocalTransport<M extends ChannelMap> extends BaseTransport<M> {
  readonly kind = 'local' as const;

  private readonly bc: BroadcastChannel;
  private readonly pw: string;
  private readonly latencyMs: number;
  private readonly jitterMs: number;
  private readonly peerTimeoutMs: number;
  private readonly strictJson: boolean;
  private readonly lastSeen = new Map<PeerId, number>();
  /** Per-sender FIFO of delayed frames, drained by one timer per sender (keeps order exact). */
  private readonly inbox = new Map<PeerId, { at: number; frame: Frame }[]>();
  private readonly inboxTimers = new Map<PeerId, ReturnType<typeof setTimeout>>();
  private readonly pendingPings = new Map<number, { resolve: (ms: number) => void; t0: number; timer: ReturnType<typeof setTimeout> }>();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly onPageHide = () => this.post({ v: 1, k: 'bye', from: this.selfId, pw: this.pw });
  private pingCounter = 0;

  constructor(cfg: LocalTransportConfig) {
    super(cfg.selfId ?? `L${randomId(15)}`, cfg.roomId);
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('[net] BroadcastChannel is not available in this browser');
    }
    this.pw = fingerprint(cfg.password ?? '');
    this.latencyMs = Math.max(0, cfg.latencyMs ?? 0);
    this.jitterMs = Math.max(0, cfg.jitterMs ?? 0);
    this.peerTimeoutMs = cfg.peerTimeoutMs ?? 6000;
    this.strictJson = cfg.strictJson ?? true;

    this.bc = new BroadcastChannel(`efsun-local/${cfg.appId}/${cfg.roomId}`);
    this.bc.onmessage = (ev: MessageEvent) => this.receive(ev.data);
    this.bc.onmessageerror = () => this.emitError({ code: 'bad_payload', message: 'BroadcastChannel message could not be deserialised' });

    this.heartbeat = setInterval(() => this.tickHeartbeat(), cfg.heartbeatMs ?? 1000);
    globalThis.addEventListener?.('pagehide', this.onPageHide);

    this._state = 'open';
    this.post({ v: 1, k: 'hi', from: this.selfId, pw: this.pw });
  }

  ping(peer: PeerId): Promise<number> {
    if (peer === this.selfId) return Promise.resolve(0);
    if (!this.peerSet.has(peer) || this._state === 'closed') return Promise.reject(new Error('unknown peer'));
    const n = ++this.pingCounter;
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(n);
        reject(new Error('ping timeout'));
      }, 5000);
      this.pendingPings.set(n, { resolve, t0: performance.now(), timer });
      this.post({ v: 1, k: 'ping', from: this.selfId, pw: this.pw, to: [peer], n });
    });
  }

  async leave(): Promise<void> {
    if (this._state === 'closed') return;
    this.post({ v: 1, k: 'bye', from: this.selfId, pw: this.pw });
    clearInterval(this.heartbeat);
    for (const t of this.inboxTimers.values()) clearTimeout(t);
    this.inboxTimers.clear();
    this.inbox.clear();
    for (const p of this.pendingPings.values()) clearTimeout(p.timer);
    this.pendingPings.clear();
    globalThis.removeEventListener?.('pagehide', this.onPageHide);
    this.closeBase();
    this.bc.close();
  }

  protected sendRemote(channel: string, data: unknown, targets: PeerId[] | null): void {
    let d: unknown = data;
    if (this.strictJson && !(data instanceof Uint8Array)) {
      try {
        d = JSON.parse(JSON.stringify(data));
      } catch (err) {
        this.emitError({ code: 'bad_payload', message: `payload on "${channel}" is not JSON-serialisable: ${String(err)}` });
        return;
      }
    }
    this.post({ v: 1, k: 'msg', from: this.selfId, pw: this.pw, to: targets, ch: channel, d });
  }

  private post(frame: Frame): void {
    try {
      this.bc.postMessage(frame);
    } catch (err) {
      this.emitError({ code: 'send_failed', message: String(err) });
    }
  }

  private tickHeartbeat(): void {
    if (this._state === 'closed') return;
    this.post({ v: 1, k: 'hb', from: this.selfId, pw: this.pw });
    const now = performance.now();
    for (const [id, seen] of this.lastSeen) {
      if (now - seen > this.peerTimeoutMs) {
        this.lastSeen.delete(id);
        this.dropInbox(id);
        this.peerLeft(id);
      }
    }
  }

  private receive(raw: unknown): void {
    if (this._state === 'closed' || !isFrame(raw)) return;
    if (raw.from === this.selfId || raw.pw !== this.pw) return;
    this.lastSeen.set(raw.from, performance.now());
    if (this.latencyMs === 0 && this.jitterMs === 0) {
      this.process(raw);
      return;
    }
    // Simulated delay. Frames of one sender go through a FIFO with monotonic due times and are
    // drained by a single timer, so order is exact (like trystero's reliable ordered channel).
    const queue = this.inbox.get(raw.from) ?? [];
    const prevAt = queue.length ? queue[queue.length - 1].at : 0;
    queue.push({ at: Math.max(performance.now() + this.latencyMs + Math.random() * this.jitterMs, prevAt), frame: raw });
    this.inbox.set(raw.from, queue);
    this.scheduleDrain(raw.from);
  }

  private scheduleDrain(from: PeerId): void {
    if (this.inboxTimers.has(from)) return;
    const queue = this.inbox.get(from);
    if (!queue || queue.length === 0) return;
    const delay = Math.max(0, queue[0].at - performance.now());
    this.inboxTimers.set(
      from,
      setTimeout(() => {
        this.inboxTimers.delete(from);
        const q = this.inbox.get(from);
        if (!q) return;
        const now = performance.now() + 1; // timers are ms-granular
        while (q.length > 0 && q[0].at <= now && this._state !== 'closed') this.process(q.shift()!.frame);
        if (q.length === 0) this.inbox.delete(from);
        else this.scheduleDrain(from);
      }, delay),
    );
  }

  private dropInbox(from: PeerId): void {
    const t = this.inboxTimers.get(from);
    if (t !== undefined) clearTimeout(t);
    this.inboxTimers.delete(from);
    this.inbox.delete(from);
  }

  private process(f: Frame): void {
    if (this._state === 'closed') return;
    const addressedToMe = !f.to || f.to.includes(this.selfId);
    switch (f.k) {
      case 'hi':
        this.post({ v: 1, k: 'here', from: this.selfId, pw: this.pw, to: [f.from] });
        this.peerJoined(f.from);
        return;
      case 'here':
        if (addressedToMe) this.peerJoined(f.from);
        return;
      case 'hb':
        if (!this.peerSet.has(f.from)) {
          // We missed their hello (e.g. our tab opened later or was suspended): introduce ourselves.
          this.post({ v: 1, k: 'here', from: this.selfId, pw: this.pw, to: [f.from] });
          this.peerJoined(f.from);
        }
        return;
      case 'bye':
        this.lastSeen.delete(f.from);
        this.peerLeft(f.from);
        return;
      case 'ping':
        if (addressedToMe) this.post({ v: 1, k: 'pong', from: this.selfId, pw: this.pw, to: [f.from], n: f.n });
        return;
      case 'pong': {
        if (!addressedToMe) return;
        const p = this.pendingPings.get(f.n);
        if (p) {
          clearTimeout(p.timer);
          this.pendingPings.delete(f.n);
          p.resolve(performance.now() - p.t0);
        }
        return;
      }
      case 'msg':
        if (!addressedToMe) return;
        if (!this.peerSet.has(f.from)) this.peerJoined(f.from);
        if (typeof f.ch !== 'string') return;
        this.deliver(f.ch, f.d, f.from);
        return;
    }
  }
}
