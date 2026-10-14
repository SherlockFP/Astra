// TERRAIN (docs/ENGINE_BIGMAPS.md section 10): headless checks of the rolling open-world ground. No browser, no WebGL, no assets.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/terrain.mjs [--v]
// Stages: det.* (every peer bakes bit-identical heights, in any order), flat.* (pads are exact planes, content stands on them, lakes in basins,
//         bridges at water level), slope.* (grade limit of the surface, 1 m nav steps, an actor walking the steepest hill is never blocked),
//         mesh.* (chunk and classic terrain meshes: vertices == groundY, every triangle == groundY, seams share normals),
//         nav.* (attachTerrain floor == groundY, A* crosses hills), world.* (ground pick ray, batcher / light offsets, ground-hugging shots),
//         zone.* (Sisli Vadi opt-in and modest, Karakir hills and ridge, Kizil Sinir plateau and symmetry), edge.* (map edges rise).
// PASS/FAIL per check, exit code 1 on any failure.
const root = new URL('../../src/', import.meta.url).href;
const imp = (p) => import(root + p);
const verbose = process.argv.includes('--v');

let fails = 0, passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const rows = [];
const report = (name, text) => rows.push(`  ${name.padEnd(34)} ${text}`);
const warns = [];
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

const THREE = await import('three');
const { TILE_SIZE: T } = await imp('types/dungeons.ts');
const R = await imp('world/Relief.ts');
const RM = await imp('world/ReliefMesh.ts');
const NB = await imp('world/NavBase.ts');
const { NavGrid } = await imp('world/NavGrid.ts');
const { World } = await imp('world/World.ts');
const { InstanceBatcher } = await imp('world/Instancing.ts');
const { LightPool } = await imp('world/LightPool.ts');
const { SISLI_VADI } = await imp('data/world/sisli_vadi.ts');
const { KARAKIR_BOZKIRI } = await imp('data/world/karakir.ts');
const { KIZIL_SINIR } = await imp('data/world/kizil_sinir.ts');
const { RNG } = await imp('core/utils.ts');

const ZONES = [SISLI_VADI, KARAKIR_BOZKIRI, KIZIL_SINIR];
const ms = (t0) => performance.now() - t0;
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const tc = (c) => (c + 0.5) * T;
const fnv = (f32) => {
  const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const sameBits = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};

// ---------------------------------------------------------------------------------------------------------------------
// bake every zone (timed), keep the results
// ---------------------------------------------------------------------------------------------------------------------
const relief = {};
for (const def of ZONES) {
  const t0 = performance.now();
  const r = R.buildRelief(def);
  relief[def.id] = r;
  ok(`bake.${def.id}`, !!r && r.nx > 10, r ? `${r.nx}x${r.nz} vertices, cell ${r.cell} m, ${mb(r.h.byteLength)}` : 'null');
  report(`bake ${def.id}`, `${ms(t0).toFixed(0)} ms, ${r.nx}x${r.nz} @ ${r.cell} m, ${mb(r.h.byteLength)}, y ${r.stats.minY.toFixed(1)}..${r.stats.maxY.toFixed(1)}, ${r.pads.length} pads, ${(r.stats.clampedFraction * 100).toFixed(1)} % of vertices moved by the slope clamp`);
}
ok('bake.flat-zone-null', R.buildRelief({ ...SISLI_VADI, world: { ...SISLI_VADI.world, relief: undefined } }) === null, 'a zone without world.relief stays flat');

// ---------------------------------------------------------------------------------------------------------------------
// det.*: peers bake identical terrain
// ---------------------------------------------------------------------------------------------------------------------
{
  const realRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return 0.5; };
  const order = [KIZIL_SINIR, SISLI_VADI, KARAKIR_BOZKIRI]; // another order, as another peer would load the zones
  const again = {};
  for (const def of order) again[def.id] = R.buildRelief(structuredClone(def));
  Math.random = realRandom;
  for (const def of ZONES) {
    ok(`det.${def.id}.bits`, sameBits(relief[def.id].h, again[def.id].h), `checksum ${fnv(relief[def.id].h)}`);
    ok(`det.${def.id}.pads`, JSON.stringify(relief[def.id].pads) === JSON.stringify(again[def.id].pads), `${relief[def.id].pads.length} pads identical`);
  }
  ok('det.no-random', randomCalls === 0, `${randomCalls} Math.random calls while baking`);
  // the bake source holds no transcendental calls (their results may differ between engines)
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../src/world/Relief.ts', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok('det.no-trig', !/Math\.(sin|cos|tan|atan|atan2|pow|exp|log|random|hypot|cbrt)\b|\*\*/.test(src), 'only + - * / sqrt floor min max abs');
  ok('det.no-clock-in-heights', !/Date\.now|new Date/.test(src), 'no wall clock');
  const sums = ZONES.map((d) => `${d.id} ${fnv(relief[d.id].h)}`).join(', ');
  report('height checksums (Float32 grid)', sums);
}

// ---------------------------------------------------------------------------------------------------------------------
// flat.*: pads, content, lakes, bridges
// ---------------------------------------------------------------------------------------------------------------------
const rng = new RNG(4711);
for (const def of ZONES) {
  const r = relief[def.id];
  const w = def.world;
  // every pad is an exact plane over its whole shape
  let bad = 0, samples = 0, worst = 0, nested = 0;
  for (const p of r.pads) {
    const ext = Math.max(p.hx, p.hz) + p.rr;
    for (let k = 0; k < 120; k++) {
      const x = p.x + (rng.next() * 2 - 1) * (p.hx + p.rr), z = p.z + (rng.next() * 2 - 1) * (p.hz + p.rr);
      if (R.padDistance(p, x, z) > 0) continue;
      samples++;
      const d = Math.abs(r.groundY(x, z) - p.y);
      worst = Math.max(worst, d);
      if (d > 1e-3) bad++;
    }
    void ext;
    if (r.pads.some((o) => o !== p && o.y === p.y && Math.hypot(o.x - p.x, o.z - p.z) < Math.max(o.hx, o.hz) + o.rr)) nested++;
  }
  ok(`flat.${def.id}.pads-exact`, bad === 0 && samples > 500, `${r.pads.length} pads, ${samples} samples inside them, worst deviation ${worst.toExponential(1)} m (${nested} pads sit inside a bigger one)`);
  // content stands on its pad: villages (centre + bounds corners), landmarks, bosses, entrances, waypoints, shrines, chests, metin, rares, mini-bosses
  const spots = [];
  for (const v of w.villages) {
    const cx = tc(v.center[0]), cz = tc(v.center[1]);
    spots.push([v.id, cx, cz], [v.id + ':NE', cx + v.bounds[0], cz + v.bounds[1]], [v.id + ':SW', cx - v.bounds[0], cz - v.bounds[1]]);
    for (const g of v.gates) spots.push([`${v.id}:gate:${g.id}`, cx + g.pos[0], cz + g.pos[1]]);
    for (const n of v.npcs) if (!n.decor) spots.push([`${v.id}:npc:${n.id}`, cx + n.pos[0], cz + n.pos[2]]);
  }
  for (const l of w.landmarks) spots.push([l.id, tc(l.pos[0]), tc(l.pos[1])]);
  for (const b of def.bosses) spots.push([b.bossId, tc(b.pos[0]), tc(b.pos[1])]);
  for (const e of w.entrances) spots.push([e.id, tc(e.pos[0]), tc(e.pos[1])]);
  for (const p of w.waypoints) spots.push([p.id, tc(p.pos[0]), tc(p.pos[1])]);
  for (const p of w.shrines) spots.push([p.id, tc(p.pos[0]), tc(p.pos[1])]);
  for (const p of w.chests) spots.push([p.id, tc(p.pos[0]), tc(p.pos[1])]);
  for (const p of w.metin.spots) spots.push([p.id, tc(p.pos[0]), tc(p.pos[1])]);
  for (const p of w.minibosses) spots.push([p.id, tc(p.lair[0]), tc(p.lair[1])]);
  spots.push(['start', tc(def.start.pos[0]), tc(def.start.pos[1])], ['exit', tc(def.exit.pos[0]), tc(def.exit.pos[1])]);
  let off = 0, worstOff = 0, firstOff = '';
  for (const [id, x, z] of spots) {
    const pad = r.padAt(x, z);
    // the village NPCs / gates may lie just outside the box + 5 m skirt: only points inside some pad are asserted
    if (!pad) { if (/:npc:|:gate:/.test(id)) continue; off++; firstOff ||= id; continue; }
    const d = Math.abs(r.groundY(x, z) - pad.y);
    worstOff = Math.max(worstOff, d);
    if (d > 1e-3) { off++; firstOff ||= id; }
  }
  ok(`flat.${def.id}.content-on-pads`, off === 0, `${spots.length} placed points, worst ${worstOff.toExponential(1)} m${firstOff ? ', first off: ' + firstOff : ''}`);
  // ground under every camp centre and its radius: slope the actors meet
  let camps = 0, steep = 0, maxCampSlope = 0;
  for (const p of def.packs) {
    camps++;
    const cx = tc(p.center[0]), cz = tc(p.center[1]);
    for (let a = 0; a < 8; a++) {
      const s = r.slopeAt(cx + Math.cos(a * 0.785) * (p.radius ?? 8) * 0.5, cz + Math.sin(a * 0.785) * (p.radius ?? 8) * 0.5);
      maxCampSlope = Math.max(maxCampSlope, s);
      if (s > R.DEFAULT_MAX_GRADE * 1.5) steep++;
    }
  }
  ok(`flat.${def.id}.camps-walkable`, maxCampSlope <= R.HARD_MAX_GRADE * 1.5 + 0.01, `${camps} camps, steepest ground inside a camp ${maxCampSlope.toFixed(2)}`);
  // lakes lie in basins, shores above the water plane
  let lakeBad = 0, wet = 0, dry = 0;
  for (const [wi, wt] of w.water.entries()) {
    const lv = r.waterLevels[wi];
    const x0 = wt.rect.x * T, z0 = wt.rect.z * T, x1 = (wt.rect.x + wt.rect.w) * T, z1 = (wt.rect.z + wt.rect.h) * T;
    // every point inside the rect (islands and bridge corridors aside) is below the water plane
    for (let k = 0; k < 80; k++) {
      const x = x0 + rng.next() * (x1 - x0), z = z0 + rng.next() * (z1 - z0);
      // an island is a walkable room entirely inside the rect: it stays dry (a landmark on it may raise it further)
      const isle = def.rooms.some((q) => q.rect.x >= wt.rect.x && q.rect.z >= wt.rect.z && q.rect.x + q.rect.w <= wt.rect.x + wt.rect.w && q.rect.z + q.rect.h <= wt.rect.z + wt.rect.h
        && x >= q.rect.x * T && x < (q.rect.x + q.rect.w) * T && z >= q.rect.z * T && z < (q.rect.z + q.rect.h) * T);
      if (isle) { dry++; if (r.groundY(x, z) <= lv + R.WATER_Y) lakeBad++; continue; }
      if (Math.min(x - x0, x1 - x, z - z0, z1 - z) < 3) continue; // the shoreline vertices are 0.2 m above the plane: the first 3 m inside (a triangle at a corner) may stay just dry
      // the bed climbs to an island (a beach within 20 m of the room) and ramps away from a bridge deck: not counted
      const beach = def.rooms.some((q) => q.rect.x >= wt.rect.x && q.rect.z >= wt.rect.z && q.rect.x + q.rect.w <= wt.rect.x + wt.rect.w && q.rect.z + q.rect.h <= wt.rect.z + wt.rect.h
        && x >= q.rect.x * T - 20 && x < (q.rect.x + q.rect.w) * T + 20 && z >= q.rect.z * T - 20 && z < (q.rect.z + q.rect.h) * T + 20);
      if (beach) continue;
      wet++;
      if (r.groundY(x, z) > lv + R.WATER_Y + 0.12) lakeBad++;
    }
    // the ground just outside a lake that is wider than a river rises above the plane
    if (wt.rect.w > 6 && wt.rect.h > 6) {
      let s = 0, n = 0;
      for (let k = 0; k < 20; k++) {
        const z = z0 + (z1 - z0) * (k / 19);
        s += r.groundY(x1 + 7, z); n++;
      }
      if (s / n < lv + 0.1) lakeBad++;
    }
  }
  ok(`flat.${def.id}.lakes`, lakeBad === 0, `${w.water.length} water rects in basins: ${wet} points under the plane, ${dry} on islands, shores above it`);
  // bridges: pinned to water level along the deck
  let bridgePts = 0, bridgeBad = 0;
  for (const road of w.roads) {
    if (road.kind !== 'bridge') continue;
    for (let s = 0; s + 1 < road.pts.length; s++) {
      for (let k = 0; k <= 10; k++) {
        const x = tc(road.pts[s][0] + (road.pts[s + 1][0] - road.pts[s][0]) * (k / 10)), z = tc(road.pts[s][1] + (road.pts[s + 1][1] - road.pts[s][1]) * (k / 10));
        bridgePts++;
        if (!r.waterLevels.some((q) => Math.abs(r.groundY(x, z) - q) < 1e-3) && Math.abs(r.groundY(x, z)) > 1e-3) bridgeBad++;
      }
    }
  }
  ok(`flat.${def.id}.bridges`, bridgeBad === 0, `${bridgePts} deck samples at their lake level (or 0)`);
  // roads follow the ground gently: the longitudinal grade along every road
  let roadMax = 0;
  for (const road of w.roads) {
    if (road.kind === 'bridge') continue;
    let prev = null;
    for (let s = 0; s + 1 < road.pts.length; s++) {
      const L = Math.hypot(road.pts[s + 1][0] - road.pts[s][0], road.pts[s + 1][1] - road.pts[s][1]) * T;
      const n = Math.max(1, Math.round(L / 2));
      for (let k = 0; k <= n; k++) {
        const x = tc(road.pts[s][0] + (road.pts[s + 1][0] - road.pts[s][0]) * (k / n)), z = tc(road.pts[s][1] + (road.pts[s + 1][1] - road.pts[s][1]) * (k / n));
        const y = r.groundY(x, z);
        if (prev !== null) roadMax = Math.max(roadMax, Math.abs(y - prev) / 2);
        prev = y;
      }
      prev = null;
    }
  }
  ok(`flat.${def.id}.roads`, roadMax <= 0.36, `steepest road grade ${roadMax.toFixed(2)} (limit ${R.DEFAULT_MAX_GRADE})`);
}

// ---------------------------------------------------------------------------------------------------------------------
// slope.*
// ---------------------------------------------------------------------------------------------------------------------
for (const def of ZONES) {
  const r = relief[def.id];
  const L = def.world.relief.maxGrade ?? R.DEFAULT_MAX_GRADE;
  let worstAxis = 0, worstDiag = 0;
  for (let j = 0; j < r.nz; j++)
    for (let i = 0; i < r.nx; i++) {
      const h = r.h[j * r.nx + i];
      if (i + 1 < r.nx) worstAxis = Math.max(worstAxis, Math.abs(r.h[j * r.nx + i + 1] - h) / r.cell);
      if (j + 1 < r.nz) worstAxis = Math.max(worstAxis, Math.abs(r.h[(j + 1) * r.nx + i] - h) / r.cell);
      if (i + 1 < r.nx && j + 1 < r.nz) worstDiag = Math.max(worstDiag, Math.abs(r.h[(j + 1) * r.nx + i + 1] - h) / (r.cell * Math.SQRT2));
      if (i > 0 && j + 1 < r.nz) worstDiag = Math.max(worstDiag, Math.abs(r.h[(j + 1) * r.nx + i - 1] - h) / (r.cell * Math.SQRT2));
    }
  // hard limit 0.4 everywhere (1 m nav steps stay below VERT.STEP_UP 0.45); above the zone's own limit only where two flat pads sit closer
  // together than the slope allows (a village and a chest 14 m apart): a handful of vertex pairs, counted here
  ok(`slope.${def.id}.grid`, worstAxis <= R.HARD_MAX_GRADE + 1e-4 && worstDiag <= R.HARD_MAX_GRADE + 1e-4 && r.stats.overGrade <= 40, `neighbour grade axis ${worstAxis.toFixed(3)}, diagonal ${worstDiag.toFixed(3)} (limit ${L}, hard ${R.HARD_MAX_GRADE}); ${r.stats.overGrade} pairs above the limit`);
  ok(`slope.${def.id}.grid-strict`, r.stats.overGrade === 0, 'no neighbour pair above the limit (shipped zones lay their flat pads out so the slope fits)');
  ok(`slope.${def.id}.surface`, r.stats.maxGrade <= R.HARD_MAX_GRADE * Math.SQRT2 + 1e-3, `steepest triangle ${r.stats.maxGrade.toFixed(3)} (<= ${(R.HARD_MAX_GRADE * Math.SQRT2).toFixed(3)})`);
  // sampled 1 m steps of the real surface: always below VERT.STEP_UP (0.45)
  let worstStep = 0;
  for (let k = 0; k < 40000; k++) {
    const x = rng.next() * r.sizeX, z = rng.next() * r.sizeZ;
    const y = r.groundY(x, z);
    worstStep = Math.max(worstStep, Math.abs(r.groundY(x + 1, z) - y), Math.abs(r.groundY(x, z + 1) - y));
  }
  ok(`slope.${def.id}.step1m`, worstStep < 0.45, `largest 1 m step over 40,000 samples ${worstStep.toFixed(3)} m (VERT.STEP_UP 0.45)`);
}
{
  // a walker (7 m/s at 60 fps, and 10 fps hitches) over the steepest straight 60 m of Karakir: resolveMove never blocks it
  const def = KARAKIR_BOZKIRI, r = relief[def.id];
  const tiles = (() => {
    const W = def.grid.w, H = def.grid.h;
    const roomIdx = new Int16Array(W * H).fill(-1), hWall = new Uint8Array(W * (H + 1)), vWall = new Uint8Array((W + 1) * H);
    NB.paintRoomTiles(def, roomIdx);
    NB.computeWalls(W, H, roomIdx, true, hWall, vWall);
    return { W, H, roomIdx, hWall, vWall };
  })();
  const nav = new NavGrid({ originX: -0.5, originZ: -0.5, width: def.grid.w * T + 1, depth: def.grid.h * T + 1, cellSize: 1, walkable: false });
  NB.fillNavFast(tiles, nav);
  const t0 = performance.now();
  nav.attachTerrain({ groundY: (x, z) => r.groundY(x, z), flagsAt: () => 0 });
  const tAttach = ms(t0);
  ok('nav.vertical', nav.vertical && nav.region === null && nav.sameRegion({ x: 0, z: 0 }, { x: 900, z: 900 }), 'floor set, no regions, sameRegion always true');
  let floorBad = 0;
  for (let k = 0; k < 20000; k++) {
    const c = Math.floor(rng.next() * nav.cols), rw = Math.floor(rng.next() * nav.rows);
    if (nav.floor[rw * nav.cols + c] !== Math.fround(r.groundY(nav.centerX(c), nav.centerZ(rw)))) floorBad++;
  }
  ok('nav.floor-parity', floorBad === 0, `20,000 cells: nav.floor == groundY(cell centre)`);
  // 4-neighbour steps between open cells
  let steps = 0, over = 0;
  for (let rw = 0; rw < nav.rows - 1; rw += 1)
    for (let c = 0; c < nav.cols - 1; c += 1) {
      const i = rw * nav.cols + c;
      if (!nav.cells[i]) continue;
      if (nav.cells[i + 1]) { steps++; if (Math.abs(nav.floor[i + 1] - nav.floor[i]) > 0.45) over++; }
      if (nav.cells[i + nav.cols]) { steps++; if (Math.abs(nav.floor[i + nav.cols] - nav.floor[i]) > 0.45) over++; }
    }
  ok('nav.steps', over === 0 && steps > 1e6, `${steps} open 1 m steps, ${over} above STEP_UP`);
  report('nav.attachTerrain Karakir', `${tAttach.toFixed(0)} ms, floor ${mb(nav.floor.byteLength)} + flags ${mb(nav.flags.byteLength)} (1,600 x 1,200 m)`);
  // walk the steepest 60 m line
  let best = null;
  for (let k = 0; k < 4000; k++) {
    const x = 50 + rng.next() * (def.grid.w * T - 100), z = 50 + rng.next() * (def.grid.h * T - 100);
    const a = rng.next() * Math.PI * 2;
    let rise = 0;
    for (let s = 0; s < 60; s++) rise += Math.abs(r.groundY(x + Math.cos(a) * (s + 1), z + Math.sin(a) * (s + 1)) - r.groundY(x + Math.cos(a) * s, z + Math.sin(a) * s));
    let open = true;
    for (let s = 0; s <= 60 && open; s += 2) open = nav.isWalkable(x + Math.cos(a) * s, z + Math.sin(a) * s);
    if (open && (!best || rise > best.rise)) best = { x, z, a, rise };
  }
  ok('walk.found-steep-line', !!best && best.rise > 12, best ? `60 m line with ${best.rise.toFixed(1)} m of up and down` : 'none');
  if (best) {
    for (const [speed, dt] of [[7, 1 / 60], [7, 0.1], [9, 1 / 30]]) {
      const pos = new THREE.Vector3(best.x, 0, best.z);
      let blocked = 0, n = 0;
      let feet = r.groundY(pos.x, pos.z);
      for (let s = 0; s < 60 / (speed * dt); s++) {
        const px = pos.x, pz = pos.z;
        pos.x += Math.cos(best.a) * speed * dt;
        pos.z += Math.sin(best.a) * speed * dt;
        if (nav.resolveMove(pos, px, pz, 0.4, feet, false)) blocked++;
        feet = r.groundY(pos.x, pos.z);
        n++;
      }
      ok(`walk.never-blocked.${speed}@${Math.round(1 / dt)}fps`, blocked === 0, `${n} steps up and down ${best.rise.toFixed(1)} m of hill, ${blocked} blocked`);
    }
    // A* + walkLine across the same hills
    const a = { x: best.x, z: best.z }, b = { x: best.x + Math.cos(best.a) * 60, z: best.z + Math.sin(best.a) * 60 };
    ok('nav.walkLine', nav.walkLine(a.x, a.z, b.x, b.z), 'the steepest line is walkable for steering');
  }
  {
    // raycastY: a hill between two bodies blocks the eye-to-chest ray, open ground does not
    let blockedOk = 0, blockedN = 0, clearOk = 0, clearN = 0;
    for (let k = 0; k < 6000 && (blockedN < 60 || clearN < 60); k++) {
      const x = 80 + rng.next() * (def.grid.w * T - 160), z = 80 + rng.next() * (def.grid.h * T - 160);
      const a = rng.next() * Math.PI * 2, len = 25 + rng.next() * 30;
      const x2 = x + Math.cos(a) * len, z2 = z + Math.sin(a) * len;
      if (!nav.isWalkable(x, z) || !nav.isWalkable(x2, z2)) continue;
      const ay = r.groundY(x, z) + 1.4, by = r.groundY(x2, z2) + 1.1;
      let worst = -Infinity;
      for (let s = 1; s < len; s += 0.25) worst = Math.max(worst, r.groundY(x + Math.cos(a) * s, z + Math.sin(a) * s) - (ay + (by - ay) * (s / len)));
      // only pairs whose straight cells are open (no baked wall / pocket): compare with the flat raycast
      if (nav.raycast(x, z, x2, z2) < 1) continue;
      const f = nav.raycastY(x, ay, z, x2, by, z2);
      if (worst > 0.5 && blockedN < 60) { blockedN++; if (f < 1) blockedOk++; }
      else if (worst < -0.5 && clearN < 60) { clearN++; if (f >= 1) clearOk++; }
    }
    ok('nav.raycastY-terrain', blockedN >= 20 && clearN >= 20 && blockedOk === blockedN && clearOk === clearN, `${blockedN} rays behind a hill all blocked (${blockedOk}), ${clearN} over open ground all clear (${clearOk})`);
  }
  {
    // a detour: two walkable points 140 m apart with a tree / rock wall circle between them
    const a = { x: 300, z: 640 }, b = { x: 440, z: 640 };
    nav.setCircle(370, 640, 14, false);
    const tp = performance.now();
    const path = nav.findPath(a, b);
    const tPath = ms(tp);
    ok('nav.findPath', !!path && path.length >= 1 && path.every((p) => Number.isFinite(p.y)), `path with ${path ? path.length : 0} waypoints in ${tPath.toFixed(1)} ms around a blocker, waypoint y = floor`);
    nav.setCircle(370, 640, 14, true);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// mesh.*: what is drawn is what is stood on
// ---------------------------------------------------------------------------------------------------------------------
function triangleCheck(r, geo, ox, oz, x, z) {
  // locate the grid triangle of the mesh that contains (x, z) and interpolate; returns the mesh height
  const pos = geo.getAttribute('position').array, idx = geo.index.array;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    const ax = pos[a] + ox, az = pos[a + 2] + oz, bx = pos[b] + ox, bz = pos[b + 2] + oz, cx = pos[c] + ox, cz = pos[c + 2] + oz;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * pos[a + 1] + l2 * pos[b + 1] + l3 * pos[c + 1];
  }
  return NaN;
}
{
  const r = relief[KARAKIR_BOZKIRI.id];
  let vertBad = 0, triBad = 0, triN = 0, normBad = 0, upBad = 0;
  const chunks = [[0, 0], [10, 7], [13, 11], [25, 18], [-3, -3], [27, 18]];
  for (const [cx, cz] of chunks) {
    const g = RM.reliefChunkGeometry(r, cx, cz, 64);
    const ox = cx * 64 + 32, oz = cz * 64 + 32;
    const pos = g.getAttribute('position').array, nor = g.getAttribute('normal').array;
    ok(`mesh.chunk${cx},${cz}.counts`, g.getAttribute('position').count === 17 * 17 && g.index.count === 16 * 16 * 6, '17 x 17 vertices, 512 triangles');
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i] + ox, z = pos[i + 2] + oz;
      if (Math.abs(pos[i + 1] - r.groundY(x, z)) > 1e-4) vertBad++;
      const nn = Math.hypot(nor[i], nor[i + 1], nor[i + 2]);
      if (Math.abs(nn - 1) > 1e-4 || nor[i + 1] <= 0) normBad++;
    }
    // triangles face up
    const idx = g.index.array;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      if (uz * vx - ux * vz <= 0) upBad++;
    }
    for (let s = 0; s < 120; s++) {
      const x = cx * 64 + rng.next() * 64, z = cz * 64 + rng.next() * 64;
      const y = triangleCheck(r, g, ox, oz, x, z);
      triN++;
      if (!(Math.abs(y - r.groundY(x, z)) < 1e-4)) triBad++;
    }
    g.dispose();
  }
  ok('mesh.chunk.vertices', vertBad === 0, `${chunks.length} chunks: every vertex y == groundY(x, z)`);
  ok('mesh.chunk.triangles', triBad === 0 && triN > 600, `${triN} random points: the mesh triangle under the point interpolates to groundY (diagonals agree)`);
  ok('mesh.chunk.faces-up', upBad === 0, 'all triangles wind counter-clockwise seen from above');
  ok('mesh.chunk.normals', normBad === 0, 'unit, pointing up');
  // seams: the vertex normals of two neighbours agree on the shared edge
  const g1 = RM.reliefChunkGeometry(r, 10, 7, 64), g2 = RM.reliefChunkGeometry(r, 11, 7, 64);
  let seam = 0;
  for (let b = 0; b <= 16; b++) {
    const a1 = (b * 17 + 16) * 3, a2 = (b * 17) * 3;
    for (let q = 0; q < 3; q++) if (Math.abs(g1.getAttribute('normal').array[a1 + q] - g2.getAttribute('normal').array[a2 + q]) > 1e-6) seam++;
    if (Math.abs(g1.getAttribute('position').array[a1 + 1] - g2.getAttribute('position').array[a2 + 1]) > 1e-6) seam++;
  }
  ok('mesh.chunk.seam', seam === 0, 'height and normal agree along the shared chunk edge');
  const tri = g1.index.count / 3;
  report('terrain mesh cost', `streamed chunk ${tri} triangles, ring of 35-81 chunks = ${(tri * 35 / 1000).toFixed(0)}k - ${(tri * 81 / 1000).toFixed(0)}k triangles`);
  g1.dispose();
  g2.dispose();
  // classic path (Sisli Vadi): one mesh from the relief grid
  const rs = relief[SISLI_VADI.id];
  const cx = (SISLI_VADI.grid.w * T) / 2, cz = (SISLI_VADI.grid.h * T) / 2;
  const gc = RM.reliefTerrainGeometry(rs, cx, cz, 440);
  const pc = gc.getAttribute('position').array;
  let cb = 0, minx = 1e9, maxx = -1e9;
  for (let i = 0; i < pc.length; i += 3) {
    const x = pc[i] + cx, z = pc[i + 2] + cz;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    if (Math.abs(pc[i + 1] - rs.groundY(x, z)) > 1e-4) cb++;
  }
  let ct = 0;
  for (let s = 0; s < 80; s++) {
    const x = cx - 430 + rng.next() * 860, z = cz - 430 + rng.next() * 860;
    if (!(Math.abs(triangleCheck(rs, gc, cx, cz, x, z) - rs.groundY(x, z)) < 1e-4)) ct++;
  }
  ok('mesh.classic', cb === 0 && ct === 0 && minx <= cx - 430 && maxx >= cx + 430, `Sisli Vadi: ${gc.getAttribute('position').count} vertices / ${gc.index.count / 3} triangles cover ${minx.toFixed(0)}..${maxx.toFixed(0)} m, vertices and triangles == groundY`);
  gc.dispose();
}
// the terrain shader hooks (classic and chunked) add the slope varying to both stages
{
  const { SLOPE_FRAG, SLOPE_VARYING_FRAG, SLOPE_VARYING_VERT, SLOPE_VERT } = await imp('world/TerrainSlope.ts');
  ok('mesh.slope-shading', SLOPE_VERT.includes('normal.y') && SLOPE_FRAG.includes('smoothstep') && SLOPE_VARYING_FRAG === SLOPE_VARYING_VERT, 'dirt shows through steeper ground; flat ground (normal.y = 1) is unchanged');
}

// ---------------------------------------------------------------------------------------------------------------------
// world.*: ground pick, offsets, hugging
// ---------------------------------------------------------------------------------------------------------------------
{
  const r = relief[KARAKIR_BOZKIRI.id];
  const world = new World(new THREE.Scene(), new NavGrid({ originX: 0, originZ: 0, width: 10, depth: 10, walkable: true }));
  ok('world.flat-default', world.terrain === false && world.groundY(5, 5) === 0 && !world.vertical, 'a world without heights is the flat plane');
  world.heights = r;
  world.vertical = true;
  world.terrain = true;
  ok('world.groundY', world.groundY(900, 600) === r.groundY(900, 600) && world.ceilingY(0, 0) === Infinity, 'World.groundY is the relief');
  let rayBad = 0, rays = 0, rayMiss = 0;
  for (let k = 0; k < 400; k++) {
    // a camera 6-14 m above the ground looking down at 15-70 degrees
    const x = 100 + rng.next() * 1400, z = 100 + rng.next() * 1000;
    const o = new THREE.Vector3(x, r.groundY(x, z) + 6 + rng.next() * 8, z);
    const yaw = rng.next() * Math.PI * 2, pitch = -(0.26 + rng.next() * 0.96);
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const hit = world.rayToGround(new THREE.Ray(o, d), new THREE.Vector3());
    rays++;
    if (!hit) { rayMiss++; continue; }
    if (Math.abs(hit.y - r.groundY(hit.x, hit.z)) > 0.02) rayBad++;
  }
  ok('world.rayToGround', rayBad === 0 && rayMiss < 8, `${rays} downward rays: the hit lies on the surface (${rayMiss} missed, ${rayBad} off)`);
  const up = world.rayToGround(new THREE.Ray(new THREE.Vector3(500, 40, 500), new THREE.Vector3(0, 1, 0)), new THREE.Vector3());
  ok('world.rayToGround.up', up === null, 'a ray pointing at the sky hits nothing');
  // batcher / lights: y is an offset above the ground
  const batcher = new InstanceBatcher(new THREE.Group(), 64);
  batcher.groundY = (x, z) => r.groundY(x, z);
  batcher.add('stub.glb', 700, 0, 520, 0.3, 1);
  batcher.add('stub.glb', 700, 2.5, 520, 0.3, 1);
  const recs = [...batcher.groups.values()].flatMap((g) => g.recs);
  const gy = r.groundY(700, 520);
  ok('world.batcher-offset', recs.length === 2 && Math.abs(recs[0].m.elements[13] - gy) < 1e-4 && Math.abs(recs[1].m.elements[13] - (gy + 2.5)) < 1e-4, `y 0 -> ground ${gy.toFixed(2)}, y 2.5 -> ${(gy + 2.5).toFixed(2)}`);
  const flatB = new InstanceBatcher(new THREE.Group(), 64);
  flatB.add('stub.glb', 700, 2.5, 520, 0, 1);
  ok('world.batcher-flat-unchanged', [...flatB.groups.values()][0].recs[0].m.elements[13] === 2.5, 'no groundY set: y is absolute as before');
  const lights = new LightPool(new THREE.Group(), 2);
  lights.groundY = (x, z) => r.groundY(x, z);
  lights.add([700, 2.4, 520], { color: 0xffffff, intensity: 1, distance: 6, flicker: 0 });
  ok('world.light-offset', Math.abs(lights.torches[0].pos.y - (gy + 2.4)) < 1e-4, 'torch y is an offset above the ground');
}

// ---------------------------------------------------------------------------------------------------------------------
// build.*: the real DungeonBuilder + WorldDecor path (stub models, stub canvas, no GL) for the classic zone (Sisli Vadi) and a streamed one
// ---------------------------------------------------------------------------------------------------------------------
{
  const { G } = await imp('game/G.ts');
  const { buildDungeon } = await imp('world/DungeonBuilder.ts');
  const stubModel = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0), new THREE.MeshStandardMaterial())); return g; };
  G.assets = { texture: () => new THREE.Texture(), instantiate: stubModel, load: async () => ({ scene: stubModel(), voxel: false }) };
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : k === 'getImageData' ? (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : () => undefined) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
  for (const def of [SISLI_VADI, KARAKIR_BOZKIRI]) {
    const t0 = performance.now();
    const scene = new THREE.Scene();
    const built = await buildDungeon(def, scene);
    const tBuild = ms(t0);
    const rel = relief[def.id];
    ok(`build.${def.id}.relief`, !!built.relief && sameBits(built.relief.h, rel.h) && built.nav.vertical, `built in ${tBuild.toFixed(0)} ms: BuiltDungeon.relief is the same bake, nav is vertical`);
    ok(`build.${def.id}.start`, Math.abs(built.start.y - rel.groundY(built.start.x, built.start.z)) < 1e-4 && Math.abs(built.exit.y - rel.groundY(built.exit.x, built.exit.z)) < 1e-4 && built.groundY(built.start.x, built.start.z) === built.start.y, 'start and exit stand on the ground');
    built.world?.primeStream?.(built.start.x, built.start.z);
    let terr = 0, tris = 0, flatTris = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.name.startsWith('terrain')) { terr++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; }
    });
    ok(`build.${def.id}.terrain-mesh`, terr >= 1 && tris > 1000, `${terr} terrain mesh(es), ${tris} triangles in the scene`);
    void flatTris;
    // water planes at their lake level
    let waterBad = 0, waters = 0;
    scene.traverse((o) => {
      if (!o.name.startsWith('water:')) return;
      waters++;
      const wi = def.world.water.findIndex((w) => `water:${w.id}` === o.name);
      if (Math.abs(o.position.y - rel.waterY(wi)) > 1e-6) waterBad++;
    });
    ok(`build.${def.id}.water`, waters === def.world.water.length && waterBad === 0, `${waters} water planes at relief.waterY (lake levels ${rel.waterLevels.map((v) => v.toFixed(1)).join(', ')})`);
    // every instanced matrix of the resident scenery stands on the ground (y = ground + a small model offset)
    let inst = 0, onGround = 0, below = 0, worstBelow = 0;
    const belowBy = new Map();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || o.count === 0) return;
      const a = o.instanceMatrix.array;
      for (let k = 0; k < o.count; k++) {
        inst++;
        const d = a[k * 16 + 13] - rel.groundY(a[k * 16 + 12], a[k * 16 + 14]);
        if (d > -0.06 && d < 8) onGround++;
        if (d < -0.06) { below++; belowBy.set(o.name.split('#')[0], (belowBy.get(o.name.split('#')[0]) ?? 0) + 1); worstBelow = Math.min(worstBelow, d); }
      }
    });
    if (below && verbose) console.log('  below ground:', [...belowBy].map(([k, v]) => `${k} x${v}`).join(', '), 'worst', worstBelow.toFixed(2));
    ok(`build.${def.id}.instances`, inst > 100 && below === 0 && onGround / inst > 0.97, `${inst} resident instances, ${onGround} within 0..8 m above the ground, ${below} below it`);
    if (def.id === KARAKIR_BOZKIRI.id) {
      ok(`build.${def.id}.streamed`, tris < 60000, `resident ring: ${terr} chunk meshes, ${tris} terrain triangles`);
    } else {
      ok(`build.${def.id}.classic`, terr === 1 && tris < 110000, `one mesh, ${tris} triangles (flat Sisli was 18k)`);
      report('classic Sisli Vadi ground', `${tris} triangles in one mesh (4 m cells, 440 m around the centre)`);
    }
    // the start spawns the camera focus: shadow box / lights read the ground (DungeonBuilder.update is exercised without a camera)
    built.dispose();
  }
  delete globalThis.document;
}

// ---------------------------------------------------------------------------------------------------------------------
// zone.*: what each zone asked for
// ---------------------------------------------------------------------------------------------------------------------
{
  const rs = relief[SISLI_VADI.id];
  ok('zone.sisli.opt-in', !!SISLI_VADI.world.relief && SISLI_VADI.world.relief.cellM === 4, 'Sisli Vadi opts in with 4 m cells (the classic one-mesh path)');
  // relief over the walkable part only (pads aside): modest, a few metres
  const def = SISLI_VADI;
  const roomIdx = new Int16Array(def.grid.w * def.grid.h).fill(-1);
  NB.paintRoomTiles(def, roomIdx);
  const vals = [];
  for (let tz = 0; tz < def.grid.h; tz += 2) for (let tx = 0; tx < def.grid.w; tx += 2) if (roomIdx[tz * def.grid.w + tx] >= 0) vals.push(rs.groundY(tc(tx), tc(tz)));
  vals.sort((a, b) => a - b);
  const p = (q) => vals[Math.floor(q * (vals.length - 1))];
  const spread = p(0.95) - p(0.05);
  ok('zone.sisli.modest', spread >= 2.5 && spread <= 9, `walkable ground p5..p95 spans ${spread.toFixed(1)} m (modest relief)`);
  const rk = relief[KARAKIR_BOZKIRI.id];
  const d2 = KARAKIR_BOZKIRI;
  const idx2 = new Int16Array(d2.grid.w * d2.grid.h).fill(-1);
  NB.paintRoomTiles(d2, idx2);
  const spreadOf = (roomId) => {
    const ri = d2.rooms.findIndex((q) => q.id === roomId), v = [];
    for (let tz = 0; tz < d2.grid.h; tz += 2) for (let tx = 0; tx < d2.grid.w; tx += 2) if (idx2[tz * d2.grid.w + tx] === ri) v.push(rk.groundY(tc(tx), tc(tz)));
    v.sort((a, b) => a - b);
    return { span: v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)], max: v[v.length - 1], mean: v.reduce((a, b) => a + b, 0) / v.length };
  };
  const steppe = spreadOf('k1_otlaklar'), ridge = spreadOf('k6_kartal_sirti'), ash = spreadOf('k5_kul_ovasi'), plateau = spreadOf('k3_ruzgar_yaylasi');
  ok('zone.karakir.steppe', steppe.span >= 8 && steppe.span <= 18, `Karakir Otlaklari p5..p95 spans ${steppe.span.toFixed(1)} m (steppe hills 8-15 m)`);
  ok('zone.karakir.ridge', ridge.span >= 16 && ridge.max - ridge.mean >= 10, `Kartal Sirti spans ${ridge.span.toFixed(1)} m, crest ${(ridge.max - ridge.mean).toFixed(1)} m above its mean (about 20 m ridge)`);
  ok('zone.karakir.ash-flat', ash.span < steppe.span * 0.7, `Kul Ovasi is the flat one (${ash.span.toFixed(1)} m)`);
  ok('zone.karakir.plateau', plateau.mean > steppe.mean + 3, `Ruzgar Yaylasi sits ${(plateau.mean - steppe.mean).toFixed(1)} m above the steppe`);
  // Kizil Sinir: keep plateau and symmetry
  const rks = relief[KIZIL_SINIR.id];
  const keep = { x: tc(150), z: tc(150) };
  const ring = [];
  for (let a = 0; a < 16; a++) ring.push(rks.groundY(keep.x + Math.cos(a * 0.3927) * 190, keep.z + Math.sin(a * 0.3927) * 190));
  const ringMean = ring.reduce((a, b) => a + b, 0) / ring.length;
  const cps = [[139, 150], [150, 150], [161, 150]].map(([tx, tz]) => rks.groundY(tc(tx), tc(tz)));
  ok('zone.ks.keep-plateau', Math.max(...cps) - Math.min(...cps) < 1e-3 && cps[1] - ringMean >= 4, `three capture points on one plane at ${cps[1].toFixed(1)} m, ${(cps[1] - ringMean).toFixed(1)} m above the plain 190 m out`);
  let asym = 0, asymN = 0;
  for (let k = 0; k < 6000; k++) {
    const x = 60 + rng.next() * 1080, z = 60 + rng.next() * 1080;
    if (rks.padAt(x, z) || rks.padAt(1200 - x, z) || rks.padAt(x, 1200 - z)) continue;
    // away from roads / pads the field is mirrored: compare with the x-mirror and the z-mirror
    asym = Math.max(asym, Math.abs(rks.groundY(x, z) - rks.groundY(1200 - x, z)), Math.abs(rks.groundY(x, z) - rks.groundY(x, 1200 - z)));
    asymN++;
  }
  const asymMean = (() => {
    let s = 0, n = 0;
    for (let k = 0; k < 6000; k++) {
      const x = 60 + rng.next() * 1080, z = 60 + rng.next() * 1080;
      s += Math.abs(rks.groundY(x, z) - rks.groundY(1200 - x, z)) + Math.abs(rks.groundY(x, z) - rks.groundY(x, 1200 - z));
      n += 2;
    }
    return s / n;
  })();
  ok('zone.ks.symmetric', asymMean < 0.6, `mean |h(x,z) - h(mirror)| ${asymMean.toFixed(2)} m over the map (worst ${asym.toFixed(1)} m beside roads / pads, ${asymN} samples)`);
}

// ---------------------------------------------------------------------------------------------------------------------
// edge.*: hills frame the walkable area
// ---------------------------------------------------------------------------------------------------------------------
for (const def of ZONES) {
  const r = relief[def.id];
  const roomIdx = new Int16Array(def.grid.w * def.grid.h).fill(-1);
  NB.paintRoomTiles(def, roomIdx);
  const inside = [], out = [];
  for (let tz = 0; tz < def.grid.h; tz += 2)
    for (let tx = 0; tx < def.grid.w; tx += 2) {
      const walk = roomIdx[tz * def.grid.w + tx] >= 0;
      const y = r.groundY(tc(tx), tc(tz));
      if (walk) inside.push(y);
      else {
        // distance to the nearest walkable tile within 40 tiles: only void tiles 60-120 m from walkable ground count as "the frame"
        let d = Infinity;
        for (let dz = -30; dz <= 30 && d > 15; dz += 2) for (let dx = -30; dx <= 30; dx += 2) {
          const a = tx + dx, b = tz + dz;
          if (a < 0 || b < 0 || a >= def.grid.w || b >= def.grid.h || roomIdx[b * def.grid.w + a] < 0) continue;
          d = Math.min(d, Math.hypot(dx, dz) * T);
        }
        if (d >= 60 && d <= 130) out.push(y);
      }
    }
  const mean = (v) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  ok(`edge.${def.id}.frame`, out.length < 20 || mean(out) >= mean(inside) + 3, `ground 60-130 m outside the walkable area averages ${mean(out).toFixed(1)} m vs ${mean(inside).toFixed(1)} m inside (${out.length} samples)`);
  // beyond the zone edge the grid continues (terrain exists 160 m past it)
  ok(`edge.${def.id}.margin`, r.ox <= -160 && r.oz <= -160 && r.ox + (r.nx - 1) * r.cell >= r.sizeX + 160, `grid covers ${r.ox}..${r.ox + (r.nx - 1) * r.cell} m`);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('terrain sim report');
for (const r of rows) console.log(r);
if (warns.length && verbose) console.log('warnings:', warns.slice(0, 10));
console.log(`\nterrain: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
