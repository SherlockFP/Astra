import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { G } from '../game/G';
import { Engine } from '../core/Engine';
import { EventBus } from '../core/EventBus';
import { Assets } from '../core/Assets';
import { Settings } from '../core/Settings';
import { installGraphics } from '../game/graphics';
import { World } from '../world/World';

/**
 * Minimal, self-contained boot for dev/world.html: only the core services the world builders need
 * (engine, events, assets, settings + PSX graphics), with stub vfx/audio. Keeps this page independent from
 * in-progress modules (ui, combat...). Add ?vfx=1 to load the real VFX service.
 */
export async function bootWorldDev(): Promise<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; world: World; orbit: OrbitControls; onFrame(fn: (dt: number) => void): void }> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  G.events = new EventBus();
  G.settings = new Settings();
  G.engine = new Engine(canvas);
  G.assets = new Assets();
  const noop = () => ({ alive: false, stop() {} });
  G.audio = { play() {}, music() {}, init: async () => {}, update() {}, setListener() {}, applyVolumes() {} } as never;
  G.vfx = { init: async () => {}, attach() {}, spawn: noop, update() {}, clear() {}, blobShadow: () => new THREE.Group() } as never;
  installGraphics();
  if (new URLSearchParams(location.search).get('vfx') === '1') {
    try {
      const { VFX } = await import('../vfx/VFX');
      const v = new VFX();
      await v.init();
      G.vfx = v;
    } catch (e) {
      console.warn('[dev/world] real VFX unavailable', e);
    }
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14121a);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  camera.position.set(10, 9, 12);
  const world = new World(scene);
  G.world = world;
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(0, 1, 0);
  G.engine.setView(scene, camera);
  G.vfx.attach(scene, camera);
  const fns: ((dt: number) => void)[] = [];
  G.engine.onUpdate((dt) => {
    world.update(dt);
    for (const f of fns) f(dt);
    if (orbit.enabled) orbit.update();
  }, 0);
  G.engine.onUpdate((dt) => G.vfx.update(dt), 50);
  G.engine.start();
  return { scene, camera, world, orbit, onFrame: (fn) => fns.push(fn) };
}
