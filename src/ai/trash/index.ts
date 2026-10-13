import { G } from '../../game/G';
import type { StatusId } from '../../types/skills';
import type { CustomHandler, PassiveHandler } from '../abilities';

/**
 * Trash script registry (P-25). Per-dungeon trash tables (`TRASH_CUSTOM`, `TRASH_PASSIVES`) are registered here and merged
 * into the live `CUSTOM` and `PASSIVES` records of abilities.ts. abilities.ts calls `attachTrashTargets` once at load.
 * A table registered before the attach is queued and replayed in order, so import order does not matter.
 * Duplicate keys throw (a clash between two dungeons must not silently replace a handler).
 * OWNER: enemies module.
 */
export interface TrashTable {
  custom?: Record<string, CustomHandler>;
  passives?: Record<string, PassiveHandler>;
}

interface Targets {
  custom: Record<string, CustomHandler>;
  passives: Record<string, PassiveHandler>;
}

let targets: Targets | null = null;
const queue: ((t: Targets) => void)[] = [];

function run(op: (t: Targets) => void): void {
  if (targets) op(targets);
  else queue.push(op);
}

function put<T>(target: Record<string, T>, key: string, value: T, what: string): void {
  if (Object.prototype.hasOwnProperty.call(target, key)) throw new Error(`[trash] duplicate ${what} key ${key}`);
  target[key] = value;
}

/** Called once by abilities.ts with its live CUSTOM and PASSIVES records. Queued registrations are applied now. */
export function attachTrashTargets(custom: Record<string, CustomHandler>, passives: Record<string, PassiveHandler>): void {
  if (targets) throw new Error('[trash] attachTrashTargets called twice');
  targets = { custom, passives };
  for (const op of queue.splice(0)) op(targets);
}

/** Merge one dungeon's trash tables into CUSTOM and PASSIVES. */
export function registerTrashTable(table: TrashTable): void {
  run((t) => {
    for (const [k, h] of Object.entries(table.custom ?? {})) put(t.custom, k, h, 'custom');
    for (const [k, h] of Object.entries(table.passives ?? {})) put(t.passives, k, h, 'passive');
  });
}

/** Shared passive alias (Peri S8): `alias` resolves to the same handler as `target`. */
export function registerPassiveAlias(alias: string, target: string): void {
  run((t) => {
    const h = t.passives[target];
    if (!h) throw new Error(`[trash] alias ${alias}: unknown passive ${target}`);
    put(t.passives, alias, h, 'passive');
  });
}

export interface AllyAuraOpts {
  /** Status applied to allies (same team) within radius, refreshed every interval. */
  status: StatusId;
  /** Metres. Default 6. */
  radius?: number;
  /** Seconds between pulses. Default 2. */
  interval?: number;
  /** Duration of the applied status (s). Default 4. */
  seconds?: number;
  /** Optional status magnitude (meaning per status). */
  magnitude?: number;
}

/** Passive factory: pulses `status` onto nearby living allies every `interval` seconds while the owner lives. */
export function allyAura(opts: AllyAuraOpts): PassiveHandler {
  const radius = opts.radius ?? 6;
  const interval = opts.interval ?? 2;
  const seconds = opts.seconds ?? 4;
  return {
    init(_ai, _ab, st) {
      st.t = 0;
    },
    tick(ai, _ab, st, dt) {
      const e = ai.e;
      if (e.isDead) return;
      st.t += dt;
      if (st.t < interval) return;
      st.t = 0;
      for (const o of ai.world.enemies) {
        if (o === e || o.isDead || o.removed || o.team !== e.team) continue;
        if (Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) > radius) continue;
        const fresh = !o.statuses.has(opts.status);
        o.statuses.apply(opts.status, seconds, { sourceId: e.id, magnitude: opts.magnitude });
        if (fresh) G.net?.broadcast('estatus', { targetId: o.id, status: opts.status, duration: seconds, stacks: 1 });
      }
    },
  };
}
