// Calibrates the per-spec tuning table (src/data/specTuning.ts, CORE_MECHANICS CM1) against the balance sim (docs/BALANCE.md §9).
// Run:  node tools/calibrate-balance.mjs [--passes=4]
//
// The table is level-aware: a factor is a knot triple [L10, L30, L60], and a character's factor is interpolated between the knots (specTuning.ts).
// A knot is the factor at exactly its level, so the levels are fitted independently. For each of L60, L30, L10 in turn, the script runs
// dev/combat-sim/balance.mjs --level=L (the real pipeline: every factor is applied at its choke point) and moves only that level's knots:
//   DPS specs    dmg   *= median(ST) / ST                    -> single-target DPS lands on the median
//   tanks        dmg   *= 0.75 x median(ST) / ST             -> tank ST at 0.75 of the median (middle of the 70-80 % band)
//   tanks        taken *= TTD / median(TTD)                  -> time-to-die index equal across tanks (TTD ~ 1 / incoming damage)
//   healers      heal  *= 1.2 x reference-tank DTPS / healToTank -> the heals reaching the reference tank cover its damage with a 20 % margin
// Each target is clamped to a 0.5-2.0 ratio, then damped: a knot moves DAMP (60 %) of the way to its target per pass, so the update does not
// oscillate. The stored knot stays in 0.25-4.0. A level stops when its bands pass (DPS ST +-10 %, tank ST 70-80 %, tank TTD +-5 %, healers keep
// the reference tank alive and out-heal it) or after --passes updates; each level is measured once more after its last update. The table is
// written after every update. AoE and the melee / ranged split are reported here, not gated (balance.mjs gates AoE). Exit 1 while a band fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = path.join(ROOT, 'src', 'data', 'specTuning.ts');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return [m[1], m[2] ?? true]; }));
const PASSES = Number(args.passes ?? 4);
const LEVELS = args.levels ? String(args.levels).split(',').map(Number) : [60, 30, 10]; // fitted in this order (--levels=60 to fit one); each level owns one knot (index in TUNE_LEVELS = [10, 30, 60])
const KNOT = { 10: 0, 30: 1, 60: 2 };
const STEP = [0.5, 2.0];              // one update moves a factor's target by at most this ratio
const DAMP = 0.6;                     // the knot moves this share of the way to its target per pass
const TABLE_RANGE = [0.25, 4.0];      // sanity bound on a stored knot (a knot at the bound means the kit data needs a look)
const TANK_SHARE = 0.75, HEAL_MARGIN = 1.2;
const BAND = { dpsSpread: 0.10, tankLo: 0.70, tankHi: 0.80, ttdSpread: 0.05, aoeLeaderMax: 1.40 };

const step = (f) => Math.min(STEP[1], Math.max(STEP[0], Number.isFinite(f) ? f : STEP[1]));
const cap = (x) => Math.min(TABLE_RANGE[1], Math.max(TABLE_RANGE[0], x));
/** The damped knot: moves DAMP of the way from cur to cur x (the clamped ratio). */
const move = (cur, ratio) => cap(cur * (1 + DAMP * (step(ratio) - 1)));
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
/** balance.mjs writes ttd: null for an immortal tank (Infinity does not survive JSON). */
const ttdOf = (r) => (r.ttd === null || r.ttd === undefined ? Infinity : r.ttd);
const pct = (x) => (x * 100).toFixed(1) + '%';
const NEUTRAL = () => ({ dmg: [1, 1, 1], heal: [1, 1, 1], taken: [1, 1, 1] });

// ----------------------------------------------------------------------------------------------------------------- table I/O
const LINE = /^\s*(\w+):\s*\{\s*dmg:\s*\[([^\]]+)\],\s*heal:\s*\[([^\]]+)\],\s*taken:\s*\[([^\]]+)\]\s*\},?\s*$/;
const triple = (s) => s.split(',').map((x) => Number(x.trim()));
function readTable() {
  const t = {};
  for (const line of fs.readFileSync(TABLE, 'utf8').split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m) t[m[1]] = { dmg: triple(m[2]), heal: triple(m[3]), taken: triple(m[4]) };
  }
  return t;
}
function writeTable(t) {
  const knots = (v) => `[${v.map((x) => x.toFixed(3)).join(', ')}]`;
  const body = Object.keys(t).sort().map((id) => `  ${id}: { dmg: ${knots(t[id].dmg)}, heal: ${knots(t[id].heal)}, taken: ${knots(t[id].taken)} },`);
  const block = `export const SPEC_TUNING: Record<string, LevelTuning> = {\n${body.join('\n')}\n};`;
  const src = fs.readFileSync(TABLE, 'utf8').replace(/\r\n/g, '\n');
  const next = src.replace(/export const SPEC_TUNING: Record<string, LevelTuning> = \{[^]*?\n\};/, block);
  if (next === src && !src.includes(block)) throw new Error('specTuning.ts: SPEC_TUNING block not found');
  fs.writeFileSync(TABLE, next.replace(/\n/g, '\r\n'));
}

// ----------------------------------------------------------------------------------------------------------------- the sim
/** One balance.mjs run at a level (every row of that level, one per playable spec). */
function runBalance(L) {
  const r = spawnSync(process.execPath, ['--no-warnings', '--import', './dev/combat-sim/register.mjs', 'dev/combat-sim/balance.mjs', `--level=${L}`, '--no-check', '--json', '--quiet'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = (r.stdout ?? '').split('\n').reverse().find((l) => l.startsWith('[{'));
  if (!line) throw new Error(`balance.mjs printed no rows at L${L} (exit ${r.status})`);
  return JSON.parse(line);
}

/** The gated bands on one level's run; `fails` empty = converged. */
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
  const aoeLeaders = [...dps, ...tanks].filter((r) => r.dpsAoe / medAoe > BAND.aoeLeaderMax).map((r) => `${r.id} ${(r.dpsAoe / medAoe).toFixed(2)}x`);
  return { dps, tanks, healers, medSt, medTtd, fails, aoeLeaders, errors: rows.filter((r) => r.error).map((r) => r.id) };
}

/** One damped tuning step at knot index i (the level being fitted); see the header for the targets. */
function update(t, a, i) {
  for (const r of a.dps) t[r.id].dmg[i] = move(t[r.id].dmg[i], a.medSt / r.dpsSt);
  for (const r of a.tanks) {
    t[r.id].dmg[i] = move(t[r.id].dmg[i], (TANK_SHARE * a.medSt) / r.dpsSt);
    // a tank immortal in the tank profile: the incoming knot is raised at the largest step (it may not be the lever)
    t[r.id].taken[i] = Number.isFinite(ttdOf(r)) ? move(t[r.id].taken[i], ttdOf(r) / a.medTtd) : move(t[r.id].taken[i], STEP[1]);
  }
  // healers: the heals that reach the reference tank (healToTank) must cover its damage. Total HPS also pays for the DPS allies, so it
  // overstated the healing the tank gets and the knot fell while the tank still died (BALANCE.md §9).
  for (const r of a.healers) t[r.id].heal[i] = move(t[r.id].heal[i], (HEAL_MARGIN * r.dtps) / Math.max(r.healToTank ?? r.hps, 1));
}

// ----------------------------------------------------------------------------------------------------------------- driver
let table = readTable();
const results = [];
for (const L of LEVELS) {
  const i = KNOT[L];
  let rows = runBalance(L);
  for (const r of rows) table[r.id] ??= NEUTRAL();
  // the best pass is kept: a damped step that adds failing bands is rolled back (the other levels' knots are not touched by this fit)
  let best = null, a;
  for (let updates = 0; ; updates++) {
    a = assess(rows);
    console.log(`L${L} after ${updates} update(s): median ST ${Math.round(a.medSt)}, dps ${a.dps.length}, tanks ${a.tanks.length}, healers ${a.healers.length}, failing bands ${a.fails.length}${a.errors.length ? `, errors ${a.errors.join(',')}` : ''}`);
    if (!best || a.fails.length < best.a.fails.length) best = { a, table: structuredClone(table) };
    if (a.fails.length === 0 || updates === PASSES) break;
    update(table, a, i);
    writeTable(table);
    rows = runBalance(L);
  }
  if (best.a !== a) console.log(`L${L}: kept the best pass (${best.a.fails.length} failing band(s)); the last pass had ${a.fails.length}`);
  table = best.table;
  writeTable(table);
  results.push({ L, a: best.a });
}
writeTable(table);
console.log(`\nspecTuning.ts written (${Object.keys(table).length} specs, knots [L10, L30, L60]).`);
let exit = 0;
for (const { L, a } of results) {
  console.log(`\nL${L}: ${a.fails.length} failing band(s)`);
  if (a.fails.length) console.log('  ' + a.fails.join('\n  '));
  if (a.aoeLeaders.length) console.log(`  AoE above ${BAND.aoeLeaderMax}x median (reported): ${a.aoeLeaders.join(', ')}`);
  if (a.fails.length || a.errors.length) exit = 1;
}
process.exit(exit);
