import * as THREE from 'three';
import { isPSXPatched, patchPSX } from '../render/psx';

/**
 * Occluder fade (dungeons and the open world). When a solid scene mesh stands between the orbit camera and the player, it fades
 * out instead of pulling the camera in (a pulled-in camera ends up staring at the trunk while the player is hidden behind it).
 *  - A plain Mesh swaps its material for a faded clone (opacity, depthWrite off) and restores the original when clear.
 *  - An InstancedMesh instance (the open world batches its trees, rocks, walls and cliffs) is ghosted: the instance is hidden
 *    inside its batch (zero matrix) and a single faded Mesh with the same geometry stands in for it until the view is clear.
 * Hits are sampled ~10 Hz; the alpha eases every frame and a fade holds for a short time after its last hit (no flicker).
 * Only meshes that cast shadows, are opaque and taller than a floor qualify (see collectFadeOccluders). OWNER: player module.
 */

/** Opacity of a faded occluder (0 = invisible). */
export const FADE_OPACITY = 0.25;
const SAMPLE_SEC = 0.1;
/** Keep a fade this long after the last ray hit. */
const HOLD_SEC = 0.35;
/** Alpha ease rate (1/s, exponential). */
const EASE = 9;
/** Faded occluders at once (a corridor can put several walls on the ray). */
const MAX_FADES = 12;
/** Candidates shorter than this (m) are floors, rugs, slabs or tufts: never faded. */
const MIN_HEIGHT = 0.6;
/** Meshes with a bigger geometry radius (m) are terrain, sky or mountains: never faded. */
const MAX_RADIUS = 40;
/** Hits closer than this (m) to the pivot are the player's own surroundings. */
const MIN_HIT = 0.5;

const _dir = new THREE.Vector3();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

interface Fade {
  key: string;
  /** The occluder that was hit (plain mesh or InstancedMesh). */
  target: THREE.Mesh | THREE.InstancedMesh;
  /** Instance index inside an InstancedMesh, -1 for a plain mesh. */
  instance: number;
  /** The object drawn faded: the target itself (plain) or the ghost Mesh (instance). */
  drawn: THREE.Mesh;
  /** The faded material clone (disposed on release). */
  material: THREE.Material;
  /** Plain mesh: the material to restore. */
  original: THREE.Material | null;
  /** Plain mesh: the target's castShadow to restore. */
  castShadow: boolean;
  /** Instance: the real matrix to restore. */
  matrix: THREE.Matrix4 | null;
  alpha: number;
  hitAt: number;
}

/** Copy of `src` that fades: transparent, no depth write, PSX patch kept (Material.clone drops onBeforeCompile). */
function fadedClone(src: THREE.Material): THREE.Material {
  const m = src.clone();
  if (isPSXPatched(src)) patchPSX(m);
  m.transparent = true;
  m.depthWrite = false;
  m.opacity = 1;
  return m;
}

/** True when the object and all of its ancestors are visible. */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Candidate occluders under `root`: meshes that cast shadows (grass, flowers, reeds and decals do not), are opaque and not
 * multi-material, taller than a floor and not terrain-sized. Instanced batches qualify per piece. Call once per built level.
 */
export function collectFadeOccluders(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow || !m.geometry || m.userData.noFade) return;
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat || Array.isArray(mat) || mat.transparent) return;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox || !g.boundingSphere) return;
    if (g.boundingBox.max.y - g.boundingBox.min.y < MIN_HEIGHT) return;
    if (g.boundingSphere.radius > MAX_RADIUS) return;
    out.push(m);
  });
  return out;
}

/**
 * Fades the occluders that stand between the pivot and the camera. One per camera; `clear()` restores everything at once
 * (teleports), `dispose()` restores and releases everything (scene exit, before the level itself is disposed).
 */
export class OccluderFader {
  private fades = new Map<string, Fade>();
  /** Ghost Mesh -> its fade (a ray that hits a ghost keeps that fade alive). */
  private ghostOwner = new Map<THREE.Object3D, Fade>();
  private ray = new THREE.Raycaster();
  private list: THREE.Object3D[] = [];
  private acc = SAMPLE_SEC;
  private clock = 0;

  /** Per frame. `from` = pivot, `to` = camera position (after the nav-grid collision, before shake). */
  update(dt: number, candidates: THREE.Object3D[] | null, from: THREE.Vector3, to: THREE.Vector3): void {
    this.clock += dt;
    if (!candidates || candidates.length === 0) {
      if (this.fades.size) this.clear();
      return;
    }
    this.acc += dt;
    if (this.acc >= SAMPLE_SEC) {
      this.acc = 0;
      this.sample(candidates, from, to);
    }
    this.animate(dt);
  }

  /** Restore every fade immediately (no animation). */
  clear(): void {
    for (const f of [...this.fades.values()]) this.release(f);
    this.ghostOwner.clear();
  }

  dispose(): void {
    this.clear();
    this.list.length = 0;
  }

  /** Number of occluders currently faded or fading (debug). */
  get activeCount(): number {
    return this.fades.size;
  }

  private sample(candidates: THREE.Object3D[], from: THREE.Vector3, to: THREE.Vector3): void {
    _dir.subVectors(to, from);
    const len = _dir.length();
    if (len < 0.3) return;
    _dir.multiplyScalar(1 / len);
    const ray = this.ray;
    ray.set(from, _dir);
    ray.near = MIN_HIT;
    ray.far = len;
    const list = this.list;
    list.length = 0;
    for (const c of candidates) if (c.visible) list.push(c);
    for (const g of this.ghostOwner.keys()) list.push(g);
    const hits = ray.intersectObjects(list, false);
    const now = this.clock;
    for (const h of hits) {
      const obj = h.object;
      const ghost = this.ghostOwner.get(obj);
      if (ghost) {
        ghost.hitAt = now;
        continue;
      }
      if (!isShown(obj)) continue; // invisible things do not block the view
      const inst = h.instanceId ?? -1;
      const key = inst >= 0 ? `${obj.uuid}#${inst}` : obj.uuid;
      const existing = this.fades.get(key);
      if (existing) {
        existing.hitAt = now;
        continue;
      }
      if (this.fades.size >= MAX_FADES) continue;
      const f = inst >= 0
        ? this.startInstance(obj as THREE.InstancedMesh, inst, key)
        : this.startPlain(obj as THREE.Mesh, key);
      if (f) {
        f.hitAt = now;
        this.fades.set(key, f);
        if (f.instance >= 0) this.ghostOwner.set(f.drawn, f);
      }
    }
  }

  private startPlain(target: THREE.Mesh, key: string): Fade | null {
    const src = target.material as THREE.Material;
    if (!src || Array.isArray(src)) return null;
    const material = fadedClone(src);
    const f: Fade = {
      key, target, instance: -1, drawn: target, material, original: src, castShadow: target.castShadow,
      matrix: null, alpha: 1, hitAt: 0,
    };
    target.material = material;
    target.castShadow = false;
    return f;
  }

  private startInstance(im: THREE.InstancedMesh, inst: number, key: string): Fade | null {
    const parent = im.parent;
    const src = im.material as THREE.Material;
    if (!parent || !src || Array.isArray(src) || inst >= im.count) return null;
    const matrix = new THREE.Matrix4();
    im.getMatrixAt(inst, matrix);
    const material = fadedClone(src);
    if (im.instanceColor) {
      im.getColorAt(inst, _c);
      const col = (material as THREE.MeshStandardMaterial).color;
      if (col) col.multiply(_c);
    }
    const ghost = new THREE.Mesh(im.geometry, material);
    ghost.name = 'occluder_ghost';
    ghost.castShadow = false;
    ghost.receiveShadow = im.receiveShadow;
    ghost.matrix.copy(matrix);
    ghost.matrix.decompose(ghost.position, ghost.quaternion, ghost.scale);
    parent.add(ghost);
    ghost.updateMatrixWorld(true);
    im.setMatrixAt(inst, ZERO_MATRIX);
    im.instanceMatrix.needsUpdate = true;
    return {
      key, target: im, instance: inst, drawn: ghost, material, original: null, castShadow: im.castShadow,
      matrix, alpha: 1, hitAt: 0,
    };
  }

  private animate(dt: number): void {
    if (!this.fades.size) return;
    const k = 1 - Math.exp(-EASE * dt);
    const now = this.clock;
    for (const f of [...this.fades.values()]) {
      if (!isShown(f.target)) {
        this.release(f);
        continue;
      }
      const holding = now - f.hitAt <= HOLD_SEC;
      const goal = holding ? FADE_OPACITY : 1;
      f.alpha += (goal - f.alpha) * k;
      if (!holding && f.alpha > 0.97) {
        this.release(f);
        continue;
      }
      f.material.opacity = f.alpha;
    }
  }

  private release(f: Fade): void {
    this.fades.delete(f.key);
    if (f.instance >= 0) {
      const im = f.target as THREE.InstancedMesh;
      if (f.matrix && f.instance < im.count) {
        im.setMatrixAt(f.instance, f.matrix);
        im.instanceMatrix.needsUpdate = true;
      }
      this.ghostOwner.delete(f.drawn);
      f.drawn.removeFromParent();
    } else {
      const mesh = f.target as THREE.Mesh;
      if (f.original) mesh.material = f.original;
      mesh.castShadow = f.castShadow;
    }
    f.material.dispose();
  }
}
