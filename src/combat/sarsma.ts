/**
 * Sarsma (Stagger) of the Brewmaster (Demci, monk_brewmaster; GDD_CLASSES_V2 §1.11). A share of the damage the Brewmaster takes is not
 * taken at once: it goes into the pool and drains back as damage over POOL_SEC (10 s). Each delayed chunk drains linearly.
 * Purifying Brew removes a share of the pool at once (behaviors_monk.ts purgePool -> sarsmaPurge).
 * The pool is mirrored into the hidden `stagger_pool` status (magnitude = pool HP, refreshed a few times a second) so the APL's
 * `status:stagger_pool` can read it. Shares come from the spec's trait (specs_kit_monk.ts `trait_brewmaster`): `staggerAbsorb` for
 * physical damage, `staggerMagic` for every other type. Combat.hitLocalPlayer accrues the pool, Combat.updateSarsma drains it.
 */
import { specOf } from './specs';
import type { Actor } from '../entities/Actor';
import type { DamageType } from '../types/common';

/** Seconds a delayed chunk takes to drain back (the pool's "10 s DoT"). */
export const POOL_SEC = 10;
/** The hidden status that mirrors the pool (data/statuses_kit_monk.ts). */
const STATUS = 'stagger_pool';
/** Mirror refresh interval (game seconds). */
const SYNC_EVERY = 0.25;
/** Below this the pool counts as empty (no status, no drain). */
const EPS = 0.5;

/** One delayed chunk: drains `rate` HP per second until the pool clock reaches `until`. */
interface Chunk { rate: number; until: number }
interface PoolState { t: number; chunks: Chunk[]; synced: number }

const pools = new WeakMap<Actor, PoolState>();

function stateOf(a: Actor): PoolState {
  let s = pools.get(a);
  if (!s) { s = { t: 0, chunks: [], synced: -Infinity }; pools.set(a, s); }
  return s;
}

/** Share of a hit of this type that goes into the pool (0 for anyone but a Brewmaster). */
export function sarsmaShare(a: Actor, type: DamageType): number {
  const trait = specOf(a)?.specials?.find((x) => x.id === 'trait_brewmaster');
  if (!trait) return 0;
  if (type === 'true') return 0;
  return type === 'physical' ? trait.params?.staggerAbsorb ?? 0 : trait.params?.staggerMagic ?? 0;
}

/** HP currently in the pool. */
export function sarsmaPool(a: Actor): number {
  const s = pools.get(a);
  if (!s) return 0;
  let sum = 0;
  for (const c of s.chunks) sum += c.rate * Math.max(0, c.until - s.t);
  return sum;
}

/** Writes the pool into the hidden status (now, or at most every SYNC_EVERY seconds). */
function sync(a: Actor, s: PoolState, force: boolean): void {
  const pool = sarsmaPool(a);
  if (pool <= EPS) {
    if (a.statuses.has(STATUS)) a.statuses.remove(STATUS);
    s.synced = s.t;
    return;
  }
  if (!force && s.t - s.synced < SYNC_EVERY && a.statuses.has(STATUS)) return;
  a.statuses.apply(STATUS, POOL_SEC, { magnitude: pool });
  s.synced = s.t;
}

/** A hit landed: the share of `amount` that goes into the pool (HP, taken off the immediate damage by the caller). */
export function sarsmaAccrue(a: Actor, amount: number, type: DamageType): number {
  if (!(amount > 0)) return 0;
  const share = sarsmaShare(a, type);
  const delayed = amount * share;
  if (delayed <= 0) return 0;
  const s = stateOf(a);
  s.chunks.push({ rate: delayed / POOL_SEC, until: s.t + POOL_SEC });
  sync(a, s, true);
  return delayed;
}

/** Advances the pool by dt and returns the HP it drains in that step. */
export function sarsmaTick(a: Actor, dt: number): number {
  const s = pools.get(a);
  if (!s) return 0;
  if (!s.chunks.length) { sync(a, s, false); return 0; }
  const from = s.t;
  s.t += dt;
  let drain = 0;
  for (const c of s.chunks) drain += c.rate * Math.max(0, Math.min(s.t, c.until) - from);
  s.chunks = s.chunks.filter((c) => c.until > s.t);
  sync(a, s, false);
  return drain;
}

/** Purifying Brew: removes `pct` of the pool at once (the drain of every chunk is cut by the same share). Returns the HP removed. */
export function sarsmaPurge(a: Actor, pct: number): number {
  const s = pools.get(a);
  if (!s || !(pct > 0)) return 0;
  const before = sarsmaPool(a);
  const keep = Math.max(0, 1 - pct);
  for (const c of s.chunks) c.rate *= keep;
  sync(a, s, true);
  return before - sarsmaPool(a);
}
