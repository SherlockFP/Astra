import * as THREE from 'three';
import { patchPSX } from '../render/psx';
import { TileNoise, makeCanvas, surfaceTexture } from './ProceduralAssets';
import { EDGE_NOISE_MAX, SPLAT_CH_INDEX, opBounds, opRaw, type SplatChannel, type SplatOp } from './chunks/SplatPaint';
import type { Relief } from './Relief';
import { reliefTerrainGeometry } from './ReliefMesh';
import { SLOPE_FRAG, SLOPE_VARYING_FRAG, SLOPE_VARYING_VERT, SLOPE_VERT } from './TerrainSlope';

/**
 * Terrain: one big ground mesh shaded with a splat map (dirt / cobble / dark patches painted from shape ops) over
 * tiled 64px PSX detail textures (grass, dirt, cobble). Crisp chunky pixels, no huge textures. OWNER: world module.
 *
 * Open-world additions (GDD_OPENWORLD §1.5.1): splat up to 2048 px stored as Uint8 (12 MB instead of 50 MB), and an
 * optional region TINT MAP (RGB texels multiplied into the ground colour, bilinear) so each region reads differently
 * without extra textures.
 */

export type { SplatChannel, SplatOp };

/** RGB tint texels (row-major, row 0 = z -half) covering [-half, half]^2 metres around the terrain centre. */
export interface TerrainTint {
  w: number;
  h: number;
  /** 3 bytes per texel. */
  rgb: Uint8Array;
  /** Optional snow cover per texel (0..255, 1 byte): the snow texture replaces the grass under the splat paths and patches. */
  snow?: Uint8Array;
  half: number;
}

export interface TerrainOptions {
  /** Ground mesh half size (metres). */
  half: number;
  /** Splat map covers [-splatHalf, splatHalf]. */
  splatHalf: number;
  /** Splat resolution (max 2048). */
  splatRes?: number;
  seed: string;
  ops: SplatOp[];
  grassTint?: number;
  /** Mesh cell size (metres). */
  cell?: number;
  /** Optional region tint map multiplied into the ground colour. */
  tint?: TerrainTint;
  /**
   * Rolling terrain (world/Relief.ts): the mesh is built from the relief grid inside `half` metres around (centreX, centreZ) (the
   * mesh position) instead of a flat plane. `cell` is then the relief's.
   */
  relief?: { relief: Relief; centreX: number; centreZ: number };
}

export interface Terrain {
  mesh: THREE.Mesh;
  /** Splat weights at a world position (0..1). */
  weights(x: number, z: number): { dirt: number; cobble: number; dark: number };
  dispose(): void;
}

export function createTerrain(o: TerrainOptions): Terrain {
  const N = Math.max(64, Math.min(2048, o.splatRes ?? 512));
  const S = o.splatHalf * 2;
  const data = new Uint8ClampedArray(N * N * 3);
  const noise = new TileNoise(`terrain:${o.seed}`, 8, 4);
  const toPx = (v: number) => ((v + o.splatHalf) / S) * N;
  const mpp = S / N;

  const apply = (ch: SplatChannel, i: number, w: number, amount: number) => {
    const k = i * 3 + SPLAT_CH_INDEX[ch];
    const v = Math.round(Math.max(0, Math.min(1, w)) * amount * 255);
    if (v > data[k]) data[k] = v;
  };

  for (const op of o.ops) {
    const soft = op.soft ?? 1.2;
    const amount = op.amount ?? 1;
    // bounding box in px (shape maths shared with the chunked splat: chunks/SplatPaint.ts)
    const bb = opBounds(op);
    const px0 = Math.max(0, Math.floor(toPx(bb.x0))), px1 = Math.min(N - 1, Math.ceil(toPx(bb.x1)));
    const pz0 = Math.max(0, Math.floor(toPx(bb.z0))), pz1 = Math.min(N - 1, Math.ceil(toPx(bb.z1)));
    for (let pz = pz0; pz <= pz1; pz++)
      for (let px = px0; px <= px1; px++) {
        const wx = (px + 0.5) * mpp - o.splatHalf, wz = (pz + 0.5) * mpp - o.splatHalf;
        const raw = opRaw(op, wx, wz); // signed distance without the edge noise, negative inside
        // cheap reject: the edge noise cannot bring a pixel this far outside back inside the soft band
        if (raw - EDGE_NOISE_MAX > soft) continue;
        // noise displaces the edge: chunky, organic borders
        const nz = (noise.fbm(px / N * 3, pz / N * 3) - 0.5) * 2.4 + (noise.sample(px / N * 11, pz / N * 11, 3) - 0.5) * 0.9;
        const d = raw + nz;
        if (d > soft) continue;
        // hard-ish edge with a dithered band
        const w = 1 - Math.max(0, d) / soft;
        const dither = (((px & 1) + ((pz & 1) << 1)) / 4 - 0.4) * 0.35;
        apply(op.ch, pz * N + px, w + (d > -0.5 ? dither : 0) > 0.5 ? 1 : w > 0.15 ? 0.5 : 0, amount);
      }
  }
  // dark moss/shade patches everywhere (very light). Noise is sampled per block (<= 512 samples per axis) to keep 2048 px cheap.
  const blk = Math.max(1, Math.round(N / 512));
  for (let by = 0; by < N; by += blk)
    for (let bx = 0; bx < N; bx += blk) {
      const n = noise.fbm((bx / N) * 5 + 0.3, (by / N) * 5 + 0.7);
      if (n <= 0.64) continue;
      const add = Math.min(255, Math.round((n - 0.64) * 6 * 255));
      for (let pz = by; pz < Math.min(N, by + blk); pz++)
        for (let px = bx; px < Math.min(N, bx + blk); px++) {
          const i = pz * N + px;
          if (data[i * 3] < 51 && data[i * 3 + 1] < 51 && add > data[i * 3 + 2]) data[i * 3 + 2] = add;
        }
    }
  const { canvas, ctx } = makeCanvas(N, N);
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    img.data[i * 4] = data[i * 3];
    img.data[i * 4 + 1] = data[i * 3 + 1];
    img.data[i * 4 + 2] = data[i * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const splat = new THREE.CanvasTexture(canvas);
  splat.magFilter = THREE.NearestFilter;
  splat.minFilter = THREE.NearestFilter;
  splat.colorSpace = THREE.NoColorSpace;
  splat.generateMipmaps = false;
  splat.flipY = false; // row 0 = z -splatHalf
  splat.needsUpdate = true;

  // region tint map (bilinear, sRGB so the hex colours match THREE.Color)
  // (without a tint map a 1x1 white texel is bound and uHasTint = 0)
  const tintSrc: TerrainTint = o.tint ?? { w: 1, h: 1, rgb: new Uint8Array([255, 255, 255]), half: o.splatHalf };
  const tintHasData = !!o.tint;
  const tintRGBA = new Uint8Array(tintSrc.w * tintSrc.h * 4);
  for (let i = 0; i < tintSrc.w * tintSrc.h; i++) {
    tintRGBA[i * 4] = tintSrc.rgb[i * 3];
    tintRGBA[i * 4 + 1] = tintSrc.rgb[i * 3 + 1];
    tintRGBA[i * 4 + 2] = tintSrc.rgb[i * 3 + 2];
    tintRGBA[i * 4 + 3] = tintSrc.snow ? tintSrc.snow[i] : 0; // alpha = snow cover (the tint's rgb is unchanged)
  }
  const tintTex = new THREE.DataTexture(tintRGBA, tintSrc.w, tintSrc.h, THREE.RGBAFormat);
  tintTex.magFilter = THREE.LinearFilter;
  tintTex.minFilter = THREE.LinearFilter;
  tintTex.generateMipmaps = false;
  tintTex.wrapS = THREE.ClampToEdgeWrapping;
  tintTex.wrapT = THREE.ClampToEdgeWrapping;
  tintTex.colorSpace = THREE.SRGBColorSpace;
  tintTex.needsUpdate = true;

  const grass = surfaceTexture('grass', o.seed, 64);
  const dirt = surfaceTexture('dirt', o.seed, 64);
  const cobble = surfaceTexture('cobble', o.seed, 64);
  const moss = surfaceTexture('moss', o.seed, 64);
  const snowTex = surfaceTexture('snow', o.seed, 64);

  const mat = new THREE.MeshStandardMaterial({ color: o.grassTint ?? 0xffffff, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSplat = { value: splat };
    shader.uniforms.uGrass = { value: grass };
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uCobble = { value: cobble };
    shader.uniforms.uMoss = { value: moss };
    shader.uniforms.uSnow = { value: snowTex };
    shader.uniforms.uSplatHalf = { value: o.splatHalf };
    shader.uniforms.uTintMap = { value: tintTex };
    shader.uniforms.uTintHalf = { value: tintSrc.half };
    shader.uniforms.uHasTint = { value: tintHasData ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vTerrainXZ;\n${SLOPE_VARYING_VERT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTerrainXZ = position.xz;\n${SLOPE_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vTerrainXZ;
${SLOPE_VARYING_FRAG}
uniform sampler2D uSplat; uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uCobble; uniform sampler2D uMoss; uniform sampler2D uSnow;
uniform float uSplatHalf;
uniform sampler2D uTintMap; uniform float uTintHalf; uniform float uHasTint;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 st = (vTerrainXZ + vec2(uSplatHalf)) / (2.0 * uSplatHalf);
vec4 sp = vec4(0.0);
if (st.x >= 0.0 && st.x <= 1.0 && st.y >= 0.0 && st.y <= 1.0) sp = texture2D(uSplat, st);
vec3 g1 = texture2D(uGrass, vTerrainXZ / 4.0).rgb;
vec3 g2 = texture2D(uGrass, vTerrainXZ / 13.0 + vec2(0.37, 0.11)).rgb;
vec3 ms = texture2D(uMoss, vTerrainXZ / 5.0).rgb;
vec3 dt = texture2D(uDirt, vTerrainXZ / 3.0).rgb;
vec3 cb = texture2D(uCobble, vTerrainXZ / 4.0).rgb;
vec3 base = mix(g1, g2 * 0.92, 0.3);
// region tint: sampled unconditionally (clamped), then masked outside the tint area. Its alpha is the snow cover: the snow
// replaces the grass first, so the splat paths (dirt, cobble) and the dark patches still show through it
vec2 ts = (vTerrainXZ + vec2(uTintHalf)) / (2.0 * uTintHalf);
vec4 tm = texture2D(uTintMap, clamp(ts, 0.0, 1.0));
float inside = step(0.0, ts.x) * step(ts.x, 1.0) * step(0.0, ts.y) * step(ts.y, 1.0) * uHasTint;
base = mix(base, texture2D(uSnow, vTerrainXZ / 4.0).rgb, tm.a * inside);
base = mix(base, ms, sp.b);
base = mix(base, dt, sp.r);
base = mix(base, cb, sp.g);
${SLOPE_FRAG}
vec3 tintC = mix(vec3(1.0), tm.rgb, inside);
diffuseColor.rgb *= base * tintC;`,
      );
  };
  patchPSX(mat, { affine: false });

  let geo: THREE.BufferGeometry;
  if (o.relief) {
    geo = reliefTerrainGeometry(o.relief.relief, o.relief.centreX, o.relief.centreZ, o.half);
  } else {
    const cell = o.cell ?? 10;
    const segs = Math.round((o.half * 2) / cell);
    const plane = new THREE.PlaneGeometry(o.half * 2, o.half * 2, segs, segs);
    plane.rotateX(-Math.PI / 2);
    geo = plane;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.frustumCulled = false;

  return {
    mesh,
    weights(x: number, z: number) {
      const px = Math.floor(toPx(x)), pz = Math.floor(toPx(z));
      if (px < 0 || pz < 0 || px >= N || pz >= N) return { dirt: 0, cobble: 0, dark: 0 };
      const i = (pz * N + px) * 3;
      return { dirt: data[i] / 255, cobble: data[i + 1] / 255, dark: data[i + 2] / 255 };
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      splat.dispose();
      tintTex?.dispose();
    },
  };
}
