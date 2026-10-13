import * as H from './harness.mjs';
const { G, world, errors, events } = H;
for (const as of [0, 0.5, 1.0]) {
  const p = H.addPlayer('knight'); H.step(2); p.position.set(0, 0, 0); p.stats.attackSpeed = as;
  const e = H.addEnemy(0, 1.6, { hp: 1e9, radius: 0.8, rank: 'boss', ccImmune: true }); H.setAimTarget(e); H.clearEvents();
  H.press('lmb'); H.stepSec(3); H.release('lmb');
  const d = events['damage'].filter((x) => x.targetId === e.id);
  console.log('attackSpeed +' + as * 100 + '%:', d.length, 'hits in 3 s ->', (d.length / 3).toFixed(2), 'hits/s');
}
