/**
 * Minion brain (GDD_CLASSES_V2 §1.5 rule 6, NC40). States: follow (formation slot around the owner), engage (chase and swing at
 * the target), return (owner beyond `leash`: walk back, drop the target). The owner's peer simulates it; damage goes through
 * combat/Minions.ts `strike`, which reuses Combat.playerHitEnemy with the owner's stat block.
 * Targets: (1) the owner's focus (Minions.focus) or the owner's targetId, (2) the current target while it stays within 1.5 x
 * aggro, (3) the nearest enemy within `aggro` of the minion and `leash` of the owner.
 * Teleports to the owner beyond 30 m or after 3 s stuck. Repaths every 0.5 s via NavGrid.findPath.
 * NC42: enemies pick minions through their threat table (EnemyAI.pickTarget, ids in World.getActor); a `taunt` attack (MinionAttack.kind)
 * is fired from here when `params.minTargets` (default 2) enemies in its radius are on someone else, and hurts nothing itself.
 * Damage to a minion arrives through Combat.hitMinion (HitShapes / hostile projectiles, resolved on the owner's peer).
 */
import type { Minion } from '../entities/Minion';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { MinionAttack } from '../types/minions';
import { G } from '../game/G';

const RETARGET = 0.4;
const REPATH = 0.5;
const TELEPORT_DIST = 30;
const FOLLOW_TOL = 1.2;
const RUN_DIST = 8;
const STUCK_TIME = 3;
const FOCUS_LEASH = 40;
const GOLDEN = 2.39996;

type Pt = { x: number; z: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const maxRangeOf = (m: Minion) => Math.max(1.5, ...m.def.attacks.filter((a) => a.kind !== 'taunt').map((a) => a.range));

export class MinionAI {
  state: 'follow' | 'engage' | 'return' = 'follow';
  target: Enemy | null = null;
  swing: { atk: MinionAttack; target: Enemy; t: number; hit: boolean } | null = null;
  private readonly cd = new Map<string, number>();
  private retargetT = 0;
  private repathT = 0;
  private path: Pt[] = [];
  private pathI = 0;
  private stuckT = 0;

  update(m: Minion, dt: number): void {
    if (m.isDead || m.removed) return;
    const owner = m.owner;
    // Vahşi Öfke (owner status frenzy): each stack speeds the pet's recovery by 10 % (attack cadence)
    const haste = 1 + 0.1 * (owner?.statuses.stacks('frenzy') ?? 0);
    for (const [k, v] of this.cd) if (v > 0) this.cd.set(k, v - dt * haste);
    if (!owner || owner.isDead) {
      this.target = null;
      this.swing = null;
      m.setLocomotion('idle');
      return;
    }
    if (dist(m.position, owner.position) > TELEPORT_DIST) {
      this.teleportNear(m, owner);
      return;
    }
    this.retargetT -= dt;
    if (this.retargetT <= 0) {
      this.retargetT = RETARGET;
      this.target = this.pickTarget(m, owner);
      this.tryTaunt(m);
    }
    if (this.swing) {
      this.runSwing(m, dt);
      return;
    }
    const t = this.target;
    if (t && dist(t.position, owner.position) <= m.def.leash) {
      this.state = 'engage';
      this.engage(m, t, dt);
      return;
    }
    this.target = null;
    this.follow(m, owner, dt);
  }

  /** Fires the minion's ready `taunt` attack when enough enemies in its radius are busy with someone else (GDD §1.5.6 tank rule). */
  private tryTaunt(m: Minion): void {
    const atk = m.def.attacks.find((a) => a.kind === 'taunt' && (this.cd.get(a.id) ?? 0) <= 0);
    const w = m.world;
    if (!atk || !w || this.swing) return;
    const r = atk.radius ?? atk.range;
    let n = 0;
    for (const e of w.enemies) {
      if (e.isDead || e.removed || e.team !== 'enemy' || e.targetId == null || e.targetId === m.id) continue;
      if (dist(e.position, m.position) <= r + e.radius && w.sameLevel(e, m.position.y)) n++;
    }
    if (n < (atk.params?.minTargets ?? 2)) return;
    this.cd.set(atk.id, atk.cooldown);
    m.playShot(atk.anim, atk.animSpeed ?? 1);
    G.minions?.taunt(m, atk);
  }

  private pickTarget(m: Minion, owner: Actor): Enemy | null {
    const w = m.world;
    if (!w) return null;
    const ok = (e: Actor | undefined | null): e is Enemy => !!e && e.kind === 'enemy' && !e.isDead && !e.removed;
    const focus = G.minions?.focusTarget(owner.id) ?? null;
    if (ok(focus) && dist(focus.position, owner.position) <= FOCUS_LEASH) return focus;
    const ot = owner.targetId != null ? w.get<Actor>(owner.targetId) : undefined;
    if (ok(ot) && dist(ot.position, owner.position) <= m.def.leash) return ot;
    const cur = this.target;
    if (ok(cur) && dist(cur.position, m.position) <= m.def.aggro * 1.5 && dist(cur.position, owner.position) <= m.def.leash) return cur;
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of w.enemies) {
      if (e.isDead || e.removed || !w.sameLevel(e, m.position.y)) continue;
      const d = dist(e.position, m.position);
      if (d > m.def.aggro || d >= bd || dist(e.position, owner.position) > m.def.leash) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  private engage(m: Minion, t: Enemy, dt: number): void {
    const d = dist(t.position, m.position);
    const reach = maxRangeOf(m);
    const ready = m.def.attacks.filter((a) => a.kind !== 'taunt' && (this.cd.get(a.id) ?? 0) <= 0 && d <= a.range + t.radius);
    if (ready.length) {
      // highest weight among the ready attacks (ties: the first listed)
      let atk = ready[0];
      for (const a of ready) if ((a.weight ?? 1) > (atk.weight ?? 1)) atk = a;
      this.startSwing(m, atk, t);
      return;
    }
    const kite = m.def.role === 'ranged' || m.def.role === 'caster';
    if (d > reach * 0.8 + t.radius) {
      this.moveToward(m, t.position.x, t.position.z, m.def.speed, dt, false);
      m.setLocomotion('run', m.def.speed);
    } else if (kite && d < reach * 0.5) {
      const ax = m.position.x + (m.position.x - t.position.x), az = m.position.z + (m.position.z - t.position.z);
      this.moveToward(m, ax, az, m.def.speed * 0.8, dt, false);
      m.setLocomotion('walk', m.def.speed * 0.8);
    } else {
      m.yaw = Math.atan2(t.position.x - m.position.x, t.position.z - m.position.z);
      m.setLocomotion('idle');
    }
  }

  private startSwing(m: Minion, atk: MinionAttack, t: Enemy): void {
    this.cd.set(atk.id, atk.cooldown);
    this.swing = { atk, target: t, t: 0, hit: false };
    m.yaw = Math.atan2(t.position.x - m.position.x, t.position.z - m.position.z);
    m.playShot(atk.anim, atk.animSpeed ?? 1);
  }

  private runSwing(m: Minion, dt: number): void {
    const s = this.swing!;
    s.t += dt;
    const t = s.target;
    if (t.isDead || t.removed) {
      this.swing = null;
      return;
    }
    m.yaw = Math.atan2(t.position.x - m.position.x, t.position.z - m.position.z);
    // the clip hit time is in clip seconds; the swing plays at animSpeed
    const hitAt = s.atk.hitTime / (s.atk.animSpeed ?? 1);
    if (!s.hit && s.t >= hitAt) {
      s.hit = true;
      if (dist(t.position, m.position) <= s.atk.range + t.radius + 0.6) G.minions?.strike(m, s.atk, t);
    }
    if (s.t >= hitAt + 0.25) this.swing = null;
  }

  private follow(m: Minion, owner: Actor, dt: number): void {
    const slot = this.slotPos(m, owner);
    const dSlot = dist(m.position, slot);
    const dOwner = dist(m.position, owner.position);
    this.state = dOwner > m.def.leash ? 'return' : 'follow';
    if (dSlot <= FOLLOW_TOL) {
      this.stuckT = 0;
      m.setLocomotion('idle');
      return;
    }
    const far = dOwner > RUN_DIST;
    const speed = far ? Math.max(m.def.speed, owner.moveSpeed() * 1.1) : m.def.speed;
    const px = m.position.x, pz = m.position.z;
    this.moveToward(m, slot.x, slot.z, speed, dt, dSlot > 6);
    m.setLocomotion(far ? 'run' : 'walk', speed);
    // stuck: moved well under the step length while a slot is still far away
    const moved = Math.hypot(m.position.x - px, m.position.z - pz);
    this.stuckT = moved < 0.2 * speed * dt ? this.stuckT + dt : 0;
    if (this.stuckT > STUCK_TIME && dOwner > 6) this.teleportNear(m, owner);
  }

  /** Formation: tanks stand in front of the owner (2 m), the rest on a ring behind it (3.2 m); golden-angle spread by slot. */
  private slotPos(m: Minion, owner: Actor): Pt {
    const tank = m.def.role === 'tank';
    const ang = (tank ? owner.yaw : owner.yaw + Math.PI) + m.slot * GOLDEN;
    const r = tank ? 2.0 : 3.2;
    return { x: owner.position.x + Math.sin(ang) * r, z: owner.position.z + Math.cos(ang) * r };
  }

  /** One step toward (gx, gz). `usePath` routes through NavGrid.findPath (repath every 0.5 s). Returns true when it moved. */
  private moveToward(m: Minion, gx: number, gz: number, speed: number, dt: number, usePath: boolean): boolean {
    const nav = m.world?.nav;
    if (!nav) return false;
    let tx = gx, tz = gz;
    if (usePath) {
      this.repathT -= dt;
      if (this.repathT <= 0) {
        this.repathT = REPATH;
        const p = nav.findPath({ x: m.position.x, z: m.position.z }, { x: gx, z: gz });
        this.path = p ? p.map((v) => ({ x: v.x, z: v.z })) : [];
        this.pathI = 0;
      }
      while (this.pathI < this.path.length && dist(this.path[this.pathI], m.position) < 0.6) this.pathI++;
      if (this.pathI < this.path.length) {
        tx = this.path[this.pathI].x;
        tz = this.path[this.pathI].z;
      }
    }
    const dx = tx - m.position.x, dz = tz - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return false;
    const step = Math.min(d, speed * dt);
    const px = m.position.x, pz = m.position.z;
    m.position.x += (dx / d) * step;
    m.position.z += (dz / d) * step;
    nav.resolveMove(m.position, px, pz, m.radius, m.position.y);
    m.yaw = Math.atan2(dx, dz);
    return true;
  }

  /** Warps next to the owner (beyond 30 m, or stuck). Drops the path, the target and the swing. */
  private teleportNear(m: Minion, owner: Actor): void {
    const nav = m.world?.nav;
    const slot = this.slotPos(m, owner);
    const ok = nav ? nav.isWalkable(slot.x, slot.z) : true;
    const fallback = nav?.nearestWalkable(owner.position.x, owner.position.z, 6) ?? { x: owner.position.x, z: owner.position.z };
    m.position.x = ok ? slot.x : fallback.x;
    m.position.z = ok ? slot.z : fallback.z;
    this.path = [];
    this.pathI = 0;
    this.repathT = 0;
    this.stuckT = 0;
    this.target = null;
    this.swing = null;
    this.state = 'follow';
  }
}
