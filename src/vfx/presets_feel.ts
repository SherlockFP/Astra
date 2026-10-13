import * as THREE from 'three';
import { DONE, TAU, WHITE, debris, decal, dust, flare, mix, motes, ringFlat, rnd, rot, sparks, v3, type Ctx, type Fx } from './Fx';
import { converge, type Preset } from './presets_combat';

// ---------------------------------------------------------------------------------------------------------------------
// Combat-feel presets (GDD_V2 §3.11 feel table, §3.5 parry / riposte, §3.7 finisher, §3.8 weapon arts, §7.3 weakness) and
// the gather strikes (GDD_LIFE §1.6). Every id here is also listed in types/vfx.ts. Look: bright additive core + solid
// sprite debris, a few big shapes instead of many small ones (PSX budget). One-shots return DONE; loops return their handle.
// ---------------------------------------------------------------------------------------------------------------------

const GOLD = 0xffd060;
const GOLD_HOT = 0xfff0b0;
const ICE = 0x9fd8ff;

const up = (p: THREE.Vector3, h: number): THREE.Vector3 => new THREE.Vector3(p.x, p.y + h, p.z);
/** Horizontal facing of the hit / swing (defaults to +Z). */
const dirOf = (c: Ctx): THREE.Vector3 => (c.hasDir ? c.dir : v3(0, 0, 1));
/** Slash plane rotation for a flat sprite facing `d`. */
const slashRot = (d: THREE.Vector3): number => rot(d.x, d.z);

export const featPresets: Record<string, Preset> = {
  // ------------------------------------------------------------------------------------------------- hit feel
  heavy_hit_burst(fx, c) {
    const s = c.s;
    const col = c.color(0xffb050);
    const d = c.hasDir ? c.dir3 : null;
    flare(fx, c.p, 2.2 * s, col, 0.16, 'star-05', 2.6, 2);
    flare(fx, c.p, 1.1 * s, WHITE, 0.1, 'flare-01', 2.4);
    fx.add.spawn({ tex: 'ring-02', at: c.p, life: 0.24, size: 0.4 * s, size1: 3.6 * s, ease: 2, c0: WHITE, c1: col, glow: 2.0, fi: 0, fp: 1.3 });
    sparks(fx, c.p, d, { n: 16, c0: WHITE, c1: col, size: 0.16 * s, len: 3, speed: [7 * s, 16 * s], life: [0.25, 0.55] });
    debris(fx, c.p, { n: 5, r: 0.3 * s, c0: 0xb8a890, c1: 0x5a4a3a, size: [0.08, 0.14], speed: [1.5, 3.5], up: 3.5, life: [0.4, 0.8] });
    fx.light(c.p, col, 30, 0.1, 6);
    return DONE;
  },

  parry_flash(fx, c) {
    const s = c.s;
    const col = c.color(GOLD_HOT);
    const d = dirOf(c);
    // white-gold core flash, a spark ring that bursts in every direction, and a short streak along the blade
    flare(fx, c.p, 2.6 * s, WHITE, 0.14, 'star-05', 2.8, 2.5);
    flare(fx, c.p, 1.6 * s, col, 0.18, 'magic-flare-01', 2.4, -2);
    fx.add.spawn({ tex: 'ring-04', at: c.p, life: 0.2, size: 0.4 * s, size1: 3.2 * s, ease: 1, c0: WHITE, c1: col, glow: 2.4, fi: 0, fp: 1.2 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 14, at: c.p, speed: [6 * s, 10 * s], life: [0.14, 0.26], size: 0.09 * s, asp: 3, stretch: 0.05, c0: WHITE, c1: col, glow: 3, drag: 1.6, fi: 0, fp: 1 });
    sparks(fx, c.p, v3(d.x, 0.15, d.z), { n: 8, c0: WHITE, c1: col, size: 0.12 * s, len: 3, speed: [6 * s, 12 * s], cone: 0.6, life: [0.2, 0.42] });
    fx.light(c.p, col, 40, 0.1, 6);
    return DONE;
  },

  riposte_trail(fx, c) {
    const s = c.s;
    const col = c.color(GOLD);
    const d = dirOf(c);
    const y = c.p.y < 0.4 ? c.p.y + 1 : c.p.y;
    // fast golden crescent sweeping forward, with a hot streak trailing it
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at: [c.p.x + d.x * 0.6 * s, y, c.p.z + d.z * 0.6 * s], rot: slashRot(d), size: 3.4 * s, size1: 4.4 * s, ease: 1, life: 0.14, c0: WHITE, c1: col, glow: 2.2, fi: 0, fp: 1.2 });
    fx.add.spawn({ tex: 'slash-01', mode: 'flat', at: [c.p.x + d.x * 0.4 * s, y - 0.05, c.p.z + d.z * 0.4 * s], rot: slashRot(d) + Math.PI, size: 3.8 * s, size1: 4.8 * s, ease: 1, life: 0.2, c0: col, c1: mix(col, 0xff8020, 0.5), glow: 1.3, a: 0.7, fi: 0, fp: 1.4 });
    fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 8, at: [c.p.x, y, c.p.z], dir: [d.x, 0, d.z], cone: 0.35, speed: [9 * s, 15 * s], life: [0.12, 0.22], size: 0.1, asp: 3, stretch: 0.06, c0: WHITE, c1: col, glow: 2.6, fi: 0, fp: 1 });
    sparks(fx, v3(c.p.x + d.x * 1.6 * s, y, c.p.z + d.z * 1.6 * s), v3(d.x, 0.1, d.z), { n: 8, c0: WHITE, c1: col, size: 0.1 * s, speed: [6, 12], cone: 0.6, len: 3, px: 1 });
    return DONE;
  },

  guard_spark(fx, c) {
    const s = c.s;
    const col = c.color(ICE);
    const d = dirOf(c);
    flare(fx, c.p, 1.9 * s, col, 0.12, 'star-03', 2.6);
    flare(fx, c.p, 0.9 * s, WHITE, 0.08, 'flare-01', 2.4);
    // hex ripple on the shield plane the blow hit
    fx.add.spawn({ tex: 'hex', at: c.p, life: 0.22, size: 0.9 * s, size1: 2.2 * s, ease: 2, c0: col, c1: col, glow: 1.8, a: 0.8, fi: 0, fp: 1.4, rot: slashRot(d) });
    sparks(fx, c.p, c.hasDir ? c.dir3 : null, { n: 10, c0: WHITE, c1: col, size: 0.12 * s, len: 3, speed: [6 * s, 12 * s], cone: 0.7, grav: 10, life: [0.2, 0.4] });
    return DONE;
  },

  guard_break_shards(fx, c) {
    const s = c.s;
    const col = c.color(0xcfe8ff);
    flare(fx, c.p, 3.0 * s, WHITE, 0.2, 'star-05', 2.6, 2.2);
    fx.add.spawn({ tex: 'ring-02', at: c.p, life: 0.3, size: 0.6 * s, size1: 4.2 * s, ease: 2, c0: WHITE, c1: col, glow: 1.8, a: 0.8, fi: 0, fp: 1.3 });
    // solid glass-like shards bursting out, glints on top
    fx.alpha.spawn({ tex: ['shard', 'chunk'], n: 14, at: c.p, speed: [5 * s, 10 * s], cone: Math.PI, life: [0.45, 0.9], size: [0.14 * s, 0.26 * s], c0: WHITE, c1: col, grav: 14, bounce: 0.3, drag: 0.8, spin: [-10, 10], fi: 0, fp: 1 });
    fx.add.spawn({ tex: 'star-02', n: 6, at: c.p, speed: [3 * s, 6 * s], cone: Math.PI, life: [0.3, 0.5], size: [0.16, 0.26], c0: WHITE, c1: col, glow: 2.6, drag: 2, spin: [-6, 6], fi: 0, fp: 1 });
    motes(fx, up(c.p, 0.3), { n: 8, r: 0.6 * s, c0: WHITE, c1: col, rise: 1.2, life: [0.4, 0.8] });
    fx.light(c.p, col, 45, 0.14, 8);
    return DONE;
  },

  stance_break_shards(fx, c) {
    const s = c.s;
    const ice = c.color(0x7fd0ff);
    const ctr = up(c.p, 0.9 * s);
    // blue/white burst with cracking ice shards and a floor crack
    flare(fx, ctr, 3.2 * s, WHITE, 0.2, 'star-05', 2.8, 2.5);
    flare(fx, ctr, 2.0 * s, ice, 0.28, 'magic-flare-01', 2.4, -3);
    fx.add.spawn({ tex: 'ring-04', at: ctr, life: 0.36, size: 0.5 * s, size1: 5.2 * s, ease: 2, c0: WHITE, c1: ice, glow: 2.4, fi: 0, fp: 1.4 });
    fx.alpha.spawn({ tex: ['shard', 'chunk'], n: 16, at: ctr, speed: [4 * s, 9 * s], cone: Math.PI, life: [0.5, 1.0], size: [0.16 * s, 0.34 * s], c0: WHITE, c1: ice, grav: 12, bounce: 0.35, drag: 0.4, spin: [-12, 12], fi: 0, fp: 1, a: 1 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 18, at: ctr, speed: [9 * s, 18 * s], life: [0.2, 0.38], size: 0.15, asp: 3, stretch: 0.06, c0: WHITE, c1: ice, glow: 3, drag: 2, fi: 0, fp: 1 });
    decal(fx, c.p, { tex: 'crack', size: 2.6 * s, c0: 0x0a1624, c1: 0x1a2a40, a: 0.8, life: 4, fp: 2 });
    fx.light(ctr, ice, 50, 0.16, 9);
    return DONE;
  },

  crit_finisher_slash(fx, c) {
    const s = c.s;
    const col = c.color(GOLD);
    const d = dirOf(c);
    const r = slashRot(d);
    const y = c.p.y;
    // big red-gold crescent (two layers) + a hot core ring, then a screen flash
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at: [c.p.x - d.x * 0.3 * s, y, c.p.z - d.z * 0.3 * s], rot: r, size: 6.4 * s, size1: 8.2 * s, ease: 1, life: 0.34, c0: WHITE, c1: col, glow: 2.0, fi: 0, fp: 1.2 });
    fx.add.spawn({ tex: 'slash-02', mode: 'flat', at: [c.p.x, y - 0.05, c.p.z], rot: r + Math.PI, size: 7.2 * s, size1: 9 * s, ease: 1, life: 0.4, c0: col, c1: 0xff3010, glow: 1.4, a: 0.85, fi: 0, fp: 1.4 });
    fx.add.spawn({ tex: 'slash-01', mode: 'flat', at: [c.p.x + d.x * 0.2 * s, y + 0.05, c.p.z + d.z * 0.2 * s], rot: r + Math.PI * 0.5, size: 5.6 * s, size1: 7 * s, ease: 1, life: 0.36, c0: 0xff2a10, c1: 0x600000, glow: 0.8, a: 0.6, fi: 0, fp: 1.5 });
    ringFlat(fx, c.p, 0.4, 3.2 * s, GOLD, 0.35, { tex: 'ring-04', glow: 1.6, a: 0.8 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 22, at: c.p, speed: [10 * s, 20 * s], life: [0.2, 0.42], size: 0.16, asp: 3.2, stretch: 0.06, c0: WHITE, c1: col, glow: 3, drag: 2, fi: 0, fp: 1 });
    sparks(fx, c.p, d, { n: 18, c0: WHITE, c1: col, size: 0.18 * s, len: 3.2, speed: [8, 18], grav: 12, life: [0.3, 0.6] });
    flare(fx, c.p, 3.2 * s, col, 0.25, 'star-05', 2.4, 2.2);
    fx.light(up(c.p, 0.6), col, 60, 0.2, 10);
    fx.screenFlash('rgba(255,210,120,0.9)', 0.22, 0.28);
    return DONE;
  },

  interrupt_burst(fx, c) {
    const s = c.s;
    const col = c.color(0xfff0a0);
    flare(fx, c.p, 2.4 * s, col, 0.14, 'star-05', 2.6, 2);
    fx.add.spawn({ tex: 'ring-02', at: c.p, life: 0.2, size: 0.4 * s, size1: 3.0 * s, ease: 1, c0: WHITE, c1: col, glow: 2, fi: 0, fp: 1.2 });
    // four hard stop-lines around the target (Kes)
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + Math.PI / 4;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 1, at: [c.p.x + dx * 0.4 * s, c.p.y, c.p.z + dz * 0.4 * s], vel: [dx * 6 * s, 0, dz * 6 * s], life: [0.14, 0.22], size: 0.12, asp: 4, stretch: 0.05, c0: WHITE, c1: col, glow: 2.6, fi: 0, fp: 1 });
    }
    sparks(fx, c.p, null, { n: 10, c0: WHITE, c1: col, size: 0.12 * s, speed: [5, 10], grav: 8, life: [0.2, 0.45] });
    return DONE;
  },

  backstab_mark(fx, c) {
    const s = c.s;
    const col = c.color(0x7dff7a);
    const g = v3(c.p.x, 0.08, c.p.z);
    // green ground ring under the victim and a dagger-tip dropping into it
    ringFlat(fx, g, 0.3 * s, 1.6 * s, col, 0.45, { tex: 'ring-01', glow: 1.4, a: 0.9, ease: 1 });
    ringFlat(fx, g, 0.2 * s, 1.0 * s, WHITE, 0.25, { tex: 'ring-04', glow: 1.5, a: 0.7 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 3, at: [c.p.x, c.p.y + 2.2 * s, c.p.z], jit: 0.25, vel: [0, -18, 0], life: [0.12, 0.18], size: 0.12 * s, asp: 4, stretch: 0.05, c0: WHITE, c1: col, glow: 2.8, fi: 0, fp: 1 });
    flare(fx, c.p, 1.8 * s, col, 0.14, 'star-03', 2.4);
    return DONE;
  },

  weak_spark(fx, c) {
    const s = c.s;
    const col = c.color(0xc060ff);
    // violet spike and rising plus-marks: "weakness hit"
    flare(fx, c.p, 1.7 * s, col, 0.12, 'star-03', 2.6);
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 4, at: up(c.p, 0.8 * s), jit: 0.2, vel: [0, -6, 0], life: [0.12, 0.2], size: 0.1 * s, asp: 3.5, stretch: 0.05, c0: WHITE, c1: col, glow: 2.4, fi: 0, fp: 1 });
    motes(fx, c.p, { n: 6, r: 0.5 * s, c0: col, c1: 0x6a2ac0, rise: 1.4, life: [0.4, 0.7], size: [0.1, 0.16], glow: 2.2, tex: ['plus', 'cross'] });
    return DONE;
  },

  // ------------------------------------------------------------------------------------------------- charge & threat
  charge_glow(fx, c) {
    const s = c.s;
    const col = c.color(0xffc040);
    // follow-loop around the body: builds over 0.8 s, then holds until the release (refreshed by the caller)
    return fx.loop(c, 1.4, (dt, L) => {
      // L.scale follows the caller's refresh (SkillSystem raises it while LMB is held), so the aura grows with the charge
      const sc = L.scale;
      const k = Math.min(1, L.t / 0.8);
      const R = Math.max(0.45, L.radius * 0.9) * sc * (0.6 + 0.5 * k);
      const hot = mix(col, WHITE, 0.45 * k);
      const n = L.rate((8 + 26 * k) * sc, dt);
      for (let i = 0; i < n; i++) {
        const a = L.t * 5 + Math.random() * TAU;
        const y = rnd(0.1, Math.max(0.6, L.height * 0.85));
        fx.add.spawn({ tex: ['star-01', 'flare-01', 'cross'], at: [L.pos.x + Math.cos(a) * R, L.pos.y + y, L.pos.z + Math.sin(a) * R], vel: [0, rnd(0.6, 1.4), 0], life: [0.35, 0.6], size: [0.1 * sc, 0.2 * sc], grow: 0.4, c0: hot, c1: col, glow: 2.2, fi: 0.1, fp: 1 });
      }
      if (L.rate(2.2, dt) > 0) ringFlat(fx, L.pos, R * 0.5, R * 1.5, col, 0.35, { glow: 1.4, a: 0.25 + 0.5 * k });
      fx.add.spawn({ tex: 'aura-01', mode: 'flat', at: [L.pos.x, L.pos.y + 0.06, L.pos.z], life: 0.12, size: R * 2.4, c0: hot, glow: 1, a: 0.25 + 0.3 * k, fi: 0, fp: 0.2, oneFrame: true });
      if (L.rate(3, dt) > 0) flare(fx, L.at(0.6), 0.9 * s, hot, 0.08, 'soft', 1.6);
    });
  },

  charge_ring(fx, c) {
    const s = c.s;
    const col = c.color(GOLD);
    const g = v3(c.p.x, 0.08, c.p.z);
    // tier-2 "charged" ping: ground ring out, particles pulled in, then a bright flare at chest height
    ringFlat(fx, g, 0.4, 2.8 * s, col, 0.34, { tex: 'ring-02', glow: 1.8, a: 0.9, ease: 2 });
    ringFlat(fx, g, 0.3, 1.9 * s, WHITE, 0.24, { tex: 'ring-04', glow: 1.6, a: 0.8 });
    converge(fx, up(c.p, 1.0 * s), 1.6 * s, 14, col, WHITE, 0.26, 0.12);
    flare(fx, up(c.p, 1.0 * s), 2.4 * s, col, 0.2, 'magic-flare-02', 2.6);
    fx.light(up(c.p, 1), col, 42, 0.14, 8);
    return DONE;
  },

  run_slash_trail(fx, c) {
    const s = c.s;
    const col = c.color(0xfff0d0);
    const d = dirOf(c);
    const back = d.clone().multiplyScalar(-1);
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at: [c.p.x + d.x * 0.8 * s, c.p.y, c.p.z + d.z * 0.8 * s], rot: slashRot(d), size: 3.6 * s, size1: 4.6 * s, ease: 1, life: 0.2, c0: WHITE, c1: col, glow: 1.5, fi: 0, fp: 1.3 });
    // step-in trail that follows the runner for its short life
    return fx.loop(c, 0.45, (dt, L) => {
      const n = L.rate(26, dt);
      for (let i = 0; i < n; i++) {
        fx.add.spawn({ tex: 'trace-01', mode: 'stretch', at: [L.pos.x + rnd(-0.3, 0.3), L.pos.y + rnd(0.3, 1.0), L.pos.z + rnd(-0.3, 0.3)], vel: [back.x * 6, 0, back.z * 6], life: [0.12, 0.22], size: 0.09, asp: 2.2, stretch: 0.05, c0: WHITE, c1: col, glow: 1.6, a: 0.6, fi: 0, fp: 1 });
      }
      const m = L.rate(10, dt);
      for (let i = 0; i < m; i++) {
        fx.alpha.spawn({ tex: ['smoke-01', 'smoke-03'], at: [L.pos.x + back.x * rnd(0.2, 0.8), L.pos.y + 0.2, L.pos.z + back.z * rnd(0.2, 0.8)], vel: [0, 0.3, 0], life: [0.3, 0.55], size: [0.3, 0.5], grow: 1.8, c0: 0xb4a994, c1: 0x6e6455, a: 0.35, fi: 0.1, fp: 1.4 });
      }
    });
  },

  perilous_mark(fx, c) {
    const s = c.s;
    const col = c.color(0xff3a1a);
    // pulsing danger ring on the ground plus rising embers while the mark lasts
    return fx.loop(c, 1.5, (dt, L) => {
      const pulse = 0.5 + 0.5 * Math.sin(L.t * 9);
      const R = Math.max(0.8, L.radius * 1.2) * s;
      if (L.rate(4, dt) > 0) ringFlat(fx, L.pos, R * 0.7, R * (1 + 0.3 * pulse), col, 0.22, { glow: 1.5, a: 0.6 });
      const n = L.rate(7, dt);
      for (let i = 0; i < n; i++) {
        fx.add.spawn({ tex: ['flame-01', 'flame-02'], at: [L.pos.x + rnd(-R, R) * 0.8, L.pos.y + 0.1, L.pos.z + rnd(-R, R) * 0.8], vel: [0, rnd(1.2, 2.2), 0], life: [0.4, 0.7], size: [0.18 * s, 0.3 * s], grow: 0.3, c0: 0xffb040, c1: col, glow: 1.6, a: 0.8, fi: 0.1, fp: 1.2 });
      }
    });
  },

  // ------------------------------------------------------------------------------------------------- weapon arts (GDD_V2 §3.8)
  weapon_art_wa_rising_blade(fx, c) {
    const s = c.s;
    const col = c.color(0xbfe8ff);
    const d = dirOf(c);
    const tip = v3(c.p.x + d.x * 1.2 * s, c.p.y, c.p.z + d.z * 1.2 * s);
    fx.add.spawn({ tex: 'slash-04', mode: 'flat', at: [tip.x, c.p.y + 0.9, tip.z], rot: slashRot(d), size: 4.6 * s, size1: 6.2 * s, ease: 1, life: 0.3, c0: WHITE, c1: col, glow: 1.8, fi: 0, fp: 1.2 });
    fx.add.spawn({ tex: 'slash-02', mode: 'flat', at: [c.p.x + d.x * 0.6 * s, c.p.y + 0.6, c.p.z + d.z * 0.6 * s], rot: slashRot(d) + Math.PI, size: 5.2 * s, size1: 6.8 * s, ease: 1, life: 0.36, c0: col, c1: 0x3a7acc, glow: 1.2, a: 0.7, fi: 0, fp: 1.4 });
    fx.pillar(tip, col, 3.4 * s, 0.45 * s, 0.5, { fadeIn: 0.05 });
    sparks(fx, c.p, d, { n: 12, c0: WHITE, c1: col, size: 0.14 * s, speed: [6, 12], len: 3, life: [0.25, 0.5] });
    fx.light(up(c.p, 1), col, 36, 0.14, 8);
    return DONE;
  },

  weapon_art_wa_earthbreaker(fx, c) {
    const s = c.s;
    const col = c.color(0xffa040);
    const g = v3(c.p.x, 0.08, c.p.z);
    ringFlat(fx, g, 0.5, 5.0 * s, mix(col, WHITE, 0.4), 0.42, { tex: 'ring-02', glow: 1.5, a: 0.9 });
    fx.alpha.spawn({ tex: 'smoke-ring-01', mode: 'flat', at: [g.x, 0.15, g.z], size: 1.6 * s, size1: 8 * s, ease: 2, life: 0.8, c0: 0xb4a48c, c1: 0x6e6455, a: 0.6, fi: 0.02, fp: 1.4, rot: rnd(0, 6) });
    decal(fx, g, { tex: 'crack', size: 6 * s, c0: 0x120d08, a: 0.9, life: 8, fp: 2 });
    debris(fx, g, { n: 22, r: 1.0 * s, speed: [3 * s, 7 * s], up: 8, size: [0.14, 0.32], c0: 0x9a8a74, c1: 0x4a4034, life: [0.7, 1.5] });
    dust(fx, g, { n: 14, r: 1.4 * s, speed: 4 * s, size: [0.9, 1.5], a: 0.6 });
    flare(fx, up(c.p, 0.6), 3.6 * s, col, 0.2, 'explosion-01', 2.4);
    fx.light(up(c.p, 1.2), col, 60, 0.22, 12);
    return DONE;
  },

  weapon_art_wa_crushing_blow(fx, c) {
    const s = c.s;
    const col = c.color(0xffc040);
    flare(fx, c.p, 3.2 * s, col, 0.2, 'star-05', 2.4, 2.2);
    flare(fx, c.p, 1.6 * s, WHITE, 0.12, 'magic-flare-01', 2.4, -3);
    fx.add.spawn({ tex: 'ring-04', at: c.p, life: 0.3, size: 0.4 * s, size1: 4.0 * s, ease: 2, c0: WHITE, c1: col, glow: 2.2, fi: 0, fp: 1.3 });
    sparks(fx, c.p, c.hasDir ? c.dir3 : null, { n: 16, c0: WHITE, c1: col, size: 0.18 * s, len: 3, speed: [8 * s, 16 * s], life: [0.3, 0.6] });
    debris(fx, c.p, { n: 8, r: 0.4 * s, c0: 0xd0c0a0, c1: 0x6a5a40, size: [0.1, 0.2], speed: [2, 4], up: 4.5 });
    fx.light(c.p, col, 50, 0.14, 9);
    return DONE;
  },

  weapon_art_wa_starfall_beam(fx, c) {
    const s = c.s;
    const col = c.color(0xa0e0ff);
    // a beam column with stars raining down onto the target
    fx.pillar(c.p, col, 9 * s, 0.35 * s, 0.55, { fadeIn: 0.03 });
    fx.add.spawn({ tex: ['star-05', 'star-02'], n: 16, at: [c.p.x, c.p.y + 9 * s, c.p.z], jit: [0.8 * s, 0.2, 0.8 * s], area: 'box', vel: [0, -14, 0], life: [0.3, 0.55], size: [0.22 * s, 0.4 * s], grow: 0.3, c0: WHITE, c1: col, glow: 2.8, fi: 0, fp: 1 });
    flare(fx, up(c.p, 0.5), 3 * s, col, 0.25, 'star-05', 2.6, 2);
    ringFlat(fx, c.p, 0.3, 3.6 * s, col, 0.4, { tex: 'ring-02', glow: 1.6, a: 0.8 });
    fx.light(up(c.p, 2), col, 45, 0.25, 10);
    return DONE;
  },

  weapon_art_wa_twin_bolts(fx, c) {
    const s = c.s;
    const col = c.color(0xaed2ff);
    const d = dirOf(c);
    const side = v3(-d.z, 0, d.x);
    // two forked strikes from the sky, one each side of the aim line
    for (const k of [-1, 1]) {
      const base = v3(c.p.x + side.x * k * 0.7 * s, c.p.y, c.p.z + side.z * k * 0.7 * s);
      const top = v3(base.x, base.y + 8 * s, base.z);
      fx.lightning(top, base, col, 0.14 * s, 0.28, { segs: 9, amp: 0.6, branches: 1, glow: 2.4 });
      flare(fx, base, 1.8 * s, col, 0.14, 'magic-flare-01', 2.4);
      ringFlat(fx, base, 0.3, 1.8 * s, col, 0.25, { glow: 1.6, a: 0.7 });
    }
    fx.light(up(c.p, 1), col, 45, 0.16, 9);
    return DONE;
  },

  weapon_art_wa_flurry(fx, c) {
    const s = c.s;
    const col = c.color(0xe8f0ff);
    const d = dirOf(c);
    const side = v3(-d.z, 0, d.x);
    // six quick slash marks along a line, staggered
    for (let k = 0; k < 6; k++) {
      const off = (k - 2.5) * 0.35 * s;
      const at: [number, number, number] = [c.p.x + side.x * off + d.x * 0.3 * s, c.p.y + 0.4 + rnd(-0.2, 0.3), c.p.z + side.z * off + d.z * 0.3 * s];
      const r = slashRot(d) + rnd(-0.4, 0.4);
      fx.after(k * 0.07, () => {
        fx.add.spawn({ tex: 'slash-03', mode: 'flat', at, rot: r, size: 2.2 * s, size1: 2.8 * s, ease: 1, life: 0.12, c0: WHITE, c1: col, glow: 1.6, fi: 0, fp: 1.3 });
        sparks(fx, at, d, { n: 4, c0: WHITE, c1: col, size: 0.1 * s, speed: [5, 9], life: [0.15, 0.3], px: 0 });
      });
    }
    return DONE;
  },

  weapon_art_wa_piercing_bolt(fx, c) {
    const s = c.s;
    const col = c.color(0xffe08a);
    const d = dirOf(c);
    // a long thin lance of light along the aim, then an impact flash
    fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: 3, at: c.p, dir: [d.x, 0, d.z], cone: 0.04, speed: [34 * s, 42 * s], life: [0.2, 0.3], size: 0.22 * s, asp: 6, stretch: 0.14, c0: WHITE, c1: col, glow: 3, fi: 0, fp: 1 });
    fx.add.spawn({ tex: 'streak', mode: 'stretch', n: 2, at: c.p, dir: [d.x, 0, d.z], cone: 0.02, speed: [42, 46], life: [0.18, 0.26], size: 0.1, asp: 8, stretch: 0.2, c0: WHITE, c1: col, glow: 3.2, fi: 0, fp: 1 });
    flare(fx, c.p, 2.2 * s, col, 0.16, 'star-05', 2.6, 1.5);
    ringFlat(fx, c.p, 0.2, 1.6 * s, WHITE, 0.2, { tex: 'ring-04', glow: 1.6, a: 0.8 });
    sparks(fx, c.p, d, { n: 12, c0: WHITE, c1: col, size: 0.14 * s, speed: [7, 14], life: [0.2, 0.45] });
    return DONE;
  },

  weapon_art_wa_dawn_wave(fx, c) {
    const s = c.s;
    const col = c.color(GOLD_HOT);
    const g = v3(c.p.x, 0.1, c.p.z);
    // golden expanding wave with motes carried outward
    ringFlat(fx, g, 0.4, 4.8 * s, col, 0.5, { tex: 'ring-02', glow: 1.6, a: 0.75, ease: 1 });
    ringFlat(fx, g, 0.2, 3.2 * s, WHITE, 0.4, { tex: 'ring-04', glow: 1.4, a: 0.6 });
    fx.add.spawn({ tex: ['star-02', 'star-01', 'cross'], n: 16, at: c.p, area: 'disc', jit: 0.6, radial: [3 * s, 6 * s], life: [0.5, 0.9], size: [0.14, 0.26], grow: 0.3, c0: WHITE, c1: col, glow: 2.4, fi: 0.1, fp: 1 });
    flare(fx, up(c.p, 1.2), 2.8 * s, col, 0.25, 'magic-flare-02', 2.4);
    fx.light(up(c.p, 1.2), col, 44, 0.2, 10);
    return DONE;
  },

  weapon_art_wa_twin_vials(fx, c) {
    const s = c.s;
    const green = c.color(0x9fff6a);
    // two potion vials break on the target: green splash, gold motes, a splat on the ground
    fx.alpha.spawn({ tex: 'drop', n: 18, at: c.p, speed: [3 * s, 7 * s], cone: Math.PI, life: [0.3, 0.6], size: [0.1, 0.16], c0: green, c1: 0x3a8a20, grav: 16, bounce: 0.2, fi: 0, fp: 2 });
    decal(fx, c.p, { tex: 'splat', size: 1.8 * s, c0: 0x3a8a20, c1: 0x3a8a20, a: 0.8, life: 6 });
    flare(fx, up(c.p, 1), 2.2 * s, GOLD, 0.14, 'soft', 2);
    motes(fx, up(c.p, 0.8), { n: 8, r: 0.6 * s, c0: 0xffe9a0, c1: GOLD, rise: 1.6, life: [0.5, 1.0], size: [0.12, 0.22], glow: 2.4 });
    return DONE;
  },

  bastion_dome(fx, c) {
    const col = c.color(0xffd98a);
    // gold shield dome around the caster (shell helper) with a ring at the base
    const h = fx.shell(c, 'shield', col, c.dur(4));
    ringFlat(fx, c.p, 0.5, 3.0 * c.s, col, 0.5, { glow: 1.4, a: 0.7 });
    flare(fx, up(c.p, 1.2 * c.s), 2.4 * c.s, col, 0.2, 'soft', 1.8);
    return h;
  },

  // ------------------------------------------------------------------------------------------------- gather strikes (GDD_LIFE §1.6)
  wood_chips(fx, c) {
    const s = c.s;
    debris(fx, c.p, { n: 7, r: 0.25 * s, c0: 0xd9a86a, c1: 0x6a4a28, size: [0.07 * s, 0.13 * s], speed: [1.6 * s, 3.2 * s], up: 3.2, tex: ['chunk', 'px'], life: [0.45, 0.85] });
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 3, r: 0.25 * s, speed: 1.2 * s, c0: 0xb8a078, c1: 0x6e5a40, size: [0.25, 0.4], a: 0.35, life: [0.3, 0.5] });
    return DONE;
  },

  rock_chips(fx, c) {
    const s = c.s;
    debris(fx, c.p, { n: 8, r: 0.25 * s, c0: 0xb8b4aa, c1: 0x5a5650, size: [0.07 * s, 0.14 * s], speed: [1.8 * s, 3.6 * s], up: 3.6, tex: ['chunk', 'shard'], life: [0.5, 0.95] });
    flare(fx, c.p, 1.4 * s, WHITE, 0.08, 'star-03', 2.2);
    dust(fx, v3(c.p.x, 0.1, c.p.z), { n: 3, r: 0.25 * s, speed: 1.2 * s, c0: 0xa8a498, c1: 0x5a5650, size: [0.25, 0.4], a: 0.35, life: [0.3, 0.5] });
    return DONE;
  },

  leaf_burst(fx, c) {
    const s = c.s;
    motes(fx, up(c.p, 1.0 * s), { n: 10, r: 0.5 * s, c0: 0xc8f080, c1: 0x5a9a30, rise: 0.5, speed: 1.6, life: [0.6, 1.1], size: [0.12, 0.2], tex: ['cross', 'star-01'], glow: 1.2 });
    debris(fx, c.p, { n: 6, r: 0.3 * s, c0: 0x9ad050, c1: 0x3a6a20, size: [0.08, 0.14], speed: [1, 2.5], up: 2.5, tex: ['chunk'], life: [0.6, 1.1] });
    return DONE;
  },

  gather_sparkle(fx, c) {
    const s = c.s;
    flare(fx, up(c.p, 0.6), 1.6 * s, 0x9ff07a, 0.12, 'star-03', 2.4);
    motes(fx, up(c.p, 0.6), { n: 6, r: 0.4 * s, c0: WHITE, c1: 0x9ff07a, rise: 1.2, life: [0.5, 0.9], size: [0.1, 0.18], glow: 2.6, tex: ['star-01', 'cross'] });
    return DONE;
  },
};
