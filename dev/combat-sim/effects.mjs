import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES, THREE } = H;
const out = (...a) => console.log(...a);
const S = (id, params = {}) => ({ [id]: { id, desc: '', params, source: 'unique' } });
const setup = (cls, specials = {}, level = 30) => { const p = H.addPlayer(cls, level, specials); H.step(2); p.position.set(0, 0, 0); p.yaw = 0; p.hp = p.maxHp; p.resource = 100; H.clearEvents(); errors.length = 0; return p; };
const dmgOf = (id) => events['damage'].filter((d) => d.targetId === id);

// shatter
{
  const p = setup('mage');
  const a = H.addEnemy(0, 3, { hp: 100000 }), b = H.addEnemy(1.2, 3.2, { hp: 100000 });
  H.setAimTarget(a);
  a.statuses.apply('freeze', 3, { sourceId: 1 });
  a.hp = 5;
  H.tap('rmb'); H.stepSec(1.0);
  out('SHATTER a dead', a.isDead, 'b events', dmgOf(b.id).map((d) => d.skillId + ':' + d.amount).join(' '));
}
// spell echo (chance 1)
{
  const p = setup('mage', S('n_spell_echo', { echoChance: 1, echoDamageMult: 0.7 }));
  const a = H.addEnemy(0, 6, { hp: 1e7 }); H.setAimTarget(a);
  H.tap('rmb'); H.stepSec(1.5);
  out('ECHO fireball hits on a', dmgOf(a.id).filter((d) => d.skillId === 'mage_fireball').map((d) => d.amount).join(','));
}
// ember staff split
{
  const p = setup('mage', S('leg_ember_staff', { splitCount: 3, splitCoef: 0.4, spreadRadius: 4 }));
  const es = [H.addEnemy(0, 6, { hp: 1e7 }), H.addEnemy(2.5, 6.5, { hp: 1e7 }), H.addEnemy(-2.5, 6.5, { hp: 1e7 })]; H.setAimTarget(es[0]);
  H.tap('rmb'); H.stepSec(2.0);
  out('EMBER split hits', es.map((e) => dmgOf(e.id).filter((d) => d.skillId === 'mage_fireball').length).join('/'), 'amts', es.map((e) => dmgOf(e.id).filter((d) => d.skillId === 'mage_fireball').map((d) => d.amount).join(',')).join(' | '));
}
// dragonfang
{
  const p = setup('knight', S('leg_dragonfang', { range: 6, coef: 1.5 }));
  const es = [H.addEnemy(0, 2), H.addEnemy(0.3, 5), H.addEnemy(-0.2, 7.5)]; H.setAimTarget(es[0]);
  H.press('lmb'); H.stepSec(1.2); H.release('lmb'); H.stepSec(0.6);
  out('DRAGONFANG fire hits', es.map((e) => dmgOf(e.id).filter((d) => d.type === 'fire').length).join('/'), 'second enemy total', dmgOf(es[1].id).length);
}
// titan grip
{
  const p = setup('knight', S('leg_titan_grip', { radius: 3, coef: 2 }));
  const es = [H.addEnemy(0, 2), H.addEnemy(2, 0.5)]; H.setAimTarget(es[0]);
  H.press('lmb'); H.stepSec(2.2); H.release('lmb'); H.stepSec(0.4);
  out('TITAN grip hits on enemy 2', dmgOf(es[1].id).map((d) => d.amount).join(','));
}
// skullsplitter
{
  const p = setup('barbarian', S('leg_skullsplitter', { fissures: 3, spreadDeg: 30, coef: 0.6, staggerPct: 0.3 }));
  const es = [H.addEnemy(0, 5), H.addEnemy(3, 8), H.addEnemy(-3, 8)]; H.setAimTarget(es[0]);
  H.tap('s2'); H.stepSec(1.5);
  out('SKULLSPLITTER hits', es.map((e) => dmgOf(e.id).filter((d) => d.skillId === 'barbarian_fissure').length).join('/'));
}
// heart of storm pull + wolfblood tornado
{
  const p = setup('barbarian', { ...S('leg_heart_of_storm', { pullRadius: 6, costReduce: 0.3 }), ...S('set_wolfblood_4', {}) });
  const es = [H.addEnemy(0, 5.5, { hp: 1e7 })];
  H.setAimTarget(es[0]);
  const z0 = es[0].position.z;
  H.press('e'); H.stepSec(2.0);
  out('HEART OF STORM enemy z', z0, '->', es[0].position.z.toFixed(2), 'tornado hits', dmgOf(es[0].id).length, 'rage', Math.round(p.resource));
  H.release('e'); H.stepSec(3.5);
}
// archmage 4 meteors + blink reset
{
  const p = setup('mage', S('set_archmage_legacy_4', {}));
  const es = [H.addEnemy(0, 8, { hp: 1e7 })]; H.setAimTarget(es[0]);
  G.skills.tryCast; H.tap('e'); H.stepSec(0.3); // blink first (puts it on cd)
  p.position.set(0, 0, 0);
  const cdBefore = G.skills.getCooldown(p, 'mage_blink').remaining;
  H.press('s1'); H.stepSec(0.2); H.release('s1'); H.stepSec(2.2);
  out('ARCHMAGE meteors dmg events', dmgOf(es[0].id).filter((d) => d.skillId === 'mage_meteor' && d.amount > 300).length, 'blink cd before/after', cdBefore.toFixed(1), G.skills.getCooldown(p, 'mage_blink').remaining.toFixed(1));
}
// holy vanguard 4
{
  const p = setup('knight', S('set_holy_vanguard_4', {}));
  const es = [H.addEnemy(0, 2.2, { hp: 1e7 })]; H.setAimTarget(es[0]);
  H.tap('rmb'); H.stepSec(1.0);
  const bash1 = dmgOf(es[0].id).map((d) => d.skillId + ':' + d.amount + ':' + d.type).join(' ');
  H.tap('s1'); H.stepSec(1.4);   // challenge resets bash
  out('HOLY4 first bash', bash1, '| bash cd after challenge', G.skills.getCooldown(p, 'knight_shield_bash').remaining.toFixed(1));
}
// frozen crown charges
{
  const p = setup('mage', S('leg_frozen_crown', { charges: 2, frozenDamage: 0.25 }));
  H.tap('q'); H.stepSec(0.7); H.tap('q'); H.stepSec(0.9);
  out('FROZEN CROWN nova casts', events['skill:cast'].filter((c) => c.skillId === 'mage_frost_nova').length, 'charges', JSON.stringify(G.skills.getCooldown(p, 'mage_frost_nova')));
}
// phoenix
{
  const p = setup('knight', S('leg_phoenix_mantle', { hpFrac: 0.4, radius: 6, coef: 4, cooldown: 180 }));
  const e = H.addEnemy(0, 3, { hp: 1e6 });
  p.hp = 10;
  G.combat.hitLocalPlayer({ sourceId: null, amount: 5000, type: 'physical', dir: [0, -1], unavoidable: true });
  H.stepSec(0.3);
  out('PHOENIX alive', !p.isDead, 'hp', Math.round(p.hp), 'burst dmg', dmgOf(e.id).map((d) => d.amount).join(','));
  p.statuses.clear(); p.hp = 10;
  G.combat.hitLocalPlayer({ sourceId: null, amount: 5000, type: 'physical', dir: [0, -1], unavoidable: true });
  out('PHOENIX 2nd (on cooldown) dead', p.isDead);
}
out('errors', errors.length); for (const m of errors.slice(0, 8)) out('  !!', m.slice(0, 300));

// wall slam: knight finisher against a wall
{
  const p = setup('knight');
  world.nav.setRect(-5, 3.6, 5, 5, false);
  const e = H.addEnemy(0, 2.4, { hp: 1e7 }); H.setAimTarget(e);
  H.press('lmb'); H.stepSec(1.8); H.release('lmb'); H.stepSec(0.5);
  out('WALL SLAM events', dmgOf(e.id).map((d) => d.skillId + ':' + d.amount).join(' '), 'stunned?', e.statuses.has('stun'), 'enemy z', e.position.z.toFixed(2));
  world.nav.setRect(-5, 3.6, 5, 5, true);
}
