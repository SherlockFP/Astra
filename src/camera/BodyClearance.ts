import * as THREE from 'three';

/**
 * Own-body clearance of the third-person lens (camera/ThirdPersonCamera.ts). The lens must not sit inside the character it follows:
 * a helmet, an arm or a cape within a few tenths of a metre of the lens fills the view as flat, textureless blocks that read as
 * scenery floating far away. Two parts keep that from happening:
 *  - in fade mode (dungeons, open world) the collision never pulls the lens closer than BODY_KEEP_OUT metres to its pivot
 *    (ThirdPersonCamera.place; the occluders between them fade instead);
 *  - NearBodyHider hides the character's own meshes whose bounding sphere still reaches the lens (a pinned or teleported view), and
 *    restores them once the lens is clear. A mesh that something else hid is left alone.
 * OWNER: camera module.
 */

/** The closest the orbit lens gets to its pivot (m). */
export const BODY_KEEP_OUT = 1.6;
/** A part is hidden while the lens is within its bounding sphere plus this margin (m). */
const HIDE_MARGIN = 0.35;

const _centre = new THREE.Vector3();

/** Largest axis scale of a world matrix (a bounding sphere grows with it). */
function maxScale(m: THREE.Matrix4): number {
  const e = m.elements;
  return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
}

export class NearBodyHider {
  private readonly hidden = new Set<THREE.Object3D>();
  private root: THREE.Object3D | null = null;

  /** Hides the meshes under `root` that the lens at `lens` is inside (or within HIDE_MARGIN of), and shows the ones it has left. */
  update(root: THREE.Object3D | null, lens: THREE.Vector3): void {
    if (root !== this.root) {
      this.reset(); // a new character: nothing hidden under the old one is kept
      this.root = root;
    }
    if (!root) return;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere;
      if (!bs) return;
      _centre.copy(bs.center).applyMatrix4(m.matrixWorld);
      const reach = bs.radius * maxScale(m.matrixWorld) + HIDE_MARGIN;
      const near = _centre.distanceToSquared(lens) < reach * reach;
      if (near) {
        if (m.visible && !this.hidden.has(m)) {
          m.visible = false;
          this.hidden.add(m);
        }
      } else if (this.hidden.has(m)) {
        m.visible = true;
        this.hidden.delete(m);
      }
    });
  }

  /** Shows every mesh this hider hid (the target changed, the camera is released or disposed). */
  reset(): void {
    for (const m of this.hidden) m.visible = true;
    this.hidden.clear();
  }
}
