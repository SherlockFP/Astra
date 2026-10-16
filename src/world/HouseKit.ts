import * as THREE from 'three';
import { boxesGeometry, GLOW_GAIN, materials, type Box } from './MagitechKit';

/**
 * Procedural house kit (Trove-style chunky voxels, WoW medieval base): four silhouette archetypes, each on a 5 m cell with its door
 * on +Z (local). Lit parts are vertex-coloured boxes; windows are emissive warm boxes on a shared HDR material whose level follows
 * the night mix (setHouseWindowLevel). One body mesh per (archetype, roof colour) and one glow mesh per archetype: a town adds a
 * handful of draw calls however many houses it places.
 *
 *   timber     2 storeys, the upper floor jetties out over the ground floor under a stepped gable roof, window boxes
 *   townhouse  3 storeys, stone base, steep hip roof with two dormers
 *   tower      round (octagonal) stone tower with a conical roof and a glowing finial
 *   hall       long tavern hall with a gable roof and a porch of hanging lanterns
 */

export type HouseArch = 'timber' | 'townhouse' | 'tower' | 'hall';

/** Trove-bright roof palette, one per district (blue, red, teal, purple, straw). */
export const ROOF = { blue: 0x2f6fd6, red: 0xc8323a, teal: 0x1c9c98, purple: 0x7b3fc4, straw: 0xd9a441 } as const;

const PLASTER = 0xe9dcc3;
const PLASTER_UP = 0xf3e7cf;
const WARM_PLASTER = 0xe8c79a;
const STONE = 0x8a8076;
const STONE_DARK = 0x5a5249;
const TIMBER = 0x5a3720;
const DOOR = 0x4a2c18;
const GREEN = 0x3f9a3a;
const WARM = 0xffb050;
const GOLD = 0xffc247;
const CYAN = 0x3fe0ff;
const BRASS = 0xc9952e;

const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: number): Box => ({ x, y, z, w, h, d, c });
const TAN22 = Math.tan(Math.PI / 8);

/** Boxes of an octagonal ring of apothem `a`: eight wall sides, each with its normal at k * 45 degrees. */
function octRing(a: number, y: number, h: number, c: number, thick = 0.5): Box[] {
  const len = 2 * a * TAN22 + 0.04;
  const out: Box[] = [];
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4;
    out.push({ x: a * Math.sin(t), y, z: a * Math.cos(t), w: len, h, d: thick, c, ry: t });
  }
  return out;
}

/** Stepped gable roof along Z (ridge on Z): four tiers, each 0.8 m high and 0.75 m narrower per side. */
function gableZ(halfW: number, len: number, y0: number, roof: number): Box[] {
  const out: Box[] = [];
  for (let k = 0; k < 4; k++) out.push(B(0, y0 + 0.4 + k * 0.8, 0, Math.max(0.5, 2 * (halfW - 0.75 * k)), 0.8, len, roof));
  return out;
}

/** Stepped roof along X with the ridge on X: depth shrinks per tier. */
function gableX(halfD: number, len: number, y0: number, roof: number): Box[] {
  const out: Box[] = [];
  for (let k = 0; k < 4; k++) out.push(B(0, y0 + 0.4 + k * 0.8, 0, len, 0.8, Math.max(0.4, 2 * (halfD - 0.65 * k)), roof));
  return out;
}

interface ArchParts { body: Box[]; glow: Box[] }

/** 2-storey timber-frame house, jettied upper floor, window boxes. Footprint 5.0 x 5.0 (+0.3 m jetty). */
function timber(roof: number): ArchParts {
  const body: Box[] = [
    B(0, 0.15, 0, 5.2, 0.3, 5.2, STONE_DARK),
    B(0, 1.65, 0, 4.9, 2.7, 4.9, PLASTER),
    B(0, 3.1, 0, 5.8, 0.3, 5.8, TIMBER),
    B(0, 4.65, 0, 5.5, 2.8, 5.5, PLASTER_UP),
    B(0, 6.2, 0, 5.8, 0.2, 5.8, TIMBER),
    B(0, 1.65, 2.52, 0.3, 2.7, 0.14, TIMBER), B(0, 1.65, -2.52, 0.3, 2.7, 0.14, TIMBER),
    B(-2.52, 1.65, 2.52, 0.3, 2.7, 0.3, TIMBER), B(2.52, 1.65, 2.52, 0.3, 2.7, 0.3, TIMBER),
    B(-2.52, 1.65, -2.52, 0.3, 2.7, 0.3, TIMBER), B(2.52, 1.65, -2.52, 0.3, 2.7, 0.3, TIMBER),
    B(-2.67, 4.65, 2.67, 0.3, 2.8, 0.3, TIMBER), B(2.67, 4.65, 2.67, 0.3, 2.8, 0.3, TIMBER),
    B(-2.67, 4.65, -2.67, 0.3, 2.8, 0.3, TIMBER), B(2.67, 4.65, -2.67, 0.3, 2.8, 0.3, TIMBER),
    B(0, 4.65, 2.8, 5.5, 0.16, 0.12, TIMBER),
    B(0, 1.15, 2.52, 0.9, 2.0, 0.1, DOOR),
    // window boxes under the upper windows: timber trough with green foliage
    B(-1.5, 4.0, 2.95, 1.2, 0.22, 0.32, TIMBER), B(-1.5, 4.2, 3.0, 1.1, 0.2, 0.3, GREEN),
    B(1.5, 4.0, 2.95, 1.2, 0.22, 0.32, TIMBER), B(1.5, 4.2, 3.0, 1.1, 0.2, 0.3, GREEN),
    ...gableZ(3.0, 6.0, 6.2, roof),
  ];
  const glow: Box[] = [
    B(-1.5, 1.7, 2.6, 0.7, 0.8, 0.06, WARM), B(1.5, 1.7, 2.6, 0.7, 0.8, 0.06, WARM),
    B(-1.5, 4.7, 2.84, 0.8, 0.9, 0.06, WARM), B(1.5, 4.7, 2.84, 0.8, 0.9, 0.06, WARM),
    B(2.6, 1.7, 0, 0.06, 0.8, 0.7, WARM), B(-2.6, 1.7, 0, 0.06, 0.8, 0.7, WARM),
    B(2.7, 4.7, 0, 0.06, 0.9, 0.8, WARM), B(-2.7, 4.7, 0, 0.06, 0.9, 0.8, WARM),
    B(0, 4.7, -2.78, 0.8, 0.9, 0.06, WARM),
  ];
  return { body, glow };
}

/** 3-storey townhouse: stone base, plaster floors, steep stepped hip roof, two dormers. Footprint 4.8 m. */
function townhouse(roof: number): ArchParts {
  const body: Box[] = [
    B(0, 0.15, 0, 4.9, 0.3, 4.9, STONE_DARK),
    B(0, 1.65, 0, 4.6, 2.7, 4.6, STONE),
    B(0, 3.1, 0, 4.9, 0.2, 4.9, STONE_DARK),
    B(0, 4.45, 0, 4.5, 2.5, 4.5, PLASTER),
    B(0, 5.85, 0, 4.9, 0.3, 4.9, 0x9a4a36),
    B(0, 7.2, 0, 4.5, 2.4, 4.5, PLASTER),
    B(0, 8.55, 0, 4.9, 0.3, 4.9, STONE_DARK),
    B(0, 1.2, 2.33, 0.9, 1.7, 0.1, DOOR),
  ];
  // steep hip roof: five tiers 0.9 m high, each 0.5 m narrower per side
  for (let k = 0; k < 5; k++) {
    const half = 2.4 - 0.5 * k;
    body.push(B(0, 8.7 + 0.45 + k * 0.9, 0, half * 2, 0.9, half * 2, roof));
  }
  // dormers on the front slope (tier 1 face at z = 1.9)
  body.push(B(0, 9.85, 2.0, 1.0, 0.8, 0.8, TIMBER), B(0, 10.35, 2.0, 1.2, 0.2, 0.95, roof));
  const glow: Box[] = [
    B(-1.4, 1.9, 2.36, 0.7, 0.9, 0.06, WARM), B(1.4, 1.9, 2.36, 0.7, 0.9, 0.06, WARM),
    B(-1.1, 4.8, 2.3, 0.7, 0.9, 0.06, WARM), B(1.1, 4.8, 2.3, 0.7, 0.9, 0.06, WARM),
    B(-1.1, 7.1, 2.24, 0.7, 0.8, 0.06, WARM), B(1.1, 7.1, 2.24, 0.7, 0.8, 0.06, WARM),
    B(2.36, 4.8, 0, 0.06, 0.9, 0.7, WARM), B(-2.36, 4.8, 0, 0.06, 0.9, 0.7, WARM),
    B(0, 9.85, 2.42, 0.6, 0.45, 0.05, GOLD),
  ];
  return { body, glow };
}

/** Round stone tower (octagonal voxel ring) with a conical roof of three tiers and a glowing finial. Radius ~2.2 m. */
function tower(roof: number): ArchParts {
  const body: Box[] = [
    ...octRing(2.2, 0.3, 0.6, STONE_DARK, 0.6),
    ...octRing(1.9, 3.7, 6.6, STONE, 0.5),
    ...octRing(1.95, 2.2, 0.22, STONE_DARK, 0.6),
    ...octRing(1.95, 5.6, 0.22, STONE_DARK, 0.6),
    ...octRing(1.95, 7.1, 0.3, STONE_DARK, 0.6),
    B(0, 0.9, 2.17, 0.8, 1.6, 0.14, DOOR),
  ];
  // conical roof: three octagonal tiers, each 1.3 m high and 0.6 m narrower
  const tiers: [number, number][] = [[2.4, 7.25], [1.8, 8.55], [1.2, 9.85]];
  for (const [a, y] of tiers) body.push(...octRing(a, y, 1.3, roof, 0.45));
  body.push(B(0, 10.75, 0, 0.3, 0.5, 0.3, BRASS));
  const glow: Box[] = [
    B(0, 5.4, 2.2, 0.5, 0.7, 0.06, WARM), B(0, 4.1, 2.2, 0.5, 0.7, 0.06, WARM),
    B(2.2, 5.4, 0, 0.06, 0.7, 0.5, WARM), B(-2.2, 5.4, 0, 0.06, 0.7, 0.5, WARM),
    B(0, 11.3, 0, 0.36, 0.6, 0.36, CYAN),
  ];
  return { body, glow };
}

/** Long tavern hall, gable roof along X, porch with hanging lanterns. Footprint 7.2 x 4.8 m. */
function hall(roof: number): ArchParts {
  const body: Box[] = [
    B(0, 0.15, 0, 7.4, 0.3, 4.9, STONE_DARK),
    B(0, 1.8, 0, 6.8, 3.0, 4.4, WARM_PLASTER),
    B(0, 2.0, 2.22, 6.8, 0.22, 0.12, TIMBER),
    B(0, 3.2, 2.22, 6.8, 0.22, 0.12, TIMBER),
    B(-3.35, 1.65, 2.25, 0.25, 2.7, 0.15, TIMBER), B(3.35, 1.65, 2.25, 0.25, 2.7, 0.15, TIMBER),
    B(-2.8, 1.65, 3.4, 0.25, 2.9, 0.25, TIMBER), B(2.8, 1.65, 3.4, 0.25, 2.9, 0.25, TIMBER),
    B(0, 1.2, 2.25, 1.0, 2.0, 0.12, DOOR),
    B(0, 3.15, 3.2, 7.0, 0.25, 2.0, roof),
    B(2.4, 5.6, -0.5, 0.7, 2.6, 0.7, STONE_DARK),
    ...gableX(2.6, 7.6, 3.3, roof),
  ];
  const glow: Box[] = [
    B(-2.1, 2.0, 2.26, 0.9, 0.8, 0.06, WARM), B(2.1, 2.0, 2.26, 0.9, 0.8, 0.06, WARM),
    B(-2.8, 2.6, 3.4, 0.3, 0.3, 0.3, GOLD), B(2.8, 2.6, 3.4, 0.3, 0.3, 0.3, GOLD),
    B(2.4, 7.0, -0.5, 0.36, 0.12, 0.36, CYAN),
    B(-3.45, 2.0, 0, 0.06, 0.8, 0.8, WARM), B(3.45, 2.0, 0, 0.06, 0.8, 0.8, WARM),
  ];
  return { body, glow };
}

const ARCH: Record<HouseArch, (roof: number) => ArchParts> = { timber, townhouse, tower, hall };

/** Emissive window material: the level follows the night mix (day: warm glass, night: lit windows). */
let windowMat: THREE.MeshBasicMaterial | null = null;
function houseWindowMaterial(): THREE.MeshBasicMaterial {
  windowMat ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return windowMat;
}

/** 0 = day (warm glass just under the bloom threshold), 1 = night (windows lit). Called by NightLight every frame. */
export function setHouseWindowLevel(level: number): void {
  houseWindowMaterial().color.setScalar(0.55 + 0.45 * Math.min(1, Math.max(0, level)));
}

/** One placed house: a cell centre on the ground (y), yaw (door direction) and the roof colour of its district. */
export interface HouseInst { arch: HouseArch; x: number; y: number; z: number; rotY: number; roof: number }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class HouseKit {
  readonly root = new THREE.Group();
  private list: HouseInst[] = [];
  private disposables: THREE.BufferGeometry[] = [];

  add(h: HouseInst): void {
    this.list.push(h);
  }

  get count(): number {
    return this.list.length;
  }

  /** Builds the instanced meshes. Call once, after the last add(). */
  build(): void {
    const mats = materials();
    const byBody = new Map<string, HouseInst[]>();
    const byGlow = new Map<HouseArch, HouseInst[]>();
    for (const h of this.list) {
      const k = `${h.arch}|${h.roof}`;
      byBody.set(k, [...(byBody.get(k) ?? []), h]);
      byGlow.set(h.arch, [...(byGlow.get(h.arch) ?? []), h]);
    }
    const place = (mesh: THREE.InstancedMesh, items: HouseInst[]): void => {
      items.forEach((h, i) => {
        _e.set(0, h.rotY, 0);
        _q.setFromEuler(_e);
        _p.set(h.x, h.y, h.z);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    };
    for (const [key, items] of byBody) {
      const [arch, roof] = key.split('|') as [HouseArch, string];
      const geo = boxesGeometry(ARCH[arch](Number(roof)).body, 1);
      this.disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, mats.body, items.length);
      place(mesh, items);
      this.root.add(mesh);
    }
    for (const [arch, items] of byGlow) {
      const geo = boxesGeometry(ARCH[arch](0).glow, GLOW_GAIN);
      this.disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, houseWindowMaterial(), items.length);
      place(mesh, items);
      this.root.add(mesh);
    }
  }

  dispose(): void {
    for (const g of this.disposables) g.dispose();
    this.disposables.length = 0;
    this.root.clear();
  }
}
