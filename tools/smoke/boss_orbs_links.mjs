#!/usr/bin/env node
/**
 * Smoke check for K11 (P-31, P-35, P-36, P-38): the lock limit, boss energy (regen, onFull, onEmpty, costs, replication), the
 * root-blocks-pull rule, shared-HP health links, and the orb / fixate / watch-zone logic. Runs the pure logic with fake
 * controllers and players; no browser, no dev server, no three.js.
 *
 *   node tools/smoke/boss_orbs_links.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads src/ai/bossNet.ts, src/ai/bosses/links.ts and src/ai/bosses/orbs.ts directly (native TypeScript stripping, Node >= 22.18).
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const root = fileURLToPath(new URL('../..', import.meta.url));
const { G } = await import(pathToFileURL(root + 'src/game/G.ts').href);
const net = await import(pathToFileURL(root + 'src/ai/bossNet.ts').href);
const links = await import(pathToFileURL(root + 'src/ai/bosses/links.ts').href);
const orbs = await import(pathToFileURL(root + 'src/ai/bosses/orbs.ts').href);

const failures = [];
let passed = 0;
const expect = (cond, msg) => {
  if (cond) passed++;
  else failures.push(msg);
};

// ---- fakes -------------------------------------------------------------------------------------------------------------

function fakePlayer(id, x = 0, z = 0, rooted = false) {
  return {
    id, removed: false, isDead: false, isLocal: true, forcedMove: null, radius: 0.5,
    position: { x, z },
    statuses: { invulnerable: false, has: (s) => rooted && s === 'root' },
  };
}

/** Minimal boss controller: the fields the K11 helpers touch. `time` is advanced by the test. */
function fakeCtrl(players = []) {
  const shapes = [];
  return {
    state: {},
    e: { position: { x: 0, z: 0 } },
    world: { time: 0, players },
    shapes,
    shape(o) {
      shapes.push(o);
      return shapes.length;
    },
  };
}

function fakeBody(hp, maxHp = 100) {
  return {
    hp, maxHp, removed: false, killed: false,
    get hpFrac() { return Math.max(0, this.hp / this.maxHp); },
    get isDead() { return this.hp <= 0; },
    position: { x: 0, z: 0 },
  };
}

const tick = (c, dt) => {
  c.world.time += dt;
  links.tickLinks(c, dt);
};

// ---- P-31: lock limit ---------------------------------------------------------------------------------------------------

expect(net.lockExpired(0, 149.9) === false, 'lockLimit: must not fire before 150 s');
expect(net.lockExpired(0, 150.1) === true, 'lockLimit: must fire after 150 s');
expect(net.lockExpired(10, 159.5) === false, 'lockLimit: measured from lockedAt, not from fight start');
expect(net.lockExpired(0, 40.1, 30) === true, 'lockLimit: script override (lockLimit 30) must fire at 30 s');

// ---- P-38: energy --------------------------------------------------------------------------------------------------------

{
  const sent = [];
  let full = 0, empty = 0;
  const en = new net.BossEnergy(
    { max: 100, start: 0, regen: 10, onFull: 'onFull', costs: { gaze: 30 } },
    { full: () => full++, empty: () => empty++ },
    (v, max) => sent.push({ v, max }),
  );
  expect(en.value === 0, 'energy: start value is 0 by default');
  for (let i = 0; i < 5; i++) en.step(1);
  expect(en.value === 50, `energy: regen 10/s for 5 s gives 50 (got ${en.value})`);
  expect(full === 0, 'energy: onFull must not fire before reaching max');
  for (let i = 0; i < 10; i++) en.step(1);
  expect(en.value === 100, `energy: clamps at max (got ${en.value})`);
  expect(full === 1, `energy: onFull fires once on reaching max (got ${full})`);
  for (let i = 0; i < 3; i++) en.step(1);
  expect(full === 1, 'energy: onFull does not repeat while full');

  expect(en.spend('gaze') === true && en.value === 70, 'energy: spend pays the cost (100 -> 70)');
  expect(en.spend('nope') === true && en.value === 70, 'energy: an ability with no cost is free');
  en.set(20);
  expect(en.canPay('gaze') === false && en.spend('gaze') === false && en.value === 20, 'energy: unaffordable ability is refused');
  expect(full === 1, 'energy: set() does not fire hooks');

  en.pause(true);
  en.step(5);
  expect(en.value === 20, 'energy: pause freezes regen');
  en.pause(false);

  // replication every 0.25 s while stepping in 0.1 s slices for 1 s
  sent.length = 0;
  for (let i = 0; i < 10; i++) en.step(0.1);
  expect(sent.length >= 3 && sent.length <= 5, `energy: boss_energy sent about every 0.25 s (got ${sent.length} in 1 s)`);
  expect(sent.every((m) => m.max === 100), 'energy: replication carries max');
}

{
  let empty = 0;
  const en = new net.BossEnergy({ max: 100, start: 100, regen: -50 }, { empty: () => empty++ }, () => {});
  en.step(1);
  expect(en.value === 50 && empty === 0, 'energy drain: 100 -> 50 without onEmpty');
  en.step(1);
  en.step(1);
  expect(en.value === 0 && empty === 1, `energy drain: onEmpty fires once at 0 (empty=${empty})`);
  en.reset();
  expect(en.value === 100, 'energy: reset returns to start');
}

// receiver: boss_energy replicates into bossEnergyView (applyBossMsg needs a world to be set)
G.world = { time: 0, players: [] };
net.applyBossMsg?.({ kind: 'boss_energy', data: { v: 37, max: 100 } });
{
  const view = net.bossEnergyView();
  expect(view && view.v === 37 && view.max === 100, `energy: boss_energy message updates bossEnergyView (got ${JSON.stringify(view)})`);
}
G.world = null;

// ---- P-31 / pull: a rooted player ignores a pull --------------------------------------------------------------------------

{
  const rooted = fakePlayer(1, 0, 0, true);
  const free = fakePlayer(2, 0, 0, false);
  expect(net.pullBlocked(rooted) === true, 'pull: root blocks the pull');
  expect(net.pullBlocked(free) === false, 'pull: a free player is pulled');

  // drive the real ForceSystem: capture the system that applyBossMsg registers and tick it
  const systems = [];
  let lp = rooted;
  G.world = {
    get localPlayer() { return lp; },
    time: 0,
    nav: { resolveCircle() {} },
    addSystem(s) { systems.push(s); },
  };
  const pullAt = (p) => {
    lp = p;
    p.position.x = 0;
    p.position.z = 0;
    net.applyBossMsg({ kind: 'boss_pull', data: { x: 10, z: 0, speed: 6, dur: 2, stop: 1.5, r: 0 } });
    for (let i = 0; i < 5; i++) systems[0].update(0.1);
  };
  pullAt(rooted);
  expect(rooted.position.x === 0, `pull: rooted player stays put (x=${rooted.position.x.toFixed(3)})`);
  systems[0].forces?.splice(0);
  pullAt(free);
  expect(free.position.x > 1, `pull: free player moves toward the pull point (x=${free.position.x.toFixed(3)})`);
  G.world = null;
}

// ---- P-36: linkHealth shares damage --------------------------------------------------------------------------------------

{
  G.combat = { killEnemy(e) { e.killed = true; e.hp = 0; } };
  const c = fakeCtrl();
  const a = fakeBody(100), b = fakeBody(100);
  links.linkHealth(c, [a, b]);
  a.hp = 60; // a hit lands on A
  tick(c, 0.1);
  expect(b.hp === 60, `linkHealth: damage on A lowers B to the same HP (B=${b.hp})`);
  b.hp = 30; // a hit lands on B
  tick(c, 0.1);
  expect(a.hp === 30, `linkHealth: damage on B lowers A (A=${a.hp})`);
  a.hp = 0; // A dies by a normal hit
  tick(c, 0.1);
  expect(b.killed === true && b.hp === 0, 'linkHealth: one death kills the linked group');
  expect(c.state.__links.health.length === 0, 'linkHealth: a dead group is dropped');
  G.combat = null;
}

// ---- P-35: orbs ----------------------------------------------------------------------------------------------------------

G.world = null; // bossFx needs no world; keep the cosmetic calls inert
{
  const p = fakePlayer(7, 1, 0);
  const c = fakeCtrl([p]);
  let arrived = 0, touched = 0;
  orbs.roamingOrb(c, { x: 0, z: 0, speed: 0, life: 1.0, r: 2, coef: 1 });
  orbs.updateOrbs(c, 0.1, { onTouch: () => touched++, onArrive: () => arrived++ });
  expect(c.shapes.length === 1 && touched === 1, `orb: touching a living player spends one hit (shapes=${c.shapes.length})`);
  orbs.updateOrbs(c, 0.1, { onTouch: () => touched++, onArrive: () => arrived++ });
  expect(c.shapes.length === 1, 'orb: a second touch inside the 0.6 s cooldown does nothing');
  for (let i = 0; i < 10; i++) orbs.updateOrbs(c, 0.1, { onArrive: () => arrived++ });
  expect(arrived === 1, `orb: onArrive fires once when the life ends (got ${arrived})`);
  expect(orbs.orbsOf(c).length === 0, 'orb: an expired orb is removed');
  const shapeAt = c.shapes[0];
  expect(shapeAt && shapeAt.shape.type === 'circle' && shapeAt.coef === 1, 'orb: the touch is a circle HitShape with the orb coef');
}

{
  // a once-orb is removed after its first touch
  const p = fakePlayer(8, 0.5, 0);
  const c = fakeCtrl([p]);
  orbs.roamingOrb(c, { x: 0, z: 0, speed: 0, life: 5, r: 2, coef: 1, once: true });
  orbs.updateOrbs(c, 0.1, {});
  expect(orbs.orbsOf(c).length === 0 && c.shapes.length === 1, 'orb: a once-orb is removed after its touch');
}

{
  // fixate: the orb chases the player and calls onCatch within catchR
  const p = fakePlayer(9, 10, 0);
  const c = fakeCtrl([p]);
  let caught = 0;
  orbs.fixate(c, p, { seconds: 5, speed: 4, catchR: 1, onCatch: () => caught++ });
  for (let i = 0; i < 60 && caught === 0; i++) {
    p.position.x += 0; // the player stands still
    orbs.updateOrbs(c, 0.1, {});
  }
  expect(caught === 1, 'fixate: the orb reaches the player and calls onCatch');
  expect(c.shapes.length === 0, 'fixate: a fixate orb deals no damage');
}

{
  // watch zone: edge-triggered entries, expiry, once
  const p = fakePlayer(11, 10, 10);
  const c = fakeCtrl([p]);
  let entered = 0;
  orbs.watchZone(c, { x: 0, z: 0, r: 2, duration: 3, tag: 'z', onEnter: () => entered++ });
  orbs.updateWatchZones(c, 0.1);
  expect(entered === 0, 'watch: a player outside the zone does not trigger it');
  p.position.x = 1; p.position.z = 0;
  orbs.updateWatchZones(c, 0.1);
  orbs.updateWatchZones(c, 0.1);
  expect(entered === 1, `watch: entry fires once while the player stays inside (entered=${entered})`);
  p.position.x = 10; p.position.z = 0;
  orbs.updateWatchZones(c, 0.1);
  p.position.x = 1;
  orbs.updateWatchZones(c, 0.1);
  expect(entered === 2, 'watch: leaving and re-entering fires again');
  for (let i = 0; i < 40; i++) orbs.updateWatchZones(c, 0.1);
  expect(c.state.__watch.length === 0, 'watch: the zone expires after its duration');
}

// ---- report ----------------------------------------------------------------------------------------------------------------

if (failures.length) {
  for (const f of failures) console.error('FAIL', f);
  console.error(`boss_orbs_links: ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`boss_orbs_links: ok (${passed} checks)`);
