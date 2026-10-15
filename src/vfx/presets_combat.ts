import * as THREE from 'three';
import type { VfxHandle } from './VFX';
import { DONE, TAU, debris, decal, dust, flames, flare, mix, motes, ringFlat, rnd, rot, smoke, sparks, v3, type Ctx, type Fx } from './Fx';

export type Preset = (fx: Fx, c: Ctx) => VfxHandle | void;

const _p = new THREE.Vector3();
const arr = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

/** point a little above `p` */
const up = (p: THREE.Vector3, h: number): THREE.Vector3 => _p.set(p.x, p.y + h, p.z).clone();

/** direction rotated around Y */
function rotY(d: THREE.Vector3, a: number): THREE.Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new THREE.Vector3(d.x * c + d.z * s, 0, -d.x * s + d.z * c);
}

/** Particles converging on a point (windups, charges). */
export function converge(fx: Fx, centre: THREE.Vector3, R: number, n: number, color: number, c1: number, life = 0.4, size = 0.16, tex: string[] = ['star-01', 'flare-01', 'cross']): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const e = (Math.random() - 0.3) * 1.1;
    const d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    const r = R * (0.7 + Math.random() * 0.4);
    const l = life * (0.8 + Math.random() * 0.4);
    fx.add.spawn({
      tex,
      at: [centre.x + d.x * r, centre.y + d.y * r, centre.z + d.z * r],
      vel: [(-d.x * r) / l, (-d.y * r) / l, (-d.z * r) / l],
      life: l,
      size: [size * 0.7, size * 1.3],
      grow: 0.3,
      c0: color,
      c1,
      glow: 2.4,
      fi: 0.25,
      fp: 0.6,
    });
  }
}

// ---------------------------------------------------------------------------

export const combatPresets: Record<string, Preset> = {
  hit_spark(fx, c) {
    const col = c.color(0xffd98a);
    const s = c.s;
    flare(fx, c.p, 1.35 * s, col, 0.13, 'star-05', 2.6);
    flare(fx, c.p, 0.8 * s, 0xffffff, 0.08, 'flare-01', 2.4);
    sparks(fx, c.p, c.hasDir ? c.dir3 : null, { n: 12, c0: 0xfff6d8, c1: col, size: 0.15 * s, len: 3, speed: [6 * s, 14 * s], life: [0.22, 0.5] });
    smoke(fx, c.p, { n: 1, r: 0.1, size: [0.4, 0.7], c0: 0x8c8478, c1: 0x4a463e, a: 0.3, life: [0.3, 0.5], rise: 0.6 });
    return DONE;
  },

  hit_blood(fx, c) {
    const s = c.s;
    const col = c.color(0xb01010);
    const dark = mix(col, 0x200000, 0.65);
    const d = c.hasDir ? c.dir3 : null;
    flare(fx, c.p, 1.0 * s, 0xff5030, 0.09, 'soft', 1.8);
    // mist
    fx.alpha.spawn({ tex: ['smoke-01', 'smoke-03'], n: 3, at: c.p, dir: d ?? undefined, cone: 0.7, speed: [0.5, 2.6], life: [0.3, 0.55], size: [0.5, 0.8], grow: 2.2, c0: col, c1: dark, a: 0.55, fp: 1.5, drag: 2.5 });
    // droplets: streak-stretched on the alpha layer (dark red, no glow)
    fx.alpha.spawn({ tex: 'drop', mode: 'stretch', n: 14, at: c.p, dir: d ?? undefined, cone: d ? 0.85 : Math.PI, speed: [4 * s, 10 * s], life: [0.35, 0.7], size: [0.11, 0.17], asp: 1.8, stretch: 0.06, c0: col, c1: dark, a: 1, grav: 20, drag: 0.8, fi: 0, fp: 3 });
    fx.alpha.spawn({ tex: 'px', n: 6, at: c.p, dir: d ?? undefined, cone: d ? 1.0 : Math.PI, speed: [2, 6], life: [0.3, 0.7], size: [0.08, 0.14], c0: col, c1: dark, grav: 18, bounce: 0.2, fi: 0, fp: 4 });
    // floor splats
    if (Math.random() < 0.8) {
      const dist = rnd(0.6, 1.9);
      const o = d ? v3(c.p.x + d.x * dist, 0, c.p.z + d.z * dist) : v3(c.p.x + rnd(-0.8, 0.8), 0, c.p.z + rnd(-0.8, 0.8));
      decal(fx, o, { tex: 'splat', size: rnd(0.6, 1.4) * s, c0: dark, c1: dark, a: 0.85, life: rnd(6, 10) });
    }
    return DONE;
  },

  hit_magic(fx, c) {
    const col = c.color(0xb070ff);
    const s = c.s;
    flare(fx, c.p, 1.7 * s, col, 0.15, 'magic-flare-02', 2.6);
    fx.add.spawn({ tex: 'ring-02', at: c.p, life: 0.26, size: 0.4 * s, size1: 2.6 * s, ease: 1, c0: 0xffffff, c1: col, glow: 2.2, fi: 0, fp: 1.3 });
    fx.add.spawn({ tex: ['star-01', 'star-03', 'cross'], n: 9, at: c.p, speed: [3, 8], life: [0.3, 0.6], size: [0.22, 0.42], grow: 0.3, c0: 0xffffff, c1: col, glow: 2.4, drag: 2.5, fi: 0, fp: 1, spin: [-4, 4] });
    fx.add.spawn({ tex: 'soft', n: 1, at: c.p, life: 0.22, size: 0.9 * s, grow: 1.5, c0: col, glow: 1.2, a: 0.4, fp: 2 });
    return DONE;
  },

  crit_burst(fx, c) {
    const col = c.color(0xffc830);
    const s = c.s;
    flare(fx, c.p, 2.6 * s, col, 0.24, 'star-05', 2.2, 2.5);
    flare(fx, c.p, 1.6 * s, 0xffffff, 0.14, 'magic-flare-01', 2.4, -3);
    fx.add.spawn({ tex: 'ring-04', at: c.p, life: 0.34, size: 0.5 * s, size1: 4.4 * s, ease: 2, c0: 0xffffff, c1: col, glow: 2.4, fi: 0, fp: 1.4 });
    // radial spokes
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 18, at: c.p, speed: [9 * s, 18 * s], life: [0.2, 0.38], size: 0.17, asp: 3, stretch: 0.06, c0: 0xffffff, c1: col, glow: 3, drag: 2, fi: 0, fp: 1 });
    sparks(fx, c.p, c.hasDir ? c.dir3 : null, { n: 14, c0: 0xffffff, c1: col, size: 0.16, len: 3, speed: [7, 16], grav: 14, life: [0.25, 0.55] });
    fx.add.spawn({ tex: 'star-02', n: 5, at: c.p, speed: [3, 8], life: [0.3, 0.6], size: [0.2, 0.4], c0: 0xffffff, c1: col, glow: 2.6, drag: 3, spin: [-6, 6], fi: 0, fp: 1 });
    fx.light(c.p, col, 38, 0.14, 8);
    return DONE;
  },

  block_spark(fx, c) {
    const col = c.color(0xaed6ff);
    const s = c.s;
    flare(fx, c.p, 1.7 * s, col, 0.11, 'star-03', 2.6);
    flare(fx, c.p, 0.9 * s, 0xffffff, 0.08, 'flare-01', 2.4);
    fx.add.spawn({ tex: 'ring-02', at: c.p, life: 0.2, size: 0.3 * s, size1: 2.0 * s, ease: 1, c0: 0xffffff, c1: col, glow: 2, fi: 0, fp: 1.2 });
    sparks(fx, c.p, c.hasDir ? c.dir3 : null, { n: 14, c0: 0xffffff, c1: col, size: 0.13 * s, len: 3, speed: [7, 15], cone: 0.7, grav: 12, life: [0.22, 0.5] });
    return DONE;
  },

  dodge_dust(fx, c) {
    const s = c.s;
    const g = v3(c.p.x, 0.1, c.p.z);
    dust(fx, g, { n: 9, r: 0.45 * s, speed: 3.2 * s, c0: 0xc8bca4, c1: 0x8a8170, size: [0.7, 1.2], a: 0.7, life: [0.5, 0.95] });
    // speed lines opposite to the roll direction
    const d = c.hasDir ? c.dir : v3(0, 0, 1);
    fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 5, at: [g.x, 0.5, g.z], jit: [0.3, 0.5, 0.3], area: 'box', vel: [-d.x * 7, 0, -d.z * 7], life: [0.14, 0.26], size: 0.12, asp: 2.2, stretch: 0.05, c0: 0xffffff, c1: 0xc9d8ff, glow: 1.2, a: 0.5, fi: 0, fp: 1 });
    return DONE;
  },

  death_poof(fx, c) {
    const s = c.s;
    // subtle kill puff: small, short, <= 40 % alpha, low over the ground so it never covers the player standing next to it
    const ctr = up(c.p, 0.4 * s);
    smoke(fx, ctr, { n: 6, r: 0.4 * s, c0: 0x8a8498, c1: 0x2c2a38, size: [0.6 * s, 0.9 * s], life: [0.45, 0.8], rise: 0.8, a: 0.35, spread: 0.6 });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 5, r: 0.4 * s, speed: 1.6 * s, size: [0.4, 0.6], a: 0.3 });
    flare(fx, ctr, 1.6 * s, 0xdfe8ff, 0.12, 'soft', 1.6);
    ringFlat(fx, c.p, 0.3, 1.8 * s, 0xb8d0ff, 0.3, { glow: 0.9, a: 0.25, tex: 'ring-02' });
    motes(fx, ctr, { n: 8, r: 0.5 * s, c0: 0xe0f0ff, c1: 0x88aaff, rise: 2.2, life: [0.9, 1.6], size: [0.14, 0.26], tex: ['star-01', 'flare-01'] });
    fx.alpha.spawn({ tex: 'wisp', n: 2, at: ctr, jit: 0.3, vel: [0, 1.6, 0], speed: [0, 0.4], life: [0.9, 1.4], size: 0.55 * s, asp: 1.6, c0: 0xcfe0ff, c1: 0x7088cc, a: 0.45, fi: 0.2, fp: 1.4 });
    return DONE;
  },

  death_bones(fx, c) {
    const s = c.s;
    const ctr = up(c.p, 0.9 * s);
    debris(fx, ctr, { n: 14, r: 0.3 * s, c0: 0xeee2c6, c1: 0xbfae8c, size: [0.14 * s, 0.3 * s], speed: [2.5, 6], up: 5.5, tex: ['bone', 'chunk', 'shard', 'bone'], life: [0.9, 1.6] });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 9, r: 0.5 * s, speed: 2.8 * s, c0: 0xb9ad98, c1: 0x7d7568, size: [0.6, 1.0], a: 0.55 });
    smoke(fx, ctr, { n: 4, r: 0.4 * s, c0: 0x8a8576, c1: 0x3a3830, size: [0.6, 1.0], life: [0.6, 1.0], rise: 1.2, a: 0.5 });
    flare(fx, ctr, 1.8 * s, 0xfff0d0, 0.12, 'star-05', 2.4);
    ringFlat(fx, c.p, 0.3, 2.0 * s, 0xe8dcc0, 0.4, { glow: 1, a: 0.5 });
    fx.add.spawn({ tex: 'skull', at: ctr, vel: [0, 1.6, 0], life: 0.9, size: [0.45 * s, 0.6 * s], c0: 0xdff2ff, c1: 0x7aa0d0, glow: 1.6, a: 0.7, fi: 0.15, fp: 1.3, rot: 0 });
    return DONE;
  },

  slash_arc(fx, c) {
    const s = c.s;
    const col = c.color(0xffe2b0);
    const d = c.hasDir ? c.dir : v3(0, 0, 1);
    const y = c.p.y < 0.4 ? c.p.y + 1.0 : c.p.y;
    const at: [number, number, number] = [c.p.x + d.x * 1.0 * s, y, c.p.z + d.z * 1.0 * s];
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at, rot: rot(d.x, d.z), size: 3.2 * s, asp: 0.95, size1: 4.2 * s, ease: 1, life: 0.22, c0: mix(col, 0xffffff, 0.6), c1: col, glow: 1.5, fi: 0, fp: 1.3 });
    fx.add.spawn({ tex: 'slash-01', mode: 'flat', at: [at[0] - d.x * 0.2, y - 0.05, at[2] - d.z * 0.2], rot: rot(d.x, d.z) + Math.PI, size: 3.4 * s, size1: 4.3 * s, ease: 1, life: 0.26, c0: col, c1: mix(col, 0xff8040, 0.5), glow: 1.1, a: 0.6, fi: 0, fp: 1.5 });
    for (let k = 0; k < 5; k++) {
      const a = -0.95 + (1.9 * k) / 4;
      const rd = rotY(d, a);
      const pos = v3(c.p.x + rd.x * 1.7 * s, y, c.p.z + rd.z * 1.7 * s);
      sparks(fx, pos, v3(rd.x, 0.15, rd.z), { n: 2, c0: 0xffffff, c1: col, size: 0.07 * s, speed: [3, 7], cone: 0.5, px: 0 });
    }
    return DONE;
  },

  slash_arc_big(fx, c) {
    const s = c.s;
    const col = c.color(0xffcf80);
    const d = c.hasDir ? c.dir : v3(0, 0, 1);
    const y = c.p.y < 0.4 ? c.p.y + 1.0 : c.p.y;
    const at: [number, number, number] = [c.p.x + d.x * 1.5 * s, y, c.p.z + d.z * 1.5 * s];
    const r = rot(d.x, d.z);
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at, rot: r, size: 5.2 * s, size1: 6.8 * s, ease: 1, life: 0.28, c0: mix(col, 0xffffff, 0.55), c1: col, glow: 1.6, fi: 0, fp: 1.3 });
    fx.add.spawn({ tex: 'slash-02', mode: 'flat', at: [at[0], y - 0.04, at[2]], rot: r + Math.PI, size: 5.6 * s, size1: 7.2 * s, ease: 1, life: 0.32, c0: col, c1: mix(col, 0xff5020, 0.6), glow: 1.2, a: 0.7, fi: 0, fp: 1.5 });
    fx.add.spawn({ tex: 'slash-01', mode: 'flat', at: [at[0] - d.x * 0.4, y - 0.08, at[2] - d.z * 0.4], rot: r + Math.PI, size: 6.4 * s, size1: 8 * s, ease: 1, life: 0.38, c0: mix(col, 0xff5020, 0.5), c1: 0x802010, glow: 0.9, a: 0.5, fi: 0, fp: 1.6 });
    for (let k = 0; k < 8; k++) {
      const a = -1.2 + (2.4 * k) / 7;
      const rd = rotY(d, a);
      sparks(fx, v3(c.p.x + rd.x * 2.4 * s, y, c.p.z + rd.z * 2.4 * s), v3(rd.x, 0.2, rd.z), { n: 2, c0: 0xffffff, c1: col, size: 0.09 * s, speed: [4, 10], cone: 0.5, px: 1 });
    }
    ringFlat(fx, c.p, 0.4, 2.8 * s, col, 0.35, { glow: 1.2, a: 0.5 });
    fx.light(up(c.p, 1), col, 40, 0.12, 8);
    return DONE;
  },

  spin_slash(fx, c) {
    const s = c.s;
    const col = c.color(0xffd8a0);
    const y = c.p.y < 0.4 ? c.p.y + 0.95 : c.p.y;
    for (let k = 0; k < 3; k++) {
      fx.add.spawn({ tex: 'slash-04', mode: 'flat', at: [c.p.x, y, c.p.z], rot: (k * TAU) / 3, spin: 17, size: 4.8 * s, asp: 1, size1: 5.4 * s, life: 0.42, c0: mix(col, 0xffffff, 0.5), c1: col, glow: 1.5, fi: 0, fp: 1.1, a: 0.9 });
      fx.add.spawn({ tex: 'slash-01', mode: 'flat', at: [c.p.x, y - 0.06, c.p.z], rot: (k * TAU) / 3 + 0.5, spin: 15, size: 5 * s, life: 0.46, c0: col, c1: mix(col, 0xff6020, 0.7), glow: 0.9, fi: 0, fp: 1.3, a: 0.55 });
    }
    ringFlat(fx, c.p, 0.6, 3.4 * s, col, 0.4, { tex: 'ring-04', glow: 1.3, a: 0.55 });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 8, r: 1.2 * s, speed: 3.4 * s, size: [0.5, 0.8], a: 0.4 });
    fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 10, at: [c.p.x, y, c.p.z], jit: [2, 0.4, 2], area: 'ring', vel: [0, 0, 0], radial: [-2, 2], life: [0.15, 0.3], size: 0.1, asp: 1.5, c0: 0xffffff, c1: col, glow: 1.6, a: 0.6, fi: 0, fp: 1 });
    return DONE;
  },

  ground_slam(fx, c) {
    const s = c.s;
    const col = c.color(0xffb060);
    const g = v3(c.p.x, 0.08, c.p.z);
    ringFlat(fx, g, 0.4, 4.4 * s, mix(col, 0xffffff, 0.5), 0.42, { tex: 'ring-02', glow: 1.5, a: 0.85 });
    ringFlat(fx, g, 0.3, 3.2 * s, col, 0.6, { tex: 'ring-01', glow: 0.9, a: 0.6 });
    fx.alpha.spawn({ tex: 'smoke-ring-01', mode: 'flat', at: [g.x, 0.15, g.z], size: 1.2 * s, size1: 8.5 * s, ease: 2, life: 0.85, c0: 0xb4a48c, c1: 0x6e6455, a: 0.65, fi: 0.02, fp: 1.4, rot: rnd(0, 6) });
    debris(fx, g, { n: 16, r: 0.8 * s, speed: [2.5 * s, 6.5 * s], up: 7, size: [0.12, 0.28], c0: 0x9a8a74, c1: 0x4a4034, life: [0.6, 1.3] });
    dust(fx, g, { n: 12, r: 1.2 * s, speed: 3.6 * s, size: [0.8, 1.4], a: 0.6 });
    smoke(fx, up(c.p, 0.5), { n: 5, r: 0.7 * s, c0: 0x8a8070, c1: 0x403a32, size: [0.8, 1.4], rise: 2.6, life: [0.7, 1.2], a: 0.55 });
    flare(fx, up(c.p, 0.5), 3.6 * s, col, 0.2, 'explosion-01', 2.4);
    decal(fx, g, { tex: 'crack', size: 5.2 * s, c0: 0x120d08, a: 0.9, life: 7, fp: 2 });
    decal(fx, g, { tex: 'explosion-02', size: 3.4 * s, c0: 0x2a2018, a: 0.45, life: 6 });
    fx.light(up(c.p, 1.2), col, 55, 0.22, 12);
    return DONE;
  },

  shockwave(fx, c) {
    const s = c.s;
    const col = c.color(0xcfe0ff);
    const g = v3(c.p.x, 0.1, c.p.z);
    ringFlat(fx, g, 0.3, 5.5 * s, col, 0.5, { tex: 'ring-02', glow: 1.4, a: 0.8 });
    ringFlat(fx, g, 0.2, 4 * s, mix(col, 0xffffff, 0.5), 0.34, { tex: 'ring-02', glow: 1.4, a: 0.8 });
    fx.add.spawn({ tex: 'ring-02', at: up(c.p, 0.9), life: 0.3, size: 0.5 * s, size1: 6 * s, ease: 2, c0: col, c1: col, glow: 1.2, a: 0.5, fi: 0, fp: 1.5 });
    flare(fx, up(c.p, 0.8), 2.2 * s, col, 0.12, 'soft', 1.4);
    dust(fx, g, { n: 4, r: 1 * s, speed: 4 * s, c0: 0xc8d4e8, c1: 0x8090a8, a: 0.25 });
    return DONE;
  },

  charge_trail(fx, c) {
    const col = c.color(0xffd870);
    return fx.loop(c, 0.45, (dt, L) => {
      if (!L.follow && c.hasDir) L.pos.addScaledVector(c.dir, 24 * dt);
      const back = L.speed > 1 ? L.vel.clone().setY(0).normalize().multiplyScalar(-1) : c.hasDir ? c.dir.clone().multiplyScalar(-1) : v3(0, 0, -1);
      const n = L.rate(70, dt);
      for (let i = 0; i < n; i++) {
        const y = rnd(0.2, 1.8);
        fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: [L.pos.x + rnd(-0.4, 0.4), L.pos.y + y, L.pos.z + rnd(-0.4, 0.4)], vel: [back.x * 9, 0, back.z * 9], life: [0.14, 0.26], size: 0.11, asp: 2.4, stretch: 0.06, c0: 0xffffff, c1: col, glow: 1.8, a: 0.7, fi: 0, fp: 1 });
      }
      const m = L.rate(28, dt);
      for (let i = 0; i < m; i++) {
        fx.add.spawn({ tex: 'glow', at: [L.pos.x + back.x * rnd(0.1, 0.7), L.pos.y + 1.1 + rnd(-0.4, 0.4), L.pos.z + back.z * rnd(0.1, 0.7)], life: [0.2, 0.35], size: [0.9, 1.3], grow: 0.4, c0: col, c1: mix(col, 0xffffff, 0.2), glow: 1.0, a: 0.35, fp: 1.2 });
      }
      dust(fx, v3(L.pos.x, 0.1, L.pos.z), { n: L.rate(22, dt), r: 0.4, speed: 1.2, c0: 0xb4a994, size: [0.4, 0.7], a: 0.4, life: [0.3, 0.6] });
    });
  },

  leap_land(fx, c) {
    const s = c.s;
    const g = v3(c.p.x, 0.08, c.p.z);
    ringFlat(fx, g, 0.3, 3.4 * s, 0xfff0d0, 0.36, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    fx.alpha.spawn({ tex: 'smoke-ring-01', mode: 'flat', at: [g.x, 0.15, g.z], size: 1 * s, size1: 6.2 * s, ease: 2, life: 0.7, c0: 0xb4a48c, c1: 0x6e6455, a: 0.6, fp: 1.4, rot: rnd(0, 6) });
    dust(fx, g, { n: 10, r: 0.8 * s, speed: 3 * s, size: [0.7, 1.2], a: 0.55 });
    debris(fx, g, { n: 9, r: 0.5 * s, speed: [2, 5], up: 5.5, c0: 0x9a8a74, c1: 0x4a4034 });
    smoke(fx, up(c.p, 0.4), { n: 3, r: 0.5 * s, size: [0.7, 1.1], rise: 2, a: 0.45 });
    flare(fx, up(c.p, 0.4), 2.4 * s, 0xffd9a0, 0.14, 'explosion-01', 2);
    decal(fx, g, { tex: 'crack', size: 3.4 * s, c0: 0x120d08, a: 0.8, life: 5 });
    fx.light(up(c.p, 1), 0xffc080, 35, 0.16, 9);
    return DONE;
  },

  // ----------------------------------------------------------------- buffs & states
  buff_aura(fx, c) {
    const col = c.color(0xffd24a);
    const s = c.s;
    return fx.loop(c, 2.2, (dt, L) => {
      const R = Math.max(0.7, L.radius * 1.5) * s;
      if (L.rate(2.6, dt) > 0) {
        fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [L.pos.x, L.pos.y + 0.12, L.pos.z], vel: [0, 2.1, 0], size: R * 2.6, size1: R * 1.6, life: 0.95, c0: col, c1: mix(col, 0xffffff, 0.5), glow: 2, a: 0.85, fi: 0.05, fp: 1.4, rot: 0 });
      }
      const n = L.rate(16, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        fx.add.spawn({ tex: ['star-01', 'flare-01', 'cross'], at: [L.pos.x + Math.cos(a) * R, L.pos.y + 0.1, L.pos.z + Math.sin(a) * R], vel: [0, rnd(1.4, 2.6), 0], life: [0.7, 1.2], size: [0.12, 0.24], grow: 0.4, c0: 0xffffff, c1: col, glow: 2.4, fi: 0.15, fp: 1 });
      }
      fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, L.pos.y + 0.06, L.pos.z], life: 0.12, size: R * 2.4, c0: col, glow: 1, a: 0.35 + 0.1 * Math.sin(L.t * 8), fi: 0, fp: 0.2, oneFrame: true });
    });
  },

  enrage_aura(fx, c) {
    const col = c.color(0xff3010);
    const s = c.s;
    return fx.loop(c, 4, (dt, L) => {
      const R = Math.max(0.5, L.radius) * s;
      const n = L.rate(60, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = R * rnd(0.3, 1.2);
        fx.add.spawn({ tex: ['flame-01', 'flame-02', 'flame-03'], at: [L.pos.x + Math.cos(a) * r, L.pos.y + rnd(0.1, Math.max(1, L.height * 0.7)), L.pos.z + Math.sin(a) * r], vel: [0, rnd(1.2, 2.6), 0], life: [0.4, 0.8], size: [0.5, 0.9], grow: 0.3, c0: 0xffa040, c1: col, glow: 1.35, a: 0.75, fi: 0.1, fp: 1.1, spin: [-2, 2] });
      }
      const m = L.rate(10, dt);
      for (let i = 0; i < m; i++) {
        fx.add.spawn({ tex: 'streak', mode: 'stretch', at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0, 1), L.pos.z + rnd(-R, R)], vel: [0, rnd(3, 6), 0], life: [0.3, 0.6], size: 0.08, asp: 1.5, stretch: 0.05, c0: 0xffd080, c1: col, glow: 2, fi: 0, fp: 1 });
      }
      fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [L.pos.x, L.pos.y + 0.06, L.pos.z], size: R * 3.2, life: 0.12, c0: col, glow: 1.2, a: 0.4 + 0.15 * Math.sin(L.t * 10), fi: 0, fp: 0.2, oneFrame: true });
      smoke(fx, v3(L.pos.x, L.pos.y + L.height * 0.8, L.pos.z), { n: L.rate(4, dt), r: R * 0.5, c0: 0x4a2018, c1: 0x120808, size: [0.4, 0.7], life: [0.6, 1], rise: 1.6, a: 0.35 });
    });
  },

  shield_bubble(fx, c) {
    const col = c.color(0x7fd0ff);
    const h = fx.shell(c, 'shield', col, c.dur(3));
    ringFlat(fx, c.p, 0.4, 2.0 * c.s, col, 0.5, { glow: 1.6, a: 0.7 });
    flare(fx, up(c.p, 1), 2.2 * c.s, col, 0.2, 'soft', 1.8);
    return h;
  },

  stun_stars(fx, c) {
    return fx.loop(c, 3, (dt, L) => {
      const top = L.at(1.08);
      const R = Math.max(0.35, L.radius * 0.8);
      const n = 4;
      for (let k = 0; k < n; k++) {
        const a = L.t * 5.2 + (k * TAU) / n;
        fx.add.spawn({ tex: 'star-02', at: [top.x + Math.cos(a) * R, top.y + Math.sin(L.t * 3 + k) * 0.05, top.z + Math.sin(a) * R], life: 1, size: 0.46, c0: 0xffe65a, c1: 0xffe65a, glow: 2, a: 1, oneFrame: true });
        fx.add.spawn({ tex: 'flare-01', at: [top.x + Math.cos(a - 0.35) * R, top.y, top.z + Math.sin(a - 0.35) * R], life: 1, size: 0.24, c0: 0xffffff, glow: 2, a: 0.7, oneFrame: true });
      }
    });
  },

  stealth_smoke(fx, c) {
    const col = c.color(0x3a3150);
    const s = c.s;
    const ctr = up(c.p, 0.9);
    smoke(fx, ctr, { n: 12, r: 0.55 * s, c0: mix(col, 0x888090, 0.35), c1: mix(col, 0x000000, 0.6), size: [0.7 * s, 1.2 * s], life: [0.6, 1.2], rise: 0.6, a: 0.75, spread: 1.4 });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 8, r: 0.5 * s, speed: 2.4 * s, c0: mix(col, 0x888090, 0.3), c1: col, size: [0.6, 1.0], a: 0.55 });
    flare(fx, ctr, 1.6 * s, 0xb8a0ff, 0.12, 'soft', 1.6);
    return fx.loop(c, 3.2, (dt, L) => {
      const n = L.rate(7, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = Math.max(0.4, L.radius) * rnd(0.6, 1.3);
        fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], at: [L.pos.x + Math.cos(a) * r, L.pos.y + rnd(0.1, L.height * 0.9), L.pos.z + Math.sin(a) * r], vel: [0, 0.5, 0], life: [0.6, 1.0], size: [0.4, 0.7], grow: 1.8, c0: mix(col, 0x777088, 0.3), c1: col, a: 0.35, fi: 0.2, fp: 1.4 });
      }
    });
  },

  /** Zone-sized smoke cloud (Duman Bombası). Base radius 3 m x scale (scale = radius / 3); `duration` default 5 s. */
  smoke_zone(fx, c) {
    const col = c.color(0x3a3150);
    const s = c.s;
    const R = 3 * s;
    const dur = c.dur(5);
    const g = v3(c.p.x, 0.07, c.p.z);
    const lite = mix(col, 0x8a8298, 0.4);
    const dark = mix(col, 0x000000, 0.45);
    // landing pop: a quick shove of smoke outwards, then the cloud settles and lingers
    smoke(fx, up(c.p, 0.6), { n: 14, r: R * 0.35, c0: lite, c1: dark, size: [1.2 * s, 2.0 * s], life: [0.7, 1.3], rise: 0.8, a: 0.8, spread: R * 0.9 });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 14, r: R * 0.4, speed: R * 1.1, c0: lite, c1: col, size: [0.9, 1.5], a: 0.6, life: [0.6, 1.1] });
    flare(fx, up(c.p, 0.8), 2.4 * s, 0xb8a0ff, 0.14, 'soft', 1.6);
    ringFlat(fx, g, 0.4, R, 0xb8a0ff, 0.45, { glow: 0.9, a: 0.5 });
    decal(fx, g, { tex: 'aura-02', size: R * 2.3, c0: dark, a: 0.5, life: dur + 0.8, fp: 2 });
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [g.x, 0.06, g.z], size: R * 2.1, life: dur, c0: 0x6a50b0, glow: 0.7, a: 0.16, fi: 0.1, fp: 2 });
    return fx.loop(c, 5, (dt, L) => {
      if (L.far(R + 60)) return;
      const n = L.rate(16 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * R * 0.95;
        fx.alpha.spawn({ tex: ['smoke-01', 'smoke-02', 'smoke-04'], at: [L.pos.x + Math.cos(a) * r, rnd(0.2, 1.6), L.pos.z + Math.sin(a) * r], vel: [rnd(-0.25, 0.25), rnd(0.1, 0.45), rnd(-0.25, 0.25)], life: [1.3, 2.1], size: [1.5, 2.5], grow: 1.5, c0: lite, c1: dark, a: 0.42, fi: 0.25, fp: 1.4, spin: [-0.6, 0.6] });
      }
      const m = L.rate(5 * s, dt);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * R * 0.9;
        fx.add.spawn({ tex: ['star-01', 'cross', 'flare-01'], at: [L.pos.x + Math.cos(a) * r, rnd(0.3, 1.5), L.pos.z + Math.sin(a) * r], vel: [0, rnd(0.3, 0.9), 0], life: [0.6, 1.2], size: [0.1, 0.2], c0: 0xffffff, c1: 0xb8a0ff, glow: 2, a: 0.8, fi: 0.2, fp: 1 });
      }
    });
  },

  haste_trail(fx, c) {
    const col = c.color(0x9fe6ff);
    return fx.loop(c, 3, (dt, L) => {
      if (L.speed < 1.2) {
        if (L.rate(8, dt) > 0) fx.add.spawn({ tex: 'cross', at: [L.pos.x + rnd(-0.4, 0.4), L.pos.y + rnd(0.2, 1.6), L.pos.z + rnd(-0.4, 0.4)], life: [0.3, 0.6], size: 0.2, c0: 0xffffff, c1: col, glow: 2, a: 0.8, fi: 0.2, fp: 1 });
        return;
      }
      const back = L.vel.clone().setY(0).normalize().multiplyScalar(-1);
      const n = L.rate(34, dt);
      for (let i = 0; i < n; i++) {
        fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: [L.pos.x + rnd(-0.35, 0.35), L.pos.y + rnd(0.1, 1.9), L.pos.z + rnd(-0.35, 0.35)], vel: [back.x * rnd(3, 6), 0, back.z * rnd(3, 6)], life: [0.2, 0.35], size: 0.09, asp: 2.6, stretch: 0.07, c0: 0xffffff, c1: col, glow: 1.6, a: 0.65, fi: 0, fp: 1 });
      }
      fx.add.spawn({ tex: 'glow', at: [L.pos.x + back.x * 0.6, L.pos.y + 0.9, L.pos.z + back.z * 0.6], life: 0.2, size: 1.1, c0: col, glow: 0.8, a: 0.22, fp: 1, oneFrame: false, grow: 0.6 });
    });
  },

  war_cry(fx, c) {
    const col = c.color(0xff8a3a);
    const s = c.s;
    const g = v3(c.p.x, 0.1, c.p.z);
    for (let i = 0; i < 3; i++) {
      fx.after(i * 0.11, () => {
        ringFlat(fx, g, 0.4, (6.5 - i * 0.8) * s, mix(col, 0xfff0c0, i * 0.25), 0.5, { tex: 'ring-04', glow: 1.5 - i * 0.3, a: 0.9 - i * 0.15 });
        fx.add.spawn({ tex: 'ring-01', at: up(c.p, 1.1), life: 0.45, size: 0.6, size1: (6 - i) * s, ease: 2, c0: 0xffffff, c1: col, glow: 1.4, a: 0.7 - i * 0.15, fi: 0, fp: 1.4 });
      });
    }
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 18, at: up(c.p, 0.9), speed: [10, 18], life: [0.2, 0.38], size: 0.12, asp: 2.2, stretch: 0.05, c0: 0xffffff, c1: col, glow: 2.4, drag: 1.5, fi: 0, fp: 1, dir: [0, 0, 1], cone: Math.PI });
    flare(fx, up(c.p, 1.2), 3.4 * s, col, 0.22, 'star-05', 2.6, 1.5);
    dust(fx, g, { n: 10, r: 1 * s, speed: 5 * s, a: 0.4 });
    fx.light(up(c.p, 1.2), col, 50, 0.3, 12);
    return DONE;
  },

  level_up(fx, c) {
    const col = c.color(0xffd24a);
    const s = c.s;
    const g = v3(c.p.x, 0.08, c.p.z);
    // HDR clamp (bloom threshold 1.0, strength capped in Engine.ts): the glow stays under ~1.0 per channel so the column reads as
    // gold and does not white out the frame; the white cores are tinted gold and their additive alpha is kept low
    const h = fx.pillar(g, col, 10 * s, 0.75 * s, 2.2, { rise: true, follow: c.follow, fadeIn: 0.18, hot: 0.1, alpha: 0.5 });
    ringFlat(fx, g, 0.5, 4 * s, 0xfff2b0, 0.7, { tex: 'ring-04', glow: 0.9, a: 0.55 });
    ringFlat(fx, g, 0.3, 2.6 * s, col, 0.9, { tex: 'magic-circle-01', glow: 0.95, a: 0.55, ease: 1, spin: 1.5 });
    // sparkle ring at the feet: a third of the earlier count and size, low alpha, short life (~1.5 s in all)
    for (let i = 0; i < 2; i++) {
      fx.after(i * 0.22, () => {
        fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [g.x, 0.2, g.z], vel: [0, 1.6, 0], size: 1.8 * s, size1: 0.8 * s, life: 0.6, c0: 0xfff2b0, c1: col, glow: 0.7, a: 0.3, fi: 0.04, fp: 1.4 });
        const n = 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + i;
          fx.add.spawn({ tex: ['star-01', 'cross', 'flare-01'], at: [g.x + Math.cos(a) * 0.9 * s, 0.15, g.z + Math.sin(a) * 0.9 * s], vel: [-Math.sin(a) * 0.6, rnd(0.8, 1.6), Math.cos(a) * 0.6], life: [0.45, 0.7], size: [0.08, 0.14], grow: 0.1, c0: 0xfff2b0, c1: col, glow: 0.7, a: 0.5, fi: 0.1, fp: 1 });
        }
      });
    }
    flare(fx, up(c.p, 0.2), 1.6 * s, col, 0.3, 'star-05', 0.8, 1);
    fx.light(up(c.p, 0.6), col, 30, 0.9, 14);
    return h;
  },

  potion_drink(fx, c) {
    const col = c.color(0xff4a4a);
    const s = c.s;
    const ctr = up(c.p, 0.9);
    fx.alpha.spawn({ tex: 'bubble', n: 9, at: ctr, jit: [0.4, 0.8, 0.4], area: 'box', vel: [0, 1.5, 0], life: [0.7, 1.2], size: [0.1, 0.22], grow: 1.3, c0: mix(col, 0xffffff, 0.35), c1: col, a: 0.85, fi: 0.1, fp: 1.3 });
    motes(fx, ctr, { n: 8, r: [0.4, 0.8, 0.4], area: 'box', c0: 0xffffff, c1: col, rise: 1.4, life: [0.6, 1.1], size: [0.12, 0.22] });
    fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [c.p.x, c.p.y + 0.1, c.p.z], vel: [0, 1.8, 0], size: 1.9 * s, size1: 1.0 * s, life: 0.7, c0: col, c1: mix(col, 0xffffff, 0.5), glow: 1.8, a: 0.8, fp: 1.3 });
    flare(fx, ctr, 1.6 * s, col, 0.2, 'soft', 1.6);
    return DONE;
  },

  respawn(fx, c) {
    const col = c.color(0xfff2c0);
    const s = c.s;
    const g = v3(c.p.x, 0.08, c.p.z);
    const h = fx.pillar(g, col, 12 * s, 0.7 * s, 1.5, { rise: false, follow: c.follow, fadeIn: 0.12, hot: 0.1, alpha: 0.7 });
    ringFlat(fx, g, 0.4, 3.4 * s, col, 0.6, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    ringFlat(fx, g, 0.3, 2.4 * s, 0xffffff, 0.9, { tex: 'magic-circle-02', glow: 1.4, a: 0.7, ease: 1, spin: -1.2 });
    motes(fx, up(c.p, 1), { n: 24, r: [1.2, 1.0, 1.2], area: 'box', c0: 0xffffff, c1: col, rise: 1.6, life: [0.9, 1.6], size: [0.14, 0.3] });
    flare(fx, up(c.p, 1.2), 3.2 * s, col, 0.3, 'star-05', 2.6);
    fx.light(up(c.p, 1.5), col, 70, 0.8, 12);
    return h;
  },

  // ----------------------------------------------------------------- enemy / boss / affix
  enemy_cast_glow(fx, c) {
    const col = c.color(0xff5a28);
    const hot = mix(col, 0xffffff, 0.45);
    return fx.loop(
      c,
      1,
      (dt, L) => {
        const k = Math.min(1, L.t / Math.max(0.2, c.dur(1)));
        const ctr = L.at(0.62);
        const R = Math.max(0.5, L.radius) * (1.1 + 1.5 * (1 - k));
        const n = L.rate(18 + 40 * k, dt);
        for (let i = 0; i < n; i++) converge(fx, ctr, R, 1, hot, col, 0.35, 0.15);
        fx.add.spawn({ tex: 'glow', at: ctr, size: (0.8 + 1.4 * k) * Math.max(0.8, L.radius * 1.3), life: 1, c0: col, c1: hot, glow: 0.9 + k * 1.6, a: 0.3 + 0.4 * k, oneFrame: true });
        fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, L.pos.y + 0.05, L.pos.z], size: Math.max(1.4, L.radius * 3) * (0.8 + 0.4 * Math.sin(L.t * 14)), life: 1, c0: col, glow: 1, a: 0.3 + 0.35 * k, oneFrame: true });
      },
      () => {
        flare(fx, c.p, 1.5, hot, 0.12, 'star-05', 2.4);
      },
    );
  },

  boss_enrage(fx, c) {
    const col = c.color(0xff2a10);
    const s = c.s;
    const g = v3(c.p.x, 0.1, c.p.z);
    for (let i = 0; i < 3; i++) {
      fx.after(i * 0.14, () => ringFlat(fx, g, 0.6, (9 - i * 1.5) * s, mix(col, 0xffd080, i * 0.3), 0.7, { tex: 'ring-04', glow: 1.5, a: 0.9 }));
    }
    flare(fx, up(c.p, 1.8), 6 * s, col, 0.4, 'explosion-01', 2.6);
    flare(fx, up(c.p, 1.8), 4 * s, 0xffd8a0, 0.28, 'star-05', 3, 1.2);
    flames(fx, up(c.p, 0.4), { n: 22, r: 1.2 * s, size: [0.9, 1.5], rise: 3, life: [0.5, 1.0] });
    smoke(fx, up(c.p, 1), { n: 8, r: 1 * s, c0: 0x4a1a12, c1: 0x120606, size: [1, 1.8], rise: 2, a: 0.5 });
    sparks(fx, up(c.p, 1), null, { n: 24, c0: 0xffe0a0, c1: 0xff3010, speed: [6, 16], size: 0.12, grav: 10 });
    fx.light(up(c.p, 2), col, 120, 0.6, 20);
    fx.screenFlash('rgba(255,40,10,0.9)', 0.35, 0.7);
    return DONE;
  },

  boss_spawn(fx, c) {
    const col = c.color(0x9a3cff);
    const s = c.s;
    const g = v3(c.p.x, 0.07, c.p.z);
    ringFlat(fx, g, 0.5, 5 * s, col, 1.4, { tex: 'magic-circle-02', glow: 1.8, a: 0.95, ease: 1, spin: 1.1, fp: 1.2 });
    ringFlat(fx, g, 0.3, 7 * s, 0xe0b0ff, 0.8, { tex: 'ring-04', glow: 1.5, a: 0.8 });
    fx.pillar(g, col, 14 * s, 1.0 * s, 1.4, { rise: true, fadeIn: 0.2, hot: 0.1, alpha: 0.75 });
    smoke(fx, up(c.p, 0.6), { n: 14, r: 1.6 * s, c0: 0x4a3a6a, c1: 0x120c1e, size: [1.2, 2.2], rise: 1.6, life: [1, 1.8], a: 0.65, spread: 1.4 });
    dust(fx, g, { n: 12, r: 1.5 * s, speed: 4 * s, c0: 0x6a5a8a, c1: 0x2a2038, size: [1, 1.8], a: 0.5 });
    sparks(fx, up(c.p, 0.4), v3(0, 1, 0), { n: 22, c0: 0xffffff, c1: col, speed: [5, 14], cone: 0.7, size: 0.1, grav: 8 });
    flare(fx, up(c.p, 1.6), 5 * s, col, 0.34, 'magic-flare-02', 2.8, 0.6);
    fx.light(up(c.p, 2), col, 90, 0.9, 16);
    return DONE;
  },

  add_spawn(fx, c) {
    const col = c.color(0x9060e0);
    const s = c.s;
    const g = v3(c.p.x, 0.07, c.p.z);
    ringFlat(fx, g, 0.3, 1.9 * s, col, 0.8, { tex: 'magic-circle-01', glow: 1.6, a: 0.9, ease: 1, spin: 2 });
    ringFlat(fx, g, 0.2, 2.6 * s, 0xe0c8ff, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.7 });
    smoke(fx, up(c.p, 0.5), { n: 7, r: 0.5 * s, c0: 0x4a3a6a, c1: 0x141020, size: [0.6, 1.0], rise: 1.4, a: 0.6 });
    motes(fx, up(c.p, 0.4), { n: 7, r: 0.5 * s, c0: 0xffffff, c1: col, rise: 2.4, life: [0.5, 1] });
    flare(fx, up(c.p, 0.8), 2 * s, col, 0.2, 'soft', 2);
    return DONE;
  },

  telegraph_flash(fx, c) {
    const col = c.color(0xff5a28);
    const R = Math.max(1, c.s * 3);
    const g = v3(c.p.x, 0.1, c.p.z);
    fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [g.x, g.y, g.z], size: R * 2, size1: R * 2.3, life: 0.16, c0: 0xffffff, c1: col, glow: 2, a: 0.8, fi: 0, fp: 1.2 });
    ringFlat(fx, g, R * 0.8, R * 1.15, col, 0.22, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    return DONE;
  },

  bolster_burst(fx, c) {
    const col = c.color(0xff6a30);
    const s = c.s;
    fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [c.p.x, c.p.y + 0.15, c.p.z], vel: [0, 2.6, 0], size: 2.6 * s, size1: 1.2 * s, life: 0.8, c0: 0xffd0a0, c1: col, glow: 2.2, a: 0.9, fp: 1.3 });
    motes(fx, up(c.p, 0.6), { n: 10, r: 0.6 * s, c0: 0xffe0b0, c1: col, rise: 3, life: [0.5, 0.9], tex: ['star-04', 'cross'] });
    flare(fx, up(c.p, 1), 2.2 * s, col, 0.18, 'star-05', 2.6);
    flames(fx, up(c.p, 0.2), { n: 5, r: 0.4 * s, c0: 0xffb060, c1: 0xc01800, size: [0.4, 0.7], life: [0.3, 0.6] });
    return DONE;
  },

  sanguine_pool(fx, c) {
    const col = c.color(0x9a0c14);
    const s = c.s;
    const R = 2.4 * s;
    const g = v3(c.p.x, 0.05, c.p.z);
    const dur = c.dur(10);
    fx.decal.spawn({ tex: 'splat', mode: 'flat', at: [g.x, 0.04, g.z], size: R * 1.5, size1: R * 1.7, life: dur, c0: 0x3a0408, c1: 0x2a0306, a: 0.7, fi: 0.04, fp: 3, rot: rnd(0, 6), ease: 1 });
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [g.x, 0.06, g.z], size: R * 2.2, life: dur, c0: 0xc01820, glow: 0.7, a: 0.28, fi: 0.05, fp: 2.5 });
    return fx.loop(c, dur, (dt, L) => {
      const n = L.rate(5, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * R;
        const px = L.pos.x + Math.cos(a) * r;
        const pz = L.pos.z + Math.sin(a) * r;
        fx.alpha.spawn({ tex: 'bubble', at: [px, 0.12, pz], vel: [0, 0.5, 0], life: [0.5, 0.9], size: [0.12, 0.25], grow: 1.4, c0: 0xff5a5a, c1: col, a: 0.8, fi: 0.1, fp: 1.4 });
      }
      const m = L.rate(3, dt);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * R;
        fx.alpha.spawn({ tex: 'wisp', at: [L.pos.x + Math.cos(a) * r, 0.2, L.pos.z + Math.sin(a) * r], vel: [0, 1.4, 0], life: [0.8, 1.4], size: 0.5, asp: 1.6, c0: 0xff4a50, c1: col, a: 0.55, fi: 0.2, fp: 1.4 });
      }
    });
  },

  bursting_pop(fx, c) {
    const s = c.s;
    const col = 0xb01018;
    const ctr = up(c.p, 0.9);
    fx.alpha.spawn({ tex: 'drop', mode: 'stretch', n: 22, at: ctr, speed: [3, 10], life: [0.35, 0.75], size: [0.08, 0.14], asp: 1.3, stretch: 0.05, c0: col, c1: 0x300004, grav: 16, drag: 0.8, fi: 0, fp: 3 });
    fx.alpha.spawn({ tex: ['smoke-01', 'smoke-03'], n: 5, at: ctr, speed: [0.5, 3], life: [0.4, 0.7], size: [0.5, 0.9], grow: 2, c0: col, c1: 0x300004, a: 0.6, drag: 2.5, fp: 1.4 });
    ringFlat(fx, c.p, 0.3, 3 * s, 0xff3a3a, 0.4, { glow: 1.6, a: 0.8 });
    flare(fx, ctr, 2 * s, 0xff6060, 0.14, 'explosion-01', 2);
    for (let i = 0; i < 4; i++) decal(fx, v3(c.p.x + rnd(-1.5, 1.5), 0, c.p.z + rnd(-1.5, 1.5)), { tex: 'splat', size: rnd(0.5, 1.2) * s, c0: 0x4a0508, a: 0.85, life: rnd(6, 10) });
    return DONE;
  },

  explosive_orb(fx, c) {
    const col = c.color(0xff7a20);
    return fx.loop(c, 12, (dt, L) => {
      const ctr = L.follow ? L.at(0.5) : L.pos;
      const pulse = 1 + 0.18 * Math.sin(L.t * 12);
      fx.add.spawn({ tex: 'glow', at: ctr, size: 0.95 * pulse, life: 1, c0: col, c1: 0xffd080, glow: 1.6, a: 0.8, oneFrame: true });
      fx.add.spawn({ tex: 'star-05', at: ctr, size: 0.5 * pulse, life: 1, c0: 0xffd070, c1: 0xffb050, glow: 1.8, a: 1, rot: L.t * 3, oneFrame: true });
      const n = L.rate(24, dt);
      for (let i = 0; i < n; i++) fx.add.spawn({ tex: 'streak', mode: 'stretch', at: ctr, speed: [1.5, 4], life: [0.2, 0.4], size: 0.07, asp: 1.2, c0: 0xffffff, c1: col, glow: 2.4, grav: 6, fi: 0, fp: 1 });
      flames(fx, ctr, { n: L.rate(10, dt), r: 0.12, c0: 0xffd080, c1: 0xd02a00, size: [0.35, 0.55], life: [0.25, 0.45], rise: 1 });
    });
  },

  explosive_orb_pop(fx, c) {
    const col = c.color(0xff7a20);
    const s = c.s;
    const ctr = up(c.p, 0.9);
    flare(fx, ctr, 4.4 * s, col, 0.24, 'explosion-01', 2.8);
    flare(fx, ctr, 2.6 * s, 0xffffff, 0.12, 'star-05', 3.2, 2);
    ringFlat(fx, c.p, 0.4, 4.6 * s, col, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    flames(fx, ctr, { n: 14, r: 0.6 * s, size: [0.8, 1.4], rise: 2.2, c0: 0xffe0a0, c1: 0xd02a00, life: [0.4, 0.8] });
    smoke(fx, ctr, { n: 6, r: 0.6 * s, size: [0.8, 1.3], rise: 1.6, a: 0.55 });
    sparks(fx, ctr, null, { n: 16, c0: 0xffffff, c1: col, speed: [6, 14], size: 0.1, grav: 14 });
    decal(fx, v3(c.p.x, 0, c.p.z), { tex: 'explosion-02', size: 3.2 * s, c0: 0x140c08, a: 0.7, life: 6 });
    fx.light(ctr, col, 90, 0.25, 14);
    return DONE;
  },

  volcanic_plume(fx, c) {
    const col = c.color(0xff6a1a);
    const s = c.s;
    const g = v3(c.p.x, 0.08, c.p.z);
    fx.add.spawn({ tex: 'burst-jet-01', at: [g.x, 2.6 * s, g.z], size: 3.4 * s, asp: 2.3, size1: 4.4 * s, life: 0.55, c0: 0xffe0a0, c1: col, glow: 2.2, a: 0.95, fi: 0.02, fp: 1.4 });
    fx.add.spawn({ tex: 'burst-jet-02', at: [g.x, 3.4 * s, g.z], size: 2 * s, asp: 3, life: 0.5, c0: 0xffffff, c1: 0xffc060, glow: 2.6, a: 0.9, fi: 0.02, fp: 1.5 });
    flames(fx, g, { n: 18, r: 0.7 * s, size: [0.9, 1.5], rise: 6, life: [0.4, 0.8], c0: 0xffe8a0, c1: 0xd02a00 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 18, at: g, jit: 0.6 * s, dir: [0, 1, 0], cone: 0.4, speed: [8, 15], life: [0.5, 1], size: 0.14, asp: 1.5, c0: 0xffffff, c1: col, glow: 2.4, grav: 18, fi: 0, fp: 1 });
    debris(fx, g, { n: 8, r: 0.5 * s, speed: [1, 3], up: 9, c0: 0xffb060, c1: 0x401408, size: [0.15, 0.3], life: [0.7, 1.3] });
    smoke(fx, up(c.p, 1.2), { n: 7, r: 0.6 * s, c0: 0x4a3028, c1: 0x120a08, size: [1, 1.8], rise: 4, a: 0.55 });
    ringFlat(fx, g, 0.3, 3.6 * s, col, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    decal(fx, g, { tex: 'explosion-02', size: 3.4 * s, c0: 0x140c08, a: 0.75, life: 7 });
    fx.light(up(c.p, 2), col, 80, 0.5, 14);
    return fx.loop(c, 2.4, () => {});
  },

  quaking_ring(fx, c) {
    const col = c.color(0xc89a60);
    const s = c.s;
    const R = Math.max(2, 5 * s);
    const g = v3(c.p.x, 0.08, c.p.z);
    ringFlat(fx, g, 0.4, R, col, 0.65, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    ringFlat(fx, g, 0.3, R * 0.75, 0xffe8c0, 0.45, { tex: 'ring-02', glow: 1.6, a: 0.8 });
    fx.alpha.spawn({ tex: 'smoke-ring-01', mode: 'flat', at: [g.x, 0.15, g.z], size: 1.2, size1: R * 2, ease: 2, life: 0.9, c0: 0xb09a7c, c1: 0x6a5e4c, a: 0.55, fp: 1.4, rot: rnd(0, 6) });
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.1, 0.1);
      const r = R * rnd(0.6, 0.95);
      debris(fx, v3(g.x + Math.cos(a) * r, 0.1, g.z + Math.sin(a) * r), { n: 1, r: 0.2, speed: [0.5, 1.5], up: rnd(3, 6), c0: 0x9a8a74, c1: 0x4a4034, size: [0.12, 0.26] });
    }
    dust(fx, g, { n: 12, r: R * 0.7, speed: 3, size: [0.8, 1.4], a: 0.4 });
    decal(fx, g, { tex: 'crack', size: R * 1.8, c0: 0x120d08, a: 0.8, life: 6 });
    fx.light(up(c.p, 1), col, 30, 0.2, 10);
    return DONE;
  },

  necrotic_hit(fx, c) {
    const col = c.color(0x7cff5a);
    const s = c.s;
    flare(fx, c.p, 1.1 * s, col, 0.14, 'soft', 2);
    fx.add.spawn({ tex: 'skull', at: up(c.p, 0.2), vel: [0, 1.8, 0], life: 0.9, size: [0.4 * s, 0.55 * s], c0: 0xd0ffc0, c1: col, glow: 1.8, a: 0.85, fi: 0.1, fp: 1.4, rot: 0 });
    fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], n: 4, at: c.p, speed: [0.5, 2], vel: [0, 0.8, 0], life: [0.5, 0.9], size: [0.5, 0.8], grow: 2, c0: 0x4a8a3a, c1: 0x0c1c08, a: 0.6, drag: 2, fp: 1.4 });
    fx.add.spawn({ tex: ['cross', 'star-01'], n: 6, at: c.p, speed: [1.5, 4], life: [0.4, 0.8], size: [0.12, 0.22], c0: 0xffffff, c1: col, glow: 2.2, drag: 2, grav: -1, fi: 0.1, fp: 1 });
    return DONE;
  },

  spiteful_shade(fx, c) {
    const col = c.color(0xa890ff);
    return fx.loop(c, 8, (dt, L) => {
      const ctr = L.at(0.5);
      fx.add.spawn({ tex: 'skull', at: [ctr.x, ctr.y + Math.sin(L.t * 3) * 0.1, ctr.z], size: 0.6, life: 1, c0: 0xe8e0ff, c1: col, glow: 1.2, a: 0.55 + 0.1 * Math.sin(L.t * 9), oneFrame: true });
      fx.add.spawn({ tex: 'glow', at: ctr, size: 1.6, life: 1, c0: col, glow: 0.8, a: 0.3, oneFrame: true });
      const n = L.rate(16, dt);
      for (let i = 0; i < n; i++) fx.alpha.spawn({ tex: 'wisp', at: [ctr.x + rnd(-0.2, 0.2), ctr.y + rnd(-0.3, 0.3), ctr.z + rnd(-0.2, 0.2)], vel: [rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3)], life: [0.5, 0.9], size: [0.4, 0.7], asp: 1.6, c0: 0xd8ccff, c1: 0x5a3ca0, a: 0.5, fi: 0.2, fp: 1.4 });
    });
  },

  storm_tornado(fx, c) {
    const col = c.color(0x9ab4d8);
    const s = c.s;
    const H = 7 * s;
    const R0 = 1.2 * s;
    const R1 = 3.2 * s;
    const g = v3(c.p.x, 0.06, c.p.z);
    const tinted = c.o.color !== undefined;
    const bloody = tinted && ((col >> 16) & 255) > 150 && (col & 255) < 100;
    if (!c.follow) fx.decal.spawn({ tex: 'twirl-01', mode: 'flat', at: [g.x, 0.05, g.z], size: R1 * 2.4, life: c.dur(6), c0: tinted ? mix(col, 0x000000, 0.55) : 0x6a7a90, a: 0.55, fi: 0.1, fp: 3, spin: 4.5, rot: 0 });
    let boltT = 0;
    return fx.loop(c, 6, (dt, L) => {
      const n = L.rate(120, dt);
      for (let i = 0; i < n; i++) {
        const hk = Math.random();
        const h = hk * H;
        const r = R0 + (R1 - R0) * hk;
        const a = Math.random() * TAU;
        const w = 6.5 - hk * 2.5;
        fx.alpha.spawn({ tex: ['smoke-03', 'smoke-01', 'debris-01'], at: [L.pos.x + Math.cos(a) * r, L.pos.y + h, L.pos.z + Math.sin(a) * r], vel: [-Math.sin(a) * w * r * 0.9, rnd(0.5, 2), Math.cos(a) * w * r * 0.9], life: [0.45, 0.85], size: [0.7 + hk * 1.2, 1.1 + hk * 1.6], grow: 1.3, c0: mix(col, 0xffffff, 0.2), c1: mix(col, 0x202838, 0.5), a: 0.5, fi: 0.15, fp: 1.4, drag: 0.4, spin: [-3, 3] });
      }
      const m = L.rate(40, dt);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * TAU;
        const r = R1 * rnd(0.6, 1.2);
        fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: [L.pos.x + Math.cos(a) * r, rnd(0.2, H * 0.6), L.pos.z + Math.sin(a) * r], vel: [-Math.sin(a) * 9, 0, Math.cos(a) * 9], life: [0.2, 0.4], size: 0.1, asp: 2.5, c0: 0xffffff, c1: col, glow: 1.3, a: 0.5, fi: 0, fp: 1 });
      }
      if (bloody) {
        // Kurt Kanı: flung blood droplets spiral out of the funnel
        const dn = L.rate(34, dt);
        for (let i = 0; i < dn; i++) {
          const hk = Math.random();
          const r = R0 + (R1 - R0) * hk;
          const a = Math.random() * TAU;
          const w = 6.5 - hk * 2.5;
          fx.alpha.spawn({ tex: 'drop', mode: 'stretch', at: [L.pos.x + Math.cos(a) * r, L.pos.y + hk * H, L.pos.z + Math.sin(a) * r], vel: [-Math.sin(a) * w * r * 1.1 + Math.cos(a) * 1.5, rnd(0, 2.2), Math.cos(a) * w * r * 1.1 + Math.sin(a) * 1.5], life: [0.35, 0.65], size: [0.09, 0.15], asp: 1.7, stretch: 0.05, c0: col, c1: mix(col, 0x200000, 0.65), a: 1, grav: 7, fi: 0, fp: 2 });
        }
      }
      dust(fx, v3(L.pos.x, 0.1, L.pos.z), { n: L.rate(30, dt), r: R1, speed: 1.5, size: [0.8, 1.4], a: 0.3 });
      boltT -= dt;
      if (boltT <= 0) {
        boltT = rnd(0.25, 0.7);
        const top = v3(L.pos.x + rnd(-0.8, 0.8), H, L.pos.z + rnd(-0.8, 0.8));
        const end = v3(L.pos.x + rnd(-R1, R1), 0.3, L.pos.z + rnd(-R1, R1));
        fx.lightning(top, end, tinted ? mix(col, 0xffffff, 0.35) : 0xcfe4ff, 0.22, 0.12, { segs: 7, amp: 0.7 });
        fx.light(v3(L.pos.x, 3, L.pos.z), tinted ? col : 0xaac4ff, 40, 0.1, 14);
      }
    });
  },

  inspiring_aura(fx, c) {
    const col = c.color(0xffe28a);
    return fx.loop(c, 4, (dt, L) => {
      const R = Math.max(0.8, L.radius * 1.7);
      if (L.rate(1.6, dt) > 0) fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [L.pos.x, L.pos.y + 0.1, L.pos.z], size: R * 2.6, size1: R * 3.4, life: 1, c0: col, c1: 0xffffff, glow: 1.4, a: 0.6, fp: 1.4, rot: 0 });
      const n = L.rate(12, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        fx.add.spawn({ tex: ['star-04', 'cross', 'star-01'], at: [L.pos.x + Math.cos(a) * R, L.pos.y + 0.1, L.pos.z + Math.sin(a) * R], vel: [0, rnd(1.2, 2.4), 0], life: [0.7, 1.3], size: [0.14, 0.26], grow: 0.4, c0: 0xffffff, c1: col, glow: 2.2, fi: 0.15, fp: 1 });
      }
      fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, L.pos.y + 0.05, L.pos.z], size: R * 2.6, life: 1, c0: col, glow: 0.9, a: 0.25, oneFrame: true });
    });
  },

  // ----------------------------------------------------------------- talent skill shapes (GDD_TALENTS §4.3, T19)
  // Form verbs of the Beceri Uzmanlıkları: small trails and rings built from existing sprites, 0.2–1.2 s each.
  // The skill behaviours spawn them at the cast / impact point (shape=split|orbit|return|echo|pull).
  shape_split(fx, c) {
    // the projectile breaks into three shards that fan out from the impact (Parçalanan Top, Üçlü Küre)
    const col = c.color(0xcfe8ff);
    const s = c.s;
    const p = up(c.p, 0.6);
    const base = c.hasDir ? Math.atan2(c.dir.x, c.dir.z) : 0;
    flare(fx, p, 1.2 * s, col, 0.12, 'star-05', 2.2);
    for (let i = 0; i < 3; i++) {
      const a = base + (i - 1) * 0.7 + rnd(-0.12, 0.12);
      fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: p, vel: [Math.sin(a) * 9 * s, 0, Math.cos(a) * 9 * s], life: [0.16, 0.3], size: 0.1 * s, asp: 2.6, stretch: 0.06, c0: 0xffffff, c1: col, glow: 1.8, a: 0.8, fi: 0, fp: 1 });
    }
    ringFlat(fx, v3(c.p.x, 0.1, c.p.z), 0.2, 1.3 * s, col, 0.22, { tex: 'ring-01', glow: 1.2, a: 0.6 });
    return DONE;
  },

  shape_orbit(fx, c) {
    // motes circle the caster or the impact point for the skill's duration (Dönen Alev, Dönen Bıçaklar)
    const col = c.color(0xc0a0ff);
    const s = c.s;
    return fx.loop(c, 1.2, (dt, L) => {
      const R = Math.max(0.6, L.radius * 1.1) * s;
      if (L.rate(2.5, dt) > 0) fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [L.pos.x, L.pos.y + 0.1, L.pos.z], size: R * 2, size1: R * 2.2, life: 0.35, c0: col, c1: col, glow: 1.2, a: 0.45, fi: 0, fp: 1.4, rot: 0 });
      const n = L.rate(24, dt);
      for (let i = 0; i < n; i++) {
        const a = L.t * 6.5 + i * 2.1;
        fx.add.spawn({ tex: ['star-01', 'flare-01'], at: [L.pos.x + Math.cos(a) * R, L.pos.y + 0.9, L.pos.z + Math.sin(a) * R], life: [0.14, 0.26], size: [0.12, 0.18], grow: 0.3, c0: 0xffffff, c1: col, glow: 2, a: 0.9, fi: 0, fp: 1 });
      }
    });
  },

  shape_return(fx, c) {
    // a thin trail flies back along the cast line toward the thrower (Geri Dönen Ok, Dönen Bıçaklar)
    const col = c.color(0xbfe8ff);
    const s = c.s;
    const back = c.hasDir ? c.dir.clone().multiplyScalar(-1) : v3(0, 0, -1);
    fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 5, at: up(c.p, 0.8), jit: 0.25, vel: [back.x * 12 * s, 0, back.z * 12 * s], life: [0.2, 0.36], size: 0.1 * s, asp: 2.4, stretch: 0.06, c0: 0xffffff, c1: col, glow: 1.6, a: 0.7, fi: 0, fp: 1 });
    ringFlat(fx, v3(c.p.x, 0.1, c.p.z), 0.2, 0.9 * s, col, 0.25, { tex: 'ring-04', glow: 1.2, a: 0.55 });
    return DONE;
  },

  shape_echo(fx, c) {
    // a second, fainter ring pulses from the same spot a moment later (Çifte Yarma, Yankılı Darbe)
    const col = c.color(0xbfe8ff);
    const s = c.s;
    const g = v3(c.p.x, 0.1, c.p.z);
    ringFlat(fx, g, 0.3, 2.2 * s, col, 0.28, { tex: 'ring-02', glow: 1.2, a: 0.55 });
    fx.after(0.3, () => ringFlat(fx, g, 0.25, 2.6 * s, mix(col, 0xffffff, 0.4), 0.3, { tex: 'ring-02', glow: 1.0, a: 0.35 }));
    return DONE;
  },

  shape_pull(fx, c) {
    // loose sparks converge on the pull centre while a ring shrinks into it (Çekim, Çekici Küre)
    const col = c.color(0xb070ff);
    const s = c.s;
    const g = v3(c.p.x, 0.1, c.p.z);
    converge(fx, up(c.p, 0.9), 2.4 * s, 14, col, 0xffffff, 0.3, 0.12);
    ringFlat(fx, g, 2.6 * s, 0.4 * s, col, 0.36, { tex: 'ring-04', glow: 1.3, a: 0.7 });
    return DONE;
  },
};
void arr;
