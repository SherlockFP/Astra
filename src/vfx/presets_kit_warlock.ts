/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10e, §g VFX). Presets of the warlock kit: darkglare_eye (Karanlık Göz: a violet eye
 * opens over the target and a ring of smoke rises from it). Merged into VFX.ts PRESETS. OWNER: vfx-audio.
 */
import * as THREE from 'three';
import { TAU, rnd, type Ctx, type Fx } from './Fx';
import type { Preset } from './presets_combat';

/** Violet eye: a bright core puff, a ring of drifting puffs at its rim (the pulses of the eye are the beams from the combat side). */
const darkglareEye: Preset = (fx: Fx, c: Ctx) => {
  const a: THREE.Vector3 = c.p;
  const n = 8;
  fx.add.spawn({
    tex: ['smoke-01'], at: [a.x, a.y, a.z], vel: [0, 0, 0], life: 0.9, size: [0.9 * c.s, 1.2 * c.s], grow: 0.4,
    c0: 0x7a2aff, c1: 0x12002a, glow: 1.0, fi: 0.08, fp: 0.5,
  });
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU;
    fx.add.spawn({
      tex: ['smoke-04'], at: [a.x + Math.cos(ang) * 0.6 * c.s, a.y + rnd(-0.05, 0.05), a.z + Math.sin(ang) * 0.6 * c.s],
      vel: [Math.cos(ang) * 0.2, 0.35, Math.sin(ang) * 0.2], life: 0.7 + rnd(0, 0.3), size: [0.25 * c.s, 0.4 * c.s], grow: 0.7,
      c0: 0xb06bff, c1: 0x000000, glow: 0.7, fi: 0.05, fp: 0.5,
    });
  }
};

export const PRESETS_KIT_WARLOCK: Record<string, Preset> = {
  darkglare_eye: darkglareEye,
};
