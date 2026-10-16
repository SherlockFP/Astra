import * as THREE from 'three';
import { shellMaterial } from './Meshes';
import { G } from '../game/G';

/**
 * Readability rim on up to TWO entities (WoW clarity): the hovered unit and the target, each in its own slot. A thin fresnel
 * shell (the same shader as the weapon glow) over every mesh of its model. Hostile enemies get a red rim, friendly NPCs a
 * green one. Shells are added only while the entity is highlighted and removed when it is not.
 */

export type RimKind = 'hostile' | 'friendly' | 'neutral';
/** Two rims can show at once: the one under the cursor (hover) and the selected unit (target). */
export type RimSlot = 'hover' | 'target';

const RIM = {
  hostile: { color: 0xff3a2a, power: 2.4, inflate: 0.022, alpha: 0.95 },
  friendly: { color: 0x46ff6e, power: 2.4, inflate: 0.022, alpha: 0.9 },
  neutral: { color: 0xffd23a, power: 2.4, inflate: 0.022, alpha: 0.95 },
} as const;

/** Faint distance rim (setFarRim): one shared material per colour, so a far enemy costs one extra draw per mesh and no new program. */
const FAR_RIM: Record<'hostile' | 'neutral', { color: number }> = {
  hostile: { color: 0xff3a2a },
  neutral: { color: 0xffd23a },
};
const farMats: Partial<Record<'hostile' | 'neutral', THREE.ShaderMaterial>> = {};
/** Far rims keep a bounding sphere (root-local centre, radius) so cullFarRims() can hide the shells of off-screen enemies. */
interface FarEntry { kind: 'hostile' | 'neutral'; shells: THREE.Mesh[]; root: THREE.Object3D; center: THREE.Vector3; radius: number }
const farShells = new Map<THREE.Object3D, FarEntry>();

/**
 * Faint always-on edge for an enemy beyond ~25 m, so it does not vanish into foliage (vfx stays off near the player, where the
 * character rim and the hover rim already read). kind null removes it. Same root and kind is a no-op.
 */
export function setFarRim(root: THREE.Object3D, kind: 'hostile' | 'neutral' | null): void {
  const cur = farShells.get(root);
  if (cur && kind === cur.kind) return;
  if (cur) {
    for (const s of cur.shells) s.removeFromParent();
    farShells.delete(root);
  }
  if (!kind) return;
  const mat = (farMats[kind] ??= shellMaterial(FAR_RIM[kind].color, { power: 2.0, inflate: 0.014, alpha: 0.32, base: 0, additive: false }));
  const box = new THREE.Box3().setFromObject(root);
  const center = root.worldToLocal(box.getCenter(new THREE.Vector3()));
  const radius = box.isEmpty() ? 3 : box.getSize(new THREE.Vector3()).length() * 0.5 + 1;
  const shells: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o.userData.vfxShell || o.userData.noRim || !m.geometry) return;
    // a shadow never gets a rim; nor do tiny parts (eyes, tongue, ...) below 15 % of the enemy's own size
    for (let p: THREE.Object3D | null = o; p && p !== root.parent; p = p.parent) if (p.name === 'blobShadow' || p.userData.shadow) return;
    if (new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).length() * 0.5 < 0.15 * radius) return;
    const sk = m as THREE.SkinnedMesh;
    let shell: THREE.Mesh;
    if (sk.isSkinnedMesh && sk.skeleton) {
      const s = new THREE.SkinnedMesh(m.geometry, mat);
      s.bind(sk.skeleton, sk.bindMatrix);
      shell = s;
    } else shell = new THREE.Mesh(m.geometry, mat);
    shell.userData.vfxShell = true;
    shell.renderOrder = 11;
    shell.frustumCulled = false;
    m.add(shell);
    shells.push(shell);
  });
  farShells.set(root, { kind, shells, root, center, radius });
}

const _frustum = new THREE.Frustum();
const _projView = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _centerW = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * Class rim bodies (CharacterModel addClassRim) drawn at once, nearest first. A KayKit body is 6 skinned meshes, so 2 bodies
 * are 12 shell draws: the town with 12 players and 79 NPCs stays within +15 draw calls of the no-rim frame.
 */
export const CLASS_RIM_BODIES = 2;
interface ClassRimEntry { body: THREE.Object3D; shells: THREE.Mesh[]; range: () => number; inWorld: boolean }
const classRims = new Set<ClassRimEntry>();

/** Registers the shells of one class-rim body. `range()` gives the distance (m) from the local player inside which they may show. */
export function registerClassRim(body: THREE.Object3D, shells: THREE.Mesh[], range: () => number): void {
  if (shells.length) classRims.add({ body, shells, range, inWorld: false });
}

function inWorldScene(o: THREE.Object3D): boolean {
  const scene = G.world?.scene;
  if (!scene) return false;
  let top = o;
  while (top.parent) top = top.parent;
  return top === scene;
}

function setShells(shells: THREE.Mesh[], vis: boolean): void {
  for (const s of shells) if (s.visible !== vis) s.visible = vis;
}

/**
 * Class rims: a body's shells are drawn only inside its range (remote players 25 m, NPCs the full character tier), in the camera
 * frustum, and for the CLASS_RIM_BODIES nearest such bodies. Bodies outside the world scene (menu, panel preview) are not touched.
 */
function cullClassRims(): void {
  if (classRims.size === 0) return;
  const origin = G.player?.position ?? null;
  const near: { e: ClassRimEntry; d: number }[] = [];
  for (const e of classRims) {
    if (!inWorldScene(e.body)) {
      if (e.inWorld) classRims.delete(e); // removed from the world: forget it
      continue;
    }
    e.inWorld = true;
    e.body.getWorldPosition(_centerW);
    const d = origin ? origin.distanceTo(_centerW) : 0;
    _c.copy(_centerW);
    _c.y += 0.9;
    _sphere.set(_c, 1.3);
    if (d < e.range() && _frustum.intersectsSphere(_sphere)) near.push({ e, d });
    else setShells(e.shells, false);
  }
  near.sort((a, b) => a.d - b.d);
  near.forEach((c, i) => setShells(c.e.shells, i < CLASS_RIM_BODIES));
}

/**
 * Per frame: a far-rim shell is drawn only while its enemy's bounding sphere is in the camera frustum, and the class rims follow
 * cullClassRims. The shells never change the look (they sit on the body), so culled ones cost no draw calls. Call after the camera has moved.
 */
export function cullFarRims(cam: THREE.Camera): void {
  if (farShells.size === 0 && classRims.size === 0) return;
  cam.updateMatrixWorld();
  _projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_projView);
  cullClassRims();
  for (const e of farShells.values()) {
    _centerW.copy(e.center);
    e.root.localToWorld(_centerW);
    _sphere.set(_centerW, e.radius);
    const vis = _frustum.intersectsSphere(_sphere);
    for (const s of e.shells) if (s.visible !== vis) s.visible = vis;
  }
}

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
