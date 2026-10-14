import { G } from '../game/G';
import { SKILLS } from '../data/skills';
import type { World } from '../world/World';
import type { Enemy } from '../entities/Enemy';
import type { Actor } from '../entities/Actor';
import type { EntityId } from '../types/common';
import type { EnemyAI } from './EnemyAI';
import type { SpawnEnemyOpts } from '../entities/EnemyFactory';

/** Late-bound spawner (EnemyFactory registers itself) so AI code never imports the factory (module cycle). */
export const hooks: {
  spawn: ((world: World, defId: string, pos: { x: number; z: number }, opts: SpawnEnemyOpts) => Promise<Enemy | null>) | null;
} = { spawn: null };

export interface BonePile {
  x: number; z: number;
  /** world time it was left */
  t: number;
  enemy: Enemy | null;
  level: number;
  packId: string | null;
  taken: boolean;
}

const CELL = 3;
/** WoW-style social aggro: a pack-less neighbour pulls in only within this many metres of the puller, and only when it is already inside its own aggro range of the target. */
export const SOCIAL_AGGRO_M = 10;
const key = (cx: number, cz: number) => (cx + 2048) * 4096 + (cz + 2048);

/**
 * Per-world coordinator for enemy AI (a World system). Owns:
 *  - a spatial hash of living enemies (separation steering, body pulls),
 *  - melee slot ranks per target (hordes surround instead of stacking: max 6 attackers, the rest circle at 3-4 m),
 *  - pack / linked-pack / body pulls,
 *  - bone piles (skeleton corpses that Kemik Büyücüsü raises and Morkan explodes),
 *  - subscriptions to damage / death / heal events (shield refunds, caster interrupts, death effects, threat from healing).
 * OWNER: enemies module.
 */
export class EnemyDirector {
  readonly world: World;
  readonly ais: EnemyAI[] = [];
  readonly piles: BonePile[] = [];
  /** findPath calls left this frame (A* is the only expensive thing the AI does). */
  pathBudget = 4;
  /** Linked packs registered by the dungeon scene: pulling one pulls the others. */
  readonly packLinks = new Map<string, Set<string>>();
  private grid = new Map<number, Enemy[]>();
  private pullTimer = 0;
  private offs: (() => void)[] = [];
  private dead = false;
  private tmp: Enemy[] = [];
  private safeQuery: ((x: number, z: number) => boolean) | null = null;

  /** Open world: `fn(x, z)` is true inside a village safe zone. Enemies never target or aggro players there. */
  setSafeQuery(fn: ((x: number, z: number) => boolean) | null): void {
    this.safeQuery = fn;
  }

  /** True when (x,z) lies inside a safe zone (always false without a query). Never throws. */
  inSafeZone(x: number, z: number): boolean {
    if (!this.safeQuery) return false;
    try {
      return this.safeQuery(x, z);
    } catch {
      return false;
    }
  }

  constructor(world: World) {
    this.world = world;
    world.addSystem(this);
    const ev = G.events;
    this.offs.push(ev.on('damage', (d) => this.onDamageEvent(d)));
    this.offs.push(ev.on('death', (d) => this.onDeathEvent(d)));
    this.offs.push(ev.on('heal', (d) => this.onHealEvent(d)));
    this.offs.push(ev.on('boss:phase', () => {
      ev.emit('camera:shake', { intensity: 0.5, duration: 0.5 });
      ev.emit('hitstop', { ms: 120 });
    }));
  }

  dispose(): void {
    this.dead = true;
    for (const o of this.offs) o();
    this.offs = [];
    this.ais.length = 0;
    this.piles.length = 0;
    this.grid.clear();
  }

  register(ai: EnemyAI): void {
    if (!this.ais.includes(ai)) this.ais.push(ai);
  }

  unregister(ai: EnemyAI): void {
    const i = this.ais.indexOf(ai);
    if (i >= 0) this.ais.splice(i, 1);
  }

  /** Dungeon scene: pulling a pack pulls the packs it links to (and vice versa). */
  linkPacks(a: string, b: string): void {
    if (!this.packLinks.has(a)) this.packLinks.set(a, new Set());
    if (!this.packLinks.has(b)) this.packLinks.set(b, new Set());
    this.packLinks.get(a)!.add(b);
    this.packLinks.get(b)!.add(a);
  }

  // ------------------------------------------------------------------------------------------------------------
  // frame
  // ------------------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.dead) return;
    this.pathBudget = 4;
    // spatial hash
    this.grid.clear();
    const enemies = this.world.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.isDead || e.removed) continue;
      const k = key(Math.floor(e.position.x / CELL), Math.floor(e.position.z / CELL));
      const b = this.grid.get(k);
      if (b) b.push(e);
      else this.grid.set(k, [e]);
    }
    this.assignSlots();
    this.pullTimer -= dt;
    if (this.pullTimer <= 0) {
      this.pullTimer = 0.4;
      this.bodyPulls();
    }
    // pile expiry
    const now = this.world.time;
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const p = this.piles[i];
      if (p.taken || now - p.t > 12) this.piles.splice(i, 1);
    }
  }

  /** Living enemies within `r` of (x,z), including `except`'s neighbours only. Reuses an internal array. */
  near(x: number, z: number, r: number): Enemy[] {
    const out = this.tmp;
    out.length = 0;
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
    const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    const r2 = r * r;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const b = this.grid.get(key(cx, cz));
        if (!b) continue;
        for (const e of b) {
          const dx = e.position.x - x, dz = e.position.z - z;
          if (dx * dx + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  /** Melee ranks per target: closest chasers get rank 0.. and only the first MAX_MELEE may attack. */
  private assignSlots(): void {
    const byTarget = new Map<EntityId, EnemyAI[]>();
    for (const ai of this.ais) {
      ai.slotRank = 0;
      if (!ai.wantsSlot()) continue;
      const t = ai.e.targetId;
      if (t == null) continue;
      let l = byTarget.get(t);
      if (!l) byTarget.set(t, (l = []));
      l.push(ai);
    }
    for (const [tid, list] of byTarget) {
      if (list.length <= 1) continue;
      const tgt = this.world.get(tid);
      if (!tgt) continue;
      const tx = tgt.position.x, tz = tgt.position.z;
      for (const ai of list) ai.slotDist = Math.hypot(ai.e.position.x - tx, ai.e.position.z - tz);
      list.sort((a, b) => a.slotDist - b.slotDist);
      for (let i = 0; i < list.length; i++) list[i].slotRank = i;
    }
  }

  private bodyPulls(): void {
    for (const ai of this.ais.slice()) {
      if (!ai.aggroed || ai.e.isDead || !ai.target) continue;
      for (const o of this.near(ai.e.position.x, ai.e.position.z, 4)) {
        const oa = o.ai;
        if (!oa || oa === ai || oa.aggroed || o.def.ai?.summoned || o.def.ai?.flee) continue;
        if (o.def.aggroRange <= 0) continue;
        // a touch-pull reaches the camp, or a pack-less neighbour already in aggro range of the target (no chain across the room)
        if (!this.campMates(ai.e, o) && !this.inAggroRangeOf(o, ai.target)) continue;
        this.pullPack(oa, ai.target);
      }
    }
  }

  /** Same camp: both have a packId and the packs are equal or linked by a dungeon (linkPacks). */
  private campMates(a: Enemy, b: Enemy): boolean {
    const pa = a.packId, pb = b.packId;
    if (!pa || !pb) return false;
    return pa === pb || !!this.packLinks.get(pa)?.has(pb);
  }

  /** `e` stands within its own aggro range of `target` (it could already see the target; the social pull needs that). */
  private inAggroRangeOf(e: Enemy, target: Actor): boolean {
    return e.def.aggroRange > 0 && Math.hypot(e.position.x - target.position.x, e.position.z - target.position.z) <= e.def.aggroRange;
  }

  /**
   * Aggro `ai` and the enemies it pulls. Only its own camp (same packId, plus packs a dungeon linked to it) comes along at any
   * distance; other packs are never pulled. A pack-less neighbour is social-pulled only within SOCIAL_AGGRO_M (10 m) of the puller,
   * on the same level, and only when it is already inside its own aggro range of the target. A social pull never sweeps the room.
   */
  pullPack(ai: EnemyAI, target: Actor | null): void {
    if (!target) return;
    ai.acquire(target, true);
    for (const o of this.ais.slice()) {
      if (o === ai || o.aggroed || o.e.isDead) continue;
      const op = o.e.packId;
      if (op) {
        if (this.campMates(ai.e, o.e)) o.acquire(target, true);
        continue;
      }
      if (o.e.def.aggroRange <= 0 || o.e.def.ai?.summoned) continue;
      // vertical: a pack-less neighbour on another level (balcony / pit) is not pulled (ENGINE_VERTICALITY §12)
      const nav = this.world.nav;
      const d = Math.hypot(o.e.position.x - ai.e.position.x, o.e.position.z - ai.e.position.z);
      if (d <= SOCIAL_AGGRO_M && (!nav.vertical || nav.sameRegion(o.e.position, ai.e.position)) && this.inAggroRangeOf(o.e, target)) o.acquire(target, true);
    }
  }

  /**
   * P-14 noise (a channel gate opening, a winch drop): every idle enemy within `r` of (x, z) is pulled onto the nearest living
   * player, with its pack. Host only (AI decisions run on the host); nothing happens when no player is alive in the safe range.
   */
  alertNear(x: number, z: number, r: number): void {
    const idle = this.near(x, z, r).slice();
    for (const e of idle) {
      const ai = e.ai;
      if (!ai || ai.aggroed || e.isDead || e.def.aggroRange <= 0 || e.def.ai?.summoned) continue;
      let best: Actor | null = null;
      let bd = Infinity;
      for (const p of this.world.players) {
        if (p.isDead || this.inSafeZone(p.position.x, p.position.z)) continue;
        const d = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) this.pullPack(ai, best);
    }
  }

  // ------------------------------------------------------------------------------------------------------------
  // bone piles
  // ------------------------------------------------------------------------------------------------------------

  /** Unclaimed piles within `r` of (x,z), nearest first. */
  pilesNear(x: number, z: number, r: number): BonePile[] {
    return this.piles.filter((p) => !p.taken && Math.hypot(p.x - x, p.z - z) <= r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  claimPile(p: BonePile): void {
    p.taken = true;
    if (p.enemy && !p.enemy.removed) p.enemy.escape(); // escape(): removal is replicated, the corpse vanishes on every peer
  }

  // ------------------------------------------------------------------------------------------------------------
  // events
  // ------------------------------------------------------------------------------------------------------------

  private enemyOf(id: EntityId): Enemy | null {
    const e = this.world.get(id);
    return e && e.kind === 'enemy' ? (e as Enemy) : null;
  }

  private onDamageEvent(d: { targetId: EntityId; sourceId: EntityId | null; amount: number; crit: boolean; kind: string; skillId?: string }): void {
    const e = this.enemyOf(d.targetId);
    if (!e || !e.authority || e.isDead || d.amount <= 0) return;
    // shield absorb: Combat does not know enemy shields, so refund what the shield took (the event fires before the death check)
    const sh = e.statuses.get('shield');
    if (sh && sh.magnitude > 0) {
      const through = e.statuses.absorb(d.amount);
      const absorbed = d.amount - through;
      if (absorbed > 0) e.hp = Math.min(e.maxHp, e.hp + absorbed);
    }
    e.ai?.onDamageEvent(d);
  }

  private onDeathEvent(d: { entityId: EntityId; killerId: EntityId | null }): void {
    const e = this.enemyOf(d.entityId);
    if (!e) return;
    if (e.authority) {
      try {
        e.ai?.runDeathEffects(d.killerId);
      } catch (err) {
        console.error('[enemy] death effects failed', err);
      }
    }
    if (e.def.ai?.bonePile) {
      this.piles.push({ x: e.position.x, z: e.position.z, t: this.world.time, enemy: e, level: e.level, packId: e.packId, taken: false });
    }
    // allies react (Fanatik)
    if (e.authority) for (const ai of this.ais) if (ai.e !== e && !ai.e.isDead) ai.onAllyDied(e);
  }

  private onHealEvent(d: { targetId: EntityId; sourceId: EntityId | null; amount: number }): void {
    // healing generates threat on every engaged enemy (0.5 per point, split between them)
    if (!G.net || !G.net.isAuthority || d.sourceId == null || d.amount <= 0) return;
    const src = this.world.get(d.sourceId);
    if (!src || src.kind !== 'player') return;
    const engaged = this.ais.filter((a) => a.aggroed && !a.e.isDead);
    if (!engaged.length) return;
    const share = (d.amount * 0.5) / engaged.length;
    for (const a of engaged) a.addThreat(d.sourceId, share);
  }
}

const directors = new WeakMap<World, EnemyDirector>();

export function getDirector(world: World): EnemyDirector {
  let d = directors.get(world);
  if (!d) {
    d = new EnemyDirector(world);
    directors.set(world, d);
  }
  return d;
}

export function peekDirector(world: World | null | undefined): EnemyDirector | undefined {
  return world ? directors.get(world) : undefined;
}

/** True if a hit with this skill / crit state is heavy enough to flinch trash (interrupt a cast). */
export function isHeavyHit(d: { crit: boolean; amount: number; skillId?: string }, maxHp: number): boolean {
  if (d.crit) return true;
  if (d.amount >= maxHp * 0.2) return true;
  const w = d.skillId ? SKILLS[d.skillId]?.params?.weight : undefined;
  return (w ?? 0) >= 1;
}
