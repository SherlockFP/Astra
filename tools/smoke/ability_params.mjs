#!/usr/bin/env node
/**
 * K6 smoke: ability params (P-22 `ranged`, `callRadius`), must-answer UI (P-23) and the call-for-help hook (P-24).
 *
 *   node tools/smoke/ability_params.mjs
 *
 * Headless and source-level: the enemy brain and the UI import the game singleton (G), which needs a browser, so these
 * checks read the sources and assert the wiring. Behaviour (a ranged cone skipping the slot gate, a real pull of fixture
 * enemies) is verified in the game, not here. Exit 1 when a wiring check fails; `pending` lines are known gaps.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => fs.readFileSync(`${ROOT}/${p}`, 'utf8');

const checks = [];
const pending = [];
const check = (name, ok) => checks.push({ name, ok: !!ok });

const ai = read('src/ai/EnemyAI.ts');
const dir = read('src/ai/EnemyDirector.ts');
const castBar = read('src/ui/widgets/CastBar.ts');
const plates = read('src/ui/widgets/Nameplates.ts');

// P-22 ranged: melee-kind abilities read the param and skip the slot gate only when it is set
check('usable: melee/cone read p.ranged before canAttackMelee', /case 'melee':\s*case 'cone':\s*return [^;]*\(!!p\.ranged \|\| this\.canAttackMelee\(\)\)/.test(ai));
check('usable: self_aoe reads p.ranged before canAttackMelee', /case 'self_aoe':[\s\S]{0,160}\(!!p\.ranged \|\| this\.canAttackMelee\(\)\)/.test(ai));
check('basic attack slot gate unchanged (no ranged bypass)', /isMelee\) \{\s*if \(dist <= Math\.max\(reach \* 0\.95, 1\.2\) && this\.canAttackMelee\(\)\)/.test(ai));

// P-24 call for help
check('EnemyAI.callForHelp(radius, sameRoom) defined', /callForHelp\(radius: number, sameRoom = false\): number \{/.test(ai));
check('callForHelp pulls through EnemyDirector.pullPack', /callForHelp[\s\S]*?this\.dir\.pullPack\(o, target\)/.test(ai));
check('callForHelp skips aggroed, dead and non-aggro enemies', /o\.aggroed \|\| o\.e\.isDead[\s\S]{0,200}od\.aggroRange <= 0/.test(ai));
check('startAbility reads params.callRadius and calls callForHelp', /ab\.params\?\.callRadius \?\? 0\) > 0\) this\.callForHelp\(/.test(ai));
check('EnemyDirector.pullPack exists (the pull path)', /pullPack\(ai: EnemyAI, target: Actor \| null\): void/.test(dir));

// P-23 must-answer UI
check('uninterruptible cast uses the shield icon (item-shield)', /UNINTERRUPTIBLE_ICON = ICON\('item-shield'\)/.test(castBar));
check('CastBarEl shows the dispel mark from opts.dispel', /opts: \{[^}]*dispel\?: string \} = \{\}/.test(castBar) && /setText\(this\.dispel, 'Temizle: '/.test(castBar));
check('CastTracker resolves dispel from the caster def', /castDispelOf\(actor, t\.abilityId\)/.test(castBar) && /castDispelOf\(actor, c\.skillId\)/.test(castBar));
check('nameplate shows shield on uninterruptible casts', /setDisplay\(this\.castShield, !cv\.interruptible/.test(plates));
check('nameplate shows the green dispel mark', /setDisplay\(this\.dispelEl, !!cv\.dispel/.test(plates));

// Known gaps (not failures)
if (!/kick/.test(read('src/dev/contentCheck.ts'))) pending.push('contentCheck warns on interruptible without kick: src/dev/contentCheck.ts is outside K6 scope');
if (!/dispel/.test(read('src/dev/contentCheck.ts'))) pending.push('contentCheck warns on unknown dispel status: src/dev/contentCheck.ts is outside K6 scope');
if (!/callRadius|sameRoom/.test(read('src/dev/contentCheck.ts'))) pending.push('contentCheck validates callRadius values: outside K6 scope');

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!c.ok) failed++;
}
for (const p of pending) console.log(`pending  ${p}`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed, ${pending.length} pending`);
process.exit(failed ? 1 : 0);
