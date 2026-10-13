import * as THREE from 'three';

/**
 * Shadow casting policy and shadow map cadence (render module). Every castShadow decision in src/world goes through here, so a
 * caster means the same thing in every scene. The shadow pass draws every caster again, so casters are kept to what reads as a
 * shadow: characters and solid static pieces. OWNER: render module.
 */

/** Static meshes whose world bounding-sphere radius (m) reaches this cast shadows. */
export const SHADOW_CASTER_RADIUS = 0.9;
/** Meshes whose highest point sits below this height (m) never cast: floors, rugs, flat ground cover. */
export const SHADOW_GROUND_TOP = 0.25;
/** Shadow map redraw cadence while nothing changes, in frames (2 = 30 Hz at 60 fps). */
export const SHADOW_EVERY_FRAMES = 2;

const _box = new THREE.Box3();

/**
 * Caster rule on measured numbers (world metres): bounding-sphere radius and height of the top. Instanced batches use it per
 * instance (see Instancing.build); shouldCastShadow uses it per mesh.
 */
export function isShadowCaster(radius: number, top: number): boolean {
  return radius >= SHADOW_CASTER_RADIUS && top >= SHADOW_GROUND_TOP;
}

/**
 * True when this mesh should cast a shadow. Skinned meshes (characters, enemies, NPCs) always do. A static mesh does when it is a
 * solid object with a world bounding-sphere radius of at least SHADOW_CASTER_RADIUS and a top above SHADOW_GROUND_TOP. Non-meshes,
 * transparent or additive meshes (glass, decals, glow quads, particles), floors and ground-level meshes only receive. Terrain is
 * never passed here (it stays receive-only). Reads the world transform: call it after placing the object.
 */
export function shouldCastShadow(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return false;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return true;
  const mat = mesh.material;
  const list = Array.isArray(mat) ? mat : [mat];
  if (list.every((m) => !m || m.transparent || m.blending === THREE.AdditiveBlending)) return false;
  const geo = mesh.geometry;
  if (!geo) return false;
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox || !geo.boundingSphere) return false;
  object.updateWorldMatrix(true, false);
  const e = object.matrixWorld.elements;
  const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
  _box.copy(geo.boundingBox).applyMatrix4(object.matrixWorld);
  return isShadowCaster(geo.boundingSphere.radius * Math.max(sx, sy, sz), _box.max.y);
}

/**
 * Sets castShadow on every mesh under `root` by shouldCastShadow. Receiving is left as the builder set it. `allow` = false turns
 * casting off for the whole tree (ghostly or faded props).
 */
export function applyShadowPolicy(root: THREE.Object3D, allow = true): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = allow && shouldCastShadow(m);
  });
}

let pending = true;
let frameNo = 0;

/** The shadow picture changed (a light was set up or re-centred, the scene changed, shadows toggled): draw the map next frame. */
export function requestShadowMapUpdate(): void {
  pending = true;
}

/**
 * Per-frame updater (game/graphics installs it before the render). Sets renderer.shadowMap.needsUpdate for this frame: on the
 * cadence, or at once when requested. With autoUpdate off, a light's shadow matrix and its map are refreshed together, so the
 * frames in between stay consistent.
 */
export function scheduleShadowMap(shadowMap: THREE.WebGLRenderer['shadowMap']): void {
  frameNo++;
  if (!pending && frameNo % SHADOW_EVERY_FRAMES !== 0) return;
  pending = false;
  shadowMap.needsUpdate = true;
}
