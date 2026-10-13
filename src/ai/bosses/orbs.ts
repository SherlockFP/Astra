import type { BossController } from '../BossController';
import type { Player } from '../../entities/Player';
import type { DamageType } from '../../types/common';
import { bossFx } from '../bossNet';

/**
 * Boss orbs, fixate and watch zones (P-35). Host-only: the boss controller is host-authoritative, so orb movement, touch
 * damage (a HitShape at the orb, which every peer already knows how to replicate) and watch-zone entries are decided here.
 * Orb state lives in `c.state` (cleared on boss reset). Scripts drive the updates from BossScript.update:
 *   updateOrbs(c, dt, { onTouch, onArrive })   and   updateWatchZones(c, dt).
 * Visuals: a one-shot `arcane_orb` effect at spawn and at expiry only. A moving orb visual needs a MECH entity from
 * P-20 (deferred).
 * OWNER: enemies module.
 */

const ORB_KEY = '__orbs';
const ZONE_KEY = '__watch';
const TOUCH_COOLDOWN = 0.6;

export interface Orb {
  readonly id: number;
  x: number;
  z: number;
  /** Heading in the boss convention (dx = sin, dz = cos); unused while seeking. */
  dir: number;
  speed: number;
  /** Seconds left; the orb ends (and calls onArrive for roaming orbs) at 0. */
  life: number;
  r: number;
  coef: number;
  type: DamageType;
  once: boolean;
  /** Seeking orbs steer toward this player. */
  seek: Player | null;
  /** Seconds left of seeking; 0 = seek until caught or life ends. */
  seekFor: number;
  catchR: number;
  onCatch?: (o: Orb) => void;
  /** World time when this orb may hit again. */
  nextHitAt: number;
}

interface OrbState {
  list: Orb[];
  nextId: number;
}

export interface RoamingOrbOpts {
  x: number;
  z: number;
  /** Heading in radians (boss convention) for a roaming orb. Ignored when `seek` is set. */
  dir?: number;
  speed: number;
  life: number;
  r: number;
  coef: number;
  type?: DamageType;
  /** Removed after its first touch. */
  once?: boolean;
  seek?: Player | null;
  /** Seconds the orb chases `seek` before it gives up (0 = until life ends). */
  seekFor?: number;
  catchR?: number;
  onCatch?: (o: Orb) => void;
}

function orbState(c: BossController): OrbState {
  let s = c.state[ORB_KEY] as OrbState | undefined;
  if (!s) {
    s = { list: [], nextId: 1 };
    c.state[ORB_KEY] = s;
  }
  return s;
}

/**
 * Boss orb (the boss-side `spawnOrb`; Affixes has its own function of that name). Roams along `dir` or seeks `seek`. Touching a
 * living player spends one hit (`coef` x boss damage, circle of radius `r`) every 0.6 s. Returns the orb id.
 */
export function roamingOrb(c: BossController, o: RoamingOrbOpts): number {
  const s = orbState(c);
  const orb: Orb = {
    id: s.nextId++,
    x: o.x,
    z: o.z,
    dir: o.dir ?? 0,
    speed: o.speed,
    life: o.life,
    r: o.r,
    coef: o.coef,
    type: o.type ?? 'arcane',
    once: !!o.once,
    seek: o.seek ?? null,
    seekFor: o.seekFor ?? 0,
    catchR: o.catchR ?? 1.2,
    onCatch: o.onCatch,
    nextHitAt: 0,
  };
  s.list.push(orb);
  bossFx('arcane_orb', o.x, o.z, { dir: [Math.sin(orb.dir), Math.cos(orb.dir)], dur: Math.min(orb.life, 4) });
  return orb.id;
}

/** Stationary orb: a roaming orb with no speed. */
export function bossOrb(c: BossController, x: number, z: number, o: Omit<RoamingOrbOpts, 'x' | 'z' | 'speed'> = { life: 20, r: 1.5, coef: 1 }): number {
  return roamingOrb(c, { ...o, x, z, speed: 0 });
}

/**
 * Fixate: an orb that chases one player for `seconds` at `speed` m/s and calls `onCatch` when it reaches `catchR`. It deals no
 * damage (`coef` 0), so the catch is the mechanic. Returns the orb id.
 */
export function fixate(
  c: BossController,
  target: Player,
  o: { seconds: number; speed: number; catchR?: number; onCatch?: (orb: Orb) => void; x?: number; z?: number },
): number {
  return roamingOrb(c, {
    x: o.x ?? c.e.position.x,
    z: o.z ?? c.e.position.z,
    speed: o.speed,
    life: o.seconds,
    r: 0,
    coef: 0,
    seek: target,
    seekFor: o.seconds,
    catchR: o.catchR ?? 1.2,
    onCatch: o.onCatch,
  });
}

/**
 * Advance every orb by `dt`. Seeking orbs steer to their player and call onCatch within catchR. Roaming orbs move along `dir`
 * and call `onArrive` when their life ends. A living player inside `touchR` (default: the orb radius) triggers the orb's hit at
 * most once per 0.6 s; `onTouch` runs for that player, and `once` orbs are removed after the touch.
 */
export function updateOrbs(
  c: BossController,
  dt: number,
  o: { touchR?: number; onTouch?: (p: Player, orb: Orb) => void; onArrive?: (orb: Orb) => void } = {},
): void {
  const s = orbState(c);
  if (!s.list.length) return;
  const now = c.world.time;
  const keep: Orb[] = [];
  for (const orb of s.list) {
    orb.life -= dt;
    if (orb.seekFor > 0) {
      orb.seekFor -= dt;
      if (orb.seekFor <= 0) orb.seek = null; // gave up the chase; keeps drifting along dir
    }
    let gone = false;
    if (orb.seek) {
      const t = orb.seek;
      if (t.removed || t.isDead) orb.seek = null;
      else {
        const dx = t.position.x - orb.x, dz = t.position.z - orb.z;
        const d = Math.hypot(dx, dz);
        if (d <= orb.catchR) {
          orb.onCatch?.(orb);
          gone = true;
        } else {
          const step = Math.min(d, orb.speed * dt);
          orb.x += (dx / d) * step;
          orb.z += (dz / d) * step;
        }
      }
    }
    if (!orb.seek && !gone && orb.speed > 0) {
      orb.x += Math.sin(orb.dir) * orb.speed * dt;
      orb.z += Math.cos(orb.dir) * orb.speed * dt;
    }
    if (!gone && orb.life <= 0) {
      if (!orb.seek) o.onArrive?.(orb);
      bossFx('arcane_orb', orb.x, orb.z, { dur: 1 });
      gone = true;
    }
    if (!gone && orb.coef > 0 && now >= orb.nextHitAt) {
      const touchR = o.touchR ?? orb.r;
      let touched = false;
      for (const p of c.world.players) {
        if (p.removed || p.isDead) continue;
        if (Math.hypot(p.position.x - orb.x, p.position.z - orb.z) > touchR) continue;
        touched = true;
        o.onTouch?.(p, orb);
      }
      if (touched) {
        orb.nextHitAt = now + TOUCH_COOLDOWN;
        c.shape({ shape: { type: 'circle', radius: Math.max(0.5, orb.r) }, x: orb.x, z: orb.z, dx: 0, dz: 1, delay: 0, coef: orb.coef, telegraph: false, type: orb.type });
        if (orb.once) gone = true;
      }
    }
    if (!gone) keep.push(orb);
  }
  s.list = keep;
}

/** Remove every orb of this boss (reset, death). */
export function clearOrbs(c: BossController): void {
  orbState(c).list = [];
}

/** Living orbs (for scripts that count or despawn them). */
export function orbsOf(c: BossController): readonly Orb[] {
  return orbState(c).list;
}

// ---- watch zones ----------------------------------------------------------------------------------------------------------

interface WatchZone {
  x: number;
  z: number;
  r: number;
  left: number;
  once: boolean;
  tag: string;
  onEnter: (p: Player) => void;
  inside: Set<number>;
}

function zoneState(c: BossController): WatchZone[] {
  let z = c.state[ZONE_KEY] as WatchZone[] | undefined;
  if (!z) {
    z = [];
    c.state[ZONE_KEY] = z;
  }
  return z;
}

/**
 * Watch zone: calls `onEnter(p)` each time a living player steps into the circle (edge-triggered; standing still does not repeat
 * it). `once` ends the zone after its first entry. It expires after `duration` seconds. Returns nothing; use `tag` to clear.
 */
export function watchZone(
  c: BossController,
  o: { x: number; z: number; r: number; duration: number; once?: boolean; tag?: string; onEnter: (p: Player) => void },
): void {
  zoneState(c).push({ x: o.x, z: o.z, r: o.r, left: o.duration, once: !!o.once, tag: o.tag ?? '', onEnter: o.onEnter, inside: new Set() });
}

/** Advance the watch zones: expiry, entries and exits (host). */
export function updateWatchZones(c: BossController, dt: number): void {
  const list = zoneState(c);
  if (!list.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    z.left -= dt;
    if (z.left <= 0) {
      list.splice(i, 1);
      continue;
    }
    let fired = false;
    const now = new Set<number>();
    for (const p of c.world.players) {
      if (p.removed || p.isDead) continue;
      if (Math.hypot(p.position.x - z.x, p.position.z - z.z) > z.r) continue;
      now.add(p.id);
      if (!z.inside.has(p.id)) {
        z.onEnter(p);
        fired = true;
      }
    }
    z.inside = now;
    if (z.once && fired) list.splice(i, 1);
  }
}

/** Remove the watch zones (all, or those with `tag`). */
export function clearWatchZones(c: BossController, tag?: string): void {
  const list = zoneState(c);
  if (!tag) list.length = 0;
  else for (let i = list.length - 1; i >= 0; i--) if (list[i].tag === tag) list.splice(i, 1);
}
