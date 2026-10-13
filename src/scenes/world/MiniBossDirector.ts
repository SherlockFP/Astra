import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { MiniBossDef } from '../../types/dungeons';
import type { Pt, WorldCtx } from './util';

/**
 * Mini-bosses (GDD_OPENWORLD §3.6): one per lair, respawn 20 min after the kill (the lair is never filled with a player
 * standing in it). Host only; the fight itself is the enemy AI. OWNER: scenes module.
 */

/** Nobody within this many metres of the lair when it refills. */
const LAIR_CLEAR_M = 40;
/** First spawn after the world starts (s). */
const FIRST_SEC = 60;

interface MbRec {
  def: MiniBossDef;
  at: Pt;
  enemy: Enemy | null;
  pending: boolean;
  nextAt: number;
}

export class MiniBossDirector {
  private readonly recs: MbRec[] = [];
  private warned = false;

  constructor(private readonly ctx: WorldCtx) {
    for (const def of ctx.ext.minibosses) {
      this.recs.push({ def, at: ctx.snapTile(def.lair[0], def.lair[1], 10), enemy: null, pending: false, nextAt: FIRST_SEC });
    }
  }

  liveEnemies(): Enemy[] {
    return this.recs.flatMap((r) => (r.enemy && !r.enemy.isDead && !r.enemy.removed ? [r.enemy] : []));
  }

  update(_dt: number): void {
    if (!G.net.isAuthority) return;
    try {
      const now = this.ctx.world.time;
      for (const rec of this.recs) {
        if (rec.pending) continue;
        if (rec.enemy) {
          if (rec.enemy.isDead || rec.enemy.removed) {
            rec.enemy = null;
            rec.nextAt = now + rec.def.respawnMin * 60;
          }
          continue;
        }
        if (now < rec.nextAt || this.ctx.nearestPlayerDist(rec.at.x, rec.at.z) <= LAIR_CLEAR_M) continue;
        this.spawn(rec, now);
      }
    } catch (e) {
      if (!this.warned) console.warn('[minibosses] tick failed', e);
      this.warned = true;
    }
  }

  private spawn(rec: MbRec, now: number): void {
    rec.pending = true;
    void (async () => {
      let e: Enemy | null = null;
      try {
        e = await spawnEnemy(this.ctx.world, rec.def.enemyId, rec.at, { level: rec.def.level, aggro: false });
      } catch (err) {
        console.warn(`[minibosses] ${rec.def.enemyId} failed to spawn`, err);
      }
      rec.pending = false;
      if (!e || e.removed) {
        rec.nextAt = now + 60;
        return;
      }
      rec.enemy = e;
    })();
  }
}
