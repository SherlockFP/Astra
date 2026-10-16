/**
 * Painted zone atlas of an open-world map (baked once per zone, cached). The world map and the minimap draw THIS canvas, so both read
 * the same terrain: biome colour per region (painted with value noise, borders warped so they are not rectangles), hill shading and a
 * height tint from the zone's relief, water with shore lines, roads (outlined), forest stipple in clumps, villages (walled plazas with
 * houses), height contours and dark region borders. Everything comes from the zone DATA (rooms, regions, water, roads, villages) and
 * the relief height source; deterministic (the seed is the zone id), no clock, no Math.random.
 *
 * Canvas units: 1 px = 1 / pxPerM metres, world (0, 0) = the top-left corner. Sisli Vadi is 1600 m square, so pxPerM = 1.
 * OWNER: hud module (map rendering).
 */
import { G } from '../../game/G';
import type { DungeonDef } from '../../types/dungeons';
import { TILE_SIZE } from '../../types/dungeons';
import { buildRelief } from '../../world/Relief';
import {
  BIOME, HIGHLAND_TINT, LAND_COL, PLAZA_COL, PLAZA_EDGE, ROAD_STYLE, SHORE_COL, TREE_DEAD, TREE_LIGHT, TREE_TOP, VOID_COL,
  WATER_DEEP, WATER_SHALLOW, rgbCss, type Rgb,
} from './mapStyle';

/** Anything with `groundY(x, z)` in metres (the world's heights, or world/Relief.ts). */
export interface HeightSource { groundY(x: number, z: number): number }

/** Largest atlas side in pixels. */
export const ATLAS_MAX_PX = 2048;
/** Spacing of the height samples (m). */
const HGT_M = 2;
/** Contour interval (m). */
const CONTOUR_M = 4;
const TILE = TILE_SIZE;

/** Trees per square metre per region (clumped: only where the clump noise passes the threshold). */
const TREE_DENSITY: Record<string, number> = { r1: 1 / 45, r2: 1 / 900, r3: 1 / 520, r4: 1 / 800, r5: 1 / 1100, r6: 1 / 900 };
const TREE_CLUMP: Record<string, number> = { r1: 0.4, r2: 0.66, r3: 0.6, r4: 0.7, r5: 0.7, r6: 0.62 };
const DEAD_REGIONS = new Set(['r4', 'r6']);

export interface Atlas {
  id: string;
  widthM: number;
  heightM: number;
  pxPerM: number;
  canvas: HTMLCanvasElement;
  /** Region id of the room at (x, z) metres, '' off the rooms or in a room without a region. */
  regionOf(x: number, z: number): string;
  /** Ground height (m) at (x, z), bilinear over the height samples. */
  heightAt(x: number, z: number): number;
  hMin: number;
  hMax: number;
}

const cache = new Map<string, Atlas>();

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) at (x, z) with cells of 1 unit. */
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Mulberry32: a seeded generator in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance (m) from (x, z) to the segment a-b. */
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

/** The live height source of the running zone, else the zone's relief (baked once, cached inside the atlas). */
const reliefCache = new Map<string, HeightSource | null>();
export function heightsOf(def: DungeonDef): HeightSource | null {
  const live = G.world?.heights;
  if (live && typeof live.groundY === 'function') return live;
  if (!reliefCache.has(def.id)) {
    let rel: HeightSource | null = null;
    try {
      rel = buildRelief(def);
    } catch (err) {
      console.warn('[map] relief for the map failed, the map is flat', err);
    }
    reliefCache.set(def.id, rel);
  }
  return reliefCache.get(def.id) ?? null;
}

/** The atlas of an open-world def, baked on first use and kept. Null when the def has no world data. */
export function atlasFor(def: DungeonDef, heights: HeightSource | null): Atlas | null {
  const hit = cache.get(def.id);
  if (hit) return hit;
  if (!def.world) return null;
  try {
    const t0 = performance.now();
    const a = bakeAtlas(def, heights);
    cache.set(def.id, a);
    console.info(`[map] atlas ${def.id} ${a.canvas.width}x${a.canvas.height} px baked in ${Math.round(performance.now() - t0)} ms`);
    return a;
  } catch (err) {
    console.warn('[map] atlas bake failed', err);
    return null;
  }
}

/** Bakes the atlas (pure apart from the canvas). Exported for tools; the game calls atlasFor. */
export function bakeAtlas(def: DungeonDef, heights: HeightSource | null): Atlas {
  const ext = def.world;
  if (!ext) throw new Error(`bakeAtlas: ${def.id} has no world data`);
  const tw = def.grid.w, th = def.grid.h;
  const W = tw * TILE, H = th * TILE;
  const pxPerM = Math.min(1, ATLAS_MAX_PX / Math.max(W, H));
  const PW = Math.round(W * pxPerM), PH = Math.round(H * pxPerM);
  const seed = strHash(def.id);

  // rooms per tile (later rooms win) and the region id of each room
  const tileRoom = new Int16Array(tw * th).fill(-1);
  def.rooms.forEach((room, ri) => {
    for (let j = Math.max(0, room.rect.z); j < Math.min(th, room.rect.z + room.rect.h); j++)
      for (let i = Math.max(0, room.rect.x); i < Math.min(tw, room.rect.x + room.rect.w); i++) tileRoom[j * tw + i] = ri;
  });
  const roomRegion: string[] = def.rooms.map((room) => ext.regions.find((r) => r.roomId === room.id)?.id ?? '');

  // height samples (every HGT_M metres) and their range
  const hW = Math.ceil(W / HGT_M) + 1, hH = Math.ceil(H / HGT_M) + 1;
  const hgt = new Float32Array(hW * hH);
  let hMin = Infinity, hMax = -Infinity;
  for (let j = 0; j < hH; j++)
    for (let i = 0; i < hW; i++) {
      const y = heights ? heights.groundY(i * HGT_M, j * HGT_M) : 0;
      hgt[j * hW + i] = y;
      if (y < hMin) hMin = y;
      if (y > hMax) hMax = y;
    }
  const heightAt = (x: number, z: number): number => {
    const fx = Math.max(0, Math.min(hW - 1.001, x / HGT_M)), fz = Math.max(0, Math.min(hH - 1.001, z / HGT_M));
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const o = j * hW + i;
    const a = hgt[o], b = hgt[o + 1], c = hgt[o + hW], d = hgt[o + hW + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const span = Math.max(1e-3, hMax - hMin);

  // water: rectangles of the data, with noisy organic edges (signed distance to the rect + noise, metres)
  const water = ext.water.map((w) => ({ x0: w.rect.x * TILE, z0: w.rect.z * TILE, x1: (w.rect.x + w.rect.w) * TILE, z1: (w.rect.z + w.rect.h) * TILE }));

  // ---- pass 1: ground, water and the region key of every pixel ----
  const data = new Uint8ClampedArray(PW * PH * 4);
  const keyArr = new Int16Array(PW * PH);
  const WATER_KEY = -2;
  const LAND_KEY = -3;
  for (let py = 0; py < PH; py++) {
    const z = (py + 0.5) / pxPerM;
    for (let px = 0; px < PW; px++) {
      const x = (px + 0.5) / pxPerM;
      const idx = py * PW + px;
      const o = idx * 4;
      // water first: the deepest rect that holds the pixel decides the colour
      let wv = -Infinity;
      for (const r of water) {
        if (x < r.x0 - 30 || x > r.x1 + 30 || z < r.z0 - 30 || z > r.z1 + 30) continue;
        const d = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
        const v = d + (vnoise(x / 40, z / 40, seed + 3) - 0.5) * 36 + (vnoise(x / 11, z / 11, seed + 9) - 0.5) * 5;
        if (v > wv) wv = v;
      }
      if (wv > 0) {
        const t = Math.min(1, wv / 14);
        const dark = [WATER_DEEP[0] * t + WATER_SHALLOW[0] * (1 - t), WATER_DEEP[1] * t + WATER_SHALLOW[1] * (1 - t), WATER_DEEP[2] * t + WATER_SHALLOW[2] * (1 - t)];
        const sh = Math.max(0, 1 - wv / 2.4);
        data[o] = dark[0] + (SHORE_COL[0] - dark[0]) * sh;
        data[o + 1] = dark[1] + (SHORE_COL[1] - dark[1]) * sh;
        data[o + 2] = dark[2] + (SHORE_COL[2] - dark[2]) * sh;
        data[o + 3] = 255;
        keyArr[idx] = WATER_KEY;
        continue;
      }
      // painted border: the tile is looked up at a warped point (wavy, not blocky, region edges)
      const wx = x + (vnoise(x / 150, z / 150, seed + 1) - 0.5) * 130 + (vnoise(x / 42, z / 42, seed + 2) - 0.5) * 26;
      const wz = z + (vnoise(x / 150 + 31, z / 150, seed + 4) - 0.5) * 130 + (vnoise(x / 42, z / 42 + 31, seed + 5) - 0.5) * 26;
      const ti = Math.max(0, Math.min(tw - 1, Math.floor(wx / TILE)));
      const tj = Math.max(0, Math.min(th - 1, Math.floor(wz / TILE)));
      const room = tileRoom[tj * tw + ti];
      let col: Rgb;
      if (room < 0) col = VOID_COL;
      else {
        const rid = roomRegion[room];
        col = (rid && BIOME[rid]) || LAND_COL;
      }
      // painted variation: fine grain plus a broad patchiness
      const lum = 1 + (vnoise(x / 6, z / 6, seed + 6) - 0.5) * 0.16 + (vnoise(x / 34, z / 34, seed + 7) - 0.5) * 0.18;
      // height: highlands lighter and warmer, lowlands a little darker; hill shading from the slope (light from the north-west)
      const hh = heightAt(x, z);
      const tH = (hh - hMin) / span;
      const dzdx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4;
      const dzdz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
      const sLit = (0.62 + 0.55 * dzdx + 0.55 * dzdz) / (0.62 * Math.sqrt(1 + dzdx * dzdx + dzdz * dzdz));
      const shade = Math.max(0.7, Math.min(1.32, 1 + 2.4 * (sLit - 1)));
      const hf = (0.9 + 0.14 * tH) * lum * shade;
      const hi = 0.22 * tH * tH;
      data[o] = Math.min(255, (col[0] * hf) + (HIGHLAND_TINT[0] - col[0] * hf) * hi);
      data[o + 1] = Math.min(255, (col[1] * hf) + (HIGHLAND_TINT[1] - col[1] * hf) * hi);
      data[o + 2] = Math.min(255, (col[2] * hf) + (HIGHLAND_TINT[2] - col[2] * hf) * hi);
      data[o + 3] = 255;
      keyArr[idx] = room < 0 ? LAND_KEY : room;
    }
  }

  // region borders: a land pixel whose neighbour belongs to another room (or to the void) takes a dark edge; water is left to its shore
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      const idx = py * PW + px;
      const k = keyArr[idx];
      if (k === WATER_KEY) continue;
      const kr = px + 1 < PW ? keyArr[idx + 1] : k;
      const kd = py + 1 < PH ? keyArr[idx + PW] : k;
      if ((kr !== k && kr !== WATER_KEY) || (kd !== k && kd !== WATER_KEY)) {
        const o = idx * 4;
        data[o] *= 0.66;
        data[o + 1] *= 0.66;
        data[o + 2] *= 0.66;
      }
    }

  const base = document.createElement('canvas');
  base.width = PW;
  base.height = PH;
  const g = base.getContext('2d');
  if (!g) throw new Error('bakeAtlas: no 2d context');
  g.putImageData(new ImageData(data, PW, PH), 0, 0);

  // ---- pass 2: vector layers in metres (the transform maps metres to canvas pixels) ----
  g.setTransform(pxPerM, 0, 0, pxPerM, 0, 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // roads: outlined (edge stroke, then the fill on top); bridges last so they read over the water
  const roadOrder = [...ext.roads].sort((a, b) => (a.kind === 'bridge' ? 1 : 0) - (b.kind === 'bridge' ? 1 : 0));
  const roadSegs: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (const r of roadOrder) {
    const st = ROAD_STYLE[r.kind];
    const w = Math.max(r.width, 4);
    const pts = r.pts.map(([i, j]) => [(i + 0.5) * TILE, (j + 0.5) * TILE] as const);
    for (let i = 0; i + 1 < pts.length; i++) roadSegs.push({ ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1] });
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.strokeStyle = rgbCss(st.edge);
    g.lineWidth = w + 1.6;
    g.stroke();
    g.strokeStyle = rgbCss(st.fill);
    g.lineWidth = w;
    g.stroke();
  }

  // contours: marching squares over the height samples, one stroke per level
  g.strokeStyle = 'rgba(40,28,14,0.26)';
  g.lineWidth = 0.7;
  for (let L = Math.ceil(hMin / CONTOUR_M) * CONTOUR_M; L <= hMax; L += CONTOUR_M) {
    g.beginPath();
    for (let j = 0; j + 1 < hH; j++)
      for (let i = 0; i + 1 < hW; i++) {
        const o = j * hW + i;
        const a = hgt[o], b = hgt[o + 1], c = hgt[o + hW + 1], d = hgt[o + hW];
        const x0 = i * HGT_M, z0 = j * HGT_M, x1 = x0 + HGT_M, z1 = z0 + HGT_M;
        const pts: number[] = [];
        if ((a - L) * (b - L) < 0) { const t = (L - a) / (b - a); pts.push(x0 + t * HGT_M, z0); }
        if ((b - L) * (c - L) < 0) { const t = (L - b) / (c - b); pts.push(x1, z0 + t * HGT_M); }
        if ((d - L) * (c - L) < 0) { const t = (L - d) / (c - d); pts.push(x0 + t * HGT_M, z1); }
        if ((a - L) * (d - L) < 0) { const t = (L - a) / (d - a); pts.push(x0, z0 + t * HGT_M); }
        for (let q = 0; q + 3 < pts.length; q += 4) {
          g.moveTo(pts[q], pts[q + 1]);
          g.lineTo(pts[q + 2], pts[q + 3]);
        }
      }
    g.stroke();
  }

  // forest stipple: clumped candidates per tile of a region, rejected on roads, water, villages and the void
  const rand = rng(seed ^ 0x9e3779b9);
  const trees: { x: number; z: number; r: number; dead: boolean; tone: number }[] = [];
  for (let room = 0; room < def.rooms.length; room++) {
    const rid = roomRegion[room];
    if (!rid || !TREE_DENSITY[rid]) continue;
    const perTile = TREE_DENSITY[rid] * TILE * TILE;
    const clump = TREE_CLUMP[rid];
    const dead = DEAD_REGIONS.has(rid);
    const rc = def.rooms[room].rect;
    for (let tj = Math.max(0, rc.z); tj < Math.min(th, rc.z + rc.h); tj++)
      for (let ti = Math.max(0, rc.x); ti < Math.min(tw, rc.x + rc.w); ti++) {
        if (tileRoom[tj * tw + ti] !== room) continue;
        let n = perTile;
        while (n > 0) {
          if (rand() < n) {
            const x = (ti + rand()) * TILE, z = (tj + rand()) * TILE;
            n -= 1;
            if (vnoise(x / 40, z / 40, seed + 11) < clump) continue;
            if (water.some((w) => x > w.x0 - 8 && x < w.x1 + 8 && z > w.z0 - 8 && z < w.z1 + 8 && Math.min(x - w.x0, w.x1 - x, z - w.z0, w.z1 - z) > -6)) continue;
            if (roadSegs.some((s) => segDist(x, z, s.ax, s.az, s.bx, s.bz) < 4.5)) continue;
            if (ext.villages.some((v) => {
              const cx = (v.center[0] + 0.5) * TILE, cz = (v.center[1] + 0.5) * TILE;
              return Math.abs(x - cx) < v.bounds[0] + 7 && Math.abs(z - cz) < v.bounds[1] + 7;
            })) continue;
            trees.push({ x, z, r: 2.1 + rand() * 1.6, dead, tone: rand() });
          } else break;
          n = n < 0 ? 0 : n;
        }
      }
  }
  trees.sort((a, b) => a.z - b.z);
  for (const t of trees) {
    if (t.dead) {
      g.strokeStyle = rgbCss(TREE_DEAD);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(t.x, t.z + 1.2);
      g.lineTo(t.x, t.z - t.r * 1.2);
      g.moveTo(t.x, t.z - t.r * 0.6);
      g.lineTo(t.x + t.r * 0.7, t.z - t.r * 1.1);
      g.stroke();
      continue;
    }
    g.fillStyle = 'rgba(12,20,8,0.45)';
    g.beginPath();
    g.ellipse(t.x + 0.9, t.z + 1.1, t.r * 1.05, t.r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    const k = 0.85 + 0.3 * t.tone;
    g.fillStyle = rgbCss([TREE_TOP[0] * k, TREE_TOP[1] * k, TREE_TOP[2] * k]);
    g.beginPath();
    g.arc(t.x, t.z, t.r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgbCss(TREE_LIGHT, 0.55);
    g.beginPath();
    g.arc(t.x - t.r * 0.3, t.z - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
    g.fill();
  }

  // villages: walled plaza, a few houses inside
  for (const v of ext.villages) {
    const cx = (v.center[0] + 0.5) * TILE, cz = (v.center[1] + 0.5) * TILE;
    const bx = v.bounds[0], bz = v.bounds[1];
    g.fillStyle = rgbCss(PLAZA_COL);
    g.fillRect(cx - bx, cz - bz, bx * 2, bz * 2);
    g.strokeStyle = rgbCss(PLAZA_EDGE);
    g.lineWidth = 1.4;
    g.strokeRect(cx - bx, cz - bz, bx * 2, bz * 2);
    const vr = rng(strHash(v.id));
    const houses = Math.max(3, Math.round((bx * bz) / 110));
    for (let h = 0; h < houses; h++) {
      const hx = cx + (vr() * 2 - 1) * (bx - 5), hz = cz + (vr() * 2 - 1) * (bz - 5);
      const w = 3 + vr() * 2, d = 3 + vr() * 2;
      g.fillStyle = 'rgba(96,70,44,0.92)';
      g.fillRect(hx - w / 2, hz - d / 2, w, d);
      g.strokeStyle = 'rgba(30,20,8,0.9)';
      g.lineWidth = 0.6;
      g.strokeRect(hx - w / 2, hz - d / 2, w, d);
    }
  }

  // the map's own frame: region names and levels are drawn live (regionKnown), not here
  const canvas = base;
  return {
    id: def.id,
    widthM: W,
    heightM: H,
    pxPerM,
    canvas,
    regionOf: (x: number, z: number): string => {
      const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE);
      if (ti < 0 || tj < 0 || ti >= tw || tj >= th) return '';
      const room = tileRoom[tj * tw + ti];
      return room < 0 ? '' : roomRegion[room];
    },
    heightAt,
    hMin,
    hMax,
  };
}
