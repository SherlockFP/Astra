import * as THREE from 'three';

/**
 * LightPool: a fixed number of real PointLights (constant count => no shader recompiles) that are re-assigned to the
 * torches nearest to a reference point (the local player / camera). Every other torch is only a glow sprite.
 * Assignment changes fade in/out so lights never "pop". Flicker runs every frame. OWNER: world module.
 */

export interface TorchSpec {
  color: number;
  /** Physical intensity (candela-ish). Use LIGHT_UNIT * designIntensity. */
  intensity: number;
  distance: number;
  /** 0..1 flicker amount. */
  flicker: number;
  decay?: number;
  /** Priority lights (village lamps, shrines, waypoints) win the real-light slots against plain torches: 0 = normal, 1-2 = priority. */
  priority?: number;
}

/**
 * Hard cap on REAL PointLights per scene. Every shadowless PointLight costs fragment-shader work on every lit pixel, and three.js
 * counts unlit (intensity 0) lights too, so the builders route all torches / lamps / braziers / zones through one pool of this size.
 */
export const MAX_REAL_LIGHTS = 8;

/** Multiplier from "design" intensities (0.5..3, as in PropPlacement.light) to three.js physical units. */
export const LIGHT_UNIT = 22;
export const designToPhysical = (i: number): number => (i <= 12 ? i * LIGHT_UNIT : i);

interface Torch extends TorchSpec {
  pos: THREE.Vector3;
  phase: number;
  /** Slot currently showing this torch or -1. */
  slot: number;
  /** Runtime multiplier (e.g. for fading in/out a whole room). */
  scale: number;
}

interface Slot {
  light: THREE.PointLight;
  torch: number; // index into torches, -1 = free
  level: number; // 0..1 fade level
  target: number;
}

export class LightPool {
  readonly torches: Torch[] = [];
  private slots: Slot[] = [];
  private t = 0;
  private acc = 1; // force a recompute on the first update
  /** Global intensity multiplier (quality setting / scene fade). */
  intensityScale = 1;

  constructor(parent: THREE.Object3D, size = MAX_REAL_LIGHTS) {
    const n = Math.max(1, Math.min(MAX_REAL_LIGHTS, Math.floor(size)));
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffa050, 0, 10, 1.7);
      light.castShadow = false;
      parent.add(light);
      this.slots.push({ light, torch: -1, level: 0, target: 0 });
    }
  }

  add(pos: THREE.Vector3 | [number, number, number], spec: TorchSpec): number {
    const p = Array.isArray(pos) ? new THREE.Vector3(pos[0], pos[1], pos[2]) : pos.clone();
    this.torches.push({ ...spec, pos: p, phase: Math.random() * 100, slot: -1, scale: 1 });
    return this.torches.length - 1;
  }

  get size(): number {
    return this.slots.length;
  }

  /** Active real lights right now (debug). */
  get activeCount(): number {
    return this.slots.filter((s) => s.level > 0.02).length;
  }

  update(dt: number, ref: THREE.Vector3 | null): void {
    this.t += dt;
    this.acc += dt;
    if (ref && this.acc >= 0.12) {
      this.acc = 0;
      this.reassign(ref);
    }
    const k = Math.min(1, dt / 0.35);
    for (const s of this.slots) {
      s.level += (s.target - s.level) * k;
      if (Math.abs(s.target - s.level) < 0.01) s.level = s.target;
      if (s.torch < 0 || s.level <= 0.005) {
        s.light.intensity = 0;
        if (s.target === 0 && s.level <= 0.005 && s.torch >= 0) {
          this.torches[s.torch].slot = -1;
          s.torch = -1;
        }
        continue;
      }
      const tc = this.torches[s.torch];
      const t = this.t * 1 + tc.phase;
      const f = 1 + tc.flicker * (0.45 * Math.sin(t * 9.1) + 0.3 * Math.sin(t * 17.3 + 1.7) + 0.25 * Math.sin(t * 4.1 + 0.4));
      s.light.intensity = tc.intensity * s.level * f * tc.scale * this.intensityScale;
      s.light.position.set(
        tc.pos.x + Math.sin(t * 7.3) * 0.03 * tc.flicker * 4,
        tc.pos.y + Math.sin(t * 6.1 + 1.0) * 0.04 * tc.flicker * 4,
        tc.pos.z + Math.cos(t * 7.9) * 0.03 * tc.flicker * 4,
      );
    }
  }

  private reassign(ref: THREE.Vector3): void {
    const K = this.slots.length;
    // pick K nearest torches (small insertion-sorted list); torches already shown get a hysteresis bonus
    const best: { i: number; d: number }[] = [];
    for (let i = 0; i < this.torches.length; i++) {
      const tc = this.torches[i];
      const dx = tc.pos.x - ref.x, dz = tc.pos.z - ref.z, dy = (tc.pos.y - ref.y) * 0.5;
      let d = dx * dx + dz * dz + dy * dy;
      if (d > (tc.distance + 28) * (tc.distance + 28)) continue;
      if (tc.slot >= 0) d *= 0.7;
      if (tc.priority) d /= 1 + 1.5 * tc.priority;
      let pos = best.length;
      while (pos > 0 && best[pos - 1].d > d) pos--;
      if (pos < K) {
        best.splice(pos, 0, { i, d });
        if (best.length > K) best.pop();
      }
    }
    const wanted = new Set(best.map((b) => b.i));
    for (const s of this.slots) if (s.torch >= 0 && !wanted.has(s.torch)) s.target = 0;
    for (const b of best) {
      const tc = this.torches[b.i];
      if (tc.slot >= 0) {
        this.slots[tc.slot].target = 1;
        continue;
      }
      // find a free (or fully faded) slot
      const slot = this.slots.findIndex((s) => s.torch < 0 || (s.target === 0 && s.level <= 0.02));
      if (slot < 0) continue;
      const s = this.slots[slot];
      if (s.torch >= 0) this.torches[s.torch].slot = -1;
      s.torch = b.i;
      s.level = 0;
      s.target = 1;
      tc.slot = slot;
      s.light.color.setHex(tc.color);
      s.light.distance = tc.distance;
      s.light.decay = tc.decay ?? 1.7;
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      s.light.removeFromParent();
      s.light.dispose();
    }
    this.slots.length = 0;
    this.torches.length = 0;
  }
}
