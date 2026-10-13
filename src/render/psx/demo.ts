/**
 * PSX render module demo: /psx-demo.html
 * Keys: 1-6 pixel scale, J jitter, A affine, D dither, B bloom (EffectComposer path),
 *       S scanlines, V vignette, F fog tint, C colour bits, P PSX on/off, N next animation.
 * URL params: ?model=/path/to/model.glb  &anim=Walking_A
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PSXPostPass, patchObjectPSX, psxUniforms, setPSXAffine, setPSXJitter } from './index';

const params = new URLSearchParams(location.search);
const MODEL_URL = params.get('model') ?? '/assets/models/characters/Knight.glb';
const START_ANIM = params.get('anim') ?? 'Walking_A';

// --- renderer / scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // HUD shows the whole frame, not just the last full-screen pass
document.body.appendChild(renderer.domElement);

const FOG = new THREE.Color(0x2a1d3a);
const scene = new THREE.Scene();
scene.background = FOG.clone();
scene.fog = new THREE.Fog(FOG, 10, 38);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5.5, 3.6, 7.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0xbfb4ff, 0x3a2a1a, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);
const torch = new THREE.PointLight(0xff8a30, 25, 12, 1.6);
torch.position.set(-2.5, 2.2, 1.5);
scene.add(torch);

// --- checker texture ------------------------------------------------------
function makeChecker(a: string, b: string, cells = 8, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const s = size / cells;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * s, y * s, s, s);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const floorTex = makeChecker('#6b5a48', '#3d3128', 8, 64);
floorTex.repeat.set(12, 12);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60, 12, 12),
  new THREE.MeshLambertMaterial({ map: floorTex }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const boxTex = makeChecker('#d9c27a', '#7a2f2f', 4, 32);
const boxes: THREE.Mesh[] = [];
const boxMats = [
  new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.8 }),
  new THREE.MeshPhongMaterial({ map: boxTex, shininess: 20 }),
  new THREE.MeshBasicMaterial({ map: boxTex }),
  new THREE.MeshLambertMaterial({ map: boxTex }),
];
for (let i = 0; i < 6; i++) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), boxMats[i % boxMats.length]);
  const a = (i / 6) * Math.PI * 2 + 0.4;
  box.position.set(Math.cos(a) * 5, 0.9, Math.sin(a) * 5);
  box.castShadow = box.receiveShadow = true;
  boxes.push(box);
  scene.add(box);
}

// Emissive orb: bloom target (HDR emissive > 1).
const orb = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.35, 1),
  new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xffaa33, emissiveIntensity: 6 }),
);
orb.position.copy(torch.position);
scene.add(orb);

// Instanced ring (verifies instancing + snapping).
const inst = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.4, 0.4, 0.4),
  new THREE.MeshStandardMaterial({ map: boxTex }),
  40,
);
{
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  for (let i = 0; i < inst.count; i++) {
    const a = (i / inst.count) * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, a * 3, a));
    m.compose(new THREE.Vector3(Math.cos(a) * 9, 0.3 + (i % 3) * 0.25, Math.sin(a) * 9), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.setHSL(i / inst.count, 0.6, 0.6));
  }
}
inst.castShadow = true;
scene.add(inst);

patchObjectPSX(scene, { mipmaps: true });

// --- character -----------------------------------------------------------
let mixer: THREE.AnimationMixer | null = null;
let clips: THREE.AnimationClip[] = [];
let clipIndex = 0;
let currentAction: THREE.AnimationAction | null = null;
let modelInfo = 'yükleniyor...';

function playClip(i: number): void {
  if (!mixer || clips.length === 0) return;
  clipIndex = (i + clips.length) % clips.length;
  const next = mixer.clipAction(clips[clipIndex]);
  next.reset().fadeIn(0.2).play();
  if (currentAction && currentAction !== next) currentAction.fadeOut(0.2);
  currentAction = next;
}

new GLTFLoader()
  .loadAsync(MODEL_URL)
  .then((gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    scene.add(model);
    patchObjectPSX(model, { mipmaps: false, maxTextureSize: 128, textureColorBits: 5 });
    clips = gltf.animations;
    if (clips.length) {
      mixer = new THREE.AnimationMixer(model);
      const start = Math.max(0, clips.findIndex((c) => c.name === START_ANIM));
      playClip(start);
    }
    let skinned = 0;
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
    });
    modelInfo = `${MODEL_URL.split('/').pop()} (${skinned} skinned mesh, ${clips.length} anim)`;
  })
  .catch((err: unknown) => {
    console.warn('[psx-demo] model not loaded, using TorusKnot', err);
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.8, 0.28, 96, 12),
      new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.6 }),
    );
    knot.position.y = 1.4;
    knot.castShadow = true;
    knot.name = 'fallbackKnot';
    scene.add(knot);
    patchObjectPSX(knot);
    modelInfo = 'TorusKnot (model bulunamadı)';
  });

// --- PSX post ------------------------------------------------------------
const psx = new PSXPostPass({ pixelScale: 3, colorBits: 5, dither: 1, vignette: 0.25, fogColor: FOG, fogNear: 12, fogFar: 40 });

const state = {
  psx: true,
  bloom: false,
  jitter: true,
  affine: true,
  dither: true,
  scanlines: false,
  vignette: true,
  fogTint: false,
  colorBits: 5,
};

// Composer path (created lazily): RenderPass -> UnrealBloom -> PSXPostPass (bound, low-res chain)
let composer: EffectComposer | null = null;
let composerPsx: PSXPostPass | null = null;
let rawComposer: EffectComposer | null = null;

function ensureComposer(): void {
  if (composer) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 0.9));
  composerPsx = new PSXPostPass({ fogColor: FOG });
  composer.addPass(composerPsx);
  composerPsx.bindComposer(composer, renderer);
}

function ensureRawComposer(): void {
  if (rawComposer) return;
  rawComposer = new EffectComposer(renderer);
  rawComposer.addPass(new RenderPass(scene, camera));
  rawComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 0.9));
  rawComposer.addPass(new OutputPass());
}

function applySettings(): void {
  setPSXJitter(state.psx && state.jitter);
  setPSXAffine(state.psx && state.affine);
  for (const p of [psx, composerPsx]) {
    if (!p) continue;
    p.pixelScale = psx.pixelScale;
    p.dither = state.dither ? 1 : 0;
    p.colorBits = state.colorBits;
    p.scanlines = state.scanlines ? 0.5 : 0;
    p.vignette = state.vignette ? 0.25 : 0;
    p.fogStrength = state.fogTint ? 0.85 : 0;
  }
}

const COLOR_BITS_CYCLE = [5, 4, 3, 8, 0];

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '6') psx.pixelScale = Number(k);
  else if (k === 'j') state.jitter = !state.jitter;
  else if (k === 'a') state.affine = !state.affine;
  else if (k === 'd') state.dither = !state.dither;
  else if (k === 'b') state.bloom = !state.bloom;
  else if (k === 's') state.scanlines = !state.scanlines;
  else if (k === 'v') state.vignette = !state.vignette;
  else if (k === 'f') state.fogTint = !state.fogTint;
  else if (k === 'p') state.psx = !state.psx;
  else if (k === 'n') playClip(clipIndex + 1);
  else if (k === 'c') {
    const i = COLOR_BITS_CYCLE.indexOf(state.colorBits);
    state.colorBits = COLOR_BITS_CYCLE[(i + 1) % COLOR_BITS_CYCLE.length];
  } else return;
  if (state.bloom) {
    if (state.psx) ensureComposer();
    else ensureRawComposer();
  }
  applySettings();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
  rawComposer?.setSize(window.innerWidth, window.innerHeight);
});

// --- HUD -------------------------------------------------------------------
const hud = document.getElementById('hud')!;
const onOff = (v: boolean): string => (v ? 'AÇIK' : 'KAPALI');
let hudTimer = 0;
let frames = 0;
let fps = 0;
let fpsTime = performance.now();

function updateHud(): void {
  const grid = (state.bloom && composerPsx ? composerPsx : psx).getGridSize();
  const clipName = clips[clipIndex]?.name ?? '-';
  hud.textContent =
    `EFSUN ONLINE - PSX görüntü demosu   ${fps.toFixed(0)} FPS\n` +
    `Model: ${modelInfo}\n` +
    `Animasyon (N): ${clipName}\n` +
    `PSX (P): ${onOff(state.psx)}\n` +
    `Piksel ölçeği (1-6): ${psx.pixelScale}  ->  ${Math.round(grid.x)}x${Math.round(grid.y)}\n` +
    `Köşe titremesi (J): ${onOff(state.jitter)}   ızgara ${psxUniforms.psxResolution.value.x.toFixed(0)}x${psxUniforms.psxResolution.value.y.toFixed(0)}\n` +
    `Afin doku (A): ${onOff(state.affine)}\n` +
    `Dither (D): ${onOff(state.dither)}   Renk derinliği (C): ${state.colorBits ? state.colorBits + ' bit' : 'kapalı'}\n` +
    `Bloom / EffectComposer (B): ${onOff(state.bloom)}\n` +
    `Tarama çizgisi (S): ${onOff(state.scanlines)}   Vinyet (V): ${onOff(state.vignette)}   Sis tonu (F): ${onOff(state.fogTint)}\n` +
    `Çizim çağrısı: ${renderer.info.render.calls}  üçgen: ${renderer.info.render.triangles}`;
}

// --- loop --------------------------------------------------------------------
const timer = new THREE.Timer();
timer.connect(document);
applySettings();

function frame(time?: number): void {
  timer.update(time);
  renderer.info.reset();
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  controls.update();
  mixer?.update(dt);
  boxes.forEach((b, i) => {
    b.rotation.y += dt * (0.3 + i * 0.1);
    b.rotation.x = Math.sin(t * 0.5 + i) * 0.3;
  });
  inst.rotation.y = t * 0.1;
  const knot = scene.getObjectByName('fallbackKnot');
  if (knot) knot.rotation.y = t * 0.6;
  torch.intensity = 22 + Math.sin(t * 13) * 2 + Math.sin(t * 7.3) * 2;

  if (state.bloom) {
    if (state.psx && composer) composer.render(dt);
    else if (!state.psx && rawComposer) rawComposer.render(dt);
  } else if (state.psx) {
    psx.renderStandalone(renderer, scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  frames++;
  const now = performance.now();
  if (now - fpsTime > 500) {
    fps = (frames * 1000) / (now - fpsTime);
    frames = 0;
    fpsTime = now;
  }
  if ((hudTimer += dt) > 0.2) {
    hudTimer = 0;
    updateHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for automated checks.
(window as unknown as { __psxDemo: unknown }).__psxDemo = {
  renderer,
  scene,
  camera,
  psx,
  state,
  psxUniforms,
  applySettings,
  get composerPsx() {
    return composerPsx;
  },
};
