import * as THREE from 'three';
import { patchPSX } from '../render/psx';
import { surfaceTexture } from './ProceduralAssets';
import type { TerrainTint } from './Terrain';
import { ChunkSplats, type SplatOp } from './chunks/SplatPaint';

/**
 * Chunked terrain for big open-world zones (docs/ENGINE_BIGMAPS.md): the ground is one flat quad per chunk (shared geometry), each
 * chunk with its own small splat texture painted on demand from the ground ops (chunks/SplatPaint.ts) and the same PSX detail
 * textures + region tint map as Terrain.ts. A chunk is created when the streamer asks for it and its material + splat texture
 * are disposed when it goes (the geometry, detail textures and tint map are shared). The shading is Terrain.ts's, with the splat
 * lookup changed from "one map-sized texture" to "this chunk's texture". OWNER: world module (engine).
 */

export interface ChunkedTerrainOptions {
  seed: string;
  ops: SplatOp[];
  /** Map centre (m): the ops and the tint map are expressed relative to it (same frame as Terrain.ts). */
  mapCx: number;
  mapCz: number;
  chunkM: number;
  /** Splat pixels per chunk edge (default 128 = 0.5 m/px at 64 m). */
  splatRes?: number;
  grassTint?: number;
  tint?: TerrainTint;
  parent: THREE.Object3D;
}

export interface TerrainChunk {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  splat: THREE.DataTexture;
}

export class ChunkedTerrain {
  readonly splats: ChunkSplats;
  private readonly geo: THREE.PlaneGeometry;
  private readonly grass: THREE.Texture;
  private readonly dirt: THREE.Texture;
  private readonly cobble: THREE.Texture;
  private readonly moss: THREE.Texture;
  private readonly tintTex: THREE.DataTexture;
  private readonly tintHalf: number;
  private readonly hasTint: boolean;
  private live = 0;

  constructor(private readonly o: ChunkedTerrainOptions) {
    this.splats = new ChunkSplats(o.ops, o.seed, o.mapCx, o.mapCz, o.chunkM, o.splatRes ?? 128);
    // one flat quad, 8 m cells (the PSX vertex snap needs a few vertices per polygon, like the 10 m cells of Terrain.ts)
    const seg = Math.max(1, Math.round(o.chunkM / 8));
    this.geo = new THREE.PlaneGeometry(o.chunkM, o.chunkM, seg, seg);
    this.geo.rotateX(-Math.PI / 2);
    this.grass = surfaceTexture('grass', o.seed, 64);
    this.dirt = surfaceTexture('dirt', o.seed, 64);
    this.cobble = surfaceTexture('cobble', o.seed, 64);
    this.moss = surfaceTexture('moss', o.seed, 64);
    // region tint map (shared by every chunk): bilinear, sRGB; a 1x1 white texel and uHasTint = 0 without one
    const src: TerrainTint = o.tint ?? { w: 1, h: 1, rgb: new Uint8Array([255, 255, 255]), half: 1 };
    this.hasTint = !!o.tint;
    this.tintHalf = src.half;
    const rgba = new Uint8Array(src.w * src.h * 4);
    for (let i = 0; i < src.w * src.h; i++) {
      rgba[i * 4] = src.rgb[i * 3];
      rgba[i * 4 + 1] = src.rgb[i * 3 + 1];
      rgba[i * 4 + 2] = src.rgb[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(rgba, src.w, src.h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this.tintTex = t;
  }

  /** Chunks currently built (dev readout). */
  get count(): number {
    return this.live;
  }

  /** Splat weights at a world position (painted on demand, also for chunks that are not built). */
  weights(x: number, z: number): { dirt: number; cobble: number; dark: number } {
    return this.splats.weights(x, z);
  }

  load(cx: number, cz: number): TerrainChunk {
    const o = this.o;
    const res = this.splats.res;
    const rgb = this.splats.get(cx, cz);
    const rgba = new Uint8Array(res * res * 4);
    for (let i = 0; i < res * res; i++) {
      rgba[i * 4] = rgb[i * 3];
      rgba[i * 4 + 1] = rgb[i * 3 + 1];
      rgba[i * 4 + 2] = rgb[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    const splat = new THREE.DataTexture(rgba, res, res, THREE.RGBAFormat);
    splat.magFilter = THREE.NearestFilter;
    splat.minFilter = THREE.NearestFilter;
    splat.colorSpace = THREE.NoColorSpace;
    splat.generateMipmaps = false;
    splat.wrapS = THREE.ClampToEdgeWrapping;
    splat.wrapT = THREE.ClampToEdgeWrapping;
    splat.flipY = false; // row 0 = the chunk's low-z edge
    splat.needsUpdate = true;

    const sp = this.splats.spec(cx, cz);
    const size = o.chunkM;
    const origin = new THREE.Vector2(sp.x0 + size / 2, sp.z0 + size / 2); // chunk centre in the splat / tint frame
    const material = new THREE.MeshStandardMaterial({ color: o.grassTint ?? 0xffffff, roughness: 1, metalness: 0 });
    const hasTint = this.hasTint ? 1 : 0;
    const tintHalf = this.tintHalf;
    const { grass, dirt, cobble, moss, tintTex } = this;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSplat = { value: splat };
      shader.uniforms.uGrass = { value: grass };
      shader.uniforms.uDirt = { value: dirt };
      shader.uniforms.uCobble = { value: cobble };
      shader.uniforms.uMoss = { value: moss };
      shader.uniforms.uChunkOrigin = { value: origin };
      shader.uniforms.uChunkSize = { value: size };
      shader.uniforms.uTintMap = { value: tintTex };
      shader.uniforms.uTintHalf = { value: tintHalf };
      shader.uniforms.uHasTint = { value: hasTint };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTerrainXZ;\nuniform vec2 uChunkOrigin;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainXZ = position.xz + uChunkOrigin;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vTerrainXZ;
uniform sampler2D uSplat; uniform sampler2D uGrass; uniform sampler2D uDirt; uniform sampler2D uCobble; uniform sampler2D uMoss;
uniform vec2 uChunkOrigin; uniform float uChunkSize;
uniform sampler2D uTintMap; uniform float uTintHalf; uniform float uHasTint;`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 st = clamp((vTerrainXZ - uChunkOrigin) / uChunkSize + vec2(0.5), 0.0, 1.0);
vec4 sp = texture2D(uSplat, st);
vec3 g1 = texture2D(uGrass, vTerrainXZ / 4.0).rgb;
vec3 g2 = texture2D(uGrass, vTerrainXZ / 13.0 + vec2(0.37, 0.11)).rgb;
vec3 ms = texture2D(uMoss, vTerrainXZ / 5.0).rgb;
vec3 dt = texture2D(uDirt, vTerrainXZ / 3.0).rgb;
vec3 cb = texture2D(uCobble, vTerrainXZ / 4.0).rgb;
vec3 base = mix(g1, g2 * 0.92, 0.3);
base = mix(base, ms, sp.b);
base = mix(base, dt, sp.r);
base = mix(base, cb, sp.g);
vec2 ts = (vTerrainXZ + vec2(uTintHalf)) / (2.0 * uTintHalf);
vec3 tc = texture2D(uTintMap, clamp(ts, 0.0, 1.0)).rgb;
float inside = step(0.0, ts.x) * step(ts.x, 1.0) * step(0.0, ts.y) * step(ts.y, 1.0) * uHasTint;
vec3 tintC = mix(vec3(1.0), tc, inside);
diffuseColor.rgb *= base * tintC;`,
        );
    };
    patchPSX(material, { affine: false });

    const mesh = new THREE.Mesh(this.geo, material);
    mesh.receiveShadow = true;
    mesh.name = `terrain:${cx},${cz}`;
    mesh.position.set(cx * size + size / 2, 0, cz * size + size / 2);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    o.parent.add(mesh);
    this.live++;
    return { mesh, material, splat };
  }

  unload(_cx: number, _cz: number, c: TerrainChunk): void {
    c.mesh.removeFromParent();
    c.material.dispose();
    c.splat.dispose();
    this.live--;
  }

  /** Disposes the shared geometry and the tint map (chunks are disposed by the streamer's dispose). */
  dispose(): void {
    this.geo.dispose();
    this.tintTex.dispose();
  }
}
