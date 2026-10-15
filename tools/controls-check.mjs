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

// ---- control-scheme fixes: walk toggle, autorun, target keys, settings coverage, labels ----
{
  const { ACTION_NAMES_TR, DEFAULT_BINDINGS, codeLabel } = INPUT;
  for (const a of ['walkToggle', 'autorun']) {
    check(!SCHEME_ACTIONS.includes(a), `${a} must be shared (not in SCHEME_ACTIONS)`);
    check(Array.isArray(DEFAULT_BINDINGS[a]) && DEFAULT_BINDINGS[a].length > 0, `${a} must have a default key`);
    check(same(tables.wow[a], tables.aksiyon[a]), `${a} must bind the same keys in both schemes`);
    check(typeof ACTION_NAMES_TR[a] === 'string' && ACTION_NAMES_TR[a].length > 0, `${a} needs a Turkish label in ACTION_NAMES_TR`);
    for (const s of SCHEMES) {
      for (const code of tables[s][a]) {
        check(!/^(Key|Digit|Mouse|Control|Meta|Shift|Alt)/.test(code), `[${s}] ${a} default ${code} must not be a letter, digit, mouse or modifier key`);
        check(maps[s].get(code)?.size === 1, `[${s}] ${a} default ${code} collides with ${[...(maps[s].get(code) ?? [])].join(', ')}`);
      }
    }
  }
  // held Ctrl / Meta must never be a default: Ctrl+W closes the tab, Ctrl+R / S / D / F / P are browser actions
  for (const s of SCHEMES) {
    for (const [action, codes] of Object.entries(tables[s])) {
      for (const code of codes) check(!/^(Control|Meta)/.test(code), `[${s}] ${action} defaults to ${code}: Ctrl / Meta fight browser shortcuts`);
    }
    check(tables[s].targetPrev?.length === 1 && tables[s].focusTarget?.length === 1, `[${s}] targetPrev and focusTarget must each have one key`);
  }
  // every default key has a readable label (no raw 'Backslash' / 'NumLock' on the bar or in Ayarlar)
  for (const s of SCHEMES) {
    for (const [action, codes] of Object.entries(tables[s])) {
      for (const code of codes) {
        const label = codeLabel(code);
        const raw = /^(Key|Digit)/.test(code);
        check(raw || label !== code || /^F\d+$/.test(code) || ['Tab', 'Enter'].includes(code), `[${s}] ${action}: key ${code} has no label in codeLabel`);
      }
    }
  }
  check(codeLabel('Backslash') === '\\', 'codeLabel(Backslash) must be a backslash');

  // Ayarlar -> Kontroller lists every rebindable action in both schemes (source scan: settings.ts pulls in the whole UI)
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(`${ROOT}/src/ui/panels/game/settings.ts`, 'utf8');
  const listOf = (name) => {
    const m = new RegExp(`const ${name}: Group\\[\\] = \\[([\\s\\S]*?)\\n\\];`).exec(src);
    return new Set(m ? [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]).filter((id) => id in DEFAULT_BINDINGS) : []);
  };
  const SKIP = { wow: ['toggleLock', 'camShoulder'], aksiyon: ['autoAttack', 'turnLeft', 'turnRight'] }; // unbound in that scheme by design
  for (const [s, name] of [['wow', 'GROUPS_WOW'], ['aksiyon', 'GROUPS_AKSIYON']]) {
    const listed = listOf(name);
    check(listed.size > 0, `${name} not found in settings.ts`);
    const missing = Object.keys(DEFAULT_BINDINGS).filter((a) => !listed.has(a) && !SKIP[s].includes(a));
    check(missing.length === 0, `[${s}] Ayarlar does not list: ${missing.join(', ')}`);
  }
}

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

// ---- WoW input gating (src/core/inputGate.ts): open windows never block movement; text fields, menus, editor, modal do ----
{
  const GATE = await imp('src/core/inputGate.ts');
  const town = { uiMode: 'town', editing: false, modal: false, chatFocused: false, textFocused: false, panelsOpen: 0 };
  check(GATE.keysBlocked(town) === false, 'gate: plain town must allow movement');
  check(GATE.keysBlocked({ ...town, panelsOpen: 1 }) === false, 'gate: a panel open (bags, NPC dialog) must NOT block movement');
  check(GATE.keysBlocked({ ...town, uiMode: 'dungeon', panelsOpen: 4 }) === false, 'gate: several panels in a dungeon must NOT block movement');
  check(GATE.keysBlocked({ ...town, chatFocused: true, panelsOpen: 1 }) === true, 'gate: chat input focused must block movement');
  check(GATE.keysBlocked({ ...town, textFocused: true }) === true, 'gate: a focused text field must block movement');
  check(GATE.keysBlocked({ ...town, uiMode: 'menu' }) === true, 'gate: the menu screen must block movement');
  check(GATE.keysBlocked({ ...town, uiMode: 'loading' }) === true, 'gate: the loading screen must block movement');
  check(GATE.keysBlocked({ ...town, editing: true }) === true, 'gate: the HUD layout editor must block movement');
  check(GATE.keysBlocked({ ...town, modal: true }) === true, 'gate: a modal confirm box must block movement');
  check(GATE.isTextTarget({ tagName: 'INPUT' }) && GATE.isTextTarget({ tagName: 'TEXTAREA' }), 'isTextTarget: input and textarea are text fields');
  check(GATE.isTextTarget({ tagName: 'DIV', isContentEditable: true }), 'isTextTarget: contenteditable is a text field');
  check(!GATE.isTextTarget({ tagName: 'BUTTON' }) && !GATE.isTextTarget(null), 'isTextTarget: a button or nothing is not a text field');

  // NPC talk window: closes once the player is more than NPC_TETHER_RANGE (6 m) from the NPC, on the ground plane
  const npc = { x: 0, z: 0 };
  check(GATE.NPC_TETHER_RANGE === 6, 'NPC_TETHER_RANGE must be 6 m');
  check(!GATE.npcTooFar({ x: 3, z: 0 }, npc), 'tether: 3 m stays open');
  check(!GATE.npcTooFar({ x: 6, z: 0 }, npc), 'tether: exactly 6 m stays open');
  check(GATE.npcTooFar({ x: 6.5, z: 0 }, npc), 'tether: 6.5 m closes the talk window');
  check(GATE.npcTooFar({ x: 5, z: 5 }, npc), 'tether: diagonal 7.07 m closes the talk window');
}

// ---- WoW skill keys (ActionBar hotkeys, casting): cast with windows open; text fields, game menu, editor, modal stop them ----
{
  const GATE = await imp('src/core/inputGate.ts');
  const town = { uiMode: 'town', editing: false, modal: false, chatFocused: false, textFocused: false, panelsOpen: 0, gameMenuOpen: false };
  check(GATE.skillKeysBlocked(town) === false, 'skill gate: plain town must allow skill keys');
  check(GATE.skillKeysBlocked({ ...town, panelsOpen: 2 }) === false, 'skill gate: bags / character / quest log open must NOT block casting');
  check(GATE.skillKeysBlocked({ ...town, uiMode: 'dungeon', panelsOpen: 1 }) === false, 'skill gate: a dungeon with a window open must allow casting');
  check(GATE.skillKeysBlocked({ ...town, gameMenuOpen: true }) === true, 'skill gate: the game menu must block casting');
  check(GATE.skillKeysBlocked({ ...town, chatFocused: true }) === true, 'skill gate: chat input focused must block casting');
  check(GATE.skillKeysBlocked({ ...town, textFocused: true }) === true, 'skill gate: a focused text field must block casting');
  check(GATE.skillKeysBlocked({ ...town, editing: true }) === true, 'skill gate: the layout editor must block casting');
  check(GATE.skillKeysBlocked({ ...town, modal: true }) === true, 'skill gate: a modal must block casting');
  check(GATE.skillKeysBlocked({ ...town, uiMode: 'menu' }) === true, 'skill gate: the menu screen must block casting');
  check(GATE.skillKeysBlocked({ ...town, uiMode: 'loading' }) === true, 'skill gate: the loading screen must block casting');
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`controls-check: ${failures.length} failure(s) in ${checks} checks`);
  process.exit(1);
}
console.log(`controls-check: OK (${checks} checks, schemes: ${SCHEMES.join(', ')}; SCHEME_ACTIONS ${SCHEME_ACTIONS.length})`);
