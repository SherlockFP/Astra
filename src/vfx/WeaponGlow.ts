import * as THREE from 'three';
import { TAU, rnd, type Fx } from './Fx';
import { shellMaterial } from './Meshes';

/**
 * Metin2-style upgrade glow on a weapon: +7 blue, +9 purple, +12 crimson/gold, +15 rainbow.
 * An inflated fresnel shell is added as a child of every weapon mesh (follows the hand bone for free) plus
 * particles emitted from random points inside the weapon's local bounding box.
 */

interface TierDef {
  level: number;
  layers: { color: number; power: number; inflate: number; alpha: number; pulse: number; rainbow?: boolean; base?: number }[];
  rate: number;
  kind: 'none' | 'motes' | 'embers' | 'rainbow';
  light?: boolean;
}

const TIERS: TierDef[] = [
  { level: 15, layers: [{ color: 0xffffff, power: 1.6, inflate: 0.03, alpha: 0.95, pulse: 0.2, rainbow: true, base: 0.18 }, { color: 0xffffff, power: 3, inflate: 0.055, alpha: 0.45, pulse: 0.3, rainbow: true, base: 0.04 }], rate: 26, kind: 'rainbow', light: true },
  { level: 12, layers: [{ color: 0xff4030, power: 1.7, inflate: 0.026, alpha: 0.95, pulse: 0.3, base: 0.16 }, { color: 0xffc040, power: 3, inflate: 0.05, alpha: 0.55, pulse: 0.4, base: 0.03 }], rate: 15, kind: 'embers' },
  { level: 9, layers: [{ color: 0xb14cff, power: 1.9, inflate: 0.026, alpha: 0.85, pulse: 0.35, base: 0.1 }, { color: 0xe0a0ff, power: 3.2, inflate: 0.045, alpha: 0.35, pulse: 0.3, base: 0.02 }], rate: 7, kind: 'motes' },
  { level: 7, layers: [{ color: 0x3fa9ff, power: 2.3, inflate: 0.022, alpha: 0.6, pulse: 0.4, base: 0.06 }], rate: 0, kind: 'none' },
];

interface State {
  root: THREE.Object3D;
  level: number;
  tier: TierDef;
  shells: THREE.Mesh[];
  mats: THREE.ShaderMaterial[];
  box: THREE.Box3;
  carry: number;
  lightT: number;
  t: number;
}

const _p = new THREE.Vector3();
const _c = new THREE.Color();

function hueHex(h: number): number {
  return _c.setHSL(((h % 1) + 1) % 1, 1, 0.6).getHex();
}

export class WeaponGlows {
  private map = new Map<THREE.Object3D, State>();
  constructor(private fx: Fx) {}

  set(root: THREE.Object3D, upgrade: number): void {
    const level = Math.floor(upgrade);
    const tier = TIERS.find((t) => level >= t.level) ?? null;
    const cur = this.map.get(root);
    if (cur && cur.tier === tier && cur.shells.every((s) => s.parent)) return;
    this.remove(root);
    if (!tier) return;
    const shells: THREE.Mesh[] = [];
    const mats: THREE.ShaderMaterial[] = [];
    const targets: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !o.userData.vfxShell && m.geometry) targets.push(m);
    });
    // local bounding box of the weapon (in the root's space)
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    for (const m of targets) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      box.union(bb);
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.05, -0.05, -0.05), new THREE.Vector3(0.05, 0.05, 0.6));
    for (const m of targets) {
      // compensate for non-unit scale so the inflate is roughly world-constant
      m.updateWorldMatrix(true, false);
      const sc = Math.max(1e-3, new THREE.Vector3().setFromMatrixScale(m.matrixWorld).x);
      for (const L of tier.layers) {
        const mat = shellMaterial(L.color, { power: L.power, inflate: L.inflate / sc, alpha: L.alpha, pulse: L.pulse, rainbow: L.rainbow, base: L.base });
        const shell = new THREE.Mesh(m.geometry, mat);
        shell.userData.vfxShell = true;
        shell.renderOrder = 13;
        shell.frustumCulled = false;
        m.add(shell);
        shells.push(shell);
        mats.push(mat);
      }
    }
    this.map.set(root, { root, level, tier, shells, mats, box, carry: 0, lightT: 0, t: Math.random() * 10 });
  }

  remove(root: THREE.Object3D): void {
    const s = this.map.get(root);
    if (!s) return;
    for (const sh of s.shells) sh.removeFromParent();
    for (const m of s.mats) m.dispose();
    this.map.delete(root);
  }

  clear(): void {
    for (const r of [...this.map.keys()]) this.remove(r);
  }

  update(dt: number): void {
    for (const [root, s] of this.map) {
      s.t += dt;
      for (const m of s.mats) m.uniforms.uTime.value = s.t;
      // detached weapons (model removed) are dropped
      let top: THREE.Object3D = root;
      let visible = root.visible;
      while (top.parent) {
        top = top.parent;
        if (!top.visible) visible = false;
      }
      if (top !== this.fx.scene) {
        if (!this.fx.scene) continue;
        this.remove(root);
        continue;
      }
      if (!visible || s.tier.rate <= 0) continue;
      root.getWorldPosition(_p);
      if (_p.distanceToSquared(this.fx.camPos) > 45 * 45) continue;
      s.carry += s.tier.rate * dt;
      const n = Math.floor(s.carry);
      s.carry -= n;
      for (let i = 0; i < n; i++) {
        _p.set(rnd(s.box.min.x, s.box.max.x), rnd(s.box.min.y, s.box.max.y), rnd(s.box.min.z, s.box.max.z));
        root.localToWorld(_p);
        this.emit(s, _p);
      }
      if (s.tier.light) {
        s.lightT -= dt;
        if (s.lightT <= 0) {
          s.lightT = 0.12;
          root.getWorldPosition(_p);
          this.fx.light(_p, hueHex(s.t * 0.25), 7, 0.16, 5);
        }
      }
    }
  }

  private emit(s: State, p: THREE.Vector3): void {
    const fx = this.fx;
    switch (s.tier.kind) {
      case 'motes':
        fx.add.spawn({ tex: ['flare-01', 'star-01', 'cross'], at: p, vel: [rnd(-0.15, 0.15), rnd(0.2, 0.7), rnd(-0.15, 0.15)], life: [0.5, 1.0], size: [0.07, 0.14], c0: 0xffffff, c1: 0xb14cff, glow: 2.6, fi: 0.2, fp: 1 });
        break;
      case 'embers':
        if (Math.random() < 0.6) fx.add.spawn({ tex: 'px', at: p, vel: [rnd(-0.3, 0.3), rnd(0.5, 1.4), rnd(-0.3, 0.3)], life: [0.4, 0.9], size: 0.04, c0: 0xffe090, c1: 0xff3010, glow: 2.6, fi: 0, fp: 1 });
        else fx.add.spawn({ tex: ['flame-tongue-01', 'flame-tongue-02'], at: p, vel: [0, rnd(0.6, 1.2), 0], life: [0.25, 0.5], size: [0.16, 0.26], asp: 1.4, grow: 0.4, c0: 0xffa83a, c1: 0xd02010, glow: 1.35, a: 0.7, fi: 0.1, fp: 1.1 });
        break;
      case 'rainbow': {
        const h = s.t * 0.25 + Math.random() * 0.3;
        const col = hueHex(h);
        fx.add.spawn({ tex: ['star-01', 'cross', 'star-04', 'flare-01'], at: p, vel: [rnd(-0.3, 0.3), rnd(0.2, 0.9), rnd(-0.3, 0.3)], life: [0.45, 0.95], size: [0.08, 0.2], c0: 0xffffff, c1: col, glow: 2.8, spin: [-4, 4], fi: 0.15, fp: 1 });
        break;
      }
      default:
        break;
    }
    void TAU;
  }
}
