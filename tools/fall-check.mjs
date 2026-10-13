#!/usr/bin/env node
/**
 * Headless fall check (ENGINE_VERTICALITY §11, package V7). No browser, no dev server, no three.js.
 *
 *   node tools/fall-check.mjs
 *
 * Asserts, on synthetic flag grids (no DungeonDef needed):
 *   - safe history: a walk across a 10 m void strip only records samples on safe ground (no void/ledge within
 *     SAFE_EDGE_PAD), keeps SAFE_HIST_SEC of history, and pickSpot returns the newest sample at least SAFE_BACK_SEC old
 *     (or the checkpoint when none is that old)
 *   - void trigger: stepping off a rim at y = 5 into a pit triggers once, only once y < rim - VOID_KILL_BELOW, never while
 *     grounded or on safe ground; the respawn is due only after VOID_FADE_OUT
 *   - drop-damage table: landing class and non-lethal hard damage for drops 0..20 m at 200 max HP, void damage 25 %
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

const { F, VERT } = await imp('src/world/Heightfield.ts');
const { FallHandler, isSafeSpot, VOID_FADE_OUT } = await imp('src/game/FallHandler.ts');

let failures = 0;
const eq = (name, got, want, tol = 1e-9) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${typeof got === 'number' ? +got.toFixed(4) : got} want=${want}`);
};
const ok = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// ---- synthetic grid: a void strip for x in [10, 20), everything else safe floor -----------------------------------------
const VOID_X0 = 10, VOID_X1 = 20;
const flagsStrip = (x, z) => (x >= VOID_X0 && x < VOID_X1 ? F.VOID : 0) | (z > 100 ? F.LIFT : 0);
const noKill = () => Number.NEGATIVE_INFINITY;

// 1. safe history across the strip -------------------------------------------------------------------------------------
{
  const fh = new FallHandler();
  const dt = 1 / 60, speed = 2;
  let x = 0, t = 0;
  let maxHist = 0;
  let voidTriggers = 0;
  for (let i = 0; i < 8 * 60; i++) {
    x += speed * dt;
    t += dt;
    const fired = fh.tick(t, dt, { x, y: 0, z: 0, grounded: true }, { flagsAt: flagsStrip, killY: noKill });
    if (fired) voidTriggers++;
    maxHist = Math.max(maxHist, fh.history().length);
  }
  const hist = fh.history();
  eq('walk on safe ground never triggers a void fall', voidTriggers, 0);
  ok('safe history is non-empty before the strip', hist.some((s) => s.x < VOID_X0 - VERT.SAFE_EDGE_PAD));
  const bad = hist.filter((s) => s.x > VOID_X0 - VERT.SAFE_EDGE_PAD - 0.01 && s.x < VOID_X1 + VERT.SAFE_EDGE_PAD + 0.01);
  eq('no sample within SAFE_EDGE_PAD of the void (count)', bad.length, 0);
  ok('history bounded by SAFE_HIST_SEC', maxHist <= Math.round(VERT.SAFE_HIST_SEC / 0.1) + 2, `max=${maxHist}`);
  ok('isSafeSpot rejects the rim cell itself', !isSafeSpot(VOID_X0, 0, flagsStrip));
  ok('isSafeSpot accepts 4 m from the strip', isSafeSpot(VOID_X0 - 4, 0, flagsStrip));
  ok('isSafeSpot rejects a LIFT cell', !isSafeSpot(3, 101, flagsStrip));
  // respawn: newest sample at least SAFE_BACK_SEC old
  const spot = fh.pickSpot(t, { x: -99, z: -99, yaw: 0 });
  ok('pickSpot returns a recorded safe sample', !!spot && hist.some((s) => s.x === spot.x && s.z === spot.z));
  if (spot) {
    const src = hist.filter((s) => s.x === spot.x && s.z === spot.z).pop();
    ok('pickSpot sample is at least SAFE_BACK_SEC old', t - src.t >= VERT.SAFE_BACK_SEC - 1e-9, `age=${(t - src.t).toFixed(3)}`);
    const newer = hist.filter((s) => t - s.t >= VERT.SAFE_BACK_SEC && s.t > src.t);
    eq('pickSpot is the newest such sample', newer.length, 0);
    ok('respawn spot is on safe ground', isSafeSpot(spot.x, spot.z, flagsStrip));
  }
}

// 2. respawn fallbacks ------------------------------------------------------------------------------------------------
{
  const fh = new FallHandler();
  const cp = { x: 1, z: 2, yaw: 0.5 };
  eq('empty history -> checkpoint', fh.pickSpot(10, cp) === cp ? 1 : 0, 1);
  eq('empty history, no checkpoint -> null', fh.pickSpot(10, null) === null ? 1 : 0, 1);
  // only fresh samples (younger than SAFE_BACK_SEC) -> checkpoint
  let t = 0;
  for (let i = 0; i < 3; i++) { t += 0.1; fh.tick(t, 0.1, { x: 0, y: 0, z: 0, grounded: true }, { flagsAt: () => 0, killY: noKill }); }
  eq('only fresh samples -> checkpoint', fh.pickSpot(t, cp) === cp ? 1 : 0, 1);
}

// 3. void trigger: step off a rim at y = 5 into a pit ---------------------------------------------------------------
{
  const fh = new FallHandler();
  const RIM = 5, PIT = -10, G = 28.5, dt = 1 / 60;
  const env = { flagsAt: flagsStrip, killY: (x, z) => (flagsStrip(x, z) & F.VOID ? -20 : -Infinity) };
  let t = 0;
  // stand on the rim for 2 s (grounded, safe) so rimY = 5
  for (let i = 0; i < 120; i++) { t += dt; fh.tick(t, dt, { x: 5, y: RIM, z: 0, grounded: true }, env); }
  // walk off into the pit: grounded=false, free fall from the rim height
  let y = RIM, vy = 0, fired = 0, firedAtY = NaN, firedFrames = 0;
  let firstTriggerFrame = -1;
  for (let i = 0; i < 240 && y > PIT; i++) {
    t += dt;
    vy -= G * dt;
    y += vy * dt;
    const f = fh.tick(t, dt, { x: 12, y, z: 0, grounded: false }, env);
    if (f) { fired++; firedAtY = y; firstTriggerFrame = i; fh.startVoid(t, null); }
    if (fh.isPending) firedFrames++;
  }
  eq('one trigger while falling', fired, 1);
  ok('trigger only below rim - VOID_KILL_BELOW', firedAtY < RIM - VERT.VOID_KILL_BELOW && firedAtY >= RIM - VERT.VOID_KILL_BELOW - 1, `y=${firedAtY.toFixed(3)}`);
  ok('trigger happened before the bottom', firstTriggerFrame >= 0 && firedAtY > PIT);
  ok('pending void fall after the trigger', fh.isPending);
  eq('no second trigger while pending', fired, 1);
  // fade timing: due only once VOID_FADE_OUT has passed since startVoid
  const fh2 = new FallHandler();
  eq('startVoid returns true once', fh2.startVoid(1, null) ? 1 : 0, 1);
  eq('startVoid while pending returns false', fh2.startVoid(1.1, null) ? 1 : 0, 0);
  eq('due before fade end is null', fh2.due(1 + VOID_FADE_OUT - 0.01) === null ? 1 : 0, 1);
  ok('due after fade end', fh2.due(1 + VOID_FADE_OUT + 1e-6) !== null);
  eq('due is one-shot', fh2.due(10) === null ? 1 : 0, 1);
  // a grounded walker on the rim never triggers, even at the pit edge
  const fh3 = new FallHandler();
  let anyFire = false;
  for (let i = 0; i < 60; i++) if (fh3.tick(i * dt, dt, { x: 9.5, y: RIM, z: 0, grounded: true }, env)) anyFire = true;
  ok('standing on the rim never triggers', !anyFire);
}

// 4. drop-damage table (200 max HP) -------------------------------------------------------------------------------------
{
  const MAX = 200;
  const rows = [
    // [drop, kind, damage]
    [0, 'free', 0],
    [3, 'free', 0],
    [4, 'free', 0],
    [4.5, 'hard', 3],
    [6, 'hard', 12],
    [8, 'hard', 24],
    [11.9, 'hard', 47.4],
    [12, 'hard', 48],
    [12.5, 'void', 0],
    [20, 'void', 0],
  ];
  for (const [drop, kind, dmg] of rows) {
    const k = FallHandler.classifyLanding(drop);
    eq(`drop ${drop} m classified`, k, kind);
    if (kind === 'hard') eq(`drop ${drop} m hard damage`, FallHandler.hardDamage(drop, MAX), dmg, 1e-6);
    if (kind === 'free') eq(`drop ${drop} m no damage`, FallHandler.hardDamage(drop, MAX), 0);
  }
  eq('hard damage capped at 24 % (drop 40 m)', FallHandler.hardDamage(40, MAX), 48, 1e-6);
  eq('void damage = 25 % max HP', FallHandler.voidDamage(MAX), 50, 1e-9);
  const fh = new FallHandler();
  eq('onLand agrees with classifyLanding (drop 6)', fh.onLand(6), 'hard');
}

console.log(failures === 0 ? '\nfall-check: all passed' : `\nfall-check: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
