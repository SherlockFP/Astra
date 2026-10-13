/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2e, §g VFX). Mage kit presets: `arcane_missile` (the Füzeler body: violet core, white
 * rim and a short ribbon of puffs; a loop that follows the missile and is stopped on its end) and `arcane_missile_hit` (the
 * violet nova, sparks and flash of one landed missile). The other kit presets (prismatic_bolt, glacial_spike, shatter_burst)
 * come with their rows. Merged into VFX.ts PRESETS. OWNER: vfx-audio.
 */
import { DONE, WHITE, flare, type Fx } from './Fx';
import type { Preset } from './presets_combat';

const VIOLET = 0xb78cff;
/** Seconds between two trail puffs (the ribbon). */
const PUFF_EVERY = 0.03;

export const PRESETS_KIT_MAGE: Record<string, Preset> = {
  /** Arkan Füzeler body: additive violet core, a white rim ring and a 0.4 s ribbon. Loop: the caller stops it when the missile ends. */
  arcane_missile(fx: Fx, c) {
    const s = c.s;
    const col = c.color(VIOLET);
    let acc = 0;
    return fx.loop(c, 3.0, (dt, L) => {
      const p = L.pos;
      flare(fx, p, 0.9 * s, col, 0.06, 'soft', 2.2);
      fx.add.spawn({ tex: 'ring-02', at: p, life: 0.06, size: 0.5 * s, size1: 0.5 * s, ease: 1, c0: WHITE, c1: WHITE, glow: 1.2, fi: 0, fp: 1.1 });
      acc += dt;
      while (acc >= PUFF_EVERY) {
        acc -= PUFF_EVERY;
        fx.add.spawn({
          tex: ['star-01', 'cross'], n: 1, at: p, jit: 0.04 * s, vel: [0, 0.05, 0], life: [0.25, 0.4], size: [0.14 * s, 0.2 * s],
          c0: WHITE, c1: col, glow: 2.0, fi: 0, fp: 1, spin: [-3, 3],
        });
      }
    });
  },

  /** One landed Füzeler missile: violet nova ring, six sparks and a short flash (one-shot). */
  arcane_missile_hit(fx: Fx, c) {
    const s = c.s;
    const col = c.color(VIOLET);
    const p = c.p;
    fx.add.spawn({ tex: 'ring-02', at: p, life: 0.18, size: 0.3 * s, size1: 1.6 * s, ease: 2, c0: WHITE, c1: col, glow: 2.0, fi: 0, fp: 1.2 });
    flare(fx, p, 1.0 * s, col, 0.16, 'magic-flare-01', 2.4);
    fx.add.spawn({
      tex: ['star-02', 'cross'], n: 6, at: p, speed: [2 * s, 4 * s], cone: Math.PI, life: [0.2, 0.36], size: [0.08 * s, 0.14 * s],
      c0: WHITE, c1: col, glow: 2.2, drag: 1.2, grav: 3, fi: 0, fp: 1,
    });
    fx.light(p, col, 14, 0.08, 3);
    return DONE;
  },

  /** Buz Mızrağı shatter: a glass-shard burst with a short white flash (one-shot). */
  shatter_burst(fx: Fx, c) {
    const s = c.s;
    const col = c.color(0x9fe0ff);
    const p = c.p;
    flare(fx, p, 1.4 * s, WHITE, 0.12, 'magic-flare-01', 2.4);
    fx.add.spawn({
      tex: ['star-02', 'cross'], n: 8, at: p, speed: [3 * s, 6 * s], cone: Math.PI, life: [0.25, 0.45], size: [0.1 * s, 0.18 * s],
      c0: WHITE, c1: col, glow: 2.2, drag: 1, grav: 4, fi: 0, fp: 1,
    });
    fx.light(p, col, 18, 0.1, 4);
    return DONE;
  },
};
