import * as THREE from 'three';
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type DungeonDef } from '../types/dungeons';
import { patchPSX } from '../render/psx';
import { ParticleField } from './Particles';
import { bayer, canvasTexture, glowTexture, makeCanvas } from './ProceduralAssets';

/**
 * Dungeon atmosphere that makes the floor and the air feel lived-in: seeded grime/blood blotches on the floor (one instanced
 * mesh) and dust motes drifting through the torchlight (one particle draw call). OWNER: world module.
 */

const T = TILE_SIZE;
const PI = Math.PI;

export interface GrimeHost {
  def: DungeonDef;
  tileRoom(i: number, j: number): number;
  root: THREE.Object3D;
  disposables: { dispose(): void }[];
  isAvoided(x: number, z: number, pad: number): boolean;
  addUpdater(fn: (dt: number, t: number) => void): void;
}

/** Chunky 3-level blotch (alpha only matters; colour comes from the instance tint). */
function blotchTexture(seed: number): THREE.CanvasTexture {
  const S = 32;
  const { canvas, ctx } = makeCanvas(S, S);
  const rng = new RNG(seed);
  const img = ctx.createImageData(S, S);
  // a few overlapping soft discs with ragged edges
  const discs: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) discs.push([S / 2 + rng.range(-5, 5), S / 2 + rng.range(-5, 5), rng.range(4, 9)]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [cx, cy, r] of discs) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        v = Math.max(v, 1 - d);
      }
      v += (rng.next() - 0.5) * 0.25;
      const a = Math.round(Math.max(0, Math.min(1, v * 1.3)) * 3 + bayer(x, y) * 0.7) / 3;
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, { repeat: false, mipmaps: false });
}

export function buildFloorStains(host: GrimeHost): void {
  const def = host.def;
  const rng = new RNG(hashString(def.id + ':stains'));
  const list: { x: number; z: number; rot: number; s: number; tone: number }[] = [];
  def.rooms.forEach((room, idx) => {
    const density = room.autoDecor ?? 0.3;
    if (density <= 0.05) return;
    const { x, z, w, h } = room.rect;
    const n = Math.min(60, Math.round(w * h * density * 0.5));
    for (let k = 0; k < n; k++) {
      const tx = x + rng.int(0, w - 1), tz = z + rng.int(0, h - 1);
      if (host.tileRoom(tx, tz) !== idx) continue;
      const px = tx * T + rng.range(0.6, T - 0.6), pz = tz * T + rng.range(0.6, T - 0.6);
      if (host.isAvoided(px, pz, 0.3)) continue;
      list.push({ x: px, z: pz, rot: rng.range(0, PI * 2), s: rng.range(1.1, 3.4), tone: rng.next() });
    }
  });
  if (!list.length) return;
  const tex = blotchTexture(hashString(def.id + ':blotch'));
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  patchPSX(mat, { affine: false });
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const dark = new THREE.Color(0x0c0907), blood = new THREE.Color(0x2a0c0a), moss = new THREE.Color(0x0b140c);
  const c = new THREE.Color();
  list.forEach((it, i) => {
    q.setFromAxisAngle(Y, it.rot);
    p.set(it.x, 0.062, it.z);
    s.set(it.s, 1, it.s * (0.7 + 0.5 * ((it.tone * 7) % 1)));
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    c.copy(it.tone < 0.12 ? blood : it.tone < 0.2 ? moss : dark);
    im.setColorAt(i, c);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  im.renderOrder = 1;
  im.name = 'floor_grime';
  host.root.add(im);
  host.disposables.push(tex, geo, mat, im);
}

/** Dust motes in the air around the camera, tinted by the torch colour of the theme. */
export function buildMotes(host: GrimeHost): void {
  const th = host.def.theme;
  const rng = new RNG(hashString(host.def.id + ':motes'));
  const tex = glowTexture(16, 4, 1.2);
  const field = new ParticleField({ map: tex, blending: 'additive', wrap: [46, 12, 46], alpha: 0.42, intensity: 1.5, fog: [th.fogNear * 0.7, th.fogFar] });
  const col = new THREE.Color(th.torchColor).lerp(new THREE.Color(0xffffff), 0.45).getHex();
  for (let i = 0; i < 240; i++)
    field.add({
      pos: [rng.range(-23, 23), rng.range(0.3, 6), rng.range(-23, 23)],
      vel: [rng.range(-0.15, 0.15), rng.range(-0.03, 0.08), rng.range(-0.15, 0.15)],
      speed: rng.range(0.02, 0.06), size: rng.range(0.05, 0.11), sway: rng.range(0.2, 0.8), color: col,
    });
  field.build();
  host.root.add(field.mesh);
  // tex is the shared glow texture (ProceduralAssets): only the field is owned here
  host.disposables.push(field);
  host.addUpdater((_dt, t) => {
    const cam = G.engine?.activeCamera;
    field.update(t, cam ? cam.position : undefined);
  });
}
