import * as THREE from 'three';
import { shellMaterial } from './Meshes';

/**
 * Readability rim on up to TWO entities (WoW clarity): the hovered unit and the target, each in its own slot. A thin fresnel
 * shell (the same shader as the weapon glow) over every mesh of its model. Hostile enemies get a red rim, friendly NPCs a
 * green one. Shells are added only while the entity is highlighted and removed when it is not.
 */

export type RimKind = 'hostile' | 'friendly';
/** Two rims can show at once: the one under the cursor (hover) and the selected unit (target). */
export type RimSlot = 'hover' | 'target';

const RIM = {
  hostile: { color: 0xff3a2a, power: 2.4, inflate: 0.022, alpha: 0.95 },
  friendly: { color: 0x46ff6e, power: 2.4, inflate: 0.022, alpha: 0.9 },
} as const;

interface Active {
  root: THREE.Object3D;
  kind: RimKind;
  shells: THREE.Mesh[];
  mats: THREE.ShaderMaterial[];
}

const active = new Map<RimSlot, Active>();

/** Puts the rim on `root` in `slot` (null root or kind clears that slot). Same root and kind in the slot is a no-op. */
export function setRim(slot: RimSlot, root: THREE.Object3D | null, kind: RimKind | null): void {
  if (!root || !kind) {
    clearRim(slot);
    return;
  }
  const cur = active.get(slot);
  if (cur && cur.root === root && cur.kind === kind && cur.shells.every((s) => s.parent)) return;
  clearRim(slot);
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
  active.set(slot, { root, kind, shells, mats });
}

/** Removes the rim of one slot (default: both). */
export function clearRim(slot?: RimSlot): void {
  for (const k of slot ? [slot] : (['hover', 'target'] as const)) {
    const a = active.get(k);
    if (!a) continue;
    for (const s of a.shells) s.removeFromParent();
    for (const m of a.mats) m.dispose();
    active.delete(k);
  }
}
