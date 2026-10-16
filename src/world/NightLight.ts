import * as THREE from 'three';
import { setHouseWindowLevel } from './HouseKit';
import { glowTexture } from './ProceduralAssets';
import type { Sky } from './Sky';

/**
 * Night preview for the hub and the open-world villages. The game has no day/night cycle yet, so this is a dev switch
 * (setNightPreview, wired to window.__astraNight by dev/scenes.html). At night the sun becomes a cold moon, the hemisphere light
 * turns into a blue moon-ambient floor (silhouettes stay readable instead of going black), the sky and fog take a deep blue, the
 * house windows light up and every crystal lamp lays a warm additive light pool on the ground (no real PointLights).
 *
 * Each builder owns one NightLight and calls apply() at the end of its update(): the day values are snapshotted when the night
 * starts and put back when it ends, and while it lasts the night values are written after the atmosphere, so they win.
 */

let nightOn = false;

/** Turns the night preview on or off for every NightLight (takes effect on their next apply()). */
export function setNightPreview(on: boolean): void {
  nightOn = on;
  setHouseWindowLevel(on ? 1 : 0);
}

export function isNightPreview(): boolean {
  return nightOn;
}

const NIGHT_SKY = 0x6f8fd8;
const NIGHT_GROUND = 0x262e4c;
const NIGHT_HEMI_I = 1.15;
const MOON = 0xa8c4ff;
const MOON_I = 0.6;
const NIGHT_FOG = 0x1d2846;
const NIGHT_SKY_COLS = { zenith: 0x0a1230, mid: 0x1c2c5a, horizon: 0x2b3d6e, sunColor: 0xcbd9ff, cloudLight: 0x5f6e9c, cloudShade: 0x1a2442 };
const POOL_COLOR = 0xffb866;
const POOL_RADIUS = 4.6;

export interface NightRig {
  scene: THREE.Scene;
  hemi?: THREE.HemisphereLight | null;
  sun?: THREE.DirectionalLight | null;
  sky?: Sky | null;
}

interface Snapshot {
  hemiColor: THREE.Color; hemiGround: THREE.Color; hemiI: number;
  sunColor: THREE.Color; sunI: number;
  fog: THREE.Color | null; bg: THREE.Color | null;
  sky: ReturnType<Sky['snapshotColors']> | null;
}

let poolTex: THREE.Texture | null = null;

export class NightLight {
  private snap: Snapshot | null = null;
  private pools: THREE.InstancedMesh | null = null;
  private poolMat: THREE.MeshBasicMaterial | null = null;

  constructor(private readonly rig: NightRig) {}

  /** Lays a warm ground light pool under each lamp spot (x, groundY, z). Pools are hidden until the night preview is on. */
  addPools(parent: THREE.Object3D, spots: [number, number, number][]): void {
    if (!spots.length) return;
    poolTex ??= glowTexture(64, 8, 1.2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: POOL_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const geo = new THREE.PlaneGeometry(POOL_RADIUS * 2, POOL_RADIUS * 2);
    geo.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(geo, this.poolMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y + 0.08, z);
      this.pools!.setMatrixAt(i, m);
    });
    this.pools.instanceMatrix.needsUpdate = true;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 4;
    this.pools.visible = false;
    parent.add(this.pools);
  }

  /** Per-frame: writes the night values while the preview is on, restores the day values when it ends. */
  apply(): void {
    const { hemi, sun, sky, scene } = this.rig;
    if (nightOn) {
      if (!this.snap) {
        this.snap = {
          hemiColor: hemi ? hemi.color.clone() : new THREE.Color(), hemiGround: hemi ? hemi.groundColor.clone() : new THREE.Color(), hemiI: hemi?.intensity ?? 0,
          sunColor: sun ? sun.color.clone() : new THREE.Color(), sunI: sun?.intensity ?? 0,
          fog: (scene.fog as THREE.Fog | null)?.color.clone() ?? null,
          bg: (scene.background as THREE.Color | null)?.isColor ? (scene.background as THREE.Color).clone() : null,
          sky: sky ? sky.snapshotColors() : null,
        };
      }
      if (hemi) {
        hemi.color.setHex(NIGHT_SKY);
        hemi.groundColor.setHex(NIGHT_GROUND);
        hemi.intensity = NIGHT_HEMI_I;
      }
      if (sun) {
        sun.color.setHex(MOON);
        sun.intensity = MOON_I;
      }
      const fog = scene.fog as THREE.Fog | null;
      if (fog) fog.color.setHex(NIGHT_FOG);
      const bg = scene.background as THREE.Color | null;
      if (bg && bg.isColor) bg.setHex(NIGHT_FOG);
      sky?.setColors(NIGHT_SKY_COLS);
      if (this.pools) this.pools.visible = true;
      return;
    }
    if (this.pools) this.pools.visible = false;
    const s = this.snap;
    if (!s) return;
    this.snap = null;
    if (hemi && s) {
      hemi.color.copy(s.hemiColor);
      hemi.groundColor.copy(s.hemiGround);
      hemi.intensity = s.hemiI;
    }
    if (sun) {
      sun.color.copy(s.sunColor);
      sun.intensity = s.sunI;
    }
    const fog = scene.fog as THREE.Fog | null;
    if (fog && s.fog) fog.color.copy(s.fog);
    const bg = scene.background as THREE.Color | null;
    if (bg && bg.isColor && s.bg) bg.copy(s.bg);
    if (sky && s.sky) sky.setColors(s.sky);
  }

  dispose(): void {
    this.pools?.geometry.dispose();
    this.poolMat?.dispose();
    this.pools?.removeFromParent();
    this.pools = null;
  }
}
