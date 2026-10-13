import * as THREE from 'three';
import { G } from '../game/G';
import { patchPSX } from '../render/psx';

/**
 * Piece library: loads GLB pieces through G.assets and "bakes" them into plain (geometry, material) parts in the
 * model's root frame so they can be rendered with InstancedMesh. KayKit packs ship one embedded atlas copy per file;
 * here every piece of a pack shares ONE material (first loaded copy) so instanced meshes share the texture.
 * OWNER: world module.
 */

export interface PiecePart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface Piece {
  url: string;
  parts: PiecePart[];
  box: THREE.Box3;
  size: THREE.Vector3;
  /** Emissive/alpha-masked/animated content: true if any material is emissive or alpha-tested. */
  hasGlow: boolean;
}

const cache = new Map<string, Piece | null>();
const inflight = new Map<string, Promise<Piece | null>>();
const warned = new Set<string>();

/** 'voxel' is the bypass tag of a remapped voxel model (asset.voxel): never returned by packOf, never re-skinned. */
type PackId = 'dungeon' | 'halloween' | 'furniture' | 'hex' | 'voxel';
const PACK_PREFIX: [string, PackId][] = [
  ['/assets/models/dungeon/', 'dungeon'],
  ['/assets/models/halloween/', 'halloween'],
  ['/assets/models/furniture/', 'furniture'],
  ['/assets/models/town/', 'hex'],
];

export function packOf(url: string): PackId | null {
  for (const [p, id] of PACK_PREFIX) if (url.startsWith(p)) return id;
  return null;
}

/** Structural pieces (big flat quads): affine texture warp off. */
const STRUCT_RE = /\/(floor_|wall_|pillar|stairs|barrier|column|rubble|fence|path_|crypt|hex_|building_)/;

const FOLIAGE_RE = /\/(grass_tuft|flowers)\.glb$/;

/** itch.io PSX kit blocks / roofs / dungeon modules: big flat faces, affine warping off (own texture, so own material copy). */
const ITCH_STRUCT_RE = /\/itch\/(psx-medieval\/(building|roofs)|psx-dungeon)\//;
const itchStruct = new Map<THREE.Material, THREE.Material>();
function itchStructMaterial(base: THREE.Material): THREE.Material {
  let m = itchStruct.get(base);
  if (!m) {
    m = base.clone();
    patchPSX(m, { affine: false });
    itchStruct.set(base, m);
  }
  return m;
}

/** Foliage cards are lit as if their normal pointed straight up (no black back faces). */
const foliageMats = new Map<THREE.Material, THREE.Material>();
function foliageMaterial(base: THREE.Material): THREE.Material {
  let m = foliageMats.get(base);
  if (!m) {
    m = base.clone();
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n\tnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
      );
    };
    m.customProgramCacheKey = () => 'foliage-up';
    patchPSX(m, { affine: false });
    foliageMats.set(base, m);
  }
  return m;
}

const packBase = new Map<PackId, THREE.Material>();
const packVariants = new Map<string, THREE.Material>();

function packMaterial(pack: PackId, struct: boolean, base: THREE.Material): THREE.Material {
  // Voxel palette materials are their own (one 24-colour image per file): a shared pack atlas would recolour them.
  if (pack === 'voxel') return base;
  if (!packBase.has(pack)) packBase.set(pack, base);
  const key = `${pack}|${struct ? 's' : 'p'}`;
  let m = packVariants.get(key);
  if (!m) {
    m = packBase.get(pack)!.clone();
    m.name = `pack_${pack}_${struct ? 'struct' : 'prop'}`;
    patchPSX(m, { affine: !struct });
    packVariants.set(key, m);
  }
  return m;
}

async function loadOne(url: string): Promise<Piece | null> {
  const asset = await G.assets.load(url);
  if (!asset) {
    if (!warned.has(url)) {
      warned.add(url);
      console.warn(`[world] missing piece ${url}`);
    }
    return null;
  }
  const root = asset.scene;
  root.updateMatrixWorld(true);
  // A voxel model (remapped by the requested url) keeps its own material: no pack atlas, no foliage / itch re-skin.
  const voxel = asset.voxel;
  const pack: PackId | null = voxel ? 'voxel' : packOf(url);
  const struct = STRUCT_RE.test(url);
  const parts: PiecePart[] = [];
  let hasGlow = false;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    let mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const sm = mat as THREE.MeshStandardMaterial;
    if (sm.emissiveMap || sm.alphaTest > 0 || sm.transparent) hasGlow = true;
    if (pack && sm.map && !sm.emissiveMap && !(sm.alphaTest > 0)) mat = packMaterial(pack, struct, mat);
    if (!voxel) {
      if (FOLIAGE_RE.test(url)) mat = foliageMaterial(mat);
      else if (ITCH_STRUCT_RE.test(url)) mat = itchStructMaterial(mat);
    }
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    parts.push({ name: m.name, geometry: g, material: mat });
  });
  const box = new THREE.Box3().setFromObject(root);
  return { url, parts, box, size: box.getSize(new THREE.Vector3()), hasGlow };
}

export function loadPiece(url: string): Promise<Piece | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  let p = inflight.get(url);
  if (!p) {
    p = loadOne(url).then((pc) => {
      cache.set(url, pc);
      inflight.delete(url);
      return pc;
    });
    inflight.set(url, p);
  }
  return p;
}

export async function loadPieces(urls: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(urls)].map((u) => loadPiece(u)));
}

export function getPiece(url: string): Piece | null {
  return cache.get(url) ?? null;
}

/** AABB size of a loaded model at scale 1 (falls back to 1x1x1). */
export function pieceSize(url: string): THREE.Vector3 {
  return getPiece(url)?.size ?? new THREE.Vector3(1, 1, 1);
}
