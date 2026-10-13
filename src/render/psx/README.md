# PSX render module (`src/render/psx`)

PS1-era look for three.js r186 / WebGLRenderer: vertex snapping, affine texture warping,
low-res nearest upsampling, 15-bit colour + 4x4 Bayer dither, optional scanlines/vignette/fog tint.

```ts
import { PSXPostPass, patchObjectPSX, psxUniforms, setPSXJitter, setPSXAffine } from './render/psx';
```

Demo: `npx vite` then open `/psx-demo.html`. Keys: `1-6` pixel scale, `J` jitter, `A` affine,
`D` dither, `B` bloom (EffectComposer path), `S` scanlines, `V` vignette, `F` fog tint,
`C` colour bits, `P` PSX on/off, `N` next animation. URL params: `?model=/path.glb&anim=Idle`.

## 1. Materials: `PSXMaterial.ts`

```ts
patchObjectPSX(gltf.scene, { maxTextureSize: 128, textureColorBits: 5, mipmaps: false }); // characters
patchObjectPSX(dungeon, { mipmaps: true });                                               // world
patchObjectPSX(bigFloor, { affine: false });                                              // huge quads
```

- `patchPSX(material, { snap = true, affine = true })` patches one material through
  `onBeforeCompile` (it calls any existing callback first) and appends `|psx1SA` to
  `customProgramCacheKey`. Calling it again is safe: it only updates the flags. `unpatchPSX(material)` restores the material.
- Works with MeshStandard/Physical/Lambert/Phong/Basic/Toon/Matcap materials, and with any material
  whose vertex shader contains `#include <project_vertex>`. The snap code runs after that chunk, so
  skinned, morph, instanced and batched meshes work as before.
- Affine mapping covers `map`, `emissiveMap` and `alphaMap`. Normal and roughness maps stay perspective-correct.
- `patchObjectPSX(root, opts)` walks the tree and patches every material and texture.
  `filter(material, object)` can skip a material or override its options.
- `applyPSXTexture(tex, opts)` sets NearestFilter for magnification and anisotropy to 1.
  - `mipmaps` (default `true`) uses `NearestMipmapNearestFilter` with mipmap generation.
  - `maxTextureSize` downscales by halving until the texture fits.
  - `textureColorBits` quantises colours on a 2D canvas.
  - Call it after the images load. `GLTFLoader.loadAsync` resolves after its textures load. Each shared image is processed once.

Runtime knobs (no recompile, safe to change every frame from the settings menu):

| uniform | meaning | default |
|---|---|---|
| `psxUniforms.psxSnap.value` | jitter strength 0..1 (`setPSXJitter(bool \| n)`) | 1 |
| `psxUniforms.psxAffine.value` | affine strength 0..1 (`setPSXAffine(bool \| n)`) | 1 |
| `psxUniforms.psxResolution.value` | snap grid (virtual px) | 320x240; `PSXPostPass` keeps it equal to the low-res grid |

## 2. Post: `PSXPostPass.ts` (a `Pass` subclass)

The pass also does tone mapping and output colour-space conversion, so use it **instead of `OutputPass`**.
It takes `renderer.toneMapping`, `toneMappingExposure` and `outputColorSpace` from the renderer.
After it, the image is sRGB.

**A. Standalone (recommended for the game, the cheapest option):**
```ts
const psx = new PSXPostPass({ pixelScale: 3 });
function frame() { psx.renderStandalone(renderer, scene, camera); }
```
The scene renders into a low-res HalfFloat target with nearest filtering and a depth texture.
The pass then upsamples it to the canvas in integer pixel blocks.

**B. EffectComposer with bloom, low-res chain:**
```ts
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new Vector2(w, h), 0.9, 0.5, 0.9));
const psx = new PSXPostPass({ pixelScale: 3 });
composer.addPass(psx);
psx.bindComposer(composer, renderer); // sets composer pixel ratio = dpr / block
```
**C. Full-res composer:** the same setup without `bindComposer`. The pass point-samples the full-res
input on the virtual grid. The result looks the same as B but costs more.
**D. Self-rendering composer pass:** `new PSXPostPass({ scene, camera })` as the first pass.

Options and properties (all can change at runtime):
- `pixelScale` (1..6, in CSS px per virtual px). It is multiplied by the device pixel ratio and rounded.
- `colorBits` (5; 0 turns it off), `dither` (0..1), `scanlines` (0..1), `vignette` (0..1).
- `fogColor`, `fogStrength` (0 turns it off), `fogNear`, `fogFar`, `fogSky`. Fog needs depth:
  standalone mode has it, composer mode needs `depthTexture` plus `camera` set on the pass.
- `outputTransform` (default true), `syncSnapResolution` (default true), `snapDivisor` (default 1; 2 makes the jitter coarser).
- `getGridSize()` returns the current virtual resolution, for the UI.

## Recommended settings

| preset | pixelScale | colorBits | dither | jitter | affine | scanlines | notes |
|---|---|---|---|---|---|---|---|
| Authentic | 4 | 5 | 1 | 1 | 1 | 0.3 | ~320x180 at 1280 px wide |
| **Default (game)** | 3 | 5 | 1 | 1 | 1 (characters/props), 0 (big floors) | 0 | ~427x240 at 1280 |
| Clean | 2 | 6 | 0.5 | 0.5 | 0 | 0 | for readability and screenshots |
| Off | `P` path: plain `renderer.render` with jitter/affine 0 | | | | | | |

- Keep `renderer` `antialias: false`. MSAA is wasted under the pass.
- Subdivide large floors and walls (2-4 m per quad) or set `affine: false` on them. Affine
  warping on a single huge quad is extreme.
- Use `scene.fog` (THREE.Fog) for the real distance fog. Material fog works with patched materials.
  The post fog tint is an optional extra colour grade.
- Characters: `maxTextureSize: 128, textureColorBits: 5, mipmaps: false`. World: `mipmaps: true` to avoid
  sparkling floors at low res.
- HUD/UI is HTML or a separate unpatched overlay. Damage numbers and loot beams can stay unpatched
  (`filter`) so they don't wobble, but patching them looks more "period".

## Limitations

- WebGLRenderer only. The WebGPU/TSL node materials are not supported (`onBeforeCompile`).
- Shadow depth materials are not patched, so shadows come from unsnapped geometry. The mismatch is at most one virtual pixel.
- Affine mapping is not applied to `normalMap`, `roughnessMap`, `aoMap` and similar maps. They keep perspective-correct UVs.
- `ShaderMaterial`/`RawShaderMaterial` without the `project_vertex` chunk, `Points` sprites
  (`map_particle_fragment`) and `SpriteMaterial` are left as they are.
- Texture downscaling works on HTMLImageElement, canvas and ImageBitmap textures. Data, compressed and video textures only get their filters changed.
- Bound composer mode (B): the composer's sizes may be fractional, so blocks can be off by one device pixel. Standalone mode is exact.
- Viewport/scissor offsets on the canvas are supported. Several viewports in one frame each need their own `renderStandalone` call.
- The post pass renders a full-screen RGBA output. A transparent canvas background keeps the input alpha, but the alpha is not dithered.
