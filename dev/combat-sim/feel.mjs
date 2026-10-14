// WoW feel checks (pure logic, no browser): jump arc, turn rate and frame-rate independence, ability targeting kind.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/feel.mjs
// Targets (retail WoW, yards = metres here): jump apex ~1.6 m, airtime ~0.55-0.6 s; keyboard turn ~178 deg/s (3.1 rad/s);
// turning is frame-rate independent (30 / 60 / 144 fps give the same heading after 1 s).
import * as H from './harness.mjs';

const { turnToward, offensiveKind, WOW_JUMP_V, WOW_GRAVITY } = await H.imp('game/PlayerController.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`);
  if (!cond) fails++;
};
const near = (v, lo, hi) => v >= lo && v <= hi;

// ---- jump arc (WoW constants used by the WoW scheme) ----
const apex = (WOW_JUMP_V * WOW_JUMP_V) / (2 * WOW_GRAVITY);
const airtime = (2 * WOW_JUMP_V) / WOW_GRAVITY;
ok('jump apex ~1.6 m', near(apex, 1.5, 1.7), `apex ${apex.toFixed(3)} m`);
ok('jump airtime 0.55-0.6 s', near(airtime, 0.55, 0.6), `airtime ${airtime.toFixed(3)} s`);

// integrate the arc at several frame rates: apex and airtime must not depend on dt
for (const fps of [30, 60, 144]) {
  const dt = 1 / fps;
  // the same step as PlayerController.stepVertical (trapezoidal, WoW): vy -= g dt; y += (vPrev + vy) / 2 dt
  let v = WOW_JUMP_V, y = 0, t = 0, top = 0;
  while (y >= 0 && t < 5) {
    const vPrev = v;
    v -= WOW_GRAVITY * dt;
    y += 0.5 * (vPrev + v) * dt;
    t += dt;
    if (y > top) top = y;
  }
  ok(`jump integrated at ${fps} fps: apex and airtime match analytic`, Math.abs(top - apex) < 0.06 && Math.abs(t - airtime) < 0.04,
    `apex ${top.toFixed(3)} airtime ${t.toFixed(3)}`);
}

// ---- turn rate (keyboard turn, saturated) and frame-rate independence ----
const TURN_MAX = 3.1; // rad/s, WoW_TURN_RATE
const turnAfter = (fps, seconds = 1) => {
  const dt = 1 / fps;
  let yaw = 0;
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps; i++) yaw = turnToward(yaw, Math.PI, 40, TURN_MAX, dt);
  return yaw;
};
// rate-limited window: a 179 deg target keeps the error above one frame of max rate for the first 0.5 s, so the turn is saturated
const rateAt = (fps) => {
  const dt = 1 / fps;
  let yaw = 0;
  for (let i = 0; i < Math.round(0.5 * fps); i++) yaw = turnToward(yaw, Math.PI - 0.001, 40, TURN_MAX, dt);
  return yaw / 0.5;
};
const r60 = rateAt(60);
ok('keyboard turn rate ~178 deg/s (3.1 rad/s, saturated)', Math.abs(r60 - TURN_MAX) < 0.02 * TURN_MAX,
  `${(r60 * 180 / Math.PI).toFixed(1)} deg/s`);
for (const fps of [30, 144]) {
  const r = rateAt(fps);
  ok(`turn rate identical at ${fps} fps vs 60 fps`, Math.abs(r - r60) < 0.01 * TURN_MAX, `${(r * 180 / Math.PI).toFixed(1)} deg/s`);
}
const y60 = turnAfter(60);
ok('turn settles on target after 1 s at 60 fps', Math.cos(y60) < -0.98, `${(y60 * 180 / Math.PI).toFixed(1)} deg`);

// ---- ability targeting kind (facing / range errors and auto-acquire apply only to offensive abilities) ----
const def = (o) => ({ tags: [], ...o });
ok('melee_arc damage ability is melee', offensiveKind(def({ targeting: 'melee_arc', damage: 10 })) === 'melee');
ok('target_instant with melee tag is melee', offensiveKind(def({ targeting: 'target_instant', damage: 5, tags: ['melee'] })) === 'melee');
ok('projectile damage ability is ranged', offensiveKind(def({ targeting: 'projectile', damage: 10 })) === 'ranged');
ok('heal is not offensive', offensiveKind(def({ targeting: 'target_instant', heal: 20 })) === null);
ok('ally-targeted damage is not offensive', offensiveKind(def({ targeting: 'target_instant', damage: 5, allyTarget: 'friendly' })) === null);
ok('self buff (no damage, no status) is not offensive', offensiveKind(def({ targeting: 'self' })) === null);
ok('dash with damage but no offensive targeting is not offensive', offensiveKind(def({ targeting: 'dash', damage: 5 })) === null);

console.log(fails === 0 ? '\nfeel: ALL PASS' : `\nfeel: ${fails} FAILED`);
process.exitCode = fails === 0 ? 0 : 1;
