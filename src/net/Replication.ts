import { G } from '../game/G';
import { Player, type PlayerSyncState } from '../entities/Player';
import { Minion } from '../entities/Minion';
import { minionDef } from '../data/minions';
import type { MinionSync } from '../types/minions';
import type { Enemy, EnemySyncState } from '../entities/Enemy';
import type { World } from '../world/World';
import { HOST_DYNAMIC_ID_BASE, MINION_ID_BASE, PARTY_ID_BASE, RARITY_ORDER } from '../types/common';
import type { EquipSlot, ItemInstance } from '../types/items';
import type { NetChannels } from '../types/net';
import type { NetSession, PeerInfo } from './NetSession';
import { NET, clampNum, ident, isObj, sanitizeText } from './messages';
import { syncYOk } from './guard';

/**
 * Replication (net module): turns the typed `pstate` / `gear` / `snap` channels into entities.
 *
 *  pstate  every peer -> all, 15 Hz while moving (0.3 s keep-alive when idle). Remote `Player` entities are created
 *          on scene:changed / net:peerJoined (model loaded, then world.add) and removed on leave / scene change.
 *  gear    owner -> all on equipment change (+ on join / scene change / every 8 s): visible weapon/offhand/helm.
 *  snap    host -> all, 15 Hz: EnemySyncState of enemies that CHANGED (+ a keyframe of everything near a remote
 *          player every 1.5 s), quantised and chunked below the 16 KB frame limit. Interest: enemies within the relevance
 *          radius of a remote player, nearest first, at most NET.MAX_SNAP_ENEMIES per tick. Open world (GDD_OPENWORLD
 *          §9.4): radius 120 m, sleeping (dormant) enemies are not streamed, and host-spawned enemies are announced with
 *          `spawn` to each remote peer before their first entry, so a late joiner gets the camps / stones / rares.
 *  minion  owner -> all, 10 Hz (NC43, GDD_CLASSES_V2 §1.5): the sender's own Minions as MinionSync[] (the full list; an unchanged
 *          list repeats every 0.3 s). Receivers keep REMOTE Minion copies (authority false, no AI, interpolated) in World.minions,
 *          so the host's enemy AI can target them. A copy is dropped when its owner's list no longer holds it, 1.5 s after its last
 *          snapshot, when its peer leaves, or on a scene change. Damage to a minion is resolved by its owner (Combat.hitMinion).
 *
 * Interpolation time base is G.engine.time: sender timestamps are mapped onto the local clock with a min-filtered
 * offset (de-jittered), so remote motion is evenly spaced even when packets arrive in bursts.
 * Everything received is untrusted: values are clamped / sanitised before touching entities. Nothing here throws
 * from the frame loop.
 */

/** One remote Minion copy (NC43). */
interface RemoteMinion {
  peerId: string;
  world: World;
  m: Minion;
}

interface Remote {
  peerId: string;
  slot: number;
  world: World;
  player: Player;
  added: boolean;
  hasPos: boolean;
}

export interface ReplicationStats {
  pstateSent: number;
  pstateRecv: number;
  snapSent: number;
  snapRecv: number;
  snapEnemiesSent: number;
  snapUnknown: number;
  gearSent: number;
  gearRecv: number;
  remotePlayers: number;
}

type PStateIn = PlayerSyncState & { t: number };

const VISIBLE_SLOTS: EquipSlot[] = ['weapon', 'offhand', 'helm'];
const TELEPORT_DIST = 10;
const GEAR_REFRESH_S = 8;
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** A sender clock that jumped ahead of the minimum offset by this much, for RESYNC_COUNT messages in a row, is re-based. */
const CLOCK_RESYNC_DEV = 0.35;
const CLOCK_RESYNC_COUNT = 10;

/** One enemy that the host may put into this snapshot tick (host only). */
interface SnapCandidate {
  e: Enemy;
  q: EnemySyncState;
  sig: string;
  d2: number;
  /** Host-spawned and not yet announced to some remote peer: needs a `spawn` before its snap entry. */
  missing: boolean;
}

/**
 * Maps one peer's G.engine.time onto ours without jitter (min-filtered offset) and measures its arrival jitter so the
 * interpolation delay adapts (LAN ~0.11 s, bad connections up to 0.3 s).
 * Engine.time is capped at 0.1 s per frame, so a scene load / long hitch on EITHER side shifts the clocks apart:
 * a receiver that lagged is fixed by the min filter at once, a sender that lagged by the persistent-deviation resync.
 */
class PeerClock {
  private off = 0;
  private init = false;
  private high = 0;
  private highMin = Infinity;
  private jitter = 0.01;
  delay: number = NET.INTERP_DELAY_S;

  map(now: number, tSender: number): number {
    const raw = now - tSender;
    if (!this.init) {
      this.init = true;
      this.off = raw;
    } else if (raw < this.off) {
      this.off = raw;
      this.high = 0;
      this.highMin = Infinity;
    } else {
      const dev = raw - this.off;
      this.off += dev * 0.01; // slow clock drift
      this.jitter += (Math.min(dev, 0.5) - this.jitter) * 0.05;
      if (dev > CLOCK_RESYNC_DEV) {
        this.highMin = Math.min(this.highMin, raw);
        if (++this.high >= CLOCK_RESYNC_COUNT) {
          this.off = this.highMin;
          this.high = 0;
          this.highMin = Infinity;
          this.jitter = 0.01;
        }
      } else {
        this.high = 0;
        this.highMin = Infinity;
      }
    }
    // interpolation delay: one send interval + a margin that follows the measured jitter (grows fast, shrinks slowly)
    const target = Math.max(0.1, Math.min(0.3, 1 / NET.PLAYER_STATE_HZ + 2.2 * this.jitter + 0.03));
    this.delay += (target - this.delay) * (target > this.delay ? 0.2 : 0.02);
    return Math.min(tSender + this.off, now);
  }
}

export class Replication {
  readonly stats: ReplicationStats = {
    pstateSent: 0, pstateRecv: 0, snapSent: 0, snapRecv: 0, snapEnemiesSent: 0, snapUnknown: 0, gearSent: 0, gearRecv: 0, remotePlayers: 0,
  };

  private active = false;
  private readonly remotes = new Map<string, Remote>();
  /** Latest state received before the remote entity finished loading its model. */
  private readonly pending = new Map<string, PStateIn>();
  private readonly gearCache = new Map<string, Partial<Record<EquipSlot, ItemInstance>>>();
  private readonly lookCache = new Map<string, RemoteLook>();
  private readonly gearSig = new Map<string, string>();
  private readonly clocks = new Map<string, PeerClock>();
  private readonly clashWarned = new Set<string>();
  private readonly unsubs: (() => void)[] = [];

  private nextPState = 0;
  private lastPSig = '';
  private lastPAt = 0;
  private nextSnap = 0;
  /** Host: last signature sent per enemy id (change detection). */
  private readonly snapSigs = new Map<number, string>();
  /** Host: engine time each enemy id was last put into a snapshot (per-enemy keyframe cadence). */
  private readonly sentAt = new Map<number, number>();
  /** Host, open world: per remote peer, the enemy ids it has been announced with `spawn`. */
  private readonly announced = new Map<string, Set<number>>();
  private gearDirtyAt = -1;
  private nextGearRefresh = 0;
  /** NC43 sender: next send time, last signature / send time, and whether the last send carried minions (an empty list is sent once). */
  private nextMinion = 0;
  private lastMinionSig = '';
  private lastMinionAt = 0;
  private minionsLive = false;
  /** NC43 receiver: remote Minion copies by entity id. */
  private readonly remoteMinions = new Map<number, RemoteMinion>();

  constructor(private readonly net: NetSession) {
    const ev = G.events;
    this.unsubs.push(
      ev.on('scene:leaving', () => this.onSceneLeaving()),
      ev.on('scene:changed', () => this.onSceneChanged()),
      ev.on('net:peerJoined', ({ peerId }) => this.onPeerJoined(peerId)),
      ev.on('net:peerLeft', ({ peerId }) => {
        this.announced.delete(peerId);
        this.removeRemote(peerId);
      }),
      ev.on('party:changed', () => this.refreshRemoteInfo()),
      ev.on('equipment:changed', () => this.markGearDirty(0.25)),
      ev.on('item:upgraded', () => this.markGearDirty(0.4)),
      net.on('pstate', (p, from) => this.onPState(p, from)),
      net.on('gear', (p, from) => this.onGear(p, from)),
      net.on('snap', (p, from) => this.onSnap(p, from)),
      net.on('minion', (p, from) => this.onMinion(p, from)),
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Called by NetSession when a room is joined/hosted (true) or left (false). */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.nextPState = 0;
    this.nextSnap = 0;
    this.lastPSig = '';
    this.nextMinion = 0;
    this.lastMinionSig = '';
    this.minionsLive = false;
    this.snapSigs.clear();
    this.sentAt.clear();
    this.announced.clear();
    if (!active) {
      for (const id of [...this.remotes.keys()]) this.removeRemote(id);
      this.clearMinions();
      this.pending.clear();
      this.gearCache.clear();
      this.lookCache.clear();
      this.gearSig.clear();
      this.clocks.clear();
      this.stats.remotePlayers = 0;
    } else {
      this.markGearDirty(0.5);
    }
  }

  /** Per-frame (Engine order -100 via NetSession.update). */
  update(_dt: number): void {
    if (!this.active) return;
    const net = this.net;
    const world = G.world;
    if (!world || !net.sceneIsReady || net.role === 'offline') return;
    const now = G.engine.time;
    const hasRemotes = net.peers.size > 1;

    if (hasRemotes) {
      if (now >= this.nextPState) {
        this.nextPState = now + 1 / NET.PLAYER_STATE_HZ - 0.002;
        this.safe(() => this.sendPState(now));
      }
      if (now >= this.nextMinion) {
        this.nextMinion = now + 1 / NET.MINION_HZ - 0.002;
        this.safe(() => this.sendMinions(now));
      }
      if (net.role === 'host' && now >= this.nextSnap) {
        this.nextSnap = now + 1 / NET.SNAPSHOT_HZ - 0.002;
        this.safe(() => this.sendSnap(world, now));
      }
      if (this.gearDirtyAt >= 0 && now >= this.gearDirtyAt) {
        this.gearDirtyAt = -1;
        this.nextGearRefresh = now + GEAR_REFRESH_S;
        this.safe(() => this.sendGear());
      } else if (now >= this.nextGearRefresh) {
        this.nextGearRefresh = now + GEAR_REFRESH_S;
        this.safe(() => this.sendGear());
      }
    }
    this.safe(() => this.sweepMinions(now));
    // peers whose entity is missing (model load failed earlier, scene raced...) get another chance
    if (G.engine.frame % 60 === 0) for (const p of net.remotePeers()) this.ensureRemote(p);
    this.stats.remotePlayers = this.remotes.size;
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.setActive(false);
  }

  /* ================================================================================================
   * Scene lifecycle
   * ============================================================================================== */

  private onSceneLeaving(): void {
    // The old world is disposed by its scene; just forget our references. Every peer rebuilds its world on a scene
    // change, so what was announced / sent before no longer applies.
    this.remotes.clear();
    this.pending.clear();
    this.remoteMinions.clear();   // the old world is disposed by its scene
    this.lastMinionSig = '';
    this.minionsLive = false;
    this.snapSigs.clear();
    this.sentAt.clear();
    this.announced.clear();
    this.stats.remotePlayers = 0;
  }

  private onSceneChanged(): void {
    if (!this.active) return;
    for (const p of this.net.remotePeers()) this.ensureRemote(p);
    this.markGearDirty(0.4);
  }

  private onPeerJoined(peerId: string): void {
    if (!this.active || peerId === this.net.selfId) return;
    if (this.net.role === 'host') {
      // Late joiner: the next snapshot tick re-sends everything relevant (keyframe) and the spawn announcements start over.
      this.sentAt.clear();
      this.announced.delete(peerId);
    }
    const peer = this.net.peers.get(peerId);
    if (peer) this.ensureRemote(peer);
    this.markGearDirty(0.6); // the newcomer needs our gear
  }

  private markGearDirty(delayS: number): void {
    const t = G.engine.time + delayS;
    if (this.gearDirtyAt < 0 || t < this.gearDirtyAt) this.gearDirtyAt = t;
  }

  private refreshRemoteInfo(): void {
    for (const rec of this.remotes.values()) {
      const peer = this.net.peers.get(rec.peerId);
      if (!peer) continue;
      rec.player.name = peer.name;
      if (peer.summary) rec.player.level = peer.summary.level;
    }
  }

  /* ================================================================================================
   * Remote players
   * ============================================================================================== */

  private ensureRemote(peer: PeerInfo): void {
    if (!this.active || peer.peerId === this.net.selfId) return;
    const world = G.world;
    if (!world || !this.net.sceneIsReady) return;
    const existing = this.remotes.get(peer.peerId);
    if (existing) {
      if (existing.world === world && existing.slot === peer.slot) return;
      this.removeRemote(peer.peerId);
    }
    const id = PARTY_ID_BASE + peer.slot;
    const clash = world.get(id);
    if (clash && clash === world.localPlayer) {
      if (!this.clashWarned.has(peer.peerId)) {
        this.clashWarned.add(peer.peerId);
        console.warn(`[net] remote player id ${id} collides with the local player (slot ${peer.slot})`);
      }
      return;
    }
    const sum = peer.summary;
    const player = new Player({
      id, slot: peer.slot, classId: sum?.classId ?? 'knight', name: peer.name, level: sum?.level ?? 1, isLocal: false, peerId: peer.peerId,
    });
    player.variant = sum?.variant ?? 0;
    if (player.interp) player.interp.delay = NET.INTERP_DELAY_S;
    player.object3d.visible = false; // until the first state arrives (no flash at the origin)
    const look = this.lookCache.get(peer.peerId);
    if (look) player.setRemoteLook(look); // before the model loads: it is built with this variant / tint
    const gear = this.gearCache.get(peer.peerId);
    if (gear) {
      player.visibleGear = gear;
      player.refreshEquipmentVisuals(); // marks gear as known so the model loads with it
    }
    const rec: Remote = { peerId: peer.peerId, slot: peer.slot, world, player, added: false, hasPos: false };
    this.remotes.set(peer.peerId, rec);
    const finish = () => {
      if (this.remotes.get(peer.peerId) !== rec || !this.active || G.world !== world) {
        player.removed = true;
        player.onRemoved();
        return;
      }
      world.add(player);
      rec.added = true;
      const st = this.pending.get(peer.peerId);
      if (st) {
        this.pending.delete(peer.peerId);
        this.applyState(rec, st);
      }
    };
    player.loadModel().then(finish, (err) => {
      console.warn('[net] remote model load failed', err);
      finish();
    });
  }

  private removeRemote(peerId: string): void {
    this.removeMinionsOf(peerId);
    this.pending.delete(peerId);
    this.gearCache.delete(peerId);
    this.lookCache.delete(peerId);
    this.gearSig.delete(peerId);
    this.clocks.delete(peerId);
    const rec = this.remotes.get(peerId);
    if (!rec) return;
    this.remotes.delete(peerId);
    if (rec.added) {
      try {
        rec.world.remove(rec.player);
      } catch {
        /* world already disposed */
      }
    } else {
      rec.player.removed = true;
    }
  }

  private clockOf(peerId: string): PeerClock {
    let c = this.clocks.get(peerId);
    if (!c) this.clocks.set(peerId, (c = new PeerClock()));
    return c;
  }

  /** Map a sender timestamp (its G.engine.time) onto the local clock without jitter. */
  private mapTime(peerId: string, tSender: number): number {
    return this.clockOf(peerId).map(G.engine.time, tSender);
  }

  private applyState(rec: Remote, st: PStateIn): void {
    const pl = rec.player;
    const mapped = this.mapTime(rec.peerId, st.t);
    if (pl.interp) pl.interp.delay = this.clockOf(rec.peerId).delay;
    const latest = pl.interp?.latest;
    const far = latest ? Math.hypot(st.x - latest.x, st.z - latest.z) > TELEPORT_DIST : true;
    if (!rec.hasPos || far) {
      pl.interp?.clear();
      pl.position.set(st.x, st.y, st.z);
      pl.yaw = st.yaw;
      rec.hasPos = true;
      pl.object3d.visible = true;
    }
    pl.applySyncState(st, mapped);
  }

  /* ================================================================================================
   * pstate
   * ============================================================================================== */

  private sendPState(now: number): void {
    const pl = G.player ?? G.world?.localPlayer;
    if (!pl || pl.world !== G.world) return;
    const s = pl.getSyncState();
    const q: PlayerSyncState = {
      x: r2(s.x), y: r2(s.y), z: r2(s.z), yaw: r2(s.yaw), vx: r1(s.vx), vz: r1(s.vz), anim: s.anim,
      hp: Math.round(s.hp), maxHp: Math.round(s.maxHp), res: Math.round(s.res), maxRes: Math.round(s.maxRes), dead: s.dead,
      casting: s.casting ?? null, level: s.level, dodging: s.dodging ?? false, statuses: s.statuses ?? [],
      shot: s.shot ?? null, shotSeq: s.shotSeq ?? 0,
    };
    const sig = `${q.x}|${q.y}|${q.z}|${q.yaw}|${q.anim}|${q.hp}|${q.maxHp}|${q.res}|${q.dead}|${q.casting}|${q.level}|${q.dodging}|${q.shot}|${q.shotSeq}|${q.statuses!.join(',')}`;
    if (sig === this.lastPSig && now - this.lastPAt < NET.IDLE_STATE_INTERVAL_S) return;
    this.lastPSig = sig;
    this.lastPAt = now;
    this.stats.pstateSent++;
    this.net.broadcast('pstate', { ...q, id: pl.id, t: now });
  }

  private onPState(p: NetChannels['pstate'], from: string): void {
    if (!this.active || from === this.net.selfId) return;
    const peer = this.net.peers.get(from);
    if (!peer) return;
    const st = cleanPState(p);
    if (!st) return;
    this.stats.pstateRecv++;
    const rec = this.remotes.get(from);
    if (!rec || !rec.added) {
      this.pending.set(from, st);
      if (!rec) this.ensureRemote(peer);
      return;
    }
    this.applyState(rec, st);
  }

  /* ================================================================================================
   * gear
   * ============================================================================================== */

  private sendGear(): void {
    const eq = G.character?.save.equipment;
    const pl = G.player;
    if (!eq || !pl) return;
    const gear: Partial<Record<EquipSlot, ItemInstance>> = {};
    const hideHelm = !!G.character?.save.flags?.hideHelm; // remote models have no "hide helm" switch: just do not send it
    for (const slot of VISIBLE_SLOTS) {
      const it = eq[slot];
      if (it && !(slot === 'helm' && hideHelm)) gear[slot] = compactItem(it);
    }
    this.stats.gearSent++;
    const ap = G.character?.save.appearance;
    const look: NonNullable<NetChannels['gear']['look']> = { v: Math.round(ap?.variant ?? 0) };
    if (typeof ap?.tint === 'number') look.t = ap.tint;
    if (hideHelm) look.hh = true;
    this.net.broadcast('gear', { id: pl.id, gear, look });
  }

  private onGear(p: NetChannels['gear'], from: string): void {
    if (!this.active || from === this.net.selfId || !isObj(p) || !this.net.peers.has(from)) return;
    const gear = cleanGear(p.gear);
    const look = cleanLook(p.look);
    this.stats.gearRecv++;
    const sig = JSON.stringify(gear) + (look ? JSON.stringify(look) : '');
    if (this.gearSig.get(from) === sig) return;
    this.gearSig.set(from, sig);
    this.gearCache.set(from, gear);
    if (look) this.lookCache.set(from, look);
    const rec = this.remotes.get(from);
    if (rec) {
      if (look) rec.player.setRemoteLook(look);
      rec.player.visibleGear = gear;
      rec.player.refreshEquipmentVisuals();
    }
  }

  /* ================================================================================================
   * snap (enemies, host -> clients)
   * ============================================================================================== */

  private sendSnap(world: World, now: number): void {
    const net = this.net;
    const remotes = world.players.filter((p) => !p.isLocal && !p.removed);
    if (remotes.length === 0) return;
    const open = net.inOpenWorld;
    const radius = open ? NET.OPEN_WORLD_RELEVANCE_RADIUS : NET.RELEVANCE_RADIUS;
    const r2max = radius * radius;
    const targets = open ? net.remotePeers() : [];
    const alive = new Set<number>();
    const cands: SnapCandidate[] = [];
    for (const e of world.enemies) {
      if (e.removed) continue;
      alive.add(e.id);
      const ex = e.position.x, ez = e.position.z;
      let d2 = Infinity;
      for (const p of remotes) {
        const dx = p.position.x - ex, dz = p.position.z - ez;
        const dd = dx * dx + dz * dz;
        if (dd < d2) d2 = dd;
      }
      if (d2 > r2max) continue;
      // Sleeping enemies are not streamed; they wake into the stream (and get announced then).
      if (e.dormant) {
        this.snapSigs.delete(e.id);
        continue;
      }
      let s: EnemySyncState;
      try {
        s = e.getSyncState();
      } catch {
        continue;
      }
      const q = quantizeEnemy(s);
      const sig = enemySig(q);
      const missing =
        open && !e.isDead && (e.id >= HOST_DYNAMIC_ID_BASE || e.packId !== null) &&
        targets.some((p) => this.announced.get(p.peerId)?.has(e.id) !== true);
      const due = now - (this.sentAt.get(e.id) ?? -Infinity) >= NET.KEYFRAME_INTERVAL_S;
      if (!missing && !due && this.snapSigs.get(e.id) === sig) continue;
      cands.push({ e, q, sig, d2, missing });
    }
    if (cands.length > 1) cands.sort((a, b) => a.d2 - b.d2);
    const out: EnemySyncState[] = [];
    const n = Math.min(cands.length, NET.MAX_SNAP_ENEMIES);
    for (let i = 0; i < n; i++) {
      const c = cands[i];
      if (c.missing) this.announce(c.e, targets); // before the entry: same ordered channel, the peer spawns first
      this.snapSigs.set(c.e.id, c.sig);
      this.sentAt.set(c.e.id, now);
      out.push(c.q);
    }
    // Forget enemies that were removed from the world.
    for (const id of this.sentAt.keys()) if (!alive.has(id)) this.sentAt.delete(id);
    for (const id of this.snapSigs.keys()) if (!alive.has(id)) this.snapSigs.delete(id);
    for (const set of this.announced.values()) for (const id of set) if (!alive.has(id)) set.delete(id);
    for (let i = 0; i < out.length; i += NET.SNAP_CHUNK) {
      const enemies = out.slice(i, i + NET.SNAP_CHUNK);
      this.stats.snapSent++;
      this.stats.snapEnemiesSent += enemies.length;
      net.broadcast('snap', { t: now, enemies });
    }
  }

  /** Host, open world: tells each remote peer that does not know `e` yet (receivers ignore a spawn for an id they have). */
  private announce(e: Enemy, targets: PeerInfo[]): void {
    if (e.isDead) return;
    let payload: NetChannels['spawn'] | null = null;
    for (const p of targets) {
      let set = this.announced.get(p.peerId);
      if (!set) this.announced.set(p.peerId, (set = new Set<number>()));
      if (set.has(e.id)) continue;
      set.add(e.id);
      payload ??= spawnPayload(e);
      this.net.sendTo(p.peerId, 'spawn', payload);
    }
  }

  private onSnap(p: NetChannels['snap'], from: string): void {
    const net = this.net;
    if (!this.active || net.role !== 'client' || from !== net.hostId || !isObj(p) || !Array.isArray(p.enemies)) return;
    const world = G.world;
    if (!world) return;
    this.stats.snapRecv++;
    const t = fin(p.t, 0, 1e9, G.engine.time);
    const mapped = this.mapTime(from, t);
    const delay = this.clockOf(from).delay;
    for (const raw of p.enemies.slice(0, 256)) {
      const s = cleanEnemy(raw);
      if (!s) continue;
      const e = world.get(s.id);
      if (!e || e.kind !== 'enemy') {
        this.stats.snapUnknown++;
        continue;
      }
      const en = e as unknown as Enemy;
      if (en.authority) continue; // never overwrite an entity this peer simulates
      en.interp.delay = delay;
      const latest = en.interp.latest;
      if (latest && Math.hypot(s.x - latest.x, s.z - latest.z) > TELEPORT_DIST * 1.5) en.interp.clear();
      en.applySyncState(s, mapped);
    }
  }

  /* ================================================================================================
   * minion (NC43, owner -> all)
   * ============================================================================================== */

  /** Sender: the local player's minions (Minions.list holds only this peer's own, authority true), the full list, 10 Hz. */
  private sendMinions(now: number): void {
    const world = G.world;
    const list = G.minions?.list;
    if (!world || !list) return;
    const out: MinionSync[] = [];
    for (const m of list) {
      if (m.removed || m.world !== world || !m.authority) continue;
      out.push(m.getSyncState());
      if (out.length >= NET.MAX_MINIONS_PER_PEER) break;
    }
    if (out.length === 0 && !this.minionsLive) return;
    // `life` ticks every frame, so it stays out of the signature (the keep-alive carries it)
    let sig = '';
    for (const s of out) sig += `${s.id}|${s.x}|${s.z}|${s.yaw}|${s.anim}|${s.hp}|${s.maxHp};`;
    if (sig === this.lastMinionSig && now - this.lastMinionAt < NET.IDLE_STATE_INTERVAL_S) return;
    this.lastMinionSig = sig;
    this.lastMinionAt = now;
    this.minionsLive = out.length > 0;
    this.net.broadcast('minion', { t: now, minions: out });
  }

  private onMinion(p: NetChannels['minion'], from: string): void {
    if (!this.active || from === this.net.selfId || !isObj(p) || !Array.isArray(p.minions)) return;
    const world = G.world;
    const peer = this.net.peers.get(from);
    if (!world || !peer || !this.net.sceneIsReady) return;
    const ownerId = PARTY_ID_BASE + peer.slot;
    const t = fin(p.t, 0, 1e9, G.engine.time);
    const mapped = this.mapTime(from, t);
    const delay = this.clockOf(from).delay;
    const seen = new Set<number>();
    for (const raw of p.minions.slice(0, NET.MAX_MINIONS_PER_PEER)) {
      const s = cleanMinion(raw, peer.slot);
      if (!s) continue;
      seen.add(s.id);
      let rec = this.remoteMinions.get(s.id);
      if (rec && (rec.world !== world || rec.peerId !== from || rec.m.def.id !== s.defId || rec.m.removed)) {
        this.dropMinion(rec, false);
        rec = undefined;
      }
      if (!rec) {
        if (s.hp <= 0) continue;   // a corpse we never saw alive: nothing to show
        rec = this.createMinion(s, from, ownerId, world, delay) ?? undefined;
        if (!rec) continue;
      }
      const m = rec.m;
      m.interp.delay = delay;
      const latest = m.interp.latest;
      if (latest && Math.hypot(s.x - latest.x, s.z - latest.z) > TELEPORT_DIST) m.interp.clear();
      const wasAlive = !m.isDead;
      m.applySyncState(s, mapped);
      if (wasAlive && m.isDead) {
        try {
          G.vfx.spawn(m.def.deathVfx ?? 'death_bones', m.pointAt(0.2));
        } catch { /* feedback only */ }
      }
    }
    // the snapshot is the sender's whole list: anything of that peer it no longer holds is gone (expired, capped, scene change)
    for (const rec of [...this.remoteMinions.values()]) {
      if (rec.peerId === from && !seen.has(rec.m.id) && !rec.m.isDead) this.dropMinion(rec, true);
    }
  }

  private createMinion(s: MinionSync, peerId: string, ownerId: number, world: World, delay: number): RemoteMinion | null {
    const def = minionDef(s.defId);
    if (!def) return null;
    if (world.get(s.id)) return null;   // never replace an entity that is not one of our remote minion copies
    const m = new Minion(s.id, def, ownerId, s.life);
    m.authority = false;
    m.maxHp = s.maxHp;
    m.hp = s.hp;
    m.position.set(s.x, 0, s.z);
    m.yaw = s.yaw;
    m.interp.delay = delay;
    m.lastSeen = G.engine.time;
    world.add(m);
    if (G.assets) void m.loadModel().catch((e) => console.warn('[net] remote minion model failed', def.id, e));
    const rec: RemoteMinion = { peerId, world, m };
    this.remoteMinions.set(s.id, rec);
    return rec;
  }

  private dropMinion(rec: RemoteMinion, poof: boolean): void {
    this.remoteMinions.delete(rec.m.id);
    if (poof && !rec.m.isDead) {
      try {
        G.vfx.spawn('death_poof', rec.m.pointAt(0.5));
      } catch { /* feedback only */ }
    }
    try {
      rec.world.remove(rec.m);
    } catch { /* world already disposed */ }
  }

  /** Per frame: copies that stopped receiving snapshots, and dead copies whose body has lingered long enough. */
  private sweepMinions(now: number): void {
    if (this.remoteMinions.size === 0) return;
    for (const rec of [...this.remoteMinions.values()]) {
      const m = rec.m;
      if (m.removed || rec.world !== G.world) this.remoteMinions.delete(m.id);
      else if (m.isDead ? m.deathLeft <= 0 : now - m.lastSeen > NET.MINION_STALE_S) this.dropMinion(rec, !m.isDead);
    }
  }

  private removeMinionsOf(peerId: string): void {
    for (const rec of [...this.remoteMinions.values()]) if (rec.peerId === peerId) this.dropMinion(rec, true);
  }

  private clearMinions(): void {
    for (const rec of [...this.remoteMinions.values()]) this.dropMinion(rec, false);
    this.remoteMinions.clear();
  }

  /** The remote Minion copies currently held (tests, debug overlays). */
  get remoteMinionCount(): number {
    return this.remoteMinions.size;
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('[net] replication error', err);
    }
  }
}

/* ==================================================================================================
 * Validation / quantisation helpers
 * ================================================================================================ */

function fin(x: unknown, lo: number, hi: number, fallback: number): number {
  return clampNum(x, lo, hi, fallback);
}

/** Animation clip names ("Running_A", "Armature|Walk", "Attack A:1.25:0.5"): printable, no control characters. */
function clip(x: unknown, maxLen: number): string {
  return typeof x === 'string' ? x.replace(/[^A-Za-z0-9_.:|@# ()+-]/g, '').slice(0, maxLen) : '';
}

function cleanPState(p: unknown): PStateIn | null {
  if (!isObj(p)) return null;
  if (typeof p.x !== 'number' || typeof p.z !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  const statuses = Array.isArray(p.statuses) ? p.statuses.slice(0, 16).map((s) => ident(s, 32)).filter((s) => s.length > 0) : [];
  return {
    x: fin(p.x, -3000, 3000, 0),
    y: fin(p.y, -100, 300, 0),
    z: fin(p.z, -3000, 3000, 0),
    yaw: fin(p.yaw, -100, 100, 0),
    vx: fin(p.vx, -100, 100, 0),
    vz: fin(p.vz, -100, 100, 0),
    anim: clip(p.anim, 48) || 'Idle',
    hp: fin(p.hp, 0, 1e9, 1),
    maxHp: fin(p.maxHp, 1, 1e9, 1),
    res: fin(p.res, 0, 1e6, 0),
    maxRes: fin(p.maxRes, 0, 1e6, 0),
    dead: p.dead === true,
    casting: typeof p.casting === 'string' ? ident(p.casting, 48) || null : null,
    level: Math.round(fin(p.level, 1, 60, 1)),
    dodging: p.dodging === true,
    statuses,
    shot: typeof p.shot === 'string' ? clip(p.shot, 64) || null : null,
    shotSeq: Math.round(fin(p.shotSeq, 0, 2 ** 31, 0)),
    t: fin(p.t, 0, 1e9, G.engine.time),
  };
}

/** One MinionSync of a peer in `slot`: the id must lie in that slot's minion range (MINION_ID_BASE + slot * 1000 + n); the owner is forced to that peer. */
function cleanMinion(raw: unknown, slot: number): MinionSync | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'number' && Number.isFinite(raw.id) ? Math.round(raw.id) : -1;
  const lo = MINION_ID_BASE + slot * 1000;
  if (id < lo || id >= lo + 1000) return null;
  const defId = ident(raw.defId, 48);
  if (!defId || typeof raw.x !== 'number' || typeof raw.z !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return null;
  return {
    id, defId, ownerId: PARTY_ID_BASE + slot,
    x: fin(raw.x, -3000, 3000, 0), z: fin(raw.z, -3000, 3000, 0), yaw: fin(raw.yaw, -100, 100, 0),
    anim: clip(raw.anim, 80),
    hp: fin(raw.hp, 0, 1e9, 0), maxHp: fin(raw.maxHp, 1, 1e9, 1),
    life: fin(raw.life, 0, 3600, 0),
  };
}

function cleanEnemy(raw: unknown): EnemySyncState | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== 'number' || !Number.isFinite(raw.id) || typeof raw.x !== 'number' || typeof raw.z !== 'number') return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return null;
  const s: EnemySyncState = {
    id: Math.round(raw.id),
    x: fin(raw.x, -3000, 3000, 0),
    z: fin(raw.z, -3000, 3000, 0),
    yaw: fin(raw.yaw, -100, 100, 0),
    hp: fin(raw.hp, 0, 1e12, 1),
    maxHp: fin(raw.maxHp, 1, 1e12, 1),
    anim: clip(raw.anim, 48),
    targetId: typeof raw.targetId === 'number' && Number.isFinite(raw.targetId) ? Math.round(raw.targetId) : null,
    cast: typeof raw.cast === 'string' ? ident(raw.cast, 48) || null : null,
    dead: raw.dead === true,
  };
  if (typeof raw.shot === 'string') s.shot = clip(raw.shot, 64) || null;
  else if (raw.shot === null) s.shot = null;
  if (typeof raw.shotSeq === 'number' && Number.isFinite(raw.shotSeq)) s.shotSeq = Math.round(fin(raw.shotSeq, 0, 2 ** 31, 0));
  if (typeof raw.aggroed === 'boolean') s.aggroed = raw.aggroed;
  // vertical worlds: airborne height (codec element 12), validated like pstate y
  if (typeof raw.y === 'number' && syncYOk(raw.y)) s.y = raw.y;
  return s;
}

/** The `spawn` message that lets a peer create `e` under the same id (EnemyFactory receiver). */
function spawnPayload(e: Enemy): NetChannels['spawn'] {
  const out: NetChannels['spawn'] = {
    id: e.id, defId: e.def.id, x: r2(e.position.x), z: r2(e.position.z), level: e.level, packId: e.packId, facing: r2(e.yaw), aggro: e.aggroed,
  };
  if (e.ownerId !== null) out.owner = e.ownerId;
  if (e.tag) out.tag = e.tag;
  if (e.maxHp > 0) out.hpFrac = Math.round((e.hp / e.maxHp) * 100) / 100;
  return out;
}

function quantizeEnemy(s: EnemySyncState): EnemySyncState {
  const q: EnemySyncState = {
    id: s.id, x: r2(s.x), z: r2(s.z), yaw: r2(s.yaw), hp: Math.round(s.hp), maxHp: Math.round(s.maxHp), anim: s.anim,
    targetId: s.targetId, cast: s.cast, dead: s.dead,
  };
  if (s.shot !== undefined) q.shot = s.shot;
  if (s.shotSeq !== undefined) q.shotSeq = s.shotSeq;
  if (s.aggroed !== undefined) q.aggroed = s.aggroed;
  return q;
}

function enemySig(q: EnemySyncState): string {
  return `${q.x}|${q.z}|${q.yaw}|${q.hp}|${q.anim}|${q.targetId}|${q.cast}|${q.dead}|${q.shot ?? ''}|${q.shotSeq ?? ''}|${q.aggroed ?? ''}`;
}

/** Strip an item down to what remote models need (weapon visuals + upgrade glow). */
function compactItem(it: ItemInstance): ItemInstance {
  const out: ItemInstance = { uid: it.uid, baseId: it.baseId, rarity: it.rarity, itemLevel: it.itemLevel, affixes: [] };
  if (it.upgrade) out.upgrade = it.upgrade;
  if (it.uniqueId) out.uniqueId = it.uniqueId;
  if (it.setId) out.setId = it.setId;
  if (it.name) out.name = it.name;
  if (it.sockets?.length) out.sockets = it.sockets.slice(0, 4);
  return out;
}

function cleanItem(x: unknown): ItemInstance | null {
  if (!isObj(x)) return null;
  const baseId = ident(x.baseId, 64);
  if (!baseId) return null;
  const item: ItemInstance = {
    uid: ident(x.uid, 40) || baseId,
    baseId,
    rarity: RARITY_ORDER.find((r) => r === x.rarity) ?? 'common',
    itemLevel: Math.round(fin(x.itemLevel, 0, 999, 0)),
    affixes: [],
  };
  if (typeof x.upgrade === 'number') item.upgrade = Math.round(fin(x.upgrade, 0, 30, 0));
  const unique = ident(x.uniqueId, 48);
  if (unique) item.uniqueId = unique;
  const set = ident(x.setId, 48);
  if (set) item.setId = set;
  const name = sanitizeText(x.name, 64);
  if (name) item.name = name;
  if (Array.isArray(x.sockets)) item.sockets = x.sockets.slice(0, 4).map((s) => (typeof s === 'string' ? ident(s, 48) || null : null));
  return item;
}

type RemoteLook = { variant: number; tint?: number; hideHelm?: boolean };

function cleanLook(x: unknown): RemoteLook | null {
  if (!isObj(x)) return null;
  const look: RemoteLook = { variant: Math.round(fin(x.v, 0, 31, 0)) };
  if (typeof x.t === 'number' && Number.isFinite(x.t)) look.tint = Math.round(fin(x.t, 0, 0xffffff, 0xffffff));
  if (x.hh === true) look.hideHelm = true;
  return look;
}

function cleanGear(x: unknown): Partial<Record<EquipSlot, ItemInstance>> {
  const out: Partial<Record<EquipSlot, ItemInstance>> = {};
  if (!isObj(x)) return out;
  for (const slot of VISIBLE_SLOTS) {
    const it = cleanItem(x[slot]);
    if (it) out[slot] = it;
  }
  return out;
}
