import * as THREE from 'three';
import { Entity } from './Entity';
import { G } from '../game/G';
import type { Actor } from './Actor';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import type { EntityId } from '../types/common';
import type { VfxId } from '../types/vfx';

export type ProjectileMode = 'player' | 'hostile' | 'visual';
export type ProjectileEnd = 'range' | 'wall' | 'hit' | 'caught' | 'arrive' | 'expired' | 'removed';

export interface ProjectileOpts {
  /** player: hits enemies (damage resolved on the OWNER's machine); hostile: hits only the local player; visual: no damage. */
  mode: ProjectileMode;
  owner?: Actor | null;
  vfx: VfxId;
  scale?: number;
  origin: [number, number, number];
  /** Normalized XZ direction. */
  dir: [number, number];
  speed: number;
  radius: number;
  range: number;
  /** Extra targets it may pass through after the first hit (0 = dies on first; Infinity-like 99 = pierce all). */
  pierce?: number;
  homing?: { targetId?: EntityId | null; turn: number };
  /** Goes out `range`, then flies back to the owner (axe throw); targets can be hit again on the way back. */
  boomerang?: boolean;
  /** Periodic pulse while flying (arcane orb). */
  pulse?: { interval: number; fn: (p: Projectile) => void };
  /** Lob (thrown bombs): fly a parabola to `to` over `duration` instead of a straight line. */
  lob?: { to: [number, number]; duration: number; arc: number };
  spin?: number;
  lifetime?: number;
  onHit?: (target: Enemy, p: Projectile) => void;
  onHitLocal?: (player: Player, p: Projectile) => void;
  onEnd?: (p: Projectile, reason: ProjectileEnd) => void;
  /** Optional model tilt for visuals (rad). */
  pitch?: number;
  /**
   * ENGINE_VERTICALITY §12, vertical worlds only: rise per metre of XZ travel (aim slope), clamped to ±0.6. Ignored when
   * `world.vertical` is false.
   */
  dirY?: number;
}

/** §12: max aim slope for projectiles (rise per metre). */
const DIR_Y_MAX = 0.6;
/** §12: a projectile sinking this far into the ground (above its floor) is culled. */
const GROUND_CULL = 0.2;
/** §12: slack added to the target's half-height in the cylinder test. */
const CYL_SLACK = 1.0;

/**
 * Local-only moving shot (fireball, arrow, thrown axe, enemy bolt). Moves in the XZ plane at a fixed height, collides
 * with walls (NavGrid.raycast) and actors (circle test), pierces / homes / returns / pulses per ProjectileOpts.
 * Never networked: the owner machine simulates damage; other peers spawn `mode: 'visual'` copies from the 'cast' channel
 * and every peer simulates hostile projectiles for ITS OWN local player (HitShapes).
 * OWNER: combat module.
 */
export class Projectile extends Entity {
  readonly opts: ProjectileOpts;
  readonly owner: Actor | null;
  dirX: number;
  dirZ: number;
  /** Rise per metre of XZ travel (vertical worlds only; clamped to ±DIR_Y_MAX). */
  dirY: number;
  speed: number;
  hitsLeft: number;
  traveled = 0;
  age = 0;
  done = false;
  phase: 'out' | 'back' = 'out';
  private hitSet = new Set<EntityId>();
  private visual: { object: THREE.Object3D; update(dt: number): void; dispose(): void } | null = null;
  private pulseT = 0;
  private startX: number;
  private startZ: number;
  private baseY: number;

  private constructor(id: EntityId, opts: ProjectileOpts) {
    super(id, 'projectile');
    this.opts = opts;
    this.owner = opts.owner ?? null;
    this.dirX = opts.dir[0];
    this.dirZ = opts.dir[1];
    this.dirY = Math.max(-DIR_Y_MAX, Math.min(DIR_Y_MAX, opts.dirY ?? 0));
    this.speed = opts.speed;
    this.radius = opts.radius;
    this.hitsLeft = 1 + (opts.pierce ?? 0);
    this.authority = true;
    this.baseY = opts.origin[1];
    this.object3d.position.set(opts.origin[0], opts.origin[1], opts.origin[2]);
    this.startX = opts.origin[0];
    this.startZ = opts.origin[2];
    try {
      this.visual = G.vfx.createProjectileVisual(opts.vfx, opts.scale ?? 1);
      this.object3d.add(this.visual.object);
    } catch (e) {
      console.warn('[projectile] visual failed', e);
    }
    this.face();
  }

  /** Create and add to the active world. Returns null when there is no world. */
  static spawn(opts: ProjectileOpts): Projectile | null {
    const w = G.world;
    if (!w) return null;
    const p = new Projectile(w.allocLocalId(), opts);
    w.add(p);
    return p;
  }

  private face(): void {
    this.object3d.rotation.y = Math.atan2(this.dirX, this.dirZ);
    if (this.opts.pitch) this.object3d.rotation.x = this.opts.pitch;
  }

  /** Stop and remove (callbacks fire once). */
  end(reason: ProjectileEnd): void {
    if (this.done) return;
    this.done = true;
    this.object3d.visible = false;
    try {
      this.opts.onEnd?.(this, reason);
    } catch (e) {
      console.error('[projectile] onEnd failed', e);
    }
    this.destroy();
  }

  update(dt: number): void {
    if (this.done) return;
    const world = this.world;
    if (!world) return;
    this.age += dt;
    if (this.opts.lifetime && this.age > this.opts.lifetime) return this.end('expired');

    if (this.opts.pulse) {
      this.pulseT += dt;
      while (this.pulseT >= this.opts.pulse.interval) {
        this.pulseT -= this.opts.pulse.interval;
        try { this.opts.pulse.fn(this); } catch (e) { console.error('[projectile] pulse failed', e); }
      }
    }

    if (this.opts.lob) {
      this.updateLob(dt);
    } else {
      this.steer(dt);
      let remaining = this.speed * dt;
      const maxStep = Math.max(0.18, this.radius * 0.8);
      let guard = 0;
      while (remaining > 1e-4 && !this.done && guard++ < 40) {
        const step = Math.min(maxStep, remaining);
        remaining -= step;
        this.advance(step);
      }
    }
    if (this.opts.spin) this.object3d.rotation.z += this.opts.spin * dt;
    this.visual?.update(dt);
  }

  private steer(dt: number): void {
    const world = this.world!;
    if (this.opts.boomerang && this.phase === 'back' && this.owner) {
      const dx = this.owner.position.x - this.position.x;
      const dz = this.owner.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 + this.owner.radius) return this.end('caught');
      this.dirX = dx / d;
      this.dirZ = dz / d;
      this.face();
      return;
    }
    const h = this.opts.homing;
    if (!h || !h.targetId) return;
    const t = world.getActor(h.targetId);
    if (!t || t.isDead) return;
    const dx = t.position.x - this.position.x;
    const dz = t.position.z - this.position.z;
    const want = Math.atan2(dx, dz);
    const cur = Math.atan2(this.dirX, this.dirZ);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-h.turn * dt, Math.min(h.turn * dt, diff));
    const a = cur + turn;
    this.dirX = Math.sin(a);
    this.dirZ = Math.cos(a);
    this.face();
  }

  private advance(step: number): void {
    const world = this.world!;
    const p = this.position;
    const nx = p.x + this.dirX * step;
    const nz = p.z + this.dirZ * step;
    if (world.vertical) {
      // §12: height-aware shot ray (low rails are shot over, walls/pillars block at any height)
      const ny = p.y + this.dirY * step;
      const f = world.nav.raycastY(p.x, p.y, p.z, nx, ny, nz);
      if (f < 1) {
        p.x += this.dirX * step * f;
        p.z += this.dirZ * step * f;
        p.y += this.dirY * step * f;
        return this.end('wall');
      }
      p.x = nx;
      p.z = nz;
      p.y = ny;
      this.traveled += step;
      // §12 ground cull: sinking into the floor under it ends the shot (reported as 'wall' so impact effects still fire)
      if (p.y < world.groundY(p.x, p.z) + GROUND_CULL) return this.end('wall');
      this.checkHits();
    } else {
      const f = world.nav.raycast(p.x, p.z, nx, nz);
      if (f < 1) {
        p.x += this.dirX * step * f;
        p.z += this.dirZ * step * f;
        return this.end('wall');
      }
      p.x = nx;
      p.z = nz;
      this.traveled += step;
      this.checkHits();
    }
    if (this.done) return;
    if (this.traveled >= this.opts.range) {
      if (this.opts.boomerang && this.phase === 'out') {
        this.phase = 'back';
        this.hitSet.clear();
        this.hitsLeft = Math.max(this.hitsLeft, 1 + (this.opts.pierce ?? 0));
      } else if (!this.opts.boomerang) {
        this.end('range');
      }
    }
  }

  /** §12 cylinder test (vertical worlds only): the shot's height must be within the target's body (+ radius + slack). */
  private inCylinder(feetY: number, height: number): boolean {
    if (!this.world!.vertical) return true;
    return Math.abs(this.position.y - (feetY + height / 2)) <= height / 2 + this.radius + CYL_SLACK;
  }

  private checkHits(): void {
    const world = this.world!;
    const mode = this.opts.mode;
    const p = this.position;
    if (mode === 'hostile') {
      const pl = world.localPlayer;
      if (!pl || pl.isDead || this.hitSet.has(pl.id) || !this.inCylinder(pl.position.y, pl.height)) return;
      const r = this.radius + pl.radius;
      if ((pl.position.x - p.x) ** 2 + (pl.position.z - p.z) ** 2 <= r * r) {
        this.hitSet.add(pl.id);
        try { this.opts.onHitLocal?.(pl, this); } catch (e) { console.error('[projectile] hitLocal failed', e); }
        this.hitsLeft--;
        if (this.hitsLeft <= 0) this.end('hit');
      }
      return;
    }
    const list = world.enemies as readonly Enemy[];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isDead || this.hitSet.has(e.id) || !this.inCylinder(e.position.y, e.height)) continue;
      const r = this.radius + e.radius;
      if ((e.position.x - p.x) ** 2 + (e.position.z - p.z) ** 2 > r * r) continue;
      this.hitSet.add(e.id);
      if (mode === 'player') {
        try { this.opts.onHit?.(e, this); } catch (err) { console.error('[projectile] onHit failed', err); }
      }
      this.hitsLeft--;
      if (this.hitsLeft <= 0) return this.end('hit');
    }
  }

  private updateLob(dt: number): void {
    const l = this.opts.lob!;
    const t = Math.min(1, this.age / l.duration);
    this.position.x = this.startX + (l.to[0] - this.startX) * t;
    this.position.z = this.startZ + (l.to[1] - this.startZ) * t;
    this.position.y = l.arc === 0 ? this.baseY * (1 - t) : this.baseY + Math.sin(t * Math.PI) * l.arc;
    if (l.arc !== 0) this.object3d.rotation.x += dt * 8;
    if (t >= 1) {
      this.position.y = 0;
      this.end('arrive');
    }
  }

  onRemoved(): void {
    if (!this.done) {
      this.done = true;
      try { this.opts.onEnd?.(this, 'removed'); } catch { /* ignore */ }
    }
    try { this.visual?.dispose(); } catch { /* ignore */ }
    this.visual = null;
    super.onRemoved();
  }
}
