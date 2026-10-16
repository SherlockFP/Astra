import * as THREE from 'three';
import { setHouseWindowLevel } from './HouseKit';
import { setCrystalGlowLevel } from './MagitechKit';
import { glowTexture } from './ProceduralAssets';
import { makeSkyColorSet, type Sky, type SkyColorSet } from './Sky';
import { sampleDay, setDayOverride, dayOverride, type DaySample } from './DayCycle';
import { grassUniforms } from './GrassField';
import { G } from '../game/G';

/**
 * Night side of the world clock (DayCycle.ts). Each NightLight blends the day values of its scene toward a night look by the
 * clock's night weight: the sun turns into a cold moon (its direction follows the arc of the clock and the builder's azimuth),
 * the hemisphere light becomes a blue moon-ambient floor (silhouettes stay readable instead of going black), the sky, fog and
 * clouds take a deep blue at night and a warm tint at dusk and dawn, the grade loses a little saturation at night, the house
 * windows and crystal lamps glow more, and every crystal lamp lays a warm additive light pool on the ground (no real PointLights).
 *
 * Region palettes stay on top: the night colours mix in at 80 % of the night weight, so a region keeps a hint of its own hue.
 *
 * The day base is what the scene holds before this pass. A builder that rewrites its lights every frame (WorldDecor's region
 * atmosphere) sets `fresh: true` so the base is re-read each frame; a static scene (TownBuilder) reads it once.
 */

/** Night preview switch (dev `?night=1`, window.__astraNight): pins the clock to 01:00, or back to 13:00 when off. */
export function setNightPreview(on: boolean): void {
  setDayOverride(on ? 1 : 13);
}

/** True while the clock is pinned to night (the preview). */
export function isNightPreview(): boolean {
  return dayOverride() === 1;
}

const NIGHT_HEMI_SKY = new THREE.Color(0x6f8fd8);
const NIGHT_HEMI_GROUND = new THREE.Color(0x262e4c);
const NIGHT_HEMI_I = 1.15;
const MOON = new THREE.Color(0xa8c4ff);
const MOON_I = 0.8; // moon key: shadows and silhouettes stay readable at night
const NIGHT_FOG = new THREE.Color(0x203a6a); // dark blue, not black: the night stays playable
const NIGHT_SKY: SkyColorSet = {
  zenith: new THREE.Color(0x0a1230), mid: new THREE.Color(0x1c2c5a), horizon: new THREE.Color(0x2b3d6e), sunColor: new THREE.Color(0xcbd9ff),
  cloudLight: new THREE.Color(0x5f6e9c), cloudShade: new THREE.Color(0x1a2442), cover: 0,
};
const SUNSET_SUN = new THREE.Color(0xffb070);
const SUNSET_FOG = new THREE.Color(0xffa070); // golden dusk / dawn haze
const SUNSET_HORIZON = new THREE.Color(0xff9d6a);
const SUNSET_CLOUD = new THREE.Color(0xffc9a0);
/** Night colours reach this share of the night weight (the rest keeps the region palette). */
const NIGHT_MIX = 0.8;
/** Grade at full night: saturation, contrast, exposure factors. */
const NIGHT_SAT = 0.9, NIGHT_CONTRAST = 0.96, NIGHT_EXPOSURE = 1.12;
const POOL_COLOR = 0xffb866;
const POOL_RADIUS = 4.6;

let poolTex: THREE.Texture | null = null;

export interface NightRig {
  scene: THREE.Scene;
  hemi?: THREE.HemisphereLight | null;
  sun?: THREE.DirectionalLight | null;
  sky?: Sky | null;
  /** The scene rewrites its lights before every apply() (region atmosphere): re-read the day base each frame. */
  fresh?: boolean;
}

interface DayBase {
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number;
  sunC: THREE.Color; sunI: number;
  fog: THREE.Color; bg: THREE.Color;
  sky: SkyColorSet;
  sat: number; contrast: number; exposure: number;
}

function makeBase(): DayBase {
  return {
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 0,
    sunC: new THREE.Color(), sunI: 0,
    fog: new THREE.Color(), bg: new THREE.Color(),
    sky: makeSkyColorSet(),
    sat: 1, contrast: 1, exposure: 1,
  };
}

export class NightLight {
  private readonly base = makeBase();
  private haveBase = false;
  private readonly fresh: boolean;
  private pools: THREE.InstancedMesh | null = null;
  private poolMat: THREE.MeshBasicMaterial | null = null;
  private readonly s: DaySample = { hour: 0, dayW: 1, nightW: 0, warm: 0, arc: 1 };
  /** Sun direction at the builder's time (unit, toward the sun) and its distance: captured once. */
  private readonly sunBaseDir = new THREE.Vector3(0, 1, 0);
  private readonly sunDirNow = new THREE.Vector3();
  private readonly moonDir = new THREE.Vector3(0, 1, 0);
  private readonly lightDir = new THREE.Vector3();
  private sunDist = 0;
  private haveSunDir = false;
  private readonly skyOut = makeSkyColorSet();
  private readonly gradeOut = { sat: 1, contrast: 1, exposure: 1 };

  constructor(private readonly rig: NightRig) {
    this.fresh = rig.fresh ?? false;
  }

  /** Lays a warm ground light pool under each lamp spot (x, groundY, z). Pools fade in with the night. */
  addPools(parent: THREE.Object3D, spots: [number, number, number][]): void {
    if (!spots.length) return;
    poolTex ??= glowTexture(64, 8, 1.2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: POOL_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, opacity: 0 });
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

  /** Reads the day base from the scene (see the class comment). */
  private capture(): void {
    const { hemi, sun, sky, scene } = this.rig;
    const b = this.base;
    if (hemi) {
      b.hemiSky.copy(hemi.color);
      b.hemiGround.copy(hemi.groundColor);
      b.hemiI = hemi.intensity;
    }
    if (sun) {
      b.sunC.copy(sun.color);
      b.sunI = sun.intensity;
      if (!this.haveSunDir) {
        // the builder's sun direction is kept: the clock only moves it along the arc and turns it into the moon at night
        this.sunBaseDir.copy(sun.position).sub(sun.target.position);
        this.sunDist = this.sunBaseDir.length();
        if (this.sunDist > 1e-6) this.sunBaseDir.divideScalar(this.sunDist);
        else this.sunBaseDir.set(0, 1, 0);
        this.sunDist = this.sunDist > 1e-6 ? this.sunDist : 50;
        const hl = Math.hypot(this.sunBaseDir.x, this.sunBaseDir.z);
        const mx = hl > 1e-4 ? -this.sunBaseDir.x / hl : -1;
        const mz = hl > 1e-4 ? -this.sunBaseDir.z / hl : 0;
        this.moonDir.set(mx * 0.8, 0.6, mz * 0.8).normalize();
        this.haveSunDir = true;
      }
    }
    const fog = scene.fog as THREE.Fog | null;
    if (fog) b.fog.copy(fog.color);
    const bg = scene.background as THREE.Color | null;
    if (bg && bg.isColor) b.bg.copy(bg);
    if (sky) sky.snapshotInto(b.sky);
    G.engine?.currentGrade(this.gradeOut);
    b.sat = this.gradeOut.sat;
    b.contrast = this.gradeOut.contrast;
    b.exposure = this.gradeOut.exposure;
    this.haveBase = true;
  }

  /** Per-frame: blends the scene from the day base toward the night look by the clock's night weight. */
  apply(): void {
    const { hemi, sun, sky, scene } = this.rig;
    const s = sampleDay(this.s);
    if (this.fresh || !this.haveBase) this.capture();
    const b = this.base;
    const w = s.nightW;
    const n = w * NIGHT_MIX;
    const warm = s.warm;

    if (hemi) {
      hemi.color.copy(b.hemiSky).lerp(NIGHT_HEMI_SKY, n);
      hemi.groundColor.copy(b.hemiGround).lerp(NIGHT_HEMI_GROUND, n);
      hemi.intensity = b.hemiI + (NIGHT_HEMI_I - b.hemiI) * n;
    }
    if (sun) {
      sun.color.copy(b.sunC).lerp(SUNSET_SUN, warm * 0.55).lerp(MOON, w);
      sun.intensity = b.sunI * s.dayW + MOON_I * w;
      if (this.haveSunDir) this.placeSun(sun, s);
    }

    const fog = scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(b.fog).lerp(SUNSET_FOG, warm * 0.24).lerp(NIGHT_FOG, n);
    const bg = scene.background as THREE.Color | null;
    if (bg && bg.isColor) bg.copy(b.bg).lerp(SUNSET_FOG, warm * 0.24).lerp(NIGHT_FOG, n);

    if (sky) {
      const o = this.skyOut, sb = b.sky;
      o.zenith.copy(sb.zenith).lerp(NIGHT_SKY.zenith, n);
      o.mid.copy(sb.mid).lerp(NIGHT_SKY.mid, n);
      o.horizon.copy(sb.horizon).lerp(SUNSET_HORIZON, warm * 0.5).lerp(NIGHT_SKY.horizon, n);
      o.sunColor.copy(sb.sunColor).lerp(SUNSET_SUN, warm * 0.55).lerp(NIGHT_SKY.sunColor, n);
      o.cloudLight.copy(sb.cloudLight).lerp(SUNSET_CLOUD, warm * 0.4).lerp(NIGHT_SKY.cloudLight, n);
      o.cloudShade.copy(sb.cloudShade).lerp(NIGHT_SKY.cloudShade, n);
      o.cover = sb.cover;
      sky.copyColors(o);
    }

    if (G.engine) {
      const g = this.gradeOut;
      g.sat = b.sat * (1 - (1 - NIGHT_SAT) * n);
      g.contrast = b.contrast * (1 - (1 - NIGHT_CONTRAST) * n);
      g.exposure = b.exposure * (1 + (NIGHT_EXPOSURE - 1) * n);
      G.engine.setGrade(g);
    }

    setCrystalGlowLevel(w);
    setHouseWindowLevel(w);
    grassUniforms.uNight.value = w;
    if (this.pools) {
      this.pools.visible = w > 0.01;
      if (this.poolMat) this.poolMat.opacity = w;
    }
  }

  /** Sun direction: the builder's azimuth with the clock's arc height, blended to the moon at night. */
  private placeSun(sun: THREE.DirectionalLight, s: DaySample): void {
    const sd = this.sunBaseDir;
    const hl = Math.hypot(sd.x, sd.z);
    const ux = hl > 1e-4 ? sd.x / hl : 1;
    const uz = hl > 1e-4 ? sd.z / hl : 0;
    const y = Math.max(0.05, sd.y * s.arc);
    const horiz = Math.sqrt(Math.max(0, 1 - y * y));
    this.sunDirNow.set(ux * horiz, y, uz * horiz);
    this.lightDir.copy(this.sunDirNow).lerp(this.moonDir, s.nightW).normalize();
    const target = sun.target.position;
    sun.position.set(target.x + this.lightDir.x * this.sunDist, target.y + this.lightDir.y * this.sunDist, target.z + this.lightDir.z * this.sunDist);
  }

  dispose(): void {
    this.pools?.geometry.dispose();
    this.poolMat?.dispose();
    this.pools?.removeFromParent();
    this.pools = null;
  }
}
