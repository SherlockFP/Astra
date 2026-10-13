import * as H from './harness.mjs';
const { G, world, errors, events } = H;

for (const cls of ['knight', 'barbarian', 'mage', 'rogue']) {
  const p = H.addPlayer(cls);
  const e = H.addEnemy(0, 2.2);
  p.position.set(0, 0, 0);
  p.yaw = 0;
  H.setAimTarget(e);
  H.press('lmb');
  H.stepSec(4);
  H.release('lmb');
  H.stepSec(1);
  const dmg = events['damage'].filter((d) => d.targetId === e.id);
  const times = dmg.map((d) => d.t.toFixed(2));
  const skillIds = dmg.map((d) => d.skillId);
  console.log(`\n== ${cls} basic chain 4s: ${dmg.length} hits, combo max ${Math.max(0, ...events['combo:changed'].map((c) => c.count))}`);
  console.log('first 12 hits:', skillIds.slice(0, 12).join(','));
  const intervals = [];
  for (let i = 1; i < Math.min(12, dmg.length); i++) intervals.push((dmg[i].t - dmg[i - 1].t).toFixed(2));
  console.log('intervals:', intervals.join(' '));
  console.log('crits:', dmg.filter((d) => d.crit).length, 'amounts sample:', dmg.slice(0, 6).map((d) => d.amount).join(','));
  console.log('resource:', Math.round(p.resource), 'enemy hp', e.hp, 'hitstops', events['hitstop'].length, 'shakes', events['camera:shake'].length);
  if (cls === 'rogue') console.log('combo points', G.skills.comboPoints(p));
}
console.log('\nERRORS:', errors.length);
for (const m of errors.slice(0, 20)) console.log(m);
