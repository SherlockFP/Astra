import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getPiece, loadPieces, type Piece, type PiecePart } from './Pieces';

/**
 * Collects static piece placements and turns them into chunked InstancedMeshes: one per
 * (chunk, model url, material variant, shadow flags). Per-instance colour (instanceColor) carries tints so a
 * single material serves every theme. Parts of one model that share a material (and vertex layout) are merged into a single
 * geometry once per model, so a multi-part prop costs one draw per chunk, not one per part. Small instances (see
 * SHADOW_MIN_EXTENT) are batched apart and never cast shadows, since every caster is re-drawn in the shadow pass. OWNER: world module.
 */

/** One drawable of a piece: a (possibly merged) geometry with one material. */
interface Draw { geometry: THREE.BufferGeometry; material: THREE.Material }

/** Merged draws per piece and skip pattern (built lazily, shared by every chunk that uses the piece). */
const drawCache = new WeakMap<Piece, Map<string, Draw[]>>();

/** Vertex-layout signature: parts merge only when attributes, item sizes, array types and index presence all agree. */
function layoutKey(g: THREE.BufferGeometry, id: number): string {
  if (Object.keys(g.morphAttributes).length) return `morph${id}`; // morph targets are never merged
  const attrs = Object.keys(g.attributes).sort().map((name) => {
    const a = g.attributes[name];
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
  });
  return `${g.index ? 'i' : 'n'}|${attrs.join(',')}`;
}

function buildDraws(parts: PiecePart[]): Draw[] {
  const groups = new Map<string, PiecePart[]>();
  let uniq = 0;
  for (const p of parts) {
    const key = `${p.material.uuid}|${layoutKey(p.geometry, uniq++)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(p);
  }
  const out: Draw[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push({ geometry: list[0].geometry, material: list[0].material });
      continue;
    }
    const merged = mergeGeometries(list.map((p) => p.geometry), false);
    if (merged) out.push({ geometry: merged, material: list[0].material });
    else for (const p of list) out.push({ geometry: p.geometry, material: p.material });
  }
  return out;
}

/** The draws of a piece for one skip pattern (parts whose mesh name matches `skip` are left out). */
function drawsOf(piece: Piece, skip: RegExp | null): Draw[] {
  const key = skip ? skip.source : '';
  let perPiece = drawCache.get(piece);
  if (!perPiece) {
    perPiece = new Map();
    drawCache.set(piece, perPiece);
  }
  let list = perPiece.get(key);
  if (!list) {
    list = buildDraws(piece.parts.filter((p) => !(skip && skip.test(p.name))));
    perPiece.set(key, list);
  }
  return list;
}

/**
 * Distance-culling layers of the open world (GDD_OPENWORLD §1.5): every InstancedMesh is tagged with one of these and
 * `ChunkCuller` hides it beyond the layer's limit. 'other' (default) is never culled by distance.
 */
export type CullLayer = 'tree' | 'bush' | 'rock' | 'tuft' | 'flower' | 'prop' | 'border' | 'other';

export interface InstOpts {
  cast?: boolean;
  receive?: boolean;
  /** Registered material variant id (see registerVariant), e.g. 'ice' for shiny floors. */
  variant?: string;
  /** Skip model parts whose mesh name matches (e.g. animated door leaves rendered separately). */
  skip?: RegExp;
  /** Distance-culling layer (open world). Default 'other'. */
  layer?: CullLayer;
}

interface Rec { m: THREE.Matrix4; c: THREE.Color | null }
interface Group { url: string; chunk: string; cx: number; cz: number; cast: boolean; receive: boolean; variant: string; skip: RegExp | null; layer: CullLayer; recs: Rec[] }

/**
 * Instances whose largest world-space side is below this (m) draw without a shadow: grass tufts, flowers, reeds, pebbles, small
 * rocks and clutter. Same threshold as the static-model rule in Assets (SHADOW_MIN_EXTENT). Applied per instance in build().
 */
export const SHADOW_MIN_EXTENT = 0.75;

/** Largest axis scale of an instance matrix (the matrix columns carry the scaled axes). */
function matrixScale(m: THREE.Matrix4): number {
  const e = m.elements;
  return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

export class InstanceBatcher {
  private groups = new Map<string, Group>();
  private variants = new Map<string, (base: THREE.Material) => THREE.Material>();
  private variantCache = new Map<string, THREE.Material>();
  readonly meshes: THREE.InstancedMesh[] = [];
  /** Materials created by variants (disposed with the batcher). */
  private ownMaterials: THREE.Material[] = [];
  count = 0;

  constructor(private parent: THREE.Object3D, private chunkSize = 24) {}

  registerVariant(id: string, make: (base: THREE.Material) => THREE.Material): void {
    this.variants.set(id, make);
  }

  add(url: string, x: number, y: number, z: number, rotY = 0, scale: number | [number, number, number] = 1, color?: THREE.ColorRepresentation | null, opts: InstOpts = {}): void {
    _p.set(x, y, z);
    _q.setFromAxisAngle(_Y, rotY);
    if (typeof scale === 'number') _s.set(scale, scale, scale);
    else _s.set(scale[0], scale[1], scale[2]);
    _m.compose(_p, _q, _s);
    this.addMatrix(url, _m, color, opts);
  }

  /** Full rotation variant (x/z tilts). */
  addEuler(url: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, scale = 1, color?: THREE.ColorRepresentation | null, opts: InstOpts = {}): void {
    _p.set(x, y, z);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    this.addMatrix(url, _m, color, opts);
  }

  addMatrix(url: string, m: THREE.Matrix4, color?: THREE.ColorRepresentation | null, opts: InstOpts = {}): void {
    const e = m.elements;
    const cx = Math.floor(e[12] / this.chunkSize), cz = Math.floor(e[14] / this.chunkSize);
    const cast = opts.cast ?? true, receive = opts.receive ?? true, variant = opts.variant ?? '';
    const layer: CullLayer = opts.layer ?? 'other';
    const key = `${url}|${cx},${cz}|${cast ? 1 : 0}${receive ? 1 : 0}|${variant}|${opts.skip?.source ?? ""}|${layer}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { url, chunk: `${cx},${cz}`, cx, cz, cast, receive, variant, skip: opts.skip ?? null, layer, recs: [] };
      this.groups.set(key, g);
    }
    g.recs.push({ m: m.clone(), c: color == null ? null : new THREE.Color(color) });
    this.count++;
  }

  urls(): string[] {
    return [...new Set([...this.groups.values()].map((g) => g.url))];
  }

  /** Load every referenced model and create the instanced meshes. Returns the list of missing urls. */
  async build(): Promise<string[]> {
    await loadPieces(this.urls());
    const missing = new Set<string>();
    for (const g of this.groups.values()) {
      const piece = getPiece(g.url);
      if (!piece) {
        missing.add(g.url);
        continue;
      }
      // Shadow casters are decided per instance: an instance whose largest world side is under SHADOW_MIN_EXTENT is split
      // into its own no-shadow batch (every caster is drawn again in the shadow pass).
      const ext = Math.max(piece.size.x, piece.size.y, piece.size.z);
      const canCast = g.cast && !piece.hasGlow;
      const casters: Rec[] = [], plain: Rec[] = [];
      for (const r of g.recs) (canCast && ext * matrixScale(r.m) >= SHADOW_MIN_EXTENT ? casters : plain).push(r);
      if (casters.length) this.emit(g, piece, casters, true);
      if (plain.length) this.emit(g, piece, plain, false);
    }
    this.groups.clear();
    return [...missing];
  }

  /** One InstancedMesh per draw of the piece for these instances. */
  private emit(g: Group, piece: Piece, recs: Rec[], cast: boolean): void {
    const n = recs.length;
    const anyColor = recs.some((r) => r.c);
    for (const draw of drawsOf(piece, g.skip)) {
      const mat = this.resolveMaterial(draw.material, g.variant);
      const im = new THREE.InstancedMesh(draw.geometry, mat, n);
      im.name = `${g.url.split('/').pop()}@${g.chunk}`;
      // chunk centre (world metres) and layer, read by ChunkCuller
      im.userData.layer = g.layer;
      im.userData.center = new THREE.Vector2((g.cx + 0.5) * this.chunkSize, (g.cz + 0.5) * this.chunkSize);
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, recs[i].m);
        if (anyColor) im.setColorAt(i, recs[i].c ?? WHITE);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = cast;
      im.receiveShadow = g.receive;
      // the object transform is identity and never changes (every instance carries its own matrix), so skip the per-frame recompose
      im.matrixAutoUpdate = false;
      im.computeBoundingSphere();
      im.computeBoundingBox();
      this.parent.add(im);
      this.meshes.push(im);
    }
  }

  private resolveMaterial(base: THREE.Material, variant: string): THREE.Material {
    if (!variant) return base;
    const make = this.variants.get(variant);
    if (!make) return base;
    const key = `${base.uuid}|${variant}`;
    let m = this.variantCache.get(key);
    if (!m) {
      m = make(base);
      this.variantCache.set(key, m);
      this.ownMaterials.push(m);
    }
    return m;
  }

  dispose(): void {
    for (const im of this.meshes) {
      im.removeFromParent();
      im.dispose();
    }
    this.meshes.length = 0;
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials.length = 0;
    this.variantCache.clear();
    this.groups.clear();
  }
}

/**
 * Hides InstancedMeshes whose layer is beyond its distance limit (measured from the camera / focus to the chunk centre).
 * Runs every 0.25 s (cheap: one pass over ~2,500 meshes). Limits are plain fields so the owner can change them per region
 * (e.g. tufts follow the region fog). Layers without a limit stay visible. OWNER: world module.
 */
export class ChunkCuller {
  /** Max distance (m) per layer. Missing layer = no distance culling. */
  limits: Partial<Record<CullLayer, number>> = {};
  private acc = 1;
  private hidden = 0;

  constructor(private batcher: InstanceBatcher, private chunkSize = 40) {}

  update(dt: number, x: number, z: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const slack = this.chunkSize * 0.71; // half-diagonal of a chunk
    let hidden = 0;
    for (const im of this.batcher.meshes) {
      const layer = (im.userData.layer as CullLayer | undefined) ?? 'other';
      const lim = this.limits[layer];
      const c = im.userData.center as THREE.Vector2 | undefined;
      if (lim === undefined || !c) {
        im.visible = true;
        continue;
      }
      const vis = Math.hypot(c.x - x, c.y - z) <= lim + slack;
      im.visible = vis;
      if (!vis) hidden++;
    }
    this.hidden = hidden;
  }

  /** Meshes hidden by distance at the last update (dev readout). */
  get hiddenCount(): number {
    return this.hidden;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
