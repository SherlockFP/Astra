/**
 * PSX full-screen pass for three.js r186.
 *
 * Three ways to use it:
 *
 * 1. Standalone (fastest, recommended for the game):
 *      const psx = new PSXPostPass({ pixelScale: 3 });
 *      psx.renderStandalone(renderer, scene, camera);   // every frame
 *    The scene is rendered into an internal low-res, nearest-filtered target and then
 *    upsampled with integer-sized blocks + tone mapping + sRGB + 5-bit colour + Bayer dither.
 *
 * 2. EffectComposer, low-res chain (bloom-friendly):
 *      composer.addPass(new RenderPass(scene, camera));
 *      composer.addPass(new UnrealBloomPass(...));
 *      const psx = new PSXPostPass({ pixelScale: 3 });
 *      composer.addPass(psx);              // replaces OutputPass
 *      psx.bindComposer(composer, renderer); // whole chain renders at 1/pixelScale
 *
 * 3. EffectComposer, full-res chain: same as 2 without bindComposer(); the pass then
 *    point-samples the full-res input on the virtual pixel grid (same look, more cost).
 *
 * If `scene` and `camera` are given in the constructor, the pass renders the scene
 * itself (mode 1 inside a composer; it must then be the first pass).
 */
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  Color,
  ColorManagement,
  CustomToneMapping,
  DepthTexture,
  GLSL3,
  HalfFloatType,
  LinearToneMapping,
  NearestFilter,
  NeutralToneMapping,
  NoBlending,
  RawShaderMaterial,
  ReinhardToneMapping,
  SRGBTransfer,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type ColorRepresentation,
  type IUniform,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { setPSXSnapResolution } from './PSXMaterial';

export interface PSXPostOptions {
  /** CSS pixels per virtual pixel, 1..8 (default 3). Rounded to whole device pixels. */
  pixelScale?: number;
  /** Bits per colour channel after tone mapping (default 5 = PS1 15-bit). 0 = off. */
  colorBits?: number;
  /** Ordered 4x4 Bayer dither strength 0..1 (default 1). */
  dither?: number;
  /** CRT scanline darkening 0..1 (default 0). */
  scanlines?: number;
  /** Vignette strength 0..1 (default 0.2). */
  vignette?: number;
  /** Depth-based fog tint colour (linear working space via THREE.Color). */
  fogColor?: ColorRepresentation;
  /** Fog tint strength 0..1 (default 0 = off). Needs depth (standalone mode or `depthTexture`). */
  fogStrength?: number;
  /** Fog tint start distance in world units (default 10). */
  fogNear?: number;
  /** Fog tint full distance in world units (default 40). */
  fogFar?: number;
  /** Fog amount applied to the background (depth == 1), 0..1 (default 1). */
  fogSky?: number;
  /** Scene to render (self-render mode). */
  scene?: Object3D | null;
  /** Camera to render with (self-render mode) / to read near+far for the fog tint. */
  camera?: Camera | null;
  /** Depth texture for fog tint in composer mode (e.g. a RenderPass target with a DepthTexture). */
  depthTexture?: DepthTexture | null;
  /** Apply renderer tone mapping + output colour space (default true). Set false if an OutputPass already ran. */
  outputTransform?: boolean;
  /** Keep `psxUniforms.psxResolution` in sync with the virtual pixel grid (default true). */
  syncSnapResolution?: boolean;
  /** Snap grid = virtual grid / snapDivisor (default 1). 2 = jitter twice as coarse as the pixels. */
  snapDivisor?: number;
  /** Data type of the internal low-res target (default HalfFloatType, keeps HDR for tone mapping). */
  targetType?: TextureDataType;
}

const PSXPostShader = {
  vertexShader: /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,

  fragmentShader: /* glsl */ `
precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uInputSize;   // input texture size in texels
uniform vec2 uGrid;        // virtual pixel grid
uniform vec2 uBlock;       // output pixels per virtual pixel
uniform vec2 uOrigin;      // viewport origin in output pixels
uniform float uColorLevels;
uniform float uDither;
uniform float uScanlines;
uniform float uVignette;
uniform vec3 uFogColor;
uniform float uFogStrength;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogSky;
uniform float uHasDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uOrtho;

in vec2 vUv;
out vec4 fragColor;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float psxBayer4( vec2 cell ) {
	int x = int( mod( cell.x, 4.0 ) );
	int y = int( mod( cell.y, 4.0 ) );
	const float M[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
	return ( M[ x + y * 4 ] + 0.5 ) / 16.0;
}

float psxViewDistance( float d ) {
	if ( uOrtho > 0.5 ) return uCameraNear + d * ( uCameraFar - uCameraNear );
	return ( uCameraNear * uCameraFar ) / ( uCameraFar - ( uCameraFar - uCameraNear ) * d );
}

void main() {
	vec2 frag = gl_FragCoord.xy - uOrigin;
	vec2 cell = floor( frag / uBlock );
	vec2 uv = ( cell + 0.5 ) / uGrid;
	uv = ( floor( uv * uInputSize ) + 0.5 ) / uInputSize; // exact texel centre -> nearest

	vec4 color = texture( tDiffuse, uv );

	if ( uHasDepth > 0.5 && uFogStrength > 0.0 ) {
		float d = texture( tDepth, uv ).x;
		float f = d >= 0.999999 ? uFogSky : smoothstep( uFogNear, uFogFar, psxViewDistance( d ) );
		color.rgb = mix( color.rgb, uFogColor, clamp( f * uFogStrength, 0.0, 1.0 ) );
	}

	#ifdef LINEAR_TONE_MAPPING
		color.rgb = LinearToneMapping( color.rgb );
	#elif defined( REINHARD_TONE_MAPPING )
		color.rgb = ReinhardToneMapping( color.rgb );
	#elif defined( CINEON_TONE_MAPPING )
		color.rgb = CineonToneMapping( color.rgb );
	#elif defined( ACES_FILMIC_TONE_MAPPING )
		color.rgb = ACESFilmicToneMapping( color.rgb );
	#elif defined( AGX_TONE_MAPPING )
		color.rgb = AgXToneMapping( color.rgb );
	#elif defined( NEUTRAL_TONE_MAPPING )
		color.rgb = NeutralToneMapping( color.rgb );
	#elif defined( CUSTOM_TONE_MAPPING )
		color.rgb = CustomToneMapping( color.rgb );
	#endif

	#ifdef SRGB_TRANSFER
		color = sRGBTransferOETF( color );
	#endif

	if ( uVignette > 0.0 ) {
		vec2 q = vUv - 0.5;
		color.rgb *= 1.0 - uVignette * smoothstep( 0.35, 1.0, length( q ) * 1.41421356 );
	}

	if ( uColorLevels > 0.0 ) {
		float threshold = mix( 0.5, psxBayer4( cell ), uDither );
		color.rgb = clamp( floor( color.rgb * uColorLevels + threshold ) / uColorLevels, 0.0, 1.0 );
	}

	if ( uScanlines > 0.0 ) {
		float line = uBlock.y >= 2.0 ? sin( fract( frag.y / uBlock.y ) * 3.14159265 ) : mod( cell.y, 2.0 );
		color.rgb *= 1.0 - uScanlines * ( 1.0 - line ) * 0.6;
	}

	fragColor = color;
}`,
};

type PSXPostUniforms = {
  tDiffuse: IUniform<Texture | null>;
  tDepth: IUniform<Texture | null>;
  toneMappingExposure: IUniform<number>;
  uInputSize: IUniform<Vector2>;
  uGrid: IUniform<Vector2>;
  uBlock: IUniform<Vector2>;
  uOrigin: IUniform<Vector2>;
  uColorLevels: IUniform<number>;
  uDither: IUniform<number>;
  uScanlines: IUniform<number>;
  uVignette: IUniform<number>;
  uFogColor: IUniform<Color>;
  uFogStrength: IUniform<number>;
  uFogNear: IUniform<number>;
  uFogFar: IUniform<number>;
  uFogSky: IUniform<number>;
  uHasDepth: IUniform<number>;
  uCameraNear: IUniform<number>;
  uCameraFar: IUniform<number>;
  uOrtho: IUniform<number>;
};

type BlitMode = 'self' | 'bound' | 'pixelate';

const _vp = new Vector4();
const _rect = { x: 0, y: 0, w: 1, h: 1 };

export class PSXPostPass extends Pass {
  /** Bits per channel (0 = off). */
  colorBits: number;
  /** Bayer dither strength 0..1. */
  dither: number;
  /** Scanline strength 0..1. */
  scanlines: number;
  /** Vignette strength 0..1. */
  vignette: number;
  /** Fog tint colour (linear). */
  readonly fogColor: Color;
  fogStrength: number;
  fogNear: number;
  fogFar: number;
  fogSky: number;
  /** Self-render scene (null = composer input mode). */
  scene: Object3D | null;
  /** Self-render camera / fog near-far source. */
  camera: Camera | null;
  /** Optional depth for fog tint in composer mode. */
  depthTexture: DepthTexture | null;
  outputTransform: boolean;
  syncSnapResolution: boolean;
  snapDivisor: number;

  readonly uniforms: PSXPostUniforms;
  readonly material: RawShaderMaterial;

  private _pixelScale = 3;
  private readonly _quad: FullScreenQuad;
  private _target: WebGLRenderTarget | null = null;
  private readonly _targetType: TextureDataType;
  private _composer: EffectComposer | null = null;
  private _composerRenderer: WebGLRenderer | null = null;
  private _definesKey = '';
  private readonly _lastGrid = new Vector2(1, 1);

  constructor(opts: PSXPostOptions = {}) {
    super();
    this.pixelScale = opts.pixelScale ?? 3;
    this.colorBits = opts.colorBits ?? 5;
    this.dither = opts.dither ?? 1;
    this.scanlines = opts.scanlines ?? 0;
    this.vignette = opts.vignette ?? 0.2;
    this.fogColor = new Color(opts.fogColor ?? 0x000000);
    this.fogStrength = opts.fogStrength ?? 0;
    this.fogNear = opts.fogNear ?? 10;
    this.fogFar = opts.fogFar ?? 40;
    this.fogSky = opts.fogSky ?? 1;
    this.scene = opts.scene ?? null;
    this.camera = opts.camera ?? null;
    this.depthTexture = opts.depthTexture ?? null;
    this.outputTransform = opts.outputTransform ?? true;
    this.syncSnapResolution = opts.syncSnapResolution ?? true;
    this.snapDivisor = opts.snapDivisor ?? 1;
    this._targetType = opts.targetType ?? HalfFloatType;

    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      toneMappingExposure: { value: 1 },
      uInputSize: { value: new Vector2(1, 1) },
      uGrid: { value: new Vector2(1, 1) },
      uBlock: { value: new Vector2(1, 1) },
      uOrigin: { value: new Vector2(0, 0) },
      uColorLevels: { value: 31 },
      uDither: { value: 1 },
      uScanlines: { value: 0 },
      uVignette: { value: 0 },
      uFogColor: { value: this.fogColor },
      uFogStrength: { value: 0 },
      uFogNear: { value: 10 },
      uFogFar: { value: 40 },
      uFogSky: { value: 1 },
      uHasDepth: { value: 0 },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
      uOrtho: { value: 0 },
    };

    this.material = new RawShaderMaterial({
      name: 'PSXPostShader',
      glslVersion: GLSL3,
      uniforms: this.uniforms,
      vertexShader: PSXPostShader.vertexShader,
      fragmentShader: PSXPostShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });

    this._quad = new FullScreenQuad(this.material);
  }

  /** CSS pixels per virtual pixel (integer >= 1). Re-applies the composer ratio when bound. */
  get pixelScale(): number {
    return this._pixelScale;
  }

  set pixelScale(v: number) {
    const s = Math.max(1, Math.min(16, Math.round(v)));
    if (s === this._pixelScale) return;
    this._pixelScale = s;
    this._applyComposerRatio();
  }

  /** Device pixels per virtual pixel for a renderer (pixelScale * devicePixelRatio, rounded). */
  getBlockSize(renderer: WebGLRenderer): number {
    return Math.max(1, Math.round(this._pixelScale * renderer.getPixelRatio()));
  }

  /** Virtual pixel grid used by the last rendered frame. */
  getGridSize(out = new Vector2()): Vector2 {
    return out.copy(this._lastGrid);
  }

  /** The internal low-res target (self-render mode), created on first use. */
  get lowResTarget(): WebGLRenderTarget | null {
    return this._target;
  }

  /**
   * Make the whole EffectComposer chain render at 1/pixelScale resolution (so bloom etc.
   * run cheaply at low res). Call after adding passes; the pass then nearest-upsamples.
   */
  bindComposer(composer: EffectComposer, renderer: WebGLRenderer): void {
    this._composer = composer;
    this._composerRenderer = renderer;
    this._applyComposerRatio();
  }

  /** Undo bindComposer (composer back to the renderer's pixel ratio). */
  unbindComposer(): void {
    if (this._composer && this._composerRenderer) this._composer.setPixelRatio(this._composerRenderer.getPixelRatio());
    this._composer = null;
    this._composerRenderer = null;
  }

  private _applyComposerRatio(): void {
    if (!this._composer || !this._composerRenderer) return;
    const r = this._composerRenderer;
    this._composer.setPixelRatio(r.getPixelRatio() / this.getBlockSize(r));
  }

  /** Composer entry point. */
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const dest = this.renderToScreen ? null : writeBuffer;
    if (this.scene && this.camera) {
      this._renderSelf(renderer, this.scene, this.camera, dest);
      return;
    }
    const mode: BlitMode = this._composer ? 'bound' : 'pixelate';
    this._blit(renderer, readBuffer.texture, readBuffer.width, readBuffer.height, this.depthTexture, this.camera, dest, mode);
  }

  /**
   * Standalone: render `scene` at low resolution and present it with the PSX look to the
   * screen (target null) or to `target`.
   */
  renderStandalone(renderer: WebGLRenderer, scene: Object3D, camera: Camera, target: WebGLRenderTarget | null = null): void {
    this._renderSelf(renderer, scene, camera, target);
  }

  private _outputRect(renderer: WebGLRenderer, dest: WebGLRenderTarget | null): typeof _rect {
    if (dest === null) {
      renderer.getViewport(_vp).multiplyScalar(renderer.getPixelRatio()).floor();
    } else {
      _vp.copy(dest.viewport);
    }
    _rect.x = _vp.x;
    _rect.y = _vp.y;
    _rect.w = Math.max(1, _vp.z);
    _rect.h = Math.max(1, _vp.w);
    return _rect;
  }

  private _syncSnap(gridW: number, gridH: number): void {
    if (!this.syncSnapResolution) return;
    const d = Math.max(0.25, this.snapDivisor);
    setPSXSnapResolution(gridW / d, gridH / d);
  }

  private _renderSelf(renderer: WebGLRenderer, scene: Object3D, camera: Camera, dest: WebGLRenderTarget | null): void {
    const rect = this._outputRect(renderer, dest);
    const block = this.getBlockSize(renderer);
    const tw = Math.max(1, Math.ceil(rect.w / block));
    const th = Math.max(1, Math.ceil(rect.h / block));

    if (!this._target) {
      this._target = new WebGLRenderTarget(tw, th, {
        type: this._targetType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        generateMipmaps: false,
        depthBuffer: true,
        stencilBuffer: false,
        samples: 0,
      });
      this._target.texture.name = 'PSXPostPass.lowRes';
      this._target.depthTexture = new DepthTexture(tw, th);
    } else if (this._target.width !== tw || this._target.height !== th) {
      this._target.setSize(tw, th);
    }

    this._syncSnap(tw, th);

    renderer.setRenderTarget(this._target);
    if (!renderer.autoClear) renderer.clear();
    renderer.render(scene, camera);

    this._blit(renderer, this._target.texture, tw, th, this._target.depthTexture, camera, dest, 'self');
  }

  private _updateDefines(renderer: WebGLRenderer): void {
    const key = this.outputTransform ? `${renderer.outputColorSpace}|${renderer.toneMapping}` : 'none';
    if (key === this._definesKey) return;
    this._definesKey = key;
    const defines: Record<string, string> = {};
    if (this.outputTransform) {
      if (ColorManagement.getTransfer(renderer.outputColorSpace) === SRGBTransfer) defines.SRGB_TRANSFER = '';
      const tm = renderer.toneMapping;
      if (tm === LinearToneMapping) defines.LINEAR_TONE_MAPPING = '';
      else if (tm === ReinhardToneMapping) defines.REINHARD_TONE_MAPPING = '';
      else if (tm === CineonToneMapping) defines.CINEON_TONE_MAPPING = '';
      else if (tm === ACESFilmicToneMapping) defines.ACES_FILMIC_TONE_MAPPING = '';
      else if (tm === AgXToneMapping) defines.AGX_TONE_MAPPING = '';
      else if (tm === NeutralToneMapping) defines.NEUTRAL_TONE_MAPPING = '';
      else if (tm === CustomToneMapping) defines.CUSTOM_TONE_MAPPING = '';
    }
    this.material.defines = defines;
    this.material.needsUpdate = true;
  }

  private _blit(
    renderer: WebGLRenderer,
    input: Texture,
    inW: number,
    inH: number,
    depth: Texture | null,
    camera: Camera | null,
    dest: WebGLRenderTarget | null,
    mode: BlitMode,
  ): void {
    this._updateDefines(renderer);
    const u = this.uniforms;
    const rect = this._outputRect(renderer, dest);
    const block = this.getBlockSize(renderer);
    const iw = Math.max(1, Math.floor(inW));
    const ih = Math.max(1, Math.floor(inH));

    u.uInputSize.value.set(iw, ih);
    u.uOrigin.value.set(rect.x, rect.y);
    if (mode === 'self') {
      u.uGrid.value.set(iw, ih);
      u.uBlock.value.set(block, block);
    } else if (mode === 'bound') {
      u.uGrid.value.set(iw, ih);
      u.uBlock.value.set(rect.w / iw, rect.h / ih);
      this._syncSnap(iw, ih);
    } else {
      u.uGrid.value.set(rect.w / block, rect.h / block);
      u.uBlock.value.set(block, block);
      this._syncSnap(rect.w / block, rect.h / block);
    }
    this._lastGrid.copy(u.uGrid.value);

    u.tDiffuse.value = input;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    const bits = Math.round(this.colorBits);
    u.uColorLevels.value = bits > 0 && bits < 16 ? Math.pow(2, bits) - 1 : 0;
    u.uDither.value = this.dither;
    u.uScanlines.value = this.scanlines;
    u.uVignette.value = this.vignette;

    u.tDepth.value = depth;
    u.uHasDepth.value = depth && camera ? 1 : 0;
    u.uFogStrength.value = this.fogStrength;
    u.uFogNear.value = this.fogNear;
    u.uFogFar.value = Math.max(this.fogNear + 1e-3, this.fogFar);
    u.uFogSky.value = this.fogSky;
    if (camera) {
      const c = camera as PerspectiveCamera | OrthographicCamera;
      u.uCameraNear.value = c.near ?? 0.1;
      u.uCameraFar.value = c.far ?? 1000;
      u.uOrtho.value = (camera as OrthographicCamera).isOrthographicCamera ? 1 : 0;
    }

    renderer.setRenderTarget(dest);
    if (dest !== null && this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    this._quad.render(renderer);
  }

  setSize(_width: number, _height: number): void {
    // Sizes are read from the renderer / buffers at render time.
  }

  dispose(): void {
    this.material.dispose();
    this._quad.dispose();
    if (this._target) {
      this._target.depthTexture?.dispose();
      this._target.dispose();
      this._target = null;
    }
  }
}
