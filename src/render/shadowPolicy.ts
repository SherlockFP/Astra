import * as THREE from 'three';

/**
 * Shadow casting policy, shadow map cadence and fade flags (render module). Every castShadow decision in src/world goes through
 * here, so a caster means the same thing in every scene. The shadow pass draws every caster again, so casters are kept to what
 * reads as a shadow: characters and solid static pieces. Tall static pieces that do not cast are flagged fadeable instead, so the
 * orbit camera can still fade them when they stand between it and the player (camera/OccluderFade). There is one shadow box per
 * scene (town sun, dungeon moon, open-world sun), so the redraw anchor below is shared. OWNER: render module.
 */

/** Static meshes whose world bounding-sphere radius (m) reaches this cast shadows. */
export const SHADOW_CASTER_RADIUS = 0.9;
/** Meshes whose highest point sits below this height (m) never cast: floors, rugs, flat ground cover. */
export const SHADOW_GROUND_TOP = 0.25;
/** Shadow map redraw cadence while nothing changes (engine seconds): 30 Hz, with 2 ms of slack so a 60 fps frame always qualifies. */
export const SHADOW_EVERY_SEC = 1 / 30 - 0.002;
/** A re-centre more than this many texels away from the map on screen redraws it at once; smaller moves wait for the cadence. */
export const SHADOW_RECENTRE_TEXELS = 8;
/** Static meshes at least this tall (world m) are fadeable: the orbit camera fades them when they block the view, casting or not. */
export const FADE_MIN_HEIGHT = 0.6;

const _box = new THREE.Box3();

/**
 * Caster rule on measured numbers (world metres): bounding-sphere radius and height of the top. Instanced batches use it per
 * instance (see Instancing.build); shouldCastShadow uses it per mesh.
 */
export function isShadowCaster(radius: number, top: number): boolean {
  return radius >= SHADOW_CASTER_RADIUS && top >= SHADOW_GROUND_TOP;
}

/** Fade rule on a measured world height (m). Instanced batches use it per piece instance; markFadeable uses it per mesh. */
export function isFadeableHeight(height: number): boolean {
  return height >= FADE_MIN_HEIGHT;
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

/** World-space height (m) of a mesh's geometry box, 0 without geometry. Updates the mesh's world matrix first. */
function worldHeight(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  if (!geo) return 0;
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingBox) return 0;
  mesh.updateWorldMatrix(true, false);
  _box.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
  return _box.max.y - _box.min.y;
}

/**
 * Flags the static meshes under `root` that stand at least FADE_MIN_HEIGHT tall as fadeable (userData.fadeable), casting or not.
 * Skinned meshes are not scenery and are left alone (they always cast). Reads the world transform: call it after placing the object.
 */
export function markFadeable(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    m.userData.fadeable = isFadeableHeight(worldHeight(m));
  });
}

/**
 * Sets castShadow on every mesh under `root` by shouldCastShadow, and flags the tall ones fadeable (markFadeable). Receiving is left
 * as the builder set it. `allow` = false turns casting off for the whole tree (ghostly or faded props).
 */
export function applyShadowPolicy(root: THREE.Object3D, allow = true): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = allow && shouldCastShadow(m);
  });
  markFadeable(root);
}

/** Snapped centre of the shadow box this frame, and the centre the map on screen was drawn for (view plane, m). */
const centre = { x: NaN, y: NaN };
const drawn = { x: NaN, y: NaN };
let pending = true;
/** Engine time (s) of the last drawn shadow map. */
let lastDraw = -Infinity;

/** The shadow picture changed (a light was set up, the scene changed, shadows or render settings toggled): draw the map next frame. */
export function requestShadowMapUpdate(): void {
  pending = true;
}

/**
 * Reports the snapped centre of the shadow box for this frame (view plane, m; `texel` = m per shadow texel), from the light follower
 * (world/ShadowFollow). A centre more than SHADOW_RECENTRE_TEXELS away from the drawn map redraws it at once. Smaller moves are left to
 * the cadence, so a walking player refreshes the shadows at 30 Hz instead of every frame. Scene updaters run before the shadow
 * updater (scheduleShadowMap), so the decision sees this frame's centre.
 */
export function noteShadowCentre(x: number, y: number, texel: number): void {
  centre.x = x;
  centre.y = y;
  if (Math.hypot(x - drawn.x, y - drawn.y) > SHADOW_RECENTRE_TEXELS * texel) pending = true;
}

/**
 * Per-frame updater (game/graphics installs it before the render). Sets renderer.shadowMap.needsUpdate for this frame: when the cadence
 * is due (SHADOW_EVERY_SEC since the last draw) or at once when requested. `time` is the engine time the updater receives; without it
 * the wall clock is used. With autoUpdate off, a light's shadow matrix and its map are refreshed together, so the frames in between
 * stay consistent.
 */
export function scheduleShadowMap(shadowMap: THREE.WebGLRenderer['shadowMap'], time = performance.now() / 1000): void {
  const since = time - lastDraw;
  if (!pending && since >= 0 && since < SHADOW_EVERY_SEC) return;
  pending = false;
  lastDraw = time;
  drawn.x = centre.x;
  drawn.y = centre.y;
  shadowMap.needsUpdate = true;
}
