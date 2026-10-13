#!/usr/bin/env node
/**
 * Headless round-trip check for the snap wire codec (ENGINE_VERTICALITY §15, element 12 + flag 16 for EnemySyncState.y).
 *
 *   node tools/codec-roundtrip.mjs
 *
 * Checks: a grounded enemy encodes to the legacy 12-element tuple; an airborne enemy appends y (13 elements, flag 16) and
 * decodes it back; a legacy 12-element tuple still decodes without y; a non-finite y is never emitted. Exit 0 all PASS, 1 fail.
 * Needs Node >= 22.18 (native TypeScript type stripping), like tools/height-check.mjs.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// resolve extension-less relative imports to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { encodePayload, decodePayload } = await import(pathToFileURL(`${ROOT}src/net/codec.ts`).href);

let fails = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    fails++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

const base = { id: 7, x: 12.5, z: -3.25, yaw: 1.5, hp: 90, maxHp: 120, anim: 'Walk', targetId: 1001, cast: null, dead: false };
const snap = (enemies) => ({ t: 42.5, enemies });

/** Encodes one enemy through the snap channel and returns its wire tuple. */
const wireOf = (e) => encodePayload('snap', snap([e])).e[0];

check('grounded enemy encodes to the legacy 12-element tuple', () => {
  const w = wireOf({ ...base, aggroed: true, shot: 'Slash:1', shotSeq: 3 });
  assert.equal(w.length, 12);
  assert.equal(w[9] & 16, 0);
});

check('grounded enemy round-trips without y', () => {
  const d = decodePayload('snap', encodePayload('snap', snap([{ ...base }])));
  assert.equal(d.enemies.length, 1);
  assert.equal(d.enemies[0].y, undefined);
  assert.equal(d.enemies[0].x, base.x);
  assert.equal(d.enemies[0].dead, false);
});

check('airborne enemy appends y as element 12 with flag 16', () => {
  const w = wireOf({ ...base, y: 9.25 });
  assert.equal(w.length, 13);
  assert.equal(w[12], 9.25);
  assert.equal(w[9] & 16, 16);
});

check('airborne enemy round-trips y, including with aggro and shot flags', () => {
  const src = { ...base, y: -2.5, dead: true, aggroed: false, shot: 'Leap:1', shotSeq: 9 };
  const d = decodePayload('snap', encodePayload('snap', snap([src]))).enemies[0];
  assert.equal(d.y, -2.5);
  assert.equal(d.dead, true);
  assert.equal(d.aggroed, false);
  assert.equal(d.shot, 'Leap:1');
  assert.equal(d.shotSeq, 9);
  assert.equal(d.hp, base.hp);
});

check('y = 0 is kept (not treated as absent)', () => {
  const d = decodePayload('snap', encodePayload('snap', snap([{ ...base, y: 0 }]))).enemies[0];
  assert.equal(d.y, 0);
});

check('non-finite y is never emitted', () => {
  assert.equal(wireOf({ ...base, y: NaN }).length, 12);
  assert.equal(wireOf({ ...base, y: Infinity }).length, 12);
});

check('legacy 12-element tuple (old peer) decodes without y', () => {
  const legacy = [5, 1, 2, 0.5, 10, 20, 'Idle', null, null, 1, null, 0];
  const d = decodePayload('snap', { t: 1, e: [legacy] }).enemies[0];
  assert.equal(d.id, 5);
  assert.equal(d.dead, true);
  assert.equal(d.y, undefined);
});

check('13-element tuple without flag 16 ignores element 12', () => {
  const t = [5, 1, 2, 0.5, 10, 20, 'Idle', null, null, 0, null, 0, 77];
  const d = decodePayload('snap', { t: 1, e: [t] }).enemies[0];
  assert.equal(d.y, undefined);
});

check('pstate round-trip unchanged (y is element 1)', () => {
  const p = { x: 1, y: 3.5, z: 2, yaw: 0, vx: 0, vz: 0, anim: 'Idle', hp: 5, maxHp: 9, res: 1, maxRes: 2, dead: false, dodging: true, level: 3, t: 4, id: 11 };
  const w = encodePayload('pstate', p);
  assert.equal(w.length, 19);
  const d = decodePayload('pstate', w);
  assert.equal(d.y, 3.5);
  assert.equal(d.dodging, true);
});

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('all PASS');
