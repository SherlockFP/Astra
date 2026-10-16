import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Magitech decoration kit: procedural chunky-voxel parts (Trove-style bold silhouettes, saturated flat colours) with a WoW
 * Silvermoon / Dalaran glow layer. Every part is merged into one geometry per material and drawn instanced, so a town adds a
 * handful of draw calls regardless of how many lamps or spires it places.
 *
 * Emissive parts are coloured above 1.0 in linear HDR (the glow multiplies the colour by GLOW_GAIN), so only the glow crosses
 * the bloom threshold; lit surfaces stay below 1.0 and do not blow out at noon. Pivot: the base centre, metres, +Y up.
 */

/** One axis-aligned voxel box in part space (ry: yaw about the box centre, for octagonal rings). */
export interface Box { x: number; y: number; z: number; w: number; h: number; d: number; c: number; ry?: number }

/** Glow multiplier for emissive colours. A glow channel of 1.0 * GLOW_GAIN lands above the bloom threshold. */
export const GLOW_GAIN = 1.6;

/** Stone / timber / brass / violet / cloth palettes (sRGB hex; kept saturated for the Trove read). */
export const MAGI = {
  stone: 0x8a8076,
  stoneDark: 0x5a5249,
  timber: 0x7a4a2a,
  brass: 0xc9952e,
  brassDark: 0x7d5a1c,
  violet: 0x5b3a9e,
  violetDark: 0x2e1d57,
  cyan: 0x3fe0ff,
  magenta: 0xff3fb4,
  arcane: 0xa070ff,
  gold: 0xffc247,
  cloth: 0xc2262e,
} as const;

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/** Part definitions: body boxes (lit) and glow boxes (emissive). Built once, reused by every instance. */
interface PartDef { body: Box[]; glow: Box[] }

const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: number): Box => ({ x, y, z, w, h, d, c });

const PARTS = {
  /** Crystal lamp post: stone plinth, brass pole, a big cyan crystal lantern under a violet cap (readable from the road). ~4 m. */
  lamp: {
    body: [
      B(0, 0.2, 0, 0.9, 0.4, 0.9, MAGI.stone),
      B(0, 0.6, 0, 0.6, 0.4, 0.6, MAGI.stoneDark),
      B(0, 2.3, 0, 0.22, 3.0, 0.22, MAGI.brass),
      B(0, 3.5, 0, 0.7, 0.18, 0.7, MAGI.brassDark),
      B(0, 3.95, 0, 0.9, 0.16, 0.9, MAGI.violetDark),
    ],
    glow: [B(0, 3.0, 0, 0.6, 1.0, 0.6, MAGI.cyan), B(0, 3.62, 0, 0.3, 0.3, 0.3, MAGI.gold)],
  },
  /** Rune conduit strip, one metre long, set into a wall at knee height (or along the wall top). */
  conduit: {
    body: [B(0, 0, 0, 1, 0.22, 0.14, MAGI.stoneDark)],
    glow: [B(0, 0, 0.06, 1, 0.1, 0.04, MAGI.magenta)],
  },
  /** Arcane lantern: a small violet crystal on a thin brass hanger; the instance bobs (see MagitechKit.update). */
  lantern: {
    body: [B(0, 0, 0, 0.08, 0.6, 0.08, MAGI.brass)],
    glow: [B(0, -0.3, 0, 0.36, 0.36, 0.36, MAGI.arcane)],
  },
  /** Brass machine: a glowing core drum between two pipe stacks on a stone base (water wheel / lift housing). */
  machine: {
    body: [
      B(0, 0.25, 0, 2.0, 0.5, 1.6, MAGI.stoneDark),
      B(-0.8, 1.6, 0, 0.36, 2.2, 0.36, MAGI.brass),
      B(0.8, 1.6, 0, 0.36, 2.2, 0.36, MAGI.brass),
      B(0, 2.7, 0, 2.0, 0.28, 0.28, MAGI.brassDark),
      B(0, 1.2, -0.6, 1.2, 0.18, 0.18, MAGI.brassDark),
    ],
    glow: [B(0, 1.6, 0, 0.8, 0.8, 0.8, MAGI.cyan)],
  },
  /** Central arcane crystal (fountain): stone pedestal, gold ring and three stacked cyan / magenta shards. ~9 m. */
  crystal: {
    body: [
      B(0, 0.4, 0, 2.0, 0.8, 2.0, MAGI.stone),
      B(0, 0.95, 0, 1.4, 0.3, 1.4, MAGI.stoneDark),
      B(0, 1.25, 0, 0.8, 0.5, 0.8, MAGI.violetDark),
    ],
    glow: [
      B(0, 1.45, 0, 1.4, 0.16, 1.4, MAGI.gold),
      B(0, 3.6, 0, 1.0, 3.9, 1.0, MAGI.cyan),
      B(0, 6.0, 0, 0.7, 1.6, 0.7, MAGI.cyan),
      B(0, 7.6, 0, 0.42, 1.2, 0.42, MAGI.magenta),
    ],
  },
  /** Crystal-topped spire: stone tiers taper to a violet tower with an emissive crystal finial. ~9 m. */
  spire: {
    body: [
      B(0, 0.8, 0, 3.0, 1.6, 3.0, MAGI.stone),
      B(0, 2.3, 0, 2.4, 1.4, 2.4, MAGI.stoneDark),
      B(0, 3.9, 0, 1.8, 2.4, 1.8, MAGI.violet),
      B(0, 5.3, 0, 2.2, 0.2, 2.2, MAGI.brass),
      B(0, 6.6, 0, 1.2, 2.2, 1.2, MAGI.violetDark),
    ],
    glow: [B(0, 8.2, 0, 0.7, 1.1, 0.7, MAGI.magenta), B(0, 4.8, 0, 0.4, 0.4, 1.9, MAGI.gold)],
  },
  /** Roof chimney: a stone stack with a cyan rune cap, sits on a cottage roof. */
  chimney: {
    body: [B(0, 1.1, 0, 0.7, 2.2, 0.7, MAGI.stoneDark), B(0, 2.3, 0, 0.9, 0.2, 0.9, MAGI.stone)],
    glow: [B(0, 2.45, 0, 0.3, 0.12, 0.3, MAGI.cyan)],
  },
  /** Dormer window: timber box under a cloth-red gable with a warm gold window. */
  dormer: {
    body: [B(0, 0.5, 0, 1.4, 1.0, 1.2, MAGI.timber), B(0, 1.2, 0, 1.6, 0.4, 1.4, MAGI.cloth)],
    glow: [B(0, 0.5, 0.62, 0.6, 0.5, 0.04, MAGI.gold)],
  },
  /** Banner with an emissive trim: cloth panel on a brass bar, glowing trim along the top edge. */
  banner: {
    body: [B(0, 0.5, 0, 0.9, 2.2, 0.08, MAGI.cloth), B(0, 2.7, 0, 1.0, 0.1, 0.1, MAGI.brass)],
    glow: [B(0, 1.5, 0.05, 0.9, 0.08, 0.05, MAGI.gold)],
  },
} satisfies Record<string, PartDef>;

export type MagiPart = keyof typeof PARTS;

/** Merged geometry of one list of boxes (vertex-coloured, flat per box). Multiplier scales the colour for glow. */
export function boxesGeometry(boxes: Box[], mul: number): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    if (b.ry) g.rotateY(b.ry);
    g.translate(b.x, b.y, b.z);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.setHex(b.c, THREE.SRGBColorSpace);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r * mul;
      col[i * 3 + 1] = _c.g * mul;
      col[i * 3 + 2] = _c.b * mul;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g.toNonIndexed());
    g.dispose();
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('magitech: empty part');
  return merged;
}

/** Shared material pair per process (lit body + HDR glow). */
let bodyMat: THREE.MeshLambertMaterial | null = null;
let glowMat: THREE.MeshBasicMaterial | null = null;
/** Crystal glow level 0 (noon) .. 1 (night preview). By day the glow stays under the bloom threshold: no cyan halos. */
let crystalGlow = 0;
export function materials(): { body: THREE.MeshLambertMaterial; glow: THREE.MeshBasicMaterial } {
  bodyMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  if (!glowMat) {
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    glowMat.color.setScalar(0.55 + 0.45 * crystalGlow);
  }
  return { body: bodyMat, glow: glowMat };
}

/**
 * Night switch for the crystal glow (NightLight.setNightPreview). Day scale 0.55 keeps the cyan channel near 0.9 (luma about 0.55),
 * night 1.0 keeps the full GLOW_GAIN look. Same 0.55 .. 1 mix as the house windows (HouseKit.setHouseWindowLevel).
 */
export function setCrystalGlowLevel(level: number): void {
  crystalGlow = Math.min(1, Math.max(0, level));
  materials().glow.color.setScalar(0.55 + 0.45 * crystalGlow);
}

/**
 * Village layer (open world): crystal lamps at the corners of the inner square and one brass machine (mill / well) beside the
 * centre. Ground height via groundY; positions relative to the village centre (ox, oz), bounds are half extents in metres.
 */
export function addVillageMagitech(kit: MagitechKit, ox: number, oz: number, bounds: [number, number], groundY: (x: number, z: number) => number): void {
  const hx = Math.max(4, bounds[0] * 0.45), hz = Math.max(4, bounds[1] * 0.45);
  const lamps: [number, number][] = [[-hx, -hz], [hx, hz], [-hx, hz], [hx, -hz]];
  for (const [dx, dz] of lamps) {
    const x = ox + dx, z = oz + dz;
    kit.add({ part: 'lamp', x, y: groundY(x, z), z, s: 1.0 });
  }
  const mx = ox + hx * 0.2, mz = oz - hz * 0.9;
  kit.add({ part: 'machine', x: mx, y: groundY(mx, mz), z: mz, rotY: Math.PI / 2, s: 0.7 });
}

/** One placed instance: where, facing, uniform scale. */
export interface MagiInstance { part: MagiPart; x: number; y: number; z: number; rotY?: number; s?: number }

/**
 * Collects instances of the kit parts and draws them as InstancedMesh (one body + one glow mesh per part). Lanterns are the only
 * animated part: update(t) bobs them in place without rebuilding matrices of the other parts.
 */
export class MagitechKit {
  readonly root = new THREE.Group();
  private lists = new Map<MagiPart, MagiInstance[]>();
  private bodies = new Map<MagiPart, THREE.InstancedMesh>();
  private glows = new Map<MagiPart, THREE.InstancedMesh>();
  private lanternBase: { x: number; y: number; z: number; s: number }[] = [];
  private lamps: [number, number, number][] = [];
  private built = false;

  add(inst: MagiInstance): void {
    if (this.built) throw new Error('MagitechKit: add() after build()');
    const list = this.lists.get(inst.part) ?? [];
    list.push(inst);
    this.lists.set(inst.part, list);
    if (inst.part === 'lamp') this.lamps.push([inst.x, inst.y, inst.z]);
  }

  /** Ground positions of the crystal lamps (the night light pools are laid under them, see NightLight.ts). */
  lampSpots(): [number, number, number][] {
    return this.lamps;
  }

  /** Builds one InstancedMesh per part for body and glow. Call once, after all add() calls. */
  build(): void {
    if (this.built) return;
    this.built = true;
    const mats = materials();
    for (const [part, list] of this.lists) {
      const def = PARTS[part] as PartDef;
      const body = new THREE.InstancedMesh(boxesGeometry(def.body, 1), mats.body, list.length);
      const glow = def.glow.length ? new THREE.InstancedMesh(boxesGeometry(def.glow, GLOW_GAIN), mats.glow, list.length) : null;
      list.forEach((it, i) => {
        _e.set(0, it.rotY ?? 0, 0);
        _q.setFromEuler(_e);
        _p.set(it.x, it.y, it.z);
        _s.setScalar(it.s ?? 1);
        _m.compose(_p, _q, _s);
        body.setMatrixAt(i, _m);
        glow?.setMatrixAt(i, _m);
        if (part === 'lantern') this.lanternBase.push({ x: it.x, y: it.y, z: it.z, s: it.s ?? 1 });
      });
      body.instanceMatrix.needsUpdate = true;
      body.castShadow = false;
      body.receiveShadow = false;
      this.root.add(body);
      this.bodies.set(part, body);
      if (glow) {
        glow.instanceMatrix.needsUpdate = true;
        glow.castShadow = false;
        glow.receiveShadow = false;
        this.root.add(glow);
        this.glows.set(part, glow);
      }
    }
  }

  /** Gentle float for the arcane lanterns: a sine bob on the glow (and body) instances. Cheap: a few dozen matrix writes. */
  update(t: number): void {
    const lanterns = this.glows.get('lantern');
    const bodies = this.bodies.get('lantern');
    if (!lanterns && !bodies) return;
    this.lanternBase.forEach((b, i) => {
      _p.set(b.x, b.y + Math.sin(t * 1.4 + i * 1.7) * 0.18, b.z);
      _q.identity();
      _s.setScalar(b.s);
      _m.compose(_p, _q, _s);
      lanterns?.setMatrixAt(i, _m);
      bodies?.setMatrixAt(i, _m);
    });
    if (lanterns) lanterns.instanceMatrix.needsUpdate = true;
    if (bodies) bodies.instanceMatrix.needsUpdate = true;
  }

  /** Frees the instanced meshes' geometry. Shared materials stay alive (they are reused by every kit). */
  dispose(): void {
    for (const m of [...this.bodies.values(), ...this.glows.values()]) m.geometry.dispose();
    this.root.clear();
    this.bodies.clear();
    this.glows.clear();
  }
}
