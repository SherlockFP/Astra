import type { CharLodPlan } from '../world/WorldPerf';
import type { AmbientRoute } from '../types/ambient';

/**
 * Ambient walking routines (types/ambient.ts): where a routine NPC stands at a given clock time. PURE and DOM-free, so the node sims
 * import it too (dev/combat-sim/ambient.mjs). One cycle = for each stop: its dwell, then the walk to the next stop (the list closes).
 * Speed is constant along a leg; the yaw of a leg is atan2(dx, dz), the NPC convention (entities/NPC.ts patrol).
 */

export interface RouteSample {
  x: number;
  z: number;
  /** Facing while walking (rad, NPC convention); the last walked direction while dwelling. */
  yaw: number;
  moving: boolean;
  /** Index of the stop the NPC stands at while dwelling, -1 while walking. */
  stop: number;
  /** The stop's clip while dwelling (undefined = the NPC's idle). */
  clip?: string;
}

interface Plan {
  /** Walk time of leg i (stop i -> stop i+1, closing), s. */
  legTime: number[];
  /** Length of leg i, m. */
  legLen: number[];
  /** Full cycle length, s (dwells + walks). */
  cycle: number;
}

const plans = new WeakMap<AmbientRoute, Plan>();

/** Leg times and the cycle of a routine (cached per route object). */
export function routinePlan(route: AmbientRoute): Plan {
  const hit = plans.get(route);
  if (hit) return hit;
  const pts = route.stops.map((s) => s.pos);
  const n = pts.length;
  const speed = Math.max(0.05, route.speed);
  const legLen: number[] = [];
  const legTime: number[] = [];
  let cycle = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = n > 1 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    legLen.push(len);
    legTime.push(len / speed);
    cycle += len / speed;
    cycle += route.stops[i].dwell ?? 0;
  }
  const plan: Plan = { legTime, legLen, cycle };
  plans.set(route, plan);
  return plan;
}

/**
 * Where the routine is at clock time `clock` (s). Negative clocks and clocks past one cycle wrap, so the walk repeats forever.
 * A routine with a single stop stands there for ever (its dwell clip plays).
 */
export function sampleRoute(route: AmbientRoute, clock: number): RouteSample {
  const stops = route.stops;
  const n = stops.length;
  const first = stops[0].pos;
  const plan = routinePlan(route);
  if (n === 1 || plan.cycle <= 0) return { x: first[0], z: first[1], yaw: 0, moving: false, stop: 0, clip: stops[0].clip };
  const phase = route.phase ?? 0;
  let u = (((clock + phase) % plan.cycle) + plan.cycle) % plan.cycle;
  let lastYaw = 0;
  for (let i = 0; i < n; i++) {
    const s = stops[i];
    const p = s.pos;
    const dwell = s.dwell ?? 0;
    if (u < dwell) return { x: p[0], z: p[1], yaw: lastYaw, moving: false, stop: i, clip: s.clip };
    u -= dwell;
    const a = p, b = stops[(i + 1) % n].pos;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lt = plan.legTime[i];
    if (lt > 0) lastYaw = Math.atan2(dx, dz);
    if (lt > 0 && u < lt) {
      const k = u / lt;
      return { x: a[0] + dx * k, z: a[1] + dz * k, yaw: lastYaw, moving: true, stop: -1 };
    }
    u -= lt;
  }
  // float rounding at the very end of a cycle: back at the first stop
  return { x: first[0], z: first[1], yaw: lastYaw, moving: false, stop: 0, clip: stops[0].clip };
}

/** The longest distance the routine walks between two of its stops (m), a sanity figure for the sim and the data notes. */
export function routeSpanM(route: AmbientRoute): number {
  let m = 0;
  for (const a of route.stops) for (const b of route.stops) m = Math.max(m, Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]));
  return m;
}

/**
 * Character LOD of an ambient walker (routine NPC): the model stands only close by, the billboard takes over early, and nothing is drawn
 * far off. A walker is a crowd of stand-ins at a distance, so it costs its 5-7k triangles only within a few tens of metres.
 */
export function ambientLodPlan(p: CharLodPlan): CharLodPlan {
  return { ...p, full: Math.min(p.full, 10), model: Math.min(p.model, 22), hide: Math.min(p.hide, 45) };
}
