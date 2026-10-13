// CW-07 · Proc watcher (COMBAT_WOW §2.7 item 2). Diffs the LOCAL player's statuses against PROC_DEFS and emits
// `proc:gain` when a proc status appears and `proc:fade` when it leaves. Presentation (overlay, button glow, sound) listens
// to those events, so no spell or talent code has to emit them by hand. Owned by SkillSystem.updateLocal.
import { G } from '../game/G';
import { PROC_DEFS } from '../data/procs';
import type { StatusId } from '../types/skills';
import type { Player } from '../entities/Player';

/** A proc removed with more than this many seconds left was spent by a cast (`consumed`). */
export const PROC_CONSUME_MIN_LEFT = 0.3;

interface Tracked {
  status: StatusId;
  /** Seconds left on the status at the last frame. */
  left: number;
}

export class ProcWatcher {
  private active = new Map<string, Tracked>();

  /** Call every frame with the local player; `dt` is the frame's sim time in seconds. */
  update(p: Player, dt: number): void {
    for (const def of PROC_DEFS) {
      const s = p.statuses.get(def.status);
      const prev = this.active.get(def.id);
      if (s) {
        if (prev) {
          prev.left = s.remaining;
        } else {
          this.active.set(def.id, { status: def.status, left: s.remaining });
          G.events.emit('proc:gain', { id: def.id, status: def.status, duration: s.duration, stacks: s.stacks });
        }
      } else if (prev) {
        this.active.delete(def.id);
        // it was still running a frame ago: more than 0.3 s left means a cast spent it, a run-out has ~dt left
        G.events.emit('proc:fade', { id: def.id, consumed: prev.left - dt > PROC_CONSUME_MIN_LEFT });
      }
    }
  }

  /** Forgets every tracked proc without emitting (scene change, death). */
  reset(): void {
    this.active.clear();
  }
}
