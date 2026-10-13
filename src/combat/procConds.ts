/**
 * GDD_TALENTS §2.5 / Appendix D: the 17 conditions of a `T` row (`if=a&b`). OWNER: combat (T4). Pure: no `G`, no DOM.
 * The conditions are joined by AND. `still` and `moving` use isStanding, the same test as the engine's `still:<s>` timer,
 * so a condition and a timer never disagree about whether the player is standing.
 */
import type { Cond } from '../types/talents';
import type { StatusId } from '../types/skills';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { ProcHost } from './procActions';

/** Horizontal speed (units/s) under which an actor counts as standing still. */
export const STILL_SPEED = 0.15;
/** Radius of the `solo` condition: no ally within 40 m. */
export const SOLO_RADIUS = 40;

export interface CondEnv {
  /** The local player the procs act for. */
  self: Player;
  /** The trigger target (the enemy hit, the cast target...). Null when the trigger has none. */
  target: Actor | null;
  host: ProcHost;
}

/** True when the actor is not moving (horizontal speed under STILL_SPEED and no forced movement). */
export function isStanding(a: Actor): boolean {
  return Math.hypot(a.velocity.x, a.velocity.z) < STILL_SPEED && !a.forcedMove;
}

const ELITE_OR_HIGHER: ReadonlySet<string> = new Set(['elite', 'miniboss', 'boss']);

/** Enemy rank of an actor; undefined for players and for actors without an enemy def. */
function rankOf(a: Actor | null): string | undefined {
  if (!a || a.kind !== 'enemy') return undefined;
  return (a as Enemy).def?.rank;
}

/** Resource as a fraction of its maximum (0 when the maximum is 0). */
function resourceFrac(a: Actor): number {
  return a.maxResource > 0 ? a.resource / a.maxResource : 0;
}

/** Evaluates one condition. Target conditions are false when the trigger has no target. */
export function condHolds(c: Cond, env: CondEnv): boolean {
  const { self, target } = env;
  switch (c.c) {
    case 'hp<': return self.hpFrac < c.v;
    case 'hp>': return self.hpFrac > c.v;
    case 'res<': return resourceFrac(self) < c.v;
    case 'res>': return resourceFrac(self) > c.v;
    case 'thp<': return !!target && target.hpFrac < c.v;
    case 'thp>': return !!target && target.hpFrac > c.v;
    case 'pips>=': return env.host.pipCount(self, c.id) >= c.v;
    case 'tst': return !!target && target.statuses.has(c.status as StatusId);
    case 'sst': return self.statuses.has(c.status as StatusId);
    case 'still': return isStanding(self);
    case 'moving': return !isStanding(self);
    case 'stealth': return self.statuses.has('stealth') || self.statuses.has('shadow_veil_cd');
    case 'elite': {
      const r = rankOf(target);
      return r !== undefined && ELITE_OR_HIGHER.has(r);
    }
    case 'boss': return rankOf(target) === 'boss';
    case 'shield': return self.statuses.has('shield');
    case 'inCombat': return self.inCombat;
    case 'solo': return env.host.party(self, SOLO_RADIUS).length <= 1;
    default: return false;
  }
}

/** All conditions hold (an empty list holds). */
export function condsHold(conds: readonly Cond[], env: CondEnv): boolean {
  for (const c of conds) {
    if (!condHolds(c, env)) return false;
  }
  return true;
}
