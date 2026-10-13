import * as H from './harness.mjs';
const { G, world, errors, events } = H;
for (const [cls, slot, hold] of [['barbarian', 'e', true], ['mage', 's2', true], ['mage', 's1', false], ['rogue', 'e', false]]) {
  const p = H.addPlayer(cls); H.step(2);
  p.position.set(0, 0, 0);
  const es = [];
  for (let i = 0; i < 150; i++) es.push(H.addEnemy(Math.cos(i) * (2 + (i % 12) * 0.9), Math.sin(i) * (2 + (i % 12) * 0.9), { hp: 1e8 }));
  H.setAimTarget(es[0]);
  p.resource = 100; H.clearEvents(); errors.length = 0;
  const t0 = performance.now();
  if (hold) { H.press(slot); H.stepSec(4); H.release(slot); } else { for (let k = 0; k < 6; k++) { p.resource = 100; G.skills.resetCooldown(p, 'x'); H.tap(slot); H.stepSec(0.9); } }
  const ms = performance.now() - t0;
  console.log(cls, slot, '150 enemies:', (ms / (hold ? 240 : 6 * 55)).toFixed(2), 'ms/frame', 'damage events', events['damage'].length, 'errors', errors.length);
}
