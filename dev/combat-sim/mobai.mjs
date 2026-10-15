#!/usr/bin/env node
/**
 * WoW-style trash AI checks (src/ai/EnemyAI.ts + src/ai/trash/roles.ts), headless through the REAL brain: a real Enemy entity
 * and a real EnemyAI ticked by world.update, with the real EnemyDirector (pack pulls, calls for help). Only the player is a
 * harness actor (FakePlayer). No browser, no server.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/mobai.mjs      (V=1 prints every PASS)
 *
 * Stages: roles.* (pure role rules: humanoid flee, kite bands, spell casts, heal threshold, default leash) | pack.* (one pull aggroes
 * the whole pack, not the next pack) | social.* (pack aggro is the camp only; pack-less neighbours join within 10 m and inside their own
 * aggro range; no sweep, no chain past the aggro range) | leash.* (a chase past the leash evades home with a full reset) | caster.* (keeps range,
 * casts an interruptible spell with a cast bar, a heavy hit cuts it) | healer.* (heals a hurt ally, ignores a healthy one) |
 * flee.* (humanoid at 20 % HP runs and calls its pack; a swarm beast does not) | flee.ground.* (run points on reachable ground only; a mob on a stone step evades home) | neutral.* (a deer never aggroes on sight, wanders idly, runs once hit; a treasure goblin still runs off) | elite.* (elite specials telegraphed, windup
 * >= 0.9 s; trash not) | stuck.* (no route to the target = evade, not a stand-off) | wall.* (a charge stops at a wall) |
 * cap.* (a level-2 priest in the Balçık Gölü slime camps: at most 3 engaged, a touch never pulls another camp, no level-2 split).
 * Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const { G, world, errors, events } = H;
// Repeatable runs (as solo_lowlevel.mjs): timers and the wall clock read the sim clock, and Math.random is seeded, so the flee
// point, the spawn animation phase and every other random pick repeat run to run.
performance.now = () => G.engine.time * 1000;
Date.now = () => 1800000000000 + G.engine.time * 1000;
const { RNG } = await H.imp('core/utils.ts');
const mathRng = new RNG(7);
Math.random = () => mathRng.next();
const { ENEMIES } = await H.imp('data/enemies.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const R = await H.imp('ai/trash/roles.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const dist = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const sec = H.sec;
const DT = H.DT;

// ---- fixtures -------------------------------------------------------------------------------------------------------------
const mobs = [];
let nextId = 7000;
/** A real Enemy + real EnemyAI at (x, z). `def` overrides the roster def (synthetic elite clones). */
function mob(defId, x, z, o = {}) {
  const def = o.def ?? ENEMIES[defId];
  const e = new Enemy(nextId++, def);
  e.position.set(x, 0, z);
  e.homeX = x;
  e.homeZ = z;
  e.packId = o.packId ?? null;
  if (o.level) e.level = o.level;
  world.add(e);
  const ai = new EnemyAI(e, getDirector(world));
  e.ai = ai;
  mobs.push(ai);
  return e;
}
/** Fresh world: every entity gone (their brains disposed), a knight at the origin, and a walkable grid. */
function reset(classId = 'knight', level = 10) {
  for (const ai of mobs.splice(0)) ai.dispose();
  world.nav.setRect(-99, -99, 99, 99, true);
  const p = H.addPlayer(classId, level);
  p.position.set(0, 0, 0);
  p.hp = p.maxHp = 1e9;
  return p;
}
const healsTo = (id) => events.heal.filter((h) => h.targetId === id).length;

// ==================================================================================================================
// roles.* pure rules (no world): these are the data-level assignments the brain reads
// ==================================================================================================================
{
  const guard = ENEMIES.ys_nobet_muhafizi;
  const caster = ENEMIES.ys_nobet_buyucusu;
  const swarm = ENEMIES.ys_mana_yutan;
  const boss = Object.values(ENEMIES).find((d) => d.rank === 'boss');
  ok('roles.humanoid caster is humanoid', R.isHumanoid(caster), caster.model);
  ok('roles.swarm beast is not humanoid', !R.isHumanoid(swarm), swarm.model);
  ok('roles.humanoid trash flees', R.fleesAtLowHp(caster) && R.fleesAtLowHp(guard));
  ok('roles.swarm does not flee', !R.fleesAtLowHp(swarm));
  ok('roles.boss never flees', !boss || !R.fleesAtLowHp(boss));
  ok('roles.caster keeps range 9-15', JSON.stringify(R.kiteBandFor(caster)) === '[9,15]', String(R.kiteBandFor(caster)));
  // a ranged trash def with no kite band of its own (the roster's archers all carry one): the role default applies
  const archer = { ...ENEMIES.ys_dehset_gozu, ai: undefined, flying: false };
  ok('roles.archer kites slightly (7-11)', JSON.stringify(R.kiteBandFor(archer)) === '[7,11]', String(R.kiteBandFor(archer)));
  ok('roles.melee has no kite band', R.kiteBandFor(guard) === null);
  const bolt = caster.abilities.find((a) => a.kind === 'projectile' && !a.castTime);
  ok('roles.trash caster spell gets a 1.2 s cast', bolt && R.spellCastTime(caster, bolt, false) === R.SPELL_CAST_S);
  ok('roles.caster basic stays instant', R.spellCastTime(caster, caster.basicAttack, true) === 0);
  ok('roles.trash melee specials not cast', R.spellCastTime(guard, guard.abilities[0], false) === 0);
  ok('roles.heal threshold trash 80 %, boss 97 %', R.healBelow(caster) === 0.8 && (!boss || R.healBelow(boss) === 0.97));
  ok('roles.default leash 30 m for trash', R.defaultLeashFor(guard) === 30);
  ok('roles.summons and stationary keep no leash', R.defaultLeashFor({ ...guard, ai: { summoned: true } }) === 0 && R.defaultLeashFor({ ...guard, ai: { stationary: true } }) === 0);
}

// ==================================================================================================================
// pack.* one pull aggroes the whole pack, not the pack next door
// ==================================================================================================================
{
  reset();
  const a = mob('ys_nobet_muhafizi', 12, 0, { packId: 'pk1' });
  const b = mob('ys_nobet_muhafizi', 14, 2, { packId: 'pk1' });
  const c = mob('ys_nobet_muhafizi', 13, -3, { packId: 'pk1' });
  const far = mob('ys_nobet_muhafizi', 60, 0, { packId: 'pk2' });
  H.step(sec(0.6));
  ok('pack.one pull aggroes the whole pack', a.ai.aggroed && b.ai.aggroed && c.ai.aggroed);
  ok('pack.other pack stays asleep', !far.ai.aggroed);
}

// ==================================================================================================================
// social.* pack aggro is the camp only: a pack-less neighbour joins within 10 m AND inside its own aggro range of the target;
// a body pull never chains past that range; another camp is never pulled, the camp mate is pulled at any distance
// ==================================================================================================================
{
  const p = reset();
  const def = { ...ENEMIES.ys_nobet_muhafizi, aggroRange: 14 };
  const pl = mob(null, 12, 0, { def }); // pack-less puller, 12 m from the player
  const near = mob(null, 12, 7, { def }); // 7 m from the puller, 13.9 m from the player: joins
  const edge = mob(null, 20, 0, { def }); // 8 m from the puller, 20 m from the player: outside its aggro range, stays
  const chain = mob(null, 12, 10.5, { def }); // 3.5 m from `near` (body-pull reach), 16 m from the player: stays
  const far = mob(null, 43, 0, { def }); // 31 m from the puller: stays
  pl.ai.acquire(p);
  ok('social.pack-less neighbour 7 m off, inside its aggro range, joins', near.ai.aggroed);
  ok('social.neighbour 8 m off but outside its aggro range stays idle', !edge.ai.aggroed);
  ok('social.no pull at 31 m for a pack-less mob', !far.ai.aggroed);
  H.step(sec(1));
  ok('social.body pull does not chain past the aggro range', !chain.ai.aggroed, `chain ${chain.ai.aggroed}`);

  reset();
  const pa = mob(null, 12, 0, { def, packId: 'cA' });
  const camp = mob(null, 40, 0, { def, packId: 'cA' }); // same camp, 28 m from the puller
  const other = mob(null, 13, 2, { def, packId: 'cB' }); // another camp 1 m away
  pa.ai.acquire(p);
  ok('social.camp mate joins at any distance', camp.ai.aggroed, `dist ${Math.round(dist(camp, pa))} m`);
  ok('social.another camp is never pulled', !other.ai.aggroed);
}

// ==================================================================================================================
// cap.* a level-2 priest in the Balçık Gölü slime camps (r1_c02 and two slime camps 9-10 m away, layout offsets): at most 3
// enemies engaged at once; a touch never pulls another camp; a level-2 slime splits into nothing (level 6+ splits)
// ==================================================================================================================
{
  const p = reset('priest', 2);
  const slimes = [];
  const sl = (x, z, packId) => {
    const m = mob('ow_slime', x, z, { packId, level: 2 });
    slimes.push(m);
    return m;
  };
  // r1_c02 at the player: 2 slimes 3-4 m away (inside a slime's 8 m aggro)
  sl(3, 0, 'r1_c02');
  sl(4.2, 1.3, 'r1_c02');
  // r1_g003 (9.3 m off c02): 2 slimes 7.6-8 m from the player
  sl(-5.25, 5.5, 'r1_g003');
  sl(-4.1, 6.4, 'r1_g003');
  // r1_g108 (9.3 m off c02): 2 slimes ~9.5 m from the player, outside their aggro
  sl(9.5, -1.5, 'r1_g108');
  sl(10.5, -0.5, 'r1_g108');
  let maxEngaged = 0;
  for (let i = 0; i < sec(12); i++) {
    H.step(1);
    maxEngaged = Math.max(maxEngaged, slimes.filter((m) => m.ai.aggroed && m.ai.target === p).length);
  }
  ok('cap.level-2 slime camps: the pull engages', maxEngaged >= 1, "max " + maxEngaged);
  ok('cap.level-2 slime camps: at most 3 engaged at once', maxEngaged <= 3, "max " + maxEngaged);

  // a touch never pulls another camp: camp A's slime is 6 m from the player (sight), camp B's slime stands 2.5 m off it, inside
  // B's aggro range of the player but behind a wall corner (no sight line); B's camp mate is 16 m from the player
  reset('priest', 2);
  const pp = world.localPlayer;
  pp.position.set(-6, 0, 0);
  world.nav.setRect(-1.5, 0.5, -0.5, 1.5, false);
  const a1 = mob('ow_slime', 0, 0, { packId: 'cA', level: 2 });
  mob('ow_slime', 0, -3, { packId: 'cA', level: 2 });
  const b1 = mob('ow_slime', 1.5, 2, { packId: 'cB', level: 2 });
  const b2 = mob('ow_slime', 10, 0, { packId: 'cB', level: 2 });
  H.step(sec(2));
  world.nav.setRect(-1.5, 0.5, -0.5, 1.5, true);
  ok('cap.touch: the near camp engages', a1.ai.aggroed);
  ok('cap.touch: another camp is never pulled by touch', !b1.ai.aggroed && !b2.ai.aggroed, "b1 " + b1.ai.aggroed + " b2 " + b2.ai.aggroed);

  // above level 5 the cap is off: a 4-slime camp pulled from one spot comes in whole
  reset('priest', 8);
  const big = [mob('ow_slime', 3, 0, { packId: 'cD', level: 8 }), mob('ow_slime', 4, 1, { packId: 'cD', level: 8 }), mob('ow_slime', 3, -1, { packId: 'cD', level: 8 }), mob('ow_slime', 4, -2, { packId: 'cD', level: 8 })];
  H.step(sec(1));
  ok('cap.above level 5: the whole camp engages', big.every((m) => m.ai.aggroed), big.filter((m) => m.ai.aggroed).length + "/4");

  // a level-2 slime does not split; a level-6 slime does (two slimelets)
  reset('priest', 2);
  const s2 = mob('ow_slime', 0, 0, { packId: 'cC', level: 2 });
  const s6 = mob('ow_slime', 0, 0, { packId: 'cC', level: 6 });
  const adds = new Map();
  for (const m of [s2, s6]) {
    const rec = [];
    adds.set(m, rec);
    m.ai.spawnAdds = (...args) => rec.push(args);
    m.ai.runDeathEffects(null);
  }
  ok('cap.level-2 slime: no split on death', adds.get(s2).length === 0, adds.get(s2).length + " summons");
  const split = adds.get(s6);
  ok('cap.level-6 slime: splits into two slimelets', split.length === 1 && split[0][0] === 'ow_slimelet' && split[0][1] === 2, JSON.stringify(split.map((a) => a.slice(0, 2))));
}

// ==================================================================================================================
// leash.* a chase past the leash evades home: full reset (HP, DoTs, cooldowns, threat)
// ==================================================================================================================
{
  const p = reset();
  p.position.set(-8, 0, 0);
  const m = mob('ys_nobet_muhafizi', 0, 0);
  H.step(sec(0.5));
  // pull it, then drag the player away (3 m/s) until the body is past its leash (home is the spawn at 0,0)
  ok('leash.pulled before the drag', m.ai.aggroed, `mode ${m.ai.mode}`);
  m.hp = m.maxHp * 0.4;
  m.statuses.apply('burn', 30, { sourceId: m.id });
  let sawReturn = false;
  for (let i = 0; i < sec(25) && !sawReturn; i++) {
    p.position.x -= 0.05;
    H.step(1);
    if (m.ai.mode === 'return') sawReturn = true;
  }
  ok('leash.chase past 30 m starts an evade', sawReturn, `at ${m.position.x.toFixed(1)} m`);
  const hpDuringReturn = m.hp;
  let home = false;
  for (let i = 0; i < sec(15) && !home; i++) {
    H.step(1);
    if (m.ai.mode === 'idle') home = true;
  }
  ok('leash.evade reaches home', home && dist(m, { position: { x: m.homeX, z: m.homeZ } }) < 1.5, `at ${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}`);
  ok('leash.full reset: HP restored', m.hp === m.maxHp, `hp ${m.hp}/${m.maxHp} (was ${hpDuringReturn.toFixed(0)} on the way)`);
  ok('leash.full reset: DoTs and debuffs gone', m.statuses.ids().filter((s) => s !== 'invulnerable').length === 0, m.statuses.ids().join(','));
  ok('leash.full reset: no threat, no cooldowns, not aggroed', m.ai.threat.size === 0 && m.ai.readyAt.size === 0 && !m.ai.aggroed);
}

// ==================================================================================================================
// death.* the player dies to a pulled mob: the mob evades home and resets (WoW), it does not stand damaged where it won
// ==================================================================================================================
{
  const p = reset();
  p.position.set(-14, 0, 0);
  const m = mob('ys_nobet_muhafizi', 0, 0);
  H.step(sec(0.5));
  ok('death.pulled before the player dies', m.ai.aggroed, `mode ${m.ai.mode}`);
  // the mob chases the player away from its home (it has to walk back, so the evade is visible)
  p.position.x = -6;
  H.step(sec(3));
  m.hp = m.maxHp * 0.4;
  m.statuses.apply('burn', 30, { sourceId: m.id });
  const awayFromHome = dist(m, { position: { x: m.homeX, z: m.homeZ } });
  ok('death.mob is away from home when the player dies', awayFromHome > 3, `${awayFromHome.toFixed(1)} m`);
  p.hp = 0;
  p.alive = false;
  // the mob may still be in a windup or a reaction when the player dies: wait for its brain to notice (<= 3 s), then check
  for (let i = 0; i < sec(3) && (m.ai.mode === 'chase' || m.ai.busy); i++) H.step(sec(0.1));
  ok('death.mob drops the dead player and walks home (return, not idle in place)', m.ai.mode === 'return' && m.ai.returning && !m.ai.aggroed, `mode ${m.ai.mode}, aggroed ${m.ai.aggroed}`);
  let home = false;
  for (let i = 0; i < sec(20) && !home; i++) {
    H.step(1);
    if (m.ai.mode === 'idle') home = true;
  }
  ok('death.mob reaches home', home && dist(m, { position: { x: m.homeX, z: m.homeZ } }) < 1.5, `at ${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}`);
  ok('death.mob resets to full HP and drops DoTs', m.hp === m.maxHp && m.statuses.ids().filter((s) => s !== 'invulnerable').length === 0, `hp ${m.hp}/${m.maxHp}, ${m.statuses.ids().join(',')}`);
  // the revived player standing in the camp is a fresh pull, not a fight carried over
  p.hp = p.maxHp; p.alive = true;
  H.step(sec(1));
  ok('death.revived player at the camp: the reset mob is fresh (threat empty before the new pull)', m.ai.threat.size <= 1 && m.hp === m.maxHp);
}

// ==================================================================================================================
// caster.* keeps range, casts an interruptible spell with a cast bar, a heavy hit cuts the cast
// ==================================================================================================================
{
  const p = reset();
  const c = mob('ys_nobet_buyucusu', 12, 0);
  let minD = Infinity, sawBar = false, sawInterruptible = false;
  for (let i = 0; i < sec(9); i++) {
    H.step(1);
    if (i > sec(2) && c.ai.aggroed) minD = Math.min(minD, dist(c, p));
    if (c.cast) sawBar = true;
    if (c.cast?.interruptible) sawInterruptible = true;
  }
  ok('caster.keeps range (never closer than 7.5 m after the first 2 s)', minD >= 7.5, `closest ${minD.toFixed(2)} m`);
  ok('caster.casts with a cast bar', sawBar);
  ok('caster.cast bar is interruptible', sawInterruptible);

  // a heavy hit (crit) cuts whatever cast is up
  let cut = false;
  for (let i = 0; i < sec(6) && !cut; i++) {
    H.step(1);
    if (c.ai.busy?.castId) {
      c.ai.onDamageEvent({ sourceId: p.id, amount: c.maxHp * 0.3, crit: true });
      cut = !c.cast && !c.ai.busy;
    }
  }
  ok('caster.heavy hit interrupts the cast', cut);
}

// ==================================================================================================================
// healer.* heals a hurt ally, leaves a healthy one alone
// ==================================================================================================================
{
  const p = reset();
  const h = mob('ys_gece_rahibi', 10, 0, { packId: 'pk3' });
  const hurt = mob('ys_nobet_muhafizi', 12, 3, { packId: 'pk3' });
  hurt.hp = hurt.maxHp * 0.4;
  H.step(sec(9)); // kit stagger: the heal is first ready at 4 s, then casts 2 s
  ok('healer.heals a hurt ally', healsTo(hurt.id) > 0 && hurt.hp > hurt.maxHp * 0.4, `hp ${(hurt.hp / hurt.maxHp * 100).toFixed(0)} %`);

  reset();
  const h2 = mob('ys_gece_rahibi', 10, 0, { packId: 'pk4' });
  const fine = mob('ys_nobet_muhafizi', 12, 3, { packId: 'pk4' });
  fine.hp = fine.maxHp * 0.9;
  const before = healsTo(fine.id);
  H.step(sec(6));
  ok('healer.ignores an ally at 90 %', healsTo(fine.id) === before && before === 0, `heals ${healsTo(fine.id) - before}`);
  void h2;
}

// ==================================================================================================================
// flee.* a humanoid at 20 % HP runs off and calls the pack within 14 m; a swarm beast does not run
// ==================================================================================================================
{
  const p = reset();
  const caster = mob('ys_nobet_buyucusu', 10, 0, { packId: 'pk5' });
  const ally = mob('ys_nobet_muhafizi', 20, 6); // 11.7 m from the caster: outside the 10 m social pull, inside the 14 m call
  H.step(sec(0.5));
  ok('flee.setup: caster aggroed, ally still idle', caster.ai.aggroed && !ally.ai.aggroed, `ally aggroed ${ally.ai.aggroed}`);
  caster.hp = caster.maxHp * 0.15;
  caster.ai.onDamageEvent({ sourceId: p.id, amount: 10, crit: false });
  ok('flee.humanoid at 15 % HP starts fleeing', caster.ai.fleeing);
  ok('flee.calls the nearby ally onto the attacker', ally.ai.aggroed);
  // The flee point is re-picked every 1.3 s, so the gap can wobble while it runs: sample the 3 s window every 0.1 s and pass on the
  // peak gap (2 m clear of the start at any sample) instead of the end sample alone
  const d0 = dist(caster, p);
  let dPeak = d0;
  for (let i = 0; i < 30; i++) {
    H.step(sec(0.1));
    dPeak = Math.max(dPeak, dist(caster, p));
  }
  const d1 = dist(caster, p);
  ok('flee.runs away from the player', dPeak > d0 + 2, `${d0.toFixed(1)} m -> peak ${dPeak.toFixed(1)} m, end ${d1.toFixed(1)} m`);
  H.step(sec(6));
  ok('flee.stops after its window and fights again', !caster.ai.fleeing);

  reset();
  const swarm = mob('ys_mana_yutan', -8, 0, { packId: 'pk6' });
  H.step(sec(0.5));
  ok('flee.setup: swarm beast aggroed', swarm.ai.aggroed);
  swarm.hp = swarm.maxHp * 0.1;
  swarm.ai.onDamageEvent({ sourceId: p.id, amount: 10, crit: false });
  ok('flee.swarm beast does not flee', !swarm.ai.fleeing);
}

// ==================================================================================================================
// elite.* elite specials are telegraphed with a windup of at least 0.9 s; trash specials are not
// ==================================================================================================================
{
  const p = reset();
  const special = ENEMIES.ys_nobet_muhafizi.abilities.find((a) => a.kind === 'melee');
  const eliteDef = { ...ENEMIES.ys_nobet_muhafizi, id: 'test_elite_guard', rank: 'elite' };
  const trash = mob('ys_nobet_muhafizi', 0, 0);
  const elite = mob(null, 0, 8, { def: eliteDef });
  const rec = new Map();
  for (const ai of [trash.ai, elite.ai]) {
    const orig = ai.shape.bind(ai);
    rec.set(ai, []);
    ai.shape = (o) => { rec.get(ai).push(o); return orig(o); };
  }
  trash.ai.startAbility(special, p);
  elite.ai.startAbility(special, p);
  const tb = trash.ai.busy, eb = elite.ai.busy;
  ok('elite.trash special: no telegraph', rec.get(trash.ai).every((o) => !o.telegraph));
  ok('elite.elite special: telegraphed', rec.get(elite.ai).some((o) => o.telegraph));
  ok('elite.elite windup at least 0.9 s', !!eb && eb.delay >= 0.9 - 1e-6, eb ? `delay ${eb.delay.toFixed(2)}` : 'no busy');
  ok('elite.trash windup not stretched', !!tb && tb.delay < 0.9, tb ? `delay ${tb.delay.toFixed(2)}` : 'no busy');
}

// ==================================================================================================================
// stuck.* no route to the target: the body repaths, then evades home (not a stand-off forever)
// ==================================================================================================================
{
  const p = reset();
  p.position.set(10, 0, 0);
  world.nav.setRect(4.5, -99, 5.5, 99, false); // a wall the whole length of the map: no route, no sight line
  const m = mob('ys_nobet_muhafizi', 0, 0);
  m.ai.acquire(p, true);
  let evaded = false;
  for (let i = 0; i < sec(7) && !evaded; i++) {
    H.step(1);
    if (m.ai.mode === 'return') evaded = true;
  }
  world.nav.setRect(4.5, -99, 5.5, 99, true);
  ok('stuck.no route: evades home within ~6 s', evaded, `mode ${m.ai.mode}`);
}

// ==================================================================================================================
// wall.* a charge stops at the wall on its line, the body never ends up inside it
// ==================================================================================================================
{
  const p = reset();
  p.position.set(14, 0, 0);
  world.nav.setRect(6.5, -99, 7.5, 99, false);
  const m = mob('ys_zumrut_kopek', 0, 0);
  m.ai.acquire(p, true);
  const charge = ENEMIES.ys_zumrut_kopek.abilities.find((a) => a.kind === 'charge');
  m.ai.startAbility(charge, p);
  let maxX = -Infinity;
  for (let i = 0; i < sec(3) && (m.ai.busy || m.forcedMove); i++) {
    H.step(1);
    maxX = Math.max(maxX, m.position.x);
  }
  world.nav.setRect(6.5, -99, 7.5, 99, true);
  ok('wall.charge stops before the wall (x < 6.5)', maxX < 6.5, `max x ${maxX.toFixed(2)}`);
  ok('wall.charge really moved (x > 1)', maxX > 1, `max x ${maxX.toFixed(2)}`);
}

// ==================================================================================================================
// cap.engage.* unprompted engagements obey the low-level cap (PULL_CAP 3 engaged on one target, level <= 5): a summon or respawn spawned
// into combat (acquire) and sight pulls. A mob the player hits always fights back (WoW): the player's own AoE / DoT engages every mob it hits.
// ==================================================================================================================
{
  const p = reset('priest', 2);
  // 6 idle level-3 mobs, 4 m apart, aggroRange 0 so only a hit can wake them (no sight or touch pull)
  const quiet = { ...ENEMIES.ys_nobet_muhafizi, aggroRange: 0 };
  const row = [0, 1, 2, 3, 4, 5].map((i) => mob(null, 12 + i * 4, 0, { def: quiet, level: 3 }));
  for (const m of row) m.ai.onDamaged(p.id, 5);
  const hit = row.filter((m) => m.ai.aggroed).length;
  ok('cap.engage.AoE hit on six idle level-3 mobs: every hit mob fights back', hit === 6, `engaged ${hit}/6`);

  // a summon or respawn spawned into the fight is refused while the target is at the cap
  const late = mob(null, 40, 0, { def: quiet, level: 3 });
  late.ai.acquire(p, true);
  ok('cap.engage.summon / respawn into combat is refused at the cap', !late.ai.aggroed, `late aggroed ${late.ai.aggroed}`);

  // sight pull: six level-3 mobs 8-12 m off, each with its own aggro range: the cap still holds over 2 s
  const p2 = reset('priest', 2);
  const seer = { ...ENEMIES.ys_nobet_muhafizi, aggroRange: 14 };
  const pack = [0, 1, 2, 3, 4, 5].map((i) => mob(null, 8 + i * 0.8, i * 4 - 10, { def: seer, level: 3 }));
  let maxSight = 0;
  for (let i = 0; i < sec(2); i++) {
    H.step(1);
    maxSight = Math.max(maxSight, pack.filter((m) => m.ai.aggroed && m.ai.target === p2).length);
  }
  ok('cap.engage.sight pull of six level-3 mobs holds at most 3', maxSight >= 1 && maxSight <= 3, `max ${maxSight}`);
}

// ==================================================================================================================
// camp.* a camp member's chase ends at its camp (centre + radius + 20 m), not 40 m from its spawn; an escort NPC walking by
// 15 m away does not pull the camp; a hit from a non-player source does not pull a player outside the mob's own aggro range
// ==================================================================================================================
{
  const { EscortNpc } = await H.imp('entities/interactables/EscortNpc.ts');
  const CAMP_R = 6;
  const CAP = CAMP_R + 20 + 2; // camp leash + 2 m for the last step of the chase
  /** Three level-3 goblins of one camp at the origin (camp centre (0, 0), radius 6): each member's camp fields set as CampDirector does. */
  const camp = (packId) => {
    const ms = [[3, 0], [-2, 2.5], [0.5, -3.5]].map(([x, z]) => mob('ow_goblin', x, z, { packId, level: 3 }));
    for (const m of ms) { m.campX = 0; m.campZ = 0; m.campR = CAMP_R; }
    return ms;
  };
  const campDist = (m) => Math.hypot(m.position.x, m.position.z);

  // chase: the player pulls a member from 5 m and walks off at 6 m/s; the whole camp stays inside its leash
  const p1 = reset('knight', 2);
  const c1 = camp('camp_leash');
  p1.position.set(8, 0, 0);
  let engaged = false, farthest = 0;
  for (let i = 0; i < sec(30); i++) {
    p1.position.x += 6 * DT;
    H.step(1);
    engaged ||= c1.some((m) => m.ai.aggroed);
    for (const m of c1) farthest = Math.max(farthest, campDist(m));
  }
  ok('camp.leash.the camp engages when its member is pulled', engaged);
  ok('camp.leash.a chasing member never leaves its camp past radius + 20 m', farthest <= CAP, `farthest ${farthest.toFixed(1)} m (cap ${CAP} m)`);
  H.step(sec(12)); // the player is now ~200 m away: every member evades home
  ok('camp.leash.the camp evades home once the player is gone', c1.every((m) => !m.ai.aggroed && campDist(m) <= CAMP_R + 1), c1.map((m) => `${campDist(m).toFixed(1)}m/${m.ai.mode}`).join(' '));

  // an escort NPC walks past the camp 15 m away (2 m/s): no member aggroes, none moves off its spot
  const p2 = reset('knight', 2);
  p2.position.set(-60, 0, 0); // 60 m from the camp: outside every aggro range
  const c2 = camp('camp_escort');
  const home2 = c2.map((m) => [m.position.x, m.position.z]);
  const npc = new EscortNpc(H.world.allocLocalId(), 'Yaralı Gözcü', () => {}, () => 'eskortu başlat [F]', () => true);
  npc.position.set(-30, 0, 15);
  H.world.add(npc);
  for (let i = 0; i < sec(20); i++) {
    npc.position.x += 2 * DT;
    H.step(1);
  }
  ok('camp.escort.an escort NPC walking 15 m off does not pull the camp', c2.every((m) => !m.ai.aggroed), c2.map((m) => m.ai.mode).join(','));
  ok('camp.escort.the camp stays on its spots while the escort walks by', c2.every((m, i) => Math.hypot(m.position.x - home2[i][0], m.position.z - home2[i][1]) < 1), 'a member moved');

  // a non-player hit (a pet, a minion, a hazard with no source) on an unaware camp: no player 50 m away is pulled
  const p3 = reset('knight', 2);
  p3.position.set(50, 0, 0);
  const c3 = camp('camp_hit');
  c3[0].ai.onDamaged(null, 5);
  ok('camp.hit.a non-player hit does not pull a player 50 m away', c3.every((m) => !m.ai.aggroed), `aggroed ${c3.filter((m) => m.ai.aggroed).length}/3`);
}

// ==================================================================================================================
// flee.ground.* a fleeing neutral deer (camp leash) runs only to ground its camp can walk to. A stone step (a plateau 1.2 m high,
// standable in the grid but above the 0.45 m step rule, in the deer's line of sight) is never a run point, and a deer that ends up
// on one evades home (a body it cannot walk off).
// ==================================================================================================================
{
  const nav = world.nav;
  // plateau x 6..14, z -7..7 at 1.2 m; the flat ground is 0 m. Terrain grid: nav.floor is set, nav.region stays null
  const stepH = (x, z) => (x >= 6 && x <= 14 && Math.abs(z) <= 7 ? 1.2 : 0);
  const onStep = (x, z) => stepH(x, z) > 0.5;
  const terrain = () => nav.attachTerrain({ groundY: stepH, flagsAt: () => 0 });
  const flat = () => { nav.floor = null; nav.hf = null; nav.flags = null; nav.terrain = false; };

  reset();
  terrain();
  const p = reset('knight', 10); // reset() re-lays the flat walkable cells; the terrain heights stay
  p.position.set(-4, 0, 0);
  const deer = mob('ow_deer', 0, 0);
  deer.campX = 0;
  deer.campZ = 0;
  deer.campR = 4;
  deer.ai.onDamaged(p.id, 5);
  H.step(sec(0.5));
  ok('flee.ground.setup: hit deer is aggroed and running', deer.ai.aggroed, `mode ${deer.ai.mode}`);
  const d0 = dist(deer, p);
  let dPeak = d0, badTargets = 0, onStepSamples = 0;
  for (let i = 0; i < 100; i++) {
    H.step(sec(0.1));
    dPeak = Math.max(dPeak, dist(deer, p));
    if (deer.ai.aggroed && onStep(deer.ai.fleeX, deer.ai.fleeZ)) badTargets++;
    if (onStep(deer.position.x, deer.position.z)) onStepSamples++;
  }
  ok('flee.ground.the deer runs away from the player', dPeak > d0 + 2, `${d0.toFixed(1)} m -> peak ${dPeak.toFixed(1)} m`);
  ok('flee.ground.no run point is on the stone step', badTargets === 0, `${badTargets} of 100 samples aimed at the step`);
  ok('flee.ground.the deer never stands on the stone step', onStepSamples === 0, `${onStepSamples} of 100 samples on the step`);

  // a deer that ends up on the step (no route off it by its own pick) evades home instead of standing there
  reset();
  const p2 = reset('knight', 10);
  p2.position.set(-4, 0, 0);
  const stuck = mob('ow_deer', 10, 0);
  stuck.position.y = 1.2; // standing on the step (the body rides the floor height)
  stuck.homeX = 0; // its camp centre (the home it evades to), not the step it was spawned on
  stuck.homeZ = 0;
  stuck.campX = 0;
  stuck.campZ = 0;
  stuck.campR = 4;
  stuck.ai.onDamaged(p2.id, 5);
  H.step(sec(2));
  const left = !onStep(stuck.position.x, stuck.position.z) && Math.hypot(stuck.position.x - 10, stuck.position.z) > 3;
  ok('flee.ground.a deer on an unreachable step evades home, off the step', left, `mode ${stuck.ai.mode} at ${stuck.position.x.toFixed(1)},${stuck.position.z.toFixed(1)}`);
  flat();
  reset();
}

// ==================================================================================================================
// neutral.* a neutral critter (deer: ai.neutral) never aggroes on sight, wanders idly around its home, and runs only once hit.
// A treasure goblin (ai.flee without neutral) still runs off when a player comes near.
// ==================================================================================================================
{
  reset();
  const p = reset('knight', 10);
  p.position.set(-8, 0, 0); // 8 m from the deer: inside its 14 m aggro range
  const deer = mob('ow_deer', 0, 0);
  let aggro = false, moved = 0;
  for (let i = 0; i < 30; i++) {
    H.step(sec(0.5));
    aggro = aggro || deer.ai.aggroed;
    moved = Math.max(moved, Math.hypot(deer.position.x, deer.position.z));
  }
  ok('neutral.deer never aggroes on sight', !aggro, `aggroed ${aggro} (15 s, player 8 m away)`);
  ok('neutral.deer wanders idly around its home', moved > 1, `furthest ${moved.toFixed(1)} m from home`);

  // a fresh deer on a known spot for the hit: the attacker stands 8 m away
  reset();
  const p3 = reset('knight', 10);
  p3.position.set(-8, 0, 0);
  const hit = mob('ow_deer', 0, 0);
  const d0 = dist(hit, p3);
  hit.ai.onDamaged(p3.id, 5); // a hit: the deer runs
  H.step(sec(0.5));
  ok('neutral.hit deer is aggroed and runs', hit.ai.aggroed, `mode ${hit.ai.mode}`);
  let dPeak = dist(hit, p3);
  for (let i = 0; i < 25; i++) {
    H.step(sec(0.1));
    dPeak = Math.max(dPeak, dist(hit, p3));
  }
  ok('neutral.hit deer gains distance from the attacker', dPeak > d0 + 2, `${d0.toFixed(1)} m -> peak ${dPeak.toFixed(1)} m`);

  reset();
  const p2 = reset('knight', 10);
  p2.position.set(-8, 0, 0);
  const gob = mob('treasure_goblin', 0, 0);
  H.step(sec(1));
  ok('neutral.treasure goblin (flee, not neutral) still runs off near a player', gob.ai.aggroed, `mode ${gob.ai.mode}`);
}

// ---- report ---------------------------------------------------------------------------------------------------------------
const hard = errors.filter((e) => e.startsWith('ERR'));
ok('no engine errors during the run', hard.length === 0, hard.slice(0, 3).join(' | '));
console.log(fails === 0 ? `ALL PASS (${passes} passed, ${fails} failed)` : `FAILED (${passes} passed, ${fails} failed)`);
process.exit(fails === 0 ? 0 : 1);
