#!/usr/bin/env node
/**
 * Smoke check for the Season 1 status rows (K4, P-21): every planned StatusId has a StatusDef with an existing icon,
 * a STATUS_RULES row where the dungeon docs need one, and the numbers the docs state.
 *
 *   node tools/smoke/status_data.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads src/data/statuses.ts directly (native TypeScript stripping, Node >= 22.18). No browser, no dev server.
 */
import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./statuses_talents") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const root = fileURLToPath(new URL('../..', import.meta.url));
const { STATUSES, STATUS_RULES } = await import(pathToFileURL(root + 'src/data/statuses.ts').href);
const { TALENT_STATUSES } = await import(pathToFileURL(root + 'src/data/statuses_talents.ts').href);

/** The 14 K1 ids (src/types/skills.ts, Season 1 shared primitives P-21 / P-18). */
const S1_IDS = [
  'petrify', 'mortal_wound', 'disguise', 'bewitch', 'exposed', 'kin_laneti', 'asit_yarasi',
  'arcane_lockdown', 'withering_soul', 'deep_wound', 'ys_intensity', 'ay_cesmesi', 'mead_sticky', 'rod_charged',
];

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };

for (const id of S1_IDS) {
  const def = STATUSES[id];
  expect(def !== undefined, `${id}: no StatusDef in STATUSES`);
  if (!def) continue;
  expect(def.id === id, `${id}: def.id is "${def.id}"`);
  expect(typeof def.name === 'string' && def.name.length > 0, `${id}: empty name`);
  expect(def.kind === 'buff' || def.kind === 'debuff', `${id}: kind "${def.kind}"`);
  const iconPath = root + 'public' + def.icon;
  expect(fs.existsSync(iconPath), `${id}: icon file missing (${def.icon})`);
  expect(!(id in TALENT_STATUSES), `${id}: also defined in statuses_talents.ts (duplicate owner)`);
  expect(STATUS_RULES[id] !== undefined, `${id}: no STATUS_RULES row`);
}

// Every rule key must be a defined status (catches a rule row for an id that was never given a StatusDef).
for (const key of Object.keys(STATUS_RULES)) {
  expect(STATUSES[key] !== undefined, `STATUS_RULES.${key} has no StatusDef`);
}

// Numbers stated in the dungeon docs.
const want = (id, check, msg) => {
  const d = STATUSES[id];
  const r = STATUS_RULES[id];
  if (!d || !r) return; // reported above
  expect(check(d, r), `${id}: ${msg}`);
};
want('petrify', (d, r) => d.cc === true && d.dispellable === true && r.hard === true && r.group === 'hard', 'hard CC, dispellable (P6)');
want('mortal_wound', (d, r) => d.dispellable === false && r.healMult === 0.5, 'healing received x0.5, not dispellable (P6)');
want('bewitch', (d, r) => d.dispellable === true && d.stats?.moveSpeedPct === -0.75 && d.stats?.attackSpeed === -0.5, 'move -75%, attack speed -50%, dispellable');
want('exposed', (d, r) => r.perMag === true && r.takenMore === 1, 'takenMore 1 per magnitude (0.5 = +50%)');
want('kin_laneti', (d, r) => d.maxStacks === 3 && d.dispellable === true && r.stack === 'stack' && r.takenMore === 0.06, '+6% taken per stack, max 3, dispellable');
want('asit_yarasi', (d, r) => d.maxStacks === 5 && d.dispellable === true && r.stack === 'stack' && r.takenMore === 0.10, '+10% taken per stack, max 5, dispellable');
want('arcane_lockdown', (d, r) => d.maxStacks === 3 && d.stats?.moveSpeedPct === -0.3 && r.maxHpPctPerSec === 0.012 && r.hpFloorPct === undefined && r.onDodge?.removeStacks === 1 && d.dotType === 'arcane', '3 stacks, -30% move per stack, 1.2% max HP/s per stack, no floor, dodge removes 1');
want('withering_soul', (d, r) => d.maxStacks === 5 && d.dispellable === true && d.stats?.maxHpPct === -0.08 && d.stats?.moveSpeedPct === -0.08, '-8% max HP and -8% move per stack, max 5, dispellable');
want('deep_wound', (d, r) => d.dispellable === false && r.healMult === 0.75, 'healing received -25%');
want('ys_intensity', (d, r) => d.maxStacks === 6 && d.dispellable === true && r.stack === 'stack' && r.takenMore === 0.15, '+15% taken per stack, max 6, dispellable');
want('ay_cesmesi', (d) => d.kind === 'buff' && d.defaultDuration === 60 && d.stats?.moveSpeedPct === 0.1, 'buff 60 s, move speed +10%');
want('mead_sticky', (d, r) => d.stats?.moveSpeedPct === -0.35 && r.takenMore === 0.10, 'enemy: -35% move speed, +10% damage taken');
want('rod_charged', (d, r) => d.maxStacks === 3 && d.defaultDuration === 6 && r.stack === 'stack' && r.dealtMore === 0.08, '+8% dealt per stack, max 3, 6 s');

if (failures.length > 0) {
  for (const f of failures) console.error('FAIL', f);
  console.error(`status_data: ${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log(`status_data: ok (${S1_IDS.length} Season 1 statuses, ${Object.keys(STATUS_RULES).length} rule rows checked)`);
}
