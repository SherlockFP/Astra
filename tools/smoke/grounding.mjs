#!/usr/bin/env node
/**
 * Smoke check for K15 (P-17 grounding): the pure `groundedStrike` / `rodIndexNear` functions in src/scenes/Hazards.ts.
 * A strike within `groundedBy.radius` of a rod is cancelled; a strike outside it passes.
 *
 *   node tools/smoke/grounding.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads Hazards.ts directly (Node type stripping, Node >= 22.18). Its two runtime game imports (the G service locator and
 * the enemy factory) are replaced by stubs, since the grounding functions use neither. No browser, no dev server.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// stub the game-only runtime imports of Hazards.ts; resolve extension-less relative imports to .ts like the bundler does
const hooks = `
const STUBS = {
  '/game/G': 'export const G = {};',
  '/entities/EnemyFactory': 'export function monsterDmg() { return 1; }',
};
export async function resolve(s, c, n) {
  for (const k of Object.keys(STUBS)) {
    if (s.endsWith(k)) return { url: 'data:text/javascript,' + encodeURIComponent(STUBS[k]), shortCircuit: true };
  }
  try { return await n(s, c); } catch (e) {
    if ((e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ERR_UNSUPPORTED_DIR_IMPORT') && (s.startsWith('.') || s.startsWith('/'))) {
      for (const suf of ['.ts', '/index.ts']) {
        try { return await n(s + suf, c); } catch { /* not this suffix: try the next one */ }
      }
    }
    throw e;
  }
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const root = fileURLToPath(new URL('../..', import.meta.url));
const { groundedStrike, rodIndexNear, DungeonHazards } = await import(pathToFileURL(root + 'src/scenes/Hazards.ts').href);

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };

expect(typeof DungeonHazards === 'function', 'DungeonHazards is not exported as a class');

// two rods: (10, 10) and (30, 4), radius 2.5 m, status rod_charged
const g = { pos: [[10, 10], [30, 4]], radius: 2.5, status: 'rod_charged' };

// inside the radius: cancelled
expect(groundedStrike(11, 10, g) === true, 'strike 1 m from rod 0 should be cancelled');
expect(groundedStrike(12.4, 10, g) === true, 'strike 2.4 m from rod 0 should be cancelled');
expect(groundedStrike(12.5, 10, g) === true, 'strike exactly on the radius should be cancelled (inclusive)');
expect(groundedStrike(30, 6.4, g) === true, 'strike 2.4 m from rod 1 should be cancelled');
expect(groundedStrike(10, 10, g) === true, 'strike on the rod should be cancelled');

// outside the radius: passes
expect(groundedStrike(13, 10, g) === false, 'strike 3 m from rod 0 should pass');
expect(groundedStrike(20, 20, g) === false, 'strike far from every rod should pass');
expect(groundedStrike(10, 13.1, g) === false, 'strike 3.1 m from rod 0 (north) should pass');

// no rods: passes
expect(groundedStrike(10, 10, undefined) === false, 'a hazard without groundedBy should never be cancelled');
expect(groundedStrike(10, 10, { pos: [], radius: 2.5 }) === false, 'an empty rod list should never cancel');

// rod index: which rod grounds the point (players use the same test with the same radius)
expect(rodIndexNear(31, 4, g, g.radius) === 1, 'rodIndexNear should name rod 1 for (31, 4)');
expect(rodIndexNear(11, 10, g, g.radius) === 0, 'rodIndexNear should name rod 0 for (11, 10)');
expect(rodIndexNear(20, 20, g, g.radius) === -1, 'rodIndexNear should be -1 away from every rod');
expect(rodIndexNear(11, 10, undefined, 2.5) === -1, 'rodIndexNear without groundedBy should be -1');

if (failures.length) {
  console.error(`grounding smoke: ${failures.length} failure(s)`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('grounding smoke: ok (groundedStrike cancels within radius, passes outside)');
