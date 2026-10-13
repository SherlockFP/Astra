/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §g VFX). Presets of the rogue kit: shadowstep_streak (Gölge Adımı origin -> destination),
 * secret_clones (Gizli Teknik clones), link_tether (Simya Bağı line). Merged into VFX.ts PRESETS. OWNER: vfx-audio.
 */
import * as THREE from 'three';
import { TAU, rnd, type Ctx, type Fx } from './Fx';
import type { Preset } from './presets_combat';

/** Dark ribbon of puffs from the caster's origin (c.p) to the landing point (c.target), then fades (remote peers see the path). */
const shadowstepStreak: Preset = (fx: Fx, c: Ctx) => {
  const a = c.p;
  const b = c.target ?? new THREE.Vector3(a.x, a.y, a.z);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    fx.add.spawn({
      tex: ['smoke-01', 'smoke-04'],
      at: [a.x + (b.x - a.x) * t, a.y + 0.9 + Math.sin(t * Math.PI) * 0.3, a.z + (b.z - a.z) * t],
      vel: [0, 0.2, 0],
      life: 0.18 + rnd(0, 0.1),
      size: [0.35 * c.s, 0.55 * c.s],
      grow: 0.8,
      c0: 0x2a1f3d,
      c1: 0x000000,
      glow: 0.6,
      fi: 0.05,
      fp: 0.5,
    });
  }
};

/** Two translucent silhouettes peel off at ±120 deg from the target's centre (c.p) for the Gizli Teknik strikes. */
const secretClones: Preset = (fx: Fx, c: Ctx) => {
  for (const sign of [-1, 1]) {
    const a = (sign * 2 * Math.PI) / 3;
    const r = 1.4 * c.s;
    const x = c.p.x + Math.cos(a) * r;
    const z = c.p.z + Math.sin(a) * r;
    fx.add.spawn({
      tex: ['smoke-01', 'star-01'],
      at: [x, c.p.y + 1.0, z],
      vel: [-Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4],
      life: 0.45,
      size: [0.6 * c.s, 0.9 * c.s],
      grow: 0.5,
      c0: 0x6a5a88,
      c1: 0x120c1c,
      glow: 0.8,
      fi: 0.1,
      fp: 0.6,
    });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    fx.add.spawn({
      tex: ['star-01', 'flare-01'],
      at: [c.p.x + Math.cos(a) * 0.3, c.p.y + 1.0, c.p.z + Math.sin(a) * 0.3],
      vel: [Math.cos(a) * 2.2, 0.4, Math.sin(a) * 2.2],
      life: 0.35,
      size: [0.12, 0.2],
      grow: -0.2,
      c0: 0xc8b8ff,
      c1: 0x2a1f3d,
      glow: 2.0,
      fi: 0.05,
      fp: 0.5,
    });
  }
};

/** Thin green-gold line of sparks from the Simyacı (c.p) to the linked ally (c.target), with a bright pulse at the midpoint. */
const linkTether: Preset = (fx: Fx, c: Ctx) => {
  const a = c.p;
  const b = c.target ?? new THREE.Vector3(a.x, a.y, a.z);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    fx.add.spawn({
      tex: ['star-01', 'flare-01'],
      at: [a.x + (b.x - a.x) * t, a.y + 1.2 + (b.y - a.y) * t, a.z + (b.z - a.z) * t],
      vel: [0, 0.1, 0],
      life: 0.5,
      size: [0.07 * c.s, 0.1 * c.s],
      grow: 0,
      c0: 0x9dff9a,
      c1: 0x3a6a2a,
      glow: 1.6,
      fi: 0.05,
      fp: 0.6,
    });
  }
  fx.add.spawn({
    tex: ['flare-01'],
    at: [(a.x + b.x) / 2, a.y + 1.2 + (b.y - a.y) / 2, (a.z + b.z) / 2],
    vel: [0, 0, 0],
    life: 0.35,
    size: [0.5 * c.s, 0.6 * c.s],
    grow: 0.4,
    c0: 0xd8ffd0,
    c1: 0x2a6a2a,
    glow: 2.4,
    fi: 0.05,
    fp: 0.5,
  });
};

export const PRESETS_KIT_ROGUE: Record<string, Preset> = {
  shadowstep_streak: shadowstepStreak,
  secret_clones: secretClones,
  link_tether: linkTether,
};
