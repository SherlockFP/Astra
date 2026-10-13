import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES, THREE } = H;
const out = (...a) => console.log(...a);

const p = H.addPlayer('mage');
H.step(2);
p.position.set(0, 0, 0); p.yaw = 0;
const trash = H.addEnemy(0, 3);
const elite = H.addEnemy(3, 3, { rank: 'elite' });
const boss = H.addEnemy(-3, 3, { rank: 'boss', ccImmune: true, radius: 1.3 });
// --- CC rules
const r = (e, id, d, o) => e.statuses.apply(id, d, { sourceId: 1, ...o });
out('stun trash', r(trash, 'stun', 2), 'dur', trash.statuses.get('stun')?.remaining.toFixed(2));
out('stun elite', r(elite, 'stun', 2), 'dur', elite.statuses.get('stun')?.remaining.toFixed(2));
out('stun boss', r(boss, 'stun', 2), 'has', boss.statuses.has('stun'));
out('slow boss mag', (r(boss, 'slow', 3, { magnitude: 0.4 }), boss.statuses.getStatMods().moveSpeedPct));
out('slow trash mag', (r(trash, 'slow', 3, { magnitude: 0.4 }), trash.statuses.getStatMods().moveSpeedPct));
// DR: stun the trash repeatedly
trash.statuses.remove('stun');
const durs = [];
for (let i = 0; i < 5; i++) { trash.statuses.remove('stun'); const ok = r(trash, 'stun', 2); durs.push(ok ? trash.statuses.get('stun').remaining.toFixed(2) : 'immune'); }
out('DR stun durations', durs.join(' '));
// chill stacks -> freeze on trash
const t2 = H.addEnemy(6, 0);
for (let i = 0; i < 5; i++) r(t2, 'chill', 3);
out('chill x5 -> freeze?', t2.statuses.has('freeze'), 'chill', t2.statuses.has('chill'));
// poison stacks + dot damage
const t3 = H.addEnemy(-6, 0);
H.clearEvents();
r(t3, 'poison', 4, { stacks: 3, dps: 30 });
H.stepSec(2.1);
out('poison dot events', events['damage'].filter((d) => d.targetId === t3.id).length, 'hp lost', t3.maxHp - t3.hp, 'stacks', t3.statuses.stacks('poison'));
// boss taunt ICD
out('taunt boss 1', r(boss, 'taunt', 4), 'again', r(boss, 'taunt', 4));
// stagger break on elite
H.clearEvents();
p.classId; 
G.combat.addStagger(elite, 60); G.combat.addStagger(elite, 60);
out('elite stunned by stagger', elite.statuses.has('stun'), 'frac', G.combat.staggerFrac(elite).toFixed(2));
// player statuses & ccReduction
p.stats.ccReductionPct = 0.5;
out('player stun w/ 50% cc red', (r(p, 'stun', 2), p.statuses.get('stun')?.remaining.toFixed(2)));
p.statuses.clear(); p.stats.ccReductionPct = 0;
// shield absorb
p.statuses.apply('shield', 5, { magnitude: 300 });
const before = p.hp;
G.combat.hitLocalPlayer({ sourceId: null, amount: 200, type: 'fire', dir: [0, -1], unavoidable: true });
out('shield absorbs fire hit: hp lost', before - p.hp, 'shield left', p.statuses.get('shield')?.magnitude.toFixed(0));
// potions
G.character.material = (id) => (id === 'pot_hp_3' ? 5 : 0);
G.character.useMaterial = (id) => true;
p.hp = 100;
out('potion', G.combat.usePotion('hp'), 'hp', Math.round(p.hp), 'cd', G.combat.potionCooldown('hp').toFixed(1));
// death + revive
p.statuses.clear();
G.combat.killLocalPlayer(null);
out('dead', p.isDead, 'events', events['player:died'].length);
G.combat.reviveLocalPlayer(0.5);
out('revived hp', Math.round(p.hp), p.isDead);
// enemy death flow + corpse
H.clearEvents();
const t4 = H.addEnemy(0, 2);
H.setAimTarget(t4);
t4.hp = 50;
H.tap('lmb'); H.stepSec(1);
out('t4 dead after hit', t4.isDead, 'death events', events['death'].length);
// client path
{
  const sent = [];
  G.net = { isAuthority: false, on() {}, broadcast() {}, sendToHost: (c, pl) => sent.push([c, pl]), sendTo() {}, peerOfEntity: () => null };
  const t5 = H.addEnemy(0, 2.5);
  H.setAimTarget(t5);
  H.clearEvents();
  H.tap('lmb'); H.stepSec(0.6);
  out('client sent', sent.length, sent[0] ? JSON.stringify(sent[0]).slice(0, 160) : '', 'local numbers', events['damage'].length);
  // host receiving
  G.net = { isAuthority: true, on() {}, broadcast() {}, sendToHost() {}, sendTo() {}, peerOfEntity: () => null, peers: new Map([['x', { slot: 1 }]]) };
  const hp0 = t5.hp;
  G.combat.onNetHit({ targetId: t5.id, amount: 77, crit: false, type: 'physical', skillId: 'knight_basic_4', knockback: 1.5, dir: [0, 1] }, 'x');
  out('host applied remote hit', hp0 - t5.hp);
  G.net = undefined;
}
out('errors', errors.length);
for (const m of errors.slice(0, 10)) out('  !!', m.slice(0, 300));
