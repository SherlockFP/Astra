import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { G } from '../game/G';
import { createServices, installServiceUpdates } from '../game/Game';
import { World } from '../world/World';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/alegreya-sans/400.css';
import '../ui/styles/base.css';

export interface Harness {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: World;
  orbit: OrbitControls;
  /** Register extra per-frame logic (runs at scene order 0 after world.update). */
  onFrame(fn: (dt: number) => void): void;
}

/**
 * Dev/test harness for isolated module pages (dev/*.html). Boots all services exactly like the game,
 * but instead of scenes creates one scene + orbit camera + World (G.world) with a lit floor.
 * Usage in a dev page script:  const h = await bootHarness(); ...build your thing into h.scene / h.world...
 */
export async function bootHarness(opts: { floor?: boolean; floorSize?: number; orbit?: boolean } = {}): Promise<Harness> {
  createServices();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14121a);
  scene.fog = new THREE.Fog(0x14121a, 30, 120);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  camera.position.set(10, 9, 12);
  const world = new World(scene);
  G.world = world;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x302418, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
  scene.add(sun);
  if (opts.floor !== false) {
    const size = opts.floorSize ?? 80;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(size, size / 4, 0x555555, 0x2a2a2a));
  }

  const orbit = new OrbitControls(camera, G.engine.canvas);
  orbit.target.set(0, 1, 0);
  orbit.enabled = opts.orbit !== false;
  G.engine.setView(scene, camera);
  G.vfx.attach(scene, camera);

  const frameFns: ((dt: number) => void)[] = [];
  G.engine.onUpdate((dt) => {
    world.update(dt);
    for (const f of frameFns) f(dt);
    if (orbit.enabled) orbit.update();
  }, 0);
  installServiceUpdates();
  G.audio.init().catch(() => {});
  await G.vfx.init().catch((e) => console.warn('[harness] vfx init', e));
  G.engine.start();
  return { scene, camera, world, orbit, onFrame: (fn) => frameFns.push(fn) };
}
