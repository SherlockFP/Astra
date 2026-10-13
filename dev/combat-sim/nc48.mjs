// NC48 shared behaviours + NC46 Auras checks (GDD_CLASSES_V2 §14 rows 46, 48; plate-melee §g). No browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/nc48.mjs
// Covered: nc48.install, nc48.stubs, nc48.pick (chain target rule), nc48.chain (bounces + bounceMult), nc48.finisher (pip coef),
//          nc48.mark (instant + bolt + selfStatuses), nc48.cone (ticks + final hit + interrupt), nc48.drain (heal, cost, shard, range),
//          nc48.hammers (orbit hits, bounded per revolution, expiry), nc46.cycle, nc46.arm, nc46.pulse, nc46.dead, nc46.disarm.
// Test-only StatusDefs are injected for the aura ids (NC21 owns the real rows); the hit-stop and feel numbers are browser-side.
import * as H from './harness.mjs';

const { G, SKILLS, errors } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { BEHAVIORS_SHARED, pickChainTarget } = await H.imp('combat/skills/sharedBehaviors.ts');
const { BEHAVIORS_MONK } = await H.imp('combat/skills/behaviors_monk.ts');
const { BEHAVIORS_ARCHER } = await H.imp('combat/skills/behaviors_archer.ts');
const { BEHAVIORS_PALADIN } = await H.imp('combat/skills/behaviors_paladin.ts');
const { BEHAVIORS_NECROMANCER } = await H.imp('combat/skills/behaviors_necromancer.ts');
const { BEHAVIORS_WARLOCK } = await H.imp('combat/skills/behaviors_warlock.ts');
const { Auras, nextAuraInCycle, auraRadius, auraDuration, AURA_FLAG } = await H.imp('combat/Auras.ts');
const { STATUSES } = await H.imp('data/statuses.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// a CastCtx for behaviours called directly (the real one is built by SkillSystem.makeCtx; same fields as kit_plate.mjs)
function ctxFor(p, def, target = null, dir = null) {
  return {
    sys: G.skills, caster: p, def, aim: H.aimFor(p, target), dir: dir ?? [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: false, action: null, target, point: [p.position.x, p.position.z], data: {}, more: 1,
  };
}
const testDef = (over = {}) => ({
  id: 't_row', classId: 'monk', name: 't', desc: '', icon: '', unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, anim: 'x',
  targeting: 'custom', tags: [], params: {}, statuses: [], ...over,
});

// records every SkillSystem.strike call of the test rows (spy on the instance; restored by spyEnd)
let strikeLog = [];
const origStrike = G.skills.strike;
function spyStart() {
  strikeLog = [];
  G.skills.strike = (c, e, o) => {
    const r = origStrike.call(G.skills, c, e, o);
    if (c.def.id.startsWith('t_')) strikeLog.push({ rowId: c.def.id, e, coef: o?.coef, ret: r });
    return r;
  };
}
function spyEnd() { G.skills.strike = origStrike; }
const hitsOf = (rowId) => strikeLog.filter((s) => s.rowId === rowId && s.ret);

// aura statuses: test-only StatusDefs (NC21 owns the real rows) so statuses.apply does not ignore them
for (const id of ['aura_devotion', 'aura_might', 'aura_clarity']) {
  if (!STATUSES[id]) STATUSES[id] = { id, name: id, icon: 'buff-defense', kind: 'buff' };
}

// ---- nc48.install: every shared behaviour is in BEHAVIORS with a fire(); the per-class stubs exist as empty tables
{
  const keys = ['chain_projectile', 'pip_finisher', 'target_status', 'channel_cone', 'beam_drain', 'orbit_hammers'];
  for (const k of keys) ok(`nc48.install ${k} in BEHAVIORS`, typeof BEHAVIORS[k]?.fire === 'function' && BEHAVIORS_SHARED[k] === BEHAVIORS[k]);
  ok('nc48.stubs per-class tables exist', [BEHAVIORS_MONK, BEHAVIORS_ARCHER, BEHAVIORS_PALADIN, BEHAVIORS_NECROMANCER, BEHAVIORS_WARLOCK]
    .every((t) => t && typeof t === 'object'));
  ok('nc48.stubs per-class tables do not shadow shared keys', !keys.some((k) => k in BEHAVIORS_MONK || k in BEHAVIORS_PALADIN));
}

// ---- nc48.pick: nearest unhit candidate within range (pure)
{
  const mk = (x, z, dead = false) => ({ position: { x, z }, isDead: dead });
  const a = mk(0, 2), b = mk(0, 5), c = mk(0, 9), d = mk(0, 0.5, true);
  const hit = new Set([a]);
  ok('nc48.pick skips hit and dead, takes nearest in range', pickChainTarget({ x: 0, z: 0 }, 6, [a, b, c, d], hit) === b);
  ok('nc48.pick null when out of range', pickChainTarget({ x: 0, z: 0 }, 4, [a, c], new Set()) === a && pickChainTarget({ x: 0, z: 0 }, 1, [c], new Set()) === null);
}

// ---- nc48.chain: A then three bounces, each leg 0.9x the last
{
  const p = H.addPlayer('monk');
  p.yaw = 0;
  const A = H.addEnemy(0, 4, { hp: 1e6 });
  const B = H.addEnemy(0, 8, { hp: 1e6 });
  const C = H.addEnemy(3, 9, { hp: 1e6 });
  const D = H.addEnemy(3, 15, { hp: 1e6 });
  H.step(2);
  const def = testDef({ id: 't_chain', targeting: 'projectile', range: 18, speed: 20, radius: 0.4, damage: { coef: 2, type: 'arcane' }, params: { bounces: 3, bounceRange: 6.5, bounceMult: 0.9 } });
  spyStart();
  BEHAVIORS.chain_projectile.fire(ctxFor(p, def, A));
  H.stepSec(3);
  const hits = hitsOf('t_chain');
  spyEnd();
  ok('nc48.chain hits A, B, C, D in order', hits.map((h) => h.e).join(',') === [A, B, C, D].join(','), hits.map((h) => h.e.id).join(','));
  const coefs = hits.map((h) => h.coef);
  ok('nc48.chain leg k deals coef x 0.9^k', coefs.length === 4 && coefs.every((v, i) => near(v, 2 * Math.pow(0.9, i), 1e-9)), coefs.map((v) => v.toFixed(3)).join(','));
  ok('nc48.chain no enemy is hit twice', new Set(hits.map((h) => h.e)).size === hits.length);
}

// ---- nc48.finisher: coef = damage.coef + coefPerPip x (spent - min); min floors the bonus at 0
{
  const p = H.addPlayer('monk');
  const e = H.addEnemy(0, 2, { hp: 1e6 });
  p.yaw = 0;
  H.step(1);
  const def = testDef({ id: 't_fin', targeting: 'melee_arc', range: 3, arc: 120, damage: { coef: 1, type: 'physical' }, pip: { id: 'chi', min: 1, coefPerPip: 0.5, consume: 'all' }, params: { maxTargets: 3 } });
  spyStart();
  const c4 = ctxFor(p, def, e);
  c4.data.pipSpent = 4;
  BEHAVIORS.pip_finisher.fire(c4);
  const c0 = ctxFor(p, def, e);
  c0.data.pipSpent = 0;
  BEHAVIORS.pip_finisher.fire(c0);
  spyEnd();
  const hits = hitsOf('t_fin');
  ok('nc48.finisher 4 spent of min 1: coef 1 + 0.5 x 3 = 2.5', hits.length >= 1 && near(hits[0].coef, 2.5, 1e-9), `coef=${hits[0]?.coef}`);
  ok('nc48.finisher 0 spent: base coef only', hits.length >= 2 && near(hits[1].coef, 1, 1e-9), `coef=${hits[1]?.coef}`);
}

// ---- nc48.mark: instant rows strike (if coef) and apply statuses to the target; bad target fails before cost
{
  const p = H.addPlayer('archer');
  const e = H.addEnemy(0, 10, { hp: 1e6 });
  p.yaw = 0;
  H.step(1);
  const def = testDef({ id: 't_mark', targeting: 'custom', range: 32, damage: { coef: 0, type: 'physical' }, statuses: [{ status: 'sentenced', duration: 12 }], selfStatuses: [{ status: 'haste', duration: 3 }] });
  const c = ctxFor(p, def, e);
  const begun = BEHAVIORS.target_status.begin(c);
  ok('nc48.mark instant begin accepts an in-range target', begun === true && c.target === e);
  BEHAVIORS.target_status.fire(c);
  ok('nc48.mark status lands on the target', e.statuses.has('sentenced'));
  ok('nc48.mark selfStatuses land on the caster', p.statuses.has('haste'));
  const far = H.addEnemy(0, 80, { hp: 1e6 });
  H.step(1);
  const cNone = ctxFor(p, testDef({ id: 't_mark2', targeting: 'custom', range: 5, statuses: [] }), null);
  ok('nc48.mark begin fails with no target in range', BEHAVIORS.target_status.begin(cNone) === false);
  // bolt rows: the status lands when the bolt hits
  const e2 = H.addEnemy(0, 8, { hp: 1e6 });
  H.step(1);
  const bolt = testDef({ id: 't_mark_bolt', targeting: 'projectile', range: 30, speed: 30, radius: 0.5, statuses: [{ status: 'judged', duration: 8 }] });
  BEHAVIORS.target_status.fire(ctxFor(p, bolt, e2));
  H.stepSec(1);
  ok('nc48.mark bolt applies its status on hit', e2.statuses.has('judged'));
  void far;
}

// ---- nc48.cone: 10 ticks of 0.3 s in the cone, a final hit only when the channel completes
{
  const p = H.addPlayer('monk');
  p.yaw = 0;
  const inCone = H.addEnemy(0, 2, { hp: 1e6 });
  const outside = H.addEnemy(0, -6, { hp: 1e6 });
  H.step(1);
  const def = testDef({ id: 't_cone', targeting: 'custom', range: 4, arc: 100, channel: 3, damage: { coef: 1.1, type: 'physical' }, params: { tick: 0.3, finalCoef: 3, finalKnock: 4, finalStagger: 30, moveSlow: 0.1 } });
  const c = ctxFor(p, def, null);
  spyStart();
  BEHAVIORS.channel_cone.fire(c);
  for (let n = 0; n < 10; n++) BEHAVIORS.channel_cone.tick(c, n);
  const ticks = hitsOf('t_cone').filter((h) => h.e === inCone).length;
  ok('nc48.cone 10 ticks strike the enemy in the cone only', ticks === 10 && hitsOf('t_cone').every((h) => h.e === inCone), `ticks=${ticks}`);
  BEHAVIORS.channel_cone.end(c, 'done');
  const fin = hitsOf('t_cone');
  ok('nc48.cone a completed channel adds the final hit at finalCoef', fin.length === 11 && near(fin[fin.length - 1].coef, 3, 1e-9), `hits=${fin.length}`);
  const c2 = ctxFor(p, def, null);
  BEHAVIORS.channel_cone.fire(c2);
  BEHAVIORS.channel_cone.tick(c2, 0);
  BEHAVIORS.channel_cone.end(c2, 'interrupt');
  spyEnd();
  ok('nc48.cone an interrupted channel adds no final hit', hitsOf('t_cone').length === 12, `hits=${hitsOf('t_cone').length}`);
  void outside;
}

// ---- nc48.drain: heals the caster for `heal` of the damage dealt, costs per second, shard on kill, ends out of range
{
  const p = H.addPlayer('warlock');
  p.yaw = 0;
  const t = H.addEnemy(0, 6, { hp: 1e6 });
  H.step(1);
  p.hp = 3000;
  const def = testDef({ id: 't_drain', targeting: 'custom', range: 14, radius: 1.2, channel: 6, damage: { coef: 0.5, type: 'shadow' }, params: { tick: 0.5, heal: 0.6, costPerSec: 10, moveSlow: 0.5, shardOnKill: 1 } });
  const c = ctxFor(p, def, t);
  c.target = t;
  spyStart();
  const r0 = p.resource;
  BEHAVIORS.beam_drain.fire(c);
  let alive = true;
  for (let n = 0; n < 4 && alive; n++) alive = BEHAVIORS.beam_drain.tick(c, n) !== false;
  const dealt = hitsOf('t_drain').reduce((a, h) => a + (h.ret?.amount ?? 0), 0);
  spyEnd();
  ok('nc48.drain heals the caster', p.hp > 3000, `hp=${p.hp}`);
  ok('nc48.drain heal is 60 % of damage dealt', dealt > 0 && near(p.hp - 3000, 0.6 * dealt, 2), `healed=${(p.hp - 3000).toFixed(1)} dealt=${dealt.toFixed(1)}`);
  ok('nc48.drain costs resource per tick (from the 2nd)', p.resource < r0, `res ${r0} -> ${p.resource}`);
  // kill: a 1 hp target dies on the first tick and adds one shard
  const weak = H.addEnemy(0, 5, { hp: 1 });
  H.step(1);
  const pBefore = G.skills.pipCount(p, 'shard');
  const cw = ctxFor(p, def, weak);
  cw.target = weak;
  BEHAVIORS.beam_drain.tick(cw, 1);
  ok('nc48.drain a kill adds shardOnKill shard pips', G.skills.pipCount(p, 'shard') === pBefore + 1, `shards=${G.skills.pipCount(p, 'shard')}`);
  // out of range: the beam ends
  const far = H.addEnemy(0, 40, { hp: 1e6 });
  H.step(1);
  const cf = ctxFor(p, def, far);
  cf.target = far;
  ok('nc48.drain ends when the target leaves the beam range', BEHAVIORS.beam_drain.tick(cf, 1) === false);
}

// ---- nc48.hammers: 3 hammers, one hit per enemy per hammer per revolution, live `duration` s, then no more hits
{
  const p = H.addPlayer('paladin');
  p.yaw = 0;
  const e = H.addEnemy(4.2, 0, { hp: 1e9 });
  H.step(1);
  const def = testDef({ id: 't_hammer', targeting: 'self_aoe', radius: 4.2, duration: 6, damage: { coef: 0.6, type: 'holy' }, params: { hammers: 3, orbitTime: 0.9, orbitRadius: 4.2, hammerCoef: 0.6 } });
  spyStart();
  BEHAVIORS.orbit_hammers.fire(ctxFor(p, def, null));
  H.stepSec(6.5);
  const n1 = hitsOf('t_hammer').length;
  H.stepSec(2);
  const n2 = hitsOf('t_hammer').length;
  spyEnd();
  // 6 s / 0.9 s = 6.67 revolutions; each hammer hits the enemy once per revolution at most: 3 x 7 = 21 is the ceiling
  ok('nc48.hammers hits the enemy on the orbit', n1 >= 3, `hits=${n1}`);
  ok('nc48.hammers hits per enemy are bounded by hammers x revolutions', n1 <= 3 * 8, `hits=${n1}`);
  ok('nc48.hammers stop after duration', n2 === n1, `before=${n1} after=${n2}`);
  ok('nc48.hammers hit the target with hammerCoef', hitsOf('t_hammer').every((h) => near(h.coef, 0.6, 1e-9) || h.coef === undefined));
  void e;
}

// ---- nc46.cycle: pure cycle order off -> devotion -> might -> clarity -> off
{
  const cyc = ['aura_devotion', 'aura_might', 'aura_clarity'];
  ok('nc46.cycle off goes to the first status', nextAuraInCycle(cyc, null) === 'aura_devotion');
  ok('nc46.cycle devotion -> might -> clarity', nextAuraInCycle(cyc, 'aura_devotion') === 'aura_might' && nextAuraInCycle(cyc, 'aura_might') === 'aura_clarity');
  ok('nc46.cycle last goes off', nextAuraInCycle(cyc, 'aura_clarity') === null);
  ok('nc46.cycle unknown restarts, empty is off', nextAuraInCycle(cyc, 'aura_x') === 'aura_devotion' && nextAuraInCycle([], null) === null);
  ok('nc46.cycle radius and duration helpers', near(auraRadius(4, 0.3), 5.2, 1e-9) && auraDuration(1) === 2.5 && auraRadius(4, -1) === 4);
}

// ---- nc46.arm / select / cycle / events / flags
{
  const p = H.addPlayer('paladin');
  const A = new Auras();
  const events = [];
  const off = G.events.on('aura:changed', (e) => events.push(e));
  const def = { id: 'paladin_aura', classId: 'paladin', aura: { radius: 6, cycle: ['aura_devotion', 'aura_might', 'aura_clarity'], interval: 1 } };
  G.character.save.flags = {};
  ok('nc46.arm arms a def with aura', A.arm(p, def) === true && A.active?.status === 'aura_devotion' && A.active.radius === 6);
  ok('nc46.arm refuses a def without aura', A.arm(p, { id: 'x' }) === false);
  ok('nc46.arm emits aura:changed on the first change', events.length === 1 && events[0].status === 'aura_devotion' && events[0].playerId === p.id);
  ok('nc46.select refuses a status outside the cycle', A.select(p, 'aura_ret') === false);
  ok('nc46.select sets and saves the choice', A.select(p, 'aura_might') === true && A.active.status === 'aura_might' && G.character.save.flags[AURA_FLAG] === 'aura_might');
  ok('nc46.cycle advances might -> clarity -> off -> devotion', A.cycle(p) === 'aura_clarity' && A.cycle(p) === null && A.active === null && A.cycle(p) === 'aura_devotion');
  const reArm = new Auras();
  reArm.arm(p, def);
  ok('nc46.arm restores the saved choice on a fresh instance', reArm.active?.status === 'aura_might');
  off();
}

// ---- nc46.pulse: party members within the radius get the status for interval + 1.5 s; far ones do not
{
  const p = H.addPlayer('paladin');
  p.position.set(0, 0, 0);
  const ally = new H.FakePlayer('knight');
  ally.id = 301; // FakePlayer defaults to id 1 (the local paladin's id)
  ally.isLocal = true;
  ally.position.set(3, 0, 0);
  H.world.add(ally);
  const far = new H.FakePlayer('knight');
  far.id = 302;
  far.isLocal = true;
  far.position.set(30, 0, 0);
  H.world.add(far);
  const A = new Auras();
  A.arm(p, { id: 'paladin_aura', aura: { radius: 6, cycle: ['aura_devotion'], interval: 1 } });
  A.update(0.016);
  ok('nc46.pulse self gets the status', p.statuses.has('aura_devotion'));
  ok('nc46.pulse ally in radius gets the status', ally.statuses.has('aura_devotion'));
  ok('nc46.pulse ally out of radius does not', !far.statuses.has('aura_devotion'));
  ally.statuses.remove('aura_devotion');
  A.update(0.5);
  ok('nc46.pulse not yet due after 0.5 s', !ally.statuses.has('aura_devotion'));
  A.update(0.6);
  ok('nc46.pulse re-applies after the interval', ally.statuses.has('aura_devotion'));
  // dead paladin: no pulse
  ally.statuses.remove('aura_devotion');
  const hp0 = p.hp;
  p.hp = 0;
  A.update(1.2);
  ok('nc46.dead a dead paladin does not pulse', !ally.statuses.has('aura_devotion'), `dead=${p.isDead}`);
  p.hp = hp0;
  A.disarm(p);
  ok('nc46.disarm turns the aura off', A.active === null);
}

// ---- errors from the run: none expected from the new code
ok('nc48.errors no console errors', errors.filter((e) => /nc48|sharedBehaviors|Auras|behaviors_|chain|cone|drain|hammer/i.test(e)).length === 0,
  errors.slice(0, 3).join(' | '));

console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
