#!/usr/bin/env node
/**
 * Headless control-scheme validator (CONTROLS_WOW §3.3). Checks the WoW and Aksiyon keymaps for collisions, the
 * SCHEME_ACTIONS list, the reserved mouse buttons and the one-time controls migration (migrateControlsRev).
 * No browser, no dev server, no Vite (about one second), the same way tools/talents-check.mjs works.
 *
 *   node tools/controls-check.mjs
 *
 * Exit code 1 on any failure. Needs Node >= 22.18 (native TypeScript type stripping).
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./Input") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){let last=e;for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(err){last=err}}throw last}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);

const INPUT = await imp('src/core/Input.ts');
const SETTINGS = await imp('src/core/Settings.ts');
const { SCHEME_ACTIONS, SCHEME_BINDINGS, RESERVED_MOUSE, defaultBindings } = INPUT;
const { migrateControlsRev } = SETTINGS;

const SCHEMES = ['wow', 'aksiyon'];
const SLOT_KEYS = ['skill_lmb', 'skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'skill_s4', 'skill_m45', 'skill_m90', 'skill_m180'];
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const LETTERS = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`);

const failures = [];
let checks = 0;
function check(ok, msg) {
  checks++;
  if (!ok) failures.push(msg);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** code -> set of actions that list it (a code listed twice inside one action counts once). */
function codeMap(table) {
  const map = new Map();
  for (const [action, codes] of Object.entries(table)) {
    for (const code of codes) {
      if (!map.has(code)) map.set(code, new Set());
      map.get(code).add(action);
    }
  }
  return map;
}

const tables = Object.fromEntries(SCHEMES.map((s) => [s, defaultBindings(s)]));
const maps = Object.fromEntries(SCHEMES.map((s) => [s, codeMap(tables[s])]));

for (const s of SCHEMES) {
  const table = tables[s];
  const map = maps[s];

  // §3.3.1 every code maps to exactly one action
  for (const [code, actions] of map) {
    check(actions.size === 1, `[${s}] ${code} is bound to more than one action: ${[...actions].join(', ')}`);
  }

  // §3.3.3 digits 1-0 and letters A-Z are each bound exactly once
  for (const code of [...DIGITS, ...LETTERS]) {
    check(map.get(code)?.size === 1, `[${s}] ${code} is not bound exactly once (${[...(map.get(code) ?? [])].join(', ') || 'free'})`);
  }

  // §3.3.4 slot keys exist, have at most one code (WoW lmb has none by design)
  for (const a of SLOT_KEYS) {
    const codes = table[a];
    check(Array.isArray(codes), `[${s}] ${a} is missing from the keymap`);
    if (!Array.isArray(codes)) continue;
    const max = s === 'wow' && a === 'skill_lmb' ? 0 : 1;
    check(codes.length <= max, `[${s}] ${a} has ${codes.length} codes (max ${max})`);
  }

  // §3.3.2 reserved mouse buttons (WoW): never bound to an action
  for (const code of RESERVED_MOUSE[s]) {
    check(!map.has(code), `[${s}] reserved mouse button ${code} is bound to ${[...(map.get(code) ?? [])].join(', ')}`);
  }
}

// §3.3.2 WoW: Mouse0 / Mouse2 reserved, Mouse1 only in autoAttack
check(same([...RESERVED_MOUSE.wow].sort(), ['Mouse0', 'Mouse2']), `RESERVED_MOUSE.wow must be [Mouse0, Mouse2], got ${RESERVED_MOUSE.wow}`);
check(same([...(maps.wow.get('Mouse1') ?? [])], ['autoAttack']), `[wow] Mouse1 must be bound only to autoAttack, got ${[...(maps.wow.get('Mouse1') ?? [])]}`);
check(same([...(maps.wow.get('Equal') ?? [])], ['autoAttack']), '[wow] Equal must be bound only to autoAttack');

// §3.3.5 SCHEME_ACTIONS = actions whose arrays differ between the schemes, plus the new actions
const NEW_ACTIONS = ['autoAttack', 'turnLeft', 'turnRight'];
const diff = Object.keys(tables.wow).filter((a) => !same(tables.wow[a], tables.aksiyon[a]));
const expected = [...new Set([...diff, ...NEW_ACTIONS])].sort();
const actual = [...SCHEME_ACTIONS].sort();
check(new Set(SCHEME_ACTIONS).size === SCHEME_ACTIONS.length, 'SCHEME_ACTIONS contains duplicates');
check(same(actual, expected), `SCHEME_ACTIONS mismatch. missing: [${expected.filter((a) => !actual.includes(a))}] extra: [${actual.filter((a) => !expected.includes(a))}]`);
check(same(Object.keys(SCHEME_BINDINGS.aksiyon), []), 'SCHEME_BINDINGS.aksiyon must be empty (Aksiyon is the base table)');
for (const a of Object.keys(SCHEME_BINDINGS.wow)) check(SCHEME_ACTIONS.includes(a), `SCHEME_BINDINGS.wow.${a} is not in SCHEME_ACTIONS`);

// §3.3.6 migrateControlsRev fixtures
{
  const stored = { bindings: { skill_q: ['KeyF'], inventory: ['KeyZ'] } };
  const patch = migrateControlsRev(stored);
  check(same(patch.schemeBindings?.aksiyon?.skill_q, ['KeyF']), 'migrate (a): skill_q rebind must move to schemeBindings.aksiyon');
  check(same(patch.bindings?.inventory, ['KeyZ']), 'migrate (a): inventory rebind must stay shared');
  check(patch.bindings !== undefined && !('skill_q' in patch.bindings), 'migrate (a): skill_q must be removed from the shared bindings');
  check(patch.controlScheme === 'wow', 'migrate (a): controlScheme must become wow');

  const done = migrateControlsRev({ controlsRev: 1, bindings: { skill_q: ['KeyF'] } });
  check(same(done, {}), 'migrate (b): a file with controlsRev 1 must be untouched');

  const merged = { ...stored, ...patch };
  check(same(migrateControlsRev(merged), {}), 'migrate (c): a second run must be a no-op');
  check(same(merged.schemeBindings?.aksiyon?.skill_q, ['KeyF']), 'migrate (c): merged file keeps the Aksiyon rebind');
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`controls-check: ${failures.length} failure(s) in ${checks} checks`);
  process.exit(1);
}
console.log(`controls-check: OK (${checks} checks, schemes: ${SCHEMES.join(', ')}; SCHEME_ACTIONS ${SCHEME_ACTIONS.length})`);
