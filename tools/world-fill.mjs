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
import { loadZone, writeZoneDecor, ROOT, symTransforms, mirrorPt, mirrorYaw, symmetryIssues } from './world-zones.mjs';

// --zone <sisli|karakir|ayaz|kizil>: the zone to fill (default sisli). A typed zone (Karakır, Ayaz, Kızıl Sınır) gets the same passes,
// with its biome's landmark and vignette pools, and writes <zone>_decor.json (decor + generated landmarks) instead of the layout.
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const gapIx = args.indexOf('--gap');
const GAP_M = gapIx >= 0 ? Number(args[gapIx + 1]) : 40;
const zoneIx = args.indexOf('--zone');
const ZONE_KEY = zoneIx >= 0 ? args[zoneIx + 1] : 'sisli';
const Z = await loadZone(ZONE_KEY);
const LAYOUT_PATH = Z.out;
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
const L = Z.L;
const W_M = L.grid.w * T, H_M = L.grid.h * T;

// ---- mirror symmetry (a zone whose relief is mirrored: Kızıl Sınır, symmetric 'xz', tools/world-zones.mjs) ----------------------
// The generated life is placed in one quadrant (x <= W/2 - AXIS_M, z <= H/2 - AXIS_M, the relief's mirror axes) and every entry goes
// down with its mirror images (x -> W - x, z -> H - z). A candidate is taken only when every image passes the same keep-outs, so no
// copy stands on a road, water, point of interest or camp. AXIS_M keeps an entry and its own image 2 x AXIS_M apart.
// Sisli Vadi is not symmetric: the transform list is [0] and the box is the whole map, so its output is unchanged.
const SYM = Z.symmetric ?? '';
const symX = SYM === 'x' || SYM === 'xz', symZ = SYM === 'z' || SYM === 'xz';
const TRANS = symTransforms(SYM);
const PER = TRANS.length;
const AXIS_M = SYM ? 8 : 0;
const BOX_X = symX ? W_M / 2 - AXIS_M : W_M, BOX_Z = symZ ? H_M / 2 - AXIS_M : H_M;
const inDomain = (x, z) => x <= BOX_X && z <= BOX_Z;
/** A point and its mirror images as [x, z, t] (the point itself first, t = 0). */
const images = (x, z) => TRANS.map((t) => { const p = mirrorPt([x, z], t, W_M, H_M); return [p[0], p[1], t]; });
/** Yaw of a mirror image. */
const imgRot = (rot, t) => (t === 0 ? rot : mirrorYaw(rot, t));
/** The point lies in the generated box and every image passes `ok`. */
const symOk = (x, z, ok) => inDomain(x, z) && images(x, z).every(([ix, iz]) => ok(ix, iz));
/** Targets are totals over the zone: a placed entry counts once per image, so the quadrant gets a share of each. */
const perBase = (n) => Math.round(n / PER);
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
const POI_KEYS = ['arenas', 'landmarks', 'vistas', 'hiddenAreas', 'shrines', 'waypoints', 'entrances', 'chests', 'cursedChests', 'gatherFields', 'metinSpots', 'minibosses', 'graveyards'];
const poi = [];
const visual = []; // points that make a cell "visual" (POI, nodes, chests, villages, buildings, npcs)
const pushP = (arr, x, z) => arr.push([x, z]);
for (const k of POI_KEYS) {
  for (const p of L[k] ?? []) {
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
// a symmetric zone: the points of interest and village marks stand at their mirror images too (the roads stay as authored)
const symClose = (list) => { for (const [x, z] of [...list]) for (const [ix, iz, t] of images(x, z)) if (t) list.push([ix, iz]); };
symClose(poi);
symClose(visual);
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

// placement helpers: a placed point (or entry) goes in with all its mirror images
const pushPts = (list, x, z) => { for (const [ix, iz] of images(x, z)) list.push([ix, iz]); };
const pushDecorM = (x, z, kind) => { for (const [ix, iz] of images(x, z)) decorM.push({ x: ix, z: iz, kind }); };
/** A decor entry at (x, z) and at its images (the same recipe, the yaw mirrored); ids run per prefix. */
const decorIds = {};
const addDecor = (prefix, pad, kind, recipe, x, z, rot, extra = {}) => {
  for (const [ix, iz, t] of images(x, z)) {
    decorIds[prefix] = (decorIds[prefix] ?? 0) + 1;
    decor.push({ id: `${prefix}${String(decorIds[prefix]).padStart(pad, '0')}`, kind, recipe, region: roomAt(ix, iz)?.region ?? 'r1', pos: [toTile(ix), toTile(iz)], rot: imgRot(rot, t), ...extra });
  }
};

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
symClose(lmPts);
// a landmark keeps 24 m from the edge of the walkable ground (the tree wall of the map is not a place to stand a landmark)
const edgeOk = (x, z) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (!walkable(x + Math.cos(a) * 24, z + Math.sin(a) * 24)) return false; } return true; };
const lmCands = [];
for (let z = SAMPLE_M / 2; z < H_M; z += 20) for (let x = SAMPLE_M / 2; x < W_M; x += 20) if (inDomain(x, z) && walkable(x, z) && edgeOk(x, z)) lmCands.push([x, z]);
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
  const recipes = [...(Z.lmPool ?? LM_RECIPES[region] ?? LM_RECIPES.r1)];
  let placed = false;
  for (let tries = 0; tries < 40 && !placed; tries++) {
    const recipe = pick(recipes);
    const sx = best[0] + (tries === 0 ? 0 : (rnd() - 0.5) * 30), sz = best[1] + (tries === 0 ? 0 : (rnd() - 0.5) * 30);
    // the spot and its mirror images must be valid, and no two of them closer than the spacing
    const imgs = images(sx, sz);
    if (!symOk(sx, sz, (ix, iz) => lmSpot(ix, iz, recipe) && nearest(ix, iz, lmPts) >= LM_SPACING * 0.9)) continue;
    if (imgs.some(([ax, az], i) => imgs.some(([bx, bz], j) => i < j && Math.hypot(ax - bx, az - bz) < LM_SPACING * 0.9))) continue;
    const rot0 = recipe === 'broken_pier' ? shoreRot(sx, sz) : 0;
    for (const [ix, iz, t] of imgs) {
      lmNo++;
      const id = `lm_f${String(lmNo).padStart(2, '0')}`;
      landmarksNew.push({ id, name: takeName(recipe), region: t === 0 ? region : roomAt(ix, iz)?.region ?? 'r1', pos: [toTile(ix), toTile(iz)], recipe, rot: t === 0 ? rot0 : imgRot(rot0, t) });
      lmPts.push([ix, iz]);
      poi.push([ix, iz]);
      visual.push([ix, iz]);
    }
    placed = true;
  }
  // no valid spot near the candidate: the candidate counts as occupied for the spacing rule, so the loop moves on
  if (!placed) pushPts(lmPts, best[0], best[1]);
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
    if (!symOk(x, z, (ix, iz) => walkable(ix, iz) && !villageHit(ix, iz) && waterDist(ix, iz) >= 4 && campFree(ix, iz))) continue;
    const rd = roadDist(x, z);
    if (rd > bestRd) { bestRd = rd; spot = [x, z]; }
  }
  if (!spot || bestRd < 4) continue;
  // destinations: the three nearest distinct named places 80 m or more away, with compass letter and metres (seen from the spot)
  const signLines = (sx, sz) => {
    const near = sigNamed
      .map((p) => ({ ...p, d: Math.hypot(p.x - sx, p.z - sz) }))
      .filter((p) => p.d >= 80 && p.d <= 900)
      .sort((a, b) => a.d - b.d);
    const lines = [];
    const chosen = [];
    for (const p of near) {
      if (lines.length >= 3) break;
      // one line per place: a settlement and its waypoint stone are the same destination
      if (chosen.some((c) => c.name === p.name || Math.hypot(c.x - p.x, c.z - p.z) < 60)) continue;
      chosen.push(p);
      lines.push(`${p.name} · ${Math.round(p.d / 10) * 10} m ${compass(p.x - sx, p.z - sz)}`);
    }
    return lines;
  };
  // the sign and its images: each reads its own destinations (the compass letters follow the mirror)
  const imgs = images(spot[0], spot[1]);
  const imgLines = imgs.map(([ix, iz]) => signLines(ix, iz));
  if (imgLines.some((l) => !l.length)) continue;
  const rot = Math.round((Math.atan2(j.x - spot[0], -(j.z - spot[1])) * 180) / Math.PI);
  imgs.forEach(([ix, iz, t], k) => {
    sgNo++;
    const e = { id: `sg_j${String(sgNo).padStart(2, '0')}`, kind: 'signpost', recipe: 'signpost', region: roomAt(ix, iz)?.region ?? 'r1', pos: [toTile(ix), toTile(iz)], rot: imgRot(rot, t), lines: imgLines[k] };
    decor.push(e);
    decorM.push({ x: ix, z: iz, kind: 'signpost' });
    visual.push([ix, iz]);
    signs.push(e);
  });
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
    if (!symOk(x, z, (ix, iz) => walkable(ix, iz) && roadDist(ix, iz) >= 10 && !villageHit(ix, iz) && nearest(ix, iz, poi) >= 14 && campFree(ix, iz) && nearestD(ix, iz, decorM) >= 14)) continue;
    const g = nearest(x, z, visual);
    if (g > bestGap) { bestGap = g; best = [x, z, a]; }
  }
  if (!best) continue;
  faNo++;
  const [x, z, a] = best;
  const rot = Math.round(((a * 180) / Math.PI + 90) % 360);
  addDecor('dc_fa', 2, 'field', 'farm_field', x, z, rot);
  pushDecorM(x, z, 'field');
  pushPts(visual, x, z);
  pushPts(poi, x, z);
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
for (let z = SAMPLE_M / 2; z < H_M; z += SAMPLE_M) for (let x = SAMPLE_M / 2; x < W_M; x += SAMPLE_M) if (inDomain(x, z) && walkable(x, z)) samples.push({ x, z, g: 0, dead: false });
const gapOf = (x, z) => { let m = Infinity; for (const p of visual) { const d = Math.hypot(x - p[0], z - p[1]); if (d < m) m = d; } return m; };
for (const s of samples) s.g = gapOf(s.x, s.z);
const pushVisual = (x, z) => {
  for (const [ix, iz] of images(x, z)) {
    visual.push([ix, iz]);
    for (const s of samples) { const d = Math.hypot(s.x - ix, s.z - iz); if (d < s.g) s.g = d; }
  }
};
let vgNo = 0;
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
      if (Math.hypot(dx, dz) > R || !symOk(x, z, (ix, iz) => freeForDecor(ix, iz, rules))) continue;
      const g = gapOf(x, z);
      if (g > spotG) { spotG = g; spot = [x, z]; }
    }
    if (spot) break;
  }
  if (!spot) { best.dead = true; continue; }
  const region = roomAt(spot[0], spot[1])?.region ?? 'r1';
  let recipe = pick(Z.vigPool ?? VIGNETTE_BY_REGION[region]);
  if (recipe === 'campfire_camp' && rnd() < 0.5 && waterDist(spot[0], spot[1]) < 12) recipe = 'fishing_spot';
  if (waterDist(spot[0], spot[1]) < 9 && rnd() < 0.7) recipe = 'fishing_spot';
  vgNo++;
  const rot = recipe === 'fishing_spot' ? shoreRot(spot[0], spot[1]) : Math.round(rnd() * 359);
  addDecor('dc_v', 3, 'vignette', recipe, spot[0], spot[1], rot);
  pushDecorM(spot[0], spot[1], 'vignette');
  recipeCount[recipe] = (recipeCount[recipe] ?? 0) + 1;
  pushVisual(spot[0], spot[1]);
}

// ---- 5. filler clusters: flowers, bushes and rocks breaking up flat ground ---------------------------------------------------
let fNo = 0, rNo = 0;
// the targets are totals over the zone: a quadrant places a share of each (one base entry per PER images)
const FLORA_TARGET = 80, ROCK_TARGET = 30;
const FLORA_BASE = perBase(FLORA_TARGET), ROCK_BASE = perBase(ROCK_TARGET);
const fillerTry = [];
for (let i = 0; i < 6000; i++) fillerTry.push([rnd() * BOX_X, rnd() * BOX_Z]);
for (const [x, z] of fillerTry) {
  if (fNo >= FLORA_BASE && rNo >= ROCK_BASE) break;
  if (!symOk(x, z, (ix, iz) => walkable(ix, iz) && roadDist(ix, iz) >= 6 && nearest(ix, iz, poi) >= 14 && !villageHit(ix, iz) && campFree(ix, iz) &&
    nearestD(ix, iz, decorM) >= 14 && nearest(ix, iz, visual) >= 12)) continue;
  const useRock = rNo < ROCK_BASE && (rnd() < 0.3 || fNo >= FLORA_BASE);
  if (useRock) {
    rNo++;
    addDecor('dc_r', 3, 'rocks', 'rock_cluster', x, z, Math.round(rnd() * 359));
  } else if (fNo < FLORA_BASE) {
    fNo++;
    addDecor('dc_f', 3, 'flora', 'flora_cluster', x, z, Math.round(rnd() * 359));
  } else continue;
  pushDecorM(x, z, 'filler');
  pushVisual(x, z);
}

// ---- 6. groves, outcrops and fallen logs: sight-breakers in every open stretch (kind grove = visual, not filler) --------------
// The largest gap is filled first, until no walkable sample is more than GROVE_GAP_M from a visual thing (a stretch of open meadow
// longer than about 30 m reads as empty). A grove keeps 9 m off roads, 14 m off points of interest and other decor.
const GROVE_GAP_M = 25, GROVE_MAX = 260;
const GROVE_BASE = perBase(GROVE_MAX);
const GROVE_MIX = [['grove', 0.6], ['outcrop', 0.25], ['fallen_logs', 0.15]];
let grNo = 0;
for (let guard = 0; guard < 4000 && grNo < GROVE_BASE; guard++) {
  let best = null;
  for (const s of samples) if (!s.dead && (!best || s.g > best.g)) best = s;
  if (!best || best.g <= GROVE_GAP_M) break;
  let spot = null, spotG = -1;
  for (const [R, rules] of [[12, { road: 9, water: 5, poiR: 14, decorR: 14 }], [20, { road: 9, water: 5, poiR: 14, decorR: 14 }], [30, { road: 8, water: 5, poiR: 12, decorR: 12 }]]) {
    for (let dz = -R; dz <= R && !spot; dz += 4) for (let dx = -R; dx <= R; dx += 4) {
      const x = best.x + dx, z = best.z + dz;
      if (Math.hypot(dx, dz) > R || !symOk(x, z, (ix, iz) => freeForDecor(ix, iz, rules))) continue;
      const g = gapOf(x, z);
      if (g > spotG) { spotG = g; spot = [x, z]; }
    }
    if (spot) break;
  }
  if (!spot) { best.dead = true; continue; }
  let roll = rnd(), recipe = GROVE_MIX[0][0];
  for (const [name, w] of GROVE_MIX) { if (roll < w) { recipe = name; break; } roll -= w; }
  grNo++;
  addDecor('dc_g', 3, 'grove', recipe, spot[0], spot[1], Math.round(rnd() * 359));
  pushDecorM(spot[0], spot[1], 'grove');
  pushVisual(spot[0], spot[1]);
}

// ---- 7. meadow carpets: dense grass and flowers over open ground (filler, nothing to walk around)
const CARPET_BASE = perBase(220);
let mcNo = 0;
for (let i = 0; i < 20000 && mcNo < CARPET_BASE; i++) {
  const x = rnd() * BOX_X, z = rnd() * BOX_Z;
  if (!symOk(x, z, (ix, iz) => walkable(ix, iz) && roadDist(ix, iz) >= 6 && nearest(ix, iz, poi) >= 14 && !villageHit(ix, iz) && campFree(ix, iz) &&
    nearestD(ix, iz, decorM) >= 9 && nearest(ix, iz, visual) >= 8)) continue;
  mcNo++;
  addDecor('dc_m', 3, 'flora', 'meadow_carpet', x, z, Math.round(rnd() * 359));
  pushDecorM(x, z, 'filler');
}

// ---- output ------------------------------------------------------------------------------------------------------------------
function round2(v) { return Math.round(v * 100) / 100; }
const landmarkAll = [...handLandmarks, ...landmarksNew];
const counts = {};
for (const d of decor) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
const summary = {
  zone: Z.key,
  landmarks: { hand: handLandmarks.length, generated: landmarksNew.length, total: landmarkAll.length },
  decor: counts, vignetteRecipes: recipeCount, signs: signs.length, samples: samples.length,
  remainingGapSamples: samples.filter((s) => s.g > GAP_M).length,
};
console.log(JSON.stringify(summary, null, 2));
// a symmetric zone is written only when every entry has its mirror images (the same check the content tools read back)
if (SYM) {
  const issues = symmetryIssues(decor, landmarksNew, W_M, H_M, SYM);
  if (issues.length) {
    console.error(`asymmetric decor (${SYM}): ${issues.length} entries without an image, first: ${issues.slice(0, 5).join('; ')}`);
    process.exit(1);
  }
  console.log(`symmetric (${SYM}): every decor entry and landmark has its images`);
}
if (DRY) process.exit(0);

if (Z.typed) {
  // a typed zone: its generated life only (the zone module maps it, src/data/world/decor_zones.ts)
  writeZoneDecor(LAYOUT_PATH, { decor, landmarks: landmarksNew });
  console.log(`wrote ${path.relative(ROOT, LAYOUT_PATH).replace(/\\/g, '/')} (${decor.length} decor, ${landmarksNew.length} new landmarks)`);
  process.exit(0);
}
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
