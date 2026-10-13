#!/usr/bin/env node
/**
 * Smoke check for the K8 gate resolver (P-12) and the M+ checkpoint picker (P-28): the truth table for event_lock, kill_lock,
 * device_lock, requires, boss_lock, boss_exit and forces_lock, plus the legacy results and the event store.
 *
 *   node tools/smoke/gate_resolver.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads src/systems/DungeonEvents.ts directly (native TypeScript stripping, Node >= 22.18). No browser, no dev server.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { resolveGate, pickCheckpoint, DungeonEventStore, DEVICE_FLAG_PREFIX } = await import(
  pathToFileURL(root + 'src/systems/DungeonEvents.ts').href
);

let failed = 0;
let passed = 0;
function check(name, got, want) {
  if (Object.is(got, want)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

/** Fixture facts: everything closed / alive unless overridden. */
function facts(over = {}) {
  return {
    flags: {},
    deadPacks: new Set(),
    killedEnemies: new Set(),
    deadBosses: new Set(),
    boss: null,
    earlierBossAlive: false,
    forcesDone: false,
    ...over,
  };
}

// ---- event_lock ----
check('event_lock closed when flag unset', resolveGate({ gate: 'event_lock', event: 'bridge' }, facts()), false);
check('event_lock closed when flag false', resolveGate({ gate: 'event_lock', event: 'bridge' }, facts({ flags: { bridge: false } })), false);
check('event_lock open when flag true', resolveGate({ gate: 'event_lock', event: 'bridge' }, facts({ flags: { bridge: true } })), true);
check('event_lock without event name stays closed', resolveGate({ gate: 'event_lock' }, facts({ flags: { '': true } })), false);

// ---- kill_lock ----
check('kill_lock closed with no opensOn', resolveGate({ gate: 'kill_lock' }, facts({ deadPacks: new Set(['p1']) })), false);
check('kill_lock closed while pack alive', resolveGate({ gate: 'kill_lock', opensOn: { pack: 'p1' } }, facts()), false);
check('kill_lock open when named pack dead', resolveGate({ gate: 'kill_lock', opensOn: { pack: 'p1' } }, facts({ deadPacks: new Set(['p1']) })), true);
check('kill_lock open when named enemy killed', resolveGate({ gate: 'kill_lock', opensOn: { enemyId: 'mage' } }, facts({ killedEnemies: new Set(['mage']) })), true);
check('kill_lock open when named boss dead', resolveGate({ gate: 'kill_lock', opensOn: { boss: 'buyucu' } }, facts({ deadBosses: new Set(['buyucu']) })), true);
check('kill_lock ignores other kills', resolveGate({ gate: 'kill_lock', opensOn: { pack: 'p1' } }, facts({ deadPacks: new Set(['p2']) })), false);

// ---- device_lock ----
check('device_lock closed without device flag', resolveGate({ gate: 'device_lock', device: 'lever_a' }, facts()), false);
check(
  'device_lock open when dev flag set',
  resolveGate({ gate: 'device_lock', device: 'lever_a' }, facts({ flags: { [DEVICE_FLAG_PREFIX + 'lever_a']: true } })),
  true,
);
check(
  'device_lock keeps its own device id',
  resolveGate({ gate: 'device_lock', device: 'lever_b' }, facts({ flags: { [DEVICE_FLAG_PREFIX + 'lever_a']: true } })),
  false,
);

// ---- requires (any gate kind; alone it makes a lock) ----
check('requires alone: closed while pack alive', resolveGate({ gate: 'none', requires: ['p1'] }, facts()), false);
check('requires alone: open when pack dead', resolveGate({ gate: 'none', requires: ['p1'] }, facts({ deadPacks: new Set(['p1']) })), true);
check(
  'requires needs every listed pack',
  resolveGate({ gate: 'none', requires: ['p1', 'p2'] }, facts({ deadPacks: new Set(['p1']) })),
  false,
);
check(
  'requires with event_lock: both needed (event only)',
  resolveGate({ gate: 'event_lock', event: 'e', requires: ['p1'] }, facts({ flags: { e: true } })),
  false,
);
check(
  'requires with event_lock: both needed (pack only)',
  resolveGate({ gate: 'event_lock', event: 'e', requires: ['p1'] }, facts({ flags: { e: false }, deadPacks: new Set(['p1']) })),
  false,
);
check(
  'requires with event_lock: both met',
  resolveGate({ gate: 'event_lock', event: 'e', requires: ['p1'] }, facts({ flags: { e: true }, deadPacks: new Set(['p1']) })),
  true,
);

// ---- boss_lock / boss_exit (legacy rules) ----
const engaged = { id: 'b2', engaged: true, defeated: false };
const idle = { id: 'b2', engaged: false, defeated: false };
const done = { id: 'b2', engaged: false, defeated: true };
check('boss_lock closed while engaged', resolveGate({ gate: 'boss_lock' }, facts({ boss: engaged })), false);
check('boss_lock closed while an earlier boss lives', resolveGate({ gate: 'boss_lock' }, facts({ boss: idle, earlierBossAlive: true })), false);
check('boss_lock open when idle and no earlier boss alive', resolveGate({ gate: 'boss_lock' }, facts({ boss: idle })), true);
check('boss_lock open after the boss is defeated', resolveGate({ gate: 'boss_lock' }, facts({ boss: done })), true);
check('boss_lock without a boss: leave as is', resolveGate({ gate: 'boss_lock' }, facts()), null);
check('boss_exit closed while boss alive', resolveGate({ gate: 'boss_exit' }, facts({ boss: engaged })), false);
check('boss_exit open when boss defeated', resolveGate({ gate: 'boss_exit' }, facts({ boss: done })), true);
check('boss_exit without a boss: leave as is', resolveGate({ gate: 'boss_exit' }, facts()), null);

// ---- forces_lock (no boss needed) ----
check('forces_lock closed before the goal', resolveGate({ gate: 'forces_lock' }, facts()), false);
check('forces_lock open at the goal', resolveGate({ gate: 'forces_lock' }, facts({ forcesDone: true })), true);

// ---- legacy: no lock at all ----
check('none without requires: leave as is', resolveGate({ gate: 'none' }, facts()), null);
check('open without requires: leave as is', resolveGate({ gate: 'open' }, facts()), null);
check('missing gate kind: leave as is', resolveGate({}, facts()), null);

// ---- P-28 checkpoint picker ----
const cps = [
  [10, 10],
  [20, 20],
  [30, 30],
];
check('checkpoint: none dead gives -1', pickCheckpoint(cps, [false, false, false]), -1);
check('checkpoint: first boss dead gives 0', pickCheckpoint(cps, [true, false, false]), 0);
check('checkpoint: a later dead boss wins over an earlier one', pickCheckpoint(cps, [true, true, false]), 1);
check('checkpoint: latest dead wins across a gap', pickCheckpoint(cps, [true, false, true]), 2);
check('checkpoint: no checkpoints gives -1', pickCheckpoint([], [true, true]), -1);
check('checkpoint: more checkpoints than bosses only uses the bosses', pickCheckpoint(cps, [true]), 0);

// ---- event store ----
const store = new DungeonEventStore({ bridge: false });
check('store declares initial flags', store.accepts('bridge'), true);
check('store refuses undeclared names', store.accepts('mystery'), false);
check('store accepts device flags', store.accepts(DEVICE_FLAG_PREFIX + 'lever_a'), true);
check('store refuses bad characters', store.accepts('bad name!'), false);
let seen = 0;
const off = store.on(() => seen++);
check('store set reports a change', store.set('bridge', true), true);
check('store set same value is no change', store.set('bridge', true), false);
check('store notifies once per change', seen, 1);
check('store snapshot reflects set', store.snapshot().bridge, true);
off();
store.set('bridge', false);
check('store unsubscribe stops notifications', seen, 1);
store.clear();
check('store clear drops flags', store.get('bridge'), false);

if (failed > 0) {
  console.error(`gate_resolver: ${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`gate_resolver: ${passed} checks passed`);
