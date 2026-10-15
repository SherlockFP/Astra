#!/usr/bin/env node
/**
 * World density audit (Sisli Vadi, OWNER: content module). Grids the open-world map into 50 x 50 m cells and counts the
 * "interesting things" near each walkable cell, so "the map feels empty" becomes a number.
 *
 *   node tools/world-density.mjs            report, biggest empty patches and an ASCII map
 *   node tools/world-density.mjs --json     the same numbers as JSON (stdout)
 *   node tools/world-density.mjs --radius 25   the same audit with a 25 m radius (open-stretch proxy: what reads as a destination at 20-30 m)
 *
 * Data: src/data/world/sisli_vadi.layout.json (positions in tiles, 1 tile = 4 m; village props / NPCs in metres relative to the
 * village centre). Walkable = the cell centre lies inside a room rect (region rects, bridges, approaches) and outside every water
 * rect. The ground is not sampled and trees are not counted (scatter is procedural filler, not content).
 *
 * Two classes of things. STORY = camps and patrols, points of interest (landmarks, vistas, hidden areas, shrines, waypoints,
 * entrances, arenas), chests, nodes (gathering, metin), villages (centre, buildings, NPCs), decor entries of story kinds (vignette,
 * signpost, field), roads and water. FILLER = decor kinds flora and rocks; they are counted separately so a flora pass cannot hide
 * an empty map. Empty = no STORY thing within RADIUS_M of the cell centre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT_PATH = path.join(ROOT, 'src/data/world/sisli_vadi.layout.json');
const CELL_M = 50;
const radiusIx = process.argv.indexOf('--radius');
const RADIUS_M = radiusIx >= 0 ? Number(process.argv[radiusIx + 1]) : 40;
const ROAD_STEP_M = 4;

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

const raw = fs.readFileSync(LAYOUT_PATH, 'utf8').replace(/^﻿/, '');
const L = JSON.parse(raw);
const T = L.tileSize || 4;
const W_M = L.grid.w * T, H_M = L.grid.h * T;
const NC = Math.ceil(W_M / CELL_M), NR = Math.ceil(H_M / CELL_M);

/** Decor kinds that are filler (no story): counted separately. Any other `decor` kind is story. */
const FILLER_KINDS = new Set(['flora', 'rocks']);

// ---- collect things (metres) ------------------------------------------------------------------------------------------
const things = []; // { cat, x, z, id }
/** Tile coordinate -> metres of the tile centre (the engine's tileToWorld). */
const C = (v) => (v + 0.5) * T;
const add = (cat, tx, tz, id, story = true) => things.push({ cat, x: C(tx), z: C(tz), id, story });
const addM = (cat, x, z, id, story = true) => things.push({ cat, x, z, id, story });

for (const p of L.packs) add('camp', p.center[0], p.center[1], p.id);
for (const p of L.patrols) {
  const n = p.patrol.length;
  const cx = p.patrol.reduce((s, q) => s + q[0], 0) / n, cz = p.patrol.reduce((s, q) => s + q[1], 0) / n;
  add('camp', cx, cz, p.id);
}
for (const r of L.rares) for (const s of r.spots) add('camp', s[0], s[1], r.id);
for (const m of L.minibosses) add('camp', m.lair[0], m.lair[1], m.id);
for (const a of L.arenas) add('poi', a.center[0], a.center[1], a.id);
for (const l of L.landmarks) add('poi', l.pos[0], l.pos[1], l.id);
for (const v of L.vistas) add('poi', v.pos[0], v.pos[1], v.id);
for (const h of L.hiddenAreas) add('poi', h.pos[0], h.pos[1], h.id);
for (const s of L.shrines) add('poi', s.pos[0], s.pos[1], s.id);
for (const w of L.waypoints) add('poi', w.pos[0], w.pos[1], w.id);
for (const e of L.entrances) add('poi', e.pos[0], e.pos[1], e.id);
for (const c of L.chests) add('chest', c.pos[0], c.pos[1], c.id);
for (const c of L.cursedChests) add('chest', c.pos[0], c.pos[1], c.id);
for (const g of L.gatherFields) add('node', g.center[0], g.center[1], g.id);
for (const m of L.metinSpots) add('node', m.pos[0], m.pos[1], m.id);
for (const s of L.settlements) add('village', s.center[0], s.center[1], s.id);
const vill = new Map(L.settlements.map((s) => [s.id, s.center]));
for (const v of L.villages) {
  const c = vill.get(v.id);
  if (!c) continue;
  const ox = C(c[0]), oz = C(c[1]);
  for (const b of v.buildings) addM('prop', ox + b.x, oz + b.z, v.id + ':' + b.label);
  for (const n of v.npcs ?? []) addM('npc', ox + n.x, oz + n.z, n.id);
}
// decor vignettes and filler clusters (optional array; absent until the fill pass)
for (const d of L.decor ?? []) {
  const filler = FILLER_KINDS.has(d.kind);
  add(filler ? 'filler' : 'prop', d.pos[0], d.pos[1], d.id, !filler);
}
// roads and water are lines and areas: sampled into points
const roadPts = [];
for (const r of L.roads) {
  for (let k = 0; k + 1 < r.pts.length; k++) {
    const [ax, az] = [r.pts[k][0] * T, r.pts[k][1] * T], [bx, bz] = [r.pts[k + 1][0] * T, r.pts[k + 1][1] * T];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / ROAD_STEP_M));
    for (let i = 0; i <= n; i++) roadPts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  }
}
const waterRects = L.water.map((w) => ({ id: w.id, x0: w.x0 * T, z0: w.z0 * T, x1: w.x1 * T, z1: w.z1 * T }));
const rooms = L.rooms.map((r) => ({ id: r.id, name: r.name, x0: r.rect.x * T, z0: r.rect.z * T, x1: (r.rect.x + r.rect.w) * T, z1: (r.rect.z + r.rect.h) * T }));

// ---- grid -----------------------------------------------------------------------------------------------------------------
const inRect = (x, z, r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const roomOf = (x, z) => rooms.find((r) => inRect(x, z, r)) ?? null;
const rectDist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

const cells = [];
for (let j = 0; j < NR; j++) {
  for (let i = 0; i < NC; i++) {
    const cx = (i + 0.5) * CELL_M, cz = (j + 0.5) * CELL_M;
    const room = roomOf(cx, cz);
    const wet = waterRects.some((w) => inRect(cx, cz, w));
    cells.push({ i, j, cx, cz, walk: !!room && !wet, room: room?.name ?? null, story: 0, visual: 0, filler: 0, cats: {} });
  }
}
const near = (x, z, r) => Math.hypot(x - r.x, z - r.z) <= RADIUS_M;
for (const c of cells) {
  if (!c.walk) continue;
  for (const t of things) {
    if (!near(c.cx, c.cz, t)) continue;
    if (t.story) {
      c.story++;
      if (t.cat !== 'camp') c.visual++;
      c.cats[t.cat] = (c.cats[t.cat] ?? 0) + 1;
    } else c.filler++;
  }
  if (roadPts.some(([x, z]) => Math.hypot(x - c.cx, z - c.cz) <= RADIUS_M)) {
    c.story++;
    c.visual++;
    c.cats.road = (c.cats.road ?? 0) + 1;
  }
  if (waterRects.some((w) => rectDist(c.cx, c.cz, w) <= RADIUS_M)) {
    c.story++;
    c.visual++;
    c.cats.water = (c.cats.water ?? 0) + 1;
  }
}
const walkable = cells.filter((c) => c.walk);
const empty = walkable.filter((c) => c.story === 0);
const emptyVisual = walkable.filter((c) => c.visual === 0);
const emptyVisualFiller = walkable.filter((c) => c.visual === 0 && c.filler === 0);

// ---- biggest empty patches (4-connected empty cells) ------------------------------------------------------------------
const key = (i, j) => j * NC + i;
const isEmpty = (c) => c.walk && c.visual === 0;
const seen = new Set();
const patches = [];
for (const c of cells) {
  if (!isEmpty(c) || seen.has(key(c.i, c.j))) continue;
  const stack = [c], members = [];
  seen.add(key(c.i, c.j));
  while (stack.length) {
    const q = stack.pop();
    members.push(q);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = q.i + di, nj = q.j + dj;
      if (ni < 0 || nj < 0 || ni >= NC || nj >= NR) continue;
      const n = cells[key(ni, nj)];
      if (!isEmpty(n) || seen.has(key(ni, nj))) continue;
      seen.add(key(ni, nj));
      stack.push(n);
    }
  }
  const xs = members.map((m) => m.cx), zs = members.map((m) => m.cz);
  const area = members.length * CELL_M * CELL_M;
  const centre = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...zs) + Math.max(...zs)) / 2)];
  const regionCount = new Map();
  for (const m of members) regionCount.set(m.room, (regionCount.get(m.room) ?? 0) + 1);
  const region = [...regionCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
  patches.push({ cells: members.length, areaM2: area, centre, bbox: [Math.min(...xs) - CELL_M / 2, Math.min(...zs) - CELL_M / 2, Math.max(...xs) + CELL_M / 2, Math.max(...zs) + CELL_M / 2], region });
}
patches.sort((a, b) => b.areaM2 - a.areaM2);

// ---- totals -----------------------------------------------------------------------------------------------------------
const byCat = {};
for (const t of things) byCat[t.cat] = (byCat[t.cat] ?? 0) + 1;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const summary = {
  layout: path.relative(ROOT, LAYOUT_PATH).replace(/\\/g, '/'),
  mapM: [W_M, H_M], cellM: CELL_M, radiusM: RADIUS_M,
  cells: { total: cells.length, walkable: walkable.length, walkableKm2: Math.round((walkable.length * CELL_M * CELL_M) / 1e4) / 100 },
  empty: {
    incCamps: empty.length, incCampsPct: pct(empty.length, walkable.length),
    visual: emptyVisual.length, visualPct: pct(emptyVisual.length, walkable.length),
    visualNoFiller: emptyVisualFiller.length, visualNoFillerPct: pct(emptyVisualFiller.length, walkable.length),
  },
  things: byCat,
  landmarks: L.landmarks.length,
  decor: (L.decor ?? []).length,
  patches: patches.slice(0, 8),
};

if (asJson) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

// ---- report -----------------------------------------------------------------------------------------------------------
const line = (s = '') => process.stdout.write(s + '\n');
line(`World density: ${summary.layout}  (${W_M} x ${H_M} m, ${CELL_M} m cells, radius ${RADIUS_M} m)`);
line(`Walkable cells: ${walkable.length} of ${cells.length} (${summary.cells.walkableKm2} km2)`);
line(`Empty, owner definition (no story thing incl. camps within ${RADIUS_M} m): ${empty.length}  = ${summary.empty.incCampsPct} %`);
line(`Empty, visual (no POI, node, chest, village, prop, NPC, decor, road, water; camps not counted): ${emptyVisual.length}  = ${summary.empty.visualPct} %`);
line(`  ...and no filler (flora / rocks / fields) either:                                      ${emptyVisualFiller.length}  = ${summary.empty.visualNoFillerPct} %`);
line(`Things on the map: ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(', ')}`);
line(`Landmarks (named sub-areas): ${summary.landmarks}   decor entries: ${summary.decor}`);
line('');
line('Biggest visual-empty patches (4-connected cells with no visual thing within the radius):');
if (!patches.length) line('  none');
for (const p of patches.slice(0, 8)) {
  line(`  ${String(p.cells).padStart(4)} cells  ${String(Math.round(p.areaM2 / 1e4) / 100).padStart(5)} km2  centre (${p.centre[0]}, ${p.centre[1]}) m  bbox [${p.bbox.map((v) => Math.round(v)).join(', ')}]  ${p.region}`);
}
line('');
line(`ASCII map (north at top, cell = 50 m, digit = visual things within ${RADIUS_M} m, capped 9, "." = visual-empty, "#" = not walkable)`);
for (let j = 0; j < NR; j++) {
  let s = '';
  for (let i = 0; i < NC; i++) {
    const c = cells[key(i, j)];
    s += !c.walk ? '#' : c.visual === 0 ? '.' : String(Math.min(9, c.visual));
  }
  line('  ' + s);
}
