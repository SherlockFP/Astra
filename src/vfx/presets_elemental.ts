import * as THREE from 'three';
import { DONE, TAU, debris, decal, dust, flames, flare, mix, motes, ringFlat, rnd, smoke, sparks, v3, type Ctx, type Fx } from './Fx';
import type { Preset } from './presets_combat';

const up = (p: THREE.Vector3, h: number): THREE.Vector3 => new THREE.Vector3(p.x, p.y + h, p.z);
const gnd = (p: THREE.Vector3, y = 0.08): THREE.Vector3 => new THREE.Vector3(p.x, y, p.z);

/** Random point in a ground disc. */
function disc(cx: number, cz: number, R: number): [number, number] {
  const a = Math.random() * TAU;
  const r = Math.sqrt(Math.random()) * R;
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
}

export const elementalPresets: Record<string, Preset> = {
  // ------------------------------------------------------------------ FIRE
  fire_burst(fx, c) {
    const s = c.s;
    const col = c.color(0xff7a1a);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.7 : 0);
    flare(fx, ctr, 4.2 * s, col, 0.24, 'explosion-01', 2.8);
    flare(fx, ctr, 2.4 * s, 0xffffff, 0.13, 'star-05', 3.2, 2);
    flames(fx, ctr, { n: 12, r: 0.5 * s, size: [1.2 * s, 1.9 * s], rise: 1.4, spread: 2.8, c0: 0xffa83a, c1: mix(col, 0xb01800, 0.6), life: [0.35, 0.75], tex: ['fire-01', 'fire-02', 'flame-02'] });
    smoke(fx, ctr, { n: 5, r: 0.5 * s, c0: 0x3c3a38, c1: 0x0c0c0c, size: [0.9 * s, 1.5 * s], rise: 1.6, life: [0.8, 1.4], a: 0.55 });
    sparks(fx, ctr, null, { n: 16, c0: 0xffffff, c1: col, speed: [4, 12], size: 0.1 * s, grav: 12 });
    ringFlat(fx, gnd(c.p), 0.3, 3.4 * s, col, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    decal(fx, gnd(c.p), { tex: 'explosion-02', size: 2.4 * s, c0: 0x140c08, a: 0.6, life: 5 });
    fx.light(ctr, col, 85, 0.25, 13);
    return DONE;
  },

  fire_ground(fx, c) {
    const s = c.s;
    const R = 2.2 * s;
    const dur = c.dur(3.5);
    const g = gnd(c.p);
    decal(fx, g, { tex: 'explosion-02', size: R * 2.1, c0: 0x120a06, a: 0.7, life: dur + 3 });
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [g.x, 0.06, g.z], size: R * 2.2, life: dur, c0: 0xff4a10, glow: 0.8, a: 0.3, fi: 0.1, fp: 2.5 });
    let flick = 0;
    return fx.loop(c, 3.5, (dt, L) => {
      const n = L.rate(95 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.add.spawn({ tex: ['flame-tongue-01', 'flame-tongue-02', 'flame-01'], at: [x, 0.35 + rnd(0, 0.2), z], vel: [0, rnd(1.4, 2.8), 0], life: [0.4, 0.8], size: [0.55, 0.95], asp: 1.5, grow: 0.5, c0: 0xffa83a, c1: 0xd02a00, glow: 1.35, a: 0.7, fi: 0.1, fp: 1.1 });
      }
      const m = L.rate(10, dt);
      for (let i = 0; i < m; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.add.spawn({ tex: 'px', at: [x, 0.3, z], vel: [rnd(-0.5, 0.5), rnd(2, 4), rnd(-0.5, 0.5)], life: [0.6, 1.2], size: 0.07, c0: 0xffd060, c1: 0xff3000, glow: 2.4, grav: -0.5, fi: 0, fp: 1 });
      }
      smoke(fx, v3(L.pos.x, 0.8, L.pos.z), { n: L.rate(5, dt), r: R * 0.6, size: [0.7, 1.1], rise: 1.8, a: 0.35, life: [0.8, 1.3] });
      flick -= dt;
      if (flick <= 0) {
        flick = 0.14;
        fx.light(v3(L.pos.x, 1, L.pos.z), 0xff6a20, 26 * Math.min(1.6, s), 0.16, 9);
      }
    });
  },

  meteor_fall(fx, c) {
    const s = c.s;
    const fall = c.dur(0.9);
    const d = c.hasDir ? c.dir : v3(0.5, 0, 0.45).normalize();
    const start = new THREE.Vector3(c.p.x - d.x * 10, 26, c.p.z - d.z * 10);
    const end = c.p.clone();
    end.y = 0.2;
    const c2: Ctx = { ...c, p: start, follow: null };
    // warning glow on the ground
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [end.x, 0.07, end.z], size: 1, size1: 4.4 * s, life: fall, c0: 0xff4010, glow: 1, a: 0.5, fi: 0.1, fp: 0.4 });
    return fx.loop(
      c2,
      fall,
      (dt, L) => {
        const k = Math.min(1, L.t / fall);
        const kk = k * k * (0.6 + 0.4 * k);
        L.pos.lerpVectors(start, end, kk);
        const sz = 1.0 + 1.6 * k;
        fx.add.spawn({ tex: 'glow', at: L.pos, size: sz * 2.2 * s, life: 1, c0: 0xff7a20, c1: 0xffd080, glow: 1.4, a: 0.85, oneFrame: true });
        fx.add.spawn({ tex: 'fire-01', at: L.pos, size: sz * 1.5 * s, life: 1, c0: 0xffffff, c1: 0xffc060, glow: 1.35, a: 1, rot: L.t * 6, oneFrame: true });
        fx.add.spawn({ tex: 'star-05', at: L.pos, size: sz * 1.1 * s, life: 1, c0: 0xffffff, glow: 2.6, a: 0.9, rot: -L.t * 4, oneFrame: true });
        const n = L.rate(120, dt);
        for (let i = 0; i < n; i++) {
          fx.add.spawn({ tex: ['flame-01', 'flame-02', 'fire-02'], at: [L.pos.x + rnd(-0.4, 0.4), L.pos.y + rnd(-0.3, 0.3), L.pos.z + rnd(-0.4, 0.4)], vel: [d.x * -3, 3, d.z * -3], life: [0.4, 0.8], size: [0.9 * s, 1.5 * s], grow: 0.4, c0: 0xffa83a, c1: 0xc02000, glow: 1.35, a: 0.7, fi: 0.05, fp: 1.1, spin: [-2, 2] });
        }
        smoke(fx, L.pos, { n: L.rate(40, dt), r: 0.5, c0: 0x403836, c1: 0x0c0a0a, size: [1.0 * s, 1.6 * s], life: [0.6, 1.1], rise: 0.8, a: 0.55 });
        fx.add.spawn({ tex: 'streak', mode: 'stretch', at: L.pos, vel: [-d.x * 14, 8, -d.z * 14], n: L.rate(30, dt), jit: 0.3, life: [0.2, 0.4], size: 0.1, asp: 1.5, c0: 0xffffff, c1: 0xff7a20, glow: 2.4, grav: 6, fi: 0, fp: 1 });
      },
      () => {
        fx.spawnId('fire_burst', end, { scale: 1.9 * s });
        ringFlat(fx, gnd(end), 0.5, 7.5 * s, 0xffb060, 0.55, { tex: 'ring-04', glow: 1.5, a: 0.85 });
        ringFlat(fx, gnd(end), 0.4, 5.5 * s, 0xffffff, 0.38, { tex: 'ring-02', glow: 2.2, a: 0.9 });
        fx.alpha.spawn({ tex: 'smoke-ring-01', mode: 'flat', at: [end.x, 0.15, end.z], size: 1.5, size1: 11 * s, ease: 2, life: 1, c0: 0xa89078, c1: 0x5e5244, a: 0.6, rot: rnd(0, 6) });
        debris(fx, gnd(end), { n: 18, r: 1 * s, speed: [3, 8], up: 9, c0: 0xffa040, c1: 0x301408, life: [0.8, 1.6] });
        dust(fx, gnd(end), { n: 14, r: 1.6 * s, speed: 5 * s, size: [1.0, 1.8], a: 0.55 });
        decal(fx, gnd(end), { tex: 'explosion-02', size: 6 * s, c0: 0x0e0806, a: 0.8, life: 9 });
        decal(fx, gnd(end), { tex: 'crack', size: 6.5 * s, c0: 0x0a0604, a: 0.7, life: 8 });
        fx.light(up(end, 1.5), 0xff7a20, 90, 0.4, 18);
        fx.spawnId('fire_ground', end, { scale: 1.6 * s, duration: 3 });
      },
    );
  },

  burn_loop(fx, c) {
    return fx.loop(c, 4, (dt, L) => {
      const R = Math.max(0.35, L.radius * 0.9);
      const H = Math.max(1, L.height);
      const n = L.rate(62, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        fx.add.spawn({ tex: ['flame-01', 'flame-02', 'flame-tongue-01'], at: [L.pos.x + Math.cos(a) * R * rnd(0.3, 1), L.pos.y + rnd(0.1, H * 0.85), L.pos.z + Math.sin(a) * R * rnd(0.3, 1)], vel: [0, rnd(0.9, 2), 0], life: [0.3, 0.6], size: [0.6, 1.05], grow: 0.3, c0: 0xffa83a, c1: 0xd02a00, glow: 1.35, a: 0.8, fi: 0.1, fp: 1.1, spin: [-1.5, 1.5] });
      }
      const m = L.rate(8, dt);
      for (let i = 0; i < m; i++) fx.add.spawn({ tex: 'px', at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.4, H), L.pos.z + rnd(-R, R)], vel: [rnd(-0.3, 0.3), rnd(1.5, 3), rnd(-0.3, 0.3)], life: [0.5, 1.0], size: 0.06, c0: 0xffd060, c1: 0xff3000, glow: 2.4, fi: 0, fp: 1 });
      smoke(fx, v3(L.pos.x, L.pos.y + H * 0.9, L.pos.z), { n: L.rate(4, dt), r: R * 0.5, size: [0.4, 0.7], c0: 0x2a2624, c1: 0x0a0909, a: 0.35, life: [0.6, 1], rise: 1.4 });
    });
  },

  // ------------------------------------------------------------------ FROST
  frost_burst(fx, c) {
    const s = c.s;
    const col = c.color(0x8fdcff);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.7 : 0);
    flare(fx, ctr, 3 * s, col, 0.2, 'star-02', 2.8, 1);
    flare(fx, ctr, 2 * s, 0xffffff, 0.12, 'magic-flare-01', 3);
    fx.add.spawn({ tex: 'shard', n: 14, at: ctr, speed: [3.5, 9.5], life: [0.4, 0.8], size: [0.2 * s, 0.42 * s], asp: 1.5, c0: 0xffffff, c1: col, glow: 1.9, grav: 14, bounce: 0.3, drag: 0.5, spin: [-9, 9], fi: 0, fp: 1.6 });
    fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], n: 4, at: ctr, speed: [0.5, 2.5], life: [0.5, 0.9], size: [0.9 * s, 1.5 * s], grow: 1.8, c0: 0xe8f8ff, c1: 0x7ab8e0, a: 0.5, drag: 2, fp: 1.5 });
    motes(fx, ctr, { n: 10, r: 0.6 * s, c0: 0xffffff, c1: col, rise: 0.6, speed: 3, life: [0.5, 1], tex: ['star-01', 'cross', 'star-03'] });
    ringFlat(fx, gnd(c.p), 0.3, 3 * s, col, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    decal(fx, gnd(c.p), { tex: 'aura-02', size: 2.6 * s, c0: 0xbfe8ff, a: 0.4, life: 2.5, fp: 1.5 });
    fx.light(ctr, col, 55, 0.22, 11);
    return DONE;
  },

  frost_nova(fx, c) {
    const s = c.s;
    const R = 5 * s;
    const col = c.color(0x8fdcff);
    const g = gnd(c.p);
    ringFlat(fx, g, 0.5, R, col, 0.5, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    ringFlat(fx, g, 0.4, R * 0.8, 0xffffff, 0.36, { tex: 'ring-02', glow: 2.4, a: 0.9 });
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [g.x, 0.09, g.z], size: 1, size1: R * 2.1, ease: 2, life: 0.6, c0: mix(col, 0xffffff, 0.3), c1: col, glow: 0.8, a: 0.45, fi: 0, fp: 1.4 });
    // ice spikes along the wave
    const n = Math.round(22 * s);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.1, 0.1);
      const t = R * rnd(0.55, 1);
      fx.after((t / R) * 0.18, () => {
        const x = g.x + Math.cos(a) * t;
        const z = g.z + Math.sin(a) * t;
        fx.add.spawn({ tex: 'shard', at: [x, 0.5, z], vel: [0, 4, 0], life: [0.4, 0.7], size: [0.5, 0.9], asp: 2, grow: 0.5, c0: 0xffffff, c1: col, glow: 1.8, grav: 8, a: 1, fi: 0, fp: 1.6, rot: rnd(-0.3, 0.3) });
        fx.add.spawn({ tex: 'star-01', at: [x, 0.6, z], life: [0.3, 0.5], size: 0.4, c0: 0xffffff, c1: col, glow: 2.4, fp: 1.4 });
      });
    }
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 28, at: [g.x, 0.4, g.z], jit: [0.5, 0.2, 0.5], area: 'box', radial: [10 * s, 17 * s], life: [0.2, 0.4], size: 0.12, asp: 1.8, c0: 0xffffff, c1: col, glow: 2.2, drag: 1.2, fi: 0, fp: 1 });
    fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], n: Math.round(14 * s), at: [g.x, 0.4, g.z], jit: [0.5, 0.1, 0.5], area: 'disc', radial: [5 * s, 8 * s], life: [0.6, 1.1], size: [1.0, 1.7], grow: 1.8, c0: 0xeaf8ff, c1: 0x80b8e0, a: 0.5, drag: 2.4, fp: 1.5, spin: [-1, 1] });
    flare(fx, up(c.p, 1), 3.4 * s, col, 0.22, 'star-02', 2.6, 1);
    decal(fx, g, { tex: 'aura-02', size: R * 2, c0: 0xbfe8ff, a: 0.38, life: 3.5, fp: 1.5 });
    decal(fx, g, { tex: 'magic-circle-02', size: R * 1.4, c0: 0xe0f6ff, a: 0.5, life: 3, fp: 2 });
    fx.light(up(c.p, 1), col, 70, 0.35, 15);
    return DONE;
  },

  frost_ground(fx, c) {
    const s = c.s;
    const R = 2.4 * s;
    const col = c.color(0x9fe0ff);
    const dur = c.dur(4);
    const g = gnd(c.p);
    decal(fx, g, { tex: 'aura-02', size: R * 2.2, c0: 0xbfe8ff, a: 0.45, life: dur, fp: 2 });
    fx.add.spawn({ tex: 'magic-circle-02', mode: 'flat', at: [g.x, 0.07, g.z], size: R * 1.6, life: dur, c0: col, glow: 1.1, a: 0.5, spin: 0.5, fi: 0.1, fp: 2 });
    return fx.loop(c, 4, (dt, L) => {
      const n = L.rate(8 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], at: [x, 0.25, z], vel: [rnd(-0.2, 0.2), 0.5, rnd(-0.2, 0.2)], life: [0.8, 1.4], size: [0.9, 1.5], grow: 1.5, c0: 0xeaf8ff, c1: 0x80b8e0, a: 0.25, fi: 0.25, fp: 1.4 });
      }
      const m = L.rate(14 * s * s, dt);
      for (let i = 0; i < m; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.add.spawn({ tex: ['star-01', 'cross'], at: [x, rnd(0.1, 0.6), z], vel: [0, rnd(0.2, 0.7), 0], life: [0.4, 0.9], size: [0.14, 0.28], c0: 0xffffff, c1: col, glow: 2.4, fi: 0.3, fp: 1 });
      }
    });
  },

  freeze_loop(fx, c) {
    const col = c.color(0xa8e4ff);
    fx.shell(c, 'ice', col, c.dur(3));
    return fx.loop(c, 3, (dt, L) => {
      const R = Math.max(0.4, L.radius);
      const H = Math.max(1, L.height);
      const n = L.rate(12, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], at: [L.pos.x + Math.cos(a) * R, L.pos.y + rnd(0.1, H), L.pos.z + Math.sin(a) * R], vel: [0, -0.4, 0], life: [0.6, 1.0], size: [0.4, 0.7], grow: 1.6, c0: 0xeaf8ff, c1: 0x80b8e0, a: 0.3, fi: 0.2, fp: 1.4 });
      }
      const m = L.rate(14, dt);
      for (let i = 0; i < m; i++) fx.add.spawn({ tex: ['star-01', 'cross', 'star-03'], at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.1, H), L.pos.z + rnd(-R, R)], life: [0.3, 0.7], size: [0.12, 0.26], c0: 0xffffff, c1: col, glow: 2.6, fi: 0.3, fp: 1 });
    });
  },

  blizzard(fx, c) {
    const s = c.s;
    const R = 6 * s;
    const col = c.color(0xcfeeff);
    const dur = c.dur(5);
    decal(fx, gnd(c.p), { tex: 'aura-02', size: R * 2.1, c0: 0xbfe8ff, a: 0.16, life: dur, fp: 1.5 });
    let shardT = 0;
    return fx.loop(c, 5, (dt, L) => {
      const n = L.rate(150 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.alpha.spawn({ tex: 'px', at: [x, rnd(5, 9), z], vel: [-4.5, -9, -1.5], life: [0.6, 0.9], size: [0.12, 0.22], c0: 0xffffff, c1: 0xdaf0ff, a: 0.95, fi: 0, fp: 4 });
      }
      const m = L.rate(34 * s * s, dt);
      for (let i = 0; i < m; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: [x, rnd(2, 8), z], vel: [-9, -10, -3], life: [0.25, 0.45], size: 0.07, asp: 2.2, stretch: 0.04, c0: 0xffffff, c1: col, glow: 1.0, a: 0.45, fi: 0, fp: 1 });
      }
      const k = L.rate(9 * s * s, dt);
      for (let i = 0; i < k; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], at: [x, 0.5, z], vel: [-2.4, 0.2, -0.8], life: [1, 1.7], size: [2, 3.2], grow: 1.5, c0: 0xeaf8ff, c1: 0x80b8e0, a: 0.12, fi: 0.3, fp: 1.4 });
      }
      shardT -= dt;
      if (shardT <= 0) {
        shardT = rnd(0.12, 0.3) / Math.max(0.6, s);
        const [x, z] = disc(L.pos.x, L.pos.z, R * 0.9);
        fx.add.spawn({ tex: 'shard', at: [x, 10, z], vel: [0, -28, 0], life: 0.36, size: 0.55, asp: 2.2, c0: 0xffffff, c1: 0x8fdcff, glow: 2, a: 1, fi: 0, fp: 4, rot: 0 });
        fx.after(0.34, () => {
          const g = v3(x, 0.4, z);
          sparks(fx, g, v3(0, 1, 0), { n: 7, c0: 0xffffff, c1: 0x8fdcff, speed: [3, 7], cone: 0.9, size: 0.08, grav: 12, px: 2 });
          ringFlat(fx, gnd(g), 0.1, 1.1, 0x9fe0ff, 0.25, { glow: 1.6, a: 0.8 });
        });
      }
    });
  },

  // ------------------------------------------------------------------ LIGHTNING
  lightning_strike(fx, c) {
    const s = c.s;
    const col = c.color(0xb8d8ff);
    const top = v3(c.p.x + rnd(-1.5, 1.5), 32, c.p.z + rnd(-1.5, 1.5));
    const end = gnd(c.p, 0.1);
    fx.lightning(top, end, col, 0.7 * s, 0.34, { segs: 16, amp: 1.7, branches: 3 });
    fx.pillar(end, 0xcfe4ff, 32, 0.55 * s, 0.26, { rise: false, fadeIn: 0.0 });
    flare(fx, up(c.p, 0.5), 3.6 * s, col, 0.2, 'star-05', 2.6);
    flare(fx, up(c.p, 0.4), 2.4 * s, col, 0.28, 'magic-flare-02', 2.4);
    ringFlat(fx, end, 0.4, 4.2 * s, col, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    ringFlat(fx, end, 0.3, 2.8 * s, 0xffffff, 0.28, { tex: 'ring-02', glow: 2.6, a: 0.9 });
    sparks(fx, up(c.p, 0.3), null, { n: 22, c0: 0xffffff, c1: col, speed: [6, 16], size: 0.1, grav: 10, glow: 3 });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      const l = rnd(1.8, 3.6) * s;
      fx.lightning(v3(end.x, 0.2, end.z), v3(end.x + Math.cos(a) * l, 0.15, end.z + Math.sin(a) * l), col, 0.14, 0.2, { segs: 5, amp: 0.3 });
    }
    dust(fx, end, { n: 8, r: 0.8 * s, speed: 3 * s, c0: 0x9aa4b8, c1: 0x5a6070, size: [0.6, 1.0], a: 0.45 });
    decal(fx, end, { tex: 'explosion-02', size: 2.6 * s, c0: 0x10131c, a: 0.7, life: 6 });
    fx.light(up(c.p, 2), 0xaac8ff, 90, 0.2, 20);
    return DONE;
  },

  chain_lightning(fx, c) {
    const col = c.color(0xa8d0ff);
    const a = up(c.p, c.p.y < 0.4 ? 1.1 : 0);
    const b = c.target ? c.target.clone() : a.clone().addScaledVector(c.dir, 6);
    if (b.y < 0.4) b.y += 1.1;
    const h = fx.lightning(a, b, col, 0.3 * c.s, c.dur(0.3), { segs: 10, amp: 0.6, branches: 1, glow: 1.15 });
    flare(fx, a, 1.6 * c.s, col, 0.14, 'star-05', 3);
    flare(fx, b, 2.2 * c.s, 0xffffff, 0.18, 'magic-flare-02', 3);
    sparks(fx, b, null, { n: 10, c0: 0xffffff, c1: col, speed: [4, 10], size: 0.08, grav: 8, glow: 3 });
    fx.light(b, col, 55, 0.18, 10);
    return h;
  },

  shock_loop(fx, c) {
    const col = c.color(0xaed2ff);
    let t = 0;
    return fx.loop(c, 3, (dt, L) => {
      t -= dt;
      const R = Math.max(0.4, L.radius) * 1.5;
      const H = Math.max(1, L.height);
      if (t <= 0) {
        t = rnd(0.04, 0.11);
        const a1 = Math.random() * TAU;
        const a2 = a1 + rnd(-1.4, 1.4);
        const y1 = L.pos.y + rnd(0.2, H);
        fx.lightning(v3(L.pos.x + Math.cos(a1) * R, y1, L.pos.z + Math.sin(a1) * R), v3(L.pos.x + Math.cos(a2) * R * 1.2, y1 + rnd(-0.6, 0.6), L.pos.z + Math.sin(a2) * R * 1.2), col, 0.17, 0.09, { segs: 5, amp: 0.3 });
      }
      const m = L.rate(14, dt);
      for (let i = 0; i < m; i++) fx.add.spawn({ tex: ['cross', 'star-03'], at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.2, H), L.pos.z + rnd(-R, R)], life: [0.1, 0.25], size: [0.16, 0.3], c0: 0xffffff, c1: col, glow: 3, fi: 0, fp: 1, rot: [0, 3] });
    });
  },

  // ------------------------------------------------------------------ SHADOW
  shadow_burst(fx, c) {
    const s = c.s;
    const col = c.color(0x9a4cff);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.7 : 0);
    flare(fx, ctr, 3 * s, col, 0.22, 'soft', 2.4);
    flare(fx, ctr, 1.8 * s, 0xe8d0ff, 0.12, 'magic-flare-02', 3, 1);
    fx.alpha.spawn({ tex: ['smoke-01', 'smoke-02', 'smoke-04'], n: 8, at: ctr, speed: [0.8, 3.2], life: [0.6, 1.1], size: [1.0 * s, 1.7 * s], grow: 2, c0: 0x3a2060, c1: 0x07030e, a: 0.75, drag: 2, fp: 1.4, spin: [-1, 1] });
    fx.add.spawn({ tex: 'wisp', n: 6, at: ctr, speed: [1, 4], vel: [0, 1.4, 0], life: [0.5, 0.9], size: [0.5 * s, 0.8 * s], asp: 1.6, c0: 0xe0c8ff, c1: col, glow: 1.6, a: 0.8, drag: 1.6, fi: 0.1, fp: 1.3 });
    sparks(fx, ctr, null, { n: 12, c0: 0xf0e0ff, c1: col, speed: [4, 10], size: 0.09, grav: 6 });
    ringFlat(fx, gnd(c.p), 0.3, 3 * s, col, 0.45, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    decal(fx, gnd(c.p), { tex: 'aura-01', size: 2.6 * s, c0: 0x120824, a: 0.6, life: 3.5, fp: 1.5 });
    fx.light(ctr, col, 50, 0.25, 11);
    return DONE;
  },

  shadow_ground(fx, c) {
    const s = c.s;
    const R = 2.4 * s;
    const col = c.color(0x8a40ff);
    const dur = c.dur(4);
    const g = gnd(c.p);
    decal(fx, g, { tex: 'aura-01', size: R * 2.3, c0: 0x0d0618, a: 0.8, life: dur, fp: 2 });
    fx.add.spawn({ tex: 'magic-circle-01', mode: 'flat', at: [g.x, 0.07, g.z], size: R * 1.6, life: dur, c0: col, glow: 1.3, a: 0.6, spin: -0.6, fi: 0.1, fp: 2 });
    return fx.loop(c, 4, (dt, L) => {
      const n = L.rate(10 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.add.spawn({ tex: 'wisp', at: [x, 0.15, z], vel: [0, rnd(0.8, 1.8), 0], life: [0.8, 1.4], size: [0.5, 0.9], asp: 1.6, c0: 0xe0c8ff, c1: col, glow: 1.3, a: 0.7, fi: 0.2, fp: 1.3 });
      }
      const m = L.rate(6 * s * s, dt);
      for (let i = 0; i < m; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], at: [x, 0.3, z], vel: [0, 0.6, 0], life: [0.8, 1.3], size: [0.8, 1.3], grow: 1.6, c0: 0x2a1648, c1: 0x07030e, a: 0.4, fi: 0.25, fp: 1.4 });
      }
    });
  },

  curse_loop(fx, c) {
    const col = c.color(0xa060ff);
    return fx.loop(c, 4, (dt, L) => {
      const top = L.at(1.12);
      fx.add.spawn({ tex: 'skull', at: [top.x, top.y + Math.sin(L.t * 3) * 0.08, top.z], size: 0.55, life: 1, c0: mix(col, 0xe8d8ff, 0.3), c1: col, glow: 1.1, a: 0.8 + 0.15 * Math.sin(L.t * 8), oneFrame: true });
      fx.add.spawn({ tex: 'magic-circle-02', mode: 'flat', at: [L.pos.x, L.pos.y + 0.07, L.pos.z], size: Math.max(1.6, L.radius * 3.4), life: 1, c0: col, glow: 1.2, a: 0.55, rot: L.t * 1.4, oneFrame: true });
      const n = L.rate(8, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const R = Math.max(0.4, L.radius);
        fx.add.spawn({ tex: 'wisp', at: [L.pos.x + Math.cos(a) * R, L.pos.y + rnd(0.1, 1.2), L.pos.z + Math.sin(a) * R], vel: [0, rnd(0.8, 1.6), 0], life: [0.6, 1.0], size: [0.35, 0.6], asp: 1.6, c0: 0xe0c8ff, c1: 0x6a30c0, glow: 1.2, a: 0.7, fi: 0.2, fp: 1.3 });
      }
    });
  },

  // ------------------------------------------------------------------ POISON
  poison_burst(fx, c) {
    const s = c.s;
    const col = c.color(0x6aff30);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.7 : 0);
    flare(fx, ctr, 2.6 * s, col, 0.18, 'soft', 2.2);
    fx.add.spawn({ tex: 'drop', mode: 'stretch', n: 16, at: ctr, speed: [3, 9], life: [0.35, 0.7], size: [0.08, 0.14], asp: 1.2, stretch: 0.045, c0: 0xc8ff90, c1: 0x30a010, glow: 1.5, grav: 14, drag: 0.8, fi: 0, fp: 2 });
    fx.alpha.spawn({ tex: ['smoke-01', 'smoke-02', 'smoke-03'], n: 6, at: ctr, speed: [0.6, 2.8], vel: [0, 0.8, 0], life: [0.7, 1.2], size: [0.9 * s, 1.5 * s], grow: 2, c0: 0x6ad030, c1: 0x153a0a, a: 0.6, drag: 1.8, fp: 1.4, spin: [-1, 1] });
    fx.alpha.spawn({ tex: 'bubble', n: 8, at: ctr, jit: 0.5 * s, vel: [0, 1.4, 0], speed: [0, 1.2], life: [0.5, 1], size: [0.12, 0.26], grow: 1.3, c0: 0xd0ff90, c1: 0x58d020, a: 0.85, fi: 0.1, fp: 1.4 });
    ringFlat(fx, gnd(c.p), 0.3, 2.8 * s, col, 0.4, { glow: 1.5, a: 0.8 });
    decal(fx, gnd(c.p), { tex: 'splat', size: 2.2 * s, c0: 0x2a7a10, a: 0.7, life: 7 });
    fx.light(ctr, col, 40, 0.2, 9);
    return DONE;
  },

  poison_cloud(fx, c) {
    const s = c.s;
    const R = 2.6 * s;
    const col = c.color(0x6ad030);
    const dur = c.dur(4.5);
    const g = gnd(c.p);
    decal(fx, g, { tex: 'aura-02', size: R * 2.2, c0: 0x2a7a10, a: 0.45, life: dur + 1, fp: 2 });
    decal(fx, g, { tex: 'splat', size: R * 1.2, c0: 0x2f8a12, a: 0.5, life: dur + 1, fp: 2 });
    fx.add.spawn({ tex: 'aura-02', mode: 'flat', at: [g.x, 0.06, g.z], size: R * 2.2, life: dur, c0: 0x58d020, glow: 0.8, a: 0.2, fi: 0.15, fp: 2 });
    return fx.loop(c, 4.5, (dt, L) => {
      const n = L.rate(16 * s * s, dt);
      for (let i = 0; i < n; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R * 0.9);
        fx.alpha.spawn({ tex: ['smoke-02', 'smoke-03', 'smoke-01'], at: [x, rnd(0.3, 1.2), z], vel: [rnd(-0.3, 0.3), rnd(0.15, 0.5), rnd(-0.3, 0.3)], life: [1.1, 1.9], size: [1.5, 2.4], grow: 1.5, c0: col, c1: 0x1c4a0e, a: 0.32, fi: 0.3, fp: 1.4, spin: [-0.6, 0.6] });
      }
      const m = L.rate(8 * s * s, dt);
      for (let i = 0; i < m; i++) {
        const [x, z] = disc(L.pos.x, L.pos.z, R);
        fx.alpha.spawn({ tex: 'bubble', at: [x, 0.2, z], vel: [0, rnd(0.6, 1.3), 0], life: [0.6, 1.1], size: [0.1, 0.22], grow: 1.3, c0: 0xd0ff90, c1: 0x58d020, a: 0.8, fi: 0.1, fp: 1.4 });
      }
    });
  },

  poison_loop(fx, c) {
    const col = c.color(0x6aff30);
    return fx.loop(c, 4, (dt, L) => {
      const R = Math.max(0.35, L.radius * 0.9);
      const H = Math.max(1, L.height);
      const n = L.rate(22, dt);
      for (let i = 0; i < n; i++) {
        fx.add.spawn({ tex: 'drop', mode: 'stretch', at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.5, H), L.pos.z + rnd(-R, R)], vel: [0, -2, 0], life: [0.3, 0.55], size: 0.07, asp: 1.4, stretch: 0.05, c0: 0xc8ff90, c1: 0x30a010, glow: 1.4, grav: 10, fi: 0, fp: 1 });
      }
      const m = L.rate(7, dt);
      for (let i = 0; i < m; i++) {
        fx.alpha.spawn({ tex: 'bubble', at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.1, H * 0.8), L.pos.z + rnd(-R, R)], vel: [0, rnd(0.6, 1.2), 0], life: [0.5, 0.9], size: [0.09, 0.2], grow: 1.3, c0: 0xd0ff90, c1: col, a: 0.8, fi: 0.1, fp: 1.4 });
      }
      fx.alpha.spawn({ tex: ['smoke-01', 'smoke-02'], at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.3, H), L.pos.z + rnd(-R, R)], vel: [0, 0.6, 0], life: [0.6, 1], size: [0.5, 0.8], grow: 1.6, c0: 0x6ad030, c1: 0x153a0a, a: 0.22, fi: 0.2, fp: 1.4, n: L.rate(5, dt) });
    });
  },

  // ------------------------------------------------------------------ HOLY / HEAL
  holy_burst(fx, c) {
    const s = c.s;
    const col = c.color(0xffe28a);
    const g = gnd(c.p);
    flare(fx, up(c.p, 1), 3.6 * s, col, 0.26, 'magic-flare-01', 3, 0.8);
    flare(fx, up(c.p, 1), 2.2 * s, 0xffffff, 0.16, 'star-05', 3.4, -2);
    fx.pillar(g, col, 7 * s, 0.42 * s, 0.55, { rise: true, fadeIn: 0.1 });
    ringFlat(fx, g, 0.3, 3.2 * s, col, 0.5, { tex: 'ring-04', glow: 1.5, a: 0.85 });
    ringFlat(fx, g, 0.2, 2.2 * s, 0xffffff, 0.8, { tex: 'magic-circle-01', glow: 1.5, a: 0.8, ease: 1, spin: 2 });
    motes(fx, up(c.p, 0.6), { n: 18, r: [0.9, 0.4, 0.9], area: 'box', c0: 0xffffff, c1: col, rise: 2.8, life: [0.6, 1.2], size: [0.14, 0.3], tex: ['star-01', 'cross', 'star-04'] });
    fx.light(up(c.p, 1.5), col, 80, 0.4, 13);
    return DONE;
  },

  heal_burst(fx, c) {
    const s = c.s;
    const col = c.color(0x6dffa0);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.9 : 0);
    fx.add.spawn({ tex: 'ring-02', mode: 'flat', at: [c.p.x, c.p.y < 0.4 ? 0.15 : c.p.y, c.p.z], vel: [0, 2.2, 0], size: 2.6 * s, size1: 1.2 * s, life: 0.8, c0: 0xd8ffe8, c1: col, glow: 2, a: 0.9, fp: 1.3 });
    fx.add.spawn({ tex: 'plus', n: 7, at: ctr, jit: [0.5 * s, 0.7, 0.5 * s], area: 'box', vel: [0, 1.8, 0], life: [0.7, 1.2], size: [0.18, 0.3], c0: 0xffffff, c1: col, glow: 2, a: 0.95, fi: 0.1, fp: 1.4 });
    motes(fx, ctr, { n: 12, r: [0.6 * s, 0.8, 0.6 * s], area: 'box', c0: 0xffffff, c1: col, rise: 1.8, life: [0.6, 1.2], size: [0.12, 0.24] });
    flare(fx, ctr, 2.4 * s, col, 0.22, 'soft', 1.8);
    fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [c.p.x, 0.08, c.p.z], size: 2.6 * s, life: 0.7, c0: col, glow: 1.2, a: 0.5, fp: 1.4 });
    fx.light(ctr, col, 35, 0.3, 9);
    return DONE;
  },

  heal_loop(fx, c) {
    const col = c.color(0x6dffa0);
    return fx.loop(c, 4, (dt, L) => {
      const R = Math.max(0.4, L.radius);
      const H = Math.max(1, L.height);
      const n = L.rate(6, dt);
      for (let i = 0; i < n; i++) fx.add.spawn({ tex: 'plus', at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0.1, 0.8), L.pos.z + rnd(-R, R)], vel: [0, rnd(0.9, 1.6), 0], life: [0.9, 1.4], size: [0.34, 0.5], c0: 0xffffff, c1: col, glow: 2, a: 0.95, fi: 0.15, fp: 1.4 });
      const m = L.rate(14, dt);
      for (let i = 0; i < m; i++) fx.add.spawn({ tex: ['star-01', 'flare-01'], at: [L.pos.x + rnd(-R, R), L.pos.y + rnd(0, H * 0.7), L.pos.z + rnd(-R, R)], vel: [0, rnd(0.5, 1.3), 0], life: [0.5, 1], size: [0.16, 0.3], c0: 0xffffff, c1: col, glow: 2.2, fi: 0.2, fp: 1 });
      fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, L.pos.y + 0.06, L.pos.z], size: Math.max(1.8, R * 3.6), life: 1, c0: col, glow: 1, a: 0.25 + 0.1 * Math.sin(L.t * 6), oneFrame: true });
    });
  },

  // ------------------------------------------------------------------ ARCANE
  arcane_burst(fx, c) {
    const s = c.s;
    const col = c.color(0xe060ff);
    const ctr = up(c.p, c.p.y < 0.4 ? 0.8 : 0);
    const g = gnd(c.p);
    flare(fx, ctr, 3.2 * s, col, 0.24, 'magic-flare-02', 3, 1.2);
    flare(fx, ctr, 1.8 * s, 0xffffff, 0.14, 'star-05', 3.4, -2);
    ringFlat(fx, g, 0.2, 3.4 * s, col, 0.8, { tex: 'magic-circle-01', glow: 1.8, a: 0.95, ease: 1, spin: 3 });
    ringFlat(fx, g, 0.3, 3.8 * s, 0xf0c8ff, 0.4, { tex: 'ring-04', glow: 1.5, a: 0.9 });
    fx.add.spawn({ tex: ['star-01', 'star-03', 'cross', 'star-04'], n: 14, at: ctr, speed: [3, 9], life: [0.35, 0.7], size: [0.16, 0.34], grow: 0.3, c0: 0xffffff, c1: col, glow: 2.8, drag: 2, spin: [-5, 5], fi: 0, fp: 1 });
    fx.add.spawn({ tex: 'ring-02', at: ctr, life: 0.3, size: 0.4 * s, size1: 2.6 * s, ease: 1, c0: 0xffffff, c1: col, glow: 2.2, fi: 0, fp: 1.3 });
    fx.light(ctr, col, 70, 0.3, 12);
    return DONE;
  },

  blink(fx, c) {
    const col = c.color(0xb070ff);
    const doBlink = (p: THREE.Vector3, arrive: boolean): void => {
      const ctr = up(p, 1);
      flare(fx, ctr, 2.8, col, 0.2, 'soft', 2.4);
      flare(fx, ctr, 1.8, 0xffffff, 0.12, 'star-05', 3, 2);
      fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 14, at: [p.x, p.y + 1, p.z], jit: [0.5, 0.9, 0.5], area: 'box', vel: [0, arrive ? -4 : 6, 0], life: [0.2, 0.4], size: 0.12, asp: 3, stretch: 0.05, c0: 0xffffff, c1: col, glow: 2, a: 0.8, fi: 0, fp: 1 });
      ringFlat(fx, gnd(p), 0.2, 2.2, col, 0.35, { glow: 2, a: 0.9 });
      fx.add.spawn({ tex: ['star-01', 'cross'], n: 10, at: ctr, jit: 0.5, speed: [0.5, 2.5], vel: [0, 1.5, 0], life: [0.4, 0.8], size: [0.12, 0.26], c0: 0xffffff, c1: col, glow: 2.6, fi: 0.1, fp: 1 });
      fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], n: 4, at: ctr, speed: [0.5, 2], life: [0.4, 0.7], size: [0.6, 1.0], grow: 2, c0: 0x6a40b0, c1: 0x1a0c30, a: 0.5, drag: 2, fp: 1.4 });
      fx.light(ctr, col, 45, 0.18, 9);
    };
    doBlink(c.p, false);
    if (c.target) fx.after(0.05, () => doBlink(c.target!, true));
    return DONE;
  },
};
