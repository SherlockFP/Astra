import * as THREE from 'three';

/**
 * Freezes the transforms of a static object tree: one updateMatrix() now, then the engine skips the per-frame compose of every
 * node in it. Call only once the final position, rotation and scale are set, and only on trees nothing moves or animates later
 * (decor props, terraces, stairs). Never call it on doors, lids, gates, prop handles, entities or anything a system animates.
 * OWNER: render module.
 */
export function freezeStatic(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}
