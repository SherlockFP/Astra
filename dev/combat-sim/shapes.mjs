import * as H from './harness.mjs';
const { G, world, errors, events, SKILLS, CLASSES, THREE } = H;
const out = (...a) => console.log(...a);

// ---------- (b) remote casts of every skill
{
  const p = H.addPlayer('knight');
  class Remote extends p.constructor {}
  let n = 0;
  for (const cls of ['knight', 'barbarian', 'mage', 'rogue']) {
    const r = new Remote(cls);
    r.id = 2; r.isLocal = false; r.authority = false;
    r.position.set(5, 0, 5);
    world.add(r);
    for (const id of CLASSES[cls].skills.concat([cls + '_basic_1', cls + '_basic_3'])) {
      G.skills.playRemoteCast(r, id, { point: [5, 0, 9], dir: [0, 0, 1], targetId: null });
      H.stepSec(0.25);
      n++;
    }
    H.stepSec(3);
    world.remove(r);
    H.step(2);
  }
  out('remote casts done', n, 'errors', errors.length);
  for (const m of errors.slice(0, 8)) out('  !!', m.slice(0, 300));
  errors.length = 0;
}

// ---------- (c) HitShapes
{
  const p = H.addPlayer('knight');
  H.step(2);
  p.position.set(0, 0, 0); p.yaw = 0; p.hp = p.maxHp; clearAll();
  function clearAll() { H.clearEvents(); errors.length = 0; }
  const spawn = (s) => G.hitShapes.spawn({ sourceId: null, damage: 100, type: 'physical', telegraph: true, abilityName: 'T', ...s });
  const tests = {
    cone_in: { shape: { type: 'cone', radius: 6, angle: 90 }, origin: [0, 0, -1], dir: [0, 1], delay: 0.3 },
    cone_out: { shape: { type: 'cone', radius: 6, angle: 90 }, origin: [0, 0, -1], dir: [0, -1], delay: 0.3 },
    circle_in: { shape: { type: 'circle', radius: 3 }, origin: [1, 0, 1], dir: [0, 1], delay: 0.3 },
    circle_out: { shape: { type: 'circle', radius: 3 }, origin: [8, 0, 8], dir: [0, 1], delay: 0.3 },
    ring_in: { shape: { type: 'ring', inner: 2, outer: 6 }, origin: [0, 0, 4], dir: [0, 1], delay: 0.3 },
    ring_hole: { shape: { type: 'ring', inner: 3, outer: 6 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.3 },
    line_in: { shape: { type: 'line', length: 10, width: 3 }, origin: [0, 0, -3], dir: [0, 1], delay: 0.3 },
    rect_in: { shape: { type: 'rect', width: 4, length: 8 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.3 },
    safe_inside: { shape: { type: 'circle', radius: 3 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.3, kind: 'safe' },
    safe_outside: { shape: { type: 'circle', radius: 3 }, origin: [10, 0, 0], dir: [0, 1], delay: 0.3, kind: 'safe' },
    friendly: { shape: { type: 'circle', radius: 3 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.3, kind: 'friendly' },
    hazard: { shape: { type: 'circle', radius: 3 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.2, persist: { duration: 2, tick: 0.5 } },
    proj: { shape: { type: 'circle', radius: 0.5 }, origin: [0, 1.3, -10], dir: [0, 1], delay: 0.2, projectile: { speed: 12, radius: 0.5, range: 30, vfx: 'fire_projectile' } },
    soak: { shape: { type: 'circle', radius: 3 }, origin: [0, 0, 0], dir: [0, 1], delay: 0.3, kind: 'soak', soak: true },
  };
  for (const [name, s] of Object.entries(tests)) {
    p.hp = p.maxHp; clearAll();
    p.position.set(0, 0, 0);
    // iframes none; disable block/dodge via stats absent
    spawn(s);
    H.stepSec(name === 'hazard' ? 2.6 : name === 'proj' ? 2.5 : 0.8);
    const hurt = events['damage'].filter((d) => d.targetId === 1);
    out(name.padEnd(14), 'hits', hurt.length, 'total', hurt.reduce((a, d) => a + d.amount, 0), 'active', G.hitShapes.activeCount);
  }
  out('hitshape errors', errors.length);
  for (const m of errors.slice(0, 5)) out('  !!', m.slice(0, 300));
  errors.length = 0;
}
