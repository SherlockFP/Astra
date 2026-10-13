import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES, THREE } = H;
const out = (...a) => console.log(...a);
const setup = (cls, level = 30) => { const p = H.addPlayer(cls, level); H.step(2); p.position.set(0, 0, 0); p.yaw = 0; p.hp = p.maxHp; p.resource = 100; H.clearEvents(); errors.length = 0; return p; };

// 1. shield wall
{
  const p = setup('knight');
  p.stats.blockChance = 0; // wall blocks everything frontal regardless
  const e = H.addEnemy(0, 3); H.setAimTarget(e);
  H.press('s2'); H.stepSec(0.5);
  const hp0 = p.hp; const res0 = p.resource;
  for (let i = 0; i < 5; i++) { G.combat.hitLocalPlayer({ sourceId: null, amount: 300, type: 'physical', dir: [0, -1], blockable: true }); H.step(6); }
  H.stepSec(0.3);
  H.release('s2'); H.stepSec(0.6);
  const dm = events['damage'].filter((d) => d.targetId === e.id);
  out('SHIELD WALL hp lost while holding', hp0 - p.hp, 'rage', Math.round(res0), '->', Math.round(p.resource), 'release hit amount', dm.map((d) => d.amount).join(','), 'cast count', events['skill:cast'].filter((c) => c.skillId === 'knight_shield_wall').length);
}
// 2. perfect dodge
{
  const p = setup('rogue');
  p.dodging = true; p.dodgeStartedAt = world.time;
  p.statuses.apply('iframes', 0.3, { sourceId: 1 });
  const r = G.combat.hitLocalPlayer({ sourceId: null, amount: 300, type: 'physical', dir: [0, 1] });
  out('PERFECT DODGE immune', r?.immune, 'empower', p.statuses.has('empower'), 'energy', Math.round(p.resource));
}
// 3. eviscerate
{
  const p = setup('rogue');
  const e = H.addEnemy(0, 2); H.setAimTarget(e);
  H.press('lmb'); H.stepSec(1.6); H.release('lmb'); H.stepSec(0.6);
  const cp = G.skills.comboPoints(p);
  H.clearEvents();
  p.resource = 100;
  H.tap('s1'); H.stepSec(1.2);
  const dm = events['damage'].filter((d) => d.skillId === 'rogue_eviscerate');
  out('EVISCERATE with cp', cp, 'dmg', dm.map((d) => d.amount + (d.crit ? '!' : '')).join(','), 'cp after', G.skills.comboPoints(p), 'st', events['status:applied'].map((s) => s.status).join(','));
}
// 4+5. mage: nova -> freeze -> fireball kill -> shatter ; element balance
{
  const p = setup('mage');
  const a = H.addEnemy(0, 3, { hp: 400 }), b = H.addEnemy(1.2, 3.4, { hp: 100000 });
  H.setAimTarget(a);
  H.tap('rmb'); H.stepSec(0.9);     // fireball (element 1)
  H.tap('q'); H.stepSec(0.9);       // frost nova (element 2) -> balance
  out('MAGE balance status', p.statuses.has('balance'), 'a frozen', a.statuses.has('freeze'), 'a hp', Math.round(a.hp));
  a.hp = 5;
  H.clearEvents();
  G.skills.resetCooldown(p, 'mage_frost_nova');
  H.tap('rmb'); H.stepSec(1.2);
  out('SHATTER a dead', a.isDead, 'b dmg events', events['damage'].filter((d) => d.targetId === b.id).map((d) => d.skillId + ':' + d.amount).join(' '));
}
// 6. whirlwind
{
  const p = setup('barbarian');
  const es = [H.addEnemy(0, 2), H.addEnemy(2, 0), H.addEnemy(-2, 1)];
  H.setAimTarget(es[0]);
  p.resource = 100;
  const r0 = p.resource;
  H.press('e'); H.stepSec(2.5); H.release('e'); H.stepSec(0.5);
  out('WHIRLWIND casts', events['skill:cast'].filter((c) => c.skillId === 'barbarian_whirlwind').length, 'hits', events['damage'].filter((d) => d.skillId === 'barbarian_whirlwind').length, 'rage', Math.round(r0), '->', Math.round(p.resource));
  // tempest gating
  p.resource = 30; H.clearEvents();
  H.tap('r'); H.stepSec(0.5);
  out('TEMPEST with 30 rage fails:', events['skill:fail'].map((f) => f.reason).join(','), 'casts', events['skill:cast'].length);
}
// 7. blizzard follows reticle
{
  const p = setup('mage');
  const es = [H.addEnemy(0, 6), H.addEnemy(10, 6)];
  H.setAimTarget(es[0]);
  H.press('s2'); H.stepSec(1.2);
  const h1 = events['damage'].filter((d) => d.targetId === es[0].id).length, h2 = events['damage'].filter((d) => d.targetId === es[1].id).length;
  H.setAimTarget(es[1]); H.stepSec(2.5);
  H.release('s2'); H.stepSec(0.4);
  const h1b = events['damage'].filter((d) => d.targetId === es[0].id).length, h2b = events['damage'].filter((d) => d.targetId === es[1].id).length;
  out('BLIZZARD first phase hits on A/B', h1, h2, 'after moving reticle A/B', h1b, h2b, 'casts', events['skill:cast'].filter((c) => c.skillId === 'mage_blizzard').length, 'mana', Math.round(p.resource));
}
// 8. charge -> bash combo & stun states
{
  const p = setup('knight');
  const e = H.addEnemy(0, 9); H.setAimTarget(e);
  H.tap('q'); H.stepSec(0.8);
  out('CHARGE pos z', p.position.z.toFixed(2), 'stunned', e.statuses.has('stun'), 'enemy z', e.position.z.toFixed(2));
  H.tap('rmb'); H.stepSec(0.8);
  out('BASH after charge:', events['damage'].filter((d) => d.skillId === 'knight_shield_bash').map((d) => d.amount).join(','), 'stagger', G.combat.staggerFrac(e).toFixed(2));
}
out('errors', errors.length); for (const m of errors.slice(0, 8)) out('  !!', m.slice(0, 300));
