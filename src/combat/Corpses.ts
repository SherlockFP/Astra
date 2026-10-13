/**
 * Corpse registry (GDD_CLASSES_V2 §1.6, NC45). `G.corpses`, ticked once per frame from Game.ts after G.minions.
 *
 * What it is: a lightweight list of "something died here" records that skills can consume (raise dead, corpse explosion, Epidemic-like
 * spreads; behaviors_necromancer.ts `raise_dead` / `corpse_explosion`). It owns no entity and no mesh: the enemy entity keeps its own
 * death animation and sink (Combat.corpses), this list outlives it.
 *
 * Authority: NONE, nothing is networked. Every peer fills its own list from the death handling it already runs (`Combat.finalizeDeath`
 * is the single caller: host after the kill, clients from the `death` message), so the lists agree up to the moment a peer consumes one.
 * A consumed corpse is only removed on the consuming peer; the damage / the minion that came out of it is replicated by the usual
 * paths (`hit`, `minion`). Therefore skills must look corpses up by POSITION (`nearest / within / take`), never by id from another peer.
 * The id of a corpse is the id of the enemy that died (deterministic for dungeon enemies), a re-death (revived enemy) replaces the record.
 *
 *   add(x, z, defId, rank, level, opts?)   register a corpse (GDD signature). `rank 'boss'` leaves none. Past `maxCount` (16) the oldest goes.
 *   onEnemyKilled(enemy)                   the death hook (Combat.finalizeDeath, next to the loot hook)
 *   nearest(x, z, r, y?) / within(...)     read-only queries, nearest first (ties: lower id)
 *   count(x, z, r, y?)                     corpses in the circle
 *   take(x, z, r, y?) / takeMany(...)      consume the nearest (up to `max`) corpse(s) in the circle
 *   consume(id)                            consume one by id (local use: UI, dev)
 *   clear(reason?)                         everything leaves (scene change, tests)
 *   update(dt)                             expiry, revived-enemy cleanup, wisp visuals
 * Events: `corpse:added {id,x,z,defId,rank,level}`, `corpse:removed {id,x,z,reason}` (consumed | expired | cleared). A cap eviction and a
 * revived enemy are reported as 'expired' / 'consumed'. Life: `life` s (default 30; talent n_nc_corpse_collector `corpseLife` adds a share).
 */
import { G } from '../game/G';
import { sp } from './specials';
import type { Enemy } from '../entities/Enemy';
import type { EnemyRank } from '../types/enemies';
import type { VfxHandle } from '../vfx/VFX';

/** Default seconds a corpse stays (before the corpse-collector talent). */
export const CORPSE_LIFE = 30;
/** Most corpses at once; the oldest leaves when a new one arrives. */
export const CORPSE_MAX = 16;
/** Vertical tolerance (m) of the optional `y` filter of the queries (same idea as World.sameLevel). */
const CORPSE_DY = 4;

export interface Corpse {
  /** The dead enemy's entity id (a record of a re-dying enemy replaces the old one). */
  id: number;
  x: number;
  z: number;
  /** Feet height at death (vertical worlds). */
  y: number;
  defId: string;
  rank: EnemyRank;
  level: number;
  name: string;
  /** Registry clock (s) at death / at expiry. */
  diedAt: number;
  expiresAt: number;
}

type RemoveReason = 'consumed' | 'expired' | 'cleared';

export class Corpses {
  /** Seconds a new corpse lasts (before talents). */
  life = CORPSE_LIFE;
  maxCount = CORPSE_MAX;
  private readonly items: Corpse[] = [];
  /** Wisp handle per corpse id (null = the spawn failed once: do not retry every frame). */
  private readonly wisps = new Map<number, VfxHandle | null>();
  /** Enemy entity per corpse (revive detection only; never read for positions). */
  private readonly sources = new Map<number, Enemy>();
  private clock = 0;
  private nextAnon = -1;

  constructor() {
    G.events.on('scene:leaving', () => this.clear('cleared'));
  }

  /** Live corpses, oldest first. Do not mutate. */
  get list(): readonly Corpse[] { return this.items; }

  /** Registry time in seconds (advances with `update`). */
  get time(): number { return this.clock; }

  /**
   * Registers a corpse. `rank 'boss'` leaves none (returns null). `opts.id` defaults to a fresh negative id (never collides with entity
   * ids); the death hook passes the enemy id. A record with the same id is replaced.
   */
  add(x: number, z: number, defId: string, rank: EnemyRank, level: number, opts: { id?: number; y?: number; life?: number; name?: string } = {}): Corpse | null {
    if (rank === 'boss' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const id = opts.id ?? this.nextAnon--;
    const old = this.items.findIndex((c) => c.id === id);
    if (old >= 0) this.drop(old, 'expired');
    let life = opts.life ?? this.life;
    if (opts.life === undefined) {
      try { life *= 1 + Math.max(0, sp('n_nc_corpse_collector')?.corpseLife ?? 0); } catch { /* no character in tests */ }
    }
    const c: Corpse = { id, x, z, y: opts.y ?? 0, defId, rank, level, name: opts.name ?? defId, diedAt: this.clock, expiresAt: this.clock + Math.max(0.1, life) };
    this.items.push(c);
    while (this.items.length > Math.max(1, this.maxCount)) this.drop(0, 'expired');
    G.events.emit('corpse:added', { id: c.id, x: c.x, z: c.z, defId: c.defId, rank: c.rank, level: c.level });
    this.showWisp(c);
    return c;
  }

  /** The death hook: called by Combat.finalizeDeath for every enemy that dies on this peer (host and clients). Never throws. */
  onEnemyKilled(enemy: Enemy): Corpse | null {
    try {
      const d = enemy.def;
      if (!d || d.rank === 'boss' || enemy.isBoss) return null;
      const c = this.add(enemy.position.x, enemy.position.z, d.id, d.rank, enemy.level ?? 1, { id: enemy.id, y: enemy.position.y, name: d.name });
      if (c) this.sources.set(c.id, enemy);
      return c;
    } catch (e) {
      console.error('[corpses] onEnemyKilled failed', e);
      return null;
    }
  }

  /** Corpses within `r` of (x, z) (and `CORPSE_DY` of `y` when given), nearest first, ties by lower id. */
  within(x: number, z: number, r: number, y?: number | null): Corpse[] {
    const out: { c: Corpse; d: number }[] = [];
    for (const c of this.items) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      if (y != null && Math.abs(c.y - y) > CORPSE_DY) continue;
      out.push({ c, d });
    }
    out.sort((a, b) => a.d - b.d || a.c.id - b.c.id);
    return out.map((o) => o.c);
  }

  nearest(x: number, z: number, r: number, y?: number | null): Corpse | null {
    return this.within(x, z, r, y)[0] ?? null;
  }

  count(x: number, z: number, r: number, y?: number | null): number {
    return this.within(x, z, r, y).length;
  }

  /** Consumes the nearest corpse within `r` of (x, z); null when there is none. */
  take(x: number, z: number, r: number, y?: number | null): Corpse | null {
    const c = this.nearest(x, z, r, y);
    return c ? this.consume(c.id) : null;
  }

  /** Consumes up to `max` corpses within `r` of (x, z), nearest first. */
  takeMany(x: number, z: number, r: number, max: number, y?: number | null): Corpse[] {
    const out: Corpse[] = [];
    for (const c of this.within(x, z, r, y)) {
      if (out.length >= max) break;
      const got = this.consume(c.id);
      if (got) out.push(got);
    }
    return out;
  }

  /** Consumes a corpse by id (returns the record, or null if it is gone). */
  consume(id: number): Corpse | null {
    const i = this.items.findIndex((c) => c.id === id);
    return i >= 0 ? this.drop(i, 'consumed') : null;
  }

  /** Everything leaves (scene change, tests). */
  clear(reason: RemoveReason = 'cleared'): void {
    while (this.items.length) this.drop(this.items.length - 1, reason);
    for (const w of this.wisps.values()) if (w) this.stopWisp(w);
    this.wisps.clear();
    this.sources.clear();
  }

  /** Per frame: advances the clock, removes expired corpses and the ones whose enemy was revived, keeps the wisps in step. */
  update(dt: number): void {
    this.clock += Math.max(0, dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const c = this.items[i];
      if (this.clock >= c.expiresAt) { this.drop(i, 'expired'); continue; }
      const src = this.sources.get(c.id);
      // revived by a Diriltici champion: the body is gone, the record must not be raised a second time
      if (src && !src.removed && !src.isDead) { this.drop(i, 'consumed'); continue; }
    }
    // wisps follow the local class: shown for a necromancer (also for corpses laid before it joined), hidden otherwise
    if (!this.wantWisps()) {
      if (this.wisps.size) { for (const w of this.wisps.values()) if (w) this.stopWisp(w); this.wisps.clear(); }
      return;
    }
    for (const c of this.items) if (!this.wisps.has(c.id)) this.showWisp(c);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------------------------------------------------------

  private drop(i: number, reason: RemoveReason): Corpse | null {
    const [c] = this.items.splice(i, 1);
    if (!c) return null;
    const w = this.wisps.get(c.id);
    if (w) this.stopWisp(w);
    this.wisps.delete(c.id);
    this.sources.delete(c.id);
    G.events.emit('corpse:removed', { id: c.id, x: c.x, z: c.z, reason });
    return c;
  }

  /** Wisps are shown only while the local player is a necromancer (GDD §1.6). */
  private wantWisps(): boolean {
    return G.world?.localPlayer?.classId === 'necromancer';
  }

  /** A looping green wisp over the corpse (alias soul_wisp); fails silently (no vfx service, unknown id). */
  private showWisp(c: Corpse): void {
    if (!this.wantWisps() || this.wisps.has(c.id)) return;
    try {
      this.wisps.set(c.id, G.vfx?.spawn('soul_wisp', [c.x, c.y + 0.4, c.z], { duration: Math.max(0.5, c.expiresAt - this.clock) }) ?? null);
    } catch { this.wisps.set(c.id, null); /* cosmetic only */ }
  }

  private stopWisp(h: VfxHandle): void {
    try { h.stop(); } catch { /* cosmetic only */ }
  }
}
