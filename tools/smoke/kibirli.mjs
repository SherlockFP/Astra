#!/usr/bin/env node
/**
 * Smoke test for K17 (P-26 affixSafe, P-27 Kibirli). Headless, no browser, no dev server.
 *
 *   node tools/smoke/kibirli.mjs     exit 0 = every check passed; any failed assertion exits non-zero
 *
 * Covers the pure helpers that systems/Affixes.ts calls (thresholds, spot choice, affix-safe test) and the Kibirli data.
 * Needs Node >= 22.18 (native TypeScript type stripping). Extension-less relative imports resolve like the bundler does.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(err){if(err.code!=='ERR_MODULE_NOT_FOUND'&&err.code!=='ERR_UNSUPPORTED_DIR_IMPORT')throw err}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const load = (rel) => import(new URL(rel, import.meta.url).href);
const ma = await load('../../src/data/mythicAffixes.ts');
const { TILE_SIZE } = await load('../../src/types/dungeons.ts');

const P = ma.MYTHIC_AFFIXES.seasonal_efsun;
const p = P.params;

// ---- data: name, thresholds, windows, buff, Kibir HP, min distance ----------------------------------------------------
assert.equal(P.name, 'Kibirli', 'player-facing name is Kibirli');
assert.deepEqual([p.t1, p.t2, p.t3, p.t4], [0.2, 0.4, 0.6, 0.8], 'spawn thresholds 20/40/60/80 %');
assert.deepEqual([...ma.EFSUN_THRESHOLDS], [0.2, 0.4, 0.6, 0.8]);
assert.equal(p.killWindow, 60, 'killWindow is 60 s');
assert.equal(p.buffDuration, 60, 'Kibirli buff lasts 60 s');
assert.equal(p.buffDmgPct, 0.1, 'party +10 % damage');
assert.equal(p.buffMoveSpeedPct, 0.1, 'party +10 % move speed');
assert.equal(p.kibirHpMult, 4, 'Kibir Tecessumu has 4 x trash HP');
assert.equal(p.minDistance, 15, 'no spawn within 15 m of the party point');

// ---- thresholds fire once each, exactly at 20/40/60/80 % --------------------------------------------------------------
{
  assert.deepEqual(ma.kibirThresholdsCrossed(0, 0.2), [0.2], 'exact 20 % fires');
  assert.deepEqual(ma.kibirThresholdsCrossed(0.19, 0.41), [0.2, 0.4]);
  assert.deepEqual(ma.kibirThresholdsCrossed(0.4, 0.4), [], 'standing on a threshold does not refire');
  assert.deepEqual(ma.kibirThresholdsCrossed(0.79, 0.79), []);
  assert.deepEqual(ma.kibirThresholdsCrossed(0, 1), [0.2, 0.4, 0.6, 0.8]);
  // a run of small forces ticks: every threshold fires exactly once, at its own tick
  let frac = 0; const fired = [];
  for (let i = 0; i < 1000; i++) {
    const next = Math.min(1, frac + 0.003);
    fired.push(...ma.kibirThresholdsCrossed(frac, next));
    frac = next;
  }
  assert.deepEqual(fired, [0.2, 0.4, 0.6, 0.8], 'four spawns over a full run, no duplicates');
}

// ---- spot choice: nearest spot at least 15 m from the party point, never relaxed -------------------------------------
{
  const party = { x: 0, z: 0 };
  const spots = [{ x: 10, z: 0 }, { x: 20, z: 0 }, { x: 0, z: 30 }];
  const none = () => false;
  assert.equal(ma.pickKibirSpot(spots, party, 15, none), 1, 'spot 0 (10 m) is too close; nearest legal is spot 1 (20 m)');
  assert.equal(ma.pickKibirSpot(spots, party, 15, (i) => i === 1), 2, 'used or blocked spots are skipped');
  assert.equal(ma.pickKibirSpot([{ x: 14.9, z: 0 }], party, 15, none), -1, 'inside 15 m: no spawn (no relaxation)');
  assert.equal(ma.pickKibirSpot([{ x: 15, z: 0 }], party, 15, none), 0, 'exactly 15 m is allowed');
  assert.equal(ma.pickKibirSpot([], party, 15, none), -1);
}

// ---- affix-safe zones: tile zones converted the way Affixes.affixSafeWorld does, then tested -------------------------
{
  // Affixes.affixSafeWorld: centre (t + 0.5) * TILE_SIZE, radius r * TILE_SIZE (same convention as riftSpots)
  const tiles = [{ x: 20, z: 20, r: 3 }];
  const zones = tiles.map((s) => ({ x: (s.x + 0.5) * TILE_SIZE, z: (s.z + 0.5) * TILE_SIZE, r: s.r * TILE_SIZE }));
  const cx = zones[0].x, cz = zones[0].z;
  assert.equal(ma.inAffixSafe(cx, cz, zones), true, 'centre is affix-safe');
  assert.equal(ma.inAffixSafe(cx + zones[0].r - 0.1, cz, zones), true, 'just inside the radius');
  assert.equal(ma.inAffixSafe(cx + zones[0].r + 0.5, cz, zones), false, 'outside the radius');
  assert.equal(ma.inAffixSafe(0, 0, []), false, 'no zones: nothing is safe');

  // an affix-safe spot is skipped by the Kibirli spot choice (the same predicate Affixes.pickRiftSpot uses)
  const spots = [{ x: cx, z: cz }, { x: cx + 40, z: cz }];
  const idx = ma.pickKibirSpot(spots, { x: cx - 30, z: cz }, 15, (i) => ma.inAffixSafe(spots[i].x, spots[i].z, zones));
  assert.equal(idx, 1, 'affix-safe point skipped, next legal spot taken');
}

console.log('kibirli smoke: all checks passed');
