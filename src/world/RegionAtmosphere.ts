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

/**
 * Look of one region (Trove-style palette pass). Colours are hex; a missing field keeps the region's own layout value.
 * fog / zenith / horizon / sunColor replace the layout colour, sunMul and hemiMul scale the layout intensity, sat and contrast
 * are the colour grade (Engine.setGrade, 1 = none), exposure is the tone-mapping exposure, farMul scales the fog distance.
 */
export interface RegionLook {
  fog?: number;
  farMul?: number;
  zenith?: number;
  horizon?: number;
  sunColor?: number;
  sunMul?: number;
  hemiMul?: number;
  sat?: number;
  contrast?: number;
  exposure?: number;
}

/** Look of a region without a preset, and of the fields a preset leaves out: a clean, slightly brighter grade only. */
export const GENERIC_LOOK: RegionLook = { sat: 1.14, contrast: 1.04, exposure: 1.04, hemiMul: 1.1 };

/**
 * Region looks, keyed by region id. Sisli Vadi uses r1..r6, Karakir (karakir_world) r7..r12 and Ayaz Daglari (ayaz_daglari) r16..r21.
 * Each region has its own palette so zones read apart at a glance: bright saturated meadows (r1, r2, r7), dusty warm steppes (r3, r8,
 * r9, r11), the green murky swamp (r4, a dense mist and a short view), the canyon red-gold (r5), the corrupted purple ruins (r6) and
 * the cold blue mountains (r10, r12, r16..r21). The distance values only shrink or keep the layout fog far (farMul <= 1) so the draw
 * distance and FPS do not grow with the look. Every look is data: a missing field keeps the layout value.
 */
export const TROVE_LOOK: Record<string, RegionLook> = {
  // Sisli Vadi
  r1: { fog: 0xb4e8f0, zenith: 0x2f8fe8, horizon: 0xd6f7ff, sunColor: 0xfff3c4, sunMul: 1.4, hemiMul: 1.3, sat: 1.3, contrast: 1.08, exposure: 1.1 },
  r2: { fog: 0xffe2a0, zenith: 0x3d8ee6, horizon: 0xfff0c0, sunColor: 0xffd070, sunMul: 1.5, hemiMul: 1.3, sat: 1.28, contrast: 1.07, exposure: 1.1 },
  r3: { fog: 0xd8b48a, zenith: 0x6f8fb0, horizon: 0xe8c89a, sunColor: 0xffb878, sunMul: 1.35, hemiMul: 1.2, farMul: 0.9, sat: 1.05, contrast: 1.05, exposure: 1.05 },
  r4: { fog: 0x5a7a58, zenith: 0x3f5a4a, horizon: 0x9ab89a, sunColor: 0xc8e0b0, sunMul: 0.75, hemiMul: 0.85, farMul: 0.6, sat: 0.85, contrast: 1.08, exposure: 0.98 },
  r5: { fog: 0xffa870, zenith: 0x3f7fd8, horizon: 0xffb880, sunColor: 0xffb060, sunMul: 1.45, hemiMul: 1.2, sat: 1.28, contrast: 1.08, exposure: 1.06 },
  r6: { fog: 0xa070e0, zenith: 0x4a2a9a, horizon: 0xd8a8ff, sunColor: 0xe0b0ff, sunMul: 1.0, hemiMul: 1.15, sat: 1.3, contrast: 1.06, exposure: 1.02 },
  // Karakir Bozkiri
  r7: { fog: 0xcfeab0, zenith: 0x3f9ae0, horizon: 0xf4f8c8, sunColor: 0xfff0b0, sunMul: 1.4, hemiMul: 1.3, sat: 1.28, contrast: 1.06, exposure: 1.08 },
  r8: { fog: 0xd49a68, zenith: 0x5a7ab0, horizon: 0xf0b888, sunColor: 0xffa860, sunMul: 1.45, hemiMul: 1.2, farMul: 0.9, sat: 1.1, contrast: 1.08, exposure: 1.06 },
  r9: { fog: 0xc4b89a, zenith: 0x5c86b8, horizon: 0xe6d4aa, sunColor: 0xffe0a0, sunMul: 1.3, hemiMul: 1.2, farMul: 0.95, sat: 1.0, contrast: 1.04, exposure: 1.04 },
  r10: { fog: 0xaccbe0, zenith: 0x3f70b8, horizon: 0xd8e8f8, sunColor: 0xe8f2ff, sunMul: 1.1, hemiMul: 1.25, farMul: 0.95, sat: 0.95, contrast: 1.05, exposure: 1.04 },
  r11: { fog: 0xa39c8c, zenith: 0x6a7080, horizon: 0xc4b8a4, sunColor: 0xe8d8b8, sunMul: 1.05, hemiMul: 1.1, farMul: 0.8, sat: 0.85, contrast: 1.06, exposure: 1.02 },
  r12: { fog: 0x9cbcd8, zenith: 0x3468b0, horizon: 0xd0e2f4, sunColor: 0xf0f6ff, sunMul: 1.15, hemiMul: 1.25, farMul: 0.9, sat: 0.95, contrast: 1.07, exposure: 1.04 },
  // Ayaz Daglari (cold blue mountains)
  r16: { fog: 0xa8c8e8, zenith: 0x3a68b0, horizon: 0xdceeff, sunColor: 0xf4f8ff, sunMul: 1.1, hemiMul: 1.25, sat: 0.95, contrast: 1.06, exposure: 1.04 },
  r17: { fog: 0x9ec0d8, zenith: 0x3560a8, horizon: 0xd0e4f4, sunColor: 0xe8f0ff, sunMul: 1.05, hemiMul: 1.2, farMul: 0.9, sat: 0.92, contrast: 1.05, exposure: 1.04 },
  r18: { fog: 0xb0d0e8, zenith: 0x4a78c0, horizon: 0xe0f0ff, sunColor: 0xf0f8ff, sunMul: 1.15, hemiMul: 1.25, sat: 0.98, contrast: 1.06, exposure: 1.05 },
  r19: { fog: 0x8fa8c4, zenith: 0x2e4f8a, horizon: 0xc0d4ec, sunColor: 0xdce8f8, sunMul: 1.0, hemiMul: 1.1, farMul: 0.85, sat: 0.9, contrast: 1.08, exposure: 1.02 },
  r20: { fog: 0x8aa4c4, zenith: 0x2a4a88, horizon: 0xb4c8e4, sunColor: 0xd4e0f4, sunMul: 0.95, hemiMul: 1.1, farMul: 0.8, sat: 0.9, contrast: 1.06, exposure: 1.02 },
  r21: { fog: 0xa8bcd8, zenith: 0x3c62aa, horizon: 0xd8e6f8, sunColor: 0xf4f8ff, sunMul: 1.1, hemiMul: 1.25, farMul: 0.95, sat: 0.96, contrast: 1.06, exposure: 1.04 },
};

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
  /** colour grade and exposure of the look (weighted like the colours) */
  sat: number;
  contrast: number;
  exposure: number;
}

/**
 * Look pass on the region fog: the tint (hue) stays, the colour gets a little more saturated and less milky (lighter fog
 * washed out the enemies), and the fog starts later so the nearby world stays crisp.
 */
function fogLook(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // WoW clarity: a lighter haze (+6 % lightness) and 35 % farther fog (see atmoOf), so the enemies and telegraphs read at range
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.min(1, hsl.l * 0.9 + 0.06));
}

export function atmoOf(t: RegionTheme, look: RegionLook = GENERIC_LOOK): Atmo {
  const fog = look.fog !== undefined ? new THREE.Color(look.fog) : fogLook(new THREE.Color(t.fogColor));
  const hemiSky = new THREE.Color(t.hemiSky);
  const far = t.fogFar * 1.35 * (look.farMul ?? 1);
  return {
    fog, near: Math.min(t.fogNear * 1.6, far * 0.6), far,
    hemiSky, hemiGround: new THREE.Color(t.hemiGround), hemiI: t.hemiIntensity * (look.hemiMul ?? 1),
    sunC: new THREE.Color(look.sunColor ?? t.sunColor), sunI: t.sunIntensity * (look.sunMul ?? 1),
    zen: new THREE.Color(look.zenith ?? t.skyZenith), mid: fog.clone().lerp(hemiSky, 0.35), hor: new THREE.Color(look.horizon ?? t.skyHorizon),
    cloudL: fog.clone().lerp(new THREE.Color(0xffffff), 0.45), cloudS: fog.clone().multiplyScalar(0.55),
    sat: look.sat ?? 1, contrast: look.contrast ?? 1, exposure: look.exposure ?? 1,
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
  a.sat = 0;
  a.contrast = 0;
  a.exposure = 0;
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
    out.sat += a.sat * w;
    out.contrast += a.contrast * w;
    out.exposure += a.exposure * w;
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
    for (const r of regions) this.themes.set(r.id, { region: r, atmo: atmoOf(r.theme, { ...GENERIC_LOOK, ...TROVE_LOOK[r.id] }) });
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
