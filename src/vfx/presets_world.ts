import * as THREE from 'three';
import type { Rarity } from '../types/common';
import { DONE, TAU, debris, dust, flare, mix, motes, ringFlat, rnd, smoke, sparks, v3, type Ctx, type Fx, type LoopHandle } from './Fx';
import type { Preset } from './presets_combat';

const up = (p: THREE.Vector3, h: number): THREE.Vector3 => new THREE.Vector3(p.x, p.y + h, p.z);
const gnd = (p: THREE.Vector3, y = 0.08): THREE.Vector3 => new THREE.Vector3(p.x, y, p.z);

// ---------------------------------------------------------------------------
// Loot beams (Diablo / PoE style)
// ---------------------------------------------------------------------------

export interface BeamTier {
  color: number;
  height: number;
  radius: number;
  sparkles: number;   // per second
  ring: number;       // 0 none, 1 steady ring, 2 pulsing rings
  pulse: number;      // seconds between expanding pulse rings (0 none)
  visible: number;    // visible distance (m)
  swirl?: boolean;
  leaves?: boolean;
}

export const BEAM_TIERS: Record<Rarity, BeamTier | null> = {
  poor: null,
  common: null,
  uncommon: { color: 0x2aff10, height: 0, radius: 0.3, sparkles: 5, ring: 1, pulse: 0, visible: 20 },
  rare: { color: 0x2f8cff, height: 3.2, radius: 0.26, sparkles: 6, ring: 1, pulse: 0, visible: 30 },
  epic: { color: 0xb050ff, height: 5.5, radius: 0.32, sparkles: 12, ring: 1, pulse: 0, visible: 45, swirl: true },
  legendary: { color: 0xff8a10, height: 9, radius: 0.4, sparkles: 18, ring: 2, pulse: 1.2, visible: 80 },
  set: { color: 0xb8e04a, height: 8.5, radius: 0.38, sparkles: 14, ring: 2, pulse: 1.6, visible: 80, leaves: true },
};

/** Persistent loot beam anchored to an object (or a point). */
export function lootBeamFx(fx: Fx, c: Ctx, tier: BeamTier, anchor: THREE.Object3D | null): LoopHandle {
  const col = tier.color;
  const hot = mix(col, 0xffffff, 0.55);
  const pillar = tier.height > 0 ? fx.pillar(c.p, col, tier.height, tier.radius, Infinity, { follow: anchor, rise: false, fadeIn: 0.3 }) : null;
  let pulseT = Math.random() * 1.2;
  const h = fx.loop(
    c,
    Infinity,
    (dt, L) => {
      const near = !L.far(tier.visible);
      if (!near) return;
      const gy = L.pos.y > 0.9 ? L.pos.y - 0.5 : 0.06;
      const x = L.pos.x;
      const z = L.pos.z;
      const flick = 0.8 + 0.2 * Math.sin(L.t * 7 + x);
      // ground glow + ring
      fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [x, gy, z], size: 1.7 + tier.radius * 3, life: 1, c0: col, glow: 1.1, a: 0.45 * flick, oneFrame: true });
      if (tier.ring > 0) fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [x, gy + 0.01, z], size: 1.2 + tier.radius * 1.8, life: 1, c0: hot, glow: 1.8, a: 0.8 * flick, oneFrame: true });
      if (tier.height > 0) fx.add.spawn({ tex: 'glow', at: [x, gy + 0.35, z], size: 1.1 + tier.radius * 2, life: 1, c0: col, c1: hot, glow: 1.4, a: 0.5 * flick, oneFrame: true });
      // rising sparkles
      const n = L.rate(tier.sparkles, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = rnd(0.1, 0.5 + tier.radius);
        fx.add.spawn({ tex: ['star-01', 'flare-01', 'cross'], at: [x + Math.cos(a) * r, gy + 0.1, z + Math.sin(a) * r], vel: [0, rnd(0.8, 2.2) + tier.height * 0.18, 0], life: [0.8, 1.6], size: [0.1, 0.22], grow: 0.4, c0: 0xffffff, c1: col, glow: 2.4, fi: 0.1, fp: 1 });
      }
      if (tier.swirl) {
        const m = L.rate(10, dt);
        for (let i = 0; i < m; i++) {
          const a = L.t * 3 + (i / Math.max(1, m)) * TAU;
          fx.add.spawn({ tex: 'flare-01', at: [x + Math.cos(a) * 0.55, gy + 0.1, z + Math.sin(a) * 0.55], vel: [-Math.sin(a) * 1.4, 1.8, Math.cos(a) * 1.4], life: [0.7, 1.1], size: 0.2, c0: 0xffffff, c1: col, glow: 2.4, fi: 0.1, fp: 1 });
        }
      }
      if (tier.leaves) {
        const m = L.rate(5, dt);
        for (let i = 0; i < m; i++) fx.alpha.spawn({ tex: 'shard', at: [x + rnd(-0.4, 0.4), gy + 0.3, z + rnd(-0.4, 0.4)], vel: [rnd(-0.4, 0.4), rnd(1, 2), rnd(-0.4, 0.4)], life: [0.9, 1.5], size: [0.14, 0.22], asp: 1.6, c0: 0xdcff80, c1: 0x6aa020, a: 0.9, grav: 0.8, spin: [-4, 4], fi: 0.1, fp: 1.5 });
      }
      if (tier.pulse > 0) {
        pulseT -= dt;
        if (pulseT <= 0) {
          pulseT = tier.pulse;
          fx.add.spawn({ tex: 'ring-04', mode: 'flat', at: [x, gy + 0.02, z], size: 0.6, size1: 4.2, ease: 2, life: 0.8, c0: hot, c1: col, glow: 2, a: 0.85, fp: 1.4 });
          fx.add.spawn({ tex: 'ring-02', at: [x, gy + 0.9, z], size: 0.4, size1: 2.2, ease: 2, life: 0.5, c0: 0xffffff, c1: col, glow: 1.6, a: 0.5, fp: 1.4 });
        }
      }
    },
    () => pillar?.stop(),
  );
  return h;
}

// ---------------------------------------------------------------------------

function flameSource(fx: Fx, c: Ctx, o: { size: number; rate: number; jit: number; halo: number; embers: number; smoke: number; col0?: number; col1?: number; light?: boolean; tall?: number }): LoopHandle {
  const c0 = c.color(o.col0 ?? 0xfff0a0);
  const c1 = o.col1 ?? 0xff4a08;
  let flickLight = 0;
  return fx.loop(c, Infinity, (dt, L) => {
    if (L.far(60)) return;
    const k = L.far(28) ? 0.5 : 1;
    const n = L.rate(o.rate * k, dt);
    for (let i = 0; i < n; i++) {
      fx.add.spawn({ tex: ['flame-tongue-01', 'flame-tongue-02', 'flame-01', 'flame-02'], at: [L.pos.x + rnd(-o.jit, o.jit), L.pos.y + o.size * 0.35, L.pos.z + rnd(-o.jit, o.jit)], vel: [rnd(-0.1, 0.1), rnd(0.8, 1.6) * (o.tall ?? 1), rnd(-0.1, 0.1)], life: [0.35, 0.65], size: [o.size * 0.8, o.size * 1.2], asp: 1.4, grow: 0.35, c0, c1, glow: 1.35, a: 0.7, fi: 0.08, fp: 1.1, spin: [-0.6, 0.6] });
    }
    const flick = 0.75 + 0.25 * Math.sin(L.t * 17 + L.pos.x) * Math.sin(L.t * 9.3);
    fx.add.spawn({ tex: 'glow', at: [L.pos.x, L.pos.y + o.size * 0.6, L.pos.z], size: o.halo * flick, life: 1, c0: c1, c1: c0, glow: 1.0, a: 0.3, oneFrame: true });
    const m = L.rate(o.embers * k, dt);
    for (let i = 0; i < m; i++) fx.add.spawn({ tex: 'px', at: [L.pos.x + rnd(-o.jit, o.jit), L.pos.y + o.size, L.pos.z + rnd(-o.jit, o.jit)], vel: [rnd(-0.4, 0.4), rnd(1, 2.2), rnd(-0.4, 0.4)], life: [0.8, 1.6], size: 0.05, c0: 0xffd060, c1: 0xff3000, glow: 2.4, drag: 0.4, fi: 0, fp: 1 });
    const s = L.rate(o.smoke * k, dt);
    for (let i = 0; i < s; i++) fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], at: [L.pos.x, L.pos.y + o.size * 1.3, L.pos.z], vel: [rnd(-0.1, 0.2), rnd(0.8, 1.3), rnd(-0.1, 0.1)], life: [1, 1.7], size: [o.size * 0.5, o.size * 0.8], grow: 2.2, c0: 0x2c2a28, c1: 0x0c0c0c, a: 0.16, fi: 0.2, fp: 1.4 });
    if (o.light) {
      flickLight -= dt;
      if (flickLight <= 0) {
        flickLight = 0.18;
        fx.light(up(L.pos, o.size), 0xff8a30, 14 + 6 * flick, 0.22, 10);
      }
    }
  });
}

/** Volume emitter around its position (or the followed camera). */
function ambience(fx: Fx, c: Ctx, o: { R: number; rate: number; spawn: (x: number, y: number, z: number) => void; H?: number; yMin?: number }): LoopHandle {
  return fx.loop(c, Infinity, (dt, L) => {
    const Rw = o.R * c.s; // emitter radius in metres
    // rooms far from the camera would eat the particle budget for nothing (one emitter per room in dungeons)
    if (L.far(Rw + 40)) return;
    // A big emitter (a whole dungeon room, scale up to 4) is only ever seen near the camera: spawn in a camera-centred disc
    // clipped to the emitter. The density per m2 stays that of a scale-1 emitter (base rate over the base area) at any scale.
    const big = Rw > 18 && !L.follow;
    const Rl = big ? 18 : Rw;
    const n = L.rate(o.rate * Math.max(0.35, (Rl / o.R) * (Rl / o.R)), dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * Rl;
      const y = L.pos.y + (o.yMin ?? 0) + Math.random() * (o.H ?? 4);
      if (big) {
        const x = fx.camPos.x + Math.cos(a) * r;
        const z = fx.camPos.z + Math.sin(a) * r;
        if (Math.hypot(x - L.pos.x, z - L.pos.z) > Rw) continue; // outside the room: skip
        o.spawn(x, y, z);
      } else {
        o.spawn(L.pos.x + Math.cos(a) * r, y, L.pos.z + Math.sin(a) * r);
      }
    }
  });
}

export const worldPresets: Record<string, Preset> = {
  loot_beam(fx, c) {
    const col = c.color(0xffffff);
    return lootBeamFx(fx, c, { color: col, height: 6 * c.s, radius: 0.3, sparkles: 10, ring: 1, pulse: 0, visible: 60 }, c.follow);
  },

  gold_sparkle(fx, c) {
    const s = c.s;
    fx.add.spawn({ tex: 'px', n: 9, at: up(c.p, 0.2), speed: [2.5, 6], dir: [0, 1, 0], cone: 0.9, life: [0.4, 0.9], size: [0.06, 0.1], c0: 0xfff0a0, c1: 0xffb800, glow: 2.4, grav: 16, bounce: 0.5, drag: 0.4, fi: 0, fp: 1.2 });
    fx.add.spawn({ tex: ['star-01', 'cross', 'star-04'], n: 6, at: up(c.p, 0.3), speed: [0.5, 2.5], vel: [0, 1.2, 0], life: [0.4, 0.8], size: [0.14, 0.28], c0: 0xffffff, c1: 0xffd030, glow: 2.6, fi: 0.1, fp: 1 });
    flare(fx, up(c.p, 0.3), 1.0 * s, 0xffd030, 0.14, 'star-05', 2.6);
    return DONE;
  },

  chest_open(fx, c) {
    const s = c.s;
    const col = c.color(0xffd24a);
    fx.add.spawn({ tex: 'burst-jet-01', at: [c.p.x, c.p.y + 1.1 * s, c.p.z], size: 1.8 * s, asp: 1.9, size1: 2.4 * s, life: 0.5, c0: 0xffffff, c1: col, glow: 2.4, a: 0.95, fi: 0.02, fp: 1.4 });
    flare(fx, up(c.p, 0.7), 3 * s, col, 0.3, 'star-05', 2.8, 1);
    ringFlat(fx, gnd(c.p), 0.3, 2.6 * s, col, 0.5, { glow: 1.8, a: 0.85 });
    motes(fx, up(c.p, 0.7), { n: 18, r: [0.5, 0.2, 0.5], area: 'box', c0: 0xffffff, c1: col, rise: 2.4, speed: 1.4, life: [0.6, 1.3], size: [0.12, 0.26] });
    fx.add.spawn({ tex: 'px', n: 10, at: up(c.p, 0.8), dir: [0, 1, 0], cone: 0.7, speed: [3, 7], life: [0.5, 1], size: [0.06, 0.1], c0: 0xfff0a0, c1: 0xffb800, glow: 2.4, grav: 16, bounce: 0.5, fi: 0, fp: 1.2 });
    dust(fx, gnd(c.p), { n: 6, r: 0.5 * s, speed: 1.6, size: [0.4, 0.7], a: 0.4 });
    fx.light(up(c.p, 1), col, 60, 0.45, 9);
    return DONE;
  },

  portal_swirl(fx, c) {
    const col = c.color(0x7a50ff);
    const hot = mix(col, 0xffffff, 0.5);
    const n3 = c.hasDir || c.dir3.lengthSq() > 0.01 ? c.dir3.clone().normalize() : v3(0, 0, 1);
    if (n3.lengthSq() < 0.01) n3.set(0, 0, 1);
    const uAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n3);
    if (uAxis.lengthSq() < 1e-4) uAxis.set(1, 0, 0);
    uAxis.normalize();
    const vAxis = new THREE.Vector3().crossVectors(n3, uAxis).normalize();
    const R = 1.5 * c.s;
    return fx.loop(c, Infinity, (dt, L) => {
      if (L.far(70)) return;
      const nn: [number, number, number] = [n3.x, n3.y, n3.z];
      const pulse = 1 + 0.06 * Math.sin(L.t * 3);
      fx.add.spawn({ tex: 'twirl-01', mode: 'plane', normal: nn, at: L.pos, rot: L.t * 1.6, size: R * 2.2 * pulse, life: 1, c0: hot, c1: col, glow: 1.5, a: 1, oneFrame: true });
      fx.add.spawn({ tex: 'twirl-03', mode: 'plane', normal: nn, at: L.pos, rot: -L.t * 1.0, size: R * 2.7, life: 1, c0: col, c1: col, glow: 1.2, a: 0.6, oneFrame: true });
      fx.add.spawn({ tex: 'ring-03', mode: 'plane', normal: nn, at: L.pos, rot: 0, size: R * 2.5 * pulse, life: 1, c0: col, c1: col, glow: 1.1, a: 0.5, oneFrame: true });
      fx.add.spawn({ tex: 'glow', at: L.pos, size: R * 1.5, life: 1, c0: col, c1: hot, glow: 1.2, a: 0.55 + 0.1 * Math.sin(L.t * 5), oneFrame: true });
      const n = L.rate(34, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = R * rnd(0.95, 1.25);
        const px = L.pos.x + (uAxis.x * Math.cos(a) + vAxis.x * Math.sin(a)) * r;
        const py = L.pos.y + (uAxis.y * Math.cos(a) + vAxis.y * Math.sin(a)) * r;
        const pz = L.pos.z + (uAxis.z * Math.cos(a) + vAxis.z * Math.sin(a)) * r;
        const tx = -uAxis.x * Math.sin(a) + vAxis.x * Math.cos(a);
        const ty = -uAxis.y * Math.sin(a) + vAxis.y * Math.cos(a);
        const tz = -uAxis.z * Math.sin(a) + vAxis.z * Math.cos(a);
        const rx = L.pos.x - px;
        const ry = L.pos.y - py;
        const rz = L.pos.z - pz;
        fx.add.spawn({ tex: ['star-01', 'flare-01', 'cross'], at: [px, py, pz], vel: [rx * 1.1 + tx * 2.4, ry * 1.1 + ty * 2.4, rz * 1.1 + tz * 2.4], life: [0.6, 0.9], size: [0.12, 0.24], grow: 0.3, c0: 0xffffff, c1: col, glow: 2.4, fi: 0.2, fp: 1 });
      }
    });
  },

  torch_fire(fx, c) {
    return flameSource(fx, c, { size: 0.65 * c.s, rate: 22, jit: 0.05, halo: 1.8 * c.s, embers: 2, smoke: 2.5, light: false });
  },
  brazier_fire(fx, c) {
    return flameSource(fx, c, { size: 1.25 * c.s, rate: 34, jit: 0.3 * c.s, halo: 3.4 * c.s, embers: 6, smoke: 4, light: true, tall: 1.2 });
  },
  candle_flame(fx, c) {
    const col = c.color(0xffd070);
    return fx.loop(c, Infinity, (dt, L) => {
      if (L.far(35)) return;
      const f = 0.85 + 0.15 * Math.sin(L.t * 21 + L.pos.x * 3) * Math.sin(L.t * 8.7);
      fx.add.spawn({ tex: 'flame-tongue-02', at: [L.pos.x, L.pos.y + 0.1 * c.s, L.pos.z], size: 0.2 * c.s * f, asp: 1.6, life: 1, c0: 0xfff6d0, c1: col, glow: 1.35, a: 0.7, oneFrame: true });
      fx.add.spawn({ tex: 'glow', at: [L.pos.x, L.pos.y + 0.1 * c.s, L.pos.z], size: 0.9 * c.s * f, life: 1, c0: 0xff8a30, glow: 0.9, a: 0.3, oneFrame: true });
    });
  },

  ambient_dust(fx, c) {
    return ambience(fx, c, {
      R: 9,
      rate: 5,
      H: 5,
      spawn: (x, y, z) => fx.add.spawn({ tex: ['soft', 'dot'], at: [x, y, z], vel: [rnd(-0.12, 0.12), rnd(-0.02, 0.1), rnd(-0.12, 0.12)], life: [4, 7], size: [0.03, 0.07], c0: 0xffe8c0, c1: 0xffe8c0, glow: 1.2, a: 0.5, fi: 0.3, fp: 1 }),
    });
  },
  ambient_embers(fx, c) {
    return ambience(fx, c, {
      R: 11,
      rate: 9,
      H: 1.5,
      spawn: (x, y, z) => fx.add.spawn({ tex: 'px', at: [x, y, z], vel: [rnd(-0.3, 0.5), rnd(0.8, 1.8), rnd(-0.3, 0.3)], life: [2, 4], size: [0.04, 0.08], c0: 0xffd060, c1: 0xff3000, glow: 2.4, drag: 0.1, fi: 0.1, fp: 1 }),
    });
  },
  ambient_snow(fx, c) {
    return ambience(fx, c, {
      R: 14,
      rate: 60,
      H: 3,
      yMin: 5,
      spawn: (x, y, z) => fx.alpha.spawn({ tex: ['px', 'dot'], at: [x, y, z], vel: [rnd(0.2, 0.7), rnd(-1.9, -1.2), rnd(-0.2, 0.3)], life: [4.5, 6], size: [0.05, 0.1], c0: 0xffffff, c1: 0xdaf0ff, a: 0.85, fi: 0.05, fp: 6 }),
    });
  },
  ambient_shadow_wisps(fx, c) {
    return ambience(fx, c, {
      R: 10,
      rate: 2.5,
      H: 1.6,
      spawn: (x, y, z) => fx.add.spawn({ tex: 'wisp', at: [x, y, z], vel: [rnd(-0.4, 0.4), rnd(0.1, 0.5), rnd(-0.4, 0.4)], life: [2.5, 4], size: [0.6, 1.1], asp: 1.6, c0: 0xc8a8ff, c1: 0x5a30b0, glow: 1.0, a: 0.4, fi: 0.3, fp: 1.4 }),
    });
  },

  waypoint_glow(fx, c) {
    const col = c.color(0x6ab8ff);
    const p = fx.pillar(c.p, col, 10 * c.s, 0.55 * c.s, Infinity, { follow: c.follow, rise: false, fadeIn: 0.4 });
    return fx.loop(
      c,
      Infinity,
      (dt, L) => {
        if (L.far(70)) return;
        const gy = 0.07;
        fx.add.spawn({ tex: 'magic-circle-01', mode: 'flat', at: [L.pos.x, gy, L.pos.z], size: 2.6 * c.s, rot: L.t * 0.8, life: 1, c0: col, glow: 1.4, a: 0.65, oneFrame: true });
        fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, gy - 0.01, L.pos.z], size: 3 * c.s, life: 1, c0: col, glow: 1, a: 0.3, oneFrame: true });
        const n = L.rate(10, dt);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          fx.add.spawn({ tex: ['star-01', 'cross'], at: [L.pos.x + Math.cos(a) * 0.8, 0.1, L.pos.z + Math.sin(a) * 0.8], vel: [0, rnd(1.2, 2.6), 0], life: [0.8, 1.5], size: [0.12, 0.22], c0: 0xffffff, c1: col, glow: 2.4, fi: 0.1, fp: 1 });
        }
      },
      () => p.stop(),
    );
  },

  upgrade_success(fx, c) {
    const s = c.s;
    const col = c.color(0xffd24a);
    flare(fx, up(c.p, 0.8), 4.4 * s, col, 0.36, 'star-05', 3, 1.4);
    flare(fx, up(c.p, 0.8), 2.6 * s, 0xffffff, 0.2, 'magic-flare-01', 3.2, -2);
    ringFlat(fx, gnd(c.p), 0.3, 3.4 * s, col, 0.6, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    ringFlat(fx, gnd(c.p), 0.2, 2.4 * s, 0xffffff, 0.9, { tex: 'magic-circle-01', glow: 1.6, a: 0.8, ease: 1, spin: 2 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 26, at: up(c.p, 0.3), jit: [0.8, 0.1, 0.8], area: 'box', vel: [0, 9, 0], speed: [0, 3], life: [0.5, 0.9], size: 0.1, asp: 1.8, c0: 0xffffff, c1: col, glow: 2.6, grav: -2, drag: 0.8, fi: 0, fp: 1 });
    motes(fx, up(c.p, 0.6), { n: 22, r: [1.1, 0.5, 1.1], area: 'box', c0: 0xffffff, c1: col, rise: 2.6, life: [0.7, 1.5], size: [0.14, 0.3] });
    const h = fx.pillar(gnd(c.p), col, 8 * s, 0.6 * s, 0.7, { rise: true, fadeIn: 0.1, hot: 0.15, alpha: 0.75 });
    fx.light(up(c.p, 1.2), col, 100, 0.6, 13);
    return h;
  },

  upgrade_fail(fx, c) {
    const s = c.s;
    const col = c.color(0xff4a30);
    smoke(fx, up(c.p, 0.6), { n: 10, r: 0.5 * s, c0: 0x6a625c, c1: 0x1a1816, size: [0.7 * s, 1.2 * s], rise: 1.4, life: [0.8, 1.4], a: 0.7 });
    sparks(fx, up(c.p, 0.6), v3(0, -0.3, 0), { n: 14, c0: 0xffd0a0, c1: col, speed: [2, 6], cone: 1.6, size: 0.08, grav: 18 });
    ringFlat(fx, gnd(c.p), 0.3, 2.2 * s, col, 0.35, { glow: 1.4, a: 0.7 });
    flare(fx, up(c.p, 0.6), 1.8 * s, col, 0.16, 'soft', 1.8);
    debris(fx, up(c.p, 0.4), { n: 6, r: 0.3, c0: 0x6a625c, c1: 0x2a2622, size: [0.08, 0.16], up: 3 });
    fx.light(up(c.p, 1), col, 30, 0.2, 8);
    return DONE;
  },

  keystone_insert(fx, c) {
    const s = c.s;
    const col = c.color(0x7ab8ff);
    ringFlat(fx, gnd(c.p), 0.2, 3 * s, col, 1.0, { tex: 'magic-circle-02', glow: 1.8, a: 0.95, ease: 1, spin: -2.4 });
    ringFlat(fx, gnd(c.p), 0.3, 3.6 * s, 0xffffff, 0.45, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    flare(fx, up(c.p, 1), 3 * s, col, 0.3, 'magic-flare-02', 3, 1);
    sparks(fx, up(c.p, 1), null, { n: 16, c0: 0xffffff, c1: col, speed: [3, 8], size: 0.09, grav: 4 });
    motes(fx, up(c.p, 0.4), { n: 14, r: [0.8, 0.3, 0.8], area: 'box', c0: 0xffffff, c1: col, rise: 2.4, life: [0.7, 1.3] });
    fx.light(up(c.p, 1.2), col, 70, 0.5, 11);
    return DONE;
  },

  keystone_upgrade(fx, c) {
    const s = c.s;
    const col = c.color(0xffd24a);
    const g = gnd(c.p);
    const h = fx.pillar(g, col, 12 * s, 0.7 * s, 1.1, { rise: true, fadeIn: 0.2, hot: 0.15, alpha: 0.75 });
    ringFlat(fx, g, 0.3, 4 * s, col, 0.8, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    ringFlat(fx, g, 0.2, 2.8 * s, 0xffffff, 1.0, { tex: 'magic-circle-01', glow: 1.6, a: 0.85, ease: 1, spin: 2.2 });
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * TAU * 2;
      fx.after(k * 0.025, () =>
        fx.add.spawn({ tex: ['star-01', 'cross', 'flare-01'], at: [g.x + Math.cos(a) * 1.2 * s, 0.2, g.z + Math.sin(a) * 1.2 * s], vel: [-Math.sin(a) * 1.4, rnd(3, 5), Math.cos(a) * 1.4], life: [0.7, 1.2], size: [0.16, 0.3], c0: 0xffffff, c1: col, glow: 2.6, fi: 0.1, fp: 1 }),
      );
    }
    flare(fx, up(c.p, 1.4), 4.4 * s, col, 0.4, 'star-05', 3, 1);
    fx.light(up(c.p, 1.5), col, 100, 0.8, 14);
    return h;
  },
};
