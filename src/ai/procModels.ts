import * as THREE from 'three';
import { patchPSX } from '../render/psx';

/**
 * Procedural PSX bodies for mechanic entities (GDD_CONTENT §3.7): flat-shaded Lambert primitives with few segments,
 * animated by transform tweens. Built once per instance (they are tiny). OWNER: enemies module.
 */
export interface ProcModel {
  root: THREE.Object3D;
  /** Height of the body in metres (before def.scale). */
  height: number;
  /** hpFrac: the entity's HP fraction on this peer (Metin stones draw their state from it). */
  update(dt: number, t: number, hpFrac?: number): void;
  /** Per-instance materials/geometries to dispose with the entity. */
  dispose(): void;
}

function lambert(color: number, emissive = 0x000000, emissiveIntensity = 0, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true, ...opts });
  patchPSX(m);
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  // enemies never cast real shadows (their G.vfx.blobShadow is the shadow)
  m.castShadow = false;
  return m;
}

type Builder = (tint?: number) => ProcModel;

const BUILDERS: Record<string, Builder> = {
  /** Azrakel phase 2: a floating green crystal on a broken column stump. */
  phylactery: () => {
    const root = new THREE.Group();
    const stone = lambert(0x6a6658);
    const glow = lambert(0x60ff90, 0x40ff80, 1.2);
    const stump = mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 7), stone, 0, 0.45, 0);
    const cap = mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.14, 7), stone, 0, 0.97, 0);
    const gem = mesh(new THREE.OctahedronGeometry(0.55, 0), glow, 0, 1.9, 0);
    gem.scale.set(0.8, 1.5, 0.8);
    root.add(stump, cap, gem);
    return {
      root, height: 2.6,
      update(_dt, t) {
        gem.position.y = 1.9 + Math.sin(t * 2.0) * 0.12;
        gem.rotation.y = t * 1.4;
        glow.emissiveIntensity = 1.0 + Math.sin(t * 5) * 0.35;
      },
      dispose() { for (const o of [stump, cap, gem]) o.geometry.dispose(); stone.dispose(); glow.dispose(); },
    };
  },
  /** Morkan phase 2: drifting soul. */
  soul_orb: () => {
    const root = new THREE.Group();
    const core = lambert(0x60ff90, 0x40ff80, 1.6, { transparent: true, opacity: 0.92 });
    const halo = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    const o = mesh(new THREE.SphereGeometry(0.4, 8, 6), core, 0, 1.1, 0);
    const h = mesh(new THREE.SphereGeometry(0.75, 8, 6), halo, 0, 1.1, 0);
    h.castShadow = false;
    root.add(o, h);
    return {
      root, height: 1.8,
      update(_dt, t) {
        const s = 1 + Math.sin(t * 7) * 0.12;
        o.scale.setScalar(s);
        h.scale.setScalar(1 + Math.sin(t * 4 + 1) * 0.15);
        o.position.y = h.position.y = 1.1 + Math.sin(t * 3) * 0.12;
      },
      dispose() { o.geometry.dispose(); h.geometry.dispose(); core.dispose(); halo.dispose(); },
    };
  },
  /** Morkan Kemik Hapsi: eight bones around the player. */
  bone_cage: () => {
    const root = new THREE.Group();
    const bone = lambert(0xe0d8c0, 0x201c10, 0.2);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(0.07, 0.1, 2.2, 5);
      geos.push(g);
      const m = mesh(g, bone, Math.cos(a) * 0.85, 1.1, Math.sin(a) * 0.85);
      m.rotation.z = Math.cos(a) * 0.08;
      m.rotation.x = Math.sin(a) * 0.08;
      root.add(m);
    }
    const ring = new THREE.TorusGeometry(0.85, 0.07, 4, 10);
    geos.push(ring);
    const r1 = mesh(ring, bone, 0, 2.15, 0);
    r1.rotation.x = Math.PI / 2;
    const r2 = mesh(ring, bone, 0, 0.12, 0);
    r2.rotation.x = Math.PI / 2;
    root.add(r1, r2);
    return {
      root, height: 2.4,
      update() {},
      dispose() { for (const g of geos) g.dispose(); bone.dispose(); },
    };
  },
  /** Ayaz Ana Buz Mezarı: translucent ice block. */
  ice_tomb: () => {
    const root = new THREE.Group();
    const ice = lambert(0x9fd8ff, 0x2a5a9a, 0.6, { transparent: true, opacity: 0.6, depthWrite: false });
    const inner = lambert(0xdff4ff, 0x80c8ff, 0.8, { transparent: true, opacity: 0.35, depthWrite: false });
    const b = mesh(new THREE.BoxGeometry(1.3, 2.3, 1.3), ice, 0, 1.15, 0);
    const c = mesh(new THREE.BoxGeometry(0.8, 1.7, 0.8), inner, 0, 1.15, 0);
    root.add(b, c);
    return {
      root, height: 2.3,
      update(_dt, t) { inner.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2; },
      dispose() { b.geometry.dispose(); c.geometry.dispose(); ice.dispose(); inner.dispose(); },
    };
  },
  /** Ak Pençe Buz Sarkıtı: a jagged ice column that blocks movement for 20 s. */
  ice_pillar: () => {
    const root = new THREE.Group();
    const ice = lambert(0x9fd8ff, 0x2a5a9a, 0.55, { transparent: true, opacity: 0.82 });
    const core = lambert(0xdff4ff, 0x80c8ff, 0.9, { transparent: true, opacity: 0.55 });
    const base = mesh(new THREE.CylinderGeometry(0.75, 1.0, 1.2, 6), ice, 0, 0.6, 0);
    const mid = mesh(new THREE.CylinderGeometry(0.5, 0.75, 1.5, 6), ice, 0, 1.9, 0);
    const tip = mesh(new THREE.ConeGeometry(0.5, 1.4, 6), core, 0, 3.35, 0);
    const shard = mesh(new THREE.ConeGeometry(0.28, 1.1, 5), ice, 0.55, 0.55, 0.2);
    shard.rotation.z = -0.5;
    root.add(base, mid, tip, shard);
    return {
      root, height: 4.0,
      update(_dt, t) { core.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.25; },
      dispose() { for (const o of [base, mid, tip, shard]) o.geometry.dispose(); ice.dispose(); core.dispose(); },
    };
  },
  /**
   * M+ Patlayıcı Küre body: systems/Affixes.ts draws the orb itself (pulsing core + wire shell + vfx, attachOrbMesh), so the PROC
   * body is an empty anchor that only gives the entity a height (no 'unknown procedural model' warning, no double mesh).
   */
  explosive_orb: () => {
    const root = new THREE.Group();
    return { root, height: 1.2, update() {}, dispose() {} };
  },
  /**
   * Metin stone (GDD_OPENWORLD §4.1): cracked basalt monolith, 3.4 m, scale 1. Grey core until the first hit (hpFrac < 1), then the
   * tier colour (def.tint) glows. Cracks appear at 85 / 65 / 45 / 25 / 10 % HP with a short flash; the rune ring spins faster when
   * engaged and the 10 m aura ring is drawn on the ground. Everything is a function of hpFrac, so every peer shows the same state.
   */
  metin_stone: (tint = 0x60a0ff) => {
    const CRACK_AT = [0.85, 0.65, 0.45, 0.25, 0.1];
    const root = new THREE.Group();
    const basalt = lambert(0x3a3c44);
    const trim = lambert(0x2a2c32);
    const core = lambert(0x303036, tint, 0);
    const crackMat = lambert(tint, tint, 0.6);
    const runeMat = lambert(tint, tint, 1.0);
    const auraMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const body = mesh(new THREE.CylinderGeometry(0.85, 1.2, 3.4, 7), basalt, 0, 1.7, 0);
    const cap = mesh(new THREE.CylinderGeometry(0.5, 0.85, 0.5, 7), trim, 0, 3.65, 0);
    const shardA = mesh(new THREE.OctahedronGeometry(0.6, 0), trim, 0.95, 0.45, 0.25);
    shardA.scale.set(1, 1.5, 1);
    const shardB = mesh(new THREE.OctahedronGeometry(0.45, 0), trim, -0.8, 0.35, -0.35);
    const gem = mesh(new THREE.OctahedronGeometry(0.36, 0), core, 0, 1.9, 0.95);
    gem.scale.set(0.8, 1.3, 0.8);
    const runeG = new THREE.Group();
    runeG.position.y = 0.08;
    const rune = mesh(new THREE.TorusGeometry(1.5, 0.05, 4, 18), runeMat, 0, 0, 0);
    rune.rotation.x = Math.PI / 2;
    runeG.add(rune);
    const aura = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 48), auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.06;
    aura.castShadow = false;
    const cracks: THREE.Mesh[] = [];
    for (let i = 0; i < CRACK_AT.length; i++) {
      const a = i * 1.25 + 0.4;
      const c = mesh(new THREE.BoxGeometry(0.08, 0.9 + (i % 2) * 0.5, 0.05), crackMat, Math.sin(a) * 0.9, 0.7 + i * 0.5, Math.cos(a) * 0.9);
      c.rotation.y = a;
      c.visible = false;
      cracks.push(c);
    }
    root.add(body, cap, shardA, shardB, gem, runeG, aura, ...cracks);
    let shown = 0;
    let flash = 0;
    let lastHp = 1;
    let jolt = 0;
    return {
      root, height: 3.6,
      update(dt, t, hpFrac = 1) {
        // every HP drop jolts the monolith (derived from hpFrac, so every peer shakes on the same hits)
        if (hpFrac < lastHp - 1e-4) jolt = 1;
        lastHp = hpFrac;
        jolt = Math.max(0, jolt - dt * 4);
        root.rotation.z = Math.sin(t * 45) * 0.035 * jolt;
        root.rotation.x = Math.cos(t * 39) * 0.02 * jolt;
        const engaged = hpFrac < 0.999;
        core.emissiveIntensity = engaged ? 1.0 + Math.sin(t * 4) * 0.3 : 0.04;
        gem.position.y = 1.9 + Math.sin(t * 2) * 0.05;
        gem.rotation.y = t * 1.2;
        runeG.rotation.y += dt * (engaged ? 1.4 : 0.25);
        auraMat.opacity = engaged ? 0.26 + Math.sin(t * 3) * 0.05 : 0;
        let n = 0;
        for (let i = 0; i < CRACK_AT.length; i++) {
          const on = hpFrac <= CRACK_AT[i];
          cracks[i].visible = on;
          if (on) n++;
        }
        if (n > shown) flash = 1;
        shown = n;
        flash = Math.max(0, flash - dt * 2.5);
        crackMat.emissiveIntensity = 0.6 + flash * 2.4;
      },
      dispose() {
        for (const o of [body, cap, shardA, shardB, gem, rune, aura, ...cracks]) o.geometry.dispose();
        basalt.dispose(); trim.dispose(); core.dispose(); crackMat.dispose(); runeMat.dispose(); auraMat.dispose();
      },
    };
  },
  /** Kevvas Boşluk Yarığı: upright torus + swirling disc. */
  rift: (tint = 0x8040ff) => {
    const root = new THREE.Group();
    const ring = lambert(tint, tint, 1.4);
    const disc = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const t1 = mesh(new THREE.TorusGeometry(1.25, 0.16, 5, 14), ring, 0, 1.4, 0);
    const d = mesh(new THREE.CircleGeometry(1.15, 12), disc, 0, 1.4, 0);
    d.castShadow = false;
    const swirl = mesh(new THREE.TorusGeometry(0.6, 0.06, 4, 10), ring, 0, 1.4, 0.02);
    root.add(t1, d, swirl);
    return {
      root, height: 2.8,
      update(_dt, t) {
        d.rotation.z = t * 2.2;
        swirl.rotation.z = -t * 3.4;
        swirl.scale.setScalar(1 + Math.sin(t * 5) * 0.15);
        ring.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.4;
      },
      dispose() { t1.geometry.dispose(); d.geometry.dispose(); swirl.geometry.dispose(); ring.dispose(); disc.dispose(); },
    };
  },
};

export function hasProcModel(id: string): boolean {
  return id in BUILDERS;
}

export function buildProcModel(id: string, tint?: number): ProcModel | null {
  const b = BUILDERS[id];
  return b ? b(tint) : null;
}
