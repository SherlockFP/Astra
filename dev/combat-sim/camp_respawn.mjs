#!/usr/bin/env node
/**
 * Camp respawn checks (src/scenes/world/CampDirector.ts), headless through the REAL CampDirector and the real spawnEnemy (only the
 * GLB load is stubbed). A cleared camp comes back on its timer: a player idling 15 m away sees it within respawnSec + 2 s; a player
 * standing within 10 m of a spawn point holds it until he leaves; 3+ players near cut the timer to x0.6 (floor 15 s).
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/camp_respawn.mjs      (V=1 prints every PASS)
 *
 * Stages: respawn.* idle 15 m away, on the timer, within respawnSec + 2 s | clear.* no respawn while a player is within 10 m of a
 * spawn point, respawn once he leaves | crowd.* 3 players near: timer x0.6 | floor.* the 15 s floor under the crowd cut.
 * Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const { G, world, errors } = H;
const { CampDirector } = await H.imp('scenes/world/CampDirector.ts');
const { tileToWorld } = await H.imp('scenes/world/util.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// headless: no GLB model (the rest of spawnEnemy runs as in the game); net stub = a solo host (every spawn is local)
Enemy.prototype.loadModel = async function loadModelStub() {};
G.net = { isAuthority: true, on() {}, broadcast() {}, sendTo() {}, sendToHost() {}, ledgerNote() {}, ledgerRemaining: () => 0 };
G.mplus.onEnemySpawned = () => {};

const perf = { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 };
const TRASH = 'ys_nobet_muhafizi';

/** One camp (tile coords, like DungeonDef.packs) with two members 4 m apart. */
function pack(id, tx, tz, respawnSec) {
  return {
    id, roomId: 'camp_room', center: [tx, tz], radius: 12, respawnSec,
    members: [{ enemyId: TRASH, offset: [-0.5, 0] }, { enemyId: TRASH, offset: [0.5, 0] }],
  };
}

/** The part of WorldCtx that CampDirector reads: packs, seed, enemy level, snapping, player distance, budget, events. */
function ctxFor(packs) {
  return {
    world, def: { packs }, seed: 4242, params: { enemyLevel: 6 },
    snapTile: (tx, tz) => ({ x: tileToWorld(tx), z: tileToWorld(tz) }),
    nearestPlayerDist(x, z) {
      let best = Infinity;
      for (const p of world.players) if (!p.removed) best = Math.min(best, Math.hypot(p.position.x - x, p.position.z - z));
      return best;
    },
    aliveEnemies() {
      let n = 0;
      for (const e of world.enemies) if (!e.isDead && !e.removed) n++;
      return n;
    },
    ev() {},
  };
}

const alive = (packId) => world.enemies.filter((e) => e.packId === packId && !e.isDead && !e.removed).length;
const yieldFrames = () => new Promise((r) => setImmediate(r));

/** Runs the world and the director for `s` seconds of sim time (promises of the async spawns settle between frames). */
async function run(director, s) {
  const n = H.sec(s);
  for (let i = 0; i < n; i++) {
    H.step(1);
    director.update(H.DT);
    await yieldFrames();
  }
}

/** Runs until the camp has `want` live members, at most `maxS` seconds; returns the seconds it took, or null. */
async function runUntilAlive(director, packId, want, maxS) {
  const n = H.sec(maxS);
  for (let i = 0; i < n; i++) {
    if (alive(packId) >= want) return i * H.DT;
    H.step(1);
    director.update(H.DT);
    await yieldFrames();
  }
  return alive(packId) >= want ? maxS : null;
}

/** Wipes the camp through the real death flow (Combat.killEnemy). Returns the sim time of the kill. */
function killAll(packId) {
  const killer = world.localPlayer.id;
  for (const e of world.enemies) if (e.packId === packId && !e.isDead && !e.removed) G.combat.killEnemy(e, killer);
  return world.time;
}

/** The corpses sink and go (Enemy.update, ~4.7 s after death). The sim loads no model, so there is no body to sink: remove them here. */
function sinkCorpses(packId) {
  for (const e of world.enemies) if (e.packId === packId && e.isDead && !e.removed) e.destroy();
}

/** Brings the camp up and kills it; returns { t0, director } once the kill is seen by the director. */
async function activateAndWipe(packs, packId) {
  const director = new CampDirector(ctxFor(packs), perf);
  const first = await runUntilAlive(director, packId, packs[0].members.length, 5);
  ok(`${packId}: camp spawns its members on activation`, first !== null, first === null ? 'no member spawned' : '');
  const t0 = killAll(packId);
  await run(director, 0.6); // one director tick (0.5 s) sees the wipe and starts the timer
  sinkCorpses(packId);
  return { director, t0 };
}

/** Time (s after t0) the first member of the camp is back, or null within maxS. */
async function timeToRespawn(director, packId, t0, maxS) {
  const n = H.sec(maxS);
  for (let i = 0; i < n; i++) {
    if (alive(packId) > 0) return world.time - t0;
    H.step(1);
    director.update(H.DT);
    await yieldFrames();
  }
  return alive(packId) > 0 ? world.time - t0 : null;
}

/** Puts `n` knights around (x, z) at 15 m from the camp centre (east side, 1 m apart), on the side away from the members. */
function placePlayers(n, cx, cz) {
  const list = [H.addPlayer('knight', 10)];
  for (let i = 1; i < n; i++) {
    const p = new H.FakePlayer('knight', 10);
    p.id = 900 + i;
    world.add(p);
    list.push(p);
  }
  list.forEach((p, i) => {
    p.position.set(cx + 15, 0, cz + (i - (n - 1) / 2));
    p.hp = p.maxHp = 1e9;
  });
  return list;
}

(async () => {
  // ---- respawn.* a player idling 15 m from the camp ------------------------------------------------------------------
  {
    const packs = [pack('camp_a', 60, 60, 20)];
    const cx = tileToWorld(60), cz = tileToWorld(60);
    placePlayers(1, cx, cz);
    const { director, t0 } = await activateAndWipe(packs, 'camp_a');
    const dt = await timeToRespawn(director, 'camp_a', t0, 30);
    ok('respawn.idle 15 m: back within respawnSec + 2 s', dt !== null && dt <= 20 + 2, dt === null ? 'never' : `${dt.toFixed(1)} s`);
    ok('respawn.on the timer: not before respawnSec', dt !== null && dt >= 20 - 1, dt === null ? '' : `${dt.toFixed(1)} s`);
  }

  // ---- clear.* a player on a spawn point holds the respawn; leaving the 10 m ring lets it back ----------------------
  {
    const packs = [pack('camp_b', 120, 60, 20)];
    const cx = tileToWorld(120), cz = tileToWorld(60);
    const [p] = placePlayers(1, cx, cz);
    const { director, t0 } = await activateAndWipe(packs, 'camp_b');
    p.position.set(cx + 2, 0, cz + 6); // 6 m from the east member point (7.2 m from the west one)
    await run(director, 40); // two respawn timers over
    ok('clear.no respawn while a player is 6 m from a spawn point', alive('camp_b') === 0, `${alive('camp_b')} alive`);
    p.position.set(cx + 15, 0, cz);
    const waited = world.time - t0;
    const dt = await timeToRespawn(director, 'camp_b', t0, 5);
    ok('clear.respawn within 2 s once the player is 15 m away', dt !== null && dt - waited <= 2, dt === null ? 'never' : `${(dt - waited).toFixed(1)} s after he left`);
  }

  // ---- crowd.* / floor.* three players near: the timer is x0.6, never under 15 s ----------------------------------------
  {
    const packs = [pack('camp_c', 180, 60, 60)];
    const cx = tileToWorld(180), cz = tileToWorld(60);
    placePlayers(3, cx, cz);
    const { director, t0 } = await activateAndWipe(packs, 'camp_c');
    const dt = await timeToRespawn(director, 'camp_c', t0, 60);
    ok('crowd.3 players: respawn at x0.6 of 60 s (36 s), not sooner', dt !== null && dt >= 35 && dt <= 36 + 2, dt === null ? 'never' : `${dt.toFixed(1)} s`);
  }
  {
    const packs = [pack('camp_d', 240, 60, 20)];
    const cx = tileToWorld(240), cz = tileToWorld(60);
    placePlayers(3, cx, cz);
    const { director, t0 } = await activateAndWipe(packs, 'camp_d');
    const dt = await timeToRespawn(director, 'camp_d', t0, 30);
    ok('floor.3 players, respawnSec 20: the cut is floored at 15 s', dt !== null && dt >= 14 && dt <= 15 + 2, dt === null ? 'never' : `${dt.toFixed(1)} s`);
  }

  if (errors.length && process.env.V) for (const e of errors.slice(0, 6)) console.log('   ', e.slice(0, 200));
  console.log(`\ncamp_respawn: ${passes} PASS, ${fails} FAIL`);
  process.exitCode = fails === 0 ? 0 : 1;
})().catch((e) => {
  console.log('FAIL camp_respawn threw', e?.stack ?? e);
  process.exitCode = 1;
});
