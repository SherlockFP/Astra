#!/usr/bin/env node
/**
 * K10 smoke: boss patterns (P-32 intermission, P-33 rotating and moving beams, P-34 soak and marks).
 *
 *   node tools/smoke/boss_patterns.mjs
 *
 * A fixture boss runs 60 simulated seconds (20 Hz) through src/ai/bosses/patterns.ts. The fixture controller records every
 * shape() call with its simulated time, so the checks read the schedule: soak slots resolve on time, marks expire on time,
 * the sweep reverses at the right angle, the moving band lands piece by piece, and the intermission ends by maxSeconds.
 * Node strips the TypeScript types (patterns.ts has no runtime imports). HitShapes itself needs the game, so the spin and
 * scaleTo runtime are verified in the game, not here. Exit 1 when a check fails.
 */
import { soak, markPlayers, rotatingBeams, movingBand, intermission, updatePatterns, intermissionActive } from '../../src/ai/bosses/patterns.ts';

const DT = 1 / 20;
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps;

// ---- fixture ----------------------------------------------------------------------------------------------------------
let now = 0;
const shapes = [];
const events = { immune: [], freeze: 0, endPhase: 0, teleports: 0, expired: [], waves: 0 };
const adds = [];
const players = [
  { id: 11, position: { x: 2, z: 0 }, radius: 0.4, isDead: false, removed: false, isLocal: false },
  { id: 12, position: { x: 14, z: 6 }, radius: 0.4, isDead: false, removed: false, isLocal: false },
];
let nextId = 1;

const c = {
  e: { id: 1, position: { x: 0, z: 0 }, isDead: false },
  state: {},
  arena: { cx: 0, cz: 0, w: 40, h: 40, r: 20 },
  phaseLocked: false,
  shape(o) {
    shapes.push({ t: now, o: { ...o } });
    return nextId++;
  },
  playersInArena() {
    return players.filter((p) => !p.isDead && !p.removed);
  },
  setImmune(on) {
    events.immune.push({ t: now, on });
  },
  freeze(on) {
    if (on) events.freeze++;
  },
  teleport() {
    events.teleports++;
  },
  endMechanicPhase() {
    events.endPhase++;
    c.phaseLocked = false;
  },
  adds(tag) {
    return adds.filter((a) => (!tag || a.tag === tag) && !a.isDead && !a.removed);
  },
  spawnAdds(defId, count, o = {}) {
    for (let i = 0; i < count; i++) adds.push({ defId, tag: o.tag ?? '', isDead: false, removed: false, position: { x: 0, z: 0 } });
  },
};

const tick = (n) => {
  for (let i = 0; i < n; i++) {
    now += DT;
    updatePatterns(c, DT);
  }
};
const at = (t) => Math.round(t / DT);

// ---- scripted schedule (60 s) ----------------------------------------------------------------------------------------
const soakResults = [];
const markExpired = [];
let interStart = -1;
let interEnd = -1;
const waveRan = [];

const slots = [
  { x: 2, z: 0, r: 2.5, at: 4 },   // player 11 stands here: 1 inside
  { x: -14, z: -10, r: 2.5, at: 4 }, // nobody: 0 inside
];

// t=0: soak slots (need 2 so both fail; the damage shape still lands on the players inside)
soak(c, {
  slots, need: 2, coef: 1,
  onPass: () => soakResults.push('pass'),
  onFail: (_c, inside, slot) => soakResults.push({ fail: inside.length, x: slot.x }),
});
tick(at(6));

// t=6: spread marks on both players, 3 s delay, tethers to the boss
markPlayers(c, players, { delay: 3, r: 1.8, coef: 0.8, beamTo: 'boss', onExpire: (_c, p) => markExpired.push({ id: p.id, t: now }) });
tick(at(14) - at(6));

// t=14: rotating beams (3 around the boss), 40 deg/s, 12 s, reverse at 6 s
rotatingBeams(c, { origins: { x: 0, z: 0, n: 3 }, speedDeg: 40, length: 12, width: 1.4, coef: 0.6, dur: 12, reverseAt: 6, step: 0.5, delay: 1 });
tick(at(30) - at(14));

// t=30: moving band from west to east, 4 m/s, stun 1 s
movingBand(c, { x: -10, z: 0 }, { x: 10, z: 0 }, { speed: 4, width: 2, coef: 1, stun: 1 });
tick(at(40) - at(30));

// t=40: intermission (timer 8 s, safety net 12 s), one add wave at 2 s, survivor penalty at the end
const started = intermission(c, {
  dur: 8,
  maxSeconds: 12,
  addWaves: [{ at: 2, run: (cc) => { waveRan.push(now); cc.spawnAdds('skel_rattler', 2, { tag: 'add' }); } }],
  onStart: () => { interStart = now; },
  onEnd: () => { interEnd = now; },
  survivorPenalty: (_cc, survivors) => { events.survivors = survivors.length; },
});
check('intermission starts', started && intermissionActive(c));
const rejected = intermission(c, { dur: 5 });
check('second intermission is refused while one runs', rejected === false);

tick(at(60) - at(40));

// ---- checks ----------------------------------------------------------------------------------------------------------
const display = shapes.filter((s) => s.o.kind === 'soak' && s.o.damage === 0);
const soakHits = shapes.filter((s) => s.o.soak === true);
check('soak: one yellow display per slot', display.length === slots.length, `${display.length}`);
check('soak: one real soak hit per slot, landing at its time', soakHits.length === slots.length && soakHits.every((s) => near(s.t, 4, 0.1)), soakHits.map((s) => s.t.toFixed(2)).join(','));
check('soak: soak hits carry damage and split flag', soakHits.every((s) => s.o.coef === 1 && s.o.telegraph === false));
check('soak: host resolves each slot with the inside count', soakResults.length === 2 && soakResults[1].fail === 0 && soakResults[0].fail === 1, JSON.stringify(soakResults));

const marks = shapes.filter((s) => s.o.name === 'İşaret' && s.o.shape.type === 'circle');
check('marks: one circle per marked player', marks.length === 2, `${marks.length}`);
check('marks: circles land 3 s after marking (t=6 to t=9)', marks.every((s) => near(s.t + s.o.delay, 9, 0.1)), marks.map((s) => (s.t + s.o.delay).toFixed(2)).join(','));
check('marks: expiry runs with the landing for both players', markExpired.length === 2 && markExpired.every((m) => near(m.t, 9, 0.1)), JSON.stringify(markExpired));
const tethers = shapes.filter((s) => s.o.kind === 'friendly' && s.o.shape.type === 'line');
check('marks: boss tethers are non-damaging', tethers.length === 2 && tethers.every((s) => s.o.damage === 0));

const beams = shapes.filter((s) => s.o.spin !== undefined && s.o.shape.type === 'line');
const fwd = beams.filter((s) => s.o.spin > 0);
const rev = beams.filter((s) => s.o.spin < 0);
check('beams: three forward sweeps at t=14', fwd.length === 3 && fwd.every((s) => near(s.t, 14, 0.1)), `${fwd.length}`);
check('beams: sweep persists until the reverse point', fwd.every((s) => near(s.o.persist.duration, 6, 0.01) && s.o.persist.tick === 0.5));
check('beams: three mirror sweeps after the reverse point', rev.length === 3 && rev.every((s) => near(s.t, 14 + 1 + 6, 0.1)), `${rev.length}`);
check('beams: mirror sweep lasts the rest of dur', rev.every((s) => near(s.o.persist.duration, 6, 0.01)));
const turned = ((40 * Math.PI) / 180) * (1 + 6);
const r0 = rev.find((s) => Math.abs(s.o.x) < 1e-9 && near(s.o.dx, Math.sin(-turned), 1e-6));
check('beams: mirror starts from the angle the first sweep reached', !!r0, r0 ? '' : JSON.stringify(rev.map((s) => s.o.dx)));

const band = shapes.filter((s) => s.o.name === 'Duvar');
check('band: cut into pieces 2 m thick across 20 m', band.length === 10, `${band.length}`);
check('band: pieces land in travel order at speed 4 m/s', band.every((s, i, a) => i === 0 || s.o.delay > a[i - 1].o.delay) && near(band[0].o.delay, 0.25, 0.01) && near(band[9].o.delay, 4.75, 0.01));
check('band: stun rides on every piece', band.every((s) => s.o.statuses?.[0]?.status === 'stun'));

check('intermission: immune on, then off', events.immune.length >= 2 && events.immune[0].on === true && events.immune[events.immune.length - 1].on === false);
check('intermission: wave spawned at 2 s', waveRan.length === 1 && near(waveRan[0] - interStart, 2, 0.1), waveRan.map((t) => (t - interStart).toFixed(2)).join(','));
check('intermission: ends by maxSeconds', interEnd > 0 && interEnd - interStart <= 12 + 0.06, `${(interEnd - interStart).toFixed(2)} s`);
check('intermission: ends on its timer (8 s)', interEnd > 0 && near(interEnd - interStart, 8, 0.1), `${(interEnd - interStart).toFixed(2)} s`);
check('intermission: endMechanicPhase called exactly once', events.endPhase === 1);
check('intermission: survivors passed to the penalty', events.survivors === 2, `${events.survivors}`);
check('intermission: not running after the end', !intermissionActive(c));
check('intermission: frozen at the start', events.freeze >= 1);

// ---- report ----------------------------------------------------------------------------------------------------------
let failed = 0;
for (const r of checks) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `  [${r.detail}]` : ''}`);
  if (!r.ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed (60 simulated seconds, ${shapes.length} shapes)`);
process.exit(failed ? 1 : 0);
