import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { BossPlacement, WorldBossSched, WorldRegion } from '../../types/dungeons';
import { EV, type Pt, type WorldCtx } from './util';

/**
 * World boss schedule (GDD_OPENWORLD §3.8): Çürükkök is alive when the world starts and returns 15 min after each death;
 * Alevkanat appears 10 min after the start once a player of level 22+ has entered its region (R5) and returns 40 min after
 * each death. Warnings go out `announceSec` seconds before a spawn (`ev:boss:<id>:warn:<sec>`), the spawn itself as
 * `ev:boss:<id>:up`. Host only; the bosses are dynamic entities (broadcast by spawnEnemy) with their WORLD_SCRIPTS (WP3).
 * OWNER: scenes module.
 */

/** Fixed levels of the world bosses (GDD §3.8: Çürükkök 10, Alevkanat 27). */
export const WORLD_BOSS_LEVEL: Record<string, number> = { wb_curukkok: 10, wb_alevkanat: 27, wb_ulu_boz: 40 };

interface BossRec {
  sched: WorldBossSched;
  placement: BossPlacement;
  arenaRegion: WorldRegion | undefined;
  at: Pt;
  level: number;
  enemy: Enemy | null;
  pending: boolean;
  unlocked: boolean;
  spawnAt: number;
  warned: Set<number>;
}

const DEG = Math.PI / 180;

export class BossSchedule {
  private readonly recs: BossRec[] = [];
  private warned = false;

  constructor(private readonly ctx: WorldCtx) {
    for (const sched of ctx.ext.bosses) {
      const placement = ctx.def.bosses.find((b) => b.bossId === sched.bossId);
      if (!placement) continue;
      this.recs.push({
        sched,
        placement,
        arenaRegion: ctx.regionAtTile(placement.pos[0], placement.pos[1]) ?? undefined,
        at: ctx.snapTile(placement.pos[0], placement.pos[1], 8),
        level: WORLD_BOSS_LEVEL[sched.bossId] ?? ctx.params.enemyLevel,
        enemy: null,
        pending: false,
        unlocked: !sched.minLevelToStart,
        spawnAt: sched.firstSec,
        warned: new Set(),
      });
    }
  }

  liveEnemies(): Enemy[] {
    return this.recs.flatMap((r) => (r.enemy && !r.enemy.isDead && !r.enemy.removed ? [r.enemy] : []));
  }

  /** Announcement text of a boss (Turkish, from the schedule). */
  textOf(bossId: string): string {
    return this.recs.find((r) => r.sched.bossId === bossId)?.sched.announceText ?? '';
  }

  /** Arena centre of a boss (world metres), for the local warning shake. */
  arenaOf(bossId: string): Pt | null {
    return this.recs.find((r) => r.sched.bossId === bossId)?.at ?? null;
  }

  /**
   * Dünya Boss'u (EventCalendar, host): bring an unlocked boss forward to now. Ignored while it is alive or its spawn is in
   * flight; the usual warnings are skipped (the calendar announces the event). Returns true when a spawn was scheduled.
   */
  expedite(bossId: string): boolean {
    const rec = this.recs.find((r) => r.sched.bossId === bossId);
    if (!rec || !rec.unlocked || rec.enemy || rec.pending) return false;
    rec.spawnAt = this.ctx.world.time;
    rec.warned = new Set(rec.sched.announceSec);
    return true;
  }

  update(_dt: number): void {
    if (!G.net.isAuthority) return;
    try {
      const now = this.ctx.world.time;
      for (const rec of this.recs) this.tick(rec, now);
    } catch (e) {
      if (!this.warned) console.warn('[bosses] schedule tick failed', e);
      this.warned = true;
    }
  }

  private tick(rec: BossRec, now: number): void {
    const ctx = this.ctx;
    const sched = rec.sched;
    if (!rec.unlocked) {
      const need = sched.minLevelToStart ?? 0;
      const seen = !!rec.arenaRegion && ctx.world.players.some((p) => !p.removed && p.level >= need && ctx.regionAt(p.position.x, p.position.z) === rec.arenaRegion);
      if (!seen) return;
      rec.unlocked = true;
      // unlocked late: the usual warnings are behind us, so give the players the longest lead time once
      if (rec.spawnAt < now) {
        rec.spawnAt = now + Math.max(0, ...sched.announceSec, 60);
        rec.warned.clear();
      }
    }
    if (rec.enemy) {
      if (rec.enemy.isDead || rec.enemy.removed) {
        rec.enemy = null;
        rec.spawnAt = now + sched.respawnSec;
        rec.warned.clear();
        ctx.ev(EV.boss(sched.bossId, 'dead'));
      }
      return;
    }
    if (rec.pending) return;
    for (const a of sched.announceSec) {
      if (!rec.warned.has(a) && now >= rec.spawnAt - a) {
        rec.warned.add(a);
        ctx.ev(EV.boss(sched.bossId, 'warn', a));
      }
    }
    if (now >= rec.spawnAt) this.spawn(rec, now);
  }

  private spawn(rec: BossRec, now: number): void {
    rec.pending = true;
    void (async () => {
      let e: Enemy | null = null;
      try {
        e = await spawnEnemy(this.ctx.world, rec.sched.bossId, rec.at, { level: rec.level, facing: (rec.placement.facing ?? 0) * DEG });
      } catch (err) {
        console.warn(`[bosses] ${rec.sched.bossId} failed to spawn`, err);
      }
      rec.pending = false;
      if (!e || e.removed) {
        rec.spawnAt = now + 60;
        return;
      }
      rec.enemy = e;
      this.ctx.ev(EV.boss(rec.sched.bossId, 'up'));
    })();
  }
}
