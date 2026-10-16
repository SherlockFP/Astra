// VOXEL LOD (src/world/VoxelLod.ts), headless: every scatter model of the open world is rebuilt as (0) the same surface with coplanar
// same-colour faces merged, (1) a 2x and (2) a 4x coarser voxel copy. Checks, per model: the merged copy is LOSSLESS (re-analysed, the
// face grid equals the original face for face, colour for colour), it never has more triangles, the coarser copies are smaller and stay
// inside the model's box, keep its height, and are still valid voxel meshes (winding intact).
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/voxellod.mjs [--v]
import fs from 'node:fs';
import { fileOf, glbToGroup } from './glbtris.mjs';

const root = new URL('../../src/', import.meta.url).href;
const THREE = await import('three');
const { analyseVoxelMesh, mergeFaces, downsample, solidCells } = await import(root + 'world/VoxelLod.ts');
const RM = await import(root + 'core/voxelRemap.ts');
const WS = await import(root + 'world/WorldScenery.ts');
const { InstanceBatcher, voxelLodGeometries } = await import(root + 'world/Instancing.ts');
const verbose = process.argv.includes('--v');

let fails = 0, passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const urls = [...new Set(WS.worldSceneryUrls().map((u) => RM.resolveModelUrl(u, true)))].filter((u) => fs.existsSync(fileOf(u)));
let checked = 0, skipped = 0, trisOrig = 0, trisMerged = 0, trisF2 = 0, trisF4 = 0;
for (const u of urls) {
  const g = glbToGroup(THREE, fileOf(u));
  g.updateMatrixWorld(true);
  const geos = [];
  g.traverse((o) => { if (o.isMesh) geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
  const name = u.split('/').slice(-2).join('/');
  for (const geo of geos) {
    const raw = { position: geo.attributes.position.array, uv: geo.attributes.uv?.array, index: geo.index?.array ?? null };
    const v = raw.uv ? analyseVoxelMesh(raw) : null;
    if (!v) { skipped++; if (verbose) console.log(`skip ${name} (not a flat-palette voxel mesh)`); continue; }
    checked++;
    const orig = (raw.index ? raw.index.length : raw.position.length / 3) / 3;
    const m0 = mergeFaces(v), m2 = downsample(v, 2), m4 = downsample(v, 4);
    trisOrig += orig; trisMerged += m0.triangles; trisF2 += m2.triangles; trisF4 += m4.triangles;
    // lossless
    const v2 = analyseVoxelMesh({ position: m0.position, uv: m0.uv, index: m0.index });
    let same = !!v2 && v2.faceCount === v.faceCount && v2.dim.join() === v.dim.join();
    for (let d = 0; same && d < 6; d++) {
      for (let i = 0; i < v.faces[d].length; i++) {
        const a = v.faces[d][i], b = v2.faces[d][i];
        if ((a === 0) !== (b === 0) || (a && (v.uvs[(a - 1) * 2] !== v2.uvs[(b - 1) * 2] || v.uvs[(a - 1) * 2 + 1] !== v2.uvs[(b - 1) * 2 + 1]))) { same = false; break; }
      }
    }
    ok(`lod.lossless ${name}`, same, `${orig} -> ${m0.triangles} tris`);
    ok(`lod.smaller ${name}`, m0.triangles <= orig && (m2.triangles <= m0.triangles || m0.triangles < 20) && m4.triangles <= Math.max(m2.triangles, 12), `${orig}/${m0.triangles}/${m2.triangles}/${m4.triangles}`);
    // the coarse copies stay inside the original box (+ nothing) and keep most of its height
    for (const [label, m] of [['f2', m2], ['f4', m4]]) {
      if (m.triangles === 0) continue;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.position.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], m.position[i + a]); max[a] = Math.max(max[a], m.position[i + a]); }
      const inside = [0, 1, 2].every((a) => min[a] >= v.origin[a] - 1e-4 && max[a] <= v.max[a] + 1e-4);
      const h = (max[1] - min[1]) / Math.max(1e-6, v.max[1] - v.origin[1]);
      ok(`lod.${label}.bounds ${name}`, inside && h > 0.45, `height kept ${(h * 100).toFixed(0)}%`);
      // winding: the signed volume of the (nearly closed) surface is positive when every face points outwards, and about the volume of the original
      const vol = (mm) => {
        let s = 0;
        const P = mm.position, I = mm.index;
        for (let t = 0; t < I.length; t += 3) {
          const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
          s += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
        }
        return s;
      };
      const v0 = vol(m0), vc = vol(m);
      ok(`lod.${label}.winding ${name}`, v0 > 0 && vc > 0 && vc > v0 * 0.25 && vc < v0 * 4, `volume ${vc.toFixed(2)} vs ${v0.toFixed(2)}`);
    }
  }
}
ok('lod.coverage', checked >= urls.length * 0.6, `${checked} voxel meshes checked, ${skipped} skipped of ${urls.length} models`);
console.log(`voxel LOD over ${checked} scenery meshes: ${trisOrig} tris -> merged ${trisMerged} (${((trisMerged / trisOrig) * 100).toFixed(0)}%) -> 2x ${trisF2} (${((trisF2 / trisOrig) * 100).toFixed(0)}%) -> 4x ${trisF4} (${((trisF4 / trisOrig) * 100).toFixed(1)}%)`);

// the batcher wiring: a tiered group makes tier 0 at once, the others on demand; the culler sorts the instances into tiers by distance,
// hides the group beyond the end distance, leaves a mesh alone while a camera-occluder ghost holds one of its instances, frees all of it with the chunk
{
  const { G } = await import(root + 'game/G.ts');
  const { ChunkCuller } = await import(root + 'world/Instancing.ts');
  const { loadPieces } = await import(root + 'world/Pieces.ts');
  const { lodPlans, setGfxQuality, getGfxQuality } = await import(root + 'world/WorldPerf.ts');
  G.assets = {
    async load(url) {
      const real = RM.resolveModelUrl(url, true);
      const f = fileOf(real);
      return fs.existsSync(f) ? { scene: glbToGroup(THREE, f), voxel: real !== url, skinned: false, url: real } : null;
    },
  };
  ok('lod.nonvoxel-null', voxelLodGeometries(new THREE.BoxGeometry(1, 1, 1)) === null, 'a box with per-face uv is not a flat-palette voxel mesh');
  const url = '/assets/models/gen/props/tree_pine_a.glb';
  await loadPieces([url]);
  const scene = new THREE.Group();
  const b = new InstanceBatcher(scene, 64);
  b.deferred = true;
  await b.build();
  const gen = [];
  for (let i = 0; i < 200; i++) gen.push({ url, x: 2 + (i % 20) * 3, y: 0, z: 2 + Math.floor(i / 20) * 6, rot: 0, scale: 1.2, tint: 0.9, cast: true, receive: true, layer: 'tree' });
  b.loadChunk(0, 0, gen);
  // one set per occupied 16 m sub-cell of the chunk (Instancing.emit): the shadow pass and the frustum test see small meshes
  const cellsOf = new Set(gen.map((g) => Math.floor(g.x / 16) + ',' + Math.floor(g.z / 16))).size;
  ok('lod.set-made', b.lodSets.length === cellsOf && scene.children.length === cellsOf, `${b.lodSets.length} sets (${cellsOf} occupied 16 m cells), ${scene.children.length} mesh before the first update (tier 0 only)`);
  const culler = new ChunkCuller(b, 64);
  culler.plans = lodPlans(110, 'mid');
  culler.update(1, 0, 0);
  const byTier = (t) => scene.children.find((m) => m.name.endsWith('#t' + t));
  const n = (t) => (byTier(t) && byTier(t).visible ? byTier(t).count : 0);
  // trees have no 4x copy by design (WorldPerf.ts lodPlans: tree keep2 0, the 2x copy runs to the end distance), so tier 2 is only
  // expected on the rock layer (checked below)
  ok('lod.tiers-fill', n(0) > 0 && n(1) > 0 && n(2) === 0 && n(0) + n(1) <= 200, `tree tier counts ${n(0)} / ${n(1)} / ${n(2)} of 200 from (0,0) (no 4x copy for trees)`);
  ok('lod.tier-shadows', byTier(0).castShadow === true && byTier(1).castShadow === true && !byTier(2), 'tiers 0 and 1 cast; no 4x tier is made for trees');
  ok('lod.tier-geometry', byTier(0).geometry !== byTier(1).geometry && byTier(1).geometry.index.count < byTier(0).geometry.index.count, 'the 2x copy is a smaller geometry than the full model');
  const s0 = byTier(0).boundingSphere;
  ok('lod.sphere', s0.radius > 0 && s0.radius < 120, `tier 0 sphere r ${s0.radius.toFixed(1)} m (fits what it holds)`);
  ok('lod.colour', !!byTier(0).instanceColor, 'instance tint carried to the tier meshes');
  // far away: hidden
  culler.update(1, 900, 900);
  ok('lod.hidden-far', scene.children.every((m) => !m.visible), 'beyond the end distance nothing is drawn');
  culler.update(1, 0, 0);
  ok('lod.back', n(0) > 0, 'and it comes back');
  // an occluder ghost holds an instance of tier 0: the mesh keeps its content while the focus moves
  byTier(0).userData.fadeLocks = 1;
  const before = byTier(0).count;
  culler.update(1, 40, 20);
  ok('lod.fade-lock', byTier(0).count === before, 'a locked tier mesh is not re-sorted');
  byTier(0).userData.fadeLocks = 0;
  culler.update(1, 40, 22);
  // quality: low / high move the tiers
  const pMid = lodPlans(110, 'mid'), pLow = lodPlans(110, 'low'), pHigh = lodPlans(110, 'high');
  ok('lod.quality-plans', pLow.tree.d0 < pMid.tree.d0 && pMid.tree.d0 < pHigh.tree.d0 && pLow.tuft.end < pMid.tuft.end && pMid.tuft.end < pHigh.tuft.end && lodPlans(110, 'mid') === pMid, 'low < mid < high, plan objects cached');
  ok('lod.quality-state', getGfxQuality() === 'mid' && (setGfxQuality('low'), getGfxQuality() === 'low') && (setGfxQuality('mid'), getGfxQuality() === 'mid'), 'setGfxQuality round trip');
  // the chunk frees everything it made
  const meshes = b.meshes.length;
  b.unloadChunk(0, 0);
  ok('lod.unload', meshes >= 2 && b.meshes.length === 0 && scene.children.length === 0 && b.lodSets.length === 0, `${meshes} tier meshes freed with the chunk`);
}

// the 4x copy: rocks keep one (WorldPerf.ts lodPlans, rock keep2 0.8 out to 95 m), so tier 2 is built there and is the smallest copy
{
  const { ChunkCuller } = await import(root + 'world/Instancing.ts');
  const { loadPieces } = await import(root + 'world/Pieces.ts');
  const { lodPlans } = await import(root + 'world/WorldPerf.ts');
  const rockUrl = '/assets/models/gen/props/rock_medium.glb';
  await loadPieces([rockUrl]);
  const scene = new THREE.Group();
  const rb = new InstanceBatcher(scene, 64);
  rb.deferred = true;
  await rb.build();
  const gen = [];
  for (let i = 0; i < 200; i++) gen.push({ url: rockUrl, x: 2 + (i % 20) * 3, y: 0, z: 2 + Math.floor(i / 20) * 6, rot: 0, scale: 1.2, tint: 0.9, cast: true, receive: true, layer: 'rock' });
  rb.loadChunk(0, 0, gen);
  const culler = new ChunkCuller(rb, 64);
  culler.plans = lodPlans(110, 'mid');
  culler.update(1, 0, 0);
  const byTier = (t) => scene.children.find((m) => m.name.endsWith('#t' + t));
  const n = (t) => (byTier(t) && byTier(t).visible ? byTier(t).count : 0);
  ok('lod.rock-tiers', n(0) > 0 && n(1) > 0 && n(2) > 0 && n(0) + n(1) + n(2) <= 200, `rock tier counts ${n(0)} / ${n(1)} / ${n(2)} of 200 from (0,0)`);
  ok('lod.rock-4x', !!byTier(2) && !byTier(2).castShadow && byTier(2).geometry.index.count < byTier(1).geometry.index.count, '4x copy casts nothing and is the smallest geometry');
  rb.unloadChunk(0, 0);
  ok('lod.rock-unload', rb.meshes.length === 0 && scene.children.length === 0, 'the rock chunk frees its tiers');
}

console.log(`\nvoxellod: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
