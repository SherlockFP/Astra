import type { ClassId } from '../../types/common';
import type { RoleId, SpecId } from '../../types/v2';
import type {
  ArenaBracket, MatchAck, MatchProposal, QueueAnnounce, QueueCancel, QueueEnterOpts, QueueKey, QueueNotice, QueueState,
} from '../../types/finder';
import { NET, sanitizeMatchAck, sanitizeMatchProposal, sanitizeQueueAnnounce, sanitizeQueueCancel, sanitizeQueueKey } from '../messages';
import {
  ARENA_TEAM_SIZE, DUNGEON_RELAX, QUEUE_PRESENT_SEC, bySince, keysCompatible, matchArena, matchDungeon, missingRoles, mmrOf, parseQueueKey,
  proposerOf, windowFor, type Candidate,
} from './matcher';

/**
 * QUEUE CORE (GDD_PVP_FINDER §2.9, package PV-02). One peer's matchmaking state machine: pool of the other queuers, announce loop, the
 * deterministic proposer rule, the qprop / qack / qdecl handshake, timeouts, cooldowns and the receiver-side abuse rules (§2.9.5).
 * TRANSPORT-FREE: all I/O goes through `QueueIO` (the game gives it the lobby lease, the sim gives it an in-memory bus) and time comes from
 * `io.now()` (ms, monotonic) / `io.wall()` (ms, comparable between peers), so dev/combat-sim/arena.mjs drives the real code headlessly.
 *
 * Design deltas against the GDD, all recorded here:
 *  - global lobby instead of shard rooms (the queue rides on LobbyChannels; shard field kept = 1);
 *  - `since` is wall-clock based (performance.now() is not comparable between peers);
 *  - proposer takeover is the deterministic recomputation (a proposer that disappears leaves the pool, the next earliest member of the
 *    best match proposes) instead of the staggered `rank x 2 s` timers: two views that agree can never pick two proposers;
 *  - `busy` flag in `qann` keeps peers that are inside a proposal out of other proposals.
 */

export const QUEUE_TIMING = {
  annMs: NET.QUEUE_ANN_MS,
  ttlMs: NET.QUEUE_TTL_MS,
  ackMs: NET.QUEUE_ACK_TIMEOUT_MS,
  maxWaitMs: NET.QUEUE_MAX_WAIT_MS,
  /** Member: no room (join result) this long after the ack. */
  joinMs: 20000,
  /** Extra time on top of joinMs before the core gives up on a join that never reported (joinRoom has its own 10-25 s timeout). */
  joinSafetyMs: 20000,
  /** Receiver-side abuse rule: more than 2 qann in 1 s mutes the sender for 30 s. */
  annBurst: 2,
  muteMs: 30000,
  /** Declines / ack timeouts: 2 inside 5 min give a 2 min cooldown (GDD §2.9.4). */
  declineWindowMs: 300000,
  declineCooldownMs: 120000,
  /** A peer that failed to ack is left out of the next proposals this long. */
  skipMs: 30000,
  poolCap: 300,
} as const;

export interface QueueSelf {
  name: string;
  classId: ClassId;
  level: number;
  ilvl: number;
  spec?: SpecId;
}

export interface QueueIO {
  selfId: string;
  proto: number;
  gameVersion: string;
  /** Monotonic ms. */
  now(): number;
  /** Wall ms (Date.now), comparable between peers up to clock skew. Used for `since` only. */
  wall(): number;
  broadcast(ch: 'qann' | 'qcancel', data: QueueAnnounce | QueueCancel): void;
  sendTo(ch: 'qprop' | 'qack' | 'qdecl', to: string, data: MatchProposal | MatchAck): void;
  self(): QueueSelf | null;
  newMid(): string;
  newCode(): string;
  /** Arena map id for the bracket, seeded by `mid` ('' = none available). */
  arenaMap(mid: string, bracket: ArenaBracket): string;
  /** Proposer: open the game room for the proposal. Resolves true when the room is up. */
  host(p: MatchProposal): Promise<boolean>;
  /** Member: join the proposer's room. */
  join(p: MatchProposal, proposer: string): Promise<{ ok: boolean; reason?: string }>;
}

interface PoolEntry {
  entry: QueueAnnounce;
  seen: number;
  first: number;
  /** Receive times of the last announcements (abuse rule). */
  recv: number[];
}

interface Outgoing {
  p: MatchProposal;
  pending: Set<string>;
  deadline: number;
}
interface Incoming {
  p: MatchProposal;
  proposer: string;
  deadline: number;
}

export class QueueCore {
  private readonly pool = new Map<string, PoolEntry>();
  private readonly muted = new Map<string, number>();
  private readonly skip = new Map<string, number>();
  private readonly declines = new Map<string, number[]>();
  private readonly listeners = new Set<(s: QueueState, n?: QueueNotice) => void>();
  private me: QueueAnnounce | null = null;
  private lastAnn = 0;
  private rev = 0;
  private out: Outgoing | null = null;
  private inc: Incoming | null = null;
  private lockUntil = 0;
  private myMmr = 1500;
  /** Peers that withdrew or declined in the CURRENT handshake of ours (no re-propose in the same tick). */
  st: QueueState = QueueCore.idle();

  constructor(private readonly io: QueueIO) {}

  static idle(): QueueState {
    return { key: null, shard: 1, since: 0, phase: 'idle', mid: null, roleFill: { tank: false, healer: false, dps: 0 }, window: null, pool: 0 };
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // public API
  // ---------------------------------------------------------------------------------------------------------------------

  state(): QueueState {
    return { ...this.st, roleFill: { ...this.st.roleFill }, window: this.st.window ? [...this.st.window] as [number, number] : null };
  }

  onChange(cb: (s: QueueState, n?: QueueNotice) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Local lock after a forfeit / leave (ms on io.now()). */
  setLock(untilMs: number): void {
    this.lockUntil = untilMs;
    if (untilMs > this.io.now()) this.notify({ k: 'cooldown', until: untilMs });
  }
  lockedUntil(): number { return this.lockUntil; }

  enter(key: QueueKey, opts: QueueEnterOpts = {}): { ok: boolean; reason?: string } {
    const k = sanitizeQueueKey(key);
    const pk = k ? parseQueueKey(k) : null;
    if (!k || !pk) return { ok: false, reason: 'Geçersiz kuyruk.' };
    if (this.st.phase !== 'idle') return { ok: false, reason: 'Zaten bir kuyruktasın.' };
    const now = this.io.now();
    if (now < this.lockUntil) return { ok: false, reason: `Kuyruğa girmek için ${Math.ceil((this.lockUntil - now) / 60000)} dk beklemelisin.` };
    const self = this.io.self();
    if (!self) return { ok: false, reason: 'Önce bir karakter seçmelisin.' };
    let roles: RoleId[] = [];
    if (pk.kind === 'dungeon') {
      roles = (opts.roles ?? []).filter((r, i, a) => a.indexOf(r) === i).slice(0, 3);
      if (!roles.length) return { ok: false, reason: 'Kuyruğa girmek için bir rol seçmelisin.' };
    }
    const rating = Math.max(0, Math.round(opts.rating ?? 1500));
    this.myMmr = Math.max(0, Math.round(opts.mmr ?? rating));
    this.rev = 0;
    this.me = {
      t: 'qann', proto: this.io.proto, gameVersion: this.io.gameVersion, key: k, shard: 1,
      name: self.name, classId: self.classId, level: self.level, ilvl: self.ilvl, roles, rating, since: this.io.wall(), rev: 0,
      ...(self.spec ? { spec: self.spec } : {}),
      ...(pk.kind === 'arena' ? { mmr: this.myMmr } : {}),
      ...(opts.dungeons?.length ? { dungeons: opts.dungeons.slice(0, 4) } : {}),
      ...(opts.keyLevel ? { keyLevel: Math.max(2, Math.min(30, Math.round(opts.keyLevel))) } : {}),
    };
    this.st = { ...QueueCore.idle(), key: k, since: now, phase: 'searching' };
    this.out = null;
    this.inc = null;
    this.announce(true);
    this.refreshState();
    return { ok: true };
  }

  /** Leave the queue (or abandon a pending handshake). Safe in any phase. */
  cancel(reason: 'cancel' | 'moved' = 'cancel'): void {
    if (this.st.phase === 'idle') return;
    this.abandonHandshake(reason);
    this.sendCancel();
    this.st = QueueCore.idle();
    this.me = null;
    this.notify();
  }

  /** The match is over (or we left it): back to idle, no cancel message needed (already sent when the match started). */
  finish(): void {
    this.out = null;
    this.inc = null;
    this.me = null;
    this.st = QueueCore.idle();
    this.notify();
  }

  /** Re-queue after a failed/declined match, keeping the old `since` (GDD: "re-queued at their old since"). */
  requeue(): void {
    if (!this.me) return;
    this.out = null;
    this.inc = null;
    this.st = { ...this.st, phase: 'searching', mid: null };
    this.me = { ...this.me, busy: undefined };
    delete this.me.busy;
    this.announce(true);
    this.refreshState();
  }

  /** The current announcement (sent to a lobby peer that just joined). */
  currentAnnounce(): QueueAnnounce | null { return this.me && this.st.phase !== 'in_match' ? this.me : null; }
  /** Announce right now (the lobby transport just attached). */
  kick(): void { if (this.st.phase === 'searching' || this.st.phase === 'proposed') this.announce(true); }

  /** Peers currently pooled (tests / UI): alive entries of any key. */
  poolSize(): number { return this.pool.size; }

  // ---------------------------------------------------------------------------------------------------------------------
  // receive
  // ---------------------------------------------------------------------------------------------------------------------

  onAnnounce(from: string, raw: unknown): void {
    if (from === this.io.selfId) return;
    const now = this.io.now();
    const mutedUntil = this.muted.get(from);
    if (mutedUntil !== undefined) {
      if (now < mutedUntil) return;
      this.muted.delete(from);
    }
    const prev = this.pool.get(from);
    // abuse rule: more than annBurst announcements inside 1 s -> ignored for muteMs
    const recv = prev ? prev.recv.filter((t) => now - t < 1000) : [];
    recv.push(now);
    if (recv.length > QUEUE_TIMING.annBurst) {
      this.muted.set(from, now + QUEUE_TIMING.muteMs);
      this.pool.delete(from);
      return;
    }
    const e = sanitizeQueueAnnounce(raw);
    if (!e) return;
    if (e.proto !== this.io.proto || e.gameVersion !== this.io.gameVersion) return;
    if (prev && prev.entry.since === e.since && e.rev < prev.entry.rev) return; // stale
    if (!prev && this.pool.size >= QUEUE_TIMING.poolCap) return;
    this.pool.set(from, { entry: e, seen: now, first: prev && prev.entry.since === e.since ? prev.first : now, recv });
    if (this.st.phase === 'searching') this.refreshState();
  }

  onCancel(from: string, raw: unknown): void {
    const c = sanitizeQueueCancel(raw);
    if (!c) return;
    this.dropPeer(from);
  }

  onPeerLeave(peer: string): void {
    this.dropPeer(peer);
  }

  private dropPeer(peer: string): void {
    this.pool.delete(peer);
    const o = this.out;
    if (o && o.pending.has(peer)) {
      this.noteDecline(peer);
      o.pending.delete(peer);
      this.failProposal([peer]);
    } else if (o && this.st.phase !== 'joining' && o.p.members.some((m) => m.peerId === peer)) {
      // (in 'joining' we are hosting: an acked member that joined the room sends qcancel and leaves the lobby right away, which would
      // otherwise withdraw a healthy match; a member that really vanished is caught by the host loop (members never show up in the room))
      this.failProposal([peer]);
    }
    // a proposer that leaves while we are joining is handled by the join timeout (joinResult / inc.deadline)
  }

  onProposal(from: string, raw: unknown): void {
    const p = sanitizeMatchProposal(raw);
    if (!p || !this.me || from === this.io.selfId) return;
    const self = this.io.selfId;
    if (!p.members.some((m) => m.peerId === self) || !p.members.some((m) => m.peerId === from)) return;
    if (!keysCompatible(p.key, this.me.key)) return;
    // inside a handshake we cannot leave (acked member, hosting proposer, in a match): busy, the proposer re-proposes without us.
    // A proposer that is still waiting for acks (phase 'proposed' with an outgoing proposal) may step down below.
    if (this.st.phase === 'joining' || this.st.phase === 'in_match' || (this.st.phase === 'proposed' && !this.out)) {
      if (this.inc?.p.mid !== p.mid) this.io.sendTo('qdecl', from, { t: 'qdecl', mid: p.mid, reason: 'busy' });
      return;
    }
    if (!this.proposalValid(from, p)) return;
    // two proposers racing: if we are a proposer with a pending proposal and the other one is earlier, we step down
    if (this.out) {
      const mine = this.me.since;
      const theirs = this.sinceOf(from, p);
      if (!(theirs < mine || (theirs === mine && from < self))) {
        this.io.sendTo('qdecl', from, { t: 'qdecl', mid: p.mid, reason: 'busy' });
        return;
      }
      this.abandonHandshake('moved');
    }
    const pk = parseQueueKey(p.key);
    if (pk?.kind === 'arena' && !this.arenaProposalOk(p)) return;
    this.inc = { p, proposer: from, deadline: this.io.now() + QUEUE_TIMING.joinMs };
    this.st = { ...this.st, phase: 'joining', mid: p.mid };
    this.me = { ...this.me, busy: true };
    this.io.sendTo('qack', from, { t: 'qack', mid: p.mid });
    this.announce(true);
    this.notify({ k: 'found', mid: p.mid, key: p.key });
    void this.io.join(p, from).then((r) => this.onJoinResult(p.mid, r.ok, r.reason), () => this.onJoinResult(p.mid, false, 'join'));
  }

  onAck(from: string, raw: unknown): void {
    const a = sanitizeMatchAck(raw);
    const o = this.out;
    if (!a || !o || a.mid !== o.p.mid) return;
    if (a.t === 'qdecl') {
      if (a.reason !== 'busy') this.noteDecline(from);
      o.pending.delete(from);
      this.failProposal([from]);
      return;
    }
    if (!o.pending.delete(from)) return;
    if (o.pending.size === 0) void this.startHosting(o);
  }

  /** A qdecl FROM the proposer means the proposal was withdrawn. */
  onDecline(from: string, raw: unknown): void {
    const a = sanitizeMatchAck(raw);
    if (!a) return;
    if (this.out && a.mid === this.out.p.mid) return this.onAck(from, raw);
    if (this.inc && a.mid === this.inc.p.mid && from === this.inc.proposer) this.dropIncoming();
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // clock
  // ---------------------------------------------------------------------------------------------------------------------

  /** Call every ~500 ms. */
  tick(): void {
    const now = this.io.now();
    for (const [peer, e] of this.pool) if (now - e.seen > QUEUE_TIMING.ttlMs) this.pool.delete(peer);
    for (const [peer, t] of this.muted) if (now > t + QUEUE_TIMING.muteMs) this.muted.delete(peer);
    for (const [peer, t] of this.skip) if (now > t) this.skip.delete(peer);
    if (!this.me || this.st.phase === 'idle' || this.st.phase === 'in_match') return;
    if (now - this.st.since > QUEUE_TIMING.maxWaitMs) {
      this.cancel();
      this.notify({ k: 'timeout' });
      return;
    }
    if (now - this.lastAnn >= QUEUE_TIMING.annMs) this.announce(false);
    const o = this.out;
    if (o && now > o.deadline) {
      const late = [...o.pending];
      for (const p of late) this.noteDecline(p);
      o.pending.clear();
      this.failProposal(late);
    }
    const inc = this.inc;
    if (inc && this.st.phase === 'joining' && now > inc.deadline + QUEUE_TIMING.joinSafetyMs) {
      // safety net: the join never reported back (proposer gone): back to the queue at the old position
      this.inc = null;
      this.notify({ k: 'joinFail', reason: 'Gruba bağlanılamadı. Tekrar kuyruğa giriliyor.' });
      this.requeue();
    }
    if (this.st.phase === 'searching') {
      this.refreshState();
      this.tryPropose();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // matching
  // ---------------------------------------------------------------------------------------------------------------------

  private candidates(): Candidate[] {
    const now = this.io.now();
    const me = this.me;
    const list: Candidate[] = [];
    if (me) list.push({ peerId: this.io.selfId, entry: me, age: 0 });
    for (const [peer, e] of this.pool) {
      if (e.entry.busy) continue;
      const sk = this.skip.get(peer);
      if (sk !== undefined && now < sk) continue;
      if (this.coolingDown(peer, now)) continue;
      list.push({ peerId: peer, entry: e.entry, age: (now - e.seen) / 1000 });
    }
    return list;
  }

  private coolingDown(peer: string, now: number): boolean {
    const d = this.declines.get(peer);
    if (!d) return false;
    const recent = d.filter((t) => now - t < QUEUE_TIMING.declineWindowMs);
    this.declines.set(peer, recent);
    if (recent.length >= 2 && now - recent[recent.length - 1] < QUEUE_TIMING.declineCooldownMs) return true;
    return false;
  }

  private noteDecline(peer: string): void {
    const now = this.io.now();
    const d = (this.declines.get(peer) ?? []).filter((t) => now - t < QUEUE_TIMING.declineWindowMs);
    d.push(now);
    this.declines.set(peer, d);
    this.skip.set(peer, now + QUEUE_TIMING.skipMs);
  }

  /** The wait (s) used by the matcher: how long the oldest member of the local view has been queued. */
  private waitSec(cands: readonly Candidate[]): number {
    const now = this.io.now();
    let w = (now - this.st.since) / 1000;
    for (const c of cands) {
      if (c.peerId === this.io.selfId) continue;
      const e = this.pool.get(c.peerId);
      if (e) w = Math.max(w, (now - e.first) / 1000);
    }
    return w;
  }

  private refreshState(): void {
    if (!this.me || this.st.phase !== 'searching') return;
    const pk = parseQueueKey(this.me.key);
    const cands = this.candidates().filter((c) => keysCompatible(c.entry.key, this.me!.key) || c.peerId === this.io.selfId);
    const pool = cands.length;
    const wait = (this.io.now() - this.st.since) / 1000;
    const window = pk?.kind === 'arena' ? windowFor(this.myMmr, wait) : null;
    const roleFill = pk?.kind === 'dungeon' ? missingRoles(cands, this.me.key) : { tank: false, healer: false, dps: 0 };
    const same = this.st.pool === pool && JSON.stringify(this.st.window) === JSON.stringify(window)
      && JSON.stringify(this.st.roleFill) === JSON.stringify(roleFill);
    this.st = { ...this.st, pool, window, roleFill };
    if (!same) this.notify();
  }

  private tryPropose(): void {
    const me = this.me;
    if (!me || this.out || this.inc) return;
    const cands = this.candidates();
    const wait = this.waitSec(cands);
    const pk = parseQueueKey(me.key);
    if (!pk) return;
    let members: Candidate[] = [];
    let roles = new Map<string, RoleId>();
    let teams: { A: string[]; B: string[] } | null = null;
    if (pk.kind === 'arena') {
      const m = matchArena(cands, me.key, wait);
      if (!m) return;
      members = m.members;
      teams = m.teams;
    } else {
      const m = matchDungeon(cands, me.key, wait);
      if (!m) return;
      members = m.members.map((x) => x.cand);
      roles = new Map(m.members.map((x) => [x.cand.peerId, x.role]));
    }
    if (!members.some((c) => c.peerId === this.io.selfId)) return;
    if (proposerOf(members) !== this.io.selfId) return; // somebody else proposes
    const mid = this.io.newMid();
    const first = members.find((c) => c.peerId !== this.io.selfId);
    const arenaId = pk.kind === 'arena' ? this.io.arenaMap(mid, pk.bracket) : '';
    const p: MatchProposal = {
      t: 'qprop', mid, key: me.key, shard: 1, code: this.io.newCode(),
      mode: pk.kind === 'arena' ? 'pvp' : 'coop',
      dungeonId: pk.kind === 'dungeon' && !pk.random ? pk.dungeon : (first?.entry.dungeons?.[0] ?? null),
      diff: pk.kind === 'dungeon' ? pk.diff : null,
      keyLevel: pk.kind === 'dungeon' ? Math.min(...members.map((c) => c.entry.keyLevel ?? pk.level)) : 0,
      bracket: pk.kind === 'arena' ? pk.bracket : null,
      ranked: pk.kind === 'arena' ? pk.ranked : false,
      teams, arenaId,
      members: members.map((c) => ({
        peerId: c.peerId, role: roles.get(c.peerId) ?? null, classId: c.entry.classId, level: c.entry.level, ilvl: c.entry.ilvl,
        // arena: the hidden MMR the matcher used (team means for the result are computed from it)
        rating: pk.kind === 'arena' ? mmrOf(c.entry) : c.entry.rating,
      })),
      affixes: [],
    };
    const pending = new Set(members.map((c) => c.peerId).filter((id) => id !== this.io.selfId));
    this.out = { p, pending, deadline: this.io.now() + QUEUE_TIMING.ackMs };
    this.st = { ...this.st, phase: 'proposed', mid };
    this.me = { ...me, busy: true };
    for (const id of pending) this.io.sendTo('qprop', id, p);
    this.announce(true);
    // the proposer gets the same "found" notice as the members (toast + match-found popup); the popup reads phase 'proposed' too
    this.notify({ k: 'found', mid, key: me.key });
  }

  private async startHosting(o: Outgoing): Promise<void> {
    if (this.out !== o) return;
    this.st = { ...this.st, phase: 'joining' };
    this.notify();
    let ok = false;
    try {
      ok = await this.io.host(o.p);
    } catch {
      ok = false;
    }
    if (this.out !== o) return;
    if (!ok) {
      for (const m of o.p.members) if (m.peerId !== this.io.selfId) this.io.sendTo('qdecl', m.peerId, { t: 'qdecl', mid: o.p.mid, reason: 'cancel' });
      this.out = null;
      this.notify({ k: 'joinFail', reason: 'Grup kurulamadı. Tekrar dene.' });
      this.requeue();
      return;
    }
    this.enterMatch();
  }

  private onJoinResult(mid: string, ok: boolean, reason?: string): void {
    if (!this.inc || this.inc.p.mid !== mid) return;
    if (!ok) {
      this.inc = null;
      this.notify({ k: 'joinFail', reason: reason ?? 'Gruba bağlanılamadı. Tekrar kuyruğa giriliyor.' });
      if (this.me) this.requeue();
      return;
    }
    this.enterMatch();
  }

  private enterMatch(): void {
    // the entry leaves the lobby pools of the others right away
    this.sendCancel();
    this.out = null;
    this.inc = null;
    this.st = { ...this.st, phase: 'in_match' };
    this.notify();
  }

  private failProposal(gone: readonly string[]): void {
    const o = this.out;
    if (!o) return;
    // withdraw: everybody who already acked goes back to the queue; the non-ackers are skipped for a while
    for (const m of o.p.members) {
      if (m.peerId === this.io.selfId || gone.includes(m.peerId)) continue;
      this.io.sendTo('qdecl', m.peerId, { t: 'qdecl', mid: o.p.mid, reason: 'moved' });
    }
    this.out = null;
    if (this.st.phase === 'proposed' || this.st.phase === 'joining') {
      this.notify({ k: 'declined', reason: 'Eşleşme zaman aşımına uğradı.' });
      this.requeue();
    }
  }

  private dropIncoming(): void {
    if (!this.inc) return;
    this.inc = null;
    this.notify({ k: 'declined', reason: 'Eşleşme zaman aşımına uğradı.' });
    if (this.me) this.requeue();
  }

  private abandonHandshake(reason: 'cancel' | 'moved'): void {
    const o = this.out;
    if (o) {
      for (const m of o.p.members) if (m.peerId !== this.io.selfId) this.io.sendTo('qdecl', m.peerId, { t: 'qdecl', mid: o.p.mid, reason });
    }
    const inc = this.inc;
    if (inc) this.io.sendTo('qdecl', inc.proposer, { t: 'qdecl', mid: inc.p.mid, reason });
    this.out = null;
    this.inc = null;
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // validation (anti-abuse §2.9.5)
  // ---------------------------------------------------------------------------------------------------------------------

  /** since of a proposal member as WE know it (self from our entry, others from the pool), Infinity when unknown. */
  private sinceOf(peer: string, p?: MatchProposal): number {
    if (peer === this.io.selfId) return this.me?.since ?? Infinity;
    const e = this.pool.get(peer);
    void p;
    return e ? e.entry.since : Infinity;
  }

  /** A qprop is accepted only from a peer in OUR pool for the key, and only if it has the earliest `since` among the members we know. */
  private proposalValid(from: string, p: MatchProposal): boolean {
    const pe = this.pool.get(from);
    if (!pe || !keysCompatible(pe.entry.key, p.key)) return false;
    const fromSince = pe.entry.since;
    for (const m of p.members) {
      if (m.peerId === from) continue;
      const s = this.sinceOf(m.peerId);
      if (s < fromSince || (s === fromSince && m.peerId < from)) return false;
    }
    return true;
  }

  private arenaProposalOk(p: MatchProposal): boolean {
    if (!p.teams || !p.bracket) return false;
    const n = ARENA_TEAM_SIZE[p.bracket];
    if (p.teams.A.length !== n || p.teams.B.length !== n || p.members.length !== n * 2) return false;
    const ids = new Set(p.members.map((m) => m.peerId));
    return [...p.teams.A, ...p.teams.B].every((id) => ids.has(id)) && new Set([...p.teams.A, ...p.teams.B]).size === n * 2;
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // send helpers
  // ---------------------------------------------------------------------------------------------------------------------

  private announce(force: boolean): void {
    const me = this.me;
    if (!me) return;
    const now = this.io.now();
    if (!force && now - this.lastAnn < QUEUE_TIMING.annMs) return;
    this.lastAnn = now;
    // keep the visible level / ilvl fresh (leveling up while queued)
    const self = this.io.self();
    if (self) this.me = { ...me, name: self.name, level: self.level, ilvl: self.ilvl };
    this.me = { ...(this.me as QueueAnnounce), rev: ++this.rev };
    if (!this.me.busy) delete this.me.busy;
    this.io.broadcast('qann', this.me);
  }

  private sendCancel(): void {
    if (this.me) this.io.broadcast('qcancel', { t: 'qcancel', key: this.me.key, shard: 1 });
  }

  private notify(n?: QueueNotice): void {
    const s = this.state();
    for (const cb of [...this.listeners]) {
      try {
        cb(s, n);
      } catch (e) {
        console.error('[queue] listener error', e);
      }
    }
  }
}

/**
 * Results card "Kuyruğa Tekrar Gir" (pure, clock passed in): the key to queue again once the player is back in town. The arena exit leaves
 * the arena first and the queue is refused outside town, so the key waits for the town scene. Expires after `ttlMs`, so a failed exit does
 * not queue the player later by surprise. QueueService wires it to the scene events.
 */
export class RequeueGate {
  private key: QueueKey | null = null;
  private until = 0;

  constructor(private readonly ttlMs: number = 30000) {}

  arm(key: QueueKey, now: number): void {
    this.key = key;
    this.until = now + this.ttlMs;
  }

  /** A scene change to `to`: the key to queue now, or null. A pending key is consumed by the first town visit (expired ones too). */
  onScene(to: string, now: number): QueueKey | null {
    const k = this.key;
    if (!k || to !== 'town') return null;
    this.key = null;
    return now <= this.until ? k : null;
  }

  clear(): void {
    this.key = null;
  }
}

export { DUNGEON_RELAX, QUEUE_PRESENT_SEC, bySince, mmrOf };
