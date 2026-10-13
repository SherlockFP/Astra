#!/usr/bin/env node
/**
 * Headless check of the vertical NavGrid (OWNER: core; docs/ENGINE_VERTICALITY.md §5, V2). Builds hand-made 10x10 grids with a
 * fake height source (the Heightfield shape of §4, no three.js scene, no dev server) and asserts:
 *   - stairs (0.4 m per column) are walkable both ways and the path ends at the right height
 *   - a 2 m cliff is rejected (rail wall on the high side, and the step rule when no rim is cut)
 *   - the rail band is solid, LOW|RAIL flagged, and raycastY shoots over it
 *   - VOID cells are never planned through or onto
 *   - a rail-split plateau is its own region and unreachable
 *   - walkLine / resolveMove refuse steps above the limit
 *   - a flat grid gives the same paths and LOS as the pre-vertical NavGrid (pinned values)
 *
 *   node tools/nav-vert-check.mjs
 *
 * Exit code 1 on any failure. Needs Node >= 22.18 (native TypeScript type stripping).
 */
import * as THREE from 'three';
import { NavGrid, NAV_F } from '../src/world/NavGrid.ts';

const N = 10;
let pass = 0;
const fails = [];
function check(label, ok, detail = '') {
  if (ok) pass++;
  else fails.push(`${label}${detail ? ` (${detail})` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  -> ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

/**
 * spec(c, r) -> { y, f?, rim? } per 1 m cell. Cell (c, r) is centred on (c + 0.5, r + 0.5) with origin 0, so the
 * height lookup is floor(x), floor(z). Every cell starts open (cells = 1).
 */
function build(spec, opts = {}) {
  const nav = new NavGrid({ originX: 0, originZ: 0, width: N, depth: N, walkable: true });
  const Y = new Float32Array(N * N), F = new Uint8Array(N * N), R = new Array(N * N).fill('rail');
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const s = spec(c, r);
      Y[r * N + c] = s.y;
      F[r * N + c] = s.f ?? 0;
      R[r * N + c] = s.rim ?? opts.rim ?? 'rail';
    }
  const idx = (x, z) => Math.floor(z) * N + Math.floor(x);
  const inside = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const hf = {
    groundY: (x, z) => (inside(x, z) ? Y[idx(x, z)] : 0),
    flagsAt: (x, z) => (inside(x, z) ? F[idx(x, z)] : 0),
    rimAt: (x, z) => (inside(x, z) ? R[idx(x, z)] : 'none'),
  };
  nav.attachHeights(hf);
  return nav;
}

const cellFlags = (nav, c, r) => nav.flags[r * N + c];
const pathOk = (p, label) => check(label, p !== null && p.length > 0, p === null ? 'null' : '');

// ---- 1. stairs: 0.4 m per column, every rise under STEP_UP ----
{
  const nav = build((c) => ({ y: 0.4 * c }));
  check('stairs: vertical flag set', nav.vertical === true);
  const up = nav.findPath({ x: 0.5, z: 4.5 }, { x: 9.5, z: 4.5 });
  pathOk(up, 'stairs: path up exists');
  if (up) check('stairs: up path ends on the top tread', near(up[up.length - 1].y, 3.6, 0.02), `y=${up[up.length - 1].y}`);
  const down = nav.findPath({ x: 9.5, z: 4.5 }, { x: 0.5, z: 4.5 });
  pathOk(down, 'stairs: path down exists');
  check('stairs: walkLine along the stairs', nav.walkLine(0.5, 4.5, 9.5, 4.5) === true);
  check('stairs: no rim cut on gentle steps', nav.cells.every((v) => v === 1));
}

// ---- 2. cliff: 2 m drop, rail on the high side ----
const cliffSpec = (c) => ({ y: c < 5 ? 0 : 2.0 });
{
  const nav = build(cliffSpec);
  check('cliff: high column 5 is cut solid', [0, 3, 9].every((r) => nav.cell(5, r) === 0));
  check('cliff: rail cells flagged LOW|RAIL', (cellFlags(nav, 5, 4) & (NAV_F.LOW | NAV_F.RAIL)) === (NAV_F.LOW | NAV_F.RAIL));
  check('cliff: low side column 4 untouched', nav.cell(4, 4) === 1 && !(cellFlags(nav, 4, 4) & NAV_F.RAIL));
  check('cliff: path across the rail rejected', nav.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 }) === null);
  check('cliff: path back down across the rail rejected', nav.findPath({ x: 8.5, z: 4.5 }, { x: 2.5, z: 4.5 }) === null);
  check('cliff: walkLine across rejected', nav.walkLine(2.5, 4.5, 8.5, 4.5) === false);
  pathOk(nav.findPath({ x: 1.5, z: 1.5 }, { x: 3.5, z: 8.5 }), 'cliff: low side path still works');
}

// ---- 2b. cliff with no rim: the step rule alone must reject the climb ----
{
  const nav = build(cliffSpec, { rim: 'none' });
  check('cliff/no rim: cells stay open', nav.cell(5, 4) === 1);
  check('cliff/no rim: 2 m climb rejected by the step rule', nav.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 }) === null);
  check('cliff/no rim: walkLine rejects the step', nav.walkLine(4.5, 4.5, 5.5, 4.5) === false);
}

// ---- 3. rail band: raycastY shoots over LOW, raycast does not ----
{
  const nav = build(cliffSpec);
  check('rail: low shot (y=1.0) blocked', nav.raycastY(2.5, 1.0, 4.5, 7.5, 1.0, 4.5) < 1);
  check('rail: high shot (y=3.5) passes over', nav.raycastY(2.5, 3.5, 4.5, 7.5, 3.5, 4.5) === 1);
  check('rail: legacy raycast still blocked by rail', nav.raycast(2.5, 4.5, 7.5, 4.5) < 1);
  check('rail: lineOfSight still blocked by rail', nav.lineOfSight(2.5, 4.5, 7.5, 4.5) === false);
}

// ---- 3b. raycastY over a solid non-LOW cell always blocks (a pillar) ----
{
  const nav = build((c, r) => ({ y: 0, f: 0 }));
  nav.setCell(5, 4, 0);
  check('raycastY: solid non-LOW cell blocks at any height', nav.raycastY(2.5, 9, 4.5, 7.5, 9, 4.5) < 1);
}

// ---- 4. VOID: physics-walkable, never planned ----
{
  const pit = (c, r) => (c >= 6 && c <= 7 && r >= 3 && r <= 6 ? { y: -9, f: NAV_F.VOID } : { y: 0 });
  const nav = build(pit);
  check('void: isWalkable false in the pit (physics: no spawn)', nav.isWalkable(6.5, 4.5) === false);
  check('void: isStandable false in the pit', nav.isStandable(6.5, 4.5) === false);
  check('void: raw cell still open for collision', nav.cell(6, 4) === 1);
  const p = nav.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 });
  pathOk(p, 'void: path around a partial pit exists');
  if (p) check('void: no waypoint lies in the pit', p.every((v) => !(nav.flagsAt(v.x, v.z) & NAV_F.VOID)));
  const toPit = nav.findPath({ x: 2.5, z: 4.5 }, { x: 6.5, z: 4.5 });
  check('void: goal inside the pit is redirected to a standable cell', toPit !== null && toPit.length > 0 && !(nav.flagsAt(toPit[toPit.length - 1].x, toPit[toPit.length - 1].z) & NAV_F.VOID));
  const full = build((c) => (c >= 6 && c <= 7 ? { y: -9, f: NAV_F.VOID } : { y: 0 }));
  check('void: full-height pit is unpathable', full.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 }) === null);
  check('void: full-height pit splits regions', full.sameRegion({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 }) === false);
}

// ---- 5. region split: a plateau in rows 0-1 whose edge (row 1, high side) is railed ----
{
  const nav = build((c, r) => ({ y: r <= 1 ? 3.0 : 0 }));
  check('region: rail cut on the plateau edge (row 1)', nav.cell(5, 1) === 0 && nav.cell(5, 0) === 1);
  check('region: plateau row 0 is standable', nav.isStandable(5.5, 0.5));
  check('region: plateau and floor get different ids', nav.regionAt(5.5, 0.5) !== 0 && nav.regionAt(5.5, 0.5) !== nav.regionAt(5.5, 5.5));
  check('region: sameRegion false across the split', nav.sameRegion({ x: 5.5, z: 0.5 }, { x: 5.5, z: 5.5 }) === false);
  check('region: findPath across the split returns null', nav.findPath({ x: 5.5, z: 0.5 }, { x: 5.5, z: 5.5 }) === null);
  check('region: findPath inside the floor region works', nav.findPath({ x: 1.5, z: 5.5 }, { x: 8.5, z: 8.5 }) !== null);
}

// ---- 5b. ledge: open but LEDGE, so planners treat it as blocked ----
{
  const nav = build(cliffSpec, { rim: 'ledge' });
  check('ledge: high cell stays open', nav.cell(5, 4) === 1);
  check('ledge: high cell flagged LEDGE and not standable', (cellFlags(nav, 5, 4) & NAV_F.LEDGE) !== 0 && !nav.isStandable(5.5, 4.5));
  check('ledge: planner cannot step onto the ledge', nav.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 }) === null);
}

// ---- 6. resolveMove: a 2 m step is refused on the ground, allowed when airborne at that height ----
{
  const nav = build(cliffSpec, { rim: 'none' });
  const pos = new THREE.Vector3(5.2, 0, 4.5);
  const hit = nav.resolveMove(pos, 4.5, 4.5, 0.3, 0, false);
  check('resolveMove: grounded climb reverted to prev x', near(pos.x, 4.5) && hit === true, `x=${pos.x} hit=${hit}`);
  const air = new THREE.Vector3(5.2, 2.0, 4.5);
  const hitAir = nav.resolveMove(air, 4.5, 4.5, 0.3, 2.0, true);
  check('resolveMove: airborne at the new floor lands', near(air.x, 5.2) && hitAir === false, `x=${air.x} hit=${hitAir}`);
  const slide = new THREE.Vector3(5.2, 0, 3.2);
  nav.resolveMove(slide, 4.5, 4.5, 0.3, 0, false);
  check('resolveMove: diagonal into the cliff slides along it', near(slide.x, 4.5) && near(slide.z, 3.2), `x=${slide.x} z=${slide.z}`);
}

// ---- 7. flat grid: legacy paths and LOS, pinned values ----
{
  const nav = new NavGrid({ originX: 0, originZ: 0, width: N, depth: N, walkable: true });
  nav.setRect(5, 0, 6, 8, false);
  check('flat: vertical flag false', nav.vertical === false && nav.floor === null && nav.region === null);
  const p1 = nav.findPath({ x: 0.5, z: 0.5 }, { x: 9.5, z: 9.5 });
  const want1 = [[4.5, 0, 8.5], [9.5, 0, 9.5]];
  check('flat: long path matches pinned legacy waypoints', JSON.stringify(p1.map((v) => [v.x, v.y, v.z])) === JSON.stringify(want1), JSON.stringify(p1));
  const p2 = nav.findPath({ x: 2.5, z: 4.5 }, { x: 8.5, z: 4.5 });
  const want2 = [[4.5, 0, 8.5], [7.5, 0, 7.5], [8.5, 0, 4.5]];
  check('flat: detour path matches pinned legacy waypoints', JSON.stringify(p2.map((v) => [v.x, v.y, v.z])) === JSON.stringify(want2), JSON.stringify(p2));
  check('flat: raycastY equals raycast over a wall', nav.raycastY(2.5, 3, 4.5, 7.5, 3, 4.5) === nav.raycast(2.5, 4.5, 7.5, 4.5));
  check('flat: walkLine equals lineOfSight', nav.walkLine(2.5, 4.5, 4.5, 4.5) === nav.lineOfSight(2.5, 4.5, 4.5, 4.5));
  const pos = new THREE.Vector3(4.6, 0, 4.5);
  check('flat: resolveMove equals resolveCircle', nav.resolveMove(pos, 4.5, 4.5, 0.3, 0) === false && near(pos.x, 4.6));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
