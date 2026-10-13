import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../game/G';
import { isPSXPatched, patchPSX } from '../render/psx';
import { applyShadowPolicy } from '../render/shadowPolicy';

/**
 * Decor: animated/lit props. Gen props (Blender-made, /assets/models/gen/props/) expose named child nodes
 * (flame, light_0, rune_ring, portal_surface, cloth ...). spawnAnimatedProp() clones the model, finds those nodes,
 * and returns an updater + the lights/emitters the caller should register. OWNER: world module.
 */

export const GEN_PROPS = '/assets/models/gen/props/';

export interface PropLightSpec {
  color: number;
  /** Design intensity (0.5..3). */
  intensity: number;
  distance: number;
  flicker: number;
  /** Local height of the light above the prop origin (when the model has no light_0 node). */
  y: number;
  /** Optional glow-sprite halo size (metres) + flame sprite size. */
  halo?: number;
  flame?: number;
}

/** Light presets keyed by model basename (no extension). */
export const PROP_LIGHTS: Record<string, PropLightSpec> = {
  brazier: { color: 0xff9a40, intensity: 2.2, distance: 11, flicker: 0.3, y: 1.5, halo: 4.2, flame: 1.1 },
  campfire: { color: 0xff7a2a, intensity: 2.6, distance: 12, flicker: 0.35, y: 0.9, halo: 5, flame: 1.4 },
  forge: { color: 0xff6a20, intensity: 2.4, distance: 11, flicker: 0.3, y: 1.4, halo: 4.5, flame: 1.2 },
  cauldron: { color: 0x70ff90, intensity: 1.3, distance: 7, flicker: 0.2, y: 1.2, halo: 3 },
  alchemy_table: { color: 0xffb060, intensity: 1.0, distance: 6, flicker: 0.2, y: 1.4, halo: 2.4 },
  altar: { color: 0xff3a30, intensity: 1.7, distance: 8, flicker: 0.25, y: 1.8, halo: 3.4 },
  crystal_blue: { color: 0x60a8ff, intensity: 1.6, distance: 8, flicker: 0.08, y: 1.0, halo: 3.2 },
  crystal_purple: { color: 0xb060ff, intensity: 1.7, distance: 9, flicker: 0.08, y: 1.2, halo: 3.6 },
  lamp_post: { color: 0xffc070, intensity: 1.7, distance: 11, flicker: 0.1, y: 3.1, halo: 3.2 },
  font_of_power: { color: 0xb070ff, intensity: 2.2, distance: 11, flicker: 0.15, y: 2.2, halo: 4.4 },
  lobby_obelisk: { color: 0x70a0ff, intensity: 1.9, distance: 11, flicker: 0.1, y: 3.5, halo: 4.4 },
  mplus_portal: { color: 0xa060ff, intensity: 3.2, distance: 15, flicker: 0.15, y: 3.4, halo: 7 },
  waypoint_stone: { color: 0x70e0ff, intensity: 1.7, distance: 9, flicker: 0.1, y: 2.4, halo: 4 },
  candle: { color: 0xffb070, intensity: 0.8, distance: 4, flicker: 0.35, y: 0.6, halo: 1.2 },
  skull_candle: { color: 0xffb070, intensity: 0.9, distance: 5, flicker: 0.35, y: 1.0, halo: 1.6 },
  torch_mounted: { color: 0xff8a3c, intensity: 2.0, distance: 11, flicker: 0.32, y: 0.7, halo: 3.6, flame: 0.9 },
  torch_lit: { color: 0xff8a3c, intensity: 1.8, distance: 10, flicker: 0.32, y: 0.8, halo: 3.4, flame: 0.9 },
  candle_lit: { color: 0xffb070, intensity: 0.8, distance: 4.5, flicker: 0.35, y: 1.05, halo: 1.3, flame: 0.35 },
  candle_thin_lit: { color: 0xffb070, intensity: 0.7, distance: 4.5, flicker: 0.35, y: 1.05, halo: 1.2, flame: 0.3 },
  'fire-basket': { color: 0xff9a40, intensity: 2.0, distance: 10, flicker: 0.3, y: 0.75, halo: 3.6, flame: 0.95 },
  'campfire-pit': { color: 0xff7a2a, intensity: 2.4, distance: 11, flicker: 0.35, y: 0.7, halo: 4.2, flame: 1.2 },
  lantern_standing: { color: 0xffc070, intensity: 1.2, distance: 8, flicker: 0.15, y: 0.5, halo: 2.4 },
  lantern_hanging: { color: 0xffc070, intensity: 1.2, distance: 8, flicker: 0.15, y: -0.8, halo: 2.4 },
  post_lantern: { color: 0xffc070, intensity: 1.5, distance: 10, flicker: 0.1, y: 3.0, halo: 3 },
  lamp_standing: { color: 0xffe0b0, intensity: 1.2, distance: 8, flicker: 0.05, y: 2.0, halo: 2.4 },
  shrine_candles: { color: 0xffb070, intensity: 1.1, distance: 6, flicker: 0.3, y: 1.2, halo: 2.2 },
  pumpkin_orange_jackolantern: { color: 0xff9a40, intensity: 1.0, distance: 6, flicker: 0.3, y: 0.6, halo: 2 },
  pumpkin_yellow_jackolantern: { color: 0xffc040, intensity: 1.0, distance: 6, flicker: 0.3, y: 0.6, halo: 2 },
};

export const baseName = (url: string): string => (url.split('/').pop() ?? url).replace(/\.(glb|gltf)$/i, '');

/** Light preset for a url (basename lookup) or null. */
export function propLightFor(url: string): PropLightSpec | null {
  return PROP_LIGHTS[baseName(url)] ?? null;
}

const ANIMATED = new Set([
  'brazier', 'campfire', 'forge', 'cauldron', 'alchemy_table', 'altar', 'font_of_power', 'lobby_obelisk', 'mplus_portal', 'waypoint_stone',
  'banner_blue', 'banner_green', 'banner_red', 'market_stall', 'well', 'wagon', 'iron_cage', 'chest_epic', 'chest_gold', 'chest_iron', 'chest_wood', 'lamp_post', 'crystal_blue', 'crystal_purple',
]);

/** True for gen props with animated sub-nodes (must be cloned, not instanced). */
export function isAnimatedModel(url: string): boolean {
  return url.startsWith(GEN_PROPS) && ANIMATED.has(baseName(url));
}

export interface SpawnedProp {
  object: THREE.Object3D;
  update(dt: number, t: number): void;
  /** World position of the model's light_0 node (or null). */
  lightPos: THREE.Vector3 | null;
  /** World positions of fire_fx nodes (particle emitters). */
  fxPos: THREE.Vector3[];
  /** World positions of flame cards (to put glow flames on). */
  flamePos: THREE.Vector3[];
}

let spinStamp = -1;
const spun = new Set<THREE.Texture>();
function spinTexture(tex: THREE.Texture | null | undefined, dt: number, speed: number, stamp: number): void {
  if (!tex || (spinStamp === stamp && spun.has(tex))) return;
  if (spinStamp !== stamp) { spinStamp = stamp; spun.clear(); }
  spun.add(tex);
  tex.center.set(0.5, 0.5);
  tex.rotation += dt * speed;
}

/**
 * Nodes that stay separate objects: they are animated by setupAnimatedProp, or looked up by name by the entity modules (lids,
 * obelisk slots, rune rings, portal surfaces ...). Lower-case substring match on the node and its ancestors below the prop root.
 */
const SEPARATE_NODE_RE = /lid|slot|door|gate|flag|rope|chain|hinge|lamp|light|glow|flame|fire|fx|crystal|ring|shard|portal|waypoint|obelisk|teleport|rune|cloth|bucket|liquid/;

/** Vertex-layout signature (attribute names, sizes, array types, index presence); null when the geometry cannot merge. */
function layoutSignature(g: THREE.BufferGeometry): string | null {
  if (!g.attributes.position || Object.keys(g.morphAttributes).length > 0) return null;
  const parts: string[] = [];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name] as unknown as { itemSize: number; normalized: boolean; array: object; isInterleavedBufferAttribute?: boolean };
    if (a.isInterleavedBufferAttribute) return null;
    parts.push(`${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`);
  }
  return parts.join('|') + (g.index ? '#i' : '#n');
}

/** Merged buffers of static parts, keyed by model geometry + placement, so every clone of one prop shares one buffer. */
const mergedStatic = new Map<string, THREE.BufferGeometry>();

/** Transform of `o` expressed in the frame of `root` (its local chain, root excluded). */
function relativeTo(o: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const out = new THREE.Matrix4();
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) {
    p.updateMatrix();
    out.premultiply(p.matrix);
  }
  return out;
}

/**
 * Merges the static parts of an animated prop: visible leaf meshes with one opaque material and one vertex layout become one
 * mesh per (material, layout), baked into the prop frame. Separate nodes (SEPARATE_NODE_RE) and everything below them stay
 * untouched, so the animation, the name lookups and the material-name tweaks (tameLampGlass / tameObelisk) keep working.
 */
function mergeStaticParts(obj: THREE.Object3D): void {
  const groups = new Map<string, { m: THREE.Mesh; rel: THREE.Matrix4 }[]>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (!m.visible || m.children.length > 0 || !m.geometry || !m.material || Array.isArray(m.material)) return;
    if (m.material.transparent || m.morphTargetInfluences?.length || Object.keys(m.userData).length > 0) return;
    for (let p: THREE.Object3D | null = m; p && p !== obj; p = p.parent) {
      if (p.name && SEPARATE_NODE_RE.test(p.name.toLowerCase())) return;
    }
    const sig = layoutSignature(m.geometry);
    if (!sig) return;
    const key = `${m.material.uuid}|${m.renderOrder}|${sig}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push({ m, rel: relativeTo(m, obj) });
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const material = list[0].m.material as THREE.Material;
    const cacheKey = `${material.uuid}|${list.map((e) => `${e.m.geometry.uuid}:${e.rel.elements.join(',')}`).join(';')}`;
    let geo = mergedStatic.get(cacheKey);
    if (!geo) {
      const merged = mergeGeometries(list.map((e) => e.m.geometry.clone().applyMatrix4(e.rel)), false);
      if (!merged) continue;
      geo = merged;
      mergedStatic.set(cacheKey, geo);
    }
    const out = new THREE.Mesh(geo, material);
    out.name = 'static';
    out.renderOrder = list[0].m.renderOrder;
    obj.add(out);
    for (const e of list) e.m.removeFromParent();
  }
}

/** Shadow rule of an animated prop: each mesh follows the shared caster policy (render/shadowPolicy); receiving stays on. */
function applyPropShadows(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.receiveShadow = true;
  });
  applyShadowPolicy(obj);
}

/** Clone a gen prop and wire its named nodes (flames flicker, rings spin, crystals float, cloth sways...). */
export function setupAnimatedProp(obj: THREE.Object3D): AnimatedPropHandle {
  mergeStaticParts(obj);
  applyPropShadows(obj);
  const ups: ((dt: number, t: number) => void)[] = [];
  const ph = Math.random() * 10;
  const fxNodes: THREE.Object3D[] = [];
  let lightNode: THREE.Object3D | null = null;
  const flames: THREE.Object3D[] = [];
  obj.traverse((o) => {
    const n = o.name;
    if (n === 'light_0') lightNode = o;
    else if (n === 'fire_fx') fxNodes.push(o);
    else if (n === 'flame') {
      flames.push(o);
      const bs = o.scale.clone();
      const p = Math.random() * 6.28;
      ups.push((_dt, t) => {
        const k = 1 + 0.09 * Math.sin(t * 13 + p) + 0.06 * Math.sin(t * 29 + p * 2);
        o.scale.set(bs.x * (1 + 0.05 * Math.sin(t * 9 + p)), bs.y * k, bs.z * (1 + 0.05 * Math.cos(t * 11 + p)));
        o.rotation.y = Math.sin(t * 3 + p) * 0.12;
      });
    } else if (n === 'rune_ring' || n === 'teleport_ring') {
      const sp = n === 'rune_ring' ? 0.7 : 0.5;
      ups.push((dt) => { o.rotation.y += dt * sp; });
    } else if (n === 'shards' || n === 'obelisk_crystal' || n === 'waypoint_crystal') {
      const by = o.position.y, p = Math.random() * 6.28;
      ups.push((dt, t) => {
        o.rotation.y += dt * 0.9;
        o.position.y = by + Math.sin(t * 1.4 + p) * 0.08;
      });
    } else if (n === 'cloth' || n === 'roof_cloth') {
      const p = Math.random() * 6.28;
      const rx = o.rotation.x, rz = o.rotation.z;
      ups.push((_dt, t) => {
        o.rotation.z = rz + Math.sin(t * 1.6 + p) * 0.05;
        o.rotation.x = rx + Math.sin(t * 1.1 + p * 1.7) * 0.03;
      });
    } else if (n === 'bucket') {
      const by = o.position.y, p = Math.random() * 6.28;
      ups.push((_dt, t) => { o.position.y = by + Math.sin(t * 0.9 + p) * 0.06; });
    } else if (n === 'portal_surface') {
      const mesh = o as THREE.Mesh;
      const m = mesh.material as THREE.MeshStandardMaterial;
      ups.push((dt, t) => {
        const stamp = Math.floor(t * 1000);
        spinTexture(m.map, dt, -1.1, stamp);
        spinTexture(m.emissiveMap, dt, -1.1, stamp);
        m.emissiveIntensity = 1 + Math.sin(t * 2.2 + ph) * 0.15;
      });
    } else if (n === 'liquid') {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      ups.push((dt, t) => {
        if (m.map) { m.map.offset.y = (t * 0.06) % 1; m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }
        if (m.emissiveMap) { m.emissiveMap.offset.y = (t * 0.06) % 1; m.emissiveMap.wrapS = m.emissiveMap.wrapT = THREE.RepeatWrapping; }
      });
    }
  });
  const out: AnimatedPropHandle = {
    object: obj,
    update: (dt, t) => { for (const u of ups) u(dt, t); },
    lightPos: null,
    fxPos: [],
    flamePos: [],
    /** World anchors and the shadow rule are valid only after the caller placed (and scaled) the object. */
    refreshAnchors() {
      obj.updateMatrixWorld(true);
      applyPropShadows(obj);
      out.lightPos = lightNode ? (lightNode as THREE.Object3D).getWorldPosition(new THREE.Vector3()) : null;
      out.fxPos = fxNodes.map((f) => f.getWorldPosition(new THREE.Vector3()));
      out.flamePos = flames.map((f) => f.getWorldPosition(new THREE.Vector3()));
    },
  };
  return out;
}

export type AnimatedPropHandle = SpawnedProp & { refreshAnchors(): void };

/** Instantiate + set up (model must be loaded). Place the returned object, then call refreshAnchors(). */
export async function spawnAnimatedProp(url: string): Promise<AnimatedPropHandle> {
  await G.assets.load(url);
  const obj = G.assets.instantiate(url);
  return setupAnimatedProp(obj);
}

const _d = new THREE.Vector3();
/**
 * The point lights/shadows/particles should follow: the local player if there is one, else the ground point the
 * active camera looks at (dev pages / menu).
 */
export function worldFocus(out: THREE.Vector3): THREE.Vector3 {
  const p = G.world?.localPlayer?.position;
  if (p) return out.copy(p);
  const cam = G.engine?.activeCamera;
  if (cam) {
    cam.getWorldDirection(_d);
    const t = _d.y < -0.05 ? -cam.position.y / _d.y : 12;
    const k = Math.min(t, 40);
    out.set(cam.position.x + _d.x * k, 0, cam.position.z + _d.z * k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Individually spawned static props (tint / emissive / opacity / frozen pose / accessory visibility)
// ---------------------------------------------------------------------------

export interface StaticObjOpts {
  /** Multiply colour over every material. */
  tint?: number;
  /** Emissive colour override (glow) + intensity (default 1). */
  emissive?: number;
  emissiveIntensity?: number;
  /** 0..1 (ghostly / frozen decor). */
  opacity?: number;
  /** Skinned models: clip to freeze on frame 0. */
  pose?: string;
  /** Character models: accessory node names that stay visible (all other toggleable accessories are hidden). */
  show?: string[];
  /** The object is handled by a system that may write its materials (interactables): give it its own material copies. */
  ownMaterials?: boolean;
}

/**
 * Shared override materials of static props, keyed by source material and override values. Props with the same tint / glow /
 * opacity used to clone their own materials (~1k unique materials in the open world). Nothing writes to these per object: a
 * fade clones before it changes anything (camera/OccluderFade), and object-owned materials are kept for handled props.
 */
const propMaterials = new Map<string, THREE.Material>();

/** A copy of `src` with the tint / glow / opacity override applied (PSX patch kept). */
function overriddenCopy(src: THREE.Material, o: StaticObjOpts): THREE.Material {
  const m = src.clone();
  if (isPSXPatched(src)) patchPSX(m); // Material.clone() drops onBeforeCompile
  const sm = m as THREE.MeshStandardMaterial;
  if (o.tint !== undefined && sm.color) sm.color.multiply(new THREE.Color(o.tint));
  if (o.emissive !== undefined && sm.emissive) {
    sm.emissive.copy(new THREE.Color(o.emissive));
    sm.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (o.opacity !== undefined && o.opacity < 1) {
    sm.transparent = true;
    sm.opacity = Math.max(0, o.opacity);
    sm.depthWrite = o.opacity > 0.9;
  }
  sm.needsUpdate = true;
  return m;
}

/** The shared override material for a source material (one per distinct key). */
function propMaterialFor(src: THREE.Material, o: StaticObjOpts): THREE.Material {
  const key = `${src.uuid}|${o.tint ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.opacity ?? ''}`;
  let m = propMaterials.get(key);
  if (!m) {
    m = overriddenCopy(src, o);
    propMaterials.set(key, m);
  }
  return m;
}

/** Accessories that the KayKit adventurers show by default NOT (characters.md loadout table: the "h" entries). */
const HIDE_BY_DEFAULT = new Set([
  '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand',
  '1H_Axe', 'Mug', '1H_Axe_Offhand', 'Barbarian_Round_Shield',
  '1H_Wand', 'Spellbook', 'Spellbook_open',
  '1H_Crossbow', '2H_Crossbow', 'Throwable',
]);

const isBone = (o: THREE.Object3D | null): boolean => !!o && (o as THREE.Bone).isBone === true;

/** Hide/show the rigid accessory nodes (direct non-bone children of a bone) of a KayKit character instance. */
export function applyAccessories(obj: THREE.Object3D, keep?: string[]): void {
  obj.traverse((o) => {
    if (isBone(o) || !isBone(o.parent)) return;
    if (keep) o.visible = keep.includes(o.name);
    else if (HIDE_BY_DEFAULT.has(o.name)) o.visible = false;
  });
}

const clipByName = (clips: THREE.AnimationClip[], n: string): THREE.AnimationClip | undefined => clips.find((c) => c.name === n || c.name.endsWith('|' + n));

const _pv = new THREE.Vector3();

/**
 * World-space footprint of an already positioned, posed (frozen-clip) character instance, measured on the SKINNED vertices
 * (not the T-pose bind box, which for a Demon Lord is 5.4 m wide). Only vertices below `lowFrac` of the posed height count and the
 * outer `trim` share of vertices on each side is ignored, so a raised weapon tip, a tail or a wing tip does not turn a statue into
 * a wall. `height` is the full posed height. Returns null when the object has no mesh vertices.
 */
export function posedFootprint(obj: THREE.Object3D, lowFrac = 0.6, trim = 0.05): { x0: number; x1: number; z0: number; z1: number; height: number } | null {
  obj.updateMatrixWorld(true);
  const pts: number[] = [];
  let minY = Infinity, maxY = -Infinity;
  obj.traverseVisible((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry?.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, _pv);
      _pv.applyMatrix4(m.matrixWorld);
      if (!Number.isFinite(_pv.x + _pv.y + _pv.z)) continue;
      pts.push(_pv.x, _pv.y, _pv.z);
      if (_pv.y < minY) minY = _pv.y;
      if (_pv.y > maxY) maxY = _pv.y;
    }
  });
  if (!pts.length) return null;
  const limit = minY + (maxY - minY) * lowFrac;
  const xs: number[] = [], zs: number[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 1] > limit) continue;
    xs.push(pts[i]);
    zs.push(pts[i + 2]);
  }
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const lo = Math.floor(xs.length * trim), hi = Math.max(lo, Math.ceil(xs.length * (1 - trim)) - 1);
  return { x0: xs[lo], x1: xs[hi], z0: zs[lo], z1: zs[hi], height: maxY - minY };
}

/**
 * Clone a model for use as static decor. Returns null when it cannot be loaded. The caller positions it and adds it to the
 * scene. A tint / emissive / opacity override swaps in shared override materials (see propMaterialFor), or per-object copies
 * when `ownMaterials` is set.
 */
export async function spawnStaticObject(url: string, o: StaticObjOpts = {}): Promise<THREE.Object3D | null> {
  const asset = await G.assets.load(url);
  if (!asset) return null;
  const obj = G.assets.instantiate(url);
  const needsMat = o.tint !== undefined || o.emissive !== undefined || o.opacity !== undefined;
  if (needsMat) {
    obj.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      const swap = (mat: THREE.Material): THREE.Material => (o.ownMaterials ? overriddenCopy(mat, o) : propMaterialFor(mat, o));
      if (Array.isArray(m.material)) m.material = m.material.map(swap);
      else m.material = swap(m.material);
    });
  }
  if (asset.skinned) {
    applyAccessories(obj, o.show);
    obj.traverse((n) => {
      const m = n as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) m.frustumCulled = false;
    });
    if (o.pose) {
      const clip = clipByName(asset.clips, o.pose);
      if (clip) {
        const mixer = new THREE.AnimationMixer(obj);
        const act = mixer.clipAction(clip);
        act.play();
        act.time = 0;
        mixer.update(0);
        obj.updateMatrixWorld(true);
      } else {
        console.warn(`[world] pose '${o.pose}' not found in ${url}`);
      }
    }
  } else if (o.show) {
    applyAccessories(obj, o.show);
  }
  return obj;
}
