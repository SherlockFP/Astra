import * as THREE from 'three';
import { G } from '../game/G';
import { cosmeticRng } from '../core/utils';
import type { DamageType } from '../types/common';
import type { Enemy } from '../entities/Enemy';
import { vfxScale, type HitWeight } from './feel';
import { specHas } from './specs';
import type { SkillSystem } from './SkillSystem';
import type { CastCtx } from './skills/behaviors';
import type { Actor } from '../entities/Actor';
import type { SkillDef } from '../types/skills';
import type { BarrierNova, BarrierThorn, MageCastMods, MageCtx, MageHit, TouchBurst } from './specs/mage';

/**
 * Passive-tree notables / keystones, legendaries and set bonuses ("specials") that need combat code.
 * The items module folds the plain stats (StatCalc) and exposes `G.character.specials[id].params`; everything else lives here:
 * small pure helpers used by Combat (damage pipeline, defence), SkillSystem (cast hooks) and the skill behaviours.
 * OWNER: combat module.
 */

/** Param bag of an active special (talent / unique / set) of the LOCAL character, or null when it is not active. */
export function sp(id: string): Record<string, number> | null {
  const e = G.character?.specials?.[id];
  return e ? e.params : null;
}

export const hasSp = (id: string): boolean => !!G.character?.specials?.[id];

/** Combined chance of independent echo sources. */
export const combineChance = (a: number, b: number): number => 1 - (1 - a) * (1 - b);

const nowT = (): number => G.world?.time ?? 0;

/** Runtime state of time-based specials (cooldowns, windows). Cleared on scene change. */
export class SpecialState {
  /** Anka Omuzluğu: world time when it can save the player again. */
  phoenixReadyAt = -1e9;
  mountainIcdUntil = 0;
  fortressIcdUntil = 0;
  /** Kadimlerin Gözü: damage type -> world time it was last dealt. */
  recent = new Map<DamageType, number>();

  reset(): void {
    this.phoenixReadyAt = -1e9;
    this.mountainIcdUntil = 0;
    this.fortressIcdUntil = 0;
    this.recent.clear();
  }

  /** Kadimlerin Gözü: +8% damage per distinct damage type dealt in the last 4 s (counting this hit). */
  eyeBonus(type: DamageType): number {
    const p = sp('leg_eye_of_ancients');
    if (!p) return 0;
    const now = nowT();
    const win = p.window ?? 4;
    this.recent.set(type, now);
    let n = 0;
    for (const [t, at] of this.recent) {
      if (now - at <= win) n++;
      else this.recent.delete(t);
    }
    return (p.perType ?? 0.08) * Math.min(p.maxTypes ?? 3, n);
  }
}

// ----------------------------------------------------------------------------------------------------------------
// shared effect helpers (visuals + damage), used by skill hooks
// ----------------------------------------------------------------------------------------------------------------

/** Radial shockwave around a point (Titan Kavrayışı, Dağın Kalbi, Anka Omuzluğu, Kutsal Öncü...). Returns hit count. */
export function shockwave(
  sys: SkillSystem,
  c: CastCtx,
  o: { radius: number; coef: number; knockback?: number; type?: DamageType; weight?: HitWeight; color?: number; x?: number; z?: number; vfx?: 'shockwave' | 'fire_burst' | 'holy_burst'; shake?: number },
): number {
  const p = c.caster;
  const x = o.x ?? p.position.x, z = o.z ?? p.position.z;
  sys.vfx(o.vfx ?? 'shockwave', [x, 0.12, z], { scale: vfxScale(o.vfx ?? 'shockwave', o.radius), color: o.color });
  sys.ring(x, z, o.radius, o.color ?? 0xffe9c8);
  sys.shake(o.shake ?? 0.22, 0.22);
  if (c.remote) return 0;
  let n = 0;
  for (const e of sys.enemiesNear(x, z, o.radius, G.world ? G.world.groundY(x, z) : null)) {
    const dx = e.position.x - x, dz = e.position.z - z;
    const l = Math.hypot(dx, dz) || 1;
    if (sys.strike(c, e, { coef: o.coef, type: o.type, weight: o.weight ?? 'heavy', knockback: o.knockback ?? 2, dir: [dx / l, dz / l], noGain: true })) n++;
  }
  return n;
}

/** Ejderdişi: a wave of fire racing forward from the caster (hits every enemy on the line once). */
export function fireWave(sys: SkillSystem, c: CastCtx, o: { range: number; coef: number; width?: number }): void {
  const { caster } = c;
  const [dx, dz] = c.dir;
  const width = o.width ?? 2.2;
  const ox = caster.position.x + dx * 1.2, oz = caster.position.z + dz * 1.2;
  sys.vfx('fire_burst', [ox, 0.6, oz], { scale: 0.9, dir: [dx, 0, dz] });
  sys.sfx('fire_cast', caster.position, { pitch: 0.9 });
  const hit = new Set<number>();
  let front = 0;
  let nextFx = 0;
  sys.addTask((dt) => {
    const nf = Math.min(o.range, front + 30 * dt);
    while (nextFx <= nf) {
      sys.vfx(nextFx % 2.4 < 1.2 ? 'fire_burst' : 'fire_ground', [ox + dx * nextFx, 0.3, oz + dz * nextFx], { scale: 0.55, duration: 0.6 });
      nextFx += 1.2;
    }
    if (!c.remote) {
      const list = G.world?.actorsInLine({ x: ox, z: oz }, { x: dx, z: dz }, nf, width, (a) => a.team === 'enemy' && !hit.has(a.id), caster.position.y) ?? [];
      for (const a of list) {
        hit.add(a.id);
        const e = a as unknown as Enemy;
        sys.strike(c, e, { coef: o.coef, type: 'fire', weight: 'light', noGain: true, dir: [dx, dz], statuses: [{ status: 'burn', duration: 3, magnitude: 0.3 }] });
        sys.vfx('fire_burst', [e.position.x, e.position.y + e.height * 0.5, e.position.z], { scale: 0.5, dir: [dx, 0, dz] });
      }
    }
    front = nf;
    return front >= o.range;
  });
}

/**
 * Kurt Kanı (4): a blood tornado that seeks the nearest enemy, lives 3 s and deals `coefPerSec` weapon damage per second
 * to everything it touches (ticks every 0.5 s).
 */
export function bloodTornado(sys: SkillSystem, c: CastCtx, o: { coefPerSec: number; life?: number; radius?: number }): void {
  const w = G.world;
  if (!w) return;
  const caster = c.caster;
  const life = o.life ?? 3;
  const radius = o.radius ?? 1.9;
  const holder = new THREE.Group();
  holder.position.set(caster.position.x, 0, caster.position.z);
  w.scene.add(holder);
  const fx = sys.vfx('storm_tornado', [holder.position.x, 0, holder.position.z], { follow: holder, duration: life, scale: 0.55, color: 0xd6452e });
  const ang = cosmeticRng.next() * Math.PI * 2;
  let vx = Math.cos(ang) * 3, vz = Math.sin(ang) * 3;
  let t = 0;
  let tickT = 0;
  sys.addTask((dt) => {
    t += dt;
    tickT += dt;
    // seek the nearest living enemy
    let best: Enemy | null = null;
    let bd = 14 * 14;
    for (const e of w.enemies) {
      if (e.isDead) continue;
      const d = (e.position.x - holder.position.x) ** 2 + (e.position.z - holder.position.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const dx = best.position.x - holder.position.x, dz = best.position.z - holder.position.z;
      const l = Math.hypot(dx, dz) || 1;
      vx += ((dx / l) * 6 - vx) * Math.min(1, dt * 4);
      vz += ((dz / l) * 6 - vz) * Math.min(1, dt * 4);
    }
    holder.position.x += vx * dt;
    holder.position.z += vz * dt;
    w.nav.resolveCircle(holder.position, 0.5);
    if (tickT >= 0.5) {
      tickT -= 0.5;
      if (!c.remote) {
        for (const e of sys.enemiesNear(holder.position.x, holder.position.z, radius, holder.position.y)) {
          const dx = e.position.x - holder.position.x, dz = e.position.z - holder.position.z;
          const l = Math.hypot(dx, dz) || 1;
          sys.strike(c, e, { coef: o.coefPerSec * 0.5, tick: true, noGain: true, dir: [dx / l, dz / l], knockback: 0.3 });
        }
      }
      sys.vfx('slash_arc', [holder.position.x, 1.0, holder.position.z], { scale: 0.8, color: 0xd6452e, dir: [Math.cos(t * 6), 0, Math.sin(t * 6)] });
    }
    if (t >= life) {
      try { fx?.stop(); } catch { /* ignore */ }
      holder.removeFromParent();
      return true;
    }
    return false;
  });
}

// ----------------------------------------------------------------------------------------------------------------
// spec hooks registry (GDD_TALENTS §1.3, T7 task 7). A trait's module (specs/mage.ts) registers its table under each
// trait id; the cast / hit pipeline calls the tables of the traits the actor owns. Every member is optional.
// ----------------------------------------------------------------------------------------------------------------

export interface SpecHooks {
  resolveCast?(caster: Actor, def: SkillDef, ctx: MageCtx): MageCastMods;
  commitCast?(caster: Actor, def: SkillDef, m: MageCastMods, ctx: MageCtx): void;
  onHit?(hit: MageHit, ctx: MageCtx): void;
  onFreeze?(caster: Actor, def: SkillDef, ctx: MageCtx): void;
  onDamageTaken?(defender: Actor, attacker: Actor | null, melee: boolean): BarrierThorn | null;
  onBarrierBroken?(caster: Actor): BarrierNova | null;
  collectTouchBursts?(): TouchBurst[];
  dotCritMult?(a: Actor): number;
}

const hooksByTrait = new Map<string, SpecHooks[]>();

/** Registers a hook table under a trait id (a table may serve several traits; it is kept once per trait). */
export function registerSpecHooks(traitId: string, hooks: SpecHooks): void {
  const list = hooksByTrait.get(traitId) ?? [];
  if (!list.includes(hooks)) list.push(hooks);
  hooksByTrait.set(traitId, list);
}

/** The hook tables of the traits the actor owns (each table once). Empty for enemies and spec-less players. */
export function specHooksOf(a: Actor): SpecHooks[] {
  const out: SpecHooks[] = [];
  for (const [trait, list] of hooksByTrait) {
    if (!specHas(a, trait)) continue;
    for (const h of list) if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** Every registered table (global sweeps such as the touch-burst timer). */
export function allSpecHooks(): SpecHooks[] {
  const out: SpecHooks[] = [];
  for (const list of hooksByTrait.values()) for (const h of list) if (!out.includes(h)) out.push(h);
  return out;
}

/** Weapon average W of an actor (the caster's weapon damage middle; level-scaled when no gear stats exist). */
export function weaponAvg(a: Actor): number {
  const lo = a.getStat('weaponMin');
  const hi = a.getStat('weaponMax');
  return hi > 0 ? (lo + hi) / 2 : 4 + a.level * 2;
}
