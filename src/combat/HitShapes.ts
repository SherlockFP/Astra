import { G } from '../game/G';
import { Projectile } from '../entities/Projectile';
import type { DamageType, EntityId } from '../types/common';
import type { StatusApply } from '../types/skills';
import type { TelegraphKind, TelegraphShape, VfxId } from '../types/vfx';
import type { TelegraphHandle, VfxHandle } from '../vfx/VFX';
import type { Enemy } from '../entities/Enemy';
import { VERT } from '../world/Heightfield';

/**
 * A hostile area/projectile that can hurt players: enemy melee swings, boss mechanics, affix hazards.
 * Created on the HOST (spawn) and broadcast; EVERY peer (host included) keeps a copy (add) that shows the
 * telegraph and, when it lands / ticks / collides, tests ONLY that peer's local player and calls
 * G.combat.hitLocalPlayer(). This makes dodging lag-free for everyone.
 *
 * Telegraph `kind`: 'danger' (default) hurts players inside; 'soak' splits the damage between the players inside;
 * 'safe' hurts players OUTSIDE the shape (stand in the safe circle); 'friendly' never hurts.
 */
export interface HitShapeSpec {
  id: number;
  sourceId: EntityId | null;
  shape: TelegraphShape;
  origin: [number, number, number];
  dir: [number, number];        // normalized XZ facing (cones/lines)
  delay: number;                // seconds until it lands (telegraph visible meanwhile when telegraph=true)
  damage: number;               // raw damage before the target's mitigation
  type: DamageType;
  statuses?: StatusApply[];
  knockback?: number;
  telegraph: boolean;
  kind?: TelegraphKind;
  abilityName?: string;
  /** Ground hazard that keeps hurting: ticks every `tick` s for `duration` s after landing. */
  persist?: { duration: number; tick: number };
  /** Moving projectile (origin -> dir); hits the first local player it touches. */
  projectile?: { speed: number; radius: number; range: number; vfx: VfxId; homingTargetId?: EntityId | null; homing?: number };
  /** Telegraph follows the source entity until it lands (cleaves). */
  followSource?: boolean;
  vfxOnLand?: VfxId;
  /** Soak: damage split among players inside (each peer counts players inside from positions). */
  soak?: boolean;
  // GDD_V2 §3.12 (WP1 contracts, all optional; replicated with the spec)
  /** Can be parried (defaults to true for melee swings; the enemy owner sets it per ability). */
  parryable?: boolean;
  /** Cannot be parried or guarded: dodge only (red glyph during the windup). */
  perilous?: boolean;
  /** Low attack flag (GDD_V2 §3.12 HitShapeSpec flags). */
  low?: boolean;
  /** Poise damage this shape deals to a broken-or-guarding target (GDD_V2 §3.7). */
  poise?: number;
  /**
   * ENGINE_VERTICALITY §12 (vertical worlds only): max |feet y − groundY(ox,oz)| at which the local player can be hit.
   * Default VERT.TOL_MELEE (2.5). 'free' = no height gate (room-wide boss mechanics keep the legacy XZ-only test).
   */
  vert?: number | 'free';
}

interface ActiveShape {
  spec: HitShapeSpec;
  t: number;
  state: 'pending' | 'flying' | 'persist';
  telegraph: TelegraphHandle | null;
  ox: number; oy: number; oz: number;
  dx: number; dz: number;
  persistT: number;
  tickT: number;
  proj: Projectile | null;
  fx: VfxHandle | null;
  /** perilous windup: seconds until the next red flash on the source */
  flashT: number;
}

/** OWNER: combat module. */
export class HitShapes {
  private shapes = new Map<number, ActiveShape>();
  private nextId = 1;

  constructor() {
    G.net?.on('hitshape', (spec) => this.add(spec));
    G.net?.on('hitshape_x', (p) => this.cancelLocal(p.id));
    G.events?.on('scene:leaving', () => this.clear());
  }

  get activeCount(): number {
    return this.shapes.size;
  }

  /** HOST/offline only: create, add locally and broadcast to peers. Returns the id. */
  spawn(spec: Omit<HitShapeSpec, 'id'>): number {
    const id = this.nextId++;
    const full: HitShapeSpec = { ...spec, id };
    if (G.net && !G.net.isAuthority) console.warn('[hitshapes] spawn() called on a client — only the host should spawn');
    G.net?.broadcast('hitshape', full);
    this.add(full);
    return id;
  }

  /** Register a shape (from the network or from spawn()). */
  add(spec: HitShapeSpec): void {
    if (!spec || this.shapes.has(spec.id) || !G.world) return;
    if (spec.id >= this.nextId) this.nextId = spec.id + 1;
    const a: ActiveShape = {
      spec, t: 0, state: 'pending', telegraph: null,
      ox: spec.origin[0], oy: spec.origin[1], oz: spec.origin[2], dx: spec.dir[0], dz: spec.dir[1],
      persistT: 0, tickT: 0, proj: null, fx: null, flashT: 0,
    };
    if (spec.perilous && spec.delay > 0.02) this.perilousWarn(a);
    if (spec.telegraph && spec.delay > 0.02 && spec.kind !== 'friendly') {
      try {
        const shape: TelegraphShape = spec.projectile
          ? { type: 'line', length: Math.min(spec.projectile.range, 30), width: spec.projectile.radius * 2 }
          : spec.shape;
        a.telegraph = G.vfx.telegraph(shape, spec.origin, spec.dir, spec.delay, spec.kind ?? 'danger');
      } catch (e) {
        console.warn('[hitshapes] telegraph failed', e);
      }
    } else if (spec.telegraph && spec.kind === 'friendly') {
      a.telegraph = G.vfx.telegraph(spec.shape, spec.origin, spec.dir, Math.max(0.05, spec.delay), 'friendly');
    }
    this.shapes.set(spec.id, a);
    if (spec.delay <= 0) this.land(a);
  }

  /** Cancel (interrupted cast, source died). HOST broadcasts the cancel. */
  cancel(id: number): void {
    if (!this.shapes.has(id)) return;
    if (!G.net || G.net.isAuthority) G.net?.broadcast('hitshape_x', { id });
    this.cancelLocal(id);
  }

  /** Cancel every not-yet-landed shape owned by a source (enemy died / interrupted / flinched). Returns how many. */
  cancelBySource(sourceId: EntityId, includeHazards = false): number {
    let n = 0;
    for (const a of [...this.shapes.values()]) {
      if (a.spec.sourceId !== sourceId) continue;
      if (a.state !== 'pending' && !includeHazards) continue;
      this.cancel(a.spec.id);
      n++;
    }
    return n;
  }

  private cancelLocal(id: number): void {
    const a = this.shapes.get(id);
    if (!a) return;
    this.dispose(a);
    this.shapes.delete(id);
  }

  private dispose(a: ActiveShape): void {
    try { a.telegraph?.cancel(); } catch { /* ignore */ }
    a.telegraph = null;
    try { a.fx?.stop(); } catch { /* ignore */ }
    a.fx = null;
    if (a.proj && !a.proj.done) {
      const p = a.proj;
      a.proj = null;
      p.destroy();
    }
  }

  update(dt: number): void {
    if (!this.shapes.size) return;
    const world = G.world;
    if (!world) { this.clear(); return; }
    for (const [id, a] of this.shapes) {
      const s = a.spec;
      if (a.state === 'pending') {
        a.t += dt;
        if (s.followSource && s.sourceId !== null) {
          const src = world.get(s.sourceId);
          if (src && !src.removed) {
            a.ox = src.position.x; a.oz = src.position.z;
            a.dx = Math.sin(src.yaw); a.dz = Math.cos(src.yaw);
            a.telegraph?.setTransform([a.ox, a.oy, a.oz], [a.dx, a.dz]);
          }
        }
        if (s.perilous) {
          a.flashT -= dt;
          if (a.flashT <= 0) { a.flashT = 0.25; this.perilousFlash(s); }
        }
        if (a.t >= s.delay) this.land(a);
      } else if (a.state === 'persist') {
        a.persistT += dt;
        a.tickT += dt;
        const tick = Math.max(0.1, s.persist?.tick ?? 0.5);
        while (a.tickT >= tick) {
          a.tickT -= tick;
          this.resolve(a);
        }
        if (a.persistT >= (s.persist?.duration ?? 0)) {
          this.dispose(a);
          this.shapes.delete(id);
        }
      } else if (a.state === 'flying') {
        if (!a.proj || a.proj.done) {
          this.dispose(a);
          this.shapes.delete(id);
        }
      }
    }
  }

  /**
   * Perilous windup (GDD_V2 §3.4 / §3.12): the caster flashes red and a glyph sits on the telegraph, on every peer (the spec is
   * replicated). Feedback only: never throws, never blocks the shape.
   */
  private perilousWarn(a: ActiveShape): void {
    const s = a.spec;
    try {
      G.vfx.spawn('perilous_mark', [a.ox, Math.max(0.1, a.oy) + 0.05, a.oz], { duration: s.delay });
      G.audio.play('perilous_warn', { pos: [a.ox, 1.2, a.oz] });
    } catch { /* feedback only */ }
    this.perilousFlash(s);
  }

  private perilousFlash(s: HitShapeSpec): void {
    try {
      const src = s.sourceId !== null ? G.world?.get<Enemy>(s.sourceId) : undefined;
      if (!src || src.removed || src.isDead) return;
      G.vfx.flash(src.model ?? src.object3d, 0xff2a2a, 0.14);
    } catch { /* feedback only */ }
  }

  private land(a: ActiveShape): void {
    const s = a.spec;
    try { a.telegraph?.cancel(); } catch { /* ignore */ }
    a.telegraph = null;
    if (s.projectile) {
      this.launch(a);
      return;
    }
    const pos: [number, number, number] = [a.ox, a.oy, a.oz];
    if (s.vfxOnLand) {
      try {
        a.fx = G.vfx.spawn(s.vfxOnLand, pos, { dir: [a.dx, 0, a.dz], duration: s.persist?.duration, scale: this.shapeScale(s.shape) });
      } catch { /* ignore */ }
    }
    if (s.persist && s.persist.duration > 0) {
      a.state = 'persist';
      a.persistT = 0;
      a.tickT = Math.max(0.1, s.persist.tick); // first tick right now
      return;
    }
    this.resolve(a);
    if (!s.persist) {
      this.dispose(a);
      this.shapes.delete(s.id);
    }
  }

  private shapeScale(shape: TelegraphShape): number {
    switch (shape.type) {
      case 'circle': return shape.radius / 2;
      case 'ring': return shape.outer / 2;
      case 'cone': return shape.radius / 2.5;
      case 'line': return shape.length / 6;
      case 'rect': return Math.max(shape.width, shape.length) / 4;
    }
  }

  private launch(a: ActiveShape): void {
    const s = a.spec;
    const pr = s.projectile!;
    a.state = 'flying';
    const owner = s.sourceId !== null ? G.world?.getActor(s.sourceId) ?? null : null;
    const world = G.world;
    let y = a.oy > 0.2 ? a.oy : 1.2;
    let dirY: number | undefined;
    if (world?.vertical) {
      // ENGINE_VERTICALITY §12: shot starts at the source's live height (flying enemies keep their real y), not at origin[1].
      const flying = owner !== null && (owner as Enemy).def?.flying === true;
      const offset = a.oy > 0.2 ? a.oy : 1.2;
      y = owner ? (flying ? owner.position.y : owner.position.y + offset) : world.groundY(a.ox, a.oz) + offset;
      // slope toward the local player's chest (clamped ±0.6), so a shot at a balcony above/below can reach its height
      const lp = world.localPlayer;
      if (lp && !lp.isDead) {
        const run = Math.max(0.5, Math.hypot(lp.position.x - a.ox, lp.position.z - a.oz));
        dirY = Math.max(-0.6, Math.min(0.6, (lp.position.y + lp.height * 0.6 - y) / run));
      }
    }
    const p = Projectile.spawn({
      mode: 'hostile', owner, vfx: pr.vfx, origin: [a.ox, y, a.oz], dir: [a.dx, a.dz], speed: pr.speed, radius: pr.radius, range: pr.range, dirY,
      homing: pr.homing ? { targetId: pr.homingTargetId ?? G.world?.localPlayer?.id ?? null, turn: pr.homing } : undefined,
      onHitLocal: (pl, proj) => {
        this.hitPlayer(s, [proj.dirX, proj.dirZ], s.damage, true, [a.ox, a.oz]);
        void pl;
      },
      onEnd: (proj, reason) => {
        if (s.vfxOnLand && reason !== 'removed') {
          try { G.vfx.spawn(s.vfxOnLand, [proj.position.x, Math.max(0.2, proj.position.y * 0.5), proj.position.z]); } catch { /* ignore */ }
        }
      },
    });
    a.proj = p;
    if (!p) { this.shapes.delete(s.id); }
  }

  /**
   * ENGINE_VERTICALITY §12: height reach of a shape. Flat worlds (and 'free' specs) are always in reach. Otherwise the feet
   * must be within `vert` of the ground plane under the shape origin (origin[1] is ignored).
   */
  private inReach(a: ActiveShape, feetY: number): boolean {
    const world = G.world;
    if (!world || !world.vertical || a.spec.vert === 'free') return true;
    const plane = world.groundY(a.ox, a.oz);
    return Math.abs(feetY - plane) <= (a.spec.vert ?? VERT.TOL_MELEE);
  }

  /** Test the LOCAL player against the shape at its land/tick moment and hit them. */
  private resolve(a: ActiveShape): void {
    const s = a.spec;
    if (s.kind === 'friendly') return;
    const lp = G.world?.localPlayer;
    if (!lp || lp.isDead || !lp.isLocal) return;
    if (!this.inReach(a, lp.position.y)) return;
    const inside = HitShapes.contains(s.shape, a.ox, a.oz, a.dx, a.dz, lp.position.x, lp.position.z, lp.radius);
    const hurt = s.kind === 'safe' ? !inside : inside;
    if (!hurt) return;
    let dmg = s.damage;
    if (s.soak || s.kind === 'soak') {
      let n = 0;
      for (const p of G.world!.players) {
        if (p.isDead || !this.inReach(a, p.position.y)) continue;
        if (HitShapes.contains(s.shape, a.ox, a.oz, a.dx, a.dz, p.position.x, p.position.z, p.radius)) n++;
      }
      dmg /= Math.max(1, n);
    }
    const t = s.shape.type;
    const dx = lp.position.x - a.ox, dz = lp.position.z - a.oz;
    const l = Math.hypot(dx, dz);
    const dir: [number, number] = l > 0.05 ? [dx / l, dz / l] : [a.dx, a.dz];
    this.hitPlayer(s, t === 'line' || t === 'cone' ? [a.dx * 0.5 + dir[0] * 0.5, a.dz * 0.5 + dir[1] * 0.5] : dir, dmg, t === 'cone' || t === 'line', [a.ox, a.oz]);
  }

  private hitPlayer(s: HitShapeSpec, dir: [number, number], damage: number, blockable: boolean, origin?: [number, number]): void {
    const src = s.sourceId !== null ? G.world?.get<Enemy>(s.sourceId) : undefined;
    const l = Math.hypot(dir[0], dir[1]) || 1;
    // GDD_V2 §3.12: perilous implies unblockable and unparryable; melee-like shapes (cone / line) default to parryable
    G.combat.hitLocalPlayer({
      sourceId: s.sourceId, amount: damage, type: s.type, statuses: s.statuses, knockback: s.knockback, origin,
      dir: [dir[0] / l, dir[1] / l], abilityName: s.abilityName, sourceLevel: src?.level,
      blockable: blockable && !s.perilous, parryable: s.perilous ? false : (s.parryable ?? blockable),
      perilous: s.perilous, melee: blockable,
    });
  }

  /**
   * Is a circle (px,pz,r) inside the shape placed at origin (ox,oz) facing (dx,dz)? XZ plane math shared with enemy AI.
   */
  static contains(shape: TelegraphShape, ox: number, oz: number, dx: number, dz: number, px: number, pz: number, r: number): boolean {
    const vx = px - ox, vz = pz - oz;
    const dist = Math.hypot(vx, vz);
    switch (shape.type) {
      case 'circle':
        return dist <= shape.radius + r;
      case 'ring':
        return dist + r >= shape.inner && dist - r <= shape.outer;
      case 'cone': {
        if (dist > shape.radius + r) return false;
        if (dist <= r + 0.15) return true;
        const cos = (vx * dx + vz * dz) / dist;
        const half = (shape.angle / 2) * (Math.PI / 180);
        const slack = Math.atan2(r, dist);
        return Math.acos(Math.max(-1, Math.min(1, cos))) <= half + slack;
      }
      case 'line': {
        const t = Math.max(0, Math.min(shape.length, vx * dx + vz * dz));
        return Math.hypot(vx - dx * t, vz - dz * t) <= shape.width / 2 + r;
      }
      case 'rect': {
        const u = vx * dx + vz * dz;
        const v = -vx * dz + vz * dx;
        return Math.abs(u) <= shape.length / 2 + r && Math.abs(v) <= shape.width / 2 + r;
      }
    }
  }

  clear(): void {
    for (const a of this.shapes.values()) this.dispose(a);
    this.shapes.clear();
  }
}
