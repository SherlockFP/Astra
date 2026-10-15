import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getPiece, loadPieces, type Piece, type PiecePart } from './Pieces';
import { isShadowCaster, isFadeableHeight } from '../render/shadowPolicy';
import type { StreamInstance } from './chunks/ChunkContent';
import { analyseVoxelMesh, downsample, mergeFaces, type RawMesh } from './VoxelLod';

/**
 * Collects static piece placements and turns them into chunked InstancedMeshes: one per
 * (chunk, model url, material variant, shadow flags). Per-instance colour (instanceColor) carries tints so a
 * single material serves every theme. Parts of one model that share a material (and vertex layout) are merged into a single
 * geometry once per model, so a multi-part prop costs one draw per chunk, not one per part. Instances that are not shadow casters
 * (render/shadowPolicy) are batched apart and never cast shadows, since every caster is re-drawn in the shadow pass. OWNER: world module.
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

// ---------------------------------------------------------------------------------------------------------------------
// Voxel LOD (world/VoxelLod.ts): scatter layers draw their instances in distance tiers
// ---------------------------------------------------------------------------------------------------------------------

/** Layers whose instances are split into distance tiers (the dense scatter; hand-placed props keep one mesh per chunk). */
const LOD_LAYERS: ReadonlySet<CullLayer> = new Set<CullLayer>(['tree', 'border', 'bush', 'rock', 'tuft', 'flower']);
/** Cell edge multipliers of the three tiers: tier 0 is the full model with coplanar faces merged, tiers 1 / 2 a 2x / 4x coarser voxel copy. */
const LOD_FACTORS = [1, 2, 4] as const;
/** LOD can be switched off (tests, A/B): every group then keeps the plain one-mesh-per-chunk path. */
let lodEnabled = true;
export function setVoxelLodEnabled(on: boolean): void {
  lodEnabled = on;
}

/**
 * Distance tiers of one layer around the focus (m): [0, d0) the full model (and the only tier that casts shadows), [d0, d1) the 2x
 * coarser copy, [d1, end) the 4x copy, beyond `end` nothing is drawn. keep1 / keep2 are the shares of the instances kept in tiers 1 / 2
 * (a fixed per-instance rank, so the same trees stay and the same ones thin out; every peer's colliders are unaffected: this is visual only).
 */
export interface LodPlan {
  d0: number; d1: number; end: number; keep1: number; keep2: number;
  /**
   * Angular rule (optional): the same tiers at the 1x scale, before the fog cap (d0 / d1 / end above are these capped by `cap`).
   * A voxel copy is built at the instance's scale, so each threshold of an instance scales with its scale: a 2.8x tree takes its 2x
   * copy at 2.8 times the distance, and its voxels read the same size on screen as a 1x tree's. No threshold passes `cap` (the fog).
   */
  angular?: { d0: number; d1: number; end: number; cap: number };
}

const lodCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry[] | null>();

function lodGeometry(lm: ReturnType<typeof mergeFaces>): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(lm.position, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(lm.uv, 2));
  if (lm.normal) g.setAttribute('normal', new THREE.BufferAttribute(lm.normal, 3));
  g.setIndex(new THREE.BufferAttribute(lm.index, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * The three tier geometries of a draw geometry (merged copy, 2x, 4x), or null when it is not a flat-palette voxel mesh. Built once per
 * geometry (the piece cache keeps those alive), shared by every chunk. Never throws.
 */
export function voxelLodGeometries(g: THREE.BufferGeometry): THREE.BufferGeometry[] | null {
  const hit = lodCache.get(g);
  if (hit !== undefined) return hit;
  let out: THREE.BufferGeometry[] | null = null;
  try {
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    const plain = pos && uv && !(pos as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute
      && !(uv as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute
      && pos.array instanceof Float32Array && uv.array instanceof Float32Array && pos.itemSize === 3 && uv.itemSize === 2
      && Object.keys(g.morphAttributes).length === 0;
    if (plain) {
      const raw: RawMesh = { position: pos.array as Float32Array, uv: uv.array as Float32Array, index: g.index ? g.index.array : null };
      const v = analyseVoxelMesh(raw);
      if (v) {
        const withN = !!g.getAttribute('normal');
        const triOrig = (g.index ? g.index.count : pos.count) / 3;
        const t0 = mergeFaces(v, withN);
        if (t0.triangles > 0 && t0.triangles <= triOrig) {
          out = [lodGeometry(t0), lodGeometry(downsample(v, LOD_FACTORS[1], 0.2, withN)), lodGeometry(downsample(v, LOD_FACTORS[2], 0.2, withN))];
        }
      }
    }
  } catch {
    out = null;
  }
  lodCache.set(g, out);
  return out;
}

/** Cheap deterministic 0..255 rank of an instance (from its position): which ones a thinned tier keeps. */
function rankOf(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 64) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 64) | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) & 255;
}

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

/** Largest axis scale of an instance matrix (the matrix columns carry the scaled axes). */
function matrixScale(m: THREE.Matrix4): number {
  const e = m.elements;
  return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
}

/** What a chunk (or the whole batcher, when not streamed) made: its meshes and its LOD sets. */
interface Bag { meshes: THREE.InstancedMesh[]; sets: LodSet[] }

let tierScratch = new Int8Array(1024);
const tierCount = [0, 0, 0];

/**
 * One group of instances (same model, chunk, flags) drawn in distance tiers. The matrices live in one array; every update (the culler,
 * at most every 0.25 s and only after the focus moved) sorts the instances into tier 0 (full model, casts shadows), 1 and 2 (coarser
 * voxel copies, thinned) or nothing, writes them to the tier meshes and fits each mesh's bounding sphere to what it holds, so three's
 * frustum culling and the shadow pass only see what is really there. Tier meshes are made when first needed (tier 0 at once: the
 * camera occluder list is collected from them) and belong to the chunk bag, so a chunk unload frees them with the rest.
 */
export class LodSet {
  dirty = true;
  private hidden = false;
  private lastX = NaN;
  private lastZ = NaN;
  private lastPlan: LodPlan | null = null;
  private readonly n: number;
  private readonly m: Float32Array;
  private readonly col: Float32Array | null;
  private readonly rank: Uint8Array;
  private readonly maxScale: number;
  /** Per-instance scale (largest axis): the angular tier rule scales the thresholds with it. */
  private readonly sc: Float32Array;
  private readonly tiers: (THREE.InstancedMesh | null)[][] = [];

  constructor(
    private readonly batcher: InstanceBatcher,
    private readonly bag: Bag | null,
    private readonly draws: { geos: THREE.BufferGeometry[]; mat: THREE.Material }[],
    recs: Rec[],
    readonly layer: CullLayer,
    private readonly cx: number,
    private readonly cz: number,
    private readonly chunkR: number,
    private readonly cast: boolean,
    private readonly receive: boolean,
    private readonly fadeable: boolean,
    private readonly name: string,
  ) {
    const n = (this.n = recs.length);
    this.m = new Float32Array(n * 16);
    const anyColor = recs.some((r) => r.c);
    this.col = anyColor ? new Float32Array(n * 3) : null;
    this.rank = new Uint8Array(n);
    this.sc = new Float32Array(n);
    let ms = 0;
    for (let i = 0; i < n; i++) {
      const e = recs[i].m.elements;
      for (let j = 0; j < 16; j++) this.m[i * 16 + j] = e[j];
      const si = matrixScale(recs[i].m);
      this.sc[i] = si;
      ms = Math.max(ms, si);
      this.rank[i] = rankOf(e[12], e[14]);
      if (this.col) {
        const c = recs[i].c ?? WHITE;
        this.col[i * 3] = c.r;
        this.col[i * 3 + 1] = c.g;
        this.col[i * 3 + 2] = c.b;
      }
    }
    this.maxScale = ms || 1;
    for (let d = 0; d < draws.length; d++) this.tiers.push([null, null, null]);
    for (let d = 0; d < draws.length; d++) this.tierMesh(d, 0);
  }

  private tierMesh(d: number, t: number): THREE.InstancedMesh {
    let im = this.tiers[d][t];
    if (im) return im;
    const draw = this.draws[d];
    im = new THREE.InstancedMesh(draw.geos[t], draw.mat, this.n);
    im.name = `${this.name}#t${t}`;
    im.userData.lod = true;
    im.userData.layer = this.layer;
    // tier 0 casts; tier 1 (a 4x cheaper copy) also does, so shadows reach the corners of the 40 m shadow box; the dense border forest and the 4x copy never do
    im.castShadow = this.cast && (t === 0 || (t === 1 && this.layer !== 'border'));
    im.receiveShadow = this.receive;
    if (this.fadeable && t === 0) im.userData.fadeable = true;
    im.matrixAutoUpdate = false;
    im.count = 0;
    im.visible = false;
    im.boundingSphere = new THREE.Sphere();
    this.batcher.attach(im, this.bag);
    this.tiers[d][t] = im;
    return im;
  }

  /** Hides every tier (the group is beyond the layer's end distance). */
  private hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    for (const row of this.tiers) for (const im of row) if (im) im.visible = false;
    this.lastPlan = null;
  }

  update(fx: number, fz: number, plan: LodPlan, force: boolean): void {
    const dc = Math.hypot(this.cx - fx, this.cz - fz);
    const reach = plan.angular ? plan.angular.cap : plan.end;
    if (dc - this.chunkR > reach) {
      this.hide();
      return;
    }
    if (!force && !this.dirty && !this.hidden && plan === this.lastPlan && Math.hypot(fx - this.lastX, fz - this.lastZ) < 1.5) return;
    this.dirty = false;
    this.hidden = false;
    this.lastX = fx;
    this.lastZ = fz;
    this.lastPlan = plan;
    const n = this.n, m = this.m;
    if (tierScratch.length < n) tierScratch = new Int8Array(Math.max(n, tierScratch.length * 2));
    const tierOf = tierScratch;
    tierCount[0] = tierCount[1] = tierCount[2] = 0;
    const k1 = plan.keep1 * 256, k2 = plan.keep2 * 256;
    const d0s = plan.d0 * plan.d0, d1s = plan.d1 * plan.d1, es = plan.end * plan.end;
    const ang = plan.angular;
    for (let i = 0; i < n; i++) {
      const dx = m[i * 16 + 12] - fx, dz = m[i * 16 + 14] - fz;
      const dd = dx * dx + dz * dz;
      let t = -1;
      let a0 = d0s, a1 = d1s, ae = es;
      if (ang) {
        // the tier edges of this instance: the 1x edges times its scale, never past the fog cap
        const s = this.sc[i];
        const e = Math.min(ang.end * s, ang.cap), x0 = Math.min(ang.d0 * s, e), x1 = Math.min(Math.max(ang.d1 * s, x0), e);
        a0 = x0 * x0; a1 = x1 * x1; ae = e * e;
      }
      if (dd < a0) t = 0;
      else if (dd < a1) t = this.rank[i] < k1 ? 1 : -1;
      else if (dd < ae) t = this.rank[i] < k2 ? 2 : -1;
      tierOf[i] = t;
      if (t >= 0) tierCount[t]++;
    }
    for (let d = 0; d < this.draws.length; d++) {
      for (let t = 0; t < 3; t++) {
        const geo = this.draws[d].geos[t];
        const empty = tierCount[t] === 0 || (geo.index ? geo.index.count : 0) === 0;
        let im = this.tiers[d][t];
        if (empty) {
          if (im) {
            if ((im.userData.fadeLocks ?? 0) > 0) continue;
            im.visible = false;
            im.count = 0;
          }
          continue;
        }
        if (!im) im = this.tierMesh(d, t);
        if ((im.userData.fadeLocks ?? 0) > 0) continue; // a camera-occluder ghost holds an instance index of this mesh: keep it stable
        const dst = im.instanceMatrix.array as Float32Array;
        let dstCol: Float32Array | null = null;
        if (this.col) {
          if (!im.instanceColor) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 3), 3);
          dstCol = im.instanceColor.array as Float32Array;
        }
        let k = 0;
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < n; i++) {
          if (tierOf[i] !== t) continue;
          const s = i * 16, o = k * 16;
          for (let j = 0; j < 16; j++) dst[o + j] = m[s + j];
          if (dstCol) {
            dstCol[k * 3] = this.col![i * 3];
            dstCol[k * 3 + 1] = this.col![i * 3 + 1];
            dstCol[k * 3 + 2] = this.col![i * 3 + 2];
          }
          const px = m[s + 12], py = m[s + 13], pz = m[s + 14];
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
          if (pz < z0) z0 = pz;
          if (pz > z1) z1 = pz;
          k++;
        }
        im.count = k;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        const bs = geo.boundingSphere;
        const gr = bs ? bs.radius + bs.center.length() : 1;
        const sp = im.boundingSphere as THREE.Sphere;
        sp.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        sp.radius = 0.5 * Math.hypot(x1 - x0, y1 - y0, z1 - z0) + gr * this.maxScale;
        im.visible = true;
      }
    }
  }

  /** Instances per tier of the last update (dev readout). */
  get live(): number {
    let c = 0;
    for (const row of this.tiers) for (const im of row) if (im && im.visible) c += im.count;
    return c;
  }
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
  /** Every InstancedMesh that is resident now (all of them in a small zone, the loaded chunks in a streamed one). */
  meshes: THREE.InstancedMesh[] = [];
  /**
   * Streaming (docs/ENGINE_BIGMAPS.md): build() loads the pieces and stages the groups per chunk instead of emitting meshes;
   * loadChunk(cx, cz) emits the meshes of one chunk (its staged hand-placed groups plus generated instances) and unloadChunk
   * frees them. The batcher's chunk size is then the streaming chunk size.
   */
  deferred = false;
  /**
   * Rolling terrain (world/Relief.ts): when set, every instance's y is an OFFSET from the ground under it (`groundY(x, z) + y`), for the
   * hand-placed adds and the generated chunk scatter alike. Null = y is absolute (dungeons, towns, flat zones).
   */
  groundY: ((x: number, z: number) => number) | null = null;
  private staged = new Map<string, Group[]>();
  private chunkMeshes = new Map<string, Bag>();
  /** Distance-tiered groups (LodSet) of everything resident; the ChunkCuller updates them. */
  lodSets: LodSet[] = [];
  private warnedMissing = new Set<string>();
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
    const rec = m.clone();
    if (this.groundY) rec.elements[13] += this.groundY(e[12], e[14]);
    g.recs.push({ m: rec, c: color == null ? null : new THREE.Color(color) });
    this.count++;
  }

  urls(): string[] {
    return [...new Set([...this.groups.values()].map((g) => g.url))];
  }

  /** Load every referenced model and create the instanced meshes. Returns the list of missing urls. */
  async build(): Promise<string[]> {
    await loadPieces(this.urls());
    const missing = new Set<string>();
    if (this.deferred) {
      // streamed zone: keep the hand-placed groups per chunk, loadChunk() makes the meshes
      for (const g of this.groups.values()) {
        if (!getPiece(g.url)) missing.add(g.url);
        const list = this.staged.get(g.chunk);
        if (list) list.push(g);
        else this.staged.set(g.chunk, [g]);
      }
      this.groups.clear();
      return [...missing];
    }
    for (const g of this.groups.values()) {
      if (!this.emitGroup(g)) missing.add(g.url);
    }
    this.groups.clear();
    return [...missing];
  }

  /** Emits the meshes of one group (casters / plain split). Returns false when the model is not loaded. */
  private emitGroup(g: Group, into?: Bag): boolean {
    const piece = getPiece(g.url);
    if (!piece) return false;
    // Shadow casters are decided per instance (render/shadowPolicy), measured from the piece and the instance matrix. A
    // non-caster instance is split into its own no-shadow batch (every caster is drawn again in the shadow pass).
    const radius = 0.5 * piece.size.length();
    const canCast = g.cast && !piece.hasGlow;
    const casters: Rec[] = [], plain: Rec[] = [];
    let plainTall = false;
    for (const r of g.recs) {
      const s = matrixScale(r.m);
      // height of the top above the ground (the caster rule excludes ground-level meshes: on rolling terrain y includes the hill)
      const top = r.m.elements[13] - (this.groundY ? this.groundY(r.m.elements[12], r.m.elements[14]) : 0) + piece.box.max.y * s;
      if (canCast && isShadowCaster(radius * s, top)) casters.push(r);
      else {
        plain.push(r);
        if (isFadeableHeight(piece.size.y * s)) plainTall = true;
      }
    }
    if (casters.length) this.emit(g, piece, casters, true, false, into);
    // a solid (cast:true) group's non-caster batch still blocks the camera when an instance is tall enough: flag it for
    // OccluderFade without splitting it again (no extra draw calls); ground cover / wall decor are cast:false and stay out
    if (plain.length) this.emit(g, piece, plain, false, g.cast && plainTall, into);
    return true;
  }

  /**
   * Streaming: makes the meshes of chunk (cx, cz) from its staged hand-placed groups plus `generated` instances (scatter that is a
   * pure function of the chunk). No-op when the chunk is already resident. Returns the number of meshes made.
   */
  loadChunk(cx: number, cz: number, generated?: readonly StreamInstance[]): number {
    const ck = `${cx},${cz}`;
    if (this.chunkMeshes.has(ck)) return 0;
    const made: Bag = { meshes: [], sets: [] };
    this.chunkMeshes.set(ck, made);
    const groups: Group[] = [...(this.staged.get(ck) ?? [])];
    if (generated?.length) {
      const byKey = new Map<string, Group>();
      for (const gi of generated) {
        _p.set(gi.x, this.groundY ? gi.y + this.groundY(gi.x, gi.z) : gi.y, gi.z);
        _q.setFromAxisAngle(_Y, gi.rot);
        _s.set(gi.scale, gi.scale, gi.scale);
        _m.compose(_p, _q, _s);
        const layer: CullLayer = gi.layer ?? 'other';
        const key = `${gi.url}|${gi.cast ? 1 : 0}${gi.receive ? 1 : 0}|${layer}`;
        let g = byKey.get(key);
        if (!g) {
          g = { url: gi.url, chunk: ck, cx, cz, cast: gi.cast, receive: gi.receive, variant: '', skip: null, layer, recs: [] };
          byKey.set(key, g);
        }
        g.recs.push({ m: _m.clone(), c: gi.tint == null ? null : new THREE.Color().setScalar(gi.tint) });
      }
      groups.push(...byKey.values());
    }
    for (const g of groups) {
      if (!this.emitGroup(g, made) && !this.warnedMissing.has(g.url)) {
        this.warnedMissing.add(g.url);
        console.warn(`[world] streamed model not loaded: ${g.url}`);
      }
    }
    return made.meshes.length;
  }

  /** Streaming: frees the meshes of chunk (cx, cz) (geometry and materials are shared pieces and stay). */
  unloadChunk(cx: number, cz: number): void {
    const ck = `${cx},${cz}`;
    const made = this.chunkMeshes.get(ck);
    if (!made) return;
    this.chunkMeshes.delete(ck);
    if (made.sets.length) {
      const dead = new Set(made.sets);
      this.lodSets = this.lodSets.filter((s) => !dead.has(s));
    }
    if (!made.meshes.length) return;
    const gone = new Set(made.meshes);
    for (const im of made.meshes) {
      im.removeFromParent();
      im.dispose();
    }
    this.meshes = this.meshes.filter((m) => !gone.has(m));
  }

  /** Adds a tier mesh made by a LodSet to the scene, the resident list and (streamed) its chunk's bag. */
  attach(im: THREE.InstancedMesh, bag: Bag | null): void {
    this.parent.add(im);
    this.meshes.push(im);
    bag?.meshes.push(im);
  }

  /** Number of chunks with meshes now (streamed zones). */
  get residentChunks(): number {
    return this.chunkMeshes.size;
  }

  /** One InstancedMesh per draw of the piece for these instances. */
  private emit(g: Group, piece: Piece, recs: Rec[], cast: boolean, fadeable = false, into?: Bag): void {
    const n = recs.length;
    const anyColor = recs.some((r) => r.c);
    // scatter layers: the draws that are voxel meshes go to a distance-tiered LodSet (one set covers all of them)
    const all = drawsOf(piece, g.skip);
    const tiered: { geos: THREE.BufferGeometry[]; mat: THREE.Material }[] = [];
    const plainDraws: Draw[] = [];
    for (const draw of all) {
      const geos = lodEnabled && LOD_LAYERS.has(g.layer) ? voxelLodGeometries(draw.geometry) : null;
      if (geos) tiered.push({ geos, mat: this.resolveMaterial(draw.material, g.variant) });
      else plainDraws.push(draw);
    }
    if (tiered.length) {
      const set = new LodSet(
        this, into ?? null, tiered, recs, g.layer, (g.cx + 0.5) * this.chunkSize, (g.cz + 0.5) * this.chunkSize,
        this.chunkSize * 0.71, cast, g.receive, fadeable, g.url.split('/').pop() + '@' + g.chunk,
      );
      this.lodSets.push(set);
      into?.sets.push(set);
    }
    for (const draw of plainDraws) {
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
      if (fadeable) im.userData.fadeable = true;
      im.receiveShadow = g.receive;
      // the object transform is identity and never changes (every instance carries its own matrix), so skip the per-frame recompose
      im.matrixAutoUpdate = false;
      im.computeBoundingSphere();
      im.computeBoundingBox();
      this.parent.add(im);
      this.meshes.push(im);
      into?.meshes.push(im);
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
    this.lodSets = [];
    for (const m of this.ownMaterials) m.dispose();
    this.ownMaterials.length = 0;
    this.variantCache.clear();
    this.groups.clear();
    this.staged.clear();
    this.chunkMeshes.clear();
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
  /**
   * Distance tiers per layer for the voxel LOD groups (LodSet). Replace the object (do not mutate it) when the plans change: the sets
   * skip work while the plan object and the focus stay the same. A layer without a plan draws its tiered groups in full inside `limits`.
   */
  plans: Partial<Record<CullLayer, LodPlan>> = {};
  private acc = 1;
  private hidden = 0;
  private force = true;
  private readonly flat = new Map<CullLayer, LodPlan>();

  constructor(private batcher: InstanceBatcher, private chunkSize = 40) {}

  /** Re-evaluate on the next update() (a streamed chunk just appeared: its far layers must not show for a quarter second). */
  invalidate(): void {
    this.acc = 1;
    this.force = true;
  }

  update(dt: number, x: number, z: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const slack = this.chunkSize * 0.71; // half-diagonal of a chunk
    let hidden = 0;
    // distance-tiered groups (voxel LOD): a plan per layer, or one flat tier out to the layer's limit
    const force = this.force;
    this.force = false;
    for (const set of this.batcher.lodSets) {
      let plan = this.plans[set.layer];
      if (!plan) {
        const lim = this.limits[set.layer] ?? 1e9;
        plan = this.flat.get(set.layer);
        if (!plan || plan.end !== lim) {
          plan = { d0: lim, d1: lim, end: lim, keep1: 1, keep2: 1 };
          this.flat.set(set.layer, plan);
        }
      }
      set.update(x, z, plan, force);
    }
    for (const im of this.batcher.meshes) {
      if (im.userData.lod) continue; // tier meshes are driven by their LodSet
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
