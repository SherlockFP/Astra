import * as THREE from 'three';
import { G } from './G';
import { DEFAULT_SETTINGS } from '../core/Settings';
import { PSXPostPass, patchObjectPSX, setPSXAffine, setPSXJitter } from '../render/psx';
import { requestShadowMapUpdate, scheduleShadowMap } from '../render/shadowPolicy';

let psxPass: PSXPostPass | null = null;

/** Bloom luminance threshold used for scenes that set no override (UnrealBloomPass default in core/Engine). */
let baseBloomThreshold: number | null = null;
/** Scene-level bloom override (dungeon builders): strength is a theme value, scaled by the player's bloom setting. */
let sceneBloom: { strength: number; threshold: number } | null = null;

/**
 * Per-scene bloom. Dungeons pass their theme strength (~0.3-0.45) with a higher threshold so only real emissives
 * (torch flames, magic cores) bloom and enemies keep their colours. `null` restores the player's settings.
 * The player's bloom slider scales the scene value (the default slider position leaves it unchanged).
 */
export function setSceneBloom(strength: number | null, threshold = 0.92): void {
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

/** Patch a procedurally created object for the PSX look (world builders, generated meshes). */
export function psxify(root: THREE.Object3D, kind: 'character' | 'world' | 'prop' = 'prop'): void {
  if (kind === 'character') patchObjectPSX(root, { maxTextureSize: 128, textureColorBits: 5, mipmaps: false });
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

  applyRender();
  applyPSX();
  G.settings.onChange((key) => {
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
