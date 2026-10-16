import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from './G';
import type { Player } from '../entities/Player';
import { psxMaterial } from '../world/ProceduralAssets';
import { MOUNT_BY_ID, STARTER_MOUNT_ID, type MountDef, type MountShape } from '../data/mounts';
import { chosenMountId } from '../systems/Mounts';
import { isOpenWorld } from '../scenes/flow';

/**
 * WoW-style ground mount (local player only). Unlocked at MOUNT_LEVEL. Mounting is a MOUNT_CAST_SEC cast that is
 * cancelled by a move, damage, a skill or attack, or by entering combat. Mounted: +MOUNT_SPEED_MUL run speed (PlayerController
 * applies it), the character is lifted onto the voxel mount of the chosen one (data/mounts.ts, six shapes) and the mount
 * drops on attack / skill cast, taking damage, entering combat, death, a scene change, or pressing the mount key again. Jumping
 * keeps the mount. Not in dungeons. Needs a learned mount (systems/Mounts.ts). Remote players see the same model: the owner sends
 * `mounted` and `mountId` in its pstate (net/Replication.ts) and the receiver shows it through setRemoteMounted(), which also
 * drives the remote animation through Player.mountTick.
 *
 * Model: each shape is built once per mount id into a template (voxel boxes with per-face shading baked as vertex colours,
 * merged per part and per material: one solid and one glow mesh per part). Riders get a cheap instance that shares the
 * geometry and materials and only owns the part groups, so the animation (idle breathing, 4-beat walk/run gait, head nod,
 * tail sway, wing flutter) is per rider.
 */

/** Seat height of the rider above the character root (its hips sit about here). Lift = seat - RIDER_SEAT. */
const RIDER_SEAT = 0.9;
export const MOUNT_CAST_SEC = 1.5;
export const MOUNT_LEVEL = 10;
export const MOUNT_SPEED_MUL = 1.6;

type MountState = 'idle' | 'casting' | 'mounted';
type DismountReason = 'key' | 'attack' | 'damage' | 'combat' | 'death' | 'scene';
type Vec3 = [number, number, number];
interface Model {
  root: THREE.Group;
  /** Per frame: breathing, bob, gait and the glow pulse. `moving`: the rider runs. */
  update(dt: number, moving: boolean): void;
  dispose(): void;
}

// ------------------------------------------------------------------------------------------------ voxel builder

const WHITE = new THREE.Color(0xffffff);
let shadeSeed = 1;
/** Deterministic per-box brightness jitter (voxel grain), so every client builds the same mount. */
function jitter(): number {
  shadeSeed++;
  const x = Math.sin(shadeSeed * 12.9898) * 43758.5453;
  return 0.96 + 0.08 * (x - Math.floor(x));
}

/** Per-face shade by the box's own (unrotated) normal: top light, bottom dark, the rest in between. Bakes vertex colours. */
function shadeBox(g: THREE.BufferGeometry, col: THREE.Color): void {
  const n = g.attributes.normal as THREE.BufferAttribute;
  const j = jitter();
  const arr = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i);
    const ny = n.getY(i);
    const nz = n.getZ(i);
    const f = ny > 0.5 ? 1 : ny < -0.5 ? 0.5 : nz > 0.5 ? 0.9 : nz < -0.5 ? 0.68 : nx > 0 ? 0.8 : 0.74;
    const k = f * j;
    arr[i * 3] = col.r * k;
    arr[i * 3 + 1] = col.g * k;
    arr[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
}

interface Palette {
  coat: THREE.Color;
  coatL: THREE.Color;
  coatD: THREE.Color;
  acc: THREE.Color;
  accL: THREE.Color;
  accD: THREE.Color;
  dark: THREE.Color;
  ivory: THREE.Color;
  glow: THREE.Color;
}

interface ShapeInfo {
  /** Height of the seat (saddle top) above the ground. */
  seat: number;
  /** Emissive colour and strength of the glow parts; pulse = the glow breathes. */
  glowColor: number;
  glow: number;
  pulse: boolean;
}

/** Collects boxes into named parts. Coordinates are absolute; a part's pivot is subtracted when it is finished. */
class Voxels {
  private readonly parts = new Map<string, { pivot: Vec3; solid: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] }>();
  private cur = this.bucket('body', [0, 0, 0]);

  private bucket(name: string, pivot: Vec3) {
    let b = this.parts.get(name);
    if (!b) {
      b = { pivot, solid: [], glow: [] };
      this.parts.set(name, b);
    }
    return b;
  }

  /** Switches to a part (animated parts get their own pivot: a leg's hip, the head's neck base, a wing's shoulder). */
  part(name: string, pivot: Vec3): void {
    this.cur = this.bucket(name, pivot);
  }

  /** Axis-aligned voxel box: centre, size, colour; `rot` is baked in; `glow` boxes use the emissive material. */
  box(c: Vec3, s: Vec3, col: THREE.Color, rot: Vec3 = [0, 0, 0], glow = false): void {
    const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    shadeBox(g, col);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(c[0], c[1], c[2]), q, new THREE.Vector3(1, 1, 1)));
    (glow ? this.cur.glow : this.cur.solid).push(g);
  }

  /** A square rod from a to b (reins, horns, antler tines, frills). */
  rod(a: Vec3, b: Vec3, th: number, col: THREE.Color, glow = false): void {
    const A = new THREE.Vector3(a[0], a[1], a[2]);
    const B = new THREE.Vector3(b[0], b[1], b[2]);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const dir = B.clone().sub(A).normalize();
    const g = new THREE.BoxGeometry(th, th, A.distanceTo(B));
    shadeBox(g, col);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    (glow ? this.cur.glow : this.cur.solid).push(g);
  }

  /** Merges every part into one solid and one glow geometry each (pivot-relative), once. */
  finish(): Map<string, { pivot: Vec3; solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }> {
    const out = new Map<string, { pivot: Vec3; solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }>();
    for (const [name, b] of this.parts) {
      out.set(name, { pivot: b.pivot, solid: mergeBucket(b.solid, b.pivot), glow: mergeBucket(b.glow, b.pivot) });
    }
    return out;
  }
}

function mergeBucket(list: THREE.BufferGeometry[], pivot: Vec3): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!m) throw new Error('mount: geometry merge failed');
  m.translate(-pivot[0], -pivot[1], -pivot[2]);
  return m;
}

/** Four legs, each its own part pivoting at the hip: upper leg, lower leg (socks), hoof. Front legs at +z (the facing side). */
function legs(
  v: Voxels,
  o: { hx: number; hipY: number; fz: number; bz: number; w: number; lowLen: number; hoofH: number; upper: THREE.Color; lower: THREE.Color; hoof: THREE.Color },
): void {
  const upperLen = o.hipY - o.lowLen - o.hoofH;
  const set: [string, number, number][] = [
    ['legFL', -o.hx, o.fz],
    ['legFR', o.hx, o.fz],
    ['legBL', -o.hx, -o.bz],
    ['legBR', o.hx, -o.bz],
  ];
  for (const [name, x, z] of set) {
    v.part(name, [x, o.hipY, z]);
    v.box([x, o.hipY - upperLen / 2, z], [o.w, upperLen, o.w], o.upper);
    v.box([x, o.hoofH + o.lowLen / 2, z], [o.w * 0.9, o.lowLen, o.w * 0.9], o.lower);
    v.box([x, o.hoofH / 2, z], [o.w * 1.2, o.hoofH, o.w * 1.25], o.hoof);
  }
  v.part('body', [0, 0, 0]);
}

/** Saddle on a back: blanket, seat, pommel and cantle, all stacked on `top` (the back line). Returns the seat height. */
function saddle(v: Voxels, top: number, z: number, blanket: THREE.Color, leather: THREE.Color, w = 0.5): number {
  v.box([0, top + 0.03, z - 0.02], [w + 0.2, 0.06, w + 0.4], blanket);
  v.box([0, top + 0.1, z - 0.06], [w * 0.84, 0.08, w * 0.84], leather);
  v.box([0, top + 0.16, z + 0.22], [w * 0.36, 0.14, w * 0.3], leather);
  v.box([0, top + 0.2, z - 0.36], [w * 0.9, 0.2, 0.1], leather);
  return top + 0.17;
}

type ShapeFn = (v: Voxels, p: Palette, def: MountDef) => ShapeInfo;

/** Kır Atı: brown horse with a dark mane, red saddle blanket, reins to the bit. */
const horse: ShapeFn = (v, p) => {
  const red = new THREE.Color(0x8c2f1e);
  const leather = new THREE.Color(0x5b3a1f);
  v.box([0, 0.92, 0], [0.82, 0.66, 1.5], p.coat);
  v.box([0, 1.26, 0], [0.7, 0.08, 1.36], p.coatL); // lit back line
  v.box([0, 0.6, 0], [0.78, 0.1, 1.36], p.coatD); // belly shade
  v.box([0, 0.84, 0.52], [0.7, 0.52, 0.42], p.coat); // chest
  legs(v, { hx: 0.25, hipY: 0.72, fz: 0.5, bz: 0.5, w: 0.16, lowLen: 0.24, hoofH: 0.08, upper: p.coat, lower: p.coatD, hoof: p.acc });
  const seat = saddle(v, 1.3, -0.02, red, leather, 0.5);
  for (const s of [-1, 1]) v.box([s * 0.42, 1.0, 0.02], [0.04, 0.14, 0.12], leather); // stirrups
  v.part('head', [0, 1.1, 0.6]);
  v.box([0, 1.2, 0.78], [0.36, 0.6, 0.34], p.coat, [0.5, 0, 0]); // neck
  v.box([0, 1.5, 0.72], [0.1, 0.28, 0.4], p.acc, [0.5, 0, 0]); // mane
  v.box([0, 1.55, 1.05], [0.3, 0.34, 0.5], p.coat, [0.35, 0, 0]); // head
  v.box([0, 1.36, 1.36], [0.24, 0.24, 0.34], p.coat, [0.35, 0, 0]); // muzzle
  v.box([0, 1.3, 1.4], [0.2, 0.14, 0.2], p.coatL); // pale muzzle
  for (const s of [-1, 1]) {
    v.box([s * 0.1, 1.8, 0.92], [0.08, 0.22, 0.06], p.coat); // ears
    v.box([s * 0.155, 1.6, 1.12], [0.02, 0.07, 0.08], p.dark); // eyes
    v.box([s * 0.06, 1.3, 1.55], [0.05, 0.04, 0.02], p.dark); // nostrils
    v.rod([s * 0.12, 1.6, 0.25], [0, 1.36, 1.5], 0.025, p.dark); // reins
  }
  v.box([0, 1.74, 1.0], [0.12, 0.08, 0.14], p.acc); // forelock
  v.part('tail', [0, 1.25, -0.7]);
  v.box([0, 1.12, -0.9], [0.14, 0.36, 0.14], p.coat, [0.25, 0, 0]);
  v.box([0, 0.9, -0.98], [0.2, 0.42, 0.12], p.acc, [0.25, 0, 0]);
  return { seat, glowColor: 0, glow: 0, pulse: false };
};

/** Sisli Kurt: silver-blue wolf, white ruff and paws, leather saddle. */
const wolf: ShapeFn = (v, p) => {
  v.box([0, 0.66, 0], [0.6, 0.5, 1.3], p.coat);
  v.box([0, 0.6, 0.42], [0.62, 0.36, 0.46], p.coatL); // light chest
  v.box([0, 0.44, 0], [0.56, 0.06, 1.2], p.coatD); // belly
  legs(v, { hx: 0.2, hipY: 0.5, fz: 0.42, bz: 0.42, w: 0.14, lowLen: 0.2, hoofH: 0.06, upper: p.coat, lower: p.coatD, hoof: p.acc });
  const seat = saddle(v, 0.91, -0.02, new THREE.Color(0x3a5a7a), new THREE.Color(0x4a3426), 0.42);
  v.part('head', [0, 0.8, 0.6]);
  v.box([0, 0.92, 0.72], [0.34, 0.42, 0.36], p.coat, [0.6, 0, 0]); // neck
  v.box([0, 0.96, 0.5], [0.42, 0.22, 0.3], p.acc); // white ruff
  v.box([0, 1.0, 0.96], [0.34, 0.32, 0.4], p.coat, [0.15, 0, 0]); // head
  v.box([0, 0.94, 1.2], [0.2, 0.18, 0.4], p.coat); // muzzle
  v.box([0, 0.82, 1.14], [0.18, 0.07, 0.32], p.acc); // jaw
  v.box([0, 0.96, 1.42], [0.1, 0.08, 0.04], p.dark); // nose
  for (const s of [-1, 1]) {
    v.box([s * 0.1, 1.2, 0.84], [0.1, 0.22, 0.08], p.coat); // ears
    v.box([s * 0.175, 1.04, 1.08], [0.02, 0.06, 0.1], p.dark); // eyes
    v.rod([s * 0.14, 1.1, 0.2], [0, 0.98, 1.42], 0.02, p.dark); // reins
  }
  v.part('tail', [0, 0.7, -0.6]);
  v.box([0, 0.7, -0.86], [0.16, 0.16, 0.5], p.coat, [-0.3, 0, 0]);
  v.box([0, 0.62, -1.16], [0.18, 0.18, 0.22], p.acc);
  return { seat, glowColor: 0, glow: 0, pulse: false };
};

/** Dag Keçisi: cream wool ram with brown face and legs, curled horns, blue blanket. */
const ram: ShapeFn = (v, p) => {
  v.box([0, 0.86, 0], [0.9, 0.66, 1.2], p.coat);
  v.box([0, 1.22, 0], [0.98, 0.1, 1.16], p.coatL); // wool top
  v.box([0, 0.56, 0], [0.84, 0.06, 1.1], p.coatD);
  v.box([0, 0.86, 0.66], [0.74, 0.6, 0.28], p.coatL); // wool chest
  legs(v, { hx: 0.28, hipY: 0.6, fz: 0.4, bz: 0.4, w: 0.15, lowLen: 0.2, hoofH: 0.08, upper: p.acc, lower: p.accD, hoof: p.dark });
  const seat = saddle(v, 1.24, -0.04, new THREE.Color(0x2f5d8a), new THREE.Color(0x5b3a22), 0.5);
  v.part('head', [0, 1.0, 0.6]);
  v.box([0, 1.0, 0.72], [0.44, 0.46, 0.34], p.coat, [0.4, 0, 0]); // wool neck
  v.box([0, 1.1, 0.98], [0.32, 0.34, 0.4], p.acc); // face
  v.box([0, 1.04, 1.22], [0.24, 0.22, 0.24], p.accL); // muzzle
  v.box([0, 1.02, 1.36], [0.2, 0.1, 0.04], p.dark); // nose
  for (const s of [-1, 1]) {
    v.box([s * 0.165, 1.16, 1.04], [0.03, 0.06, 0.07], p.dark); // eyes
    v.box([s * 0.2, 1.16, 0.9], [0.14, 0.06, 0.08], p.acc, [0, 0, s * 0.4]); // ears
    v.rod([s * 0.18, 1.28, 0.9], [s * 0.34, 1.36, 0.88], 0.08, p.accD); // curled horn
    v.rod([s * 0.34, 1.36, 0.88], [s * 0.38, 1.24, 0.8], 0.08, p.accD);
    v.rod([s * 0.38, 1.24, 0.8], [s * 0.32, 1.18, 0.72], 0.07, p.accD);
    v.rod([s * 0.14, 1.52, 0.22], [0, 1.0, 1.3], 0.02, p.dark); // reins
  }
  v.part('tail', [0, 0.95, -0.6]);
  v.box([0, 0.92, -0.66], [0.16, 0.22, 0.16], p.coat);
  return { seat, glowColor: 0, glow: 0, pulse: false };
};

/** Altın Tarla Domuzu: golden boar with a glowing gold bristle crest, ivory tusks, dark snout. */
const boar: ShapeFn = (v, p) => {
  v.box([0, 0.7, 0], [0.86, 0.62, 1.3], p.coat);
  v.box([0, 0.4, 0], [0.8, 0.06, 1.2], p.coatD);
  v.box([0, 1.08, -0.05], [0.14, 0.14, 1.1], new THREE.Color(0xffd65a), [0, 0, 0], true); // gold crest (glow)
  legs(v, { hx: 0.28, hipY: 0.42, fz: 0.45, bz: 0.45, w: 0.2, lowLen: 0.16, hoofH: 0.08, upper: p.coatD, lower: p.accD, hoof: p.dark });
  const seat = saddle(v, 1.16, -0.05, new THREE.Color(0x7a1e1e), new THREE.Color(0x4a3426), 0.46);
  v.part('head', [0, 0.8, 0.6]);
  v.box([0, 0.82, 0.92], [0.56, 0.5, 0.5], p.coat); // head
  v.box([0, 0.7, 1.2], [0.36, 0.28, 0.3], p.coatL); // snout
  v.box([0, 0.7, 1.38], [0.3, 0.22, 0.06], p.accD); // snout disc
  v.box([0, 1.04, 0.62], [0.24, 0.2, 0.5], p.acc); // bristle mane
  for (const s of [-1, 1]) {
    v.box([s * 0.22, 1.12, 0.86], [0.14, 0.16, 0.06], p.coatD, [0, 0, s * 0.5]); // ears
    v.box([s * 0.2, 0.92, 1.02], [0.04, 0.06, 0.04], p.dark); // eyes
    v.box([s * 0.07, 0.72, 1.42], [0.04, 0.05, 0.02], p.dark); // nostrils
    v.rod([s * 0.16, 0.6, 1.22], [s * 0.2, 0.78, 1.44], 0.06, p.ivory); // tusks
    v.rod([s * 0.16, 1.36, 0.2], [0, 0.72, 1.4], 0.02, p.dark); // reins
  }
  v.part('tail', [0, 0.82, -0.66]);
  v.rod([0, 0.82, -0.66], [0.08, 0.9, -0.96], 0.07, p.coat);
  v.box([0.1, 0.96, -1.0], [0.1, 0.1, 0.1], p.acc);
  return { seat, glowColor: 0xffd65a, glow: 0.3, pulse: false };
};

/** Kristal Geyik: pale stag with glowing crystal antlers and flank plates, blue cloth, leather saddle. */
const stag: ShapeFn = (v, p) => {
  v.box([0, 1.0, 0], [0.66, 0.6, 1.4], p.coat);
  v.box([0, 0.74, 0], [0.6, 0.08, 1.25], p.coatD);
  for (const s of [-1, 1]) v.box([s * 0.335, 1.0, 0], [0.03, 0.3, 0.34], p.acc, [0, 0, 0], true); // crystal flank plates
  legs(v, { hx: 0.22, hipY: 0.8, fz: 0.5, bz: 0.5, w: 0.13, lowLen: 0.3, hoofH: 0.09, upper: p.coat, lower: p.coatD, hoof: p.dark });
  const seat = saddle(v, 1.3, -0.02, new THREE.Color(0x3b4f73), new THREE.Color(0x5b3a22), 0.52);
  v.part('head', [0, 1.2, 0.66]);
  v.box([0, 1.4, 0.8], [0.32, 0.6, 0.32], p.coat, [0.5, 0, 0]); // neck
  v.box([0, 1.62, 0.88], [0.1, 0.22, 0.3], p.coatD, [0.5, 0, 0]); // mane
  v.box([0, 1.72, 1.06], [0.28, 0.28, 0.46], p.coat, [0.25, 0, 0]); // head
  v.box([0, 1.62, 1.36], [0.2, 0.18, 0.26], p.coatL); // muzzle
  v.box([0, 1.6, 1.5], [0.12, 0.1, 0.04], p.dark); // nose
  for (const s of [-1, 1]) {
    v.box([s * 0.145, 1.78, 1.06], [0.02, 0.06, 0.08], p.dark); // eyes
    v.box([s * 0.2, 1.9, 0.96], [0.16, 0.07, 0.1], p.coatD, [0, 0, s * 0.5]); // ears
    v.rod([s * 0.12, 1.66, 0.22], [0, 1.6, 1.44], 0.02, p.dark); // reins
    // crystal antlers (glow)
    v.rod([s * 0.1, 1.9, 0.98], [s * 0.22, 2.22, 0.9], 0.07, p.acc, true);
    v.rod([s * 0.18, 2.04, 0.94], [s * 0.42, 2.14, 0.92], 0.06, p.acc, true);
    v.rod([s * 0.2, 2.2, 0.92], [s * 0.32, 2.42, 0.9], 0.06, p.acc, true);
    v.box([s * 0.42, 2.14, 0.92], [0.12, 0.12, 0.12], p.acc, [0.4, 0.3, 0.2], true);
    v.box([s * 0.32, 2.44, 0.9], [0.1, 0.14, 0.1], p.acc, [0, 0, 0.2], true);
  }
  v.part('tail', [0, 1.2, -0.66]);
  v.box([0, 1.14, -0.8], [0.2, 0.26, 0.2], p.coatL);
  v.box([0, 1.06, -0.94], [0.2, 0.2, 0.16], p.coatL);
  return { seat, glowColor: p.acc.getHex(), glow: 0.35, pulse: true };
};

/** Gümüş Ejder: silver ground drake, steel belly, ember spines and eyes, folded wings, long tail with an ember tip. */
const drake: ShapeFn = (v, p) => {
  v.box([0, 0.72, 0], [0.72, 0.56, 1.4], p.coat);
  v.box([0, 0.44, 0], [0.5, 0.06, 1.2], p.acc); // steel belly
  for (const z of [-0.5, -0.15, 0.2, 0.55]) v.box([0, 1.06, z], [0.08, 0.12, 0.12], p.glow, [0, 0, 0], true); // ember spines
  legs(v, { hx: 0.26, hipY: 0.5, fz: 0.46, bz: 0.46, w: 0.16, lowLen: 0.2, hoofH: 0.06, upper: p.coat, lower: p.acc, hoof: p.dark });
  const seat = saddle(v, 1.0, 0, new THREE.Color(0x2b3f5c), new THREE.Color(0x3a3f4a), 0.36);
  v.part('head', [0, 0.9, 0.66]);
  v.box([0, 1.0, 0.8], [0.34, 0.38, 0.4], p.coat, [0.55, 0, 0]); // neck
  v.box([0, 1.2, 1.0], [0.36, 0.32, 0.5], p.coat, [0.1, 0, 0]); // head
  v.box([0, 1.12, 1.32], [0.26, 0.22, 0.34], p.coat); // snout
  v.box([0, 1.0, 1.2], [0.24, 0.1, 0.34], p.acc); // jaw
  for (const s of [-1, 1]) {
    v.box([s * 0.08, 1.2, 1.5], [0.05, 0.04, 0.04], p.glow, [0, 0, 0], true); // nostrils
    v.box([s * 0.19, 1.26, 1.12], [0.04, 0.08, 0.08], p.glow, [0, 0, 0], true); // ember eyes
    v.rod([s * 0.16, 1.3, 0.86], [s * 0.4, 1.4, 0.78], 0.07, p.acc); // frills
    v.rod([s * 0.14, 1.22, 0.82], [s * 0.36, 1.2, 0.66], 0.06, p.acc);
    v.rod([s * 0.12, 1.56, 0.22], [0, 1.1, 1.42], 0.02, p.dark); // reins
  }
  v.part('tail', [0, 0.78, -0.66]);
  v.box([0, 0.66, -0.92], [0.3, 0.3, 0.5], p.coat);
  v.box([0, 0.56, -1.42], [0.22, 0.22, 0.56], p.coat);
  v.box([0, 0.5, -1.9], [0.13, 0.13, 0.5], p.acc);
  v.box([0, 0.5, -2.25], [0.22, 0.22, 0.22], p.glow, [0, 0.785, 0], true); // tail tip (ember)
  // folded wings: pivot at the shoulder, membrane slanting down the flank, steel rim along the top
  for (const s of [-1, 1]) {
    const name = s < 0 ? 'wingL' : 'wingR';
    v.part(name, [s * 0.36, 1.0, 0.1]);
    v.box([s * 0.44, 0.86, 0], [0.12, 0.34, 1.0], p.acc, [0, 0, -s * 0.25]);
    v.rod([s * 0.38, 1.04, -0.55], [s * 0.38, 1.04, 0.65], 0.07, p.coat);
  }
  v.part('body', [0, 0, 0]);
  return { seat, glowColor: p.glow.getHex(), glow: 0.6, pulse: true };
};

const SHAPES: Record<MountShape, ShapeFn> = { horse, wolf, ram, boar, stag, drake };

// ------------------------------------------------------------------------------------------------ templates

interface Template {
  parts: Map<string, { pivot: Vec3; solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }>;
  solidMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
  glowBase: number;
  pulse: boolean;
  /** Seat height minus RIDER_SEAT: the character root is lifted by this. */
  lift: number;
  strideHz: number;
  bobAmp: number;
  legSwing: number;
}

const TEMPLATES = new Map<string, Template>();
/** 4-beat gait: hind left, fore left, hind right, fore right, a quarter cycle apart. */
const GAIT: [string, number][] = [
  ['legBL', 0],
  ['legFL', 0.25],
  ['legBR', 0.5],
  ['legFR', 0.75],
];

/** Builds the mount's template once (geometry and materials), cached per mount id. */
function templateFor(def: MountDef): Template {
  const hit = TEMPLATES.get(def.id);
  if (hit) return hit;
  const p: Palette = {
    coat: new THREE.Color(def.color),
    coatL: new THREE.Color(def.color).lerp(WHITE, 0.25),
    coatD: new THREE.Color(def.color).multiplyScalar(0.62),
    acc: new THREE.Color(def.accent),
    accL: new THREE.Color(def.accent).lerp(WHITE, 0.25),
    accD: new THREE.Color(def.accent).multiplyScalar(0.6),
    dark: new THREE.Color(0x1e1712),
    ivory: new THREE.Color(0xf1ead6),
    glow: new THREE.Color(def.glow || def.accent),
  };
  const v = new Voxels();
  const info = SHAPES[def.shape](v, p, def);
  const solidMat = psxMaterial(null, { color: 0xffffff, vertexColors: true, flatShading: true });
  const glowMat = psxMaterial(null, { color: 0xffffff, vertexColors: true, flatShading: true, emissive: info.glowColor, emissiveIntensity: info.glow });
  const tpl: Template = {
    parts: v.finish(),
    solidMat,
    glowMat,
    glowBase: info.glow,
    pulse: info.pulse,
    lift: info.seat - RIDER_SEAT,
    strideHz: def.bob.hz * 0.3,
    bobAmp: def.bob.amp,
    legSwing: 0.42,
  };
  TEMPLATES.set(def.id, tpl);
  return tpl;
}

/** Height the character root is lifted to sit on this mount (the saddle). */
export function mountLift(mountId: string): number {
  const def = MOUNT_BY_ID[mountId] ?? MOUNT_BY_ID[STARTER_MOUNT_ID];
  return templateFor(def).lift;
}

/** A rider's instance of a template: its own part groups (shared geometry and materials) and gait state. */
function instantiate(def: MountDef): Model {
  const tpl = templateFor(def);
  const root = new THREE.Group();
  root.name = 'mount_' + def.id;
  const parts = new Map<string, THREE.Object3D>();
  for (const [name, part] of tpl.parts) {
    if (!part.solid && !part.glow) continue;
    const g = new THREE.Group();
    g.name = name;
    g.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    if (part.solid) g.add(new THREE.Mesh(part.solid, tpl.solidMat));
    if (part.glow) g.add(new THREE.Mesh(part.glow, tpl.glowMat));
    root.add(g);
    parts.set(name, g);
  }
  let t = 0;
  let phase = 0;
  let amp = 0;
  const TAU = Math.PI * 2;
  return {
    root,
    update(dt: number, moving: boolean): void {
      t += dt;
      amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 6);
      if (moving) phase += dt * tpl.strideHz;
      const stride = Math.sin(phase * TAU);
      // body: two bobs per stride while running, a slow breath at rest
      root.position.y = tpl.bobAmp * amp * Math.abs(stride) + 0.01 * (1 - amp) * (0.5 + 0.5 * Math.sin(t * 2.5));
      // legs: 4-beat gait, swing with the stride, rest when still
      for (const [name, off] of GAIT) {
        const g = parts.get(name);
        if (g) g.rotation.x = Math.sin((phase + off) * TAU) * tpl.legSwing * amp;
      }
      const head = parts.get('head');
      if (head) head.rotation.x = 0.03 * (1 - amp) * Math.sin(t * 2.2) + 0.05 * amp * Math.sin(phase * TAU * 2);
      const tail = parts.get('tail');
      if (tail) tail.rotation.y = 0.14 * Math.sin(t * 1.7) + 0.28 * amp * stride;
      const flap = 0.02 * Math.sin(t * 2) + 0.12 * amp * Math.abs(stride);
      const wl = parts.get('wingL');
      const wr = parts.get('wingR');
      if (wl) wl.rotation.z = -flap;
      if (wr) wr.rotation.z = flap;
      if (tpl.pulse) tpl.glowMat.emissiveIntensity = tpl.glowBase * (0.85 + 0.15 * Math.sin(performance.now() * 0.004));
    },
    dispose(): void {
      // geometry and materials are shared through the template cache; only the groups go with the rider
      root.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------------------------------------ remote riders

/** Mount models of remote riders (one per Player while its pstate says mounted). */
const remoteMounts = new WeakMap<Player, { id: string; model: Model }>();

/**
 * Shows (on) or removes (off) the mount of a REMOTE player, driven by its replicated `mounted` flag and `mountId` (the mount it
 * rides; the starter horse when the id is missing or unknown). Idempotent; a changed id swaps the model. The remote model is
 * lifted to its saddle like the local one and animated every frame through Player.mountTick. Removing a remote who is not
 * mounted is a no-op.
 */
export function setRemoteMounted(player: Player, on: boolean, mountId?: string | null): void {
  const cur = remoteMounts.get(player);
  if (on) {
    const id = mountId && MOUNT_BY_ID[mountId] ? mountId : STARTER_MOUNT_ID;
    if (cur?.id === id) return;
    cur?.model.root.removeFromParent();
    cur?.model.dispose();
    const model = instantiate(MOUNT_BY_ID[id]);
    player.object3d.add(model.root);
    player.modelLift = mountLift(id);
    player.mountTick = (dt, moving) => model.update(dt, moving);
    remoteMounts.set(player, { id, model });
    return;
  }
  if (!cur) return;
  remoteMounts.delete(player);
  cur.model.root.removeFromParent();
  cur.model.dispose();
  player.mountTick = null;
  player.modelLift = 0;
}

// ------------------------------------------------------------------------------------------------ local rider

export class MountRider {
  private state: MountState = 'idle';
  private castT = 0;
  private wasInCombat = false;
  /** Model per mount id, built on first use and kept (disposed with the rider). */
  private models = new Map<string, Model>();
  private active: Model | null = null;
  /** A summon from the action bar (`mount:summon`) counts like the mount key once. */
  private pendingSummon = false;
  private unsubs: (() => void)[] = [];

  constructor(private readonly player: Player) {
    this.unsubs.push(
      // a skill or basic attack cancels a mount cast and drops the mount (attack / skill cast)
      G.events.on('skill:cast', (e) => {
        if (e.casterId !== this.player.id) return;
        if (this.state === 'casting') this.cancel('Büyü yaptığın için binme iptal oldu.');
        else this.dismount('attack');
      }),
      G.events.on('damage', (e) => {
        if (e.targetId !== this.player.id || !(e.amount > 0)) return;
        if (this.state === 'casting') this.cancel('Hasar aldığın için binme iptal oldu.');
        else this.dismount('damage');
      }),
      G.events.on('player:died', (e) => {
        if (e.local) this.dismount('death');
      }),
      G.events.on('scene:leaving', () => this.dismount('scene')),
      G.events.on('mount:summon', () => {
        this.pendingSummon = true;
      }),
    );
  }

  /** Run speed multiplier for PlayerController (walking is not boosted). */
  speedMul(): number {
    return this.state === 'mounted' ? MOUNT_SPEED_MUL : 1;
  }

  get mounted(): boolean {
    return this.state === 'mounted';
  }

  /** The id of the mount this rider is on (null when on foot). */
  get mountId(): string | null {
    return this.state === 'mounted' ? this.activeId : null;
  }
  private activeId: string | null = null;

  /** Called once per frame by PlayerController before movement. `moving`: a move key is held this frame. */
  update(dt: number, canInput: boolean, moving: boolean): void {
    const p = this.player;
    const press = (canInput && G.input.pressed('mount')) || this.pendingSummon;
    this.pendingSummon = false;
    const inCombat = p.inCombat;
    const enteredCombat = inCombat && !this.wasInCombat;
    this.wasInCombat = inCombat;

    if (this.state === 'mounted') {
      this.active?.update(dt, moving);
      if (press) this.dismount('key');
      else if (enteredCombat) this.dismount('combat');
      return;
    }
    if (this.state === 'casting') {
      if (press) return this.cancel('Binme iptal edildi.');
      if (moving) return this.cancel('Hareket ettiğin için binme iptal oldu.');
      if (enteredCombat) return this.cancel('Savaşa girdiğin için binme iptal oldu.');
      this.castT += dt;
      if (this.castT >= MOUNT_CAST_SEC) this.mountUp();
      return;
    }
    if (press) this.tryStart();
  }

  private tryStart(): void {
    const p = this.player;
    if (p.level < MOUNT_LEVEL) {
      G.events.emit('ui:toast', { text: `Binek Sv ${MOUNT_LEVEL}'da açılır`, kind: 'info' });
      return;
    }
    if (!G.character || !chosenMountId(G.character.save)) {
      G.events.emit('ui:toast', { text: 'Henüz binek öğrenmedin — Kuzgunkale ahırı', kind: 'info' });
      return;
    }
    // dungeon instances only: the open world (Sisli Vadi) is also a 'dungeon' scene, and riding there is the point of the mount
    if (G.scenes?.current?.id === 'dungeon' && !isOpenWorld(G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId)) {
      G.events.emit('ui:toast', { text: 'Zindanda binek kullanılamaz.', kind: 'warning' });
      return;
    }
    if (p.inCombat) {
      G.events.emit('ui:toast', { text: 'Savaşta binilemez.', kind: 'warning' });
      return;
    }
    if (p.isDead) return;
    if (p.cast || p.dodging || !p.canMove()) {
      G.events.emit('ui:toast', { text: 'Burada binilemez', kind: 'warning' });
      return;
    }
    this.state = 'casting';
    this.castT = 0;
  }

  private cancel(text: string): void {
    this.state = 'idle';
    this.castT = 0;
    G.events.emit('ui:toast', { text, kind: 'warning' });
  }

  private mountUp(): void {
    const p = this.player;
    const id = G.character ? chosenMountId(G.character.save) : null;
    if (!id || !MOUNT_BY_ID[id]) {
      this.state = 'idle';
      this.castT = 0;
      return;
    }
    this.state = 'mounted';
    this.castT = 0;
    this.activeId = id;
    let model = this.models.get(id);
    if (!model) {
      model = instantiate(MOUNT_BY_ID[id]);
      this.models.set(id, model);
    }
    this.active = model;
    p.object3d.add(model.root);
    p.modelLift = mountLift(id);
    G.events.emit('player:mounted', { on: true, mountId: id });
  }

  private dismount(reason: DismountReason): void {
    if (this.state !== 'mounted') {
      if (this.state === 'casting') this.state = 'idle';
      return;
    }
    this.state = 'idle';
    this.active?.root.removeFromParent();
    this.active = null;
    this.activeId = null;
    this.player.modelLift = 0;
    G.events.emit('player:mounted', { on: false, mountId: null });
    if (reason === 'attack' || reason === 'damage' || reason === 'combat') {
      const why = reason === 'attack' ? 'Saldırı yaptığın için' : reason === 'damage' ? 'Hasar aldığın için' : 'Savaşa girdiğin için';
      G.events.emit('ui:toast', { text: `${why} binekten indin.`, kind: 'info' });
    }
  }

  dispose(): void {
    this.dismount('scene');
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.active = null;
  }
}
