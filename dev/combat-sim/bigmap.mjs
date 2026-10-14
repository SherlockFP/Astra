// BIG MAPS (docs/ENGINE_BIGMAPS.md): headless checks of the chunk-streamed open world. No browser, no WebGL, no assets.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/bigmap.mjs [--v]
// Stages: nav.* (fast nav fill == original per-cell rule on Sisli Vadi + random maps), splat.* (chunk seams), streamer.* (resident
//         set bound, hysteresis, budget, teleports), scatter.* (chunk content is a pure function of the chunk; density matches the
//         whole-map WorldScatter on Sisli Vadi), peers.* (host and client stream differently, see the same world), camps.* (bucket
//         index == brute force), cfg.* (Sisli Vadi keeps the classic path), synth2048 / synth4096 (synthetic layouts built in this
//         file, never shipped): build time, memory, chunk counts, a long walk with the resident chunks asserted <= the bound.
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

const { TILE_SIZE: T } = await imp('types/dungeons.ts');
const NB = await imp('world/NavBase.ts');
const SC = await imp('world/chunks/StreamConfig.ts');
const CS = await imp('world/chunks/ChunkStreamer.ts');
const CScat = await imp('world/chunks/ChunkScatter.ts');
const SP = await imp('world/chunks/SplatPaint.ts');
const AI = await imp('world/chunks/AvoidIndex.ts');
const CI = await imp('scenes/world/CampIndex.ts');
const WS = await imp('world/WorldScenery.ts');
const { NavGrid } = await imp('world/NavGrid.ts');
const { SISLI_VADI } = await imp('data/world/sisli_vadi.ts');
const { REGIONS } = await imp('data/world/regions.ts');
const { RNG } = await imp('core/utils.ts');
const { gridOf, perfOf, LAYOUT } = await imp('data/world/layout.ts');

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const mem = () => { const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
const ms = (t0) => performance.now() - t0;

// ---------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------
function tilesOf(def) {
  const W = def.grid.w, H = def.grid.h;
  const roomIdx = new Int16Array(W * H).fill(-1);
  const hWall = new Uint8Array(W * (H + 1));
  const vWall = new Uint8Array((W + 1) * H);
  NB.paintRoomTiles(def, roomIdx);
  NB.computeWalls(W, H, roomIdx, !!def.outdoor, hWall, vWall);
  return { W, H, roomIdx, hWall, vWall };
}
const navFor = (def) => new NavGrid({ originX: -0.5, originZ: -0.5, width: def.grid.w * T + 1, depth: def.grid.h * T + 1, cellSize: 1, walkable: false });
const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const hostOf = (def, tiles) => {
  const q = NB.tileQueryOf(tiles);
  return { tileRoom: q.room, hasH: q.hasH, hasV: q.hasV };
};

/** The avoid list DungeonBuild + buildWorldDecor build (start/exit/bosses/camps + POIs), expressed with the same radii. */
function avoidOf(def) {
  const tc = (c) => (c + 0.5) * T;
  const w = def.world;
  const out = [{ x: tc(def.start.pos[0]), z: tc(def.start.pos[1]), r: 3.2 }, { x: tc(def.exit.pos[0]), z: tc(def.exit.pos[1]), r: 3.2 }];
  for (const b of def.bosses) out.push({ x: tc(b.pos[0]), z: tc(b.pos[1]), r: 7 });
  for (const p of def.packs) out.push({ x: tc(p.center[0]), z: tc(p.center[1]), r: 2.2 });
  for (const v of w.villages) out.push({ x: tc(v.center[0]), z: tc(v.center[1]), r: Math.max(v.bounds[0], v.bounds[1]) + 10 });
  for (const lm of w.landmarks) out.push({ x: tc(lm.pos[0]), z: tc(lm.pos[1]), r: 12 });
  for (const b of def.bosses) out.push({ x: tc(b.pos[0]), z: tc(b.pos[1]), r: 16 });
  for (const m of w.metin.spots) out.push({ x: tc(m.pos[0]), z: tc(m.pos[1]), r: 6 });
  for (const rr of w.rares) for (const s of rr.spots) out.push({ x: tc(s[0]), z: tc(s[1]), r: 6 });
  for (const mb2 of w.minibosses) out.push({ x: tc(mb2.lair[0]), z: tc(mb2.lair[1]), r: 10 });
  for (const g of w.gather) out.push({ x: tc(g.center[0]), z: tc(g.center[1]), r: g.radius * T });
  for (const h of w.hidden) out.push({ x: tc(h.pos[0]), z: tc(h.pos[1]), r: h.radius * T });
  for (const p of [...w.shrines, ...w.chests, ...w.cursed, ...w.vistas, ...w.waypoints]) out.push({ x: tc(p.pos[0]), z: tc(p.pos[1]), r: 3 });
  for (const e of w.entrances) out.push({ x: tc(e.pos[0]), z: tc(e.pos[1]), r: 4 });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// nav.*: the fast base fill is the original per-cell rule
// ---------------------------------------------------------------------------------------------------------------------
{
  const tiles = tilesOf(SISLI_VADI);
  const a = navFor(SISLI_VADI), b = navFor(SISLI_VADI);
  const t0 = performance.now();
  const wa = NB.fillNavReference(tiles, a);
  const tRef = ms(t0);
  const t1 = performance.now();
  const wb = NB.fillNavFast(tiles, b);
  const tFast = ms(t1);
  ok('nav.sisli.cells', sameBytes(a.cells, b.cells), `${a.cols}x${a.rows} cells`);
  // the loop DungeonBuild.buildGrid ran before NavBase.ts existed, verbatim (this.tileRoom / hasH / hasV as closures)
  {
    const { W, H, roomIdx, hWall, vWall } = tiles;
    const tileRoom = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : roomIdx[j * W + i]);
    const hasH = (i, j) => i >= 0 && i < W && j >= 0 && j <= H && hWall[j * W + i] === 1;
    const hasV = (i, j) => j >= 0 && j < H && i >= 0 && i <= W && vWall[j * (W + 1) + i] === 1;
    const o = navFor(SISLI_VADI);
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    for (let cz = 0; cz <= H * T; cz++)
      for (let cx = 0; cx <= W * T; cx++) {
        const mx = cx % T, mz = cz % T;
        const i = Math.floor(cx / T), j = Math.floor(cz / T);
        let walk = false;
        if (mx !== 0 && mz !== 0) walk = tileRoom(i, j) >= 0;
        else if (mx === 0 && mz !== 0) walk = !hasV(i, j) && tileRoom(i - 1, j) >= 0 && tileRoom(i, j) >= 0;
        else if (mz === 0 && mx !== 0) walk = !hasH(i, j) && tileRoom(i, j - 1) >= 0 && tileRoom(i, j) >= 0;
        else walk = !hasH(i, j) && !hasH(i - 1, j) && !hasV(i, j) && !hasV(i, j - 1) && tileRoom(i - 1, j - 1) >= 0 && tileRoom(i, j - 1) >= 0 && tileRoom(i - 1, j) >= 0 && tileRoom(i, j) >= 0;
        if (walk) {
          o.setCell(cx, cz, 1);
          if (cx < minX) minX = cx;
          if (cz < minZ) minZ = cz;
          if (cx > maxX) maxX = cx;
          if (cz > maxZ) maxZ = cz;
        }
      }
    ok('nav.sisli.original', sameBytes(o.cells, a.cells) && minX === wa.minX && maxX === wa.maxX && minZ === wa.minZ && maxZ === wa.maxZ, 'NavBase reference == the original buildGrid loop (cells + walk bounds)');
  }
  ok('nav.sisli.bounds', wa.minX === wb.minX && wa.maxX === wb.maxX && wa.minZ === wb.minZ && wa.maxZ === wb.maxZ, `${wa.minX},${wa.minZ}..${wa.maxX},${wa.maxZ}`);
  report('nav fill Sisli Vadi (640 m)', `reference ${tRef.toFixed(0)} ms, fast ${tFast.toFixed(1)} ms`);
  let walk = 0;
  for (let i = 0; i < a.cells.length; i++) walk += a.cells[i];
  ok('nav.sisli.walkable', walk > 100000, `${walk} walkable cells`);
  // random maps, outdoor and indoor wall rules, overlapping rooms included
  const rng = new RNG(1234);
  let allSame = true;
  for (let k = 0; k < 12; k++) {
    const W = rng.int(12, 40), H = rng.int(12, 40);
    const rooms = [];
    for (let r = 0; r < rng.int(2, 6); r++) {
      const w = rng.int(2, W - 1), h = rng.int(2, H - 1), x = rng.int(0, W - w), z = rng.int(0, H - h);
      rooms.push({ id: `r${r}`, rect: { x, z, w, h } });
    }
    const def = { grid: { w: W, h: H }, rooms, outdoor: k % 2 === 0 };
    const t = tilesOf(def);
    const n1 = navFor(def), n2 = navFor(def);
    const w1 = NB.fillNavReference(t, n1), w2 = NB.fillNavFast(t, n2);
    if (!sameBytes(n1.cells, n2.cells) || w1.minX !== w2.minX || w1.maxX !== w2.maxX || w1.minZ !== w2.minZ || w1.maxZ !== w2.maxZ) allSame = false;
  }
  ok('nav.random12', allSame, '12 random maps, outdoor + indoor rules');
}

// ---------------------------------------------------------------------------------------------------------------------
// splat.*: chunk seams
// ---------------------------------------------------------------------------------------------------------------------
{
  const ops = [
    { t: 'line', ch: 'dirt', x0: -50, z0: -40, x1: 190, z1: 130, w: 3.4, soft: 1.3, amount: 0.95 },
    { t: 'disc', ch: 'dark', x: 70, z: 60, r: 15, soft: 3 },
    { t: 'rect', ch: 'cobble', x: 20, z: 100, hw: 18, hd: 9, soft: 1.5, amount: 0.85 },
  ];
  const noise = new (await imp('world/ProceduralAssets.ts')).TileNoise('terrain:seam', 8, 4);
  // one 128 m chunk at 0.5 m/px must equal the four 64 m chunks at 0.5 m/px (same world pixels)
  const big = SP.paintSplatChunk({ x0: 0, z0: 0, size: 128, res: 256 }, ops, noise);
  let same = true;
  for (const [qx, qz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const small = SP.paintSplatChunk({ x0: qx * 64, z0: qz * 64, size: 64, res: 128 }, ops, noise);
    for (let pz = 0; pz < 128 && same; pz++)
      for (let px = 0; px < 128; px++)
        for (let c = 0; c < 3; c++) {
          if (small[(pz * 128 + px) * 3 + c] !== big[((qz * 128 + pz) * 256 + qx * 128 + px) * 3 + c]) { same = false; break; }
        }
  }
  ok('splat.seams', same, 'one 128 m chunk == four 64 m chunks, pixel for pixel');
  let painted = 0;
  for (let i = 0; i < big.length; i++) if (big[i]) painted++;
  ok('splat.painted', painted > 500, `${painted} non-zero splat bytes`);
}

// ---------------------------------------------------------------------------------------------------------------------
// streamer.*: resident set, hysteresis, budget
// ---------------------------------------------------------------------------------------------------------------------
{
  const log = { loads: 0, unloads: 0 };
  const s = new CS.ChunkStreamer({
    size: 64, loadM: 170, unloadM: 202, minCx: 0, maxCx: 63, minCz: 0, maxCz: 63, maxLoads: 2, maxUnloads: 6,
    load: () => { log.loads++; return 1; }, unload: () => { log.unloads++; },
  });
  const bound = CS.maxResidentFor(64, 202);
  let peak = 0, worst = 0;
  // walk 3000 m along x at 8 m/s, 30 updates a second
  let x = 100, z = 2000;
  for (let i = 0; i < 3000 / 8 * 30; i++) {
    x += 8 / 30;
    const before = log.loads;
    s.update([{ x, z }]);
    worst = Math.max(worst, log.loads - before);
    peak = Math.max(peak, s.size);
  }
  ok('streamer.bound', peak <= bound, `peak ${peak} chunks <= bound ${bound}`);
  ok('streamer.budget', worst <= 2, `max ${worst} loads in one update`);
  ok('streamer.balance', log.loads - log.unloads === s.size, `${log.loads} loads, ${log.unloads} unloads, ${s.size} resident`);
  // hysteresis: standing on a ring edge and jittering 2 m must not load or unload anything (once the walk's backlog is done)
  for (let i = 0; i < 200; i++) s.update([{ x, z }]);
  ok('streamer.settles', s.stats.pending === 0, 'standing still finishes the queued loads');
  // oscillate 8 m back and forth across the ring edge: after a warm-up the resident set stops changing (nothing loads or drops)
  const osc = (n) => { for (let i = 0; i < n; i++) s.update([{ x: x + (i % 2) * 8, z }]); };
  osc(40);
  for (let i = 0; i < 60; i++) s.update([{ x, z }]);
  const l0 = log.loads, u0 = log.unloads;
  osc(400);
  ok('streamer.hysteresis', log.loads === l0 && log.unloads === u0, 'oscillating across a ring edge: no churn');
  // teleport: prime brings the full ring at once and drops the old one
  s.update([{ x: 3500, z: 3500 }], true);
  s.update([{ x: 3500, z: 3500 }], true);
  ok('streamer.teleport', s.size <= bound && s.has(54, 54) && !s.has(10, 31), `${s.size} resident after the jump`);
  // two foci (host: two players far apart) keep two rings
  const two = new CS.ChunkStreamer({ size: 64, loadM: 170, unloadM: 202, minCx: 0, maxCx: 63, minCz: 0, maxCz: 63, load: () => 1, unload: () => undefined });
  two.update([{ x: 300, z: 300 }, { x: 3000, z: 3000 }], true);
  ok('streamer.two-foci', two.size > bound * 0.6 && two.size <= CS.maxResidentFor(64, 202, 2), `${two.size} chunks for 2 players`);
  // out-of-range foci never load outside the existing chunk range
  const edge = new CS.ChunkStreamer({ size: 64, loadM: 170, unloadM: 202, minCx: 0, maxCx: 9, minCz: 0, maxCz: 9, load: () => 1, unload: () => undefined });
  edge.update([{ x: -500, z: -500 }], true);
  ok('streamer.range', edge.size === 0, 'a focus far outside the zone loads nothing');
}

// ---------------------------------------------------------------------------------------------------------------------
// cfg.*: Sisli Vadi keeps the classic path; layout zone field
// ---------------------------------------------------------------------------------------------------------------------
{
  const cfg = SC.streamConfig(SISLI_VADI, null);
  ok('cfg.sisli.stream', cfg.on === true, 'Sisli Vadi (1600 m, zone block): streams by default (?stream=0 gives the classic path)');
  ok('cfg.sisli.forceable', SC.streamConfig(SISLI_VADI, true).on === true && SC.streamConfig(SISLI_VADI, false).on === false, '?stream=1 / ?stream=0');
  ok('cfg.sisli.view', cfg.viewM >= 96 && cfg.viewM <= 320, `view ${cfg.viewM} m, drop ${cfg.dropM} m, chunk ${cfg.chunkM} m, <= ${cfg.maxResident} chunks`);
  const big = { ...SISLI_VADI, grid: { w: 512, h: 512 } };
  ok('cfg.auto2048', SC.streamConfig(big, null).on === true, '2048 m zone streams on auto');
  const off = { ...big, world: { ...big.world, perf: { ...big.world.perf, stream: 'off' } } };
  ok('cfg.off', SC.streamConfig(off, null).on === false, "perf.stream 'off' wins");
  const g = gridOf({ ...LAYOUT, zone: { sizeM: [2048, 1000] } });
  ok('cfg.layout.zone', g.w === 512 && g.h === 250, `zone.sizeM [2048,1000] -> ${g.w}x${g.h} tiles`);
  ok('cfg.layout.grid', gridOf(LAYOUT).w === LAYOUT.grid.w, 'no zone block: grid unchanged');
  const p = perfOf({ ...LAYOUT, zone: { stream: 'on', chunkM: 96, viewM: 200 } }, SISLI_VADI.world.perf);
  ok('cfg.layout.perf', p.stream === 'on' && p.streamChunkM === 96 && p.viewM === 200 && p.activateM === 70, 'zone block merges into perf');
}

// ---------------------------------------------------------------------------------------------------------------------
// scatter.*: purity, and density parity with the whole-map scatter on Sisli Vadi
// ---------------------------------------------------------------------------------------------------------------------
function chunkHost(def, tiles, avoid, splats, chunkM) {
  return { def, W: tiles.W, H: tiles.H, chunkM, ...hostOf(def, tiles), avoid, weights: (x, z) => splats.weights(x, z) };
}
const hash = (c) => JSON.stringify([c.instances.map((i) => [i.url, +i.x.toFixed(3), +i.z.toFixed(3), +i.rot.toFixed(3), +i.scale.toFixed(3), i.tint == null ? null : +i.tint.toFixed(3), i.layer]), c.colliders.map((k) => [+k.x.toFixed(3), +k.z.toFixed(3), +k.r.toFixed(3)])]);
{
  const def = SISLI_VADI;
  const tiles = tilesOf(def);
  const avoid = avoidOf(def);
  const cx0 = (tiles.W * T) / 2, cz0 = (tiles.H * T) / 2;
  const splats = new SP.ChunkSplats(WS.worldSplatOps(def, cx0, cz0), def.id, cx0, cz0, 64);
  const scatterA = new CScat.ChunkScatter(chunkHost(def, tiles, avoid, splats, 64));
  const scatterB = new CScat.ChunkScatter(chunkHost(def, tiles, avoid, splats, 64));
  const keys = [];
  // the chunks of the zone (1600 m = 25 x 64 m): the chunked sum then covers exactly what the whole-map scatter covers
  const NC = Math.ceil((def.grid.w * T) / 64);
  for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) keys.push([cx, cz]);
  const t0 = performance.now();
  const A = new Map();
  for (const [cx, cz] of keys) A.set(`${cx},${cz}`, scatterA.generate(cx, cz));
  const tGen = ms(t0);
  // a second instance in REVERSE order, then the first again: identical content (streaming order cannot matter)
  let pure = true;
  for (const [cx, cz] of [...keys].reverse()) if (hash(scatterB.generate(cx, cz)) !== hash(A.get(`${cx},${cz}`))) pure = false;
  for (const [cx, cz] of keys.slice(40, 60)) if (hash(scatterA.generate(cx, cz)) !== hash(A.get(`${cx},${cz}`))) pure = false;
  ok('scatter.pure', pure, `${keys.length} chunks, two instances, opposite orders`);
  ok('scatter.perchunk', tGen / keys.length < 60, `${(tGen / keys.length).toFixed(1)} ms per chunk (${keys.length} chunks, ${tGen.toFixed(0)} ms)`);

  // legacy whole-map scatter with a recording host
  const nav = navFor(def);
  NB.fillNavFast(tiles, nav);
  const legacy = {};
  const lrec = { add(url, x, y, z, rot, scale, color, opts = {}) { const l = opts.layer ?? 'other'; legacy[l] = (legacy[l] ?? 0) + 1; } };
  const host = {
    def, W: tiles.W, H: tiles.H, batcher: lrec, nav, avoid,
    isAvoided: (x, z, pad) => { for (const a of avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + pad) return true; return false; },
    ...hostOf(def, tiles), weights: (x, z) => splats.weights(x, z),
  };
  const t1 = performance.now();
  new WS.WorldScatter(host).run();
  const tLegacy = ms(t1);
  const chunked = {};
  let colliders = 0;
  for (const c of A.values()) {
    colliders += c.colliders.length;
    for (const i of c.instances) chunked[i.layer ?? 'other'] = (chunked[i.layer ?? 'other'] ?? 0) + 1;
  }
  const bands = { tuft: [0.85, 1.2], flower: [0.8, 1.25], bush: [0.75, 1.3], tree: [0.7, 1.4], rock: [0.6, 1.5], border: [0.7, 1.3] };
  // The whole-map scatter places the void / backdrop forest (tree, bush) as FIXED totals (WorldScenery voidForest(900), beyondForest(760):
  // ENGINE_BIGMAPS #11), so on a zone well above the 640 m Sisli size those two layers cannot match a per-m2 density: reported, not asserted.
  const fixedTotals = def.grid.w * T > 800 ? new Set(['tree', 'bush']) : new Set();
  for (const [layer, [lo, hi]] of Object.entries(bands)) {
    const r = (chunked[layer] ?? 0) / Math.max(1, legacy[layer] ?? 0);
    if (fixedTotals.has(layer)) { report(`scatter.parity.${layer} (fixed legacy total, not asserted)`, `chunked ${chunked[layer] ?? 0} vs whole-map ${legacy[layer] ?? 0} (x${r.toFixed(2)})`); continue; }
    ok(`scatter.parity.${layer}`, r >= lo && r <= hi, `chunked ${chunked[layer] ?? 0} vs whole-map ${legacy[layer] ?? 0} (x${r.toFixed(2)})`);
  }
  report('scatter Sisli Vadi', `whole-map ${tLegacy.toFixed(0)} ms | chunked ${tGen.toFixed(0)} ms for ${keys.length} chunks, ${colliders} colliders`);
}

// ---------------------------------------------------------------------------------------------------------------------
// camps.*: bucket index == brute force
// ---------------------------------------------------------------------------------------------------------------------
{
  const rng = new RNG(99);
  const camps = [];
  for (let i = 0; i < 3300; i++) camps.push({ cx: rng.range(0, 4096), cz: rng.range(0, 4096), radius: rng.range(8, 30) });
  const idx = new CI.CampIndex(camps);
  let miss = 0, total = 0, cand = 0;
  const t0 = performance.now();
  for (let k = 0; k < 400; k++) {
    const pts = [{ x: rng.range(0, 4096), z: rng.range(0, 4096) }, { x: rng.range(0, 4096), z: rng.range(0, 4096) }];
    const got = new Set(idx.near(pts, 70));
    cand += got.size;
    camps.forEach((c, i) => {
      const near = pts.some((p) => Math.hypot(p.x - c.cx, p.z - c.cz) <= c.radius + 70);
      if (near) { total++; if (!got.has(i)) miss++; }
    });
  }
  ok('camps.index.superset', miss === 0 && total > 0, `${total} in-range camps over 400 queries, ${miss} missed`);
  ok('camps.index.small', cand / 400 < 120, `${(cand / 400).toFixed(1)} candidate camps per tick of 3300`);
  report('camp index (3300 camps)', `${(ms(t0) / 400).toFixed(2)} ms per query incl. brute-force check`);
}

// ---------------------------------------------------------------------------------------------------------------------
// avoid index == brute force
// ---------------------------------------------------------------------------------------------------------------------
{
  const rng = new RNG(5);
  const list = [];
  for (let i = 0; i < 2000; i++) list.push({ x: rng.range(0, 2000), z: rng.range(0, 2000), r: rng.range(1, 60) });
  const idx = new AI.AvoidIndex(list);
  let bad = 0;
  for (let k = 0; k < 20000; k++) {
    const x = rng.range(0, 2000), z = rng.range(0, 2000), pad = rng.range(0, 14);
    const brute = list.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + pad);
    if (brute !== idx.hit(x, z, pad)) bad++;
  }
  ok('avoid.index', bad === 0, `20000 random queries, ${bad} differ from the linear scan`);
}

// ---------------------------------------------------------------------------------------------------------------------
// synthetic big layouts (generated here, never shipped as content)
// ---------------------------------------------------------------------------------------------------------------------
function synthDef(sizeM) {
  const N = sizeM / T;
  const rng = new RNG(sizeM);
  const border = 3;
  const cols = 3, rowsN = 2;
  const cw = Math.floor((N - 2 * border) / cols), rh = Math.floor((N - 2 * border) / rowsN);
  const rooms = [], regions = [];
  for (let r = 0; r < rowsN; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const id = `s${i}_room`;
      rooms.push({ id, name: id, rect: { x: border + c * cw, z: border + r * rh, w: c === cols - 1 ? N - border - (border + c * cw) : cw, h: r === rowsN - 1 ? N - border - (border + r * rh) : rh } });
      regions.push({ ...REGIONS[i % REGIONS.length], roomId: id });
    }
  const roads = [];
  for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) {
    const a = rooms[r * cols + c].rect;
    const cxm = a.x + a.w / 2, czm = a.z + a.h / 2;
    if (c + 1 < cols) { const b = rooms[r * cols + c + 1].rect; roads.push({ id: `rd${r}${c}h`, kind: 'dirt', width: 4, pts: [[cxm, czm], [b.x + b.w / 2, b.z + b.h / 2]] }); }
    if (r + 1 < rowsN) { const b = rooms[(r + 1) * cols + c].rect; roads.push({ id: `rd${r}${c}v`, kind: 'cobble', width: 5, pts: [[cxm, czm], [b.x + b.w / 2, b.z + b.h / 2]] }); }
  }
  // Sisli Vadi camp density (81 camps / 0.41 km2)
  const nCamps = Math.round((sizeM * sizeM) / 409600 * 81);
  const packs = [];
  for (let i = 0; i < nCamps; i++) {
    const room = rooms[rng.int(0, rooms.length - 1)].rect;
    packs.push({ id: `c${i}`, roomId: 'x', center: [room.x + rng.range(2, room.w - 2), room.z + rng.range(2, room.h - 2)], members: [], radius: rng.range(8, 20), respawnSec: 120 });
  }
  const world = {
    regions, villages: [], waypoints: [], entrances: [], roads, water: [{ id: 'west_lake', rect: { x: 0, z: 0, w: border, h: N } }], borders: [],
    landmarks: [], metin: { tiers: [], spots: [] }, rares: [], minibosses: [], bosses: [], gather: [], chests: [], cursed: [], shrines: [], hidden: [], vistas: [],
    perf: { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 },
  };
  const def = {
    id: `synth_${sizeM}`, grid: { w: N, h: N }, rooms, doors: [], packs, bosses: [], theme: { fogColor: 0x9aa890, fogNear: 15, fogFar: 70 },
    start: { pos: [N / 2, N / 2], facing: 0 }, exit: { pos: [N / 2 + 1, N / 2] }, outdoor: true, world,
  };
  // POIs the way Sisli Vadi has them (about 1 per 1,600 m2 of waypoints / shrines / chests / spots), as avoid circles
  const avoid = avoidOf(def);
  const nPoi = Math.round((sizeM * sizeM) / 1600);
  for (let i = 0; i < nPoi; i++) avoid.push({ x: rng.range(0, sizeM), z: rng.range(0, sizeM), r: rng.range(3, 10) });
  for (let i = 0; i < Math.round((sizeM * sizeM) / 400000); i++) avoid.push({ x: rng.range(0, sizeM), z: rng.range(0, sizeM), r: rng.range(25, 60) });
  return { def, avoid };
}

async function bigStage(sizeM) {
  const name = `synth${sizeM}`;
  const m0 = mem();
  const t0 = performance.now();
  const { def, avoid } = synthDef(sizeM);
  const tDef = ms(t0);

  const t1 = performance.now();
  const tiles = tilesOf(def);
  const nav = navFor(def);
  const wb = NB.fillNavFast(tiles, nav);
  const tNav = ms(t1);
  ok(`${name}.nav`, nav.cols === sizeM + 1 && wb.maxX > sizeM - 20, `${nav.cols}x${nav.rows} cells (${mb(nav.cells.length)})`);

  const cfg = SC.streamConfig(def, null);
  ok(`${name}.stream-on`, cfg.on === true, `auto: chunk ${cfg.chunkM} m, view ${cfg.viewM} m, drop ${cfg.dropM} m, bound ${cfg.maxResident}`);

  const t2 = performance.now();
  const cx0 = sizeM / 2, cz0 = sizeM / 2;
  const ops = WS.worldSplatOps(def, cx0, cz0);
  const splats = new SP.ChunkSplats(ops, def.id, cx0, cz0, cfg.chunkM, 128);
  const campIdx = new CI.CampIndex(def.packs.map((p) => ({ cx: (p.center[0] + 0.5) * T, cz: (p.center[1] + 0.5) * T, radius: p.radius })));
  const scatter = new CScat.ChunkScatter(chunkHost(def, tiles, avoid, splats, cfg.chunkM));
  const tIdx = ms(t2);
  const mBuilt = mem() - m0;

  // visual + collider rings exactly as WorldStream drives them (terrain painting stands in for the mesh upload)
  const content = new Map();
  const genTimes = [];
  const contentOf = (cx, cz) => {
    const k = CS.chunkKey(cx, cz);
    let c = content.get(k);
    if (!c) {
      const t = performance.now();
      c = scatter.generate(cx, cz);
      genTimes.push(ms(t));
      content.set(k, c);
      if (content.size > 256) content.delete(content.keys().next().value);
    }
    return c;
  };
  const common = { size: cfg.chunkM, loadM: cfg.viewM, unloadM: cfg.dropM, minCx: Math.floor(-160 / cfg.chunkM), maxCx: Math.floor((sizeM + 160) / cfg.chunkM), minCz: Math.floor(-160 / cfg.chunkM), maxCz: Math.floor((sizeM + 160) / cfg.chunkM) };
  let instancesResident = 0;
  const stats = { loadMs: [] };
  const visual = new CS.ChunkStreamer({
    ...common, maxLoads: cfg.maxLoads, maxUnloads: cfg.maxUnloads,
    load: (cx, cz) => { const t = performance.now(); splats.get(cx, cz); const c = contentOf(cx, cz); instancesResident += c.instances.length; stats.loadMs.push(ms(t)); return c.instances.length; },
    unload: (_cx, _cz, n) => { instancesResident -= n; },
  });
  let colliderCircles = 0;
  const colliders = new CS.ChunkStreamer({
    ...common, maxLoads: cfg.maxLoads * 2, maxUnloads: 1 << 20,
    load: (cx, cz) => { for (const c of contentOf(cx, cz).colliders) { nav.setCircle(c.x, c.z, c.r, false); colliderCircles++; } return true; },
    unload: () => undefined,
  });

  // prime at the start, then walk 1.6 km diagonally at 7 m/s (10 updates/s), asserting the bound on every update
  const t3 = performance.now();
  let px = sizeM * 0.15, pz = sizeM * 0.15;
  visual.prime([{ x: px, z: pz }]);
  colliders.prime([{ x: px, z: pz }]);
  const tPrime = ms(t3);
  const primed = visual.size;
  const layers = {};
  for (const e of visual.entries()) for (const i of contentOf(e.cx, e.cz).instances) layers[i.layer ?? 'other'] = (layers[i.layer ?? 'other'] ?? 0) + 1;
  report(`${name} ring by layer`, JSON.stringify(layers));
  let peak = visual.size, worstLoads = 0, boundOk = true, steps = 0;
  const walk = Math.min(1600, sizeM * 0.6);
  const t4 = performance.now();
  for (let d = 0; d < walk; d += 0.7) {
    px += 0.7 * Math.SQRT1_2;
    pz += 0.7 * Math.SQRT1_2;
    const l0 = visual.stats.loads;
    visual.update([{ x: px, z: pz }]);
    colliders.update([{ x: px, z: pz }, { x: sizeM - px, z: sizeM - pz }]); // a second player on the other diagonal
    worstLoads = Math.max(worstLoads, visual.stats.loads - l0);
    peak = Math.max(peak, visual.size);
    if (visual.size > cfg.maxResident) boundOk = false;
    steps++;
  }
  const tWalk = ms(t4);
  ok(`${name}.resident-bound`, boundOk && peak <= cfg.maxResident, `peak ${peak} visual chunks <= ${cfg.maxResident} (zone has ${(sizeM / cfg.chunkM) ** 2 | 0} chunks) after a ${walk} m walk`);
  ok(`${name}.frame-budget`, worstLoads <= cfg.maxLoads, `max ${worstLoads} chunk builds in one update`);
  ok(`${name}.walk-complete`, visual.stats.pending === 0, `${visual.stats.loads} builds, ${visual.stats.unloads} drops, ${visual.size} resident`);
  ok(`${name}.drops`, visual.stats.unloads > 0 && visual.stats.loads - visual.stats.unloads === visual.size, 'streaming frees what it leaves behind');

  // teleport to the far corner and back: ring rebuilt in one prime, bound holds, content identical after the round trip
  const probe = contentOf(Math.floor(px / cfg.chunkM), Math.floor(pz / cfg.chunkM));
  const before = hash(probe);
  visual.update([{ x: sizeM * 0.9, z: sizeM * 0.9 }], true);
  visual.update([{ x: sizeM * 0.9, z: sizeM * 0.9 }], true);
  const farResident = visual.size;
  content.clear();
  const again = scatter.generate(Math.floor(px / cfg.chunkM), Math.floor(pz / cfg.chunkM));
  ok(`${name}.teleport`, farResident <= cfg.maxResident && visual.has(Math.floor(sizeM * 0.9 / cfg.chunkM), Math.floor(sizeM * 0.9 / cfg.chunkM)), `${farResident} chunks after the jump`);
  ok(`${name}.revisit-identical`, hash(again) === before, 'a chunk regenerated after eviction is identical');

  // camp index at this scale
  const ci = campIdx.near([{ x: px, z: pz }, { x: sizeM - px, z: sizeM - pz }], 70);
  ok(`${name}.camps-awake`, ci.length < def.packs.length * 0.1 + 30, `${ci.length} of ${def.packs.length} camps visited per tick`);

  // what the classic build-everything path would do on this zone (WorldScatter.run over the whole map, 40 m batches)
  {
    // one map-sized 2048 px splat (Terrain.ts): pixel visits = sum of op bounding boxes, and the metres each pixel covers
    const half = Math.max(cx0, cz0) + 6, N = 2048;
    const toPx = (v) => ((v + half) / (half * 2)) * N;
    let visits = 0;
    for (const op of ops) {
      const b = SP.opBounds(op);
      visits += Math.max(0, Math.min(N - 1, Math.ceil(toPx(b.x1))) - Math.max(0, Math.floor(toPx(b.x0))) + 1) * Math.max(0, Math.min(N - 1, Math.ceil(toPx(b.z1))) - Math.max(0, Math.floor(toPx(b.z0))) + 1);
    }
    report(`${name} classic splat`, `${ops.length} ops, ${(visits / 1e6).toFixed(1)} M pixel visits at ${(half * 2 / N).toFixed(2)} m/px (Sisli Vadi: 615 ops, 4.9 M at 0.32 m/px)`);
    const groups = new Set();
    let n = 0;
    const rec = { add(url, x, _y, z, _r, _s, _c, o = {}) { n++; groups.add(`${url}|${Math.floor(x / 40)},${Math.floor(z / 40)}|${o.cast ?? true}|${o.layer ?? ''}`); } };
    const idx = new AI.AvoidIndex(avoid);
    const navC = navFor(def);
    NB.fillNavFast(tiles, navC);
    const host = { def, W: tiles.W, H: tiles.H, batcher: rec, nav: navC, avoid, isAvoided: (x, z, p) => idx.hit(x, z, p), ...hostOf(def, tiles), weights: (x, z) => splats.weights(x, z) };
    const tc = performance.now();
    new WS.WorldScatter(host).run();
    const tClassic = ms(tc);
    report(`${name} classic scatter`, `${n} instances, ${groups.size} instanced meshes (>= ${groups.size} draw groups), ${tClassic.toFixed(0)} ms for the recipe alone, ~${mb(n * 250)} of placement records + ${mb(n * 64)} GPU matrices`);
    ok(`${name}.classic-heavy`, groups.size > 5000, `classic path would build ${groups.size} meshes (budget 2,500): streaming is required`);
  }

  const gen = genTimes.slice().sort((a, b) => a - b);
  const p95 = gen[Math.floor(gen.length * 0.95)] ?? 0;
  const loadMs = stats.loadMs.slice().sort((a, b) => a - b);
  report(`${name} build`, `def ${tDef.toFixed(0)} ms | tiles+nav ${tNav.toFixed(0)} ms | indexes+scatter ${tIdx.toFixed(0)} ms | structures ${mb(mBuilt)}`);
  report(`${name} zone`, `${def.grid.w}x${def.grid.h} tiles, ${(sizeM / cfg.chunkM) ** 2 | 0} chunks, ${def.packs.length} camps, ${avoid.length} avoid circles, ${ops.length} splat ops`);
  report(`${name} ring`, `prime ${tPrime.toFixed(0)} ms for ${primed} chunks | resident peak ${peak}/${cfg.maxResident} | ${instancesResident} instances resident`);
  report(`${name} walk ${walk} m`, `${steps} updates, ${tWalk.toFixed(0)} ms total, chunk gen avg ${(gen.reduce((a, b) => a + b, 0) / Math.max(1, gen.length)).toFixed(1)} ms p95 ${p95.toFixed(1)} ms, build p95 ${(loadMs[Math.floor(loadMs.length * 0.95)] ?? 0).toFixed(1)} ms, ${colliderCircles} colliders written`);
  report(`${name} total`, `heap+buffers now ${mb(mem() - m0)} above the start of this stage`);
}

await bigStage(2048);
await bigStage(4096);

// ---------------------------------------------------------------------------------------------------------------------
// peers.*: a host and a client stream different chunks in a different order and still agree on the world they both have
// ---------------------------------------------------------------------------------------------------------------------
{
  const sizeM = 2048;
  const { def, avoid } = synthDef(sizeM);
  const tiles = tilesOf(def);
  const cfg = SC.streamConfig(def, null);
  const cx0 = sizeM / 2, cz0 = sizeM / 2;
  const peer = (path, stepM) => {
    const nav = navFor(def);
    NB.fillNavFast(tiles, nav);
    const splats = new SP.ChunkSplats(WS.worldSplatOps(def, cx0, cz0), def.id, cx0, cz0, cfg.chunkM, 128);
    const scatter = new CScat.ChunkScatter(chunkHost(def, tiles, avoid, splats, cfg.chunkM));
    const loaded = new Set();
    const st = new CS.ChunkStreamer({
      size: cfg.chunkM, loadM: cfg.viewM, unloadM: cfg.dropM, minCx: -3, maxCx: 35, minCz: -3, maxCz: 35, maxLoads: 3, maxUnloads: 1 << 20,
      load: (cx, cz) => { for (const c of scatter.generate(cx, cz).colliders) nav.setCircle(c.x, c.z, c.r, false); loaded.add(`${cx},${cz}`); return true; },
      unload: () => undefined,
    });
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / stepM);
      for (let k = 0; k <= n; k++) st.update([{ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n }]);
    }
    for (let i = 0; i < 100; i++) st.update([{ x: path[path.length - 1][0], z: path[path.length - 1][1] }]);
    return { nav, loaded };
  };
  const host = peer([[300, 300], [800, 800], [1500, 1000]], 5);
  const client = peer([[1400, 300], [800, 800], [300, 1500]], 11);
  const k = cfg.chunkM;
  let compared = 0, diff = 0;
  for (const key of host.loaded) {
    if (!client.loaded.has(key)) continue;
    const [cx, cz] = key.split(',').map(Number);
    // only chunks whose whole neighbourhood both peers built (colliders reach a few metres into the next chunk)
    let all = true;
    for (let dz = -1; dz <= 1 && all; dz++) for (let dx = -1; dx <= 1; dx++) if (!host.loaded.has(`${cx + dx},${cz + dz}`) || !client.loaded.has(`${cx + dx},${cz + dz}`)) { all = false; break; }
    if (!all) continue;
    for (let z = cz * k; z < (cz + 1) * k; z++) for (let x = cx * k; x < (cx + 1) * k; x++) {
      compared++;
      if (host.nav.cells[z * host.nav.cols + x] !== client.nav.cells[z * client.nav.cols + x]) diff++;
    }
  }
  ok('peers.nav-agree', compared > 5000 && diff === 0, `${compared} shared nav cells compared, ${diff} differ (host ${host.loaded.size} chunks, client ${client.loaded.size})`);
}

// ---------------------------------------------------------------------------------------------------------------------
// render.*: the three.js side (instanced chunk meshes, terrain chunks, WorldStream) driven headless with stub assets, no GL
// ---------------------------------------------------------------------------------------------------------------------
{
  const THREE = await import('three');
  const { G } = await imp('game/G.ts');
  const { InstanceBatcher, ChunkCuller } = await imp('world/Instancing.ts');
  const { ChunkedTerrain } = await imp('world/TerrainChunks.ts');
  const { WorldStream } = await imp('world/WorldStream.ts');
  // a box for every model url; a canvas stub good enough for the procedural PSX textures
  G.assets = { load: async () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0), new THREE.MeshStandardMaterial())); return { scene: g, voxel: false }; } };
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : k === 'getImageData' ? (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : () => undefined) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };

  const sizeM = 2048;
  const { def, avoid } = synthDef(sizeM);
  const tiles = tilesOf(def);
  const nav = navFor(def);
  NB.fillNavFast(tiles, nav);
  const cfg = SC.streamConfig(def, null);
  const cx0 = sizeM / 2, cz0 = sizeM / 2;
  const root = new THREE.Group();
  const batcher = new InstanceBatcher(root, cfg.chunkM);
  batcher.deferred = true;
  // hand-placed (static) instance, like a village prop: must come back whenever its chunk is built
  batcher.add('/assets/models/static/house.glb', 700.5, 0, 700.5, 0.3, 2, null, { cast: true, receive: true, layer: 'prop' });
  const generatedUrls = new Set();
  const splats = new SP.ChunkSplats(WS.worldSplatOps(def, cx0, cz0), def.id, cx0, cz0, cfg.chunkM, 128);
  const scatter = new CScat.ChunkScatter(chunkHost(def, tiles, avoid, splats, cfg.chunkM));
  for (let cz = 8; cz < 14; cz++) for (let cx = 8; cx < 14; cx++) for (const i of scatter.generate(cx, cz).instances) generatedUrls.add(i.url);
  const { loadPieces } = await imp('world/Pieces.ts');
  await loadPieces([...generatedUrls]);
  const missing = await batcher.build();
  ok('render.static-staged', missing.length === 0 && root.children.length === 0 && batcher.meshes.length === 0, 'build() stages the groups, no mesh yet');
  const terrain = new ChunkedTerrain({ seed: def.id, ops: WS.worldSplatOps(def, cx0, cz0), mapCx: cx0, mapCz: cz0, chunkM: cfg.chunkM, parent: root, tint: { w: 4, h: 4, rgb: new Uint8Array(48).fill(200), half: cx0 } });
  const stream = new WorldStream({ cfg, tilesW: def.grid.w, tilesH: def.grid.h, batcher, nav, terrain, scatter, players: () => [{ x: 1600, z: 400 }] });
  const tp = performance.now();
  stream.prime(700, 700);
  const tPrime = ms(tp);
  const n1 = batcher.meshes.length;
  ok('render.prime', n1 > 20 && terrain.count === stream.visual.size && root.children.length === n1 + terrain.count, `${stream.visual.size} chunks -> ${terrain.count} terrain meshes + ${n1} instanced meshes`);
  ok('render.static-present', batcher.meshes.some((m) => m.name.startsWith('house.glb')), 'hand-placed prop meshed with its chunk');
  let inst = 0;
  for (const m of batcher.meshes) inst += m.count;
  const expect = stream.visual.entries().reduce((a, e) => a + stream.contentOf(e.cx, e.cz).instances.length, 0) + 1;
  ok('render.instances', inst === expect, `${inst} instances meshed == ${expect} generated + static`);
  ok('render.colliders', stream.colliders.size > 0 && stream.colliders.has(Math.floor(1600 / cfg.chunkM), Math.floor(400 / cfg.chunkM)), `${stream.colliders.size} collider chunks incl. the second player's`);
  // walk away: old chunks are freed (meshes removed from the scene, instance buffers disposed), new ones come in
  let disposed = 0;
  for (const m of batcher.meshes) m.addEventListener('dispose', () => { disposed++; });
  let worstFrame = 0;
  for (let i = 0; i < 400; i++) {
    const tf = performance.now();
    stream.update(0.1, 700 + i * 2, 700);
    worstFrame = Math.max(worstFrame, ms(tf));
  }
  report('render (stub assets, no GL)', `ring of ${stream.stats.visualChunks} chunks primed in ${tPrime.toFixed(0)} ms | worst streaming update while walking ${worstFrame.toFixed(1)} ms (2 chunks max)`);
  ok('render.freed', disposed > 0 && batcher.meshes.length < n1 * 2 && terrain.count <= cfg.maxResident, `${disposed} instanced meshes disposed, ${batcher.meshes.length} resident, ${terrain.count} terrain`);
  ok('render.scene-matches', root.children.length === batcher.meshes.length + terrain.count, 'scene graph holds exactly the resident meshes');
  const farStatic = batcher.meshes.some((m) => m.name.startsWith('house.glb'));
  ok('render.static-unloaded', !farStatic, 'the prop left with its chunk');
  stream.update(0.1, 700, 700);
  stream.prime(700, 700);
  ok('render.static-back', batcher.meshes.some((m) => m.name.startsWith('house.glb')), 'and is back when the player returns');
  // the culler sees the resident meshes only
  const culler = new ChunkCuller(batcher, cfg.chunkM);
  culler.limits = { tuft: 55, tree: 100 };
  culler.update(1, 700, 700);
  ok('render.culler', culler.hiddenCount > 0 && culler.hiddenCount < batcher.meshes.length, `${culler.hiddenCount} of ${batcher.meshes.length} meshes distance-culled`);
  // terrain shader hook: both stages get their uniforms and the splat lookup, against the real three.js standard shader
  const ch = stream.visual.entries()[0].value.terrain;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  ch.material.onBeforeCompile(shader, null);
  ok('render.terrain-shader', shader.vertexShader.includes('vTerrainXZ = position.xz + uChunkOrigin') && shader.fragmentShader.includes('texture2D(uSplat, st)') && 'uSplat' in shader.uniforms && 'uChunkOrigin' in shader.uniforms, 'terrain chunk shader patched');
  const mat0 = ch.material, mat1 = stream.visual.entries()[1].value.terrain.material;
  ok('render.terrain-cachekey', mat0.customProgramCacheKey() === mat1.customProgramCacheKey(), 'chunk materials share one GPU program');
  stream.dispose();
  terrain.dispose();
  batcher.dispose();
  ok('render.dispose', root.children.length === 0 && batcher.meshes.length === 0, 'everything released');
  delete globalThis.document;
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('bigmap sim report');
for (const r of rows) console.log(r);
if (warns.length && verbose) console.log('warnings:', warns.slice(0, 10));
console.log(`\nbigmap: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
