/**
 * Falls and drops for the local player (ENGINE_VERTICALITY §11, package V7).
 *
 * Pure class, owned by PlayerController (one per local player). NO three.js and NO G import, so `tools/fall-check.mjs`
 * can import it. The controller ticks it after stepVertical, calls onLand() on every landing and performs the side effects
 * (fade, damage, teleport, toast) from the values returned here.
 *
 *  - safe history: grounded samples on safe ground (no VOID/LEDGE/LIFT under the feet, no VOID/LEDGE within SAFE_EDGE_PAD)
 *    every 0.1 s, kept for SAFE_HIST_SEC. The respawn spot is the newest sample at least SAFE_BACK_SEC old, else the checkpoint.
 *  - void fall: over a VOID cell (or below killY) and y < rimY - VOID_KILL_BELOW. rimY = the last grounded height on
 *    non-void ground, so a jump off a ledge into a pit counts from the ledge.
 *  - landings: drop <= FALL_FREE free, <= FALL_RESPAWN_DROP hard (non-lethal damage), beyond it a void fall (respawn).
 */
import { F, VERT } from '../world/Heightfield';

/** Clamp of the hard-landing damage, fraction of max HP (§11). */
export const FALL_DMG_CAP = 0.24;
/** Black-out before the respawn teleport, seconds (§11 `screen:fade` 0.35 s). */
export const VOID_FADE_OUT = 0.35;
/** Sampling period of the safe history, seconds. */
const SAMPLE_EVERY = 0.1;
/** Probe step for the edge test (half a nav cell). */
const PROBE = 0.5;

export interface SafeSample { x: number; z: number; y: number; t: number; }
/** A respawn point. yaw is optional: undefined keeps the current facing. */
export interface Spot { x: number; z: number; y?: number; yaw?: number; }
export interface FallBody { x: number; y: number; z: number; grounded: boolean; }
export interface FallEnv {
  /** NAV_F bits at x,z (0 outside the grid). */
  flagsAt(x: number, z: number): number;
  /** Below this height a falling actor at (x,z) has fallen (WorldHeights.killY). -Infinity when unknown. */
  killY(x: number, z: number): number;
}
export type LandingKind = 'free' | 'hard' | 'void';

export class FallHandler {
  private hist: SafeSample[] = [];
  private sampleAcc = 0;
  /** Last grounded height on non-void ground; -Infinity until the first grounded frame. */
  private rimY = Number.NEGATIVE_INFINITY;
  /** Pending void fall: controller time at which the fade has finished, and where to put the player. */
  private pendingAt = -1;
  private pendingSpot: Spot | null = null;

  /** Forgets history, rim and any pending respawn (scene change, death, revive). */
  reset(): void {
    this.hist.length = 0;
    this.sampleAcc = 0;
    this.rimY = Number.NEGATIVE_INFINITY;
    this.cancelPending();
  }

  cancelPending(): void {
    this.pendingAt = -1;
    this.pendingSpot = null;
  }

  get isPending(): boolean {
    return this.pendingAt >= 0;
  }

  /**
   * Per-frame update after the vertical step. Records safe samples and rim height, and returns true exactly when a
   * void fall starts this frame (the caller then runs the fade/damage effects through startVoid()). Returns false while
   * a void fall is already pending.
   */
  tick(now: number, dt: number, b: FallBody, env: FallEnv): boolean {
    if (this.isPending) return false;
    this.sampleAcc += dt;
    if (b.grounded && this.sampleAcc >= SAMPLE_EVERY) {
      this.sampleAcc = 0;
      if (isSafeSpot(b.x, b.z, env.flagsAt)) this.hist.push({ x: b.x, z: b.z, y: b.y, t: now });
    }
    while (this.hist.length > 0 && now - this.hist[0].t > VERT.SAFE_HIST_SEC) this.hist.shift();

    const over = (env.flagsAt(b.x, b.z) & F.VOID) !== 0 || b.y < env.killY(b.x, b.z);
    if (b.grounded && !over) this.rimY = b.y;
    if (!over) return false;
    const deep = b.y < this.rimY - VERT.VOID_KILL_BELOW;
    return deep || b.y < env.killY(b.x, b.z);
  }

  /** Safe history, oldest first (read-only view for tools and tests). */
  history(): readonly SafeSample[] {
    return this.hist;
  }

  /** Respawn point now: newest sample at least SAFE_BACK_SEC old, else `checkpoint`, else null. */
  pickSpot(now: number, checkpoint: Spot | null): Spot | null {
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const s = this.hist[i];
      if (now - s.t >= VERT.SAFE_BACK_SEC) return { x: s.x, z: s.z, y: s.y };
    }
    return checkpoint;
  }

  /**
   * Starts a void fall unless one is already pending. Returns true when it started (the caller runs the one-time effects).
   * The spot is chosen now, so the history used is the one before the fall.
   */
  startVoid(now: number, checkpoint: Spot | null): boolean {
    if (this.isPending) return false;
    this.pendingSpot = this.pickSpot(now, checkpoint);
    this.pendingAt = now + VOID_FADE_OUT;
    return true;
  }

  /** The respawn spot once the fade has finished (null while still fading, or when no spot exists: caller falls back). */
  due(now: number): { spot: Spot | null } | null {
    if (!this.isPending || now < this.pendingAt) return null;
    const spot = this.pendingSpot;
    this.cancelPending();
    return { spot };
  }

  /** The player was placed at `y` (after a respawn): that height becomes the rim. */
  onRespawned(y: number): void {
    this.rimY = y;
    this.sampleAcc = 0;
  }

  /** Landing classification for a drop in metres (drop = fallStartY - groundY at touchdown). */
  onLand(drop: number): LandingKind {
    return FallHandler.classifyLanding(drop);
  }

  static classifyLanding(drop: number): LandingKind {
    if (drop > VERT.FALL_RESPAWN_DROP) return 'void';
    if (drop > VERT.FALL_FREE) return 'hard';
    return 'free';
  }

  /** Non-lethal hard-landing damage in HP: min(0.24, (drop - 4) * 0.03) * maxHp, 0 at or below FALL_FREE. */
  static hardDamage(drop: number, maxHp: number): number {
    if (drop <= VERT.FALL_FREE) return 0;
    return Math.min(FALL_DMG_CAP, (drop - VERT.FALL_FREE) * VERT.FALL_DMG_PER_M) * maxHp;
  }

  /** Void fall damage in HP: 25 % of max HP (CM §13). Applied non-lethal by the caller. */
  static voidDamage(maxHp: number): number {
    return maxHp * VERT.VOID_DMG_FRAC;
  }
}

/**
 * Safe sample test (§11): the cell under the feet has no VOID, LEDGE or LIFT flag, and no VOID or LEDGE cell lies within
 * SAFE_EDGE_PAD of the feet (probed on a half-metre grid).
 */
export function isSafeSpot(x: number, z: number, flagsAt: (x: number, z: number) => number): boolean {
  if (flagsAt(x, z) & (F.VOID | F.LEDGE | F.LIFT)) return false;
  const pad = VERT.SAFE_EDGE_PAD;
  const n = Math.round(pad / PROBE);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const dx = i * PROBE, dz = j * PROBE;
      if (dx * dx + dz * dz > pad * pad + 1e-9) continue;
      if (flagsAt(x + dx, z + dz) & (F.VOID | F.LEDGE)) return false;
    }
  }
  return true;
}
