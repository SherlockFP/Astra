#!/usr/bin/env node
/**
 * Enemy height guard (src/entities/Enemy.ts measureHeight). Headless: every roster def with a GLB model is read from public/ (glbtris.mjs,
 * the bind geometry x node transforms, the same rest-pose bounds the engine measures) and its unscaled rest height is taken.
 * The scale-expected size of a def is a native 2 m model at def.scale (2 * def.scale); a def whose model is more than 3x that is
 * listed. A listed model is a unit / export problem (or a measurement bug), not a balance one.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/heights.mjs      (V=1 lists every def)
 * Exit 0 = nothing above 3x; exit 1 = at least one listed (so the guard can run in CI).
 */
import { existsSync } from 'node:fs';
import * as H from './harness.mjs';
import { glbToGroup, fileOf } from './glbtris.mjs';

const THREE = H.THREE;
const { ENEMIES } = await H.imp('data/enemies.ts');
const NATIVE_M = 2; // a native human-size model
const LIMIT = 3;

const rows = [];
const missing = [];
for (const def of Object.values(ENEMIES)) {
  if (!def.model || !def.model.endsWith('.glb')) continue;
  if (!existsSync(fileOf(def.model))) { missing.push(def.id); continue; }
  const root = glbToGroup(THREE, fileOf(def.model));
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root); // rest pose: glbtris builds plain meshes (no skins), so this is the bind geometry
  const native = box.isEmpty() ? 0 : box.max.y - Math.min(0, box.min.y);
  const expected = NATIVE_M * def.scale;
  const measured = native * def.scale;
  rows.push({ id: def.id, rank: def.rank, scale: def.scale, measured, expected, ratio: measured / expected });
}

const flagged = rows.filter((r) => r.ratio > LIMIT);
for (const r of process.env.V ? rows : flagged) {
  console.log(`${r.ratio > LIMIT ? 'HIGH' : 'ok  '} ${r.id.padEnd(28)} rank=${r.rank.padEnd(8)} scale=${r.scale.toFixed(2)} height=${r.measured.toFixed(2)} m expected=${r.expected.toFixed(2)} m (${r.ratio.toFixed(1)}x)`);
}
if (missing.length) console.log(`skipped (GLB not in public/): ${missing.join(', ')}`);
console.log(`${rows.length} GLB enemy defs checked, ${flagged.length} above ${LIMIT}x their scale-expected size`);
process.exit(flagged.length ? 1 : 0);
