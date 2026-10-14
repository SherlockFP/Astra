// Minion damage hooks, threat and net replication (GDD_CLASSES_V2 §1.5, NC42 / NC43) - headless checks:
//   nc42.threat   minion threat split 0.6 / 0.4, enemy target scoring picks a high-threat minion, a dead minion drops out
//   nc42.taunt    a taunt attack forces enemies onto the minion (status source + top threat x 1.10 + 100)
//   nc42.shapes   HitShapes / hostile projectiles hurt the owner's minions (armorFrac), minion dies at 0 HP with events
//   nc43.*        MinionSync round trip: create / update / hp death / remove, spoof guards, host sees remote minions, via guard
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/minions_net.mjs
import * as H from './harness.mjs';

const { G, errors, world } = H;
const { Minions } = await H.imp('combat/Minions.ts');
const { minionDef } = await H.imp('data/minions.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { Replication } = await H.imp('net/Replication.ts');
const { Minion } = await H.imp('entities/Minion.ts');
const { MINION_ID_BASE, PARTY_ID_BASE } = await H.imp('types/common.ts');

G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const ev = { died: [], despawned: [], damage: [] };
G.events.on('minion:died', (e) => ev.died.push(e));
G.events.on('minion:despawned', (e) => ev.despawned.push(e));
G.events.on('damage', (e) => ev.damage.push(e));
const resetEv = () => { for (const k of Object.keys(ev)) ev[k].length = 0; };

function tick(sec) {
  for (let i = 0, n = H.sec(sec); i < n; i++) {
    H.step(1);
    G.minions.update(H.DT);
  }
}

function fresh() {
  const p = H.addPlayer('necromancer');
  G.minions.clearAll('scene');
  resetEv();
  return p;
}

/** A real EnemyAI without the Enemy constructor machinery: only the threat / targeting state the checks touch. */
function attachAi(e) {
  const ai = Object.create(EnemyAI.prototype);
  Object.assign(ai, { e, dir: { inSafeZone: () => false }, threat: new Map(), target: null, disposed: false, passives: [], aggroed: true });
  e.ai = ai;
  return ai;
}

const ghoulDef = minionDef('necro_ghoul');
/** Ghoul with a taunt attack (the necromancer kit decides later whether the real ghoul gets one). */
const tauntDef = (minTargets) => ({
  ...ghoulDef, id: 'test_taunt_ghoul', attacks: [
    { id: 'test_taunt', name: 'Kışkırt', kind: 'taunt', range: 8, radius: 8, cooldown: 5, hitTime: 0, anim: '', coef: 0, type: 'physical', params: { tauntSec: 3, ...(minTargets !== undefined ? { minTargets } : {}) } },
  ],
});

// ---- NC42 threat: split 0.6 owner / 0.4 minion, target scoring, death
{
  const p = fresh();
  const e = H.addEnemy(8, 0, { hp: 1e7 });
  const ai = attachAi(e);
  const ghoul = G.minions.summon(p, ghoulDef, {})[0];
  ok('nc42.world getActor returns minions', world.getActor(ghoul.id) === ghoul);

  ai.onDamaged(p.id, 1000, 1, ghoul.id);
  const tp = ai.threat.get(p.id) ?? 0, tm = ai.threat.get(ghoul.id) ?? 0;
  ok('nc42.threat hit via a minion splits 0.6 owner / 0.4 minion', near(tm / (tp + tm), 0.4, 1e-9) && tp > 0, `owner=${tp.toFixed(1)} minion=${tm.toFixed(1)}`);
  ai.threat.clear();
  ai.onDamaged(p.id, 1000, 1, 987654);
  ok('nc42.threat unknown via id: all threat to the owner', (ai.threat.get(p.id) ?? 0) > 1000 && !ai.threat.has(987654));
  ai.threat.clear();
  ai.onDamaged(p.id, 1000, 1);
  ok('nc42.threat plain hit: all threat to the owner', (ai.threat.get(p.id) ?? 0) > 1000 && ai.threat.size === 1);

  // the real strike path: Minions.strike -> Combat.playerHitEnemy (viaId) -> applyDamageToEnemy -> ai.onDamaged
  ai.threat.clear();
  const atk = ghoulDef.attacks[0];
  const hp0 = e.hp;
  G.minions.strike(ghoul, atk, e);
  const sp = ai.threat.get(p.id) ?? 0, sm = ai.threat.get(ghoul.id) ?? 0;
  ok('nc42.threat Minions.strike damages and splits the threat', e.hp < hp0 && sm > 0 && sp > 0 && near(sm / (sp + sm), 0.4, 1e-9), `dmg=${hp0 - e.hp} owner=${sp.toFixed(1)} minion=${sm.toFixed(1)}`);
  const dmgEv = ev.damage.find((d) => d.targetId === e.id);
  ok('nc42.threat the damage number is attributed to the owner', !!dmgEv && dmgEv.sourceId === p.id);

  // target scoring
  ai.threat.clear();
  ai.addThreat(p.id, 100);
  ai.addThreat(ghoul.id, 5000);
  ok('nc42.target enemy picks the high-threat minion', ai.pickTarget(0) === ghoul);
  ai.target = ghoul;
  ai.addThreat(p.id, 5400);   // 10 % over: inside the hysteresis band, the minion keeps the target
  ok('nc42.target hysteresis keeps the minion until the owner clearly leads', ai.pickTarget(0) === ghoul);
  ai.addThreat(p.id, 6000);
  ok('nc42.target the owner takes over once the lead is clear', ai.pickTarget(0) === p);

  // death
  ai.threat.clear();
  ai.addThreat(p.id, 100);
  ai.addThreat(ghoul.id, 5000);
  G.minions.hurt(ghoul, 1e9);
  ok('nc42.death dead minion emits minion:died once', ghoul.isDead && ev.died.filter((d) => d.id === ghoul.id).length === 1);
  ok('nc42.death enemy drops the dead minion from its table and picks the owner', ai.pickTarget(0) === p && !ai.threat.has(ghoul.id));
}

// ---- NC42 taunt: status owned by the minion + top threat
{
  const p = fresh();
  p.position.set(0, 0, 0);
  const e1 = H.addEnemy(6, 0, { hp: 1e7 }), e2 = H.addEnemy(-6, 2, { hp: 1e7 }), far = H.addEnemy(40, 40, { hp: 1e7 });
  const ais = [e1, e2, far].map(attachAi);
  for (const [i, e] of [e1, e2, far].entries()) { e.targetId = p.id; ais[i].addThreat(p.id, 800); }
  const m = G.minions.summon(p, tauntDef(), {})[0];
  tick(1.0);
  const t1 = e1.statuses.get('taunt'), t2 = e2.statuses.get('taunt');
  ok('nc42.taunt two enemies on someone else: both taunted by the minion', t1?.sourceId === m.id && t2?.sourceId === m.id);
  ok('nc42.taunt out-of-radius enemy is untouched', !far.statuses.has('taunt'));
  ok('nc42.taunt threat is top x 1.10 + 100', (ais[0].threat.get(m.id) ?? 0) >= 800 * 1.1 + 100 - 1e-6, `th=${(ais[0].threat.get(m.id) ?? 0).toFixed(1)}`);
  ok('nc42.taunt the enemy now targets the minion', ais[0].pickTarget(0) === m && e1.targetId === m.id);
  const th1 = ais[0].threat.get(m.id);
  tick(2);
  ok('nc42.taunt cooldown: no second taunt inside 5 s', ais[0].threat.get(m.id) === th1);

  // minTargets default 2: one enemy on the owner is not enough
  const q = fresh();
  q.position.set(0, 0, 0);
  const lone = H.addEnemy(5, 0, { hp: 1e7 });
  attachAi(lone);
  lone.targetId = q.id;
  const m2 = G.minions.summon(q, tauntDef(), {})[0];
  tick(1.0);
  ok('nc42.taunt a single enemy does not trigger the default rule (minTargets 2)', !lone.statuses.has('taunt'));
  const m3 = G.minions.summon(q, tauntDef(1), {})[0];
  void m2; void m3;
  tick(1.0);
  ok('nc42.taunt params.minTargets 1 does', lone.statuses.get('taunt')?.sourceId === m3.id);
}

// ---- NC42 hit shapes and hostile projectiles hurt the owner's minions
{
  const p = fresh();
  p.position.set(0, 0, 0);
  const src = H.addEnemy(15, 15, { hp: 1e7 });
  const ghoul = G.minions.summon(p, ghoulDef, {})[0];
  tick(1.5);   // walk to the formation slot (3.2 m behind the owner)
  const spawn = (s) => G.hitShapes.spawn({ sourceId: src.id, damage: 500, type: 'physical', telegraph: false, abilityName: 'Test', delay: 0.1, dir: [0, 1], ...s });
  const at = () => [ghoul.position.x, 0, ghoul.position.z];
  ok('nc42.shapes setup: the ghoul stands clear of the owner', Math.hypot(ghoul.position.x - p.position.x, ghoul.position.z - p.position.z) > 1.8);
  const hp0 = ghoul.hp, php = p.hp;
  spawn({ shape: { type: 'circle', radius: 1.2 }, origin: at() });
  tick(0.4);
  const taken = hp0 - ghoul.hp;
  ok('nc42.shapes circle damages the minion by damage x (1 - armorFrac)', taken === Math.round(500 * (1 - ghoulDef.armorFrac)), `taken=${taken}`);
  ok('nc42.shapes the owner outside the shape is untouched', p.hp === php);
  const dn = ev.damage.find((d) => d.targetId === ghoul.id);
  ok('nc42.shapes a damage event is emitted for the minion', !!dn && dn.amount === taken && dn.sourceId === src.id);

  const hp1 = ghoul.hp;
  spawn({ shape: { type: 'circle', radius: 1.2 }, origin: at(), kind: 'safe' });
  spawn({ shape: { type: 'circle', radius: 1.2 }, origin: at(), kind: 'friendly' });
  spawn({ shape: { type: 'circle', radius: 1.2 }, origin: at(), kind: 'soak', soak: true });
  spawn({ shape: { type: 'circle', radius: 1.2 }, origin: [at()[0] + 30, 0, at()[2]] });
  tick(0.4);
  ok('nc42.shapes safe / friendly / soak shapes and misses leave the minion alone', ghoul.hp === hp1);

  // magic ignores armorFrac
  const hp2 = ghoul.hp;
  spawn({ shape: { type: 'cone', radius: 5, angle: 120 }, origin: [ghoul.position.x, 0, ghoul.position.z], dir: [0, -1], damage: 300, type: 'fire' });
  tick(0.4);
  ok('nc42.shapes a cone hits too and fire ignores the physical armour', hp2 - ghoul.hp === 300, `taken=${hp2 - ghoul.hp}`);

  // hostile projectile along the line to the minion (it stands between the shooter and the owner)
  const hp3 = ghoul.hp, php3 = p.hp;
  spawn({ shape: { type: 'circle', radius: 0.5 }, origin: [ghoul.position.x, 1.3, ghoul.position.z - 12], delay: 0.05, damage: 200, projectile: { speed: 20, radius: 0.5, range: 30, vfx: 'fire_projectile' } });
  tick(1.2);
  ok('nc42.shapes a hostile projectile hits the minion in its path', hp3 - ghoul.hp === Math.round(200 * (1 - ghoulDef.armorFrac)) && p.hp === php3, `taken=${hp3 - ghoul.hp}`);

  // lethal
  resetEv();
  spawn({ shape: { type: 'circle', radius: 1.5 }, origin: at(), damage: 1e7 });
  tick(0.4);
  ok('nc42.death lethal shape kills the minion: hp 0 and minion:died', ghoul.isDead && ghoul.hp === 0 && ev.died.some((d) => d.id === ghoul.id && d.ownerId === p.id));
  const dead = ev.died.length;
  spawn({ shape: { type: 'circle', radius: 1.5 }, origin: at(), damage: 1e7 });
  tick(0.4);
  ok('nc42.death a dead minion is not hurt or killed again', ev.died.length === dead);

  // dead owner's minions still take hits (the owner's peer resolves them); a remote copy (authority false) is not resolved here
  const q = fresh();
  q.position.set(0, 0, 0);
  const mine = G.minions.summon(q, ghoulDef, {})[0];
  tick(1.5);
  const copy = new Minion(MINION_ID_BASE + 1000, ghoulDef, PARTY_ID_BASE + 1);
  copy.authority = false;
  copy.maxHp = copy.hp = 4000;
  copy.position.set(mine.position.x, 0, mine.position.z);
  world.add(copy);
  const c0 = copy.hp, m0 = mine.hp;
  G.hitShapes.spawn({ sourceId: src.id, damage: 500, type: 'physical', telegraph: false, delay: 0.1, dir: [0, 1], shape: { type: 'circle', radius: 1.2 }, origin: [mine.position.x, 0, mine.position.z] });
  tick(0.4);
  ok('nc42.authority only the owner-simulated minion takes the hit, the remote copy does not', mine.hp < m0 && copy.hp === c0);
  world.remove(copy);
}

// ---- NC43 net: MinionSync round trip through the real Replication receiver / sender
{
  const p = fresh();
  p.position.set(0, 0, 0);
  const sent = [];
  const fakeNet = {
    peers: new Map([['me', { peerId: 'me', slot: 0, name: 'Ben' }], ['peerB', { peerId: 'peerB', slot: 1, name: 'B' }]]),
    selfId: 'me', role: 'host', isAuthority: true, isOnline: true, sceneIsReady: true, localSlot: 0,
    on: () => () => {}, onRequest: () => () => {}, broadcast: (c, pl) => sent.push([c, pl]), sendTo() {}, sendToHost() {}, remotePeers: () => [],
  };
  const rep = new Replication(fakeNet);
  rep.setActive(true);

  // sender
  const mine = G.minions.summon(p, ghoulDef, {})[0];
  H.step(1);
  rep.sendMinions(G.engine.time);
  const msg = sent.find(([c]) => c === 'minion')?.[1];
  const s0 = msg?.minions?.[0];
  ok('nc43.send owner broadcasts its minions as MinionSync', !!s0 && s0.id === mine.id && s0.defId === 'necro_ghoul' && s0.ownerId === p.id && s0.hp === mine.hp && s0.maxHp === mine.maxHp, JSON.stringify(s0));
  ok('nc43.send a non-timed minion carries life 0, a timed one its time', s0?.life === 0);
  sent.length = 0;
  rep.sendMinions(G.engine.time);
  ok('nc43.send an unchanged list is not repeated inside 0.3 s', sent.length === 0);
  const l0 = G.minions.summon(p, minionDef('necro_lesser_ghoul'), {})[0];
  rep.sendMinions(G.engine.time);
  const m2 = sent.at(-1)?.[1]?.minions ?? [];
  ok('nc43.send a new minion changes the list at once (timed life > 0)', m2.length === 2 && (m2.find((s) => s.id === l0.id)?.life ?? 0) > 7, `n=${m2.length}`);
  G.minions.clearAll('scene');
  sent.length = 0;
  rep.sendMinions(G.engine.time);
  ok('nc43.send the empty list goes out once after the last minion left, then silence', sent.length === 1 && sent[0][1].minions.length === 0);
  rep.sendMinions(G.engine.time + 0.1);
  ok('nc43.send ... and not again', sent.length === 1);

  // receiver: peer B (slot 1, entity id PARTY_ID_BASE + 1) owns minions MINION_ID_BASE + 1000 + n
  const bId = PARTY_ID_BASE + 1;
  const remotePlayer = new (p.constructor)('knight');
  remotePlayer.id = bId; remotePlayer.isLocal = false; remotePlayer.authority = false;
  remotePlayer.position.set(30, 0, 30);
  world.add(remotePlayer);
  const mk = (n, over = {}) => ({ id: MINION_ID_BASE + 1000 + n, defId: 'necro_ghoul', ownerId: 999, x: 12, z: 0, yaw: 1, anim: 'Idle_Combat', hp: 3000, maxHp: 4000, life: 0, ...over });
  const now0 = G.engine.time;
  rep.onMinion({ t: now0, minions: [mk(1), mk(2, { defId: 'necro_lesser_ghoul', life: 6, x: 13 })] }, 'peerB');
  const r1 = world.get(MINION_ID_BASE + 1001), r2 = world.get(MINION_ID_BASE + 1002);
  ok('nc43.recv a snapshot creates remote Minion copies', !!r1 && !!r2 && r1.kind === 'minion' && rep.remoteMinionCount === 2);
  ok('nc43.recv copies are non-authoritative, owned by the sender, hp mirrored, no local list entry', r1.authority === false && r1.ownerId === bId && r1.hp === 3000 && r1.maxHp === 4000 && !G.minions.list.includes(r1));
  ok('nc43.recv the timed flag follows life', r2.timed === true && r1.timed === false);
  ok('nc43.host the host AI can see and target a remote minion', world.getActor(r1.id) === r1 && world.minions.includes(r1));

  // host-side AI: a remote minion is a valid target, its threat counts
  const he = H.addEnemy(15, 0, { hp: 1e7 });
  const hai = attachAi(he);
  hai.addThreat(p.id, 50);
  hai.addThreat(r1.id, 900);
  ok('nc43.host enemy AI picks the remote minion by threat', hai.pickTarget(0) === r1);

  // movement is interpolated (no AI): move to x=20 and let the buffer play out
  rep.onMinion({ t: now0 + 0.1, minions: [mk(1, { x: 20, hp: 2500 }), mk(2, { defId: 'necro_lesser_ghoul', life: 5.9, x: 13 })] }, 'peerB');
  for (let i = 0; i < 6; i++) {
    H.step(H.sec(0.1));
    rep.onMinion({ t: G.engine.time, minions: [mk(1, { x: 20, hp: 2500 }), mk(2, { defId: 'necro_lesser_ghoul', life: 5.9, x: 13 })] }, 'peerB');
  }
  ok('nc43.recv the copy follows the snapshot position and hp', near(r1.position.x, 20, 0.01) && r1.hp === 2500, `x=${r1.position.x.toFixed(2)} hp=${r1.hp}`);
  const before = r1.position.x;
  tick(0.5);
  ok('nc43.recv the copy has no AI of its own (stays at the snapshot)', r1.position.x === before);

  // spoofs and junk
  const n0 = rep.remoteMinionCount;
  const keep = [mk(1, { x: 20, hp: 2500 }), mk(2, { defId: 'necro_lesser_ghoul', life: 5.9, x: 13 })];
  rep.onMinion({ t: G.engine.time, minions: [...keep, mk(3, { id: MINION_ID_BASE + 5 }), mk(4, { id: p.id }), mk(5, { defId: 'no_such_def' }), mk(6, { x: NaN }), null, 7] }, 'peerB');
  ok('nc43.guard ids outside the sender slot range, unknown defs and junk are ignored', rep.remoteMinionCount === n0 && !world.get(MINION_ID_BASE + 5));
  rep.onMinion({ t: G.engine.time, minions: [] }, 'stranger');
  ok('nc43.guard a snapshot from an unknown peer is ignored (it cannot clear or create)', rep.remoteMinionCount === n0 && n0 === 2);

  // hp <= 0: dies (copy lingers, then goes)
  resetEv();
  rep.onMinion({ t: G.engine.time, minions: [mk(1, { hp: 0, x: 20 }), mk(2, { defId: 'necro_lesser_ghoul', life: 5.9, x: 13 })] }, 'peerB');
  ok('nc43.recv hp <= 0 kills the copy (hp 0, alive false)', r1.isDead && r1.hp === 0);
  ok('nc43.host a dead remote minion is no longer a valid target', hai.pickTarget(0) === p && !hai.threat.has(r1.id));
  tick(2.3);
  rep.sweepMinions(G.engine.time);
  tick(0.1);
  ok('nc43.recv the dead copy is removed after the linger', r1.removed === true && !world.get(r1.id));

  // gone from the owner's list: removed at once
  rep.onMinion({ t: G.engine.time, minions: [] }, 'peerB');
  tick(0.1);
  ok('nc43.recv a minion missing from the owner list is removed', r2.removed === true && rep.remoteMinionCount === 0 && world.minions.every((m) => m.id !== r2.id));

  // stale: no snapshot for 1.5 s
  rep.onMinion({ t: G.engine.time, minions: [mk(7)] }, 'peerB');
  const r7 = world.get(MINION_ID_BASE + 1007);
  tick(1.0);
  rep.sweepMinions(G.engine.time);
  const alive1 = !r7.removed;
  tick(0.7);
  rep.sweepMinions(G.engine.time);
  tick(0.1);
  ok('nc43.recv a copy with no snapshot for 1.5 s is dropped', alive1 && r7.removed === true);

  // peer leaves
  rep.onMinion({ t: G.engine.time, minions: [mk(8), mk(9)] }, 'peerB');
  const r8 = world.get(MINION_ID_BASE + 1008);
  rep.removeMinionsOf('peerB');
  tick(0.1);
  ok('nc43.recv peer left removes all of its copies', r8.removed === true && rep.remoteMinionCount === 0);

  // scene change forgets the references (the old world is disposed by its scene)
  rep.onMinion({ t: G.engine.time, minions: [mk(10)] }, 'peerB');
  G.events.emit('scene:leaving', { from: 'town', to: 'dungeon' });
  ok('nc43.recv scene:leaving forgets the copies', rep.remoteMinionCount === 0);
  world.remove(world.get(MINION_ID_BASE + 1010));
  tick(0.1);

  // via guard on the host: `hit.via` counts only for a live minion that belongs to the sender
  G.net = fakeNet;
  rep.onMinion({ t: G.engine.time, minions: [mk(11)] }, 'peerB');
  const rv = world.get(MINION_ID_BASE + 1011);
  remotePlayer.position.set(he.position.x - 2, 0, he.position.z);
  rv.position.set(he.position.x - 3, 0, he.position.z);
  hai.threat.clear();
  G.combat.onNetHit({ targetId: he.id, amount: 400, crit: false, type: 'physical', skillId: 'necro_ghoul_claw', via: rv.id }, 'peerB');
  const tB = hai.threat.get(bId) ?? 0, tV = hai.threat.get(rv.id) ?? 0;
  ok('nc43.via a client hit through its own minion splits the threat on the host', tV > 0 && tB > 0 && near(tV / (tB + tV), 0.4, 1e-9), `owner=${tB.toFixed(1)} minion=${tV.toFixed(1)}`);
  hai.threat.clear();
  G.combat.onNetHit({ targetId: he.id, amount: 400, crit: false, type: 'physical', skillId: 'necro_ghoul_claw', via: mine.id }, 'peerB');
  ok('nc43.via a minion that belongs to someone else is ignored', !hai.threat.has(mine.id) && (hai.threat.get(bId) ?? 0) > 400);
  hai.threat.clear();
  G.combat.onNetHit({ targetId: he.id, amount: 0, crit: false, type: 'true', skillId: 'test_taunt', statuses: [{ status: 'taunt', duration: 3 }], via: rv.id }, 'peerB');
  ok('nc43.via a client minion taunt: the taunt belongs to the minion and it tops the table', he.statuses.get('taunt')?.sourceId === rv.id && (hai.threat.get(rv.id) ?? 0) >= 100);
  G.net = undefined;
}

console.log(fails === 0 ? '\nminions_net: all checks PASS' : `\nminions_net: ${fails} FAIL`);
if (errors.length) for (const m of errors.slice(0, 8)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
