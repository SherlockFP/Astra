// TRIANGLE / DRAW-CALL BUDGET of the streamed open world, measured headless (no WebGL): the REAL scatter (ChunkScatter), the REAL
// InstanceBatcher / WorldStream / ChunkCuller, the REAL voxel model files (public/assets/models, parsed by glbtris.mjs), three's own
// frustum maths. The renderer is the only thing missing, so the numbers are what renderer.info would report for the scenery:
//   resident   everything the streamer built (the ring around the spawn)
//   distance   ... after the ChunkCuller / LOD distance rules (what is still `visible`)
//   frustum    ... after three's per-mesh frustum culling, mean over 8 camera headings (60 deg fov, 16:9, third-person offset)
//   shadow     casters re-drawn by the shadow pass (40 x 40 m ortho box, only on the shadow cadence frames)
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/tribudget.mjs [--zone=karakir|sisli|both] [--q=low|mid|high] [--top=12] [--budget]
// TOWN (Kuzgunkale, data/town.ts): the builder's own placed list (TownBuilder.townItems / wallPieces / planNature / townCottageSites),
// instanced through the real InstanceBatcher and ChunkCuller with the town's LOD plans, plus the animated / emissive props, the terrain
// grid and the horizon rings. The characters (the local player and the ambient NPCs at the tiers of CharacterLod.ts) are reported beside the line with their
// own budget: 80k triangles and 110 draw calls at the worst sampled point, with at least 20 ambient NPCs within 40 m in view drawn as models. The town line: worst of 10 sampled points against 250k
// triangles and 400 draw calls. TOWN_AT=<point label> and TOWN_TOP=<n> print the per-model breakdown of one point (e.g. TOWN_AT=plaza TOWN_TOP=20).
// --budget exits 1 when the Karakir spawn total is above 400k triangles or 300 draw calls, the town's worst point is over its limits, or the characters are over 80k triangles or 110 calls, or fewer than 20 ambient NPCs within 40 m in view are drawn as models.
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
const { glbToGroup, fileOf, trisOfGroup, readGlb } = await import(new URL('./glbtris.mjs', import.meta.url).href);
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
// ---- the town (Kuzgunkale): TownBuilder's pure plans, the real batcher / culler / LOD plans, sampled around the town ----------
const TB = await imp('world/TownBuilder.ts');
const DEC = await imp('world/Decor.ts');
const SKY = await imp('world/Sky.ts');
const SHB = await imp('world/ShadowFollow.ts');
const { TOWN } = await imp('data/town.ts');
const NPCM = await imp('entities/NPC.ts');
const CL = await imp('entities/CharacterLod.ts');
const { isKeptNodeName } = await imp('core/Assets.ts');

// the characters at the tiers of CharacterLod (NPC.ts applies them): accessory nodes, the local player (CharacterVisual DEFAULT_VISIBLE.knight)
const ACC = new Set(CL.CHARACTER_ACCESSORY_NODES);
const PLAYER_URL = '/assets/models/characters/Knight.glb';
const PLAYER_SHOW = ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'];
const triOfGeom = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

const groupCache = new Map();
/** Triangles, meshes (draw calls) and size of a raw GLB: characters and individually drawn props. */
function groupOf(url) {
  if (!groupCache.has(url)) {
    const f = fileOf(RM.resolveModelUrl(url, true));
    let st = null;
    if (fs.existsSync(f)) {
      const g = glbToGroup(THREE, f);
      let calls = 0;
      g.traverse((o) => { if (o.isMesh) calls++; });
      const parts = [];
      g.traverse((o) => { if (o.isMesh) parts.push({ name: o.name, tris: triOfGeom(o.geometry) }); });
      st = { tris: trisOfGroup(g), calls, parts, size: new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()) };
    }
    groupCache.set(url, st);
  }
  return groupCache.get(url);
}

/**
 * One character at the tiers of CharacterLod, from the GLB's own mesh nodes with the loader's rules (Assets.mergeSameMaterialMeshes):
 * a node with a keep name stays a separate object, the other body meshes merge into one mesh per skin and material, and the accessory
 * nodes an NPC shows stay separate (one call each). body = the mid tier (no attachments, no blob shadow), cast = what the shadow pass
 * re-draws (body plus shown attachments), full = the main draw (cast plus the blob). show = null: no accessory toggling.
 */
const partsCache = new Map();
function partsOf(url) {
  if (!partsCache.has(url)) {
    const { json } = readGlb(fileOf(RM.resolveModelUrl(url, true)));
    const parts = [];
    json.nodes.forEach((n) => {
      if (n.mesh === undefined) return;
      for (const p of json.meshes[n.mesh].primitives) {
        parts.push({ name: n.name ?? '', skin: n.skin ?? -1, mat: p.material ?? -1, tris: p.indices !== undefined ? json.accessors[p.indices].count / 3 : 0 });
      }
    });
    partsCache.set(url, parts);
  }
  return partsCache.get(url);
}
function charCost(url, show) {
  const merged = new Map(); // (skin, material) -> triangles of the one merged body mesh
  let accTris = 0, accCalls = 0, keptTris = 0, keptCalls = 0;
  for (const p of partsOf(url)) {
    if (show !== null && ACC.has(p.name)) { if (show.includes(p.name)) { accTris += p.tris; accCalls++; } continue; }
    if (isKeptNodeName(p.name)) { keptTris += p.tris; keptCalls++; continue; }
    const key = p.skin + '|' + p.mat;
    merged.set(key, (merged.get(key) ?? 0) + p.tris);
  }
  let bodyTris = 0;
  for (const t of merged.values()) bodyTris += t;
  const body = { tris: bodyTris + keptTris, calls: merged.size + keptCalls };
  const cast = { tris: body.tris + accTris, calls: body.calls + accCalls };
  const full = { tris: cast.tris + 2, calls: cast.calls + 1 }; // the blob shadow plane (G.vfx.blobShadow): the full tier only
  return { body, cast, full };
}

const TOWN_POINTS = [
  ['spawn', 0, 26], ['plaza', 0, 8], ['north of the portal hall', 0, -40], ['north-east quarter', 100, -100], ['south-east quarter', 100, 100],
  ['north-west quarter', -100, -100], ['south-west quarter', -100, 100], ['south gate yard', 0, 138], ['east gate yard', 138, 0], ['west gate yard', -138, 0],
];

async function measureTown() {
  const half = Math.max(TOWN.size[0], TOWN.size[1]) / 2;
  const placed = TB.townItems(TOWN, half);
  const cottageSites = TB.townCottageSites().filter((c) => {
    if (TOWN.props.some((p) => Math.hypot(p.pos[0] - c.x, p.pos[2] - c.z) < 6.4 && !/(grass|flower|tree|bush)/.test(p.model))) return false;
    if (TOWN.npcs.some((n) => Math.hypot(n.pos[0] - c.x, n.pos[2] - c.z) < 6.4)) return false;
    return !placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 4.6);
  });
  const items = placed.concat(cottageSites.flatMap((c) => c.parts));
  const walls = TB.wallPieces(half);
  // the scatter without occupancy or cobble tests: every cap is reached regardless, so the counts are the builder's own
  const nature = TB.planNature(TOWN, half, { free: () => true, weights: () => ({ cobble: 0, dirt: 0 }) });
  await loadPieces([...new Set([...items.map((i) => i.m), ...walls.map((w) => w.url), ...nature.map((n) => n.url)])]);

  const root = new THREE.Group();
  const batcher = new InstanceBatcher(root, TB.TOWN_CHUNK);
  const objs = [];
  const addObj = (url, x, y, z, s, cast = true) => {
    const st = groupOf(url);
    if (!st) return false;
    objs.push({ x, cy: y + (st.size.y * s) / 2, z, r: 0.5 * Math.hypot(st.size.x, st.size.y, st.size.z) * s, tris: st.tris, calls: st.calls, cast, name: url.split('/').pop() });
    return true;
  };
  let batched = 0, individual = 0;
  for (const it of items) {
    const piece = getPiece(it.m);
    if (!piece) continue;
    const s = it.s ?? 1, y = it.y ?? 0;
    // animated gen props and emissive props are drawn as their own objects (they cannot share an instanced draw)
    if (DEC.isAnimatedModel(it.m) || it.emissive !== undefined) { if (addObj(it.m, it.x, y, it.z, s)) individual++; continue; }
    batcher.add(it.m, it.x, y, it.z, ((it.rot ?? 0) * Math.PI) / 180, s, it.color ?? null, { cast: it.cast ?? piece.size.y * s > 1.2, receive: true, layer: 'prop' });
    batched++;
  }
  for (const w of walls) {
    if (w.kind === 'gate') batcher.add(w.url, w.x, w.y, w.z, w.rot, w.scale, null, { cast: true, receive: true, skip: /door/, layer: 'prop' });
    else batcher.add(w.url, w.x, w.y, w.z, w.rot, w.scale, null, { cast: w.kind !== 'flag', receive: true, layer: 'prop' });
  }
  for (const n of nature) batcher.add(n.url, n.x, n.y, n.z, n.rot, n.s, n.color, n.opts);
  const missing = await batcher.build();

  // NPCs: characters are skinned draws (in view only); prop-like NPCs (object) are static objects
  const chars = [];
  let npcCount = 0;
  for (const n of TOWN.npcs) {
    npcCount++;
    if (n.object) {
      addObj(n.object.model, n.pos[0], n.pos[1], n.pos[2], n.object.scale ?? 1);
      for (const e of n.object.extra ?? []) addObj(e.model, n.pos[0] + e.pos[0], n.pos[1] + e.pos[1], n.pos[2] + e.pos[2], e.scale ?? 1);
      continue;
    }
    // the model NPC.ts loads for this definition (resolvePreset), with the accessories it shows
    const preset = NPCM.resolvePreset(n);
    const url = NPCM.npcModelUrl(preset.base);
    const kay = url.includes('/characters/');
    const cost = charCost(url, kay ? (preset.show ?? []) : null);
    if (cost) chars.push({ x: n.pos[0], z: n.pos[2], cost, scale: preset.scale ?? 1, exemptRange: (n.interactRange || 3.8) + 0.7, model: preset.base });
  }

  // horizon rings and the terrain grid (createTerrain half 280, cell 10): drawn from every point
  let horizonTris = 0;
  const hz = [
    { radius: 330, minH: 38, maxH: 92, segments: 80, seed: TOWN.id + ':far', baseColor: 0x56688a, rockColor: 0x8c94ac, snowColor: 0xf6f0ee, snowLine: 0.7, haze: 0xeccfb4, hazeAmount: 0.5, slope: 0.7 },
    { radius: 255, minH: 12, maxH: 34, segments: 64, seed: TOWN.id + ':mid', baseColor: 0x3f5f46, rockColor: 0x6a6e64, haze: 0xe4c8a8, hazeAmount: 0.45, slope: 1.1 },
    { radius: 205, minH: 5, maxH: 15, segments: 56, seed: TOWN.id + ':near', baseColor: 0x3d6030, rockColor: 0x58603c, haze: 0xdcc29e, hazeAmount: 0.3, slope: 1.6 },
  ];
  const sunDir = new THREE.Vector3(...TOWN.lighting.sunDir).normalize();
  for (const o of hz) horizonTris += triOfGeom(SKY.makeMountainRing({ ...o, sunDir: [sunDir.x, sunDir.y, sunDir.z] }).geometry);
  const TERRAIN_TRIS = 2 * Math.pow((2 * half) / 10, 2);

  const culler = new ChunkCuller(batcher, TB.TOWN_CHUNK);
  culler.limits = TB.TOWN_CULL;
  if (LOD) culler.plans = PERF.lodPlans(TOWN.lighting?.fogFar ?? 150, QUALITY);

  const light = new THREE.DirectionalLight();
  SHB.configureShadowBox(light, { near: 1, far: 220 });
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const HEAD = 8;
  const points = [];
  const plan = PERF.charLodPlan(QUALITY);
  const PLAYER = charCost(PLAYER_URL, PLAYER_SHOW);
  const byName = new Map();
  const objByName = new Map();
  const shadowByName = new Map();
  for (const [label, x, z] of TOWN_POINTS) {
    culler.invalidate();
    culler.update(1, x, z);
    // shadow pass: heading independent, the town sun's 50 m box around the point (as the open world)
    SHB.followShadowBox(light, new THREE.Vector3(x, 0, z), sunDir, 90); // TownBuilder.setupLighting
    light.shadow.updateMatrices(light);
    const sfr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(light.shadow.camera.projectionMatrix, light.shadow.camera.matrixWorldInverse));
    const a = { scen: 0, scenCalls: 0, shad: 0, shadCalls: 0, obj: 0, objCalls: 0, objShad: 0, objShadCalls: 0, char: 0, charCalls: 0, full: 0, mid: 0, bill: 0, models40: 0, near40: 0, short: 0 };
    for (const im of batcher.meshes) {
      if (!im.visible) continue;
      if (!im.boundingSphere) im.computeBoundingSphere();
      if (im.castShadow && sfr.intersectsSphere(im.boundingSphere)) { a.shad += triOfGeom(im.geometry) * im.count; a.shadCalls++; }
      if (im.castShadow && sfr.intersectsSphere(im.boundingSphere) && label === (process.env.TOWN_AT ?? 'spawn')) { const nm = im.name.replace(/@.*/, ''); const b = shadowByName.get(nm) ?? { tris: 0, n: 0 }; b.tris += triOfGeom(im.geometry) * im.count; b.n += im.count; shadowByName.set(nm, b); }
    }
    for (const o of objs) {
      sph.center.set(o.x, o.cy, o.z); sph.radius = o.r;
      if (o.cast && sfr.intersectsSphere(sph)) { a.objShad += o.tris; a.objShadCalls += o.calls; }
    }
    for (let h = 0; h < HEAD; h++) {
      const ang = (h / HEAD) * Math.PI * 2;
      cam.position.set(x - Math.sin(ang) * 8, 5, z - Math.cos(ang) * 8);
      cam.lookAt(x, 1.4, z);
      cam.updateMatrixWorld();
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      fr.setFromProjectionMatrix(pm);
      for (const im of batcher.meshes) {
        if (!im.visible) continue;
        if (!im.boundingSphere) im.computeBoundingSphere();
        if (fr.intersectsSphere(im.boundingSphere)) {
          const t = (triOfGeom(im.geometry) * im.count) / HEAD;
          a.scen += t; a.scenCalls += 1 / HEAD;
          if (label === (process.env.TOWN_AT ?? 'spawn')) { const nm = im.name.replace(/@.*/, ''); const b = byName.get(nm) ?? { tris: 0, calls: 0, inst: 0 }; b.tris += t; b.calls += 1 / HEAD; b.inst = im.count; byName.set(nm, b); }
        }
      }
      for (const o of objs) {
        sph.center.set(o.x, o.cy, o.z); sph.radius = o.r;
        if (fr.intersectsSphere(sph)) {
          a.obj += o.tris / HEAD; a.objCalls += o.calls / HEAD;
          if (label === (process.env.TOWN_AT ?? 'spawn')) { const b = objByName.get(o.name) ?? { tris: 0, n: 0 }; b.tris += o.tris / HEAD; b.n++; objByName.set(o.name, b); }
        }
      }
      // characters (NPC.update): the view sphere with its margin, the tiers of CharacterLod and the ambient cap, nearest first.
      // Skinned models are never frustum culled, so the shadow pass re-draws every full-tier caster too (the shadow box is not tested)
      const seen = [];
      for (const c of chars) {
        c.dist = Math.hypot(c.x - x, c.z - z);
        if (c.dist >= plan.hide) continue;
        sph.center.set(c.x, 1.3 * c.scale, c.z); sph.radius = 2.6 * c.scale + NPCM.NPC_VIEW_MARGIN;
        if (fr.intersectsSphere(sph)) seen.push(c);
      }
      seen.sort((p, q) => p.dist - q.dist);
      let nearer = 0, models = 0, in40 = 0;
      for (const c of seen) {
        const exempt = c.dist < c.exemptRange;
        const t = CL.tierFor(c.dist, true, exempt, nearer, plan);
        if (!exempt) nearer++;
        if (c.dist < plan.model) in40++;
        if (t === 'full') { a.char += (c.cost.full.tris + c.cost.cast.tris) / HEAD; a.charCalls += (c.cost.full.calls + c.cost.cast.calls) / HEAD; a.full += 1 / HEAD; models++; }
        else if (t === 'mid') { a.char += c.cost.body.tris / HEAD; a.charCalls += c.cost.body.calls / HEAD; a.mid += 1 / HEAD; models++; }
        else if (t === 'billboard') { a.char += 2 / HEAD; a.charCalls += 1 / HEAD; a.bill += 1 / HEAD; }
      }
      a.models40 += models / HEAD; a.near40 += in40 / HEAD;
      // WP-11: at least 20 ambient NPCs within 40 m in view stay models (all of them when fewer are in view)
      if (models < Math.min(20, in40)) a.short++;
    }
    // the local player: always full, and its shadow is drawn too (never culled)
    a.char += PLAYER.full.tris + PLAYER.cast.tris; a.charCalls += PLAYER.full.calls + PLAYER.cast.calls;
    const tris = a.scen + a.shad + a.obj + a.objShad + a.char + TERRAIN_TRIS + horizonTris;
    const calls = a.scenCalls + a.shadCalls + a.objCalls + a.objShadCalls + a.charCalls + 1 + hz.length;
    points.push({ label, x, z, tris: tris - a.char, calls: calls - a.charCalls, chars: a.char, charCalls: a.charCalls, a });
  }
  const worst = points.reduce((w, p) => (p.tris > w.tris ? p : w));
  if (process.env.TOWN_TOP) console.log('shadow casters: ' + [...shadowByName.entries()].sort((p, q) => q[1].tris - p[1].tris).slice(0, 12).map(([n, b]) => n + ' ' + k(b.tris) + ' (' + b.n + ')').join(', '));
  if (process.env.TOWN_TOP) console.log('objects: ' + [...objByName.entries()].sort((p, q) => q[1].tris - p[1].tris).slice(0, 12).map(([n, b]) => `${n} ${k(b.tris)} (${b.n})`).join(', '));
  if (process.env.TOWN_TOP) {
    console.log('spawn: scenery by model (in-frustum tris, calls, instances):');
    for (const [n, b] of [...byName.entries()].sort((p, q) => q[1].tris - p[1].tris).slice(0, Number(process.env.TOWN_TOP))) console.log(`    ${n.padEnd(34)} ${k(b.tris).padStart(8)} ${b.calls.toFixed(1).padStart(6)} calls  x${b.inst}`);
    const cs = new Map();
    for (const c of chars) { const b = cs.get(c.model) ?? { n: 0, tris: c.cost.full.tris, calls: c.cost.full.calls }; b.n++; cs.set(c.model, b); }
    console.log('characters: ' + [...cs.entries()].map(([m, b]) => `${m} x${b.n} (${k(b.tris)} tris, ${b.calls} meshes)`).join(', '));
  }
  // ambient characters within 40 m of each sampled point, in any direction (the in-view count is in the per-heading figures)
  const around40 = TOWN_POINTS.map(([, x, z]) => chars.filter((c) => Math.hypot(c.x - x, c.z - z) < 40).length);
  return { points, worst, around40, batched, individual, missing, npcCount, chars: chars.length, walls: walls.length, nature: nature.length, items: items.length, meshes: batcher.meshes.length, terrainTris: TERRAIN_TRIS, horizonTris, half };
}

const town = await measureTown();
{
  const s = town.points[0].a;
  console.log(`\n=== Kuzgunkale (${town.half * 2} m town, ${QUALITY} quality, voxel LOD ${LOD ? 'on' : 'OFF'}) ===`);
  console.log(`placed: ${town.items} items (${town.batched} instanced, ${town.individual} own-object props), ${town.walls} wall pieces, ${town.nature} scatter, ${town.npcCount} NPCs (${town.chars} characters), ${town.meshes} instanced meshes`);
  console.log('point                          tris    calls   scenery  shadow  objects  terrain+sky   (characters: tris / calls, not in the line)');
  for (const p of town.points) {
    console.log(`${p.label.padEnd(28)} ${k(p.tris).padStart(7)} ${p.calls.toFixed(0).padStart(8)} ${k(p.a.scen).padStart(9)} ${k(p.a.shad).padStart(7)} ${k(p.a.obj + p.a.objShad).padStart(8)} ${k(town.terrainTris + town.horizonTris).padStart(11)}   ${k(p.chars).padStart(6)} / ${p.charCalls.toFixed(0)}`);
  }
  console.log(`spawn detail: scenery ${k(s.scen)} tris / ${s.scenCalls.toFixed(0)} calls; shadow pass ${k(s.shad)} tris / ${s.shadCalls} calls; objects ${s.objCalls.toFixed(0)} calls; characters ${s.charCalls.toFixed(0)} calls in view`);
  console.log(`town line: worst sampled point (${town.worst.label}) ${k(town.worst.tris)} tris, ${town.worst.calls.toFixed(0)} draw calls (limits 250k tris, 400 calls), characters on top ${k(town.worst.chars)} tris / ${town.worst.charCalls.toFixed(0)} calls`);
  if (town.missing.length) console.log(`  (town models not found: ${town.missing.length})`);
}

{
  const plaza = town.points.find((p) => p.label === 'plaza') ?? town.points[0];
  const cT = Math.max(...town.points.map((p) => p.chars)), cC = Math.max(...town.points.map((p) => p.charCalls));
  console.log('characters: worst sampled point ' + k(cT) + ' tris / ' + cC.toFixed(0) + ' calls (budget 80k / 110); plaza per heading: ' +
    plaza.a.full.toFixed(1) + ' full, ' + plaza.a.mid.toFixed(1) + ' mid, ' + plaza.a.bill.toFixed(1) + ' billboards; models within 40 m ' + plaza.a.models40.toFixed(1) + ' of ' +
    plaza.a.near40.toFixed(1) + ' in view; within 40 m in any direction, per sampled point: ' + town.around40.join('/') + ' (' + QUALITY + ' quality)');
}

if (BUDGET) {
  const limit = SCAN ? worst : karakirSpawn;
  const okK = limit <= 400000;
  console.log(`\nbudget: Karakir ${SCAN ? 'worst sampled point' : 'spawn'} ${k(limit)} tris (limit 400k) ${okK ? 'PASS' : 'FAIL'}`);
  const okT = town.worst.tris <= 250000 && town.worst.calls <= 400;
  console.log(`budget: town worst point ${k(town.worst.tris)} tris (limit 250k), ${town.worst.calls.toFixed(0)} draw calls (limit 400), characters excluded ${okT ? 'PASS' : 'FAIL'}`);
  const cT = Math.max(...town.points.map((p) => p.chars)), cC = Math.max(...town.points.map((p) => p.charCalls));
  const okS = town.points.every((p) => p.a.short === 0);
  const okC = cT <= 80000 && cC <= 110 && okS;
  console.log('budget: town characters (local player + ambient NPCs, worst sampled point) ' + k(cT) + ' tris (limit 80k), ' + cC.toFixed(0) +
    ' draw calls (limit 110), at least 20 ambient NPCs within 40 m in view drawn as models at every heading: ' + (okS ? 'yes' : 'NO') + ' ' + (okC ? 'PASS' : 'FAIL'));
  process.exit(okK && okT && okC ? 0 : 1);
}
