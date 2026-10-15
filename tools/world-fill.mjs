#!/usr/bin/env node
/**
 * World fill (Sisli Vadi, OWNER: content module). Writes the open-world "life" data into sisli_vadi.layout.json:
 *   - landmarks (named sub-areas, about 200 m apart, visible from afar): `lm_f*` entries of `landmarks`, with a `recipe`
 *   - decor (`decor` array): junction signposts (`sg_*`, with destination lines), farm fields near the villages (`dc_fa*`),
 *     story vignettes that fill the largest visual gaps (`dc_v*`), and filler clusters of flowers / bushes / rocks (`dc_f*`)
 *
 *   node tools/world-fill.mjs            regenerate the generated entries (hand-authored entries are never touched)
 *   node tools/world-fill.mjs --dry      print the counts, write nothing
 *   node tools/world-fill.mjs --gap 40   visual gap target in metres (default 40 = the density audit radius; story vignettes about 60-70 m apart)
 *
 * The result is data: the recipes that draw each entry live in src/world/WorldDecorFill.ts (kit models only, no downloads). The
 * generator is deterministic (fixed seed), so a rerun gives the same map. Positions are tiles (1 tile = 4 m), rot in degrees.
 * Keep-outs: roads 7 m, water 4 m, points of interest 14 m, villages (bounds + 14 m), camps (the disc of each pack's radius + 8 m,
 *   the wander area of its mobs; a patrol waypoint 9 m), other landmarks 200 m. Member spawns lie within 0.55 x radius of the centre
 *   (src/data/world/camps.ts spread), so a disc keeps every spawn point clear of the decor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT_PATH = path.join(ROOT, 'src/data/world/sisli_vadi.layout.json');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const gapIx = args.indexOf('--gap');
const GAP_M = gapIx >= 0 ? Number(args[gapIx + 1]) : 40;
const T = 4;
/** Tile coordinate of a point (tile centre convention, as tileToWorld in the engine) -> metres. */
const C = (v) => (v + 0.5) * T;
/** Metres -> tile coordinate (inverse of C), rounded to 2 decimals. */
const toTile = (m) => Math.round((m / T - 0.5) * 100) / 100;
const LM_SPACING = 185;
const SAMPLE_M = 25;

// ---- deterministic RNG (mulberry32) ---------------------------------------------------------------------------------------
let seed = 20261015;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

// ---- load -------------------------------------------------------------------------------------------------------------------
const rawText = fs.readFileSync(LAYOUT_PATH, 'utf8');
const L = JSON.parse(rawText.replace(/^﻿/, ''));
const W_M = L.grid.w * T, H_M = L.grid.h * T;
const isGenLandmark = (l) => /^lm_f\d+$/.test(l.id);
// a rerun starts from the hand-authored content only: generated landmarks and decor are dropped from the working copy
const handLandmarks = L.landmarks.filter((l) => !isGenLandmark(l));
L.landmarks = handLandmarks;
delete L.decor;

// ---- geometry (metres) -------------------------------------------------------------------------------------------------------
const regionRoom = new Map(Object.entries(L.regions).map(([rid, r]) => [r.room, rid]));
const rooms = L.rooms.filter((r) => regionRoom.has(r.id)).map((r) => ({
  id: r.id, region: regionRoom.get(r.id), x0: r.rect.x * T, z0: r.rect.z * T, x1: (r.rect.x + r.rect.w) * T, z1: (r.rect.z + r.rect.h) * T,
}));
const water = L.water.map((w) => ({ x0: w.x0 * T, z0: w.z0 * T, x1: w.x1 * T, z1: w.z1 * T }));
const roadSegs = [];
const roadSegRoad = []; // road id of each segment (same index as roadSegs)
const roadPts = [];
for (const r of L.roads) {
  for (let k = 0; k + 1 < r.pts.length; k++) {
    const ax = r.pts[k][0] * T, az = r.pts[k][1] * T, bx = r.pts[k + 1][0] * T, bz = r.pts[k + 1][1] * T;
    roadSegs.push([ax, az, bx, bz]);
    roadSegRoad.push(r.id);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
    for (let i = 0; i <= n; i++) roadPts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  }
}
const segDist = (x, z, [ax, az, bx, bz]) => {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
};
const roadDist = (x, z) => { let m = Infinity; for (const s of roadSegs) m = Math.min(m, segDist(x, z, s)); return m; };
const rectDist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const waterDist = (x, z) => { let m = Infinity; for (const w of water) m = Math.min(m, rectDist(x, z, w)); return m; };
const inWater = (x, z) => water.some((w) => x >= w.x0 && x < w.x1 && z >= w.z0 && z < w.z1);
const roomAt = (x, z) => rooms.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) ?? null;
const walkable = (x, z) => { const r = roomAt(x, z); return !!r && !inWater(x, z) && waterDist(x, z) >= 3; };

// keep-out points (metres) and rectangles from the hand-authored content
const POI_KEYS = ['arenas', 'landmarks', 'vistas', 'hiddenAreas', 'shrines', 'waypoints', 'entrances', 'chests', 'cursedChests', 'gatherFields', 'metinSpots', 'minibosses'];
const poi = [];
const visual = []; // points that make a cell "visual" (POI, nodes, chests, villages, buildings, npcs)
const pushP = (arr, x, z) => arr.push([x, z]);
for (const k of POI_KEYS) {
  for (const p of L[k]) {
    const c = p.center ?? p.pos ?? p.lair;
    if (!c) continue;
    pushP(poi, C(c[0]), C(c[1]));
    pushP(visual, C(c[0]), C(c[1]));
  }
}
for (const r of L.rares) for (const s of r.spots) { pushP(poi, C(s[0]), C(s[1])); pushP(visual, C(s[0]), C(s[1])); }
// camp keep-out discs (m): a pack's radius + CAMP_KEEP_M (the wander area of its mobs, tools/content-check.mjs CAMP_WANDER_ALLOW_M),
// a patrol waypoint PATROL_KEEP_M. Story decor and filler stay outside every disc; a landmark keeps 16 m from a camp centre.
const CAMP_KEEP_M = 8, PATROL_KEEP_M = 9;
const camps = [];
for (const p of L.packs) camps.push({ x: C(p.center[0]), z: C(p.center[1]), r: (p.radius ?? 8) + CAMP_KEEP_M });
for (const p of L.patrols) for (const q of p.patrol) camps.push({ x: C(q[0]), z: C(q[1]), r: PATROL_KEEP_M });
const villageRects = [];
const villageCentre = new Map();
for (const s of L.settlements) {
  const cx = C(s.center[0]), cz = C(s.center[1]);
  villageCentre.set(s.id, [cx, cz]);
  const hx = s.halfTiles[0] * T + 14, hz = s.halfTiles[1] * T + 14;
  villageRects.push({ id: s.id, x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, cx, cz, hx: s.halfTiles[0] * T, hz: s.halfTiles[1] * T });
  pushP(visual, cx, cz);
}
for (const v of L.villages) {
  const c = villageCentre.get(v.id);
  if (!c) continue;
  for (const b of v.buildings) pushP(visual, c[0] + b.x, c[1] + b.z);
  for (const n of v.npcs ?? []) pushP(visual, c[0] + n.x, c[1] + n.z);
}
for (const p of roadPts) visual.push(p);

// ---- placed content (new) ----------------------------------------------------------------------------------------------------
const landmarksNew = []; // { id, name, region, pos:[tx,tz], recipe }
const decor = []; // { id, kind, recipe, region, pos:[tx,tz], rot, lines? }
const decorM = []; // metres mirror for keep-out queries { x, z, kind }

/** Yaw (degrees) that turns a model's length (+z) toward the nearest water rect: piers and canoes face the lake. */
const shoreRot = (x, z) => {
  let best = [x, z + 1], bd = Infinity;
  for (const w of water) {
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    const d = Math.hypot(cx - x, cz - z);
    if (d < bd) { bd = d; best = [cx, cz]; }
  }
  return Math.round((Math.atan2(best[0] - x, best[1] - z) * 180) / Math.PI);
};

const nearest = (x, z, list) => { let m = Infinity; for (const p of list) m = Math.min(m, Math.hypot(x - p[0], z - p[1])); return m; };
const nearestD = (x, z, list) => { let m = Infinity; for (const p of list) m = Math.min(m, Math.hypot(x - p.x, z - p.z)); return m; };
const campDist = (x, z) => nearestD(x, z, camps);
const campFree = (x, z) => camps.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r);
const villageHit = (x, z) => villageRects.some((v) => x >= v.x0 && x <= v.x1 && z >= v.z0 && z <= v.z1);

/** Keep-out for small decor (vignettes, flora, signposts). Returns true when the spot is free. */
const freeForDecor = (x, z, { road = 7, water: wd = 4, poiR = 14, decorR = 14 } = {}) =>
  walkable(x, z) && roadDist(x, z) >= road && waterDist(x, z) >= wd && nearest(x, z, poi) >= poiR && !villageHit(x, z) &&
  campFree(x, z) && nearestD(x, z, decorM) >= decorR;

// ---- 1. landmarks: farthest-point sampling at 200 m, recipes by region --------------------------------------------------------
const LM_RECIPES = {
  r1: ['windmill_cluster', 'giant_tree', 'roadside_chapel', 'standing_stones'],
  r2: ['windmill_cluster', 'watch_tower_ruin', 'giant_tree', 'standing_stones'],
  r3: ['watch_tower_ruin', 'red_castle_ruin', 'standing_stones', 'roadside_chapel'],
  r4: ['broken_pier', 'dead_tree_lanterns', 'obelisk_shrine', 'mushroom_ring'],
  r5: ['red_castle_ruin', 'standing_stones', 'watch_tower_ruin', 'giant_tree'],
  r6: ['obelisk_shrine', 'mushroom_ring', 'roadside_chapel', 'dead_tree_lanterns'],
};
const LM_NAMES = {
  windmill_cluster: ['Eski Yel Değirmeni', 'Harman Değirmeni', 'Tepe Değirmeni', 'Yel Değirmeni Harabesi'],
  giant_tree: ['Dev Meşe', 'Ulu Çınar', 'Kadim Ağaç', 'Yaşlı Ardıç', 'Gök Çınarı'],
  roadside_chapel: ['Yol Ağzı Mabedi', 'Unutulmuş Şapel', 'Kara Mum Mabedi', 'Dua Taşı Mabedi'],
  standing_stones: ['Dikilitaşlar', 'Uyuyan Taşlar', 'Kadim Taş Çemberi', 'Nöbetçi Taşlar', 'Taş Halkası'],
  watch_tower_ruin: ['Gözcü Kulesi', 'Tepe Karakolu', 'Ateş Kulesi', 'Yıkık Burç', 'Nöbet Kulesi'],
  red_castle_ruin: ['Kızıl Kale Kalıntısı', 'Yıkık Kale', 'Kanlı Burç'],
  broken_pier: ['Kırık İskele', 'Çürük İskele', 'Sazlık İskelesi', 'Batık İskele'],
  dead_tree_lanterns: ['Ölü Ağaçlar', 'Kuru Fenerler', 'Cadı Ağaçları'],
  obelisk_shrine: ['Taşlı Anıt', 'Kara Anıt', 'Sessiz Anıt', 'Unutulmuş Anıt'],
  mushroom_ring: ['Mantar Çemberi', 'Peri Halkası', 'Gece Mantarları'],
};
const usedNames = new Set(L.landmarks.map((l) => l.name));
const takeName = (recipe) => {
  const pool = LM_NAMES[recipe].filter((n) => !usedNames.has(n));
  if (pool.length) {
    const n = pick(pool);
    usedNames.add(n);
    return n;
  }
  // every base name is used: the same name with a Roman numeral (Gece Mantarları II, III ...)
  const base = pick(LM_NAMES[recipe]);
  for (const num of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) {
    const n = `${base} ${num}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `${base} ${usedNames.size}`;
};
const lmPts = handLandmarks.map((l) => [C(l.pos[0]), C(l.pos[1])]);
// a landmark keeps 24 m from the edge of the walkable ground (the tree wall of the map is not a place to stand a landmark)
const edgeOk = (x, z) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (!walkable(x + Math.cos(a) * 24, z + Math.sin(a) * 24)) return false; } return true; };
const lmCands = [];
for (let z = SAMPLE_M / 2; z < H_M; z += 20) for (let x = SAMPLE_M / 2; x < W_M; x += 20) if (walkable(x, z) && edgeOk(x, z)) lmCands.push([x, z]);
const lmSpot = (x, z, recipe) => {
  if (recipe === 'broken_pier') {
    const wd = waterDist(x, z);
    if (wd < 1.5 || wd > 10) return false;
  }
  return walkable(x, z) && edgeOk(x, z) && roadDist(x, z) >= 9 && waterDist(x, z) >= 4 && nearest(x, z, poi) >= 18 && !villageHit(x, z) && campDist(x, z) >= 16;
};
let lmNo = 0;
for (;;) {
  let best = null, bestD = -1;
  for (const [x, z] of lmCands) {
    const d = nearest(x, z, lmPts);
    if (d > bestD) { bestD = d; best = [x, z]; }
  }
  if (!best || bestD < LM_SPACING) break;
  const region = roomAt(best[0], best[1])?.region ?? 'r1';
  // the spot must be valid for one of the region's recipes; try the candidate first, then nearby points
  const recipes = [...LM_RECIPES[region]];
  let placed = false;
  for (let tries = 0; tries < 40 && !placed; tries++) {
    const recipe = pick(recipes);
    const sx = best[0] + (tries === 0 ? 0 : (rnd() - 0.5) * 30), sz = best[1] + (tries === 0 ? 0 : (rnd() - 0.5) * 30);
    if (!lmSpot(sx, sz, recipe) || nearest(sx, sz, lmPts) < LM_SPACING * 0.9) continue;
    lmNo++;
    const id = `lm_f${String(lmNo).padStart(2, '0')}`;
    landmarksNew.push({ id, name: takeName(recipe), region, pos: [toTile(sx), toTile(sz)], recipe, rot: recipe === 'broken_pier' ? shoreRot(sx, sz) : 0 });
    lmPts.push([sx, sz]);
    poi.push([sx, sz]);
    visual.push([sx, sz]);
    placed = true;
  }
  // no valid spot near the candidate: the candidate counts as occupied for the spacing rule, so the loop moves on
  if (!placed) lmPts.push([best[0], best[1]]);
}

// ---- 2. signposts at road junctions ------------------------------------------------------------------------------------------
const ends = [];
for (const r of L.roads) {
  ends.push({ x: r.pts[0][0] * T, z: r.pts[0][1] * T, road: r.id });
  const last = r.pts[r.pts.length - 1];
  ends.push({ x: last[0] * T, z: last[1] * T, road: r.id });
}
// a junction: road ends that meet (two or more roads), or a road end that touches another road's interior (T-junction)
const junctions = [];
const nearJunction = (x, z) => junctions.find((q) => Math.hypot(q.x - x, q.z - z) < 8);
for (const e of ends) {
  let j = nearJunction(e.x, e.z);
  if (!j) { j = { x: e.x, z: e.z, roads: new Set(), t: false }; junctions.push(j); }
  j.roads.add(e.road);
}
for (const e of ends) {
  const touches = roadSegs.some((s, i) => roadSegRoad[i] !== e.road && segDist(e.x, e.z, s) < 5);
  if (!touches) continue;
  const j = nearJunction(e.x, e.z);
  if (j) j.t = true;
  else junctions.push({ x: e.x, z: e.z, roads: new Set([e.road]), t: true });
}
const sigNamed = [];
for (const s of L.settlements) sigNamed.push({ name: s.name, x: C(s.center[0]), z: C(s.center[1]) });
for (const w of L.waypoints) sigNamed.push({ name: w.name, x: C(w.pos[0]), z: C(w.pos[1]) });
for (const e of L.entrances) sigNamed.push({ name: e.name, x: C(e.pos[0]), z: C(e.pos[1]) });
for (const l of [...handLandmarks, ...landmarksNew]) sigNamed.push({ name: l.name, x: C(l.pos[0]), z: C(l.pos[1]) });
const ARROWS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
const compass = (dx, dz) => { // north is -z
  const a = Math.atan2(dx, -dz); // clockwise from north
  return ARROWS[(Math.round((((a / (Math.PI / 4)) % 8) + 8)) % 8)];
};
let sgNo = 0;
const signs = [];
for (const j of junctions) {
  if (j.roads.size < 2 && !j.t) continue;
  // side of the junction free of roads: try the four diagonals at 6 m
  let spot = null, bestRd = -1;
  for (const [dx, dz] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7], [0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const x = j.x + dx * 6, z = j.z + dz * 6;
    if (!walkable(x, z) || villageHit(x, z) || waterDist(x, z) < 4 || !campFree(x, z)) continue;
    const rd = roadDist(x, z);
    if (rd > bestRd) { bestRd = rd; spot = [x, z]; }
  }
  if (!spot || bestRd < 4) continue;
  // destinations: the three nearest distinct named places 80 m or more away, with compass letter and metres
  const near = sigNamed
    .map((p) => ({ ...p, d: Math.hypot(p.x - spot[0], p.z - spot[1]) }))
    .filter((p) => p.d >= 80 && p.d <= 900)
    .sort((a, b) => a.d - b.d);
  const lines = [];
  const chosen = [];
  for (const p of near) {
    if (lines.length >= 3) break;
    // one line per place: a settlement and its waypoint stone are the same destination
    if (chosen.some((c) => c.name === p.name || Math.hypot(c.x - p.x, c.z - p.z) < 60)) continue;
    chosen.push(p);
    lines.push(`${p.name} · ${Math.round(p.d / 10) * 10} m ${compass(p.x - spot[0], p.z - spot[1])}`);
  }
  if (!lines.length) continue;
  sgNo++;
  const rot = (Math.atan2(j.x - spot[0], -(j.z - spot[1])) * 180) / Math.PI;
  const e = { id: `sg_j${String(sgNo).padStart(2, '0')}`, kind: 'signpost', recipe: 'signpost', region: roomAt(spot[0], spot[1])?.region ?? 'r1', pos: [toTile(spot[0]), toTile(spot[1])], rot: Math.round(rot), lines };
  decor.push(e);
  decorM.push({ x: spot[0], z: spot[1], kind: 'signpost' });
  visual.push(spot);
  signs.push(e);
}

// ---- 3. farm fields beside the villages and the farm camp ------------------------------------------------------------------
const FARM_SETTLEMENTS = ['koy_gumusdere', 'koy_kizilkaya', 'kamp_ciftlik', 'kamp_tarla_karakol'];
let faNo = 0;
for (const sid of FARM_SETTLEMENTS) {
  const v = villageRects.find((x) => x.id === sid);
  if (!v) continue;
  let best = null, bestGap = -1;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = Math.max(v.hx, v.hz) + 22;
    const x = v.cx + Math.cos(a) * r, z = v.cz + Math.sin(a) * r;
    if (!walkable(x, z) || roadDist(x, z) < 10 || villageHit(x, z) || nearest(x, z, poi) < 14 || !campFree(x, z) || nearestD(x, z, decorM) < 14) continue;
    const g = nearest(x, z, visual);
    if (g > bestGap) { bestGap = g; best = [x, z, a]; }
  }
  if (!best) continue;
  faNo++;
  const [x, z, a] = best;
  const rot = Math.round(((a * 180) / Math.PI + 90) % 360);
  decor.push({ id: `dc_fa${String(faNo).padStart(2, '0')}`, kind: 'field', recipe: 'farm_field', region: roomAt(x, z)?.region ?? 'r1', pos: [toTile(x), toTile(z)], rot });
  decorM.push({ x, z, kind: 'field' });
  visual.push([x, z]);
  poi.push([x, z]);
}

// ---- 4. story vignettes: fill the largest visual gaps --------------------------------------------------------------------------
const VIGNETTE_BY_REGION = {
  r1: ['campfire_camp', 'hunter_camp', 'roadside_shrine', 'abandoned_cart'],
  r2: ['abandoned_cart', 'collapsed_wagon', 'campfire_camp', 'roadside_shrine'],
  r3: ['hunter_camp', 'campfire_camp', 'collapsed_wagon', 'roadside_shrine'],
  r4: ['graveyard', 'campfire_camp', 'hunter_camp', 'roadside_shrine'],
  r5: ['hunter_camp', 'collapsed_wagon', 'graveyard', 'campfire_camp'],
  r6: ['graveyard', 'roadside_shrine', 'campfire_camp', 'collapsed_wagon'],
};
const samples = [];
for (let z = SAMPLE_M / 2; z < H_M; z += SAMPLE_M) for (let x = SAMPLE_M / 2; x < W_M; x += SAMPLE_M) if (walkable(x, z)) samples.push({ x, z, g: 0, dead: false });
const gapOf = (x, z) => { let m = Infinity; for (const p of visual) { const d = Math.hypot(x - p[0], z - p[1]); if (d < m) m = d; } return m; };
for (const s of samples) s.g = gapOf(s.x, s.z);
const pushVisual = (x, z) => {
  visual.push([x, z]);
  for (const s of samples) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.g) s.g = d; }
};
let vgNo = 0;
const vignettes = [];
const recipeCount = {};
for (let guard = 0; guard < 2000; guard++) {
  let best = null;
  for (const s of samples) if (!s.dead && (!best || s.g > best.g)) best = s;
  if (!best || best.g <= GAP_M) break;
  // best valid spot within 16 m of the gap, the one that leaves the largest gap
  // first within 16 m with the full keep-outs; then within 26 m and 44 m with the road / water / point / decor keep-outs relaxed a
  // little (the camp discs are never relaxed: a story spot stays outside every camp's wander area)
  let spot = null, spotG = -1;
  for (const [R, rules] of [[16, { road: 7, water: 4, poiR: 12, decorR: 14 }], [26, { road: 6, water: 4, poiR: 10, decorR: 12 }], [44, { road: 6, water: 4, poiR: 10, decorR: 12 }]]) {
    for (let dz = -R; dz <= R && !spot; dz += 4) for (let dx = -R; dx <= R; dx += 4) {
      const x = best.x + dx, z = best.z + dz;
      if (Math.hypot(dx, dz) > R || !freeForDecor(x, z, rules)) continue;
      const g = gapOf(x, z);
      if (g > spotG) { spotG = g; spot = [x, z]; }
    }
    if (spot) break;
  }
  if (!spot) { best.dead = true; continue; }
  const region = roomAt(spot[0], spot[1])?.region ?? 'r1';
  let recipe = pick(VIGNETTE_BY_REGION[region]);
  if (recipe === 'campfire_camp' && rnd() < 0.5 && waterDist(spot[0], spot[1]) < 12) recipe = 'fishing_spot';
  if (waterDist(spot[0], spot[1]) < 9 && rnd() < 0.7) recipe = 'fishing_spot';
  vgNo++;
  const rot = recipe === 'fishing_spot' ? shoreRot(spot[0], spot[1]) : Math.round(rnd() * 359);
  vignettes.push({ id: `dc_v${String(vgNo).padStart(3, '0')}`, kind: 'vignette', recipe, region, pos: [toTile(spot[0]), toTile(spot[1])], rot });
  decorM.push({ x: spot[0], z: spot[1], kind: 'vignette' });
  recipeCount[recipe] = (recipeCount[recipe] ?? 0) + 1;
  pushVisual(spot[0], spot[1]);
}
decor.push(...vignettes);

// ---- 5. filler clusters: flowers, bushes and rocks breaking up flat ground ---------------------------------------------------
let fNo = 0, rNo = 0;
const FLORA_TARGET = 80, ROCK_TARGET = 30;
const fillerTry = [];
for (let i = 0; i < 6000; i++) fillerTry.push([rnd() * W_M, rnd() * H_M]);
for (const [x, z] of fillerTry) {
  if (fNo >= FLORA_TARGET && rNo >= ROCK_TARGET) break;
  if (!walkable(x, z) || roadDist(x, z) < 6 || nearest(x, z, poi) < 14 || villageHit(x, z) || !campFree(x, z)) continue;
  if (nearestD(x, z, decorM) < 14 || nearest(x, z, visual) < 12) continue;
  const useRock = rNo < ROCK_TARGET && (rnd() < 0.3 || fNo >= FLORA_TARGET);
  if (useRock) {
    rNo++;
    decor.push({ id: `dc_r${String(rNo).padStart(3, '0')}`, kind: 'rocks', recipe: 'rock_cluster', region: roomAt(x, z)?.region ?? 'r1', pos: [toTile(x), toTile(z)], rot: Math.round(rnd() * 359) });
  } else if (fNo < FLORA_TARGET) {
    fNo++;
    decor.push({ id: `dc_f${String(fNo).padStart(3, '0')}`, kind: 'flora', recipe: 'flora_cluster', region: roomAt(x, z)?.region ?? 'r1', pos: [toTile(x), toTile(z)], rot: Math.round(rnd() * 359) });
  } else continue;
  decorM.push({ x, z, kind: 'filler' });
  pushVisual(x, z);
}

// ---- 6. groves, outcrops and fallen logs: sight-breakers in every open stretch (kind grove = visual, not filler) --------------
// The largest gap is filled first, until no walkable sample is more than GROVE_GAP_M from a visual thing (a stretch of open meadow
// longer than about 30 m reads as empty). A grove keeps 9 m off roads, 14 m off points of interest and other decor.
const GROVE_GAP_M = 25, GROVE_MAX = 260;
const GROVE_MIX = [['grove', 0.6], ['outcrop', 0.25], ['fallen_logs', 0.15]];
let grNo = 0;
for (let guard = 0; guard < 4000 && grNo < GROVE_MAX; guard++) {
  let best = null;
  for (const s of samples) if (!s.dead && (!best || s.g > best.g)) best = s;
  if (!best || best.g <= GROVE_GAP_M) break;
  let spot = null, spotG = -1;
  for (const [R, rules] of [[12, { road: 9, water: 5, poiR: 14, decorR: 14 }], [20, { road: 9, water: 5, poiR: 14, decorR: 14 }], [30, { road: 8, water: 5, poiR: 12, decorR: 12 }]]) {
    for (let dz = -R; dz <= R && !spot; dz += 4) for (let dx = -R; dx <= R; dx += 4) {
      const x = best.x + dx, z = best.z + dz;
      if (Math.hypot(dx, dz) > R || !freeForDecor(x, z, rules)) continue;
      const g = gapOf(x, z);
      if (g > spotG) { spotG = g; spot = [x, z]; }
    }
    if (spot) break;
  }
  if (!spot) { best.dead = true; continue; }
  let roll = rnd(), recipe = GROVE_MIX[0][0];
  for (const [name, w] of GROVE_MIX) { if (roll < w) { recipe = name; break; } roll -= w; }
  grNo++;
  const region = roomAt(spot[0], spot[1])?.region ?? 'r1';
  decor.push({ id: `dc_g${String(grNo).padStart(3, '0')}`, kind: 'grove', recipe, region, pos: [toTile(spot[0]), toTile(spot[1])], rot: Math.round(rnd() * 359) });
  decorM.push({ x: spot[0], z: spot[1], kind: 'grove' });
  pushVisual(spot[0], spot[1]);
}

// ---- 7. meadow carpets: dense grass and flowers over open ground (filler, nothing to walk around)
const CARPET_TARGET = 220;
let mcNo = 0;
for (let i = 0; i < 20000 && mcNo < CARPET_TARGET; i++) {
  const x = rnd() * W_M, z = rnd() * H_M;
  if (!walkable(x, z) || roadDist(x, z) < 6 || nearest(x, z, poi) < 14 || villageHit(x, z) || !campFree(x, z)) continue;
  if (nearestD(x, z, decorM) < 9 || nearest(x, z, visual) < 8) continue;
  mcNo++;
  decor.push({ id: `dc_m${String(mcNo).padStart(3, '0')}`, kind: 'flora', recipe: 'meadow_carpet', region: roomAt(x, z)?.region ?? 'r1', pos: [toTile(x), toTile(z)], rot: Math.round(rnd() * 359) });
  decorM.push({ x, z, kind: 'filler' });
}

// ---- output ------------------------------------------------------------------------------------------------------------------
function round2(v) { return Math.round(v * 100) / 100; }
const landmarkAll = [...handLandmarks, ...landmarksNew];
const counts = {};
for (const d of decor) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
const summary = {
  landmarks: { hand: handLandmarks.length, generated: landmarksNew.length, total: landmarkAll.length },
  decor: counts, vignetteRecipes: recipeCount, signs: signs.length, samples: samples.length,
  remainingGapSamples: samples.filter((s) => s.g > GAP_M).length,
};
console.log(JSON.stringify(summary, null, 2));
if (DRY) process.exit(0);

// keep the layout's key order, put landmarks first and decor right after them
const out = {};
for (const [k, v] of Object.entries(L)) {
  if (k === 'decor') continue;
  if (k === 'landmarks') { out.landmarks = landmarkAll; out.decor = decor; continue; }
  out[k] = v;
}
// the BOM and CRLF of the file are kept
const text = '﻿' + JSON.stringify(out, null, 1).replace(/\n/g, '\r\n') + '\r\n';
fs.writeFileSync(LAYOUT_PATH, text);
console.log(`wrote ${path.relative(ROOT, LAYOUT_PATH)} (${decor.length} decor, ${landmarksNew.length} new landmarks)`);
