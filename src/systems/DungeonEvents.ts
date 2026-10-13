/**
 * Dungeon events, conditional gates and M+ checkpoint choice (docs/dungeons/_shared_primitives.md P-12, P-28; package K8).
 *
 * Pure module: no three.js, no G, no net imports, so tools/smoke/gate_resolver.mjs can load it headless. DungeonScene owns the
 * live state (flags, dead packs, boss records) and feeds it through GateFacts; this file only answers "should this door be open".
 * Lock kinds and their meaning are in DoorDef (types/dungeons.ts). Legacy kinds keep their old result: `none` / `open` with no
 * `requires` return null (no lock), boss kinds without a boss return null (leave the gate as it is).
 */
import type { DoorDef } from '../types/dungeons';

/** Event names: letters, digits and `_ . : -`, at most 48 characters (same rule as net request kinds). */
const NAME_RE = /^[A-Za-z0-9_.:-]{1,48}$/;

/** Device solves are stored as event flags under this prefix (`device_lock` reads `dev:<device>`). */
export const DEVICE_FLAG_PREFIX = 'dev:';

/** Gate kinds that lock a door on their own (the others are no lock, `none` / `open`). */
const LOCK_KINDS: ReadonlySet<string> = new Set(['boss_lock', 'boss_exit', 'forces_lock', 'event_lock', 'kill_lock', 'device_lock']);

/** Only the door fields the resolver reads (a DoorDef satisfies this). */
export interface GateInput {
  /** DoorDef.gate (or DungeonGate.kind, which the builder copies from it). Unknown kinds are no lock. */
  gate?: string;
  event?: string;
  opensOn?: DoorDef['opensOn'];
  device?: string;
  requires?: string[];
}

/** Plain snapshot of the run state the resolver reads. DungeonScene builds it; the smoke builds fixtures. */
export interface GateFacts {
  /** Dungeon event flags (DungeonDef.events plus device flags `dev:<id>`). */
  flags: Readonly<Record<string, boolean>>;
  /** Packs whose members are all dead (latched: once dead, a pack stays dead). */
  deadPacks: ReadonlySet<string>;
  /** Enemy defs with at least one kill (latched). */
  killedEnemies: ReadonlySet<string>;
  /** Bosses that are dead. */
  deadBosses: ReadonlySet<string>;
  /** The boss bound to the door's room (boss_lock / boss_exit), null when the door has none. */
  boss: { id: string; engaged: boolean; defeated: boolean } | null;
  /** Some boss with a lower placement `order` than the bound boss is still alive (boss_lock). */
  earlierBossAlive: boolean;
  /** The forces goal is met or the run is complete (forces_lock). */
  forcesDone: boolean;
}

/**
 * Should this door be open?
 *   true  = open, false = closed, null = this door has no lock (leave the gate as it is).
 * A door with `requires` is open only when its own condition holds AND every listed pack is dead. `requires` alone (gate none)
 * makes a lock, so a door can wait for a pack without any other gate kind.
 */
export function resolveGate(door: GateInput, facts: GateFacts): boolean | null {
  const kind = door.gate ?? 'none';
  const requires = door.requires ?? [];
  const locked = LOCK_KINDS.has(kind) || requires.length > 0;
  if (!locked) return null;
  let own: boolean | null;
  switch (kind) {
    case 'forces_lock':
      own = facts.forcesDone;
      break;
    case 'boss_lock':
    case 'boss_exit':
      if (!facts.boss) return null; // a boss door without its boss: leave as is (legacy)
      if (kind === 'boss_exit') own = facts.boss.defeated;
      else own = !(facts.boss.engaged && !facts.boss.defeated) && !facts.earlierBossAlive;
      break;
    case 'event_lock':
      own = !!door.event && facts.flags[door.event] === true;
      break;
    case 'device_lock':
      own = !!door.device && facts.flags[DEVICE_FLAG_PREFIX + door.device] === true;
      break;
    case 'kill_lock': {
      const o = door.opensOn;
      own = !!o && ((!!o.pack && facts.deadPacks.has(o.pack)) || (!!o.enemyId && facts.killedEnemies.has(o.enemyId)) || (!!o.boss && facts.deadBosses.has(o.boss)));
      break;
    }
    default:
      own = true; // none / open with requires: the only condition is the pack list
  }
  if (own === null) return null;
  return own && requires.every((p) => facts.deadPacks.has(p));
}

/**
 * P-28: M+ release point. `checkpoints[i]` belongs to the boss at position i in placement `order`; `bossDead[i]` says that
 * boss is dead. Returns the index of the latest checkpoint whose boss is dead, or -1 (release at the dungeon start).
 */
export function pickCheckpoint(checkpoints: readonly [number, number][], bossDead: readonly boolean[]): number {
  const n = Math.min(checkpoints.length, bossDead.length);
  for (let i = n - 1; i >= 0; i--) if (bossDead[i]) return i;
  return -1;
}

/**
 * Host-authoritative flag store for DungeonDef.events. Clients hold a copy that the host's `dungeon_event` broadcasts update.
 * Created per dungeon run and dropped on exit (the scene owns it), so flags are cleared when the scene leaves.
 */
export class DungeonEventStore {
  private readonly flags: Record<string, boolean>;
  private readonly declared: ReadonlySet<string>;
  private readonly listeners = new Set<(name: string, on: boolean) => void>();

  constructor(initial?: Readonly<Record<string, boolean>>) {
    this.flags = { ...(initial ?? {}) };
    this.declared = new Set(Object.keys(this.flags));
  }

  /** True when the name is a declared event (DungeonDef.events) or a device flag. */
  accepts(name: string): boolean {
    return NAME_RE.test(name) && (this.declared.has(name) || name.startsWith(DEVICE_FLAG_PREFIX));
  }

  get(name: string): boolean {
    return this.flags[name] === true;
  }

  /** Sets a flag. Returns true when the value changed (listeners are told). Invalid names are refused. */
  set(name: string, on: boolean): boolean {
    if (!NAME_RE.test(name)) return false;
    if (this.flags[name] === on) return false;
    this.flags[name] = on;
    for (const fn of this.listeners) fn(name, on);
    return true;
  }

  snapshot(): Record<string, boolean> {
    return { ...this.flags };
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  on(fn: (name: string, on: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Drops every flag and listener (scene leaving). */
  clear(): void {
    for (const k of Object.keys(this.flags)) delete this.flags[k];
    this.listeners.clear();
  }
}
