import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { RNG, hashString } from '../../core/utils';
import type { RareSpawnDef, WorldRegion } from '../../types/dungeons';
import { EV, type WorldCtx } from './util';

/**
 * Named rares (GDD_OPENWORLD §3.5), host only. Every rare has 2-3 candidate spots and a respawn window in minutes. When the
 * timer is up, a player stands in the rare's region and no player is within 40 m of the chosen spot, it spawns (announced to
 * the players within 150 m) and stays until it dies or 20 min pass without a player within 150 m.
 * OWNER: scenes module.
 */

/** Nobody within this many metres of the spot when a rare appears. */
const SPOT_CLEAR_M = 40;
/** Announce / keep-alive radius (m). */
const NEAR_M = 150;
/** Despawn when nobody came within NEAR_M for this long (s). */
const LEAVE_AFTER_SEC = 20 * 60;

interface RareRec {
  def: RareSpawnDef;
  region: WorldRegion | undefined;
  spots: { x: number; z: number }[];   // world points of the spots
  enemy: Enemy | null;
  pending: boolean;
  nextAt: number;
  lastNearAt: number;
  rolls: number;
}

const TICK = 0.5;

export class RareDirector {
  private readonly recs: RareRec[] = [];
  private readonly rng: RNG;
  private timer = 0;
  private warned = false;

  constructor(private readonly ctx: WorldCtx) {
    this.rng = new RNG(hashString(`${ctx.seed}:rares`));
    for (const def of ctx.ext.rares) {
      if (!def.spots.length) continue;
      const first = def.spots[0];
      const spots = def.spots.map(([tx, tz]) => ctx.snapTile(tx, tz, 8));
      this.recs.push({
        def,
        region: ctx.regionAtTile(first[0], first[1]) ?? undefined,
        spots,
        enemy: null,
        pending: false,
        nextAt: new RNG(hashString(`${ctx.seed}:rare0:${def.id}`)).range(def.respawnMin[0], def.respawnMin[1]) * 60,
        lastNearAt: 0,
        rolls: 0,
      });
    }
  }

  liveEnemies(): Enemy[] {
    return this.recs.flatMap((r) => (r.enemy && !r.enemy.isDead && !r.enemy.removed ? [r.enemy] : []));
  }

  update(dt: number): void {
    if (!G.net.isAuthority) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK;
    try {
      const now = this.ctx.world.time;
      for (const rec of this.recs) this.tick(rec, now);
    } catch (e) {
      if (!this.warned) console.warn('[rares] tick failed', e);
      this.warned = true;
    }
  }

  private respawnSec(rec: RareRec): number {
    return this.rng.range(rec.def.respawnMin[0], rec.def.respawnMin[1]) * 60;
  }

  private tick(rec: RareRec, now: number): void {
    const { ctx } = this;
    if (rec.pending) return;
    const rng = this.rng;
    const e = rec.enemy;
    if (e) {
      if (e.isDead || e.removed) {
        rec.enemy = null;
        if (e.isDead) ctx.ev(EV.rare(rec.def.id, 'dead'));
        rec.nextAt = now + this.respawnSec(rec);
        return;
      }
      // an alive rare stays while somebody is near; otherwise it leaves after LEAVE_AFTER_SEC
      if (ctx.nearestPlayerDist(e.position.x, e.position.z) <= NEAR_M) rec.lastNearAt = now;
      else if (now - rec.lastNearAt > LEAVE_AFTER_SEC) {
        e.escape();
        rec.enemy = null;
        rec.nextAt = now + this.respawnSec(rec);
      }
      return;
    }
    if (now < rec.nextAt) return;
    rec.rolls++;
    // a player must be in the rare's region (the world is only populated where people walk)
    if (!rec.region || !ctx.livePlayers().some((p) => ctx.regionAt(p.position.x, p.position.z) === rec.region)) {
      rec.nextAt = now + 20;
      return;
    }
    const free = rec.spots.map((s, i) => ({ s, i })).filter(({ s }) => ctx.nearestPlayerDist(s.x, s.z) >= SPOT_CLEAR_M);
    if (!free.length) {
      rec.nextAt = now + 15;
      return;
    }
    const pick = rng.pick(free);
    this.spawn(rec, pick.s, pick.i, now);
  }

  private spawn(rec: RareRec, spot: { x: number; z: number }, spotIdx: number, now: number): void {
    rec.pending = true;
    void (async () => {
      let e: Enemy | null = null;
      try {
        e = await spawnEnemy(this.ctx.world, rec.def.enemyId, spot, { level: rec.def.level, aggro: false });
      } catch (err) {
        console.warn(`[rares] ${rec.def.enemyId} failed to spawn`, err);
      }
      rec.pending = false;
      if (!e || e.removed) {
        rec.nextAt = now + 60;
        return;
      }
      rec.enemy = e;
      rec.lastNearAt = this.ctx.world.time;
      if (rec.def.announce) this.ctx.ev(EV.rare(rec.def.id, 'up', spotIdx));
    })();
  }
}
