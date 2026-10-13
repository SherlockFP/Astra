import * as THREE from 'three';
import { G } from '../game/G';
import { psxify } from '../game/graphics';
import { NavGrid } from '../world/NavGrid';
import type { SceneTown } from './SceneTown';
import type { TownDef } from '../types/dungeons';
import { RNG } from '../core/utils';
import { DEFAULT_TOWN_DECOR } from './townDefaults';
import {
  addBasicLights, createGround, createSkyDome, groundTexture, instanceModel, ownGeo, ownMat, placeModel, propUrl, rigFlames, swayCloth, disposeOwned,
  type FlameRig,
} from './SceneKit';

/** Props this fallback needs (preloaded by TownScene only when it is used). */
export const FALLBACK_TOWN_PROPS = [
  'tree_oak_a', 'tree_oak_b', 'tree_pine_a', 'tree_autumn', 'bush_a', 'bush_b', 'rock_medium', 'rock_large', 'fence_stone', 'grass_tuft', 'flowers',
  'forge', 'anvil', 'alchemy_table', 'cauldron', 'market_stall', 'chest_iron', 'well', 'tent', 'signpost', 'lamp_post', 'barrel', 'crate_a', 'crate_b',
  'banner_red', 'banner_blue', 'banner_green', 'statue_hooded', 'brazier', 'wagon', 'sacks',
].map(propUrl);

/**
 * Minimal playable town used ONLY when the world module's buildTown() is unavailable or throws: golden-hour sky + fog,
 * ground with plaza / main road / portal-hall platform, a perimeter of trees and low walls, and light decor at the stations.
 * OWNER: scenes module (safety net, not the shipping look).
 */
export async function buildFallbackTown(def: TownDef, scene: THREE.Scene, withDecor: boolean): Promise<SceneTown> {
  const root = new THREE.Group();
  const rng = new RNG(2024);
  const half = Math.min(def.size?.[0] ?? 120, def.size?.[1] ?? 120) / 2;

  scene.background = new THREE.Color(0xd8c0a0);
  scene.fog = new THREE.Fog(0xd8c0a0, 36, 150);
  const sky = createSkyDome(0x4a78c8, 0xb8c0d0, 0xf4d8a8, 480);
  root.add(sky.mesh);
  const { sun } = addBasicLights(scene, { hemiSky: 0xffe0b0, hemiGround: 0x504030, hemiIntensity: 1.0, sun: { color: 0xffc890, intensity: 1.5, pos: [-30, 28, 40], shadow: 46 } });
  if (sun) {
    sun.target.position.set(0, 0, 0);
    scene.add(sun.target);
  }

  const ground = createGround({ radius: 220, inner: 0x8c8460, innerRadius: 60, outer: 0x4c6c36, far: 0x2d4a2a, fadeRadius: 90, seed: 31, textureRepeat: 0.2 });
  root.add(ground);

  // main road, plaza and portal-hall platform (flat decals above the ground)
  const dirtTex = groundTexture(5);
  const dirtMat = ownMat(new THREE.MeshLambertMaterial({ map: dirtTex, color: 0xa08a64 }));
  const road = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(8, 90)), dirtMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, 16);
  road.receiveShadow = true;
  const stoneMat = ownMat(new THREE.MeshLambertMaterial({ map: groundTexture(9), color: 0xb0a898 }));
  const plaza = new THREE.Mesh(ownGeo(new THREE.CircleGeometry(14, 28)), stoneMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.03, 8);
  plaza.receiveShadow = true;
  const hall = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(48, 30)), stoneMat);
  hall.rotation.x = -Math.PI / 2;
  hall.position.set(0, 0.03, -43);
  hall.receiveShadow = true;
  root.add(road, plaza, hall);
  psxify(road, 'world');
  psxify(plaza, 'world');
  psxify(hall, 'world');

  // perimeter: low stone wall + tree belt
  const walls: { x: number; z: number; rotY: number }[] = [];
  for (let i = -half + 2; i <= half - 2; i += 4) {
    walls.push({ x: i, z: -half, rotY: 0 }, { x: i, z: half, rotY: 0 }, { x: -half, z: i, rotY: Math.PI / 2 }, { x: half, z: i, rotY: Math.PI / 2 });
  }
  instanceModel(root, propUrl('fence_stone'), walls.filter((w) => !(w.z === half && Math.abs(w.x) < 7)).map((w) => ({ x: w.x, z: w.z, rotY: w.rotY, scale: [1, 1.25, 1.1] })));
  const treeNames = ['tree_oak_a', 'tree_oak_b', 'tree_pine_a', 'tree_autumn'];
  for (let i = 0; i < 70; i++) {
    const side = rng.int(0, 3);
    const along = rng.range(-half - 6, half + 6);
    const out = half + 3 + rng.range(0, 26);
    const x = side < 2 ? along : (side === 2 ? -out : out);
    const z = side < 2 ? (side === 0 ? -out : out) : along;
    if (Math.abs(x) < 8 && z > half) continue; // south gate opening
    placeModel(root, propUrl(rng.pick(treeNames)), { pos: [x, 0, z], rot: rng.next() * 6.28, scale: 1.1 + rng.next() * 0.9, castShadow: true });
  }
  // tufts & flowers inside the walls
  const tufts: { x: number; z: number; rotY: number; scale: number }[] = [];
  for (let i = 0; i < 420; i++) {
    const x = rng.range(-half + 2, half - 2), z = rng.range(-half + 2, half - 2);
    if (Math.abs(x) < 5 && z > -26) continue; // keep the road clean
    if (Math.hypot(x, z - 8) < 15) continue;
    if (Math.abs(x) < 26 && z < -26 && z > -60) continue;
    tufts.push({ x, z, rotY: rng.next() * 6.28, scale: 0.8 + rng.next() * 0.8 });
  }
  instanceModel(root, propUrl('grass_tuft'), tufts);
  instanceModel(root, propUrl('flowers'), tufts.slice(0, 80).map((t) => ({ ...t, x: t.x + 0.7 })));

  const nav = new NavGrid({ originX: -half - 12, originZ: -half - 12, width: (half + 12) * 2, depth: (half + 12) * 2, cellSize: 1, walkable: true });
  const e = half - 0.8;
  nav.setRect(-half - 12, -half - 12, half + 12, -e, false);
  nav.setRect(-half - 12, e, -7, half + 12, false);
  nav.setRect(7, e, half + 12, half + 12, false);
  nav.setRect(-half - 12, -half - 12, -e, half + 12, false);
  nav.setRect(e, -half - 12, half + 12, half + 12, false);

  const flames: FlameRig[] = [];
  const banners: THREE.Object3D[] = [];
  let lightsActive = 0;
  if (withDecor) {
    for (const d of DEFAULT_TOWN_DECOR) {
      const m = placeModel(root, propUrl(d.prop), { pos: [d.pos[0], 0, d.pos[1]], rot: d.rot ?? 0, scale: d.scale ?? 1, castShadow: true });
      if (d.block) nav.setCircle(d.pos[0], d.pos[1], d.block, false);
      if (d.prop.startsWith('banner')) banners.push(m);
      if (d.prop === 'forge') {
        flames.push(rigFlames(m, 3));
        const l = new THREE.PointLight(0xff7a2a, 40, 14, 2);
        l.position.set(d.pos[0], 2, d.pos[1]);
        root.add(l);
        lightsActive++;
      }
    }
  }
  scene.add(root);

  const spawn = new THREE.Vector3(def.spawn?.pos?.[0] ?? 0, 0, def.spawn?.pos?.[2] ?? 26);
  const spawnYaw = ((def.spawn?.facing ?? 180) * Math.PI) / 180;
  let t = 0;
  return {
    root,
    nav,
    spawn,
    spawnYaw,
    lightsActive,
    update(dt: number) {
      t += dt;
      sky.mesh.position.copy(G.engine.activeCamera.position);
      for (const f of flames) f.update(t);
      banners.forEach((b, i) => swayCloth(b, t, 0.08, i));
    },
    sunFollow(p: THREE.Vector3) {
      if (!sun) return;
      sun.target.position.set(p.x, 0, p.z);
      sun.position.set(p.x - 30, 28, p.z + 40);
    },
    dispose() {
      root.removeFromParent();
      disposeOwned(root);
    },
  };
}
