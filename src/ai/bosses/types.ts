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
}
