import { G } from '../game/G';
import { clamp, yawFromDir } from '../core/utils';
import { EnemyAI, type Busy } from './EnemyAI';
import { BossEnergy, bossMsg, bossText, lockExpired } from './bossNet';
import { CUSTOM, type CustomHandler } from './abilities';
import { BOSS_SCRIPTS, BOSS_SPAWNS } from './bosses';
import { tickLinks } from './bosses/links';
import { bossMovesReset, setMoveBridgeHost } from './bosses/moveBridge';
import { clearPatterns, updatePatterns } from './bosses/patterns';
import type { EnemyDirector } from './EnemyDirector';
import type { BossScript } from './bosses/types';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { BossDef, BossPhase, EnemyAbility } from '../types/enemies';

export { BOSS_SPAWNS };

let moveBridgeWired = false;
/** K12 / P-41: one-time host hook for the boss move bridge (a poise break or reset retracts enemy shapes through HitShapes). */
function wireMoveBridge(): void {
  if (moveBridgeWired) return;
  moveBridgeWired = true;
  setMoveBridgeHost({ cancelShape: (id) => G.hitShapes.cancel(id) });
}

/** Optional BossScript fields from the P-31 / P-38 packages (types/ owned elsewhere). */
type ScriptExt = BossScript & { lockLimit?: number };

/**
 * Boss brain: phases by HP, scripted mechanics (circles under players, cones, line charges, soaks, spreads, adds), cast bars,
 * yells, enrage timer and wipe / reset. Host-only; emits `boss:*` events which the host DungeonScene turns into gates and
 * a `gate` broadcast (clients never emit them). Mechanics live in ai/bosses/*.ts (one BossScript per boss id); ordinary
 * abilities (cones, lines, projectiles) run through the generic EnemyAI pipeline from the BossDef data.
 * OWNER: enemies module.
 */
export class BossController extends EnemyAI {
  readonly bdef: BossDef;
  readonly script: BossScript;
  /** World-space arena rectangle (centre + size) and a bounding radius. */
  arena = { cx: 0, cz: 0, w: 40, h: 40, r: 20 };
  /** Offset between the baked arena and where the boss really spawned (dev pages): applied by gdd(). */
  shiftX = 0;
  shiftZ = 0;
  /** A scripted mechanic phase (abilities: []) is running: HP thresholds do not advance the phase until endMechanicPhase(). */
  phaseLocked = false;
  /** True while resetFight() runs (handlers must not treat the resulting aborts as interrupts). */
  inReset = false;
  engaged = false;
  fightT = 0;
  phaseIdx = -1;
  phase: BossPhase | null = null;
  /** Script scratch state. */
  readonly state: Record<string, any> = {};
  /** P-38: energy bar (BossDef.energy); null for bosses without one. */
  energy: BossEnergy | null = null;
  /** P-31: 'interact' bosses wait for releasePull() (a prop or an NPC), 'aggro' bosses engage from the room trigger. */
  pullMode: 'aggro' | 'interact' = 'aggro';
  /** True while an 'interact' boss is still waiting for its pull. */
  awaitPull = false;
  /** No basic attacks (immune phases, scripted channels). */
  suppressBasic = false;
  /** Stand still and face the target (phase mechanics). */
  hold = false;
  /** Script-controlled movement: return true when handled. */
  moveOverride: ((dt: number) => boolean) | null = null;
  private pending: EnemyAbility[] = [];
  private enraged = false;
  private enrageT = 0;
  private lockedAt = 0;
  private tracked: number[] = [];
  private wipeT = 0;
  private everInside = false;
  private gcdUntil = 0;
  private immuneOn = false;

  constructor(e: Enemy, dir: EnemyDirector) {
    super(e, dir);
    this.bdef = e.def as BossDef;
    this.script = BOSS_SCRIPTS[this.bdef.id] ?? { abilities: {} };
    wireMoveBridge();
    const a = this.bdef.arena;
    if (a) {
      // shift the baked arena if the boss really spawned elsewhere than where it was measured
      const ox = e.homeX - a.homeX, oz = e.homeZ - a.homeZ;
      const sane = Math.abs(ox) < 400 && Math.abs(oz) < 400;
      this.shiftX = sane ? ox : 0;
      this.shiftZ = sane ? oz : 0;
      this.arena = { cx: a.cx + this.shiftX, cz: a.cz + this.shiftZ, w: a.w, h: a.h, r: Math.hypot(a.w, a.h) / 2 };
    } else {
      this.arena = { cx: e.homeX, cz: e.homeZ, w: this.bdef.arenaRadius * 2, h: this.bdef.arenaRadius * 2, r: this.bdef.arenaRadius };
    }
    e.arena = { cx: this.arena.cx, cz: this.arena.cz, w: this.arena.w, h: this.arena.h };
    const en = this.bdef.energy;
    if (en) this.energy = new BossEnergy(en, { full: () => this.hook(en.onFull), empty: () => this.hook(en.onEmpty) });
    this.script.init?.(this);
  }

  /** Call a BossScript hook by name (energy onFull / onEmpty). Missing hooks are ignored. */
  private hook(name: string | undefined): void {
    if (!name) return;
    const fn = (this.script as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') (fn as (c: BossController) => void).call(this.script, this);
  }

  /** P-31: release an 'interact' boss so it engages (it then acquires the nearest player like an aggro boss). */
  releasePull(): void {
    this.awaitPull = false;
  }

  /** P-31: add one boss-side add at a fixed point with hp scaling and a tag (the boss's own `spawnAdds` with positions). */
  encounterAdd(defId: string, pos: { x: number; z: number }, o: { hpMult?: number; tag?: string } = {}): void {
    this.spawnAdds(defId, 1, { positions: [pos], hpMult: o.hpMult, tag: o.tag, aggro: true });
  }

  protected handler(id: string): CustomHandler | undefined {
    return (this.script.abilities[id] as unknown as CustomHandler | undefined) ?? CUSTOM[id];
  }

  // ---- arena helpers ---------------------------------------------------------------------------------------------

  /** World point from an offset relative to the arena centre. */
  at(ox: number, oz: number): { x: number; z: number } {
    return { x: this.arena.cx + ox, z: this.arena.cz + oz };
  }

  /** Random walkable point inside the arena (margin from the walls). */
  randomPoint(margin = 3, minFrom?: { x: number; z: number; d: number }): { x: number; z: number } {
    const a = this.arena;
    for (let i = 0; i < 25; i++) {
      const x = a.cx + (Math.random() - 0.5) * (a.w - margin * 2);
      const z = a.cz + (Math.random() - 0.5) * (a.h - margin * 2);
      if (!this.world.nav.isWalkable(x, z)) continue;
      if (minFrom && Math.hypot(x - minFrom.x, z - minFrom.z) < minFrom.d) continue;
      return { x, z };
    }
    return { x: a.cx, z: a.cz };
  }

  insideArena(x: number, z: number, margin = 0): boolean {
    const a = this.arena;
    return Math.abs(x - a.cx) <= a.w / 2 + margin && Math.abs(z - a.cz) <= a.h / 2 + margin;
  }

  playersInArena(alive = true): Player[] {
    const out: Player[] = [];
    for (const p of this.world.players) {
      if (p.removed || (alive && p.isDead)) continue;
      if (this.insideArena(p.position.x, p.position.z, 2)) out.push(p);
    }
    return out;
  }

  /** `n` distinct random living players (fewer when the party is smaller). */
  randomPlayers(n: number, filter?: (p: Player) => boolean): Player[] {
    const pool = this.playersInArena().filter((p) => !filter || filter(p));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  /** The current tank (target of the basic attacks). */
  get tank(): Actor | null {
    return this.target;
  }

  partySize(): number {
    return Math.max(1, this.playersInArena(false).length || this.world.players.length);
  }

  yell(text: string): void {
    try {
      G.events.emit('boss:yell', { bossId: this.bdef.id, text });
    } catch { /* ignore */ }
  }

  /** Tracked adds of this boss (alive). */
  adds(tag?: string): Enemy[] {
    return this.world.enemies.filter((o) => o.ownerId === this.e.id && !o.isDead && (!tag || o.tag === tag));
  }

  /** Invulnerable phases. */
  setImmune(on: boolean): void {
    const e = this.e;
    if (on === this.immuneOn) return;
    this.immuneOn = on;
    if (on) {
      e.statuses.apply('invulnerable', 9999, { sourceId: e.id });
      G.net?.broadcast('estatus', { targetId: e.id, status: 'invulnerable', duration: 9999, stacks: 1 });
    } else {
      e.statuses.remove('invulnerable');
      G.net?.broadcast('estatus', { targetId: e.id, status: 'invulnerable', duration: 0, stacks: 0, removed: true });
    }
  }

  /** Queue an ability to be cast as soon as the boss is free (phase transitions). */
  forceAbility(id: string): void {
    const ab = this.abilityList.find((a) => a.id === id);
    if (ab) this.pending.push(ab);
  }

  /** Start an ability right now, ignoring cooldown and range (script use). */
  castNow(id: string, target?: Actor | null): boolean {
    const ab = this.abilityList.find((a) => a.id === id);
    if (!ab || this.busy) return false;
    const t = target ?? this.target ?? this.nearestPlayer() ?? this.e;
    this.startAbility(ab, t, 0);
    return true;
  }

  /** World point of a GDD tile coordinate (GDD_CONTENT section 0.1: world = (c + 0.5) x 4), shifted with the arena. */
  gdd(x: number, z: number): { x: number; z: number } {
    return { x: (x + 0.5) * 4 + this.shiftX, z: (z + 0.5) * 4 + this.shiftZ };
  }

  get isEnraged(): boolean {
    return this.enraged;
  }

  ability(id: string): EnemyAbility | undefined {
    return this.abilityList.find((a) => a.id === id) ?? (this.e.def.basicAttack.id === id ? this.e.def.basicAttack : undefined);
  }

  /** Remember a shape that is not owned by the boss (marks follow players) so a reset / death cancels it. */
  track(id: number): number {
    if (id) {
      this.tracked.push(id);
      if (this.tracked.length > 80) this.tracked.shift();
    }
    return id;
  }

  private cancelTracked(): void {
    for (const id of this.tracked) {
      try {
        G.hitShapes.cancel(id);
      } catch {
        /* ignore */
      }
    }
    this.tracked.length = 0;
  }

  /** Every peer: the boss takes `mult` x damage for `seconds` (SERSEMLEDI windows). */
  vulnerable(mult: number, seconds: number): void {
    bossMsg('boss_dmgwin', { dur: seconds, mult }, { targetId: this.e.id });
  }

  /** Frontal block: `front` multiplier inside the arc, `back` outside (Kalkan Duvari). */
  frontalBlock(seconds: number, arc: number, front: number, back: number): void {
    bossMsg('boss_dmgwin', { dur: seconds, mult: front, arc, back }, { targetId: this.e.id });
  }

  /** Stagger break: stun + vulnerability + gold text. */
  stagger(stun: number, vulnMult: number, vulnSec: number, text = 'SERSEMLED\u0130!'): void {
    const e = this.e;
    try {
      e.statuses.apply('stun', stun, { replicated: true });
      G.net?.broadcast('estatus', { targetId: e.id, status: 'stun', duration: stun, stacks: 1 });
      this.vulnerable(vulnMult, vulnSec);
      bossText(text, e.position.x, e.height + 0.6, e.position.z, 0);
      G.vfx.spawn('stun_stars', e.pointAt(1.05), { duration: stun });
      G.events.emit('camera:shake', { intensity: 0.3, duration: 0.3 });
      G.events.emit('hitstop', { ms: 60 });
    } catch (err) {
      console.warn('[boss] stagger failed', err);
    }
  }

  /** Move without touching the locomotion clip (scripted drifts: whirl, spin). */
  slide(dx: number, dz: number, speed: number, dt: number, face = true): void {
    const e = this.e;
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) return;
    const vx = (dx / l) * speed, vz = (dz / l) * speed;
    e.velocity.x = vx;
    e.velocity.z = vz;
    e.position.x += vx * dt;
    e.position.z += vz * dt;
    this.world.nav.resolveCircle(e.position, e.radius);
    if (face) e.yaw = yawFromDir(dx, dz);
  }

  /** Walk toward a point with the normal locomotion animation and nav. */
  goTo(x: number, z: number, speed: number, dt: number, anim: 'walk' | 'run' = 'run'): void {
    this.steerTo(x, z, speed, dt, anim);
  }

  /** Instant reposition (blink, leap landing, phase teleports) with optional effects. */
  teleport(x: number, z: number, vfx = true): void {
    const e = this.e;
    if (vfx) G.vfx.spawn('blink', e.pointAt(0.4));
    e.position.x = x;
    e.position.z = z;
    e.velocity.set(0, 0, 0);
    e.interp.clear();
    if (vfx) G.vfx.spawn('blink', e.pointAt(0.4));
  }

  /** Forced dash of `dist` metres along (dx,dz) in `dur` seconds. */
  dash(dx: number, dz: number, dist: number, dur: number): void {
    const l = Math.hypot(dx, dz) || 1;
    this.e.forcedMove = { vx: ((dx / l) * dist) / dur, vz: ((dz / l) * dist) / dur, until: this.world.time + dur };
    this.e.yaw = yawFromDir(dx, dz);
  }

  /** Leave a scripted mechanic phase and enter the next phase of the BossDef. */
  endMechanicPhase(): void {
    this.phaseLocked = false;
    this.suppressBasic = false;
    this.hold = false;
    this.moveOverride = null;
    if (this.phaseIdx + 1 < this.bdef.phases.length) this.enterPhase(this.phaseIdx + 1);
  }

  /** Toggle the "stand still and face the tank" behaviour of mechanic phases. */
  freeze(on: boolean): void {
    this.hold = on;
    this.suppressBasic = on;
  }

  // ---- fight lifecycle -------------------------------------------------------------------------------------------

  protected onAcquire(_target: Actor): void {
    this.engage();
  }

  /** Bosses ignore pack pulls; the room trigger / first damage engages them. */
  acquire(target: Actor, _pulled = true): void {
    super.acquire(target, true);
  }

  protected engage(): void {
    if (this.engaged) return;
    const e = this.e;
    this.engaged = true;
    this.fightT = 0;
    this.phaseIdx = -1;
    this.wipeT = 0;
    this.everInside = true;
    this.enraged = false;
    this.dmgMul = 1;
    this.atkMul = 1;
    this.reactUntil = this.now + 1.0;
    try {
      G.events.emit('boss:engaged', { bossId: this.bdef.id, entityId: e.id });
      if (this.bdef.introYell) this.yell(this.bdef.introYell);
      G.audio.play('boss_roar', { pos: [e.position.x, 1.5, e.position.z] });
      G.events.emit('camera:shake', { intensity: 0.35, duration: 0.5 });
    } catch { /* ignore */ }
    this.enterPhase(0);
    this.script.onEngage?.(this);
  }

  private enterPhase(i: number): void {
    const e = this.e;
    const phases = this.bdef.phases;
    const ph = phases[i];
    if (!ph) return;
    this.phaseIdx = i;
    this.phase = ph;
    // scripted mechanic phases (no abilities) last until the script calls endMechanicPhase()
    this.phaseLocked = ph.abilities.length === 0 && i < phases.length - 1;
    this.lockedAt = this.fightT;
    // abilities that just became available start on a partial cooldown
    let k = 0;
    for (const id of ph.abilities) {
      const ab = this.abilityList.find((a) => a.id === id);
      if (!ab) continue;
      const cur = this.readyAt.get(ab.id);
      if (i === 0 || cur === undefined || cur > this.now + 5000) {
        const first = ab.initialCooldown !== undefined && ab.initialCooldown < 900 ? ab.initialCooldown : ab.cooldown * 0.6;
        this.readyAt.set(ab.id, this.now + first);
      } else if (cur < this.now + 1.5) {
        // back from a mechanic phase: stagger the kit instead of firing everything at once
        this.readyAt.set(ab.id, this.now + 1.5 + k * 1.3);
      }
      k++;
    }
    if (i > 0) {
      try {
        G.events.emit('boss:phase', { bossId: this.bdef.id, entityId: e.id, phase: ph.id });
      } catch { /* ignore */ }
    }
    if (ph.onEnter?.yell && i > 0) this.yell(ph.onEnter.yell);
    if (ph.onEnter?.summon) this.spawnAdds(ph.onEnter.summon.enemyId, ph.onEnter.summon.count, { radius: 6, tag: 'add' });
    if (ph.onEnter?.ability) this.forceAbility(ph.onEnter.ability);
    this.script.onPhase?.(this, ph, i);
  }

  /** Back to the start: full HP, adds gone, shapes cancelled. */
  resetFight(): void {
    const e = this.e;
    this.inReset = true;
    try {
      G.hitShapes.cancelBySource(e.id, true);
    } catch { /* ignore */ }
    this.cancelTracked();
    if (this.busy) this.abortBusy('external');
    for (const o of this.adds()) o.escape();
    this.script.onReset?.(this);
    bossMovesReset(this);
    clearPatterns(this);
    this.cancelTimers();
    this.setImmune(false);
    e.statuses.clear();
    e.hp = e.maxHp;
    e.position.x = e.homeX;
    e.position.z = e.homeZ;
    e.velocity.set(0, 0, 0);
    e.interp.clear();
    e.cast = null;
    this.engaged = false;
    this.aggroed = false;
    e.aggroed = false;
    this.target = null;
    e.targetId = null;
    this.threat.clear();
    this.mode = 'idle';
    this.phase = null;
    this.phaseIdx = -1;
    this.phaseLocked = false;
    this.pending.length = 0;
    this.suppressBasic = false;
    this.hold = false;
    this.moveOverride = null;
    this.dmgMul = 1;
    this.atkMul = 1;
    this.enraged = false;
    for (const k of Object.keys(this.state)) delete this.state[k];
    this.cdOverride.clear();
    this.energy?.reset();
    this.awaitPull = this.pullMode === 'interact';
    this.basic = e.def.basicAttack;
    this.basicCd = e.def.attackCooldown;
    e.hover = e.def.hoverHeight ?? 0;
    e.setAlpha(1);
    this.script.init?.(this);
    this.inReset = false;
    try {
      G.events.emit('boss:wipe', { bossId: this.bdef.id });
      G.audio.play('boss_death', { pos: [e.position.x, 1, e.position.z], pitch: 0.7 });
    } catch { /* ignore */ }
  }

  runDeathEffects(killerId: number | null): void {
    const e = this.e;
    try {
      bossMovesReset(this);
      clearPatterns(this);
      this.script.onDeath?.(this);
      this.cancelTracked();
      G.hitShapes.cancelBySource(e.id, true); // lingering lava / frost zones end with the fight
      for (const o of this.adds()) o.escape();
      if (this.bdef.deathYell) this.yell(this.bdef.deathYell);
      G.events.emit('boss:defeated', { bossId: this.bdef.id, entityId: e.id });
      G.events.emit('camera:shake', { intensity: 0.6, duration: 0.8 });
    } catch (err) {
      console.error('[boss] death hook failed', err);
    }
    super.runDeathEffects(killerId);
  }

  // ---- frame ----------------------------------------------------------------------------------------------------

  protected tick(dt: number): void {
    const e = this.e;
    if (this.engaged) this.fightFrame(dt);
    tickLinks(this, dt);
    super.tick(dt);
    // keep the boss inside its arena
    if (this.engaged) {
      const a = this.arena;
      const m = e.radius + 0.5;
      e.position.x = clamp(e.position.x, a.cx - a.w / 2 + m, a.cx + a.w / 2 - m);
      e.position.z = clamp(e.position.z, a.cz - a.h / 2 + m, a.cz + a.h / 2 - m);
    }
  }

  private fightFrame(dt: number): void {
    const e = this.e;
    this.fightT += dt;
    this.energy?.step(dt);
    updatePatterns(this, dt);
    // phases by HP
    const hpf = e.hpFrac;
    const phases = this.bdef.phases;
    if (this.phaseLocked) {
      // safety net: a script forgot to end its phase (BossScript.lockLimit, default 150 s)
      const limit = (this.script as ScriptExt).lockLimit ?? 150;
      if (lockExpired(this.lockedAt, this.fightT, limit)) this.endMechanicPhase();
    } else {
      const next = phases[this.phaseIdx + 1];
      if (next && hpf < next.hpBelow) this.enterPhase(this.phaseIdx + 1); // one phase per frame
    }
    // enrage
    if (!this.enraged && this.fightT >= this.bdef.enrageTimer) {
      this.enraged = true;
      this.enrageT = 0;
      this.dmgMul *= 1.5;
      this.atkMul *= 1.25;
      try {
        G.vfx.spawn('boss_enrage', e.pointAt(0.5));
        G.events.emit('ui:toast', { text: `${e.name} öfkelendi!`, kind: 'boss' });
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.6 });
      } catch { /* ignore */ }
    } else if (this.enraged) {
      this.enrageT += dt;
      if (this.enrageT >= 8) {
        this.enrageT = 0;
        this.dmgMul *= 1.12;
      }
    }
    this.script.update?.(this, dt);
    // wipe: nobody alive inside the arena
    const alive = this.playersInArena(true).length;
    const any = this.world.players.length > 0;
    if (alive > 0) {
      this.everInside = true;
      this.wipeT = 0;
    } else if (any && this.everInside && this.fightT > 2) {
      this.wipeT += dt;
      if (this.wipeT > 1.5) this.resetFight();
    }
  }

  /** Bosses engage when a player steps into the arena (the room is the trigger) or hits them. */
  protected idleTick(dt: number, _now: number): void {
    this.halt(dt);
    if (this.awaitPull) return; // 'interact' boss: waits for releasePull()
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.25;
    for (const p of this.world.players) {
      if (p.isDead || p.removed) continue;
      if (this.insideArena(p.position.x, p.position.z, -1) && Math.hypot(p.position.x - this.e.position.x, p.position.z - this.e.position.z) < Math.max(this.bdef.aggroRange, 22)) {
        this.acquire(p, true);
        return;
      }
    }
  }

  protected canAttackMelee(): boolean {
    return true;
  }

  wantsSlot(): boolean {
    return false;
  }

  protected chooseAbility(now: number, target: Actor, dist: number, edge: number): EnemyAbility | null {
    if (this.busy) return null;
    if (this.pending.length) return this.pending.shift()!;
    if (now < this.gcdUntil) return null;
    const ids = this.phase?.abilities ?? [];
    for (const id of ids) {
      const ab = this.abilityList.find((a) => a.id === id);
      if (ab && this.usable(ab, now, target, dist, edge) && (this.energy?.canPay(ab.id) ?? true)) {
        this.energy?.spend(ab.id);
        this.gcdUntil = now + 0.7;
        return ab;
      }
    }
    if (this.suppressBasic) return null;
    const basic = this.basic;
    if (basic.params?.passive) return null;
    if (now >= this.basicReadyAt && edge <= basic.range * 0.95 + 0.5) return basic;
    return null;
  }

  protected moveForRole(dt: number, now: number, target: Actor, dist: number, edge: number): void {
    const e = this.e;
    if (this.moveOverride && this.moveOverride(dt)) return;
    const dx = target.position.x - e.position.x, dz = target.position.z - e.position.z;
    if (this.hold) {
      this.faceTo(dx, dz, 8, dt);
      this.halt(dt);
      return;
    }
    const kite = this.script.kite;
    if (kite) {
      if (edge < kite[0]) {
        const l = dist || 1;
        this.faceTo(dx, dz, 12, dt);
        this.applyMove(-dx / l, -dz / l, e.moveSpeed(), dt, 'back', false);
        return;
      }
      if (edge <= kite[1]) {
        this.faceTo(dx, dz, 12, dt);
        this.halt(dt);
        return;
      }
      this.steerTo(target.position.x, target.position.z, e.moveSpeed(), dt, 'run');
      return;
    }
    super.moveForRole(dt, now, target, dist, edge);
  }

  /** Phase scripts can ask for the next hit to come at once. */
  skipGcd(): void {
    this.gcdUntil = 0;
  }

  /** Public access for scripts to the busy record. */
  get currentBusy(): Busy | null {
    return this.busy;
  }
}
