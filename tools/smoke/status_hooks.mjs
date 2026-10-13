#!/usr/bin/env node
/**
 * Smoke check for the K14 status hooks (P-21): the pure rule helpers in src/data/statuses.ts that Combat.ts uses.
 *
 *   node tools/smoke/status_hooks.mjs      exit 0 = ok, 1 = failures (each printed)
 *
 * Checks: per-stack multipliers return 1 + v x stacks (and multiply across statuses), dodge and dispel stack losses,
 * onExpire fires only for a natural expiry (never on dispel), petrify is in HARD_CC, ay_cesmesi gives castSpeed too.
 * Loads src/data/statuses.ts directly (native TypeScript stripping, Node >= 22.18). No browser, no dev server.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./statuses_talents") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const root = fileURLToPath(new URL('../..', import.meta.url));
const S = await import(pathToFileURL(root + 'src/data/statuses.ts').href);
const { STATUS_RULES, HARD_CC, takenMorePerStackMult, takenPerStackTotal, dodgeStackLoss, dispelStackLoss,
  stacksAfterLoss, shouldFireOnExpire, expireBurstOf, DODGE_STACK_IDS, STATUSES } = S;

const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1. Per-stack multiplier: 1 + v x stacks; no rule or no field gives 1.
expect(near(takenMorePerStackMult({ takenMorePerStack: 0.1 }, 3), 1.3), 'takenMorePerStackMult(0.1, 3) != 1.3');
expect(near(takenMorePerStackMult({ takenMorePerStack: 0.25 }, 1), 1.25), 'takenMorePerStackMult(0.25, 1) != 1.25');
expect(near(takenMorePerStackMult({ takenMorePerStack: 0.1 }, 0), 1), 'takenMorePerStackMult with 0 stacks != 1');
expect(takenMorePerStackMult(undefined, 4) === 1, 'takenMorePerStackMult(undefined) != 1');
expect(takenMorePerStackMult({ takenMore: 0.5 }, 4) === 1, 'takenMorePerStackMult ignores takenMore');

// 2. Product across statuses, using rules injected for the smoke only (the shipped table has no takenMorePerStack row yet).
STATUS_RULES.kin_laneti = { ...STATUS_RULES.kin_laneti, takenMorePerStack: 0.1 };
STATUS_RULES.asit_yarasi = { ...STATUS_RULES.asit_yarasi, takenMorePerStack: 0.2 };
const stacks = { kin_laneti: 2, asit_yarasi: 1 };
const stackOf = (id) => stacks[id] ?? 0;
expect(near(takenPerStackTotal(stackOf, ['kin_laneti', 'asit_yarasi']), 1.2 * 1.2), 'takenPerStackTotal product != 1.44');
expect(near(takenPerStackTotal(stackOf, ['kin_laneti']), 1.2), 'takenPerStackTotal single id != 1.2');
expect(takenPerStackTotal(() => 5, []) === 1, 'takenPerStackTotal with no ids != 1');
expect(takenPerStackTotal(() => 0) === 1, 'takenPerStackTotal with 0 stacks != 1');
delete STATUS_RULES.kin_laneti.takenMorePerStack;
delete STATUS_RULES.asit_yarasi.takenMorePerStack;

// 3. Dodge removes one arcane_lockdown stack; other statuses lose nothing.
expect(DODGE_STACK_IDS.includes('arcane_lockdown'), 'arcane_lockdown missing from DODGE_STACK_IDS');
expect(dodgeStackLoss('arcane_lockdown') === 1, 'dodgeStackLoss(arcane_lockdown) != 1');
expect(dodgeStackLoss('kin_laneti') === 0, 'dodgeStackLoss(kin_laneti) != 0');
expect(stacksAfterLoss(3, 1) === 2, 'stacksAfterLoss(3, 1) != 2');
expect(stacksAfterLoss(1, 1) === 0, 'stacksAfterLoss(1, 1) != 0');
expect(stacksAfterLoss(0, 1) === 0, 'stacksAfterLoss(0, 1) != 0 (never negative)');

// 4. Dispel removes one arcane_lockdown stack (onDispel); others are removed whole (0).
expect(dispelStackLoss('arcane_lockdown') === 1, 'dispelStackLoss(arcane_lockdown) != 1');
expect(dispelStackLoss('kin_laneti') === 0, 'dispelStackLoss(kin_laneti) != 0');

// 5. onExpire: only a natural expiry fires it. Dispel (and any other removal) must not.
expect(shouldFireOnExpire('expire') === true, 'shouldFireOnExpire(expire) != true');
expect(shouldFireOnExpire('dispel') === false, 'shouldFireOnExpire(dispel) != false');
expect(shouldFireOnExpire('remove') === false, 'shouldFireOnExpire(remove) != false');
expect(shouldFireOnExpire('clear') === false, 'shouldFireOnExpire(clear) != false');
expect(shouldFireOnExpire('death') === false, 'shouldFireOnExpire(death) != false');
// Rule-level: a status with an onExpire burst exposes it; statuses without one do not.
STATUS_RULES.exposed = { ...STATUS_RULES.exposed, onExpire: { shape: 'circle', radius: 4, coef: 1, type: 'shadow' } };
expect(expireBurstOf('exposed')?.radius === 4, 'expireBurstOf(exposed) did not return the injected burst');
delete STATUS_RULES.exposed.onExpire;
expect(expireBurstOf('exposed') === undefined, 'expireBurstOf(exposed) should be undefined without onExpire');

// 6. Data: petrify is hard CC; ay_cesmesi gives castSpeed alongside attackSpeed.
expect(HARD_CC.includes('petrify'), 'petrify missing from HARD_CC');
expect(STATUSES.ay_cesmesi?.stats?.castSpeed === 0.1, 'ay_cesmesi castSpeed != 0.1');
expect(STATUSES.ay_cesmesi?.stats?.attackSpeed === 0.1, 'ay_cesmesi attackSpeed != 0.1');

if (failures.length > 0) {
  for (const f of failures) console.error('FAIL', f);
  console.error(`status_hooks: ${failures.length} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('status_hooks: ok');
}
