import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { RNG, hashString } from '../../core/utils';
import type { MetinSpotDef, MetinTierDef, WorldRegion } from '../../types/dungeons';
import { EV, nameOfDef, type Pt, type WorldCtx } from './util';

/**
 * Metin stone schedule (GDD_OPENWORLD §4.4): two stones at a time per region on a rotating set of four spots, a destroyed
 * stone replaced after 6-10 min at a different free spot, an untouched stone despawning after 25 min. The stone itself
 * (waves, adds, aura, pulse, idle heal) is the enemy AI of WP3 (ai/metin.ts). Host only; the stones are dynamic entities, so
 * spawnEnemy broadcasts them, and the state changes go out as `ev:metin:<spot>:on|off|dead`.
 * OWNER: scenes module.
 */

/** No stone within this many tiles of another active stone. */
const SPOT_SPACING_TILES = 12;
/** No stone spawns with a player this close to its spot (m). */
const SPOT_CLEAR_M = 25;
/** Staggered boot: each region gets its two stones 15 s apart, the first one 30 s after the start (+15 s per region pair). */
const BOOT_FIRST_SEC = 30;
const BOOT_STAGGER_SEC = 15;
const IDLE_DESPAWN_FALLBACK_MIN = 25;

interface Stone {
  spot: MetinSpotDef;
  pos: Pt;
  enemy: Enemy | null;        // null while the spawn is in flight
  spawnedAt: number;
  damaged: boolean;           // sticky: a stone somebody hit never despawns idle
}

interface RegionRec {
  region: WorldRegion;
  tier: MetinTierDef | undefined;
  spots: MetinSpotDef[];
  stones: Stone[];
  nextAt: number;
  boot: number;               // boot spawns still to do
  rolls: number;              // seed counter for picks
}

const TICK = 0.5;
/** Metin Fırtınası (world event, EventCalendar): three times the stones per region, respawn after this many seconds. */
const STORM_MULT = 3;
const STORM_RESPAWN_SEC = 20;

export class MetinDirector {
  private readonly regions: RegionRec[] = [];
  private readonly rng: RNG;
  private timer = 0;
  private warned = false;
  private storm = false;

  constructor(private readonly ctx: WorldCtx) {
    this.rng = new RNG(hashString(`${ctx.seed}:metin`));
    const { ext } = ctx;
    ext.regions.forEach((region, ri) => {
      const tier = ext.metin.tiers.find((t) => t.regionId === region.id);
      const spots = ext.metin.spots.filter((s) => s.regionId === region.id);
      if (!tier || !spots.length) return;
      this.regions.push({ region, tier, spots, stones: [], nextAt: BOOT_FIRST_SEC + BOOT_STAGGER_SEC * ri, boot: 2, rolls: 0 });
    });
  }

  /** Host: the stones this director spawned and still tracks. */
  liveEnemies(): Enemy[] {
    const out: Enemy[] = [];
    for (const r of this.regions) for (const s of r.stones) if (s.enemy && !s.enemy.isDead && !s.enemy.removed) out.push(s.enemy);
    return out;
  }

  /**
   * Metin Fırtınası (EventCalendar, host): on = the regions keep up to three times their stones and a destroyed stone comes
   * back after STORM_RESPAWN_SEC; each storm stone is tagged `ev:storm`. Off = the normal rules again (no stone is removed).
   */
  setStorm(on: boolean): void {
    this.storm = on;
    if (on) for (const r of this.regions) r.nextAt = Math.min(r.nextAt, this.ctx.world.time);
  }

  update(dt: number): void {
    if (!G.net.isAuthority) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK;
    try {
      const now = this.ctx.world.time;
      for (const r of this.regions) this.tickRegion(r, now);
    } catch (e) {
      if (!this.warned) console.warn('[metin] tick failed', e);
      this.warned = true;
    }
  }

  private tickRegion(r: RegionRec, now: number): void {
    const tier = r.tier;
    if (!tier) return;
    const rng = this.rng;
    // 1. reap: destroyed, vanished or idle stones
    for (const s of [...r.stones]) {
      const e = s.enemy;
      if (!e) continue;
      if (e.isDead || e.removed) {
        this.drop(r, s);
        if (e.isDead) {
          this.ctx.ev(EV.metin(s.spot.id, 'dead'));
          r.nextAt = now + (this.storm ? STORM_RESPAWN_SEC : this.respawnSec(tier, rng));
        }
        continue;
      }
      if (e.hp < e.maxHp) s.damaged = true;
      const idleMin = tier.idleDespawnMin || IDLE_DESPAWN_FALLBACK_MIN;
      if (!s.damaged && now - s.spawnedAt > idleMin * 60) {
        e.escape();
        this.drop(r, s);
        this.ctx.ev(EV.metin(s.spot.id, 'off'));
        r.nextAt = now + this.respawnSec(tier, rng);
      }
    }
    // 2. fill: up to `maxActive` stones per region (x3 during a storm), one spawn at a time
    const cap = Math.max(1, tier.maxActive) * (this.storm ? STORM_MULT : 1);
    if (r.stones.length >= cap || now < r.nextAt) return;
    const spot = this.pickSpot(r, rng);
    r.rolls++;
    if (!spot) {
      r.nextAt = now + 10;
      return;
    }
    this.spawn(r, tier, spot, now);
  }

  private pickSpot(r: RegionRec, rng: RNG): MetinSpotDef | null {
    const ctx = this.ctx;
    const free = r.spots.filter((sp) => {
      const sx = sp.pos[0], sz = sp.pos[1];
      if (r.stones.some((s) => Math.hypot(s.spot.pos[0] - sx, s.spot.pos[1] - sz) < SPOT_SPACING_TILES)) return false;
      const w = ctx.snapTile(sx, sz, 8);
      return ctx.nearestPlayerDist(w.x, w.z) >= SPOT_CLEAR_M;
    });
    return free.length ? rng.pick(free) : null;
  }

  private spawn(r: RegionRec, tier: MetinTierDef, spot: MetinSpotDef, now: number): void {
    const pos = this.ctx.snapTile(spot.pos[0], spot.pos[1], 8);
    const s: Stone = { spot, pos, enemy: null, spawnedAt: now, damaged: false };
    r.stones.push(s);
    const boot = r.boot > 0;
    if (boot) r.boot--;
    r.nextAt = now + (boot ? BOOT_STAGGER_SEC : 1);
    void (async () => {
      let e: Enemy | null = null;
      try {
        e = await spawnEnemy(this.ctx.world, tier.enemyId, pos, { level: tier.level, aggro: false, tag: this.storm ? 'ev:storm' : undefined });
      } catch (err) {
        console.warn(`[metin] ${tier.enemyId} failed to spawn`, err);
      }
      if (!e || e.removed) {
        this.drop(r, s);
        r.nextAt = Math.max(r.nextAt, now + 60);
        return;
      }
      s.enemy = e;
      s.spawnedAt = this.ctx.world.time;
      this.ctx.ev(EV.metin(spot.id, 'on'));
    })();
  }

  private respawnSec(tier: MetinTierDef, rng: RNG): number {
    const [lo, hi] = tier.respawnMin;
    return rng.range(lo, hi) * 60;
  }

  private drop(r: RegionRec, s: Stone): void {
    const i = r.stones.indexOf(s);
    if (i >= 0) r.stones.splice(i, 1);
  }

  /** Display name of a tier (the stone's enemy def name). */
  static tierName(tier: MetinTierDef): string {
    return nameOfDef(tier.enemyId);
  }
}
