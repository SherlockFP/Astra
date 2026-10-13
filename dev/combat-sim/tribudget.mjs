// TRIANGLE / DRAW-CALL BUDGET of the streamed open world, measured headless (no WebGL): the REAL scatter (ChunkScatter), the REAL
// InstanceBatcher / WorldStream / ChunkCuller, the REAL voxel model files (public/assets/models, parsed by glbtris.mjs), three's own
// frustum maths. The renderer is the only thing missing, so the numbers are what renderer.info would report for the scenery:
//   resident   everything the streamer built (the ring around the spawn)
//   distance   ... after the ChunkCuller / LOD distance rules (what is still `visible`)
//   frustum    ... after three's per-mesh frustum culling, mean over 8 camera headings (60 deg fov, 16:9, third-person offset)
//   shadow     casters re-drawn by the shadow pass (40 x 40 m ortho box, only on the shadow cadence frames)
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/tribudget.mjs [--zone=karakir|sisli|both] [--q=low|mid|high] [--top=12] [--budget]
// --budget exits 1 when the Karakir spawn total (frustum + shadow + terrain) is above 400k triangles or 300 draw calls.
import fs from 'node:fs';

const root = new URL('../../src/', import.meta.url).href;
const imp = (p) => import(root + p);
const arg = (name, def) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : def; };
const ZONE = arg('zone', 'both');
const QUALITY = arg('q', 'mid');
const TOP = Number(arg('top', 12));
const BUDGET = process.argv.includes('--budget');
const SCAN = process.argv.includes('--scan');
console.warn = () => undefined;

const THREE = await import('three');
const { glbToGroup, fileOf } = await import(new URL('./glbtris.mjs', import.meta.url).href);
const { TILE_SIZE: T } = await imp('types/dungeons.ts');
const NB = await imp('world/NavBase.ts');
const SC = await imp('world/chunks/StreamConfig.ts');
const SP = await imp('world/chunks/SplatPaint.ts');
const CScat = await imp('world/chunks/ChunkScatter.ts');
const WS = await imp('world/WorldScenery.ts');
const { NavGrid } = await imp('world/NavGrid.ts');
const { G } = await imp('game/G.ts');
const RM = await imp('core/voxelRemap.ts');
const { InstanceBatcher, ChunkCuller } = await imp('world/Instancing.ts');
const { WorldStream } = await imp('world/WorldStream.ts');
const { loadPieces, getPiece } = await imp('world/Pieces.ts');
const { SISLI_VADI } = await imp('data/world/sisli_vadi.ts');
const { KARAKIR_BOZKIRI } = await imp('data/world/karakir.ts');
const PERF = await imp('world/WorldPerf.ts');
const LOD = arg('lod', '1') !== '0';
if (!LOD) (await imp('world/Instancing.ts')).setVoxelLodEnabled(false);

// ---- the asset stub: real voxel GLBs, no textures ----------------------------------------------------------------
G.assets = {
  async load(url) {
    const real = RM.resolveModelUrl(url, true);
    const f = fileOf(real);
    if (!fs.existsSync(f)) return null;
    return { scene: glbToGroup(THREE, f), voxel: real !== url, skinned: false, url: real };
  },
};

// ---- zone helpers (same as bigmap.mjs) ----------------------------------------------------------------------------
function tilesOf(def) {
  const W = def.grid.w, H = def.grid.h;
  const roomIdx = new Int16Array(W * H).fill(-1);
  const hWall = new Uint8Array(W * (H + 1));
  const vWall = new Uint8Array((W + 1) * H);
  NB.paintRoomTiles(def, roomIdx);
  NB.computeWalls(W, H, roomIdx, !!def.outdoor, hWall, vWall);
  return { W, H, roomIdx, hWall, vWall };
}
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
const tileCentre = (c) => (c + 0.5) * T;

/** Palisade of a village (WorldDecor.buildPalisade, instances only). */
function palisade(batcher, v, ox, oz) {
  const WALL = '/assets/models/dungeon/wall.glb';
  const CORNER = '/assets/models/dungeon/wall-corner.glb';
  const piece = getPiece(WALL);
  if (!piece) return;
  const len = Math.max(piece.size.x, piece.size.z) || 4;
  const [bx, bz] = v.bounds;
  const corners = [[-bx, -bz], [bx, -bz], [bx, bz], [-bx, bz]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [cx2, cz2] = corners[(k + 1) % 4];
    const L = Math.hypot(cx2 - ax, cz2 - az);
    const n = Math.max(1, Math.round(L / len));
    const step = L / n;
    const ux = (cx2 - ax) / L, uz = (cz2 - az) / L;
    for (let i = 0; i < n; i++) {
      const mx = ax + ux * step * (i + 0.5), mz = az + uz * step * (i + 0.5);
      if (v.gates.some((g) => Math.hypot(mx - g.pos[0], mz - g.pos[1]) < g.width / 2 + step / 2)) continue;
      batcher.add(WALL, ox + mx, 0, oz + mz, WS.yawAlong(WALL, ux, uz), step / len, null, { cast: true, receive: true, layer: 'prop' });
    }
  }
  for (const [cx2, cz2] of corners) batcher.add(CORNER, ox + cx2, 0, oz + cz2, 0, 1, null, { cast: true, receive: true, layer: 'prop' });
}

const NODE_MODELS = (p) => p.model;

// ---- one measurement -----------------------------------------------------------------------------------------------
async function measure(name, def, at, forceStream) {
  const tiles = tilesOf(def);
  const cfg = SC.streamConfig(def, forceStream ? true : null);
  const cx0 = (tiles.W * T) / 2, cz0 = (tiles.H * T) / 2;
  const ops = WS.worldSplatOps(def, cx0, cz0);
  const splats = new SP.ChunkSplats(ops, def.id, cx0, cz0, cfg.chunkM, 128);
  const avoid = avoidOf(def);
  const q = { room: NB.tileQueryOf(tiles).room, hasH: NB.tileQueryOf(tiles).hasH, hasV: NB.tileQueryOf(tiles).hasV };
  const scatter = new CScat.ChunkScatter({ def, W: tiles.W, H: tiles.H, chunkM: cfg.chunkM, tileRoom: q.room, hasH: q.hasH, hasV: q.hasV, avoid, weights: (x, z) => splats.weights(x, z) });
  const nav = new NavGrid({ originX: -0.5, originZ: -0.5, width: tiles.W * T + 1, depth: tiles.H * T + 1, cellSize: 1, walkable: false });

  const sx = at ? at.x : tileCentre(def.start.pos[0]), sz = at ? at.z : tileCentre(def.start.pos[1]);

  const rootGroup = new THREE.Group();
  const batcher = new InstanceBatcher(rootGroup, cfg.chunkM);
  batcher.deferred = true;
  // hand-placed village content (props + palisade), like WorldDecor
  const props = [];
  for (const v of def.world.villages) for (const p of v.props) props.push(p.model);
  await loadPieces([...props, '/assets/models/dungeon/wall.glb', '/assets/models/dungeon/wall-corner.glb']);
  for (const v of def.world.villages) {
    const ox = tileCentre(v.center[0]), oz = tileCentre(v.center[1]);
    for (const p of v.props) {
      const piece = getPiece(p.model);
      if (!piece) continue;
      const s = p.scale ?? 1;
      batcher.add(p.model, ox + p.pos[0], p.pos[1], oz + p.pos[2], ((p.rot ?? 0) * Math.PI) / 180, s, p.tint ?? null, { cast: piece.size.y * s > 0.5, receive: true, layer: 'prop' });
    }
    palisade(batcher, v, ox, oz);
  }
  // load every model the ring will use
  const probe = new WorldStream({ cfg, tilesW: tiles.W, tilesH: tiles.H, batcher, nav, terrain: { load: () => null, unload: () => undefined }, scatter });
  const urls = new Set();
  const R = Math.ceil(cfg.viewM / cfg.chunkM) + 1;
  const ccx = Math.floor(sx / cfg.chunkM), ccz = Math.floor(sz / cfg.chunkM);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) for (const i of probe.contentOf(ccx + dx, ccz + dz).instances) urls.add(i.url);
  await loadPieces([...urls]);
  const missing = await batcher.build();
  let terrainChunks = 0;
  const stream = new WorldStream({
    cfg, tilesW: tiles.W, tilesH: tiles.H, batcher, nav, scatter,
    terrain: { load: () => { terrainChunks++; return null; }, unload: () => { terrainChunks--; } },
  });
  stream.prime(sx, sz);

  // fog / culling exactly as OpenWorld.update
  const region = def.world.regions.find((r) => def.rooms.findIndex((rm) => rm.id === r.roomId) === tiles.roomIdx[Math.floor(sz / T) * tiles.W + Math.floor(sx / T)]);
  const fogFar = Math.min(region ? region.theme.fogFar : def.theme.fogFar, cfg.on ? cfg.viewM - 24 : Infinity);
  const culler = new ChunkCuller(batcher, cfg.chunkM);
  const limits = { tuft: 55, flower: 55, bush: 80, rock: 100, prop: 100, tree: fogFar + 20, border: fogFar + 20 };
  culler.limits = limits;
  if (LOD) culler.plans = PERF.lodPlans(fogFar, QUALITY);
  culler.update(1, sx, sz);
  let cullMs = 0;
  {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { culler.invalidate(); culler.update(1, sx + (i % 2) * 2, sz); }
    cullMs = (performance.now() - t0) / 20;
    culler.invalidate();
    culler.update(1, sx, sz); // back to the measured pose
  }

  // per-mesh numbers
  const meshes = batcher.meshes.map((im) => {
    const idx = im.geometry.index;
    const triPer = (idx ? idx.count : im.geometry.attributes.position.count) / 3;
    if (!im.boundingSphere) im.computeBoundingSphere();
    return { im, layer: im.userData.layer ?? 'other', n: im.count, triPer, tris: triPer * im.count, vis: im.visible, cast: im.castShadow, name: im.name.replace(/@.*/, '') };
  });

  // frustum: mean over 8 headings, third-person pose 8 m behind and 5 m above the player looking at his chest
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4();
  const headings = 8;
  const inF = new Map(meshes.map((m) => [m, 0]));
  let terrainTris = 0, terrainCalls = 0;
  const chunkSphere = new THREE.Sphere(new THREE.Vector3(), cfg.chunkM * 0.71);
  for (let h = 0; h < headings; h++) {
    const a = (h / headings) * Math.PI * 2;
    cam.position.set(sx - Math.sin(a) * 8, 5, sz - Math.cos(a) * 8);
    cam.lookAt(sx, 1.4, sz);
    cam.updateMatrixWorld();
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    fr.setFromProjectionMatrix(pm);
    for (const m of meshes) if (m.vis && fr.intersectsSphere(m.im.boundingSphere)) inF.set(m, inF.get(m) + 1);
    for (const e of stream.visual.entries()) {
      chunkSphere.center.set((e.cx + 0.5) * cfg.chunkM, 0, (e.cz + 0.5) * cfg.chunkM);
      if (fr.intersectsSphere(chunkSphere)) { terrainTris += 2 * Math.pow(cfg.chunkM / 8, 2); terrainCalls++; }
    }
  }
  terrainTris /= headings; terrainCalls /= headings;

  // shadow pass: 40 x 40 m ortho box around the focus, light as in DungeonBuilder (moonDir)
  const light = new THREE.DirectionalLight();
  const { configureShadowBox, followShadowBox } = await imp('world/ShadowFollow.ts');
  configureShadowBox(light);
  const toSun = new THREE.Vector3(-0.45, 0.8, -0.4);
  followShadowBox(light, new THREE.Vector3(sx, 0, sz), toSun, 50);
  light.shadow.updateMatrices(light);
  const sm = new THREE.Matrix4().multiplyMatrices(light.shadow.camera.projectionMatrix, light.shadow.camera.matrixWorldInverse);
  const sfr = new THREE.Frustum().setFromProjectionMatrix(sm);

  const layers = new Map();
  const get = (l) => {
    let r = layers.get(l);
    if (!r) layers.set(l, (r = { meshes: 0, inst: 0, resident: 0, distance: 0, frustum: 0, calls: 0, shadow: 0, shadowCalls: 0 }));
    return r;
  };
  const byModel = new Map();
  for (const m of meshes) {
    const r = get(m.layer);
    const f = inF.get(m) / headings;
    r.meshes++;
    r.inst += m.n;
    r.resident += m.tris;
    if (m.vis) r.distance += m.tris;
    r.frustum += m.tris * f;
    r.calls += f;
    if (m.vis && m.cast && sfr.intersectsSphere(m.im.boundingSphere)) { r.shadow += m.tris; r.shadowCalls++; }
    const b = byModel.get(m.name) ?? { layer: m.layer, inst: 0, tris: 0, shadow: 0, triPer: m.triPer };
    b.inst += m.n;
    b.tris += m.tris * f;
    if (m.vis && m.cast && sfr.intersectsSphere(m.im.boundingSphere)) b.shadow += m.tris;
    byModel.set(m.name, b);
  }
  const tot = { meshes: 0, inst: 0, resident: 0, distance: 0, frustum: 0, calls: 0, shadow: 0, shadowCalls: 0 };
  for (const r of layers.values()) for (const k of Object.keys(tot)) tot[k] += r[k];
  const result = { cullMs, name, cfg, layers, tot, terrainTris, terrainCalls, terrainChunks, byModel, missing, chunks: stream.visual.size, fogFar };
  stream.dispose();
  batcher.dispose();
  return result;
}

const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
function print(r) {
  console.log(`\n=== ${r.name}: ${r.chunks} chunks resident (chunk ${r.cfg.chunkM} m, view ${r.cfg.viewM} m), fog far ${r.fogFar} m, quality ${QUALITY}, voxel LOD ${LOD ? 'on' : 'OFF (baseline)'} ===`);
  console.log('layer      meshes  instances   resident-tris  after-distance  in-frustum  draw-calls  shadow-tris (calls)');
  const order = ['tree', 'border', 'bush', 'rock', 'tuft', 'flower', 'prop', 'other'];
  const keys = [...r.layers.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const l of keys) {
    const x = r.layers.get(l);
    console.log(`${l.padEnd(9)} ${String(x.meshes).padStart(7)} ${String(x.inst).padStart(10)} ${k(x.resident).padStart(15)} ${k(x.distance).padStart(15)} ${k(x.frustum).padStart(11)} ${x.calls.toFixed(0).padStart(11)} ${k(x.shadow).padStart(12)} (${x.shadowCalls})`);
  }
  const t = r.tot;
  console.log(`${'scenery'.padEnd(9)} ${String(t.meshes).padStart(7)} ${String(t.inst).padStart(10)} ${k(t.resident).padStart(15)} ${k(t.distance).padStart(15)} ${k(t.frustum).padStart(11)} ${t.calls.toFixed(0).padStart(11)} ${k(t.shadow).padStart(12)} (${t.shadowCalls})`);
  console.log(`terrain   ${String(r.terrainChunks).padStart(7)} chunks resident, ${k(r.terrainTris)} tris and ${r.terrainCalls.toFixed(0)} draw calls in view`);
  const total = t.frustum + t.shadow + r.terrainTris;
  console.log(`culler pass over ${r.tot.meshes} resident meshes: ${r.cullMs.toFixed(2)} ms (forced full re-sort; runs at most every 0.25 s)`);
  console.log(`TOTAL scenery+terrain+shadow pass (excl. characters, VFX, sky): ${k(total)} triangles, ${(t.calls + t.shadowCalls + r.terrainCalls).toFixed(0)} draw calls (${t.calls.toFixed(0)} scenery + ${t.shadowCalls} shadow + ${r.terrainCalls.toFixed(0)} terrain)`);
  console.log(`  top offenders (model: instances, in-frustum tris, shadow tris, tris/instance):`);
  const top = [...r.byModel.entries()].sort((a, b) => b[1].tris + b[1].shadow - (a[1].tris + a[1].shadow)).slice(0, TOP);
  for (const [n, b] of top) console.log(`    ${n.padEnd(30)} ${b.layer.padEnd(7)} x${String(b.inst).padStart(6)}  ${k(b.tris).padStart(7)}  ${k(b.shadow).padStart(7)}  ${b.triPer.toFixed(0)}/inst`);
  if (r.missing.length) console.log(`  (models not found: ${r.missing.length})`);
  return total;
}

const totalOf = (r) => r.tot.frustum + r.tot.shadow + r.terrainTris;
const callsOf = (r) => r.tot.calls + r.tot.shadowCalls + r.terrainCalls;

/** Sample points of a zone: the middle of every region room and a point 6 m inside its west edge (the dense border forest). */
function scanPoints(def) {
  const pts = [];
  def.rooms.forEach((room) => {
    const reg = def.world.regions.find((r) => r.roomId === room.id);
    if (!reg) return;
    const R = room.rect;
    pts.push({ label: `${reg.id} centre`, x: (R.x + R.w / 2) * T, z: (R.z + R.h / 2) * T });
    pts.push({ label: `${reg.id} west edge`, x: R.x * T + 6, z: (R.z + R.h / 2) * T });
  });
  return pts;
}

const ZONES = [];
if (ZONE === 'karakir' || ZONE === 'both') ZONES.push(['Karakir Bozkiri', KARAKIR_BOZKIRI, false]);
if (ZONE === 'sisli' || ZONE === 'both') ZONES.push(['Sisli Vadi (streamed path forced; the real map builds everything at load)', SISLI_VADI, true]);
let karakirSpawn = 0, worst = 0;
for (const [label, def, force] of ZONES) {
  const r = await measure(`${label} spawn`, def, null, force);
  const total = print(r);
  if (def === KARAKIR_BOZKIRI) karakirSpawn = total;
  if (SCAN) {
    console.log(`\n  ${label}: scan (triangles = in-frustum scenery + shadow pass + terrain, mean of 8 headings; calls)`);
    for (const p of scanPoints(def)) {
      const s = await measure(p.label, def, p, force);
      const tt = totalOf(s);
      if (def === KARAKIR_BOZKIRI) worst = Math.max(worst, tt);
      console.log(`    ${p.label.padEnd(16)} ${k(tt).padStart(7)} tris  ${callsOf(s).toFixed(0).padStart(4)} calls  (resident meshes ${s.tot.meshes}, fog ${s.fogFar} m)`);
    }
  }
}
if (BUDGET) {
  const limit = SCAN ? worst : karakirSpawn;
  const ok = limit <= 400000;
  console.log(`\nbudget: Karakir ${SCAN ? 'worst sampled point' : 'spawn'} ${k(limit)} tris (limit 400k) ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}
