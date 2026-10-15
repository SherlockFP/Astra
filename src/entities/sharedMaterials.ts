import * as THREE from 'three';
import { Assets } from '../core/Assets';
import { isPSXPatched, patchPSX } from '../render/psx';

/*
 * Material helpers for entities that tint, fade or flash model instances (see Assets.sharedMaterial). A mesh under an entity
 * holds one of three things:
 *  - shared variants (never disposed here: every instance of the def draws them);
 *  - own copies (copyMeshMaterials: a fade, an affix tint, a highlight): this entity's alone, shaded in place by a hit flash;
 *  - hit-flash variants (flashVariant, swapped in by VFX.flash while a hit flashes): registered as shared variants of the material
 *    they stand for, so Assets.sharedSource maps them back to the real source and a remap never builds variants of a flash.
 * unflashed() gives the material a flash variant stands for, so copies and restores never capture a flash variant.
 */

const listOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

/** Copies made by copyMeshMaterials: this entity's own materials. */
const ownCopies = new WeakSet<THREE.Material>();
/** Flash variant -> the material it stands for. */
const flashOrigin = new WeakMap<THREE.Material, THREE.Material>();

/** Every material under `root` (array-aware). */
export function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material) out.push(...listOf(m));
  });
  return out;
}

/** The material a flash variant stands for; any other material is returned as it is. */
export function unflashed<T extends THREE.Material>(m: T): T {
  return (flashOrigin.get(m) as T | undefined) ?? m;
}

/** True for the copies copyMeshMaterials made (this entity's own materials). */
export function isOwnCopy(m: THREE.Material): boolean {
  return ownCopies.has(m);
}

/** VFX overlays (weapon glow shells, particle layers) animate their own materials: entity code never remaps or copies them. */
const isVfxOverlay = (o: THREE.Object3D): boolean => !!(o.userData.vfxShell || o.userData.vfxLayer);
/** ShaderMaterial uniforms are written per frame and Material.clone() copies them, so these are never remapped or copied. */
const isUniformDriven = (m: THREE.Material): boolean => (m as THREE.ShaderMaterial).isShaderMaterial === true;
/** The shared source a material is remapped from. A flash variant resolves through the material it stands for. */
const sourceOf = (m: THREE.Material): THREE.Material => Assets.sharedSource(unflashed(m));

/**
 * Gives every mesh under `root` the shared variant `pick` returns for each material (the source is resolved first).
 * VFX overlays and uniform-driven (shader) materials keep what they have.
 */
export function mapMeshMaterials(root: THREE.Object3D, pick: (source: THREE.Material, mesh: THREE.Mesh) => THREE.Material): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material || isVfxOverlay(o)) return;
    const one = (x: THREE.Material): THREE.Material => (isUniformDriven(x) ? x : pick(sourceOf(x), m));
    const cur = m.material;
    m.material = Array.isArray(cur) ? cur.map(one) : one(cur);
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
    if (!m.isMesh || !m.material || isVfxOverlay(o)) return;
    // a flashed mesh is copied from what the flash stands for, so no copy or restore ever holds a flash variant
    const before = Array.isArray(m.material) ? m.material.map(unflashed) : unflashed(m.material);
    if (!(Array.isArray(before) ? before : [before]).some(only)) return;
    const copies: THREE.Material[] = [];
    const copy = (x: THREE.Material): THREE.Material => {
      if (!only(x) || isUniformDriven(x)) return x;
      const c = x.clone();
      if (isPSXPatched(x)) patchPSX(c); // Material.clone() drops onBeforeCompile
      copies.push(c);
      ownCopies.add(c);
      return c;
    };
    swaps.push({ mesh: m, before, copies });
    m.material = Array.isArray(before) ? before.map(copy) : copy(before);
  });
  return swaps;
}

/** Puts back the materials copyMeshMaterials replaced and frees the copies. */
export function restoreMeshMaterials(swaps: MaterialSwap[]): void {
  for (const s of swaps) {
    const keep = Array.isArray(s.before) ? s.before : [s.before];
    s.mesh.material = s.before;
    for (const c of s.copies) if (!keep.includes(c)) c.dispose();
  }
}

/**
 * Kept so existing callers compile. VFX.flash no longer clones materials (it swaps in flash variants and puts the originals back
 * when the flash ends), so an entity has nothing to free here. Callers can drop the call.
 */
export function disposeFlashClones(_root: THREE.Object3D): void {}

// ---------------------------------------------------------------------------
// Hit-flash variants (VFX.flash)
// ---------------------------------------------------------------------------

/** Flash steps: a hit flash fades through this many variants, so each (material, colour) has only a few. */
export const FLASH_STEPS = 4;
/** A hit flash tints the model by at most this share at its peak (a subtle tint; 1 turned the model into an opaque blob). */
export const FLASH_MAX_TINT = 0.3;
/** Longest hit flash (s); longer requests are clamped. */
export const FLASH_MAX_SEC = 0.15;

/** A material a hit flash shades: its emissive, or its colour when it has none. */
export type Flashable = THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; color?: THREE.Color };

/** True for a material a hit flash can shade. ShaderMaterials are driven per frame, so they are never flashed. */
export function flashable(m: THREE.Material): m is Flashable {
  const f = m as Flashable;
  return !(m as THREE.ShaderMaterial).isShaderMaterial && (!!f.emissive || !!f.color);
}

/** What a flashable material looked like before a flash shaded it. */
export interface FlashRest {
  emissive: THREE.Color | null;
  intensity: number;
  color: THREE.Color | null;
}

export function flashRest(m: Flashable): FlashRest {
  const rest: FlashRest = { emissive: null, intensity: m.emissiveIntensity ?? 1, color: null };
  if (m.emissive) rest.emissive = m.emissive.clone();
  if (m.color) rest.color = m.color.clone();
  return rest;
}

/**
 * Shades `m` toward `colour` by k (0..1): the flash mixes into the model's own colour (k 0.3 is a 30 % tint), and its glow
 * stays as it was (adding glow in the flash colour made an opaque blob). Materials without a colour mix into their glow instead.
 * k 0 puts `rest` back exactly.
 */
export function shadeFlash(m: Flashable, rest: FlashRest, colour: THREE.Color, k: number): void {
  if (rest.color && m.color) {
    m.color.copy(rest.color);
    if (k > 0) m.color.lerp(colour, k);
  } else if (rest.emissive && m.emissive) {
    m.emissive.copy(rest.emissive);
    if (k > 0) m.emissive.lerp(colour, k);
  }
}

/**
 * The flash variant of `origin` (a shared variant, or a per-entity material) at one flash step: the same material, shaded toward
 * `colour`. Built once per (origin, colour, step) through Assets.sharedMaterial, so it is registered (Assets.sharedSource maps it to
 * the real source) and it has the same type and defines as its origin, so no shader recompiles. It is refreshed from `origin` on
 * every use: per-entity materials keep changing (a fading corpse, a pulsing glow) and a flash must show their current look.
 */
export function flashVariant(origin: Flashable, colour: THREE.Color, step: number): Flashable {
  const v = Assets.sharedMaterial(origin, `flash|${origin.uuid}|${colour.getHex()}|${step}`, () => {});
  v.copy(origin);
  shadeFlash(v, flashRest(v), colour, (step / FLASH_STEPS) * FLASH_MAX_TINT);
  flashOrigin.set(v, origin);
  return v;
}
