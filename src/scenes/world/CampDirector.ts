import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { CarryRec } from '../../net/Carryover';
import { getEnemyDef } from '../../data/enemies';
import { rollOpenWorldChampion } from '../../ai/champion';
import { RNG, hashString } from '../../core/utils';
import { DUNGEON_ENEMY_ID_BASE, HOST_DYNAMIC_ID_BASE } from '../../types/common';
import { WORLD_PACK_STRIDE, type PackDef, type WorldPerf } from '../../types/dungeons';
import { EV, spawnPayloadOf, tileToWorld, type Pt, type WorldCtx } from './util';
import { CampIndex } from './CampIndex';

/**
 * Camp streaming (GDD_OPENWORLD §1.5.2). Host only. Camps and patrols of the map are spawned when a player comes within
 * `radius + activateM` and despawned when every player is beyond `radius + deactivateM` and nobody is aggroed.
 * Members have deterministic ids (DUNGEON_ENEMY_ID_BASE + packIndex * WORLD_PACK_STRIDE + memberIndex), so a respawn reuses
 * the same id and clients never invent one: the host announces each spawn on the `spawn` channel with that explicit id, and
 * removes it with `remove: true` (Enemy.escape). A camp refreshes `respawnSec` after its LAST kill (WoW-style: the timer keeps running
 * with players around, and shortens when 3+ players are near), but only when no member spawn point has a player within 10 m and the
 * camp is not in combat. Above the 240-enemy budget the farthest camps are deactivated first.
 * Champions of a camp are rolled once per activation and announced as `ev:champ` so every peer shows the plate.
 * Big zones (docs/ENGINE_BIGMAPS.md): a tick only visits the camps that can act - active ones, ones waiting for their respawn timer
 * (kept by world time, so a camp far away still comes back on schedule) and ones a player is near, found through a bucket index -
 * instead of every camp of the map. The decisions are exactly the old loop's, in the same (index) order.
 * OWNER: scenes module.
 */

interface Member {
  k: number;                 // member index inside the pack (part of the id)
  id: number;
  defId: string;
  x: number;
  z: number;
  level: number;
  facing: number;
  patrol?: Pt[];
}

interface Camp {
  /** Position in the director's camp list (the index buckets and the awake sets hold slots). */
  slot: number;
  index: number;             // pack index in DungeonDef.packs (part of the id)
  pack: PackDef;
  cx: number;
  cz: number;
  radius: number;
  respawnSec: number;
  members: Member[];
  dead: Set<number>;         // member indices killed since the last camp refresh
  live: Map<number, Enemy>;  // spawned and alive
  pending: Set<number>;      // spawn in flight
  active: boolean;
  activations: number;
  championFor: number;       // activation number the champions were rolled for
  lastKillAt: number | null; // world time of the last kill (camp fully dead)
}

const TICK = 0.5;
/** Key of a camp in the channel ledger (NetSession.ledgerNote / ledgerRemaining). */
const ledgerKey = (packId: string): string => `camp:${packId}`;
/** A camp only refreshes when no player stands within this many m of any member's spawn point (nothing spawns on top of a player). */
const REFRESH_CLEAR_M = 10;
/** Dynamic respawn: with RESPAWN_CROWD_N or more players within a camp's reach its timer is cut to RESPAWN_CROWD_MULT (never below the floor). */
const RESPAWN_CROWD_N = 3;
const RESPAWN_CROWD_MULT = 0.6;
const RESPAWN_FLOOR_SEC = 15;
/** Host-loss carry-over: how long (world s) the records of the old host's world are kept, at most this many host-dynamic enemies come back, and the farthest a restored body may be from its spawn point. */
const CARRY_KEEP_S = 180;
const CARRY_DYNAMIC_MAX = 24;
const CARRY_MAX_SHIFT_M = 80;

export class CampDirector {
  private readonly camps: Camp[] = [];
  private index!: CampIndex;
  /** Slots of active camps / of camps whose members are all dead and wait for the respawn timer. */
  private readonly activeSlots = new Set<number>();
  private readonly refreshing = new Set<number>();
  private timer = 0;
  private warned = false;
  private ledgerRestored = false;
  private carryRestored = false;
  /** World time (s) after which the host-loss records are dropped (hurt camp members of far camps still read them when they activate). */
  private carryUntil = 0;

  constructor(private readonly ctx: WorldCtx, private readonly perf: WorldPerf) {
    ctx.def.packs.forEach((pk, index) => {
      const members: Member[] = [];
      const patrol = pk.patrol?.length ? pk.patrol.map(([tx, tz]) => ctx.snapTile(tx, tz)) : undefined;
      pk.members.forEach((m, k) => {
        if (k >= WORLD_PACK_STRIDE) {
          if (!this.warned) console.warn(`[camps] ${pk.id} has more than ${WORLD_PACK_STRIDE} members`);
          return;
        }
        if (!getEnemyDef(m.enemyId)) {
          console.warn(`[camps] unknown enemy ${m.enemyId} in ${pk.id}`);
          return;
        }
        const id = DUNGEON_ENEMY_ID_BASE + index * WORLD_PACK_STRIDE + k;
        if (id >= HOST_DYNAMIC_ID_BASE) return;
        const sp = ctx.snapTile(pk.center[0] + m.offset[0], pk.center[1] + m.offset[1]);
        const level = pk.levelRange
          ? new RNG(hashString(`${ctx.seed}:${pk.id}:${k}`)).int(pk.levelRange[0], pk.levelRange[1])
          : ctx.params.enemyLevel;
        const facing = new RNG(hashString(`${ctx.seed}:${pk.id}:${k}:f`)).next() * Math.PI * 2;
        members.push({ k, id, defId: m.enemyId, x: sp.x, z: sp.z, level, facing, patrol });
      });
      if (!members.length) return;
      this.camps.push({
        slot: this.camps.length,
        index,
        pack: pk,
        cx: tileToWorld(pk.center[0]),
        cz: tileToWorld(pk.center[1]),
        radius: pk.radius ?? 12,
        respawnSec: pk.respawnSec ?? 120,
        members,
        dead: new Set(),
        live: new Map(),
        pending: new Set(),
        active: false,
        activations: 0,
        championFor: -1,
        lastKillAt: null,
      });
    });
    this.index = new CampIndex(this.camps);
  }

  /** Number of camps (camps + patrols) on the map. */
  get size(): number {
    return this.camps.length;
  }

  /**
   * Centres (world m) of the camps and patrols that still have a member alive: every camp not wiped since its last refresh. Known
   * exactly on the host; a client knows only its own kills, so it counts every camp (the stricter answer for a release point).
   */
  livingCenters(): Pt[] {
    const out: Pt[] = [];
    for (const c of this.camps) if (c.dead.size < c.members.length) out.push({ x: c.cx, z: c.cz });
    return out;
  }

  /** Per-frame: runs the streaming tick every 0.5 s on the host. Never throws. */
  update(dt: number): void {
    if (!G.net.isAuthority) return;
    // a host that just took over a channel waits (a few seconds at most) for the members' records of the old host's world
    if (G.net.carryReady?.() === false) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK;
    try {
      this.tick(this.ctx.world.time);
    } catch (e) {
      if (!this.warned) console.warn('[camps] tick failed', e);
      this.warned = true;
    }
  }

  /** Enemies of the active camps (host): used to re-send them to a late joiner. */
  liveEnemies(): Enemy[] {
    const out: Enemy[] = [];
    for (const c of this.camps) for (const e of c.live.values()) if (!e.isDead && !e.removed) out.push(e);
    return out;
  }

  /** Host: a peer joined the running world. Sends it every live camp member with the explicit id (and the champions). */
  resendTo(peerId: string): void {
    for (const e of this.liveEnemies()) {
      try {
        G.net.sendTo(peerId, 'spawn', spawnPayloadOf(e));
        if (e.champion) G.net.sendTo(peerId, 'gate', { key: EV.champ(e.id, e.championMod), open: true });
      } catch {
        /* offline */
      }
    }
  }

  /**
   * Public channels (net/Channels.ts): a host that took over a channel starts with every camp alive - the world was re-seeded from the
   * data. Camps that were wiped before the old host left are still on their respawn timer in the channel ledger (wall clock): mark
   * them dead again, `respawnSec - remaining` ago, so they come back on schedule. Runs once, on the first tick.
   */
  private restoreFromLedger(now: number): void {
    this.ledgerRestored = true;
    for (const c of this.camps) {
      const rem = G.net.ledgerRemaining(ledgerKey(c.pack.id));
      if (rem <= 0) continue;
      for (const m of c.members) c.dead.add(m.k);
      c.lastKillAt = now - Math.max(0, c.respawnSec - rem);
      this.refreshing.add(c.slot);
    }
  }

  /**
   * Host-loss carry-over (net/Carryover.ts): the world was re-seeded from the data, the members' records say what the old host's world
   * looked like. Camp members that were dead stay dead (a camp wiped a moment ago keeps its respawn clock), hurt living ones are rebuilt in
   * spawnMember (same HP fraction and place), and host-dynamic enemies (rares, event mobs) come back under their old ids. Runs once.
   */
  private restoreFromCarry(now: number): void {
    this.carryRestored = true;
    const rest = (G.net.carryRest?.() ?? []);
    if (!rest.length) return;
    this.carryUntil = now + CARRY_KEEP_S;
    for (const c of this.camps) {
      let newest = Infinity;
      for (const m of c.members) {
        const r = G.net.carryPeek?.(m.id);
        if (!r || r.defId !== m.defId || !r.dead) continue;
        G.net.carryTake?.(m.id);
        c.dead.add(m.k);
        newest = Math.min(newest, r.age);
      }
      if (c.dead.size >= c.members.length && c.lastKillAt === null) {
        c.lastKillAt = now - Math.min(c.respawnSec, Number.isFinite(newest) ? newest : 0);
        this.refreshing.add(c.slot);
      }
    }
    const world = this.ctx.world;
    let n = 0;
    for (const r of rest) {
      if (r.dead || r.id < HOST_DYNAMIC_ID_BASE || n >= CARRY_DYNAMIC_MAX) continue;
      if (world.get(r.id)) continue;
      // a rare / event mob the fresh world already spawned itself: do not double it
      if (world.enemies.some((e) => !e.removed && !e.isDead && e.def.id === r.defId && Math.hypot(e.position.x - r.x, e.position.z - r.z) < 40)) continue;
      n++;
      G.net.carryTake?.(r.id);
      this.spawnRestored(r);
    }
  }

  /** A host-dynamic enemy of the old host's world, brought back under its old id with its HP fraction. */
  private spawnRestored(r: CarryRec): void {
    const world = this.ctx.world;
    world.noteHostId(r.id);
    void (async () => {
      try {
        const e = await spawnEnemy(world, r.defId, { x: r.x, z: r.z }, {
          id: r.id, level: r.level, packId: r.packId, facing: r.yaw, openWorld: r.openWorld, tag: r.tag || undefined, aggro: r.aggro,
          stealth: r.stealth, dormant: r.dormant ? true : undefined,
        });
        if (!e || e.removed) return;
        this.applyCarry(e, r);
        G.net.broadcast('spawn', spawnPayloadOf(e));
      } catch (err) {
        console.warn(`[camps] restoring ${r.defId} failed`, err);
      }
    })();
  }

  /** The old host's HP fraction, place and facing on a freshly built body. */
  private applyCarry(e: Enemy, r: CarryRec): void {
    if (r.maxHp > 0) e.hp = Math.min(e.maxHp, Math.max(1, Math.round((e.maxHp * r.hp) / r.maxHp)));
    if (Number.isFinite(r.x) && Number.isFinite(r.z) && Math.hypot(r.x - e.position.x, r.z - e.position.z) <= CARRY_MAX_SHIFT_M) {
      e.position.x = r.x;
      e.position.z = r.z;
      e.yaw = r.yaw;
    }
  }

  private tick(now: number): void {
    const { ctx, perf } = this;
    if (!this.ledgerRestored) this.restoreFromLedger(now);
    if (!this.carryRestored) this.restoreFromCarry(now);
    else if (this.carryUntil > 0 && now >= this.carryUntil) {
      this.carryUntil = 0;
      G.net.carryDone?.();
    }
    const cap = perf.maxActiveEnemies;
    const budget = { n: cap - ctx.aliveEnemies() };
    // only the camps that can act: active, waiting for the respawn timer, or with a player within activation reach
    const awake = new Set<number>([...this.activeSlots, ...this.refreshing]);
    const pts = ctx.world.players.filter((p) => !p.removed).map((p) => ({ x: p.position.x, z: p.position.z }));
    for (const slot of this.index.near(pts, perf.activateM)) awake.add(slot);
    for (const slot of [...awake].sort((x, y) => x - y)) {
      const c = this.camps[slot];
      this.collectDeaths(c, now);
      const nearest = ctx.nearestPlayerDist(c.cx, c.cz);
      // refresh: the whole camp comes back on its timer after its last kill (cut with a crowd), never with a player on a spawn point or in combat
      if (c.dead.size >= c.members.length && c.lastKillAt !== null && now - c.lastKillAt >= this.respawnTimeFor(c, pts) && !this.anyAggro(c) && this.spawnPointsClear(c)) {
        c.dead.clear();
        c.lastKillAt = null;
        this.refreshing.delete(c.slot);
      }
      if (!c.active && nearest <= c.radius + perf.activateM && budget.n > 0) {
        c.active = true;
        this.activeSlots.add(c.slot);
        c.activations++;
      }
      if (!c.active) continue;
      if (nearest > c.radius + perf.deactivateM && !this.anyAggro(c)) {
        this.deactivate(c);
        continue;
      }
      this.fill(c, budget);
      this.rollChampionsIfReady(c);
    }
    // 240-enemy budget: the farthest calm camps leave first (rares, mini-bosses, metin waves and boss adds are not camp members)
    if (ctx.aliveEnemies() > cap) {
      const calm = [...this.activeSlots]
        .sort((x, y) => x - y) // index order, like the full loop (ties in the distance sort keep it)
        .map((slot) => this.camps[slot])
        .filter((c) => c.active && !this.anyAggro(c))
        .map((c) => ({ c, d: ctx.nearestPlayerDist(c.cx, c.cz) }))
        .sort((a, b) => b.d - a.d);
      let alive = ctx.aliveEnemies();
      for (const { c } of calm) {
        if (alive <= cap) break;
        alive -= c.live.size;
        this.deactivate(c);
      }
    }
  }

  private collectDeaths(c: Camp, now: number): void {
    for (const [k, e] of c.live) {
      if (e.isDead) {
        c.live.delete(k);
        c.dead.add(k);
        if (c.dead.size >= c.members.length) {
          c.lastKillAt = now;
          this.refreshing.add(c.slot);
          // public channel: remember the wipe by WALL CLOCK so a host that takes over (re-seeded world) keeps the timer running
          G.net.ledgerNote(ledgerKey(c.pack.id), c.respawnSec);
        }
      } else if (e.removed) {
        c.live.delete(k);
      }
    }
  }

  /** Respawn timer (s) of a camp: its own `respawnSec`, cut to RESPAWN_CROWD_MULT when RESPAWN_CROWD_N players are within its reach. */
  private respawnTimeFor(c: Camp, pts: Pt[]): number {
    let near = 0;
    const reach = c.radius + this.perf.activateM;
    for (const p of pts) if (Math.hypot(p.x - c.cx, p.z - c.cz) <= reach) near++;
    if (near < RESPAWN_CROWD_N) return c.respawnSec;
    return Math.min(c.respawnSec, Math.max(RESPAWN_FLOOR_SEC, c.respawnSec * RESPAWN_CROWD_MULT));
  }

  /** True when no player stands within REFRESH_CLEAR_M of any member's spawn point. */
  private spawnPointsClear(c: Camp): boolean {
    for (const m of c.members) if (this.ctx.nearestPlayerDist(m.x, m.z) < REFRESH_CLEAR_M) return false;
    return true;
  }

  private anyAggro(c: Camp): boolean {
    for (const e of c.live.values()) if (e.aggroed && !e.isDead && !e.removed) return true;
    return false;
  }

  /** Spawn every member of an active camp that is neither dead, alive, nor already on its way (budget permitting). */
  private fill(c: Camp, budget: { n: number }): void {
    const world = this.ctx.world;
    for (const m of c.members) {
      if (c.dead.has(m.k) || c.live.has(m.k) || c.pending.has(m.k)) continue;
      const prior = world.get(m.id) as Enemy | undefined;
      if (prior) {
        // still in the world (a removal finishing this frame, or a corpse): adopt a living one, otherwise wait
        if (!prior.removed && !prior.isDead && prior.kind === 'enemy') c.live.set(m.k, prior);
        continue;
      }
      if (budget.n <= 0) return;
      budget.n--;
      this.spawnMember(c, m);
    }
  }

  private spawnMember(c: Camp, m: Member): void {
    const world = this.ctx.world;
    c.pending.add(m.k);
    const pk = c.pack;
    void (async () => {
      let e: Enemy | null = null;
      try {
        e = await spawnEnemy(world, m.defId, { x: m.x, z: m.z }, {
          id: m.id,
          level: m.level,
          packId: pk.id,
          facing: m.facing,
          patrol: m.patrol,
          dormant: pk.dormant ? true : undefined,
          stealth: pk.stealth,
          wakeRadius: pk.dormant?.wakeRadius,
          linkedTo: pk.linkedTo,
          openWorld: true,
        });
      } catch (err) {
        console.warn(`[camps] ${m.defId} failed to spawn`, err);
      }
      c.pending.delete(m.k);
      if (!e || e.removed) return;
      if (!c.active) {
        // the camp emptied while the model loaded: no peer has seen it, so it can vanish silently
        world.remove(e);
        return;
      }
      e.campX = c.cx;
      e.campZ = c.cz;
      e.campR = c.radius;
      const carried = G.net.carryTake?.(m.id);
      if (carried && carried.defId === m.defId && !carried.dead) this.applyCarry(e, carried);
      c.live.set(m.k, e);
      try {
        G.net.broadcast('spawn', spawnPayloadOf(e));
      } catch {
        /* offline */
      }
    })();
  }

  /** One champion roll per activation, once every member that may spawn is in place (seeded: the same on every peer). */
  private rollChampionsIfReady(c: Camp): void {
    if (c.championFor === c.activations) return;
    if (c.pending.size > 0) return;
    for (const m of c.members) if (!c.dead.has(m.k) && !c.live.has(m.k)) return;
    c.championFor = c.activations;
    const list = [...c.live.values()].filter((e) => !e.isDead && !e.removed);
    if (list.length < 4) return;
    const rng = new RNG(hashString(`${this.ctx.seed}:champ:${c.pack.id}:${c.activations}`));
    try {
      // rollOpenWorldChampion already applies the modifier (makeChampion) on this peer
      for (const ch of rollOpenWorldChampion(list, rng, c.pack.championChance ?? 0.12)) this.ctx.ev(EV.champ(ch.id, ch.championMod));
    } catch (err) {
      console.warn('[camps] champion roll failed', err);
    }
  }

  private deactivate(c: Camp): void {
    c.active = false;
    this.activeSlots.delete(c.slot);
    for (const e of c.live.values()) if (!e.removed && !e.isDead) e.escape();
    c.live.clear();
  }
}
