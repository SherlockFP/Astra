import * as H from './harness.mjs';
const { G, world, errors, events } = H;
const out = (...a) => console.log(...a);
const setup = (cls) => { const p = H.addPlayer(cls); H.step(2); p.position.set(0, 0, 0); p.yaw = 0; p.hp = p.maxHp; p.resource = 100; H.clearEvents(); errors.length = 0; return p; };
const seq = () => events['damage'].filter((d) => d.sourceId === 1 && d.kind !== 'dot').map((d) => d.t.toFixed(2) + ':' + d.skillId.replace('knight_', '')).join(' ');

// buffering: single taps during the swing chain into the next step
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  H.tap('lmb'); H.stepSec(0.1); H.tap('lmb'); H.stepSec(0.15); H.tap('lmb'); H.stepSec(0.7);
  out('BUFFER taps at 0, 0.1+, 0.3+ ->', seq());
}
// combo reset after a pause
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  H.tap('lmb'); H.stepSec(0.9); H.tap('lmb'); H.stepSec(1.6); H.tap('lmb'); H.stepSec(0.8);
  out('RESET (pause 1.6 s) ->', seq());
}
// dodge cancel before the hit frame: nothing happens
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  H.tap('lmb'); H.stepSec(0.12); const did = G.skills.interrupt(p); H.stepSec(0.8);
  out('DODGE-CANCEL before hit: interrupted', did, 'hits', events['damage'].filter((d) => d.targetId === e.id).length);
}
// cancel after hit by skill: RMB during step 1 recovery
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  H.tap('lmb'); H.stepSec(0.2); H.tap('rmb'); H.stepSec(1.0);
  out('SKILL CANCEL (lmb then rmb) ->', seq());
}
// buffered fireball hold: RMB held repeats
{
  const p = setup('mage'); const e = H.addEnemy(0, 8, { hp: 1e8 }); H.setAimTarget(e);
  H.press('rmb'); H.stepSec(2.5); H.release('rmb'); H.stepSec(1);
  out('HOLD RMB fireball casts in 2.5 s:', events['skill:cast'].filter((c) => c.skillId === 'mage_fireball').length, 'mana', Math.round(p.resource));
}
// moving attack uses upper body + slow
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  G.input.moveAxis = () => ({ x: 0, y: 1 });
  H.tap('lmb'); const mul = p.getActionMoveMul(); H.stepSec(0.1);
  G.input.moveAxis = () => ({ x: 0, y: 0 });
  out('MOVING attack action-move mul', mul.toFixed(2), '(root finisher check below)');
  H.stepSec(1);
  // finisher roots
  H.press('lmb'); H.stepSec(1.2); const mul4 = p.getActionMoveMul(); H.release('lmb');
  out('during chain mul sample', mul4.toFixed(2));
}
// stunned player cannot cast
{
  const p = setup('knight'); const e = H.addEnemy(0, 2, { hp: 1e8 }); H.setAimTarget(e);
  p.statuses.apply('stun', 1, { sourceId: null });
  H.tap('lmb'); H.stepSec(0.5);
  out('STUNNED cast attempts:', events['skill:cast'].length, 'fails', events['skill:fail'].map((f) => f.reason).join(','));
}
out('errors', errors.length); for (const m of errors.slice(0, 5)) out('  !!', m.slice(0, 200));
