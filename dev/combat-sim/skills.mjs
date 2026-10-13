import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES } = H;

const only = process.argv[2];
for (const cls of ['knight', 'barbarian', 'mage', 'rogue']) {
  if (only && only !== cls) continue;
  console.log(`\n######## ${cls}`);
  for (const id of CLASSES[cls].skills) {
    const def = SKILLS[id];
    const p = H.addPlayer(cls);
    const enemies = [H.addEnemy(0, 3), H.addEnemy(1.5, 3.5), H.addEnemy(-1.5, 4), H.addEnemy(0.5, 6), H.addEnemy(-3, 2), H.addEnemy(0, -2.5), H.addEnemy(0, 9)];
    H.step(2);
    p.position.set(0, 0, 0); p.yaw = 0;
    p.resource = 100; p.hp = p.maxHp;
    H.setAimTarget(enemies[0]);
    const bar = G.character.save.skillBar;
    let slot = Object.keys(bar).find((k) => bar[k] === id);
    if (!slot) { slot = 's1'; bar.s1 = id; }
    H.clearEvents();
    errors.length = 0;
    const r0 = p.resource;
    const channel = !!def.channel;
    const ground = def.targeting === 'ground_aoe' && !def.params?.atCaster && !channel;
    if (channel) { H.press(slot); H.stepSec(Math.min(def.channel + 0.3, 2.2)); H.release(slot); H.stepSec(1.5); }
    else if (ground) { H.press(slot); H.stepSec(0.25); H.release(slot); H.stepSec(3.5); }
    else { H.tap(slot); H.stepSec(3.5); }
    const dm = events['damage'];
    const bySkill = {};
    for (const d of dm) bySkill[d.skillId ?? '?'] = (bySkill[d.skillId ?? '?'] ?? 0) + 1;
    const total = dm.reduce((a, d) => a + d.amount, 0);
    const targetsHit = new Set(dm.map((d) => d.targetId)).size;
    const cd = G.skills.getCooldown(p, id);
    const st = events['status:applied'].map((s) => s.status);
    const stCount = {};
    for (const s of st) stCount[s] = (stCount[s] ?? 0) + 1;
    const casts = events['skill:cast'].filter((c) => c.skillId === id).length;
    console.log(`${id.padEnd(30)} casts ${casts} hits ${dm.length} tgt ${targetsHit} dmg ${total} res ${Math.round(r0)}->${Math.round(p.resource)} cd ${cd.remaining.toFixed(1)}/${cd.total.toFixed(1)} fails ${events['skill:fail'].map((f) => f.reason).join(',') || '-'} st ${JSON.stringify(stCount)} act ${G.skills.getAction(p) ? 'RUNNING' : 'done'} pos ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)}`);
    if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', m.slice(0, 300));
  }
}
