import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Dense stylized grass near the camera (open world). Chunky voxel tufts (Trove-like): near the player each tuft is a cluster of
 * three thin boxes; beyond NEAR metres it is a crossed pair of cards, thinned out with distance. Three draw calls in total
 * (near tufts, far cards, flowers). Placement is a deterministic hash per 8 m cell, cached; the instance buffers are rewritten
 * only when the camera moves into another cell (never per frame per blade). Wind, gusts, player trampling and the distance
 * fade run in the vertex shader from a few uniforms. OWNER: world module.
 */

export type GrassDensity = 'off' | 'low' | 'mid' | 'high';
export const GRASS_DENSITIES: readonly GrassDensity[] = ['off', 'low', 'mid', 'high'];
export const DEFAULT_GRASS_DENSITY: GrassDensity = 'mid';

/** Tuft candidates per square metre before the keep-out (generation is per cell, then split near / far at rebuild time). */
const CLUSTERS_PER_M2: Record<GrassDensity, number> = { off: 0, low: 0.7, mid: 1.1, high: 1.6 };
/** Flower candidates per square metre. */
const FLOWERS_PER_M2: Record<GrassDensity, number> = { off: 0, low: 0.03, mid: 0.05, high: 0.08 };

const CELL = 8;
/** Tufts are generated out to RADIUS; inside NEAR they are box clusters, beyond it cards kept with FAR_KEEP. */
const RADIUS = 40;
const NEAR = 18;
const FAR_KEEP = 0.3;
const FLOWER_RANGE = 26;
const FADE_START = 32;
const FADE_END = 40;

/** Ground sample from the splat (world/Terrain weights). */
export interface GrassGround { dirt: number; cobble: number; dark: number }

export interface GrassHost {
  parent: THREE.Object3D;
  /** Splat weights at a world position (roads, dirt, dark patches are kept clear). */
  ground(x: number, z: number): GrassGround;
  /** Ground height at a world position. */
  height(x: number, z: number): number;
  /** Water, steep rock, villages and building footprints are kept clear. */
  clear(x: number, z: number): boolean;
  /** Region palette at a world position. */
  palette(x: number, z: number): GrassPalette;
}

export interface GrassPalette {
  /** Tuft root and tip colours (the root is the darker, blends into the ground; the tip is lighter). */
  root: number;
  tip: number;
  /** Flower colours for this region (2-3). */
  flowers: number[];
  /** Clover patches colour. */
  clover: number;
}

/** Saturated, bright palettes. Orange is only used in the autumn and canyon regions (r3, r5). */
const PALETTES: Record<string, GrassPalette> = {
  r1: { root: 0x3f8f24, tip: 0xb4f05a, flowers: [0xffe44a, 0xff7ab6, 0xffffff], clover: 0x2fb446 },
  r2: { root: 0x8c9a22, tip: 0xf6da4e, flowers: [0xffffff, 0xff9a3a, 0xffe44a], clover: 0x8fb032 },
  r3: { root: 0x7a6a1e, tip: 0xe0a83a, flowers: [0xff6a2a, 0xffd23a, 0xb0462a], clover: 0x8a7a24 },
  r4: { root: 0x2f7a46, tip: 0xa6e06a, flowers: [0xd0a0ff, 0xffe06a, 0x80c0ff], clover: 0x3a9a50 },
  r5: { root: 0x947428, tip: 0xf2b65a, flowers: [0xff8a4a, 0xffe08a, 0xd8602a], clover: 0xa08a3a },
  r6: { root: 0x4f3380, tip: 0xab7cf0, flowers: [0xff5ad8, 0xc8f060, 0x9a6aff], clover: 0x6a3a9a },
};
const FROST: GrassPalette = { root: 0x7d9bb0, tip: 0xeef8ff, flowers: [0xffffff, 0xbfe6ff], clover: 0x9ec4d8 };
const DEFAULT_PALETTE: GrassPalette = PALETTES.r1;

/** Shared uniforms: updated once per frame, read by every tuft in the vertex shader. */
const uniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(0.9, 0, 0.35) },
  uPush: { value: new THREE.Vector4(1e6, 0, 1e6, 1.2) },
  uCam: { value: new THREE.Vector3() },
  uFade: { value: new THREE.Vector2(FADE_START, FADE_END) },
};

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * One thin voxel box standing on the ground at (x, z). `bend` is the bend weight: a fixed value (flower heads) or, by default,
 * the height fraction (root 0 .. top 1). Root vertices are darker in the colour attribute, tips lighter.
 */
function voxelBox(x: number, z: number, w: number, h: number, yaw: number, bend?: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, w);
  g.deleteAttribute('uv');
  g.translate(0, h / 2, 0);
  g.rotateY(yaw);
  g.translate(x, 0, z);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), bd = new Float32Array(p.count);
  for (let k = 0; k < p.count; k++) {
    const b = bend ?? Math.min(1, Math.max(0, p.getY(k) / h));
    const c = bend !== undefined ? 1.3 : 0.55 + 0.6 * b;
    col[k * 3] = c; col[k * 3 + 1] = c; col[k * 3 + 2] = c;
    bd[k] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aBend', new THREE.BufferAttribute(bd, 1));
  return g;
}

/** Near tuft: a chunky cluster of three thin voxel blades (three boxes, 36 triangles). */
function clusterGeometry(): THREE.BufferGeometry {
  const parts = [
    voxelBox(0, 0, 0.13, 0.52, 0.2),
    voxelBox(0.1, 0.05, 0.11, 0.4, 0.9),
    voxelBox(-0.08, -0.05, 0.11, 0.46, 2.1),
  ];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Far tuft: two crossed cards (4 triangles). Same attributes as the box cluster, so the same material runs it. */
function cardGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], bend: number[] = [], idx: number[] = [];
  const hw = 0.13, h = 0.5;
  for (const yaw of [0, Math.PI / 2]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const base = pos.length / 3;
    for (const [x, y, b] of [[-hw, 0, 0], [hw, 0, 0], [hw, h, 1], [-hw, h, 1]] as const) {
      pos.push(x * c, y, x * s);
      const k = 0.55 + 0.6 * b;
      col.push(k, k, k);
      bend.push(b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBend', new THREE.Float32BufferAttribute(bend, 1));
  g.setIndex(idx);
  return g;
}

/** A tiny voxel flower: a thin stem box and a bright head box (bend 1, so the head sways). */
function flowerGeometry(): THREE.BufferGeometry {
  const parts = [voxelBox(0, 0, 0.05, 0.36, 0), voxelBox(0, 0, 0.11, 0.11, 0, 1)];
  const head = parts[1];
  head.translate(0, 0.3, 0);
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Wind, bend, fade and voxel shaping in the vertex shader. Lambert lighting; instance colour = palette. */
function windMaterial(opts: { flower: boolean }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.uniforms.uPush = uniforms.uPush;
    sh.uniforms.uCam = uniforms.uCam;
    sh.uniforms.uFade = uniforms.uFade;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aOff;     // world x, y, z, yaw
attribute vec2 aP;       // scale, phase
attribute float aBend;   // 0 at the root, 1 at the tip
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uPush;
uniform vec3 uCam;
uniform vec2 uFade;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(sin(aOff.w) * 0.35, 1.0, cos(aOff.w) * 0.35));')
      .replace('#include <begin_vertex>', `
        vec3 transformed = position;
        vec2 gw = aOff.xz;
        float gDist = distance(gw, uCam.xz);
        float gFade = 1.0 - smoothstep(uFade.x, uFade.y, gDist);
        float gSc = aP.x * gFade;
        float cy = cos(aOff.w), sy = sin(aOff.w);
        vec2 lxz = vec2(transformed.x * cy - transformed.z * sy, transformed.x * sy + transformed.z * cy) * gSc;
        transformed = vec3(lxz.x, transformed.y * gSc, lxz.y);
        float bA = aBend * aBend;
        // rolling gusts: a wave crossing the field plus a small per-tuft flutter
        float gust = sin(gw.x * 0.11 + gw.y * 0.07 - uTime * 1.25) * 0.5 + sin(gw.x * 0.23 - gw.y * 0.17 + uTime * 2.1) * 0.25 + 0.35;
        vec2 wind = uWind.xz * (0.5 + gust * 0.6) + vec2(sin(uTime * 3.3 + aP.y * 6.283), cos(uTime * 2.9 + aP.y * 6.283)) * 0.05;
        transformed.xz += wind * bA * 0.3 * gFade;
        // trampled by the player: tufts bend away from the player and flatten
        vec2 dp = gw - uPush.xz;
        float dl = length(dp);
        float push = max(0.0, 1.0 - dl / uPush.w);
        transformed.xz += normalize(dp + vec2(1e-4)) * push * bA * 0.5;
        transformed.y -= push * bA * 0.2 * aP.x;
        transformed += vec3(aOff.x, aOff.y, aOff.z);
        ${opts.flower ? 'transformed.y -= 0.03 * bA;' : ''}
      `)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  mat.customProgramCacheKey = () => (opts.flower ? 'grass-flower' : 'grass-tuft');
  return mat;
}

interface Cell { n: number; off: Float32Array; col: Float32Array; ph: Float32Array; foff: Float32Array; fcol: Float32Array; nf: number }

interface Batch { mesh: THREE.InstancedMesh; off: THREE.InstancedBufferAttribute; p: THREE.InstancedBufferAttribute; col: THREE.InstancedBufferAttribute }

export class GrassField {
  readonly group = new THREE.Group();
  private near: Batch | null = null;
  private far: Batch | null = null;
  private flowers: Batch | null = null;
  private readonly cache = new Map<number, Cell>();
  private density: GrassDensity = 'off';
  private cellI = NaN;
  private cellJ = NaN;
  private readonly clusterGeo = clusterGeometry();
  private readonly cardGeo = cardGeometry();
  private readonly flowerGeo = flowerGeometry();
  private readonly tuftMat = windMaterial({ flower: false });
  private readonly flowerMat = windMaterial({ flower: true });
  /** Ring cells around the camera (fixed for the radius). Buffers are allocated once per density, sized to the whole ring. */
  private readonly ring: [number, number][] = [];

  constructor(private readonly host: GrassHost, private readonly seed: number) {
    this.group.name = 'grass-field';
    host.parent.add(this.group);
    const R = Math.ceil(RADIUS / CELL);
    for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) {
      const dx = (di + 0.5) * CELL, dz = (dj + 0.5) * CELL;
      if (dx * dx + dz * dz <= (RADIUS + CELL) * (RADIUS + CELL)) this.ring.push([di, dj]);
    }
  }

  setDensity(d: GrassDensity): void {
    if (!GRASS_DENSITIES.includes(d) || d === this.density) return;
    this.density = d;
    this.cache.clear();
    this.cellI = NaN;
    this.group.clear();
    this.near = null;
    this.far = null;
    this.flowers = null;
  }

  getDensity(): GrassDensity { return this.density; }

  /** Per frame: a few uniforms; the buffers are rewritten only when the camera enters another 8 m cell. */
  update(time: number, dt: number, player: { x: number; z: number }, cam: { x: number; z: number }, windX: number, windZ: number): void {
    void dt;
    if (this.density === 'off') { this.group.visible = false; return; }
    this.group.visible = true;
    uniforms.uTime.value = time;
    uniforms.uWind.value.set(windX, 0, windZ);
    uniforms.uCam.value.set(cam.x, 0, cam.z);
    uniforms.uPush.value.set(player.x, 0, player.z, 1.2);
    const i = Math.floor(cam.x / CELL), j = Math.floor(cam.z / CELL);
    if (i !== this.cellI || j !== this.cellJ) {
      this.cellI = i; this.cellJ = j;
      this.rebuild(i, j, cam.x, cam.z);
    }
  }

  private perCellTufts(): number { return Math.ceil(CELL * CELL * CLUSTERS_PER_M2[this.density] * 1.6) + 4; }
  private perCellFlowers(): number { return Math.ceil(CELL * CELL * FLOWERS_PER_M2[this.density] * 1.6) + 2; }

  private cellOf(i: number, j: number): Cell {
    const key = (i + 32768) * 65536 + (j + 32768);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const dens = CLUSTERS_PER_M2[this.density], fdens = FLOWERS_PER_M2[this.density];
    const nMax = this.perCellTufts(), fMax = this.perCellFlowers();
    const c: Cell = { n: 0, off: new Float32Array(nMax * 4), col: new Float32Array(nMax * 3), ph: new Float32Array(nMax * 2), foff: new Float32Array(fMax * 4), fcol: new Float32Array(fMax * 3), nf: 0 };
    const ox = i * CELL, oz = j * CELL;
    const pal = this.host.palette(ox + CELL / 2, oz + CELL / 2);
    const rootC = new THREE.Color(pal.root), tipC = new THREE.Color(pal.tip), cloverC = new THREE.Color(pal.clover);
    const s = this.seed;
    const expected = CELL * CELL * dens;
    const count = Math.floor(expected) + (hash(i, j, s + 1) < expected % 1 ? 1 : 0);
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < count && n < nMax; k++) {
      const x = ox + hash(i, j, s + 10 + k * 3) * CELL;
      const z = oz + hash(i, j, s + 11 + k * 3) * CELL;
      if (!this.keep(x, z)) continue;
      const y = this.host.height(x, z);
      const yaw = hash(i, j, s + 12 + k * 3) * Math.PI * 2;
      const sc = 0.8 + hash(i, j, s + 13 + k * 3) * 0.4;
      // clover patches: a noise lump colours some tufts clover-green
      const clover = hash(Math.floor(x / 3), Math.floor(z / 3), s + 99) > 0.82;
      const t = hash(i, j, s + 14 + k * 3);
      col.copy(clover ? cloverC : rootC).lerp(clover ? cloverC : tipC, t * 0.6);
      c.off[n * 4] = x; c.off[n * 4 + 1] = y; c.off[n * 4 + 2] = z; c.off[n * 4 + 3] = yaw;
      c.col[n * 3] = col.r; c.col[n * 3 + 1] = col.g; c.col[n * 3 + 2] = col.b;
      c.ph[n * 2] = sc; c.ph[n * 2 + 1] = hash(i, j, s + 15 + k * 3);
      n++;
    }
    c.n = n;
    // flowers: a second hash stream on grass only, coloured from the region palette
    const fexp = CELL * CELL * fdens;
    const fcount = Math.floor(fexp) + (hash(i, j, s + 2) < fexp % 1 ? 1 : 0);
    let nf = 0;
    for (let k = 0; k < fcount && nf < fMax; k++) {
      const x = ox + hash(i, j, s + 200 + k * 3) * CELL;
      const z = oz + hash(i, j, s + 201 + k * 3) * CELL;
      if (!this.keep(x, z)) continue;
      const y = this.host.height(x, z);
      const fc = new THREE.Color(pal.flowers[Math.floor(hash(i, j, s + 202 + k * 3) * pal.flowers.length) % pal.flowers.length]);
      c.foff[nf * 4] = x; c.foff[nf * 4 + 1] = y; c.foff[nf * 4 + 2] = z; c.foff[nf * 4 + 3] = hash(i, j, s + 203 + k * 3) * Math.PI * 2;
      c.fcol[nf * 3] = fc.r; c.fcol[nf * 3 + 1] = fc.g; c.fcol[nf * 3 + 2] = fc.b;
      nf++;
    }
    c.nf = nf;
    this.cache.set(key, c);
    return c;
  }

  /** Keep-out: roads, dirt, dark patches, water, steep rock, villages and building footprints. */
  private keep(x: number, z: number): boolean {
    const g = this.host.ground(x, z);
    if (g.cobble > 0.25 || g.dirt > 0.4 || g.dark > 0.35) return false;
    return this.host.clear(x, z);
  }

  private makeBatch(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): Batch {
    const off = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const p = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    geo.setAttribute('aOff', off);
    geo.setAttribute('aP', p);
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor = col;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    this.group.add(mesh);
    return { mesh, off, p, col };
  }

  /**
   * Writes the cached cells around (ci, cj) into the batches. Tufts within NEAR of the camera go to the box cluster batch,
   * the rest to the card batch (thinned by FAR_KEEP through the cell's phase value). Flowers only within FLOWER_RANGE.
   */
  private rebuild(ci: number, cj: number, camX: number, camZ: number): void {
    if (!this.near || !this.far || !this.flowers) {
      const cap = this.ring.length * this.perCellTufts();
      const fcap = this.ring.length * this.perCellFlowers();
      this.near = this.makeBatch(this.clusterGeo.clone(), this.tuftMat, cap);
      this.far = this.makeBatch(this.cardGeo.clone(), this.tuftMat, cap);
      this.flowers = this.makeBatch(this.flowerGeo.clone(), this.flowerMat, fcap);
    }
    const cells = this.ring.map(([di, dj]) => this.cellOf(ci + di, cj + dj));
    const nb = this.near, fb = this.far, wb = this.flowers;
    let nn = 0, nf = 0, nw = 0;
    for (const c of cells) {
      for (let k = 0; k < c.n; k++) {
        const x = c.off[k * 4], z = c.off[k * 4 + 2];
        const d = Math.hypot(x - camX, z - camZ);
        const toNear = d < NEAR;
        if (!toNear && c.ph[k * 2 + 1] >= FAR_KEEP) continue;
        const b = toNear ? nb : fb;
        const w = toNear ? nn++ : nf++;
        b.off.array.set(c.off.subarray(k * 4, k * 4 + 4), w * 4);
        b.col.array.set(c.col.subarray(k * 3, k * 3 + 3), w * 3);
        b.p.array.set(c.ph.subarray(k * 2, k * 2 + 2), w * 2);
      }
      for (let k = 0; k < c.nf; k++) {
        const x = c.foff[k * 4], z = c.foff[k * 4 + 2];
        if (Math.hypot(x - camX, z - camZ) > FLOWER_RANGE) continue;
        wb.off.array.set(c.foff.subarray(k * 4, k * 4 + 4), nw * 4);
        wb.col.array.set(c.fcol.subarray(k * 3, k * 3 + 3), nw * 3);
        (wb.p.array as Float32Array)[nw * 2] = 1;
        (wb.p.array as Float32Array)[nw * 2 + 1] = 0.5;
        nw++;
      }
    }
    for (const b of [nb, fb, wb]) { b.off.needsUpdate = true; b.p.needsUpdate = true; b.col.needsUpdate = true; }
    nb.mesh.count = nn;
    fb.mesh.count = nf;
    wb.mesh.count = nw;
    // bound the cache: keep a few hundred cells near the player, drop the rest (re-hashed on demand)
    if (this.cache.size > 400) {
      for (const k of [...this.cache.keys()]) if (this.cache.size > 200) this.cache.delete(k);
    }
  }

  dispose(): void {
    for (const b of [this.near, this.far, this.flowers]) b?.mesh.geometry.dispose();
    this.clusterGeo.dispose();
    this.cardGeo.dispose();
    this.flowerGeo.dispose();
    this.tuftMat.dispose();
    this.flowerMat.dispose();
    this.group.removeFromParent();
    this.cache.clear();
  }
}

/** Palette of a region look (the frost palette is used on snow zones by the caller). */
export function grassPaletteFor(regionId: string | null, snow: boolean): GrassPalette {
  if (snow) return FROST;
  return (regionId && PALETTES[regionId]) || DEFAULT_PALETTE;
}

export { uniforms as grassUniforms };
