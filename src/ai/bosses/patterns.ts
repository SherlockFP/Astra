import type { BossController } from '../BossController';
import type { ShapeOpts } from '../EnemyAI';
import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import type { DamageType } from '../../types/common';
import type { StatusApply } from '../../types/skills';

/**
 * K10 boss patterns (docs/dungeons/_shared_primitives.md P-32, P-33, P-34): soak circles, spread marks, rotating and tracked
 * beams, moving bands and the intermission (untargetable + add waves). Host-only, like every boss script.
 *
 * Every shape goes through BossController.shape(). Timed steps are kept in the boss state (`c.state.pat`) and run from the
 * script's update(): call updatePatterns(c, dt) every frame. The module has no runtime imports (type-only), so
 * tools/smoke/boss_patterns.mjs can drive it with a fixture controller. Two notes for the owner of EnemyAI.shape(): the
 * room-wide shapes here pass `vert: 'free'` and rotating beams pass `spin` (deg/s); shape() must forward both to HitShapeSpec.
 * `persist.scaleTo` already travels inside `persist`.
 * OWNER: enemies module.
 */

export type Pt = { x: number; z: number };
type ShapeArgs = ShapeOpts;
/** K10 fields that shape() does not forward yet (see the note above). */
type Extra = { spin?: number; vert?: number | 'free' };

const TAU = Math.PI * 2;
/** Room-wide mechanic: no height gate (HitShapeSpec.vert). */
const FREE = 'free' as const;

function emit(c: BossController, o: ShapeArgs, extra: Extra = {}): number {
  return c.shape({ ...o, ...extra });
}

// ---------------------------------------------------------------------------------------------------------------------
// Clock and jobs: every timed step below runs from updatePatterns(c, dt) on the host
// ---------------------------------------------------------------------------------------------------------------------
interface Job { at: number; run: () => void }
interface IntermissionWave { at: number; run: (c: BossController) => void }
interface Intermission {
  t: number;
  end: number;
  max: number;
  opts: IntermissionOpts;
  waves: IntermissionWave[];
}
interface PatternState { t: number; jobs: Job[]; inter: Intermission | null }

function pst(c: BossController): PatternState {
  const s = c.state;
  if (!s.pat) s.pat = { t: 0, jobs: [], inter: null };
  return s.pat as PatternState;
}

function after(c: BossController, delay: number, run: () => void): void {
  const s = pst(c);
  s.jobs.push({ at: s.t + Math.max(0, delay), run });
}

/** Advance the pattern clock by `dt`, run due steps and tick a running intermission. Call every frame from update(). */
export function updatePatterns(c: BossController, dt: number): void {
  const s = pst(c);
  s.t += dt;
  if (s.jobs.length) {
    const due = s.jobs.filter((j) => j.at <= s.t).sort((a, b) => a.at - b.at);
    if (due.length) {
      s.jobs = s.jobs.filter((j) => j.at > s.t);
      for (const j of due) j.run();
    }
  }
  if (s.inter) tickIntermission(c, s, dt);
}

/** Drop pending steps (boss reset / death). A running intermission ends without calling endMechanicPhase. */
export function clearPatterns(c: BossController): void {
  const s = pst(c);
  s.jobs = [];
  if (s.inter) {
    s.inter = null;
    c.setImmune(false);
  }
}

function playersInCircle(c: BossController, x: number, z: number, r: number): Player[] {
  return c.playersInArena().filter((p) => Math.hypot(p.position.x - x, p.position.z - z) <= r + p.radius);
}

// ---------------------------------------------------------------------------------------------------------------------
// P-34 soak: a yellow display circle (no damage) lands after `at`; the host counts the players inside, then a real soak
// hit (damage split between the players inside, HitShapes `soak`) lands on the same spot.
// ---------------------------------------------------------------------------------------------------------------------
export interface SoakSlot { x: number; z: number; r: number; at: number }
export interface SoakOpts {
  slots: SoakSlot[];
  /** Players that must stand inside each slot for onPass (the damage is split either way). */
  need: number;
  coef: number;
  type?: DamageType;
  name?: string;
  onPass?: (c: BossController, inside: Player[], slot: SoakSlot) => void;
  onFail?: (c: BossController, inside: Player[], slot: SoakSlot) => void;
}

export function soak(c: BossController, o: SoakOpts): void {
  const type = o.type ?? 'physical';
  const name = o.name ?? 'Emilim';
  for (const slot of o.slots) {
    emit(c, {
      shape: { type: 'circle', radius: slot.r }, x: slot.x, z: slot.z, dx: 0, dz: 1, delay: slot.at, damage: 0, type,
      telegraph: true, kind: 'soak', name,
    }, { vert: FREE });
    after(c, slot.at, () => {
      const inside = playersInCircle(c, slot.x, slot.z, slot.r);
      if (inside.length >= o.need) o.onPass?.(c, inside, slot);
      else o.onFail?.(c, inside, slot);
      emit(c, {
        shape: { type: 'circle', radius: slot.r }, x: slot.x, z: slot.z, dx: 0, dz: 1, delay: 0, coef: o.coef, type,
        telegraph: false, kind: 'soak', soak: true, name,
      }, { vert: FREE });
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// P-34 spread marks: a circle under each marked player lands after `delay`; onExpire runs at the same moment.
// ---------------------------------------------------------------------------------------------------------------------
export interface MarkOpts {
  delay: number;
  r: number;
  coef: number;
  type?: DamageType;
  name?: string;
  /** Floating line on the marked player's screen (sent to the owning peer). */
  toast?: string;
  /** 'boss': a non-damaging tether from the boss to each mark (kind 'friendly'). */
  beamTo?: 'boss';
  onExpire?: (c: BossController, p: Player) => void;
}

export function markPlayers(c: BossController, players: Player[], o: MarkOpts): void {
  const type = o.type ?? 'physical';
  const name = o.name ?? 'İşaret';
  for (const p of players) {
    const x = p.position.x, z = p.position.z;
    emit(c, {
      shape: { type: 'circle', radius: o.r }, x, z, dx: 0, dz: 1, delay: o.delay, coef: o.coef, type, telegraph: true, name,
    }, { vert: FREE });
    if (o.beamTo === 'boss') {
      const b = c.e.position;
      const dx = x - b.x, dz = z - b.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        emit(c, {
          shape: { type: 'line', length: len, width: 0.8 }, x: b.x, z: b.z, dx, dz, delay: o.delay, damage: 0, type,
          telegraph: true, kind: 'friendly', name,
        }, { vert: FREE });
      }
    }
    if (o.toast) toastPlayer(p, o.toast);
    if (o.onExpire) {
      const fn = o.onExpire;
      after(c, o.delay, () => fn(c, p));
    }
  }
}

/** Per-player floating text. bossNet is loaded lazily so this module stays importable without the game. */
function toastPlayer(p: Player, text: string): void {
  import('../bossNet')
    .then((m) => m.bossMsgTo(p.id, 'boss_toast', {}, { text }))
    .catch((err) => console.warn('[boss] toast failed', err));
}

// ---------------------------------------------------------------------------------------------------------------------
// P-33 rotating beams: lines that turn at `speedDeg` (HitShapeSpec.spin) and hurt every `step` s for `dur` s after landing.
// With `reverseAt`, the first sweep ends there and a mirror sweep starts from the angle it reached.
// ---------------------------------------------------------------------------------------------------------------------
export interface RotatingBeamsOpts {
  origins: Pt[] | { x: number; z: number; n: number };
  speedDeg: number;
  /** Start angle per beam (radians, sin/cos convention of kit.beam). Default: evenly spread. */
  dirs?: number[];
  length: number;
  width: number;
  coef: number;
  /** Seconds the beams keep hurting after landing. */
  dur: number;
  /** Seconds after landing when the sweep reverses (must be below dur). */
  reverseAt?: number;
  /** Damage tick interval (default 0.5). */
  step?: number;
  /** Telegraph lead before the first landing (default 1.2). */
  delay?: number;
  type?: DamageType;
  name?: string;
  /** Beams grow (or shrink) to this multiple of their size over `dur` (HitShapeSpec.persist.scaleTo). */
  scaleTo?: number;
}

export function rotatingBeams(c: BossController, o: RotatingBeamsOpts): void {
  const beams: { x: number; z: number; a: number }[] = [];
  if (Array.isArray(o.origins)) {
    const n = o.origins.length;
    o.origins.forEach((p, i) => beams.push({ x: p.x, z: p.z, a: o.dirs?.[i] ?? (i * TAU) / Math.max(1, n) }));
  } else {
    const { x, z, n } = o.origins;
    for (let i = 0; i < n; i++) beams.push({ x, z, a: o.dirs?.[i] ?? (i * TAU) / Math.max(1, n) });
  }
  const delay = o.delay ?? 1.2;
  const reverse = o.reverseAt != null && o.reverseAt > 0 && o.reverseAt < o.dur;
  const first = reverse ? (o.reverseAt as number) : o.dur;
  for (const b of beams) spawnSweep(c, o, b.x, b.z, b.a, delay, first, o.speedDeg, true);
  if (reverse) {
    after(c, delay + first, () => {
      // HitShapes turns the facing by +spin, which lowers the angle in the sin/cos convention: the mirror sweep starts where the
      // first one ended and turns the other way.
      const turned = (o.speedDeg * Math.PI) / 180 * (delay + first);
      for (const b of beams) spawnSweep(c, o, b.x, b.z, b.a - turned, 0, o.dur - first, -o.speedDeg, false);
    });
  }
}

function spawnSweep(c: BossController, o: RotatingBeamsOpts, x: number, z: number, a: number, delay: number, dur: number, spin: number, telegraph: boolean): void {
  const persist = { duration: dur, tick: o.step ?? 0.5, scaleTo: o.scaleTo };
  emit(c, {
    shape: { type: 'line', length: o.length, width: o.width }, x, z, dx: Math.sin(a), dz: Math.cos(a), delay, coef: o.coef,
    type: o.type ?? 'physical', telegraph, persist, name: o.name ?? 'Işın',
  }, { spin, vert: FREE });
}

// ---------------------------------------------------------------------------------------------------------------------
// P-33 tracked line: at `lockAt` the beam takes the target's position at that moment and fires `delay` s later. Nothing shows
// before the lock (the boss does not telegraph the aim), so the warning is the landing telegraph itself.
// ---------------------------------------------------------------------------------------------------------------------
export interface TrackBeamOpts { lockAt: number; delay: number; length: number; width: number; coef: number; type?: DamageType; name?: string }

export function trackBeam(c: BossController, from: Pt, target: Pt | { position: Pt }, o: TrackBeamOpts): void {
  after(c, o.lockAt, () => {
    const p = 'position' in target ? target.position : target;
    const dx = p.x - from.x, dz = p.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    emit(c, {
      shape: { type: 'line', length: o.length, width: o.width }, x: from.x, z: from.z, dx: dx / len, dz: dz / len, delay: o.delay,
      coef: o.coef, type: o.type ?? 'physical', telegraph: true, name: o.name ?? 'Kilit',
    }, { vert: FREE });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// P-33 moving band: a wall that travels from `from` to `to` at `speed` m/s. It is cut into pieces `width` thick, each landing
// when the wall reaches it, so standing in front of the wall costs one hit and stepping over it is possible.
// ---------------------------------------------------------------------------------------------------------------------
export interface MovingBandOpts { speed: number; width: number; coef: number; span?: number; stun?: number; type?: DamageType; name?: string }

export function movingBand(c: BossController, from: Pt, to: Pt, o: MovingBandOpts): void {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05 || o.speed <= 0 || o.width <= 0) return;
  const mx = dx / len, mz = dz / len;
  // long axis across the travel direction: (sin, cos) = (-mz, mx)
  const ang = Math.atan2(-mz, mx);
  const span = o.span ?? c.arena.r * 2 + 4;
  const statuses: StatusApply[] | undefined = o.stun ? [{ status: 'stun', duration: o.stun }] : undefined;
  const n = Math.ceil(len / o.width);
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * o.width;
    if (s > len) break;
    emit(c, {
      shape: { type: 'rect', width: o.width, length: span }, x: from.x + mx * s, z: from.z + mz * s, dx: Math.sin(ang), dz: Math.cos(ang),
      delay: s / o.speed, coef: o.coef, type: o.type ?? 'physical', telegraph: true, statuses, name: o.name ?? 'Duvar',
    }, { vert: FREE });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// P-33 breath band: a rectangle from `from` along `ang` (the buzul breath, moved out of its script). With `cover` (a pillar),
// the band is cut across the cover's `coverRadius` so players tucked behind it are safe (approximate: a strip, not a disk).
// ---------------------------------------------------------------------------------------------------------------------
export interface BreathOpts { cover?: Pt; coverRadius?: number; type?: DamageType; name?: string }

export function breathBand(c: BossController, from: Pt, ang: number, len: number, width: number, delay: number, coef: number, o: BreathOpts = {}): void {
  const sx = Math.sin(ang), sz = Math.cos(ang);
  let cuts: [number, number][] = [[0, len]];
  if (o.cover) {
    const cr = o.coverRadius ?? 2;
    const vx = o.cover.x - from.x, vz = o.cover.z - from.z;
    const u = vx * sx + vz * sz;
    const v = -vx * sz + vz * sx;
    if (Math.abs(v) <= width / 2 + cr) {
      const pieces: [number, number][] = [[0, u - cr], [u + cr, len]];
      cuts = pieces
        .map((p): [number, number] => [Math.max(0, p[0]), Math.min(len, p[1])])
        .filter((p) => p[1] - p[0] > 0.05);
    }
  }
  for (const [u0, u1] of cuts) {
    const m = (u0 + u1) / 2;
    emit(c, {
      shape: { type: 'rect', width, length: u1 - u0 }, x: from.x + sx * m, z: from.z + sz * m, dx: sx, dz: sz, delay, coef,
      type: o.type ?? 'fire', telegraph: true, name: o.name ?? 'Nefes',
    }, { vert: FREE });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// P-32 intermission: the boss is immune and frozen, a timer runs, add waves spawn on schedule. It ends when `dur` passes or,
// as the safety net, at `maxSeconds` at the latest. Then endMechanicPhase() moves the fight to the next phase.
// ---------------------------------------------------------------------------------------------------------------------
export interface IntermissionOpts {
  /** Timer: the intermission ends after this many seconds. */
  dur: number;
  /** Safety net: ends no later than this (default dur + 15). */
  maxSeconds?: number;
  teleportTo?: Pt;
  addWaves?: IntermissionWave[];
  onStart?: (c: BossController) => void;
  onTick?: (c: BossController, dt: number, t: number) => void;
  onEnd?: (c: BossController) => void;
  /** Called at the end with the adds still alive. */
  survivorPenalty?: (c: BossController, survivors: Enemy[]) => void;
}

/** Start an intermission. Returns false when one is already running. */
export function intermission(c: BossController, o: IntermissionOpts): boolean {
  const s = pst(c);
  if (s.inter) return false;
  const dur = Math.max(0.1, o.dur);
  s.inter = {
    t: 0,
    end: dur,
    max: Math.max(dur, o.maxSeconds ?? dur + 15),
    opts: o,
    waves: (o.addWaves ?? []).slice().sort((a, b) => a.at - b.at),
  };
  c.phaseLocked = true;
  c.setImmune(true);
  c.freeze(true);
  if (o.teleportTo) c.teleport(o.teleportTo.x, o.teleportTo.z);
  o.onStart?.(c);
  return true;
}

export function intermissionActive(c: BossController): boolean {
  return pst(c).inter !== null;
}

function tickIntermission(c: BossController, s: PatternState, dt: number): void {
  const im = s.inter;
  if (!im) return;
  if (c.e.isDead) {
    s.inter = null;
    return;
  }
  im.t += dt;
  while (im.waves.length && im.waves[0].at <= im.t) {
    const w = im.waves.shift();
    w?.run(c);
  }
  im.opts.onTick?.(c, dt, im.t);
  if (im.t >= im.end || im.t >= im.max) endIntermission(c, s, im);
}

function endIntermission(c: BossController, s: PatternState, im: Intermission): void {
  s.inter = null;
  c.setImmune(false);
  if (im.opts.survivorPenalty) im.opts.survivorPenalty(c, c.adds('add').filter((e) => !e.isDead && !e.removed));
  im.opts.onEnd?.(c);
  c.endMechanicPhase();
}
