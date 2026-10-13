/**
 * KIT PK-0 (docs/kits/casters-rogue.md E10; CORE_MECHANICS §10.2 "behind"). Pure angle test for the kit `requires.behind` checks.
 * Not wired yet: Combat.isBehind (rear 130 deg, the game-wide ×1.3 rear rule) keeps its own check, per the orchestrator
 * positional decision in CORE_MECHANICS §10.2. The call-site switch to this helper is CM13 `requires.behind`.
 */

/** Behind = the attacker is more than this many degrees away from the target's facing (CORE_MECHANICS §10.2). */
export const BEHIND_ANGLE_DEG = 110;

const COS_BEHIND = Math.cos((BEHIND_ANGLE_DEG * Math.PI) / 180);

/**
 * True when the attacker stands behind the target. `facing` is the target's forward vector on XZ; `toAttacker` is
 * (attacker − target) on XZ. Either length may be anything (only the direction counts). Zero-length input is never behind.
 */
export function isBehind(facing: readonly [number, number], toAttacker: readonly [number, number]): boolean {
  const fl = Math.hypot(facing[0], facing[1]);
  const al = Math.hypot(toAttacker[0], toAttacker[1]);
  if (fl < 1e-6 || al < 1e-6) return false;
  const cos = (facing[0] * toAttacker[0] + facing[1] * toAttacker[1]) / (fl * al);
  return cos < COS_BEHIND;
}
