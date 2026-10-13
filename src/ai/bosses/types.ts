import type { Actor } from '../../entities/Actor';
import type { BossPhase, EnemyAbility } from '../../types/enemies';
import type { Busy } from '../EnemyAI';
import type { BossController } from '../BossController';

/** Custom boss ability (same lifecycle as abilities.ts CustomHandler, but typed with the boss brain). */
export interface BossHandler {
  usable?(c: BossController, ab: EnemyAbility, target: Actor, dist: number): boolean;
  start?(c: BossController, b: Busy): void;
  resolve?(c: BossController, b: Busy): void;
  tick?(c: BossController, b: Busy, dt: number, t: number): void;
  end?(c: BossController, b: Busy): void;
  abort?(c: BossController, b: Busy, reason: string): void;
}

/** Everything a boss does beyond the generic ability pipeline. One per boss id (ai/bosses/index.ts). */
export interface BossScript {
  /** Handlers keyed by ability id (kind 'custom' abilities, or generic ones that need extra behaviour). */
  abilities: Record<string, BossHandler>;
  /** Casters hold this distance band instead of chasing. */
  kite?: [number, number];
  init?(c: BossController): void;
  onEngage?(c: BossController): void;
  onPhase?(c: BossController, phase: BossPhase, index: number): void;
  update?(c: BossController, dt: number): void;
  onDeath?(c: BossController): void;
  onReset?(c: BossController): void;
  /** P-39: a poise break on this boss. Run once per break by `bossBreak()` (moveBridge.ts), never by the caller directly. */
  onBreak?(c: BossController): void;
}

// ---- K12 / P-40 + P-41: boss move strings, holds and leaps (see moveBridge.ts) ----

/**
 * One strike of a boss string. Mirrors GDD_CREATURES StrikeStep (Appendix A). Kept local until
 * src/types/enemies.ts and src/ai/moves.ts (G-CR4 / G-CR6) exist; then this becomes a re-export.
 */
export interface BossStrike {
  /** Damage coefficient (x boss base damage). */
  coef: number;
  /** Reach in metres. */
  range: number;
  /** Cone arc in degrees. */
  arc: number;
  /** Animation clip name (informational until the boss anim hook is wired). */
  anim?: string;
  /** Explicit windup; the GDD floor (windupFor / followWindupFor) still applies, the longer one wins. */
  windup?: number;
  /** Seconds after the previous strike resolved (default 0.25). Ignored on strike 0. */
  gap?: number;
  knockback?: number;
  type?: NonNullable<EnemyAbility['damage']>['type'];
  statuses?: NonNullable<EnemyAbility['statuses']>;
  /** Default true. */
  parryable?: boolean;
}

export interface BossStringOpts {
  target: Actor;
  /** Delayed swing [min, max] seconds, drawn per call with `rng`, added to strike 0 and capped at 0.6 s. */
  hold?: [number, number];
  /** Random source in [0, 1). Default Math.random. Inject for deterministic tests. */
  rng?: () => number;
  /** Default true: a poise break ends the rest of the string (GDD_CREATURES 3.3). */
  cancelOnBreak?: boolean;
  /** Ability name shown on the shapes. */
  name?: string;
}

export interface BossHoldOpts {
  /** Random source in [0, 1) used when `seconds` is a range. */
  rng?: () => number;
  /** Default true: a poise break ends the hold early (no `then`). */
  cancelOnBreak?: boolean;
  /** Called when the hold ends normally. */
  then?: () => void;
}

export interface BossLeapOpts {
  target: Actor;
  /** Landing distance clamp in metres (default 0 .. infinity). */
  min?: number;
  max?: number;
  /** Seconds in the air; the landing circle resolves at this time. */
  airtime: number;
  /** Landing circle radius in metres. */
  radius: number;
  coef: number;
  type?: NonNullable<EnemyAbility['damage']>['type'];
  statuses?: NonNullable<EnemyAbility['statuses']>;
  name?: string;
  /** Default true: a poise break cancels the leap (forced movement stops, landing shape is cancelled). */
  cancelOnBreak?: boolean;
}

export interface BossBreakOpts {
  /** Length of the break window in seconds (default 2.0, GDD_V2 O1). Repeat calls inside it are duplicates. */
  windowSec?: number;
  /** Run `script.onBreak` at most once per fight. */
  once?: boolean;
}
