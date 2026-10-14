import { G } from '../../game/G';
import type { LobbyTransport } from '../lobby';
import type { ArenaBracket, FinderApi, MatchProposal, QueueEnterOpts, QueueKey, QueueNotice, QueueState } from '../../types/finder';
import type { ArenaParams } from '../../types/arena';
import type { DungeonParams } from '../../scenes/scenes';
import { GAME_VERSION, PROTOCOL_VERSION, makeRoomCode } from '../messages';
import { QueueCore, QUEUE_TIMING, RequeueGate, type QueueIO } from './QueueCore';
import { parseQueueKey, arenaKey } from './matcher';
import { pickArena } from '../../scenes/arena/arenaMaps';
import { arenaActive } from '../../scenes/arena/ArenaController';
import { ARENA_MIN_LEVEL, teamMean } from '../../scenes/arena/arenaRules';

/**
 * QUEUE SERVICE (GDD_PVP_FINDER §2.10 / §3.1, package PV-02): `G.net.queue`. Glue between QueueCore (pure state machine), the shared lobby
 * transport (NetSession.leaseLobby: the same global room Social / Pazar / Lonca use), the room code flow (hostRoom with the proposer's
 * code / joinRoom) and the arena launch (requestScene with DungeonParams.arena).
 *
 * Arena queues are live. Dungeon queue keys are accepted by the matcher and the core (tested in the sim) but `enter` refuses them here
 * until the dungeon launch flow (ready check + keystone) is wired by the finder panel package.
 */

const MID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const randMid = (): string => {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 8; i++) s += MID_ALPHABET[b[i] % MID_ALPHABET.length];
  return s;
};

const hash32 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Arena params of an accepted proposal (every peer builds the same thing from the proposal, only the host sends it on). */
export function arenaParamsOf(p: MatchProposal): ArenaParams | null {
  if (!p.bracket || !p.teams) return null;
  const rating = new Map(p.members.map((m) => [m.peerId, m.rating]));
  const mean = (ids: string[]): number => teamMean(ids.map((id) => rating.get(id) ?? 1500));
  return {
    arenaId: p.arenaId || pickArena(p.mid, p.bracket).id,
    matchId: p.mid, bracket: p.bracket, ranked: p.ranked, teams: p.teams, seed: hash32(p.mid), mean: [Math.round(mean(p.teams.A)), Math.round(mean(p.teams.B))],
  };
}

export class QueueService implements FinderApi {
  readonly core: QueueCore;
  private tr: LobbyTransport | null = null;
  private release: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly offs: (() => void)[] = [];
  private attaching = false;
  private disposed = false;
  /** Results card "Kuyruğa Tekrar Gir": the key to queue again once the player is back in town (QueueCore.RequeueGate). */
  private readonly requeue = new RequeueGate();

  constructor() {
    this.core = new QueueCore(this.makeIO());
    this.core.onChange((s, n) => this.onCore(s, n));
    const ev = G.events;
    this.offs.push(
      ev.on('scene:changed', (e) => {
        const ph = this.core.state().phase;
        if ((ph === 'searching' || ph === 'proposed') && e.to !== 'town') this.cancel();
      }),
      ev.on('scene:changed', (e) => {
        const key = this.requeue.onScene(e.to, performance.now());
        if (!key) return;
        const r = this.enter(key, {});
        if (!r.ok) G.ui?.toast(r.reason ?? 'Kuyruğa girilemedi.', 'warning');
      }),
      ev.on('net:status', (e) => {
        // a match room that closed before the arena started (the proposer failed to launch): back to idle
        if (this.core.state().phase === 'in_match' && e.role === 'offline' && !arenaActive()) {
          this.core.finish();
          this.detach();
          G.ui?.toast('Eşleşme iptal edildi.', 'warning');
        }
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.requeue.clear();
    for (const o of this.offs.splice(0)) o();
    this.core.cancel();
    this.detach();
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // FinderApi
  // ---------------------------------------------------------------------------------------------------------------------

  state(): QueueState { return this.core.state(); }
  onChange(cb: (s: QueueState, notice?: QueueNotice) => void): () => void { return this.core.onChange(cb); }

  enter(key: QueueKey, opts: QueueEnterOpts = {}): { ok: boolean; reason?: string } {
    const pk = parseQueueKey(key);
    if (!pk) return { ok: false, reason: 'Geçersiz kuyruk.' };
    if (pk.kind !== 'arena') return { ok: false, reason: 'Zindan kuyruğu henüz açık değil.' };
    const ch = G.character;
    if (!ch) return { ok: false, reason: 'Önce bir karakter seçmelisin.' };
    if (G.scenes?.current?.id !== 'town') return { ok: false, reason: 'Kuyruğa girmek için kasabada olmalısın.' };
    if (G.net.inParty) return { ok: false, reason: 'Bir grubun içindeyken kuyruğa giremezsin.' };
    if (ch.level < ARENA_MIN_LEVEL) return { ok: false, reason: `Arena için en az ${ARENA_MIN_LEVEL}. seviye olmalısın.` };
    const ladder = G.arenaLadder;
    const rem = ladder?.lockRemainingMs() ?? 0;
    if (rem > 0) return { ok: false, reason: `Maçtan ayrıldığın için ${Math.ceil(rem / 60000)} dk kuyruğa giremezsin.` };
    const b: ArenaBracket = pk.bracket;
    const r = this.core.enter(key, { ...opts, rating: opts.rating ?? ladder?.rating(b) ?? 1500, mmr: opts.mmr ?? ladder?.mmr(b) ?? 1500 });
    if (r.ok) void this.attach();
    return r;
  }

  cancel(): void {
    this.core.cancel();
    this.detach();
  }

  /** The arena match is over (ArenaController): idle again. */
  matchOver(): void {
    if (this.core.state().phase === 'idle') return;
    this.core.finish();
    this.detach();
  }

  /** Results card "Kuyruğa Tekrar Gir": queue again for the same key once the player is back in town (see RequeueGate). */
  requeueAfterMatch(key: QueueKey): void {
    this.requeue.arm(key, performance.now());
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // lobby attach
  // ---------------------------------------------------------------------------------------------------------------------

  private async attach(): Promise<void> {
    if (this.tr || this.attaching) return;
    this.attaching = true;
    try {
      const l = await G.net.leaseLobby();
      if (!l) {
        this.core.cancel();
        G.ui?.toast('Eşleştirme sunucularına bağlanılamadı.', 'error');
        return;
      }
      if (this.disposed || this.core.state().phase === 'idle') {
        l.release();
        return;
      }
      const tr = l.tr;
      this.tr = tr;
      this.release = l.release;
      this.offs.push(
        tr.on('qann', (d, m) => this.core.onAnnounce(m.from, d)),
        tr.on('qcancel', (d, m) => this.core.onCancel(m.from, d)),
        tr.on('qprop', (d, m) => this.core.onProposal(m.from, d)),
        tr.on('qack', (d, m) => this.core.onAck(m.from, d)),
        tr.on('qdecl', (d, m) => this.core.onDecline(m.from, d)),
        tr.onPeerLeave((peer) => this.core.onPeerLeave(peer)),
        tr.onPeerJoin((peer) => {
          const a = this.core.currentAnnounce();
          if (a) tr.send('qann', a, { to: peer });
        }),
      );
      this.timer = setInterval(() => this.core.tick(), 500);
      this.core.kick();
    } catch (e) {
      console.warn('[queue] lobby attach failed', e);
      this.core.cancel();
    } finally {
      this.attaching = false;
    }
  }

  private detach(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // the lobby handlers were registered after the constructor ones: drop everything except the three scene listeners (first three offs)
    const keep = 3;
    for (const o of this.offs.splice(keep)) o();
    this.tr = null;
    const rel = this.release;
    this.release = null;
    rel?.();
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // notices
  // ---------------------------------------------------------------------------------------------------------------------

  private onCore(s: QueueState, n?: QueueNotice): void {
    try {
      G.events.emit('arena:queue', { state: s, key: s.key, ...(n ? { notice: n } : {}) });
    } catch (e) {
      console.warn('[queue] event failed', e);
    }
    if (!n) return;
    const ui = G.ui;
    switch (n.k) {
      case 'found': ui?.toast('Maç bulundu! Odaya bağlanılıyor…', 'success'); break;
      case 'declined': ui?.toast('Eşleşme tamamlanamadı; kuyruğa geri alındın.', 'warning'); break;
      case 'timeout': ui?.toast('Kuyruk zaman aşımına uğradı. Tekrar dene.', 'warning'); this.detach(); break;
      case 'joinFail': ui?.toast(n.reason, 'warning'); break;
      case 'cooldown': ui?.toast('Kuyruğa girmek için biraz beklemelisin.', 'warning'); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // QueueIO
  // ---------------------------------------------------------------------------------------------------------------------

  private makeIO(): QueueIO {
    const svc = this;
    return {
      get selfId() { return G.net?.selfId ?? 'self'; },
      proto: PROTOCOL_VERSION,
      gameVersion: GAME_VERSION,
      now: () => performance.now(),
      wall: () => Date.now(),
      broadcast: (ch, data) => { svc.tr?.send(ch, data as never); },
      sendTo: (ch, to, data) => { svc.tr?.send(ch, data as never, { to }); },
      self: () => {
        const c = G.character;
        if (!c) return null;
        const s = c.summary();
        return { name: s.name, classId: s.classId, level: s.level, ilvl: s.itemLevel, ...(c.save.spec ? { spec: c.save.spec } : {}) };
      },
      newMid: randMid,
      newCode: makeRoomCode,
      arenaMap: (mid, bracket) => pickArena(mid, bracket).id,
      host: (p) => svc.hostMatch(p),
      join: (p, proposer) => svc.joinMatch(p, proposer),
    };
  }

  /** Proposer: open the room with the announced code, wait for the members, start the arena. */
  private async hostMatch(p: MatchProposal): Promise<boolean> {
    const params = arenaParamsOf(p);
    if (!params) return false;
    const net = G.net;
    const code = await net.hostRoom({ name: 'Arena', maxPlayers: p.members.length, mode: 'pvp', public: false, code: p.code });
    if (!code) return false;
    const deadline = performance.now() + QUEUE_TIMING.joinMs + 5000;
    while (performance.now() < deadline) {
      if (net.role !== 'host') return false;
      if (p.members.every((m) => m.peerId === net.selfId || net.peers.has(m.peerId))) break;
      await sleep(250);
    }
    if (!p.members.every((m) => m.peerId === net.selfId || net.peers.has(m.peerId))) {
      net.leaveRoom();
      return false;
    }
    const dp: DungeonParams = {
      dungeonId: params.arenaId, difficulty: 'normal', keyLevel: 0, seed: params.seed, affixes: [], enemyLevel: 60, partySize: p.members.length,
      keyOwner: net.selfId, arena: params,
    };
    net.requestScene('dungeon', dp);
    return true;
  }

  /** Member: join the proposer's room by code. */
  private async joinMatch(p: MatchProposal, proposer: string): Promise<{ ok: boolean; reason?: string }> {
    const net = G.net;
    try {
      await net.joinRoom(p.code);
    } catch {
      return { ok: false, reason: 'Gruba bağlanılamadı. Tekrar kuyruğa giriliyor.' };
    }
    if (net.role === 'client' && net.hostId === proposer) return { ok: true };
    if (net.role !== 'offline') net.leaveRoom();
    return { ok: false, reason: 'Gruba bağlanılamadı. Tekrar kuyruğa giriliyor.' };
  }
}

export { arenaKey };
