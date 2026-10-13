import * as THREE from 'three';
import { patchPSX } from '../render/psx';

/**
 * Procedural bodies for mechanic entities (GDD_CONTENT §3.7), voxel-PSX style (docs/ART_VOXEL_PSX.md §2.1 row 16, WP8).
 * Every body is a cluster of axis-aligned cubes on one grid of CELL metres: x / z cell centres sit on multiples of CELL,
 * y cell boundaries sit on multiples of CELL, so bodies stand on y = 0 like the voxel characters. Each cluster is one
 * merged BufferGeometry that only emits exposed faces, flat-shaded Lambert (patchPSX), so the PSX pass shows cubes.
 * Animated parts (gem bob, rune spin, crack reveal, rift swirl) are separate clusters driven by transforms, as before.
 * OWNER: enemies module.
 */
export interface ProcModel {
  root: THREE.Object3D;
  /** Height of the body in metres (before def.scale). */
  height: number;
  /** hpFrac: the entity's HP fraction on this peer (Metin stones draw their state from it). */
  update(dt: number, t: number, hpFrac?: number): void;
  /** Per-instance materials/geometries to dispose with the entity. */
  dispose(): void;
}

/** Cube edge in metres: 0.2 keeps a 2.6-4 m body at 13-20 voxels tall, a few hundred to ~1.5k tris per body. */
const CELL = 0.2;
const HALF = CELL / 2;

type V3 = [number, number, number];
/** Cell index [i, j, k] has its centre at (i * CELL, (j + 0.5) * CELL, k * CELL). */
type Cell = readonly [number, number, number];
type Inside = (x: number, y: number, z: number) => boolean;
interface Shape {
  lo: V3;
  hi: V3;
  inside: Inside;
}

function lambert(color: number, emissive = 0x000000, emissiveIntensity = 0, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true, ...opts });
  patchPSX(m);
  return m;
}

// ---- voxel shapes (predicates sampled at cell centres) ------------------------------------------------------------

/** Cylinder / cone: the radius lerps from r0 at y0 to r1 at y1. */
function cyl(r0: number, r1: number, y0: number, y1: number): Shape {
  const R = Math.max(r0, r1);
  return {
    lo: [-R, y0, -R],
    hi: [R, y1, R],
    inside: (x, y, z) => {
      if (y < y0 || y > y1) return false;
      const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
      const r = r0 + (r1 - r0) * t;
      return x * x + z * z <= r * r;
    },
  };
}

function sphere(r: number): Shape {
  return { lo: [-r, -r, -r], hi: [r, r, r], inside: (x, y, z) => x * x + y * y + z * z <= r * r };
}

/** Hollow sphere between r0 and r1 (a halo). */
function shell(r0: number, r1: number): Shape {
  return {
    lo: [-r1, -r1, -r1],
    hi: [r1, r1, r1],
    inside: (x, y, z) => {
      const d2 = x * x + y * y + z * z;
      return d2 <= r1 * r1 && d2 >= r0 * r0;
    },
  };
}

/** Octahedron (crystal) with half-extents rx, ry, rz. */
function diamond(rx: number, ry: number, rz: number): Shape {
  return {
    lo: [-rx, -ry, -rz],
    hi: [rx, ry, rz],
    inside: (x, y, z) => Math.abs(x) / rx + Math.abs(y) / ry + Math.abs(z) / rz <= 1,
  };
}

/** Axis-aligned block: |x| <= hx, y0 <= y <= y1, |z| <= hz. */
function box(hx: number, y0: number, y1: number, hz: number): Shape {
  return {
    lo: [-hx, y0, -hz],
    hi: [hx, y1, hz],
    inside: (x, y, z) => Math.abs(x) <= hx && y >= y0 && y <= y1 && Math.abs(z) <= hz,
  };
}

/** One-cell-thick disc in the XY plane. */
function disc(r: number): Shape {
  return {
    lo: [-r, -r, -HALF],
    hi: [r, r, HALF],
    inside: (x, y, z) => x * x + y * y <= r * r && Math.abs(z) <= HALF,
  };
}

/** Cell index containing a point. */
function cellAt(x: number, y: number, z: number): Cell {
  return [Math.round(x / CELL), Math.floor(y / CELL), Math.round(z / CELL)];
}

/** One-cell-thick ring of radius r: in the XZ plane at height cy, or in the XY plane (z = 0) centred on cy. */
function ring(r: number, plane: 'xz' | 'xy', cy: number): Cell[] {
  const n = Math.ceil((2 * Math.PI * r / CELL) * 2);
  const out: Cell[] = [];
  for (let p = 0; p < n; p++) {
    const a = (p / n) * Math.PI * 2;
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    out.push(plane === 'xz' ? cellAt(c, cy, s) : cellAt(c, cy + s, 0));
  }
  return out;
}

function fill(s: Shape): Cell[] {
  const out: Cell[] = [];
  const [x0, y0, z0] = s.lo;
  const [x1, y1, z1] = s.hi;
  for (let i = Math.floor(x0 / CELL) - 1; i <= Math.ceil(x1 / CELL) + 1; i++) {
    for (let j = Math.floor(y0 / CELL) - 1; j <= Math.ceil(y1 / CELL) + 1; j++) {
      for (let k = Math.floor(z0 / CELL) - 1; k <= Math.ceil(z1 / CELL) + 1; k++) {
        if (s.inside(i * CELL, (j + 0.5) * CELL, k * CELL)) out.push([i, j, k]);
      }
    }
  }
  return out;
}

// ---- cube clusters -----------------------------------------------------------------------------------------------

/** Per face: outward normal n, and tangents u, v with u x v = n (corners -u-v, u-v, u+v, -u+v come out counter-clockwise). */
const DIRS: ReadonlyArray<{ n: V3; u: V3; v: V3 }> = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];
const CORNERS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** One merged geometry for a set of cubes. Faces between two solid cells are skipped. */
function cubesGeometry(cells: readonly Cell[]): THREE.BufferGeometry {
  const set = new Set<string>();
  const uniq: Cell[] = [];
  for (const c of cells) {
    const k = c.join(',');
    if (!set.has(k)) {
      set.add(k);
      uniq.push(c);
    }
  }
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [i, j, k] of uniq) {
    const C: V3 = [i * CELL, (j + 0.5) * CELL, k * CELL];
    for (const d of DIRS) {
      if (set.has(`${i + d.n[0]},${j + d.n[1]},${k + d.n[2]}`)) continue;
      const base = pos.length / 3;
      for (const [a, b] of CORNERS) {
        for (let ax = 0; ax < 3; ax++) {
          pos.push(C[ax] + HALF * (d.n[ax] + a * d.u[ax] + b * d.v[ax]));
          nor.push(d.n[ax]);
        }
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return geo;
}

function voxCells(cells: readonly Cell[], mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(cubesGeometry(cells), mat);
  m.position.set(x, y, z);
  // enemies never cast real shadows (their G.vfx.blobShadow is the shadow)
  m.castShadow = false;
  return m;
}

function voxMesh(s: Shape, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return voxCells(fill(s), mat, x, y, z);
}

type Builder = (tint?: number) => ProcModel;

/** Dispose hook for a body: its cluster geometries and its materials. */
function finish(meshes: THREE.Mesh[], mats: THREE.Material[]): () => void {
  return () => {
    for (const m of meshes) m.geometry.dispose();
    for (const mt of mats) mt.dispose();
  };
}

const BUILDERS: Record<string, Builder> = {
  /** Azrakel phase 2: a floating green crystal on a broken column stump. */
  phylactery: () => {
    const root = new THREE.Group();
    const stone = lambert(0x6a6658);
    const glow = lambert(0x60ff90, 0x40ff80, 1.2);
    const stump = voxMesh(cyl(0.55, 0.7, 0, 0.9), stone);
    const cap = voxMesh(cyl(0.62, 0.55, 1.0, 1.2), stone);
    const gem = voxMesh(diamond(0.44, 0.83, 0.44), glow, 0, 1.9, 0);
    root.add(stump, cap, gem);
    return {
      root, height: 2.6,
      update(_dt, t) {
        gem.position.y = 1.9 + Math.sin(t * 2.0) * 0.12;
        gem.rotation.y = t * 1.4;
        glow.emissiveIntensity = 1.0 + Math.sin(t * 5) * 0.35;
      },
      dispose: finish([stump, cap, gem], [stone, glow]),
    };
  },
  /** Morkan phase 2: drifting soul. */
  soul_orb: () => {
    const root = new THREE.Group();
    const core = lambert(0x60ff90, 0x40ff80, 1.6, { transparent: true, opacity: 0.92 });
    const halo = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    const o = voxMesh(sphere(0.4), core, 0, 1.1, 0);
    const h = voxMesh(shell(0.55, 0.75), halo, 0, 1.1, 0);
    root.add(o, h);
    return {
      root, height: 1.8,
      update(_dt, t) {
        const s = 1 + Math.sin(t * 7) * 0.12;
        o.scale.setScalar(s);
        h.scale.setScalar(1 + Math.sin(t * 4 + 1) * 0.15);
        o.position.y = h.position.y = 1.1 + Math.sin(t * 3) * 0.12;
      },
      dispose: finish([o, h], [core, halo]),
    };
  },
  /** Morkan Kemik Hapsi: eight bones around the player, two voxel rings at top and bottom. */
  bone_cage: () => {
    const root = new THREE.Group();
    const bone = lambert(0xe0d8c0, 0x201c10, 0.2);
    const cells: Cell[] = [];
    for (let n = 0; n < 8; n++) {
      const a = (n / 8) * Math.PI * 2;
      const x = Math.cos(a) * 0.85;
      const z = Math.sin(a) * 0.85;
      for (let j = 0; j <= 10; j++) cells.push(cellAt(x, (j + 0.5) * CELL, z));
    }
    cells.push(...ring(0.85, 'xz', 0.12), ...ring(0.85, 'xz', 2.15));
    const cage = voxCells(cells, bone);
    root.add(cage);
    return {
      root, height: 2.4,
      update() {},
      dispose: finish([cage], [bone]),
    };
  },
  /** Ayaz Ana Buz Mezarı: translucent ice block with a brighter voxel core. */
  ice_tomb: () => {
    const root = new THREE.Group();
    const ice = lambert(0x9fd8ff, 0x2a5a9a, 0.6, { transparent: true, opacity: 0.6, depthWrite: false });
    const inner = lambert(0xdff4ff, 0x80c8ff, 0.8, { transparent: true, opacity: 0.35, depthWrite: false });
    const b = voxMesh(box(0.65, 0, 2.3, 0.65), ice);
    const c = voxMesh(box(0.4, 0.3, 2.0, 0.4), inner);
    root.add(b, c);
    return {
      root, height: 2.3,
      update(_dt, t) { inner.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2; },
      dispose: finish([b, c], [ice, inner]),
    };
  },
  /** Ak Pençe Buz Sarkıtı: a stepped ice column with a tip and a leaning shard; blocks movement for 20 s. */
  ice_pillar: () => {
    const root = new THREE.Group();
    const ice = lambert(0x9fd8ff, 0x2a5a9a, 0.55, { transparent: true, opacity: 0.82 });
    const core = lambert(0xdff4ff, 0x80c8ff, 0.9, { transparent: true, opacity: 0.55 });
    const base = voxMesh(cyl(0.75, 1.0, 0, 1.2), ice);
    const mid = voxMesh(cyl(0.5, 0.75, 1.2, 2.7), ice);
    const tip = voxMesh(cyl(0.5, 0, 2.65, 4.05), core);
    const shard = voxMesh(cyl(0.28, 0, 0, 1.1), ice, 0.55, 0, 0.2);
    shard.rotation.z = -0.5;
    root.add(base, mid, tip, shard);
    return {
      root, height: 4.0,
      update(_dt, t) { core.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.25; },
      dispose: finish([base, mid, tip, shard], [ice, core]),
    };
  },
  /**
   * M+ Patlayıcı Küre body: systems/Affixes.ts draws the orb itself (pulsing core + wire shell + vfx, attachOrbMesh), so the PROC
   * body is an empty anchor that only gives the entity a height (no 'unknown procedural model' warning, no double mesh).
   */
  explosive_orb: () => {
    const root = new THREE.Group();
    return { root, height: 1.2, update() {}, dispose() {} };
  },
  /**
   * Metin stone (GDD_OPENWORLD §4.1): cracked basalt monolith, 3.4 m, scale 1. Grey core until the first hit (hpFrac < 1), then the
   * tier colour (def.tint) glows. Cracks appear at 85 / 65 / 45 / 25 / 10 % HP with a short flash; the rune ring spins faster when
   * engaged and the 10 m aura ring is drawn on the ground. Everything is a function of hpFrac, so every peer shows the same state.
   */
  metin_stone: (tint = 0x60a0ff) => {
    const CRACK_AT = [0.85, 0.65, 0.45, 0.25, 0.1];
    /** Body radius at height y (the monolith tapers from 1.2 at the foot to 0.85 at 3.4 m). */
    const bodyR = (y: number): number => 1.2 + (0.85 - 1.2) * Math.min(1, Math.max(0, y / 3.4));
    const root = new THREE.Group();
    const basalt = lambert(0x3a3c44);
    const trim = lambert(0x2a2c32);
    const core = lambert(0x303036, tint, 0);
    const crackMat = lambert(tint, tint, 0.6);
    const runeMat = lambert(tint, tint, 1.0);
    const auraMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const body = voxMesh(cyl(1.2, 0.85, 0, 3.4), basalt);
    const cap = voxMesh(cyl(0.85, 0.5, 3.4, 3.9), trim);
    const shardA = voxMesh(diamond(0.6, 0.9, 0.6), trim, 0.95, 0.45, 0.25);
    const shardB = voxMesh(diamond(0.45, 0.45, 0.45), trim, -0.8, 0.35, -0.35);
    const gem = voxMesh(diamond(0.29, 0.47, 0.29), core, 0, 1.9, 0.95);
    const runeG = new THREE.Group();
    runeG.position.y = 0.08;
    // rune band: a one-cell ring at the foot, with a raised glyph every sixth cell
    const runeCells = ring(1.5, 'xz', 0);
    runeCells.push(...ring(1.5, 'xz', 0.2).filter((_, p) => p % 6 === 0));
    const rune = voxCells(runeCells, runeMat);
    runeG.add(rune);
    const aura = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 48), auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.06;
    aura.castShadow = false;
    const cracks: THREE.Mesh[] = [];
    for (let i = 0; i < CRACK_AT.length; i++) {
      const yc = 0.7 + i * 0.5;
      const a = i * 1.25 + 0.4;
      const len = 0.9 + (i % 2) * 0.5;
      const n = Math.round(len / CELL);
      // a zig-zag column of cells, one cell proud of the surface (local +z points out after rotation.y = a)
      const cells: Cell[] = [];
      for (let j = 0; j < n; j++) cells.push([j % 2, j, 1]);
      const c = voxCells(cells, crackMat, Math.sin(a) * bodyR(yc), yc - (n * CELL) / 2, Math.cos(a) * bodyR(yc));
      c.rotation.y = a;
      c.visible = false;
      cracks.push(c);
    }
    root.add(body, cap, shardA, shardB, gem, runeG, aura, ...cracks);
    let shown = 0;
    let flash = 0;
    let lastHp = 1;
    let jolt = 0;
    const meshes = [body, cap, shardA, shardB, gem, rune, ...cracks];
    return {
      root, height: 3.6,
      update(dt, t, hpFrac = 1) {
        // every HP drop jolts the monolith (derived from hpFrac, so every peer shakes on the same hits)
        if (hpFrac < lastHp - 1e-4) jolt = 1;
        lastHp = hpFrac;
        jolt = Math.max(0, jolt - dt * 4);
        root.rotation.z = Math.sin(t * 45) * 0.035 * jolt;
        root.rotation.x = Math.cos(t * 39) * 0.02 * jolt;
        const engaged = hpFrac < 0.999;
        core.emissiveIntensity = engaged ? 1.0 + Math.sin(t * 4) * 0.3 : 0.04;
        gem.position.y = 1.9 + Math.sin(t * 2) * 0.05;
        gem.rotation.y = t * 1.2;
        runeG.rotation.y += dt * (engaged ? 1.4 : 0.25);
        auraMat.opacity = engaged ? 0.26 + Math.sin(t * 3) * 0.05 : 0;
        let n = 0;
        for (let i = 0; i < CRACK_AT.length; i++) {
          const on = hpFrac <= CRACK_AT[i];
          cracks[i].visible = on;
          if (on) n++;
        }
        if (n > shown) flash = 1;
        shown = n;
        flash = Math.max(0, flash - dt * 2.5);
        crackMat.emissiveIntensity = 0.6 + flash * 2.4;
      },
      dispose() {
        for (const m of meshes) m.geometry.dispose();
        aura.geometry.dispose();
        basalt.dispose(); trim.dispose(); core.dispose(); crackMat.dispose(); runeMat.dispose(); auraMat.dispose();
      },
    };
  },
  /** Kevvas Boşluk Yarığı: upright voxel ring, a swirling voxel disc and an inner swirl. */
  rift: (tint = 0x8040ff) => {
    const root = new THREE.Group();
    const ring1 = lambert(tint, tint, 1.4);
    const disc1 = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const t1 = voxCells(ring(1.25, 'xy', 1.4), ring1);
    const d = voxMesh(disc(1.15), disc1, 0, 1.4, 0);
    // centred on its own origin so the spin and the scale pivot on the swirl's centre
    const swirl = voxCells(ring(0.6, 'xy', 0), ring1, 0, 1.4, 0.2);
    root.add(t1, d, swirl);
    return {
      root, height: 2.8,
      update(_dt, t) {
        d.rotation.z = t * 2.2;
        swirl.rotation.z = -t * 3.4;
        swirl.scale.setScalar(1 + Math.sin(t * 5) * 0.15);
        ring1.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.4;
      },
      dispose: finish([t1, d, swirl], [ring1, disc1]),
    };
  },
};

export function hasProcModel(id: string): boolean {
  return id in BUILDERS;
}

export function buildProcModel(id: string, tint?: number): ProcModel | null {
  const b = BUILDERS[id];
  return b ? b(tint) : null;
}
