import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES, imp } = H;
const { UNIQUES, SETS } = await imp('data/uniques.ts');
const { TALENT_NODES } = await imp('data/talents.ts');

const infos = [];
for (const u of Object.values(UNIQUES)) if (u.special) infos.push({ id: u.special.id, cls: u.classes?.[0] ?? null, desc: u.special.desc, params: u.special.params ?? {}, source: 'unique' });
for (const set of Object.values(SETS)) for (const b of set.bonuses) if (b.special) infos.push({ id: b.special.id, cls: set.id.includes('holy') ? 'knight' : set.id.includes('wolf') ? 'barbarian' : set.id.includes('archmage') ? 'mage' : 'rogue', desc: b.special.desc, params: { count: b.count }, source: 'set' });
for (const n of Object.values(TALENT_NODES)) if (n.special) infos.push({ id: n.special.id, cls: n.id.startsWith('ks_') || n.id.startsWith('n_') ? null : null, desc: n.special.desc, params: n.special.params ?? {}, source: 'talent' });

const guessClass = (id) => {
  if (/dragonfang|mountain|holy|oath|iron_fortress/.test(id)) return 'knight';
  if (/skullsplitter|heart_of_storm|wolfblood|rage_engine|berserker|titan/.test(id)) return 'barbarian';
  if (/ember|frozen|tome|archmage|pyromancer|cryomancer|spell_echo|mind_shield|glass|spellblade/.test(id)) return 'mage';
  return 'rogue';
};

const filter = process.argv[2];
let bad = 0;
for (const info of infos) {
  if (filter && !info.id.includes(filter)) continue;
  const cls = info.cls ?? guessClass(info.id);
  const sp = { [info.id]: { id: info.id, desc: info.desc, params: { ...info.params }, source: info.source } };
  const p = H.addPlayer(cls, 30, sp);
  const enemies = [H.addEnemy(0, 2.6), H.addEnemy(1.5, 3.5), H.addEnemy(-1.5, 4), H.addEnemy(0.5, 6), H.addEnemy(-3, 2)];
  H.step(2);
  p.position.set(0, 0, 0); p.yaw = 0; p.hp = p.maxHp;
  H.setAimTarget(enemies[0]);
  errors.length = 0; H.clearEvents();
  // basic chain
  H.press('lmb'); H.stepSec(2); H.release('lmb');
  // all skills
  const bar = G.character.save.skillBar;
  const ids = CLASSES[cls].skills;
  for (const id of ids) {
    let slot = Object.keys(bar).find((k) => bar[k] === id);
    if (!slot) { slot = 's1'; bar.s1 = id; }
    p.resource = 100; p.hp = p.maxHp; G.skills.resetCooldown(p, id);
    const def = SKILLS[id];
    if (def.channel) { H.press(slot); H.stepSec(Math.min(def.channel, 1.6)); H.release(slot); H.stepSec(0.5); }
    else if (def.targeting === 'ground_aoe' && !def.params?.atCaster) { H.press(slot); H.stepSec(0.2); H.release(slot); H.stepSec(1.3); }
    else { H.tap(slot); H.stepSec(1.3); }
    p.position.set(0, 0, 0);
    for (const e of enemies) if (e.isDead) { /* respawn */ }
  }
  // incoming damage: frontal blockable, flank, dot
  p.resource = 100;
  for (let i = 0; i < 6; i++) { G.combat.hitLocalPlayer({ sourceId: null, amount: 400, type: i % 2 ? 'fire' : 'physical', dir: [0, -1], blockable: true }); H.step(3); }
  // dodge roll
  p.dodging = true; p.dodgeStartedAt = world.time; H.step(10); p.dodging = false; H.stepSec(0.5);
  // lethal hit
  p.hp = 30; G.combat.hitLocalPlayer({ sourceId: null, amount: 900, type: 'physical', dir: [0, -1], unavoidable: true }); H.stepSec(0.3);
  const dead = p.isDead;
  const total = events['damage'].filter((d) => d.sourceId === 1 && d.targetId !== 1).reduce((a, d) => a + d.amount, 0);
  const sk = new Set(events['damage'].map((d) => d.skillId));
  console.log(`${info.id.padEnd(28)} [${cls.padEnd(9)}] dmg ${String(total).padStart(7)} dead ${dead ? 'Y' : 'n'} extraSkillIds ${[...sk].filter((x) => x && !x.startsWith(cls)).join(',')} st ${[...new Set(events['status:applied'].map((s) => s.status))].filter((s) => ['windrunner','veil','dancer','balance','burn','poison','freeze'].includes(s)).join(',')} errs ${errors.length}`);
  if (errors.length) { bad++; for (const m of errors.slice(0, 3)) console.log('   !!', m.slice(0, 400)); }
}
console.log('\nspecials with errors:', bad, 'of', infos.length);
