import * as THREE from 'three';
import type { SpawnVfxOpts } from '../types/vfx';
import type { VfxHandle } from './VFX';
import type { ParticleLayer, PSpec, V3 } from './Particles';
import type { SheetAtlas } from './Sheets';

/**
 * Internal contract between the VFX facade and the preset files.
 * Presets only use this interface (never the VFX class) so they stay testable and decoupled.
 */
export interface LoopCtl {
  /** world position (follow target position when following) */
  readonly pos: THREE.Vector3;
  /** seconds since start */
  t: number;
  /** follow target body size */
  readonly radius: number;
  readonly height: number;
  readonly follow: THREE.Object3D | null;
  /** how many emissions this frame for `perSec` (fractional carry handled) */
  rate(perSec: number, dt: number): number;
  /** point at a fraction of the body height (follow) or above pos */
  at(heightFrac: number, out?: THREE.Vector3): THREE.Vector3;
  /** camera is farther than `d` metres (skip ambient emission) */
  far(d: number): boolean;
  /** velocity of the followed object (m/s, horizontal) */
  readonly speed: number;
  readonly vel: THREE.Vector3;
  /** scale of the spawn or of the latest refresh of a unique loop (SpawnVfxOpts.scale); lets an aura grow while it is held */
  readonly scale: number;
}

export interface Ctx {
  /** impact / spawn position */
  p: THREE.Vector3;
  o: SpawnVfxOpts;
  /** scale option (1 default) */
  s: number;
  /** horizontal-normalised direction (opts.dir or +Z) */
  dir: THREE.Vector3;
  hasDir: boolean;
  /** raw opts.dir (may point up/down) */
  dir3: THREE.Vector3;
  color(def: number): number;
  /** opts.duration or the preset default */
  dur(def: number): number;
  target: THREE.Vector3 | null;
  follow: THREE.Object3D | null;
}

export interface Fx {
  add: ParticleLayer;      // additive glow sprites
  alpha: ParticleLayer;    // alpha-blended (smoke, dust, blood)
  decal: ParticleLayer;    // ground decals (alpha, drawn under everything)
  sheetAlpha: ParticleLayer; // pixel-art sprite sheets, alpha blended (see Sheets.ts)
  sheetAdd: ParticleLayer;   // pixel-art sprite sheets, additive
  sheets: SheetAtlas;
  camPos: THREE.Vector3;
  scene: THREE.Scene | null;
  /** pooled point-light flash */
  light(pos: THREE.Vector3 | V3, color: number, intensity: number, dur: number, dist?: number): void;
  /** run fn after delay seconds (auto-cancelled on clear) */
  after(delay: number, fn: () => void, owner?: LoopHandle): void;
  /** per-frame emitter bound to an optional follow object */
  loop(c: Ctx, defDuration: number, tick: (dt: number, L: LoopCtl) => void, onEnd?: () => void): LoopHandle;
  /** jagged lightning between two points for `dur` seconds (re-rolled ~20 Hz) */
  lightning(a: THREE.Vector3, b: THREE.Vector3, color: number, width: number, dur: number, opts?: { segs?: number; amp?: number; branches?: number; glow?: number }): VfxHandle;
  /** vertical glowing pillar; returns handle that can fade */
  pillar(pos: THREE.Vector3, color: number, height: number, radius: number, dur: number, opts?: { rise?: boolean; follow?: THREE.Object3D | null; spin?: number; fadeIn?: number; hot?: number; alpha?: number }): VfxHandle;
  /** translucent fresnel shell around a follow object / at pos */
  shell(c: Ctx, kind: 'shield' | 'ice' | 'aura', color: number, dur: number): VfxHandle;
  /** camera-facing screen flash */
  screenFlash(color: string, peak?: number, dur?: number): void;
  projectileMesh(kind: string, scale: number): THREE.Object3D | null;
  /** looping presets reuse each other */
  spawnId(id: string, pos: THREE.Vector3 | V3, opts?: SpawnVfxOpts): VfxHandle;
  /** engine frame counter */
  frame(): number;
}

export interface LoopHandle extends VfxHandle {
  setPosition(x: number, y: number, z: number): void;
  /** extend/shorten lifetime */
  setDuration(sec: number): void;
}

export const DONE: VfxHandle = { alive: false, stop() {} };

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const _a = new THREE.Color();
const _b = new THREE.Color();
export function mix(a: number, b: number, t: number): number {
  _a.setHex(a);
  _b.setHex(b);
  return _a.lerp(_b, t).getHex();
}
export const WHITE = 0xffffff;

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

export function rot(dx: number, dz: number): number {
  // rotation that points a flat quad's texture "up" along (dx, dz)
  return Math.atan2(-dx, -dz);
}

/** Streaked sparks + chunky pixel sparks that bounce. */
export function sparks(
  fx: Fx,
  p: THREE.Vector3 | V3,
  dir: THREE.Vector3 | V3 | null,
  o: { n?: number; c0?: number; c1?: number; speed?: [number, number]; life?: [number, number]; size?: number; cone?: number; grav?: number; glow?: number; len?: number; px?: number },
): void {
  const c0 = o.c0 ?? 0xfff2c0;
  const c1 = o.c1 ?? 0xff9a30;
  const spec: PSpec = {
    tex: 'streak',
    mode: 'stretch',
    n: o.n ?? 10,
    at: p,
    dir: dir ?? undefined,
    cone: o.cone ?? (dir ? 0.9 : Math.PI),
    speed: o.speed ?? [5, 12],
    life: o.life ?? [0.18, 0.4],
    size: o.size ?? 0.11,
    asp: o.len ?? 1.3,
    stretch: 0.035,
    c0,
    c1,
    glow: o.glow ?? 2.4,
    grav: o.grav ?? 16,
    drag: 1.2,
    fi: 0,
    fp: 1,
  };
  fx.add.spawn(spec);
  const px = o.px ?? Math.round((o.n ?? 10) * 0.5);
  if (px > 0)
    fx.add.spawn({
      tex: 'px',
      n: px,
      at: p,
      dir: dir ?? undefined,
      cone: o.cone ?? (dir ? 1.0 : Math.PI),
      speed: [2.5, (o.speed?.[1] ?? 12) * 0.8],
      life: [0.25, 0.6],
      size: [0.05, 0.09],
      c0: c0,
      c1: c1,
      glow: 2,
      grav: 22,
      bounce: 0.45,
      drag: 0.6,
      fi: 0,
      fp: 0.8,
      rot: 0,
    });
}

/** Camera-facing flash that pops and dies (star flare / glow disc). */
export function flare(fx: Fx, p: THREE.Vector3 | V3, size: number, color: number, life = 0.16, tex = 'magic-flare-01', glow = 2.5, spin = 0): void {
  // big flares are tinted and dimmer so bloom doesn't wash the whole screen white
  const g = glow * Math.max(0.5, Math.min(1, 1.3 - size * 0.18));
  fx.add.spawn({ tex, at: p, life, size: size * 0.6, size1: size * 1.25, ease: 1, c0: size > 1.8 ? mix(color, WHITE, 0.45) : WHITE, c1: color, glow: g, fi: 0, fp: 1.4, spin, rot: [0, 6.28] });
}

/** Flat ground ring that expands (additive by default). */
export function ringFlat(
  fx: Fx,
  p: THREE.Vector3 | V3,
  r0: number,
  r1: number,
  color: number,
  life = 0.5,
  o: { tex?: string; glow?: number; a?: number; layer?: 'add' | 'alpha'; y?: number; c1?: number; fp?: number; ease?: 0 | 1 | 2; spin?: number } = {},
): void {
  const at: V3 = Array.isArray(p) ? [p[0], (o.y ?? 0.08), p[2]] : [p.x, (o.y ?? 0.08) + (p.y > 0.5 ? 0 : p.y), p.z];
  (o.layer === 'alpha' ? fx.alpha : fx.add).spawn({
    tex: o.tex ?? 'ring-01',
    mode: 'flat',
    at,
    life,
    size: r0 * 2,
    size1: r1 * 2,
    ease: o.ease ?? 2,
    c0: color,
    c1: o.c1 ?? color,
    glow: o.glow ?? 1.6,
    a: o.a ?? 0.9,
    fi: 0,
    fp: o.fp ?? 1.3,
    spin: o.spin ?? 0,
    rot: 0,
  });
}

/** Ground-hugging dust/smoke puffs radiating out. */
export function dust(fx: Fx, p: THREE.Vector3 | V3, o: { n?: number; r?: number; c0?: number; c1?: number; size?: number | [number, number]; life?: [number, number]; speed?: number; a?: number; rise?: number; tex?: string[] }): void {
  fx.alpha.spawn({
    tex: o.tex ?? ['smoke-01', 'smoke-02', 'smoke-03'],
    n: o.n ?? 8,
    at: Array.isArray(p) ? [p[0], p[1] + 0.25, p[2]] : [p.x, p.y + 0.25, p.z],
    jit: [o.r ?? 0.5, 0.05, o.r ?? 0.5],
    area: 'disc',
    radial: [(o.speed ?? 2) * 0.5, o.speed ?? 2],
    vel: [0, 0.3, 0],
    life: o.life ?? [0.45, 0.9],
    size: o.size ?? [0.5, 0.9],
    grow: 2.2,
    c0: o.c0 ?? 0x9a8f80,
    c1: o.c1 ?? 0x6a6258,
    a: o.a ?? 0.55,
    fi: 0.1,
    fp: 1.6,
    drag: 2.4,
    grav: -(o.rise ?? 0.6),
    spin: [-1.2, 1.2],
  });
}

/** Rising smoke column. */
export function smoke(fx: Fx, p: THREE.Vector3 | V3, o: { n?: number; r?: number; c0?: number; c1?: number; size?: number | [number, number]; life?: [number, number]; rise?: number; a?: number; spread?: number }): void {
  fx.alpha.spawn({
    tex: ['smoke-01', 'smoke-02', 'smoke-04'],
    n: o.n ?? 6,
    at: p,
    jit: o.r ?? 0.3,
    vel: [0, o.rise ?? 1.2, 0],
    speed: [0, o.spread ?? 0.6],
    life: o.life ?? [0.7, 1.3],
    size: o.size ?? [0.5, 0.8],
    grow: 2.4,
    c0: o.c0 ?? 0x555048,
    c1: o.c1 ?? 0x1a1816,
    a: o.a ?? 0.6,
    fi: 0.12,
    fp: 1.5,
    drag: 1.2,
    spin: [-1, 1],
  });
}

/** Fire puffs (additive), rising. */
export function flames(fx: Fx, p: THREE.Vector3 | V3, o: { n?: number; r?: number; c0?: number; c1?: number; size?: number | [number, number]; life?: [number, number]; rise?: number; glow?: number; spread?: number; tex?: string[] }): void {
  fx.add.spawn({
    tex: o.tex ?? ['flame-01', 'flame-02', 'flame-03', 'fire-01'],
    n: o.n ?? 4,
    at: p,
    jit: o.r ?? 0.25,
    vel: [0, o.rise ?? 1.6, 0],
    speed: [0, o.spread ?? 0.4],
    life: o.life ?? [0.35, 0.7],
    size: o.size ?? [0.5, 0.8],
    grow: 0.35,
    c0: o.c0 ?? 0xffb040,
    c1: o.c1 ?? 0xc82000,
    glow: o.glow ?? 1.35,
    a: 0.7,
    fi: 0.05,
    fp: 1.1,
    drag: 0.8,
    spin: [-1.5, 1.5],
  });
}

/** Floating motes / glints (additive). */
export function motes(fx: Fx, p: THREE.Vector3 | V3, o: { n?: number; r?: number | V3; area?: 'sphere' | 'box' | 'disc' | 'ring'; c0?: number; c1?: number; size?: number | [number, number]; life?: [number, number]; rise?: number; glow?: number; tex?: string | string[]; speed?: number; grav?: number; spin?: number; a?: number }): void {
  fx.add.spawn({
    tex: o.tex ?? ['star-01', 'flare-01', 'cross'],
    n: o.n ?? 3,
    at: p,
    jit: o.r ?? 0.4,
    area: o.area,
    vel: [0, o.rise ?? 0.8, 0],
    speed: [0, o.speed ?? 0.3],
    life: o.life ?? [0.6, 1.2],
    size: o.size ?? [0.1, 0.22],
    grow: 0.4,
    c0: o.c0 ?? WHITE,
    c1: o.c1 ?? 0xffd060,
    glow: o.glow ?? 2.2,
    a: o.a ?? 1,
    fi: 0.2,
    fp: 1,
    grav: o.grav ?? 0,
    spin: [-2, 2],
  });
}

/** Chunky debris that flies and bounces. */
export function debris(fx: Fx, p: THREE.Vector3 | V3, o: { n?: number; r?: number; c0?: number; c1?: number; size?: [number, number]; speed?: [number, number]; up?: number; tex?: string[]; life?: [number, number] }): void {
  fx.alpha.spawn({
    tex: o.tex ?? ['chunk', 'px'],
    n: o.n ?? 8,
    at: p,
    jit: [o.r ?? 0.4, 0.05, o.r ?? 0.4],
    area: 'disc',
    radial: o.speed ?? [2, 5],
    vel: [0, o.up ?? 4, 0],
    speed: [0, 1.5],
    life: o.life ?? [0.5, 1.1],
    size: o.size ?? [0.1, 0.22],
    c0: o.c0 ?? 0x8a7c6a,
    c1: o.c1 ?? 0x4a4036,
    a: 1,
    fi: 0,
    fp: 3,
    grav: 20,
    bounce: 0.35,
    drag: 0.5,
    spin: [-9, 9],
  });
}

/** Persistent ground decal (alpha) that fades slowly. */
export function decal(fx: Fx, p: THREE.Vector3 | V3, o: { tex?: string; size: number; c0: number; c1?: number; life?: number; a?: number; rot?: number; grow?: number; fp?: number; additive?: boolean; fi?: number }): void {
  const at: V3 = Array.isArray(p) ? [p[0], 0.035, p[2]] : [p.x, 0.035, p.z];
  (o.additive ? fx.add : fx.decal).spawn({
    tex: o.tex ?? 'splat',
    mode: 'flat',
    at,
    life: o.life ?? 8,
    size: o.size,
    grow: o.grow ?? 1,
    c0: o.c0,
    c1: o.c1 ?? o.c0,
    a: o.a ?? 0.8,
    fi: o.fi ?? 0.02,
    fp: o.fp ?? 2.5,
    rot: o.rot ?? Math.random() * 6.28,
    ease: 1,
    glow: 1,
  });
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const TAU = Math.PI * 2;
