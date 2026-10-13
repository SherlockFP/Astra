/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §7e, §g E2 / E3). Rogue kit behaviours, installed into BEHAVIORS by the import at the
 * end of behaviors.ts (microtask fallback when the module is evaluated before behaviors.ts finishes, as in mageKit.ts):
 *   kit_shadow_step   Gölge Adımı v2: enemy or ally target within 25 m, lands 1.2 m behind it (else ±45/±90 deg, else "Yol yok")
 *   kit_shadowstrike  Gölge Vuruşu: the same placement, then a strike with the stealth factor
 *   kit_backstab      Sırttan Bıçak: rear bonus is Combat's game-wide rule (no extra multiplier here)
 *   kit_finisher      E2 finisher: CP-scaled coefficient; mode 0 single, 1 area (crowd), 2 clones (Gizli Teknik)
 */
import * as THREE from 'three';
import { G } from '../../game/G';
import { yawFromDir } from '../../core/utils';
import { BEHAVIORS, crowdFactor, type Behavior, type CastCtx } from './behaviors';
import { isBehind } from '../positional';
import { addAbsorb, healFormula } from '../healing';
import type { Player } from '../../entities/Player';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';

export const BEHAVIORS_KIT_ROGUE: Record<string, Behavior> = {};

/** Gölge Adımı lands this far behind the target (centre to centre), or farther when the two bodies would overlap. */
const STANDOFF = 1.2;
/** Search order for a free landing spot: directly behind first, then ±45 deg, then ±90 deg (§7e). */
const ANGLES_DEG = [0, 45, -45, 90, -90];
/** Largest floor difference between the target and the landing spot (vertical-aware, metres). */
const MAX_DROP = 1.0;
/** A landing spot whose circle would have to be pushed out of a wall by more than this is rejected. */
const MAX_PUSH = 0.05;

export interface Spot { x: number; y: number; z: number; yaw: number }

function rot(x: number, z: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

/** True when a body of `radius` can stand at (x, z) on the floor level `refY` (NavGrid standable, vertical-aware, no push-out). */
function spotFree(caster: Actor, x: number, z: number, refY: number): number | null {
  const w = G.world;
  if (!w) return refY;
  if (!w.nav.isStandable(x, z)) return null;
  const y = w.groundY(x, z);
  if (Math.abs(y - refY) > MAX_DROP) return null;
  const tmp = new THREE.Vector3(x, y, z);
  w.nav.resolveCircle(tmp, caster.radius);
  if (Math.hypot(tmp.x - x, tmp.z - z) > MAX_PUSH) return null;
  return y;
}

/**
 * Landing spot for the caster next to `t`. Enemies (and allies used as a Gölge Adımı target): the caster stands behind the
 * target (opposite its facing). Allies: beside the ally (its right-hand side). Either way the caster faces the target.
 */
export function findShadowSpot(caster: Actor, t: Actor, beside: boolean): Spot | null {
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
  const base: [number, number] = beside ? [fz, -fx] : [-fx, -fz];
  const off = Math.max(STANDOFF, t.radius + caster.radius + 0.3);
  for (const deg of ANGLES_DEG) {
    const [dx, dz] = rot(base[0], base[1], deg);
    const x = t.position.x + dx * off, z = t.position.z + dz * off;
    const y = spotFree(caster, x, z, t.position.y);
    if (y === null) continue;
    return { x, y, z, yaw: yawFromDir(t.position.x - x, t.position.z - z) };
  }
  return null;
}

const toast = (text: string): void => { G.events.emit('ui:toast', { text, kind: 'warning' }); };

/** A target the teleport can use: alive, within `range` of the caster (shared by Gölge Adımı and Gölge Vuruşu). */
function teleportTarget(c: CastCtx, enemyOnly: boolean): Actor | null {
  const range = c.def.range ?? 25;
  let t: Actor | null = c.target;
  // SkillSystem picks a soft target only for melee_arc / dash / behavior 'shadow_step' (shared hook, see report): fall back to the
  // nearest enemy within range so the kit behaviour still has a target.
  if (!t || t.isDead) {
    const w = G.world;
    const list = w ? w.enemiesInRadius({ x: c.caster.position.x, z: c.caster.position.z }, range, c.caster.position.y) : [];
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of list) {
      if (e.isDead) continue;
      const d = Math.hypot(e.position.x - c.caster.position.x, e.position.z - c.caster.position.z);
      if (d < bestD) { best = e; bestD = d; }
    }
    t = best;
  }
  if (!t || t.isDead) return null;
  if (enemyOnly && t.kind !== 'enemy') return null;
  const d = Math.hypot(t.position.x - c.caster.position.x, t.position.z - c.caster.position.z);
  return d <= range ? t : null;
}

/** Moves the caster to a validated spot (frame 0 visuals, frame 1 position). Local cast only; remote peers see the jump by sync. */
function placeCaster(c: CastCtx, spot: Spot, t: Actor | null): void {
  const { caster, sys } = c;
  const from = [caster.position.x, caster.position.y, caster.position.z] as [number, number, number];
  sys.vfx('stealth_smoke', [from[0], from[1] + 0.3, from[2]], { scale: 1.1 });
  sys.hideModel(caster, 0.08);
  caster.position.set(spot.x, spot.y, spot.z);
  caster.yaw = spot.yaw;
  caster.forcedMove = null;
  sys.vfx('stealth_smoke', [spot.x, spot.y + 0.3, spot.z], { scale: 1.1 });
  sys.vfx('shadowstep_streak', [(from[0] + spot.x) / 2, spot.y + 0.9, (from[2] + spot.z) / 2], { scale: 1 });
  if (t && t.kind === 'enemy') sys.vfx('backstab_mark', [t.position.x - Math.sin(t.yaw) * 0.35, t.position.y + 1.0, t.position.z - Math.cos(t.yaw) * 0.35], { scale: 1 });
  sys.sfx('whoosh', caster.position, { pitch: 1.4 });
  sys.playClip(caster, 'Dodge_Forward', { speed: 1.8, fade: 0.03 });
  G.camera?.kickFov?.(-3);
}

/** Gölge Adımı v2 (§7e). begin: validates the target and the landing (no cooldown / charge is spent on a fail). */
const kitShadowStep: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = teleportTarget(c, false);
    if (!t) { toast('Hedef yok'); return false; }
    const spot = findShadowSpot(c.caster, t, t.kind !== 'enemy');
    if (!spot) { toast('Yol yok'); return false; }
    c.data.spot = spot;
    c.data.target = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) { sys.vfx('shadow_burst', [caster.position.x, caster.position.y + 1, caster.position.z], { scale: 1.3 }); return; }
    const spot = c.data.spot as Spot | undefined;
    const t = (c.data.target as Actor | undefined) ?? null;
    if (!spot) return;
    placeCaster(c, spot, t);
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
  },
};

/** Gölge Vuruşu (§7a): same placement rule, then a strike with the stealth factor and find_weakness. */
const kitShadowStrike: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = teleportTarget(c, true);
    if (!t) { toast('Hedef yok'); return false; }
    const spot = findShadowSpot(c.caster, t, false);
    if (!spot) { toast('Yol yok'); return false; }
    c.data.spot = spot;
    c.data.target = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) { sys.vfx('shadow_burst', [caster.position.x, caster.position.y + 1, caster.position.z], { scale: 1.3 }); return; }
    const spot = c.data.spot as Spot | undefined;
    const t = (c.data.target as Enemy | undefined) ?? null;
    if (!spot || !t) return;
    placeCaster(c, spot, t);
    const p = def.params ?? {};
    const res = sys.strike(c, t as Enemy, { more: p.stealthMore ?? 1.25, weight: 'light', stagger: p.stagger ?? 8 });
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    if (!res) sys.whiff(c);
    sys.addCombo(caster, p.cp ?? 2);
  },
};

/** Sırttan Bıçak (§7a). Rear bonus = Combat's game-wide rule; the legacy stealth x1.8 is removed (the engine's opener covers it). */
const kitBackstab: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 3.0;
    const at: [number, number, number] = [caster.position.x + c.dir[0] * range * 0.6, caster.position.y + 1.0, caster.position.z + c.dir[1] * range * 0.6];
    sys.vfx(def.vfx?.trail ?? 'slash_arc', at, { dir: [c.dir[0], 0, c.dir[1]], scale: 1 });
    if (c.remote) return;
    const stealthed = caster.statuses.has('stealth') || caster.statuses.has('shadow_veil_cd');
    const targets = sys.enemiesInCone(caster, c.dir, range, def.arc ?? 45);
    for (const e of targets) {
      const behind = caster.statuses.has('behind_grace') || isBehind([Math.sin(e.yaw), Math.cos(e.yaw)], [caster.position.x - e.position.x, caster.position.z - e.position.z]);
      if (behind) sys.vfx('backstab_mark', [e.position.x, e.position.y + 1.0, e.position.z], { scale: 1 });
      sys.strike(c, e, { stagger: p.stagger ?? 8, weight: 'light' });
    }
    if (!targets.length) { sys.whiff(c); return; }
    if (stealthed) caster.statuses.apply('find_weakness', 10, { sourceId: caster.id });
    sys.addCombo(caster, p.cp ?? 1);
  },
};

/**
 * E2 finisher. begin: needs `minCp` points. fire: spends all points; the coefficient is base + perCp x points.
 * mode 0: one target (the first in the cone). mode 1: every enemy within `radius`, coefficient scaled by crowdFactor(n).
 * mode 2 (Gizli Teknik): the main target takes three strikes + two clones (total = base + perCp x points, split 50/25/25),
 * and every other enemy within explodeRadius of it takes explodePct of the total.
 */
const kitFinisher: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const need = c.def.params?.minCp ?? 1;
    if (c.sys.comboPoints(c.caster) < need) { c.sys.fail('resource'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 3.0;
    const cp = c.remote ? 3 : sys.consumeCombo(caster);
    if (c.remote) return;
    const mode = p.mode ?? 0;
    const base = p.base ?? 0.5;
    const perCp = p.perCp ?? 0.38;
    // Karanlık Gece (Ölüm İşareti): the next Zehirleme doubles and refunds points (Zehirleme only: darkMul set)
    let total = base + perCp * cp;
    if (p.darkMul && caster.statuses.has('darkest_night')) {
      total *= p.darkMul;
      caster.statuses.remove('darkest_night');
      sys.addCombo(caster, p.darkRefund ?? 0);
    }
    // Durations / magnitudes of the def's DoT (Yırtma: 8 + 4 per point, 0.84 per point; Kızıl Fırtına likewise)
    const statuses = def.statuses?.map((s) => ({
      ...s,
      duration: s.duration + (p.durPerCp ?? 0) * cp,
      magnitude: (s.magnitude ?? 0) * (p.magPerCp ? cp : 1),
    }));
    const hitStrikes: DamageHits = [];

    if (mode === 1) {
      const radius = p.radius ?? def.radius ?? 6;
      const list = sys.enemiesInCone(caster, c.dir, radius, 360).slice(0, p.maxTargets ?? 8);
      const k = crowdFactor(list.length);
      for (const e of list) hitStrikes.push(sys.strike(c, e, { coef: total * k, weight: 'heavy', stagger: p.stagger ?? 6, noGain: true, statuses }));
    } else if (mode === 2) {
      const main = sys.enemiesInCone(caster, c.dir, range, def.arc ?? 60)[0];
      if (!main) { sys.whiff(c); return; }
      const explodeR = p.explodeRadius ?? 6;
      hitStrikes.push(sys.strike(c, main, { coef: total * 0.5, weight: 'heavy', stagger: p.stagger ?? 8, noGain: true }));
      hitStrikes.push(sys.strike(c, main, { coef: total * 0.25, weight: 'light', noGain: true }));
      hitStrikes.push(sys.strike(c, main, { coef: total * 0.25, weight: 'light', noGain: true }));
      sys.vfx('secret_clones', [main.position.x, main.position.y + 1, main.position.z], { scale: 1 });
      const area = G.world ? G.world.enemiesInRadius({ x: main.position.x, z: main.position.z }, explodeR, main.position.y) : [];
      for (const e of area) {
        if (e === main || e.isDead) continue;
        hitStrikes.push(sys.strike(c, e, { coef: total * (p.explodePct ?? 0.4), weight: 'light', noGain: true }));
      }
    } else {
      const list = sys.enemiesInCone(caster, c.dir, range, def.arc ?? 60).slice(0, p.maxTargets ?? 1);
      for (const e of list) hitStrikes.push(sys.strike(c, e, { coef: total, weight: 'heavy', stagger: (p.stagger ?? 8), noGain: true, statuses }));
    }
    if (!hitStrikes.some((r) => r !== null)) sys.whiff(c);
  },
};

type DamageHits = Array<ReturnType<CastCtx['sys']['strike']>>;

/** Koruyucu İksir (Simyacı, §8a): absorb on a friendly target, Simya Bağı for 15 s. Target = friendly target, else self. */
const kitWardPotion: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = c.target;
    c.data.ally = t && t.kind !== 'enemy' && !t.isDead ? t : c.caster;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) return;
    const p = def.params ?? {};
    const ally = (c.data.ally as Player | undefined) ?? caster;
    addAbsorb(ally, healFormula(caster, p.absorbCoef ?? 1.5).amount, ally.maxHp * 0.45, p.absorbDur ?? 15, undefined, caster.id);
    ally.statuses.apply('alchemy_link', p.linkDur ?? 15, { sourceId: caster.id });
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    sys.sfx('buff', ally.position);
  },
};

/** Yüce Karışım (Simyacı major, §8a): absorb 60 % of max HP for 6 s. The channel pulses and their poison are not wired (report). */
const kitAscendant: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) return;
    const p = def.params ?? {};
    addAbsorb(caster, caster.maxHp * (p.absorbPct ?? 0.6), caster.maxHp * (p.absorbPct ?? 0.6), p.dur ?? 6, undefined, caster.id);
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
  },
};

Object.assign(BEHAVIORS_KIT_ROGUE, {
  kit_shadow_step: kitShadowStep,
  kit_shadowstrike: kitShadowStrike,
  kit_backstab: kitBackstab,
  kit_finisher: kitFinisher,
  kit_ward_potion: kitWardPotion,
  kit_ascendant: kitAscendant,
});

function installKitRogue(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_ROGUE);
}

try {
  installKitRogue();
} catch {
  queueMicrotask(installKitRogue);
}
