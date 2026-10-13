import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isPSXPatched, patchPSX } from '../render/psx';
import { resolveModelUrl } from './voxelRemap';

export interface ModelAsset {
  /** The URL actually loaded: the voxel file when `voxel`, otherwise the requested source path. */
  url: string;
  /** The URL the caller asked for (the source path, unchanged). */
  srcUrl: string;
  /** True when this is a converted voxel model (see voxelRemap.ts). */
  voxel: boolean;
  gltf: GLTF;
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  skinned: boolean;
}

/** Static models whose largest side is below this (metres) cast no shadow: tufts, pebbles, flowers, small clutter. */
const SHADOW_MIN_EXTENT = 0.75;

/**
 * Node names that stay separate objects because they are toggled (accessories, enemy hide lists), animated or looked up
 * by name (lids, lamps, crystals, flames, doors, portal surfaces ...). Lower-case substring match on the node and its ancestors.
 */
const KEEP_NAME_RE = /door|gate|lid|hinge|leaf|flag|rope|chain|wheel|blade|eye|glow|tongue|teeth|flame|fire|light|lamp|crystal|ring|shard|portal|waypoint|slot|rune|obelisk|teleport|cloth|trident|spear|socket|fx|cape|shield|helm|hat|weapon|sword|axe|staff|wand|knife|bow|book|mug|throwable|tome|dagger/;
/** Exact node names registered by entity modules (see `Assets.keepNodeNames`). */
const keepNames = new Set<string>();
/** Shared material variants (Assets.sharedMaterial): source material -> variant key -> variant. Weak on the source. */
const variantsBySource = new WeakMap<THREE.Material, Map<string, THREE.Material>>();
/** Shared variant -> the material it was made from. */
const sourceOfVariant = new WeakMap<THREE.Material, THREE.Material>();

/**
 * Central asset cache. All loads are deduplicated by URL.
 *  - `load(url)` / `loadMany(urls)` fetch GLB/GLTF once.
 *  - `instantiate(url)` returns a fresh clone (SkeletonUtils.clone for skinned models, shared geometry/materials).
 *    Call `cloneMaterials(obj)` if you need to tint one instance; `sharedMaterial` gives one copy per tint instead.
 *  - `texture(url)` loads textures with PSX-friendly NearestFilter by default.
 * Missing files never throw from instantiate(): a magenta placeholder box is returned and a warning logged,
 * so one bad asset never breaks a scene.
 */
export class Assets {
  private gltfLoader = new GLTFLoader();
  private texLoader = new THREE.TextureLoader();
  private models = new Map<string, ModelAsset>();
  private pending = new Map<string, Promise<ModelAsset | null>>();
  private textures = new Map<string, THREE.Texture>();
  private failed = new Set<string>();
  /** Hook run on every loaded model scene once (PSX material patching is installed here by Game). */
  onModelLoaded: ((asset: ModelAsset) => void) | null = null;

  has(url: string): boolean {
    return this.models.has(resolveModelUrl(url));
  }

  get(url: string): ModelAsset | undefined {
    return this.models.get(resolveModelUrl(url));
  }

  /**
   * Node names that must never be merged away (toggled or looked up by name). Entity modules call this at import time
   * with their exact names: weapon/helm toggles, enemy hide lists, hp-driven node toggles.
   */
  static keepNodeNames(names: Iterable<string>): void {
    for (const n of names) if (n) keepNames.add(n);
  }

  load(url: string): Promise<ModelAsset | null> {
    return this.loadKey(url, resolveModelUrl(url));
  }

  /** Fetches `key` (the voxel file or the source itself). Cache, pending and failed sets are keyed by `key`. */
  private loadKey(srcUrl: string, key: string): Promise<ModelAsset | null> {
    const cached = this.models.get(key);
    if (cached) return Promise.resolve(cached);
    const p = this.pending.get(key);
    if (p) return p;
    const promise = new Promise<ModelAsset | null>((resolve) => {
      this.gltfLoader.load(
        key,
        (gltf) => {
          let skinned = false;
          gltf.scene.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
          });
          // shadow flags first (merge keys include them), then one draw per (parent|skeleton, material)
          try {
            applyCastFlags(gltf.scene, skinned);
            mergeSameMaterialMeshes(gltf, skinned);
          } catch (e) {
            console.warn(`[assets] mesh merge skipped for ${key}`, e);
          }
          const asset: ModelAsset = { url: key, srcUrl, voxel: key !== srcUrl, gltf, scene: gltf.scene, clips: gltf.animations, skinned };
          try {
            this.onModelLoaded?.(asset);
          } catch (e) {
            console.warn('[assets] onModelLoaded hook failed', e);
          }
          this.models.set(key, asset);
          this.pending.delete(key);
          resolve(asset);
        },
        undefined,
        (err) => {
          this.pending.delete(key);
          if (key !== srcUrl) {
            // A broken voxel file falls back to its source model (this URL only; other files are unaffected).
            console.warn(`[assets] voxel model failed, using ${srcUrl}`, err);
            resolve(
              this.loadKey(srcUrl, srcUrl).then((a) => {
                if (a) this.models.set(key, a);
                else this.failed.add(key);
                return a;
              }),
            );
            return;
          }
          console.warn(`[assets] failed to load ${key}`, err);
          this.failed.add(key);
          resolve(null);
        },
      );
    });
    this.pending.set(key, promise);
    return promise;
  }

  async loadMany(urls: string[], onProgress?: (loaded: number, total: number, url: string) => void): Promise<void> {
    const unique = [...new Set(urls)].filter(Boolean);
    let done = 0;
    await Promise.all(
      unique.map((u) =>
        (/\.(png|jpe?g|webp)$/i.test(u) ? this.loadTexture(u).then(() => null) : this.load(u)).then(() => {
          done++;
          onProgress?.(done, unique.length, u);
        }),
      ),
    );
  }

  /** Fresh instance of a loaded model. Load it first (or it returns a placeholder). */
  instantiate(url: string): THREE.Object3D {
    const key = resolveModelUrl(url);
    const asset = this.models.get(key);
    if (!asset) {
      if (!this.failed.has(key)) console.warn(`[assets] instantiate() before load: ${url}`);
      return placeholder();
    }
    const obj = asset.skinned ? SkeletonUtils.clone(asset.scene) : asset.scene.clone(true);
    obj.userData.assetUrl = url; // the requested url, unchanged
    if (asset.voxel) obj.userData.voxelUrl = asset.url;
    return obj;
  }

  /** Load (if needed) then instantiate. */
  async spawn(url: string): Promise<THREE.Object3D> {
    await this.load(url);
    return this.instantiate(url);
  }

  clips(url: string): THREE.AnimationClip[] {
    return this.models.get(resolveModelUrl(url))?.clips ?? [];
  }

  /** Give an instance its own material copies (for tinting/flash effects). */
  static cloneMaterials(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const cloneOne = (x: THREE.Material) => {
        const c = x.clone();
        if (isPSXPatched(x)) patchPSX(c); // Material.clone() drops onBeforeCompile
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(cloneOne) : cloneOne(m.material);
    });
  }

  /**
   * One material per (source, variantKey), shared by every instance that asks for it: a PSX-patched clone of `source`
   * tuned once by `make` (tint, static emissive, map swap). Use it instead of cloneMaterials when the change is the same for
   * all instances of the model. Never dispose these from an entity: other instances draw them, they live as long as the
   * source (the model asset). Anything that changes per instance (fades, animated glow) still needs its own copy.
   */
  static sharedMaterial<T extends THREE.Material>(source: T, variantKey: string, make: (m: T) => void): T {
    const src = Assets.sharedSource(source);
    let variants = variantsBySource.get(src);
    if (!variants) variantsBySource.set(src, (variants = new Map<string, THREE.Material>()));
    let v = variants.get(variantKey) as T | undefined;
    if (!v) {
      v = src.clone() as T;
      if (isPSXPatched(src)) patchPSX(v); // Material.clone() drops onBeforeCompile
      make(v);
      variants.set(variantKey, v);
      sourceOfVariant.set(v, src);
    }
    return v;
  }

  /** True for a material returned by sharedMaterial (its users must not dispose it). */
  static isSharedMaterial(m: THREE.Material): boolean {
    return sourceOfVariant.has(m);
  }

  /** The material a shared variant was made from; any other material is returned as it is. */
  static sharedSource<T extends THREE.Material>(m: T): T {
    return (sourceOfVariant.get(m) as T | undefined) ?? m;
  }

  texture(url: string, opts: { nearest?: boolean; repeat?: boolean; srgb?: boolean } = {}): THREE.Texture {
    const key = `${url}|${opts.nearest !== false}|${!!opts.repeat}|${opts.srgb !== false}`;
    let t = this.textures.get(key);
    if (t) return t;
    t = this.texLoader.load(url, undefined, undefined, () => console.warn(`[assets] texture failed ${url}`));
    if (opts.nearest !== false) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
    }
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, t);
    return t;
  }

  loadTexture(url: string, opts: { nearest?: boolean; repeat?: boolean; srgb?: boolean } = {}): Promise<THREE.Texture> {
    return new Promise((resolve) => {
      const t = this.texture(url, opts);
      if (t.image) resolve(t);
      else {
        const img = new Image();
        img.onload = img.onerror = () => resolve(t);
        img.src = url;
      }
    });
  }
}

function placeholder(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  m.position.y = 0.5;
  const g = new THREE.Group();
  g.add(m);
  g.userData.placeholder = true;
  return g;
}

/**
 * Shadow casters for a fresh GLB. Skinned rigs always cast (characters, enemies, NPCs); static models cast only when their
 * largest side reaches SHADOW_MIN_EXTENT, because every caster is re-drawn in the shadow pass. Receiving stays on everywhere.
 */
export function applyCastFlags(root: THREE.Object3D, skinned: boolean): void {
  let cast = skinned;
  if (!cast) {
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    cast = Math.max(size.x, size.y, size.z) >= SHADOW_MIN_EXTENT;
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = cast;
    m.receiveShadow = true;
  });
}

/** Geometry signature for mergeGeometries: attribute names, item sizes, normalisation, array types and index presence. */
function attributeSignature(g: THREE.BufferGeometry): string | null {
  if (!g.attributes.position || Object.keys(g.morphAttributes).length > 0) return null;
  const parts: string[] = [];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name] as unknown as { itemSize: number; normalized: boolean; array: object; isInterleavedBufferAttribute?: boolean };
    if (a.isInterleavedBufferAttribute) return null;
    parts.push(`${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`);
  }
  return parts.join('|') + (g.index ? '#idx' : '#flat');
}

/** True if the node or one of its ancestors below the model root carries a keep name. */
function isKept(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    if (keepNames.has(p.name)) return true;
    if (p.name && KEEP_NAME_RE.test(p.name.toLowerCase())) return true;
  }
  return false;
}

/** Nodes targeted by animation tracks ("NodeName.position" -> "NodeName"). Their objects must keep existing. */
function animatedNodeNames(clips: THREE.AnimationClip[]): Set<string> {
  const names = new Set<string>();
  for (const clip of clips) {
    for (const t of clip.tracks) {
      const i = t.name.lastIndexOf('.');
      if (i > 0) names.add(t.name.slice(0, i));
    }
  }
  return names;
}

/**
 * Cuts the draw calls of a freshly loaded GLB (runs once per URL, before the PSX hook so materials are final):
 *  - skinned rigs: SkinnedMeshes that share one Skeleton, one material, one bind matrix and one transform become a single
 *    SkinnedMesh. Static parts of a rig are the toggleable accessories (weapons, shields, helms, capes): never merged.
 *  - static models: visible leaf meshes with the same parent and material become one mesh (geometry baked to the parent frame).
 * Left alone: multi-material, transparent, morph-target, interleaved or animated-target meshes, meshes with children, and
 * anything carrying a keep name (see KEEP_NAME_RE / Assets.keepNodeNames). Shared materials and textures are kept as they are.
 * Returns the number of meshes removed.
 */
export function mergeSameMaterialMeshes(gltf: GLTF, skinned: boolean): number {
  const root = gltf.scene;
  const animNames = animatedNodeNames(gltf.animations);
  const groups = new Map<string, THREE.Mesh[]>();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (!m.visible || m.children.length > 0 || !m.geometry) return;
    if (Array.isArray(m.material) || !m.material || m.material.transparent) return;
    if (m.morphTargetInfluences?.length) return;
    const sm = m as unknown as THREE.SkinnedMesh;
    const isSkin = sm.isSkinnedMesh === true;
    if (skinned !== isSkin) return; // rig: only skinned parts; static models have no skinned parts
    if (isSkin && !sm.skeleton) return;
    const sig = attributeSignature(m.geometry);
    if (!sig) return;
    // GLTFLoader targets unnamed nodes by uuid, so both spellings count
    if (animNames.has(m.name) || animNames.has(m.uuid) || isKept(m, root)) return;
    m.updateMatrix();
    const flags = `${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.layers.mask}|${m.frustumCulled ? 1 : 0}`;
    const key = isSkin
      ? `S|${sm.skeleton.uuid}|${m.material.uuid}|${sig}|${sm.bindMatrix.elements.join(',')}|${m.matrix.elements.join(',')}|${flags}`
      : `N|${m.parent?.uuid ?? ''}|${m.material.uuid}|${sig}|${flags}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(m);
  });

  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    const parent = first.parent;
    if (!parent) continue;
    const firstSkin = first as unknown as THREE.SkinnedMesh;
    const isSkin = firstSkin.isSkinnedMesh === true;
    const geoms = list.map((m) => {
      if (isSkin) return m.geometry; // skinned vertices live in bind space: the object matrix is shared by the group
      const g = m.geometry.clone(); // never bake into a geometry another mesh may reference
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(geoms, false);
    if (!merged) continue;
    let out: THREE.Mesh;
    if (isSkin) {
      const s = new THREE.SkinnedMesh(merged, first.material as THREE.Material);
      s.bind(firstSkin.skeleton, firstSkin.bindMatrix);
      first.matrix.decompose(s.position, s.quaternion, s.scale);
      out = s;
    } else {
      out = new THREE.Mesh(merged, first.material as THREE.Material);
    }
    out.name = first.name;
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    out.frustumCulled = first.frustumCulled;
    out.layers.mask = first.layers.mask;
    out.userData = { ...first.userData };
    parent.add(out);
    for (const m of list) m.removeFromParent();
    removed += list.length - 1;
  }
  return removed;
}
