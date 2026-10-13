#!/usr/bin/env node
/**
 * Smoke check for K12 (P-39 boss side, P-40 boss side, P-41): the boss move bridge in src/ai/bosses/moveBridge.ts.
 *
 *   node tools/smoke/boss_moves.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads moveBridge.ts directly (Node type stripping, Node >= 22.18). The bridge only imports types, so no game
 * modules load. A fake BossController with a manual clock stands in for the real one. No browser, no dev server.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const bridge = await import(pathToFileURL(root + 'src/ai/bosses/moveBridge.ts').href);
const { bossString, bossHold, bossLeap, bossBreak, bossMovesActive, bossMovesReset, setMoveBridgeHost } = bridge;

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** Fake BossController: manual clock, timers run in order, shapes are recorded with their spawn time. */
function makeBoss() {
  const cancelled = [];
  const c = {
    now: 0,
    hold: false,
    timers: [],
    shapes: [],
    script: { onBreak: () => { c.breaks = (c.breaks ?? 0) + 1; } },
    e: { position: { x: 0, z: 0 }, yaw: 0, forcedMove: null },
    target: { position: { x: 3, z: 0 }, isDead: false },
    breaks: 0,
    cancelled,
    shape(o) {
      const id = this.shapes.length + 1;
      this.shapes.push({ id, at: this.now, ...o });
      return id;
    },
    schedule(delay, fn, tag = '') { this.timers.push({ at: this.now + delay, fn, tag }); },
    cancelTimers(tag) { this.timers = tag ? this.timers.filter((t) => t.tag !== tag) : []; },
    /** Runs timers due up to `until` in time order, each at its exact due time. */
    runTo(until) {
      for (;;) {
        let next = null;
        for (const t of this.timers) if (t.at <= until && (!next || t.at < next.at)) next = t;
        if (!next) break;
        this.timers.splice(this.timers.indexOf(next), 1);
        this.now = Math.max(this.now, next.at);
        next.fn();
      }
      this.now = until;
    },
  };
  return c;
}

setMoveBridgeHost({ cancelShape: (id) => { cancelledIds.push(id); } });
let cancelledIds = [];

const threeSteps = [
  { coef: 1.0, range: 3, arc: 90 },
  { coef: 1.0, range: 3, arc: 90 },
  { coef: 1.0, range: 3, arc: 90 },
];

// 1. A 3-step string: shapes at 0, 0.95, 1.62 with delays 0.70, 0.42, 0.42 (windupFor / followWindupFor + 0.25 gap); ends at 2.04.
{
  cancelledIds = [];
  const c = makeBoss();
  const h = bossString(c, threeSteps, { target: c.target });
  expect(h !== null, 'string: returned null for 3 steps');
  expect(c.shapes.length === 1, `string: strike 0 should spawn at call time, got ${c.shapes.length}`);
  expect(bossMovesActive(c), 'string: should be active right after the call');
  c.runTo(3);
  expect(c.shapes.length === 3, `string: expected 3 shapes, got ${c.shapes.length}`);
  const [s0, s1, s2] = c.shapes;
  expect(near(s0?.at, 0), `string: strike 0 spawn time ${s0?.at}, want 0`);
  expect(near(s1?.at, 0.95), `string: strike 1 spawn time ${s1?.at}, want 0.95`);
  expect(near(s2?.at, 1.62), `string: strike 2 spawn time ${s2?.at}, want 1.62`);
  expect(near(s0?.delay, 0.7) && near(s1?.delay, 0.42) && near(s2?.delay, 0.42), `string: delays ${s0?.delay}, ${s1?.delay}, ${s2?.delay}`);
  expect(s0?.shape?.type === 'cone' && s0?.shape?.radius === 3 && s0?.shape?.angle === 90, 'string: strike shape should be cone(range, arc)');
  expect(s0?.telegraph === true, 'string: strike shapes should carry the telegraph');
  c.runTo(2.5);
  expect(!bossMovesActive(c), 'string: should be finished by 2.5 s');
  expect(cancelledIds.length === 0, `string: clean run cancelled shapes ${cancelledIds}`);
}

// 2. Poise break during strike 0's windup: the rest of the string is cancelled, strike 0's shape is retracted, onBreak runs once.
{
  cancelledIds = [];
  const c = makeBoss();
  bossString(c, threeSteps, { target: c.target });
  c.runTo(0.5);
  const first = bossBreak(c);
  const second = bossBreak(c);
  c.runTo(3);
  expect(first === true && second === false, `break: onBreak return values ${first}, ${second}`);
  expect(c.breaks === 1, `break: onBreak ran ${c.breaks} times, want 1`);
  expect(c.shapes.length === 1, `break: only strike 0 should exist, got ${c.shapes.length} shapes`);
  expect(cancelledIds.length === 1 && cancelledIds[0] === 1, `break: retracted shapes ${cancelledIds}, want [1]`);
  expect(!bossMovesActive(c), 'break: string should be inactive after the break');
}

// 3. Poise break after strike 1 spawned: strike 2 never spawns, strikes 1 and 2 are retracted.
{
  cancelledIds = [];
  const c = makeBoss();
  bossString(c, threeSteps, { target: c.target });
  c.runTo(1.2);
  bossBreak(c);
  c.runTo(3);
  expect(c.shapes.length === 2, `late break: expected 2 shapes, got ${c.shapes.length}`);
  expect(cancelledIds.slice().sort().join() === '1,2', `late break: retracted ${cancelledIds}, want 1,2`);
}

// 4. cancelOnBreak: false keeps the string going through a break.
{
  cancelledIds = [];
  const c = makeBoss();
  bossString(c, threeSteps, { target: c.target, cancelOnBreak: false });
  c.runTo(0.5);
  bossBreak(c);
  c.runTo(3);
  expect(c.shapes.length === 3, `no-cancel: expected 3 shapes, got ${c.shapes.length}`);
  expect(cancelledIds.length === 0, `no-cancel: nothing should be retracted, got ${cancelledIds}`);
}

// 5. A hold longer than the cap is clamped to 0.6 s (GDD 3.2), added to strike 0's windup.
{
  const c = makeBoss();
  bossString(c, [threeSteps[0]], { target: c.target, hold: [0.9, 0.9], rng: () => 0.5 });
  expect(near(c.shapes[0].delay, 0.7 + 0.6), `hold cap: strike 0 delay ${c.shapes[0].delay}, want 1.3`);
}

// 6. Standalone hold: sets the hold flag, restores it on normal end, calls `then`; a break cancels it without `then`.
{
  const c = makeBoss();
  let thenCalls = 0;
  const sec = bossHold(c, [0.2, 0.4], { rng: () => 0.5, then: () => { thenCalls += 1; } });
  expect(near(sec, 0.3), `hold: drew ${sec}, want 0.3`);
  expect(c.hold === true, 'hold: flag should be set during the hold');
  c.runTo(0.31);
  expect(c.hold === false && thenCalls === 1, `hold: after end hold=${c.hold}, then=${thenCalls}`);

  const d = makeBoss();
  let thenD = 0;
  bossHold(d, 1.0, { then: () => { thenD += 1; } });
  d.runTo(0.2);
  bossBreak(d);
  d.runTo(2);
  expect(d.hold === false && thenD === 0, `hold break: hold=${d.hold}, then=${thenD}`);
}

// 7. Leap: forced movement toward the target, landing circle delayed by the airtime; a break stops both.
{
  const c = makeBoss();
  const land = bossLeap(c, { target: c.target, airtime: 0.6, radius: 2, coef: 1.2, min: 0, max: 2 });
  expect(near(land.x, 2) && near(land.z, 0), `leap: landing (${land.x}, ${land.z}), want (2, 0) after the max clamp`);
  expect(c.e.forcedMove !== null && c.e.forcedMove.vx > 0, 'leap: forced movement not set');
  expect(c.shapes.length === 1 && near(c.shapes[0].delay, 0.6) && c.shapes[0].shape.type === 'circle', 'leap: landing circle missing or wrong delay');
  c.runTo(0.2);
  bossBreak(c);
  expect(c.e.forcedMove === null, 'leap: break should clear forced movement');
  expect(cancelledIds.includes(c.shapes[0].id), 'leap: break should retract the landing circle');
}

// 8. onBreak with once: runs at most once per fight, even across windows.
{
  const c = makeBoss();
  bossBreak(c, { once: true });
  c.runTo(10);
  bossBreak(c, { once: true });
  expect(c.breaks === 1, `once: onBreak ran ${c.breaks} times, want 1`);
}

// 9. Reset cancels live runs and restores the hold flag.
{
  cancelledIds = [];
  const c = makeBoss();
  bossString(c, threeSteps, { target: c.target });
  bossHold(c, 5);
  c.runTo(0.3);
  bossMovesReset(c);
  c.runTo(10);
  expect(!bossMovesActive(c) && c.shapes.length === 1 && c.hold === false, 'reset: runs should end, no new shapes, hold restored');
}

if (failures.length > 0) {
  for (const f of failures) console.error('FAIL', f);
  console.error(`boss_moves: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('boss_moves: ok (string timing, break cancel, onBreak once, hold cap, leap, reset)');
