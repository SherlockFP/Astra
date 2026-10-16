import * as THREE from 'three';
import { G } from './G';
import { DEFAULT_SETTINGS } from '../core/Settings';
import { PSXPostPass, patchObjectPSX, setPSXAffine, setPSXJitter } from '../render/psx';
import { requestShadowMapUpdate, scheduleShadowMap } from '../render/shadowPolicy';
import { setGfxQuality } from '../world/WorldPerf';
import { BLOOM_THRESHOLD } from '../core/Engine';

let psxPass: PSXPostPass | null = null;

/** Bloom luminance threshold used for scenes that set no override (BLOOM_THRESHOLD in core/Engine). */
let baseBloomThreshold: number | null = null;
/** Scene-level bloom override (dungeon builders): strength is a theme value, scaled by the player's bloom setting. */
let sceneBloom: { strength: number; threshold: number } | null = null;

/**
 * Per-scene bloom. Dungeons pass their theme strength (~0.3-0.45); the threshold stays at 1.0 HDR so only real emissives
 * (torch flames, magic cores, spell cores) bloom and lit enemies keep their colours. `null` restores the player's settings.
 * The player's bloom slider scales the scene value (the default slider position leaves it unchanged).
 */
export function setSceneBloom(strength: number | null, threshold = BLOOM_THRESHOLD): void {
  sceneBloom = strength === null ? null : { strength, threshold };
  try { applyBloom(); } catch { /* engine not ready (harness) */ }
}

function applyBloom(): void {
  const s = G.settings.data;
  const pass = G.engine.bloomPass;
  if (baseBloomThreshold === null) baseBloomThreshold = pass.threshold;
  if (sceneBloom) {
    pass.threshold = sceneBloom.threshold;
    G.engine.setBloom(s.bloom, sceneBloom.strength * (s.bloomStrength / DEFAULT_SETTINGS.bloomStrength));
  } else {
    pass.threshold = baseBloomThreshold;
    G.engine.setBloom(s.bloom, s.bloomStrength);
  }
}

/** Rim light colour: a warm white, so the edge reads as sunlight and not as a glow. */
const RIM_COLOR = new THREE.Color(0xfff2d8);
const RIM_CHUNK = /* glsl */ `{
  float rimF = 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) );
  outgoingLight += uRimColor * ( pow( rimF, 3.0 ) * uRimStrength );
}
`;
const rimPatched = new WeakSet<THREE.Material>();

/**
 * Character and enemy rim light: a fresnel edge added after the lighting (sunlight colour, 0.35), so the silhouette reads on any
 * biome background. Patches the standard materials of a skinned model in place, chaining onBeforeCompile the way patchPSX does.
 * Runs before psxify (the PSX patch chains this one). Material clones (Assets.cloneMaterials) do not keep it.
 */
function addCharacterRim(root: THREE.Object3D, strength = 0.35): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial !== true || rimPatched.has(mat)) continue;
      rimPatched.add(mat);
      const prevCompile = mat.onBeforeCompile;
      const prevKey = mat.customProgramCacheKey;
      mat.onBeforeCompile = function (this: THREE.Material, shader, renderer) {
        prevCompile.call(this, shader, renderer);
        shader.uniforms.uRimColor = { value: RIM_COLOR };
        shader.uniforms.uRimStrength = { value: strength };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
          .replace('#include <opaque_fragment>', RIM_CHUNK + '#include <opaque_fragment>');
      };
      mat.customProgramCacheKey = function (this: THREE.Material) { return prevKey.call(this) + '|rim1'; };
      mat.needsUpdate = true;
    }
  });
}

/** Patch a procedurally created object for the PSX look (world builders, generated meshes). */
export function psxify(root: THREE.Object3D, kind: 'character' | 'world' | 'prop' = 'prop'): void {
  // WoW clarity: the 128 px / 5-bit character texture crush only applies with the PSX filter on (read at model load, so a change needs a reload).
  if (kind === 'character') {
    const psxOn = !!G.settings?.data.psx;
    patchObjectPSX(root, psxOn ? { maxTextureSize: 128, textureColorBits: 5, mipmaps: false } : { maxTextureSize: 512, mipmaps: true });
  }
  else if (kind === 'world') patchObjectPSX(root, { mipmaps: true, maxTextureSize: 512 });
  else patchObjectPSX(root, { mipmaps: true, maxTextureSize: 256 });
}

/**
 * Canvas pixel ratio. With the PSX pass on, the composer already renders on a virtual grid and the pass upscales it in whole
 * blocks, so device pixels above 1x only enlarge the final blit and add no detail: the ratio is capped at 1.
 */
function pixelRatioFor(s: { psx: boolean; renderScale: number }): number {
  return Math.min(window.devicePixelRatio, s.renderScale, s.psx ? 1 : 2);
}

/**
 * Applies graphics settings (PSX post pass + material patching, bloom, shadows, render scale, fov)
 * and re-applies only what changed on settings updates. Installs Assets.onModelLoaded so every loaded
 * GLB gets PSX materials/textures (skinned models = character preset, everything else = world preset).
 */
export function installGraphics(): void {
  G.assets.onModelLoaded = (asset) => {
    if (asset.skinned) addCharacterRim(asset.scene);
    psxify(asset.scene, asset.skinned ? 'character' : 'world');
  };

  const applyPSX = () => {
    const s = G.settings.data;
    setPSXJitter(s.psx ? s.psxJitter : 0);
    setPSXAffine(s.psx && s.psxAffine ? 1 : 0);
    if (s.psx) {
      if (!psxPass) {
        psxPass = new PSXPostPass({ pixelScale: s.psxPixelScale, colorBits: s.psxColorDepth, dither: s.psxDither ? 1 : 0, vignette: 0.25 });
        G.engine.setPSXPass(psxPass);
      }
      psxPass.pixelScale = s.psxPixelScale;
      psxPass.colorBits = s.psxColorDepth;
      psxPass.dither = s.psxDither ? 1 : 0;
      G.engine.resize(true);
    } else if (psxPass) {
      G.engine.setPSXPass(null);
      psxPass.dispose();
      psxPass = null;
    }
    G.engine.setPixelRatio(pixelRatioFor(s)); // the cap depends on psx, so it follows the toggle
  };

  const applyRender = () => {
    const s = G.settings.data;
    applyBloom();
    G.engine.renderer.shadowMap.enabled = s.shadows;
    requestShadowMapUpdate();
    G.engine.setPixelRatio(pixelRatioFor(s));
  };

  // Shadows: the map is drawn on a cadence (and at once after a change), not on every render call. See render/shadowPolicy.
  G.engine.renderer.shadowMap.autoUpdate = false;
  G.engine.onUpdate((_dt, t) => scheduleShadowMap(G.engine.renderer.shadowMap, t), 90, 'shadows');
  G.events.on('scene:changed', () => requestShadowMapUpdate());

  setGfxQuality(G.settings.data.graphicsQuality);
  applyRender();
  applyPSX();
  G.settings.onChange((key) => {
    if (key === 'graphicsQuality' || key === 'psx') setGfxQuality(G.settings.data.graphicsQuality); // 'psx' is also what Settings.reset() notifies
    if (String(key).startsWith('psx')) applyPSX();
    else if (key === 'bloom' || key === 'bloomStrength' || key === 'shadows' || key === 'renderScale') applyRender();
    else if (key === 'fov') {
      const cam = G.engine.activeCamera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        cam.fov = G.settings.data.fov;
        cam.updateProjectionMatrix();
      }
    }
  });
}

export function getPSXPass(): PSXPostPass | null {
  return psxPass;
}
