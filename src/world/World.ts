import * as THREE from 'three';
import { NavGrid } from './NavGrid';
import type { Entity } from '../entities/Entity';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { HOST_DYNAMIC_ID_BASE, LOCAL_ID_BASE, type EntityId, type Team } from '../types/common';

const _v = new THREE.Vector3();

/** Structural subset of the Heightfield API (docs/ENGINE_VERTICALITY.md §4, src/world/Heightfield.ts by V1). */
export interface WorldHeights {
  groundY(x: number, z: number): number;
  ceilingY(x: number, z: number): number;
  killY(x: number, z: number): number;
}

/** Same value as VERT.TOL_MELEE (§2, Heightfield.ts). Keep in sync until the import is possible. */
const TOL_MELEE = 2.5;

/**
 * Simulation container for the current town/dungeon. Owns entities, the nav grid and spatial queries.
 * Created by TownScene/DungeonScene; exposed as G.world while active.
 * update(): entities update in insertion order; removed entities are cleaned up at the end of the frame.
 */
export class World {
  readonly scene: THREE.Scene;
  nav: NavGrid;
  /**
   * Vertical dungeon (§6). Set together with `heights` by DungeonScene (`vertical = !!built.hf`). false = legacy XZ-only
   * behaviour in every query, so a missed call site stays legacy.
   */
  vertical = false;
  heights: WorldHeights | null = null;
  /** Seconds since the world was created (scaled by hit-stop). */
  time = 0;
  readonly entities = new Map<EntityId, Entity>();
  /** Fast lists maintained on add/remove. */
  readonly players: Player[] = [];
  readonly enemies: Enemy[] = [];
  localPlayer: Player | null = null;
  private nextLocalId = LOCAL_ID_BASE;
  private nextHostId = HOST_DYNAMIC_ID_BASE;
  /** Systems that want a per-frame tick tied to this world's lifetime (hazards, affixes, spawners). */
  private systems: { update(dt: number): void; dispose?(): void }[] = [];
  /** Entities removed this frame. Reused every frame so update() does not allocate. */
  private readonly doomed: Entity[] = [];

  constructor(scene: THREE.Scene, nav?: NavGrid) {
    this.scene = scene;
    this.nav = nav ?? new NavGrid({ originX: -100, originZ: -100, width: 200, depth: 200, walkable: true });
  }

  allocLocalId(): EntityId {
    return this.nextLocalId++;
  }
  /** Host only: id for a dynamically spawned networked entity. */
  allocHostId(): EntityId {
    return this.nextHostId++;
  }
  /** Clients: keep the host counter in sync when they learn about a host id. */
  noteHostId(id: EntityId): void {
    if (id >= this.nextHostId && id < LOCAL_ID_BASE) this.nextHostId = id + 1;
  }

  add<T extends Entity>(e: T): T {
    if (this.entities.has(e.id)) {
      console.warn(`[world] duplicate entity id ${e.id}, replacing`);
      this.removeNow(this.entities.get(e.id)!);
    }
    this.entities.set(e.id, e);
    if (e.kind === 'player') this.players.push(e as unknown as Player);
    else if (e.kind === 'enemy') this.enemies.push(e as unknown as Enemy);
    e.onAdded(this);
    return e;
  }

  get<T extends Entity = Entity>(id: EntityId | null | undefined): T | undefined {
    return id == null ? undefined : (this.entities.get(id) as T | undefined);
  }

  getActor(id: EntityId | null | undefined): Actor | undefined {
    const e = this.get(id);
    return e && (e.kind === 'player' || e.kind === 'enemy') ? (e as unknown as Actor) : undefined;
  }

  remove(e: Entity | EntityId): void {
    const ent = typeof e === 'number' ? this.entities.get(e) : e;
    if (ent) ent.removed = true;
  }

  private removeNow(e: Entity): void {
    this.entities.delete(e.id);
    if (e.kind === 'player') {
      const i = this.players.indexOf(e as unknown as Player);
      if (i >= 0) this.players.splice(i, 1);
      if (this.localPlayer === (e as unknown as Player)) this.localPlayer = null;
    } else if (e.kind === 'enemy') {
      const i = this.enemies.indexOf(e as unknown as Enemy);
      if (i >= 0) this.enemies.splice(i, 1);
    }
    e.onRemoved();
  }

  addSystem(s: { update(dt: number): void; dispose?(): void }): () => void {
    this.systems.push(s);
    return () => {
      const i = this.systems.indexOf(s);
      if (i >= 0) this.systems.splice(i, 1);
    };
  }

  // ---- spatial queries (XZ plane) ----

  /**
   * Feet-height gate (§6): true when the world is not vertical, `y` is omitted, or the actor's feet are within `tol` of `y`.
   */
  sameLevel(a: { position: { y: number } }, y: number, tol = TOL_MELEE): boolean {
    return !this.vertical || Math.abs(a.position.y - y) <= tol;
  }

  /**
   * Living actors whose circle intersects the query circle. `y`/`tol` add the feet-height gate (vertical worlds only);
   * omitted `y` keeps the legacy XZ-only behaviour.
   */
  actorsInRadius(pos: { x: number; z: number }, radius: number, filter?: (a: Actor) => boolean, y?: number | null, tol = TOL_MELEE): Actor[] {
    const out: Actor[] = [];
    const scan = (a: Actor) => {
      if (a.isDead) return;
      const r = radius + a.radius;
      if ((a.position.x - pos.x) ** 2 + (a.position.z - pos.z) ** 2 <= r * r && (!filter || filter(a)) && (y == null || this.sameLevel(a, y, tol))) out.push(a);
    };
    for (const p of this.players) scan(p);
    for (const e of this.enemies) scan(e);
    return out;
  }

  enemiesInRadius(pos: { x: number; z: number }, radius: number, y?: number | null, tol = TOL_MELEE): Enemy[] {
    return this.actorsInRadius(pos, radius, (a) => a.kind === 'enemy', y, tol) as unknown as Enemy[];
  }

  playersInRadius(pos: { x: number; z: number }, radius: number, y?: number | null, tol = TOL_MELEE): Player[] {
    return this.actorsInRadius(pos, radius, (a) => a.kind === 'player', y, tol) as unknown as Player[];
  }

  /** Hostile actors relative to a team. */
  hostilesOf(team: Team, pos: { x: number; z: number }, radius: number, y?: number | null, tol = TOL_MELEE): Actor[] {
    return this.actorsInRadius(pos, radius, (a) => a.team !== team && a.team !== 'neutral', y, tol);
  }

  /** Actors inside a cone (arc in degrees, centered on dir which must be normalized on XZ). */
  actorsInCone(origin: { x: number; z: number }, dir: { x: number; z: number }, range: number, arcDeg: number, filter?: (a: Actor) => boolean, y?: number | null, tol = TOL_MELEE): Actor[] {
    const cosHalf = Math.cos(((arcDeg / 2) * Math.PI) / 180);
    return this.actorsInRadius(origin, range, (a) => {
      if (filter && !filter(a)) return false;
      const dx = a.position.x - origin.x, dz = a.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d <= a.radius + 0.3) return true; // overlapping: always hit
      return (dx * dir.x + dz * dir.z) / d >= cosHalf - a.radius / Math.max(d, 0.001) * 0.5;
    }, y, tol);
  }

  /** Actors within `width/2` of the segment origin -> origin + dir*length. */
  actorsInLine(origin: { x: number; z: number }, dir: { x: number; z: number }, length: number, width: number, filter?: (a: Actor) => boolean, y?: number | null, tol = TOL_MELEE): Actor[] {
    return this.actorsInRadius({ x: origin.x + dir.x * length * 0.5, z: origin.z + dir.z * length * 0.5 }, length * 0.5 + width, (a) => {
      if (filter && !filter(a)) return false;
      const dx = a.position.x - origin.x, dz = a.position.z - origin.z;
      const t = Math.max(0, Math.min(length, dx * dir.x + dz * dir.z));
      const px = origin.x + dir.x * t - a.position.x, pz = origin.z + dir.z * t - a.position.z;
      return Math.hypot(px, pz) <= width / 2 + a.radius;
    }, y, tol);
  }

  nearest<T extends Actor>(list: readonly T[], pos: { x: number; z: number }, maxDist = Infinity, filter?: (a: T) => boolean): T | null {
    let best: T | null = null;
    let bd = maxDist * maxDist;
    for (const a of list) {
      if (a.isDead || (filter && !filter(a))) continue;
      const d = (a.position.x - pos.x) ** 2 + (a.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Ground height at x,z (flat world unless `heights` is set; builders may override for stairs/terrain). */
  groundY(x: number, z: number): number {
    return this.heights ? this.heights.groundY(x, z) : 0;
  }

  /**
   * Ceiling height above x,z (CONTROLS_WOW §7.2). Infinity = no ceiling (open town, unknown rooms), so the WoW camera's ceiling
   * clamp and indoor zoom cap stay dormant. DungeonBuilder overrides it once RoomDef.ceiling exists (CORE_MECHANICS §13).
   */
  ceilingY(x: number, z: number): number {
    return this.heights ? this.heights.ceilingY(x, z) : Infinity;
  }

  /**
   * Intersect a ray with the ground. Flat: the plane y = 0 (legacy). Vertical: first point where the ray is at or below
   * groundY(x,z), searched from the plane-0 estimate (16 m band, 0.5 m march, 6 bisections).
   */
  rayToGround(ray: THREE.Ray, out = new THREE.Vector3()): THREE.Vector3 | null {
    const o = ray.origin, d = ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    const t0 = (0 - o.y) / d.y;
    if (t0 < 0) return null;
    if (!this.vertical || !this.heights) return out.copy(o).addScaledVector(d, t0);
    const h = this.heights;
    const f = (t: number) => o.y + t * d.y - h.groundY(o.x + t * d.x, o.z + t * d.z);
    const band = 16 / Math.abs(d.y);
    const step = 0.5 / Math.hypot(d.x, d.y, d.z);
    let tPrev = Math.max(0, t0 - band);
    let fPrev = f(tPrev);
    if (fPrev <= 0) {
      tPrev = 0;
      fPrev = f(0);
      if (fPrev <= 0) return null;
    }
    const tEnd = t0 + band + step;
    for (let t = tPrev + step; t <= tEnd; t += step) {
      if (f(t) <= 0) {
        let lo = tPrev, hi = t;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          if (f(m) > 0) lo = m; else hi = m;
        }
        return out.copy(o).addScaledVector(d, hi);
      }
      tPrev = t;
    }
    return null;
  }

  update(dt: number): void {
    this.time += dt;
    for (const e of this.entities.values()) {
      if (e.removed) continue;
      try {
        e.update(dt);
      } catch (err) {
        console.error(`[world] entity ${e.id} (${e.kind}) update failed`, err);
      }
    }
    for (const s of this.systems) {
      try {
        s.update(dt);
      } catch (err) {
        console.error('[world] system update failed', err);
      }
    }
    const doomed = this.doomed;
    for (const e of this.entities.values()) if (e.removed) doomed.push(e);
    try {
      for (const e of doomed) this.removeNow(e);
    } finally {
      doomed.length = 0;
    }
    _v.set(0, 0, 0);
  }

  dispose(): void {
    for (const s of this.systems) s.dispose?.();
    this.systems = [];
    for (const e of [...this.entities.values()]) this.removeNow(e);
  }
}
