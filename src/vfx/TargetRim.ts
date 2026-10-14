import * as THREE from 'three';
import { shellMaterial } from './Meshes';

/**
 * Readability rim on ONE entity at a time: a thin fresnel shell (the same shader as the weapon glow) over every mesh of its
 * model. Hostile enemies (hovered or targeted) get a red rim, friendly NPCs (hovered) a soft yellow one. Shells are added
 * only while the entity is highlighted and removed when it is not, so nothing else pays for it.
 */

export type RimKind = 'hostile' | 'friendly';

const RIM = {
  hostile: { color: 0xff3a2a, power: 2.4, inflate: 0.018, alpha: 0.9 },
  friendly: { color: 0xffe066, power: 2.8, inflate: 0.016, alpha: 0.7 },
} as const;

interface Active {
  root: THREE.Object3D;
  kind: RimKind;
  shells: THREE.Mesh[];
  mats: THREE.ShaderMaterial[];
}

let active: Active | null = null;

/** Puts the rim on `root` (null clears it). Same root and kind is a no-op. */
export function setTargetRim(root: THREE.Object3D | null, kind: RimKind | null): void {
  if (!root || !kind) {
    clearTargetRim();
    return;
  }
  if (active && active.root === root && active.kind === kind && active.shells.every((s) => s.parent)) return;
  clearTargetRim();
  const cfg = RIM[kind];
  const shells: THREE.Mesh[] = [];
  const mats: THREE.ShaderMaterial[] = [];
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !o.userData.vfxShell && !o.userData.noRim && m.geometry) targets.push(m);
  });
  for (const m of targets) {
    // inflate is in local units: compensate for the mesh's own scale so the rim width is roughly constant
    const sc = Math.max(1e-3, new THREE.Vector3().setFromMatrixScale(m.matrixWorld).x);
    const mat = shellMaterial(cfg.color, { power: cfg.power, inflate: cfg.inflate / sc, alpha: cfg.alpha, base: 0, additive: false });
    const sk = m as THREE.SkinnedMesh;
    let shell: THREE.Mesh;
    if (sk.isSkinnedMesh && sk.skeleton) {
      const s = new THREE.SkinnedMesh(m.geometry, mat);
      s.bind(sk.skeleton, sk.bindMatrix);
      shell = s;
    } else {
      shell = new THREE.Mesh(m.geometry, mat);
    }
    shell.userData.vfxShell = true;
    shell.renderOrder = 12;
    shell.frustumCulled = false;
    m.add(shell);
    shells.push(shell);
    mats.push(mat);
  }
  active = { root, kind, shells, mats };
}

export function clearTargetRim(): void {
  if (!active) return;
  for (const s of active.shells) s.removeFromParent();
  for (const m of active.mats) m.dispose();
  active = null;
}
