// Minions (GDD_CLASSES_V2 §1.5, NC39-NC41) checks that need no browser: summon caps, command focus / recall, attack, follow,
// death and respawn, timed expiry, scene change. Local-only (no net), so no peers are simulated.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/minions.mjs
import * as H from './harness.mjs';

const { G, errors } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { MINION_DEFS, minionDef } = await H.imp('data/minions.ts');
const { MINION_ID_BASE, LOCAL_ID_BASE } = await H.imp('types/common.ts');

G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const dist = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

// event capture (reset per section)
const ev = { spawned: [], died: [], despawned: [], command: [] };
G.events.on('minion:spawned', (e) => ev.spawned.push(e));
G.events.on('minion:died', (e) => ev.died.push(e));
G.events.on('minion:despawned', (e) => ev.despawned.push(e));
G.events.on('minion:command', (e) => ev.command.push(e));
const resetEv = () => { for (const k of Object.keys(ev)) ev[k].length = 0; };

// advance the world and the minion manager together (the harness step does not tick G.minions)
function tick(sec) {
  const n = H.sec(sec);
  for (let i = 0; i < n; i++) {
    H.step(1);
    G.minions.update(H.DT);
  }
}

// a fresh scene with one necromancer; minions and events cleared
function fresh() {
  const p = H.addPlayer('necromancer');
  G.minions.clearAll('scene');
  resetEv();
  return p;
}

// behaviour context, as in kit_plate.mjs
function ctxFor(p, def, target = null) {
  return {
    sys: G.skills, caster: p, def, aim: H.aimFor(p, target), dir: [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: false, action: null, target, point: [p.position.x, p.position.z], data: {}, more: 1,
  };
}
const testDef = (over = {}) => ({ id: 'test_minion', tags: [], targeting: 'self', range: 25, cooldown: 0, cost: 0, damage: { coef: 1, type: 'shadow' }, params: {}, statuses: [], ...over });

// ---- minions.defs: data rows and behaviours in place
{
  ok('minions.defs necro_ghoul / lesser / army present', !!MINION_DEFS.necro_ghoul && !!MINION_DEFS.necro_lesser_ghoul && !!MINION_DEFS.necro_army_ghoul);
  ok('minions.defs ghoul row caps (pet 1, lesser 3, army uncapped)', minionDef('necro_ghoul').group === 'pet' && minionDef('necro_lesser_ghoul').group === 'lesser' && minionDef('necro_army_ghoul').group === 'army');
  ok('minions.behaviours minion_summon / minion_command installed', typeof BEHAVIORS.minion_summon?.fire === 'function' && typeof BEHAVIORS.minion_command?.fire === 'function');
}

// ---- summon cap: pet group cap 1 (the oldest leaves with reason cap)
let pet1 = null;
{
  const p = fresh();
  pet1 = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  ok('summon.pet spawns one ghoul', !!pet1 && G.minions.ownedBy(p.id).length === 1);
  ok('summon.pet id in minion range', pet1.id >= MINION_ID_BASE && pet1.id < LOCAL_ID_BASE, `id=${pet1.id}`);
  ok('summon.pet maxHp = owner.maxHp x hpFrac (4000)', pet1.maxHp === Math.round(p.maxHp * 0.8), `maxHp=${pet1.maxHp}`);
  const pet2 = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  ok('summon.cap second pet replaces the first (alive pets 1)', G.minions.ownedBy(p.id, (m) => m.def.group === 'pet').length === 1);
  ok('summon.cap the oldest pet despawns with reason cap', ev.despawned.some((e) => e.id === pet1.id && e.reason === 'cap'));
  ok('summon.cap new pet is a different entity with unique id', pet2 !== pet1 && pet2.id !== pet1.id);
}

// ---- lesser ghouls: group cap 3; army (8 per cast) is uncapped; owner hard cap 14
{
  const p = fresh();
  G.minions.summon(p, minionDef('necro_ghoul'), {});
  G.minions.summon(p, minionDef('necro_army_ghoul'), { count: 8, ignoreCap: true });
  ok('summon.army 8 uncapped alongside the pet (9 alive)', G.minions.ownedBy(p.id).length === 9, `alive=${G.minions.ownedBy(p.id).length}`);
  resetEv();
  G.minions.summon(p, minionDef('necro_lesser_ghoul'), { count: 4 });
  const lesser = G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser');
  ok('summon.lesser group cap 3 (4 summoned, 3 alive)', lesser.length === 3, `alive=${lesser.length}`);
  ok('summon.lesser the oldest lesser despawns with reason cap', ev.despawned.filter((e) => e.reason === 'cap' && e.defId === 'necro_lesser_ghoul').length === 1);
  G.minions.summon(p, minionDef('necro_army_ghoul'), { count: 8, ignoreCap: true });
  const total = G.minions.ownedBy(p.id).length;
  ok('summon.owner hard cap 14 holds after 8 more army ghouls', total === 14, `alive=${total}`);
  ok('summon.world list agrees with the owner count', G.world.minions.filter((m) => m.ownerId === p.id && !m.isDead && !m.removed).length === 14);
}

// ---- command: focus an enemy, engage, recall; then follow the owner once the enemy is gone
{
  const p = fresh();
  const e1 = H.addEnemy(6, 0, { hp: 100000 });
  const ghoul = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  BEHAVIORS.minion_command.fire(ctxFor(p, testDef({ id: 'necro_command_army', params: { focusSec: 8 }, range: 30 }), e1));
  ok('command.focus sets the owner focus and emits minion:command focus', G.minions.focusTarget(p.id) === e1 && ev.command.some((c) => c.command === 'focus' && c.targetId === e1.id));
  tick(4);
  ok('command.attack ghoul engages the focused enemy and it takes damage', dist(ghoul, e1) <= 3.5 && e1.hp < e1.maxHp, `d=${dist(ghoul, e1).toFixed(2)} hp=${e1.hp}`);
  BEHAVIORS.minion_command.fire(ctxFor(p, testDef({ id: 'necro_command_army', params: { recall: 1 } }), null));
  ok('command.recall clears the focus and emits minion:command recall', G.minions.focusTarget(p.id) === null && ev.command.some((c) => c.command === 'recall'));
  G.world.remove(e1);
  tick(0.1);
  p.position.set(12, 0, 0);
  tick(4);
  ok('follow.owner moved 12 m away: ghoul returns within 5 m of owner', dist(ghoul, p) <= 5, `d=${dist(ghoul, p).toFixed(2)}`);
}

// ---- death and respawn: pet returns 10 s after death, no cast; the body lingers 2 s
{
  const p = fresh();
  const g = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  const id = g.id;
  G.minions.hurt(g, 1e9);
  ok('death.hurt to 0 kills the ghoul and emits minion:died', g.isDead && ev.died.some((e) => e.id === id));
  tick(1);
  ok('death.body lingers before removal', G.world.get(id) === g);
  tick(1.6);
  ok('death.body removed after the linger, with no minion:despawned', G.world.get(id) === undefined && !ev.despawned.some((e) => e.id === id));
  tick(6.4);   // 9.0 s after death: still gone
  ok('respawn.pet not back before 10 s', G.minions.ownedBy(p.id, (m) => m.def.group === 'pet').length === 0);
  tick(1.5);   // 10.5 s after death
  const back = G.minions.ownedBy(p.id, (m) => m.def.group === 'pet')[0];
  ok('respawn.pet returns 10 s after death, no cast', !!back && back !== g && back.def.id === 'necro_ghoul', `back=${!!back}`);
}

// ---- timed expiry: a lesser ghoul leaves after its 8 s life
{
  const p = fresh();
  const l = G.minions.summon(p, minionDef('necro_lesser_ghoul'), {})[0];
  tick(7);
  ok('timed.lesser ghoul alive at 7 s', G.minions.ownedBy(p.id).includes(l));
  tick(1.5);
  ok('timed.lesser ghoul expires at 8 s with reason expired', ev.despawned.some((e) => e.id === l.id && e.reason === 'expired'));
}

// ---- scene change: minions leave (reason scene); pets come back 2 s later, free
{
  const p = fresh();
  const g = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  G.events.emit('scene:changed', { from: 'dungeon', to: 'town' });
  ok('scene.minion leaves with reason scene', ev.despawned.some((e) => e.id === g.id && e.reason === 'scene'));
  tick(2.5);
  ok('scene.pet returns 2 s after the scene change', G.minions.ownedBy(p.id, (m) => m.def.group === 'pet').length === 1);
}

// ---- cast-time summon row: 'auto' is the class default (necromancer -> necro_ghoul)
{
  const p = fresh();
  BEHAVIORS.minion_summon.fire(ctxFor(p, testDef({ id: 'necro_golem', minion: { id: 'auto', count: 1, cap: 1, group: 'pet' } })));
  const got = G.minions.ownedBy(p.id);
  ok('summon.row auto resolves to the necromancer default ghoul', got.length === 1 && got[0].def.id === 'necro_ghoul');
}

// ---- results
console.log(fails === 0 ? '\nminions: all checks PASS' : `\nminions: ${fails} FAIL`);
if (errors.length) for (const m of errors.slice(0, 6)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
