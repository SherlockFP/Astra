import * as THREE from 'three';
import { G } from '../game/G';

/**
 * View test for entities (enemies, NPCs). The frustum is built once per engine frame from the camera that renders the scene
 * (G.engine.activeCamera). Entities update before the camera moves, so the test sees the previous frame's camera: callers
 * pass a sphere that includes a margin covering that lag and the parts they own (labels, weapon reach, shadow reach).
 */
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
let cacheFrame = -1;
let cacheCam: THREE.Camera | null = null;

/** Rebuilds the frustum when the engine frame or the active camera changed. False while no camera exists. */
function frustumNow(): boolean {
  const engine = G.engine;
  const cam = engine?.activeCamera ?? null;
  if (!cam) return false;
  if (cacheFrame === engine.frame && cacheCam === cam) return true;
  cacheFrame = engine.frame;
  cacheCam = cam;
  cam.updateMatrixWorld();
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
  return true;
}

/** True when the sphere (world space, radius in metres) may touch the view. Always true before a camera exists. */
export function inView(x: number, y: number, z: number, radius: number): boolean {
  if (!frustumNow()) return true;
  _sphere.center.set(x, y, z);
  _sphere.radius = radius;
  return _frustum.intersectsSphere(_sphere);
}
