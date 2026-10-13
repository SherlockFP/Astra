import * as THREE from 'three';
import { TILE_SIZE, type RegionTheme, type WorldRegion } from '../types/dungeons';
import type { VfxId } from '../types/vfx';

/**
 * Open-world region atmosphere (GDD_OPENWORLD §1.5.4, §8.1). Fog colour / near / far, hemisphere and sun colours, the sky colours
 * and the ambient VFX mix follow the player's POSITION rather than the moment a region changes. Every frame the regions around
 * the player are weighted by a smooth kernel over the tile map (1 m lattice, kernel radius blendM / 2). Deep inside a region its
 * own theme is used; across a border the two themes mix over blendM metres (default 20 m, 10 m on each side), so crossing from
 * R1 into R2 warms the fog gradually instead of popping. There is no travel state, so a teleport lands directly in the new mix.
 * Bridges, islands and the void carry no region and do not vote; the last blend is held there. OWNER: world module.
 */

/** Total width (m) of the blend window across a region border. Regions can override it with `WorldRegion.blendM`. */
export const DEFAULT_BLEND_M = 20;

const T = TILE_SIZE;

/** Resolved state of one theme, or of a blend of themes. Colours are linear working-space values (three.js). */
export interface Atmo {
  fog: THREE.Color;
  near: number;
  far: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  sunC: THREE.Color;
  sunI: number;
  zen: THREE.Color;
  mid: THREE.Color;
  hor: THREE.Color;
  cloudL: THREE.Color;
  cloudS: THREE.Color;
}

export function atmoOf(t: RegionTheme): Atmo {
  const fog = new THREE.Color(t.fogColor);
  const hemiSky = new THREE.Color(t.hemiSky);
  return {
    fog, near: t.fogNear, far: t.fogFar,
    hemiSky, hemiGround: new THREE.Color(t.hemiGround), hemiI: t.hemiIntensity,
    sunC: new THREE.Color(t.sunColor), sunI: t.sunIntensity,
    zen: new THREE.Color(t.skyZenith), mid: fog.clone().lerp(hemiSky, 0.35), hor: new THREE.Color(t.skyHorizon),
    cloudL: fog.clone().lerp(new THREE.Color(0xffffff), 0.45), cloudS: fog.clone().multiplyScalar(0.55),
  };
}

interface Part {
  region: WorldRegion;
  atmo: Atmo;
  /** normalised weight of this region at the sampled position (all parts sum to 1) */
  w: number;
}

function zeroAtmo(a: Atmo): void {
  for (const c of [a.fog, a.hemiSky, a.hemiGround, a.sunC, a.zen, a.mid, a.hor, a.cloudL, a.cloudS]) {
    c.r = 0;
    c.g = 0;
    c.b = 0;
  }
  a.near = 0;
  a.far = 0;
  a.hemiI = 0;
  a.sunI = 0;
}

function addColor(out: THREE.Color, c: THREE.Color, w: number): void {
  out.r += c.r * w;
  out.g += c.g * w;
  out.b += c.b * w;
}

/** out = sum of (part atmosphere * weight). With a single part of weight 1 this is a plain copy. */
function blendInto(out: Atmo, parts: readonly Part[]): void {
  zeroAtmo(out);
  for (const p of parts) {
    const a = p.atmo;
    const w = p.w;
    addColor(out.fog, a.fog, w);
    out.near += a.near * w;
    out.far += a.far * w;
    addColor(out.hemiSky, a.hemiSky, w);
    addColor(out.hemiGround, a.hemiGround, w);
    out.hemiI += a.hemiI * w;
    addColor(out.sunC, a.sunC, w);
    out.sunI += a.sunI * w;
    addColor(out.zen, a.zen, w);
    addColor(out.mid, a.mid, w);
    addColor(out.hor, a.hor, w);
    addColor(out.cloudL, a.cloudL, w);
    addColor(out.cloudS, a.cloudS, w);
  }
}

export class RegionAtmosphere {
  /** The blend for the last sampled position. Fog, lights and sky are written from it every frame. */
  readonly cur: Atmo;
  /** Region with the largest weight at the last sample (null before the first sample and over the void). */
  dominant: WorldRegion | null = null;

  private readonly half: number;
  private readonly themes = new Map<string, { region: WorldRegion; atmo: Atmo }>();
  private readonly acc = new Map<string, number>();
  private parts: Part[] = [];

  /**
   * @param regs      region per room index (null for bridges, approaches and islands)
   * @param tileRoom  room index of a tile, -1 outside the map
   * @param fallback  theme used before any region has been sampled (maps without region themes keep the dungeon's own look)
   */
  constructor(
    private readonly regs: readonly (WorldRegion | null)[],
    private readonly tileRoom: (i: number, j: number) => number,
    regions: readonly WorldRegion[],
    fallback: RegionTheme,
    blendM: number = DEFAULT_BLEND_M,
  ) {
    this.cur = atmoOf(fallback);
    this.half = Math.max(2, blendM) / 2;
    for (const r of regions) this.themes.set(r.id, { region: r, atmo: atmoOf(r.theme) });
  }

  /** Samples the blend at a world position (metres). Cheap: about 300 tile lookups at the default window. */
  update(x: number, z: number): void {
    const R = this.half;
    const R2 = R * R;
    const acc = this.acc;
    acc.clear();
    let total = 0;
    const gz0 = Math.floor(z - R);
    const gz1 = Math.ceil(z + R);
    const gx1 = Math.ceil(x + R);
    for (let gx = Math.floor(x - R); gx <= gx1; gx++) {
      const dx = gx - x;
      const i = Math.floor(gx / T);
      for (let gz = gz0; gz <= gz1; gz++) {
        const dz = gz - z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R2) continue;
        // smooth compact kernel: zero slope at the rim, so the blend has no visible knee
        const k = 1 - d2 / R2;
        const w = k * k;
        const room = this.tileRoom(i, Math.floor(gz / T));
        const reg = room >= 0 ? this.regs[room] : null;
        if (!reg) continue;
        acc.set(reg.id, (acc.get(reg.id) ?? 0) + w);
        total += w;
      }
    }
    if (total <= 1e-9) return; // bridge, island or void: hold the last blend

    const parts = this.parts;
    parts.length = 0;
    let best = -1;
    for (const [id, a] of acc) {
      const e = this.themes.get(id);
      if (!e) continue;
      const w = a / total;
      parts.push({ region: e.region, atmo: e.atmo, w });
      if (w > best) {
        best = w;
        this.dominant = e.region;
      }
    }
    if (parts.length) blendInto(this.cur, parts);
  }

  /**
   * One ambient VFX spawn. Regions with a theme ambience are picked with their blend weight, so the mix fades across a border
   * instead of switching. `roll` is a uniform value in [0, 1). Null when no weighted region has an ambience.
   */
  pickAmbient(roll: number): { id: VfxId; color?: number } | null {
    let total = 0;
    for (const p of this.parts) if (p.region.theme.ambientVfx) total += p.w;
    if (total <= 0) return null;
    let pick: Part | null = null;
    let t = roll * total;
    for (const p of this.parts) {
      if (!p.region.theme.ambientVfx) continue;
      pick = p;
      if (t < p.w) break;
      t -= p.w;
    }
    const id = pick?.region.theme.ambientVfx;
    if (!pick || !id) return null;
    const color = pick.region.theme.ambientColor;
    return color !== undefined ? { id, color } : { id };
  }
}
