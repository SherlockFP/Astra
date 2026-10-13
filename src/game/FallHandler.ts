/**
 * Falls and drops for the local player (ENGINE_VERTICALITY §11, package V7).
 *
 * Pure class, owned by PlayerController (one per local player). NO three.js and NO G import, so `tools/fall-check.mjs`
 * can import it. The controller ticks it after stepVertical, calls onLand() on every landing and performs the side effects
 * (fade, damage, teleport, toast) from the values returned here.
 *
 *  - safe history: grounded samples on walkable ground (the cell under the feet is not VOID, LEDGE or LIFT), every 0.1 s,
 *    kept for SAFE_HIST_SEC. Each sample stores its clearance (distance to the nearest VOID/LEDGE cell, capped) and the
 *    travel direction it was walked in. Narrow bridges therefore stay in the history: a sample on a 2 m bridge has ~1 m
 *    clearance and is still usable (a 1.5 m pad rejected every bridge cell, so every fall fell back to the checkpoint).
 *  - respawn spot: newest sample at least SAFE_BACK_SEC old with clearance >= RESPAWN_CLEAR (2 m); when none qualifies
 *    (bridges narrower than 4 m) the newest one with >= RESPAWN_CLEAR_MIN, then any; else the dungeon checkpoint.
 *    The facing points away from the void: the travel direction when it has an open run of 4 m, else the open direction.
 *  - void fall: over a VOID cell (or below killY) and y < rimY - VOID_KILL_BELOW. rimY = the last grounded height on
 *    non-void ground, so a jump off a ledge into a pit counts from the ledge.
 *  - landings: drop <= FALL_FREE free, <= FALL_RESPAWN_DROP hard (non-lethal damage), beyond it a void fall (respawn).
 */
import { F, VERT } from '../world/Heightfield';

/** Clamp of the hard-landing damage, fraction of max HP (§11). */
export const FALL_DMG_CAP = 0.24;
/** Black-out before the respawn teleport, seconds (§11 `screen:fade` 0.35 s). */
export const VOID_FADE_OUT = 0.35;
/** Fade back in after the respawn, seconds. */
export const VOID_FADE_IN = 0.3;
/** Movement input is ignored this long after the fade-in (ENGINE_VERTICALITY §11: 0.4 s). */
export const VOID_INPUT_LOCK = 0.4;
/** Invulnerability granted by a void respawn, seconds (§11: 1 s). */
export const VOID_INVULN_SEC = 1;
/** Preferred respawn clearance from VOID/LEDGE cells, metres. */
export const RESPAWN_CLEAR = 2;
/** Lower respawn clearance for narrow bridges, metres (a 2 m bridge centre has 1 m). */
export const RESPAWN_CLEAR_MIN = 0.9;
/** Sampling period of the safe history, seconds. */
const SAMPLE_EVERY = 0.1;
/** Probe step for the clearance tests (half a nav cell), metres. */
const PROBE = 0.5;
/** Clearance is measured up to this distance, metres. */
const CLEAR_CAP = 6;
/** A facing with at least this much open ground ahead is kept when it is the travel direction, metres. */
const FACE_TRAVEL_OPEN = 4;
/** Cells that make a point unsafe to stand on or to respawn beside. */
const EDGE = F.VOID | F.LEDGE;

export interface SafeSample {
  x: number;
  z: number;
  y: number;
  t: number;
  /** Distance to the nearest VOID/LEDGE cell, metres, capped at CLEAR_CAP. */
  clear: number;
  /** Unit travel direction when the sample was taken ((0,0) when unknown). */
  dx: number;
  dz: number;
}
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
  /** Position of the previous sample and the unit direction walked since then ((0,0) when unknown). */
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private travelX = 0;
  private travelZ = 0;
  /** Pending void fall: controller time at which the fade has finished, and where to put the player. */
  private pendingAt = -1;
  private pendingSpot: Spot | null = null;

  /** Forgets history, rim and any pending respawn (scene change, death, revive). Not called by a void respawn. */
  reset(): void {
    this.hist.length = 0;
    this.sampleAcc = 0;
    this.rimY = Number.NEGATIVE_INFINITY;
    this.lastX = Number.NaN;
    this.lastZ = Number.NaN;
    this.travelX = 0;
    this.travelZ = 0;
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
      this.record(now, b, env.flagsAt);
    }
    while (this.hist.length > 0 && now - this.hist[0]!.t > VERT.SAFE_HIST_SEC) this.hist.shift();

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

  /**
   * Respawn point now (see the header for the tiers). `flagsAt` is optional: without it the facing is the sample's
   * travel direction, with it the facing is chosen away from the void.
   */
  pickSpot(now: number, checkpoint: Spot | null, flagsAt?: (x: number, z: number) => number): Spot | null {
    const pick = (min: number): SafeSample | null => {
      for (let i = this.hist.length - 1; i >= 0; i--) {
        const s = this.hist[i]!;
        if (now - s.t >= VERT.SAFE_BACK_SEC && s.clear >= min) return s;
      }
      return null;
    };
    const s = pick(RESPAWN_CLEAR) ?? pick(RESPAWN_CLEAR_MIN) ?? pick(0);
    if (!s) return checkpoint;
    return spotFrom(s, flagsAt);
  }

  /**
   * Starts a void fall unless one is already pending. Returns true when it started (the caller runs the one-time effects).
   * The spot is chosen now, so the history used is the one before the fall.
   */
  startVoid(now: number, checkpoint: Spot | null, env?: FallEnv): boolean {
    if (this.isPending) return false;
    this.pendingSpot = this.pickSpot(now, checkpoint, env?.flagsAt);
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

  /**
   * The player was placed at `y` (after a void respawn): that height becomes the rim. The safe history is kept on purpose,
   * so a second fall right after the respawn still finds the bridge; only the position link is cut.
   */
  onRespawned(y: number): void {
    this.rimY = y;
    this.sampleAcc = 0;
    this.lastX = Number.NaN;
    this.lastZ = Number.NaN;
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

  /** Void fall damage in HP: exactly 25 % of max HP (CM §13), a function of maxHp only. */
  static voidDamage(maxHp: number): number {
    return maxHp * VERT.VOID_DMG_FRAC;
  }

  /** HP a void fall actually removes: the full voidDamage, but never more than leaves the player at 1 HP (non-lethal). */
  static voidDamageTaken(hp: number, maxHp: number): number {
    return Math.max(0, Math.min(FallHandler.voidDamage(maxHp), hp - 1));
  }

  private record(now: number, b: FallBody, flagsAt: (x: number, z: number) => number): void {
    if (flagsAt(b.x, b.z) & (EDGE | F.LIFT)) return;
    if (Number.isFinite(this.lastX)) {
      const mx = b.x - this.lastX, mz = b.z - this.lastZ;
      const len = Math.hypot(mx, mz);
      if (len > 0.05) {
        this.travelX = mx / len;
        this.travelZ = mz / len;
        this.lastX = b.x;
        this.lastZ = b.z;
      }
    } else {
      this.lastX = b.x;
      this.lastZ = b.z;
    }
    const clear = clearanceAt(b.x, b.z, flagsAt, CLEAR_CAP);
    this.hist.push({ x: b.x, z: b.z, y: b.y, t: now, clear, dx: this.travelX, dz: this.travelZ });
  }
}

/**
 * Safe sample test (§11, the strict form): the cell under the feet has no VOID, LEDGE or LIFT flag, and no VOID or LEDGE
 * cell lies within SAFE_EDGE_PAD of the feet (probed on a half-metre grid). Used by the tests and tools; the history
 * itself records by clearance (see the header).
 */
export function isSafeSpot(x: number, z: number, flagsAt: (x: number, z: number) => number): boolean {
  if (flagsAt(x, z) & (F.VOID | F.LEDGE | F.LIFT)) return false;
  const pad = VERT.SAFE_EDGE_PAD;
  return clearanceAt(x, z, flagsAt, pad) >= pad - 1e-9;
}

/**
 * Distance from (x,z) to the nearest VOID/LEDGE cell, probed on a half-metre grid and capped at `cap`. 0 when the point
 * itself is VOID/LEDGE.
 */
export function clearanceAt(x: number, z: number, flagsAt: (x: number, z: number) => number, cap: number = CLEAR_CAP): number {
  if (flagsAt(x, z) & EDGE) return 0;
  let best = cap;
  const n = Math.ceil(cap / PROBE);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const dx = i * PROBE, dz = j * PROBE;
      const d2 = dx * dx + dz * dz;
      if (d2 > cap * cap || d2 >= best * best) continue;
      if (flagsAt(x + dx, z + dz) & EDGE) best = Math.sqrt(d2);
    }
  }
  return best;
}

/** Distance walked from (x,z) along the unit direction (dx,dz) before a VOID/LEDGE cell, capped at maxD. */
function rayClear(x: number, z: number, dx: number, dz: number, flagsAt: (x: number, z: number) => number, maxD: number): number {
  for (let d = PROBE; d < maxD; d += PROBE) {
    if (flagsAt(x + dx * d, z + dz * d) & EDGE) return d;
  }
  return maxD;
}

/**
 * The respawn point for a chosen sample. Facing: forward is (sin yaw, cos yaw), so yaw = atan2(dx, dz). The travel
 * direction is kept when it has FACE_TRAVEL_OPEN metres of open ground ahead; otherwise the open direction with the
 * longest run (the nearest non-void neighbour side) is used.
 */
function spotFrom(s: SafeSample, flagsAt?: (x: number, z: number) => number): Spot {
  const hasTravel = s.dx !== 0 || s.dz !== 0;
  if (!flagsAt) return { x: s.x, z: s.z, y: s.y, yaw: hasTravel ? Math.atan2(s.dx, s.dz) : undefined };
  if (hasTravel && rayClear(s.x, s.z, s.dx, s.dz, flagsAt, CLEAR_CAP) >= FACE_TRAVEL_OPEN) {
    return { x: s.x, z: s.z, y: s.y, yaw: Math.atan2(s.dx, s.dz) };
  }
  // run = open metres ahead (the void is what limits it); the half-metre bonus breaks ties toward "back the way we came"
  let bestDx = hasTravel ? s.dx : 0, bestDz = hasTravel ? s.dz : 1;
  let bestScore = -Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const dx = Math.sin(a), dz = Math.cos(a);
    const run = rayClear(s.x, s.z, dx, dz, flagsAt, CLEAR_CAP);
    const score = run + (hasTravel ? -0.5 * (dx * s.dx + dz * s.dz) : 0);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestDx = dx;
      bestDz = dz;
    }
  }
  return { x: s.x, z: s.z, y: s.y, yaw: Math.atan2(bestDx, bestDz) };
}
