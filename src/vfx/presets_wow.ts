import * as THREE from 'three';
import { getProcDef } from '../data/procs';
import { G } from '../game/G';
import { getSkill } from '../data/skills';
import type { SkillDef } from '../types/skills';
import { lockoutSchool } from '../combat/castRules';
import { isMajorDef } from '../combat/specs';
import { DONE, TAU, WHITE, flare, mix, rnd, v3, type Ctx, type Fx } from './Fx';
import type { VfxHandle } from './VFX';
import { converge, type Preset } from './presets_combat';
import type { VFX } from './VFX';

// ---------------------------------------------------------------------------------------------------------------------
// COMBAT_WOW §4.3 CW-15 · proc / cast / lockout presets and their event wiring.
// PSX budget: additive sprites and a few flat rings; no new materials (shared atlas layers only), no per-frame
// allocation beyond the particle specs themselves. One-shots return DONE; the arcane orb is a loop the caller stops.
// Hands: with a follow body they sit at 0.55 of the body height, ±0.32 m sideways in the body's local space (right hand =
// staff hand); without one they are placed from the spawn point along the facing. No bone lookup is needed.
// ---------------------------------------------------------------------------------------------------------------------

const ORB_COL = 0xe060ff;
const PROC_COL = 0xffb347;
const PHYS_COL = 0xffd23a;
const CRIT_COL = 0xffd23a;
const LOCK_COL = 0x8fa8ff;

/** School colours (also the proc / lockout colour when the caller gives no `color`). */
const SCHOOL_COL: Record<string, number> = {
  fire: 0xff7a20,
  frost: 0x9fe0ff,
  arcane: 0xe060ff,
  holy: 0xffe28a,
  shadow: 0xb070ff,
  poison: 0x8cff50,
  lightning: 0xaed2ff,
  physical: 0xffd23a,
};

const _left = new THREE.Vector3();
const _right = new THREE.Vector3();
const _side = new THREE.Vector3();

/** Writes the left and right hand points (world space) into _left / _right. */
function hands(c: Ctx): void {
  const f = c.follow;
  if (f) {
    const id = f.userData?.entityId as number | undefined;
    const ent = id !== undefined ? G.world?.get(id) : undefined;
    const h = ent && ent.height > 0 ? ent.height : 1.9;
    f.localToWorld(_left.set(-0.32 * c.s, h * 0.55, 0.12));
    f.localToWorld(_right.set(0.32 * c.s, h * 0.55, 0.12));
    return;
  }
  _side.set(-c.dir.z, 0, c.dir.x);
  _left.set(c.p.x - _side.x * 0.32 * c.s, c.p.y + 1.1 * c.s, c.p.z - _side.z * 0.32 * c.s);
  _right.set(c.p.x + _side.x * 0.32 * c.s, c.p.y + 1.1 * c.s, c.p.z + _side.z * 0.32 * c.s);
}

/** Midpoint of the two hands, written into `out`. */
function handsMid(out: THREE.Vector3): THREE.Vector3 {
  return out.set((_left.x + _right.x) * 0.5, (_left.y + _right.y) * 0.5, (_left.z + _right.z) * 0.5);
}

const _mid = new THREE.Vector3();

export const wowPresets: Record<string, Preset> = {
  /** Proc gained: a camera-facing ring at chest height and 12 sparks, six from each hand. */
  proc_burst(fx, c) {
    const s = c.s;
    const col = c.color(PROC_COL);
    hands(c);
    const mid = handsMid(_mid);
    fx.add.spawn({ tex: 'ring-02', at: mid, life: 0.26, size: 0.4 * s, size1: 2.6 * s, ease: 2, c0: WHITE, c1: col, glow: 2.2, fi: 0, fp: 1.3 });
    flare(fx, mid, 1.1 * s, col, 0.14, 'flare-01', 2.2);
    for (const h of [_left, _right]) {
      fx.add.spawn({ tex: ['star-02', 'cross'], n: 6, at: h, speed: [3 * s, 7 * s], cone: Math.PI, life: [0.22, 0.42], size: [0.1 * s, 0.16 * s], c0: WHITE, c1: col, glow: 2.4, drag: 1.2, grav: 4, fi: 0, fp: 1 });
    }
    fx.light(mid, col, 22, 0.1, 5);
    return DONE;
  },

  /** Proc spent by a cast: the glow collapses inward onto the hands (a short pop, not an expansion). */
  proc_consume(fx, c) {
    const s = c.s;
    const col = c.color(PROC_COL);
    hands(c);
    const mid = handsMid(_mid);
    converge(fx, mid, 1.1 * s, 10, col, WHITE, 0.2, 0.14 * s);
    fx.add.spawn({ tex: 'ring-04', at: mid, life: 0.16, size: 2.4 * s, size1: 0.5 * s, ease: 1, c0: col, c1: WHITE, glow: 2.0, fi: 0, fp: 1.2 });
    flare(fx, mid, 0.9 * s, WHITE, 0.12, 'flare-01', 2.4);
    fx.light(mid, col, 18, 0.08, 4);
    return DONE;
  },

  /** Cast start, fire school: 0.15 s glow at the staff (right) hand. */
  cast_hands_fire: castHands(0xff7a20),
  cast_hands_frost: castHands(0x9fe0ff),
  cast_hands_arcane: castHands(ORB_COL),

  /**
   * One orb per arcane charge. The orb tracks the local player itself (no `follow` in the opts) so every charge is its
   * own loop: VFX.spawn merges loops that share a follow object. `opts.seed` is the charge index (phase slot, 0..3).
   * Orbit period 1.2 s. The caller stops the handle when the charge is spent.
   */
  arcane_charge_orb(fx, c) {
    const s = c.s;
    const col = c.color(ORB_COL);
    const hot = mix(col, WHITE, 0.5);
    const phase = (c.o.seed ?? 0) * (TAU / 4);
    const body = G.player?.object3d ?? null;
    const centre = new THREE.Vector3();
    const r = 0.7 * s;
    return fx.loop(c, 3600, (dt, L) => {
      if (body) body.getWorldPosition(centre);
      else centre.copy(c.p);
      const a = phase + (L.t * TAU) / 1.2;
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      const y = centre.y + 1.1 * s + Math.sin(L.t * 5 + phase) * 0.08;
      const n = L.rate(40, dt);
      for (let i = 0; i < n; i++) {
        fx.add.spawn({ tex: 'soft', at: [x, y, z], life: 0.1, size: 0.34 * s, size1: 0.3 * s, c0: hot, c1: col, glow: 1.8, a: 0.9, fi: 0, fp: 1 });
      }
      const m = L.rate(16, dt);
      for (let i = 0; i < m; i++) {
        fx.add.spawn({ tex: ['star-01', 'cross'], at: [x + rnd(-0.05, 0.05), y + rnd(-0.05, 0.05), z], vel: [0, rnd(0.1, 0.4), 0], life: [0.25, 0.4], size: [0.06 * s, 0.1 * s], c0: col, c1: WHITE, glow: 2.2, fi: 0.1, fp: 1 });
      }
    });
  },

  /** Crit: a flat gold ring on the ground, 0.25 s. */
  crit_ring(fx, c) {
    const s = c.s;
    const col = c.color(CRIT_COL);
    fx.add.spawn({ tex: 'ring-04', mode: 'flat', at: [c.p.x, 0.08, c.p.z], life: 0.25, size: 0.8 * s, size1: 5.2 * s, ease: 1, c0: WHITE, c1: col, glow: 2.0, a: 0.9, fi: 0, fp: 1.2, rot: 0 });
    return DONE;
  },

  /** Interrupt / school lockout: a steel-blue ring at the feet, a flare at the head and four short downward ticks. */
  lockout_flash(fx, c) {
    const s = c.s;
    const col = c.color(LOCK_COL);
    fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [c.p.x, 0.08, c.p.z], life: 0.22, size: 0.6 * s, size1: 3.2 * s, ease: 1, c0: col, c1: col, glow: 1.6, a: 0.85, fi: 0, fp: 1.3, rot: 0 });
    flare(fx, v3(c.p.x, c.p.y + 1.7 * s, c.p.z), 1.3 * s, col, 0.18, 'star-03', 2.2);
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + Math.PI / 4;
      fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 1, at: [c.p.x + Math.cos(a) * 0.35 * s, c.p.y + 1.9 * s, c.p.z + Math.sin(a) * 0.35 * s], vel: [0, -4, 0], life: [0.14, 0.2], size: 0.1 * s, asp: 3, stretch: 0.04, c0: WHITE, c1: col, glow: 2.4, fi: 0, fp: 1 });
    }
    return DONE;
  },
};

function castHands(def: number): Preset {
  return (fx: Fx, c: Ctx) => {
    const s = c.s;
    const col = c.color(def);
    // a cast with a duration on a body holds the glow in both hands for the whole cast (subscribeWowFeedback); no duration = one pop
    if (c.o.duration !== undefined && c.follow) {
      const hot = mix(col, WHITE, 0.5);
      return fx.loop(c, c.o.duration, (dt, L) => {
        hands(c);
        const pulse = 0.8 + 0.2 * Math.sin(L.t * 9);
        const n = L.rate(20, dt);
        for (let i = 0; i < n; i++) {
          const h = i % 2 ? _left : _right;
          fx.add.spawn({ tex: 'soft', at: [h.x + rnd(-0.04, 0.04), h.y + rnd(-0.04, 0.04), h.z + rnd(-0.04, 0.04)], life: 0.22, size: 0.2 * s, size1: 0.07 * s, c0: hot, c1: col, glow: 1.8, a: 0.8 * pulse, fi: 0, fp: 1 });
        }
        const m = L.rate(5, dt);
        for (let i = 0; i < m; i++) {
          fx.add.spawn({ tex: ['star-01', 'cross'], at: [_right.x, _right.y, _right.z], vel: [rnd(-0.3, 0.3), rnd(0.4, 0.9), rnd(-0.3, 0.3)], life: [0.25, 0.4], size: [0.05 * s, 0.09 * s], c0: WHITE, c1: col, glow: 2.2, fi: 0, fp: 1 });
        }
      });
    }
    hands(c);
    flare(fx, _right, 0.9 * s, col, 0.15, 'soft', 2.2);
    fx.add.spawn({ tex: 'ring-02', at: _right, life: 0.15, size: 0.25 * s, size1: 1.1 * s, ease: 1, c0: WHITE, c1: col, glow: 2.0, fi: 0, fp: 1.2 });
    return DONE;
  };
}

/** Player position for spawns that need a follow object (the presets above read it through the spawn ctx). */
function playerBody(): THREE.Object3D | null {
  return G.player?.object3d ?? null;
}

function bodyPos(): [number, number, number] {
  const b = playerBody();
  if (!b) return [0, 0, 0];
  return [b.position.x, b.position.y, b.position.z];
}

/** School of a skill for colour: the lockout school tag, else its damage type; physical and the rest are gold. */
function skillSchool(def: SkillDef): string {
  return lockoutSchool(def) ?? def.damage?.type ?? 'physical';
}

/**
 * Event wiring (CW-15): proc:gain -> proc_burst, proc:fade {consumed} -> proc_consume, skill:lockout -> lockout_flash.
 * Own casts (WoW-style feedback): skill:cast -> school-coloured hand glow held for the cast time, and a major cooldown
 * (m45 / m90 / m180) pops its name over the head once. skill:castInterrupted -> the glow ends.
 * Called once from VFX.subscribe(). Each handler is guarded so a bad payload cannot break the event bus.
 */
export function subscribeWowFeedback(vfx: VFX): void {
  const ev = G.events;
  let castGlow: VfxHandle | null = null;

  ev.on('skill:cast', (e) => {
    try {
      const body = playerBody();
      const pl = G.player;
      if (!body || !pl || e.casterId !== pl.id) return;
      const def = getSkill(e.skillId);
      if (!def) return;
      castGlow?.stop();
      castGlow = null;
      if (e.castTime > 0.15) {
        const school = skillSchool(def);
        const id = school === 'fire' ? 'cast_hands_fire' : school === 'frost' ? 'cast_hands_frost' : 'cast_hands_arcane';
        const h = vfx.spawn(id, bodyPos(), { follow: body, duration: e.castTime, color: SCHOOL_COL[school] ?? PHYS_COL });
        if (h.alive) castGlow = h;
      }
      if (isMajorDef(def)) {
        vfx.damageNumber([pl.position.x, pl.position.y + pl.height * 1.35, pl.position.z], 0, 'normal', def.name, { ability: true });
      }
    } catch (err) {
      console.warn('[vfx] cast feedback failed', err);
    }
  });

  ev.on('skill:castInterrupted', (e) => {
    if (G.player && e.casterId === G.player.id) {
      castGlow?.stop();
      castGlow = null;
    }
  });

  ev.on('proc:gain', (e) => {
    try {
      const body = playerBody();
      if (!body) return;
      const school = getProcDef(e.id)?.school;
      vfx.spawn('proc_burst', bodyPos(), { follow: body, color: school ? SCHOOL_COL[school] : undefined });
    } catch (err) {
      console.warn('[vfx] proc_burst feedback failed', err);
    }
  });

  ev.on('proc:fade', (e) => {
    try {
      if (!e.consumed) return;
      const body = playerBody();
      if (!body) return;
      const school = getProcDef(e.id)?.school;
      vfx.spawn('proc_consume', bodyPos(), { follow: body, color: school ? SCHOOL_COL[school] : undefined });
    } catch (err) {
      console.warn('[vfx] proc_consume feedback failed', err);
    }
  });

  ev.on('skill:lockout', (e) => {
    try {
      const body = playerBody();
      if (!body) return;
      vfx.spawn('lockout_flash', bodyPos(), { follow: body, color: SCHOOL_COL[e.school] });
    } catch (err) {
      console.warn('[vfx] lockout_flash feedback failed', err);
    }
  });
}
