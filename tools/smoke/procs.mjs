#!/usr/bin/env node
/**
 * Smoke check for K13 (P-20): every MECH id in src/data/enemies_mech.ts resolves to a PROC model that exists in
 * src/ai/procModels.ts, and each procedural builder returns a body (root, height, update, dispose) without throwing.
 * No browser and no dev server; procModels imports three.js, which loads headless.
 *
 *   node tools/smoke/procs.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads src/data/enemies_mech.ts and src/ai/procModels.ts directly (native TypeScript stripping, Node >= 22.18).
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const root = fileURLToPath(new URL('../..', import.meta.url));
const { ENEMIES } = await import(pathToFileURL(root + 'src/data/enemyKit.ts').href);
const mech = await import(pathToFileURL(root + 'src/data/enemies_mech.ts').href);
const procs = await import(pathToFileURL(root + 'src/ai/procModels.ts').href);

const failures = [];
let passed = 0;
const expect = (cond, msg) => {
  if (cond) passed++;
  else failures.push(msg);
};

const ids = [...mech.MECH_IDS];
expect(ids.length > 0, 'MECH_IDS is empty');
expect(new Set(ids).size === ids.length, 'MECH_IDS has duplicates');

for (const id of ids) {
  const def = ENEMIES[id];
  expect(!!def, `${id}: not registered in ENEMIES`);
  if (!def) continue;
  expect(def.model.startsWith('PROC:'), `${id}: model "${def.model}" is not a PROC model`);
  const key = def.model.slice(5);
  expect(procs.hasProcModel(key), `${id}: no procedural builder "${key}" in procModels.ts`);
  expect(def.forces === 0, `${id}: mechanic entities must have 0 forces`);
  expect(def.radius > 0, `${id}: radius must be positive`);

  let body = null;
  try {
    body = procs.buildProcModel(key, def.tint);
  } catch (e) {
    failures.push(`${id}: buildProcModel("${key}") threw: ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  if (!body) {
    failures.push(`${id}: buildProcModel("${key}") returned null`);
    continue;
  }
  expect(typeof body.root === 'object' && body.root !== null && Array.isArray(body.root.children), `${id}: body.root is not an Object3D`);
  expect(body.height > 0, `${id}: height must be > 0 (got ${body.height})`);
  try {
    for (let f = 0; f < 3; f++) body.update(1 / 60, f / 60, 1 - f * 0.25);
    body.dispose();
    passed++;
  } catch (e) {
    failures.push(`${id}: update/dispose threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (failures.length) {
  console.error(`procs smoke: ${failures.length} failure(s), ${passed} check(s) passed`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log(`procs smoke: ok (${ids.length} MECH ids, ${passed} checks)`);
