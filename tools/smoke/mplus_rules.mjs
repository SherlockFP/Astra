#!/usr/bin/env node
/**
 * Smoke check for K16 (P-26 Mythic+ rules) against docs/CORE_MECHANICS.md section 6:
 *   - HP/damage level multiplier x1.08^(L-1) up to +10 (x2.0 at +10), then x1.10 per level;
 *   - Fortified on trash only (+20 % HP, +30 % damage); Tyrannical on bosses and encounter adds (+30 % HP, +15 % damage);
 *   - encounter adds (rank 'miniboss' or tag 'encounter_boss') take Tyrannical, not Fortified;
 *   - Mythic+: no party-size factor (instanceScaling: Normal / Heroic / Mitik only);
 *   - grantForces(n, reason): host only, adds to forces, capped at forcesRequired in Mythic+, calls fx.onForces, toast.
 *
 *   node tools/smoke/mplus_rules.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Loads src/systems/MythicPlus.ts directly (Node type stripping, Node >= 22.18). The game-only imports (G, Affixes, the dungeon
 * registry, three.js) are replaced by stubs. No browser, no dev server.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hooks = `
const STUBS = {
  '/game/G': 'export const G = { events: { on() {}, emit(t, p) { if (t === "ui:toast") (globalThis.__toasts ??= []).push(p); } }, net: undefined, character: undefined, world: undefined };',
  '/Affixes': 'export class Affixes { constructor() {} start() {} stop() {} onForces(prev, frac) { (globalThis.__onForces ??= []).push([prev, frac]); } onSpawned() {} onEnemyKilled() {} decorateHitShape(e, s) { return s; } canDamage() { return true; } handle() {} } export function isAffixUnit() { return false; }',
  '/data/dungeons': 'export const DUNGEONS = {}; export const DUNGEON_IDS = []; export const MPLUS_POOL = []; export const getDungeon = () => ({ forcesRequired: 100, bosses: [{ id: "b" }], timerSec: 1800 });',
  'three': 'export const Vector3 = class {}; export const Vector2 = class {};',
};
export async function resolve(s, c, n) {
  for (const k of Object.keys(STUBS)) {
    if (s === k || s.endsWith(k)) return { url: 'data:text/javascript,' + encodeURIComponent(STUBS[k]), shortCircuit: true };
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
const M = await import(pathToFileURL(root + 'src/systems/MythicPlus.ts').href);
const { MythicPlus, mplusLevelMult, isEncounterAdd } = M;
const { partyScales } = await import(pathToFileURL(root + "src/systems/instanceScaling.ts").href);

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };
const near = (a, b, msg, eps = 1e-6) => expect(Math.abs(a - b) <= eps, `${msg}: got ${a}, expected ${b}`);

// level multiplier: x1.08 per level to +10, x1.10 per level above
near(mplusLevelMult(1), 1, 'level 1 multiplier');
near(mplusLevelMult(2), 1.08, 'level 2 multiplier');
near(mplusLevelMult(10), 1.08 ** 9, 'level 10 multiplier');
expect(Math.abs(mplusLevelMult(10) - 2.0) < 0.01, `level 10 should be about x2.0, got ${mplusLevelMult(10)}`);
near(mplusLevelMult(11), 1.08 ** 9 * 1.1, 'level 11 multiplier (x1.10 above +10)');
near(mplusLevelMult(12), 1.08 ** 9 * 1.1 ** 2, 'level 12 multiplier');

// party tables
for (const n of [1, 2, 3, 4, 5]) expect(partyScales(n, 'mythicplus').hp === 1 && partyScales(n, 'mythicplus').dmg === 1, 'Mythic+ takes no party-size factor (' + n + ' players)');

// encounter adds
expect(isEncounterAdd('miniboss') === true, "rank 'miniboss' is an encounter add");
expect(isEncounterAdd('trash', 'encounter_boss') === true, "tag 'encounter_boss' is an encounter add");
expect(isEncounterAdd('trash') === false && isEncounterAdd('boss') === false, 'trash and boss are not encounter adds');

// a Mythic+ run through the class (host, started)
globalThis.__toasts = []; globalThis.__onForces = [];
const mp = new MythicPlus();
mp.debugRole = 'host';
const params = (over) => ({ dungeonId: 'test', difficulty: 'mythicplus', keyLevel: 5, affixes: ['fortified', 'tyrannical'], seed: 7, enemyLevel: 10, partySize: 1, keyOwner: 'p1', ...over });
const start = (over) => {
  mp.prepare(params(over));
  mp.state.started = true;
  globalThis.__toasts = []; globalThis.__onForces = [];
};

// party HP through the class: Mythic+ takes no party-size factor
for (const n of [1, 2, 3, 4, 5]) {
  mp.prepare(params({ partySize: n }));
  near(mp.partyHpMult(), 1, `Mythic+ partyHpMult for ${n} players`);
}
mp.prepare(params({ difficulty: 'normal', keyLevel: 0, affixes: [], partySize: 3 }));
near(mp.partyHpMult(), (1 + 0.6 * 2) * 0.75, 'non-Mythic+ partyHpMult for 3 players: (1 + 0.6 (n-1)) x solo curve 0.75');

// scalingFor: trash gets Fortified, bosses and encounter adds get Tyrannical (not Fortified)
const L5 = mplusLevelMult(5);
const both = ['fortified', 'tyrannical'];
let sc = mp.scalingFor(5, both, false);
near(sc.hp, L5 * 1.2, 'trash HP with Fortified'); near(sc.dmg, L5 * 1.3, 'trash dmg with Fortified');
sc = mp.scalingFor(5, both, true);
near(sc.hp, L5 * 1.3, 'boss HP with Tyrannical'); near(sc.dmg, L5 * 1.15, 'boss dmg with Tyrannical');
sc = mp.scalingFor(5, both, false, true);
near(sc.hp, L5 * 1.3, 'encounter add HP takes Tyrannical'); near(sc.dmg, L5 * 1.15, 'encounter add dmg takes Tyrannical');
sc = mp.scalingFor(5, ['fortified'], false, true);
near(sc.hp, L5, 'encounter add does NOT take Fortified (fortified-only key)'); near(sc.dmg, L5, 'encounter add dmg no Fortified');

// enemyScaling: Mythic+ takes no party damage at any size, encounter add flag wired through
start({ partySize: 2 });
let es = mp.enemyScaling(false, true);
near(es.hp, L5 * 1.3, 'enemyScaling encounter add HP'); near(es.dmg, L5 * 1.15, 'enemyScaling encounter add dmg (no party factor)');
es = mp.enemyScaling(false);
near(es.dmg, L5 * 1.3, 'enemyScaling trash dmg (no party factor)');
start({ partySize: 4 });
near(mp.enemyScaling(true).dmg, L5 * 1.15, 'enemyScaling boss dmg at 4 players (no party damage cut)');

// grantForces: host only, capped at forcesRequired in Mythic+, fx.onForces + toast
start({ partySize: 1 });
mp.state.forces = 90;
mp.grantForces(20, 'Olay: +20 guc');
expect(mp.state.forces === 100, `grantForces must cap at forcesRequired: forces ${mp.state.forces}`);
expect(globalThis.__onForces.length === 1 && Math.abs(globalThis.__onForces[0][0] - 0.9) < 1e-9 && globalThis.__onForces[0][1] === 1, 'grantForces calls fx.onForces(prev, frac)');
expect(globalThis.__toasts.some((t) => t.text === 'Olay: +20 guc'), 'grantForces shows the reason as a toast');

start({ partySize: 1 });
mp.state.forces = 10;
mp.grantForces(15, 'a');
expect(mp.state.forces === 25, `grantForces adds: forces ${mp.state.forces}`);
mp.grantForces(0, 'zero');
mp.grantForces(-5, 'negative');
mp.grantForces(Number.NaN, 'nan');
expect(mp.state.forces === 25, 'grantForces ignores n <= 0 and NaN');

start({ partySize: 1 });
mp.state.forces = 100;
mp.grantForces(10, 'full');
expect(mp.state.forces === 100 && globalThis.__onForces.length === 0, 'grantForces at the cap changes nothing and calls no onForces');

mp.debugRole = 'client';
start({ partySize: 1 });
mp.state.forces = 10;
mp.grantForces(10, 'client');
expect(mp.state.forces === 10, 'grantForces does nothing on a client');
mp.debugRole = 'host';

start({ partySize: 1 });
mp.state.started = false;
mp.state.forces = 0;
mp.grantForces(10, 'not started');
expect(mp.state.forces === 0, 'grantForces does nothing before the run started');

start({ difficulty: 'normal', keyLevel: 0, affixes: [], partySize: 1 });
mp.state.forces = 0;
mp.grantForces(150, 'uncapped outside Mythic+');
expect(mp.state.forces === 150, 'grantForces is not capped outside Mythic+ (forcesRequired applies to keys)');

mp.end(true);

if (failures.length) {
  for (const f of failures) console.error('FAIL', f);
  console.error(`mplus_rules: ${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('mplus_rules: ok');
}
