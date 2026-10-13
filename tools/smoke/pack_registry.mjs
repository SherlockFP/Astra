#!/usr/bin/env node
/**
 * Smoke test for K5 (P-03 pack, P-04 decor kit, P-25 trash registry and ally aura). Headless, no browser, no dev server.
 *
 *   node tools/smoke/pack_registry.mjs     exit 0 = every check passed; any failed assertion exits non-zero
 *
 * Needs Node >= 22.18 (native TypeScript type stripping). Extension-less relative imports resolve like the bundler does.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

// resolve extension-less relative imports ("./trash") to .ts files like the bundler does (same hook as tools/content-check.mjs)
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(err){if(err.code!=='ERR_MODULE_NOT_FOUND'&&err.code!=='ERR_UNSUPPORTED_DIR_IMPORT')throw err}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const load = (rel) => import(new URL(rel, import.meta.url).href);
const kit = await load('../../src/data/dungeons/kit.ts');
const { ENEMIES } = await load('../../src/data/enemies.ts');
const { CUSTOM, PASSIVES } = await load('../../src/ai/abilities.ts');
const trash = await load('../../src/ai/trash/index.ts');

const withForces = Object.keys(ENEMIES).filter((id) => ENEMIES[id].forces > 0);
assert.ok(withForces.length >= 3, 'need at least three enemies with forces to test pack sums');
const [a, b, c] = withForces;
const F = (id) => ENEMIES[id].forces;
const members = [[a, 0, 0], [b, 1, 0], [c, -1, 0.5]];

// ---- P-03 pack ------------------------------------------------------------------------------------------------------
{
  const auto = kit.pack('t_auto', 'r', 10, 10, undefined, members);
  assert.equal(auto.forces, F(a) + F(b) + F(c), 'auto forces equal the member sum');

  const explicit = kit.pack('t_explicit', 'r', 10, 10, 7, members);
  assert.equal(explicit.forces, 7, 'explicit forces are kept as written');
  assert.equal(explicit.members.length, 3);
  assert.deepEqual(explicit.members[1], { enemyId: b, offset: [1, 0] });

  const ranked = kit.pack('t_ranks', 'r', 10, 10, undefined, [[a, 0, 0]], { front: [b, b], back: [c] });
  assert.equal(ranked.members.length, 4, 'explicit member plus two front and one back');
  assert.equal(ranked.forces, F(a) + 2 * F(b) + F(c), 'rank members count toward the auto sum');
  assert.ok(ranked.members[1].offset[1] > 0 && ranked.members[2].offset[1] > 0, 'front rank sits on +z');
  assert.ok(ranked.members[3].offset[1] < 0, 'back rank sits on -z');
  assert.equal(ranked.front, undefined, 'rank arrays are consumed, not copied onto PackDef');

  const patrol = kit.pack('t_patrol', 'r', 10, 10, 1, members, { patrol: [[1, 2], [3, 4]] });
  assert.deepEqual(patrol.patrol, [[1, 2], [3, 4]]);

  const pkd = kit.pk('t_pk', 'r', 0, 0, undefined, [[a, 2]], [[c, 1]]);
  assert.equal(pkd.members.length, 3);
  assert.equal(pkd.forces, 2 * F(a) + F(c), 'pk counts expand to members');

  const pn = kit.packN('t_pn', 'r', 0, 0, [[b, 3]]);
  assert.equal(pn.forces, 3 * F(b), 'packN is auto forces over its counts');

  assert.throws(() => kit.pack('t_bad', 'r', 0, 0, undefined, [['no_such_enemy_id', 0, 0]]), /unknown member enemy/);
}

// ---- P-04 decor kit -------------------------------------------------------------------------------------------------
{
  const rect = { x: 2, z: 2, w: 10, h: 6 };
  const bal = kit.balcony(rect, 3, 3);
  assert.equal(bal.length, 3);
  assert.ok(bal.every((p) => p.collide === true && p.y === 3 && p.model === kit.BALCONY_MODEL));

  const doorN = { line: 'z', at: rect.z - 0.5, lo: 0, hi: 30 };
  assert.equal(kit.balcony(rect, 3, 3, { side: 'n', spans: [doorN] }).length, 0, 'balcony skips a door gap on its wall');

  const ch = kit.chandelier(5, 5, 3.4);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].model, kit.CHANDELIER_MODEL);
  assert.ok(ch[0].light && ch[0].light.intensity === 1.8 && ch[0].light.distance === 11);
  assert.equal(kit.chandelier(5, 5, 3.4, { light: false })[0].light, undefined);

  const bn = kit.banner(rect, 'n', [4, 6], { y: 2.4 });
  assert.equal(bn.length, 2);
  assert.ok(bn.every((p) => p.y === 2.4 && p.rot === 0));

  const room = kit.dressRoom(rect, {
    balconies: [{ y: 3, n: 2 }],
    chandeliers: [{ x: 5, z: 5, y: 3 }],
    banners: [{ side: 's', at: [4] }],
  });
  assert.equal(room.length, 4, 'dressRoom concatenates balconies, chandeliers and banners');
}

// ---- P-25 trash registry --------------------------------------------------------------------------------------------
{
  const fixtureCustom = { start() {} };
  trash.registerTrashTable({ custom: { fixture_trash_key: fixtureCustom } });
  assert.equal(CUSTOM.fixture_trash_key, fixtureCustom, 'a TRASH_CUSTOM key resolves through CUSTOM');

  assert.throws(() => trash.registerTrashTable({ custom: { fixture_trash_key: {} } }), /duplicate custom key/);
  assert.throws(() => trash.registerTrashTable({ custom: { skel_mage_raise: {} } }), /duplicate custom key/, 'base keys are protected');

  const fixturePassive = { tick() {} };
  trash.registerTrashTable({ passives: { fixture_passive: fixturePassive } });
  trash.registerPassiveAlias('fixture_alias', 'fixture_passive');
  assert.equal(PASSIVES.fixture_alias, fixturePassive, 'a passive alias resolves to the target handler');
  assert.throws(() => trash.registerPassiveAlias('fixture_alias_2', 'no_such_passive'), /unknown passive/);
}

// ---- P-25 allyAura factory ------------------------------------------------------------------------------------------
{
  const aura = trash.allyAura({ status: 'shield', seconds: 3, radius: 6, interval: 2 });
  assert.equal(typeof aura.init, 'function');
  assert.equal(typeof aura.tick, 'function');

  const applied = [];
  const mkEnemy = (id, x, z, team = 'enemy', dead = false) => {
    const held = new Set();
    return {
      id, team, position: { x, z }, isDead: dead, removed: false,
      statuses: {
        has: (s) => held.has(s),
        apply: (s, dur, o) => { held.add(s); applied.push({ id, s, dur, o }); return true; },
      },
    };
  };
  const self = mkEnemy(1, 0, 0);
  const near = mkEnemy(2, 3, 0);
  const far = mkEnemy(3, 20, 0);
  const foe = mkEnemy(4, 1, 0, 'player');
  const corpse = mkEnemy(5, 1, 1, 'enemy', true);
  const ai = { e: self, world: { enemies: [self, near, far, foe, corpse] } };
  const st = {};
  aura.init(ai, {}, st);
  aura.tick(ai, {}, st, 1);
  assert.equal(applied.length, 0, 'no pulse before the interval');
  aura.tick(ai, {}, st, 1.5);
  assert.deepEqual(applied.map((x) => x.id), [2], 'only the living ally inside the radius is pulsed');
  assert.equal(applied[0].dur, 3);
}

console.log('pack_registry: all checks passed');
