#!/usr/bin/env node
/**
 * Headless lift check (ENGINE_VERTICALITY §9, package V5). No browser, no dev server, no three.js.
 *
 *   node tools/lift-check.mjs
 *
 * Asserts, on a hand-made 8x8 vertical dungeon with a call lift (A) and a script lift (S):
 *   - liftTravel: trapezoid profile (start/end, ramp value, midpoint, monotone, peak speed, zero-length trip)
 *   - call mode: no departure while the pad is empty; departs after 0.6 s of standing; the ride is monotone and
 *     arrives after the trip time; groundY on the pad follows the platform; dwell blocks an early second departure
 *   - script mode: `go` departs on the authority only; the lift reaches its stop; the peer ignores `go`
 *   - message round trip: a peer fed the broadcast stream with 100 ms delivery latency stays within 150 ms of the
 *     authority; a late joiner (t = 6 s) agrees within the same budget after its first state message
 *
 * Exit code 1 on any failure. Needs Node >= 22.18 (native TypeScript type stripping).
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./Heightfield") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(x){if(suf==='/index.ts')throw e}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);

const { buildHeightfield, VERT } = await imp('src/world/Heightfield.ts');
const { LiftSystem, liftTravel } = await imp('src/world/Lifts.ts');

let pass = 0;
const fails = [];
function check(label, ok, detail = '') {
  if (ok) pass++;
  else fails.push(`${label}${detail ? ` (${detail})` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  -> ${detail}` : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DT = 1 / 60;
const LATENCY = 0.1;
const BUDGET = VERT.LIFT_SPEED * 0.15; // 150 ms of ride error, in metres

// ---- 1. travel profile: speed 2.5 m/s over 6 m => cruise 2.4 s, ramps 0.35 s each end, total 2.75 s ----
{
  const speed = 2.5, dist = 6;
  const T = liftTravel(dist, speed, 0).total;
  check('travel total = cruise + ramp', near(T, 2.4 + 0.35), `total=${T}`);
  check('travel starts at 0', liftTravel(dist, speed, 0).s === 0);
  check('travel ends at dist', liftTravel(dist, speed, T + 1).s === dist);
  check('travel at ramp end = speed * ramp / 2', near(liftTravel(dist, speed, 0.35).s, speed * 0.35 / 2), `s=${liftTravel(dist, speed, 0.35).s}`);
  check('travel midpoint is half the distance', near(liftTravel(dist, speed, T / 2).s, dist / 2), `s=${liftTravel(dist, speed, T / 2).s}`);
  let monotone = true, maxV = 0, prev = 0;
  for (let k = 1; k <= 2750; k++) {
    const s = liftTravel(dist, speed, k / 1000).s;
    if (s + 1e-9 < prev) monotone = false;
    maxV = Math.max(maxV, (s - prev) / 0.001);
    prev = s;
  }
  check('travel is monotone', monotone);
  check('travel peak speed <= LIFT_SPEED', maxV <= speed + 0.01, `maxV=${maxV.toFixed(3)}`);
  check('zero-length trip is instant', liftTravel(0, speed, 0).s === 0 && liftTravel(0, speed, 0.1).s === 0);
}

const def = {
  id: 'lift_check',
  vertical: true,
  grid: { w: 8, h: 8 },
  rooms: [{ id: 'hall', floorY: 0, ceiling: 8 }],
  lifts: [
    { id: 'A', roomId: 'hall', rect: { x: 1, z: 1, w: 2, h: 2 }, stops: [0, 6], speed: 2.5, dwell: 4, mode: 'call' },
    { id: 'S', roomId: 'hall', rect: { x: 5, z: 5, w: 2, h: 2 }, stops: [0, 4, 8], speed: 2, dwell: 1, mode: 'script' },
  ],
};
const flatTile = () => 0;
const hf0 = buildHeightfield(def, flatTile);
const lA = hf0.lifts[0];
const cxA = (lA.x0 + lA.x1) / 2, czA = (lA.z0 + lA.z1) / 2;
check('heightfield built with two lifts', hf0 !== null && hf0.lifts.length === 2);
check('lift A starts at stop 0', lA.y === 0 && lA.stopIdx === 0);

/** Authority/peer host on a fake clock; broadcasts are pushed to `sink` with the send time. */
function makeHost(clock, { auth, players, sink }) {
  return {
    isAuthority: () => auth,
    players: () => players(),
    broadcast: (key) => sink.push({ t: clock.t, key }),
    now: () => clock.t,
  };
}

// ---- 2. call mode on the authority ----
{
  const clock = { t: 0 };
  const sink = [];
  const rider = { x: -100, y: 0, z: -100 }; // off the pad
  const hfC = buildHeightfield(def, flatTile);
  const sys = new LiftSystem(hfC, makeHost(clock, { auth: true, players: () => [rider], sink }));
  for (let k = 0; k < 120; k++) { clock.t += DT; sys.update(DT); }
  check('call: no departure with an empty pad', !sink.some((m) => m.key.startsWith('lift:A:0:1:')));

  // step on: the lift must depart after standing 0.6 s
  rider.x = cxA; rider.z = czA; rider.y = 0;
  const tStand = clock.t;
  let tDep = -1;
  for (let k = 0; k < 600 && tDep < 0; k++) {
    clock.t += DT;
    rider.y = sys.yOf('A');
    sys.update(DT);
    if (sink.some((m) => m.key.startsWith('lift:A:0:1:'))) tDep = clock.t;
  }
  const standTime = tDep - tStand;
  check('call: departs after standing 0.6 s (one frame of slack)', tDep > 0 && standTime >= 0.6 - 1e-6 && standTime <= 0.6 + 2 * DT, `stand=${standTime.toFixed(3)}`);

  // ride: y rises monotonically to 6 m, midpoint near 3 m at 1.375 s, arrival after the 2.75 s trip
  let yPrev = 0, mono = true, yMid = null, tArr = -1;
  for (let k = 0; k < 600 && tArr < 0; k++) {
    clock.t += DT;
    rider.y = sys.yOf('A');
    sys.update(DT);
    const y = sys.yOf('A');
    if (y + 1e-9 < yPrev) mono = false;
    yPrev = y;
    if (yMid === null && clock.t - tDep >= 1.375) yMid = y;
    if (y >= 6 - 1e-9) tArr = clock.t;
  }
  // the position reaches 6 m a frame before the trip is closed; let the arrival frame run
  for (let k = 0; k < 3; k++) { clock.t += DT; rider.y = sys.yOf('A'); sys.update(DT); }
  check('call: ride is monotone', mono);
  check('call: midpoint of the trip near 3 m', yMid !== null && Math.abs(yMid - 3) < 0.05, `y=${yMid}`);
  check('call: arrives after the 2.75 s trip', tArr > 0 && Math.abs(tArr - tDep - 2.75) <= 2 * DT, `trip=${(tArr - tDep).toFixed(3)}`);
  check('call: groundY on the pad follows the lift', near(hfC.groundY(cxA, czA), 6), `groundY=${hfC.groundY(cxA, czA)}`);
  check('call: arrival broadcast idles at stop 1', sink.some((m) => m.key === 'lift:A:1:1:0.000'));

  // stale rider: the rider stood on the pad when the lift arrived, so it departs 3 s after the arrival (not at the old 4 s dwell)
  const tArrSent = sink.find((m) => m.key === 'lift:A:1:1:0.000').t;
  let tNext = -1;
  for (let k = 0; k < 900 && tNext < 0; k++) {
    clock.t += DT;
    rider.y = sys.yOf('A');
    sys.update(DT);
    if (sink.some((m) => m.key.startsWith('lift:A:1:0:'))) tNext = clock.t;
  }
  const waited = tNext - tArrSent;
  check('call: a rider who stays on the pad after arrival never sends the lift back', tNext < 0, `tNext=${tNext} waited=${waited.toFixed(3)}`);
  check('yOf unknown id returns 0', sys.yOf('nope') === 0);
}

// ---- 2b. call mode after arrival: step off and back on = fresh rider (0.6 s stand); leaving for good = no departure ----
{
  const clock = { t: 0 };
  const sink = [];
  const rider = { x: cxA, y: 0, z: czA };
  const hfB = buildHeightfield(def, flatTile);
  const sysB = new LiftSystem(hfB, makeHost(clock, { auth: true, players: () => [rider], sink }));
  const frame = () => { clock.t += DT; rider.y = sysB.yOf('A'); sysB.update(DT); };
  const runUntil = (pred, maxSec) => { for (let k = 0; k < maxSec / DT && !pred(); k++) frame(); return pred(); };
  const arrived = () => sink.some((m) => m.key === 'lift:A:1:1:0.000');
  check('call (fresh rider): rides up from the start', runUntil(arrived, 10));
  // step off right after the arrival, step back on 1 s later
  rider.x = -100;
  for (let k = 0; k < 60; k++) frame();
  rider.x = cxA; rider.z = czA;
  const tOn = clock.t;
  check('call: re-entry departs after the normal 0.6 s stand', runUntil(() => sink.some((m) => m.key.startsWith('lift:A:1:0:')), 4)
    && Math.abs(sink.find((m) => m.key.startsWith('lift:A:1:0:')).t - tOn - 0.6) <= 2 * DT,
    `dep-on=${(sink.find((m) => m.key.startsWith('lift:A:1:0:'))?.t - tOn).toFixed(3)}`);
}

// ---- 2c. call mode: a rider who leaves after the arrival and never comes back does not trigger a departure ----
{
  const clock = { t: 0 };
  const sink = [];
  const rider = { x: cxA, y: 0, z: czA };
  const hfC2 = buildHeightfield(def, flatTile);
  const sysC = new LiftSystem(hfC2, makeHost(clock, { auth: true, players: () => [rider], sink }));
  const frame = () => { clock.t += DT; rider.y = sysC.yOf('A'); sysC.update(DT); };
  for (let k = 0; k < 60 * 10 && !sink.some((m) => m.key === 'lift:A:1:1:0.000'); k++) frame();
  rider.x = -100;
  const tLeft = clock.t;
  for (let k = 0; k < 60 * 6; k++) frame();
  check('call: a rider who left the pad after arrival does not trigger a departure', !sink.some((m) => m.key.startsWith('lift:A:1:0:') && m.t > tLeft),
    `departures after leave=${sink.filter((m) => m.key.startsWith('lift:A:1:0:') && m.t > tLeft).length}`);
}

// ---- 3. script mode: go is applied by the authority only ----
{
  const clock = { t: 0 };
  const sinkH = [];
  const hfH = buildHeightfield(def, flatTile);
  const sysH = new LiftSystem(hfH, makeHost(clock, { auth: true, players: () => [], sink: sinkH }));
  sysH.handleMessage('lift:S:go:2');
  check('script: go departs to stop 2 (broadcast)', sinkH.some((m) => m.key === 'lift:S:0:2:0.000'));
  for (let k = 0; k < 60 * 6; k++) { clock.t += DT; sysH.update(DT); }
  check('script: lift S reached 8 m', near(sysH.yOf('S'), 8, 1e-6), `y=${sysH.yOf('S')}`);
  check('script: no self departure after arrival', !sinkH.some((m) => m.key.startsWith('lift:S:2:') && !m.key.startsWith('lift:S:2:2:')));
  check('script: groundY at the S pad follows the lift', near(hfH.groundY((hfH.lifts[1].x0 + hfH.lifts[1].x1) / 2, (hfH.lifts[1].z0 + hfH.lifts[1].z1) / 2), 8));

  const sinkP = [];
  const sysP = new LiftSystem(buildHeightfield(def, flatTile), makeHost(clock, { auth: false, players: () => [], sink: sinkP }));
  sysP.handleMessage('lift:S:go:1');
  for (let k = 0; k < 60 * 6; k++) { clock.t += DT; sysP.update(DT); }
  check('peer: go is ignored and nothing is sent', sysP.yOf('S') === 0 && sinkP.length === 0);
}

// ---- 4. message round trip: authority -> peer and late joiner, 100 ms latency ----
{
  const clock = { t: 0 };
  const wire = []; // {deliverAt, key}
  const LATE_JOIN_T = 6;
  const hfAuth = buildHeightfield(def, flatTile);
  const sysAuth = new LiftSystem(hfAuth, {
    isAuthority: () => true,
    // the rider steps off between 4 and 5 s and back on, so the call-mode lift departs again (a rider who just stays never re-sends it)
    players: () => (clock.t > 4 && clock.t < 5 ? [] : [{ x: cxA, y: sysAuth.yOf('A'), z: czA }]),
    broadcast: (key) => wire.push({ deliverAt: clock.t + LATENCY, key }),
    now: () => clock.t,
  });
  let peerSent = false;
  const peerHost = { isAuthority: () => false, players: () => [], broadcast: () => { peerSent = true; }, now: () => clock.t };
  const sysPeer = new LiftSystem(buildHeightfield(def, flatTile), peerHost);
  let sysLate = null, lateReady = false, lateWorst = 0;
  let peerWorst = 0, peerMoved = false;
  while (clock.t < 12) {
    clock.t += DT;
    sysAuth.update(DT);
    if (sysLate === null && clock.t >= LATE_JOIN_T) sysLate = new LiftSystem(buildHeightfield(def, flatTile), peerHost);
    // deliver messages whose latency has elapsed, in send order; the late joiner only sees messages sent after it joined
    while (wire.length && wire[0].deliverAt <= clock.t + 1e-9) {
      const msg = wire.shift();
      sysPeer.handleMessage(msg.key);
      if (sysLate !== null && msg.deliverAt > LATE_JOIN_T) {
        sysLate.handleMessage(msg.key);
        const parts = msg.key.split(':');
        if (parts[0] === 'lift' && parts[1] === 'A' && parts[2] !== parts[3]) lateReady = true;
      }
    }
    sysPeer.update(DT);
    if (sysLate !== null) {
      sysLate.update(DT);
      if (lateReady) lateWorst = Math.max(lateWorst, Math.abs(sysLate.yOf('A') - sysAuth.yOf('A')));
    }
    if (sysPeer.yOf('A') !== 0) peerMoved = true;
    if (clock.t > 0.5) peerWorst = Math.max(peerWorst, Math.abs(sysPeer.yOf('A') - sysAuth.yOf('A')));
  }
  check('peer: follows the broadcast stream', peerMoved);
  check('peer: sends nothing (never departs by itself)', !peerSent);
  check('round trip: peer within 150 ms of authority', peerWorst <= BUDGET + 0.02, `worst=${peerWorst.toFixed(3)} m`);
  check('late joiner (t = 6 s) within 150 ms after its first state message', lateReady && lateWorst <= BUDGET + 0.02, `worst=${lateWorst.toFixed(3)} m ready=${lateReady}`);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
