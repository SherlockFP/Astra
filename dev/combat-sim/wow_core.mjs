#!/usr/bin/env node
/**
 * CW-02 headless checks for the pure WoW ability layer: GCD table (Appendix A), spell queue windows, pushback / channel cut,
 * school lockout, and PRD (test vectors + 200k-trial rate).
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/wow_core.mjs
 *
 * Exit 0 = all PASS, 1 = a failed assertion. No browser, no dev server.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does (same pattern as tools/height-check.mjs)
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const imp = (p) => import(pathToFileURL(`${ROOT}${p}`).href);

const { gcdFor, isOffGcd } = await imp('src/combat/gcd.ts');
const { SpellQueue } = await imp('src/combat/spellQueue.ts');
const { pushbackAdd, channelCut, lockoutSchool, pushesBack } = await imp('src/combat/castRules.ts');
const { prdC, prdRate, Prd } = await imp('src/combat/prd.ts');

let failures = 0;
function check(name, ok, msg = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${msg ? ' · ' + msg : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// mulberry32: deterministic RNG so the PRD statistics are reproducible
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKILL = { tags: ['melee'] };
const SPELL = { tags: ['spell', 'fire'] };
const OFF = { tags: ['offgcd'] };
const MAJOR = { tags: [], defaultSlot: 'm45' };

// ---- 1. GCD table (Appendix A, arpg profile, base 1.0, floor 0.5) ----
const arpgTable = [[1.0, 1.00], [1.15, 0.87], [1.30, 0.77], [1.60, 0.63], [2.0, 0.50], [3.0, 0.50]];
for (const [speed, want] of arpgTable) {
  const got = gcdFor('arpg', 'mage', speed, SPELL);
  // the table is printed to 2 decimals (0.625 -> 0.63), so allow half a hundredth
  check(`gcd.arpg speed ${speed}`, near(got, want, 0.006), `got ${got.toFixed(3)} want ${want}`);
}
check('gcd.wow base 1.5 at speed 1', near(gcdFor('wow', 'mage', 1, SPELL), 1.5, 1e-9));
check('gcd.wow floor 0.75 at speed 2.5', near(gcdFor('wow', 'mage', 2.5, SPELL), 0.75, 1e-9));
check('gcd.wow rogue fixed 1.0 ignores haste', near(gcdFor('wow', 'rogue', 2.5, SKILL), 1.0, 1e-9));
check('gcd.arpg rogue fixed (no haste)', near(gcdFor('arpg', 'rogue', 1.6, SKILL), 1.0, 1e-9));
check('gcd off-GCD tag returns 0', gcdFor('arpg', 'knight', 1, OFF) === 0 && isOffGcd(OFF));
check('gcd major slot is off-GCD', gcdFor('arpg', 'knight', 1, MAJOR) === 0 && isOffGcd(MAJOR));
check('gcd on-GCD skill is not off-GCD', !isOffGcd(SKILL));

// ---- 2. Spell queue ----
{
  const q = new SpellQueue();
  check('queue window 0.40 / ttl 0.80', q.window === 0.40 && q.ttl === 0.80);
  const r39 = q.offer(0.39, { kind: 'skill', skillId: 'mage_fireball', slot: 'rmb' }, 0);
  check('queue press at 0.39 s left -> queued', r39 === 'queued', r39);
  const r41 = new SpellQueue().offer(0.41, { kind: 'skill', skillId: 'mage_fireball', slot: 'rmb' }, 0);
  check('queue press at 0.41 s left -> reject', r41 === 'reject', r41);
  check('queue wait 0 -> fire', new SpellQueue().offer(0, { kind: 'skill', skillId: 'x', slot: 'q' }, 0) === 'fire');

  // skill beats a queued LMB step; a basic press does not replace a queued skill
  const q2 = new SpellQueue();
  q2.offer(0.2, { kind: 'basic', skillId: null, slot: null }, 0);
  q2.offer(0.2, { kind: 'skill', skillId: 'knight_shield_bash', slot: 'rmb' }, 0.01);
  check('queue skill replaces queued basic', q2.peek()?.kind === 'skill');
  q2.offer(0.2, { kind: 'basic', skillId: null, slot: null }, 0.02);
  check('queue basic does not replace queued skill', q2.peek()?.skillId === 'knight_shield_bash');
  // newest skill replaces older skill
  q2.offer(0.1, { kind: 'skill', skillId: 'mage_blink', slot: 'e' }, 0.03);
  check('queue newest skill replaces older skill', q2.peek()?.skillId === 'mage_blink');

  // take: wait keeps, ready fires, invalid drops quietly, ttl expires
  check('queue take wait keeps entry', q2.take(0.05, 'wait') === null && q2.peek() !== null);
  const fired = q2.take(0.1, 'ready');
  check('queue take ready returns and clears', fired?.skillId === 'mage_blink' && q2.peek() === null);
  q2.offer(0.2, { kind: 'skill', skillId: 'a', slot: 'q' }, 1.0);
  check('queue take invalid drops quietly', q2.take(1.1, 'invalid') === null && q2.peek() === null);
  q2.offer(0.2, { kind: 'skill', skillId: 'a', slot: 'q' }, 2.0);
  check('queue ttl 0.8 expires entry', q2.take(2.9, 'ready') === null && q2.peek() === null);
  q2.offer(0.2, { kind: 'skill', skillId: 'a', slot: 'q' }, 3.0);
  q2.clear('dodge');
  check('queue clear(reason) empties slot', q2.peek() === null && q2.lastClearReason === 'dodge');
}

// ---- 3. Pushback and channel cut (§2.4) ----
{
  const hit = { hitFrac: 0.10 };
  check('pushback 1st hit +0.5', pushbackAdd(0, hit) === 0.5);
  check('pushback 2nd hit +0.5', pushbackAdd(1, hit) === 0.5);
  check('pushback 3rd hit +0', pushbackAdd(2, hit) === 0);
  check('pushback chip hit (<3 %) +0', pushbackAdd(0, { hitFrac: 0.02 }) === 0);
  check('pushback DoT +0', pushbackAdd(0, { hitFrac: 0.10, dot: true }) === 0);
  check('pushback absorbed +0', pushbackAdd(0, { hitFrac: 0.10, absorbed: true }) === 0);
  check('pushback resisted (shield) +0', pushbackAdd(0, { hitFrac: 0.10, resist: true }) === 0);
  check('pushesBack(1, hit) true', pushesBack(1, hit) === true);
  check('channel cut 25 % of 4 s, 1st hit = 1.0', near(channelCut(4, 0, hit), 1.0, 1e-9));
  check('channel cut 2nd hit = 1.0', near(channelCut(4, 1, hit), 1.0, 1e-9));
  check('channel cut 3rd hit = 0', channelCut(4, 2, hit) === 0);
  check('channel cut resisted = 0', channelCut(4, 0, { hitFrac: 0.1, resist: true }) === 0);
}

// ---- 4. School lockout (§2.6) ----
{
  check('lockout fire spell -> fire', lockoutSchool({ tags: ['spell', 'fire'] }) === 'fire');
  check('lockout frost spell -> frost', lockoutSchool({ tags: ['spell', 'frost', 'aoe'] }) === 'frost');
  check('lockout melee has no school', lockoutSchool({ tags: ['melee', 'finisher'] }) === null);
  check('lockout empty tags -> null', lockoutSchool({ tags: [] }) === null);
}

// ---- 5. PRD (§2.7) ----
{
  const vectors = [[0.10, 0.01475], [0.20, 0.0557], [0.25, 0.0847], [0.30, 0.1189]];
  for (const [p, want] of vectors) {
    const got = prdC(p);
    check(`prd C(${p}) test vector`, near(got, want, 0.0002), `got ${got.toFixed(5)} want ${want}`);
    check(`prd rate(C(${p})) = ${p}`, near(prdRate(got), p, 1e-6));
  }
  const N = 200000;
  for (const p of [0.10, 0.25]) {
    const rng = rngFrom(12345 + Math.round(p * 1000));
    const prd = new Prd();
    let procs = 0;
    for (let i = 0; i < N; i++) if (prd.roll('k', p, rng)) procs++;
    const rate = procs / N;
    check(`prd ${p * 100} % over ${N} trials within ±0.5 %`, near(rate, p, 0.005), `rate ${(rate * 100).toFixed(2)} %`);
  }
  const p2 = new Prd();
  const r2 = rngFrom(7);
  check('prd roll p=0 never procs', p2.roll('z', 0, r2) === false);
  check('prd roll p=1 always procs', p2.roll('z', 1, r2) === true);
  p2.roll('a', 0.1, () => 0.999999);
  check('prd count increments per key', p2.count('a') === 1);
  p2.reset('a');
  check('prd reset(key) clears that key', p2.count('a') === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
