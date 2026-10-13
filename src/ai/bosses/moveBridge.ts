import type { BossController } from '../BossController';
import type { BossBreakOpts, BossHoldOpts, BossLeapOpts, BossStrike, BossStringOpts } from './types';

/**
 * K12 / P-41: boss-side move bridge. Strings, delayed swings (holds), leaps and the poise-break hook.
 *
 * Scope and rules:
 * - Pure helpers over the public BossController surface: `schedule`, `cancelTimers`, `shape`, `now`, `e`, `hold`, `script`.
 *   No G import, so the smoke script (tools/smoke/boss_moves.mjs) loads this file under plain Node.
 * - Timing follows GDD_CREATURES 3.1 to 3.4: strike 0 windup = windupFor(coef) (+ hold), strike k >= 1 starts `gap`
 *   after strike k-1 resolved with followWindupFor(coef), and spawns its own shape (re-aimed at the live target).
 * - Posture is the existing poise (src/combat/poise.ts). This file never owns a bar. The caller wires the break event:
 *   subscribe to 'poise:break' for this boss's enemyId and call `bossBreak(c)`.
 * - Cancelled shapes go through the host set by `setMoveBridgeHost` (wire it once at boot to
 *   `G.hitShapes.cancel(id)`). Until it is set, a break still stops the schedule but cannot retract shapes already out.
 * - Not done here (BossController owns them): blocking other boss abilities during a string, swing tokens, and the
 *   windup floor. Use `bossMovesActive(c)` to gate them. Call `bossMovesReset(c)` from onReset / onDeath.
 */

/** GDD_CREATURES 3.2: hard cap on a delayed swing's hold. */
export const HOLD_CAP_SEC = 0.6;
/** GDD_CREATURES 3.3: default gap between strikes (midpoint of 0.15 to 0.35, deterministic). */
export const STRING_GAP_SEC = 0.25;
/** GDD_V2 O1: default poise break window. */
const BREAK_WINDOW_SEC = 2.0;

/** Host hook: retract an enemy-owned hit shape by id (unknown ids must be ignored). */
export interface MoveBridgeHost {
  cancelShape(id: number): void;
}

let host: MoveBridgeHost = {
  // Replaced at boot via setMoveBridgeHost. Until then, shapes cannot be retracted by a break.
  cancelShape(): void {},
};

export function setMoveBridgeHost(next: MoveBridgeHost): void {
  host = next;
}

/** A live string, hold or leap. `done` is set once, by endRun. */
interface Run {
  tag: string;
  cancelOnBreak: boolean;
  shapeIds: number[];
  done: boolean;
  restoreHold: boolean | null;
  onFinish?: () => void;
  onCancel?: () => void;
}

interface BridgeState {
  runs: Set<Run>;
  nextId: number;
  /** Break window end (controller time). A break inside the window is a duplicate of the current one. */
  breakUntil: number;
  brokeOnce: boolean;
}

const STATES = new WeakMap<BossController, BridgeState>();

function stateOf(c: BossController): BridgeState {
  let st = STATES.get(c);
  if (!st) {
    st = { runs: new Set(), nextId: 1, breakUntil: -Infinity, brokeOnce: false };
    STATES.set(c, st);
  }
  return st;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** GDD_CREATURES 3.1: first telegraph of a melee-like move. */
export function windupFor(coef: number): number {
  return clamp(0.45 + 0.25 * coef, 0.45, 1.2);
}

/** GDD_CREATURES 3.1: 2nd and 3rd strike of a string (re-aimed, own shape). */
export function followWindupFor(coef: number): number {
  return clamp(0.3 + 0.12 * coef, 0.3, 0.55);
}

/** Draws a hold in seconds: min + (max - min) * rng(), capped at HOLD_CAP_SEC. */
export function rollHold(range: [number, number], rng: () => number): number {
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  return Math.min(HOLD_CAP_SEC, Math.max(0, lo + (hi - lo) * rng()));
}

function newRun(c: BossController, st: BridgeState, cancelOnBreak: boolean): Run {
  const run: Run = {
    tag: `mb:${st.nextId++}`,
    cancelOnBreak,
    shapeIds: [],
    done: false,
    restoreHold: null,
  };
  st.runs.add(run);
  return run;
}

/**
 * Ends a run once. `broke` = cancelled by a poise break or a reset: pending timers and shapes go, `onCancel` runs.
 * Otherwise it finished on its own: `onFinish` runs. The controller's `hold` flag is restored in both cases.
 */
function endRun(c: BossController, st: BridgeState, run: Run, broke: boolean): void {
  if (run.done) return;
  run.done = true;
  st.runs.delete(run);
  c.cancelTimers(run.tag);
  if (run.restoreHold !== null) c.hold = run.restoreHold;
  if (broke) {
    for (const id of run.shapeIds) host.cancelShape(id);
    run.onCancel?.();
  } else {
    run.onFinish?.();
  }
}

/** Aim helper: unit direction from the boss to a point, falling back to the boss's facing. */
function aimFrom(c: BossController, tx: number, tz: number): { dx: number; dz: number } {
  const ex = c.e.position.x;
  const ez = c.e.position.z;
  const dx = tx - ex;
  const dz = tz - ez;
  const l = Math.hypot(dx, dz);
  if (l < 0.01) return { dx: Math.sin(c.e.yaw), dz: Math.cos(c.e.yaw) };
  return { dx: dx / l, dz: dz / l };
}

/**
 * Runs a multi-strike string. Strike k spawns its cone when it starts (its `delay` is its windup), so the telegraph
 * and the hit shape are fresh on every strike. Returns null when there is nothing to run.
 */
export function bossString(c: BossController, steps: BossStrike[], opts: BossStringOpts): { id: string; done: () => boolean } | null {
  if (steps.length === 0) return null;
  const st = stateOf(c);
  const run = newRun(c, st, opts.cancelOnBreak ?? true);
  const rng = opts.rng ?? Math.random;
  const hold = opts.hold ? rollHold(opts.hold, rng) : 0;

  // Plan: start offset and windup (= delay) per strike, all relative to the call time.
  const starts: number[] = [];
  const delays: number[] = [];
  let prevResolve = 0;
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    const floor = k === 0 ? windupFor(s.coef) : followWindupFor(s.coef);
    const at = k === 0 ? 0 : prevResolve + (s.gap ?? STRING_GAP_SEC);
    const delay = Math.max(floor, s.windup ?? 0) + (k === 0 ? hold : 0);
    starts.push(at);
    delays.push(delay);
    prevResolve = at + delay;
  }
  const endAt = prevResolve;

  const fire = (k: number): void => {
    if (run.done) return;
    const s = steps[k];
    const tgt = opts.target;
    // GDD 3.3: the AI refuses a follow-up when the target is dead or out of reach (range * 1.6); the string ends.
    if (k > 0 && (tgt.isDead || Math.hypot(tgt.position.x - c.e.position.x, tgt.position.z - c.e.position.z) > s.range * 1.6)) {
      endRun(c, st, run, false);
      return;
    }
    const aim = aimFrom(c, tgt.position.x, tgt.position.z);
    const id = c.shape({
      shape: { type: 'cone', radius: s.range, angle: s.arc },
      x: c.e.position.x,
      z: c.e.position.z,
      dx: aim.dx,
      dz: aim.dz,
      delay: delays[k],
      coef: s.coef,
      type: s.type,
      statuses: s.statuses,
      knockback: s.knockback,
      telegraph: true,
      parryable: s.parryable ?? true,
      name: opts.name,
    });
    run.shapeIds.push(id);
  };

  for (let k = 0; k < steps.length; k++) {
    if (starts[k] === 0) fire(k);
    else c.schedule(starts[k], () => fire(k), run.tag);
  }
  c.schedule(endAt, () => endRun(c, st, run, false), run.tag);
  return { id: run.tag, done: () => run.done };
}

/**
 * Delayed swing / hold (GDD 3.2): the boss stands still (BossController.hold) for `seconds` (a number, or a range
 * drawn with rng and capped at HOLD_CAP_SEC for swings). Returns the hold length chosen.
 */
export function bossHold(c: BossController, seconds: number | [number, number], opts: BossHoldOpts = {}): number {
  const st = stateOf(c);
  const rng = opts.rng ?? Math.random;
  const sec = Array.isArray(seconds) ? Math.max(0, Math.min(seconds[0], seconds[1]) + Math.abs(seconds[1] - seconds[0]) * rng()) : Math.max(0, seconds);
  const run = newRun(c, st, opts.cancelOnBreak ?? true);
  run.restoreHold = c.hold;
  run.onFinish = opts.then;
  c.hold = true;
  c.schedule(sec, () => endRun(c, st, run, false), run.tag);
  return sec;
}

/**
 * Leap (GDD 3.4, "Sıçrayıp Ez"): the boss flies toward the target's current spot (distance clamped to [min, max]).
 * The landing circle spawns now with delay = airtime. Forced movement is applied through Enemy.forcedMove.
 * Returns the landing point.
 */
export function bossLeap(c: BossController, opts: BossLeapOpts): { x: number; z: number } {
  const st = stateOf(c);
  const run = newRun(c, st, opts.cancelOnBreak ?? true);
  const ex = c.e.position.x;
  const ez = c.e.position.z;
  const aim = aimFrom(c, opts.target.position.x, opts.target.position.z);
  const d = Math.hypot(opts.target.position.x - ex, opts.target.position.z - ez);
  const dist = clamp(d, opts.min ?? 0, opts.max ?? Infinity);
  const lx = ex + aim.dx * dist;
  const lz = ez + aim.dz * dist;
  const air = Math.max(0.05, opts.airtime);

  c.e.forcedMove = { vx: (lx - ex) / air, vz: (lz - ez) / air, until: c.now + air };

  const id = c.shape({
    shape: { type: 'circle', radius: opts.radius },
    x: lx,
    z: lz,
    dx: aim.dx,
    dz: aim.dz,
    delay: air,
    coef: opts.coef,
    type: opts.type,
    statuses: opts.statuses,
    telegraph: true,
    parryable: false,
    name: opts.name,
  });
  run.shapeIds.push(id);
  run.onCancel = () => {
    c.e.forcedMove = null;
  };
  c.schedule(air, () => endRun(c, st, run, false), run.tag);
  return { x: lx, z: lz };
}

/**
 * Poise break on this boss (call from the 'poise:break' subscriber for this enemy). It:
 * 1. ends every live run marked cancelOnBreak (timers, pending shapes, hold, leap movement);
 * 2. runs `script.onBreak` once per break. A repeat call inside the break window is a duplicate and does nothing more;
 *    with `once`, the hook runs at most once per fight.
 * Returns true when `onBreak` ran.
 */
export function bossBreak(c: BossController, opts: BossBreakOpts = {}): boolean {
  const st = stateOf(c);
  for (const run of [...st.runs]) {
    if (run.cancelOnBreak) endRun(c, st, run, true);
  }
  if (c.now < st.breakUntil) return false;
  st.breakUntil = c.now + (opts.windowSec ?? BREAK_WINDOW_SEC);
  if (opts.once && st.brokeOnce) return false;
  st.brokeOnce = true;
  c.script.onBreak?.(c);
  return true;
}

/** True while a string, hold or leap is still running. Use it to gate other boss abilities. */
export function bossMovesActive(c: BossController): boolean {
  return (STATES.get(c)?.runs.size ?? 0) > 0;
}

/** Ends every live run as cancelled (reset, death). Does not touch the break state. */
export function bossMovesReset(c: BossController): void {
  const st = STATES.get(c);
  if (!st) return;
  for (const run of [...st.runs]) endRun(c, st, run, true);
}
