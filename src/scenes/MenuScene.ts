import * as THREE from 'three';
import type { GameScene } from '../core/SceneManager';
import { G } from '../game/G';
import { psxify } from '../game/graphics';
import { MAX_CHARACTERS } from '../core/Save';
import { onSaveImported } from '../core/SaveSafety';
import { RNG, dampAngle, damp } from '../core/utils';
import { CharacterState } from '../systems/CharacterState';
import type { CharacterSave } from '../types/character';
import type { ClassId } from '../types/common';
import { nationOfSave, pickNation, type NationId } from '../data/nations';
import { characterAssetUrls } from '../entities/CharacterModel';
import { MenuUI, type CharRow } from '../ui/menu/MenuUI';
import { CLASS_ORDER, classPresentation, validateName } from '../ui/menu/classInfo';
import { createCharacterVisual, type CharVisual } from './CharacterVisual';
import {
  addBasicLights, createBeam, createCampGround, createEmbers, createFireflies, createGround, createMoon, createSilhouetteRing, createSkyDome, createStars,
  fireFlicker, loadAll, loadCampTiles, ownGeo, ownMat, placeModel, projectToScreen, propUrl, radialGlowTexture, rigFlames, runeRingTexture, stoneTexture,
  swayCloth, disposeOwned, disposeSkeletons, type CampTiles, type FlameRig, type ParticleSystem, type Stars,
} from './SceneKit';

/** Props the camp needs (also preloaded by LoadingScene). */
export const MENU_PROP_URLS = [
  'campfire', 'tent', 'banner_red', 'banner_blue', 'banner_green', 'tree_pine_a', 'tree_pine_b', 'tree_dead', 'tree_autumn', 'tree_oak_a',
  'rock_large', 'rock_medium', 'rock_small', 'rock_cliff', 'bush_a', 'bush_b', 'crate_a', 'crate_b', 'barrel', 'sacks', 'wagon', 'lamp_post',
  'signpost', 'brazier', 'crystal_purple', 'crystal_blue', 'grass_tuft', 'flowers', 'font_of_power',
].map(propUrl);

const FIRE_POS = new THREE.Vector3(0, 0, 0);
const ARC_RADIUS = 6.2;
const SLOT_STEP = 0.46; // radians between stands
const PEDESTAL = new THREE.Vector3(-17, 0, 2);
// creation view framing: preview character height / viewport height, feet line from the top, camera pitch (looking down)
const CREATE_HEIGHT_FRAC = 0.45;
const CREATE_FEET_FRAC = 0.75;
const CREATE_PITCH = THREE.MathUtils.degToRad(7);

interface Stand {
  key: string;
  save: CharacterSave | null; // null = the "new character" dais
  group: THREE.Group;
  visual: CharVisual | null;
  dais: THREE.Group;
  ring: THREE.Mesh;
  glow: THREE.Sprite;
  beam: THREE.Mesh;
  hit: THREE.Mesh;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  yaw: number;
  hover: number; // 0..1 smoothed
  sel: number; // 0..1 smoothed
  moving: boolean;
  nextFidget: number;
  born: number;
}

type Mode = 'select' | 'create';

/**
 * The main menu: a full 3D PSX night camp. Saved characters stand around the campfire as real KayKit models (click to
 * select, hover highlight + nameplate), the camera drifts slowly, a DOM overlay (ui/menu/MenuUI) provides the
 * WoW/Metin2 style buttons. "Yeni Karakter" dollies the camera to a rune pedestal where the chosen class plays a
 * showcase animation; pick class / colour variant / name, "Oluştur" writes the save.
 * OWNER: scenes module.
 */
export class MenuScene implements GameScene {
  readonly id = 'menu' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);

  private root = new THREE.Group();
  private ui: MenuUI | null = null;
  private stands: Stand[] = [];
  private newStand: Stand | null = null;
  private selected: Stand | null = null;
  private hovered: Stand | null = null;
  private mode: Mode = 'select';
  private time = 0;
  private entered = false;
  private leaving = false;

  // atmosphere
  private stars: Stars | null = null;
  private sky: ReturnType<typeof createSkyDome> | null = null;
  private skyGroup = new THREE.Group();
  private particles: ParticleSystem[] = [];
  private flames: FlameRig[] = [];
  private fireLight = new THREE.PointLight(0xff8a3a, 105, 40, 2);
  private fireGlow: THREE.Sprite | null = null;
  private lampLights: THREE.PointLight[] = [];
  private banners: THREE.Object3D[] = [];
  private states = new Map<string, CharacterState>();
  private groundTiles: CampTiles | null = null;

  // camera
  private camPos = new THREE.Vector3(0, 3.6, 13);
  private camLook = new THREE.Vector3(0, 1.8, -3);
  private shakeT = 0;

  // pointer
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private downAt: { x: number; y: number; id: number } | null = null;
  private dragging = false;
  private canvasEl: HTMLCanvasElement | null = null;
  private cleanup: (() => void)[] = [];
  private unsubImported: (() => void) | null = null;

  // creation
  private pedestal = new THREE.Group();
  private pedRing: THREE.Mesh | null = null;
  private pedLight = new THREE.PointLight(0xb08cff, 0, 16, 2);
  private pedKey = new THREE.PointLight(0xffd2a0, 0, 20, 2);
  private pedVisual: CharVisual | null = null;
  private pedToken = 0;
  private pedClass: ClassId = 'knight';
  private pedVariant = 0;
  /** WP-06: nation picked on the creation screen (default: the one the player has fewer characters in, ties by hash). */
  private pedNation: NationId = 'gok_kartal';
  /** Beta test toggle of the creation screen (CharacterState.create opts.beta). */
  private pedBeta = false;
  private pedYawOffset = 0;
  private pedPop = 1;
  private pedStep = 0;
  private pedNext = 0;
  private pedFlash = 0;
  private pedFill = new THREE.PointLight(0xfff0dc, 0, 14, 2);
  private pedHeight = 1.85; // measured height of the shown character (world units)
  private pedFeetY = PEDESTAL.y + 0.64; // world y of the shown character's feet
  private createCx = 0.5; // horizontal centre of the free gap between the creation panels (0..1 of the canvas)
  private createCxTarget = 0.5;
  private createCxTimer = 0;
  private createBlend = 0; // 0 = camp view, 1 = creation view (eases the framing in and out)
  private viewShifted = false;
  private campProps: THREE.Object3D[] = []; // camp props the creation view may hide
  private occluders: THREE.Object3D[] = [];
  private sceneryHidden = false;
  private boxCache = new Map<THREE.Object3D, THREE.Box3>();

  async enter(_params?: unknown): Promise<void> {
    G.vfx.attach(this.scene, this.camera);
    G.world = null;
    G.player = null;
    G.camera = null;
    try {
      G.character?.persist(true);
    } catch {
      /* ignore */
    }
    G.character = null;
    G.ui.setMode('menu');
    G.ui.closeAll();

    const classUrls = CLASS_ORDER.flatMap((c) => characterAssetUrls(c));
    const [, tiles] = await Promise.all([loadAll([...MENU_PROP_URLS, ...classUrls]), loadCampTiles()]);
    this.groundTiles = tiles;

    this.buildAtmosphere();
    this.buildCamp();
    this.buildPedestal();
    this.scene.add(this.root);

    const uiRoot = (G.ui.root as HTMLElement | undefined) ?? (document.getElementById('ui-root') as HTMLElement);
    // never stack two menu overlays (a stale one from an interrupted scene switch would double every card on screen)
    uiRoot.querySelectorAll(':scope > .efs-menu').forEach((el) => el.remove());
    this.ui = new MenuUI(uiRoot, {
      onSelect: (id) => this.selectById(id),
      onPlay: () => this.play(),
      onNew: () => this.beginCreate(),
      onDelete: () => void this.askDelete(),
      onSettings: () => G.ui.openPanel('settings'),
      onServers: () => this.openServers(),
      onCredits: () => G.ui.openPanel('credits'),
      onExit: () => void this.askExit(),
      onPickClass: (id) => this.pickClass(id),
      onPickVariant: (i) => this.pickVariant(i),
      onPickNation: (id) => this.pickNation(id),
      onPickBeta: (on) => { this.pedBeta = on; },
      onSubmitCreate: (name) => this.submitCreate(name),
      onValidateName: (name) => validateName(name, this.existingNames()),
      onBackFromCreate: () => this.endCreate(),
      onUiSound: (k) => this.uiSound(k),
    });

    await this.loadStands();
    this.refreshUI();
    this.installPointer();
    this.resizeCamera();

    this.camPos.set(0, 4.4, 15.5);
    G.audio.music('menu', 1.5);
    // any screen can import (menu button, Ayarlar > Kayıt): rebuild the stands whenever a file adds characters
    this.unsubImported = onSaveImported(() => void this.reloadStands());
    this.entered = true;
    G.net.sceneReady('menu');
  }

  // ================================================================================================
  // 3D construction
  // ================================================================================================

  private buildAtmosphere(): void {
    const s = this.scene;
    const horizon = 0x1d2548;
    s.background = new THREE.Color(0x070a16);
    s.fog = new THREE.Fog(0x0e1428, 14, 84);
    this.sky = createSkyDome(0x03050d, 0x0a1230, horizon);
    this.skyGroup.add(this.sky.mesh);
    this.stars = createStars(900, 400, 5);
    this.skyGroup.add(this.stars.points);
    const moon = createMoon(new THREE.Vector3(-70, 92, -330), 15);
    this.skyGroup.add(moon.group);
    // far silhouettes: layered mountains and treeline
    this.skyGroup.add(createSilhouetteRing({ radius: 300, height: 70, color: 0x0b1226, seed: 3, jag: 1.1 }));
    this.skyGroup.add(createSilhouetteRing({ radius: 190, height: 34, color: 0x0a0f1e, seed: 8, segments: 110, jag: 0.8 }));
    s.add(this.skyGroup);

    addBasicLights(s, { hemiSky: 0x6a82d0, hemiGround: 0x2a2218, hemiIntensity: 1.15 });
    s.add(new THREE.AmbientLight(0x35406a, 0.9));
    // moonlight comes from the north-west behind the camp (rim light on the characters, long shadows toward the camera)
    const dl = moon.light;
    dl.position.set(-26, 34, -34);
    dl.target.position.set(0, 0, -2);
    dl.intensity = 2.0;
    dl.castShadow = true;
    dl.shadow.mapSize.set(2048, 2048);
    Object.assign(dl.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 110 });
    dl.shadow.bias = -0.0004;
    dl.shadow.normalBias = 0.05;
    s.add(dl, dl.target);
  }

  private buildCamp(): void {
    const root = this.root;
    const rng = new RNG(1337);

    // ground: real PSX tiles (grass / moss / gravel) with a worn dirt clearing, trodden paths and an ash patch at the fire.
    // Added AFTER the final psxify(root) below so nothing re-patches its (non-affine) material.
    const ground = this.groundTiles
      ? createCampGround(this.groundTiles, {
          fire: [FIRE_POS.x, FIRE_POS.z],
          blobs: [
            [FIRE_POS.x, FIRE_POS.z, 11],
            [PEDESTAL.x, PEDESTAL.z, 5.4], // pedestal clearing
            [15.5, -3.5, 4.4], // wagon / crates
            [-12.5, -9.5, 3.8], [12.2, -11, 3.6], [-2.5, -19, 4.2], [-22, -3, 3.4], // tents
          ],
          paths: [
            [FIRE_POS.x, FIRE_POS.z, PEDESTAL.x, PEDESTAL.z],
            [FIRE_POS.x, FIRE_POS.z, -12.5, -9.5],
            [FIRE_POS.x, FIRE_POS.z, 12.2, -11],
            [FIRE_POS.x, FIRE_POS.z, -2.5, -19],
            [FIRE_POS.x, FIRE_POS.z, 15.5, -3.5],
            [FIRE_POS.x, FIRE_POS.z, 9.2, 5.4],
          ],
          pathWidth: 3.0,
          ashRadius: 2.6,
          tint: 0xe6ecff,
        })
      : createGround({ radius: 130, inner: 0x6a4a2c, innerRadius: 8, outer: 0x1f3a22, far: 0x0d1a14, fadeRadius: 40, seed: 12, textureRepeat: 0.22 });

    // campfire
    const fire = placeModel(root, propUrl('campfire'), { pos: [0, 0, 0], scale: 1.2, castShadow: false });
    const rig = rigFlames(fire, 0);
    this.flames.push(rig);
    const lp = rig.lightPos ?? new THREE.Vector3(0, 0.9, 0);
    this.fireLight.position.set(lp.x * 1.2, Math.max(0.9, lp.y * 1.2), lp.z * 1.2);
    this.fireLight.castShadow = false;
    root.add(this.fireLight);
    const glowTex = radialGlowTexture(64, 'rgba(255,170,70,0.85)', 'rgba(255,90,20,0)');
    this.fireGlow = new THREE.Sprite(ownMat(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    this.fireGlow.position.set(0, 1.1, 0);
    this.fireGlow.scale.set(4.2, 3.2, 1);
    root.add(this.fireGlow);
    const embers = createEmbers(new THREE.Vector3(0, 0.4, 0), 130, { spread: 0.8, rise: 1.7, size: 2.2 });
    root.add(embers.points);
    this.particles.push(embers);
    // optional VFX-module flames on top (silently ignored by a stub)
    try {
      G.vfx.spawn('brazier_fire', [0, 0.35, 0], { scale: 1.3 });
    } catch {
      /* vfx optional */
    }

    // tents facing the fire
    const tent = (x: number, z: number, s: number, rotJitter = 0) => {
      const rot = Math.atan2(-x, -z) + rotJitter;
      return placeModel(root, propUrl('tent'), { pos: [x, 0, z], rot, scale: s, castShadow: true, receiveShadow: true });
    };
    tent(-12.5, -9.5, 1.15, 0.1);
    tent(12.2, -11, 1.05, -0.12);
    tent(-2.5, -19, 1.35, 0.05);
    tent(-22, -3, 1.0, 0.5);

    // banners
    for (const [name, x, z, r] of [['banner_red', -7.2, -12, 0.15], ['banner_blue', 7.6, -13.5, -0.12], ['banner_green', 19, -9, -0.5]] as const) {
      const b = placeModel(root, propUrl(name), { pos: [x, 0, z], rot: r, castShadow: true });
      this.banners.push(b);
    }

    // camp clutter
    placeModel(root, propUrl('wagon'), { pos: [15.5, 0, -2.5], rot: -1.7, castShadow: true });
    placeModel(root, propUrl('crate_a'), { pos: [12.6, 0, -6.6], rot: 0.3, castShadow: true });
    placeModel(root, propUrl('crate_a'), { pos: [12.9, 0.98, -6.4], rot: 0.9, scale: 0.8, castShadow: true });
    placeModel(root, propUrl('crate_b'), { pos: [11.2, 0, -7.4], rot: -0.4, castShadow: true });
    placeModel(root, propUrl('barrel'), { pos: [10.2, 0, -6.2], castShadow: true });
    placeModel(root, propUrl('barrel'), { pos: [9.4, 0, -7.0], rot: 1, castShadow: true });
    placeModel(root, propUrl('sacks'), { pos: [-15.2, 0, -5.4], rot: 0.5, castShadow: true });
    placeModel(root, propUrl('crate_b'), { pos: [-16.6, 0, -7.0], rot: 0.9, castShadow: true });
    placeModel(root, propUrl('signpost'), { pos: [9.2, 0, 5.4], rot: -0.6, castShadow: true });
    placeModel(root, propUrl('rock_large'), { pos: [-9.5, 0, 9.5], rot: 1.1, castShadow: true });
    placeModel(root, propUrl('rock_medium'), { pos: [-7.7, 0, 10.4], rot: 2.1, castShadow: true });

    // lamp posts with warm light
    for (const [x, z] of [[-10, 3.2], [10.4, 2.4]] as const) {
      const lamp = placeModel(root, propUrl('lamp_post'), { pos: [x, 0, z], rot: Math.atan2(-x, -z) + Math.PI, castShadow: true });
      const l0 = lamp.getObjectByName('light_0');
      const light = new THREE.PointLight(0xffc070, 22, 16, 2);
      const lpos = new THREE.Vector3();
      if (l0) l0.getWorldPosition(lpos);
      else lpos.set(x, 3.2, z);
      light.position.copy(lpos);
      root.add(light);
      this.lampLights.push(light);
    }

    // log-ring seats made of rocks around the fire (south side, in front of the camera)
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.62 + i * 0.13);
      placeModel(root, propUrl('rock_small'), { pos: [Math.cos(a) * 2.7, 0, -Math.sin(a) * 2.7 + 0.1], rot: rng.next() * 6, scale: 0.9 + rng.next() * 0.5, castShadow: true });
    }

    // forest ring (mostly behind the camp, a few at the sides)
    const trees = ['tree_pine_a', 'tree_pine_b', 'tree_dead', 'tree_pine_a', 'tree_autumn', 'tree_pine_b', 'tree_oak_a'];
    for (let i = 0; i < 74; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 20 + rng.next() * 32;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 9 && Math.abs(x) < 18) continue; // keep the camera side open
      if (nearPedestalView(x, z, 8)) continue; // pedestal clearing + creation camera corridor
      const name = trees[Math.floor(rng.next() * trees.length)];
      const sc = 1.0 + rng.next() * 0.9;
      placeModel(root, propUrl(name), { pos: [x, 0, z], rot: rng.next() * 6.28, scale: sc, castShadow: z < -6 });
    }
    for (let i = 0; i < 16; i++) {
      const a = (-0.15 + rng.next() * 1.3) * Math.PI;
      const r = 36 + rng.next() * 16;
      placeModel(root, propUrl('rock_cliff'), { pos: [Math.cos(a + Math.PI) * r, 0, -Math.abs(Math.sin(a)) * r - 8], rot: rng.next() * 6.28, scale: 1.4 + rng.next() });
    }
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 9 + rng.next() * 22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 12) continue;
      placeModel(root, propUrl(rng.chance(0.5) ? 'bush_a' : 'bush_b'), { pos: [x, 0, z], rot: rng.next() * 6, scale: 0.8 + rng.next() * 0.7 });
    }
    for (let i = 0; i < 18; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 8 + rng.next() * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 11 || nearPedestalView(x, z, 4.5)) continue;
      placeModel(root, propUrl(rng.chance(0.6) ? 'rock_medium' : 'rock_small'), { pos: [x, 0, z], rot: rng.next() * 6, scale: 0.8 + rng.next() * 1.0, castShadow: true });
    }
    this.scatterInstanced(root, propUrl('grass_tuft'), 360, rng, 3, 30, { skip: (x, z) => Math.hypot(x, z) < 8.5 }); // none on the worn dirt
    this.scatterInstanced(root, propUrl('flowers'), 90, rng, 4, 22, { skip: (x, z) => Math.hypot(x, z) < 8.5 });
    // extra ground dressing: denser tufts past the dirt edge and pebbles / small stones scattered over the clearing
    this.scatterInstanced(root, propUrl('grass_tuft'), 240, rng, 10, 38, { scale: [0.9, 1.8] });
    this.scatterInstanced(root, propUrl('rock_small'), 90, rng, 2.8, 24, { scale: [0.2, 0.5], skip: (x, z) => Math.hypot(x, z) < 2.4 });

    // fireflies and a few drifting dust motes
    const ff = createFireflies(new THREE.Vector3(0, 0, -4), 22, 46, 0xcfff7a, 77);
    root.add(ff.points);
    this.particles.push(ff);
    psxify(root, 'world');
    root.add(ground);
    // camp props the creation view may hide (not the ground, the instanced scatter, or the pedestal, which is built later)
    this.campProps = root.children.filter((o) => o !== ground && !(o as THREE.InstancedMesh).isInstancedMesh && !!o.getObjectByProperty('isMesh', true));
  }

  /** Many copies of a single-mesh prop with one draw call. */
  private scatterInstanced(
    parent: THREE.Object3D,
    url: string,
    count: number,
    rng: RNG,
    rMin: number,
    rMax: number,
    opts: { scale?: [number, number]; skip?: (x: number, z: number) => boolean } = {},
  ): void {
    const model = G.assets.instantiate(url);
    model.updateMatrixWorld(true);
    let src: THREE.Mesh | null = null;
    model.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (!src) return;
    const mesh = src as THREE.Mesh;
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, count);
    inst.frustumCulled = false;
    const local = mesh.matrixWorld.clone();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rMin + Math.sqrt(rng.next()) * (rMax - rMin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 11 || nearPedestalView(x, z, 3.2) || opts.skip?.(x, z)) continue;
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 6.28);
      const [sLo, sHi] = opts.scale ?? [0.8, 1.7];
      const s = sLo + rng.next() * (sHi - sLo);
      sc.set(s, s * (0.8 + rng.next() * 0.5), s);
      m.compose(p, q, sc).multiply(local);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    parent.add(inst);
  }

  private buildPedestal(): void {
    const P = PEDESTAL;
    const g = this.pedestal;
    g.position.copy(P);
    const stone = stoneTexture(5, 32, [104, 98, 112]);
    stone.repeat.set(3, 1);
    const baseMat = ownMat(new THREE.MeshLambertMaterial({ map: stone, color: 0xb8b0c8 }));
    const base = new THREE.Mesh(ownGeo(new THREE.CylinderGeometry(2.7, 2.9, 0.34, 10)), baseMat);
    base.position.y = 0.17;
    const mid = new THREE.Mesh(ownGeo(new THREE.CylinderGeometry(2.1, 2.3, 0.3, 10)), baseMat);
    mid.position.y = 0.49;
    base.castShadow = mid.castShadow = true;
    base.receiveShadow = mid.receiveShadow = true;
    g.add(base, mid);
    const ringTex = runeRingTexture('#c9a0ff');
    const ring = new THREE.Mesh(
      ownGeo(new THREE.CircleGeometry(2.02, 32)),
      ownMat(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.0 })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.66;
    g.add(ring);
    this.pedRing = ring;
    psxify(base, 'world');
    psxify(mid, 'world');

    // dressing: crystals, braziers and a banner framing the pedestal
    const dress = (name: string, x: number, z: number, rot: number, sc = 1) => placeModel(g, propUrl(name), { pos: [x, 0, z], rot, scale: sc, castShadow: true });
    dress('crystal_purple', -2.4, -2.9, 0.4, 1.2);
    dress('crystal_purple', 1.2, -3.6, 2.0, 0.9);
    dress('crystal_blue', 3.4, -2.2, 1.0, 0.8);
    dress('crystal_purple', -3.7, -0.6, 3.1, 0.7);
    dress('brazier', 3.6, 1.5, 0, 0.9);
    dress('brazier', -3.4, 2.6, 0, 0.9);
    dress('banner_blue', 0.3, -4.3, 0, 1.0);
    const braLights: THREE.Vector3[] = [new THREE.Vector3(3.6, 1.7, 1.5), new THREE.Vector3(-3.4, 1.7, 2.6)];
    for (const v of braLights) {
      const l = new THREE.PointLight(0xffa850, 16, 11, 2);
      l.position.copy(v);
      g.add(l);
      this.lampLights.push(l);
    }
    g.add(this.pedLight, this.pedKey, this.pedFill);
    this.pedFill.position.set(1.4, 2.4, 3.8); // soft fill from the camera side so the face is not left in shadow
    this.pedLight.position.set(0, 3.4, -1.8);
    this.pedKey.position.set(3.5, 3.2, 3.6);
    const motes = createEmbers(new THREE.Vector3(P.x, 0.5, P.z), 60, { spread: 2.4, rise: 0.9, color: 0xb98cff, size: 2, height: 3.6 });
    this.root.add(motes.points);
    this.particles.push(motes);
    g.visible = true;
    this.root.add(g);
    try {
      G.vfx.spawn('ambient_dust', [P.x, 1.2, P.z], { scale: 1.2 });
    } catch {
      /* optional */
    }
  }

  // ================================================================================================
  // Stands (saved characters)
  // ================================================================================================

  private makeStand(save: CharacterSave | null, key: string): Stand {
    const group = new THREE.Group();
    const dais = new THREE.Group();
    const stone = stoneTexture(9, 32, [96, 90, 96]);
    stone.repeat.set(2, 1);
    const baseMat = ownMat(new THREE.MeshLambertMaterial({ map: stone, color: 0xc8c0cc }));
    const disc = new THREE.Mesh(ownGeo(new THREE.CylinderGeometry(1.15, 1.3, 0.2, 9)), baseMat);
    disc.position.y = 0.1;
    disc.receiveShadow = true;
    disc.castShadow = true;
    psxify(disc, 'world');
    const ringMat = ownMat(new THREE.MeshBasicMaterial({ map: runeRingTexture('#ffd27a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.25 }));
    const ring = new THREE.Mesh(ownGeo(new THREE.CircleGeometry(1.08, 24)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.215;
    dais.add(disc, ring);
    const glow = new THREE.Sprite(ownMat(new THREE.SpriteMaterial({ map: radialGlowTexture(64, 'rgba(255,210,120,0.8)', 'rgba(255,160,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })));
    glow.scale.set(4, 2.4, 1);
    glow.position.y = 0.5;
    dais.add(glow);
    const beam = createBeam(0.95, 7, 0xffd27a);
    beam.position.y = 3.5 + 0.2;
    dais.add(beam);
    group.add(dais);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.45;
    group.add(hit);
    this.root.add(group);
    return {
      key, save, group, visual: null, dais, ring, glow, beam, hit,
      pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, hover: 0, sel: 0, moving: false, nextFidget: 6 + Math.random() * 8, born: this.time,
    };
  }

  private async loadStands(): Promise<void> {
    // de-duplicate by id: a character index that lists the same id twice (hand-edited / merged storage) would otherwise show two
    // identical stands and cards (QA: "Selvi Sv. 19 Büyücü" twice). Two entries with the same id ARE the same save.
    const seen = new Set<string>();
    const saves = G.save
      .list()
      .filter((s) => CLASS_ORDER.includes(s.classId))
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, MAX_CHARACTERS);
    for (const s of saves) this.stands.push(this.makeStand(s, s.id));
    this.layoutStands(true);
    await Promise.all(this.stands.map((st) => this.fillStand(st)));
    // most recently played is pre-selected
    const last = [...this.stands].sort((a, b) => (b.save?.lastPlayed ?? 0) - (a.save?.lastPlayed ?? 0))[0];
    if (last) this.select(last, true);
  }

  /**
   * After an import (İçe Aktar, from any screen): rebuilds the stands from storage so the imported characters show up, and
   * their names count as taken for existingNames(). Create mode is fine: the stands are rebuilt without touching the
   * pedestal, and the name check and slot check read the rebuilt list on submit. Skipped while a scene switch runs (play());
   * the next enter() reads the list from storage anyway.
   */
  private async reloadStands(): Promise<void> {
    if (this.leaving) return;
    for (const st of this.stands) {
      this.ui?.removePlate(st.key);
      st.visual?.dispose();
      st.group.removeFromParent();
      disposeOwned(st.group);
    }
    this.stands = [];
    this.selected = null;
    this.hovered = null;
    await this.loadStands();
    this.refreshUI();
  }

  private async fillStand(st: Stand): Promise<void> {
    if (!st.save) return;
    try {
      const v = await createCharacterVisual(st.save.classId, st.save.appearance?.variant ?? 0);
      if (!this.stands.includes(st)) {
        v.dispose();
        return;
      }
      st.visual = v;
      st.group.add(v.root);
      v.root.position.y = 0.2;
      v.root.rotation.y = st.yaw;
      v.anim?.setBase(v.anim.pick('Idle') ?? 'Idle', { fade: 0 });
      if (v.anim) v.anim.mixer.setTime(Math.random() * 1.0);
    } catch (e) {
      console.warn('[menu] could not load character visual', e);
    }
  }

  /** Slot targets on the arc north of the fire; the "new character" dais follows the last stand. */
  private layoutStands(snap = false): void {
    const n = this.stands.length;
    const showNew = n < MAX_CHARACTERS;
    const m = n + (showNew ? 1 : 0);
    if (showNew && !this.newStand) {
      this.newStand = this.makeStand(null, 'new');
      this.ui?.ensurePlate('new', 'Yeni Karakter', 'Tıkla ve yarat', '', '#8fc4ff', true);
    } else if (!showNew && this.newStand) {
      this.newStand.group.removeFromParent();
      disposeOwned(this.newStand.group);
      this.ui?.removePlate('new');
      this.newStand = null;
    }
    const all = [...this.stands, ...(this.newStand ? [this.newStand] : [])];
    const step = Math.min(SLOT_STEP, 2.0 / Math.max(1, m - 1) + 0.0);
    all.forEach((st, i) => {
      const th = (i - (m - 1) / 2) * (m > 1 ? step : 0);
      st.target.set(Math.sin(th) * ARC_RADIUS, 0, -Math.cos(th) * ARC_RADIUS);
      if (snap) {
        st.pos.copy(st.target);
        st.group.position.copy(st.pos);
      }
    });
  }

  private allStands(): Stand[] {
    return this.newStand ? [...this.stands, this.newStand] : this.stands;
  }

  // ================================================================================================
  // Selection / UI glue
  // ================================================================================================

  private saveRows(): CharRow[] {
    return this.stands.map((s) => ({
      id: s.save!.id, name: s.save!.name, classId: s.save!.classId, level: s.save!.level, rating: s.save!.mythic?.rating ?? 0, lastPlayed: s.save!.lastPlayed,
      beta: !!s.save!.beta,
    }));
  }

  private existingNames(): string[] {
    return this.stands.map((s) => s.save!.name);
  }

  private refreshUI(): void {
    if (!this.ui) return;
    this.ui.setCharacters(this.saveRows(), this.selected?.save?.id ?? null, MAX_CHARACTERS);
    for (const st of this.stands) {
      const p = classPresentation(st.save!.classId);
      const r = st.save!.mythic?.rating ?? 0;
      const rating = r > 0 ? `Mitik+ Puanı ${Math.round(r)}` : 'Henüz Mitik+ puanı yok';
      this.ui.ensurePlate(st.key, st.save!.name, `Sv. ${st.save!.level} ${p.name}`, st.save!.beta ? `BETA · ${rating}` : rating, p.color);
    }
    this.ui.setServersEnabled(true);
  }

  private uiSound(kind: 'click' | 'hover' | 'error'): void {
    G.audio.play(kind === 'click' ? 'ui_click' : kind === 'hover' ? 'ui_hover' : 'ui_error');
  }

  private selectById(id: string): void {
    const st = this.stands.find((s) => s.save?.id === id);
    if (st) this.select(st);
  }

  private select(st: Stand | null, silent = false): void {
    if (st === this.selected) return;
    this.selected = st;
    if (st && !silent) {
      const a = st.visual?.anim;
      if (a) {
        const clip = a.pick('Cheer', 'Interact');
        if (clip) a.playOnce(clip, { onDone: () => a.setBase(a.pick('Idle') ?? 'Idle') });
      }
      G.audio.play('ui_tab');
      try {
        G.vfx.spawn('waypoint_glow', [st.pos.x, 0.3, st.pos.z], { scale: 0.7, duration: 1.2 });
      } catch {
        /* optional */
      }
    }
    this.refreshUI();
  }

  private stateFor(save: CharacterSave): CharacterState {
    let cs = this.states.get(save.id);
    if (!cs) {
      cs = new CharacterState(save);
      this.states.set(save.id, cs);
    }
    return cs;
  }

  private play(): void {
    if (this.leaving || !this.selected?.save || this.mode !== 'select') return;
    const st = this.selected;
    this.leaving = true;
    const cs = this.stateFor(st.save!);
    G.character = cs;
    try {
      cs.recomputeStats();
    } catch (e) {
      console.warn('[menu] recomputeStats failed', e);
    }
    G.audio.play('ui_open');
    const a = st.visual?.anim;
    if (a) {
      const clip = a.pick('Cheer');
      if (clip) a.playOnce(clip, { speed: 1.4 });
    }
    void G.net.enterScene('town').finally(() => { // the town's public channel (net/Channels.ts) or, offline, the town itself
      this.leaving = false;
    });
  }

  private openServers(): void {
    if (!this.selected?.save) {
      G.ui.toast('Sunuculara bağlanmak için önce bir karakter seç.', 'warning');
      this.uiSound('error');
      return;
    }
    // the party/server browser announces the character summary, so it needs G.character
    const cs = this.stateFor(this.selected.save);
    G.character = cs;
    try {
      cs.recomputeStats();
    } catch {
      /* ignore */
    }
    G.ui.openPanel('party');
  }

  private async askDelete(): Promise<void> {
    const st = this.selected;
    if (!st?.save || !this.ui) return;
    const save = st.save;
    const ok = await this.ui.modal({
      title: 'Karakteri Sil',
      html: `<b>${escapeHtml(save.name)}</b> adlı kahramanı silmek üzeresin. Bu işlem <b>geri alınamaz</b>; tüm eşyalar ve ilerleme kaybolur.<br><br>Onaylamak için karakterin adını yaz:`,
      okLabel: 'Sil',
      cancelLabel: 'Vazgeç',
      danger: true,
      requireText: save.name,
    });
    if (!ok) return;
    G.save.delete(save.id);
    this.states.delete(save.id);
    this.ui.removePlate(st.key);
    try {
      G.vfx.spawn('death_poof', [st.pos.x, 1, st.pos.z]);
    } catch {
      /* optional */
    }
    st.visual?.dispose();
    st.group.removeFromParent();
    disposeOwned(st.group);
    this.stands = this.stands.filter((s) => s !== st);
    this.selected = null;
    this.hovered = null;
    this.layoutStands();
    const next = this.stands[0] ?? null;
    if (next) this.select(next, true);
    this.refreshUI();
    G.ui.toast(`${save.name} silindi.`, 'info');
  }

  private async askExit(): Promise<void> {
    if (!this.ui) return;
    const ok = await this.ui.modal({ title: 'Oyundan Çık', html: 'Ateşin başından ayrılmak istediğine emin misin?', okLabel: 'Çıkış', cancelLabel: 'Kal', danger: true });
    if (!ok) return;
    this.ui.showBye();
    G.audio.music(null, 1.2);
    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* browsers block this for tabs not opened by script */
      }
    }, 900);
  }

  // ================================================================================================
  // Creation flow
  // ================================================================================================

  private beginCreate(): void {
    if (this.mode !== 'select' || !this.ui) return;
    if (this.stands.length >= MAX_CHARACTERS) {
      G.ui.toast('Karakter yuvaları dolu (6/6). Yeni karakter için birini silmelisin.', 'warning');
      this.uiSound('error');
      return;
    }
    this.mode = 'create';
    this.hovered = null;
    this.ui.hidePlates();
    this.ui.resetCreateForm();
    this.pedVariant = 0;
    const counts: Partial<Record<NationId, number>> = {};
    for (const st of this.stands) { if (!st.save) continue; const n = nationOfSave(st.save); counts[n] = (counts[n] ?? 0) + 1; }
    this.pedNation = pickNation(counts, String(Date.now()));
    this.ui.setCreateNation(this.pedNation);
    this.ui.setBeta(this.pedBeta);
    this.pedYawOffset = 0;
    this.ui.setMode('create');
    this.ui.setCreateSelection(this.pedClass, this.pedVariant);
    void this.setPedestalClass(this.pedClass, this.pedVariant, true);
    this.ui.focusName();
    G.audio.play('ui_open');
  }

  private endCreate(): void {
    if (this.mode !== 'create' || !this.ui) return;
    this.mode = 'select';
    this.ui.setMode('select');
    this.ui.replayIntro();
    this.refreshUI();
    G.audio.play('ui_close');
  }

  private pickClass(id: ClassId): void {
    if (id === this.pedClass && this.pedVisual) return;
    this.pedClass = id;
    this.ui?.setCreateSelection(id, this.pedVariant);
    void this.setPedestalClass(id, this.pedVariant, true);
  }

  private pickNation(id: NationId): void {
    this.pedNation = id;
    this.ui?.setCreateNation(id);
  }

  private pickVariant(i: number): void {
    if (i === this.pedVariant) return;
    this.pedVariant = i;
    this.ui?.setCreateSelection(this.pedClass, i);
    void this.setPedestalClass(this.pedClass, i, false);
  }

  private async setPedestalClass(classId: ClassId, variant: number, pop: boolean): Promise<void> {
    const token = ++this.pedToken;
    let v: CharVisual;
    try {
      v = await createCharacterVisual(classId, variant);
    } catch (e) {
      console.warn('[menu] pedestal model failed', e);
      return;
    }
    if (token !== this.pedToken || this.mode !== 'create') {
      v.dispose();
      return;
    }
    const old = this.pedVisual;
    const oldYaw = old ? old.root.rotation.y : null;
    old?.dispose();
    this.pedVisual = v;
    this.pedestal.add(v.root);
    v.root.position.set(0, 0.64, 0);
    v.root.rotation.y = oldYaw ?? this.pedBaseYaw() + this.pedYawOffset;
    this.measurePedestal(v.root);
    const p = classPresentation(classId);
    v.anim?.setBase(v.anim.pick(p.idle, 'Idle') ?? 'Idle', { fade: 0 });
    this.pedStep = 0;
    this.pedNext = this.time + 0.9;
    if (pop) {
      this.pedPop = 0.0;
      this.pedFlash = 1;
      G.audio.play('buff');
      try {
        G.vfx.spawn('respawn', [PEDESTAL.x, 0.7, PEDESTAL.z], { scale: 1.1 });
      } catch {
        /* optional */
      }
    }
    this.pedLight.color.set(p.color);
  }

  private pedBaseYaw(): number {
    // face the creation camera (3/4 view)
    const c = this.createCamTarget();
    return Math.atan2(c.pos.x - PEDESTAL.x, c.pos.z - PEDESTAL.z) - 0.18;
  }

  private createCamTarget(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    // the camera sways slightly around the pedestal, aims at the character's middle and looks a little down
    const a = 0.38 + Math.sin(this.time * 0.25) * 0.06;
    const dist = this.createDistance();
    const mid = this.pedMidY();
    const flat = dist * Math.cos(CREATE_PITCH);
    return {
      pos: new THREE.Vector3(PEDESTAL.x + Math.sin(a) * flat, mid + dist * Math.sin(CREATE_PITCH), PEDESTAL.z + Math.cos(a) * flat),
      look: new THREE.Vector3(PEDESTAL.x, mid, PEDESTAL.z),
    };
  }

  /** Height and feet line of the shown character, so the creation camera frames every class and colour variant alike. */
  private measurePedestal(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    this.pedHeight = THREE.MathUtils.clamp(box.max.y - box.min.y, 1.2, 3.2);
    this.pedFeetY = box.min.y;
  }

  private pedMidY(): number {
    return this.pedFeetY + this.pedHeight / 2;
  }

  /** Distance at which the character fills CREATE_HEIGHT_FRAC of the viewport height; narrow screens back off a little. */
  private createDistance(): number {
    const aspect = this.camera.aspect || 1.7;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const narrow = aspect < 1.4 ? 1 + (1.4 - aspect) * 0.8 : 1;
    return (this.pedHeight / (2 * CREATE_HEIGHT_FRAC * tanHalf)) * narrow;
  }

  /**
   * Creation view framing on top of the camera pose: a lens shift that puts the shown character in the middle of the free
   * gap between the two panels, with its feet at CREATE_FEET_FRAC of the screen height. Eases back out in the camp view.
   */
  private updateCreateView(dt: number): void {
    this.createBlend = damp(this.createBlend, this.mode === 'create' ? 1 : 0, 6, dt);
    this.createCxTimer -= dt;
    if (this.createCxTimer <= 0) {
      this.createCxTimer = 0.25; // the panels slide in, so the gap is re-measured a few times a second
      this.createCxTarget = this.measureCreateGap();
    }
    this.createCx = damp(this.createCx, this.createCxTarget, 5, dt);
    const k = this.createBlend;
    if (k < 0.002) {
      if (this.viewShifted) this.camera.clearViewOffset();
      this.viewShifted = false;
      return;
    }
    const w = G.engine.width || window.innerWidth;
    const h = G.engine.height || window.innerHeight;
    // three.js moves the image by -offset, so the character's middle lands at (0.5 - offset) of the screen
    const midFrac = CREATE_FEET_FRAC - CREATE_HEIGHT_FRAC / 2;
    this.camera.setViewOffset(w, h, w * (0.5 - this.createCx) * k, h * (0.5 - midFrac) * k, w, h);
    this.viewShifted = true;
  }

  /** Centre (0..1 of the canvas width) of the free space between the creation panels; 0.5 when there is no room. */
  private measureCreateGap(): number {
    const cr = this.canvasEl?.getBoundingClientRect();
    if (!cr || cr.width < 2) return 0.5;
    const rectOf = (sel: string): DOMRect | null => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r && r.width > 0 ? r : null; // display:none panels report width 0
    };
    const l = rectOf('.efs-create-l');
    const r = rectOf('.efs-create-r');
    const gapL = l ? l.right : cr.left + 12;
    const gapR = r ? r.left : cr.right - 12;
    if (gapR - gapL < cr.width * 0.2) return 0.5;
    return THREE.MathUtils.clamp(((gapL + gapR) / 2 - cr.left) / cr.width, 0.2, 0.8);
  }

  /** Creation view: hides the camp props standing between the creation camera and the shown character. */
  private syncCreateScenery(): void {
    const want = this.mode === 'create';
    if (want === this.sceneryHidden) return;
    this.sceneryHidden = want;
    if (want) {
      this.occluders = this.findOccluders();
      for (const o of this.occluders) o.visible = false;
    } else {
      for (const o of this.occluders) o.visible = true;
      this.occluders = [];
    }
  }

  private findOccluders(): THREE.Object3D[] {
    const cam = this.createCamTarget().pos;
    const feet = this.pedFeetY;
    const sight = [
      new THREE.Vector3(PEDESTAL.x, feet + 0.2, PEDESTAL.z),
      new THREE.Vector3(PEDESTAL.x, feet + this.pedHeight * 0.85, PEDESTAL.z),
    ];
    const seg = new THREE.Line3();
    const near = new THREE.Vector3();
    const out: THREE.Object3D[] = [];
    for (const obj of this.campProps) {
      let box = this.boxCache.get(obj);
      if (!box) {
        box = new THREE.Box3().setFromObject(obj);
        this.boxCache.set(obj, box);
      }
      if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE.Vector3());
      const r = box.getSize(new THREE.Vector3()).length() / 2;
      const blocks = sight.some((end) => {
        seg.set(cam, end);
        const t = seg.closestPointToPointParameter(c, true);
        if (t > 0.9) return false; // beside or behind the character, not in front of it
        seg.at(t, near);
        return near.distanceTo(c) < r + 0.35;
      });
      if (blocks) out.push(obj);
    }
    return out;
  }

  private submitCreate(rawName: string): string | null {
    const name = rawName.trim();
    const err = validateName(name, this.existingNames());
    if (err) return err;
    if (this.stands.length >= MAX_CHARACTERS) return 'Karakter yuvaları dolu.';
    let cs: CharacterState;
    try {
      cs = CharacterState.create(name, this.pedClass, this.pedVariant, this.pedNation, { beta: this.pedBeta });
    } catch (e) {
      console.error('[menu] create failed', e);
      return 'Karakter oluşturulamadı. Lütfen tekrar dene.';
    }
    if (!G.save.write(cs.save)) return 'Karakter kaydedilemedi (tarayıcı depolaması dolu olabilir).';
    this.states.set(cs.save.id, cs);
    // new stand appears with a flash, camera returns to the camp
    const st = this.makeStand(cs.save, cs.save.id);
    this.stands.push(st);
    this.layoutStands();
    st.pos.copy(st.target);
    st.group.position.copy(st.pos);
    void this.fillStand(st).then(() => {
      try {
        G.vfx.spawn('level_up', [st.pos.x, 0.2, st.pos.z], { scale: 1.0 });
      } catch {
        /* optional */
      }
    });
    this.mode = 'select';
    this.ui!.setMode('select');
    this.ui!.replayIntro();
    this.select(st, true);
    this.refreshUI();
    this.pedFlash = 1.5;
    G.audio.play('level_up');
    G.ui.toast(`${cs.save.name} ateşin başına katıldı!`, 'success');
    const a = st.visual?.anim;
    setTimeout(() => {
      const an = st.visual?.anim ?? a;
      const clip = an?.pick('Cheer');
      if (an && clip) an.playOnce(clip, { onDone: () => an.setBase(an.pick('Idle') ?? 'Idle') });
    }, 900);
    return null;
  }

  // ================================================================================================
  // Pointer + keyboard
  // ================================================================================================

  private installPointer(): void {
    const canvas = G.engine.canvas;
    this.canvasEl = canvas;
    const onMove = (e: PointerEvent) => {
      this.setNdc(e);
      if (this.downAt && this.mode === 'create') {
        const dx = e.clientX - this.downAt.x;
        if (Math.abs(dx) > 2 || this.dragging) {
          this.dragging = true;
          this.pedYawOffset += (e.clientX - (this.lastX ?? e.clientX)) * 0.012;
        }
      }
      this.lastX = e.clientX;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.downAt = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.dragging = false;
      this.lastX = e.clientX;
      this.setNdc(e);
    };
    const onUp = (e: PointerEvent) => {
      const d = this.downAt;
      this.downAt = null;
      if (!d || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (this.dragging || moved > 6) return;
      if (this.mode !== 'select' || this.ui?.modalOpen) return;
      this.setNdc(e);
      const hit = this.pick();
      if (!hit) return;
      if (hit === this.newStand) {
        this.uiSound('click');
        this.beginCreate();
      } else {
        this.select(hit);
      }
    };
    const onLeave = () => {
      this.hovered = null;
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (this.ui?.modalOpen) return;
      if (this.mode === 'select') {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          const dir = e.code === 'ArrowRight' ? 1 : -1;
          const i = this.selected ? this.stands.indexOf(this.selected) : -1;
          const n = this.stands.length;
          if (n) this.select(this.stands[(i + dir + n) % n]);
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.play();
      } else if (e.code === 'Escape') this.endCreate();
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      canvas.style.cursor = '';
    });
  }
  private lastX: number | null = null;

  private setNdc(e: PointerEvent): void {
    const r = this.canvasEl!.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(): Stand | null {
    this.ray.setFromCamera(this.ndc, this.camera);
    const list = this.allStands();
    const hits = this.ray.intersectObjects(list.map((s) => s.hit), false);
    if (!hits.length) return null;
    return list.find((s) => s.hit === hits[0].object) ?? null;
  }

  // ================================================================================================
  // Per-frame
  // ================================================================================================

  private resizeCamera(): void {
    const w = G.engine.width || window.innerWidth;
    const h = G.engine.height || window.innerHeight;
    const aspect = w / Math.max(1, h);
    if (Math.abs(this.camera.aspect - aspect) > 0.001) {
      this.camera.aspect = aspect;
      this.camera.fov = aspect < 1.2 ? 62 : 50;
      this.camera.updateProjectionMatrix();
    }
  }

  update(dt: number): void {
    if (!this.entered) return;
    this.time += dt;
    const t = this.time;
    this.resizeCamera();

    // hover (select mode only; ignore while a modal / panel owns the pointer)
    if (this.mode === 'select' && !this.ui?.modalOpen && !this.downAt) {
      this.hovered = G.input.pointerOverUI ? null : this.pick();
    } else if (this.mode !== 'select') this.hovered = null;
    if (this.canvasEl) this.canvasEl.style.cursor = this.hovered ? 'pointer' : this.mode === 'create' ? 'grab' : '';

    this.updateAtmosphere(dt, t);
    this.updateStands(dt, t);
    this.updatePedestal(dt, t);
    this.syncCreateScenery();
    this.updateCamera(dt, t);
    this.updateCreateView(dt);
    this.updatePlates();
  }

  private updateAtmosphere(dt: number, t: number): void {
    this.skyGroup.position.copy(this.camera.position);
    this.stars?.update(t);
    const fl = fireFlicker(t);
    this.fireLight.intensity = 105 * fl;
    if (this.fireGlow) {
      (this.fireGlow.material as THREE.SpriteMaterial).opacity = 0.38 + 0.2 * (fl - 0.85);
      this.fireGlow.scale.set(4.2 * (0.95 + 0.08 * fl), 3.2 * (0.95 + 0.1 * fl), 1);
    }
    for (const f of this.flames) f.update(t);
    for (let i = 0; i < this.lampLights.length; i++) this.lampLights[i].intensity = (i < 2 ? 22 : 16) * fireFlicker(t * 0.7, i * 3.3);
    for (const p of this.particles) p.update(dt, t);
    for (let i = 0; i < this.banners.length; i++) swayCloth(this.banners[i], t, 0.08, i * 2);
  }

  private updateStands(dt: number, t: number): void {
    const camPos = this.camera.position;
    for (const st of this.allStands()) {
      // slide toward the slot (re-layout after create/delete)
      const d = st.pos.distanceTo(st.target);
      st.moving = d > 0.03;
      if (st.moving) {
        const k = Math.min(1, dt * 3.2);
        const step = new THREE.Vector3().subVectors(st.target, st.pos);
        const move = Math.min(d, Math.max(d * k, dt * 0.8));
        st.pos.addScaledVector(step.normalize(), move);
        st.group.position.copy(st.pos);
      }
      const isSel = st === this.selected;
      const isHot = st === this.hovered;
      st.hover = damp(st.hover, isHot ? 1 : 0, 10, dt);
      st.sel = damp(st.sel, isSel ? 1 : 0, 7, dt);
      const energy = Math.max(st.hover * 0.85, st.sel);
      const ringMat = st.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = 0.22 + energy * 0.68 + (st.save ? 0 : 0.18 + 0.18 * Math.sin(t * 2.4));
      st.ring.rotation.z += dt * (0.3 + energy * 1.8);
      (st.glow.material as THREE.SpriteMaterial).opacity = energy * 0.55 + (st.save ? 0 : 0.14 + 0.1 * Math.sin(t * 2.4));
      (st.beam.material as THREE.MeshBasicMaterial).opacity = st.sel * (0.26 + 0.07 * Math.sin(t * 3)) + st.hover * 0.12;
      st.beam.rotation.y += dt * 0.4;
      const s = 1 + st.sel * 0.12 + (st.save ? 0 : 0.06 * Math.sin(t * 2.4));
      st.ring.scale.setScalar(s);
      if (!st.save) {
        // "new character" dais: tint blue
        ringMat.color.setHex(0x8fc4ff);
        continue;
      }
      const v = st.visual;
      if (!v) continue;
      v.highlight(st.hover * 0.2 + st.sel * 0.07, st.sel > st.hover ? 0xffd27a : 0xffe6b0);
      // face the camera when selected, otherwise face the fire; walk while re-arranging
      let wantYaw: number;
      if (st.moving) wantYaw = Math.atan2(st.target.x - st.pos.x, st.target.z - st.pos.z);
      else if (isSel) wantYaw = Math.atan2(camPos.x - st.pos.x, camPos.z - st.pos.z);
      else wantYaw = Math.atan2(FIRE_POS.x - st.pos.x, FIRE_POS.z - st.pos.z) + (isHot ? 0.0 : 0);
      st.yaw = dampAngle(st.yaw, wantYaw, 7, dt);
      v.root.rotation.y = st.yaw;
      const a = v.anim;
      if (a) {
        if (st.moving) a.setBase(a.pick('Walking_A', 'Running_A') ?? 'Idle');
        else if (!a.isPlayingOneShot) a.setBase(a.pick('Idle') ?? 'Idle');
        a.update(dt);
        // idle fidgets
        if (!st.moving && !a.isPlayingOneShot && t > st.nextFidget && !isSel) {
          st.nextFidget = t + 7 + Math.random() * 9;
          const clip = a.pick(...(Math.random() < 0.5 ? ['Interact', 'Unarmed_Idle'] : ['Cheer', 'Use_Item']));
          if (clip) a.playOnce(clip, { onDone: () => a.setBase(a.pick('Idle') ?? 'Idle') });
        }
      }
    }
  }

  private updatePedestal(dt: number, t: number): void {
    const active = this.mode === 'create';
    const ringMat = this.pedRing?.material as THREE.MeshBasicMaterial | undefined;
    if (ringMat) ringMat.opacity = damp(ringMat.opacity, active ? 0.9 : 0.28, 3, dt);
    if (this.pedRing) this.pedRing.rotation.z += dt * 0.35;
    this.pedFlash = Math.max(0, this.pedFlash - dt * 2.2);
    this.pedLight.intensity = damp(this.pedLight.intensity, active ? 40 + this.pedFlash * 120 : 8, 4, dt);
    this.pedKey.intensity = damp(this.pedKey.intensity, active ? 46 : 0, 4, dt);
    this.pedFill.intensity = damp(this.pedFill.intensity, active ? 20 : 0, 4, dt);
    const v = this.pedVisual;
    if (!v) return;
    v.root.visible = active;
    if (!active) return;
    this.pedPop = Math.min(1, this.pedPop + dt * 4.5);
    const k = this.pedPop;
    const sc = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.06 - (1 - k) * 0.12 : 1;
    v.root.scale.setScalar(sc);
    v.root.rotation.y = dampAngle(v.root.rotation.y, this.pedBaseYaw() + this.pedYawOffset, 9, dt);
    v.root.position.y = 0.64;
    const a = v.anim;
    if (!a) return;
    a.update(dt);
    const p = classPresentation(this.pedClass);
    if (!a.isPlayingOneShot && t >= this.pedNext) {
      // an empty showcase (a class without clips yet) idles instead of reading undefined.clip every frame
      const step = p.showcase.length ? p.showcase[this.pedStep % p.showcase.length] : undefined;
      this.pedStep++;
      if (step && a.has(step.clip)) {
        a.playOnce(step.clip, {
          speed: step.speed ?? 1,
          fade: 0.12,
          eventAt: step.vfx ? (step.vfxAt ?? 0.4) : undefined,
          onEvent: step.vfx
            ? () => {
                const off = step.offset ?? [0, 1.2, 1.2];
                const yaw = v.root.rotation.y;
                const wx = PEDESTAL.x + Math.sin(yaw) * off[2] + Math.cos(yaw) * off[0];
                const wz = PEDESTAL.z + Math.cos(yaw) * off[2] - Math.sin(yaw) * off[0];
                try {
                  G.vfx.spawn(step.vfx!, [wx, 0.64 + off[1], wz], { dir: [Math.sin(yaw), 0, Math.cos(yaw)], scale: step.vfxScale ?? 1 });
                } catch {
                  /* vfx optional */
                }
                if (step.sfx) G.audio.play(step.sfx, { volume: 0.5 });
                this.pedFlash = Math.max(this.pedFlash, 0.5);
              }
            : undefined,
          onDone: () => {
            a.setBase(a.pick(p.idle, 'Idle') ?? 'Idle');
            this.pedNext = this.time + 0.9 + Math.random() * 0.6;
          },
        });
      } else this.pedNext = t + 1;
    }
  }

  private updateCamera(dt: number, t: number): void {
    let wantPos: THREE.Vector3;
    let wantLook: THREE.Vector3;
    const lambda = this.mode === 'create' ? 2.6 : 2.2;
    if (this.mode === 'create') {
      const c = this.createCamTarget();
      wantPos = c.pos;
      wantLook = c.look;
    } else {
      // slow cinematic orbit + gentle handheld sway; pushes toward the selected hero
      const az = Math.sin(t * 0.11) * 0.3 + Math.sin(t * 0.047) * 0.08;
      const aspect = this.camera.aspect;
      const r = (aspect < 1.4 ? 16 : 12.6) - this.stands.length * 0.0 - (this.selected ? 1.3 : 0);
      const h = 3.1 + Math.sin(t * 0.17) * 0.3;
      const sx = this.selected ? this.selected.pos.x * 0.32 : 0;
      wantPos = new THREE.Vector3(Math.sin(az) * r + sx * 0.6, h + (this.selected ? -0.25 : 0), -1.5 + Math.cos(az) * r);
      wantLook = new THREE.Vector3(sx, 2.15, -4.6);
      wantPos.x += Math.sin(t * 0.63) * 0.05;
      wantPos.y += Math.sin(t * 0.81) * 0.04;
    }
    this.camPos.x = damp(this.camPos.x, wantPos.x, lambda, dt);
    this.camPos.y = damp(this.camPos.y, wantPos.y, lambda, dt);
    this.camPos.z = damp(this.camPos.z, wantPos.z, lambda, dt);
    this.camLook.x = damp(this.camLook.x, wantLook.x, lambda * 1.2, dt);
    this.camLook.y = damp(this.camLook.y, wantLook.y, lambda * 1.2, dt);
    this.camLook.z = damp(this.camLook.z, wantLook.z, lambda * 1.2, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private updatePlates(): void {
    const ui = this.ui;
    if (!ui) return;
    if (this.mode !== 'select') return;
    const w = G.engine.width || window.innerWidth;
    const h = G.engine.height || window.innerHeight;
    const p = new THREE.Vector3();
    for (const st of this.allStands()) {
      p.set(st.pos.x, st.save ? 3.0 : 1.5, st.pos.z);
      const s = projectToScreen(p, this.camera, w, h);
      if (!s) {
        ui.updatePlate(st.key, { x: 0, y: 0, visible: false, hot: false });
        continue;
      }
      const hot = st === this.hovered || st === this.selected;
      ui.updatePlate(st.key, { x: s.x, y: s.y, visible: !ui.modalOpen, hot });
    }
  }

  // ================================================================================================

  exit(): void {
    this.unsubImported?.();
    this.unsubImported = null;
    for (const c of this.cleanup) c();
    this.cleanup = [];
    this.ui?.dispose();
    this.ui = null;
    this.pedVisual?.dispose();
    this.pedVisual = null;
    this.occluders = [];
    this.boxCache.clear();
    for (const st of this.allStands()) st.visual?.dispose();
    for (const p of this.particles) p.dispose();
    this.particles = [];
    disposeSkeletons(this.scene);
    disposeOwned(this.scene);
    this.scene.clear();
    this.entered = false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}


/** True when (x,z) is within `r` of the pedestal or of the creation camera path (keep both clear of scenery). */
function nearPedestalView(x: number, z: number, r: number): boolean {
  if (Math.hypot(x - PEDESTAL.x, z - PEDESTAL.z) < r) return true;
  // camera sits ~7 m from the pedestal toward +z/+x
  return Math.hypot(x - (PEDESTAL.x + 2.6), z - (PEDESTAL.z + 6.5)) < r * 0.75 + 1.5;
}
