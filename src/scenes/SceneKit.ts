import * as THREE from 'three';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { psxify } from '../game/graphics';
import { applyPSXTexture, patchPSX } from '../render/psx';
import { RNG } from '../core/utils';

/**
 * Shared building blocks for the scenes module (menu camp, town fallback, dungeon fallback):
 * prop placement from the generated PSX prop set, procedural textures, sky dome, stars, moon,
 * ember/firefly particles, flicker lights, simple disposal.
 * OWNER: scenes module.
 */

export const PROP_DIR = '/assets/models/gen/props/';
export const propUrl = (name: string): string => `${PROP_DIR}${name}.glb`;

export interface PlaceOpts {
  pos?: [number, number, number];
  /** Radians around Y. */
  rot?: number;
  scale?: number | [number, number, number];
  /** Give the instance its own materials (needed to tint / pulse emissive per instance). */
  ownMaterials?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Instantiate an already-loaded model and add it to `parent`. Never throws (placeholder box on failure). */
export function placeModel(parent: THREE.Object3D, url: string, o: PlaceOpts = {}): THREE.Object3D {
  const obj = G.assets.instantiate(url);
  if (o.pos) obj.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) obj.rotation.y = o.rot;
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') obj.scale.setScalar(o.scale);
    else obj.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  if (o.ownMaterials) cloneMaterialsDeep(obj);
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      if (o.castShadow !== undefined) m.castShadow = o.castShadow;
      if (o.receiveShadow !== undefined) m.receiveShadow = o.receiveShadow;
    }
  });
  parent.add(obj);
  return obj;
}

function cloneMaterialsDeep(obj: THREE.Object3D): void {
  Assets.cloneMaterials(obj);
}

export async function loadAll(urls: string[]): Promise<void> {
  await G.assets.loadMany(urls);
}

/** Make every mesh of an object cast/receive shadows. */
export function setShadows(obj: THREE.Object3D, cast: boolean, receive: boolean): void {
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

/** Free geometries/materials/textures that WE created (never call on shared Assets models). */
export function disposeOwned(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && (m.geometry as THREE.BufferGeometry).userData.owned) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.userData.owned) {
        for (const k of Object.keys(mat)) {
          const v = (mat as unknown as Record<string, unknown>)[k];
          if (v && (v as THREE.Texture).isTexture && (v as THREE.Texture).userData.owned) (v as THREE.Texture).dispose();
        }
        mat.dispose();
      }
    }
  });
}

export function ownGeo<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.owned = true;
  return g;
}
export function ownMat<T extends THREE.Material>(m: T): T {
  m.userData.owned = true;
  return m;
}

// ------------------------------------------------------------------------------------------------
// Skinned rigs: GPU bone textures
// ------------------------------------------------------------------------------------------------

/**
 * three.js uploads one bone DataTexture per Skeleton on its first draw and frees it only in Skeleton.dispose(). Every skinned
 * instance (Assets.instantiate clones with SkeletonUtils) kept its texture after its entity was gone: about 400 per dungeon visit.
 * A disposed skeleton re-uploads its texture if it is drawn again (WebGLRenderer.setProgram), so disposing is always safe.
 */
export function disposeSkeletons(root: THREE.Object3D): void {
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) sm.skeleton.dispose();
  });
}

/**
 * Frees the bone textures of rigs that LEAVE a running scene (dead enemies, despawned NPCs): once a second it compares the skeletons
 * in the scene graph with the ones it saw at the previous check. Scene exit flushes everything it tracked and the scene's own rigs.
 */
export class SkeletonReaper {
  private seen = new Set<THREE.Skeleton>();
  private acc = 0;

  update(scene: THREE.Object3D, dt: number, every = 1): void {
    this.acc += dt;
    if (this.acc < every) return;
    this.acc = 0;
    const live = new Set<THREE.Skeleton>();
    scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.skeleton) live.add(sm.skeleton);
    });
    for (const sk of this.seen) if (!live.has(sk)) sk.dispose();
    this.seen = live;
  }

  /** Scene exit: dispose every rig this reaper saw and every rig still in `scene`. Call before the scene is cleared. */
  flush(scene: THREE.Object3D): void {
    for (const sk of this.seen) sk.dispose();
    this.seen.clear();
    disposeSkeletons(scene);
  }
}

// ------------------------------------------------------------------------------------------------
// Procedural textures (canvas, nearest filtering, PSX-chunky)
// ------------------------------------------------------------------------------------------------

export function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, opts: { repeat?: boolean } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.owned = true;
  return t;
}

/** Mottled ground texture (greyscale-ish multiply map; colour comes from vertex colours). */
export function groundTexture(seed = 7, size = 64): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, s) => {
    const rng = new RNG(seed);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = 0.62 + rng.next() * 0.38;
        const l = Math.floor(v * 255);
        ctx.fillStyle = `rgb(${l},${l},${l})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // pebbles / darker clumps
    for (let i = 0; i < s * 1.2; i++) {
      const x = rng.int(0, s - 2), y = rng.int(0, s - 2);
      const l = rng.chance(0.5) ? 120 : 235;
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.fillRect(x, y, rng.int(1, 2), rng.int(1, 2));
    }
  }, { repeat: true });
}

/** Weathered stone texture for daises / pedestals. */
export function stoneTexture(seed = 3, size = 32, base: [number, number, number] = [96, 92, 100]): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, s) => {
    const rng = new RNG(seed);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = 0.78 + rng.next() * 0.3;
        ctx.fillStyle = `rgb(${Math.floor(base[0] * v)},${Math.floor(base[1] * v)},${Math.floor(base[2] * v)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.floor((i * s) / 4), s, 1);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) ctx.fillRect(Math.floor(((i + (r % 2) * 0.5) * s) / 3), Math.floor((r * s) / 4), 1, Math.floor(s / 4));
  }, { repeat: true });
}

/** Glowing rune ring (additive overlay) — used for daises, pedestals, selection rings. */
export function runeRingTexture(color = '#ffd27a', size = 128): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c, c, c * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, c * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, c * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    const rng = new RNG(11);
    // rune glyphs between the two big rings
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = c * 0.67, r2 = c * 0.86;
      const gx = c + Math.cos(a) * ((r1 + r2) / 2), gy = c + Math.sin(a) * ((r1 + r2) / 2);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(a + Math.PI / 2);
      const w = 3, hgt = 9;
      ctx.fillRect(-1, -hgt / 2, 2, hgt);
      if (rng.chance(0.6)) ctx.fillRect(-w, -hgt / 2 + rng.int(0, 5), w, 2);
      if (rng.chance(0.5)) ctx.fillRect(1, -hgt / 2 + rng.int(0, 5), w, 2);
      ctx.restore();
    }
    // 4 pointed stars on the compass points
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.save();
      ctx.translate(c + Math.cos(a) * c * 0.5, c + Math.sin(a) * c * 0.5);
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(0, 3); ctx.lineTo(-8, 0); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
}

export function radialGlowTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const t = canvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ------------------------------------------------------------------------------------------------
// Sky: gradient dome, twinkling stars, moon, mountain silhouettes
// ------------------------------------------------------------------------------------------------

export interface SkyDome {
  mesh: THREE.Mesh;
  setColors(top: number, mid: number, horizon: number): void;
}

export function createSkyDome(top: number, mid: number, horizon: number, radius = 420): SkyDome {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uHorizon: { value: new THREE.Color(horizon) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        c = mix(c, uTop, smoothstep(0.22, 0.95, h));
        c = mix(c, uHorizon * 0.55, smoothstep(0.0, -0.2, vDir.y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.owned = true;
  const mesh = new THREE.Mesh(ownGeo(new THREE.SphereGeometry(radius, 24, 16)), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return {
    mesh,
    setColors(t, m, hz) {
      (mat.uniforms.uTop.value as THREE.Color).set(t);
      (mat.uniforms.uMid.value as THREE.Color).set(m);
      (mat.uniforms.uHorizon.value as THREE.Color).set(hz);
    },
  };
}

export interface Stars {
  points: THREE.Points;
  update(t: number): void;
}

export function createStars(count = 700, radius = 400, seed = 5): Stars {
  const rng = new RNG(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const tints = [new THREE.Color(0xffffff), new THREE.Color(0xbcd0ff), new THREE.Color(0xffe6b0), new THREE.Color(0xffc8c8)];
  for (let i = 0; i < count; i++) {
    // upper hemisphere (slightly below horizon is hidden by mountains / fog)
    const y = Math.pow(rng.next(), 0.7) * 0.97 + 0.03;
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * r * radius;
    const c = tints[rng.int(0, tints.length - 1)];
    const br = 0.45 + rng.next() * 0.55;
    col[i * 3] = c.r * br; col[i * 3 + 1] = c.g * br; col[i * 3 + 2] = c.b * br;
    size[i] = rng.chance(0.08) ? 2.4 : rng.chance(0.3) ? 1.7 : 1.2;
    phase[i] = rng.next() * 6.28;
  }
  const g = ownGeo(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aPhase; uniform float uTime; varying vec3 vC;
      void main(){ vC = aColor * (0.65 + 0.35 * sin(uTime * 1.7 + aPhase * 3.0)); gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }`,
  });
  mat.userData.owned = true;
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = -900;
  return { points, update: (t) => { mat.uniforms.uTime.value = t; } };
}

export interface Moon {
  group: THREE.Group;
  light: THREE.DirectionalLight;
}

/** Cratered moon disc with a soft halo, plus the directional "moonlight" pointing from it toward the origin. */
export function createMoon(pos: THREE.Vector3, radius = 13, lightColor = 0x7a9cff, lightIntensity = 0.9): Moon {
  const group = new THREE.Group();
  const tex = canvasTexture(64, (ctx, s) => {
    const rng = new RNG(21);
    ctx.fillStyle = '#e9efff';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = rng.int(4, s - 6), y = rng.int(4, s - 6), r = rng.int(2, 7);
      ctx.fillStyle = `rgba(150,165,205,${0.35 + rng.next() * 0.35})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(x - 1, y - 1, Math.max(1, r - 2), 0, Math.PI * 2); ctx.fill();
    }
  });
  const disc = new THREE.Mesh(
    ownGeo(new THREE.SphereGeometry(radius, 16, 12)),
    ownMat(new THREE.MeshBasicMaterial({ map: tex, fog: false, color: 0xffffff })),
  );
  disc.renderOrder = -800;
  group.add(disc);
  const haloTex = radialGlowTexture(64, 'rgba(170,200,255,0.55)', 'rgba(120,150,255,0)');
  const halo = new THREE.Sprite(ownMat(new THREE.SpriteMaterial({ map: haloTex, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.setScalar(radius * 7);
  halo.renderOrder = -850;
  group.add(halo);
  group.position.copy(pos);
  const light = new THREE.DirectionalLight(lightColor, lightIntensity);
  light.position.copy(pos).normalize().multiplyScalar(60);
  return { group, light };
}

/** Jagged mountain / treeline silhouette ring (unlit, fog-less) for horizon depth. */
export function createSilhouetteRing(opts: { radius: number; height: number; color: number; seed?: number; segments?: number; jag?: number }): THREE.Mesh {
  const rng = new RNG(opts.seed ?? 9);
  const segs = opts.segments ?? 72;
  const verts: number[] = [];
  const idx: number[] = [];
  let prev = opts.height * 0.5;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const h = opts.height * (0.35 + rng.next() * (opts.jag ?? 0.9));
    const hh = (h + prev) * 0.5;
    prev = h;
    const x = Math.cos(a) * opts.radius, z = Math.sin(a) * opts.radius;
    verts.push(x, -10, z, x, hh, z);
    if (i < segs) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = ownGeo(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const m = ownMat(new THREE.MeshBasicMaterial({ color: opts.color, side: THREE.DoubleSide, fog: false }));
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -700;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------------
// Ground
// ------------------------------------------------------------------------------------------------

export interface GroundOpts {
  radius: number;
  inner: THREE.ColorRepresentation;
  innerRadius: number;
  outer: THREE.ColorRepresentation;
  far?: THREE.ColorRepresentation;
  fadeRadius?: number;
  seed?: number;
  textureRepeat?: number;
  /** Optional lighting-free tint cells (paths etc.) are the caller's job. */
}

/** Large disc with radial vertex colours (dirt clearing -> grass -> dark far field) and a mottled texture. */
export function createGround(o: GroundOpts): THREE.Mesh {
  const segs = 64;
  const rings = 20;
  const verts: number[] = [];
  const cols: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const ci = new THREE.Color(o.inner), co = new THREE.Color(o.outer), cf = new THREE.Color(o.far ?? o.outer);
  const rep = o.textureRepeat ?? 0.18;
  const rng = new RNG(o.seed ?? 4);
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = Math.pow(t, 1.5) * o.radius;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      verts.push(x, 0, z);
      uvs.push(x * rep, z * rep);
      const c = new THREE.Color();
      const k1 = THREE.MathUtils.smoothstep(rad, o.innerRadius * 0.6, o.innerRadius * 1.9);
      c.copy(ci).lerp(co, k1);
      const k2 = THREE.MathUtils.smoothstep(rad, o.fadeRadius ?? o.radius * 0.45, o.radius);
      c.lerp(cf, k2);
      const j = 0.9 + rng.next() * 0.2;
      cols.push(c.r * j, c.g * j, c.b * j);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = (r + 1) * segs + s, d = (r + 1) * segs + ((s + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = ownGeo(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = ownMat(new THREE.MeshLambertMaterial({ map: groundTexture(o.seed ?? 4), vertexColors: true }));
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  psxify(mesh, 'world');
  return mesh;
}

// ------------------------------------------------------------------------------------------------
// Camp ground: real PSX tiles (tiny-texture-pack grass / moss / stones / dirt) blended per fragment from world XZ
// ------------------------------------------------------------------------------------------------

const TT = '/assets/textures/itch/';
/** Tiles used by the textured camp ground (all from public/assets/textures/itch, see index.json). */
export const CAMP_TILE_URLS = {
  grassA: `${TT}tiny-texture-pack-1/tt1-grass-01.png`, // rich dark meadow grass
  grassB: `${TT}tiny-texture-pack-1/tt1-grass-03.png`, // mossy / earthy patches
  rock: `${TT}tiny-texture-pack-1/tt1-grass-07.png`, // stones and gravel in moss
  dirt: `${TT}tiny-texture-pack-2/tt2-dirt-01.png`, // worn brown dirt
  ash: `${TT}tiny-texture-pack-2/tt2-dirt-03.png`, // dark scorched earth around the fire
} as const;
type CampTileKey = keyof typeof CAMP_TILE_URLS;

export interface CampTiles {
  grassA: THREE.Texture;
  grassB: THREE.Texture;
  rock: THREE.Texture;
  dirt: THREE.Texture;
  ash: THREE.Texture;
  noise: THREE.Texture;
}

const CAMP_FALLBACK_RGB: Record<CampTileKey, [number, number, number]> = {
  grassA: [44, 78, 36],
  grassB: [38, 60, 36],
  rock: [100, 96, 88],
  dirt: [108, 78, 50],
  ash: [60, 52, 46],
};

const campTileCache = new Map<string, THREE.Texture>();
let campNoise: THREE.Texture | null = null;

async function loadCampTile(key: CampTileKey): Promise<THREE.Texture> {
  const url = CAMP_TILE_URLS[key];
  const hit = campTileCache.get(url);
  if (hit) return hit;
  let tex: THREE.Texture;
  try {
    tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
  } catch (err) {
    console.warn(`[scenes] ground tile failed (${url}), using a generated one`, err);
    const [r, g, b] = CAMP_FALLBACK_RGB[key];
    tex = canvasTexture(32, (ctx, size) => {
      const rng = new RNG(key.length * 97 + r);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = 0.78 + rng.next() * 0.4;
          ctx.fillStyle = `rgb(${Math.floor(r * v)},${Math.floor(g * v)},${Math.floor(b * v)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }, { repeat: true });
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  applyPSXTexture(tex, { mipmaps: true }); // nearest magnification, mipmapped, anisotropy 1
  tex.minFilter = THREE.NearestMipmapLinearFilter; // soft mip transitions: a big floor seen at a grazing angle would band otherwise
  campTileCache.set(url, tex);
  return tex;
}

/** Tileable, histogram-equalised value noise (R channel uniform in 0..1) used to break up the tiles and wobble the dirt edge. */
function campNoiseTexture(): THREE.Texture {
  if (campNoise) return campNoise;
  const N = 64;
  const rng = new RNG(4242);
  const f = new Float32Array(N * N);
  const octaves: Array<[number, number]> = [[4, 0.5], [8, 0.3], [16, 0.2]];
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (const [P, w] of octaves) {
    const lat = new Float32Array(P * P);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * P, fy = (y / N) * P;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = sm(fx - x0), ty = sm(fy - y0);
        const xa = x0 % P, xb = (x0 + 1) % P, ya = y0 % P, yb = (y0 + 1) % P;
        const top = lat[ya * P + xa] + (lat[ya * P + xb] - lat[ya * P + xa]) * tx;
        const bot = lat[yb * P + xa] + (lat[yb * P + xb] - lat[yb * P + xa]) * tx;
        f[y * N + x] += w * (top + (bot - top) * ty);
      }
    }
  }
  // rank transform -> uniform distribution, so shader thresholds read as coverage percentages
  const order = Array.from(f.keys()).sort((a, b) => f[a] - f[b]);
  const eq = new Uint8Array(N * N);
  order.forEach((idx, rank) => {
    eq[idx] = Math.round((rank / (N * N - 1)) * 255);
  });
  const tex = canvasTexture(N, (ctx) => {
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = eq[i];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true });
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  campNoise = tex;
  return tex;
}

/** Load (once, cached) every tile the camp ground needs. Never throws: a failed PNG falls back to a generated tile. */
export async function loadCampTiles(): Promise<CampTiles> {
  const [grassA, grassB, rock, dirt, ash] = await Promise.all((Object.keys(CAMP_TILE_URLS) as CampTileKey[]).map(loadCampTile));
  return { grassA, grassB, rock, dirt, ash, noise: campNoiseTexture() };
}

export interface CampGroundOpts {
  /** Half extent of the square ground (metres). */
  half?: number;
  /** Quad size (metres). */
  cell?: number;
  /** Campfire position on the XZ plane (centre of the ash patch and of the distance fade). */
  fire?: [number, number];
  /** Worn-dirt clearings [x, z, radius]; the first one should be the main camp circle. */
  blobs: Array<[number, number, number]>;
  /** Trodden dirt paths [x0, z0, x1, z1]. */
  paths?: Array<[number, number, number, number]>;
  pathWidth?: number;
  ashRadius?: number;
  fadeStart?: number;
  fadeEnd?: number;
  tint?: THREE.ColorRepresentation;
}

/**
 * One subdivided plane (4 m quads) whose fragment shader blends the real PSX tiles by world position:
 * two-scale grass, mossy patches, gravel patches, a noisy-edged worn dirt circle + paths and a dark ash patch
 * at the fire. Perspective-correct (no affine warp on the big triangles) and still PSX vertex-snapped.
 */
export function createCampGround(t: CampTiles, o: CampGroundOpts): THREE.Mesh {
  const half = o.half ?? 140;
  const cell = o.cell ?? 4;
  const fire = o.fire ?? [0, 0];
  const blobs = o.blobs.map((b) => new THREE.Vector3(b[0], b[1], b[2]));
  const paths = (o.paths ?? []).map((p) => new THREE.Vector4(p[0], p[1], p[2], p[3]));
  if (!blobs.length) blobs.push(new THREE.Vector3(fire[0], fire[1], 8));
  if (!paths.length) paths.push(new THREE.Vector4(fire[0], fire[1], fire[0], fire[1]));
  const NB = blobs.length, NP = paths.length;

  const mat = ownMat(new THREE.MeshLambertMaterial({ color: o.tint ?? 0xffffff }));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGrassA: { value: t.grassA }, uGrassB: { value: t.grassB }, uRock: { value: t.rock }, uDirt: { value: t.dirt }, uAsh: { value: t.ash }, uNoise: { value: t.noise },
      uBlobs: { value: blobs }, uPaths: { value: paths }, uPathW: { value: o.pathWidth ?? 3.2 },
      uFire: { value: new THREE.Vector2(fire[0], fire[1]) }, uAshR: { value: o.ashRadius ?? 2.4 },
      uFade: { value: new THREE.Vector2(o.fadeStart ?? 38, o.fadeEnd ?? 110) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vGroundXZ;
uniform sampler2D uGrassA; uniform sampler2D uGrassB; uniform sampler2D uRock; uniform sampler2D uDirt; uniform sampler2D uAsh; uniform sampler2D uNoise;
uniform vec3 uBlobs[${NB}]; uniform vec4 uPaths[${NP}];
uniform float uPathW; uniform vec2 uFire; uniform float uAshR; uniform vec2 uFade;
float cgSeg(vec2 p, vec4 s) {
  vec2 pa = p - s.xy; vec2 ba = s.zw - s.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 gp = vGroundXZ;
float nLo = texture2D(uNoise, gp / 53.0).r;
float nMid = texture2D(uNoise, gp / 19.0 + vec2(0.31, 0.57)).r;
float nHi = texture2D(uNoise, gp / 6.3 + vec2(0.72, 0.18)).r;
float nRk = texture2D(uNoise, gp / 13.0 + vec2(0.11, 0.83)).r;
// meadow: two scales of the grass tile (hides repetition) + mossy patches + gravel patches
vec3 grass = mix(texture2D(uGrassA, gp / 3.6).rgb, texture2D(uGrassA, gp / 9.7 + vec2(0.5, 0.25)).rgb * 1.08, 0.3);
grass = mix(grass, texture2D(uGrassB, gp / 5.2).rgb, smoothstep(0.55, 0.66, nLo));
vec3 rock = texture2D(uRock, gp / 4.0).rgb;
float rockW = smoothstep(0.90, 0.95, nRk);
// worn dirt: noisy-edged clearings + trodden paths
float edge = (nMid - 0.5) * 5.0 + (nHi - 0.5) * 1.6;
float dW = 0.0;
for (int i = 0; i < ${NB}; i++) {
  vec3 b = uBlobs[i];
  dW = max(dW, 1.0 - smoothstep(-0.6, 0.6, length(gp - b.xy) - b.z + edge));
}
for (int i = 0; i < ${NP}; i++) {
  float d = cgSeg(gp, uPaths[i]) - uPathW * 0.5 + (nHi - 0.5) * 1.8 + (nMid - 0.5) * 1.2;
  dW = max(dW, 1.0 - smoothstep(-0.6, 0.6, d));
}
vec3 dirt = mix(texture2D(uDirt, gp / 2.6).rgb, texture2D(uDirt, gp / 8.3 + vec2(0.13, 0.41)).rgb, 0.3);
float ashW = 1.0 - smoothstep(uAshR * 0.5, uAshR * 1.4, length(gp - uFire) + (nHi - 0.5) * 2.2);
dirt = mix(dirt, texture2D(uAsh, gp / 2.2).rgb * 0.85, ashW);
vec3 base = mix(mix(grass, rock, rockW * (1.0 - dW)), dirt, dW);
base *= 1.0 - 0.2 * (4.0 * dW * (1.0 - dW)); // darker, trampled rim where dirt meets grass
base *= 0.86 + 0.28 * nLo;
base *= mix(1.0, 0.35, smoothstep(uFade.x, uFade.y, length(gp - uFire)));
diffuseColor.rgb *= base;`,
      );
  };
  mat.customProgramCacheKey = () => `campGround1:${NB}:${NP}`; // set before patchPSX (it chains the key)
  patchPSX(mat, { affine: false });

  const n = Math.round((half * 2) / cell);
  const geo = ownGeo(new THREE.PlaneGeometry(half * 2, half * 2, n, n));
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'camp_ground';
  return mesh;
}

// ------------------------------------------------------------------------------------------------
// Particles: embers & fireflies (own lightweight Points systems, independent of the VFX module)
// ------------------------------------------------------------------------------------------------

export interface ParticleSystem {
  points: THREE.Points;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function createEmbers(origin: THREE.Vector3, count = 120, o: { spread?: number; rise?: number; color?: THREE.ColorRepresentation; size?: number; height?: number } = {}): ParticleSystem {
  const rng = new RNG(33);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const maxLife = new Float32Array(count);
  const base = new THREE.Color(o.color ?? 0xff9a3a);
  const spread = o.spread ?? 0.7;
  const rise = o.rise ?? 1.6;
  const respawn = (i: number, fresh: boolean) => {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * spread;
    pos[i * 3] = origin.x + Math.cos(a) * r;
    pos[i * 3 + 1] = origin.y + 0.3 + rng.next() * 0.4;
    pos[i * 3 + 2] = origin.z + Math.sin(a) * r;
    vel[i * 3] = (rng.next() - 0.5) * 0.7;
    vel[i * 3 + 1] = rise * (0.6 + rng.next() * 0.9);
    vel[i * 3 + 2] = (rng.next() - 0.5) * 0.7;
    maxLife[i] = 1.4 + rng.next() * (o.height ?? 3.2);
    life[i] = fresh ? rng.next() * maxLife[i] : maxLife[i];
  };
  for (let i = 0; i < count; i++) respawn(i, true);
  const g = ownGeo(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = ownMat(new THREE.PointsMaterial({ size: o.size ?? 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return {
    points,
    update(dt, time) {
      for (let i = 0; i < count; i++) {
        life[i] -= dt;
        if (life[i] <= 0) respawn(i, false);
        const lf = life[i] / maxLife[i];
        vel[i * 3] += Math.sin(time * 1.3 + i) * 0.4 * dt;
        vel[i * 3 + 2] += Math.cos(time * 1.1 + i * 1.7) * 0.4 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = Math.min(1, lf * 1.8) * (0.5 + 0.5 * Math.sin(time * 14 + i * 3.1));
        const hot = lf > 0.55 ? 1 : 0.55 + lf;
        col[i * 3] = base.r * k * hot + 0.0;
        col[i * 3 + 1] = base.g * k * lf;
        col[i * 3 + 2] = base.b * k * lf * 0.5;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
}

export function createFireflies(center: THREE.Vector3, radius: number, count = 40, color: THREE.ColorRepresentation = 0xcfff7a, seed = 77): ParticleSystem {
  const rng = new RNG(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const home = new Float32Array(count * 3);
  const ph = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    home[i * 3] = center.x + Math.cos(a) * r;
    home[i * 3 + 1] = center.y + 0.4 + rng.next() * 3.2;
    home[i * 3 + 2] = center.z + Math.sin(a) * r;
    ph[i * 3] = rng.next() * 6.28; ph[i * 3 + 1] = rng.next() * 6.28; ph[i * 3 + 2] = rng.next() * 6.28;
  }
  const g = ownGeo(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = ownMat(new THREE.PointsMaterial({ size: 3.4, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  const upd = (time: number) => {
    for (let i = 0; i < count; i++) {
      pos[i * 3] = home[i * 3] + Math.sin(time * 0.35 + ph[i * 3]) * 1.6;
      pos[i * 3 + 1] = home[i * 3 + 1] + Math.sin(time * 0.5 + ph[i * 3 + 1]) * 0.6;
      pos[i * 3 + 2] = home[i * 3 + 2] + Math.cos(time * 0.3 + ph[i * 3 + 2]) * 1.6;
      const blink = Math.max(0, Math.sin(time * 1.4 + ph[i * 3 + 1] * 2.0));
      const k = blink * blink;
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  };
  upd(0);
  return { points, update: (_dt, time) => upd(time), dispose() { g.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------
// Flicker / animation helpers
// ------------------------------------------------------------------------------------------------

/** Smooth organic flicker 0.75..1.25 from layered sines (cheap fire light). */
export function fireFlicker(t: number, seed = 0): number {
  return 1 + 0.16 * Math.sin(t * 11.3 + seed) + 0.1 * Math.sin(t * 23.7 + seed * 2.1) + 0.06 * Math.sin(t * 41.1 + seed * 0.7);
}

export interface FlameRig {
  update(t: number): void;
}

/**
 * Animate the 'flame' cross-card meshes of generated props (campfire, brazier, forge): scale + opacity wobble, and
 * return the 'light_0' / 'fire_fx' local positions so the caller can add a PointLight / VFX there.
 */
export function rigFlames(model: THREE.Object3D, seed = 0): FlameRig & { lightPos: THREE.Vector3 | null; fxPos: THREE.Vector3 | null } {
  const flames: { m: THREE.Object3D; s: THREE.Vector3 }[] = [];
  model.traverse((o) => {
    if (o.name === 'flame' || o.name.startsWith('flame')) flames.push({ m: o, s: o.scale.clone() });
  });
  const light = model.getObjectByName('light_0');
  const fx = model.getObjectByName('fire_fx');
  model.updateMatrixWorld(true);
  const toLocal = (o: THREE.Object3D | undefined) => {
    if (!o) return null;
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    return model.worldToLocal(v);
  };
  return {
    lightPos: toLocal(light),
    fxPos: toLocal(fx),
    update(t) {
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const w = fireFlicker(t * 1.3, seed + i * 1.7);
        f.m.scale.set(f.s.x * (0.92 + 0.12 * Math.sin(t * 9 + i)), f.s.y * w, f.s.z * (0.92 + 0.12 * Math.cos(t * 8 + i)));
        f.m.rotation.y = Math.sin(t * 3 + i) * 0.25;
      }
    },
  };
}

/** Sway a banner's 'cloth' node (rotation wobble) — cheap stand-in for the cloth shader. */
export function swayCloth(model: THREE.Object3D, t: number, amount = 0.07, seed = 0): void {
  const cloth = model.getObjectByName('cloth');
  if (!cloth) return;
  cloth.rotation.z = Math.sin(t * 1.7 + seed) * amount;
  cloth.rotation.x = Math.sin(t * 1.1 + seed * 1.3) * amount * 0.6;
}

/** Apply/restore an emissive highlight on every material of an object (materials must be per-instance). */
export function setEmissiveHighlight(root: THREE.Object3D, color: number, amount: number): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list as THREE.MeshStandardMaterial[]) {
      if (!mat || !mat.emissive) continue;
      const ud = mat.userData;
      if (!ud._hlBase) {
        ud._hlBase = mat.emissive.clone();
        ud._hlIntensity = mat.emissiveIntensity ?? 1;
      }
      if (amount <= 0.001) {
        mat.emissive.copy(ud._hlBase);
        mat.emissiveIntensity = ud._hlIntensity;
      } else {
        mat.emissive.copy(ud._hlBase).lerp(new THREE.Color(color), Math.min(1, amount));
        mat.emissiveIntensity = Math.max(ud._hlIntensity, amount * 0.9);
      }
    }
  });
}

/** Screen-space projection of a world point to CSS pixels inside the canvas. Returns null when behind the camera. */
export function projectToScreen(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number, out = new THREE.Vector3()): { x: number; y: number } | null {
  out.copy(p).project(camera);
  if (out.z > 1 || out.z < -1) return null;
  return { x: (out.x * 0.5 + 0.5) * w, y: (-out.y * 0.5 + 0.5) * h };
}

/** Preferred-lighting presets so the menu / town / dungeon-fallback agree on exposure. */
export function addBasicLights(scene: THREE.Scene, o: { hemiSky: number; hemiGround: number; hemiIntensity: number; sun?: { color: number; intensity: number; pos: [number, number, number]; shadow?: number } }): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight | null } {
  const hemi = new THREE.HemisphereLight(o.hemiSky, o.hemiGround, o.hemiIntensity);
  scene.add(hemi);
  let sun: THREE.DirectionalLight | null = null;
  if (o.sun) {
    sun = new THREE.DirectionalLight(o.sun.color, o.sun.intensity);
    sun.position.set(...o.sun.pos);
    if (o.sun.shadow) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const e = o.sun.shadow;
      Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 160 });
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
    }
    scene.add(sun);
  }
  return { hemi, sun };
}

/** Soft vertical light-shaft texture (alpha fades toward the top and sides). */
export function beamTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,230,150,0.9)');
    g.addColorStop(0.55, 'rgba(255,200,110,0.28)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** Open cylinder light shaft (additive) used for selection / interaction highlights. */
export function createBeam(radius = 0.9, height = 6, color: THREE.ColorRepresentation = 0xffd27a): THREE.Mesh {
  const mat = ownMat(new THREE.MeshBasicMaterial({ map: beamTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0 }));
  const m = new THREE.Mesh(ownGeo(new THREE.CylinderGeometry(radius * 0.82, radius, height, 14, 1, true)), mat);
  m.position.y = height / 2;
  m.renderOrder = 5;
  return m;
}

export interface InstanceXform { x: number; y?: number; z: number; rotY?: number; scale?: number | [number, number, number] }

/**
 * Draw many copies of a single-mesh prop with one draw call (fences, grass, rocks). Multi-mesh props use the first mesh only,
 * so reserve this for single-mesh models. Returns the InstancedMesh (already added to `parent`) or null if the model has no mesh.
 */
export function instanceModel(parent: THREE.Object3D, url: string, xf: InstanceXform[]): THREE.InstancedMesh | null {
  if (!xf.length) return null;
  const model = G.assets.instantiate(url);
  model.updateMatrixWorld(true);
  let src: THREE.Mesh | null = null;
  model.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
  });
  if (!src) return null;
  const mesh = src as THREE.Mesh;
  const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, xf.length);
  inst.frustumCulled = false;
  inst.castShadow = true;
  inst.receiveShadow = true;
  const local = mesh.matrixWorld.clone();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  xf.forEach((t, i) => {
    p.set(t.x, t.y ?? 0, t.z);
    q.setFromAxisAngle(up, t.rotY ?? 0);
    if (typeof t.scale === 'number') sc.setScalar(t.scale);
    else if (t.scale) sc.set(t.scale[0], t.scale[1], t.scale[2]);
    else sc.setScalar(1);
    m.compose(p, q, sc).multiply(local);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);
  return inst;
}
