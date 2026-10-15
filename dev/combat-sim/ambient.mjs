#!/usr/bin/env node
/**
 * Sisli Vadi ambient life, headless (gate): every walker routine, critter patch, deer herd and cue of WorldExtras.ambient is on walkable
 * ground of the flooded nav, reachable from the zone start, and outside every enemy camp ring (+ CAMP_MARGIN_M), and the walkers keep
 * on their routine at every instant (the sampled clock of entities/AmbientRoute.ts, not the stops alone).
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/ambient.mjs      (V=1 prints every walker)
 * The placement rule is the runtime's own (scenes/world/AmbientLife.ts placeable / layOut), run on a nav adapter over the flooded mask
 * (no streamed trees: the live nav only ever removes cells, so this is the open-ground answer). Exit 0 = PASS (one line).
 * Also: no two walkers come closer than PAIR_M over an hour of the routine clock; the runtime's CritterField, run for MOTION_MIN minutes
 * with a player poking critters, keeps every home in its patch and every critter (flying ones too) out of the camp rings; and every deer
 * leg the runtime accepts (legClear) stays out of the camp rings.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as H from './harness.mjs';

const VERBOSE = !!process.env.V;
const PUB = fileURLToPath(new URL('../../public', import.meta.url));

const cc = await H.imp('dev/contentCheck.ts');
const { OPEN_ZONES } = await H.imp('data/dungeons/index.ts');
const { TOWN } = await H.imp('data/town.ts');
const { sampleRoute, routinePlan, routeSpanM } = await H.imp('entities/AmbientRoute.ts');
const { AmbientLife, CAMP_MARGIN_M } = await H.imp('scenes/world/AmbientLife.ts');
const { CritterField, legClear } = await H.imp('scenes/world/AmbientCritters.ts');
const { RNG, hashString } = await H.imp('core/utils.ts');
const THREE = H.THREE;

const SV = OPEN_ZONES.sisli_vadi;
const W = SV.world;
const AMB = W.ambient;
if (!AMB) throw new Error('sisli_vadi has no ambient data');

// flooded nav (the mask the game builds, flooded from the zone start), as chain_e2e and content-check read it
const models = new Map();
for (const u of new Set([...cc.dungeonUrls(SV), ...cc.townUrls(TOWN)])) {
  const f = PUB + u;
  if (!fs.existsSync(f)) { models.set(u, { exists: false }); continue; }
  if (/\/(characters|monsters|enemies|npcs)\//.test(u)) { models.set(u, { exists: true, skinned: true }); continue; }
  if (!/\.(glb|gltf)$/.test(u)) { models.set(u, { exists: true }); continue; }
  try {
    const buf = fs.readFileSync(f);
    const b = cc.glbBoundsFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    models.set(u, b ? { exists: true, box: b.box ?? undefined, skinned: b.skinned } : { exists: /\.gltf$/.test(u) });
  } catch { models.set(u, { exists: true }); }
}
const nav = cc.navFlooded(SV, models);
const NW = nav.w, NH = nav.h;
const cell = (x, z) => {
  const i = Math.floor(x), j = Math.floor(z);
  return i >= 0 && j >= 0 && i < NW && j < NH ? j * NW + i : -1;
};
const walkable = (x, z) => { const c = cell(x, z); return c >= 0 && nav.walk[c] === 1; };
const reachable = (x, z) => { const c = cell(x, z); return c >= 0 && nav.reach[c] === 1; };

/** The nav adapter AmbientLife reads: walkable cells and straight legs over them (1 m sampling). */
const navAdapter = {
  isWalkable: (x, z) => walkable(x, z),
  walkLine: (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 0; k <= n; k++) if (!walkable(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  },
};
// a fake world: AmbientLife's placement reads the nav only (no entities are built in the sim)
const fakeWorld = { nav: navAdapter, groundY: () => 0, allocLocalId: () => 0, time: 0 };
// the placement is seeded per run: every seed below is laid out and checked (the runtime seed is the dungeon run seed)
const SEEDS = ["1", "2", "777"];
const lifeFor = (seed) => new AmbientLife({ world: fakeWorld, scene: null, decor: null, ext: W, packs: SV.packs, seed });

// camp rings: the packs (camps) and patrol routes of the zone, as the runtime computes them
const TILE = 4;
const tileW = (t) => (t + 0.5) * TILE;
const rings = SV.packs.map((pk) => ({
  x: tileW(pk.center[0]), z: tileW(pk.center[1]), r: pk.radius ?? 12, id: pk.id,
  pts: pk.patrol?.length ? pk.patrol.map(([tx, tz]) => [tileW(tx), tileW(tz)]) : null,
}));
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
};
function campAt(x, z) {
  for (const c of rings) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + CAMP_MARGIN_M) return c.id;
    if (c.pts) for (let i = 0; i < c.pts.length - 1; i++) if (segDist(x, z, c.pts[i], c.pts[i + 1]) < c.r + CAMP_MARGIN_M) return c.id;
  }
  return null;
}

const fails = [];
const fail = (msg) => fails.push(msg);
let stats = { walkers: 0, legs: 0, samples: 0, pairs: 0, critters: 0, critterAsk: 0, motion: 0, herdPoints: 0, deerLegs: 0, cues: 0 };

// ------------------------------------------------------------------------------------------------ walkers
for (const npc of AMB.npcs) {
  if (!npc.routine) { fail(`${npc.id}: no routine`); continue; }
  stats.walkers++;
  const r = npc.routine;
  const plan = routinePlan(r);
  if (!(r.speed > 0) && r.stops.length > 1) fail(`${npc.id}: speed ${r.speed} with ${r.stops.length} stops`);
  // every stop: walkable, reachable from the start, outside camps
  for (const [k, s] of r.stops.entries()) {
    const [x, z] = s.pos;
    if (!walkable(x, z)) fail(`${npc.id}: stop ${k} (${x.toFixed(1)}, ${z.toFixed(1)}) not walkable`);
    else if (!reachable(x, z)) fail(`${npc.id}: stop ${k} not reachable from the zone start`);
    const c = campAt(x, z);
    if (c) fail(`${npc.id}: stop ${k} inside camp ${c}`);
  }
  // every leg: straight line, 0.5 m samples, walkable
  for (let i = 0; i < r.stops.length && r.stops.length > 1; i++) {
    const a = r.stops[i].pos, b = r.stops[(i + 1) % r.stops.length].pos;
    stats.legs++;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      if (!walkable(x, z)) { fail(`${npc.id}: leg ${i} blocked at (${x.toFixed(1)}, ${z.toFixed(1)})`); break; }
      const c = campAt(x, z);
      if (c) { fail(`${npc.id}: leg ${i} passes camp ${c}`); break; }
    }
  }
  // the routine as the game samples it: one cycle at 0.5 s, each position walkable, reachable and outside camps
  const cyc = plan.cycle;
  if (cyc <= 0) fail(`${npc.id}: zero cycle`);
  // a single-stop routine stands still (one sample); its long dwell is not walked through second by second
  const span = r.stops.length > 1 ? cyc : 0;
  for (let t = 0; t <= span + 1e-6; t += 0.5) {
    const s = sampleRoute(r, t);
    stats.samples++;
    if (!walkable(s.x, s.z)) { fail(`${npc.id}: routine at t=${t.toFixed(1)} off the nav (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`); break; }
    if (!reachable(s.x, s.z)) { fail(`${npc.id}: routine at t=${t.toFixed(1)} unreachable`); break; }
    const c = campAt(s.x, s.z);
    if (c) { fail(`${npc.id}: routine at t=${t.toFixed(1)} inside camp ${c}`); break; }
  }
  if (VERBOSE) console.log(`walker ${npc.id.padEnd(22)} stops=${r.stops.length} cycle=${cyc.toFixed(0)}s span=${routeSpanM(r).toFixed(0)}m ${npc.name}`);
}

// ------------------------------------------------------------------------------------------------ walker pairs
// no two walkers come closer than PAIR_M (their name plates would overlap, and two on one lane pass head-on). The clock is sampled for an
// hour: the cycles differ, so no single cycle shows every pairing.
const PAIR_M = 1.5, PAIR_T = 3600, PAIR_DT = 0.25;
const NS = Math.round(PAIR_T / PAIR_DT) + 1;
const tracks = AMB.npcs.filter((n) => n.routine).map((n) => {
  const xs = new Float64Array(NS), zs = new Float64Array(NS);
  for (let k = 0; k < NS; k++) {
    const s = sampleRoute(n.routine, k * PAIR_DT);
    xs[k] = s.x;
    zs[k] = s.z;
  }
  return { id: n.id, xs, zs };
});
for (let i = 0; i < tracks.length; i++) {
  for (let j = i + 1; j < tracks.length; j++) {
    const a = tracks[i], b = tracks[j];
    let best = Infinity, at = 0;
    for (let k = 0; k < NS; k++) {
      const d = Math.hypot(a.xs[k] - b.xs[k], a.zs[k] - b.zs[k]);
      if (d < best) {
        best = d;
        at = k * PAIR_DT;
      }
    }
    stats.pairs++;
    if (best < PAIR_M) fail(`${a.id} / ${b.id}: ${best.toFixed(2)} m apart at t=${at.toFixed(1)} s (under ${PAIR_M} m)`);
  }
}

// ------------------------------------------------------------------------------------------------ critters (the runtime's own layout)
for (const seed of SEEDS) {
const life = lifeFor(seed);
for (const zone of AMB.critters) {
  if (seed === SEEDS[0]) stats.critterAsk += zone.count;
  const rng = new RNG(hashString(`${seed}:critter:${zone.id}`));
  const pts = life.layOut(zone.kind, zone.center, zone.radius, zone.count, rng);
  if (seed === SEEDS[0]) stats.critters += pts.length;
  if (pts.length < Math.ceil(zone.count / 2)) fail(`${zone.id}: only ${pts.length}/${zone.count} points fit (${zone.kind})`);
  for (const [x, z] of pts) {
    if (!walkable(x, z)) fail(`${zone.id}: point off the nav`);
    if (!reachable(x, z)) fail(`${zone.id}: point unreachable`);
    const c = campAt(x, z);
    if (c) fail(`${zone.id}: ${zone.kind} inside camp ${c} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    if ((zone.kind === 'rabbit' || zone.kind === 'bird') && life.inVillage(x, z)) fail(`${zone.id}: ${zone.kind} inside a village`);
    if (zone.kind === 'frog' && !(life.waterDist(x, z) <= 5 && life.waterDist(x, z) > 0)) fail(`${zone.id}: frog not on a shore`);
  }
  if (VERBOSE && seed === SEEDS[0]) console.log(`critters ${zone.id.padEnd(22)} ${zone.kind.padEnd(10)} ${pts.length}/${zone.count}`);
}
}

// ------------------------------------------------------------------------------------------------ critters in motion
// the runtime's CritterField, run for MOTION_MIN sim-minutes: a player walks up to a random critter every few seconds (it flees or flies),
// then walks off. Every home stays in its patch and on the placement rule; every critter on the ground is on the rule; no critter, flying
// ones included, is inside a camp ring.
const MOTION_MIN = 6, MOTION_DT = 0.1;
for (const seed of SEEDS) {
  const mlife = lifeFor(seed);
  const rules = { place: (k, x, z) => mlife.placeable(k, x, z), air: (x, z) => !mlife.inCamp(x, z) };
  const capacity = { rabbit: 0, bird: 0, butterfly: 0, frog: 0, chicken: 0 };
  for (const z of AMB.critters) capacity[z.kind] += z.count;
  const field = new CritterField(new THREE.Scene(), fakeWorld, new THREE.BoxGeometry(0.2, 0.14, 0.3), capacity, rules);
  const crit = [];
  for (const zone of AMB.critters) {
    const rng = new RNG(hashString(`${seed}:critter:${zone.id}`));
    const patch = { x: zone.center[0], z: zone.center[1], r: zone.radius };
    for (const [x, z] of mlife.layOut(zone.kind, zone.center, zone.radius, zone.count, rng)) {
      const c = field.create(zone.kind, x, z, rng, patch);
      field.activate(c);
      crit.push({ c, zone });
    }
  }
  const rnd = new RNG(hashString(`${seed}:motion`));
  const bad = new Set();
  let px = -1e5, pz = -1e5, evEnd = -1, nextEv = 1;
  for (let k = 0, t = 0; t < MOTION_MIN * 60; k++, t += MOTION_DT) {
    if (t >= nextEv && crit.length) {
      const pick = crit[Math.floor(rnd.next() * crit.length)].c;
      const a = rnd.range(0, Math.PI * 2);
      px = pick.x + 2.5 * Math.sin(a);
      pz = pick.z + 2.5 * Math.cos(a);
      evEnd = t + 1.0;
      nextEv = t + 3.5 * (0.5 + rnd.next());
    }
    if (t >= evEnd) {
      px = -1e5;
      pz = -1e5;
    }
    field.update(MOTION_DT, px, pz);
    if (k % 10 !== 0) continue;
    for (const { c, zone } of crit) {
      stats.motion++;
      if (Math.hypot(c.hx - zone.center[0], c.hz - zone.center[1]) > zone.radius + 1e-6) bad.add(`${zone.id}: a ${c.kind} home left its patch`);
      if (!mlife.placeable(c.kind, c.hx, c.hz)) bad.add(`${zone.id}: a ${c.kind} home is off the placement rule`);
      if (campAt(c.x, c.z)) bad.add(`${zone.id}: a ${c.kind} is inside camp ${campAt(c.x, c.z)}`);
      const grounded = c.kind !== 'butterfly' && (c.kind !== 'bird' || c.state === 'sit' || c.state === 'walk' || c.state === 'flee');
      if (c.kind === 'butterfly' || grounded) {
        if (!mlife.placeable(c.kind, c.x, c.z)) bad.add(`${zone.id}: a ${c.kind} stands off the placement rule`);
      }
    }
  }
  for (const msg of bad) fail(`motion (seed ${seed}): ${msg}`);
}

// ------------------------------------------------------------------------------------------------ deer herds
const life = lifeFor(SEEDS[0]);
for (const herd of AMB.herds) {
  const [cx, cz] = herd.center;
  if (!walkable(cx, cz) || !reachable(cx, cz)) fail(`${herd.id}: centre not walkable/reachable`);
  if (campAt(cx, cz)) fail(`${herd.id}: centre inside a camp`);
  let ok = 0, tried = 0;
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2, d = herd.radius * Math.sqrt((i * 37 % 200) / 200);
    const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
    tried++;
    if (life.placeable('bird', x, z)) ok++;
  }
  stats.herdPoints += ok;
  if (ok < tried * 0.3) fail(`${herd.id}: only ${ok}/${tried} of its meadow is open ground`);
}

// ------------------------------------------------------------------------------------------------ deer legs
// every run or walk leg the runtime accepts (legClear, the same test WildDeer uses) stays out of the camp rings, sampled every 0.25 m
const deerOk = (x, z) => life.placeable('bird', x, z);
for (const herd of AMB.herds) {
  const rnd = new RNG(hashString(`${SEEDS[0]}:deer-legs:${herd.id}`));
  for (let i = 0; i < 400; i++) {
    const a0 = rnd.range(0, Math.PI * 2), d0 = herd.radius * Math.sqrt(rnd.next());
    const x0 = herd.center[0] + Math.sin(a0) * d0, z0 = herd.center[1] + Math.cos(a0) * d0;
    if (!deerOk(x0, z0)) continue;
    const a1 = rnd.range(0, Math.PI * 2), len = rnd.range(4, 22);
    const x1 = x0 + Math.sin(a1) * len, z1 = z0 + Math.cos(a1) * len;
    if (!legClear(navAdapter, deerOk, x0, z0, x1, z1)) continue;
    stats.deerLegs++;
    const n = Math.ceil(len / 0.25);
    let hit = null;
    for (let k = 0; k <= n && !hit; k++) hit = campAt(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n);
    if (hit) fail(`${herd.id}: an accepted deer leg crosses camp ${hit}`);
  }
}

// ------------------------------------------------------------------------------------------------ cues: on a building of a settlement, outside camps
const SETTLE = W.villages.map((v) => ({ id: v.id, x: tileW(v.center[0]), z: tileW(v.center[1]) }));
for (const c of [...AMB.smoke, ...AMB.glows]) {
  stats.cues++;
  const [x, z] = c.pos;
  const near = SETTLE.find((s) => Math.hypot(s.x - x, s.z - z) < 40);
  if (!near) fail(`cue at (${x.toFixed(1)}, ${z.toFixed(1)}) is not at a settlement`);
  if (campAt(x, z)) fail(`cue at (${x.toFixed(1)}, ${z.toFixed(1)}) inside a camp ring`);
}

for (const f of fails.slice(0, 40)) console.log('FAIL', f);
if (fails.length > 40) console.log(`... ${fails.length - 40} more`);
const line = `walkers ${stats.walkers} (legs ${stats.legs}, samples ${stats.samples}, pairs ${stats.pairs} >= ${PAIR_M} m) · critters ${stats.critters}/${stats.critterAsk} (motion ${stats.motion} samples) · deer legs ${stats.deerLegs} · herd meadow points ${stats.herdPoints} · cues ${stats.cues} · camp rings ${rings.length} (+${CAMP_MARGIN_M} m)`;
if (fails.length) {
  console.log(`ambient: FAIL ${fails.length} (${line})`);
  process.exit(1);
}
console.log(`ambient: PASS (${line})`);
