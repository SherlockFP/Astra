#!/usr/bin/env node
/**
 * CW-04 headless checks: GCD spacing (COMBAT_WOW §2.1), spell queue timing (§2.2), off-GCD tier, lead skip math (§2.3).
 * The game-side flow (SkillSystem.tryStartSkill / serviceQueue) needs the browser and is covered by src/dev/wow/cw04.ts.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/wow_queue.mjs
 *
 * Exit 0 = all PASS, 1 = a failed assertion. No browser, no dev server.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const imp = (p) => import(pathToFileURL(`${ROOT}${p}`).href);

const { gcdFor, isOffGcd } = await imp('src/combat/gcd.ts');
const { SpellQueue } = await imp('src/combat/spellQueue.ts');
const { leadSkipSec, WOW } = await imp('src/combat/feel.ts');

let failures = 0;
function check(name, ok, msg = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${msg ? ' · ' + msg : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const SPELL = { tags: ['spell', 'fire'] };
const MELEE = { tags: ['melee'] };
const OFF = { tags: ['offgcd'] };
const MAJOR = { tags: [], defaultSlot: 'm90' };

// ---- GCD (§2.1): arpg table, floor, haste, off-GCD tier ----
const rows = [[1, 1], [1.15, 0.87], [1.3, 0.77], [1.6, 0.63], [2, 0.5]];
for (const [s, w] of rows) check(`gcd.arpg speed ${s}`, near(gcdFor('arpg', 'mage', s, SPELL), w, 0.006));
check('gcd.floor 0.5 at speed 5', near(gcdFor('arpg', 'mage', 5, SPELL), 0.5, 1e-9));
check('gcd.wow base 1.5', near(gcdFor('wow', 'knight', 1, MELEE), 1.5, 1e-9));
check('gcd.wow rogue fixed 1.0 at haste 2', near(gcdFor('wow', 'rogue', 2, MELEE), 1.0, 1e-9));
check('gcd.off-gcd tag = 0', gcdFor('arpg', 'knight', 1, OFF) === 0);
check('isOffGcd major slot', isOffGcd(MAJOR) === true);
check('isOffGcd melee false', isOffGcd(MELEE) === false);

// ---- queue spacing (§2.2): press 0.25 s after the GCD starts, held key re-offers every 0.05 s ----
{
  const gcd = gcdFor('arpg', 'mage', 1, SPELL); // 1.0
  const q = new SpellQueue();
  let t = 0;
  const gcdEnd = gcd;
  // first press fires at t = 0 (no wait), starts GCD
  check('queue.first press fires', q.offer(0, { kind: 'skill', skillId: 'fireball', slot: 'rmb' }, 0) === 'fire');
  // press at 0.25 is 0.75 s early (> 0.40 window): rejected
  check('queue.0.75 early rejected', q.offer(gcdEnd - 0.25, { kind: 'skill', skillId: 'frostbolt', slot: 'q' }, 0.25) === 'reject');
  // press at 0.7: wait 0.3 -> queued
  t = 0.7;
  const r2 = q.offer(gcdEnd - t, { kind: 'skill', skillId: 'frostbolt', slot: 'q' }, t);
  check('queue.press at +0.7 queued', r2 === 'queued');
  // held re-offers keep it topped up
  for (let k = 1; k <= 6; k++) q.offer(gcdEnd - (t + k * 0.05), { kind: 'skill', skillId: 'frostbolt', slot: 'q' }, t + k * 0.05);
  // not ready before GCD end
  check('queue.wait before gcd end', q.take(gcdEnd - 0.01, 'wait') === null && q.peek() !== null);
  // ready at GCD end: fires exactly once
  const fired = q.take(gcdEnd, 'ready');
  check('queue.fires at gcd end', fired !== null && fired.skillId === 'frostbolt');
  check('queue.slot empty after fire', q.peek() === null);
}

// ---- reject window (§2.2): wait 0.39 queues, 0.41 rejects ----
{
  const q = new SpellQueue();
  check('queue.0.39 queued', q.offer(0.39, { kind: 'skill', skillId: 'a', slot: 'rmb' }, 0) === 'queued');
  check('queue.0.41 reject', q.offer(0.41, { kind: 'skill', skillId: 'b', slot: 'q' }, 0) === 'reject');
  check('queue.reject keeps old entry', q.peek()?.skillId === 'a');
}

// ---- priority: skill beats a queued LMB step; newest skill replaces older skill ----
{
  const q = new SpellQueue();
  q.offer(0.2, { kind: 'skill', skillId: 'rmb_skill', slot: 'rmb' }, 0);
  const r = q.offer(0.1, { kind: 'basic', skillId: null, slot: 'lmb' }, 0.01);
  check('queue.basic does not replace skill', r === 'queued' && q.peek()?.skillId === 'rmb_skill');
  q.offer(0.15, { kind: 'skill', skillId: 'q_skill', slot: 'q' }, 0.02);
  check('queue.newer skill replaces', q.peek()?.skillId === 'q_skill');
}

// ---- TTL (§2.2): an entry older than 0.8 s is dropped even if still waiting ----
{
  const q = new SpellQueue();
  q.offer(0.3, { kind: 'skill', skillId: 'x', slot: 'e' }, 0);
  check('queue.ttl drops stale entry', q.take(WOW.queue.ttl + 0.05, 'wait') === null && q.peek() === null);
}

// ---- invalid at fire time: dropped quietly ----
{
  const q = new SpellQueue();
  q.offer(0.3, { kind: 'skill', skillId: 'x', slot: 'e' }, 0);
  check('queue.invalid drops', q.take(0.3, 'invalid') === null && q.peek() === null);
}

// ---- lead skip (§2.3): instant fireball 0.32 -> 0.14, knight step 0.27 -> 0.17, min 0.08 ----
check('lead.fireball 0.32 -> 0.14', near(0.32 - leadSkipSec(0.32, WOW.lead.instant), 0.14, 1e-9));
check('lead.basic 0.27 -> 0.17', near(0.27 - leadSkipSec(0.27, WOW.lead.basic), 0.17, 1e-9));
check('lead.no skip when already early', leadSkipSec(0.12, WOW.lead.instant) === 0);
check('lead.target 0 keeps authored', leadSkipSec(0.32, 0) === 0);
check('lead.min clamp 0.08', near(0.2 - leadSkipSec(0.2, 0.01), 0.08, 1e-9));

console.log(failures ? `\n${failures} FAIL` : '\nall PASS');
process.exit(failures ? 1 : 0);
