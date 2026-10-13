#!/usr/bin/env node
/**
 * CW-03 headless self-check (COMBAT_WOW §4.3 CW-03). Checks the proc data without a browser or dev server.
 *
 *   node tools/smoke/procs_data.mjs
 *
 * Checks:
 *  1. every PROC_DEFS status has a StatusDef in STATUSES;
 *  2. every glow id (ProcDef.glow and GLOW_RULES) is a skill in SKILLS, a `@tag` token, or listed in PENDING_GLOW_SKILLS;
 *  3. every PROC_MODS skill id resolves the same way, and every PROC_MODS status has a ProcDef;
 *  4. the ids COMBAT_WOW §4.3 names are present (StatusIds and ProcDef rows);
 *  5. behaviour: activeProcs / glowSkillsOf / resolveProcMods / consumeProcMods on a fake status view;
 *     registerProcDefs rejects a duplicate id.
 * Pending glow ids that now exist in SKILLS are reported as info (remove them from PENDING_GLOW_SKILLS).
 *
 * Needs Node >= 22.18 (native TypeScript type stripping), same loader as tools/content-check.mjs.
 * Exit code 1 when any check fails.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){let last=e;for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(err){last=err}}throw last}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const imp = (p) => import(pathToFileURL(`${ROOT}${p}`).href);

const { SKILLS } = await imp('src/data/skills.ts');
const { STATUSES } = await imp('src/data/statuses.ts');
const procs = await imp('src/data/procs.ts');
const mods = await imp('src/combat/procMods.ts');

const { PROC_DEFS, PENDING_GLOW_SKILLS, GLOW_RULES, registerProcDefs, activeProcs, glowSkillsOf } = procs;
const { PROC_MODS, resolveProcMods, consumeProcMods } = mods;

let failures = 0;
let checks = 0;
const fail = (msg) => { failures++; console.error(`FAIL ${msg}`); };
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); };

/** A glow / mod skill id is fine when it is a `@tag`, a real skill, or an explicitly pending id. */
const skillResolves = (id) => id.startsWith('@') || id in SKILLS || PENDING_GLOW_SKILLS.has(id);

// 1. every ProcDef status has a StatusDef
for (const d of PROC_DEFS) ok(STATUSES[d.status], `ProcDef ${d.id}: status ${d.status} has no StatusDef`);

// 2. glow ids
for (const d of PROC_DEFS) {
  for (const id of d.glow) ok(skillResolves(id), `ProcDef ${d.id}: glow id ${id} is neither in SKILLS nor pending`);
}
for (const rule of Object.values(GLOW_RULES)) {
  for (const id of rule.skills({
    resourcePct: 1, bestSpender: null, pips: 5, combo: 5, arcane: 4, targetHpPct: 0, stealthed: true,
    riposteOpen: true, targetGuardBroken: true, bleedingEnemies: 3,
  })) ok(skillResolves(id), `GLOW_RULES ${rule.id}: glow id ${id} is neither in SKILLS nor pending`);
}

// 3. PROC_MODS
for (const mod of Object.values(PROC_MODS)) {
  ok(PROC_DEFS.some((d) => d.status === mod.status), `PROC_MODS ${mod.status}: no ProcDef row for this status`);
  for (const id of mod.skills) ok(skillResolves(id), `PROC_MODS ${mod.status}: skill ${id} is neither in SKILLS nor pending`);
}

// 4. ids COMBAT_WOW names
// art_of_justice was removed with the Paladin Protection kit (PM-KN / PM-PA): no status, no ProcDef row
const EXPECTED_STATUSES = ['heating_up', 'hot_streak', 'brain_freeze', 'fingers_of_frost', 'winters_chill', 'clearcasting',
  'revenge_ready', 'sudden_death', 'wrath_return', 'opportunity', 'lockout'];
for (const s of EXPECTED_STATUSES) ok(STATUSES[s], `StatusDef missing for ${s}`);
const EXPECTED_DEFS = ['heating_up', 'hot_streak', 'fingers_of_frost', 'brain_freeze', 'clearcasting',
  'revenge_ready', 'sudden_death', 'wrath_return', 'opportunity'];
for (const id of EXPECTED_DEFS) ok(PROC_DEFS.some((d) => d.id === id), `ProcDef row missing for ${id}`);

// informational: pending ids that already exist
for (const id of PENDING_GLOW_SKILLS) if (id in SKILLS) console.log(`info pending glow id now exists in SKILLS: ${id}`);

// 5. behaviour on a fake status view
const fakePlayer = (active) => {
  const set = new Map(active.map(([id, n]) => [id, n]));
  return {
    has: (id) => set.has(id),
    stacks: (id) => set.get(id) ?? 0,
    remove: (id) => { set.delete(id); },
    _set: set,
  };
};

const hot = fakePlayer([['hot_streak', 1]]);
ok(activeProcs(hot).map((d) => d.id).join() === 'hot_streak', 'activeProcs: hot_streak should be the only active proc');
const idleState = {
  resourcePct: 0, bestSpender: null, pips: 0, combo: 0, arcane: 0, targetHpPct: null, stealthed: false,
  riposteOpen: false, targetGuardBroken: false, bleedingEnemies: 0,
};
const glowHot = glowSkillsOf(hot, idleState);
for (const id of ['mage_flame_wave', 'mage_meteor', 'mage_phoenix_flames']) ok(glowHot.has(id), `glowSkillsOf(hot_streak) missing ${id}`);

// revenge_ready moved from knight_shield_bash to knight_revenge (PM-KN): free, +25 %, no cooldown skip
const rev = fakePlayer([['revenge_ready', 1], ['sudden_death', 1]]);
const r = resolveProcMods(rev, 'knight_revenge');
ok(r && r.costMult === 0 && !r.cdFree && r.more === 1.25 && r.sources.join() === 'revenge_ready', 'resolveProcMods: revenge_ready on knight_revenge');
ok(resolveProcMods(rev, 'knight_shield_bash') === null, 'resolveProcMods: revenge_ready no longer applies to knight_shield_bash');
ok(resolveProcMods(rev, 'rogue_backstab') === null, 'resolveProcMods: no mod for an unrelated skill');
ok(consumeProcMods(rev, r) === 0 && !rev.has('revenge_ready') && rev.has('sudden_death'), 'consumeProcMods removes only the consumed proc');
ok(consumeProcMods(rev, r) === 0, 'consumeProcMods is idempotent');

// sudden_death (PM-KN / PM-BA): one shared ProcMod for knight_execute and barbarian_execute, one stack per consume
for (const id of ['knight_execute', 'barbarian_execute']) {
  const sd = resolveProcMods(fakePlayer([['sudden_death', 2]]), id);
  ok(sd && sd.costMult === 0 && sd.anyHp && sd.sources.join() === 'sudden_death', `sudden_death ProcMod applies to ${id}`);
}
{
  const stacks = new Map([['sudden_death', 2]]);
  const host = {
    has: (id) => stacks.has(id),
    stacks: (id) => stacks.get(id) ?? 0,
    remove: (id) => { stacks.delete(id); },
    consumeStack: (id) => { const n = stacks.get(id); if (!n) return false; if (n <= 1) stacks.delete(id); else stacks.set(id, n - 1); return true; },
  };
  consumeProcMods(host, resolveProcMods(host, 'knight_execute'));
  ok(stacks.get('sudden_death') === 1, 'sudden_death: one execute consumes one stack (2 -> 1), not the whole status');
  consumeProcMods(host, resolveProcMods(host, 'barbarian_execute'));
  ok(!stacks.has('sudden_death'), 'sudden_death: the last stack is removed by the next execute');
}
// Gore (PM-BA): Kanlı Fırsat grants +5 rage when Yarma consumes it
{
  const gore = resolveProcMods(fakePlayer([['gore', 1]]), 'barbarian_cleave');
  ok(gore && gore.cdReset && gore.resource === 5, 'gore: Yarma resets its cooldown and grants 5 rage');
}

const wr = fakePlayer([['wrath_return', 1]]);
const wrr = resolveProcMods(wr, 'barbarian_cleave');
ok(consumeProcMods(wr, wrr) === 0.04, 'consumeProcMods returns the heal fraction of wrath_return');

const opp = fakePlayer([['opportunity', 1]]);
const oppr = resolveProcMods(opp, 'rogue_crossbow_shot');
ok(oppr && oppr.more === 1.6 && oppr.bonusPips.length === 1 && oppr.bonusPips[0].id === 'combo', 'opportunity: more 1.6 and +1 combo');

// registration extension point
registerProcDefs([{ id: 'smoke_test_proc', status: 'hot_streak', name: 'x', school: 'fire', overlay: 'center', glow: [],
  durationHint: 1, priority: 1 }]);
ok(PROC_DEFS.some((d) => d.id === 'smoke_test_proc'), 'registerProcDefs appends a row');
let dupThrew = false;
try { registerProcDefs([{ id: 'hot_streak', status: 'hot_streak', name: 'x', school: 'fire', overlay: 'top', glow: [],
  durationHint: 1, priority: 1 }]); } catch { dupThrew = true; }
ok(dupThrew, 'registerProcDefs rejects a duplicate id');

if (failures > 0) {
  console.error(`procs_data: ${failures} failure(s) out of ${checks} checks`);
  process.exit(1);
}
console.log(`procs_data: PASS (${checks} checks, ${PROC_DEFS.length} ProcDefs, ${Object.keys(PROC_MODS).length} ProcMods)`);
