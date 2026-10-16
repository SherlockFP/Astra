import type { EventBus } from '../../../core/EventBus';
import type { ItemInstance } from '../../../types/items';
import type { RunState } from '../../../types/mythic';

/**
 * Run tally: what the local player gained between run:started and run:completed (XP, level-ups, gold, pickups). The run summary
 * (runSummary.ts) shows it on the end card. Fed only by events (player:xp, player:levelup, loot:pickedUp), so it works the same for
 * normal dungeons, the starter band and Mitik+ runs. Kept free of DOM and of G so the headless sim can drive it directly.
 * OWNER: panels-game module.
 */

/** Level, XP inside the level and the XP the level needs (Progression.xpToNext) at one moment. */
export interface XpPoint {
  level: number;
  xp: number;
  needed: number;
}

export interface RunTallyData {
  /** Run key (dungeon | seed | key level | elapsed), the same key the summary dedupes on. */
  key: string;
  /** Sum of the XP gains of the run (negative gains such as the open-world death penalty are not counted). */
  xp: number;
  start: XpPoint | null;
  end: XpPoint | null;
  /** The level reached by every level-up during the run, in order. */
  levelUps: number[];
  gold: number;
  /** Items picked up on the ground during the run (not the end-of-run chest). */
  items: ItemInstance[];
  materials: { id: string; count: number }[];
}

export interface PickupEvent {
  item?: ItemInstance;
  gold?: number;
  material?: { id: string; count: number };
  globe?: boolean;
}

export const runKeyOf = (s: RunState): string => `${s.dungeonId}|${s.seed}|${s.keyLevel}|${Math.round(s.elapsed)}`;

export class RunTallyCollector {
  private active = false;
  private cur: RunTallyData = { key: '', xp: 0, start: null, end: null, levelUps: [], gold: 0, items: [], materials: [] };
  /** The last finished run (the summary reads it when its payload carries no tally, e.g. the chest-opened card). */
  last: RunTallyData | null = null;

  /** run:started: a fresh tally from the character's XP point at the start. */
  start(at: XpPoint | null, key = ''): void {
    this.active = true;
    this.cur = { key, xp: 0, start: at, end: at, levelUps: [], gold: 0, items: [], materials: [] };
  }

  addXp(gained: number, at: XpPoint | null): void {
    if (!this.active) return;
    if (gained > 0) this.cur.xp += gained;
    if (at) this.cur.end = at;
  }

  addLevelUp(level: number): void {
    if (this.active) this.cur.levelUps.push(level);
  }

  addPickup(p: PickupEvent): void {
    if (!this.active) return;
    if (p.item) this.cur.items.push(p.item);
    if (p.gold && p.gold > 0) this.cur.gold += p.gold;
    if (p.material && p.material.count > 0) this.cur.materials.push({ id: p.material.id, count: p.material.count });
  }

  /** run:completed: freeze the tally of the run that just finished (later pickups belong to the town / next run). */
  finish(key: string, at: XpPoint | null): RunTallyData {
    if (at) this.cur.end = at;
    this.cur.key = key;
    this.active = false;
    this.last = { ...this.cur, levelUps: [...this.cur.levelUps], items: [...this.cur.items], materials: [...this.cur.materials] };
    return this.last;
  }

  /** The tally of a finished run, if it is the one with this key. */
  forKey(key: string): RunTallyData | null {
    return this.last && this.last.key === key ? this.last : null;
  }
}

export const RUN_TALLY = new RunTallyCollector();

/**
 * Subscribes the collector to the game events. `readXp` gives the local character's XP point (null outside a character).
 * Returns the disposer for the event subscriptions. `ev` is the EventBus (only `on` is used).
 */
export function installRunTally(ev: EventBus, readXp: () => XpPoint | null, runKey: (s: RunState) => string): () => void {
  const offs = [
    ev.on('run:started', (e) => RUN_TALLY.start(readXp(), runKey(e.state))),
    ev.on('player:xp', (e) => RUN_TALLY.addXp(e.gained, readXp())),
    ev.on('player:levelup', (e) => RUN_TALLY.addLevelUp(e.level)),
    ev.on('loot:pickedUp', (e) => RUN_TALLY.addPickup(e)),
    ev.on('run:completed', (e) => RUN_TALLY.finish(runKey(e.state), readXp())),
  ];
  return () => {
    for (const off of offs) off();
  };
}
