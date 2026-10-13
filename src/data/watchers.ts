/**
 * KIT PK-0 · condition watchers (docs/kits/casters-rogue.md E4). A watcher turns a target-side condition into a hidden self
 * status that the kit glow rules and `replaces.whileStatus` read. The host runs every WATCHER_PERIOD (0.25 s) for the local
 * player only (SkillSystem.updateLocal). Each applied window lasts WATCH_HOLD, a bit longer than the period, so a late tick
 * never flickers the status off. Kit packages add watchers with `registerWatchers()`. OWNER: combat (data).
 */
import type { StatusDef, StatusId } from '../types/skills';

export const WATCHER_PERIOD = 0.25;
/** Seconds of each applied window (longer than the period). */
const WATCH_HOLD = 0.5;
/** Radius (m) around the target for `enemiesNearTarget`. */
export const WATCHER_RADIUS = 10;

export interface WatcherCtx {
  /** Target HP as a fraction 0..1, or null without a target. */
  targetHpPct: number | null;
  /** Living enemies within WATCHER_RADIUS of the target, the target included (0 without a target). */
  enemiesNearTarget: number;
}

export interface WatcherDef {
  /** Unique row id. */
  id: string;
  /** Hidden self status held while `test` is true. */
  status: StatusId;
  test: (c: WatcherCtx) => boolean;
}

/** Shared watchers (E4): aoe_mode = at least 3 enemies within 10 m of the target; exec_window = target below 20 % HP. */
export const WATCHERS: WatcherDef[] = [
  { id: 'aoe_mode', status: 'aoe_mode', test: (c) => c.enemiesNearTarget >= 3 },
  { id: 'exec_window', status: 'exec_window', test: (c) => c.targetHpPct !== null && c.targetHpPct < 0.2 },
];

/** StatusDef rows of the shared hidden watcher statuses (merged into STATUSES by data/statuses.ts). */
export const WATCHER_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  aoe_mode: { id: 'aoe_mode', name: 'Çoklu Hedef', icon: '/assets/icons/buff-crit.svg', kind: 'buff', hidden: true },
  exec_window: { id: 'exec_window', name: 'İnfaz Penceresi', icon: '/assets/icons/buff-crit.svg', kind: 'buff', hidden: true },
};

/** Extension point for kit packages. Throws on a duplicate id or status so two merges can never overwrite each other. */
export function registerWatchers(rows: readonly WatcherDef[]): void {
  for (const row of rows) {
    if (WATCHERS.some((w) => w.id === row.id || w.status === row.status)) {
      throw new Error(`registerWatchers: duplicate watcher "${row.id}"`);
    }
    WATCHERS.push(row);
  }
}

/** The part of a status holder the host writes (structurally satisfied by StatusEffects). */
export interface WatcherStatusView {
  has(id: StatusId): boolean;
  apply(id: StatusId, duration: number): boolean;
  remove(id: StatusId): void;
}

/** Per-player host: accumulates dt and evaluates every watcher once per period. */
export class WatcherHost {
  private acc = 0;

  /**
   * Call every frame. `buildCtx` runs only when a period elapses (the enemy count is not free). Returns true when it ran.
   */
  update(dt: number, owner: WatcherStatusView, buildCtx: () => WatcherCtx): boolean {
    this.acc += dt;
    if (this.acc < WATCHER_PERIOD) return false;
    this.acc = 0;
    const ctx = buildCtx();
    for (const w of WATCHERS) {
      const on = w.test(ctx);
      if (on) owner.apply(w.status, WATCH_HOLD);
      else if (owner.has(w.status)) owner.remove(w.status);
    }
    return true;
  }

  reset(): void {
    this.acc = 0;
  }
}
