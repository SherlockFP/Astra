// NC45 Corpse registry (GDD_CLASSES_V2 §1.6, combat/Corpses.ts). No browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/corpses.mjs
// Covered: corpses.api (add / within / nearest / count / take / takeMany / consume, ordering, y filter), corpses.cap, corpses.expiry,
//          corpses.events, corpses.boss, corpses.death (Combat.finalizeDeath hook: host kill and client `death` path, rewardless units),
//          corpses.revive, corpses.scene, corpses.talent, corpses.wisp, corpses.safe (a failing registry never breaks the death flow).
import * as H from './harness.mjs';

const { G, errors } = H;
const { Corpses, CORPSE_LIFE, CORPSE_MAX } = await H.imp('combat/Corpses.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

const added = [], removed = [];
G.events.on('corpse:added', (e) => added.push(e));
G.events.on('corpse:removed', (e) => removed.push(e));
const resetEv = () => { added.length = 0; removed.length = 0; };

G.corpses = new Corpses();
const fresh = (classId = 'knight') => {
  const p = H.addPlayer(classId);
  G.corpses.clear('cleared');
  resetEv();
  return p;
};
// FakeEnemy has no revive counter (Combat.finalizeDeath keys the once-per-life guard on it)
const foe = (x, z, o) => { const e = H.addEnemy(x, z, o); e.reviveCount = 0; return e; };
const tickReg = (sec) => { for (let i = 0; i < Math.round(sec / H.DT); i++) G.corpses.update(H.DT); };

// ---- corpses.api
{
  fresh();
  const a = G.corpses.add(10, 0, 'goblin', 'trash', 5, { id: 501 });
  const b = G.corpses.add(4, 0, 'orc', 'elite', 7, { id: 502 });
  const c = G.corpses.add(-4, 0, 'orc', 'trash', 7, { id: 503 });
  ok('corpses.api add returns the record (id, position, def, rank, level)', a && a.id === 501 && a.x === 10 && a.defId === 'goblin' && a.rank === 'trash' && a.level === 5);
  ok('corpses.api default life is CORPSE_LIFE and max count CORPSE_MAX (16)', CORPSE_LIFE === 30 && CORPSE_MAX === 16 && Math.abs(a.expiresAt - a.diedAt - CORPSE_LIFE) < 1e-6);
  ok('corpses.api count in a circle', G.corpses.count(0, 0, 5) === 2 && G.corpses.count(0, 0, 11) === 3 && G.corpses.count(0, 0, 3) === 0);
  ok('corpses.api nearest: distance order, ties by lower id (4 vs -4 -> 502)', G.corpses.nearest(0, 0, 20)?.id === 502);
  ok('corpses.api within is nearest first', G.corpses.within(0, 0, 20).map((x) => x.id).join() === '502,503,501');
  ok('corpses.api nearest outside the radius is null', G.corpses.nearest(0, 0, 2) === null);
  ok('corpses.api query by position agrees without ids (a second registry, other ids, same positions)', (() => {
    const other = new Corpses();
    other.add(10, 0, 'goblin', 'trash', 5, { id: 9001 }); other.add(4, 0, 'orc', 'elite', 7, { id: 9002 }); other.add(-4, 0, 'orc', 'trash', 7, { id: 9003 });
    const same = other.nearest(0, 0, 20);
    other.clear('cleared');
    return same && same.x === G.corpses.nearest(0, 0, 20).x && same.z === G.corpses.nearest(0, 0, 20).z;
  })());
  const t = G.corpses.take(0, 0, 20);
  ok('corpses.api take consumes the nearest', t?.id === 502 && G.corpses.count(0, 0, 20) === 2 && G.corpses.nearest(0, 0, 20)?.id === 503);
  const many = G.corpses.takeMany(0, 0, 20, 5);
  ok('corpses.api takeMany takes up to max, nearest first', many.map((x) => x.id).join() === '503,501' && G.corpses.list.length === 0);
  ok('corpses.api take / consume on nothing is null', G.corpses.take(0, 0, 20) === null && G.corpses.consume(12345) === null);
  G.corpses.add(0, 0, 'a', 'trash', 1, { id: 601, y: 0 });
  G.corpses.add(0, 0, 'b', 'trash', 1, { id: 602, y: 10 });
  ok('corpses.api y filter keeps another floor apart', G.corpses.count(0, 0, 3, 0) === 1 && G.corpses.nearest(0, 0, 3, 10)?.id === 602 && G.corpses.count(0, 0, 3) === 2);
  ok('corpses.api add with a duplicate id replaces the record', (() => {
    G.corpses.add(5, 5, 'c', 'trash', 1, { id: 601 });
    return G.corpses.list.filter((x) => x.id === 601).length === 1 && G.corpses.list.find((x) => x.id === 601).x === 5;
  })());
  ok('corpses.api add without id gets a unique negative id (never an entity id)', (() => {
    const x = G.corpses.add(1, 1, 'd', 'trash', 1), y = G.corpses.add(2, 2, 'd', 'trash', 1);
    return x.id < 0 && y.id < 0 && x.id !== y.id;
  })());
  ok('corpses.api bad coordinates are refused', G.corpses.add(NaN, 0, 'x', 'trash', 1) === null);
}

// ---- corpses.boss / corpses.cap / corpses.expiry / corpses.events
{
  fresh();
  ok('corpses.boss a boss leaves no corpse', G.corpses.add(0, 0, 'big', 'boss', 30) === null && G.corpses.list.length === 0 && added.length === 0);
  ok('corpses.boss a miniboss does', G.corpses.add(0, 0, 'mid', 'miniboss', 30, { id: 1 }) !== null);
  fresh();
  for (let i = 0; i < 20; i++) G.corpses.add(i, 0, 'mob', 'trash', 1, { id: 700 + i });
  ok('corpses.cap never more than 16', G.corpses.list.length === 16);
  ok('corpses.cap the oldest four were evicted (expired events), the newest stay', G.corpses.list[0].id === 704 && removed.filter((r) => r.reason === 'expired').map((r) => r.id).join() === '700,701,702,703');
  ok('corpses.events corpse:added carries id x z defId rank level', added.length === 20 && added[19].id === 719 && added[19].x === 19 && added[19].defId === 'mob' && added[19].rank === 'trash' && added[19].level === 1);

  fresh();
  G.corpses.add(0, 0, 'mob', 'trash', 1, { id: 1 });
  G.corpses.add(3, 0, 'mob', 'trash', 1, { id: 2, life: 10 });
  tickReg(9.9);
  ok('corpses.expiry nothing expires early', G.corpses.list.length === 2 && removed.length === 0);
  tickReg(0.3);
  ok('corpses.expiry a 10 s corpse expires after 10 s (event expired)', G.corpses.list.length === 1 && removed.length === 1 && removed[0].id === 2 && removed[0].reason === 'expired' && removed[0].x === 3);
  tickReg(20);
  ok('corpses.expiry the default one expires after 30 s', G.corpses.list.length === 0 && removed.length === 2 && removed[1].id === 1);
  G.corpses.add(0, 0, 'mob', 'trash', 1, { id: 3 });
  resetEv();
  G.corpses.consume(3);
  ok('corpses.events consume emits corpse:removed consumed', removed.length === 1 && removed[0].reason === 'consumed' && removed[0].id === 3);
}

// ---- corpses.death: Combat.finalizeDeath is the single caller of the hook
{
  const p = fresh();
  const e = foe(8, 3, { rank: 'trash' });
  e.def.name = 'Dummy';
  G.combat.killEnemy(e, p.id);
  const c = G.corpses.list[0];
  ok('corpses.death a host kill registers a corpse at the enemy position with its id', !!c && c.id === e.id && c.x === 8 && c.z === 3 && c.defId === 'dummy' && c.rank === 'trash' && c.level === 30 && added.length === 1);
  const e2 = foe(-8, 3, { rank: 'elite' });
  G.combat.finalizeDeath(e2, null, false);   // the client path (Combat's `death` receiver)
  ok('corpses.death the client path registers it too', G.corpses.list.some((x) => x.id === e2.id && x.rank === 'elite'));
  const boss = foe(0, 9, { rank: 'boss' });
  G.combat.killEnemy(boss, p.id);
  ok('corpses.death a boss kill leaves none', !G.corpses.list.some((x) => x.id === boss.id));
  const orb = foe(2, 2, { rank: 'trash' });
  orb.def.id = 'proc_orb';
  G.combat.killEnemy(orb, p.id);
  ok('corpses.death rewardless units (proc_ / affix) leave none', !G.corpses.list.some((x) => x.id === orb.id));
  const before = G.corpses.list.length;
  G.combat.killEnemy(e, p.id);
  ok('corpses.death killing the same life twice registers once', G.corpses.list.length === before);
}

// ---- corpses.revive: a revived enemy (Diriltici) must not stay raisable
{
  const p = fresh();
  const e = foe(5, 5, { rank: 'trash' });
  G.combat.killEnemy(e, p.id);
  ok('corpses.revive corpse exists after the death', G.corpses.list.length === 1);
  resetEv();
  e.hp = e.maxHp; e.alive = true;   // revived in place
  G.corpses.update(H.DT);
  ok('corpses.revive the record is dropped when its enemy stands up again', G.corpses.list.length === 0 && removed.some((r) => r.id === e.id));
  const e2 = foe(6, 6, { rank: 'trash' });
  G.combat.killEnemy(e2, p.id);
  G.world.remove(e2);
  G.world.update(0);
  G.corpses.update(H.DT);
  ok('corpses.revive a removed (sunk) enemy entity does NOT take its record with it', G.corpses.list.some((x) => x.id === e2.id));
}

// ---- corpses.scene / corpses.talent / corpses.wisp / corpses.safe
{
  fresh();
  G.corpses.add(1, 1, 'a', 'trash', 1, { id: 1 });
  G.corpses.add(2, 2, 'b', 'trash', 1, { id: 2 });
  resetEv();
  G.events.emit('scene:leaving', { from: 'dungeon', to: 'town' });
  ok('corpses.scene scene:leaving clears everything with reason cleared', G.corpses.list.length === 0 && removed.length === 2 && removed.every((r) => r.reason === 'cleared'));

  fresh();
  G.character.specials = { n_nc_corpse_collector: { params: { corpseLife: 0.5, corpseEssence: 8 } } };
  const c = G.corpses.add(0, 0, 'a', 'trash', 1, { id: 1 });
  ok('corpses.talent Cesetçi (+50 % corpse life) -> 45 s', Math.abs(c.expiresAt - c.diedAt - 45) < 1e-6);
  const c2 = G.corpses.add(0, 0, 'a', 'trash', 1, { id: 2, life: 8 });
  ok('corpses.talent an explicit life wins over the talent', Math.abs(c2.expiresAt - c2.diedAt - 8) < 1e-6);
  G.character.specials = {};

  // wisps only for a local necromancer; they are stopped when the corpse goes
  let spawned = 0, stopped = 0;
  const origSpawn = G.vfx.spawn;
  G.vfx.spawn = (id) => { if (id === 'soul_wisp') spawned++; return { alive: true, stop() { stopped++; } }; };
  fresh('knight');
  G.corpses.add(0, 0, 'a', 'trash', 1, { id: 1 });
  ok('corpses.wisp no wisp for a knight', spawned === 0);
  fresh('necromancer');
  G.corpses.add(0, 0, 'a', 'trash', 1, { id: 1 });
  G.corpses.add(1, 0, 'a', 'trash', 1, { id: 2 });
  ok('corpses.wisp a necromancer sees one soul_wisp per corpse', spawned === 2);
  G.corpses.consume(1);
  ok('corpses.wisp the wisp stops when the corpse is consumed', stopped === 1);
  G.vfx.spawn = () => { throw new Error('vfx down'); };
  let threw = false;
  try { G.corpses.add(3, 0, 'a', 'trash', 1, { id: 3 }); G.corpses.update(H.DT); } catch { threw = true; }
  ok('corpses.wisp a failing vfx never throws', !threw && G.corpses.list.length === 2);
  G.vfx.spawn = origSpawn;

  // a failing registry never breaks the death flow
  const p = fresh('knight');
  const e = foe(4, 4, { rank: 'trash' });
  const orig = G.corpses.add;
  G.corpses.add = () => { throw new Error('boom'); };
  const errBefore = errors.length;
  let died = false;
  try { G.combat.killEnemy(e, p.id); died = e.isDead; } catch { died = false; }
  G.corpses.add = orig;
  ok('corpses.safe a throwing registry is logged, the enemy still dies', died && errors.length > errBefore);
  errors.length = errBefore;   // the expected error is not a failure
}

console.log(fails === 0 ? '\ncorpses: all checks PASS' : `\ncorpses: ${fails} FAIL`);
if (errors.length) for (const m of errors.slice(0, 6)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
