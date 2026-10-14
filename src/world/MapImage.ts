/**
 * Open-world zone map image (PURE: no DOM, no canvas). OWNER: world module (engine).
 *
 * The minimap and the map panel of a big open-world zone draw THIS image instead of the nav grid: the nav is filled lazily per streamed
 * chunk, so a nav-based picture is mostly empty there. Everything is read from the zone DATA: the tile grid, region rooms with their
 * tint and snow cover, the ground splat ops of WorldScenery (roads, villages, camps, metin scorch, lake shores, region patches), the
 * roads, water, villages and landmarks themselves, the region borders, and the relief height grid (world/Relief.ts) as hill shading.
 *
 * One pixel = `mpp` metres (2 m for a 1.6 km zone), at most MAP_MAX_PX_SIDE pixels per side, row 0 = north (z = 0), the image origin is
 * world (0, 0). Deterministic: the same def and relief give the same bytes on every peer (no clock, no Math.random).
 */
import { TILE_SIZE, type DungeonDef, type RoadDef } from '../types/dungeons';
import { paintSplatChunk } from './chunks/SplatPaint';
import { TileNoise } from './ProceduralAssets';
import { buildRelief, type Relief } from './Relief';
import { regionsByRoom, tileCentre, worldSplatOps, worldTintRGB } from './WorldScenery';

const T = TILE_SIZE;

/** Largest image side in pixels (a 4 km zone is then 4 m per pixel). */
export const MAP_MAX_PX_SIDE = 1024;
/** Finest resolution: metres per pixel. */
export const MAP_MIN_MPP = 2;

type Rgb = readonly [number, number, number];

/** Palette of the zone image (sRGB). Region colour comes from the region tint, the rest from here. */
export const MAP_COLOR = {
  grass: [0x5f, 0x7e, 0x3c] as Rgb,
  void: [0x3b, 0x45, 0x34] as Rgb,
  snow: [0xe9, 0xf0, 0xf4] as Rgb,
  dirt: [0xa8, 0x8a, 0x55] as Rgb,
  cobble: [0x8f, 0x8c, 0x84] as Rgb,
  dark: [0x2f, 0x3a, 0x27] as Rgb,
  plaza: [0xa9, 0xa1, 0x8c] as Rgb,
  plazaEdge: [0x3a, 0x2a, 0x14] as Rgb,
  landmark: [0x6e, 0x64, 0x58] as Rgb,
  water: [0x2c, 0x62, 0x86] as Rgb,
  shore: [0x5b, 0x93, 0xae] as Rgb,
} as const;

/** Road colour per kind (drawn over the ground, over the water so bridges read). */
export const ROAD_COLOR: Record<RoadDef['kind'], Rgb> = {
  dirt: [0x6b, 0x4e, 0x2a],
  cobble: [0x58, 0x55, 0x4f],
  boardwalk: [0x4a, 0x30, 0x18],
  bridge: [0x3a, 0x26, 0x14],
};

/** Roads are never drawn thinner than this (m), so they stay readable at 2 m per pixel. */
const ROAD_MIN_W = 4;
/** How far a region's ground colour is pulled from grass towards its tint (0 = grass everywhere, 1 = the tint itself). */
const REGION_TINT_MIX = 0.6;
/** Darkening of the pixels on a region border (multiplier). */
const REGION_EDGE = 0.6;
/** Hill shading: light from the north-west, `shadeGain` scales the slope contrast, clamped to [SHADE_MIN, SHADE_MAX]. */
const LIGHT: readonly [number, number, number] = [-0.55, 0.62, -0.55];
const SHADE_GAIN = 1.2;
const SHADE_MIN = 0.55;
const SHADE_MAX = 1.4;

/** One zone image. `rgba` is row-major (row 0 = north), `w` x `h` pixels, `mpp` metres per pixel. */
export interface ZoneMapPixels {
  w: number;
  h: number;
  mpp: number;
  /** Zone size in metres (the image covers [0, widthM] x [0, heightM]). */
  widthM: number;
  heightM: number;
  rgba: Uint8ClampedArray;
}

/** Relief of a zone, baked on demand when the caller has none (undefined = build it; null = the zone is flat). */
function reliefOf(def: DungeonDef, relief: Relief | null | undefined): Relief | null {
  if (relief !== undefined) return relief;
  if (!def.world?.relief) return null;
  return buildRelief(def);
}

/** Paints `ops` rectangle [x0, x1] x [z0, z1] (metres) with `col`; pixels within `edge` m of the border take `edgeCol`. */
function paintRect(img: Float32Array, w: number, h: number, mpp: number, x0: number, z0: number, x1: number, z1: number, col: Rgb, edge = 0, edgeCol: Rgb = col): void {
  const px0 = Math.max(0, Math.floor(x0 / mpp)), px1 = Math.min(w - 1, Math.ceil(x1 / mpp));
  const pz0 = Math.max(0, Math.floor(z0 / mpp)), pz1 = Math.min(h - 1, Math.ceil(z1 / mpp));
  for (let pz = pz0; pz <= pz1; pz++) {
    const z = (pz + 0.5) * mpp;
    if (z < z0 || z > z1) continue;
    for (let px = px0; px <= px1; px++) {
      const x = (px + 0.5) * mpp;
      if (x < x0 || x > x1) continue;
      const near = edge > 0 && Math.min(x - x0, x1 - x, z - z0, z1 - z) < edge;
      const c = near ? edgeCol : col;
      const o = (pz * w + px) * 3;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
  }
}

/** Paints a disc of radius `r` (m) at (cx, cz) with `col`, its last `edge` m in `edgeCol`. */
function paintDisc(img: Float32Array, w: number, h: number, mpp: number, cx: number, cz: number, r: number, col: Rgb, edgeCol: Rgb, edge: number): void {
  const px0 = Math.max(0, Math.floor((cx - r) / mpp)), px1 = Math.min(w - 1, Math.ceil((cx + r) / mpp));
  const pz0 = Math.max(0, Math.floor((cz - r) / mpp)), pz1 = Math.min(h - 1, Math.ceil((cz + r) / mpp));
  for (let pz = pz0; pz <= pz1; pz++)
    for (let px = px0; px <= px1; px++) {
      const d = Math.hypot((px + 0.5) * mpp - cx, (pz + 0.5) * mpp - cz);
      if (d > r) continue;
      const c = d > r - edge ? edgeCol : col;
      const o = (pz * w + px) * 3;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
}

/** Paints a polyline segment (metres) `hw` m wide on each side of its axis with `col`. */
function paintSegment(img: Float32Array, w: number, h: number, mpp: number, ax: number, az: number, bx: number, bz: number, hw: number, col: Rgb): void {
  const px0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw) / mpp)), px1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + hw) / mpp));
  const pz0 = Math.max(0, Math.floor((Math.min(az, bz) - hw) / mpp)), pz1 = Math.min(h - 1, Math.ceil((Math.max(az, bz) + hw) / mpp));
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz || 1;
  for (let pz = pz0; pz <= pz1; pz++)
    for (let px = px0; px <= px1; px++) {
      const x = (px + 0.5) * mpp, z = (pz + 0.5) * mpp;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      if (Math.hypot(x - (ax + vx * t), z - (az + vz * t)) > hw) continue;
      const o = (pz * w + px) * 3;
      img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
    }
}

/**
 * Builds the zone image. `relief`: the baked relief of the zone (DungeonBuilder / DungeonScene pass theirs, so nothing is baked twice);
 * omit it to bake here, pass null for a flat zone.
 */
export function buildZoneMapPixels(def: DungeonDef, relief?: Relief | null): ZoneMapPixels {
  const tw = def.grid.w, th = def.grid.h;
  const W = tw * T, H = th * T;
  const mpp = Math.max(MAP_MIN_MPP, Math.ceil(Math.max(W, H) / MAP_MAX_PX_SIDE));
  const w = Math.ceil(W / mpp), h = Math.ceil(H / mpp);
  const rel = reliefOf(def, relief);
  const ext = def.world ?? null;

  // tile lookups: room per tile (later rooms overwrite earlier, like worldTintRGB), region key per room (0 = no region)
  const roomAt = new Int16Array(tw * th).fill(-1);
  def.rooms.forEach((room, ri) => {
    for (let j = Math.max(0, room.rect.z); j < Math.min(th, room.rect.z + room.rect.h); j++)
      for (let i = Math.max(0, room.rect.x); i < Math.min(tw, room.rect.x + room.rect.w); i++) roomAt[j * tw + i] = ri;
  });
  const regionIds = (ext?.regions ?? []).map((r) => r.id);
  const regs = regionsByRoom(def);
  const regionKeyOfRoom = def.rooms.map((_, ri) => {
    const r = regs[ri];
    return r ? regionIds.indexOf(r.id) + 1 : 0;
  });
  const regionKeyOfTile = new Uint8Array(tw * th);
  for (let k = 0; k < tw * th; k++) regionKeyOfTile[k] = roomAt[k] >= 0 ? regionKeyOfRoom[roomAt[k]] : 0;
  const tint = worldTintRGB(def);

  // ground: grass (or void) x region tint, snow cover, then the splat weights (dirt, cobble, dark) of the ground ops
  const img = new Float32Array(w * h * 3);
  const res = Math.max(w, h);
  const cx = W / 2, cz = H / 2;
  const splat = paintSplatChunk({ x0: -cx, z0: -cz, size: res * mpp, res }, worldSplatOps(def, cx, cz), new TileNoise(`terrain:${def.id}`, 8, 4));
  const tileOf = (x: number, z: number): number => {
    const i = Math.min(tw - 1, Math.max(0, Math.floor(x / T)));
    const j = Math.min(th - 1, Math.max(0, Math.floor(z / T)));
    return j * tw + i;
  };
  for (let pz = 0; pz < h; pz++)
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) * mpp, z = (pz + 0.5) * mpp;
      const tk = tileOf(x, z);
      // region ground: grass pulled towards the region tint (the tints of neighbouring regions differ mostly in hue, which a
      // plain multiply would wash out); void: the tint multiplies the dark mountain colour
      const inRoom = roomAt[tk] >= 0;
      const tr = tint.rgb[tk * 3], tg = tint.rgb[tk * 3 + 1], tb = tint.rgb[tk * 3 + 2];
      let r: number, g: number, b: number;
      if (inRoom) {
        const gr = MAP_COLOR.grass;
        r = gr[0] + (tr - gr[0]) * REGION_TINT_MIX; g = gr[1] + (tg - gr[1]) * REGION_TINT_MIX; b = gr[2] + (tb - gr[2]) * REGION_TINT_MIX;
      } else {
        const v = MAP_COLOR.void;
        r = v[0] * (tr / 255); g = v[1] * (tg / 255); b = v[2] * (tb / 255);
      }
      const si = (pz * res + px) * 3;
      const dirt = splat[si] / 255, cob = splat[si + 1] / 255, dark = splat[si + 2] / 255;
      // snow: the tile's cover, but the paths and the bare ground show through it
      const snow = (tint.snow[tk] / 255) * 0.92 * (1 - Math.max(dirt, cob));
      r += (MAP_COLOR.snow[0] - r) * snow; g += (MAP_COLOR.snow[1] - g) * snow; b += (MAP_COLOR.snow[2] - b) * snow;
      const lerp = (c: Rgb, t: number): void => {
        r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t;
      };
      // the splat is painted for the 3D ground (dense region patches); on the map it is softened so the regions stay readable
      lerp(MAP_COLOR.dirt, dirt * 0.6);
      lerp(MAP_COLOR.cobble, cob * 0.6);
      lerp(MAP_COLOR.dark, dark * 0.5);
      // hill shading of the relief (flat ground = 1)
      let shade = 1;
      if (rel) {
        const dzdx = (rel.groundY(x + mpp, z) - rel.groundY(x - mpp, z)) / (2 * mpp);
        const dzdz = (rel.groundY(x, z + mpp) - rel.groundY(x, z - mpp)) / (2 * mpp);
        const s = (LIGHT[1] - dzdx * LIGHT[0] - dzdz * LIGHT[2]) / (LIGHT[1] * Math.sqrt(1 + dzdx * dzdx + dzdz * dzdz));
        shade = Math.min(SHADE_MAX, Math.max(SHADE_MIN, 1 + SHADE_GAIN * (s - 1)));
      }
      const o = (pz * w + px) * 3;
      img[o] = r * shade; img[o + 1] = g * shade; img[o + 2] = b * shade;
    }

  if (ext) {
    // lakes and rivers (tile rects), 2 m shore ring
    for (const wt of ext.water) {
      const R = wt.rect;
      paintRect(img, w, h, mpp, R.x * T, R.z * T, (R.x + R.w) * T, (R.z + R.h) * T, MAP_COLOR.water, 2, MAP_COLOR.shore);
    }
    // village walled areas (bounds = half extents, m)
    for (const v of ext.villages) {
      const x = tileCentre(v.center[0]), z = tileCentre(v.center[1]);
      paintRect(img, w, h, mpp, x - v.bounds[0], z - v.bounds[1], x + v.bounds[0], z + v.bounds[1], MAP_COLOR.plaza, 1.5, MAP_COLOR.plazaEdge);
    }
    for (const lm of ext.landmarks) {
      paintDisc(img, w, h, mpp, tileCentre(lm.pos[0]), tileCentre(lm.pos[1]), 4, MAP_COLOR.landmark, MAP_COLOR.plazaEdge, 1);
    }
    // roads last among the ground layers, so bridges read over the water
    for (const r of ext.roads) {
      const hw = Math.max(r.width, ROAD_MIN_W) / 2;
      const col = ROAD_COLOR[r.kind];
      for (let i = 0; i + 1 < r.pts.length; i++)
        paintSegment(img, w, h, mpp, tileCentre(r.pts[i][0]), tileCentre(r.pts[i][1]), tileCentre(r.pts[i + 1][0]), tileCentre(r.pts[i + 1][1]), hw, col);
    }
  }

  // region borders: the pixel on the near side of every change of region takes a darker tone
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let pz = 0; pz < h; pz++)
    for (let px = 0; px < w; px++) {
      const k = tileOf((px + 0.5) * mpp, (pz + 0.5) * mpp);
      const key = regionKeyOfTile[k];
      const right = px + 1 < w ? regionKeyOfTile[tileOf((px + 1.5) * mpp, (pz + 0.5) * mpp)] : key;
      const down = pz + 1 < h ? regionKeyOfTile[tileOf((px + 0.5) * mpp, (pz + 1.5) * mpp)] : key;
      const o = (pz * w + px) * 3;
      const edge = right !== key || down !== key ? REGION_EDGE : 1;
      const q = (pz * w + px) * 4;
      rgba[q] = Math.round(img[o] * edge);
      rgba[q + 1] = Math.round(img[o + 1] * edge);
      rgba[q + 2] = Math.round(img[o + 2] * edge);
      rgba[q + 3] = 255;
    }

  return { w, h, mpp, widthM: W, heightM: H, rgba };
}
