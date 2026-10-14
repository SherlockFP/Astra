// Calibrates the per-spec tuning table (src/data/specTuning.ts, CORE_MECHANICS CM1) against the balance sim at L60 (docs/BALANCE.md).
// Run:  node tools/calibrate-balance.mjs [--passes=4]
//
// Each pass runs dev/combat-sim/balance.mjs --level=60 (the real pipeline: every factor is applied at its choke point) and moves the table:
//   DPS specs  dmg  *= median(ST) / ST                              -> single-target DPS lands on the median
//   tanks      dmg  *= 0.75 x median(ST) / ST                       -> tank ST at 0.75 of the median (middle of the 70-80 % band)
//              taken *= TTD / median(TTD)                           -> time-to-die index equal across tanks (TTD ~ 1 / incoming damage)
//   healers    heal *= 1.2 x reference-tank DTPS / HPS              -> the healer out-heals the reference tank with a 20 % margin
// Every factor step is clamped to 0.5-2.0 per pass, and the table stays in 0.5-2.0. The table is written after every pass; the loop stops
// when every band in the table passes (DPS ST +-8 %, tank ST 70-80 %, tank TTD +-5 %, healers keep the reference tank alive and out-heal it)
// or after --passes updates. AoE and the melee / ranged split are reported, not gated. Exit 1 while a band still fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = path.join(ROOT, 'src', 'data', 'specTuning.ts');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const PASSES = Number(args.passes ?? 4);
const STEP = [0.5, 2.0];   // a pass moves a factor by at most this ratio
const TABLE_RANGE = [0.25, 4.0]; // sanity bound on the stored factor (a factor at the bound means the kit data needs a look)
const TANK_SHARE = 0.75, HEAL_MARGIN = 1.2;
const BAND = { dpsSpread: 0.08, tankLo: 0.70, tankHi: 0.80, ttdSpread: 0.05 };

const step = (f) => Math.min(STEP[1], Math.max(STEP[0], Number.isFinite(f) ? f : STEP[1]));
const cap = (x) => Math.min(TABLE_RANGE[1], Math.max(TABLE_RANGE[0], x));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
/** balance.mjs writes ttd: null for an immortal tank (Infinity does not survive JSON). */
const ttdOf = (r) => (r.ttd === null || r.ttd === undefined ? Infinity : r.ttd);
const pct = (x) => (x * 100).toFixed(1) + '%';

// ----------------------------------------------------------------------------------------------------------------- table I/O
const LINE = /^\s*(\w+):\s*\{\s*dmg:\s*([\d.]+),\s*heal:\s*([\d.]+),\s*taken:\s*([\d.]+)\s*\},?\s*$/;
function readTable() {
  const t = {};
  for (const line of fs.readFileSync(TABLE, 'utf8').split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m) t[m[1]] = { dmg: Number(m[2]), heal: Number(m[3]), taken: Number(m[4]) };
  }
  return t;
}
function writeTable(t) {
  const body = Object.keys(t).sort().map((id) => `  ${id}: { dmg: ${t[id].dmg.toFixed(3)}, heal: ${t[id].heal.toFixed(3)}, taken: ${t[id].taken.toFixed(3)} },`);
  const block = `export const SPEC_TUNING: Record<string, SpecTuning> = {\n${body.join('\n')}\n};`;
  const src = fs.readFileSync(TABLE, 'utf8').replace(/\r\n/g, '\n');
  const next = src.replace(/export const SPEC_TUNING: Record<string, SpecTuning> = \{[^]*?\n?\};/, block);
  if (next === src && !src.includes(block)) throw new Error('specTuning.ts: SPEC_TUNING block not found');
  fs.writeFileSync(TABLE, next.replace(/\n/g, '\r\n'));
}

// ----------------------------------------------------------------------------------------------------------------- the sim
function runBalance() {
  const r = spawnSync(process.execPath, ['--no-warnings', '--import', './dev/combat-sim/register.mjs', 'dev/combat-sim/balance.mjs', '--level=60', '--no-check', '--json', '--quiet'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = (r.stdout ?? '').split('\n').reverse().find((l) => l.startsWith('[{'));
  if (!line) throw new Error(`balance.mjs printed no rows (exit ${r.status})`);
  return JSON.parse(line);
}

/** The gated bands on one run; `fails` empty = converged. */
function assess(rows) {
  const ok = rows.filter((r) => !r.error);
  const dps = ok.filter((r) => r.role === 'dps'), tanks = ok.filter((r) => r.role === 'tank'), healers = ok.filter((r) => r.role === 'healer');
  const medSt = med(dps.map((r) => r.dpsSt));
  const medTtd = med(tanks.map(ttdOf).filter(Number.isFinite));
  const fails = [];
  for (const r of dps) if (Math.abs(r.dpsSt / medSt - 1) > BAND.dpsSpread) fails.push(`${r.id} ST ${pct(r.dpsSt / medSt)} of median`);
  for (const r of tanks) {
    const x = r.dpsSt / medSt;
    if (x < BAND.tankLo || x > BAND.tankHi) fails.push(`${r.id} tank ST ${pct(x)} of median`);
    if (r.died) fails.push(`${r.id} died in the tank profile`);
    if (!Number.isFinite(ttdOf(r))) fails.push(`${r.id} takes no net damage in the tank profile (TTD infinite)`);
    else if (Math.abs(ttdOf(r) / medTtd - 1) > BAND.ttdSpread) fails.push(`${r.id} TTD ${(ttdOf(r) / medTtd).toFixed(2)}x median`);
  }
  for (const r of healers) {
    if (!r.tankSurvived) fails.push(`${r.id} lets the reference tank die`);
    if (r.hps < r.dtps) fails.push(`${r.id} HPS ${Math.round(r.hps)} < reference tank DTPS ${Math.round(r.dtps)}`);
  }
  const medAoe = med(dps.map((r) => r.dpsAoe));
  const aoeLeaders = [...dps, ...tanks].filter((r) => r.dpsAoe / medAoe > 1.35).map((r) => `${r.id} ${(r.dpsAoe / medAoe).toFixed(2)}x`);
  return { ok, dps, tanks, healers, medSt, medTtd, fails, aoeLeaders, errors: rows.filter((r) => r.error).map((r) => r.id) };
}

/** One tuning step from a run (see the header for the rules). */
function update(t, a) {
  for (const r of a.dps) t[r.id].dmg = cap(t[r.id].dmg * step(a.medSt / r.dpsSt));
  for (const r of a.tanks) {
    t[r.id].dmg = cap(t[r.id].dmg * step((TANK_SHARE * a.medSt) / r.dpsSt));
    if (Number.isFinite(ttdOf(r))) t[r.id].taken = cap(t[r.id].taken * step(ttdOf(r) / a.medTtd));
    else t[r.id].taken = cap(t[r.id].taken * STEP[1]); // immortal in the tank profile: the incoming factor is raised (it may not be the lever)
  }
  for (const r of a.healers) t[r.id].heal = cap(t[r.id].heal * step((HEAL_MARGIN * r.dtps) / Math.max(r.hps, 1)));
}

// ----------------------------------------------------------------------------------------------------------------- driver
const table = readTable();
let rows = runBalance();
for (const r of rows) table[r.id] ??= { dmg: 1, heal: 1, taken: 1 };
let a = null;
for (let pass = 1; pass <= PASSES; pass++) {
  a = assess(rows);
  const roles = `dps ${a.dps.length}, tanks ${a.tanks.length}, healers ${a.healers.length}`;
  console.log(`pass ${pass}: median ST ${Math.round(a.medSt)}, ${roles}, failing bands ${a.fails.length}${a.errors.length ? `, errors ${a.errors.join(',')}` : ''}`);
  if (a.fails.length === 0 || pass === PASSES) break;
  update(table, a);
  writeTable(table);
  rows = runBalance();
}
writeTable(table);
console.log(`\nspecTuning.ts written (${Object.keys(table).length} specs).`);
if (a.fails.length) console.log('still failing (L60):\n  ' + a.fails.join('\n  '));
if (a.aoeLeaders.length) console.log('AoE above 1.35x median (not gated):\n  ' + a.aoeLeaders.join('\n  '));
process.exit(a.fails.length || a.errors.length ? 1 : 0); // (a is the last assessed run)
