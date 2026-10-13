/**
 * PSX material patching for three.js r186 (WebGLRenderer).
 *
 * - Vertex snapping: after `#include <project_vertex>` the clip-space position is
 *   snapped to a low-resolution screen grid (classic PS1 "wobble"). Works for
 *   skinned, morphed, instanced and batched meshes because it runs after three's
 *   own transform chunks.
 * - Affine texture mapping: the UV is multiplied by clip w in the vertex shader and
 *   divided by the interpolated w in the fragment shader, which cancels the GPU's
 *   perspective correction (WebGL2 has no `noperspective`).
 *
 * All runtime knobs live in the shared `psxUniforms` object, so a settings menu can
 * change them every frame without recompiling any shader.
 */
import {
  Material,
  NearestFilter,
  NearestMipmapNearestFilter,
  ShaderChunk,
  Vector2,
  type IUniform,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';

// ---------------------------------------------------------------------------
// Global runtime uniforms
// ---------------------------------------------------------------------------

export interface PSXUniforms {
  /** Snap grid in virtual pixels (x, y). PS1 ~ 320x240. */
  psxResolution: IUniform<Vector2>;
  /** Vertex snapping strength 0..1 (0 = off, 1 = full snap). */
  psxSnap: IUniform<number>;
  /** Affine texture mapping strength 0..1 (0 = perspective correct, 1 = full affine). */
  psxAffine: IUniform<number>;
}

/** Shared uniform objects referenced by every patched material. Mutate `.value`. */
export const psxUniforms: PSXUniforms = {
  psxResolution: { value: new Vector2(320, 240) },
  psxSnap: { value: 1 },
  psxAffine: { value: 1 },
};

/** Set the vertex snap grid directly (virtual pixels). */
export function setPSXSnapResolution(width: number, height: number): void {
  psxUniforms.psxResolution.value.set(Math.max(1, width), Math.max(1, height));
}

/** Set the snap grid from a viewport aspect ratio and a vertical line count (default 240). */
export function fitPSXSnapResolution(viewWidth: number, viewHeight: number, verticalLines = 240): void {
  const aspect = viewWidth / Math.max(1, viewHeight);
  setPSXSnapResolution(Math.round(verticalLines * aspect), verticalLines);
}

/** Vertex jitter on/off or 0..1 strength. */
export function setPSXJitter(strength: number | boolean): void {
  psxUniforms.psxSnap.value = typeof strength === 'boolean' ? (strength ? 1 : 0) : clamp01(strength);
}

/** Affine texture warping on/off or 0..1 strength. */
export function setPSXAffine(strength: number | boolean): void {
  psxUniforms.psxAffine.value = typeof strength === 'boolean' ? (strength ? 1 : 0) : clamp01(strength);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Shader patching
// ---------------------------------------------------------------------------

export interface PSXMaterialOptions {
  /** Compile vertex snapping into the shader (default true). Strength is runtime (`psxUniforms.psxSnap`). */
  snap?: boolean;
  /**
   * Compile affine texture mapping into the shader (default true). Strength is runtime
   * (`psxUniforms.psxAffine`). Turn off for huge un-subdivided floors/walls where the
   * warp becomes extreme.
   */
  affine?: boolean;
}

/** Bump when the injected GLSL changes so cached programs are not reused. */
const PSX_SHADER_VERSION = 1;

/** Maps whose sampling is made affine (same UV chain as the diffuse map in most assets). */
const AFFINE_MAPS: ReadonlyArray<{ define: string; uv: string; varying: string; chunk: string }> = [
  { define: 'USE_MAP', uv: 'vMapUv', varying: 'vPsxMapUv', chunk: 'map_fragment' },
  { define: 'USE_EMISSIVEMAP', uv: 'vEmissiveMapUv', varying: 'vPsxEmissiveMapUv', chunk: 'emissivemap_fragment' },
  { define: 'USE_ALPHAMAP', uv: 'vAlphaMapUv', varying: 'vPsxAlphaMapUv', chunk: 'alphamap_fragment' },
];

function affineVaryingDecls(): string {
  let s = '#ifdef PSX_AFFINE\nvarying float vPsxW;\n';
  for (const m of AFFINE_MAPS) s += `#ifdef ${m.define}\nvarying vec2 ${m.varying};\n#endif\n`;
  return s + '#endif\n';
}

const VERTEX_HEADER = /* glsl */ `
uniform vec2 psxResolution;
uniform float psxSnap;
${affineVaryingDecls()}
`;

function vertexBody(): string {
  let s = /* glsl */ `
#ifdef PSX_SNAP
	if ( psxSnap > 0.0 && gl_Position.w > 0.0 ) {
		vec2 psxHalfRes = psxResolution * 0.5;
		vec2 psxNdc = gl_Position.xy / gl_Position.w;
		vec2 psxSnapped = floor( psxNdc * psxHalfRes + 0.5 ) / psxHalfRes;
		gl_Position.xy = mix( psxNdc, psxSnapped, psxSnap ) * gl_Position.w;
	}
#endif
#ifdef PSX_AFFINE
	vPsxW = gl_Position.w;
`;
  for (const m of AFFINE_MAPS) s += `#ifdef ${m.define}\n\t${m.varying} = ${m.uv} * gl_Position.w;\n#endif\n`;
  return s + '#endif\n';
}

const VERTEX_BODY = vertexBody();

const FRAGMENT_HEADER = /* glsl */ `
#ifdef PSX_AFFINE
uniform float psxAffine;
#endif
${affineVaryingDecls()}
`;

function affineFragmentChunk(m: (typeof AFFINE_MAPS)[number]): string {
  const chunkSrc = (ShaderChunk as unknown as Record<string, string>)[m.chunk];
  const local = `psxUv_${m.uv}`;
  return (
    `#ifdef ${m.define}\n` +
    `\tvec2 ${local} = mix( ${m.uv}, ${m.varying} / vPsxW, psxAffine );\n` +
    `#endif\n` +
    chunkSrc.split(m.uv).join(local)
  );
}

function applyPSXShader(shader: WebGLProgramParametersWithUniforms, snap: boolean, affine: boolean): void {
  if (!shader.vertexShader.includes('#include <project_vertex>')) return; // not a chunk-based shader

  shader.uniforms.psxResolution = psxUniforms.psxResolution;
  shader.uniforms.psxSnap = psxUniforms.psxSnap;
  shader.uniforms.psxAffine = psxUniforms.psxAffine;

  const defines = (snap ? '#define PSX_SNAP\n' : '') + (affine ? '#define PSX_AFFINE\n' : '');

  shader.vertexShader =
    defines +
    VERTEX_HEADER +
    shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERTEX_BODY);

  let fs = shader.fragmentShader;
  if (affine) {
    for (const m of AFFINE_MAPS) {
      const inc = `#include <${m.chunk}>`;
      if (fs.includes(inc)) fs = fs.replace(inc, affineFragmentChunk(m));
    }
  }
  shader.fragmentShader = defines + FRAGMENT_HEADER + fs;
}

interface PatchState {
  snap: boolean;
  affine: boolean;
  prevCompile: Material['onBeforeCompile'];
  prevKey: Material['customProgramCacheKey'];
  ownCompile: boolean;
  ownKey: boolean;
}

const patchedMaterials = new WeakMap<Material, PatchState>();

/** True if `patchPSX` has been applied to this material instance. */
export function isPSXPatched(material: Material): boolean {
  return patchedMaterials.has(material);
}

/**
 * Patch a built-in mesh material (Standard/Physical/Lambert/Phong/Basic/Toon/Matcap...)
 * for PSX rendering. Idempotent: calling it again only updates the compile-time flags.
 * Chains any existing `onBeforeCompile` and keeps `customProgramCacheKey` distinct.
 */
export function patchPSX<T extends Material>(material: T, opts: PSXMaterialOptions = {}): T {
  const snap = opts.snap ?? true;
  const affine = opts.affine ?? true;

  const existing = patchedMaterials.get(material);
  if (existing) {
    if (existing.snap !== snap || existing.affine !== affine) {
      existing.snap = snap;
      existing.affine = affine;
      material.needsUpdate = true;
    }
    return material;
  }

  const proto = Material.prototype;
  const state: PatchState = {
    snap,
    affine,
    prevCompile: material.onBeforeCompile,
    prevKey: material.customProgramCacheKey,
    ownCompile: material.onBeforeCompile !== proto.onBeforeCompile,
    ownKey: material.customProgramCacheKey !== proto.customProgramCacheKey,
  };
  patchedMaterials.set(material, state);

  material.onBeforeCompile = function (this: Material, shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) {
    if (state.ownCompile) state.prevCompile.call(this, shader, renderer);
    applyPSXShader(shader, state.snap, state.affine);
  };

  material.customProgramCacheKey = function (this: Material) {
    const base = state.ownKey ? state.prevKey.call(this) : state.ownCompile ? state.prevCompile.toString() : '';
    return `${base}|psx${PSX_SHADER_VERSION}${state.snap ? 'S' : ''}${state.affine ? 'A' : ''}`;
  };

  material.needsUpdate = true;
  return material;
}

/** Remove the PSX patch and restore the previous callbacks. */
export function unpatchPSX(material: Material): void {
  const state = patchedMaterials.get(material);
  if (!state) return;
  patchedMaterials.delete(material);
  const proto = Material.prototype;
  material.onBeforeCompile = state.ownCompile ? state.prevCompile : proto.onBeforeCompile;
  material.customProgramCacheKey = state.ownKey ? state.prevKey : proto.customProgramCacheKey;
  material.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

export interface PSXTextureOptions {
  /**
   * true (default): generateMipmaps + NearestMipmapNearestFilter (blocky, but no
   * sparkle on distant floors). false: no mipmaps, pure NearestFilter (authentic PS1
   * shimmer).
   */
  mipmaps?: boolean;
  /** Downscale (by halving) until both sides are <= this. 0 = keep size (default). */
  maxTextureSize?: number;
  /** Quantise texels to N bits per channel (5 = PS1 15-bit VRAM). 0 = off (default). */
  textureColorBits?: number;
  /** Use box-filtered halving when downscaling instead of nearest (default false). */
  smoothDownscale?: boolean;
}

type DrawableImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

const processedTextures = new WeakMap<Texture, string>();
const processedSources = new WeakMap<object, string>();
/** Processed canvas per original image + settings: Textures that share one image share one downscale (no second canvas). */
const processedImages = new WeakMap<object, { image: DrawableImage; key: string }>();

function drawableSize(img: unknown): { w: number; h: number } | null {
  if (!img) return null;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return img.complete && img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  }
  if (
    (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
  ) {
    const d = img as { width: number; height: number };
    return d.width > 0 && d.height > 0 ? { w: d.width, h: d.height } : null;
  }
  return null; // video, data textures, etc.
}

function imageReady(tex: Texture): boolean {
  const img = tex.image as unknown;
  if (!img) return false;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return img.complete && img.naturalWidth > 0;
  if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) return false; // VideoTexture updates itself
  const d = img as { data?: unknown; width?: number };
  if ((tex as { isDataTexture?: boolean }).isDataTexture) return d.data != null;
  return true;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rescaleImage(tex: Texture, maxSize: number, colorBits: number, smooth: boolean): boolean {
  if (typeof document === 'undefined') return false;
  const size = drawableSize(tex.image);
  if (!size) return false;

  let tw = size.w;
  let th = size.h;
  if (maxSize > 0) {
    while (tw > maxSize || th > maxSize) {
      tw = Math.max(1, tw >> 1);
      th = Math.max(1, th >> 1);
    }
  }
  const quantise = colorBits > 0 && colorBits < 8;
  if (tw === size.w && th === size.h && !quantise) return false;

  let src: DrawableImage = tex.image as DrawableImage;
  let sw = size.w;
  let sh = size.h;
  // Progressive halving for smooth mode (single-step bilinear would alias anyway).
  if (smooth) {
    while (sw >> 1 >= tw && sh >> 1 >= th && (sw > tw || sh > th)) {
      const nw = Math.max(tw, sw >> 1);
      const nh = Math.max(th, sh >> 1);
      const step = makeCanvas(nw, nh);
      const sctx = step.getContext('2d');
      if (!sctx) return false;
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(src as CanvasImageSource, 0, 0, sw, sh, 0, 0, nw, nh);
      src = step;
      sw = nw;
      sh = nh;
    }
  }

  const canvas = makeCanvas(tw, th);
  const ctx = canvas.getContext('2d', { willReadFrequently: quantise });
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(src as CanvasImageSource, 0, 0, sw, sh, 0, 0, tw, th);

  if (quantise) {
    try {
      const data = ctx.getImageData(0, 0, tw, th);
      const px = data.data;
      const levels = (1 << colorBits) - 1;
      for (let i = 0; i < px.length; i += 4) {
        px[i] = Math.round((Math.round((px[i] / 255) * levels) / levels) * 255);
        px[i + 1] = Math.round((Math.round((px[i + 1] / 255) * levels) / levels) * 255);
        px[i + 2] = Math.round((Math.round((px[i + 2] / 255) * levels) / levels) * 255);
      }
      ctx.putImageData(data, 0, 0);
    } catch {
      // tainted canvas (cross-origin image): keep the downscaled, unquantised version
    }
  }

  tex.image = canvas;
  return true;
}

/**
 * Make a texture PSX-like: nearest magnification, optional mipmaps (nearest), anisotropy 1,
 * optional downscale + colour quantisation. Call after the image has loaded
 * (GLTFLoader resolves after its textures are loaded). Shared images are processed once.
 */
export function applyPSXTexture(tex: Texture, opts: PSXTextureOptions = {}): void {
  if ((tex as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) return;
  if ((tex as { isCubeTexture?: boolean }).isCubeTexture) return;

  const mipmaps = opts.mipmaps ?? true;
  const maxSize = opts.maxTextureSize ?? 0;
  const colorBits = opts.textureColorBits ?? 0;
  const smooth = opts.smoothDownscale ?? false;
  const key = `${mipmaps ? 1 : 0}|${maxSize}|${colorBits}|${smooth ? 1 : 0}`;
  if (processedTextures.get(tex) === key) return;
  processedTextures.set(tex, key);

  const isCompressed = (tex as { isCompressedTexture?: boolean }).isCompressedTexture === true;
  const isData = (tex as { isDataTexture?: boolean }).isDataTexture === true;

  if (!isCompressed && !isData && (maxSize > 0 || colorBits > 0) && processedSources.get(tex.source) !== key) {
    const origin = tex.image as object | null;
    const hit = origin ? processedImages.get(origin) : undefined;
    if (hit && hit.key === key) {
      tex.image = hit.image;
      processedSources.set(tex.source, key);
    } else if (rescaleImage(tex, maxSize, colorBits, smooth)) {
      processedSources.set(tex.source, key);
      if (origin) processedImages.set(origin, { image: tex.image as DrawableImage, key });
    }
  }

  tex.magFilter = NearestFilter;
  tex.anisotropy = 1;
  if (isCompressed) {
    const hasMips = Array.isArray(tex.mipmaps) && tex.mipmaps.length > 1;
    tex.minFilter = mipmaps && hasMips ? NearestMipmapNearestFilter : NearestFilter;
  } else {
    tex.generateMipmaps = mipmaps;
    tex.minFilter = mipmaps ? NearestMipmapNearestFilter : NearestFilter;
  }

  if (imageReady(tex)) tex.needsUpdate = true;
}

/** Material keys never touched by the texture pass. */
const SKIP_TEXTURE_KEYS = new Set(['envMap']);

/** Calls `cb` for every texture slot of a material (map, emissiveMap, normalMap, ...). */
export function forEachMaterialTexture(material: Material, cb: (tex: Texture, key: string) => void): void {
  const rec = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (SKIP_TEXTURE_KEYS.has(key)) continue;
    const v = rec[key] as { isTexture?: boolean } | null | undefined;
    if (v && v.isTexture === true) cb(v as unknown as Texture, key);
  }
}

// ---------------------------------------------------------------------------
// Object walker
// ---------------------------------------------------------------------------

export interface PSXObjectOptions extends PSXMaterialOptions, PSXTextureOptions {
  /** Process material textures too (default true). */
  textures?: boolean;
  /**
   * Per-material decision: return false to skip, true for defaults, or an options
   * object to override snap/affine for this material.
   */
  filter?: (material: Material, object: Object3D) => boolean | PSXMaterialOptions;
}

/** Walk an Object3D tree and PSX-patch every material (and its textures). */
export function patchObjectPSX(root: Object3D, opts: PSXObjectOptions = {}): void {
  root.traverse((obj) => {
    const m = (obj as { material?: Material | Material[] }).material;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    for (const mat of list) {
      if (!mat || (mat as { isMaterial?: boolean }).isMaterial !== true) continue;
      let mopts: PSXMaterialOptions = opts;
      if (opts.filter) {
        const r = opts.filter(mat, obj);
        if (r === false) continue;
        if (typeof r === 'object') mopts = { ...opts, ...r };
      }
      patchPSX(mat, mopts);
      if (opts.textures !== false) forEachMaterialTexture(mat, (t) => applyPSXTexture(t, opts));
    }
  });
}
