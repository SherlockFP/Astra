import { G } from '../../game/G';
import { specRole } from '../../data/specs';
import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import type { BossController } from '../BossController';
import type { ShapeOpts } from '../EnemyAI';
import type { StatusId } from '../../types/skills';
import { bossFx, bossMsgTo, bossText } from '../bossNet';

/**
 * Small authoring kit shared by the boss scripts: telegraph shapes, per-player marks, status delivery to the owning peer,
 * random picks and periodic ticks. Everything runs on the HOST only (BossController is host-only); effects reach clients
 * through HitShapes ('hitshape' channel) and ai/bossNet.ts.
 * OWNER: enemies module.
 */

export type Pt = { x: number; z: number };
export type SO = Partial<ShapeOpts>;

export const TAU = Math.PI * 2;
export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const angleTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az);
export const distXZ = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(bx - ax, bz - az);

/** Telegraphed circle (red by default). */
export function circle(c: BossController, x: number, z: number, r: number, delay: number, coef: number, o: SO = {}): number {
  return c.shape({ shape: { type: 'circle', radius: r }, x, z, dx: 0, dz: 1, delay, coef, telegraph: true, type: 'physical', ...o });
}

/** Annulus (inner..outer metres). */
export function ring(c: BossController, x: number, z: number, inner: number, outer: number, delay: number, coef: number, o: SO = {}): number {
  return c.shape({ shape: { type: 'ring', inner, outer }, x, z, dx: 0, dz: 1, delay, coef, telegraph: true, type: 'physical', ...o });
}

/** Line from (x,z) along `ang` (radians, yawFromDir convention). */
export function beam(c: BossController, x: number, z: number, ang: number, length: number, width: number, delay: number, coef: number, o: SO = {}): number {
  return c.shape({ shape: { type: 'line', length, width }, x, z, dx: Math.sin(ang), dz: Math.cos(ang), delay, coef, telegraph: true, type: 'physical', ...o });
}

/** Rectangle CENTRED on (x,z) whose long axis points along `ang` (two crossing flame walls, breath bands). */
export function band(c: BossController, x: number, z: number, ang: number, length: number, width: number, delay: number, coef: number, o: SO = {}): number {
  return c.shape({ shape: { type: 'rect', width, length }, x, z, dx: Math.sin(ang), dz: Math.cos(ang), delay, coef, telegraph: true, type: 'physical', ...o });
}

/** Cone from (x,z). */
export function wedge(c: BossController, x: number, z: number, ang: number, radius: number, angleDeg: number, delay: number, coef: number, o: SO = {}): number {
  return c.shape({ shape: { type: 'cone', radius, angle: angleDeg }, x, z, dx: Math.sin(ang), dz: Math.cos(ang), delay, coef, telegraph: true, type: 'physical', ...o });
}

/** Lingering ground effect (lava pool, burning strip, necrotic puddle): lands after `delay`, then ticks every `tick` s for `duration` s. */
export function zone(c: BossController, x: number, z: number, r: number, duration: number, tick: number, coef: number, delay = 0.05, o: SO = {}): number {
  return c.shape({
    shape: { type: 'circle', radius: r }, x, z, dx: 0, dz: 1, delay, coef, telegraph: false, type: 'fire', persist: { duration, tick }, ...o,
  });
}

/**
 * A charge line whose damage lands segment by segment as the charging boss passes (`speed` m/s), so standing in the line
 * after the boss went by is safe and the telegraph fills like a wave.
 */
export function dashLine(c: BossController, x: number, z: number, ang: number, length: number, width: number, delay: number, speed: number, coef: number, o: SO = {}): void {
  const seg = 4;
  const n = Math.max(1, Math.ceil(length / seg));
  const sx = Math.sin(ang), sz = Math.cos(ang);
  for (let i = 0; i < n; i++) {
    const len = Math.min(seg, length - i * seg) + 0.4;
    c.shape({
      shape: { type: 'line', length: len, width }, x: x + sx * i * seg, z: z + sz * i * seg, dx: sx, dz: sz,
      delay: delay + (i * seg) / Math.max(1, speed), coef, telegraph: true, type: 'physical', ...o,
    });
  }
}

/** Evenly spread points on a circle. */
export function ringPoints(cx: number, cz: number, r: number, n: number, start = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push({ x: cx + Math.sin(start + (i / n) * TAU) * r, z: cz + Math.cos(start + (i / n) * TAU) * r });
  return out;
}

/** Deliver a status to a player: applied directly to the local player, sent to the owning peer otherwise. */
export function statusPlayer(p: Player, status: StatusId, duration: number, o: { stacks?: number; magnitude?: number; dps?: number; sourceId?: number | null } = {}): void {
  try {
    if (p.isLocal) {
      p.statuses.apply(status, duration, { stacks: o.stacks, magnitude: o.magnitude, dps: o.dps, sourceId: o.sourceId ?? null });
    } else {
      const peer = G.net?.peerOfEntity(p.id);
      if (peer) G.net.sendTo(peer, 'pstatus', { targetId: p.id, status, duration, stacks: o.stacks, magnitude: o.magnitude, sourceId: o.sourceId ?? null });
    }
  } catch { /* ignore */ }
}

/** Tank by the player's spec role; a player without a known spec (remote players, pre-spec saves) falls back to the knight class. */
export const isTank = (p: Player): boolean => {
  const role = specRole(p.spec);
  return role !== undefined ? role === 'tank' : p.classId === 'knight';
};

/** HP multiplier GDD 0.3: 1 + 0.6 (0.7 in Mythic+) per extra party member. Mechanic entities carry it explicitly. */
export function partyHp(c: BossController): number {
  const n = Math.max(1, G.mplus?.params?.partySize ?? c.partySize());
  return 1 + (G.mplus?.state?.difficulty === 'mythicplus' ? 0.7 : 0.6) * (n - 1);
}

/** `n` random living players, non-tanks first when `avoidTank` (any player when the party is smaller). */
export function pickPlayers(c: BossController, n: number, avoidTank = false): Player[] {
  const all = c.randomPlayers(99);
  if (!avoidTank) return all.slice(0, n);
  const non = all.filter((p) => !isTank(p));
  const tank = all.filter(isTank);
  return [...non, ...tank].slice(0, n);
}

export function farthestPlayer(c: BossController, x: number, z: number): Player | null {
  let best: Player | null = null;
  let bd = -1;
  for (const p of c.playersInArena()) {
    const d = distXZ(x, z, p.position.x, p.position.z);
    if (d > bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Living players (host-known positions) whose circle touches the circle (x,z,r). */
export function playersIn(c: BossController, x: number, z: number, r: number): Player[] {
  return c.playersInArena().filter((p) => distXZ(x, z, p.position.x, p.position.z) <= r + p.radius);
}

/** Run `fn` once every `interval` seconds of fight time (state slot `key`, keeps its own phase across frames). */
export function every(state: Record<string, any>, key: string, dt: number, interval: number, fn: () => void): void {
  const t = (state[key] ?? interval) - dt;
  if (t <= 0) {
    state[key] = interval + t;
    fn();
  } else state[key] = t;
}

/** Floating text above an actor on every peer. */
export function floatOver(e: { position: { x: number; z: number }; height: number }, text: string, kind = 0): void {
  bossText(text, e.position.x, e.height + 0.5, e.position.z, kind);
}

/** Spawn a mechanic entity (cage, tomb, phylactery, rift, orb, pillar...) at an exact point; it does not aggro. */
export function spawnMech(c: BossController, defId: string, p: Pt, o: { hpMult?: number; tag?: string; facing?: number } = {}): void {
  c.spawnAdds(defId, 1, { positions: [p], aggro: false, hpMult: o.hpMult, tag: o.tag, radius: 0.1, facing: o.facing });
}

/** Make a spawned mechanic entity untargetable-ish (invulnerable) on every peer. */
export function makeInvulnerable(e: Enemy, seconds = 9999): void {
  try {
    e.statuses.apply('invulnerable', seconds, { replicated: true });
    G.net?.broadcast('estatus', { targetId: e.id, status: 'invulnerable', duration: seconds, stacks: 1 });
  } catch { /* ignore */ }
}

export { bossFx, bossText };

/** The player an ability was aimed at (threat target or the picked random / farthest player), if still alive. */
export function busyTarget(c: BossController, b: { targetId: number | null }): Player | null {
  const t = b.targetId != null ? c.world.getActor(b.targetId) : undefined;
  return t && t.kind === 'player' && !t.isDead ? (t as Player) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Prisons: a player trapped in a breakable mechanic entity (Morkan's bone cage, Ayaz Ana's ice tomb)
// ---------------------------------------------------------------------------------------------------------------------
export interface Prison {
  pid: number;
  tag: string;
  status: StatusId;
  born: number;
  tick: number;
  maxAge: number;
  /** Alone in the arena the prison breaks by itself after this many seconds (0 = never). */
  soloAge: number;
  /** Coefficient of the hit the prisoner takes when a solo prison breaks by itself. */
  soloHit: number;
}

/**
 * Trap `p` in a mechanic entity `defId` (HP hpMult x TRASH_HP, includes party scaling). The prisoner is kept under `status` until the
 * entity dies, the max age passes, or (solo) the self-break timer fires. Call updatePrisons() every frame from the script's update().
 */
export function trapPlayer(c: BossController, p: Player, o: { defId: string; prefix: string; hpMult: number; status: StatusId; maxAge: number; soloAge: number; soloHit?: number; toast?: string }): void {
  const list = ((c.state.prisons ??= []) as Prison[]);
  if (list.some((k) => k.pid === p.id)) return;
  const tag = `${o.prefix}:${p.id}`;
  spawnMech(c, o.defId, { x: p.position.x, z: p.position.z }, { hpMult: o.hpMult, tag });
  list.push({ pid: p.id, tag, status: o.status, born: c.world.time, tick: 0, maxAge: o.maxAge, soloAge: o.soloAge, soloHit: o.soloHit ?? 0 });
  statusPlayer(p, o.status, 0.7);
  if (o.toast) bossMsgTo(p.id, 'boss_toast', {}, { text: o.toast });
}

function releasePrison(c: BossController, k: Prison, shatter: boolean, hit: boolean): void {
  const list = c.state.prisons as Prison[];
  const i = list.indexOf(k);
  if (i >= 0) list.splice(i, 1);
  const ent = c.adds(k.tag)[0];
  if (ent && !ent.isDead && !ent.removed) {
    bossFx(k.status === 'freeze' ? 'frost_burst' : 'death_bones', ent.position.x, ent.position.z, { scale: 1.1 });
    if (shatter) ent.escape();
  }
  if (hit && k.soloHit > 0) {
    const p = c.world.get<Player>(k.pid);
    if (p && !p.isDead) circle(c, p.position.x, p.position.z, 1.3, 0.05, k.soloHit, { telegraph: false, type: k.status === 'freeze' ? 'frost' : 'shadow', name: 'Kırılma' });
  }
}

export function updatePrisons(c: BossController, dt: number): void {
  const list = c.state.prisons as Prison[] | undefined;
  if (!list?.length) return;
  const solo = c.playersInArena(false).length <= 1;
  const now = c.world.time;
  for (const k of list.slice()) {
    const p = c.world.get<Player>(k.pid);
    const ent = c.adds(k.tag)[0];
    const age = now - k.born;
    if (!p || p.removed || p.isDead) {
      releasePrison(c, k, true, false);
      continue;
    }
    if (age > 1.0 && (!ent || ent.isDead || ent.removed)) {
      releasePrison(c, k, false, false); // broken by the party
      continue;
    }
    if (solo && k.soloAge > 0 && age >= k.soloAge) {
      releasePrison(c, k, true, true);
      continue;
    }
    if (age >= k.maxAge) {
      releasePrison(c, k, true, false);
      continue;
    }
    k.tick -= dt;
    if (k.tick <= 0) {
      k.tick = 0.25;
      statusPlayer(p, k.status, 0.55);
    }
  }
}

export function clearPrisons(c: BossController): void {
  const list = c.state.prisons as Prison[] | undefined;
  if (!list) return;
  for (const k of list.slice()) releasePrison(c, k, true, false);
}

// K10 patterns (P-32 intermission, P-33 beams and bands, P-34 soak and marks): implemented in ./patterns.ts
export {
  soak, markPlayers, rotatingBeams, trackBeam, movingBand, breathBand, intermission, intermissionActive, updatePatterns, clearPatterns,
} from './patterns';
export type {
  SoakSlot, SoakOpts, MarkOpts, RotatingBeamsOpts, TrackBeamOpts, MovingBandOpts, BreathOpts, IntermissionOpts,
} from './patterns';
