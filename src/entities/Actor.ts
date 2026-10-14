import * as THREE from 'three';
import { Entity } from './Entity';
import type { AnimController } from './AnimController';
import { StatusEffects } from '../combat/StatusEffects';
import type { EntityId, EntityKind, ResourceType, Team } from '../types/common';
import type { StatBlock, StatId } from '../types/stats';

/** Active cast/channel shown on cast bars and used for interrupts. */
export interface CastState {
  skillId: string;
  name: string;
  start: number;          // world time
  duration: number;       // seconds (0 = instant)
  channel: boolean;
  interruptible: boolean;
}

/**
 * A living combatant: players and enemies. Holds pools, final stats, statuses, model & animation.
 * Damage/heal/death logic lives in combat/Combat.ts — Actor only stores state and exposes helpers.
 */
export abstract class Actor extends Entity {
  team: Team;
  name = '';
  level = 1;
  hp = 100;
  maxHp = 100;
  resource = 0;
  maxResource = 100;
  resourceType: ResourceType = 'mana';
  /** Final computed stats (players: StatCalc output; enemies: derived from def + level + M+ scaling). */
  stats: StatBlock = {};
  readonly statuses: StatusEffects;
  /** Visual model root (child of object3d) and its animation controller. */
  model: THREE.Object3D | null = null;
  anim: AnimController | null = null;
  /** Horizontal velocity (units/s) used by movement integration and remote extrapolation. */
  readonly velocity = new THREE.Vector3();
  /** Base move speed in units/s before modifiers. */
  baseMoveSpeed = 6;
  cast: CastState | null = null;
  /** Entity currently targeted (enemy AI target or player's hard target). */
  targetId: EntityId | null = null;
  /** Seconds since last damage taken/dealt (out-of-combat regen etc.). */
  combatTimer = 99;
  deathTime = 0;
  /**
   * Movement imposed from outside normal steering (knockback, dash, leap, pull). While set and
   * world.time < until, PlayerController/EnemyAI must NOT steer; Actor.update integrates it with nav collision.
   */
  forcedMove: { vx: number; vz: number; until: number; vy?: number } | null = null;
  /** GDD_LIFE §5.4 (L-00): performance.now() ms until which this actor is hit-frozen (forcedMove runs at 0.04 speed). 0 = off. */
  hitFreezeUntil = 0;

  constructor(id: EntityId, kind: EntityKind, team: Team) {
    super(id, kind);
    this.team = team;
    this.statuses = new StatusEffects(this);
  }

  get isDead(): boolean {
    return !this.alive || this.hp <= 0;
  }

  get hpFrac(): number {
    return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  }

  get inCombat(): boolean {
    return this.combatTimer < 5;
  }

  /** Can start a new action (attack/skill). */
  canAct(): boolean {
    return !this.isDead && !this.statuses.stunned;
  }

  canMove(): boolean {
    return !this.isDead && !this.statuses.rooted;
  }

  /** Final value of a stat = computed stats + active status modifiers. Combat/AI read stats through this. */
  getStat(id: StatId): number {
    const mods = this.statuses.getStatMods();
    const v = (this.stats[id] ?? 0) + (mods[id] ?? 0);
    // status armour percentages (Ayı Biçimi, Demir Post, Doğruluk) scale the armour the actor has; they were never folded before
    if (id === 'armor') return v * (1 + (mods.armorPct ?? 0));
    return v;
  }

  /** Called by StatusEffects whenever statuses are added/removed/stack-changed (Player refreshes stats). */
  onStatusesChanged(): void {}

  /** Push the actor along (dx,dz) for `dist` units over `dur` seconds (knockback, dash). CC-immune callers decide. */
  applyKnockback(dx: number, dz: number, dist: number, dur = 0.18): void {
    const len = Math.hypot(dx, dz) || 1;
    const now = this.world?.time ?? 0;
    const sp = dist / Math.max(0.01, dur);
    this.forcedMove = { vx: (dx / len) * sp, vz: (dz / len) * sp, until: now + dur };
  }

  /** Current move speed including statuses and stats. */
  moveSpeed(): number {
    const mods = this.statuses.getStatMods();
    const pct = (this.stats.moveSpeedPct ?? 0) + (mods.moveSpeedPct ?? 0);
    const flat = (this.stats.moveSpeed ?? 0) + (mods.moveSpeed ?? 0);
    return Math.max(0.5, (this.baseMoveSpeed + flat) * Math.max(0.1, 1 + pct));
  }

  /** Attach the visual model (removes the previous one). */
  setModel(model: THREE.Object3D, anim: AnimController | null): void {
    if (this.model) this.model.removeFromParent();
    this.anim?.dispose();
    this.model = model;
    this.anim = anim;
    this.object3d.add(model);
  }

  /**
   * Feet height used by the vertical move-and-collide step (NavGrid.resolveMove, ENGINE_VERTICALITY §5.2). Players and
   * flat-world bodies use their own y; Enemy overrides it with its ground-following feet height.
   */
  moveBaseY(): number {
    return this.position.y;
  }

  update(dt: number): void {
    this.combatTimer += dt;
    this.statuses.update(dt);
    const fm = this.forcedMove;
    if (fm && this.world) {
      if (this.world.time >= fm.until) this.forcedMove = null;
      else {
        // GDD_LIFE §5.4: a hit-frozen actor's forced movement runs at 0.04 speed (0 = never frozen).
        const k = this.hitFreezeUntil > 0 && performance.now() < this.hitFreezeUntil ? 0.04 : 1;
        const px = this.position.x, pz = this.position.z;
        this.position.x += fm.vx * dt * k;
        this.position.z += fm.vz * dt * k;
        this.world.nav.resolveMove(this.position, px, pz, this.radius, this.moveBaseY());
      }
    }
    this.anim?.update(dt);
  }

  onRemoved(): void {
    this.anim?.dispose();
    super.onRemoved();
  }
}
