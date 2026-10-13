/**
 * Lifts: host-driven moving platforms of vertical dungeons (docs/ENGINE_VERTICALITY.md §9, package V5). OWNER: world.
 *
 * NO three.js import: `node tools/lift-check.mjs` imports this file. Motion is a pure function of (stops, speed, elapsed).
 * The HOST (authority) decides departures and broadcasts `lift:<id>:<from>:<to>:<t>`; every peer reconstructs its own
 * departure time from `t` (t0 = now − t), so late joiners and remote riders agree within the message latency.
 * `hf.groundY` reads `BuiltLift.y` for LIFT cells, so the moving floor is seen by nav steps, camera and spawns.
 *
 * Wire (existing 'gate' channel, key string):
 *   lift:<id>:<from>:<to>:<t>   state; from === to means idle at that stop. Sent on departure, then every 2 s.
 *   lift:<id>:go:<N>            command for mode 'script' (boss/gate scripts); only the authority applies it.
 */
import { VERT, type BuiltLift, type Heightfield } from './Heightfield';

/** What the lift system needs from its host (DungeonScene in V6). Times are seconds on one shared clock. */
export interface LiftHost {
  isAuthority(): boolean;
  players(): { x: number; y: number; z: number }[];
  broadcast(key: string): void;
  now(): number;
}

/** Ease-in / ease-out duration at both ends of a trip (§9). */
const RAMP_SEC = 0.35;
/** Stand time on the pad before a 'call' lift departs (§9). */
const PAD_STAND_SEC = 0.6;
/** Feet must be within this height of the platform to count as riding it. */
const PAD_Y_TOL = 0.6;
/** Re-broadcast period while moving or idle (§9). */
const BROADCAST_SEC = 2;

/** Distance covered after `t` seconds of a trip of `dist` metres at cruise `speed`, with trapezoid velocity. */
export function liftTravel(dist: number, speed: number, t: number): { s: number; total: number } {
  const D = dist / speed;
  const r = Math.min(RAMP_SEC, D);
  const total = D + r;
  if (t <= 0) return { s: 0, total };
  if (t >= total) return { s: dist, total };
  if (t <= r) return { s: (speed * t * t) / (2 * r), total };
  if (t <= total - r) return { s: speed * (r / 2 + (t - r)), total };
  const rem = total - t;
  return { s: dist - (speed * rem * rem) / (2 * r), total };
}

/** Per-lift runtime state (parallel to hf.lifts). `from`/`to` are stop indices; `t0` is the shared-clock departure time. */
interface Motion {
  from: number;
  to: number;
  t0: number;
  moving: boolean;
  padT: number;
  bcastT: number;
}

export class LiftSystem {
  // plain fields (no parameter properties: tools/lift-check.mjs runs this file under Node type stripping)
  private readonly host: LiftHost;
  private readonly lifts: BuiltLift[];
  private readonly motion: Motion[];
  private readonly index = new Map<string, number>();
  private readonly warned = new Set<string>();

  constructor(hf: Heightfield, host: LiftHost) {
    this.host = host;
    this.lifts = hf.lifts;
    this.motion = hf.lifts.map((l) => ({ from: l.stopIdx, to: l.stopIdx, t0: 0, moving: false, padT: 0, bcastT: 0 }));
    hf.lifts.forEach((l, i) => this.index.set(l.def.id, i));
  }

  /** Advance every lift by dt seconds (call once per frame). Authority decides departures; everyone follows the state. */
  update(dt: number): void {
    const now = this.host.now();
    const auth = this.host.isAuthority();
    let players: { x: number; y: number; z: number }[] | null = null;
    for (let i = 0; i < this.lifts.length; i++) {
      const L = this.lifts[i]!, m = this.motion[i]!, def = L.def;
      const stops = def.stops;
      const dwell = def.dwell ?? VERT.LIFT_DWELL;
      if (m.moving) {
        const dist = Math.abs(stops[m.to]! - stops[m.from]!);
        const { s, total } = liftTravel(dist, def.speed ?? VERT.LIFT_SPEED, now - m.t0);
        const dir = Math.sign(stops[m.to]! - stops[m.from]!);
        if (now - m.t0 >= total) {
          m.moving = false;
          m.from = m.to;
          L.stopIdx = m.to;
          L.y = stops[m.to]!;
          L.dwellLeft = dwell;
          if (auth) this.broadcast(i, now);
        } else {
          L.y = stops[m.from]! + dir * s;
          if (auth) {
            m.bcastT += dt;
            if (m.bcastT >= BROADCAST_SEC) this.broadcast(i, now);
          }
        }
        continue;
      }
      // idle at stop m.from
      L.y = stops[m.from]!;
      L.dwellLeft = Math.max(0, L.dwellLeft - dt);
      if (!auth) continue;
      m.bcastT += dt;
      if (m.bcastT >= BROADCAST_SEC) this.broadcast(i, now);
      const mode = def.mode ?? 'call';
      if (stops.length < 2) continue;
      if (mode === 'auto') {
        if (L.dwellLeft <= 0) this.depart(i, now);
      } else if (mode === 'call') {
        if (L.dwellLeft > 0) { m.padT = 0; continue; }
        if (players === null) players = this.host.players();
        if (this.padOccupied(L, players)) {
          m.padT += dt;
          if (m.padT >= PAD_STAND_SEC) this.depart(i, now);
        } else {
          m.padT = 0;
        }
      }
      // mode 'script': departs only on a `go` command
    }
  }

  /** Apply a `lift:` message from the gate channel. Commands are host-only; state messages are for non-host peers. */
  handleMessage(key: string): void {
    const p = key.split(':');
    if (p.length < 4 || p[0] !== 'lift') return;
    const now = this.host.now();
    if (p[p.length - 2] === 'go') {
      if (!this.host.isAuthority()) return;
      const i = this.lookup(p.slice(1, -2).join(':'));
      if (i < 0) return;
      const L = this.lifts[i]!, m = this.motion[i]!;
      const n = Number(p[p.length - 1]);
      if (m.moving || !Number.isInteger(n) || n < 0 || n >= L.def.stops.length || n === m.from) return;
      this.begin(i, m.from, n, now);
      return;
    }
    if (p.length < 5 || this.host.isAuthority()) return;
    const i = this.lookup(p.slice(1, -3).join(':'));
    if (i < 0) return;
    const from = Number(p[p.length - 3]), to = Number(p[p.length - 2]), t = Number(p[p.length - 1]);
    const stops = this.lifts[i]!.def.stops;
    if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isFinite(t)) return;
    if (from < 0 || to < 0 || from >= stops.length || to >= stops.length) return;
    const L = this.lifts[i]!, m = this.motion[i]!;
    m.from = from;
    m.to = to;
    m.moving = from !== to;
    m.t0 = now - Math.max(0, t);
    if (!m.moving) {
      L.stopIdx = to;
      L.y = stops[to]!;
    }
  }

  /** Current height of a lift platform (warns once and returns 0 for an unknown id). */
  yOf(id: string): number {
    const i = this.lookup(id);
    if (i < 0) return 0;
    return this.lifts[i]!.y;
  }

  // ---- internals ----
  private lookup(id: string): number {
    const i = this.index.get(id);
    if (i === undefined) {
      if (!this.warned.has(id)) {
        this.warned.add(id);
        console.warn(`[lifts] unknown lift id "${id}"`);
      }
      return -1;
    }
    return i;
  }

  /** Ping-pong to the next stop in the current direction (flips at either end). */
  private depart(i: number, now: number): void {
    const L = this.lifts[i]!, m = this.motion[i]!;
    const n = L.def.stops.length;
    let next = m.from + L.dir;
    if (next < 0 || next >= n) {
      L.dir = L.dir === 1 ? -1 : 1;
      next = m.from + L.dir;
    }
    this.begin(i, m.from, next, now);
  }

  private begin(i: number, from: number, to: number, now: number): void {
    const L = this.lifts[i]!, m = this.motion[i]!;
    m.from = from;
    m.to = to;
    m.t0 = now;
    m.moving = true;
    m.padT = 0;
    m.bcastT = 0;
    L.dir = to > from ? 1 : -1;
    L.dwellLeft = 0;
    this.host.broadcast(this.key(i, 0));
  }

  private broadcast(i: number, now: number): void {
    const m = this.motion[i]!;
    m.bcastT = 0;
    this.host.broadcast(this.key(i, m.moving ? Math.max(0, now - m.t0) : 0));
  }

  private key(i: number, t: number): string {
    const m = this.motion[i]!;
    return `lift:${this.lifts[i]!.def.id}:${m.from}:${m.to}:${t.toFixed(3)}`;
  }

  private padOccupied(L: BuiltLift, players: { x: number; y: number; z: number }[]): boolean {
    for (const p of players) {
      if (p.x < L.x0 || p.x > L.x1 || p.z < L.z0 || p.z > L.z1) continue;
      if (Math.abs(p.y - L.y) < PAD_Y_TOL) return true;
    }
    return false;
  }
}
