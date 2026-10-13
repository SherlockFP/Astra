import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { getEnemyDef } from '../../data/enemies';
import { rollOpenWorldChampion } from '../../ai/champion';
import { RNG, hashString } from '../../core/utils';
import { DUNGEON_ENEMY_ID_BASE, HOST_DYNAMIC_ID_BASE } from '../../types/common';
import { WORLD_PACK_STRIDE, type PackDef, type WorldPerf } from '../../types/dungeons';
import { EV, spawnPayloadOf, tileToWorld, type Pt, type WorldCtx } from './util';

/**
 * Camp streaming (GDD_OPENWORLD §1.5.2). Host only. Camps and patrols of the map are spawned when a player comes within
 * `radius + activateM` and despawned when every player is beyond `radius + deactivateM` and nobody is aggroed.
 * Members have deterministic ids (DUNGEON_ENEMY_ID_BASE + packIndex * WORLD_PACK_STRIDE + memberIndex), so a respawn reuses
 * the same id and clients never invent one: the host announces each spawn on the `spawn` channel with that explicit id, and
 * removes it with `remove: true` (Enemy.escape). A camp refreshes `respawnSec` after its LAST kill, but only when no player is
 * within `radius + 30` m. Above the 240-enemy budget the farthest camps are deactivated first.
 * Champions of a camp are rolled once per activation and announced as `ev:champ` so every peer shows the plate.
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
/** A camp only refreshes when no player stands within radius + this (m). */
const REFRESH_CLEAR_M = 30;

export class CampDirector {
  private readonly camps: Camp[] = [];
  private timer = 0;
  private warned = false;

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
  }

  /** Number of camps (camps + patrols) on the map. */
  get size(): number {
    return this.camps.length;
  }

  /** Per-frame: runs the streaming tick every 0.5 s on the host. Never throws. */
  update(dt: number): void {
    if (!G.net.isAuthority) return;
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

  private tick(now: number): void {
    const { ctx, perf } = this;
    const cap = perf.maxActiveEnemies;
    const budget = { n: cap - ctx.aliveEnemies() };
    for (const c of this.camps) {
      this.collectDeaths(c, now);
      const nearest = ctx.nearestPlayerDist(c.cx, c.cz);
      // refresh: the whole camp comes back `respawnSec` after its last kill, never with a player standing next to it
      if (c.dead.size >= c.members.length && c.lastKillAt !== null && now - c.lastKillAt >= c.respawnSec && nearest > c.radius + REFRESH_CLEAR_M) {
        c.dead.clear();
        c.lastKillAt = null;
      }
      if (!c.active && nearest <= c.radius + perf.activateM && budget.n > 0) {
        c.active = true;
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
      const calm = this.camps
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
        if (c.dead.size >= c.members.length) c.lastKillAt = now;
      } else if (e.removed) {
        c.live.delete(k);
      }
    }
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
    for (const e of c.live.values()) if (!e.removed && !e.isDead) e.escape();
    c.live.clear();
  }
}
