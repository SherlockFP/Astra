import * as THREE from 'three';
import { Assets } from '../core/Assets';
import { isPSXPatched, patchPSX } from '../render/psx';

/*
 * Material helpers for entities that tint or fade model instances (see Assets.sharedMaterial).
 * A mesh under an entity holds one of three things: shared variants (never disposed here), its own copies (a fade),
 * or clones VFX made for a hit flash. VFX.flash clones a mesh's materials once and sets userData.vfxOwnMat on the mesh;
 * setMeshMaterial keeps that flag true only while the mesh really holds such a clone, so a shared material never gets flashed.
 */

const listOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

/** Every material under `root` (array-aware). */
export function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material) out.push(...listOf(m));
  });
  return out;
}

/** Swaps a mesh's material(s) and keeps VFX's flash bookkeeping right (see the file note). */
export function setMeshMaterial(mesh: THREE.Mesh, next: THREE.Material | THREE.Material[]): void {
  const prev = listOf(mesh);
  mesh.material = next;
  if (!mesh.userData.vfxOwnMat) return;
  const now = Array.isArray(next) ? next : [next];
  for (const x of prev) if (!now.includes(x) && !Assets.isSharedMaterial(x)) x.dispose(); // flash clone swapped out
  if (!now.some((x) => !Assets.isSharedMaterial(x))) delete mesh.userData.vfxOwnMat;
}

/** VFX overlays (weapon glow shells, particle layers) animate their own materials: entity code never remaps or copies them. */
const isVfxOverlay = (o: THREE.Object3D): boolean => !!(o.userData.vfxShell || o.userData.vfxLayer);
/** ShaderMaterial uniforms are written per frame and Material.clone() copies them, so these are never remapped or copied. */
const isUniformDriven = (m: THREE.Material): boolean => (m as THREE.ShaderMaterial).isShaderMaterial === true;

/**
 * Gives every mesh under `root` the shared variant `pick` returns for each material (the source is resolved first).
 * VFX overlays and uniform-driven (shader) materials keep what they have.
 */
export function mapMeshMaterials(root: THREE.Object3D, pick: (source: THREE.Material, mesh: THREE.Mesh) => THREE.Material): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material || isVfxOverlay(o)) return;
    const one = (x: THREE.Material): THREE.Material => (isUniformDriven(x) ? x : pick(Assets.sharedSource(x), m));
    const cur = m.material;
    setMeshMaterial(m, Array.isArray(cur) ? cur.map(one) : one(cur));
  });
}

/** A mesh whose materials copyMeshMaterials replaced: what it had before, and the copies it got. */
export interface MaterialSwap {
  mesh: THREE.Mesh;
  before: THREE.Material | THREE.Material[];
  copies: THREE.Material[];
}

/** Gives the meshes under `root` their own patched copies of the materials `only` accepts (default: all). Undo with restoreMeshMaterials. */
export function copyMeshMaterials(root: THREE.Object3D, only: (m: THREE.Material) => boolean = () => true): MaterialSwap[] {
  const swaps: MaterialSwap[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material || isVfxOverlay(o) || !listOf(m).some(only)) return;
    const copies: THREE.Material[] = [];
    const copy = (x: THREE.Material): THREE.Material => {
      if (!only(x) || isUniformDriven(x)) return x;
      const c = x.clone();
      if (isPSXPatched(x)) patchPSX(c); // Material.clone() drops onBeforeCompile
      copies.push(c);
      return c;
    };
    const before = m.material;
    swaps.push({ mesh: m, before, copies });
    setMeshMaterial(m, Array.isArray(before) ? before.map(copy) : copy(before));
  });
  return swaps;
}

/** Puts back the materials copyMeshMaterials replaced and frees the copies. */
export function restoreMeshMaterials(swaps: MaterialSwap[]): void {
  for (const s of swaps) {
    const keep = Array.isArray(s.before) ? s.before : [s.before];
    setMeshMaterial(s.mesh, s.before);
    for (const c of s.copies) if (!keep.includes(c)) c.dispose();
  }
}

/** Frees the clones VFX's hit flash made of a mesh's materials. Only flagged meshes are touched; shared variants stay alive. */
export function disposeFlashClones(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.vfxOwnMat) return;
    for (const x of listOf(m)) if (!Assets.isSharedMaterial(x)) x.dispose();
  });
}
