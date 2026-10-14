import * as THREE from 'three';
import { noteShadowCentre, requestShadowMapUpdate } from '../render/shadowPolicy';

/**
 * Shadow box of a scene's one shadow-casting directional light (town sun, dungeon moon, open-world sun). The ortho box is
 * SHADOW_HALF_EXTENT metres around the focus (the local player) and is re-centred every frame. Its centre is snapped to whole
 * shadow texels in the light's view plane, so shadow edges do not crawl while the player walks. The snapped centre is reported to
 * render/shadowPolicy, which redraws the map at once only after the centre has moved far enough (SHADOW_RECENTRE_TEXELS); smaller
 * moves are picked up by the shadow cadence. OWNER: world module.
 */

/** Half-size (m) of the shadow box around the focus point. */
export const SHADOW_HALF_EXTENT = 20;
/** Square shadow map resolution (texels). The engine caps shadow maps at the same size. */
export const SHADOW_MAP_SIZE = 1024;

const UP = new THREE.Vector3(0, 1, 0);
const _toSun = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _t = new THREE.Vector3();

/**
 * One-time setup of a directional shadow light: shadow casting on, map size, and the ortho box (+-SHADOW_HALF_EXTENT).
 * The box is placed per frame by followShadowBox().
 */
export function configureShadowBox(light: THREE.DirectionalLight, o: { near?: number; far?: number } = {}): void {
  light.castShadow = true;
  light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const sc = light.shadow.camera;
  sc.left = -SHADOW_HALF_EXTENT;
  sc.right = SHADOW_HALF_EXTENT;
  sc.top = SHADOW_HALF_EXTENT;
  sc.bottom = -SHADOW_HALF_EXTENT;
  sc.near = o.near ?? 1;
  sc.far = o.far ?? 220;
  sc.updateProjectionMatrix();
  requestShadowMapUpdate();
}

/**
 * Places the light for this frame. The target sits on `focus` at ground level and the light sits `distance` m back along
 * `toSun` (the direction towards the sun). The target is slid inside the light's view plane onto a texel corner, so the
 * shadow map grid stays fixed in the world while the focus moves. `groundY` is the ground height under the focus (rolling terrain, default 0).
 */
export function followShadowBox(light: THREE.DirectionalLight, focus: THREE.Vector3, toSun: THREE.Vector3, distance: number, groundY = 0): void {
  _toSun.copy(toSun).normalize();
  // View basis of a light looking along -toSun with up = world Y (the same basis three.js uses for a shadow camera).
  _x.crossVectors(UP, _toSun);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();
  _y.crossVectors(_toSun, _x).normalize();
  const texel = (2 * SHADOW_HALF_EXTENT) / SHADOW_MAP_SIZE;
  _t.set(focus.x, groundY, focus.z); // rolling terrain: the box is centred on the ground under the focus, not on the plane y = 0
  const px = _t.dot(_x), py = _t.dot(_y);
  const sx = Math.round(px / texel) * texel, sy = Math.round(py / texel) * texel;
  noteShadowCentre(sx, sy, texel);
  _t.addScaledVector(_x, sx - px).addScaledVector(_y, sy - py);
  light.target.position.copy(_t);
  light.target.updateMatrixWorld();
  light.position.copy(_t).addScaledVector(_toSun, distance);
  light.updateMatrixWorld();
}
